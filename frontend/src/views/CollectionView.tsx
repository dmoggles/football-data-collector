import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  createCollectionEvent,
  endCollectionSessionPeriod,
  getMatchPrepPlan,
  listCollectionEvents,
  startCollectionSessionPeriod,
} from "../api";
import { GoalMouthDiagram } from "../components/GoalMouthDiagram";
import { PitchDiagram } from "../components/PitchDiagram";
import { SearchableSelect } from "../components/SearchableSelect";
import { predictLikelyPlayerId } from "../domain/eventPredictions";
import type { LineupPlayerPosition } from "../domain/eventPredictions";
import { getFormationSlots } from "../domain/formations";
import { getGoalDimensions, getGoalWidthSpanPct } from "../domain/goalDimensions";
import { formatClock } from "../utils/formatters";
import type { CollectionEvent, CollectionSession, MatchFormat, MatchPrepPlan, Player } from "../types/auth";

type CollectionViewProps = {
  selectedTeamId: string;
  selectedTeamCanManage: boolean;
  playersForSelectedTeam: Player[];
  activeCollectionSessions: CollectionSession[];
  selectedCollectionSessionId: string;
  selectedCollectionSession: CollectionSession | null;
  collectionSessionLive: CollectionSession | null;
  collectionSessionSocketState: "idle" | "connecting" | "live";
  onSessionSelected: (sessionId: string) => void;
  onActiveSessionsChanged: () => Promise<void>;
};

export function CollectionView({
  selectedTeamId,
  selectedTeamCanManage,
  playersForSelectedTeam,
  activeCollectionSessions,
  selectedCollectionSessionId,
  selectedCollectionSession,
  collectionSessionLive,
  collectionSessionSocketState,
  onSessionSelected,
  onActiveSessionsChanged,
}: CollectionViewProps) {
  const [collectionEvents, setCollectionEvents] = useState<CollectionEvent[]>([]);
  const [collectionMatchPrepPlan, setCollectionMatchPrepPlan] = useState<MatchPrepPlan | null>(null);
  const [isEventComposerOpen, setIsEventComposerOpen] = useState(false);
  const [isSubComposerOpen, setIsSubComposerOpen] = useState(false);
  const [subPlayerOutId, setSubPlayerOutId] = useState("");
  const [subPlayerInId, setSubPlayerInId] = useState("");
  const [pendingEventPitchPoint, setPendingEventPitchPoint] = useState<{ xPct: number; yPct: number } | null>(null);
  const [eventComposerType, setEventComposerType] = useState<"shot" | "tackle" | "interception" | "shot_against">("shot");
  const [eventComposerPlayerId, setEventComposerPlayerId] = useState("");
  const [eventComposerAssisterId, setEventComposerAssisterId] = useState("");
  const [eventComposerGoalPoint, setEventComposerGoalPoint] = useState<{ y: number; z: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCollectionEvents = useCallback(async (sessionId: string, teamId: string) => {
    if (!sessionId || !teamId) {
      setCollectionEvents([]);
      return;
    }
    const rows = await listCollectionEvents(sessionId, teamId);
    setCollectionEvents(rows);
  }, []);

  useEffect(() => {
    void loadCollectionEvents(selectedCollectionSessionId, selectedTeamId);
  }, [loadCollectionEvents, selectedCollectionSessionId, selectedTeamId]);

  useEffect(() => {
    if (!selectedCollectionSession?.match_id || !selectedTeamId) {
      setCollectionMatchPrepPlan(null);
      return;
    }
    let cancelled = false;
    void getMatchPrepPlan(selectedCollectionSession.match_id, selectedTeamId)
      .then((plan) => {
        if (!cancelled) setCollectionMatchPrepPlan(plan);
      })
      .catch(() => {
        if (!cancelled) setCollectionMatchPrepPlan(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCollectionSession?.match_id, selectedTeamId]);

  const collectionFormationSlots = useMemo(
    () =>
      collectionMatchPrepPlan
        ? getFormationSlots(collectionMatchPrepPlan.format, collectionMatchPrepPlan.formation)
        : [],
    [collectionMatchPrepPlan],
  );

  const collectionCurrentLineupCandidates = useMemo((): LineupPlayerPosition[] => {
    if (!collectionMatchPrepPlan || collectionFormationSlots.length === 0) return [];
    const slotById = new Map(collectionFormationSlots.map((s) => [s.id, s]));
    const slotIdByPlayerId = new Map<string, string>();
    for (const p of collectionMatchPrepPlan.players) {
      if (p.lineup_slot) slotIdByPlayerId.set(p.player_id, p.lineup_slot);
    }
    const subEvents = collectionEvents
      .filter((e) => e.event_kind === "sub")
      .sort((a, b) => a.period_number - b.period_number || a.period_second - b.period_second);
    for (const sub of subEvents) {
      if (!sub.player_id || !sub.player_in_id) continue;
      const slotId = slotIdByPlayerId.get(sub.player_id);
      if (slotId) {
        slotIdByPlayerId.delete(sub.player_id);
        slotIdByPlayerId.set(sub.player_in_id, slotId);
      }
    }
    return [...slotIdByPlayerId.entries()]
      .map(([playerId, slotId]) => {
        const slot = slotById.get(slotId);
        return slot ? { playerId, slot } : null;
      })
      .filter((c): c is LineupPlayerPosition => !!c);
  }, [collectionMatchPrepPlan, collectionFormationSlots, collectionEvents]);

  const collectionEventPlayers = useMemo(() => {
    if (!selectedTeamId) return [] as Player[];
    if (!collectionMatchPrepPlan) return playersForSelectedTeam;
    const knownPlayerById = new Map(playersForSelectedTeam.map((player) => [player.id, player]));
    const squad = collectionMatchPrepPlan.players
      .filter((player) => player.in_matchday_squad)
      .map((player) => {
        const known = knownPlayerById.get(player.player_id);
        if (known) return known;
        return {
          id: player.player_id,
          team_id: selectedTeamId,
          display_name: player.player_name,
          shirt_number: player.shirt_number,
          position: player.position,
        } satisfies Player;
      });
    return squad.sort((a, b) => {
      const numberA = a.shirt_number ?? Number.MAX_SAFE_INTEGER;
      const numberB = b.shirt_number ?? Number.MAX_SAFE_INTEGER;
      if (numberA !== numberB) return numberA - numberB;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [collectionMatchPrepPlan, playersForSelectedTeam, selectedTeamId]);

  const collectionCurrentLineup = useMemo(() => {
    if (!collectionMatchPrepPlan) {
      return { pitchPlayers: [] as Player[], benchPlayers: [] as Player[], slotByPlayerId: new Map<string, string>() };
    }
    const slotLabelById = new Map(collectionFormationSlots.map((s) => [s.id, s.label]));
    const slotByPlayerId = new Map<string, string>();
    const squadPlayerIds = new Set<string>();
    for (const p of collectionMatchPrepPlan.players) {
      if (p.in_matchday_squad) squadPlayerIds.add(p.player_id);
      if (p.lineup_slot) slotByPlayerId.set(p.player_id, slotLabelById.get(p.lineup_slot) ?? p.lineup_slot);
    }
    const subEvents = collectionEvents
      .filter((e) => e.event_kind === "sub")
      .sort((a, b) => a.period_number - b.period_number || a.period_second - b.period_second);
    for (const sub of subEvents) {
      if (!sub.player_id || !sub.player_in_id) continue;
      const slot = slotByPlayerId.get(sub.player_id);
      if (slot) {
        slotByPlayerId.delete(sub.player_id);
        slotByPlayerId.set(sub.player_in_id, slot);
      }
    }
    const pitchIds = new Set(slotByPlayerId.keys());
    return {
      pitchPlayers: collectionEventPlayers.filter((p) => pitchIds.has(p.id)),
      benchPlayers: collectionEventPlayers.filter((p) => squadPlayerIds.has(p.id) && !pitchIds.has(p.id)),
      slotByPlayerId,
    };
  }, [collectionMatchPrepPlan, collectionFormationSlots, collectionEvents, collectionEventPlayers]);

  const currentPeriodEvents = useMemo(
    () =>
      collectionEvents.filter(
        (row) =>
          ["shot", "tackle", "interception", "shot_against"].includes(row.event_kind) &&
          row.period_number === (collectionSessionLive?.period_number ?? 1),
      ),
    [collectionEvents, collectionSessionLive?.period_number],
  );

  const selectedCollectionGoalDimensions = useMemo(
    () => getGoalDimensions(collectionSessionLive?.format as MatchFormat | undefined),
    [collectionSessionLive?.format],
  );

  const selectedCollectionGoalWindow = useMemo(() => {
    if (!selectedCollectionGoalDimensions) return null;
    const goalWidthSpanPct = getGoalWidthSpanPct(
      selectedCollectionGoalDimensions.width_ft,
      selectedCollectionGoalDimensions.pitch_width_m,
    );
    const leftY = 50 - goalWidthSpanPct / 2;
    const rightY = 50 + goalWidthSpanPct / 2;
    return { leftY, rightY, goalHeightFt: selectedCollectionGoalDimensions.height_ft, goalWidthSpanPct };
  }, [selectedCollectionGoalDimensions]);

  const eventOutcomeOptions = useMemo(() => {
    if (!eventComposerGoalPoint || !selectedCollectionGoalWindow) {
      return ["miss", "post", "save", "goal"] as const;
    }
    const { y, z } = eventComposerGoalPoint;
    const outsideGoalFrame =
      y < selectedCollectionGoalWindow.leftY ||
      y > selectedCollectionGoalWindow.rightY ||
      z > selectedCollectionGoalWindow.goalHeightFt;
    if (outsideGoalFrame) return ["miss"] as const;
    const postZone =
      Math.abs(y - selectedCollectionGoalWindow.leftY) <= 1.2 ||
      Math.abs(y - selectedCollectionGoalWindow.rightY) <= 1.2 ||
      Math.abs(z - selectedCollectionGoalWindow.goalHeightFt) <= 0.6;
    if (postZone) return ["post", "save", "goal"] as const;
    return ["save", "goal"] as const;
  }, [eventComposerGoalPoint, selectedCollectionGoalWindow]);

  useEffect(() => {
    if (!eventComposerPlayerId) return;
    if (!collectionEventPlayers.some((player) => player.id === eventComposerPlayerId)) {
      setEventComposerPlayerId("");
    }
  }, [collectionEventPlayers, eventComposerPlayerId]);

  const predictLikelyCollectionPlayer = (
    eventKind: "shot" | "tackle" | "interception",
    xPct: number,
    yPct: number,
  ): string => {
    const predictedPlayerId = predictLikelyPlayerId({ eventKind, xPct, yPct, lineup: collectionCurrentLineupCandidates });
    return predictedPlayerId ?? "";
  };

  const predictGoalkeeperPlayerId = (): string => {
    const gk = collectionCurrentLineupCandidates.find((c) => c.slot.role === "GK");
    return gk?.playerId ?? collectionCurrentLineupCandidates[0]?.playerId ?? "";
  };

  const getCollectionPitchPoint = (
    event: { clientX: number; clientY: number; currentTarget: HTMLDivElement },
  ): { xPct: number; yPct: number; isOutside: boolean } | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const xFromLeftPctRaw = ((event.clientX - rect.left) / rect.width) * 100;
    const yFromTopPctRaw = ((event.clientY - rect.top) / rect.height) * 100;
    const isOutside = xFromLeftPctRaw < 0 || xFromLeftPctRaw > 100 || yFromTopPctRaw < 0 || yFromTopPctRaw > 100;
    const xFromLeftPct = Math.max(0, Math.min(100, xFromLeftPctRaw));
    const yFromTopPct = Math.max(0, Math.min(100, yFromTopPctRaw));
    const xPct = Math.max(0, Math.min(100, 100 - yFromTopPct));
    const yPct = Math.max(0, Math.min(100, 100 - xFromLeftPct));
    return { xPct, yPct, isOutside };
  };

  const handleCollectionPitchClick = async (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!selectedTeamId || !selectedCollectionSessionId || !collectionSessionLive?.is_period_running) return;
    const point = getCollectionPitchPoint(event);
    if (!point) return;
    const { xPct, yPct } = point;
    setPendingEventPitchPoint({ xPct, yPct });
    const nextEventType = xPct <= 50 ? "shot_against" : "shot";
    setEventComposerType(nextEventType);
    setEventComposerGoalPoint(null);
    setEventComposerAssisterId("");
    setEventComposerPlayerId(
      nextEventType === "shot_against"
        ? predictGoalkeeperPlayerId()
        : predictLikelyCollectionPlayer("shot", xPct, yPct),
    );
    setIsEventComposerOpen(true);
  };

  const handleEndCollectionPeriod = async () => {
    if (!selectedTeamId || !selectedCollectionSessionId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await endCollectionSessionPeriod(selectedCollectionSessionId, { team_id: selectedTeamId });
      await onActiveSessionsChanged();
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message.includes("Confirm to end early")) {
        const confirmEnd = window.confirm(`${requestError.message}\n\nEnd period now?`);
        if (confirmEnd) {
          await endCollectionSessionPeriod(selectedCollectionSessionId, { team_id: selectedTeamId }, true);
          await onActiveSessionsChanged();
          setIsSubmitting(false);
          return;
        }
      }
      setError(requestError instanceof Error ? requestError.message : "Failed to end period");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartNextCollectionPeriod = async () => {
    if (!selectedTeamId || !selectedCollectionSessionId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await startCollectionSessionPeriod(selectedCollectionSessionId, { team_id: selectedTeamId });
      await onActiveSessionsChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to start next period");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSubstitution = async () => {
    if (!subPlayerOutId || !subPlayerInId || !selectedCollectionSessionId || !selectedTeamId) return;
    setIsSubmitting(true);
    try {
      const created = await createCollectionEvent(selectedCollectionSessionId, {
        team_id: selectedTeamId,
        event_kind: "sub",
        player_id: subPlayerOutId,
        player_in_id: subPlayerInId,
      });
      setCollectionEvents((prev) => [...prev, created]);
      setIsSubComposerOpen(false);
      setSubPlayerOutId("");
      setSubPlayerInId("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to record substitution");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitNonShotEvent = async () => {
    if (!selectedTeamId || !selectedCollectionSessionId || !pendingEventPitchPoint || !eventComposerPlayerId) return;
    if (eventComposerType === "shot") return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createCollectionEvent(selectedCollectionSessionId, {
        team_id: selectedTeamId,
        event_kind: eventComposerType,
        player_id: eventComposerPlayerId,
        x_pct: pendingEventPitchPoint.xPct,
        y_pct: pendingEventPitchPoint.yPct,
      });
      setCollectionEvents((current) => [...current, created]);
      setIsEventComposerOpen(false);
      setPendingEventPitchPoint(null);
      setEventComposerGoalPoint(null);
      setEventComposerPlayerId("");
      setEventComposerAssisterId("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Failed to record ${eventComposerType}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitShotEvent = async (outcome: "miss" | "post" | "save" | "goal") => {
    if (!selectedTeamId || !selectedCollectionSessionId || !pendingEventPitchPoint || !eventComposerPlayerId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createCollectionEvent(selectedCollectionSessionId, {
        team_id: selectedTeamId,
        event_kind: eventComposerType,
        player_id: eventComposerPlayerId,
        assister_player_id: eventComposerType === "shot" ? (eventComposerAssisterId || null) : null,
        x_pct: pendingEventPitchPoint.xPct,
        y_pct: pendingEventPitchPoint.yPct,
        goal_mouth_y: eventComposerGoalPoint?.y ?? null,
        goal_mouth_z: eventComposerGoalPoint?.z ?? null,
        shot_outcome: outcome,
      });
      setCollectionEvents((current) => [...current, created]);
      setIsEventComposerOpen(false);
      setPendingEventPitchPoint(null);
      setEventComposerGoalPoint(null);
      setEventComposerPlayerId("");
      setEventComposerAssisterId("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to record shot");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card collection-section-card">
      {error ? <p className="error-message">{error}</p> : null}
      {!selectedTeamId ? <p className="muted">Select a team to open match screen.</p> : null}
      {selectedTeamId ? (
        <div className="collection-screen">
          <div className="collection-header-row">
            <SearchableSelect
              value={selectedCollectionSessionId}
              onChange={onSessionSelected}
              options={activeCollectionSessions.map((sessionRow) => ({
                value: sessionRow.id,
                label: `${sessionRow.fixture_label} · P${sessionRow.period_number}/${sessionRow.total_periods}`,
              }))}
              placeholder="Select active session"
              disabled={activeCollectionSessions.length === 0}
            />
            <span className="muted">
              Socket: {collectionSessionSocketState === "live" ? "Live" : collectionSessionSocketState}
            </span>
          </div>
          {collectionSessionLive ? (
            <>
              <div className="collection-pitch-wrap">
                <PitchDiagram
                  format={collectionSessionLive.format}
                  onClick={handleCollectionPitchClick}
                >
                  {currentPeriodEvents.map((eventRow) => (
                    <div key={eventRow.id}>
                      <span
                        className={`collection-event-marker ${eventRow.event_kind}`}
                        style={{
                          left: `${100 - (eventRow.y_pct ?? 0)}%`,
                          top: `${100 - (eventRow.x_pct ?? 0)}%`,
                        }}
                        title={`${eventRow.event_kind === "shot_against" ? "Shot Against" : eventRow.event_kind[0].toUpperCase() + eventRow.event_kind.slice(1)} · ${
                          eventRow.event_kind === "shot" || eventRow.event_kind === "shot_against"
                            ? eventRow.shot_outcome ?? "unmarked"
                            : "recorded"
                        } · ${formatClock(eventRow.period_second)} (P${eventRow.period_number})`}
                      />
                    </div>
                  ))}
                  {collectionMatchPrepPlan ? (
                    <div className="collection-squad-overlay">
                      <p className="collection-squad-section">On Pitch</p>
                      {collectionCurrentLineup.pitchPlayers.map((p) => (
                        <div key={p.id} className="collection-squad-player">
                          {p.shirt_number != null ? (
                            <span className="collection-squad-num">{p.shirt_number}</span>
                          ) : null}
                          <span className="collection-squad-name">{p.display_name}</span>
                          {collectionCurrentLineup.slotByPlayerId.get(p.id) ? (
                            <span className="collection-squad-pos">{collectionCurrentLineup.slotByPlayerId.get(p.id)}</span>
                          ) : null}
                        </div>
                      ))}
                      {collectionCurrentLineup.benchPlayers.length > 0 ? (
                        <>
                          <p className="collection-squad-section" style={{ marginTop: "0.5rem" }}>
                            Bench
                          </p>
                          {collectionCurrentLineup.benchPlayers.map((p) => (
                            <div key={p.id} className="collection-squad-player">
                              {p.shirt_number != null ? (
                                <span className="collection-squad-num">{p.shirt_number}</span>
                              ) : null}
                              <span className="collection-squad-name">{p.display_name}</span>
                              {p.position ? (
                                <span className="collection-squad-pos">{p.position}</span>
                              ) : null}
                            </div>
                          ))}
                          <button
                            type="button"
                            className="collection-sub-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubPlayerOutId("");
                              setSubPlayerInId("");
                              setIsSubComposerOpen(true);
                            }}
                          >
                            Sub
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </PitchDiagram>
                <div className="collection-pitch-overlay">
                  <strong>
                    P{collectionSessionLive.period_number}/{collectionSessionLive.total_periods}
                  </strong>
                  <span className="collection-clock">{formatClock(collectionSessionLive.current_period_elapsed_seconds)}</span>
                  <small>{collectionSessionLive.fixture_label}</small>
                </div>
              </div>
              <div className="collection-actions">
                {collectionSessionLive.can_end_period && selectedTeamCanManage ? (
                  <button
                    className="button primary"
                    type="button"
                    onClick={handleEndCollectionPeriod}
                    disabled={isSubmitting}
                  >
                    End Period
                  </button>
                ) : null}
                {collectionSessionLive.can_start_next_period && selectedTeamCanManage ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={handleStartNextCollectionPeriod}
                    disabled={isSubmitting}
                  >
                    Start Period
                  </button>
                ) : null}
                {collectionSessionLive.state === "ended" ? (
                  <p className="muted">Session completed.</p>
                ) : null}
                {!selectedTeamCanManage ? <p className="muted">Read-only for data entry role.</p> : null}
              </div>
            </>
          ) : (
            <p className="muted">No active session selected.</p>
          )}
        </div>
      ) : null}
      {isSubComposerOpen ? (
        <div className="fixture-composer-overlay" role="dialog" aria-modal="true">
          <div className="fixture-composer event-composer">
            <h3>Substitution</h3>
            <div className="event-composer-body">
              <div className="event-player-panel">
                <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.3rem" }}>Player Off</p>
                <div className="event-player-grid">
                  {collectionCurrentLineup.pitchPlayers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`event-player-tile ${subPlayerOutId === p.id ? "selected" : ""}`}
                      title={p.display_name}
                      onClick={() => setSubPlayerOutId(p.id)}
                    >
                      <strong>{p.shirt_number != null ? `#${p.shirt_number}` : "?"}</strong>
                      {collectionCurrentLineup.slotByPlayerId.get(p.id) ? (
                        <span className="event-player-tile-pos">{collectionCurrentLineup.slotByPlayerId.get(p.id)}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                {subPlayerOutId ? (
                  <p className="muted" style={{ fontSize: "0.72rem" }}>
                    {collectionCurrentLineup.pitchPlayers.find((p) => p.id === subPlayerOutId)?.display_name}
                  </p>
                ) : null}
              </div>
              <div className="event-player-panel">
                <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.3rem" }}>Player On</p>
                <div className="event-player-grid">
                  {collectionCurrentLineup.benchPlayers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`event-player-tile ${subPlayerInId === p.id ? "selected" : ""}`}
                      title={p.display_name}
                      onClick={() => setSubPlayerInId(p.id)}
                    >
                      <strong>{p.shirt_number != null ? `#${p.shirt_number}` : "?"}</strong>
                      {p.position ? (
                        <span className="event-player-tile-pos">{p.position}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                {subPlayerInId ? (
                  <p className="muted" style={{ fontSize: "0.72rem" }}>
                    {collectionCurrentLineup.benchPlayers.find((p) => p.id === subPlayerInId)?.display_name}
                  </p>
                ) : null}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                className="button primary"
                disabled={!subPlayerOutId || !subPlayerInId}
                onClick={handleConfirmSubstitution}
              >
                Confirm Sub
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setIsSubComposerOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isEventComposerOpen ? (
        <div className="fixture-composer-overlay" role="dialog" aria-modal="true">
          <div className="fixture-composer event-composer">
            <h3>Capture Event</h3>
            <div className="event-type-toggle">
              <button
                type="button"
                className={`button ${eventComposerType === "shot" ? "primary" : "secondary"}`}
                onClick={() => {
                  setEventComposerType("shot");
                  setEventComposerAssisterId("");
                  if (!pendingEventPitchPoint) return;
                  const predictedPlayerId = predictLikelyPlayerId({
                    eventKind: "shot",
                    xPct: pendingEventPitchPoint.xPct,
                    yPct: pendingEventPitchPoint.yPct,
                    lineup: collectionCurrentLineupCandidates,
                  });
                  setEventComposerPlayerId(predictedPlayerId ?? "");
                }}
              >
                Shot
              </button>
              <button
                type="button"
                className={`button ${eventComposerType === "shot_against" ? "primary" : "secondary"}`}
                onClick={() => {
                  setEventComposerType("shot_against");
                  setEventComposerGoalPoint(null);
                  setEventComposerAssisterId("");
                  setEventComposerPlayerId(predictGoalkeeperPlayerId());
                }}
              >
                Shot Against
              </button>
              <button
                type="button"
                className={`button ${eventComposerType === "tackle" ? "primary" : "secondary"}`}
                onClick={() => {
                  setEventComposerType("tackle");
                  setEventComposerAssisterId("");
                  if (!pendingEventPitchPoint) return;
                  const predictedPlayerId = predictLikelyPlayerId({
                    eventKind: "tackle",
                    xPct: pendingEventPitchPoint.xPct,
                    yPct: pendingEventPitchPoint.yPct,
                    lineup: collectionCurrentLineupCandidates,
                  });
                  setEventComposerPlayerId(predictedPlayerId ?? "");
                }}
              >
                Tackle
              </button>
              <button
                type="button"
                className={`button ${eventComposerType === "interception" ? "primary" : "secondary"}`}
                onClick={() => {
                  setEventComposerType("interception");
                  setEventComposerAssisterId("");
                  if (!pendingEventPitchPoint) return;
                  const predictedPlayerId = predictLikelyPlayerId({
                    eventKind: "interception",
                    xPct: pendingEventPitchPoint.xPct,
                    yPct: pendingEventPitchPoint.yPct,
                    lineup: collectionCurrentLineupCandidates,
                  });
                  setEventComposerPlayerId(predictedPlayerId ?? "");
                }}
              >
                Interception
              </button>
            </div>
            <div className="event-composer-body">
              <div className="event-player-panel">
                <div className="event-player-grid">
                  {collectionEventPlayers.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className={`event-player-tile ${eventComposerPlayerId === player.id ? "selected" : ""}`}
                      onClick={() => setEventComposerPlayerId(player.id)}
                      title={player.display_name}
                    >
                      <strong>{player.shirt_number ? `#${player.shirt_number}` : "?"}</strong>
                    </button>
                  ))}
                </div>
                <p className="muted">Closest tactical fit is preselected; tap another number to override.</p>
                {collectionEventPlayers.length === 0 ? (
                  <p className="muted">No matchday squad players available for this fixture.</p>
                ) : null}
              </div>
              {eventComposerType === "shot" ? (
                <div className="event-player-panel">
                  <p className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.3rem" }}>
                    Key pass by <span style={{ color: "var(--tl-muted, #7a9ab5)" }}>(optional)</span>
                  </p>
                  <div className="event-player-grid">
                    {collectionEventPlayers.map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className={`event-player-tile ${eventComposerAssisterId === player.id ? "assister-selected" : ""}`}
                        onClick={() =>
                          setEventComposerAssisterId(eventComposerAssisterId === player.id ? "" : player.id)
                        }
                        title={player.display_name}
                      >
                        <strong>{player.shirt_number ? `#${player.shirt_number}` : "?"}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {eventComposerType === "shot" || eventComposerType === "shot_against" ? (
                <div className="event-shot-panel">
                  <GoalMouthDiagram
                    value={eventComposerGoalPoint}
                    onChange={setEventComposerGoalPoint}
                    disabled={isSubmitting}
                    goalWidthFt={selectedCollectionGoalDimensions?.width_ft}
                    pitchWidthM={selectedCollectionGoalDimensions?.pitch_width_m}
                    goalHeightFt={selectedCollectionGoalWindow?.goalHeightFt}
                    viewPaddingTopFt={6}
                    viewPaddingBottomFt={1.5}
                  />
                  <p className="muted">
                    {eventComposerGoalPoint
                      ? `Goal mouth Y ${eventComposerGoalPoint.y.toFixed(1)} (0-100), Z ${eventComposerGoalPoint.z.toFixed(1)}ft (0-20)`
                      : "Optional: click inside the goal frame to set goal-mouth coordinates"}
                  </p>
                  {selectedCollectionGoalDimensions ? (
                    <p className="muted">
                      Reference goal size for {collectionSessionLive?.format.replace("_", " ")}:{" "}
                      {selectedCollectionGoalDimensions.width_ft}ft x {selectedCollectionGoalDimensions.height_ft}ft
                    </p>
                  ) : null}
                  <div className="event-outcome-actions">
                    {eventOutcomeOptions.map((option) => (
                      <button
                        key={option}
                        className="button primary"
                        type="button"
                        disabled={isSubmitting || !eventComposerPlayerId}
                        onClick={() => handleSubmitShotEvent(option)}
                      >
                        {option[0].toUpperCase() + option.slice(1)}
                      </button>
                    ))}
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setIsEventComposerOpen(false);
                        setPendingEventPitchPoint(null);
                        setEventComposerGoalPoint(null);
                        setEventComposerPlayerId("");
                        setEventComposerAssisterId("");
                      }}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="event-shot-panel">
                  <p className="muted">
                    {eventComposerType === "tackle"
                      ? "Record tackle at selected pitch location."
                      : "Record interception at selected pitch location."}
                  </p>
                  <div className="event-outcome-actions">
                    <button
                      className="button primary"
                      type="button"
                      disabled={isSubmitting || !eventComposerPlayerId}
                      onClick={handleSubmitNonShotEvent}
                    >
                      Save {eventComposerType[0].toUpperCase() + eventComposerType.slice(1)}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setIsEventComposerOpen(false);
                        setPendingEventPitchPoint(null);
                        setEventComposerGoalPoint(null);
                        setEventComposerPlayerId("");
                        setEventComposerAssisterId("");
                      }}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

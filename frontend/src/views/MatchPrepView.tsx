import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { createCoachingNote, deleteCoachingNote, getMatchPrepPlan, listCoachingNotes, upsertMatchPrepPlan } from "../api";
import { PitchDiagram } from "../components/PitchDiagram";
import { SearchableSelect } from "../components/SearchableSelect";
import { getFormationSlots } from "../domain/formations";
import type { FormationSlot } from "../domain/formations";
import { isPositionMismatch } from "../utils/formatters";
import type { CoachingNote, MatchPrepFixture, MatchPrepPlan } from "../types/auth";

type MatchPrepViewProps = {
  selectedTeamId: string;
  selectedTeamName: string;
  selectedTeamCanManage: boolean;
  hasAnyManagerAccess: boolean;
  matchPrepFixtures: MatchPrepFixture[];
  selectedFixtureId: string;
  onFixtureSelected: (fixtureId: string) => void;
};

export function MatchPrepView({
  selectedTeamId,
  selectedTeamName,
  selectedTeamCanManage,
  hasAnyManagerAccess,
  matchPrepFixtures,
  selectedFixtureId,
  onFixtureSelected,
}: MatchPrepViewProps) {
  const [matchPrepPlan, setMatchPrepPlan] = useState<MatchPrepPlan | null>(null);
  const [coachingNotes, setCoachingNotes] = useState<CoachingNote[]>([]);
  const [matchPrepDragTarget, setMatchPrepDragTarget] = useState("");
  const [activeMatchPrepSegmentIndex, setActiveMatchPrepSegmentIndex] = useState(0);
  const [isCoachingNoteComposerOpen, setIsCoachingNoteComposerOpen] = useState(false);
  const [coachingNotePlayerId, setCoachingNotePlayerId] = useState("__team__");
  const [coachingNoteText, setCoachingNoteText] = useState("");
  const [matchPrepSegmentMinuteDrafts, setMatchPrepSegmentMinuteDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadMatchPrepPlan = useCallback(async (matchId: string, teamId: string) => {
    if (!matchId || !teamId) {
      setMatchPrepPlan(null);
      return;
    }
    try {
      const plan = await getMatchPrepPlan(matchId, teamId);
      setMatchPrepPlan(plan);
    } catch {
      setMatchPrepPlan(null);
    }
  }, []);

  const loadCoachingNotes = useCallback(async (matchId: string, teamId: string) => {
    if (!matchId || !teamId) {
      setCoachingNotes([]);
      return;
    }
    try {
      const notes = await listCoachingNotes(matchId, teamId);
      setCoachingNotes(notes);
    } catch {
      setCoachingNotes([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedFixtureId || !selectedTeamId || !selectedTeamCanManage) return;
    void loadMatchPrepPlan(selectedFixtureId, selectedTeamId);
  }, [loadMatchPrepPlan, selectedFixtureId, selectedTeamCanManage, selectedTeamId]);

  useEffect(() => {
    if (!selectedFixtureId || !selectedTeamId || !selectedTeamCanManage) return;
    void loadCoachingNotes(selectedFixtureId, selectedTeamId);
  }, [loadCoachingNotes, selectedFixtureId, selectedTeamCanManage, selectedTeamId]);

  useEffect(() => {
    if (!matchPrepPlan) {
      setActiveMatchPrepSegmentIndex(0);
      return;
    }
    const totalSegments = matchPrepPlan.substitution_segments.length + 1;
    if (activeMatchPrepSegmentIndex >= totalSegments) {
      setActiveMatchPrepSegmentIndex(totalSegments - 1);
    }
  }, [activeMatchPrepSegmentIndex, matchPrepPlan]);

  useEffect(() => {
    if (!isCoachingNoteComposerOpen) return;
    setCoachingNoteText(coachingNoteByTarget[coachingNotePlayerId]?.note_text ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachingNotePlayerId, isCoachingNoteComposerOpen]);

  const matchPrepSlots = useMemo(
    () => (matchPrepPlan ? getFormationSlots(matchPrepPlan.format, matchPrepPlan.formation) : []),
    [matchPrepPlan],
  );
  const matchPrepBasePlayerBySlotId = useMemo(() => {
    if (!matchPrepPlan) return {} as Record<string, MatchPrepPlan["players"][number]>;
    const mapping: Record<string, MatchPrepPlan["players"][number]> = {};
    for (const player of matchPrepPlan.players) {
      if (player.lineup_slot) mapping[player.lineup_slot] = player;
    }
    return mapping;
  }, [matchPrepPlan]);
  const matchPrepPlayerBySlotId = useMemo(() => {
    if (!matchPrepPlan) return {} as Record<string, MatchPrepPlan["players"][number]>;
    const playersById: Record<string, MatchPrepPlan["players"][number]> = {};
    for (const player of matchPrepPlan.players) playersById[player.player_id] = player;
    const slotToPlayerId: Record<string, string> = {};
    const playerToSlotId: Record<string, string> = {};
    for (const [slotId, player] of Object.entries(matchPrepBasePlayerBySlotId)) {
      slotToPlayerId[slotId] = player.player_id;
      playerToSlotId[player.player_id] = slotId;
    }
    const swapsToApply = matchPrepPlan.substitution_segments
      .slice(0, Math.max(0, activeMatchPrepSegmentIndex))
      .flatMap((segment) => segment.substitutions);
    for (const swap of swapsToApply) {
      const outSlotId = playerToSlotId[swap.player_out_id];
      if (!outSlotId) continue;
      const existingInSlotId = playerToSlotId[swap.player_in_id];
      if (existingInSlotId) delete slotToPlayerId[existingInSlotId];
      delete playerToSlotId[swap.player_out_id];
      slotToPlayerId[outSlotId] = swap.player_in_id;
      playerToSlotId[swap.player_in_id] = outSlotId;
    }
    const mapping: Record<string, MatchPrepPlan["players"][number]> = {};
    for (const [slotId, playerId] of Object.entries(slotToPlayerId)) {
      const player = playersById[playerId];
      if (player) mapping[slotId] = player;
    }
    return mapping;
  }, [activeMatchPrepSegmentIndex, matchPrepBasePlayerBySlotId, matchPrepPlan]);
  const matchPrepBenchPlayers = useMemo(
    () => (matchPrepPlan ? matchPrepPlan.players.filter((p) => p.is_available && !p.lineup_slot) : []),
    [matchPrepPlan],
  );
  const matchPrepUnavailablePlayers = useMemo(
    () => (matchPrepPlan ? matchPrepPlan.players.filter((p) => !p.is_available && !p.lineup_slot) : []),
    [matchPrepPlan],
  );
  const coachingNoteTargetOptions = useMemo(() => {
    const options = [{ value: "__team__", label: "Team Note" }];
    if (!matchPrepPlan) return options;
    return [
      ...options,
      ...matchPrepPlan.players.map((player) => ({
        value: player.player_id,
        label: `${player.player_name}${player.shirt_number ? ` #${player.shirt_number}` : ""}`,
      })),
    ];
  }, [matchPrepPlan]);
  const latestTeamNote = useMemo(
    () => coachingNotes.find((note) => !note.player_id) ?? null,
    [coachingNotes],
  );
  const latestPlayerNoteById = useMemo(() => {
    const mapping: Record<string, CoachingNote> = {};
    for (const note of coachingNotes) {
      if (!note.player_id) continue;
      if (!mapping[note.player_id]) mapping[note.player_id] = note;
    }
    return mapping;
  }, [coachingNotes]);
  const coachingNoteByTarget = useMemo(() => {
    const mapping: Record<string, CoachingNote> = {};
    for (const note of coachingNotes) {
      mapping[note.player_id ?? "__team__"] = note;
    }
    return mapping;
  }, [coachingNotes]);

  const handleSaveMatchPrepPlan = async () => {
    if (!matchPrepPlan) return;
    for (const segment of matchPrepPlan.substitution_segments) {
      if (!Number.isInteger(segment.end_minute) || segment.end_minute < 1) {
        setError("Each substitution segment must have a start minute of at least 1");
        return;
      }
      if (segment.end_minute >= matchPrepPlan.total_match_minutes) {
        setError(`Substitution segments must start before minute ${matchPrepPlan.total_match_minutes}`);
        return;
      }
      for (const swap of segment.substitutions) {
        if (!swap.player_out_id || !swap.player_in_id) {
          setError("Each planned substitution must select both outgoing and incoming players");
          return;
        }
      }
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const saved = await upsertMatchPrepPlan({
        match_id: matchPrepPlan.match_id,
        team_id: matchPrepPlan.team_id,
        formation: matchPrepPlan.formation,
        players: matchPrepPlan.players.map((player) => ({
          player_id: player.player_id,
          is_available: player.is_available,
          in_matchday_squad: player.is_available,
          is_starting: player.is_starting,
          lineup_slot: player.lineup_slot,
        })),
        substitution_segments: matchPrepPlan.substitution_segments.map((segment) => ({
          end_minute: segment.end_minute,
          substitutions: segment.substitutions.map((swap) => ({
            player_out_id: swap.player_out_id,
            player_in_id: swap.player_in_id,
          })),
        })),
      });
      setMatchPrepPlan(saved);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save match prep plan");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCoachingNoteComposer = () => {
    setCoachingNotePlayerId("__team__");
    setCoachingNoteText("");
    setIsCoachingNoteComposerOpen(false);
  };

  const openCoachingNoteComposer = () => {
    const defaultTarget = "__team__";
    setCoachingNotePlayerId(defaultTarget);
    setCoachingNoteText(coachingNoteByTarget[defaultTarget]?.note_text ?? "");
    setIsCoachingNoteComposerOpen(true);
  };

  const handleCreateCoachingNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFixtureId || !selectedTeamId || !coachingNoteText.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await createCoachingNote({
        match_id: selectedFixtureId,
        team_id: selectedTeamId,
        player_id: coachingNotePlayerId === "__team__" ? null : coachingNotePlayerId,
        note_text: coachingNoteText.trim(),
      });
      await loadCoachingNotes(selectedFixtureId, selectedTeamId);
      resetCoachingNoteComposer();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to add coaching note");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCoachingNote = async () => {
    const activeNote = coachingNoteByTarget[coachingNotePlayerId];
    if (!activeNote || !selectedFixtureId || !selectedTeamId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteCoachingNote(activeNote.id);
      await loadCoachingNotes(selectedFixtureId, selectedTeamId);
      setCoachingNoteText("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete coaching note");
    } finally {
      setIsSubmitting(false);
    }
  };

  const assignMatchPrepPlayerToSlot = (playerId: string, slotId: string) => {
    setMatchPrepPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        players: current.players.map((player) => {
          if (player.player_id === playerId) {
            return { ...player, is_available: true, in_matchday_squad: true, is_starting: true, lineup_slot: slotId };
          }
          if (player.lineup_slot === slotId) {
            return { ...player, is_starting: false, lineup_slot: null };
          }
          return player;
        }),
      };
    });
  };

  const moveMatchPrepPlayerToBench = (playerId: string) => {
    setMatchPrepPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        players: current.players.map((player) =>
          player.player_id === playerId
            ? { ...player, is_available: true, in_matchday_squad: true, is_starting: false, lineup_slot: null }
            : player,
        ),
      };
    });
  };

  const moveMatchPrepPlayerOutOfSquad = (playerId: string) => {
    setMatchPrepPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        players: current.players.map((player) =>
          player.player_id === playerId
            ? { ...player, is_available: false, in_matchday_squad: false, is_starting: false, lineup_slot: null }
            : player,
        ),
      };
    });
  };

  const addMatchPrepSubstitutionSegment = () => {
    setMatchPrepPlan((current) => {
      if (!current) return current;
      const previousEndMinute = current.substitution_segments[current.substitution_segments.length - 1]?.end_minute ?? 0;
      const fallbackStartMinute = previousEndMinute > 0 ? previousEndMinute + 10 : 10;
      const nextEndMinute = Math.min(current.total_match_minutes - 1, fallbackStartMinute);
      if (nextEndMinute <= previousEndMinute) return current;
      return {
        ...current,
        substitution_segments: [
          ...current.substitution_segments,
          { segment_index: current.substitution_segments.length, end_minute: nextEndMinute, substitutions: [] },
        ],
      };
    });
    setActiveMatchPrepSegmentIndex((current) => current + 1);
  };

  const updateMatchPrepSubstitutionSegmentEndMinute = (segmentIndex: number, endMinute: number) => {
    setMatchPrepPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        substitution_segments: current.substitution_segments.map((segment, index) =>
          index === segmentIndex
            ? { ...segment, end_minute: Math.max(1, Math.min(current.total_match_minutes - 1, endMinute)) }
            : segment,
        ),
      };
    });
  };

  const updateMatchPrepSubstitutionSegmentMinuteDraft = (segmentIndex: number, value: string) => {
    setMatchPrepSegmentMinuteDrafts((current) => ({ ...current, [segmentIndex]: value }));
  };

  const commitMatchPrepSubstitutionSegmentMinuteDraft = (segmentIndex: number, fallbackMinute: number) => {
    if (!matchPrepPlan) return;
    const rawValue = matchPrepSegmentMinuteDrafts[segmentIndex] ?? String(fallbackMinute);
    const parsed = Number.parseInt(rawValue, 10);
    const nextMinute = Number.isFinite(parsed)
      ? Math.max(1, Math.min(matchPrepPlan.total_match_minutes - 1, parsed))
      : fallbackMinute;
    updateMatchPrepSubstitutionSegmentEndMinute(segmentIndex, nextMinute);
    setMatchPrepSegmentMinuteDrafts((current) => ({ ...current, [segmentIndex]: String(nextMinute) }));
  };

  const removeMatchPrepSubstitutionSegment = (segmentIndex: number) => {
    setMatchPrepPlan((current) => {
      if (!current) return current;
      const nextSegments = current.substitution_segments
        .filter((_, index) => index !== segmentIndex)
        .map((segment, index) => ({ ...segment, segment_index: index }));
      return { ...current, substitution_segments: nextSegments };
    });
    setActiveMatchPrepSegmentIndex((current) => {
      const removedDisplayIndex = segmentIndex + 1;
      if (current < removedDisplayIndex) return current;
      if (current === removedDisplayIndex) return Math.max(0, current - 1);
      return current - 1;
    });
  };

  const addOrReplaceMatchPrepPlannedSwap = (segmentIndex: number, playerOutId: string, playerInId: string) => {
    if (!playerOutId || !playerInId || playerOutId === playerInId) return;
    setMatchPrepPlan((current) => {
      if (!current) return current;
      const playerOut = current.players.find((row) => row.player_id === playerOutId);
      const playerIn = current.players.find((row) => row.player_id === playerInId);
      if (!playerOut || !playerIn) return current;
      return {
        ...current,
        substitution_segments: current.substitution_segments.map((segment, index) =>
          index === segmentIndex
            ? {
                ...segment,
                substitutions: [
                  ...segment.substitutions.filter(
                    (swap) => swap.player_out_id !== playerOutId && swap.player_in_id !== playerInId,
                  ),
                  {
                    player_out_id: playerOut.player_id,
                    player_out_name: playerOut.player_name,
                    player_out_shirt_number: playerOut.shirt_number,
                    player_in_id: playerIn.player_id,
                    player_in_name: playerIn.player_name,
                    player_in_shirt_number: playerIn.shirt_number,
                  },
                ],
              }
            : segment,
        ),
      };
    });
  };

  const removeMatchPrepPlannedSwap = (segmentIndex: number, swapIndex: number) => {
    setMatchPrepPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        substitution_segments: current.substitution_segments.map((segment, index) =>
          index === segmentIndex
            ? { ...segment, substitutions: segment.substitutions.filter((_, i) => i !== swapIndex) }
            : segment,
        ),
      };
    });
  };

  const getDraggedPlayerId = (event: DragEvent<HTMLElement>): string => {
    return event.dataTransfer.getData("text/plain").trim();
  };

  const assignMatchPrepPlayerToNearestSlot = (event: DragEvent<HTMLDivElement>, slots: FormationSlot[]) => {
    const playerId = getDraggedPlayerId(event);
    if (!playerId || slots.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;
    const nearest = slots.reduce<{ id: string; distance: number } | null>((closest, slot) => {
      const dx = slot.x - xPercent;
      const dy = slot.y - yPercent;
      const distance = dx * dx + dy * dy;
      if (!closest || distance < closest.distance) return { id: slot.id, distance };
      return closest;
    }, null);
    if (nearest) assignMatchPrepPlayerToSlot(playerId, nearest.id);
  };

  return (
    <section className="section-card">
      {error ? <p className="error-message">{error}</p> : null}
      <div className="player-toolbar match-prep-toolbar">
        <div className="stack-form match-prep-fixture-picker">
          <SearchableSelect
            value={selectedFixtureId}
            onChange={onFixtureSelected}
            options={matchPrepFixtures.map((fixture) => ({
              value: fixture.id,
              label: `${fixture.opponent_team_name}${fixture.kickoff_at ? ` · ${new Date(fixture.kickoff_at).toLocaleString()}` : ""}`,
            }))}
            placeholder="Select upcoming fixture"
            disabled={!selectedTeamId || !selectedTeamCanManage}
          />
        </div>
        <div className="match-prep-toolbar-actions">
          {latestTeamNote ? (
            <span
              className="team-note-indicator"
              title={`Team note: ${latestTeamNote.note_text}`}
              aria-label="Team note"
            >
              📝
            </span>
          ) : null}
          <button
            className="button secondary"
            type="button"
            disabled={isSubmitting || !matchPrepPlan}
            onClick={openCoachingNoteComposer}
          >
            Add Coaching Note
          </button>
          <button
            className="button primary"
            type="button"
            disabled={isSubmitting || !matchPrepPlan}
            onClick={handleSaveMatchPrepPlan}
          >
            Save Match Plan
          </button>
        </div>
      </div>
      {!hasAnyManagerAccess ? (
        <p className="muted">No manager access yet. Ask a super admin to assign you to a team.</p>
      ) : null}
      {!selectedTeamId && hasAnyManagerAccess ? (
        <p className="muted">Select a team in the sidebar to start match prep.</p>
      ) : null}
      {!selectedTeamCanManage && selectedTeamId ? (
        <p className="muted">Manager access required for match prep on this team.</p>
      ) : null}
      {!selectedFixtureId && selectedTeamId && selectedTeamCanManage ? (
        <p className="muted">No upcoming fixtures for {selectedTeamName}.</p>
      ) : null}
      {matchPrepPlan ? (
        <div className="stack-form" style={{ marginTop: "0.8rem" }}>
          <div className="member-actions match-prep-formation-row">
            <span className="muted">Formation</span>
            <select
              value={matchPrepPlan.formation}
              onChange={(event) => {
                const nextFormation = event.target.value;
                const nextSlotIds = new Set(getFormationSlots(matchPrepPlan.format, nextFormation).map((slot) => slot.id));
                setMatchPrepPlan((current) =>
                  current
                    ? {
                        ...current,
                        formation: nextFormation,
                        players: current.players.map((player) =>
                          player.lineup_slot && !nextSlotIds.has(player.lineup_slot)
                            ? { ...player, lineup_slot: null, is_starting: false }
                            : player,
                        ),
                      }
                    : current,
                );
              }}
            >
              {matchPrepPlan.formation_options.map((formation) => (
                <option key={formation} value={formation}>
                  {formation}
                </option>
              ))}
            </select>
          </div>
          <p className="muted">
            Starting selected: {matchPrepPlan.players.filter((player) => player.is_starting).length}/
            {matchPrepPlan.required_starting_count} · Format {matchPrepPlan.format.replace("_", " ")}
          </p>
          <div className="prep-layout">
            <div className="pitch-card">
              {matchPrepPlan.substitution_segments.length > 0 ? (
                <div className="match-prep-segment-nav">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setActiveMatchPrepSegmentIndex((current) => Math.max(0, current - 1))}
                    disabled={activeMatchPrepSegmentIndex === 0}
                  >
                    ←
                  </button>
                  <span className="muted">
                    Segment {activeMatchPrepSegmentIndex + 1} ·{" "}
                    {activeMatchPrepSegmentIndex === 0
                      ? `0' - ${matchPrepPlan.substitution_segments[0]?.end_minute ?? matchPrepPlan.total_match_minutes}'`
                      : `${matchPrepPlan.substitution_segments[activeMatchPrepSegmentIndex - 1]?.end_minute ?? 0}' - ${
                          matchPrepPlan.substitution_segments[activeMatchPrepSegmentIndex]?.end_minute ??
                          matchPrepPlan.total_match_minutes
                        }'`}
                  </span>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      setActiveMatchPrepSegmentIndex((current) =>
                        Math.min(matchPrepPlan.substitution_segments.length, current + 1),
                      )
                    }
                    disabled={activeMatchPrepSegmentIndex >= matchPrepPlan.substitution_segments.length}
                  >
                    →
                  </button>
                </div>
              ) : null}
              <PitchDiagram
                format={matchPrepPlan.format}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  setMatchPrepDragTarget("");
                  assignMatchPrepPlayerToNearestSlot(event, matchPrepSlots);
                }}
              >
                {matchPrepSlots.map((slot) => {
                  const assignedPlayer = matchPrepPlayerBySlotId[slot.id];
                  const mismatch = assignedPlayer ? isPositionMismatch(assignedPlayer.position, slot.role) : false;
                  const assignedPlayerNote = assignedPlayer ? latestPlayerNoteById[assignedPlayer.player_id] : null;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      className={`pitch-slot ${assignedPlayer ? "filled" : "empty"} ${mismatch ? "mismatch" : ""} ${
                        matchPrepDragTarget === slot.id ? "drag-over" : ""
                      }`}
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                      title={assignedPlayerNote ? assignedPlayerNote.note_text : undefined}
                      onDoubleClick={() => {
                        if (assignedPlayer) moveMatchPrepPlayerToBench(assignedPlayer.player_id);
                      }}
                      onDragEnter={(event) => { event.preventDefault(); setMatchPrepDragTarget(slot.id); }}
                      onDragOver={(event) => { event.preventDefault(); setMatchPrepDragTarget(slot.id); }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setMatchPrepDragTarget("");
                        const playerId = getDraggedPlayerId(event);
                        if (playerId) {
                          if (
                            assignedPlayer &&
                            activeMatchPrepSegmentIndex > 0 &&
                            activeMatchPrepSegmentIndex <= matchPrepPlan.substitution_segments.length
                          ) {
                            addOrReplaceMatchPrepPlannedSwap(activeMatchPrepSegmentIndex - 1, assignedPlayer.player_id, playerId);
                            return;
                          }
                          assignMatchPrepPlayerToSlot(playerId, slot.id);
                        }
                      }}
                    >
                      <span className="pitch-slot-label">
                        {slot.label}
                        {assignedPlayer?.shirt_number ? ` #${assignedPlayer.shirt_number}` : ""}
                      </span>
                      {assignedPlayer ? (
                        <span className="pitch-slot-player">
                          {assignedPlayer.player_name}
                          {assignedPlayerNote ? (
                            <span className="player-note-badge" aria-label="Has coaching note" title="Has coaching note">
                              N
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="pitch-slot-player muted">Drop Player</span>
                      )}
                    </button>
                  );
                })}
              </PitchDiagram>
            </div>
            <div className="prep-side">
              <div
                className={`prep-dropzone ${matchPrepDragTarget === "bench" ? "drag-over" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setMatchPrepDragTarget("bench"); }}
                onDragOver={(event) => { event.preventDefault(); setMatchPrepDragTarget("bench"); }}
                onDrop={(event) => {
                  event.preventDefault();
                  setMatchPrepDragTarget("");
                  const playerId = getDraggedPlayerId(event);
                  if (playerId) moveMatchPrepPlayerToBench(playerId);
                }}
              >
                <h4>Bench</h4>
                <p className="muted">Tip: Double-click a bench player to move them out of squad.</p>
                {matchPrepBenchPlayers.length === 0 ? <p className="muted">Drop players here</p> : null}
                <div className="prep-player-grid">
                  {matchPrepBenchPlayers.map((player) => {
                    const playerNote = latestPlayerNoteById[player.player_id];
                    return (
                      <button
                        key={player.player_id}
                        type="button"
                        className="prep-player-tile"
                        draggable
                        title={playerNote ? playerNote.note_text : undefined}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", player.player_id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setMatchPrepDragTarget("")}
                        onDoubleClick={() => moveMatchPrepPlayerOutOfSquad(player.player_id)}
                      >
                        <strong>
                          {player.player_name}
                          {playerNote ? (
                            <span className="player-note-badge" aria-label="Has coaching note" title="Has coaching note">
                              N
                            </span>
                          ) : null}
                        </strong>
                        <span>
                          {player.shirt_number ? `#${player.shirt_number}` : "No #"}
                          {player.position ? ` · ${player.position}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                className={`prep-dropzone is-muted ${matchPrepDragTarget === "out" ? "drag-over" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setMatchPrepDragTarget("out"); }}
                onDragOver={(event) => { event.preventDefault(); setMatchPrepDragTarget("out"); }}
                onDrop={(event) => {
                  event.preventDefault();
                  setMatchPrepDragTarget("");
                  const playerId = getDraggedPlayerId(event);
                  if (playerId) moveMatchPrepPlayerOutOfSquad(playerId);
                }}
              >
                <h4>Out Of Squad</h4>
                {matchPrepUnavailablePlayers.length === 0 ? <p className="muted">Double-click a bench tile</p> : null}
                <div className="prep-player-grid">
                  {matchPrepUnavailablePlayers.map((player) => {
                    const playerNote = latestPlayerNoteById[player.player_id];
                    return (
                      <button
                        key={player.player_id}
                        type="button"
                        className="prep-player-tile is-muted"
                        draggable
                        title={playerNote ? playerNote.note_text : undefined}
                        onDragStart={(event) => {
                          event.dataTransfer.setData("text/plain", player.player_id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setMatchPrepDragTarget("")}
                        onDoubleClick={() => moveMatchPrepPlayerToBench(player.player_id)}
                      >
                        <strong>
                          {player.player_name}
                          {playerNote ? (
                            <span className="player-note-badge" aria-label="Has coaching note" title="Has coaching note">
                              N
                            </span>
                          ) : null}
                        </strong>
                        <span>
                          {player.shirt_number ? `#${player.shirt_number}` : "No #"}
                          {player.position ? ` · ${player.position}` : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="stack-form prep-substitution-planner">
            <div className="member-actions">
              <h3>Substitution Planning</h3>
              <button
                className="button secondary"
                type="button"
                onClick={addMatchPrepSubstitutionSegment}
                disabled={
                  (matchPrepPlan.substitution_segments[matchPrepPlan.substitution_segments.length - 1]?.end_minute ?? 0) >=
                  matchPrepPlan.total_match_minutes - 1
                }
              >
                + Add Segment
              </button>
            </div>
            <p className="muted">
              Segment 1 is your starting lineup (minute 0). Add Segment 2+ with start minutes; each segment runs until
              the next segment starts (or minute {matchPrepPlan.total_match_minutes}).
            </p>
            {matchPrepPlan.substitution_segments.length === 0 ? (
              <p className="muted">No substitution segments yet.</p>
            ) : null}
            {matchPrepPlan.substitution_segments.map((segment, segmentIndex) => (
              <div className="prep-segment-card" key={`segment-${segmentIndex}`}>
                <div className="member-actions">
                  <strong>Segment {segmentIndex + 2}</strong>
                  <span className="muted">
                    {segment.end_minute}&prime; -{" "}
                    {matchPrepPlan.substitution_segments[segmentIndex + 1]?.end_minute ??
                      matchPrepPlan.total_match_minutes}
                    &prime;
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    min={1}
                    max={matchPrepPlan.total_match_minutes - 1}
                    value={matchPrepSegmentMinuteDrafts[segmentIndex] ?? String(segment.end_minute)}
                    onChange={(event) => updateMatchPrepSubstitutionSegmentMinuteDraft(segmentIndex, event.target.value)}
                    onBlur={() => commitMatchPrepSubstitutionSegmentMinuteDraft(segmentIndex, segment.end_minute)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitMatchPrepSubstitutionSegmentMinuteDraft(segmentIndex, segment.end_minute);
                        event.currentTarget.blur();
                      } else if (event.key === "Escape") {
                        setMatchPrepSegmentMinuteDrafts((current) => {
                          const next = { ...current };
                          delete next[segmentIndex];
                          return next;
                        });
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder="End minute"
                    className="prep-segment-minute-input"
                  />
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setActiveMatchPrepSegmentIndex(segmentIndex + 1)}
                  >
                    Edit On Pitch
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => removeMatchPrepSubstitutionSegment(segmentIndex)}
                  >
                    Remove Segment
                  </button>
                </div>
                {segment.substitutions.length === 0 ? <p className="muted">No planned swaps yet.</p> : null}
                {segment.substitutions.map((swap, swapIndex) => (
                  <div className="member-actions prep-swap-row" key={`segment-${segmentIndex}-swap-${swapIndex}`}>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => removeMatchPrepPlannedSwap(segmentIndex, swapIndex)}
                    >
                      Remove
                    </button>
                    <span className="muted">
                      {swap.player_out_name}
                      {swap.player_out_shirt_number ? ` #${swap.player_out_shirt_number}` : ""} →{" "}
                      {swap.player_in_name}
                      {swap.player_in_shirt_number ? ` #${swap.player_in_shirt_number}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {isCoachingNoteComposerOpen && selectedFixtureId && selectedTeamId ? (
        <div className="fixture-composer-overlay" role="dialog" aria-modal="true">
          <form className="fixture-composer" onSubmit={handleCreateCoachingNote}>
            <h3>{coachingNoteByTarget[coachingNotePlayerId] ? "Edit Coaching Note" : "Add Coaching Note"}</h3>
            <p className="muted">{selectedTeamName}</p>
            <SearchableSelect
              value={coachingNotePlayerId}
              onChange={setCoachingNotePlayerId}
              options={coachingNoteTargetOptions}
              placeholder="Note target"
            />
            <textarea
              className="coaching-note-textarea"
              placeholder="Enter coaching note..."
              value={coachingNoteText}
              onChange={(event) => setCoachingNoteText(event.target.value)}
              rows={5}
              required
            />
            <div className="member-actions">
              <button className="button primary" type="submit" disabled={isSubmitting || !coachingNoteText.trim()}>
                {coachingNoteByTarget[coachingNotePlayerId] ? "Update Note" : "Save Note"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={isSubmitting || !coachingNoteByTarget[coachingNotePlayerId]}
                onClick={handleDeleteCoachingNote}
              >
                Delete Note
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={isSubmitting}
                onClick={resetCoachingNoteComposer}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

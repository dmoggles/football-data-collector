import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { GoalMouthDiagram, buildGoalViewWindow, toMarkerStyle, FRAME } from "../components/GoalMouthDiagram";
import { PitchDiagram } from "../components/PitchDiagram";
import { getGoalDimensions } from "../domain/goalDimensions";
import { fixtureFormatIcon, formatClock } from "../utils/formatters";
import { getMatchPrepPlan, listAllCollectionSessions, listCollectionEvents } from "../api";
import type { CollectionEvent, CollectionSession, MatchFormat, MatchPrepPlan, Player } from "../types/auth";

type StatsViewProps = {
  selectedTeamId: string;
  players: Player[];
  playersForSelectedTeam: Player[];
};

export function StatsView({ selectedTeamId, players, playersForSelectedTeam }: StatsViewProps) {
  const [statsTopView, setStatsTopView] = useState<"matches" | "season">("matches");
  const [statsView, setStatsView] = useState<"list" | "detail">("list");
  const [allCollectionSessions, setAllCollectionSessions] = useState<CollectionSession[]>([]);
  const [selectedStatSessionId, setSelectedStatSessionId] = useState("");
  const [statEvents, setStatEvents] = useState<CollectionEvent[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [isStatEventsLoading, setIsStatEventsLoading] = useState(false);
  const [statMatchPrepPlan, setStatMatchPrepPlan] = useState<MatchPrepPlan | null>(null);
  const [statsPeriodFilter, setStatsPeriodFilter] = useState<number | null>(null);
  const [statsEventKindFilter, setStatsEventKindFilter] = useState<CollectionEvent["event_kind"] | "all">("all");
  const [statsGoalMouthToggle, setStatsGoalMouthToggle] = useState<"our" | "against">("our");
  const [seasonEvents, setSeasonEvents] = useState<CollectionEvent[]>([]);
  const [seasonMatchPrepPlans, setSeasonMatchPrepPlans] = useState<Map<string, MatchPrepPlan>>(new Map());
  const [isSeasonEventsLoading, setIsSeasonEventsLoading] = useState(false);
  const [selectedSeasonPlayerId, setSelectedSeasonPlayerId] = useState("");
  const [seasonPlayerDetailKindFilter, setSeasonPlayerDetailKindFilter] = useState<CollectionEvent["event_kind"] | "all">("all");
  const [seasonPlayerGoalMouthToggle, setSeasonPlayerGoalMouthToggle] = useState<"our" | "against">("our");

  const selectedStatSession = useMemo(
    () => allCollectionSessions.find((s) => s.id === selectedStatSessionId) ?? null,
    [allCollectionSessions, selectedStatSessionId],
  );

  const statMatchSummary = useMemo(
    () => ({
      goalsFor: statEvents.filter((e) => e.event_kind === "shot" && e.shot_outcome === "goal").length,
      goalsAgainst: statEvents.filter((e) => e.event_kind === "shot_against" && e.shot_outcome === "goal").length,
      shotsFor: statEvents.filter((e) => e.event_kind === "shot").length,
      shotsAgainst: statEvents.filter((e) => e.event_kind === "shot_against").length,
      shotsOnTarget: statEvents.filter(
        (e) => e.event_kind === "shot" && (e.shot_outcome === "save" || e.shot_outcome === "goal"),
      ).length,
      tackles: statEvents.filter((e) => e.event_kind === "tackle").length,
      interceptions: statEvents.filter((e) => e.event_kind === "interception").length,
    }),
    [statEvents],
  );

  const statPeriodData = useMemo(() => {
    if (!selectedStatSession) return [];
    return Array.from({ length: selectedStatSession.total_periods }, (_, i) => i + 1).map((p) => ({
      period: `P${p}`,
      shots: statEvents.filter((e) => e.event_kind === "shot" && e.period_number === p).length,
      shotsAgainst: statEvents.filter((e) => e.event_kind === "shot_against" && e.period_number === p).length,
      tackles: statEvents.filter((e) => e.event_kind === "tackle" && e.period_number === p).length,
      interceptions: statEvents.filter((e) => e.event_kind === "interception" && e.period_number === p).length,
    }));
  }, [statEvents, selectedStatSession]);

  const statFilteredEvents = useMemo(
    () =>
      statEvents.filter((e) => {
        if (e.event_kind === "sub") return false;
        const periodOk = statsPeriodFilter === null || e.period_number === statsPeriodFilter;
        const kindOk = statsEventKindFilter === "all" || e.event_kind === statsEventKindFilter;
        return periodOk && kindOk;
      }),
    [statEvents, statsPeriodFilter, statsEventKindFilter],
  );

  const statPlayerMinutes = useMemo((): Map<string, number> => {
    if (!statMatchPrepPlan || !selectedStatSession) return new Map();
    const periodSecs = selectedStatSession.period_length_minutes * 60;
    const matchTotalSecs = selectedStatSession.total_periods * periodSecs;
    const onSince = new Map<string, number>();
    for (const p of statMatchPrepPlan.players) {
      if (p.lineup_slot) onSince.set(p.player_id, 0);
    }
    const intervals = new Map<string, number>();
    const subEvents = statEvents
      .filter((e) => e.event_kind === "sub")
      .sort((a, b) => a.period_number - b.period_number || a.period_second - b.period_second);
    for (const sub of subEvents) {
      if (!sub.player_id || !sub.player_in_id) continue;
      const subSecs = (sub.period_number - 1) * periodSecs + sub.period_second;
      const startedAt = onSince.get(sub.player_id);
      if (startedAt !== undefined) {
        intervals.set(sub.player_id, (intervals.get(sub.player_id) ?? 0) + (subSecs - startedAt));
        onSince.delete(sub.player_id);
      }
      onSince.set(sub.player_in_id, subSecs);
    }
    for (const [playerId, startedAt] of onSince) {
      intervals.set(playerId, (intervals.get(playerId) ?? 0) + (matchTotalSecs - startedAt));
    }
    const minutes = new Map<string, number>();
    for (const [playerId, secs] of intervals) {
      minutes.set(playerId, Math.round(secs / 60));
    }
    return minutes;
  }, [statMatchPrepPlan, selectedStatSession, statEvents]);

  const statPlayerRows = useMemo(() => {
    type PlayerStatRow = {
      playerId: string;
      displayName: string;
      shirtNumber: number | null;
      shots: number;
      goals: number;
      tackles: number;
      interceptions: number;
      saves: number;
      conceded: number;
    };
    const makeRow = (playerId: string): PlayerStatRow => {
      const p = players.find((pl) => pl.id === playerId);
      return {
        playerId,
        displayName: p?.display_name ?? "Unknown",
        shirtNumber: p?.shirt_number ?? null,
        shots: 0,
        goals: 0,
        tackles: 0,
        interceptions: 0,
        saves: 0,
        conceded: 0,
      };
    };
    const map = new Map<string, PlayerStatRow>();
    for (const e of statEvents) {
      if (!e.player_id) continue;
      if (!map.has(e.player_id)) map.set(e.player_id, makeRow(e.player_id));
      const row = map.get(e.player_id)!;
      if (e.event_kind === "shot") {
        row.shots += 1;
        if (e.shot_outcome === "goal") row.goals += 1;
      } else if (e.event_kind === "shot_against") {
        if (e.shot_outcome === "save") row.saves += 1;
        else if (e.shot_outcome === "goal") row.conceded += 1;
      } else if (e.event_kind === "tackle") {
        row.tackles += 1;
      } else if (e.event_kind === "interception") {
        row.interceptions += 1;
      }
    }
    for (const playerId of statPlayerMinutes.keys()) {
      if (!map.has(playerId)) map.set(playerId, makeRow(playerId));
    }
    return [...map.values()].sort(
      (a, b) => b.shots + b.goals + b.saves + b.tackles + b.interceptions - (a.shots + a.goals + a.saves + a.tackles + a.interceptions),
    );
  }, [statEvents, players, statPlayerMinutes]);

  const statGoalDimensions = useMemo(
    () => getGoalDimensions(selectedStatSession?.format as MatchFormat | undefined),
    [selectedStatSession],
  );

  const statShotPoints = useMemo(
    () => statEvents.filter((e) => e.event_kind === "shot" && e.goal_mouth_y !== null && e.goal_mouth_z !== null),
    [statEvents],
  );
  const statOppShotPoints = useMemo(
    () =>
      statEvents.filter((e) => e.event_kind === "shot_against" && e.goal_mouth_y !== null && e.goal_mouth_z !== null),
    [statEvents],
  );

  const seasonPlayerMinutes = useMemo((): Map<string, number> => {
    const totals = new Map<string, number>();
    for (const [sessionId, plan] of seasonMatchPrepPlans) {
      const session = allCollectionSessions.find((s) => s.id === sessionId);
      if (!session) continue;
      const periodSecs = session.period_length_minutes * 60;
      const matchTotalSecs = session.total_periods * periodSecs;
      const onSince = new Map<string, number>();
      for (const p of plan.players) {
        if (p.lineup_slot) onSince.set(p.player_id, 0);
      }
      const subEvents = seasonEvents
        .filter((e) => e.session_id === sessionId && e.event_kind === "sub")
        .sort((a, b) => a.period_number - b.period_number || a.period_second - b.period_second);
      for (const sub of subEvents) {
        if (!sub.player_id || !sub.player_in_id) continue;
        const subSecs = (sub.period_number - 1) * periodSecs + sub.period_second;
        const startedAt = onSince.get(sub.player_id);
        if (startedAt !== undefined) {
          totals.set(sub.player_id, (totals.get(sub.player_id) ?? 0) + (subSecs - startedAt));
          onSince.delete(sub.player_id);
        }
        onSince.set(sub.player_in_id, subSecs);
      }
      for (const [playerId, startedAt] of onSince) {
        totals.set(playerId, (totals.get(playerId) ?? 0) + (matchTotalSecs - startedAt));
      }
    }
    const minutes = new Map<string, number>();
    for (const [playerId, secs] of totals) {
      minutes.set(playerId, Math.round(secs / 60));
    }
    return minutes;
  }, [seasonMatchPrepPlans, allCollectionSessions, seasonEvents]);

  const seasonPlayerRows = useMemo(() => {
    type SeasonPlayerRow = {
      playerId: string;
      displayName: string;
      shirtNumber: number | null;
      minutes: number;
      matches: number;
      shots: number;
      goals: number;
      tackles: number;
      interceptions: number;
      saves: number;
      conceded: number;
    };
    const makeRow = (playerId: string): SeasonPlayerRow => {
      const p = playersForSelectedTeam.find((pl) => pl.id === playerId);
      return {
        playerId,
        displayName: p?.display_name ?? "Unknown",
        shirtNumber: p?.shirt_number ?? null,
        minutes: seasonPlayerMinutes.get(playerId) ?? 0,
        matches: 0,
        shots: 0,
        goals: 0,
        tackles: 0,
        interceptions: 0,
        saves: 0,
        conceded: 0,
      };
    };
    const sessionsByPlayer = new Map<string, Set<string>>();
    const map = new Map<string, SeasonPlayerRow>();
    for (const e of seasonEvents) {
      if (!e.player_id || e.event_kind === "sub") continue;
      if (!map.has(e.player_id)) {
        map.set(e.player_id, makeRow(e.player_id));
        sessionsByPlayer.set(e.player_id, new Set());
      }
      sessionsByPlayer.get(e.player_id)!.add(e.session_id);
      const row = map.get(e.player_id)!;
      if (e.event_kind === "shot") {
        row.shots += 1;
        if (e.shot_outcome === "goal") row.goals += 1;
      } else if (e.event_kind === "shot_against") {
        if (e.shot_outcome === "save") row.saves += 1;
        else if (e.shot_outcome === "goal") row.conceded += 1;
      } else if (e.event_kind === "tackle") {
        row.tackles += 1;
      } else if (e.event_kind === "interception") {
        row.interceptions += 1;
      }
    }
    for (const [playerId, sessions] of sessionsByPlayer) {
      const row = map.get(playerId);
      if (row) row.matches = sessions.size;
    }
    for (const p of playersForSelectedTeam) {
      if (!map.has(p.id)) map.set(p.id, makeRow(p.id));
    }
    return [...map.values()].sort(
      (a, b) => b.minutes - a.minutes || b.goals + b.shots + b.saves + b.tackles + b.interceptions - (a.goals + a.shots + a.saves + a.tackles + a.interceptions),
    );
  }, [seasonEvents, playersForSelectedTeam, seasonPlayerMinutes]);

  const selectedSeasonPlayerEvents = useMemo(
    () => seasonEvents.filter((e) => e.player_id === selectedSeasonPlayerId),
    [seasonEvents, selectedSeasonPlayerId],
  );

  const selectedSeasonPlayerFilteredEvents = useMemo(
    () =>
      seasonPlayerDetailKindFilter === "all"
        ? selectedSeasonPlayerEvents
        : selectedSeasonPlayerEvents.filter((e) => e.event_kind === seasonPlayerDetailKindFilter),
    [selectedSeasonPlayerEvents, seasonPlayerDetailKindFilter],
  );

  const selectedSeasonPlayerMatchRows = useMemo(() => {
    const bySession = new Map<string, CollectionEvent[]>();
    for (const e of selectedSeasonPlayerEvents) {
      if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
      bySession.get(e.session_id)!.push(e);
    }
    return [...bySession.entries()]
      .map(([sessionId, evts]) => {
        const sess = allCollectionSessions.find((s) => s.id === sessionId);
        return {
          sessionId,
          fixtureLabel: sess?.fixture_label ?? "Unknown match",
          kickoffAt: sess?.kickoff_at ?? null,
          shots: evts.filter((e) => e.event_kind === "shot").length,
          goals: evts.filter((e) => e.event_kind === "shot" && e.shot_outcome === "goal").length,
          saves: evts.filter((e) => e.event_kind === "shot_against" && e.shot_outcome === "save").length,
          conceded: evts.filter((e) => e.event_kind === "shot_against" && e.shot_outcome === "goal").length,
          tackles: evts.filter((e) => e.event_kind === "tackle").length,
          interceptions: evts.filter((e) => e.event_kind === "interception").length,
        };
      })
      .sort((a, b) => (b.kickoffAt ?? "").localeCompare(a.kickoffAt ?? ""));
  }, [selectedSeasonPlayerEvents, allCollectionSessions]);

  const selectedSeasonPlayerShotPoints = useMemo(
    () =>
      selectedSeasonPlayerEvents.filter(
        (e) => e.event_kind === "shot" && e.goal_mouth_y !== null && e.goal_mouth_z !== null,
      ),
    [selectedSeasonPlayerEvents],
  );

  const selectedSeasonPlayerOppShotPoints = useMemo(
    () =>
      selectedSeasonPlayerEvents.filter(
        (e) => e.event_kind === "shot_against" && e.goal_mouth_y !== null && e.goal_mouth_z !== null,
      ),
    [selectedSeasonPlayerEvents],
  );

  const selectedSeasonPlayerGoalDimensions = useMemo(() => {
    if (!selectedSeasonPlayerMatchRows.length) return null;
    const sess = allCollectionSessions.find((s) => s.id === selectedSeasonPlayerMatchRows[0].sessionId);
    return getGoalDimensions(sess?.format as MatchFormat | undefined);
  }, [selectedSeasonPlayerMatchRows, allCollectionSessions]);

  const loadAllCollectionSessionsForTeam = useCallback(async (teamId: string) => {
    setIsStatsLoading(true);
    try {
      setAllCollectionSessions(await listAllCollectionSessions(teamId));
    } catch {
      setAllCollectionSessions([]);
    } finally {
      setIsStatsLoading(false);
    }
  }, []);

  const loadSeasonEvents = useCallback(async (sessions: CollectionSession[], teamId: string) => {
    if (!sessions.length || !teamId) {
      setSeasonEvents([]);
      setSeasonMatchPrepPlans(new Map());
      return;
    }
    setIsSeasonEventsLoading(true);
    try {
      const [eventResults, planResults] = await Promise.all([
        Promise.all(sessions.map((s) => listCollectionEvents(s.id, teamId))),
        Promise.all(sessions.map((s) => getMatchPrepPlan(s.match_id, teamId).catch(() => null))),
      ]);
      setSeasonEvents(eventResults.flat());
      const planMap = new Map<string, MatchPrepPlan>();
      sessions.forEach((s, i) => {
        const plan = planResults[i];
        if (plan) planMap.set(s.id, plan);
      });
      setSeasonMatchPrepPlans(planMap);
    } catch {
      setSeasonEvents([]);
      setSeasonMatchPrepPlans(new Map());
    } finally {
      setIsSeasonEventsLoading(false);
    }
  }, []);

  useEffect(() => {
    setStatsTopView("matches");
    setStatsView("list");
    setSelectedStatSessionId("");
    setStatEvents([]);
    setStatMatchPrepPlan(null);
    setSeasonEvents([]);
    setSeasonMatchPrepPlans(new Map());
    setSelectedSeasonPlayerId("");
  }, [selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId) return;
    void loadAllCollectionSessionsForTeam(selectedTeamId);
  }, [selectedTeamId, loadAllCollectionSessionsForTeam]);

  useEffect(() => {
    if (!selectedStatSessionId || !selectedTeamId) {
      setStatEvents([]);
      setStatMatchPrepPlan(null);
      return;
    }
    const session = allCollectionSessions.find((s) => s.id === selectedStatSessionId);
    setIsStatEventsLoading(true);
    void Promise.all([
      listCollectionEvents(selectedStatSessionId, selectedTeamId),
      session ? getMatchPrepPlan(session.match_id, selectedTeamId).catch(() => null) : Promise.resolve(null),
    ])
      .then(([events, plan]) => {
        setStatEvents(events);
        setStatMatchPrepPlan(plan);
      })
      .catch(() => { setStatEvents([]); setStatMatchPrepPlan(null); })
      .finally(() => setIsStatEventsLoading(false));
  }, [selectedStatSessionId, selectedTeamId, allCollectionSessions]);

  useEffect(() => {
    if (statsTopView !== "season" || !selectedTeamId || !allCollectionSessions.length) return;
    void loadSeasonEvents(allCollectionSessions, selectedTeamId);
  }, [statsTopView, allCollectionSessions, selectedTeamId, loadSeasonEvents]);

  return (
    <section className="section-card">
      {!selectedTeamId ? (
        <p className="muted">Select a team to view match stats.</p>
      ) : (
        <>
          <div className="admin-subnav" style={{ marginBottom: "1rem" }}>
            <button
              type="button"
              className={`admin-subnav-item ${statsTopView === "matches" ? "active" : ""}`}
              onClick={() => {
                setStatsTopView("matches");
                setStatsView("list");
              }}
            >
              Matches
            </button>
            <button
              type="button"
              className={`admin-subnav-item ${statsTopView === "season" ? "active" : ""}`}
              onClick={() => setStatsTopView("season")}
            >
              Season
            </button>
          </div>

          {statsTopView === "matches" ? (
            statsView === "list" ? (
              <div className="stack-form">
                {isStatsLoading ? <p className="muted">Loading sessions…</p> : null}
                {!isStatsLoading && allCollectionSessions.length === 0 ? (
                  <p className="muted">No collection sessions recorded for this team.</p>
                ) : null}
                {allCollectionSessions.map((session) => (
                  <div
                    key={session.id}
                    className="list-row stats-session-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedStatSessionId(session.id);
                      setStatsView("detail");
                      setStatsPeriodFilter(null);
                      setStatsEventKindFilter("all");
                      setStatsGoalMouthToggle("our");
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        setSelectedStatSessionId(session.id);
                        setStatsView("detail");
                        setStatsPeriodFilter(null);
                        setStatsEventKindFilter("all");
                        setStatsGoalMouthToggle("our");
                      }
                    }}
                  >
                    <div>
                      <strong>{session.fixture_label}</strong>
                      {session.kickoff_at ? (
                        <span className="muted">
                          {" · "}
                          {new Date(session.kickoff_at).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      ) : null}
                      <span className="muted"> · {fixtureFormatIcon(session.format)}</span>
                    </div>
                    <span className={`fixture-chip ${session.state === "live" ? "scheduled" : "final"}`}>
                      {session.state === "live" ? "Live" : "Final"}
                    </span>
                  </div>
                ))}
              </div>
            ) : selectedStatSession ? (
              <div className="stats-detail-panels">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setStatsView("list")}
                >
                  ← Back to matches
                </button>

                <div className="section-card stats-score-header">
                  <h3>{selectedStatSession.fixture_label}</h3>
                  <div className="stats-score-row">
                    <span className="stats-score-number">{statMatchSummary.goalsFor}</span>
                    <span className="stats-score-sep">–</span>
                    <span className="stats-score-number">{statMatchSummary.goalsAgainst}</span>
                  </div>
                  <p className="muted">
                    {selectedStatSession.kickoff_at
                      ? new Date(selectedStatSession.kickoff_at).toLocaleDateString(undefined, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Date unknown"}
                    {" · "}
                    {fixtureFormatIcon(selectedStatSession.format)}
                    {" · "}
                    {selectedStatSession.total_periods === 4
                      ? "Quarters"
                      : selectedStatSession.total_periods === 2
                        ? "Halves"
                        : "Non-stop"}
                  </p>
                </div>

                {isStatEventsLoading ? <p className="muted">Loading match events…</p> : null}

                {!isStatEventsLoading ? (
                  <>
                    <div className="section-card">
                      <h3>Shot Map</h3>
                      <div className="stats-filter-bar">
                        <span className="muted">Period:</span>
                        <button
                          type="button"
                          className={`button ${statsPeriodFilter === null ? "primary" : "secondary"}`}
                          onClick={() => setStatsPeriodFilter(null)}
                        >
                          All
                        </button>
                        {Array.from({ length: selectedStatSession.total_periods }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            type="button"
                            className={`button ${statsPeriodFilter === p ? "primary" : "secondary"}`}
                            onClick={() => setStatsPeriodFilter(p)}
                          >
                            P{p}
                          </button>
                        ))}
                        <span className="muted" style={{ marginLeft: "0.5rem" }}>Type:</span>
                        {(["all", "shot", "shot_against", "tackle", "interception"] as const).map((kind) => (
                          <button
                            key={kind}
                            type="button"
                            className={`button ${statsEventKindFilter === kind ? "primary" : "secondary"}`}
                            onClick={() => setStatsEventKindFilter(kind)}
                          >
                            {kind === "all"
                              ? "All"
                              : kind === "shot_against"
                                ? "Opp. Shot"
                                : kind[0].toUpperCase() + kind.slice(1)}
                          </button>
                        ))}
                      </div>
                      <div className="stats-pitch-wrap">
                        <PitchDiagram format={selectedStatSession.format}>
                          {statFilteredEvents.map((ev) => (
                            <span
                              key={ev.id}
                              className={`collection-event-marker ${ev.event_kind}`}
                              style={{
                                left: `${100 - (ev.y_pct ?? 0)}%`,
                                top: `${100 - (ev.x_pct ?? 0)}%`,
                              }}
                              title={`${ev.event_kind} · ${ev.shot_outcome ?? "recorded"} · P${ev.period_number} ${formatClock(ev.period_second)}`}
                            />
                          ))}
                        </PitchDiagram>
                      </div>
                      <div className="stats-map-legend">
                        <span className="stats-map-legend-item">
                          <span className="collection-event-marker shot stats-map-legend-dot" />Shot
                        </span>
                        <span className="stats-map-legend-item">
                          <span className="collection-event-marker shot_against stats-map-legend-dot" />Opp. Shot
                        </span>
                        <span className="stats-map-legend-item">
                          <span className="collection-event-marker tackle stats-map-legend-dot" />Tackle
                        </span>
                        <span className="stats-map-legend-item">
                          <span className="collection-event-marker interception stats-map-legend-dot" />Interception
                        </span>
                      </div>
                    </div>

                    {statShotPoints.length > 0 || statOppShotPoints.length > 0 ? (
                      <div className="section-card">
                        <h3>Goal Mouth</h3>
                        <div className="stats-filter-bar">
                          <button
                            type="button"
                            className={`button ${statsGoalMouthToggle === "our" ? "primary" : "secondary"}`}
                            onClick={() => setStatsGoalMouthToggle("our")}
                          >
                            Our Shots ({statShotPoints.length})
                          </button>
                          <button
                            type="button"
                            className={`button ${statsGoalMouthToggle === "against" ? "primary" : "secondary"}`}
                            onClick={() => setStatsGoalMouthToggle("against")}
                          >
                            Opposition Shots ({statOppShotPoints.length})
                          </button>
                        </div>
                        <div className="stats-goalmouths-wrap">
                          <GoalMouthDiagram
                            disabled={true}
                            value={null}
                            onChange={() => {}}
                            goalWidthFt={statGoalDimensions?.width_ft}
                            pitchWidthM={statGoalDimensions?.pitch_width_m}
                            goalHeightFt={statGoalDimensions?.height_ft}
                            viewPaddingTopFt={6}
                            viewPaddingBottomFt={1.5}
                          />
                          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                            {(statsGoalMouthToggle === "our" ? statShotPoints : statOppShotPoints).map((ev) => {
                              const view = buildGoalViewWindow(
                                statGoalDimensions?.width_ft ?? 24,
                                statGoalDimensions?.pitch_width_m ?? 64,
                                statGoalDimensions?.height_ft ?? 8,
                                6,
                                1.5,
                              );
                              const markerStyle = toMarkerStyle(
                                { y: ev.goal_mouth_y!, z: ev.goal_mouth_z! },
                                view,
                                FRAME.top + FRAME.height,
                              );
                              return (
                                <span
                                  key={ev.id}
                                  className={`stats-goalmouths-marker ${ev.shot_outcome ?? "miss"}`}
                                  style={markerStyle}
                                  title={`${ev.shot_outcome ?? "miss"} · P${ev.period_number} ${formatClock(ev.period_second)}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                        <div className="stats-map-legend" style={{ marginTop: "0.5rem" }}>
                          <span className="stats-map-legend-item">
                            <span className="stats-goalmouths-marker goal stats-map-legend-dot" />Goal
                          </span>
                          <span className="stats-map-legend-item">
                            <span className="stats-goalmouths-marker save stats-map-legend-dot" />Save
                          </span>
                          <span className="stats-map-legend-item">
                            <span className="stats-goalmouths-marker post stats-map-legend-dot" />Post
                          </span>
                          <span className="stats-map-legend-item">
                            <span className="stats-goalmouths-marker miss stats-map-legend-dot" />Miss
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <div className="section-card">
                      <div className="stats-grid">
                        <article>
                          <h3>Shots For</h3>
                          <p>{statMatchSummary.shotsFor}</p>
                        </article>
                        <article>
                          <h3>Shots Against</h3>
                          <p>{statMatchSummary.shotsAgainst}</p>
                        </article>
                        <article>
                          <h3>On Target</h3>
                          <p>{statMatchSummary.shotsOnTarget}</p>
                        </article>
                        <article>
                          <h3>Tackles</h3>
                          <p>{statMatchSummary.tackles}</p>
                        </article>
                        <article>
                          <h3>Interceptions</h3>
                          <p>{statMatchSummary.interceptions}</p>
                        </article>
                      </div>
                    </div>

                    {statPeriodData.length > 1 ? (
                      <div className="section-card">
                        <h3>Period Breakdown</h3>
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={statPeriodData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2b4257" />
                            <XAxis dataKey="period" tick={{ fill: "#9ab0c4", fontSize: 11 }} />
                            <YAxis tick={{ fill: "#9ab0c4", fontSize: 11 }} allowDecimals={false} />
                            <Tooltip
                              contentStyle={{
                                background: "#131d27",
                                border: "1px solid #2b4257",
                                borderRadius: "0.5rem",
                                color: "#e7edf2",
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: "0.75rem", color: "#9ab0c4" }} />
                            <Bar dataKey="shots" name="Shots For" fill="#f45050" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="shotsAgainst" name="Shots Against" fill="#ff8c00" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="tackles" name="Tackles" fill="#50acf4" radius={[3, 3, 0, 0]} />
                            <Bar dataKey="interceptions" name="Interceptions" fill="#ffcc5c" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : null}

                    {statPlayerRows.length > 0 ? (
                      <div className="section-card">
                        <h3>Player Breakdown</h3>
                        <table className="stats-player-table">
                          <thead>
                            <tr>
                              <th>Player</th>
                              {statPlayerMinutes.size > 0 ? <th>Min.</th> : null}
                              <th>Shots</th>
                              <th>Goals</th>
                              <th>Saves</th>
                              <th>Conceded</th>
                              <th>Tackles</th>
                              <th>Int.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statPlayerRows.map((row) => (
                              <tr key={row.playerId}>
                                <td>
                                  {row.shirtNumber ? <span className="muted">#{row.shirtNumber} </span> : null}
                                  {row.displayName}
                                </td>
                                {statPlayerMinutes.size > 0 ? (
                                  <td className="muted">
                                    {statPlayerMinutes.has(row.playerId)
                                      ? statPlayerMinutes.get(row.playerId)
                                      : "–"}
                                  </td>
                                ) : null}
                                <td>{row.shots}</td>
                                <td>
                                  {row.goals > 0 ? (
                                    <strong style={{ color: "var(--tl-accent)" }}>{row.goals}</strong>
                                  ) : (
                                    0
                                  )}
                                </td>
                                <td>
                                  {row.saves > 0 ? (
                                    <strong style={{ color: "#50acf4" }}>{row.saves}</strong>
                                  ) : (
                                    row.saves
                                  )}
                                </td>
                                <td>
                                  {row.conceded > 0 ? (
                                    <strong style={{ color: "#ff8c00" }}>{row.conceded}</strong>
                                  ) : (
                                    row.conceded
                                  )}
                                </td>
                                <td>{row.tackles}</td>
                                <td>{row.interceptions}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null
          ) : null}

          {statsTopView === "season" ? (
            <div className="stack-form">
              {isSeasonEventsLoading ? <p className="muted">Loading season data…</p> : null}
              {!isSeasonEventsLoading && allCollectionSessions.length === 0 ? (
                <p className="muted">No collection sessions recorded for this team.</p>
              ) : null}
              {!isSeasonEventsLoading && allCollectionSessions.length > 0 ? (
                selectedSeasonPlayerId ? (
                  <>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => setSelectedSeasonPlayerId("")}
                    >
                      ← Season Overview
                    </button>
                    {(() => {
                      const row = seasonPlayerRows.find((r) => r.playerId === selectedSeasonPlayerId);
                      const p = players.find((pl) => pl.id === selectedSeasonPlayerId);
                      return (
                        <>
                          <div className="section-card">
                            <div style={{ marginBottom: "1rem" }}>
                              <h2 style={{ margin: 0 }}>
                                {p?.shirt_number ? (
                                  <span className="muted" style={{ fontSize: "1rem" }}>
                                    #{p.shirt_number}{" "}
                                  </span>
                                ) : null}
                                {p?.display_name ?? "Player"}
                              </h2>
                              <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                                Season profile · {row?.matches ?? 0}{" "}
                                {(row?.matches ?? 0) === 1 ? "match" : "matches"}
                              </p>
                            </div>
                            {row ? (
                              <div className="stats-grid">
                                <article>
                                  <h3>Shots</h3>
                                  <p>{row.shots}</p>
                                </article>
                                <article>
                                  <h3>Goals</h3>
                                  <p style={row.goals > 0 ? { color: "var(--tl-accent)" } : {}}>
                                    {row.goals}
                                  </p>
                                </article>
                                {row.saves > 0 || row.conceded > 0 ? (
                                  <>
                                    <article>
                                      <h3>Saves</h3>
                                      <p style={row.saves > 0 ? { color: "#50acf4" } : {}}>
                                        {row.saves}
                                      </p>
                                    </article>
                                    <article>
                                      <h3>Conceded</h3>
                                      <p style={row.conceded > 0 ? { color: "#ff8c00" } : {}}>
                                        {row.conceded}
                                      </p>
                                    </article>
                                  </>
                                ) : null}
                                <article>
                                  <h3>Tackles</h3>
                                  <p>{row.tackles}</p>
                                </article>
                                <article>
                                  <h3>Interceptions</h3>
                                  <p>{row.interceptions}</p>
                                </article>
                              </div>
                            ) : null}
                          </div>

                          <div className="section-card">
                            <h3>Action Map</h3>
                            <div className="stats-filter-bar" style={{ marginBottom: "0.5rem" }}>
                              {(
                                [
                                  "all",
                                  "shot",
                                  "shot_against",
                                  "tackle",
                                  "interception",
                                ] as const
                              ).map((kind) => (
                                <button
                                  key={kind}
                                  type="button"
                                  className={`button ${seasonPlayerDetailKindFilter === kind ? "primary" : "secondary"}`}
                                  onClick={() => setSeasonPlayerDetailKindFilter(kind)}
                                >
                                  {kind === "all"
                                    ? "All"
                                    : kind === "shot"
                                      ? "Shots"
                                      : kind === "shot_against"
                                        ? "Opp. Shots"
                                        : kind === "tackle"
                                          ? "Tackles"
                                          : "Interceptions"}
                                </button>
                              ))}
                            </div>
                            <div className="stats-pitch-wrap">
                              <PitchDiagram format={allCollectionSessions[0]?.format}>
                                {selectedSeasonPlayerFilteredEvents.map((ev) => (
                                  <span
                                    key={ev.id}
                                    className={`collection-event-marker ${ev.event_kind}`}
                                    style={{
                                      left: `${100 - (ev.y_pct ?? 0)}%`,
                                      top: `${100 - (ev.x_pct ?? 0)}%`,
                                    }}
                                    title={ev.event_kind}
                                  />
                                ))}
                              </PitchDiagram>
                            </div>
                            <div className="stats-map-legend">
                              <span className="stats-map-legend-item">
                                <span className="collection-event-marker shot stats-map-legend-dot" />
                                Shot
                              </span>
                              <span className="stats-map-legend-item">
                                <span className="collection-event-marker shot_against stats-map-legend-dot" />
                                Opp. Shot
                              </span>
                              <span className="stats-map-legend-item">
                                <span className="collection-event-marker tackle stats-map-legend-dot" />
                                Tackle
                              </span>
                              <span className="stats-map-legend-item">
                                <span className="collection-event-marker interception stats-map-legend-dot" />
                                Interception
                              </span>
                            </div>
                          </div>

                          {selectedSeasonPlayerShotPoints.length > 0 ||
                          selectedSeasonPlayerOppShotPoints.length > 0 ? (
                            <div className="section-card">
                              <h3>Goal Mouth</h3>
                              <div className="stats-filter-bar" style={{ marginBottom: "0.75rem" }}>
                                <button
                                  type="button"
                                  className={`button ${seasonPlayerGoalMouthToggle === "our" ? "primary" : "secondary"}`}
                                  onClick={() => setSeasonPlayerGoalMouthToggle("our")}
                                >
                                  Shots Taken ({selectedSeasonPlayerShotPoints.length})
                                </button>
                                <button
                                  type="button"
                                  className={`button ${seasonPlayerGoalMouthToggle === "against" ? "primary" : "secondary"}`}
                                  onClick={() => setSeasonPlayerGoalMouthToggle("against")}
                                >
                                  Shots Faced ({selectedSeasonPlayerOppShotPoints.length})
                                </button>
                              </div>
                              <div className="stats-goalmouths-wrap">
                                <GoalMouthDiagram
                                  value={null}
                                  onChange={() => {}}
                                  disabled={true}
                                  goalWidthFt={selectedSeasonPlayerGoalDimensions?.width_ft}
                                  pitchWidthM={selectedSeasonPlayerGoalDimensions?.pitch_width_m}
                                  goalHeightFt={selectedSeasonPlayerGoalDimensions?.height_ft}
                                />
                                <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                                  {(seasonPlayerGoalMouthToggle === "our"
                                    ? selectedSeasonPlayerShotPoints
                                    : selectedSeasonPlayerOppShotPoints
                                  ).map((e) => {
                                    const view = buildGoalViewWindow(
                                      selectedSeasonPlayerGoalDimensions?.width_ft ?? 24,
                                      selectedSeasonPlayerGoalDimensions?.pitch_width_m ?? 64,
                                      selectedSeasonPlayerGoalDimensions?.height_ft ?? 8,
                                      6,
                                      2,
                                    );
                                    const markerStyle = toMarkerStyle(
                                      { y: e.goal_mouth_y!, z: e.goal_mouth_z! },
                                      view,
                                      90,
                                    );
                                    return (
                                      <span
                                        key={e.id}
                                        className={`stats-goalmouths-marker ${e.shot_outcome ?? "miss"}`}
                                        style={markerStyle}
                                        title={e.shot_outcome ?? "miss"}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="stats-map-legend" style={{ marginTop: "0.5rem" }}>
                                <span className="stats-map-legend-item">
                                  <span
                                    className="stats-goalmouths-marker goal"
                                    style={{ position: "relative", display: "inline-block" }}
                                  />
                                  Goal
                                </span>
                                <span className="stats-map-legend-item">
                                  <span
                                    className="stats-goalmouths-marker save"
                                    style={{ position: "relative", display: "inline-block" }}
                                  />
                                  Save
                                </span>
                                <span className="stats-map-legend-item">
                                  <span
                                    className="stats-goalmouths-marker miss"
                                    style={{ position: "relative", display: "inline-block" }}
                                  />
                                  Miss
                                </span>
                                <span className="stats-map-legend-item">
                                  <span
                                    className="stats-goalmouths-marker post"
                                    style={{ position: "relative", display: "inline-block" }}
                                  />
                                  Post
                                </span>
                              </div>
                            </div>
                          ) : null}

                          {selectedSeasonPlayerMatchRows.length > 0 ? (
                            <div className="section-card">
                              <h3>Match by Match</h3>
                              <table className="stats-player-table">
                                <thead>
                                  <tr>
                                    <th>Match</th>
                                    <th>Shots</th>
                                    <th>Goals</th>
                                    <th>Saves</th>
                                    <th>Conceded</th>
                                    <th>Tackles</th>
                                    <th>Int.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedSeasonPlayerMatchRows.map((mr) => (
                                    <tr key={mr.sessionId}>
                                      <td>{mr.fixtureLabel}</td>
                                      <td>{mr.shots}</td>
                                      <td>
                                        {mr.goals > 0 ? (
                                          <strong style={{ color: "var(--tl-accent)" }}>
                                            {mr.goals}
                                          </strong>
                                        ) : (
                                          0
                                        )}
                                      </td>
                                      <td>
                                        {mr.saves > 0 ? (
                                          <strong style={{ color: "#50acf4" }}>{mr.saves}</strong>
                                        ) : (
                                          mr.saves
                                        )}
                                      </td>
                                      <td>
                                        {mr.conceded > 0 ? (
                                          <strong style={{ color: "#ff8c00" }}>{mr.conceded}</strong>
                                        ) : (
                                          mr.conceded
                                        )}
                                      </td>
                                      <td>{mr.tackles}</td>
                                      <td>{mr.interceptions}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div className="section-card">
                      <div className="stats-grid">
                        <article>
                          <h3>Matches</h3>
                          <p>{allCollectionSessions.length}</p>
                        </article>
                        <article>
                          <h3>Goals For</h3>
                          <p>
                            {
                              seasonEvents.filter(
                                (e) => e.event_kind === "shot" && e.shot_outcome === "goal",
                              ).length
                            }
                          </p>
                        </article>
                        <article>
                          <h3>Goals Against</h3>
                          <p>
                            {
                              seasonEvents.filter(
                                (e) =>
                                  e.event_kind === "shot_against" && e.shot_outcome === "goal",
                              ).length
                            }
                          </p>
                        </article>
                        <article>
                          <h3>Total Shots</h3>
                          <p>
                            {seasonEvents.filter((e) => e.event_kind === "shot").length}
                          </p>
                        </article>
                        <article>
                          <h3>Tackles</h3>
                          <p>
                            {seasonEvents.filter((e) => e.event_kind === "tackle").length}
                          </p>
                        </article>
                      </div>
                    </div>

                    {seasonPlayerRows.length > 0 ? (
                      <div className="section-card">
                        <h3>Player Stats</h3>
                        <p
                          className="muted"
                          style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}
                        >
                          Tap a player to view their detailed season profile.
                        </p>
                        <table className="stats-player-table">
                          <thead>
                            <tr>
                              <th>Player</th>
                              <th>Min.</th>
                              <th>Games</th>
                              <th>Shots</th>
                              <th>Goals</th>
                              <th>Saves</th>
                              <th>Conceded</th>
                              <th>Tackles</th>
                              <th>Int.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {seasonPlayerRows.map((row) => (
                              <tr
                                key={row.playerId}
                                className="stats-session-row"
                                onClick={() => {
                                  setSelectedSeasonPlayerId(row.playerId);
                                  setSeasonPlayerDetailKindFilter("all");
                                  setSeasonPlayerGoalMouthToggle("our");
                                }}
                              >
                                <td>
                                  {row.shirtNumber ? (
                                    <span className="muted">#{row.shirtNumber} </span>
                                  ) : null}
                                  {row.displayName}
                                </td>
                                <td>{row.minutes > 0 ? row.minutes : "–"}</td>
                                <td>{row.matches}</td>
                                <td>{row.shots}</td>
                                <td>
                                  {row.goals > 0 ? (
                                    <strong style={{ color: "var(--tl-accent)" }}>
                                      {row.goals}
                                    </strong>
                                  ) : (
                                    0
                                  )}
                                </td>
                                <td>
                                  {row.saves > 0 ? (
                                    <strong style={{ color: "#50acf4" }}>{row.saves}</strong>
                                  ) : (
                                    row.saves
                                  )}
                                </td>
                                <td>
                                  {row.conceded > 0 ? (
                                    <strong style={{ color: "#ff8c00" }}>{row.conceded}</strong>
                                  ) : (
                                    row.conceded
                                  )}
                                </td>
                                <td>{row.tackles}</td>
                                <td>{row.interceptions}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="muted">No players in this team yet.</p>
                    )}
                  </>
                )
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

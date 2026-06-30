import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

import "./index.css";
import { GoalMouthDiagram, buildGoalViewWindow, toMarkerStyle, FRAME } from "./components/GoalMouthDiagram";
import { PitchDiagram } from "./components/PitchDiagram";
import { SearchableSelect } from "./components/SearchableSelect";
import { SettingsView } from "./views/SettingsView";
import { PlayersView } from "./views/PlayersView";
import { MembersView } from "./views/MembersView";
import { AdminView } from "./views/AdminView";
import { CollectionView } from "./views/CollectionView";
import { FixturesView } from "./views/FixturesView";
import { MatchPrepView } from "./views/MatchPrepView";
import { getGoalDimensions, getGoalWidthSpanPct } from "./domain/goalDimensions";
import { getFormationSlots } from "./domain/formations";
import type { FormationSlot } from "./domain/formations";
import {
  type AuthMode,
  type Section,
  BASE_NAV_ITEMS,
  ADMIN_NAV_ITEM,
} from "./constants";
import {
  isTeamAdminRole,
  toLocalDateKey,
  formatClock,
  buildCollectionSessionWsUrl,
  parsePlayerPositionCodes,
} from "./utils/formatters";
import {
  createTeam,
  deleteTeam,
  getAdminOverview,
  getAdminAuditLogs,
  getCollectionSession,
  getMatchPrepPlan,
  getMatchPrepPlanValidation,
  getMe,
  listActiveCollectionSessions,
  listAllCollectionSessions,
  listCollectionEvents,
  listFixtures,
  listMatchPrepFixtures,
  listPlayers,
  listTeamDirectory,
  listTeamMembers,
  listTeams,
  login,
  logout,
  resolveApiAssetUrl,
  register,
  startCollectionSession,
  uploadClubLogo,
} from "./api";
import type {
  AdminAuditLogEntry,
  AdminOverview,
  Fixture,
  MatchFormat,
  CollectionEvent,
  CollectionSession,
  MatchPrepFixture,
  MatchPrepPlan,
  MatchPrepPlanValidation,
  Player,
  Team,
  TeamDirectory,
  TeamMember,
  TeamRole,
  User,
} from "./types/auth";


function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [section, setSection] = useState<Section>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamDirectory, setTeamDirectory] = useState<TeamDirectory[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [matchPrepFixtures, setMatchPrepFixtures] = useState<MatchPrepFixture[]>([]);
  const [activeCollectionSessions, setActiveCollectionSessions] = useState<CollectionSession[]>([]);
  const [selectedCollectionSessionId, setSelectedCollectionSessionId] = useState("");
  const [collectionSessionLive, setCollectionSessionLive] = useState<CollectionSession | null>(null);
  const [collectionSessionSocketState, setCollectionSessionSocketState] = useState<"idle" | "connecting" | "live">(
    "idle",
  );
  const [selectedCollectionFixtureId, setSelectedCollectionFixtureId] = useState("");
  const [nextMatchPlanValidation, setNextMatchPlanValidation] = useState<MatchPrepPlanValidation | null>(null);
  const [isNextMatchPlanValidationLoading, setIsNextMatchPlanValidationLoading] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogEntry[]>([]);
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

  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedFixtureForMatchPrep, setSelectedFixtureForMatchPrep] = useState("");


  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const collectionSessionWsRef = useRef<WebSocket | null>(null);

  const navItems = useMemo(
    () => (isSuperAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS),
    [isSuperAdmin],
  );

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );
  const selectedTeamName = selectedTeam?.display_name ?? "";
  const selectedTeamClubLogoUrl = useMemo(
    () => resolveApiAssetUrl(selectedTeam?.club_logo_url),
    [selectedTeam],
  );
  const startableCollectionFixtures = useMemo(() => {
    if (!selectedTeamId) {
      return [] as Fixture[];
    }
    return fixtures.filter(
      (fixture) =>
        (fixture.home_team_id === selectedTeamId || fixture.away_team_id === selectedTeamId) &&
        fixture.status.toLowerCase() !== "cancelled",
    );
  }, [fixtures, selectedTeamId]);
  const selectedCollectionSession = useMemo(() => {
    if (!selectedCollectionSessionId) {
      return activeCollectionSessions[0] ?? null;
    }
    return activeCollectionSessions.find((sessionRow) => sessionRow.id === selectedCollectionSessionId) ?? null;
  }, [activeCollectionSessions, selectedCollectionSessionId]);
  const isActiveMatchSession =
    section === "collection" && !!collectionSessionLive && collectionSessionLive.state === "live";

  const playersForSelectedTeam = useMemo(() => {
    if (!selectedTeamId) {
      return players;
    }
    return players.filter((player) => player.team_id === selectedTeamId);
  }, [players, selectedTeamId]);
  const dashboardStats = useMemo(
    () => ({ teams: teams.length, fixtures: fixtures.length, players: players.length, members: teamMembers.length }),
    [fixtures.length, players.length, teamMembers.length, teams.length],
  );
  const nextMatchTile = useMemo(() => {
    const now = Date.now();
    const upcoming = fixtures
      .filter((fixture) => fixture.status.toLowerCase() !== "cancelled")
      .map((fixture) => {
        const kickoff = fixture.kickoff_at ? new Date(fixture.kickoff_at) : null;
        return { fixture, kickoff };
      })
      .filter(({ kickoff }) => kickoff && kickoff.getTime() >= now)
      .sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

    const next = upcoming[0];
    if (!next || !next.kickoff) {
      return {
        title: "No upcoming fixtures",
        subtitle: "Schedule a fixture to see it here.",
        fixtureId: "",
      };
    }

    const fixture = next.fixture;
    const selectedTeamIsHome = selectedTeamId ? fixture.home_team_id === selectedTeamId : true;
    const opponent = selectedTeamIsHome
      ? `${fixture.away_club_name} ${fixture.away_team_name}`
      : `${fixture.home_club_name} ${fixture.home_team_name}`;
    return {
      title: opponent,
      subtitle: next.kickoff.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      fixtureId: fixture.id,
    };
  }, [fixtures, selectedTeamId]);
  const roleByTeamId = useMemo(() => {
    const mapping: Partial<Record<string, TeamRole>> = {};
    for (const team of teams) {
      mapping[team.id] = team.my_role;
    }
    return mapping;
  }, [teams]);
  const selectedTeamCanManage = useMemo(
    () =>
      Boolean(
        selectedTeamId &&
          (!roleByTeamId[selectedTeamId] ||
            isTeamAdminRole(roleByTeamId[selectedTeamId])),
      ),
    [roleByTeamId, selectedTeamId],
  );
  const ownedTeams = useMemo(
    () => teams.filter((team) => team.my_role && isTeamAdminRole(team.my_role)),
    [teams],
  );
  const fixtureOppositionOptions = useMemo(
    () => teamDirectory.filter((team) => team.id !== selectedTeamId),
    [selectedTeamId, teamDirectory],
  );
  const clubNameOptions = useMemo(() => {
    const teamDirectoryClubNames = teamDirectory.map((team) => team.club_name.trim()).filter(Boolean);
    const adminClubNames = adminOverview?.clubs.map((club) => club.name.trim()).filter(Boolean) ?? [];
    const uniqueClubNames = Array.from(new Set([...teamDirectoryClubNames, ...adminClubNames]));
    return uniqueClubNames.sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }));
  }, [adminOverview, teamDirectory]);
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

  const loadWorkspaceData = useCallback(async (preferredTeamId = "") => {
    setIsWorkspaceLoading(true);
    try {
      const [teamsResponse, playersResponse, teamDirectoryResponse] = await Promise.all([
        listTeams(),
        listPlayers(),
        listTeamDirectory(),
      ]);
      const nextTeamId = teamsResponse.some((team) => team.id === preferredTeamId)
        ? preferredTeamId
        : teamsResponse[0]?.id || "";
      const fixturesResponse = nextTeamId ? await listFixtures(nextTeamId) : [];
      setTeams(teamsResponse);
      setTeamDirectory(teamDirectoryResponse);
      setFixtures(fixturesResponse);
      setPlayers(playersResponse);
      setSelectedTeamId(nextTeamId);
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, []);

  const loadFixturesForTeam = useCallback(async (teamId: string) => {
    if (!teamId) {
      setFixtures([]);
      return;
    }
    setIsWorkspaceLoading(true);
    try {
      const fixturesResponse = await listFixtures(teamId);
      setFixtures(fixturesResponse);
    } finally {
      setIsWorkspaceLoading(false);
    }
  }, []);

  const loadTeamMembers = useCallback(async (teamId: string) => {
    if (!teamId) {
      setTeamMembers([]);
      setMembersLoadError(null);
      return;
    }

    setIsMembersLoading(true);
    setMembersLoadError(null);
    try {
      const members = await listTeamMembers(teamId);
      setTeamMembers(members);
    } catch (requestError) {
      setTeamMembers([]);
      if (requestError instanceof Error) {
        setMembersLoadError(requestError.message);
      } else {
        setMembersLoadError("Unable to load team members");
      }
    } finally {
      setIsMembersLoading(false);
    }
  }, []);

  const loadMatchPrepFixtures = useCallback(async (teamId: string) => {
    if (!teamId) {
      setMatchPrepFixtures([]);
      setSelectedFixtureForMatchPrep("");
      return;
    }
    const rows = await listMatchPrepFixtures(teamId);
    setMatchPrepFixtures(rows);
    setSelectedFixtureForMatchPrep((current) =>
      rows.some((fixture) => fixture.id === current) ? current : rows[0]?.id || "",
    );
  }, []);

  const loadActiveCollectionSessions = useCallback(async (teamId: string) => {
    if (!teamId) {
      setActiveCollectionSessions([]);
      setSelectedCollectionSessionId("");
      setCollectionSessionLive(null);
      return;
    }
    const rows = await listActiveCollectionSessions(teamId);
    setActiveCollectionSessions(rows);
    setSelectedCollectionSessionId((current) =>
      rows.some((item) => item.id === current) ? current : rows[0]?.id || "",
    );
  }, []);

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

  const loadAdminData = useCallback(async () => {
    setIsAdminLoading(true);
    try {
      const [overview, auditLogs] = await Promise.all([getAdminOverview(), getAdminAuditLogs(150)]);
      setAdminOverview(overview);
      setAdminAuditLogs(auditLogs);
      setIsSuperAdmin(true);
      setAdminAssignTeamId((current) => current || overview.teams[0]?.id || "");
      setAdminCreateTeamClubId((current) => current || overview.clubs[0]?.id || "");
    } catch {
      setAdminOverview(null);
      setAdminAuditLogs([]);
      setIsSuperAdmin(false);
      if (section === "admin") {
        setSection("dashboard");
      }
    } finally {
      setIsAdminLoading(false);
    }
  }, [section]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const me = await getMe();
        setUser(me);
        await loadWorkspaceData();
        await loadAdminData();
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [loadAdminData, loadWorkspaceData]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (section !== "members") {
      return;
    }
    if (!selectedTeamCanManage) {
      setTeamMembers([]);
      setMembersLoadError(
        selectedTeamId ? "Admin access required to manage members for this team." : null,
      );
      return;
    }
    void loadTeamMembers(selectedTeamId);
  }, [loadTeamMembers, section, selectedTeamCanManage, selectedTeamId, user]);

  useEffect(() => {
    if (!user || section !== "match_prep") {
      return;
    }
    if (!selectedTeamCanManage) {
      setMatchPrepFixtures([]);
      setSelectedFixtureForMatchPrep("");
      return;
    }
    void loadMatchPrepFixtures(selectedTeamId);
  }, [loadMatchPrepFixtures, section, selectedTeamCanManage, selectedTeamId, user]);

  useEffect(() => {
    if (!user || !selectedTeamId) {
      return;
    }
    void loadFixturesForTeam(selectedTeamId);
  }, [loadFixturesForTeam, selectedTeamId, user]);

  useEffect(() => {
    if (!user || !selectedTeamId) {
      setActiveCollectionSessions([]);
      setSelectedCollectionSessionId("");
      setCollectionSessionLive(null);
      return;
    }
    void loadActiveCollectionSessions(selectedTeamId);
    const interval = window.setInterval(() => {
      void loadActiveCollectionSessions(selectedTeamId);
    }, 15000);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadActiveCollectionSessions, selectedTeamId, user]);

  useEffect(() => {
    if (!user || section !== "stats" || !selectedTeamId) return;
    void loadAllCollectionSessionsForTeam(selectedTeamId);
  }, [loadAllCollectionSessionsForTeam, section, selectedTeamId, user]);

  useEffect(() => {
    if (!user || section !== "stats" || !selectedStatSessionId || !selectedTeamId) {
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
  }, [section, selectedStatSessionId, selectedTeamId, user, allCollectionSessions]);

  useEffect(() => {
    if (!user || section !== "stats" || statsTopView !== "season" || !selectedTeamId || !allCollectionSessions.length) {
      return;
    }
    void loadSeasonEvents(allCollectionSessions, selectedTeamId);
  }, [loadSeasonEvents, section, statsTopView, allCollectionSessions, selectedTeamId, user]);

  useEffect(() => {
    if (!startableCollectionFixtures.length) {
      setSelectedCollectionFixtureId("");
      return;
    }
    setSelectedCollectionFixtureId((current) =>
      startableCollectionFixtures.some((fixture) => fixture.id === current)
        ? current
        : startableCollectionFixtures[0].id,
    );
  }, [startableCollectionFixtures]);

  useEffect(() => {
    if (!user || !selectedTeamId || !nextMatchTile.fixtureId || !selectedTeamCanManage) {
      setNextMatchPlanValidation(null);
      setIsNextMatchPlanValidationLoading(false);
      return;
    }

    let cancelled = false;
    setIsNextMatchPlanValidationLoading(true);
    void getMatchPrepPlanValidation(nextMatchTile.fixtureId, selectedTeamId)
      .then((result) => {
        if (!cancelled) {
          setNextMatchPlanValidation(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNextMatchPlanValidation(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsNextMatchPlanValidationLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [nextMatchTile.fixtureId, selectedTeamCanManage, selectedTeamId, user]);

  useEffect(() => {
    if (isActiveMatchSession) {
      setSidebarCollapsed(true);
    }
  }, [isActiveMatchSession]);

  useEffect(() => {
    const sessionId = selectedCollectionSession?.id ?? "";
    if (!user || section !== "collection" || !selectedTeamId || !sessionId) {
      setCollectionSessionSocketState("idle");
      setCollectionSessionLive(null);
      if (collectionSessionWsRef.current) {
        collectionSessionWsRef.current.close();
        collectionSessionWsRef.current = null;
      }
      return;
    }

    setCollectionSessionSocketState("connecting");
    const ws = new WebSocket(buildCollectionSessionWsUrl(sessionId, selectedTeamId));
    collectionSessionWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as CollectionSession;
        setCollectionSessionLive(payload);
        setCollectionSessionSocketState("live");
      } catch {
        // ignore malformed payload
      }
    };
    ws.onclose = () => {
      if (collectionSessionWsRef.current === ws) {
        setCollectionSessionSocketState("idle");
      }
    };

    void getCollectionSession(sessionId, selectedTeamId)
      .then((snapshot) => setCollectionSessionLive(snapshot))
      .catch(() => {
        setCollectionSessionLive(null);
      });

    return () => {
      if (collectionSessionWsRef.current === ws) {
        collectionSessionWsRef.current = null;
      }
      ws.close();
    };
  }, [selectedCollectionSession?.id, section, selectedTeamId, user]);

  useEffect(() => {
    if (teams.length === 0) {
      setSelectedTeamId("");
      return;
    }
    if (teams.every((team) => team.id !== selectedTeamId)) {
      setSelectedTeamId(teams[0].id);
    }
  }, [selectedTeamId, teams]);

  const authSubmitLabel = useMemo(() => {
    if (isSubmitting) {
      return "Working...";
    }
    return mode === "login" ? "Log In" : "Create Account";
  }, [isSubmitting, mode]);

  const handleStartCollectionSession = async () => {
    if (!selectedTeamId || !selectedCollectionFixtureId) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await startCollectionSession({
        match_id: selectedCollectionFixtureId,
        team_id: selectedTeamId,
      });
      await loadActiveCollectionSessions(selectedTeamId);
      setSelectedCollectionSessionId(created.id);
      setSection("collection");
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message.includes("Confirm to continue")) {
        const confirmStart = window.confirm(`${requestError.message}\n\nStart anyway?`);
        if (confirmStart) {
          const created = await startCollectionSession({
            match_id: selectedCollectionFixtureId,
            team_id: selectedTeamId,
            confirm_off_schedule: true,
          });
          await loadActiveCollectionSessions(selectedTeamId);
          setSelectedCollectionSessionId(created.id);
          setSection("collection");
          setIsSubmitting(false);
          return;
        }
      }
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to start collection session");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const payload = { email: email.trim().toLowerCase(), password };
      if (mode === "register") {
        await register(payload);
      }
      const authenticatedUser = await login(payload);
      setUser(authenticatedUser);
      setPassword("");
      await loadWorkspaceData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Authentication failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSessionReset = () => {
    setUser(null);
    setEmail("");
    setPassword("");
    setTeams([]);
    setFixtures([]);
    setPlayers([]);
    setTeamMembers([]);
    setAdminOverview(null);
    setAdminAuditLogs([]);
    setIsSuperAdmin(false);
    setSection("dashboard");
    setMode("login");
  };

  const handleLogout = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await logout();
      setUser(null);
      setEmail("");
      setPassword("");
      setTeams([]);
      setFixtures([]);
      setPlayers([]);
      setTeamMembers([]);
      setAdminOverview(null);
      setAdminAuditLogs([]);
      setIsSuperAdmin(false);
        setSection("dashboard");
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Unable to log out");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const created = await createTeam({
        club_name: clubName.trim(),
        team_name: teamName.trim(),
      });
      setClubName("");
      setTeamName("");
      setTeams((existing) =>
        [...existing, created].sort((a, b) => a.display_name.localeCompare(b.display_name)),
      );
      setTeamDirectory((existing) =>
        [
          ...existing,
          {
            id: created.id,
            club_id: created.club_id,
            club_name: created.club_name,
            club_logo_url: created.club_logo_url,
            team_name: created.team_name,
            display_name: created.display_name,
          },
        ].sort((a, b) => a.display_name.localeCompare(b.display_name)),
      );
      setSelectedTeamId((current) => current || created.id);
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to create team");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    setError(null);
    setIsSubmitting(true);

    try {
      await deleteTeam(teamId);
      const remainingTeams = teams.filter((team) => team.id !== teamId);
      setTeams(remainingTeams);
      setTeamDirectory((existing) => existing.filter((team) => team.id !== teamId));
      setPlayers((existing) => existing.filter((player) => player.team_id !== teamId));

      if (selectedTeamId === teamId) {
        const nextTeamId = remainingTeams[0]?.id ?? "";
        setSelectedTeamId(nextTeamId);
        if (!nextTeamId) {
          setFixtures([]);
        }
        setSelectedFixtureForMatchPrep("");
      }
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to delete team");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadClubLogo = async (clubId: string, file: File | null) => {
    if (!clubId || !file) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await uploadClubLogo(clubId, file);
      await Promise.all([loadWorkspaceData(selectedTeamId), loadAdminData()]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to upload club logo");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-lockup">
            <img src="/assets/branding/logo1.png" alt="TapLine logo" className="brand-logo" />
            <h1>TapLine</h1>
          </div>
          <p>Loading session...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="brand-lockup">
            <img src="/assets/branding/logo1.png" alt="TapLine logo" className="brand-logo" />
            <h1>TapLine</h1>
          </div>
          <p>Fast match-day collection with account-based workspaces.</p>

          {error ? <p className="error-banner">{error}</p> : null}

          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button
              className={`auth-tab ${mode === "login" ? "active" : ""}`}
              onClick={() => setMode("login")}
              type="button"
            >
              Log In
            </button>
            <button
              className={`auth-tab ${mode === "register" ? "active" : ""}`}
              onClick={() => setMode("register")}
              type="button"
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />

            <button className="button primary" disabled={isSubmitting} type="submit">
              {authSubmitLabel}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-top">
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            type="button"
          >
            {sidebarCollapsed ? ">" : "<"}
          </button>
          {!sidebarCollapsed ? (
            <div className="sidebar-brand">
              <img src="/assets/branding/logo1.png" alt="TapLine logo" className="sidebar-brand-logo" />
            </div>
          ) : null}
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              className={`nav-item ${section === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setSection(item.id)}
              type="button"
              title={item.label}
              aria-label={item.label}
            >
              {sidebarCollapsed ? item.shortLabel : item.label}
            </button>
          ))}
        </nav>
        {!sidebarCollapsed ? (
          <div className="sidebar-team-selector">
            <p className="muted">Team</p>
            <SearchableSelect
              value={selectedTeamId}
              onChange={(nextValue) => {
                setSelectedTeamId(nextValue);
                setSelectedFixtureForMatchPrep("");
                setStatsTopView("matches");
                setStatsView("list");
                setSelectedStatSessionId("");
                setStatEvents([]);
                setStatMatchPrepPlan(null);
                setSeasonEvents([]);
                setSeasonMatchPrepPlans(new Map());
                setSelectedSeasonPlayerId("");
              }}
              options={teams.map((team) => ({ value: team.id, label: team.display_name }))}
              placeholder="Select team"
              className="sidebar-team-select"
            />
          </div>
        ) : null}

        {!sidebarCollapsed ? <p className="sidebar-user">{user.email}</p> : null}
      </aside>

      <section className={`content-shell ${isActiveMatchSession ? "in-active-match" : ""}`}>
        {!isActiveMatchSession ? (
          <header className="content-header">
          <div className="content-brand">
            <img src="/assets/branding/logo1.png" alt="TapLine logo" className="content-brand-logo" />
            <div>
            <h1>TapLine</h1>
            <div className="content-brand-subtitle">
              <p className="muted">{isWorkspaceLoading ? "Refreshing data..." : selectedTeamName || "No team selected"}</p>
            </div>
            </div>
          </div>
          <div className="content-header-actions">
            {selectedTeamClubLogoUrl ? (
              <img
                src={selectedTeamClubLogoUrl}
                alt={`${selectedTeam?.club_name ?? "Club"} logo`}
                className="content-club-logo-large"
              />
            ) : null}
            <button className="button secondary" onClick={handleLogout} disabled={isSubmitting}>
              Log Out
            </button>
          </div>
          </header>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}

        {section === "dashboard" ? (
          <section className="section-card">
            <div className="stats-grid">
            <article>
              <h3>Teams</h3>
              <p>{dashboardStats.teams}</p>
            </article>
            <article>
              <h3>Fixtures</h3>
              <p>{dashboardStats.fixtures}</p>
            </article>
            <article>
              <h3>Players</h3>
              <p>{dashboardStats.players}</p>
            </article>
              <article>
                <h3>Members</h3>
                <p>{dashboardStats.members}</p>
              </article>
            <article>
                <h3>Next Match</h3>
                <p>{nextMatchTile.title}</p>
                <span className="muted">{nextMatchTile.subtitle}</span>
                {nextMatchTile.fixtureId ? (
                  <div className="next-match-plan-status">
                    {isNextMatchPlanValidationLoading ? (
                      <p className="muted">Checking match plan...</p>
                    ) : null}
                    {!selectedTeamCanManage ? (
                      <p className="muted">Manager access required to validate plan.</p>
                    ) : null}
                    {selectedTeamCanManage && !isNextMatchPlanValidationLoading && nextMatchPlanValidation ? (
                      <>
                        {nextMatchPlanValidation.valid && nextMatchPlanValidation.warnings.length === 0 ? (
                          <p className="muted">Match plan is valid.</p>
                        ) : null}
                        {!nextMatchPlanValidation.valid ? (
                          <p className="muted">
                            Match plan invalid:{" "}
                            {nextMatchPlanValidation.errors[0] ?? "one or more segments are incomplete."}
                          </p>
                        ) : null}
                        {nextMatchPlanValidation.valid && nextMatchPlanValidation.warnings.length > 0 ? (
                          <p className="muted">
                            Match plan valid with warning:{" "}
                            {nextMatchPlanValidation.warnings[0] ?? "some players are out of position."}
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        setSection("match_prep");
                        if (nextMatchTile.fixtureId) {
                          setSelectedFixtureForMatchPrep(nextMatchTile.fixtureId);
                        }
                      }}
                      disabled={!selectedTeamCanManage || !nextMatchTile.fixtureId}
                    >
                      Open Match Prep
                    </button>
                  </div>
                ) : null}
              </article>
              <article>
                <h3>Live Match</h3>
                {!selectedTeamId ? <p className="muted">Select a team.</p> : null}
                {selectedTeamId && activeCollectionSessions.length === 0 ? (
                  <p className="muted">No live collection session.</p>
                ) : null}
                {activeCollectionSessions[0] ? (
                  <>
                    <p>
                      {activeCollectionSessions[0].fixture_label} · P{activeCollectionSessions[0].period_number}/
                      {activeCollectionSessions[0].total_periods}
                    </p>
                    <span className="muted">{formatClock(activeCollectionSessions[0].elapsed_seconds)}</span>
                    <div style={{ marginTop: "0.45rem" }}>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => {
                          setSelectedCollectionSessionId(activeCollectionSessions[0].id);
                          setSection("collection");
                        }}
                      >
                        Go To Match Screen
                      </button>
                    </div>
                  </>
                ) : null}
                {selectedTeamCanManage ? (
                  <div className="collection-start-row">
                    <SearchableSelect
                      value={selectedCollectionFixtureId}
                      onChange={setSelectedCollectionFixtureId}
                      options={startableCollectionFixtures.map((fixture) => {
                        const opposition =
                          fixture.home_team_id === selectedTeamId
                            ? `${fixture.away_club_name} ${fixture.away_team_name}`
                            : `${fixture.home_club_name} ${fixture.home_team_name}`;
                        return {
                          value: fixture.id,
                          label: `${opposition}${fixture.kickoff_at ? ` · ${new Date(fixture.kickoff_at).toLocaleString()}` : ""}`,
                        };
                      })}
                      placeholder="Select fixture"
                      disabled={!selectedTeamId || startableCollectionFixtures.length === 0}
                    />
                    <button
                      className="button primary"
                      type="button"
                      disabled={!selectedTeamId || !selectedCollectionFixtureId || isSubmitting}
                      onClick={handleStartCollectionSession}
                    >
                      Start Game
                    </button>
                  </div>
                ) : null}
              </article>
            </div>
          </section>
        ) : null}

        {section === "collection" ? (
          <CollectionView
            selectedTeamId={selectedTeamId}
            selectedTeamCanManage={selectedTeamCanManage}
            playersForSelectedTeam={playersForSelectedTeam}
            activeCollectionSessions={activeCollectionSessions}
            selectedCollectionSessionId={selectedCollectionSessionId}
            selectedCollectionSession={selectedCollectionSession}
            collectionSessionLive={collectionSessionLive}
            collectionSessionSocketState={collectionSessionSocketState}
            onSessionSelected={setSelectedCollectionSessionId}
            onActiveSessionsChanged={() => loadActiveCollectionSessions(selectedTeamId)}
          />
        ) : null}

        {section === "settings" ? (
          <SettingsView onLoggedOut={handleSessionReset} />
        ) : null}

        {section === "fixtures" ? (
          <FixturesView
            selectedTeamId={selectedTeamId}
            selectedTeamName={selectedTeamName}
            selectedTeamCanManage={selectedTeamCanManage}
            fixtures={fixtures}
            fixtureOppositionOptions={fixtureOppositionOptions}
            onFixturesChanged={() => void loadFixturesForTeam(selectedTeamId)}
          />
        ) : null}

        {section === "teams" ? (
          <section className="section-card two-col">
            <form className="stack-form" onSubmit={handleCreateTeam}>
              <h3>Create Team</h3>
              {selectedTeam && isSuperAdmin ? (
                <div className="club-logo-panel">
                  <p className="muted">Club Logo - {selectedTeam.club_name}</p>
                  {selectedTeamClubLogoUrl ? (
                    <img
                      src={selectedTeamClubLogoUrl}
                      alt={`${selectedTeam.club_name} logo`}
                      className="club-logo-preview"
                    />
                  ) : (
                    <p className="muted">No logo uploaded yet.</p>
                  )}
                  <label className="button secondary file-upload-button" aria-disabled={isSubmitting || !isSuperAdmin}>
                    Upload Club Logo
                    <input
                      type="file"
                      accept="image/png,image/webp"
                      disabled={isSubmitting || !isSuperAdmin}
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        void handleUploadClubLogo(selectedTeam.club_id, file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
              ) : null}
              <SearchableSelect
                value={clubName}
                onChange={setClubName}
                options={clubNameOptions}
                placeholder="Select club"
              />
              <input
                placeholder="Team name"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                required
              />
              <button className="button primary" disabled={isSubmitting} type="submit">
                Add Team
              </button>
            </form>

            <div>
              <h3>Your Teams</h3>
              {teams.length === 0 ? <p className="muted">No teams yet.</p> : null}
              {teams.map((team) => (
                <div className="list-row" key={team.id}>
                  <span>{team.display_name}</span>
                  <button
                    className="button secondary"
                    onClick={() => handleDeleteTeam(team.id)}
                    type="button"
                    disabled={isSubmitting || (team.my_role ? !isTeamAdminRole(team.my_role) : false)}
                    title={team.my_role && !isTeamAdminRole(team.my_role) ? "Manager access required" : "Delete team"}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "match_prep" ? (
          <MatchPrepView
            selectedTeamId={selectedTeamId}
            selectedTeamName={selectedTeamName}
            selectedTeamCanManage={selectedTeamCanManage}
            hasAnyManagerAccess={ownedTeams.length > 0}
            matchPrepFixtures={matchPrepFixtures}
            selectedFixtureId={selectedFixtureForMatchPrep}
            onFixtureSelected={setSelectedFixtureForMatchPrep}
          />
        ) : null}

        {section === "players" ? (
          <PlayersView
            selectedTeamId={selectedTeamId}
            selectedTeamName={selectedTeamName}
            playersForSelectedTeam={playersForSelectedTeam}
            selectedTeamCanManage={selectedTeamCanManage}
            onPlayersChanged={() => void loadWorkspaceData(selectedTeamId)}
          />
        ) : null}

        {section === "members" ? (
          <MembersView
            user={user}
            selectedTeamId={selectedTeamId}
            selectedTeamName={selectedTeamName}
            teamMembers={teamMembers}
            selectedTeamCanManage={selectedTeamCanManage}
            onMembersChanged={() => void loadTeamMembers(selectedTeamId)}
          />
        ) : null}

        {section === "stats" ? (
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
        ) : null}

        {section === "admin" ? (
          <AdminView
            adminOverview={adminOverview}
            adminAuditLogs={adminAuditLogs}
            isAdminLoading={isAdminLoading}
            onAdminDataChanged={loadAdminData}
            onWorkspaceDataChanged={() => loadWorkspaceData(selectedTeamId)}
          />
        ) : null}
      </section>
    </main>
  );
}

export default App;

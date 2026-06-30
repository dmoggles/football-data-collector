import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import "./index.css";
import { SearchableSelect } from "./components/SearchableSelect";
import { SettingsView } from "./views/SettingsView";
import { PlayersView } from "./views/PlayersView";
import { MembersView } from "./views/MembersView";
import { AdminView } from "./views/AdminView";
import { CollectionView } from "./views/CollectionView";
import { FixturesView } from "./views/FixturesView";
import { MatchPrepView } from "./views/MatchPrepView";
import { StatsView } from "./views/StatsView";
import {
  type AuthMode,
  type Section,
  BASE_NAV_ITEMS,
  ADMIN_NAV_ITEM,
} from "./constants";
import {
  isTeamAdminRole,
  formatClock,
  buildCollectionSessionWsUrl,
} from "./utils/formatters";
import {
  createTeam,
  deleteTeam,
  getAdminOverview,
  getAdminAuditLogs,
  getCollectionSession,
  getMatchPrepPlanValidation,
  getMe,
  listActiveCollectionSessions,
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
  CollectionSession,
  MatchPrepFixture,
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
      return;
    }
    try {
      const members = await listTeamMembers(teamId);
      setTeamMembers(members);
    } catch {
      setTeamMembers([]);
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

  const loadAdminData = useCallback(async () => {
    setIsAdminLoading(true);
    try {
      const [overview, auditLogs] = await Promise.all([getAdminOverview(), getAdminAuditLogs(150)]);
      setAdminOverview(overview);
      setAdminAuditLogs(auditLogs);
      setIsSuperAdmin(true);
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
          <StatsView
            selectedTeamId={selectedTeamId}
            players={players}
            playersForSelectedTeam={playersForSelectedTeam}
          />
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

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
import { DashboardView } from "./views/DashboardView";
import { TeamsView } from "./views/TeamsView";
import { StatsView } from "./views/StatsView";
import {
  type AuthMode,
  type Section,
  BASE_NAV_ITEMS,
  ADMIN_NAV_ITEM,
} from "./constants";
import {
  isTeamAdminRole,
  buildCollectionSessionWsUrl,
} from "./utils/formatters";
import {
  getAdminOverview,
  getAdminAuditLogs,
  getCollectionSession,
  getMe,
  listActiveCollectionSessions,
  listClubs,
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
} from "./api";
import type {
  AdminAuditLogEntry,
  AdminClubOverview,
  AdminOverview,
  Fixture,
  CollectionSession,
  MatchPrepFixture,
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
  const [clubs, setClubs] = useState<AdminClubOverview[]>([]);
  const [teamDirectory, setTeamDirectory] = useState<TeamDirectory[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [matchPrepFixtures, setMatchPrepFixtures] = useState<MatchPrepFixture[]>([]);
  const [activeCollectionSessions, setActiveCollectionSessions] = useState<CollectionSession[]>([]);
  const [selectedCollectionSessionId, setSelectedCollectionSessionId] = useState("");
  const [collectionSessionLive, setCollectionSessionLive] = useState<CollectionSession | null>(null);
  const [collectionSessionSocketState, setCollectionSessionSocketState] = useState<"idle" | "connecting" | "live">(
    "idle",
  );
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogEntry[]>([]);
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
    const apiClubNames = clubs.map((club) => club.name.trim()).filter(Boolean);
    const uniqueClubNames = Array.from(new Set([...teamDirectoryClubNames, ...adminClubNames, ...apiClubNames]));
    return uniqueClubNames.sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }));
  }, [adminOverview, clubs, teamDirectory]);
  const loadWorkspaceData = useCallback(async (preferredTeamId = "") => {
    setIsWorkspaceLoading(true);
    try {
      const [teamsResponse, playersResponse, teamDirectoryResponse, clubsResponse] = await Promise.all([
        listTeams(),
        listPlayers(),
        listTeamDirectory(),
        listClubs(),
      ]);
      const nextTeamId = teamsResponse.some((team) => team.id === preferredTeamId)
        ? preferredTeamId
        : teamsResponse[0]?.id || "";
      const fixturesResponse = nextTeamId ? await listFixtures(nextTeamId) : [];
      setTeams(teamsResponse);
      setTeamDirectory(teamDirectoryResponse);
      setClubs(clubsResponse);
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
          <DashboardView
            selectedTeamId={selectedTeamId}
            selectedTeamCanManage={selectedTeamCanManage}
            teams={teams}
            fixtures={fixtures}
            players={players}
            teamMembers={teamMembers}
            activeCollectionSessions={activeCollectionSessions}
            onOpenMatchPrep={(fixtureId) => {
              setSection("match_prep");
              setSelectedFixtureForMatchPrep(fixtureId);
            }}
            onOpenCollection={(sessionId) => {
              setSelectedCollectionSessionId(sessionId);
              setSection("collection");
            }}
            onActiveSessionsChanged={() => loadActiveCollectionSessions(selectedTeamId)}
          />
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
          <TeamsView
            teams={teams}
            selectedTeam={selectedTeam}
            selectedTeamClubLogoUrl={selectedTeamClubLogoUrl}
            isSuperAdmin={isSuperAdmin}
            clubNameOptions={clubNameOptions}
            onWorkspaceChanged={async () => { await loadWorkspaceData(selectedTeamId); await loadAdminData(); }}
          />
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./index.css";
import { AppShell, type AppDestination } from "./components/AppShell";
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
import { MoreView } from "./views/MoreView";
import {
  type AuthMode,
  type Section,
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


function sectionFromPath(pathname: string): Section {
  if (pathname.startsWith("/match")) return "collection";
  if (pathname.startsWith("/fixtures/") && pathname.endsWith("/prep")) return "match_prep";
  if (pathname.startsWith("/fixtures")) return "fixtures";
  if (pathname.startsWith("/stats")) return "stats";
  if (pathname.startsWith("/team/squad")) return "players";
  if (pathname.startsWith("/team/staff")) return "members";
  if (pathname.startsWith("/team/settings")) return "teams";
  if (pathname.startsWith("/account")) return "settings";
  if (pathname.startsWith("/admin")) return "admin";
  return "dashboard";
}

const sectionPaths: Record<Section, string> = {
  dashboard: "/",
  collection: "/match",
  fixtures: "/fixtures",
  match_prep: "/fixtures/prep",
  players: "/team/squad",
  teams: "/team/settings",
  members: "/team/staff",
  settings: "/account",
  stats: "/stats",
  admin: "/admin",
};

const sectionTitles: Record<Section, { eyebrow: string; title: string; description: string }> = {
  dashboard: { eyebrow: "Today", title: "Home", description: "Your next actions and match-day status." },
  collection: { eyebrow: "Match day", title: "Match", description: "Start or resume live event collection." },
  fixtures: { eyebrow: "Schedule", title: "Fixtures", description: "Plan and manage upcoming matches." },
  match_prep: { eyebrow: "Match day", title: "Match preparation", description: "Build the squad, shape, and substitution plan." },
  players: { eyebrow: "Team", title: "Squad", description: "Manage players, numbers, and positions." },
  teams: { eyebrow: "Team", title: "Team settings", description: "Manage clubs, teams, and branding." },
  members: { eyebrow: "Team", title: "Staff access", description: "Control manager and data collector access." },
  settings: { eyebrow: "Account", title: "Account security", description: "Update your password and session." },
  stats: { eyebrow: "Performance", title: "Stats", description: "Review match and season performance." },
  admin: { eyebrow: "TapLine", title: "Administration", description: "Manage the platform and review activity." },
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const section = sectionFromPath(location.pathname);
  const isMoreRoute = location.pathname.startsWith("/more");
  const setSection = useCallback((nextSection: Section) => navigate(sectionPaths[nextSection]), [navigate]);

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

  const activeDestination: AppDestination = isMoreRoute || ["players", "teams", "members", "settings", "admin"].includes(section)
    ? "more"
    : section === "dashboard"
      ? "home"
      : section === "collection"
        ? "match"
        : section === "stats"
          ? "stats"
          : "fixtures";

  useEffect(() => {
    const matchSession = location.pathname.match(/^\/match\/([^/]+)$/);
    if (matchSession?.[1]) setSelectedCollectionSessionId(matchSession[1]);
    const prepFixture = location.pathname.match(/^\/fixtures\/([^/]+)\/prep$/);
    if (prepFixture?.[1]) setSelectedFixtureForMatchPrep(prepFixture[1]);
  }, [location.pathname]);

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
    const teamDirectoryClubNames = teamDirectory.map((team) => team.club_name?.trim()).filter((name): name is string => Boolean(name));
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
    } finally {
      setIsAdminLoading(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const me = await getMe();
        setUser(me);
      } catch {
        setUser(null);
        setIsLoading(false);
        return;
      }
      try {
        await loadWorkspaceData(window.localStorage.getItem("tapline:selected-team") ?? "");
        await loadAdminData();
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Failed to load workspace");
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

  useEffect(() => {
    if (selectedTeamId) window.localStorage.setItem("tapline:selected-team", selectedTeamId);
  }, [selectedTeamId]);

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
      await loadWorkspaceData(window.localStorage.getItem("tapline:selected-team") ?? "");
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
          <p className="app-version">Version {import.meta.env.VITE_APP_VERSION}</p>
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
          <p className="app-version">Version {import.meta.env.VITE_APP_VERSION}</p>
        </section>
      </main>
    );
  }

  const pageTitle = sectionTitles[section];
  const showTeamTabs = ["players", "members", "teams"].includes(section);

  return (
    <AppShell
      activeDestination={activeDestination}
      clubLogoUrl={selectedTeamClubLogoUrl}
      immersive={isActiveMatchSession}
      isWorkspaceLoading={isWorkspaceLoading}
      onNavigate={(destination) => {
        if (destination === "home") navigate("/");
        if (destination === "fixtures") navigate("/fixtures");
        if (destination === "match") navigate(selectedCollectionSessionId ? `/match/${selectedCollectionSessionId}` : "/match");
        if (destination === "stats") navigate("/stats");
        if (destination === "more") navigate("/more");
      }}
      onTeamChange={(nextValue) => {
        setSelectedTeamId(nextValue);
        setSelectedFixtureForMatchPrep("");
      }}
      selectedTeamId={selectedTeamId}
      selectedTeamName={selectedTeamName}
      teams={teams}
    >
      {isActiveMatchSession ? (
        <button className="immersive-exit" type="button" onClick={() => navigate("/")} aria-label="Leave match screen">
          ← Exit
        </button>
      ) : null}
      {!isActiveMatchSession && !isMoreRoute ? (
        <header className="page-heading">
          <div>
            <p className="eyebrow">{pageTitle.eyebrow}</p>
            <h1>{pageTitle.title}</h1>
            <p className="muted">{pageTitle.description}</p>
          </div>
        </header>
      ) : null}

      {showTeamTabs ? (
        <nav className="section-tabs" aria-label="Team sections">
          <button className={section === "players" ? "active" : ""} onClick={() => navigate("/team/squad")} type="button">Squad</button>
          <button className={section === "members" ? "active" : ""} onClick={() => navigate("/team/staff")} type="button">Staff</button>
          <button className={section === "teams" ? "active" : ""} onClick={() => navigate("/team/settings")} type="button">Settings</button>
        </nav>
      ) : null}

      {error ? <p className="error-banner">{error}</p> : null}

      {isMoreRoute ? (
        <MoreView
          email={user.email}
          isSuperAdmin={isSuperAdmin}
          isSubmitting={isSubmitting}
          onLogout={handleLogout}
          onNavigate={navigate}
        />
      ) : null}

        {section === "dashboard" && !isMoreRoute ? (
          <DashboardView
            selectedTeamId={selectedTeamId}
            selectedTeamCanManage={selectedTeamCanManage}
            teams={teams}
            fixtures={fixtures}
            players={players}
            teamMembers={teamMembers}
            activeCollectionSessions={activeCollectionSessions}
            onOpenMatchPrep={(fixtureId) => {
              setSelectedFixtureForMatchPrep(fixtureId);
              navigate(`/fixtures/${fixtureId}/prep`);
            }}
            onOpenCollection={(sessionId) => {
              setSelectedCollectionSessionId(sessionId);
              navigate(`/match/${sessionId}`);
            }}
            onActiveSessionsChanged={async () => {
              await Promise.all([
                loadActiveCollectionSessions(selectedTeamId),
                loadFixturesForTeam(selectedTeamId),
                loadMatchPrepFixtures(selectedTeamId),
              ]);
            }}
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
            onSessionSelected={(sessionId) => {
              setSelectedCollectionSessionId(sessionId);
              navigate(`/match/${sessionId}`);
            }}
            onActiveSessionsChanged={() => loadActiveCollectionSessions(selectedTeamId)}
            onMatchReset={async () => {
              setSelectedCollectionSessionId("");
              setCollectionSessionLive(null);
              await Promise.all([
                loadActiveCollectionSessions(selectedTeamId),
                loadFixturesForTeam(selectedTeamId),
                loadMatchPrepFixtures(selectedTeamId),
              ]);
              navigate("/");
            }}
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
            onFixtureSelected={(fixtureId) => {
              setSelectedFixtureForMatchPrep(fixtureId);
              if (fixtureId) navigate(`/fixtures/${fixtureId}/prep`, { replace: true });
            }}
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
    </AppShell>
  );
}

export default App;

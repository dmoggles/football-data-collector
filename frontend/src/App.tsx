import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import "./index.css";
import {
  addTeamMember,
  createPlayer,
  createTeam,
  deletePlayer,
  deleteTeam,
  deleteTeamMember,
  getMe,
  listPlayers,
  listTeamMembers,
  listTeams,
  login,
  logout,
  register,
  updateTeamMember,
} from "./api";
import type { Player, Team, TeamMember, TeamRole, User } from "./types/auth";

type AuthMode = "login" | "register";
type Section = "dashboard" | "teams" | "players" | "members";

const POSITION_OPTIONS = ["GK", "RB", "RWB", "CB", "LB", "LWB", "DM", "CM", "AM", "RW", "LW", "ST"];
const NAV_ITEMS: Array<{ id: Section; label: string; shortLabel: string }> = [
  { id: "dashboard", label: "Dashboard", shortLabel: "D" },
  { id: "teams", label: "Teams", shortLabel: "T" },
  { id: "players", label: "Players", shortLabel: "P" },
  { id: "members", label: "Members", shortLabel: "M" },
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [section, setSection] = useState<Section>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);

  const [selectedTeamForPlayers, setSelectedTeamForPlayers] = useState("");
  const [selectedTeamForMembers, setSelectedTeamForMembers] = useState("");

  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>("data_enterer");

  const [error, setError] = useState<string | null>(null);
  const [membersLoadError, setMembersLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);

  const selectedTeamForPlayersName = useMemo(
    () => teams.find((team) => team.id === selectedTeamForPlayers)?.display_name ?? "",
    [selectedTeamForPlayers, teams],
  );

  const selectedTeamForMembersName = useMemo(
    () => teams.find((team) => team.id === selectedTeamForMembers)?.display_name ?? "",
    [selectedTeamForMembers, teams],
  );

  const playersForSelectedTeam = useMemo(() => {
    if (!selectedTeamForPlayers) {
      return players;
    }
    return players.filter((player) => player.team_id === selectedTeamForPlayers);
  }, [players, selectedTeamForPlayers]);

  const dashboardStats = useMemo(
    () => ({ teams: teams.length, players: players.length, members: teamMembers.length }),
    [players.length, teamMembers.length, teams.length],
  );

  const loadWorkspaceData = useCallback(async () => {
    setIsWorkspaceLoading(true);
    try {
      const [teamsResponse, playersResponse] = await Promise.all([listTeams(), listPlayers()]);
      setTeams(teamsResponse);
      setPlayers(playersResponse);
      setSelectedTeamForPlayers((current) => current || teamsResponse[0]?.id || "");
      setSelectedTeamForMembers((current) => current || teamsResponse[0]?.id || "");
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

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const me = await getMe();
        setUser(me);
        await loadWorkspaceData();
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    void bootstrap();
  }, [loadWorkspaceData]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (section !== "members") {
      return;
    }
    void loadTeamMembers(selectedTeamForMembers);
  }, [loadTeamMembers, section, selectedTeamForMembers, user]);

  const authSubmitLabel = useMemo(() => {
    if (isSubmitting) {
      return "Working...";
    }
    return mode === "login" ? "Log In" : "Create Account";
  }, [isSubmitting, mode]);

  const togglePosition = (positionCode: string) => {
    setSelectedPositions((current) =>
      current.includes(positionCode)
        ? current.filter((item) => item !== positionCode)
        : [...current, positionCode],
    );
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

  const handleLogout = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      await logout();
      setUser(null);
      setEmail("");
      setPassword("");
      setTeams([]);
      setPlayers([]);
      setTeamMembers([]);
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
      setSelectedTeamForPlayers(created.id);
      setSelectedTeamForMembers(created.id);
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
      setPlayers((existing) => existing.filter((player) => player.team_id !== teamId));

      if (selectedTeamForPlayers === teamId) {
        setSelectedTeamForPlayers(remainingTeams[0]?.id ?? "");
      }
      if (selectedTeamForMembers === teamId) {
        const next = remainingTeams[0]?.id ?? "";
        setSelectedTeamForMembers(next);
        await loadTeamMembers(next);
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

  const handleCreatePlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const parsedShirtNumber = shirtNumber.trim() ? Number(shirtNumber) : null;
      const created = await createPlayer({
        team_id: selectedTeamForPlayers,
        display_name: playerName.trim(),
        shirt_number: parsedShirtNumber,
        position: selectedPositions.length > 0 ? selectedPositions.join(", ") : null,
      });

      setPlayerName("");
      setShirtNumber("");
      setSelectedPositions([]);
      setPlayers((existing) => [...existing, created].sort((a, b) => a.display_name.localeCompare(b.display_name)));
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to create player");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    setError(null);
    setIsSubmitting(true);

    try {
      await deletePlayer(playerId);
      setPlayers((existing) => existing.filter((player) => player.id !== playerId));
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to delete player");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddTeamMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTeamForMembers) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await addTeamMember(selectedTeamForMembers, {
        user_email: newMemberEmail.trim().toLowerCase(),
        role: newMemberRole,
      });
      setNewMemberEmail("");
      setNewMemberRole("data_enterer");
      await loadTeamMembers(selectedTeamForMembers);
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to add member");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMemberRoleChange = async (membershipId: string, role: TeamRole) => {
    if (!selectedTeamForMembers) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await updateTeamMember(selectedTeamForMembers, membershipId, { role });
      await loadTeamMembers(selectedTeamForMembers);
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to update member role");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTeamMember = async (membershipId: string) => {
    if (!selectedTeamForMembers) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await deleteTeamMember(selectedTeamForMembers, membershipId);
      await loadTeamMembers(selectedTeamForMembers);
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to remove member");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <h1>Football Data Collector</h1>
          <p>Loading session...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <h1>Football Data Collector</h1>
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
          {!sidebarCollapsed ? <h2>Workspace</h2> : null}
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
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

        {!sidebarCollapsed ? <p className="sidebar-user">{user.email}</p> : null}
      </aside>

      <section className="content-shell">
        <header className="content-header">
          <div>
            <h1>Football Data Collector</h1>
            <p className="muted">{isWorkspaceLoading ? "Refreshing data..." : "Ready"}</p>
          </div>
          <button className="button secondary" onClick={handleLogout} disabled={isSubmitting}>
            Log Out
          </button>
        </header>

        {error ? <p className="error-banner">{error}</p> : null}

        {section === "dashboard" ? (
          <section className="section-card stats-grid">
            <article>
              <h3>Teams</h3>
              <p>{dashboardStats.teams}</p>
            </article>
            <article>
              <h3>Players</h3>
              <p>{dashboardStats.players}</p>
            </article>
            <article>
              <h3>Members</h3>
              <p>{dashboardStats.members}</p>
            </article>
          </section>
        ) : null}

        {section === "teams" ? (
          <section className="section-card two-col">
            <form className="stack-form" onSubmit={handleCreateTeam}>
              <h3>Create Team</h3>
              <input
                placeholder="Club name"
                value={clubName}
                onChange={(event) => setClubName(event.target.value)}
                required
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
                    disabled={isSubmitting}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "players" ? (
          <section className="section-card two-col">
            <form className="stack-form" onSubmit={handleCreatePlayer}>
              <h3>Add Player</h3>
              <input
                placeholder="Player name"
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                required
              />
              <select
                value={selectedTeamForPlayers}
                onChange={(event) => setSelectedTeamForPlayers(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select team
                </option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.display_name}
                  </option>
                ))}
              </select>
              <input
                placeholder="Shirt number"
                value={shirtNumber}
                onChange={(event) => setShirtNumber(event.target.value)}
                inputMode="numeric"
                pattern="[0-9]*"
              />

              <div className="position-grid">
                {POSITION_OPTIONS.map((positionCode) => (
                  <label className="position-option" key={positionCode}>
                    <input
                      checked={selectedPositions.includes(positionCode)}
                      onChange={() => togglePosition(positionCode)}
                      type="checkbox"
                    />
                    <span>{positionCode}</span>
                  </label>
                ))}
              </div>

              <button
                className="button primary"
                disabled={isSubmitting || teams.length === 0 || !selectedTeamForPlayers}
                type="submit"
              >
                Add Player
              </button>
            </form>

            <div>
              <h3>Players {selectedTeamForPlayersName ? `- ${selectedTeamForPlayersName}` : ""}</h3>
              {playersForSelectedTeam.length === 0 ? <p className="muted">No players yet.</p> : null}
              {playersForSelectedTeam.map((player) => (
                <div className="list-row" key={player.id}>
                  <span>
                    {player.display_name}
                    {player.shirt_number ? ` #${player.shirt_number}` : ""}
                    {player.position ? ` (${player.position})` : ""}
                  </span>
                  <button
                    className="button secondary"
                    onClick={() => handleDeletePlayer(player.id)}
                    type="button"
                    disabled={isSubmitting}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "members" ? (
          <section className="section-card two-col">
            <form className="stack-form" onSubmit={handleAddTeamMember}>
              <h3>Manage Members</h3>
              <select
                value={selectedTeamForMembers}
                onChange={(event) => setSelectedTeamForMembers(event.target.value)}
                required
              >
                <option value="" disabled>
                  Select team
                </option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.display_name}
                  </option>
                ))}
              </select>
              <input
                placeholder="user@email.com"
                type="email"
                value={newMemberEmail}
                onChange={(event) => setNewMemberEmail(event.target.value)}
                required
              />
              <select
                value={newMemberRole}
                onChange={(event) => setNewMemberRole(event.target.value as TeamRole)}
              >
                <option value="admin">Admin</option>
                <option value="data_enterer">Data Enterer</option>
              </select>
              <button
                className="button primary"
                disabled={isSubmitting || !selectedTeamForMembers}
                type="submit"
              >
                Add Member
              </button>
            </form>

            <div>
              <h3>Members {selectedTeamForMembersName ? `- ${selectedTeamForMembersName}` : ""}</h3>
              {isMembersLoading ? <p className="muted">Loading members...</p> : null}
              {membersLoadError ? <p className="muted">{membersLoadError}</p> : null}
              {!isMembersLoading && !membersLoadError && teamMembers.length === 0 ? (
                <p className="muted">No members assigned.</p>
              ) : null}

              {teamMembers.map((membership) => {
                const isCurrentUser = membership.user_id === user.id;
                const emailOrId = membership.user_email ?? membership.user_id;
                const userName = emailOrId.includes("@")
                  ? emailOrId.split("@")[0].replace(/[._-]+/g, " ")
                  : emailOrId;

                return (
                  <div className="member-row" key={membership.id}>
                    <span className="muted">
                      {userName} ({emailOrId})
                      {isCurrentUser ? " - You" : ""}
                    </span>
                    <div className="member-actions">
                      <select
                        value={membership.role}
                        onChange={(event) =>
                          handleMemberRoleChange(membership.id, event.target.value as TeamRole)
                        }
                      >
                        <option value="admin">Admin</option>
                        <option value="data_enterer">Data Enterer</option>
                      </select>
                      <button
                        className="button secondary"
                        onClick={() => handleDeleteTeamMember(membership.id)}
                        type="button"
                        disabled={isSubmitting || isCurrentUser}
                        title={isCurrentUser ? "You cannot remove your own membership" : "Remove member"}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default App;


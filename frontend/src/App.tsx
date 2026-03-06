import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import "./index.css";
import {
  addTeamMember,
  assignAdminTeamOwner,
  assignUserGlobalRole,
  changePassword,
  createAdminClub,
  createAdminTeam,
  deleteAdminClub,
  deleteAdminTeam,
  createPlayer,
  createTeam,
  deletePlayer,
  deleteTeam,
  deleteTeamMember,
  getAdminOverview,
  getAdminAuditLogs,
  getMe,
  listPlayers,
  listTeamMembers,
  listTeams,
  login,
  logout,
  removeAdminTeamOwner,
  register,
  revokeUserGlobalRole,
  updateAdminTeam,
  updateAdminClub,
  updateTeamMember,
} from "./api";
import type { AdminAuditLogEntry, AdminOverview, Player, Team, TeamMember, TeamRole, User } from "./types/auth";

type AuthMode = "login" | "register";
type Section = "dashboard" | "teams" | "players" | "members" | "admin";
type AdminSection = "home" | "clubs" | "teams" | "users" | "audit";

const POSITION_OPTIONS = ["GK", "RB", "RWB", "CB", "LB", "LWB", "DM", "CM", "AM", "RW", "LW", "ST"];
const BASE_NAV_ITEMS: Array<{ id: Exclude<Section, "admin">; label: string; shortLabel: string }> = [
  { id: "dashboard", label: "Dashboard", shortLabel: "D" },
  { id: "teams", label: "Teams", shortLabel: "T" },
  { id: "players", label: "Players", shortLabel: "P" },
  { id: "members", label: "Members", shortLabel: "M" },
];
const ADMIN_NAV_ITEM: { id: Section; label: string; shortLabel: string } = {
  id: "admin",
  label: "Super Admin",
  shortLabel: "A",
};
const ADMIN_SUB_NAV_ITEMS: Array<{ id: AdminSection; label: string }> = [
  { id: "home", label: "Overview" },
  { id: "clubs", label: "Clubs" },
  { id: "teams", label: "Teams" },
  { id: "users", label: "Users" },
  { id: "audit", label: "Audit" },
];

function isTeamAdminRole(role: TeamRole): boolean {
  return role === "team_admin" || role === "admin";
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AuthMode>("login");
  const [section, setSection] = useState<Section>("dashboard");
  const [adminSection, setAdminSection] = useState<AdminSection>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogEntry[]>([]);

  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");

  const [selectedTeamForPlayers, setSelectedTeamForPlayers] = useState("");
  const [selectedTeamForMembers, setSelectedTeamForMembers] = useState("");

  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>("data_enterer");
  const [adminClubName, setAdminClubName] = useState("");
  const [adminEditingClubId, setAdminEditingClubId] = useState("");
  const [adminEditingClubName, setAdminEditingClubName] = useState("");
  const [adminAssignTeamId, setAdminAssignTeamId] = useState("");
  const [adminAssignEmail, setAdminAssignEmail] = useState("");
  const [adminCreateTeamClubId, setAdminCreateTeamClubId] = useState("");
  const [adminCreateTeamName, setAdminCreateTeamName] = useState("");
  const [showUnclaimedOnly, setShowUnclaimedOnly] = useState(false);
  const [adminEditingTeamId, setAdminEditingTeamId] = useState("");
  const [adminEditingTeamName, setAdminEditingTeamName] = useState("");
  const [adminEditingTeamClubId, setAdminEditingTeamClubId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [membersLoadError, setMembersLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [isMembersLoading, setIsMembersLoading] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const adminAssignEmailInputRef = useRef<HTMLInputElement | null>(null);

  const navItems = useMemo(
    () => (isSuperAdmin ? [...BASE_NAV_ITEMS, ADMIN_NAV_ITEM] : BASE_NAV_ITEMS),
    [isSuperAdmin],
  );

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
  const filteredAdminTeams = useMemo(() => {
    if (!adminOverview) {
      return [];
    }
    if (!showUnclaimedOnly) {
      return adminOverview.teams;
    }
    return adminOverview.teams.filter((team) => team.owners.length === 0);
  }, [adminOverview, showUnclaimedOnly]);
  const roleByTeamId = useMemo(() => {
    const mapping: Partial<Record<string, TeamRole>> = {};
    for (const team of teams) {
      mapping[team.id] = team.my_role;
    }
    return mapping;
  }, [teams]);
  const selectedTeamForPlayersCanManage = useMemo(
    () =>
      Boolean(
        selectedTeamForPlayers &&
          (!roleByTeamId[selectedTeamForPlayers] ||
            isTeamAdminRole(roleByTeamId[selectedTeamForPlayers])),
      ),
    [roleByTeamId, selectedTeamForPlayers],
  );
  const selectedTeamForMembersCanManage = useMemo(
    () =>
      Boolean(
        selectedTeamForMembers &&
          (!roleByTeamId[selectedTeamForMembers] ||
            isTeamAdminRole(roleByTeamId[selectedTeamForMembers])),
      ),
    [roleByTeamId, selectedTeamForMembers],
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
    if (!selectedTeamForMembersCanManage) {
      setTeamMembers([]);
      setMembersLoadError(
        selectedTeamForMembers ? "Admin access required to manage members for this team." : null,
      );
      return;
    }
    void loadTeamMembers(selectedTeamForMembers);
  }, [loadTeamMembers, section, selectedTeamForMembers, selectedTeamForMembersCanManage, user]);

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
      setAdminOverview(null);
      setAdminAuditLogs([]);
      setIsSuperAdmin(false);
      setAdminSection("home");
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

  const handleChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (newPasswordInput !== confirmPasswordInput) {
      setError("New password and confirmation do not match");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await changePassword({
        current_password: currentPasswordInput,
        new_password: newPasswordInput,
      });
      setUser(null);
      setEmail("");
      setPassword("");
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      setTeams([]);
      setPlayers([]);
      setTeamMembers([]);
      setAdminOverview(null);
      setAdminAuditLogs([]);
      setIsSuperAdmin(false);
      setAdminSection("home");
      setSection("dashboard");
      setMode("login");
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Unable to change password");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAdminClub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await createAdminClub(adminClubName.trim());
      setAdminClubName("");
      await loadAdminData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to create club");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignTeamAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminAssignTeamId) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await assignAdminTeamOwner(adminAssignTeamId, adminAssignEmail.trim().toLowerCase());
      setAdminAssignEmail("");
      await loadAdminData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to assign team admin");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveTeamAdmin = async (teamId: string, userId: string, userEmail: string) => {
    if (!window.confirm(`Remove '${userEmail}' as admin for this team?`)) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await removeAdminTeamOwner(teamId, userId);
      await loadAdminData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to remove team admin");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGrantSuperAdmin = async (userId: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await assignUserGlobalRole(userId, "super_admin");
      await loadAdminData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to grant super admin role");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeSuperAdmin = async (userId: string, emailAddress: string) => {
    if (!window.confirm(`Revoke super admin role from '${emailAddress}'?`)) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await revokeUserGlobalRole(userId, "super_admin");
      await loadAdminData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to revoke super admin role");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const focusAssignTeamAdmin = (teamId: string) => {
    setAdminAssignTeamId(teamId);
    window.setTimeout(() => {
      adminAssignEmailInputRef.current?.focus();
      adminAssignEmailInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };

  const handleCreateAdminTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminCreateTeamClubId) {
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await createAdminTeam({
        club_id: adminCreateTeamClubId,
        team_name: adminCreateTeamName.trim(),
      });
      setAdminCreateTeamName("");
      await loadAdminData();
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

  const startAdminClubEdit = (clubId: string, currentName: string) => {
    setAdminEditingClubId(clubId);
    setAdminEditingClubName(currentName);
  };

  const cancelAdminClubEdit = () => {
    setAdminEditingClubId("");
    setAdminEditingClubName("");
  };

  const saveAdminClubEdit = async (clubId: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await updateAdminClub(clubId, adminEditingClubName.trim());
      cancelAdminClubEdit();
      await loadAdminData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to update club");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminClubDelete = async (clubId: string, name: string) => {
    if (!window.confirm(`Delete club '${name}'?`)) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteAdminClub(clubId);
      if (adminEditingClubId === clubId) {
        cancelAdminClubEdit();
      }
      await loadAdminData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to delete club");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startAdminTeamEdit = (teamId: string, clubId: string, currentTeamName: string) => {
    setAdminEditingTeamId(teamId);
    setAdminEditingTeamClubId(clubId);
    setAdminEditingTeamName(currentTeamName);
  };

  const cancelAdminTeamEdit = () => {
    setAdminEditingTeamId("");
    setAdminEditingTeamClubId("");
    setAdminEditingTeamName("");
  };

  const saveAdminTeamEdit = async (teamId: string) => {
    if (!adminEditingTeamClubId || !adminEditingTeamName.trim()) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await updateAdminTeam(teamId, {
        club_id: adminEditingTeamClubId,
        team_name: adminEditingTeamName.trim(),
      });
      cancelAdminTeamEdit();
      await loadAdminData();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to update team");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminTeamDelete = async (teamId: string, teamLabel: string) => {
    if (!window.confirm(`Delete team '${teamLabel}'?`)) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteAdminTeam(teamId);
      if (adminEditingTeamId === teamId) {
        cancelAdminTeamEdit();
      }
      await loadAdminData();
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
          <section className="section-card">
            <div className="stats-grid">
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
            </div>
            <div className="stack-form" style={{ marginTop: "1rem" }}>
              <h3>Account Security</h3>
              <form className="stack-form" onSubmit={handleChangePassword}>
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPasswordInput}
                  onChange={(event) => setCurrentPasswordInput(event.target.value)}
                  minLength={8}
                  required
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={newPasswordInput}
                  onChange={(event) => setNewPasswordInput(event.target.value)}
                  minLength={8}
                  required
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPasswordInput}
                  onChange={(event) => setConfirmPasswordInput(event.target.value)}
                  minLength={8}
                  required
                />
                <button className="button secondary" type="submit" disabled={isSubmitting}>
                  Change Password
                </button>
                <p className="muted">You will be logged out after password change.</p>
              </form>
            </div>
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
                    disabled={isSubmitting || (team.my_role ? !isTeamAdminRole(team.my_role) : false)}
                    title={team.my_role && !isTeamAdminRole(team.my_role) ? "Team admin access required" : "Delete team"}
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
                disabled={
                  isSubmitting ||
                  teams.length === 0 ||
                  !selectedTeamForPlayers ||
                  !selectedTeamForPlayersCanManage
                }
                type="submit"
              >
                Add Player
              </button>
              {!selectedTeamForPlayersCanManage && selectedTeamForPlayers ? (
                <p className="muted">Team admin access required to add players.</p>
              ) : null}
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
                    disabled={
                      isSubmitting ||
                      (() => {
                        const role = roleByTeamId[player.team_id];
                        return role !== undefined && !isTeamAdminRole(role);
                      })()
                    }
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
                <option value="team_admin">Admin</option>
                <option value="data_enterer">Data Enterer</option>
              </select>
              <button
                className="button primary"
                disabled={isSubmitting || !selectedTeamForMembers || !selectedTeamForMembersCanManage}
                type="submit"
              >
                Add Member
              </button>
              {!selectedTeamForMembersCanManage && selectedTeamForMembers ? (
                <p className="muted">Team admin access required to manage members.</p>
              ) : null}
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
                        disabled={isSubmitting || !selectedTeamForMembersCanManage}
                      >
                        <option value="team_admin">Admin</option>
                        <option value="data_enterer">Data Enterer</option>
                      </select>
                      <button
                        className="button secondary"
                        onClick={() => handleDeleteTeamMember(membership.id)}
                        type="button"
                        disabled={isSubmitting || isCurrentUser || !selectedTeamForMembersCanManage}
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

        {section === "admin" ? (
          <section className="section-card">
            <div className="admin-subnav">
              {ADMIN_SUB_NAV_ITEMS.map((item) => (
                <button
                  className={`admin-subnav-item ${adminSection === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => setAdminSection(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            {isAdminLoading ? <p className="muted">Loading overview...</p> : null}
            {!isAdminLoading && !adminOverview ? (
              <p className="muted">Unable to load admin overview.</p>
            ) : null}
            {adminOverview && adminSection === "home" ? (
              <div className="stack-form">
                <div>
                  <h3>Platform Snapshot</h3>
                  <p className="muted">Users: {adminOverview.users.length}</p>
                  <p className="muted">Clubs: {adminOverview.clubs.length}</p>
                  <p className="muted">Teams: {adminOverview.teams.length}</p>
                  <p className="muted">
                    Unclaimed teams: {adminOverview.teams.filter((team) => team.owners.length === 0).length}
                  </p>
                </div>
              </div>
            ) : null}
            {adminOverview && adminSection === "clubs" ? (
              <div className="stack-form">
                <div>
                  <h3>Create Club</h3>
                  <form className="stack-form" onSubmit={handleCreateAdminClub}>
                    <input
                      placeholder="Club name"
                      value={adminClubName}
                      onChange={(event) => setAdminClubName(event.target.value)}
                      required
                    />
                    <button className="button primary" disabled={isSubmitting} type="submit">
                      Create Club
                    </button>
                  </form>
                </div>
                <div>
                  <h3>Clubs</h3>
                  {adminOverview.clubs.length === 0 ? <p className="muted">No clubs.</p> : null}
                  {adminOverview.clubs.map((club) => (
                    <div className="list-row" key={club.id}>
                      {adminEditingClubId === club.id ? (
                        <input
                          value={adminEditingClubName}
                          onChange={(event) => setAdminEditingClubName(event.target.value)}
                        />
                      ) : (
                        <span>{club.name}</span>
                      )}
                      <div className="member-actions">
                        {adminEditingClubId === club.id ? (
                          <>
                            <button
                              className="button primary"
                              type="button"
                              disabled={isSubmitting || !adminEditingClubName.trim()}
                              onClick={() => saveAdminClubEdit(club.id)}
                            >
                              Save
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isSubmitting}
                              onClick={cancelAdminClubEdit}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => startAdminClubEdit(club.id, club.name)}
                            >
                              Edit
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleAdminClubDelete(club.id, club.name)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {adminOverview && adminSection === "teams" ? (
              <div className="stack-form">
                <div>
                  <h3>Create Team</h3>
                  <form className="stack-form" onSubmit={handleCreateAdminTeam}>
                    <select
                      value={adminCreateTeamClubId}
                      onChange={(event) => setAdminCreateTeamClubId(event.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select club
                      </option>
                      {adminOverview.clubs.map((club) => (
                        <option key={club.id} value={club.id}>
                          {club.name}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Team name"
                      value={adminCreateTeamName}
                      onChange={(event) => setAdminCreateTeamName(event.target.value)}
                      required
                    />
                    <button
                      className="button primary"
                      disabled={isSubmitting || !adminCreateTeamClubId || !adminCreateTeamName.trim()}
                      type="submit"
                    >
                      Create Team
                    </button>
                  </form>
                </div>
                <div>
                  <h3>Assign Team Admin</h3>
                  <form className="stack-form" onSubmit={handleAssignTeamAdmin}>
                    <select
                      value={adminAssignTeamId}
                      onChange={(event) => setAdminAssignTeamId(event.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select team
                      </option>
                      {adminOverview.teams.map((adminTeam) => (
                        <option key={adminTeam.id} value={adminTeam.id}>
                          {adminTeam.club_name} {adminTeam.team_name}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="admin@email.com"
                      type="email"
                      value={adminAssignEmail}
                      onChange={(event) => setAdminAssignEmail(event.target.value)}
                      ref={adminAssignEmailInputRef}
                      required
                    />
                    <button
                      className="button primary"
                      disabled={isSubmitting || !adminAssignTeamId}
                      type="submit"
                    >
                      Assign Team Admin
                    </button>
                  </form>
                </div>
                <div className="member-actions">
                  <label className="muted" htmlFor="unclaimed-filter">
                    Unclaimed only
                  </label>
                  <input
                    id="unclaimed-filter"
                    type="checkbox"
                    checked={showUnclaimedOnly}
                    onChange={(event) => setShowUnclaimedOnly(event.target.checked)}
                  />
                </div>
                <div>
                  <h3>Teams ({filteredAdminTeams.length})</h3>
                  {filteredAdminTeams.length === 0 ? <p className="muted">No teams.</p> : null}
                  {filteredAdminTeams.map((adminTeam) => (
                    <div className="list-row" key={adminTeam.id}>
                      <div>
                        {adminEditingTeamId === adminTeam.id ? (
                          <div className="member-actions">
                            <select
                              value={adminEditingTeamClubId}
                              onChange={(event) => setAdminEditingTeamClubId(event.target.value)}
                            >
                              {adminOverview.clubs.map((club) => (
                                <option key={club.id} value={club.id}>
                                  {club.name}
                                </option>
                              ))}
                            </select>
                            <input
                              value={adminEditingTeamName}
                              onChange={(event) => setAdminEditingTeamName(event.target.value)}
                              placeholder="Team name"
                            />
                          </div>
                        ) : (
                          <>
                            <span>
                              {adminTeam.club_name} {adminTeam.team_name}
                            </span>
                            {adminTeam.owners.length > 0 ? (
                              <div className="stack-form">
                                {adminTeam.owners.map((owner) => (
                                  <div className="member-actions" key={`${adminTeam.id}-${owner.user_id}`}>
                                    <span className="muted">{owner.user_email}</span>
                                    <button
                                      className="button secondary"
                                      type="button"
                                      disabled={isSubmitting}
                                      onClick={() =>
                                        handleRemoveTeamAdmin(adminTeam.id, owner.user_id, owner.user_email)
                                      }
                                    >
                                      Remove Admin
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="muted">Unclaimed</p>
                            )}
                          </>
                        )}
                      </div>
                      <div className="member-actions">
                        {adminEditingTeamId === adminTeam.id ? (
                          <>
                            <button
                              className="button primary"
                              type="button"
                              disabled={isSubmitting || !adminEditingTeamName.trim() || !adminEditingTeamClubId}
                              onClick={() => saveAdminTeamEdit(adminTeam.id)}
                            >
                              Save
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isSubmitting}
                              onClick={cancelAdminTeamEdit}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => focusAssignTeamAdmin(adminTeam.id)}
                            >
                              Add Admin
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isSubmitting}
                              onClick={() =>
                                startAdminTeamEdit(adminTeam.id, adminTeam.club_id, adminTeam.team_name)
                              }
                            >
                              Edit
                            </button>
                            <button
                              className="button secondary"
                              type="button"
                              disabled={isSubmitting}
                              onClick={() =>
                                handleAdminTeamDelete(
                                  adminTeam.id,
                                  `${adminTeam.club_name} ${adminTeam.team_name}`,
                                )
                              }
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {adminOverview && adminSection === "users" ? (
              <div className="stack-form">
                <div>
                  <h3>Users ({adminOverview.users.length})</h3>
                  {adminOverview.users.length === 0 ? <p className="muted">No users.</p> : null}
                  {adminOverview.users.map((adminUser) => (
                    <div className="list-row" key={adminUser.id}>
                      <div>
                        <span>{adminUser.email}</span>
                        <p className="muted">
                          {adminUser.global_roles.length > 0
                            ? adminUser.global_roles.join(", ")
                            : "No global roles"}
                        </p>
                      </div>
                      <div className="member-actions">
                        {adminUser.global_roles.includes("super_admin") ? (
                          <button
                            className="button secondary"
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleRevokeSuperAdmin(adminUser.id, adminUser.email)}
                          >
                            Revoke Super Admin
                          </button>
                        ) : (
                          <button
                            className="button secondary"
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleGrantSuperAdmin(adminUser.id)}
                          >
                            Make Super Admin
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {adminSection === "audit" ? (
              <div className="stack-form">
                <div>
                  <h3>Audit Log ({adminAuditLogs.length})</h3>
                  {adminAuditLogs.length === 0 ? <p className="muted">No audit records.</p> : null}
                  {adminAuditLogs.map((entry) => (
                    <div className="list-row" key={entry.id}>
                      <div>
                        <span>{entry.action}</span>
                        <p className="muted">
                          {entry.actor_user_email} · {new Date(entry.created_at).toLocaleString()}
                        </p>
                        <p className="muted">
                          {entry.target_type}:{entry.target_id}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}

export default App;

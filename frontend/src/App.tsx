import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import "./index.css";
import {
  addTeamMember,
  assignAdminTeamOwner,
  assignUserGlobalRole,
  changePassword,
  createFixture,
  createAdminClub,
  createAdminTeam,
  deleteAdminClub,
  deleteAdminTeam,
  deleteFixture,
  createPlayer,
  createTeam,
  deletePlayer,
  deleteTeam,
  deleteTeamMember,
  getAdminOverview,
  getAdminAuditLogs,
  getMe,
  listFixtures,
  listPlayers,
  listTeamDirectory,
  listTeamMembers,
  listTeams,
  login,
  logout,
  removeAdminTeamOwner,
  register,
  revokeUserGlobalRole,
  updateFixture,
  updateAdminTeam,
  updateAdminClub,
  updateTeamMember,
} from "./api";
import type {
  AdminAuditLogEntry,
  AdminOverview,
  Fixture,
  MatchFormat,
  Player,
  Team,
  TeamDirectory,
  TeamMember,
  TeamRole,
  User,
} from "./types/auth";

type AuthMode = "login" | "register";
type Section = "dashboard" | "fixtures" | "teams" | "players" | "members" | "admin";
type AdminSection = "home" | "clubs" | "teams" | "users" | "audit";

const POSITION_OPTIONS = ["GK", "RB", "RWB", "CB", "LB", "LWB", "DM", "CM", "AM", "RW", "LW", "ST"];
const BASE_NAV_ITEMS: Array<{ id: Exclude<Section, "admin">; label: string; shortLabel: string }> = [
  { id: "dashboard", label: "Dashboard", shortLabel: "D" },
  { id: "fixtures", label: "Fixtures", shortLabel: "F" },
  { id: "teams", label: "Teams", shortLabel: "T" },
  { id: "players", label: "Players", shortLabel: "P" },
  { id: "members", label: "Members", shortLabel: "M" },
];
const MATCH_FORMAT_OPTIONS: Array<{ value: MatchFormat; label: string }> = [
  { value: "5_aside", label: "5 aside" },
  { value: "7_aside", label: "7 aside" },
  { value: "9_aside", label: "9 aside" },
  { value: "11_aside", label: "11 aside" },
];
const FIXTURE_STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "final", label: "Final" },
  { value: "cancelled", label: "Cancelled" },
];
const TEAM_MEMBER_ROLE_OPTIONS = [
  { value: "team_admin", label: "Admin" },
  { value: "data_enterer", label: "Data Enterer" },
];
const CALENDAR_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

function fixtureStatusClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "final") {
    return "fixture-chip final";
  }
  if (normalized === "cancelled") {
    return "fixture-chip cancelled";
  }
  return "fixture-chip scheduled";
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type SearchableOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  value: string;
  options: SearchableOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (nextValue: string) => void;
};

function SearchableSelect({
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const selected = options.find((option) => option.value === value);
    setQuery(selected?.label ?? "");
  }, [options, value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = query.trim()
    ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className={`searchable-select ${disabled ? "disabled" : ""}`} ref={rootRef}>
      <input
        value={query}
        onFocus={() => {
          if (!disabled) {
            setIsOpen(true);
          }
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);
          const exact = options.find((option) => option.label.toLowerCase() === nextQuery.trim().toLowerCase());
          onChange(exact?.value ?? "");
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
      {isOpen && !disabled ? (
        <div className="searchable-select-menu">
          {filteredOptions.length === 0 ? <p className="searchable-select-empty">No matches</p> : null}
          {filteredOptions.map((option) => (
            <button
              className={`searchable-select-option ${option.value === value ? "active" : ""}`}
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setQuery(option.label);
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const [teamDirectory, setTeamDirectory] = useState<TeamDirectory[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogEntry[]>([]);

  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [fixtureTeamId, setFixtureTeamId] = useState("");
  const [fixtureOpponentTeamId, setFixtureOpponentTeamId] = useState("");
  const [fixtureFormat, setFixtureFormat] = useState<MatchFormat>("11_aside");
  const [fixtureKickoff, setFixtureKickoff] = useState("");
  const [fixtureStatus, setFixtureStatus] = useState("scheduled");
  const [editingFixtureId, setEditingFixtureId] = useState("");
  const [isFixtureComposerOpen, setIsFixtureComposerOpen] = useState(false);
  const [fixtureCalendarMonth, setFixtureCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
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
    () => ({ teams: teams.length, fixtures: fixtures.length, players: players.length, members: teamMembers.length }),
    [fixtures.length, players.length, teamMembers.length, teams.length],
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
  const ownedTeams = useMemo(
    () => teams.filter((team) => team.my_role && isTeamAdminRole(team.my_role)),
    [teams],
  );
  const fixtureOppositionOptions = useMemo(
    () => teamDirectory.filter((team) => team.id !== fixtureTeamId),
    [fixtureTeamId, teamDirectory],
  );
  const clubNameOptions = useMemo(() => {
    const uniqueClubNames = Array.from(new Set(teamDirectory.map((team) => team.club_name.trim()).filter(Boolean)));
    return uniqueClubNames.sort((a, b) => a.localeCompare(b)).map((name) => ({ value: name, label: name }));
  }, [teamDirectory]);
  const selectedFixtureTeamName = useMemo(
    () => ownedTeams.find((team) => team.id === fixtureTeamId)?.display_name ?? "",
    [fixtureTeamId, ownedTeams],
  );
  const fixturesByDateKey = useMemo(() => {
    const grouped: Record<string, Fixture[]> = {};
    for (const fixture of fixtures) {
      if (!fixture.kickoff_at) {
        continue;
      }
      const key = toLocalDateKey(new Date(fixture.kickoff_at));
      grouped[key] = grouped[key] ? [...grouped[key], fixture] : [fixture];
    }
    return grouped;
  }, [fixtures]);
  const calendarCells = useMemo(() => {
    const year = fixtureCalendarMonth.getFullYear();
    const month = fixtureCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const cells: Array<{ date: Date; inCurrentMonth: boolean }> = [];

    for (let i = startWeekday - 1; i >= 0; i -= 1) {
      cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inCurrentMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(year, month, day), inCurrentMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - (startWeekday + daysInMonth) + 1;
      cells.push({ date: new Date(year, month + 1, nextDay), inCurrentMonth: false });
    }
    return cells;
  }, [fixtureCalendarMonth]);

  const loadWorkspaceData = useCallback(async (preferredFixtureTeamId = "") => {
    setIsWorkspaceLoading(true);
    try {
      const [teamsResponse, playersResponse, teamDirectoryResponse] = await Promise.all([
        listTeams(),
        listPlayers(),
        listTeamDirectory(),
      ]);
      const ownedTeamIds = new Set(
        teamsResponse.filter((team) => team.my_role && isTeamAdminRole(team.my_role)).map((team) => team.id),
      );
      const nextFixtureTeamId = ownedTeamIds.has(preferredFixtureTeamId)
        ? preferredFixtureTeamId
        : teamsResponse.find((team) => team.my_role && isTeamAdminRole(team.my_role))?.id || "";
      const fixturesResponse = nextFixtureTeamId ? await listFixtures(nextFixtureTeamId) : [];
      setTeams(teamsResponse);
      setTeamDirectory(teamDirectoryResponse);
      setFixtures(fixturesResponse);
      setPlayers(playersResponse);
      setSelectedTeamForPlayers((current) => current || teamsResponse[0]?.id || "");
      setSelectedTeamForMembers((current) => current || teamsResponse[0]?.id || "");
      setFixtureTeamId(nextFixtureTeamId);
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

  useEffect(() => {
    if (!user || !fixtureTeamId) {
      return;
    }
    void loadFixturesForTeam(fixtureTeamId);
  }, [fixtureTeamId, loadFixturesForTeam, user]);

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
      setFixtures([]);
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
      setTeamDirectory((existing) =>
        [
          ...existing,
          {
            id: created.id,
            club_id: created.club_id,
            club_name: created.club_name,
            team_name: created.team_name,
            display_name: created.display_name,
          },
        ].sort((a, b) => a.display_name.localeCompare(b.display_name)),
      );
      setSelectedTeamForPlayers(created.id);
      setSelectedTeamForMembers(created.id);
      setFixtureTeamId((current) => current || created.id);
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

      if (selectedTeamForPlayers === teamId) {
        setSelectedTeamForPlayers(remainingTeams[0]?.id ?? "");
      }
      if (selectedTeamForMembers === teamId) {
        const next = remainingTeams[0]?.id ?? "";
        setSelectedTeamForMembers(next);
        await loadTeamMembers(next);
      }
      if (fixtureTeamId === teamId) {
        const nextOwned = remainingTeams.find((team) => team.my_role && isTeamAdminRole(team.my_role))?.id ?? "";
        setFixtureTeamId(nextOwned);
        setFixtures([]);
        resetFixtureForm();
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

  const resetFixtureForm = () => {
    setEditingFixtureId("");
    setFixtureFormat("11_aside");
    setFixtureKickoff("");
    setFixtureStatus("scheduled");
    setFixtureOpponentTeamId("");
    setIsFixtureComposerOpen(false);
  };

  const openFixtureComposer = (date: Date | null = null) => {
    setEditingFixtureId("");
    setFixtureFormat("11_aside");
    setFixtureStatus("scheduled");
    setFixtureOpponentTeamId("");
    if (date) {
      const local = new Date(date);
      local.setHours(18, 0, 0, 0);
      const offset = local.getTimezoneOffset();
      setFixtureKickoff(new Date(local.getTime() - offset * 60_000).toISOString().slice(0, 16));
    } else {
      setFixtureKickoff("");
    }
    setIsFixtureComposerOpen(true);
  };

  const handleCreateOrUpdateFixture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fixtureTeamId) {
      setError("Select one of your teams first");
      return;
    }
    if (!fixtureOpponentTeamId) {
      setError("Please select a valid opposition team from the list");
      return;
    }
    if (fixtureTeamId === fixtureOpponentTeamId) {
      setError("Opposition team must be different");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const payload = {
        home_team_id: fixtureTeamId,
        away_team_id: fixtureOpponentTeamId,
        format: fixtureFormat,
        kickoff_at: fixtureKickoff ? new Date(fixtureKickoff).toISOString() : null,
        status: editingFixtureId ? fixtureStatus.trim() || "scheduled" : "scheduled",
      };

      if (editingFixtureId) {
        await updateFixture(editingFixtureId, payload);
      } else {
        await createFixture(payload);
      }
      await loadFixturesForTeam(fixtureTeamId);
      resetFixtureForm();
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to save fixture");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFixture = async (fixtureId: string) => {
    if (!window.confirm("Delete this fixture?")) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteFixture(fixtureId);
      if (editingFixtureId === fixtureId) {
        resetFixtureForm();
      }
      await loadFixturesForTeam(fixtureTeamId);
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to delete fixture");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const startFixtureEdit = (fixture: Fixture) => {
    setEditingFixtureId(fixture.id);
    const selectedTeamIsHome = fixture.home_team_id === fixtureTeamId;
    const oppositionTeamId = selectedTeamIsHome ? fixture.away_team_id : fixture.home_team_id;
    setFixtureOpponentTeamId(oppositionTeamId);
    setFixtureFormat(fixture.format);
    setFixtureStatus(
      FIXTURE_STATUS_OPTIONS.some((option) => option.value === fixture.status.toLowerCase())
        ? fixture.status.toLowerCase()
        : "scheduled",
    );
    if (fixture.kickoff_at) {
      const date = new Date(fixture.kickoff_at);
      const offset = date.getTimezoneOffset();
      const localDate = new Date(date.getTime() - offset * 60_000);
      setFixtureKickoff(localDate.toISOString().slice(0, 16));
    } else {
      setFixtureKickoff("");
    }
    setIsFixtureComposerOpen(true);
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

        {section === "fixtures" ? (
          <section className="section-card">
            <div className="fixture-toolbar">
              <SearchableSelect
                value={fixtureTeamId}
                options={ownedTeams.map((team) => ({ value: team.id, label: team.display_name }))}
                placeholder="Select your team"
                onChange={(nextValue) => {
                  setFixtureTeamId(nextValue);
                  resetFixtureForm();
                }}
              />
              <div className="fixture-month-controls">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setFixtureCalendarMonth(
                      (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                    )
                  }
                >
                  Prev
                </button>
                <h3>{fixtureCalendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    setFixtureCalendarMonth(
                      (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                    )
                  }
                >
                  Next
                </button>
              </div>
              <button
                className="button primary"
                type="button"
                disabled={!fixtureTeamId}
                onClick={() => openFixtureComposer()}
              >
                + Add Fixture
              </button>
            </div>

            {!fixtureTeamId ? <p className="muted">Select one of your teams to view fixtures.</p> : null}
            {fixtureTeamId ? (
              <>
                <p className="muted">Showing fixtures for {selectedFixtureTeamName}.</p>
                <div className="calendar-weekdays">
                  {CALENDAR_WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {calendarCells.map(({ date, inCurrentMonth }) => {
                    const dateKey = toLocalDateKey(date);
                    const dayFixtures = fixturesByDateKey[dateKey] ?? [];
                    return (
                      <div
                        key={`${dateKey}-${inCurrentMonth ? "in" : "out"}`}
                        className={`calendar-cell ${inCurrentMonth ? "" : "outside"}`}
                        onClick={() => inCurrentMonth && openFixtureComposer(date)}
                        onKeyDown={(event) => {
                          if (!inCurrentMonth) {
                            return;
                          }
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openFixtureComposer(date);
                          }
                        }}
                        role={inCurrentMonth ? "button" : undefined}
                        tabIndex={inCurrentMonth ? 0 : -1}
                      >
                        <span className="calendar-date">{date.getDate()}</span>
                        <div className="calendar-fixtures">
                          {dayFixtures.map((fixture) => {
                            const oppositionName =
                              fixture.home_team_id === fixtureTeamId
                                ? `${fixture.away_club_name} ${fixture.away_team_name}`
                                : `${fixture.home_club_name} ${fixture.home_team_name}`;
                            return (
                              <button
                                key={fixture.id}
                                type="button"
                                className={fixtureStatusClass(fixture.status)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (fixture.can_manage) {
                                    startFixtureEdit(fixture);
                                  }
                                }}
                                title={`${oppositionName}${fixture.kickoff_at ? ` · ${new Date(fixture.kickoff_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`}
                              >
                                {fixture.kickoff_at
                                  ? new Date(fixture.kickoff_at).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "TBD"}{" "}
                                vs {oppositionName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            {isFixtureComposerOpen ? (
              <div className="fixture-composer-overlay" role="dialog" aria-modal="true">
                <form className="fixture-composer" onSubmit={handleCreateOrUpdateFixture}>
                  <h3>{editingFixtureId ? "Edit Fixture" : "Add Fixture"}</h3>
                  <p className="muted">{selectedFixtureTeamName}</p>
                  <SearchableSelect
                    value={fixtureOpponentTeamId}
                    onChange={(nextValue) => setFixtureOpponentTeamId(nextValue)}
                    options={fixtureOppositionOptions.map((team) => ({
                      value: team.id,
                      label: team.display_name,
                    }))}
                    placeholder="Select opposition team"
                  />
                  <SearchableSelect
                    value={fixtureFormat}
                    options={MATCH_FORMAT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                    onChange={(nextValue) => setFixtureFormat(nextValue as MatchFormat)}
                    placeholder="Select fixture format"
                  />
                  <input
                    type="datetime-local"
                    value={fixtureKickoff}
                    onChange={(event) => setFixtureKickoff(event.target.value)}
                    step={900}
                  />
                  <SearchableSelect
                    value={fixtureStatus}
                    options={FIXTURE_STATUS_OPTIONS}
                    onChange={setFixtureStatus}
                    placeholder="Select fixture status"
                    disabled={!editingFixtureId}
                  />
                  <div className="member-actions">
                    <button
                      className="button primary"
                      disabled={isSubmitting || !fixtureTeamId || !fixtureOpponentTeamId}
                      type="submit"
                    >
                      {editingFixtureId ? "Save Fixture" : "Create Fixture"}
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      disabled={isSubmitting}
                      onClick={resetFixtureForm}
                    >
                      Cancel
                    </button>
                    {editingFixtureId ? (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleDeleteFixture(editingFixtureId)}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            ) : null}
          </section>
        ) : null}

        {section === "teams" ? (
          <section className="section-card two-col">
            <form className="stack-form" onSubmit={handleCreateTeam}>
              <h3>Create Team</h3>
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
              <SearchableSelect
                value={selectedTeamForPlayers}
                onChange={setSelectedTeamForPlayers}
                options={teams.map((team) => ({ value: team.id, label: team.display_name }))}
                placeholder="Select team"
              />
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
              <SearchableSelect
                value={selectedTeamForMembers}
                onChange={setSelectedTeamForMembers}
                options={teams.map((team) => ({ value: team.id, label: team.display_name }))}
                placeholder="Select team"
              />
              <input
                placeholder="user@email.com"
                type="email"
                value={newMemberEmail}
                onChange={(event) => setNewMemberEmail(event.target.value)}
                required
              />
              <SearchableSelect
                value={newMemberRole}
                onChange={(nextValue) => setNewMemberRole(nextValue as TeamRole)}
                options={TEAM_MEMBER_ROLE_OPTIONS}
                placeholder="Select role"
              />
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
                      <SearchableSelect
                        value={membership.role}
                        onChange={(nextValue) => handleMemberRoleChange(membership.id, nextValue as TeamRole)}
                        options={TEAM_MEMBER_ROLE_OPTIONS}
                        placeholder="Select role"
                        disabled={isSubmitting || !selectedTeamForMembersCanManage}
                      />
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
                    <SearchableSelect
                      value={adminCreateTeamClubId}
                      onChange={setAdminCreateTeamClubId}
                      options={adminOverview.clubs.map((club) => ({ value: club.id, label: club.name }))}
                      placeholder="Select club"
                    />
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
                    <SearchableSelect
                      value={adminAssignTeamId}
                      onChange={setAdminAssignTeamId}
                      options={adminOverview.teams.map((adminTeam) => ({
                        value: adminTeam.id,
                        label: `${adminTeam.club_name} ${adminTeam.team_name}`,
                      }))}
                      placeholder="Select team"
                    />
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
                            <SearchableSelect
                              value={adminEditingTeamClubId}
                              onChange={setAdminEditingTeamClubId}
                              options={adminOverview.clubs.map((club) => ({
                                value: club.id,
                                label: club.name,
                              }))}
                              placeholder="Select club"
                            />
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

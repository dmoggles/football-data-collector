import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";

import "./index.css";
import { PitchDiagram } from "./components/PitchDiagram";
import { getFormationSlots } from "./domain/formations";
import type { FormationSlot } from "./domain/formations";
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
  getMatchPrepPlan,
  getMe,
  listFixtures,
  listMatchPrepFixtures,
  listPlayers,
  listTeamDirectory,
  listTeamMembers,
  listTeams,
  login,
  logout,
  removeAdminTeamOwner,
  resolveApiAssetUrl,
  register,
  revokeUserGlobalRole,
  uploadClubLogo,
  updateFixture,
  upsertMatchPrepPlan,
  updatePlayer,
  updateAdminTeam,
  updateAdminClub,
  updateTeamMember,
} from "./api";
import type {
  AdminAuditLogEntry,
  AdminOverview,
  Fixture,
  MatchFormat,
  MatchPrepFixture,
  MatchPrepPlan,
  MatchPeriodFormat,
  Player,
  Team,
  TeamDirectory,
  TeamMember,
  TeamRole,
  User,
} from "./types/auth";

type AuthMode = "login" | "register";
type Section = "dashboard" | "fixtures" | "match_prep" | "players" | "teams" | "members" | "settings" | "admin";
type AdminSection = "home" | "clubs" | "teams" | "users" | "audit";
type FixtureVenue = "home" | "away";

const POSITION_OPTIONS = ["GK", "RB", "RWB", "CB", "LB", "LWB", "DM", "CM", "AM", "RW", "LW", "ST"];
const BASE_NAV_ITEMS: Array<{ id: Exclude<Section, "admin">; label: string; shortLabel: string }> = [
  { id: "dashboard", label: "Dashboard", shortLabel: "D" },
  { id: "fixtures", label: "Fixtures", shortLabel: "F" },
  { id: "match_prep", label: "Match Prep", shortLabel: "MP" },
  { id: "players", label: "Players", shortLabel: "P" },
  { id: "teams", label: "Teams", shortLabel: "T" },
  { id: "members", label: "Members", shortLabel: "M" },
  { id: "settings", label: "Settings", shortLabel: "S" },
];
const MATCH_FORMAT_OPTIONS: Array<{ value: MatchFormat; label: string }> = [
  { value: "5_aside", label: "5 Aside" },
  { value: "7_aside", label: "7 Aside" },
  { value: "9_aside", label: "9 Aside" },
  { value: "11_aside", label: "11 Aside" },
];
const MATCH_PERIOD_FORMAT_OPTIONS: Array<{ value: MatchPeriodFormat; label: string }> = [
  { value: "halves", label: "Halves" },
  { value: "quarters", label: "Quarters" },
  { value: "non_stop", label: "Non-stop" },
];
const FIXTURE_STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "final", label: "Final" },
  { value: "cancelled", label: "Cancelled" },
];
const KICKOFF_TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, "0");
  const minutes = String((index % 4) * 15).padStart(2, "0");
  const value = `${hours}:${minutes}`;
  return { value, label: value };
});
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

function fixtureFormatIcon(format: MatchFormat): string {
  if (format === "5_aside") {
    return "⚽5";
  }
  if (format === "7_aside") {
    return "⚽7";
  }
  if (format === "9_aside") {
    return "⚽9";
  }
  return "⚽11";
}

function toQuarterHourTime(date: Date): string {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const roundedMinutes = Math.round(minutes / 15) * 15;
  if (roundedMinutes === 60) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
  } else {
    rounded.setMinutes(roundedMinutes, 0, 0);
  }
  const hours = String(rounded.getHours()).padStart(2, "0");
  const mins = String(rounded.getMinutes()).padStart(2, "0");
  return `${hours}:${mins}`;
}

function timeToMinutes(timeValue: string): number | null {
  const [hoursText, minutesText] = timeValue.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

function normalizeRoleCode(role: string): string {
  return role.trim().toUpperCase();
}

function parsePlayerPositionCodes(position: string | null): string[] {
  if (!position) {
    return [];
  }
  return position
    .split(/[,\|/]/)
    .map((item) => normalizeRoleCode(item))
    .filter(Boolean);
}

function isPositionMismatch(playerPosition: string | null, slotRole: string): boolean {
  const playerRoles = parsePlayerPositionCodes(playerPosition);
  if (playerRoles.length === 0) {
    return false;
  }

  const normalizedSlotRole = normalizeRoleCode(slotRole);
  if (playerRoles.includes(normalizedSlotRole)) {
    return false;
  }

  const aliasGroups: string[][] = [
    ["CB", "LCB", "RCB"],
    ["ST", "CF"],
    ["LM", "LW"],
    ["RM", "RW"],
    ["LB", "LWB"],
    ["RB", "RWB"],
  ];
  for (const group of aliasGroups) {
    if (group.includes(normalizedSlotRole) && playerRoles.some((role) => group.includes(role))) {
      return false;
    }
  }
  return true;
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
  className?: string;
  onChange: (nextValue: string) => void;
};

function SearchableSelect({
  value,
  options,
  placeholder,
  disabled = false,
  className,
  onChange,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
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

  const selectedOptionLabel = options.find((option) => option.value === value)?.label ?? "";
  const normalizedQuery = query.trim().toLowerCase();
  const shouldFilter = Boolean(
    normalizedQuery && normalizedQuery !== selectedOptionLabel.trim().toLowerCase(),
  );
  const filteredOptions = shouldFilter
    ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
    : options;

  const selectOption = useCallback(
    (nextValue: string) => {
      const selected = options.find((option) => option.value === nextValue);
      onChange(nextValue);
      setQuery(selected?.label ?? "");
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange, options],
  );

  return (
    <div className={`searchable-select ${disabled ? "disabled" : ""} ${className ?? ""}`} ref={rootRef}>
      <input
        value={query}
        onFocus={() => {
          if (!disabled) {
            setIsOpen(true);
            setActiveIndex(0);
          }
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);
          setActiveIndex(0);
          const exact = options.find((option) => option.label.toLowerCase() === nextQuery.trim().toLowerCase());
          onChange(exact?.value ?? "");
        }}
        onKeyDown={(event) => {
          if (disabled) {
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              setActiveIndex(0);
              return;
            }
            setActiveIndex((current) => Math.min(current + 1, filteredOptions.length - 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              setActiveIndex(Math.max(filteredOptions.length - 1, 0));
              return;
            }
            setActiveIndex((current) => Math.max(current - 1, 0));
            return;
          }
          if (event.key === "Enter" && isOpen) {
            event.preventDefault();
            if (activeIndex >= 0 && filteredOptions[activeIndex]) {
              selectOption(filteredOptions[activeIndex].value);
            }
            return;
          }
          if (event.key === "Escape") {
            setIsOpen(false);
            setActiveIndex(-1);
            return;
          }
          if (event.key === "Tab") {
            setIsOpen(false);
            setActiveIndex(-1);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
      {isOpen && !disabled ? (
        <div className="searchable-select-menu">
          {filteredOptions.length === 0 ? <p className="searchable-select-empty">No matches</p> : null}
          {filteredOptions.map((option, index) => (
            <button
              className={`searchable-select-option ${
                option.value === value || index === activeIndex ? "active" : ""
              }`}
              key={option.value}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(option.value)}
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
  const [matchPrepFixtures, setMatchPrepFixtures] = useState<MatchPrepFixture[]>([]);
  const [matchPrepPlan, setMatchPrepPlan] = useState<MatchPrepPlan | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminAuditLogs, setAdminAuditLogs] = useState<AdminAuditLogEntry[]>([]);

  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [fixtureOpponentTeamId, setFixtureOpponentTeamId] = useState("");
  const [fixtureFormat, setFixtureFormat] = useState<MatchFormat>("11_aside");
  const [fixturePeriodFormat, setFixturePeriodFormat] = useState<MatchPeriodFormat>("halves");
  const [fixturePeriodLengthMinutes, setFixturePeriodLengthMinutes] = useState("35");
  const [fixtureVenue, setFixtureVenue] = useState<FixtureVenue>("home");
  const [fixtureKickoffDate, setFixtureKickoffDate] = useState("");
  const [fixtureKickoffTime, setFixtureKickoffTime] = useState("");
  const [fixtureStatus, setFixtureStatus] = useState("scheduled");
  const [editingFixtureId, setEditingFixtureId] = useState("");
  const [isFixtureComposerOpen, setIsFixtureComposerOpen] = useState(false);
  const [isPlayerComposerOpen, setIsPlayerComposerOpen] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [fixtureCalendarMonth, setFixtureCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");

  const [selectedFixtureForMatchPrep, setSelectedFixtureForMatchPrep] = useState("");
  const [matchPrepDragTarget, setMatchPrepDragTarget] = useState("");
  const [activeMatchPrepSegmentIndex, setActiveMatchPrepSegmentIndex] = useState(0);

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
  const [clubLogoUploadClubId, setClubLogoUploadClubId] = useState("");

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

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams],
  );
  const selectedTeamName = selectedTeam?.display_name ?? "";
  const selectedTeamClubLogoUrl = useMemo(
    () => resolveApiAssetUrl(selectedTeam?.club_logo_url),
    [selectedTeam],
  );
  const matchPrepSlots = useMemo(
    () => (matchPrepPlan ? getFormationSlots(matchPrepPlan.format, matchPrepPlan.formation) : []),
    [matchPrepPlan],
  );
  const matchPrepBasePlayerBySlotId = useMemo(() => {
    if (!matchPrepPlan) {
      return {} as Record<string, MatchPrepPlan["players"][number]>;
    }
    const mapping: Record<string, MatchPrepPlan["players"][number]> = {};
    for (const player of matchPrepPlan.players) {
      if (player.lineup_slot) {
        mapping[player.lineup_slot] = player;
      }
    }
    return mapping;
  }, [matchPrepPlan]);
  const matchPrepPlayerBySlotId = useMemo(() => {
    if (!matchPrepPlan) {
      return {} as Record<string, MatchPrepPlan["players"][number]>;
    }

    const playersById: Record<string, MatchPrepPlan["players"][number]> = {};
    for (const player of matchPrepPlan.players) {
      playersById[player.player_id] = player;
    }

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
      if (!outSlotId) {
        continue;
      }
      const existingInSlotId = playerToSlotId[swap.player_in_id];
      if (existingInSlotId) {
        delete slotToPlayerId[existingInSlotId];
      }
      delete playerToSlotId[swap.player_out_id];
      slotToPlayerId[outSlotId] = swap.player_in_id;
      playerToSlotId[swap.player_in_id] = outSlotId;
    }

    const mapping: Record<string, MatchPrepPlan["players"][number]> = {};
    for (const [slotId, playerId] of Object.entries(slotToPlayerId)) {
      const player = playersById[playerId];
      if (player) {
        mapping[slotId] = player;
      }
    }
    return mapping;
  }, [activeMatchPrepSegmentIndex, matchPrepBasePlayerBySlotId, matchPrepPlan]);
  const matchPrepBenchPlayers = useMemo(
    () =>
      matchPrepPlan
        ? matchPrepPlan.players.filter((player) => player.is_available && !player.lineup_slot)
        : [],
    [matchPrepPlan],
  );
  const matchPrepUnavailablePlayers = useMemo(
    () =>
      matchPrepPlan ? matchPrepPlan.players.filter((player) => !player.is_available && !player.lineup_slot) : [],
    [matchPrepPlan],
  );

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
      return { title: "No upcoming fixtures", subtitle: "Schedule a fixture to see it here." };
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
    };
  }, [fixtures, selectedTeamId]);
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
  const fixtureConflictWarnings = useMemo(() => {
    if (!selectedTeamId || !fixtureOpponentTeamId || !fixtureKickoffDate) {
      return [];
    }

    const targetKickoffTime = fixtureKickoffTime || "";
    const targetKickoffMinutes = targetKickoffTime ? timeToMinutes(targetKickoffTime) : null;
    const warnings: string[] = [];
    let hasSameDayOppositionConflict = false;
    let hasKickoffOverlap = false;

    for (const fixture of fixtures) {
      if (editingFixtureId && fixture.id === editingFixtureId) {
        continue;
      }

      const fixtureDateKey = fixture.kickoff_at ? toLocalDateKey(new Date(fixture.kickoff_at)) : "";
      const fixtureTime = fixture.kickoff_at ? new Date(fixture.kickoff_at).toTimeString().slice(0, 5) : "";
      const fixtureMinutes = fixtureTime ? timeToMinutes(fixtureTime) : null;
      const fixtureOppositionId =
        fixture.home_team_id === selectedTeamId ? fixture.away_team_id : fixture.home_team_id;

      if (
        fixtureDateKey === fixtureKickoffDate &&
        fixtureOppositionId === fixtureOpponentTeamId
      ) {
        hasSameDayOppositionConflict = true;
      }
      if (
        targetKickoffTime &&
        targetKickoffMinutes !== null &&
        fixtureMinutes !== null &&
        fixtureDateKey === fixtureKickoffDate &&
        Math.abs(fixtureMinutes - targetKickoffMinutes) < 60
      ) {
        hasKickoffOverlap = true;
      }
    }

    if (hasSameDayOppositionConflict) {
      warnings.push("Potential conflict: you already have a fixture against this opposition on the same date.");
    }
    if (hasKickoffOverlap) {
      warnings.push("Potential conflict: another fixture for this team starts within 60 minutes of this kickoff.");
    }
    return warnings;
  }, [
    editingFixtureId,
    fixtureKickoffDate,
    fixtureKickoffTime,
    fixtureOpponentTeamId,
    selectedTeamId,
    fixtures,
  ]);
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
      setMatchPrepPlan(null);
      return;
    }
    const rows = await listMatchPrepFixtures(teamId);
    setMatchPrepFixtures(rows);
    setSelectedFixtureForMatchPrep((current) =>
      rows.some((fixture) => fixture.id === current) ? current : rows[0]?.id || "",
    );
  }, []);

  const loadMatchPrepPlan = useCallback(async (matchId: string, teamId: string) => {
    if (!matchId || !teamId) {
      setMatchPrepPlan(null);
      return;
    }
    const plan = await getMatchPrepPlan(matchId, teamId);
    setMatchPrepPlan(plan);
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
      setMatchPrepPlan(null);
      return;
    }
    void loadMatchPrepFixtures(selectedTeamId);
  }, [loadMatchPrepFixtures, section, selectedTeamCanManage, selectedTeamId, user]);

  useEffect(() => {
    if (!user || section !== "match_prep") {
      return;
    }
    if (!selectedFixtureForMatchPrep || !selectedTeamId || !selectedTeamCanManage) {
      setMatchPrepPlan(null);
      return;
    }
    void loadMatchPrepPlan(selectedFixtureForMatchPrep, selectedTeamId);
  }, [loadMatchPrepPlan, section, selectedFixtureForMatchPrep, selectedTeamCanManage, selectedTeamId, user]);

  useEffect(() => {
    if (!user || !selectedTeamId) {
      return;
    }
    void loadFixturesForTeam(selectedTeamId);
  }, [loadFixturesForTeam, selectedTeamId, user]);

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

  const togglePosition = (positionCode: string) => {
    setSelectedPositions((current) =>
      current.includes(positionCode)
        ? current.filter((item) => item !== positionCode)
        : [...current, positionCode],
    );
  };

  const handleSaveMatchPrepPlan = async () => {
    if (!matchPrepPlan) {
      return;
    }
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
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to save match prep plan");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const assignMatchPrepPlayerToSlot = (playerId: string, slotId: string) => {
    setMatchPrepPlan((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        players: current.players.map((player) => {
          if (player.player_id === playerId) {
            return {
              ...player,
              is_available: true,
              in_matchday_squad: true,
              is_starting: true,
              lineup_slot: slotId,
            };
          }
          if (player.lineup_slot === slotId) {
            return {
              ...player,
              is_starting: false,
              lineup_slot: null,
            };
          }
          return player;
        }),
      };
    });
  };

  const moveMatchPrepPlayerToBench = (playerId: string) => {
    setMatchPrepPlan((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        players: current.players.map((player) =>
          player.player_id === playerId
            ? {
                ...player,
                is_available: true,
                in_matchday_squad: true,
                is_starting: false,
                lineup_slot: null,
              }
            : player,
        ),
      };
    });
  };

  const moveMatchPrepPlayerOutOfSquad = (playerId: string) => {
    setMatchPrepPlan((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        players: current.players.map((player) =>
          player.player_id === playerId
            ? {
                ...player,
                is_available: false,
                in_matchday_squad: false,
                is_starting: false,
                lineup_slot: null,
              }
            : player,
        ),
      };
    });
  };

  const addMatchPrepSubstitutionSegment = () => {
    setMatchPrepPlan((current) => {
      if (!current) {
        return current;
      }
      const previousEndMinute =
        current.substitution_segments[current.substitution_segments.length - 1]?.end_minute ?? 0;
      const fallbackStartMinute = previousEndMinute > 0 ? previousEndMinute + 10 : 10;
      const nextEndMinute = Math.min(current.total_match_minutes - 1, fallbackStartMinute);
      if (nextEndMinute <= previousEndMinute) {
        return current;
      }
      return {
        ...current,
        substitution_segments: [
          ...current.substitution_segments,
          {
            segment_index: current.substitution_segments.length,
            end_minute: nextEndMinute,
            substitutions: [],
          },
        ],
      };
    });
    setActiveMatchPrepSegmentIndex((current) => current + 1);
  };

  const updateMatchPrepSubstitutionSegmentEndMinute = (segmentIndex: number, endMinute: number) => {
    setMatchPrepPlan((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        substitution_segments: current.substitution_segments.map((segment, index) =>
          index === segmentIndex
            ? {
                ...segment,
                end_minute: Math.max(1, Math.min(current.total_match_minutes - 1, endMinute)),
              }
            : segment,
        ),
      };
    });
  };

  const removeMatchPrepSubstitutionSegment = (segmentIndex: number) => {
    setMatchPrepPlan((current) => {
      if (!current) {
        return current;
      }
      const nextSegments = current.substitution_segments
        .filter((_, index) => index !== segmentIndex)
        .map((segment, index) => ({ ...segment, segment_index: index }));
      return {
        ...current,
        substitution_segments: nextSegments,
      };
    });
    setActiveMatchPrepSegmentIndex((current) => {
      const removedDisplayIndex = segmentIndex + 1;
      if (current < removedDisplayIndex) {
        return current;
      }
      if (current === removedDisplayIndex) {
        return Math.max(0, current - 1);
      }
      return current - 1;
    });
  };

  const addOrReplaceMatchPrepPlannedSwap = (
    segmentIndex: number,
    playerOutId: string,
    playerInId: string,
  ) => {
    if (!playerOutId || !playerInId || playerOutId === playerInId) {
      return;
    }
    setMatchPrepPlan((current) => {
      if (!current) {
        return current;
      }
      const playerOut = current.players.find((row) => row.player_id === playerOutId);
      const playerIn = current.players.find((row) => row.player_id === playerInId);
      if (!playerOut || !playerIn) {
        return current;
      }
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
      if (!current) {
        return current;
      }
      return {
        ...current,
        substitution_segments: current.substitution_segments.map((segment, index) =>
          index === segmentIndex
            ? { ...segment, substitutions: segment.substitutions.filter((_, innerIndex) => innerIndex !== swapIndex) }
            : segment,
        ),
      };
    });
  };

  const getDraggedPlayerId = (event: DragEvent<HTMLElement>): string => {
    return event.dataTransfer.getData("text/plain").trim();
  };

  const assignMatchPrepPlayerToNearestSlot = (
    event: DragEvent<HTMLDivElement>,
    slots: FormationSlot[],
  ) => {
    const playerId = getDraggedPlayerId(event);
    if (!playerId || slots.length === 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const xPercent = ((event.clientX - rect.left) / rect.width) * 100;
    const yPercent = ((event.clientY - rect.top) / rect.height) * 100;

    const nearest = slots.reduce<{ id: string; distance: number } | null>((closest, slot) => {
      const dx = slot.x - xPercent;
      const dy = slot.y - yPercent;
      const distance = dx * dx + dy * dy;
      if (!closest || distance < closest.distance) {
        return { id: slot.id, distance };
      }
      return closest;
    }, null);

    if (nearest) {
      assignMatchPrepPlayerToSlot(playerId, nearest.id);
    }
  };

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
        setMatchPrepPlan(null);
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
    setFixturePeriodFormat("halves");
    setFixturePeriodLengthMinutes("35");
    setFixtureVenue("home");
    setFixtureKickoffDate("");
    setFixtureKickoffTime("");
    setFixtureStatus("scheduled");
    setFixtureOpponentTeamId("");
    setIsFixtureComposerOpen(false);
  };

  const openFixtureComposer = (date: Date | null = null) => {
    setEditingFixtureId("");
    setFixtureFormat("11_aside");
    setFixturePeriodFormat("halves");
    setFixturePeriodLengthMinutes("35");
    setFixtureVenue("home");
    setFixtureStatus("scheduled");
    setFixtureOpponentTeamId("");
    if (date) {
      setFixtureKickoffDate(toLocalDateKey(date));
      setFixtureKickoffTime("18:00");
    } else {
      setFixtureKickoffDate("");
      setFixtureKickoffTime("");
    }
    setIsFixtureComposerOpen(true);
  };

  const handleCreateOrUpdateFixture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTeamId) {
      setError("Select one of your teams first");
      return;
    }
    if (!fixtureOpponentTeamId) {
      setError("Please select a valid opposition team from the list");
      return;
    }
    if (selectedTeamId === fixtureOpponentTeamId) {
      setError("Opposition team must be different");
      return;
    }
    if (fixtureKickoffDate && !fixtureKickoffTime) {
      setError("Select a kickoff time in 15-minute increments");
      return;
    }
    const parsedPeriodLength = Number(fixturePeriodLengthMinutes);
    if (!Number.isInteger(parsedPeriodLength) || parsedPeriodLength < 1 || parsedPeriodLength > 120) {
      setError("Period length must be between 1 and 120 minutes");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const kickoffAt = fixtureKickoffDate
        ? new Date(`${fixtureKickoffDate}T${fixtureKickoffTime}`).toISOString()
        : null;
      const payload = {
        home_team_id: fixtureVenue === "home" ? selectedTeamId : fixtureOpponentTeamId,
        away_team_id: fixtureVenue === "home" ? fixtureOpponentTeamId : selectedTeamId,
        format: fixtureFormat,
        period_format: fixturePeriodFormat,
        period_length_minutes: parsedPeriodLength,
        kickoff_at: kickoffAt,
        status: editingFixtureId ? fixtureStatus.trim() || "scheduled" : "scheduled",
      };

      if (editingFixtureId) {
        await updateFixture(editingFixtureId, payload);
      } else {
        await createFixture(payload);
      }
      await loadFixturesForTeam(selectedTeamId);
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
      await loadFixturesForTeam(selectedTeamId);
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
    const selectedTeamIsHome = fixture.home_team_id === selectedTeamId;
    setFixtureVenue(selectedTeamIsHome ? "home" : "away");
    const oppositionTeamId = selectedTeamIsHome ? fixture.away_team_id : fixture.home_team_id;
    setFixtureOpponentTeamId(oppositionTeamId);
    setFixtureFormat(fixture.format);
    setFixturePeriodFormat(fixture.period_format as MatchPeriodFormat);
    setFixturePeriodLengthMinutes(String(fixture.period_length_minutes));
    setFixtureStatus(
      FIXTURE_STATUS_OPTIONS.some((option) => option.value === fixture.status.toLowerCase())
        ? fixture.status.toLowerCase()
        : "scheduled",
    );
    if (fixture.kickoff_at) {
      const localDate = new Date(fixture.kickoff_at);
      setFixtureKickoffDate(toLocalDateKey(localDate));
      setFixtureKickoffTime(toQuarterHourTime(localDate));
    } else {
      setFixtureKickoffDate("");
      setFixtureKickoffTime("");
    }
    setIsFixtureComposerOpen(true);
  };

  const handleCreatePlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTeamId) {
      setError("Select a team first");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const parsedShirtNumber = shirtNumber.trim() ? Number(shirtNumber) : null;
      if (editingPlayerId) {
        const updated = await updatePlayer(editingPlayerId, {
          display_name: playerName.trim(),
          shirt_number: parsedShirtNumber,
          position: selectedPositions.length > 0 ? selectedPositions.join(", ") : null,
        });
        setPlayers((existing) =>
          existing
            .map((player) => (player.id === editingPlayerId ? updated : player))
            .sort((a, b) => a.display_name.localeCompare(b.display_name)),
        );
      } else {
        const created = await createPlayer({
          team_id: selectedTeamId,
          display_name: playerName.trim(),
          shirt_number: parsedShirtNumber,
          position: selectedPositions.length > 0 ? selectedPositions.join(", ") : null,
        });
        setPlayers((existing) =>
          [...existing, created].sort((a, b) => a.display_name.localeCompare(b.display_name)),
        );
      }
      resetPlayerComposer();
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

  const resetPlayerComposer = () => {
    setEditingPlayerId("");
    setPlayerName("");
    setShirtNumber("");
    setSelectedPositions([]);
    setIsPlayerComposerOpen(false);
  };

  const startPlayerEdit = (player: Player) => {
    setEditingPlayerId(player.id);
    setPlayerName(player.display_name);
    setShirtNumber(player.shirt_number ? String(player.shirt_number) : "");
    const parsedPositions = player.position
      ? player.position.split(",").map((item) => item.trim()).filter(Boolean)
      : [];
    setSelectedPositions(parsedPositions);
    setIsPlayerComposerOpen(true);
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
    if (!selectedTeamId) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await addTeamMember(selectedTeamId, {
        user_email: newMemberEmail.trim().toLowerCase(),
        role: newMemberRole,
      });
      setNewMemberEmail("");
      setNewMemberRole("data_enterer");
      await loadTeamMembers(selectedTeamId);
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
    if (!selectedTeamId) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await updateTeamMember(selectedTeamId, membershipId, { role });
      await loadTeamMembers(selectedTeamId);
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
    if (!selectedTeamId) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await deleteTeamMember(selectedTeamId, membershipId);
      await loadTeamMembers(selectedTeamId);
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

  const handleUploadClubLogo = async (clubId: string, file: File | null) => {
    if (!clubId || !file) {
      return;
    }
    setError(null);
    setClubLogoUploadClubId(clubId);
    setIsSubmitting(true);
    try {
      await uploadClubLogo(clubId, file);
      if (isSuperAdmin) {
        await Promise.all([loadWorkspaceData(selectedTeamId), loadAdminData()]);
      } else {
        await loadWorkspaceData(selectedTeamId);
      }
    } catch (requestError) {
      if (requestError instanceof Error) {
        setError(requestError.message);
      } else {
        setError("Failed to upload club logo");
      }
    } finally {
      setIsSubmitting(false);
      setClubLogoUploadClubId("");
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
                setMatchPrepPlan(null);
                resetFixtureForm();
                resetPlayerComposer();
              }}
              options={teams.map((team) => ({ value: team.id, label: team.display_name }))}
              placeholder="Select team"
              className="sidebar-team-select"
            />
          </div>
        ) : null}

        {!sidebarCollapsed ? <p className="sidebar-user">{user.email}</p> : null}
      </aside>

      <section className="content-shell">
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
              </article>
            </div>
          </section>
        ) : null}

        {section === "settings" ? (
          <section className="section-card">
            <div className="stack-form">
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
                  onClick={() => setFixtureCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
                >
                  Today
                </button>
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
                disabled={!selectedTeamId || !selectedTeamCanManage}
                onClick={() => openFixtureComposer()}
              >
                + Add Fixture
              </button>
            </div>

            {!selectedTeamId ? <p className="muted">Select a team to view fixtures.</p> : null}
            {!selectedTeamCanManage && selectedTeamId ? (
              <p className="muted">Team admin access required to add or edit fixtures.</p>
            ) : null}
            {selectedTeamId ? (
              <>
                <p className="muted">Showing fixtures for {selectedTeamName}.</p>
                <div className="calendar-weekdays">
                  {CALENDAR_WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {calendarCells.map(({ date, inCurrentMonth }) => {
                    const dateKey = toLocalDateKey(date);
                    const isToday = dateKey === toLocalDateKey(new Date());
                    const dayFixtures = fixturesByDateKey[dateKey] ?? [];
                    return (
                      <div
                        key={`${dateKey}-${inCurrentMonth ? "in" : "out"}`}
                        className={`calendar-cell ${inCurrentMonth ? "" : "outside"} ${isToday ? "today" : ""}`}
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
                              fixture.home_team_id === selectedTeamId
                                ? `${fixture.away_club_name} ${fixture.away_team_name}`
                                : `${fixture.home_club_name} ${fixture.home_team_name}`;
                            const venueLabel = fixture.home_team_id === selectedTeamId ? "H" : "A";
                            return (
                              <button
                                key={fixture.id}
                                type="button"
                                className={`${fixtureStatusClass(fixture.status)} ${fixture.can_manage ? "" : "locked"}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (fixture.can_manage) {
                                    startFixtureEdit(fixture);
                                  }
                                }}
                                title={`${fixture.can_manage ? "" : "Locked · "} ${oppositionName}${
                                  fixture.kickoff_at
                                    ? ` · ${new Date(fixture.kickoff_at).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}`
                                    : ""
                                } · ${fixture.format.replace("_", " ")} · ${fixture.period_format.replace("_", " ")} · ${fixture.period_length_minutes} min`}
                              >
                                <span className={`fixture-venue-badge ${venueLabel === "H" ? "home" : "away"}`}>
                                  {venueLabel}
                                </span>{" "}
                                {fixtureFormatIcon(fixture.format)}{" "}
                                {fixture.kickoff_at
                                  ? new Date(fixture.kickoff_at).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "TBD"}{" "}
                                vs {oppositionName}
                                {!fixture.can_manage ? " 🔒" : ""}
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
                  <p className="muted">{selectedTeamName}</p>
                  <div className="fixture-venue-toggle" role="group" aria-label="Fixture venue">
                    <button
                      className={`button secondary ${fixtureVenue === "home" ? "is-selected" : ""}`}
                      type="button"
                      onClick={() => setFixtureVenue("home")}
                    >
                      Home
                    </button>
                    <button
                      className={`button secondary ${fixtureVenue === "away" ? "is-selected" : ""}`}
                      type="button"
                      onClick={() => setFixtureVenue("away")}
                    >
                      Away
                    </button>
                  </div>
                  <SearchableSelect
                    value={fixtureOpponentTeamId}
                    onChange={(nextValue) => setFixtureOpponentTeamId(nextValue)}
                    options={fixtureOppositionOptions.map((team) => ({
                      value: team.id,
                      label: team.display_name,
                    }))}
                    placeholder="Select opposition team"
                  />
                  <select
                    value={fixtureFormat}
                    onChange={(event) => setFixtureFormat(event.target.value as MatchFormat)}
                  >
                    {MATCH_FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fixturePeriodFormat}
                    onChange={(event) => setFixturePeriodFormat(event.target.value as MatchPeriodFormat)}
                  >
                    {MATCH_PERIOD_FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={fixturePeriodLengthMinutes}
                    onChange={(event) => setFixturePeriodLengthMinutes(event.target.value)}
                    placeholder="Period length (minutes)"
                    required
                  />
                  <div className="member-actions">
                    <input
                      type="date"
                      value={fixtureKickoffDate}
                      onChange={(event) => {
                        setFixtureKickoffDate(event.target.value);
                        if (event.target.value && !fixtureKickoffTime) {
                          setFixtureKickoffTime("18:00");
                        }
                      }}
                    />
                    <select
                      value={fixtureKickoffTime}
                      onChange={(event) => setFixtureKickoffTime(event.target.value)}
                      disabled={!fixtureKickoffDate}
                    >
                      <option value="">Time</option>
                      {KICKOFF_TIME_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {fixtureConflictWarnings.length > 0 ? (
                    <div className="stack-form">
                      {fixtureConflictWarnings.map((warning) => (
                        <p className="muted" key={warning}>
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}
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
                      disabled={isSubmitting || !selectedTeamId || !fixtureOpponentTeamId}
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
                    title={team.my_role && !isTeamAdminRole(team.my_role) ? "Team admin access required" : "Delete team"}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {section === "match_prep" ? (
          <section className="section-card">
            <div className="player-toolbar match-prep-toolbar">
              <button
                className="button primary"
                type="button"
                disabled={isSubmitting || !matchPrepPlan}
                onClick={handleSaveMatchPrepPlan}
              >
                Save Match Plan
              </button>
            </div>
            {ownedTeams.length === 0 ? (
              <p className="muted">No team admin access yet. Ask a super admin to assign you to a team.</p>
            ) : null}
            {!selectedTeamId && ownedTeams.length > 0 ? (
              <p className="muted">Select a team in the sidebar to start match prep.</p>
            ) : null}
            {!selectedTeamCanManage && selectedTeamId ? (
              <p className="muted">Team admin access required for match prep on this team.</p>
            ) : null}
            <div className="stack-form match-prep-fixture-picker" style={{ marginTop: "0.6rem" }}>
              <SearchableSelect
                value={selectedFixtureForMatchPrep}
                onChange={setSelectedFixtureForMatchPrep}
                options={matchPrepFixtures.map((fixture) => ({
                  value: fixture.id,
                  label: `${fixture.opponent_team_name}${fixture.kickoff_at ? ` · ${new Date(fixture.kickoff_at).toLocaleString()}` : ""}`,
                }))}
                placeholder="Select upcoming fixture"
                disabled={!selectedTeamId || !selectedTeamCanManage}
              />
            </div>
            {!selectedFixtureForMatchPrep && selectedTeamId && selectedTeamCanManage ? (
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
                          onClick={() =>
                            setActiveMatchPrepSegmentIndex((current) => Math.max(0, current - 1))
                          }
                          disabled={activeMatchPrepSegmentIndex === 0}
                        >
                          ←
                        </button>
                        <span className="muted">
                          Segment {activeMatchPrepSegmentIndex + 1} ·{" "}
                          {activeMatchPrepSegmentIndex === 0
                            ? `0' - ${
                                matchPrepPlan.substitution_segments[0]?.end_minute ??
                                matchPrepPlan.total_match_minutes
                              }'`
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
                          disabled={
                            activeMatchPrepSegmentIndex >= matchPrepPlan.substitution_segments.length
                          }
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
                        const mismatch = assignedPlayer
                          ? isPositionMismatch(assignedPlayer.position, slot.role)
                          : false;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            className={`pitch-slot ${assignedPlayer ? "filled" : "empty"} ${
                              mismatch ? "mismatch" : ""
                            } ${
                              matchPrepDragTarget === slot.id ? "drag-over" : ""
                            }`}
                            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                            onDoubleClick={() => {
                              if (assignedPlayer) {
                                moveMatchPrepPlayerToBench(assignedPlayer.player_id);
                              }
                            }}
                            onDragEnter={(event) => {
                              event.preventDefault();
                              setMatchPrepDragTarget(slot.id);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              setMatchPrepDragTarget(slot.id);
                            }}
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
                                  addOrReplaceMatchPrepPlannedSwap(
                                    activeMatchPrepSegmentIndex - 1,
                                    assignedPlayer.player_id,
                                    playerId,
                                  );
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
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setMatchPrepDragTarget("bench");
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setMatchPrepDragTarget("bench");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setMatchPrepDragTarget("");
                        const playerId = getDraggedPlayerId(event);
                        if (playerId) {
                          moveMatchPrepPlayerToBench(playerId);
                        }
                      }}
                    >
                      <h4>Bench</h4>
                      <p className="muted">Tip: Double-click a bench player to move them out of squad.</p>
                      {matchPrepBenchPlayers.length === 0 ? <p className="muted">Drop players here</p> : null}
                      <div className="prep-player-grid">
                        {matchPrepBenchPlayers.map((player) => (
                          <button
                            key={player.player_id}
                            type="button"
                            className="prep-player-tile"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", player.player_id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setMatchPrepDragTarget("")}
                            onDoubleClick={() => moveMatchPrepPlayerOutOfSquad(player.player_id)}
                          >
                            <strong>{player.player_name}</strong>
                            <span>
                              {player.shirt_number ? `#${player.shirt_number}` : "No #"}
                              {player.position ? ` · ${player.position}` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div
                      className={`prep-dropzone is-muted ${matchPrepDragTarget === "out" ? "drag-over" : ""}`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setMatchPrepDragTarget("out");
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setMatchPrepDragTarget("out");
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setMatchPrepDragTarget("");
                        const playerId = getDraggedPlayerId(event);
                        if (playerId) {
                          moveMatchPrepPlayerOutOfSquad(playerId);
                        }
                      }}
                    >
                      <h4>Out Of Squad</h4>
                      {matchPrepUnavailablePlayers.length === 0 ? <p className="muted">Double-click a bench tile</p> : null}
                      <div className="prep-player-grid">
                        {matchPrepUnavailablePlayers.map((player) => (
                          <button
                            key={player.player_id}
                            type="button"
                            className="prep-player-tile is-muted"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", player.player_id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setMatchPrepDragTarget("")}
                            onDoubleClick={() => moveMatchPrepPlayerToBench(player.player_id)}
                          >
                            <strong>{player.player_name}</strong>
                            <span>
                              {player.shirt_number ? `#${player.shirt_number}` : "No #"}
                              {player.position ? ` · ${player.position}` : ""}
                            </span>
                          </button>
                        ))}
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
                        (matchPrepPlan.substitution_segments[
                          matchPrepPlan.substitution_segments.length - 1
                        ]?.end_minute ?? 0) >= matchPrepPlan.total_match_minutes - 1
                      }
                    >
                      + Add Segment
                    </button>
                  </div>
                  <p className="muted">
                    Segment 1 is your starting lineup (minute 0). Add Segment 2+ with start minutes; each
                    segment runs until the next segment starts (or minute {matchPrepPlan.total_match_minutes}).
                  </p>
                  {matchPrepPlan.substitution_segments.length === 0 ? (
                    <p className="muted">No substitution segments yet.</p>
                  ) : null}
                  {matchPrepPlan.substitution_segments.map((segment, segmentIndex) => {
                    return (
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
                            type="number"
                            min={1}
                            max={matchPrepPlan.total_match_minutes - 1}
                            value={segment.end_minute}
                            onChange={(event) =>
                              updateMatchPrepSubstitutionSegmentEndMinute(
                                segmentIndex,
                                Number(event.target.value || 0),
                              )
                            }
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
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {section === "players" ? (
          <section className="section-card">
            <div className="player-toolbar match-prep-toolbar">
              <button
                className="button primary"
                type="button"
                disabled={
                  isSubmitting || teams.length === 0 || !selectedTeamId || !selectedTeamCanManage
                }
                onClick={() => setIsPlayerComposerOpen(true)}
              >
                + Add Player
              </button>
            </div>
            {!selectedTeamId ? <p className="muted">Select a team to view players.</p> : null}
            {!selectedTeamCanManage && selectedTeamId ? (
              <p className="muted">Team admin access required to add players.</p>
            ) : null}

            <div>
              <h3>Players {selectedTeamName ? `- ${selectedTeamName}` : ""}</h3>
              {selectedTeamId && playersForSelectedTeam.length === 0 ? <p className="muted">No players yet.</p> : null}
              {playersForSelectedTeam.map((player) => (
                <div className="list-row" key={player.id}>
                  <span>
                    {player.display_name}
                    {player.shirt_number ? ` #${player.shirt_number}` : ""}
                    {player.position ? ` (${player.position})` : ""}
                  </span>
                  <div className="member-actions">
                    <button
                      className="button secondary"
                      onClick={() => startPlayerEdit(player)}
                      type="button"
                      disabled={
                        isSubmitting ||
                        (() => {
                          const role = roleByTeamId[player.team_id];
                          return role !== undefined && !isTeamAdminRole(role);
                        })()
                      }
                    >
                      Edit
                    </button>
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
                </div>
              ))}
            </div>

            {isPlayerComposerOpen ? (
              <div className="fixture-composer-overlay" role="dialog" aria-modal="true">
                <form className="fixture-composer" onSubmit={handleCreatePlayer}>
                  <h3>{editingPlayerId ? "Edit Player" : "Add Player"}</h3>
                  <p className="muted">{selectedTeamName}</p>
                  <input
                    placeholder="Player name"
                    value={playerName}
                    onChange={(event) => setPlayerName(event.target.value)}
                    required
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
                  <div className="member-actions">
                    <button className="button primary" disabled={isSubmitting || !selectedTeamId} type="submit">
                      {editingPlayerId ? "Save Player" : "Add Player"}
                    </button>
                    <button className="button secondary" type="button" disabled={isSubmitting} onClick={resetPlayerComposer}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
          </section>
        ) : null}

        {section === "members" ? (
          <section className="section-card two-col">
            <form className="stack-form" onSubmit={handleAddTeamMember}>
              <h3>Manage Members</h3>
              {!selectedTeamId ? <p className="muted">Select a team in the sidebar first.</p> : null}
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
                disabled={isSubmitting || !selectedTeamId || !selectedTeamCanManage}
                type="submit"
              >
                Add Member
              </button>
              {!selectedTeamCanManage && selectedTeamId ? (
                <p className="muted">Team admin access required to manage members.</p>
              ) : null}
            </form>

            <div>
              <h3>Members {selectedTeamName ? `- ${selectedTeamName}` : ""}</h3>
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
                        disabled={isSubmitting || !selectedTeamCanManage}
                      />
                      <button
                        className="button secondary"
                        onClick={() => handleDeleteTeamMember(membership.id)}
                        type="button"
                        disabled={isSubmitting || isCurrentUser || !selectedTeamCanManage}
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
                      <div className="club-list-meta">
                        {resolveApiAssetUrl(club.logo_url) ? (
                          <img
                            src={resolveApiAssetUrl(club.logo_url) ?? ""}
                            alt={`${club.name} logo`}
                            className="club-logo-thumb"
                          />
                        ) : (
                          <div className="club-logo-thumb placeholder">No logo</div>
                        )}
                        {adminEditingClubId === club.id ? (
                          <input
                            value={adminEditingClubName}
                            onChange={(event) => setAdminEditingClubName(event.target.value)}
                          />
                        ) : (
                          <span>{club.name}</span>
                        )}
                      </div>
                      <div className="member-actions">
                        <label
                          className="button secondary file-upload-button"
                          aria-disabled={isSubmitting}
                          title="Upload club logo"
                        >
                          {clubLogoUploadClubId === club.id ? "Uploading..." : "Logo"}
                          <input
                            type="file"
                            accept="image/png,image/webp"
                            disabled={isSubmitting}
                            onChange={(event) => {
                              const file = event.target.files?.[0] ?? null;
                              void handleUploadClubLogo(club.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
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

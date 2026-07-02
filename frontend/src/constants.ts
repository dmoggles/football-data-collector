import type { MatchFormat, MatchPeriodFormat, TeamRole } from "./types/auth";

export type AuthMode = "login" | "register";
export type Section =
  | "dashboard"
  | "collection"
  | "fixtures"
  | "match_prep"
  | "players"
  | "teams"
  | "members"
  | "settings"
  | "stats"
  | "admin";
export type AdminSection = "home" | "clubs" | "teams" | "users" | "audit";
export type FixtureVenue = "home" | "away";

export const POSITION_OPTIONS = ["GK", "RB", "RWB", "CB", "LB", "LWB", "DM", "CM", "AM", "RW", "LW", "ST"];

export const BASE_NAV_ITEMS: Array<{ id: Exclude<Section, "admin">; label: string; shortLabel: string }> = [
  { id: "dashboard", label: "Dashboard", shortLabel: "D" },
  { id: "collection", label: "Match", shortLabel: "L" },
  { id: "fixtures", label: "Fixtures", shortLabel: "F" },
  { id: "match_prep", label: "Match Prep", shortLabel: "MP" },
  { id: "players", label: "Players", shortLabel: "P" },
  { id: "teams", label: "Teams", shortLabel: "T" },
  { id: "members", label: "Members", shortLabel: "M" },
  { id: "stats", label: "Stats", shortLabel: "St" },
  { id: "settings", label: "Settings", shortLabel: "S" },
];

export const MATCH_FORMAT_OPTIONS: Array<{ value: MatchFormat; label: string }> = [
  { value: "5_aside", label: "5 Aside" },
  { value: "7_aside", label: "7 Aside" },
  { value: "9_aside", label: "9 Aside" },
  { value: "11_aside", label: "11 Aside" },
];

export const MATCH_PERIOD_FORMAT_OPTIONS: Array<{ value: MatchPeriodFormat; label: string }> = [
  { value: "halves", label: "Halves" },
  { value: "quarters", label: "Quarters" },
  { value: "non_stop", label: "Non-stop" },
];

export const FIXTURE_STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "final", label: "Final" },
  { value: "cancelled", label: "Cancelled" },
];

export const KICKOFF_TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = String(Math.floor(index / 4)).padStart(2, "0");
  const minutes = String((index % 4) * 15).padStart(2, "0");
  const value = `${hours}:${minutes}`;
  return { value, label: value };
});

export const TEAM_MEMBER_ROLE_OPTIONS: Array<{ value: TeamRole; label: string }> = [
  { value: "manager", label: "Manager" },
  { value: "data_enterer", label: "Data Enterer" },
];

export const CALENDAR_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const ADMIN_NAV_ITEM: { id: Section; label: string; shortLabel: string } = {
  id: "admin",
  label: "Super Admin",
  shortLabel: "A",
};

export const ADMIN_SUB_NAV_ITEMS: Array<{ id: AdminSection; label: string }> = [
  { id: "home", label: "Overview" },
  { id: "clubs", label: "Clubs" },
  { id: "teams", label: "Teams" },
  { id: "users", label: "Users" },
  { id: "audit", label: "Audit" },
];

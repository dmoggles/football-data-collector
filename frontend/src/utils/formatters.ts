import type { MatchFormat, TeamRole } from "../types/auth";

export function isTeamAdminRole(role: TeamRole): boolean {
  return role === "manager" || role === "team_admin" || role === "admin";
}

export function fixtureStatusClass(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "final") return "fixture-chip final";
  if (normalized === "cancelled") return "fixture-chip cancelled";
  return "fixture-chip scheduled";
}

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function fixtureFormatIcon(format: MatchFormat): string {
  if (format === "5_aside") return "⚽5";
  if (format === "7_aside") return "⚽7";
  if (format === "9_aside") return "⚽9";
  return "⚽11";
}

export function toQuarterHourTime(date: Date): string {
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

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildCollectionSessionWsUrl(sessionId: string, teamId: string): string {
  const apiBase = (import.meta.env.VITE_API_BASE_URL?.trim() ?? "").replace(/\/+$/, "");
  let origin = apiBase || window.location.origin;
  if (!apiBase) {
    origin = origin.replace(":5173", ":8000");
  }
  const wsBase = origin.replace(/^http/i, "ws");
  return `${wsBase}/collection-sessions/${encodeURIComponent(sessionId)}/ws?team_id=${encodeURIComponent(teamId)}`;
}

export function timeToMinutes(timeValue: string): number | null {
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

export function normalizeRoleCode(role: string): string {
  return role.trim().toUpperCase();
}

export function parsePlayerPositionCodes(position: string | null): string[] {
  if (!position) return [];
  return position
    .split(/[,|/]/)
    .map((item) => normalizeRoleCode(item))
    .filter(Boolean);
}

export function isPositionMismatch(playerPosition: string | null, slotRole: string): boolean {
  const playerRoles = parsePlayerPositionCodes(playerPosition);
  if (playerRoles.length === 0) return false;
  const normalizedSlotRole = normalizeRoleCode(slotRole);
  if (playerRoles.includes(normalizedSlotRole)) return false;
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

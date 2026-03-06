import type {
  AdminAuditLogEntry,
  AdminOverview,
  AddTeamMemberPayload,
  AuthPayload,
  Fixture,
  FixturePayload,
  GlobalRole,
  Player,
  PlayerPayload,
  Team,
  TeamDirectory,
  TeamMember,
  TeamPayload,
  UpdateTeamMemberPayload,
  User,
} from "./types/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";
type TeamApiResponse = Omit<Team, "display_name">;
type TeamDirectoryApiResponse = Omit<TeamDirectory, "display_name">;

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function buildUrl(path: string): string {
  if (!API_BASE_URL) {
    return path;
  }

  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

async function request<TResponse>(
  path: string,
  method: HttpMethod,
  body?: unknown,
): Promise<TResponse> {
  const response = await fetch(buildUrl(path), {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        message = payload.detail;
      }
    } catch {
      // Keep default fallback if response body is not JSON.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  try {
    return (await response.json()) as TResponse;
  } catch {
    throw new ApiError("Server returned an unexpected response format", response.status);
  }
}

function toTeam(team: TeamApiResponse): Team {
  return {
    ...team,
    display_name: `${team.club_name} ${team.team_name}`,
  };
}

export async function register(payload: AuthPayload): Promise<User> {
  return request<User>("/auth/register", "POST", payload);
}

export async function login(payload: AuthPayload): Promise<User> {
  return request<User>("/auth/login", "POST", payload);
}

export async function logout(): Promise<void> {
  await request<void>("/auth/logout", "POST");
}

export async function getMe(): Promise<User> {
  return request<User>("/auth/me", "GET");
}

export async function changePassword(payload: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  await request<void>("/auth/change-password", "POST", payload);
}

export async function listTeams(): Promise<Team[]> {
  const teams = await request<TeamApiResponse[]>("/teams", "GET");
  return teams.map(toTeam);
}

export async function listTeamDirectory(): Promise<TeamDirectory[]> {
  const teams = await request<TeamDirectoryApiResponse[]>("/teams/directory", "GET");
  return teams.map((team) => ({
    ...team,
    display_name: `${team.club_name} ${team.team_name}`,
  }));
}

export async function createTeam(payload: TeamPayload): Promise<Team> {
  const team = await request<TeamApiResponse>("/teams", "POST", payload);
  return toTeam(team);
}

export async function deleteTeam(teamId: string): Promise<void> {
  await request<void>(`/teams/${teamId}`, "DELETE");
}

export async function listPlayers(teamId?: string): Promise<Player[]> {
  const params = teamId ? `?team_id=${encodeURIComponent(teamId)}` : "";
  return request<Player[]>(`/players${params}`, "GET");
}

export async function createPlayer(payload: PlayerPayload): Promise<Player> {
  return request<Player>("/players", "POST", payload);
}

export async function deletePlayer(playerId: string): Promise<void> {
  await request<void>(`/players/${playerId}`, "DELETE");
}

export async function listFixtures(teamId: string): Promise<Fixture[]> {
  const params = `?team_id=${encodeURIComponent(teamId)}`;
  return request<Fixture[]>(`/matches${params}`, "GET");
}

export async function createFixture(payload: FixturePayload): Promise<Fixture> {
  return request<Fixture>("/matches", "POST", payload);
}

export async function updateFixture(fixtureId: string, payload: FixturePayload): Promise<Fixture> {
  return request<Fixture>(`/matches/${fixtureId}`, "PATCH", payload);
}

export async function deleteFixture(fixtureId: string): Promise<void> {
  await request<void>(`/matches/${fixtureId}`, "DELETE");
}

export async function listTeamMembers(teamId: string): Promise<TeamMember[]> {
  return request<TeamMember[]>(`/teams/${teamId}/members`, "GET");
}

export async function addTeamMember(teamId: string, payload: AddTeamMemberPayload): Promise<TeamMember> {
  return request<TeamMember>(`/teams/${teamId}/members`, "POST", payload);
}

export async function updateTeamMember(
  teamId: string,
  membershipId: string,
  payload: UpdateTeamMemberPayload,
): Promise<TeamMember> {
  return request<TeamMember>(`/teams/${teamId}/members/${membershipId}`, "PATCH", payload);
}

export async function deleteTeamMember(teamId: string, membershipId: string): Promise<void> {
  await request<void>(`/teams/${teamId}/members/${membershipId}`, "DELETE");
}

export async function getAdminOverview(): Promise<AdminOverview> {
  return request<AdminOverview>("/admin/overview", "GET");
}

export async function createAdminClub(name: string): Promise<{ id: string; name: string }> {
  return request<{ id: string; name: string }>("/admin/clubs", "POST", { name });
}

export async function updateAdminClub(clubId: string, name: string): Promise<{ id: string; name: string }> {
  return request<{ id: string; name: string }>(`/admin/clubs/${clubId}`, "PATCH", { name });
}

export async function deleteAdminClub(clubId: string): Promise<void> {
  await request<void>(`/admin/clubs/${clubId}`, "DELETE");
}

export async function assignAdminTeamOwner(
  teamId: string,
  userEmail: string,
): Promise<TeamMember> {
  return request<TeamMember>(`/admin/teams/${teamId}/assign-team-admin`, "POST", {
    user_email: userEmail,
  });
}

export async function createAdminTeam(payload: {
  club_id: string;
  team_name: string;
}): Promise<{ id: string; club_id: string; team_name: string }> {
  return request<{ id: string; club_id: string; team_name: string }>("/admin/teams", "POST", payload);
}

export async function updateAdminTeam(
  teamId: string,
  payload: { club_id: string; team_name: string },
): Promise<{ id: string; club_id: string; team_name: string }> {
  return request<{ id: string; club_id: string; team_name: string }>(`/admin/teams/${teamId}`, "PATCH", payload);
}

export async function deleteAdminTeam(teamId: string): Promise<void> {
  await request<void>(`/admin/teams/${teamId}`, "DELETE");
}

export async function removeAdminTeamOwner(teamId: string, userId: string): Promise<void> {
  await request<void>(`/admin/teams/${teamId}/admins/${userId}`, "DELETE");
}

export async function assignUserGlobalRole(userId: string, role: GlobalRole): Promise<void> {
  await request<void>(`/admin/users/${userId}/global-roles`, "POST", { role });
}

export async function revokeUserGlobalRole(userId: string, role: GlobalRole): Promise<void> {
  await request<void>(`/admin/users/${userId}/global-roles/${role}`, "DELETE");
}

export async function getAdminAuditLogs(limit = 100): Promise<AdminAuditLogEntry[]> {
  return request<AdminAuditLogEntry[]>(`/admin/audit-logs?limit=${encodeURIComponent(String(limit))}`, "GET");
}

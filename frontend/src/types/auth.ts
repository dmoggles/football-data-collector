export type TeamRole = "admin" | "team_admin" | "data_enterer" | "coach" | "parent";
export type GlobalRole = "super_admin";

export type User = {
  id: string;
  email: string;
};

export type AdminUserOverview = {
  id: string;
  email: string;
  global_roles: string[];
};

export type AdminClubOverview = {
  id: string;
  name: string;
};

export type AdminTeamOwnerOverview = {
  user_id: string;
  user_email: string;
  role: string;
};

export type AdminTeamOverview = {
  id: string;
  club_id: string;
  club_name: string;
  team_name: string;
  owners: AdminTeamOwnerOverview[];
};

export type AdminOverview = {
  users: AdminUserOverview[];
  clubs: AdminClubOverview[];
  teams: AdminTeamOverview[];
};

export type AdminAuditLogEntry = {
  id: string;
  actor_user_id: string;
  actor_user_email: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

export type Team = {
  id: string;
  club_id: string;
  club_name: string;
  team_name: string;
  my_role: TeamRole;
  display_name: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  user_email?: string;
  role: TeamRole;
};

export type Player = {
  id: string;
  team_id: string;
  display_name: string;
  shirt_number: number | null;
  position: string | null;
};

export type AuthPayload = {
  email: string;
  password: string;
};

export type TeamPayload = {
  club_name: string;
  team_name: string;
};

export type AddTeamMemberPayload = {
  user_email?: string;
  role: TeamRole;
};

export type UpdateTeamMemberPayload = {
  role: TeamRole;
};

export type PlayerPayload = {
  team_id: string;
  display_name: string;
  shirt_number: number | null;
  position: string | null;
};

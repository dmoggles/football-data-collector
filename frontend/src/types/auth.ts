export type TeamRole = "admin" | "data_enterer";

export type User = {
  id: string;
  email: string;
};

export type Team = {
  id: string;
  club_id: string;
  club_name: string;
  team_name: string;
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

export type TeamRole = "admin" | "team_admin" | "manager" | "data_enterer" | "coach" | "parent";
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
  logo_url: string | null;
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
  club_logo_url: string | null;
  team_name: string;
  my_role?: TeamRole;
  display_name: string;
};

export type TeamDirectory = {
  id: string;
  club_id: string;
  club_name: string;
  club_logo_url: string | null;
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

export type MatchFormat = "5_aside" | "7_aside" | "9_aside" | "11_aside";
export type MatchPeriodFormat = "halves" | "quarters" | "non_stop";

export type Fixture = {
  id: string;
  home_team_id: string;
  home_team_name: string;
  home_club_name: string;
  away_team_id: string;
  away_team_name: string;
  away_club_name: string;
  format: MatchFormat;
  period_format: MatchPeriodFormat;
  period_length_minutes: number;
  kickoff_at: string | null;
  status: string;
  can_manage: boolean;
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

export type FixturePayload = {
  home_team_id: string;
  away_team_id: string;
  format: MatchFormat;
  period_format: MatchPeriodFormat;
  period_length_minutes: number;
  kickoff_at: string | null;
  status: string;
};

export type MatchPrepFixture = {
  id: string;
  team_id: string;
  team_name: string;
  opponent_team_id: string;
  opponent_team_name: string;
  kickoff_at: string | null;
  status: string;
  format: MatchFormat;
};

export type MatchPrepPlayerSelection = {
  player_id: string;
  player_name: string;
  shirt_number: number | null;
  position: string | null;
  is_available: boolean;
  in_matchday_squad: boolean;
  is_starting: boolean;
  lineup_slot: string | null;
};

export type MatchPrepSubstitutionSwap = {
  player_out_id: string;
  player_out_name: string;
  player_out_shirt_number: number | null;
  player_in_id: string;
  player_in_name: string;
  player_in_shirt_number: number | null;
};

export type MatchPrepSubstitutionSegment = {
  segment_index: number;
  end_minute: number;
  substitutions: MatchPrepSubstitutionSwap[];
};

export type MatchPrepPlan = {
  match_id: string;
  team_id: string;
  formation: string;
  format: MatchFormat;
  total_match_minutes: number;
  required_starting_count: number;
  formation_options: string[];
  players: MatchPrepPlayerSelection[];
  substitution_segments: MatchPrepSubstitutionSegment[];
};

export type MatchPrepPlanValidation = {
  match_id: string;
  team_id: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export type CoachingNote = {
  id: string;
  match_id: string;
  team_id: string;
  player_id: string | null;
  player_name: string | null;
  note_text: string;
  created_at: string;
};

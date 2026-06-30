import type { Fixture, MatchPrepFixture, Player, Team, TeamDirectory, TeamMember, User } from "./auth";

export type WorkspaceCtx = {
  user: User;
  selectedTeamId: string;
  teams: Team[];
  teamDirectory: TeamDirectory[];
  players: Player[];
  fixtures: Fixture[];
  matchPrepFixtures: MatchPrepFixture[];
  teamMembers: TeamMember[];
  selectedTeamCanManage: boolean;
  isSuperAdmin: boolean;
  onWorkspaceChanged: () => void;
  onPlayersChanged: () => void;
  onFixturesChanged: () => void;
  onMembersChanged: () => void;
};

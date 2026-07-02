import { useState } from "react";
import type { FormEvent } from "react";
import { addTeamMember, deleteTeamMember, updateTeamMember } from "../api";
import { SearchableSelect } from "../components/SearchableSelect";
import { TEAM_MEMBER_ROLE_OPTIONS } from "../constants";
import type { TeamRole } from "../types/auth";
import type { WorkspaceCtx } from "../types/workspace";

type MembersViewProps = Pick<
  WorkspaceCtx,
  | "user"
  | "selectedTeamId"
  | "selectedTeamName"
  | "teamMembers"
  | "selectedTeamCanManage"
  | "onMembersChanged"
>;

export function MembersView({
  user,
  selectedTeamId,
  selectedTeamName,
  teamMembers,
  selectedTeamCanManage,
  onMembersChanged,
}: MembersViewProps) {
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<TeamRole>("data_enterer");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTeamId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await addTeamMember(selectedTeamId, {
        user_email: newMemberEmail.trim().toLowerCase(),
        role: newMemberRole,
      });
      setNewMemberEmail("");
      setNewMemberRole("data_enterer");
      onMembersChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to add member");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRoleChange = async (membershipId: string, role: TeamRole) => {
    if (!selectedTeamId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await updateTeamMember(selectedTeamId, membershipId, { role });
      onMembersChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update member role");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (membershipId: string) => {
    if (!selectedTeamId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteTeamMember(selectedTeamId, membershipId);
      onMembersChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to remove member");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card two-col">
      {error ? <p className="error-message">{error}</p> : null}
      <form className="stack-form" onSubmit={handleAdd}>
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
          <p className="muted">Manager access required to manage members.</p>
        ) : null}
      </form>

      <div>
        <h3>Members {selectedTeamName ? `- ${selectedTeamName}` : ""}</h3>
        {teamMembers.length === 0 ? <p className="muted">No members assigned.</p> : null}
        {teamMembers.map((membership) => {
          const isCurrentUser = membership.user_id === user.id;
          const emailOrId = membership.user_email ?? membership.user_id;
          const userName = emailOrId.includes("@")
            ? emailOrId.split("@")[0].replace(/[._-]+/g, " ")
            : emailOrId;
          return (
            <div className="member-row" key={membership.id}>
              <span className="muted">
                {userName} ({emailOrId}){isCurrentUser ? " - You" : ""}
              </span>
              <div className="member-actions">
                <SearchableSelect
                  value={membership.role}
                  onChange={(nextValue) => void handleRoleChange(membership.id, nextValue as TeamRole)}
                  options={TEAM_MEMBER_ROLE_OPTIONS}
                  placeholder="Select role"
                  disabled={isSubmitting || !selectedTeamCanManage}
                />
                <button
                  className="button secondary"
                  onClick={() => void handleDelete(membership.id)}
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
  );
}

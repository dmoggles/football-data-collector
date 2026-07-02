import { useState } from "react";
import type { FormEvent } from "react";
import { createTeam, deleteTeam, uploadClubLogo } from "../api";
import { SearchableSelect } from "../components/SearchableSelect";
import { isTeamAdminRole } from "../utils/formatters";
import type { Team } from "../types/auth";

type TeamsViewProps = {
  teams: Team[];
  selectedTeam: Team | null;
  selectedTeamClubLogoUrl: string | null;
  isSuperAdmin: boolean;
  clubNameOptions: { value: string; label: string }[];
  onWorkspaceChanged: () => Promise<void>;
};

export function TeamsView({
  teams,
  selectedTeam,
  selectedTeamClubLogoUrl,
  isSuperAdmin,
  clubNameOptions,
  onWorkspaceChanged,
}: TeamsViewProps) {
  const [clubName, setClubName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createTeam({ club_name: clubName.trim(), team_name: teamName.trim() });
      setClubName("");
      setTeamName("");
      await onWorkspaceChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create team");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteTeam(teamId);
      await onWorkspaceChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete team");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadClubLogo = async (clubId: string, file: File | null) => {
    if (!clubId || !file) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await uploadClubLogo(clubId, file);
      await onWorkspaceChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to upload club logo");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card two-col">
      {error ? <p className="error-banner">{error}</p> : null}
      <form className="stack-form" onSubmit={(e) => void handleCreateTeam(e)}>
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
              onClick={() => void handleDeleteTeam(team.id)}
              type="button"
              disabled={isSubmitting || (team.my_role ? !isTeamAdminRole(team.my_role) : false)}
              title={team.my_role && !isTeamAdminRole(team.my_role) ? "Manager access required" : "Delete team"}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

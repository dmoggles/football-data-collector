import { useRef, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  assignAdminTeamOwner,
  assignUserGlobalRole,
  createAdminClub,
  createAdminTeam,
  deleteAdminClub,
  deleteAdminTeam,
  removeAdminTeamOwner,
  resolveApiAssetUrl,
  revokeUserGlobalRole,
  updateAdminClub,
  updateAdminTeam,
  uploadClubLogo,
} from "../api";
import { SearchableSelect } from "../components/SearchableSelect";
import { ADMIN_SUB_NAV_ITEMS } from "../constants";
import type { AdminAuditLogEntry, AdminOverview } from "../types/auth";
import type { AdminSection } from "../constants";

type AdminViewProps = {
  adminOverview: AdminOverview | null;
  adminAuditLogs: AdminAuditLogEntry[];
  isAdminLoading: boolean;
  onAdminDataChanged: () => Promise<void>;
  onWorkspaceDataChanged: () => Promise<void>;
};

export function AdminView({
  adminOverview,
  adminAuditLogs,
  isAdminLoading,
  onAdminDataChanged,
  onWorkspaceDataChanged,
}: AdminViewProps) {
  const [adminSection, setAdminSection] = useState<AdminSection>("home");
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const adminAssignEmailInputRef = useRef<HTMLInputElement | null>(null);

  const filteredAdminTeams = useMemo(() => {
    if (!adminOverview) return [];
    if (!showUnclaimedOnly) return adminOverview.teams;
    return adminOverview.teams.filter((team) => team.owners.length === 0);
  }, [adminOverview, showUnclaimedOnly]);

  const handleCreateAdminClub = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createAdminClub(adminClubName.trim());
      setAdminClubName("");
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create club");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignTeamAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminAssignTeamId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await assignAdminTeamOwner(adminAssignTeamId, adminAssignEmail.trim().toLowerCase());
      setAdminAssignEmail("");
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to assign manager");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveTeamAdmin = async (teamId: string, userId: string, userEmail: string) => {
    if (!window.confirm(`Remove '${userEmail}' as admin for this team?`)) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await removeAdminTeamOwner(teamId, userId);
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to remove manager");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGrantSuperAdmin = async (userId: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await assignUserGlobalRole(userId, "super_admin");
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to grant super admin role");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeSuperAdmin = async (userId: string, emailAddress: string) => {
    if (!window.confirm(`Revoke super admin role from '${emailAddress}'?`)) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await revokeUserGlobalRole(userId, "super_admin");
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to revoke super admin role");
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
    if (!adminCreateTeamClubId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await createAdminTeam({ club_id: adminCreateTeamClubId, team_name: adminCreateTeamName.trim() });
      setAdminCreateTeamName("");
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create team");
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
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update club");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminClubDelete = async (clubId: string, name: string) => {
    if (!window.confirm(`Delete club '${name}'?`)) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteAdminClub(clubId);
      if (adminEditingClubId === clubId) cancelAdminClubEdit();
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete club");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUploadClubLogo = async (clubId: string, file: File | null) => {
    if (!clubId || !file) return;
    setError(null);
    setClubLogoUploadClubId(clubId);
    setIsSubmitting(true);
    try {
      await uploadClubLogo(clubId, file);
      await Promise.all([onWorkspaceDataChanged(), onAdminDataChanged()]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to upload club logo");
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
    if (!adminEditingTeamClubId || !adminEditingTeamName.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await updateAdminTeam(teamId, { club_id: adminEditingTeamClubId, team_name: adminEditingTeamName.trim() });
      cancelAdminTeamEdit();
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update team");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminTeamDelete = async (teamId: string, teamLabel: string) => {
    if (!window.confirm(`Delete team '${teamLabel}'?`)) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteAdminTeam(teamId);
      if (adminEditingTeamId === teamId) cancelAdminTeamEdit();
      await onAdminDataChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete team");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card">
      {error ? <p className="error-message">{error}</p> : null}
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
      {!isAdminLoading && !adminOverview ? <p className="muted">Unable to load admin overview.</p> : null}
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
            <h3>Assign Manager</h3>
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
                Assign Manager
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
                        Add Manager
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
                          handleAdminTeamDelete(adminTeam.id, `${adminTeam.club_name} ${adminTeam.team_name}`)
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
  );
}

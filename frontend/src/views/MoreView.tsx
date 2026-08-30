type MoreViewProps = {
  email: string;
  isSuperAdmin: boolean;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  isSubmitting: boolean;
};

const Chevron = () => <span className="menu-chevron" aria-hidden="true">›</span>;

export function MoreView({ email, isSuperAdmin, onNavigate, onLogout, isSubmitting }: MoreViewProps) {
  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>More</h1>
          <p className="muted">Manage your team and account.</p>
        </div>
      </header>

      <section className="menu-card" aria-labelledby="team-menu-heading">
        <h2 id="team-menu-heading">Team</h2>
        <button type="button" onClick={() => onNavigate("/team/squad")}><span><strong>Squad</strong><small>Players and shirt numbers</small></span><Chevron /></button>
        <button type="button" onClick={() => onNavigate("/team/staff")}><span><strong>Staff access</strong><small>Managers and data collectors</small></span><Chevron /></button>
        <button type="button" onClick={() => onNavigate("/team/settings")}><span><strong>Team settings</strong><small>Teams, clubs, and branding</small></span><Chevron /></button>
      </section>

      <section className="menu-card" aria-labelledby="account-menu-heading">
        <h2 id="account-menu-heading">Account</h2>
        <button type="button" onClick={() => onNavigate("/account")}><span><strong>{email}</strong><small>Password and account security</small></span><Chevron /></button>
        {isSuperAdmin ? <button type="button" onClick={() => onNavigate("/admin")}><span><strong>Administration</strong><small>Clubs, teams, users, and audit log</small></span><Chevron /></button> : null}
        <button className="menu-danger" type="button" onClick={onLogout} disabled={isSubmitting}><span><strong>Log out</strong><small>End this session</small></span><Chevron /></button>
      </section>

      <p className="version-footer">TapLine {import.meta.env.VITE_APP_VERSION}</p>
    </div>
  );
}

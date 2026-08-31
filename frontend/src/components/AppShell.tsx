import type { ReactNode } from "react";

export type AppDestination = "home" | "fixtures" | "match" | "stats" | "more";

type AppShellProps = {
  activeDestination: AppDestination;
  children: ReactNode;
  clubLogoUrl: string | null;
  immersive?: boolean;
  isWorkspaceLoading: boolean;
  onNavigate: (destination: AppDestination) => void;
  onTeamChange: (teamId: string) => void;
  selectedTeamId: string;
  selectedTeamName: string;
  teams: Array<{ id: string; display_name: string }>;
};

const destinations: Array<{ id: AppDestination; label: string; icon: ReactNode }> = [
  { id: "home", label: "Home", icon: <path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /> },
  { id: "fixtures", label: "Fixtures", icon: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></> },
  { id: "match", label: "Match", icon: <><circle cx="12" cy="12" r="9" /><path d="m12 8 3 2-1 4h-4l-1-4zM7 5l2 5M17 5l-2 5M5 16l5-2M19 16l-5-2" /></> },
  { id: "stats", label: "Stats", icon: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></> },
  { id: "more", label: "More", icon: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></> },
];

function NavIcon({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export function AppShell({
  activeDestination,
  children,
  clubLogoUrl,
  immersive = false,
  isWorkspaceLoading,
  onNavigate,
  onTeamChange,
  selectedTeamId,
  selectedTeamName,
  teams,
}: AppShellProps) {
  if (immersive) return <main className="immersive-shell">{children}</main>;

  const navigation = (
    <nav className="primary-navigation" aria-label="Primary navigation">
      {destinations.map((destination) => (
        <button
          aria-current={activeDestination === destination.id ? "page" : undefined}
          className={`primary-nav-item ${activeDestination === destination.id ? "active" : ""}`}
          key={destination.id}
          onClick={() => onNavigate(destination.id)}
          title={destination.label}
          type="button"
        >
          <NavIcon>{destination.icon}</NavIcon>
          <span>{destination.label}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <main className="modern-app-shell">
      <aside className="app-rail">
        <button className="rail-brand" onClick={() => onNavigate("home")} type="button" aria-label="TapLine home">
          <img src="/assets/branding/logo1.png" alt="" />
        </button>
        {navigation}
      </aside>

      <section className="app-workspace">
        <div className="context-bar">
          <button className="mobile-brand" onClick={() => onNavigate("home")} type="button" aria-label="TapLine home">
            <img src="/assets/branding/logo1.png" alt="" />
          </button>
          <label className="team-context-control">
            {clubLogoUrl ? <img src={clubLogoUrl} alt="" /> : <span className="team-context-mark" aria-hidden="true">T</span>}
            <span className="sr-only">Current team</span>
            <select value={selectedTeamId} onChange={(event) => onTeamChange(event.target.value)}>
              {teams.length === 0 ? <option value="">No teams</option> : null}
              {teams.map((team) => <option key={team.id} value={team.id}>{team.display_name}</option>)}
            </select>
          </label>
          {isWorkspaceLoading || !selectedTeamName ? (
            <span className="context-status" aria-live="polite">
              {isWorkspaceLoading ? "Refreshing…" : "Select a team"}
            </span>
          ) : null}
        </div>
        <div className="route-content">{children}</div>
      </section>

      <div className="bottom-navigation">{navigation}</div>
    </main>
  );
}

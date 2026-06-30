import { useEffect, useMemo, useState } from "react";
import { SearchableSelect } from "../components/SearchableSelect";
import { getMatchPrepPlanValidation, startCollectionSession } from "../api";
import { formatClock } from "../utils/formatters";
import type { CollectionSession, Fixture, MatchPrepPlanValidation, Player, Team, TeamMember } from "../types/auth";

type DashboardViewProps = {
  selectedTeamId: string;
  selectedTeamCanManage: boolean;
  teams: Team[];
  fixtures: Fixture[];
  players: Player[];
  teamMembers: TeamMember[];
  activeCollectionSessions: CollectionSession[];
  onOpenMatchPrep: (fixtureId: string) => void;
  onOpenCollection: (sessionId: string) => void;
  onActiveSessionsChanged: () => Promise<void>;
};

export function DashboardView({
  selectedTeamId,
  selectedTeamCanManage,
  teams,
  fixtures,
  players,
  teamMembers,
  activeCollectionSessions,
  onOpenMatchPrep,
  onOpenCollection,
  onActiveSessionsChanged,
}: DashboardViewProps) {
  const startableCollectionFixtures = useMemo(() => {
    if (!selectedTeamId) return [] as Fixture[];
    return fixtures.filter(
      (fixture) =>
        (fixture.home_team_id === selectedTeamId || fixture.away_team_id === selectedTeamId) &&
        fixture.status.toLowerCase() !== "cancelled",
    );
  }, [fixtures, selectedTeamId]);
  const [selectedCollectionFixtureId, setSelectedCollectionFixtureId] = useState("");
  const [nextMatchPlanValidation, setNextMatchPlanValidation] = useState<MatchPrepPlanValidation | null>(null);
  const [isNextMatchPlanValidationLoading, setIsNextMatchPlanValidationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dashboardStats = useMemo(
    () => ({ teams: teams.length, fixtures: fixtures.length, players: players.length, members: teamMembers.length }),
    [fixtures.length, players.length, teamMembers.length, teams.length],
  );

  const nextMatchTile = useMemo(() => {
    const now = Date.now();
    const upcoming = fixtures
      .filter((fixture) => fixture.status.toLowerCase() !== "cancelled")
      .map((fixture) => {
        const kickoff = fixture.kickoff_at ? new Date(fixture.kickoff_at) : null;
        return { fixture, kickoff };
      })
      .filter(({ kickoff }) => kickoff && kickoff.getTime() >= now)
      .sort((a, b) => (a.kickoff?.getTime() ?? 0) - (b.kickoff?.getTime() ?? 0));

    const next = upcoming[0];
    if (!next || !next.kickoff) {
      return {
        title: "No upcoming fixtures",
        subtitle: "Schedule a fixture to see it here.",
        fixtureId: "",
      };
    }

    const fixture = next.fixture;
    const selectedTeamIsHome = selectedTeamId ? fixture.home_team_id === selectedTeamId : true;
    const opponent = selectedTeamIsHome
      ? `${fixture.away_club_name} ${fixture.away_team_name}`
      : `${fixture.home_club_name} ${fixture.home_team_name}`;
    return {
      title: opponent,
      subtitle: next.kickoff.toLocaleString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }),
      fixtureId: fixture.id,
    };
  }, [fixtures, selectedTeamId]);

  useEffect(() => {
    if (!startableCollectionFixtures.length) {
      setSelectedCollectionFixtureId("");
      return;
    }
    setSelectedCollectionFixtureId((current) =>
      startableCollectionFixtures.some((fixture) => fixture.id === current)
        ? current
        : startableCollectionFixtures[0].id,
    );
  }, [startableCollectionFixtures]);

  useEffect(() => {
    if (!selectedTeamId || !nextMatchTile.fixtureId || !selectedTeamCanManage) {
      setNextMatchPlanValidation(null);
      setIsNextMatchPlanValidationLoading(false);
      return;
    }

    let cancelled = false;
    setIsNextMatchPlanValidationLoading(true);
    void getMatchPrepPlanValidation(nextMatchTile.fixtureId, selectedTeamId)
      .then((result) => {
        if (!cancelled) setNextMatchPlanValidation(result);
      })
      .catch(() => {
        if (!cancelled) setNextMatchPlanValidation(null);
      })
      .finally(() => {
        if (!cancelled) setIsNextMatchPlanValidationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nextMatchTile.fixtureId, selectedTeamCanManage, selectedTeamId]);

  const handleStartCollectionSession = async () => {
    if (!selectedTeamId || !selectedCollectionFixtureId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const created = await startCollectionSession({
        match_id: selectedCollectionFixtureId,
        team_id: selectedTeamId,
      });
      await onActiveSessionsChanged();
      onOpenCollection(created.id);
    } catch (requestError) {
      if (requestError instanceof Error && requestError.message.includes("Confirm to continue")) {
        const confirmStart = window.confirm(`${requestError.message}\n\nStart anyway?`);
        if (confirmStart) {
          const created = await startCollectionSession({
            match_id: selectedCollectionFixtureId,
            team_id: selectedTeamId,
            confirm_off_schedule: true,
          });
          await onActiveSessionsChanged();
          onOpenCollection(created.id);
          setIsSubmitting(false);
          return;
        }
      }
      setError(requestError instanceof Error ? requestError.message : "Failed to start collection session");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card">
      {error ? <p className="error-banner">{error}</p> : null}
      <div className="stats-grid">
        <article>
          <h3>Teams</h3>
          <p>{dashboardStats.teams}</p>
        </article>
        <article>
          <h3>Fixtures</h3>
          <p>{dashboardStats.fixtures}</p>
        </article>
        <article>
          <h3>Players</h3>
          <p>{dashboardStats.players}</p>
        </article>
        <article>
          <h3>Members</h3>
          <p>{dashboardStats.members}</p>
        </article>
        <article>
          <h3>Next Match</h3>
          <p>{nextMatchTile.title}</p>
          <span className="muted">{nextMatchTile.subtitle}</span>
          {nextMatchTile.fixtureId ? (
            <div className="next-match-plan-status">
              {isNextMatchPlanValidationLoading ? (
                <p className="muted">Checking match plan...</p>
              ) : null}
              {!selectedTeamCanManage ? (
                <p className="muted">Manager access required to validate plan.</p>
              ) : null}
              {selectedTeamCanManage && !isNextMatchPlanValidationLoading && nextMatchPlanValidation ? (
                <>
                  {nextMatchPlanValidation.valid && nextMatchPlanValidation.warnings.length === 0 ? (
                    <p className="muted">Match plan is valid.</p>
                  ) : null}
                  {!nextMatchPlanValidation.valid ? (
                    <p className="muted">
                      Match plan invalid:{" "}
                      {nextMatchPlanValidation.errors[0] ?? "one or more segments are incomplete."}
                    </p>
                  ) : null}
                  {nextMatchPlanValidation.valid && nextMatchPlanValidation.warnings.length > 0 ? (
                    <p className="muted">
                      Match plan valid with warning:{" "}
                      {nextMatchPlanValidation.warnings[0] ?? "some players are out of position."}
                    </p>
                  ) : null}
                </>
              ) : null}
              <button
                className="button secondary"
                type="button"
                onClick={() => onOpenMatchPrep(nextMatchTile.fixtureId)}
                disabled={!selectedTeamCanManage || !nextMatchTile.fixtureId}
              >
                Open Match Prep
              </button>
            </div>
          ) : null}
        </article>
        <article>
          <h3>Live Match</h3>
          {!selectedTeamId ? <p className="muted">Select a team.</p> : null}
          {selectedTeamId && activeCollectionSessions.length === 0 ? (
            <p className="muted">No live collection session.</p>
          ) : null}
          {activeCollectionSessions[0] ? (
            <>
              <p>
                {activeCollectionSessions[0].fixture_label} · P{activeCollectionSessions[0].period_number}/
                {activeCollectionSessions[0].total_periods}
              </p>
              <span className="muted">{formatClock(activeCollectionSessions[0].elapsed_seconds)}</span>
              <div style={{ marginTop: "0.45rem" }}>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => onOpenCollection(activeCollectionSessions[0].id)}
                >
                  Go To Match Screen
                </button>
              </div>
            </>
          ) : null}
          {selectedTeamCanManage ? (
            <div className="collection-start-row">
              <SearchableSelect
                value={selectedCollectionFixtureId}
                onChange={setSelectedCollectionFixtureId}
                options={startableCollectionFixtures.map((fixture) => {
                  const opposition =
                    fixture.home_team_id === selectedTeamId
                      ? `${fixture.away_club_name} ${fixture.away_team_name}`
                      : `${fixture.home_club_name} ${fixture.home_team_name}`;
                  return {
                    value: fixture.id,
                    label: `${opposition}${fixture.kickoff_at ? ` · ${new Date(fixture.kickoff_at).toLocaleString()}` : ""}`,
                  };
                })}
                placeholder="Select fixture"
                disabled={!selectedTeamId || startableCollectionFixtures.length === 0}
              />
              <button
                className="button primary"
                type="button"
                disabled={!selectedTeamId || !selectedCollectionFixtureId || isSubmitting}
                onClick={() => void handleStartCollectionSession()}
              >
                Start Game
              </button>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

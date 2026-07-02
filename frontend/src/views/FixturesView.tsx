import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { createFixture, deleteFixture, updateFixture } from "../api";
import { SearchableSelect } from "../components/SearchableSelect";
import {
  CALENDAR_WEEKDAY_LABELS,
  FIXTURE_STATUS_OPTIONS,
  KICKOFF_TIME_OPTIONS,
  MATCH_FORMAT_OPTIONS,
  MATCH_PERIOD_FORMAT_OPTIONS,
} from "../constants";
import type { FixtureVenue } from "../constants";
import { fixtureFormatIcon, fixtureStatusClass, timeToMinutes, toLocalDateKey, toQuarterHourTime } from "../utils/formatters";
import type { Fixture, MatchFormat, MatchPeriodFormat, TeamDirectory } from "../types/auth";

type FixturesViewProps = {
  selectedTeamId: string;
  selectedTeamName: string;
  selectedTeamCanManage: boolean;
  fixtures: Fixture[];
  fixtureOppositionOptions: TeamDirectory[];
  onFixturesChanged: () => void;
};

export function FixturesView({
  selectedTeamId,
  selectedTeamName,
  selectedTeamCanManage,
  fixtures,
  fixtureOppositionOptions,
  onFixturesChanged,
}: FixturesViewProps) {
  const [fixtureCalendarMonth, setFixtureCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [fixtureOpponentTeamId, setFixtureOpponentTeamId] = useState("");
  const [fixtureFormat, setFixtureFormat] = useState<MatchFormat>("11_aside");
  const [fixturePeriodFormat, setFixturePeriodFormat] = useState<MatchPeriodFormat>("halves");
  const [fixturePeriodLengthMinutes, setFixturePeriodLengthMinutes] = useState("35");
  const [fixtureVenue, setFixtureVenue] = useState<FixtureVenue>("home");
  const [fixtureKickoffDate, setFixtureKickoffDate] = useState("");
  const [fixtureKickoffTime, setFixtureKickoffTime] = useState("");
  const [fixtureStatus, setFixtureStatus] = useState("scheduled");
  const [editingFixtureId, setEditingFixtureId] = useState("");
  const [isFixtureComposerOpen, setIsFixtureComposerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fixturesByDateKey = useMemo(() => {
    const grouped: Record<string, Fixture[]> = {};
    for (const fixture of fixtures) {
      if (!fixture.kickoff_at) continue;
      const key = toLocalDateKey(new Date(fixture.kickoff_at));
      grouped[key] = grouped[key] ? [...grouped[key], fixture] : [fixture];
    }
    return grouped;
  }, [fixtures]);

  const fixtureConflictWarnings = useMemo(() => {
    if (!selectedTeamId || !fixtureOpponentTeamId || !fixtureKickoffDate) return [];
    const targetKickoffMinutes = fixtureKickoffTime ? timeToMinutes(fixtureKickoffTime) : null;
    const warnings: string[] = [];
    let hasSameDayOppositionConflict = false;
    let hasKickoffOverlap = false;
    for (const fixture of fixtures) {
      if (editingFixtureId && fixture.id === editingFixtureId) continue;
      const fixtureDateKey = fixture.kickoff_at ? toLocalDateKey(new Date(fixture.kickoff_at)) : "";
      const fixtureTime = fixture.kickoff_at ? new Date(fixture.kickoff_at).toTimeString().slice(0, 5) : "";
      const fixtureMinutes = fixtureTime ? timeToMinutes(fixtureTime) : null;
      const fixtureOppositionId =
        fixture.home_team_id === selectedTeamId ? fixture.away_team_id : fixture.home_team_id;
      if (fixtureDateKey === fixtureKickoffDate && fixtureOppositionId === fixtureOpponentTeamId) {
        hasSameDayOppositionConflict = true;
      }
      if (
        fixtureKickoffTime &&
        targetKickoffMinutes !== null &&
        fixtureMinutes !== null &&
        fixtureDateKey === fixtureKickoffDate &&
        Math.abs(fixtureMinutes - targetKickoffMinutes) < 60
      ) {
        hasKickoffOverlap = true;
      }
    }
    if (hasSameDayOppositionConflict) {
      warnings.push("Potential conflict: you already have a fixture against this opposition on the same date.");
    }
    if (hasKickoffOverlap) {
      warnings.push("Potential conflict: another fixture for this team starts within 60 minutes of this kickoff.");
    }
    return warnings;
  }, [editingFixtureId, fixtureKickoffDate, fixtureKickoffTime, fixtureOpponentTeamId, selectedTeamId, fixtures]);

  const calendarCells = useMemo(() => {
    const year = fixtureCalendarMonth.getFullYear();
    const month = fixtureCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const cells: Array<{ date: Date; inCurrentMonth: boolean }> = [];
    for (let i = startWeekday - 1; i >= 0; i -= 1) {
      cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inCurrentMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ date: new Date(year, month, day), inCurrentMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - (startWeekday + daysInMonth) + 1;
      cells.push({ date: new Date(year, month + 1, nextDay), inCurrentMonth: false });
    }
    return cells;
  }, [fixtureCalendarMonth]);

  const resetFixtureForm = () => {
    setEditingFixtureId("");
    setFixtureFormat("11_aside");
    setFixturePeriodFormat("halves");
    setFixturePeriodLengthMinutes("35");
    setFixtureVenue("home");
    setFixtureKickoffDate("");
    setFixtureKickoffTime("");
    setFixtureStatus("scheduled");
    setFixtureOpponentTeamId("");
    setIsFixtureComposerOpen(false);
  };

  const openFixtureComposer = (date: Date | null = null) => {
    setEditingFixtureId("");
    setFixtureFormat("11_aside");
    setFixturePeriodFormat("halves");
    setFixturePeriodLengthMinutes("35");
    setFixtureVenue("home");
    setFixtureStatus("scheduled");
    setFixtureOpponentTeamId("");
    if (date) {
      setFixtureKickoffDate(toLocalDateKey(date));
      setFixtureKickoffTime("18:00");
    } else {
      setFixtureKickoffDate("");
      setFixtureKickoffTime("");
    }
    setIsFixtureComposerOpen(true);
  };

  const startFixtureEdit = (fixture: Fixture) => {
    setEditingFixtureId(fixture.id);
    const selectedTeamIsHome = fixture.home_team_id === selectedTeamId;
    setFixtureVenue(selectedTeamIsHome ? "home" : "away");
    setFixtureOpponentTeamId(selectedTeamIsHome ? fixture.away_team_id : fixture.home_team_id);
    setFixtureFormat(fixture.format);
    setFixturePeriodFormat(fixture.period_format as MatchPeriodFormat);
    setFixturePeriodLengthMinutes(String(fixture.period_length_minutes));
    setFixtureStatus(
      FIXTURE_STATUS_OPTIONS.some((option) => option.value === fixture.status.toLowerCase())
        ? fixture.status.toLowerCase()
        : "scheduled",
    );
    if (fixture.kickoff_at) {
      const localDate = new Date(fixture.kickoff_at);
      setFixtureKickoffDate(toLocalDateKey(localDate));
      setFixtureKickoffTime(toQuarterHourTime(localDate));
    } else {
      setFixtureKickoffDate("");
      setFixtureKickoffTime("");
    }
    setIsFixtureComposerOpen(true);
  };

  const handleCreateOrUpdateFixture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTeamId) {
      setError("Select one of your teams first");
      return;
    }
    if (!fixtureOpponentTeamId) {
      setError("Please select a valid opposition team from the list");
      return;
    }
    if (selectedTeamId === fixtureOpponentTeamId) {
      setError("Opposition team must be different");
      return;
    }
    if (fixtureKickoffDate && !fixtureKickoffTime) {
      setError("Select a kickoff time in 15-minute increments");
      return;
    }
    const parsedPeriodLength = Number(fixturePeriodLengthMinutes);
    if (!Number.isInteger(parsedPeriodLength) || parsedPeriodLength < 1 || parsedPeriodLength > 120) {
      setError("Period length must be between 1 and 120 minutes");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const kickoffAt = fixtureKickoffDate
        ? new Date(`${fixtureKickoffDate}T${fixtureKickoffTime}`).toISOString()
        : null;
      const payload = {
        home_team_id: fixtureVenue === "home" ? selectedTeamId : fixtureOpponentTeamId,
        away_team_id: fixtureVenue === "home" ? fixtureOpponentTeamId : selectedTeamId,
        format: fixtureFormat,
        period_format: fixturePeriodFormat,
        period_length_minutes: parsedPeriodLength,
        kickoff_at: kickoffAt,
        status: editingFixtureId ? fixtureStatus.trim() || "scheduled" : "scheduled",
      };
      if (editingFixtureId) {
        await updateFixture(editingFixtureId, payload);
      } else {
        await createFixture(payload);
      }
      onFixturesChanged();
      resetFixtureForm();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save fixture");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFixture = async (fixtureId: string) => {
    if (
      !window.confirm(
        "Delete this fixture?\n\nThis will permanently remove the fixture and all related data, including match prep plans, substitution plans, coaching notes, squads, and collected events.",
      )
    ) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteFixture(fixtureId);
      if (editingFixtureId === fixtureId) resetFixtureForm();
      onFixturesChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete fixture");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card">
      {error ? <p className="error-message">{error}</p> : null}
      <div className="fixture-toolbar">
        <div className="fixture-month-controls">
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              setFixtureCalendarMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
              )
            }
          >
            Prev
          </button>
          <h3>{fixtureCalendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h3>
          <button
            className="button secondary"
            type="button"
            onClick={() => setFixtureCalendarMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
          >
            Today
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              setFixtureCalendarMonth(
                (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
              )
            }
          >
            Next
          </button>
        </div>
        <button
          className="button primary"
          type="button"
          disabled={!selectedTeamId || !selectedTeamCanManage}
          onClick={() => openFixtureComposer()}
        >
          + Add Fixture
        </button>
      </div>

      {!selectedTeamId ? <p className="muted">Select a team to view fixtures.</p> : null}
      {!selectedTeamCanManage && selectedTeamId ? (
        <p className="muted">Manager access required to add or edit fixtures.</p>
      ) : null}
      {selectedTeamId ? (
        <>
          <p className="muted">Showing fixtures for {selectedTeamName}.</p>
          <div className="calendar-weekdays">
            {CALENDAR_WEEKDAY_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarCells.map(({ date, inCurrentMonth }) => {
              const dateKey = toLocalDateKey(date);
              const isToday = dateKey === toLocalDateKey(new Date());
              const dayFixtures = fixturesByDateKey[dateKey] ?? [];
              return (
                <div
                  key={`${dateKey}-${inCurrentMonth ? "in" : "out"}`}
                  className={`calendar-cell ${inCurrentMonth ? "" : "outside"} ${isToday ? "today" : ""}`}
                  onClick={() => inCurrentMonth && openFixtureComposer(date)}
                  onKeyDown={(event) => {
                    if (!inCurrentMonth) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openFixtureComposer(date);
                    }
                  }}
                  role={inCurrentMonth ? "button" : undefined}
                  tabIndex={inCurrentMonth ? 0 : -1}
                >
                  <span className="calendar-date">{date.getDate()}</span>
                  <div className="calendar-fixtures">
                    {dayFixtures.map((fixture) => {
                      const oppositionName =
                        fixture.home_team_id === selectedTeamId
                          ? `${fixture.away_club_name} ${fixture.away_team_name}`
                          : `${fixture.home_club_name} ${fixture.home_team_name}`;
                      const venueLabel = fixture.home_team_id === selectedTeamId ? "H" : "A";
                      return (
                        <button
                          key={fixture.id}
                          type="button"
                          className={`${fixtureStatusClass(fixture.status)} ${fixture.can_manage ? "" : "locked"}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (fixture.can_manage) startFixtureEdit(fixture);
                          }}
                          title={`${fixture.can_manage ? "" : "Locked · "} ${oppositionName}${
                            fixture.kickoff_at
                              ? ` · ${new Date(fixture.kickoff_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}`
                              : ""
                          } · ${fixture.format.replace("_", " ")} · ${fixture.period_format.replace("_", " ")} · ${fixture.period_length_minutes} min`}
                        >
                          <span className={`fixture-venue-badge ${venueLabel === "H" ? "home" : "away"}`}>
                            {venueLabel}
                          </span>{" "}
                          {fixtureFormatIcon(fixture.format)}{" "}
                          {fixture.kickoff_at
                            ? new Date(fixture.kickoff_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "TBD"}{" "}
                          vs {oppositionName}
                          {!fixture.can_manage ? " 🔒" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {isFixtureComposerOpen ? (
        <div className="fixture-composer-overlay" role="dialog" aria-modal="true">
          <form className="fixture-composer" onSubmit={handleCreateOrUpdateFixture}>
            <h3>{editingFixtureId ? "Edit Fixture" : "Add Fixture"}</h3>
            <p className="muted">{selectedTeamName}</p>
            <div className="fixture-venue-toggle" role="group" aria-label="Fixture venue">
              <button
                className={`button secondary ${fixtureVenue === "home" ? "is-selected" : ""}`}
                type="button"
                onClick={() => setFixtureVenue("home")}
              >
                Home
              </button>
              <button
                className={`button secondary ${fixtureVenue === "away" ? "is-selected" : ""}`}
                type="button"
                onClick={() => setFixtureVenue("away")}
              >
                Away
              </button>
            </div>
            <SearchableSelect
              value={fixtureOpponentTeamId}
              onChange={(nextValue) => setFixtureOpponentTeamId(nextValue)}
              options={fixtureOppositionOptions.map((team) => ({
                value: team.id,
                label: team.display_name,
              }))}
              placeholder="Select opposition team"
            />
            <select
              value={fixtureFormat}
              onChange={(event) => setFixtureFormat(event.target.value as MatchFormat)}
            >
              {MATCH_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={fixturePeriodFormat}
              onChange={(event) => setFixturePeriodFormat(event.target.value as MatchPeriodFormat)}
            >
              {MATCH_PERIOD_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={120}
              value={fixturePeriodLengthMinutes}
              onChange={(event) => setFixturePeriodLengthMinutes(event.target.value)}
              placeholder="Period length (minutes)"
              required
            />
            <div className="member-actions">
              <input
                type="date"
                value={fixtureKickoffDate}
                onChange={(event) => {
                  setFixtureKickoffDate(event.target.value);
                  if (event.target.value && !fixtureKickoffTime) {
                    setFixtureKickoffTime("18:00");
                  }
                }}
              />
              <select
                value={fixtureKickoffTime}
                onChange={(event) => setFixtureKickoffTime(event.target.value)}
                disabled={!fixtureKickoffDate}
              >
                <option value="">Time</option>
                {KICKOFF_TIME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {fixtureConflictWarnings.length > 0 ? (
              <div className="stack-form">
                {fixtureConflictWarnings.map((warning) => (
                  <p className="muted" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
            <SearchableSelect
              value={fixtureStatus}
              options={FIXTURE_STATUS_OPTIONS}
              onChange={setFixtureStatus}
              placeholder="Select fixture status"
              disabled={!editingFixtureId}
            />
            <div className="member-actions">
              <button
                className="button primary"
                disabled={isSubmitting || !selectedTeamId || !fixtureOpponentTeamId}
                type="submit"
              >
                {editingFixtureId ? "Save Fixture" : "Create Fixture"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={isSubmitting}
                onClick={resetFixtureForm}
              >
                Cancel
              </button>
              {editingFixtureId ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDeleteFixture(editingFixtureId)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

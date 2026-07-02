import { useState } from "react";
import type { FormEvent } from "react";
import { createPlayer, deletePlayer, updatePlayer } from "../api";
import { POSITION_OPTIONS } from "../constants";
import type { Player } from "../types/auth";
import type { WorkspaceCtx } from "../types/workspace";

type PlayersViewProps = Pick<
  WorkspaceCtx,
  "selectedTeamId" | "selectedTeamName" | "playersForSelectedTeam" | "selectedTeamCanManage" | "onPlayersChanged"
>;

export function PlayersView({
  selectedTeamId,
  selectedTeamName,
  playersForSelectedTeam,
  selectedTeamCanManage,
  onPlayersChanged,
}: PlayersViewProps) {
  const [playerName, setPlayerName] = useState("");
  const [shirtNumber, setShirtNumber] = useState("");
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [editingPlayerId, setEditingPlayerId] = useState("");
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setEditingPlayerId("");
    setPlayerName("");
    setShirtNumber("");
    setSelectedPositions([]);
    setIsComposerOpen(false);
    setError(null);
  };

  const startEdit = (player: Player) => {
    setEditingPlayerId(player.id);
    setPlayerName(player.display_name);
    setShirtNumber(player.shirt_number ? String(player.shirt_number) : "");
    const positions = player.position
      ? player.position.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setSelectedPositions(positions);
    setIsComposerOpen(true);
  };

  const togglePosition = (code: string) => {
    setSelectedPositions((prev) =>
      prev.includes(code) ? prev.filter((p) => p !== code) : [...prev, code],
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTeamId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const parsedShirtNumber = shirtNumber.trim() ? Number(shirtNumber) : null;
      const position = selectedPositions.length > 0 ? selectedPositions.join(", ") : null;
      if (editingPlayerId) {
        await updatePlayer(editingPlayerId, { display_name: playerName.trim(), shirt_number: parsedShirtNumber, position });
      } else {
        await createPlayer({ team_id: selectedTeamId, display_name: playerName.trim(), shirt_number: parsedShirtNumber, position });
      }
      reset();
      onPlayersChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save player");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (playerId: string) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await deletePlayer(playerId);
      onPlayersChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete player");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="section-card">
      {error ? <p className="error-message">{error}</p> : null}
      <div className="player-toolbar match-prep-toolbar">
        <button
          className="button primary"
          type="button"
          disabled={isSubmitting || !selectedTeamId || !selectedTeamCanManage}
          onClick={() => setIsComposerOpen(true)}
        >
          + Add Player
        </button>
      </div>
      {!selectedTeamId ? <p className="muted">Select a team to view players.</p> : null}
      {!selectedTeamCanManage && selectedTeamId ? (
        <p className="muted">Manager access required to add players.</p>
      ) : null}

      <div>
        <h3>Players {selectedTeamName ? `- ${selectedTeamName}` : ""}</h3>
        {selectedTeamId && playersForSelectedTeam.length === 0 ? <p className="muted">No players yet.</p> : null}
        {playersForSelectedTeam.map((player) => (
          <div className="list-row" key={player.id}>
            <span>
              {player.display_name}
              {player.shirt_number ? ` #${player.shirt_number}` : ""}
              {player.position ? ` (${player.position})` : ""}
            </span>
            <div className="member-actions">
              <button
                className="button secondary"
                onClick={() => startEdit(player)}
                type="button"
                disabled={isSubmitting || !selectedTeamCanManage}
              >
                Edit
              </button>
              <button
                className="button secondary"
                onClick={() => handleDelete(player.id)}
                type="button"
                disabled={isSubmitting || !selectedTeamCanManage}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {isComposerOpen ? (
        <div className="fixture-composer-overlay" role="dialog" aria-modal="true">
          <form className="fixture-composer" onSubmit={handleSubmit}>
            <h3>{editingPlayerId ? "Edit Player" : "Add Player"}</h3>
            <p className="muted">{selectedTeamName}</p>
            <input
              placeholder="Player name"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              required
            />
            <input
              placeholder="Shirt number"
              value={shirtNumber}
              onChange={(event) => setShirtNumber(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]*"
            />
            <div className="position-grid">
              {POSITION_OPTIONS.map((code) => (
                <label className="position-option" key={code}>
                  <input
                    checked={selectedPositions.includes(code)}
                    onChange={() => togglePosition(code)}
                    type="checkbox"
                  />
                  <span>{code}</span>
                </label>
              ))}
            </div>
            <div className="member-actions">
              <button className="button primary" disabled={isSubmitting || !selectedTeamId} type="submit">
                {editingPlayerId ? "Save Player" : "Add Player"}
              </button>
              <button className="button secondary" type="button" disabled={isSubmitting} onClick={reset}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}

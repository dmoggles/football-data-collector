import { useMemo, useState } from "react";
import type { TeamDirectory } from "../types/auth";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const similarity = (left: string, right: string) => {
  const a = normalize(left);
  const b = normalize(right);
  if (a === b) return 1;
  const at = new Set(a.split(" "));
  const bt = new Set(b.split(" "));
  const overlap = [...at].filter((token) => bt.has(token)).length / Math.max(at.size, bt.size, 1);
  const includes = a.includes(b) || b.includes(a) ? 0.8 : 0;
  return Math.max(overlap, includes);
};

type Props = {
  teams: TeamDirectory[];
  selectedId: string;
  typedName: string;
  onChange: (id: string, name: string) => void;
};

export function CreatableTeamSelect({ teams, selectedId, typedName, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const query = selectedId ? teams.find((team) => team.id === selectedId)?.display_name ?? typedName : typedName;
  const ranked = useMemo(() => teams.map((team) => ({ team, score: similarity(typedName, team.display_name) }))
    .filter(({ score }) => !typedName.trim() || score >= 0.34)
    .sort((a, b) => b.score - a.score || a.team.display_name.localeCompare(b.team.display_name)).slice(0, 8), [teams, typedName]);
  const hasCloseMatch = ranked.some(({ score }) => score >= 0.5);

  return <div className="searchable-select">
    <input value={query} placeholder="Select or type opposition" onFocus={() => setOpen(true)} onChange={(event) => {
      const name = event.target.value;
      const exact = teams.filter((team) => normalize(team.display_name) === normalize(name));
      onChange(exact.length === 1 ? exact[0].id : "", name);
      setOpen(true);
    }} />
    {open ? <div className="searchable-select-menu">
      {ranked.map(({ team }) => <button type="button" className="searchable-select-option" key={team.id} onClick={() => { onChange(team.id, team.display_name); setOpen(false); }}>{team.display_name}{team.is_unclaimed ? " · Unclaimed" : ""}</button>)}
      {typedName.trim() && !selectedId ? <button type="button" className="searchable-select-option" onClick={() => {
        if (!hasCloseMatch || window.confirm("A similar team exists. Create a new unclaimed team anyway?")) setOpen(false);
      }}>Create unclaimed team “{typedName.trim()}”</button> : null}
    </div> : null}
  </div>;
}

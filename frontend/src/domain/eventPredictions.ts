import type { FormationSlot } from "./formations";

export type SupportedEventKind = "shot" | "tackle" | "interception" | "pass";

export type LineupPlayerPosition = {
  playerId: string;
  slot: FormationSlot;
};

type PredictionInput = {
  eventKind: SupportedEventKind;
  xPct: number;
  yPct: number;
  lineup: LineupPlayerPosition[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRole(role: string): string {
  return role.trim().toUpperCase();
}

function shotRoleWeight(role: string): number {
  const normalized = normalizeRole(role);
  if (normalized === "ST") {
    return 0.82;
  }
  if (normalized === "LW" || normalized === "RW") {
    return 0.86;
  }
  if (normalized === "AM") {
    return 0.9;
  }
  if (normalized === "CM") {
    return 0.98;
  }
  if (normalized === "DM") {
    return 1.05;
  }
  if (normalized === "LB" || normalized === "RB" || normalized === "LWB" || normalized === "RWB") {
    return 1.08;
  }
  if (normalized === "CB") {
    return 1.12;
  }
  if (normalized === "GK") {
    return 1.4;
  }
  return 1;
}

function eventVisualPoint(xPct: number, yPct: number): { x: number; y: number } {
  // Collection pitch currently renders with mirrored horizontal axis:
  // left (screen) = 100 - y_pct, top (screen) = 100 - x_pct.
  return {
    x: 100 - yPct,
    y: 100 - xPct,
  };
}

function scoreCandidate(eventKind: SupportedEventKind, xPct: number, yPct: number, slot: FormationSlot): number {
  const point = eventVisualPoint(xPct, yPct);
  const dx = point.x - slot.x;
  const dy = point.y - slot.y;
  const distance = Math.hypot(dx, dy);
  if (eventKind !== "shot") {
    return distance;
  }
  const attackFactor = clamp((xPct - 35) / 65, 0, 1);
  const roleBias = shotRoleWeight(slot.role);
  const blendedWeight = 1 + (roleBias - 1) * attackFactor;
  return distance * blendedWeight;
}

export function predictLikelyPlayerId(input: PredictionInput): string | null {
  const { eventKind, xPct, yPct, lineup } = input;
  if (!lineup.length) {
    return null;
  }
  let best: { playerId: string; score: number } | null = null;
  for (const candidate of lineup) {
    const score = scoreCandidate(eventKind, xPct, yPct, candidate.slot);
    if (!best || score < best.score) {
      best = { playerId: candidate.playerId, score };
    }
  }
  return best?.playerId ?? null;
}

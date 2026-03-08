import goalDimensionsCatalogRaw from "../../../shared/goal_dimensions.json";
import type { MatchFormat } from "../types/auth";

type GoalDimensionsEntry = {
  pitch_width_m: number;
  width_ft: number;
  height_ft: number;
};

type GoalDimensionsCatalog = {
  formats: Partial<Record<MatchFormat, GoalDimensionsEntry>>;
};

const CATALOG = goalDimensionsCatalogRaw as GoalDimensionsCatalog;

export function getGoalDimensions(format: MatchFormat | null | undefined): GoalDimensionsEntry | null {
  if (!format) {
    return null;
  }
  const entry = CATALOG.formats?.[format];
  if (!entry) {
    return null;
  }
  if (!Number.isFinite(entry.pitch_width_m) || !Number.isFinite(entry.width_ft) || !Number.isFinite(entry.height_ft)) {
    return null;
  }
  return { pitch_width_m: entry.pitch_width_m, width_ft: entry.width_ft, height_ft: entry.height_ft };
}

export function getGoalWidthSpanPct(goalWidthFt: number, pitchWidthM: number): number {
  const pitchWidthFt = pitchWidthM * 3.28084;
  if (!Number.isFinite(goalWidthFt) || !Number.isFinite(pitchWidthFt) || goalWidthFt <= 0 || pitchWidthFt <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (goalWidthFt / pitchWidthFt) * 100));
}

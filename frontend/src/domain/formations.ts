import formationsCatalogRaw from "../../../shared/formations.json";
import type { MatchFormat } from "../types/auth";

export type FormationSlot = {
  id: string;
  label: string;
  role: string;
  x: number;
  y: number;
  lineIndex: number;
  playerIndex: number;
};

type BandLane = "left" | "center" | "right";
type DepthBand = "CB" | "DM" | "CM" | "AM" | "ST";
type BandEntry = {
  role: string;
  lane: BandLane;
};
type FormationDefinition = {
  id: string;
  bands: Record<DepthBand, BandEntry[]>;
};
type FormatConfig = {
  required_starting_count: number;
  formations: FormationDefinition[];
};

const BAND_ORDER: DepthBand[] = ["CB", "DM", "CM", "AM", "ST"];

const BAND_Y: Record<DepthBand, number> = {
  CB: 76,
  DM: 64,
  CM: 52,
  AM: 40,
  ST: 28,
};

function clampX(value: number): number {
  return Math.max(8, Math.min(92, value));
}

function lineXs(count: number): number[] {
  const presets: Record<number, number[]> = {
    1: [50],
    2: [36, 64],
    3: [22, 50, 78],
    4: [16, 38, 62, 84],
    5: [12, 30, 50, 70, 88],
  };
  if (presets[count]) {
    return presets[count];
  }
  return Array.from({ length: count }, (_, index) => 12 + (index * 76) / Math.max(1, count - 1));
}

function laneXs(lane: BandLane, count: number): number[] {
  const byLane: Record<BandLane, Record<number, number[]>> = {
    left: {
      1: [18],
      2: [14, 24],
      3: [12, 20, 28],
    },
    right: {
      1: [82],
      2: [86, 76],
      3: [88, 80, 72],
    },
    center: {
      1: [50],
      2: [42, 58],
      3: [36, 50, 64],
      4: [32, 44, 56, 68],
      5: [28, 39, 50, 61, 72],
    },
  };
  const preset = byLane[lane][count];
  if (preset) {
    return preset;
  }
  if (lane === "left") {
    return Array.from({ length: count }, (_, index) => 12 + index * 8);
  }
  if (lane === "right") {
    return Array.from({ length: count }, (_, index) => 88 - index * 8);
  }
  return lineXs(count);
}

function fallbackBandIndexes(lineCount: number): number[] {
  const presets: Record<number, number[]> = {
    1: [2], // CM
    2: [0, 4], // CB -> ST
    3: [0, 2, 4], // CB -> CM -> ST
    4: [0, 1, 3, 4], // CB -> DM -> AM -> ST
    5: [0, 1, 2, 3, 4], // all bands
  };
  return presets[Math.min(Math.max(lineCount, 1), 5)];
}

function fallbackBandsFromFormation(formationId: string): Record<DepthBand, BandEntry[]> {
  const lineSizes = formationId
    .split("-")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  const bands: Record<DepthBand, BandEntry[]> = { CB: [], DM: [], CM: [], AM: [], ST: [] };
  const targetBandIndexes = fallbackBandIndexes(lineSizes.length);
  lineSizes.forEach((size, compactLineIndex) => {
    const band = BAND_ORDER[targetBandIndexes[compactLineIndex] ?? 2];
    bands[band] = Array.from({ length: size }, (_, playerIndex) => ({
      role: `L${compactLineIndex + 1}-${playerIndex + 1}`,
      lane: "center",
    }));
  });
  return bands;
}

function parseCatalog(): Record<MatchFormat, FormatConfig> {
  const root = formationsCatalogRaw as { formats?: Record<string, unknown> };
  const formats = root.formats;
  if (!formats) {
    throw new Error("Invalid formations catalog: missing formats object");
  }

  const parsed: Partial<Record<MatchFormat, FormatConfig>> = {};
  const supportedFormats: MatchFormat[] = ["5_aside", "7_aside", "9_aside", "11_aside"];
  for (const matchFormat of supportedFormats) {
    const formatConfig = formats[matchFormat] as {
      required_starting_count?: number;
      formations?: Array<{ id?: string; bands?: Record<string, Array<{ role?: string; lane?: string }>> }>;
    };
    if (!formatConfig || !Array.isArray(formatConfig.formations)) {
      throw new Error(`Invalid formations catalog: formats.${matchFormat}.formations must be a list`);
    }
    const formations = formatConfig.formations.map((item, index) => {
      const id = item.id?.trim();
      if (!id) {
        throw new Error(`Invalid formations catalog: formats.${matchFormat}.formations[${index}].id is required`);
      }
      const bands: Record<DepthBand, BandEntry[]> = { CB: [], DM: [], CM: [], AM: [], ST: [] };
      for (const band of BAND_ORDER) {
        const entries = item.bands?.[band] ?? [];
        if (!Array.isArray(entries)) {
          throw new Error(`Invalid formations catalog: formats.${matchFormat}.formations[${index}].bands.${band} must be a list`);
        }
        bands[band] = entries.map((entry, entryIndex) => {
          const role = entry.role?.trim();
          if (!role) {
            throw new Error(
              `Invalid formations catalog: formats.${matchFormat}.formations[${index}].bands.${band}[${entryIndex}].role is required`,
            );
          }
          const lane = (entry.lane?.trim().toLowerCase() ?? "center") as BandLane;
          if (lane !== "left" && lane !== "center" && lane !== "right") {
            throw new Error(
              `Invalid formations catalog: formats.${matchFormat}.formations[${index}].bands.${band}[${entryIndex}].lane must be left/center/right`,
            );
          }
          return { role, lane };
        });
      }
      return { id, bands };
    });

    parsed[matchFormat] = {
      required_starting_count: formatConfig.required_starting_count ?? 0,
      formations,
    };
  }

  return parsed as Record<MatchFormat, FormatConfig>;
}

const FORMATION_CATALOG = parseCatalog();

function getFormationDefinition(format: MatchFormat, formationId: string): FormationDefinition {
  const definition = FORMATION_CATALOG[format].formations.find((item) => item.id === formationId);
  if (definition) {
    return definition;
  }
  return { id: formationId, bands: fallbackBandsFromFormation(formationId) };
}

export function getFormationSlots(format: MatchFormat, formationId: string): FormationSlot[] {
  const definition = getFormationDefinition(format, formationId);
  const slots: FormationSlot[] = [{ id: "GK", label: "GK", role: "GK", x: 50, y: 90, lineIndex: 0, playerIndex: 0 }];

  let compactLineIndex = 0;
  BAND_ORDER.forEach((band) => {
    const entries = definition.bands[band];
    if (entries.length === 0) {
      return;
    }
    compactLineIndex += 1;

    const leftIndexes = entries.map((entry, index) => ({ ...entry, index })).filter((entry) => entry.lane === "left");
    const rightIndexes = entries.map((entry, index) => ({ ...entry, index })).filter((entry) => entry.lane === "right");
    const centerIndexes = entries.map((entry, index) => ({ ...entry, index })).filter((entry) => entry.lane === "center");

    const xByIndex = new Map<number, number>();
    laneXs("left", leftIndexes.length).forEach((x, i) => xByIndex.set(leftIndexes[i].index, clampX(x)));
    laneXs("right", rightIndexes.length).forEach((x, i) => xByIndex.set(rightIndexes[i].index, clampX(x)));
    laneXs("center", centerIndexes.length).forEach((x, i) => xByIndex.set(centerIndexes[i].index, clampX(x)));

    entries.forEach((entry, playerIndex) => {
      slots.push({
        id: `L${compactLineIndex}_${playerIndex + 1}`,
        label: entry.role,
        role: entry.role,
        x: xByIndex.get(playerIndex) ?? 50,
        y: BAND_Y[band],
        lineIndex: compactLineIndex,
        playerIndex: playerIndex + 1,
      });
    });
  });

  return slots;
}

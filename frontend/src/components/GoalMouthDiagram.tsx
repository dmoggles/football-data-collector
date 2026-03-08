import type { CSSProperties, KeyboardEvent, MouseEvent } from "react";

type GoalPoint = { y: number; z: number } | null;

type GoalMouthDiagramProps = {
  value: GoalPoint;
  onChange: (next: GoalPoint) => void;
  disabled?: boolean;
  goalWidthFt?: number;
  pitchWidthM?: number;
  goalHeightFt?: number;
  viewPaddingTopFt?: number;
  viewPaddingBottomFt?: number;
};

const FRAME = {
  left: 15,
  top: 8,
  width: 70,
  height: 82,
} as const;
const GOAL_MOUTH_Z_MAX_FEET = 20;
const DEFAULT_PITCH_WIDTH_M = 64;
const DEFAULT_GOAL_WIDTH_FT = 24;
const DEFAULT_GOAL_HEIGHT_FT = 8;
const DEFAULT_VIEW_PADDING_TOP_FT = 6;
const DEFAULT_VIEW_PADDING_BOTTOM_FT = 2;

type GoalViewWindow = {
  goalLeftY: number;
  goalRightY: number;
  viewLeftY: number;
  viewRightY: number;
  viewBottomZ: number;
  viewTopZ: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildGoalViewWindow(
  goalWidthFt: number,
  pitchWidthM: number,
  goalHeightFt: number,
  viewPaddingTopFt: number,
  viewPaddingBottomFt: number,
): GoalViewWindow {
  const safePitchWidthM = Math.max(1, pitchWidthM);
  const safeGoalWidthFt = Math.max(1, goalWidthFt);
  const safeGoalHeightFt = clamp(goalHeightFt, 0.5, GOAL_MOUTH_Z_MAX_FEET);
  const safePaddingTopFt = Math.max(0, viewPaddingTopFt);
  const safePaddingBottomFt = Math.max(0, viewPaddingBottomFt);

  const pitchWidthFt = safePitchWidthM * 3.28084;
  const goalSpanY = clamp((safeGoalWidthFt / pitchWidthFt) * 100, 1, 100);
  const goalLeftY = 50 - goalSpanY / 2;
  const goalRightY = 50 + goalSpanY / 2;

  const horizontalPaddingFt = Math.max(safePaddingTopFt, 0);
  const viewSpanY = clamp(((safeGoalWidthFt + horizontalPaddingFt * 2) / pitchWidthFt) * 100, goalSpanY, 100);
  const viewLeftY = clamp(50 - viewSpanY / 2, 0, 100 - viewSpanY);
  const viewRightY = viewLeftY + viewSpanY;

  const viewBottomZ = clamp(0 - safePaddingBottomFt, 0, GOAL_MOUTH_Z_MAX_FEET - 1);
  const viewTopZ = clamp(safeGoalHeightFt + safePaddingTopFt, viewBottomZ + 1, GOAL_MOUTH_Z_MAX_FEET);

  return {
    goalLeftY,
    goalRightY,
    viewLeftY,
    viewRightY,
    viewBottomZ,
    viewTopZ,
  };
}

function toGoalPoint(
  event: MouseEvent<HTMLDivElement>,
  view: GoalViewWindow,
  groundLinePct: number,
): GoalPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const rx = ((event.clientX - rect.left) / rect.width) * 100;
  const ry = ((event.clientY - rect.top) / rect.height) * 100;
  const ryClamped = Math.min(ry, groundLinePct);
  const xInFrame = clamp((rx - FRAME.left) / Math.max(1e-6, FRAME.width), 0, 1);
  const yInDiagram = clamp((groundLinePct - ryClamped) / Math.max(1e-6, groundLinePct), 0, 1);
  const mouthY = view.viewLeftY + xInFrame * (view.viewRightY - view.viewLeftY);
  const mouthZ = view.viewBottomZ + yInDiagram * (view.viewTopZ - view.viewBottomZ);
  return {
    y: Math.round(mouthY * 10) / 10,
    z: Math.round(mouthZ * 10) / 10,
  };
}

function toMarkerStyle(
  point: { y: number; z: number },
  view: GoalViewWindow,
  groundLinePct: number,
): { left: string; top: string } {
  const yRatio = clamp((point.y - view.viewLeftY) / (view.viewRightY - view.viewLeftY), 0, 1);
  const zRatio = clamp((point.z - view.viewBottomZ) / (view.viewTopZ - view.viewBottomZ), 0, 1);
  return {
    left: `${FRAME.left + yRatio * FRAME.width}%`,
    top: `${groundLinePct - zRatio * groundLinePct}%`,
  };
}

export function GoalMouthDiagram({
  value,
  onChange,
  disabled = false,
  goalWidthFt = DEFAULT_GOAL_WIDTH_FT,
  pitchWidthM = DEFAULT_PITCH_WIDTH_M,
  goalHeightFt = DEFAULT_GOAL_HEIGHT_FT,
  viewPaddingTopFt = DEFAULT_VIEW_PADDING_TOP_FT,
  viewPaddingBottomFt = DEFAULT_VIEW_PADDING_BOTTOM_FT,
}: GoalMouthDiagramProps) {
  const view = buildGoalViewWindow(
    goalWidthFt,
    pitchWidthM,
    goalHeightFt,
    viewPaddingTopFt,
    viewPaddingBottomFt,
  );
  const goalWidthRatio = clamp(
    (view.goalRightY - view.goalLeftY) / (view.viewRightY - view.viewLeftY),
    0.02,
    1,
  );
  const goalHeightRatio = clamp(goalHeightFt / (view.viewTopZ - view.viewBottomZ), 0.02, 1);
  const goalLeftRatio = clamp((view.goalLeftY - view.viewLeftY) / (view.viewRightY - view.viewLeftY), 0, 1);
  const goalTopRatio = 1 - goalHeightRatio;
  const groundLinePct = FRAME.top + (goalTopRatio + goalHeightRatio) * FRAME.height;
  const diagramStyle = {
    "--goal-left": `${FRAME.left + goalLeftRatio * FRAME.width}%`,
    "--goal-top": `${FRAME.top + goalTopRatio * FRAME.height}%`,
    "--goal-width": `${goalWidthRatio * FRAME.width}%`,
    "--goal-height": `${goalHeightRatio * FRAME.height}%`,
  } as CSSProperties;

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    const next = toGoalPoint(event, view, groundLinePct);
    if (next) {
      onChange(next);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }
    if (event.key === "Escape" || event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onChange(null);
    }
  };

  return (
    <div
      className={`goalmouth-diagram ${disabled ? "is-disabled" : ""}`}
      style={diagramStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Goal mouth selector"
    >
      <div className="goalmouth-frame" />
      <div className="goalmouth-net" />
      <div className="goalmouth-ground" />
      {value ? <span className="goalmouth-point" style={toMarkerStyle(value, view, groundLinePct)} /> : null}
    </div>
  );
}

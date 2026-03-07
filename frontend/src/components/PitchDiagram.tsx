import type { ReactNode } from "react";

import type { MatchFormat } from "../types/auth";

type PitchDiagramProps = {
  format: MatchFormat;
  className?: string;
  onDragOver?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
  children?: ReactNode;
};

type PitchSpec = {
  width: number;
  length: number;
  lineWidth: number;
  centerCircleRadius: number;
  goalWidth: number;
  goalDepth: number;
  goalArea?: { depth: number; width: number };
  penaltyArea?: { depth: number; width: number };
  penaltyArcRadius?: number;
  penaltySpotDistance?: number;
  semiCirclePenaltyRadius?: number;
};

const PITCH_SPECS: Record<MatchFormat, PitchSpec> = {
  // FA recommended mini-soccer size (U7/U8): 37m x 27m.
  // Small-sided Law 1: centre circle radius 3m; penalty area semi-circle radius 6m.
  "5_aside": {
    width: 27,
    length: 37,
    lineWidth: 0.08,
    centerCircleRadius: 3,
    goalWidth: 3.66,
    goalDepth: 1.5,
    semiCirclePenaltyRadius: 6,
    penaltySpotDistance: 6,
  },
  // FA recommended mini-soccer size (U9/U10): 55m x 37m.
  // Small-sided Law 1 uses the same centre circle and penalty semi-circle values.
  "7_aside": {
    width: 37,
    length: 55,
    lineWidth: 0.08,
    centerCircleRadius: 3,
    goalWidth: 3.66,
    goalDepth: 1.8,
    semiCirclePenaltyRadius: 6,
    penaltySpotDistance: 6,
  },
  // FA recommended youth 9v9 size: 73m x 46m.
  // 9v9 youth layouts commonly use 13yd x 32yd penalty and 4yd x 14yd goal areas.
  "9_aside": {
    width: 46,
    length: 73,
    lineWidth: 0.1,
    centerCircleRadius: 6.4, // 7yd
    goalWidth: 4.88, // 16ft
    goalDepth: 1.8,
    goalArea: { depth: 3.66, width: 12.8 }, // 4yd x 14yd
    penaltyArea: { depth: 11.89, width: 29.26 }, // 13yd x 32yd
    penaltySpotDistance: 8.23, // 9yd
    penaltyArcRadius: 6.4, // 7yd
  },
  // Standard 11v11 law markings.
  "11_aside": {
    width: 64,
    length: 100,
    lineWidth: 0.12,
    centerCircleRadius: 9.15,
    goalWidth: 7.32,
    goalDepth: 2,
    goalArea: { depth: 5.5, width: 18.32 },
    penaltyArea: { depth: 16.5, width: 40.32 },
    penaltySpotDistance: 11,
    penaltyArcRadius: 9.15,
  },
};

function arcPath(
  cx: number,
  cy: number,
  radius: number,
  startAngleDegrees: number,
  endAngleDegrees: number,
): string {
  const startAngle = (Math.PI / 180) * startAngleDegrees;
  const endAngle = (Math.PI / 180) * endAngleDegrees;
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy + radius * Math.sin(endAngle);
  const largeArcFlag = Math.abs(endAngleDegrees - startAngleDegrees) > 180 ? 1 : 0;
  const sweepFlag = endAngleDegrees > startAngleDegrees ? 1 : 0;
  return `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
}

export function PitchDiagram({
  format,
  className = "",
  onDragOver,
  onDrop,
  children,
}: PitchDiagramProps) {
  const spec = PITCH_SPECS[format];
  const { width, length } = spec;
  const centerX = width / 2;
  const centerY = length / 2;
  const halfLine = spec.lineWidth / 2;
  const topGoalY = -spec.goalDepth;
  const bottomGoalY = length;

  const pitchClassName = className ? `pitch-surface ${className}` : "pitch-surface";

  const topPenaltyTop = spec.penaltyArea ? spec.penaltyArea.depth : 0;
  const topPenaltyLeft = spec.penaltyArea ? (width - spec.penaltyArea.width) / 2 : 0;
  const topGoalAreaTop = spec.goalArea ? spec.goalArea.depth : 0;
  const topGoalAreaLeft = spec.goalArea ? (width - spec.goalArea.width) / 2 : 0;
  const bottomPenaltyTop = spec.penaltyArea ? length - spec.penaltyArea.depth : 0;
  const bottomGoalAreaTop = spec.goalArea ? length - spec.goalArea.depth : 0;

  const topPenaltySpotY = spec.penaltySpotDistance ?? 0;
  const bottomPenaltySpotY = length - (spec.penaltySpotDistance ?? 0);

  return (
    <div
      className={pitchClassName}
      style={{ aspectRatio: `${width} / ${length}` }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <svg viewBox={`0 0 ${width} ${length}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`grass-base-${format}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d7f4d" />
            <stop offset="100%" stopColor="#25693f" />
          </linearGradient>
          <pattern id={`grass-stripes-${format}`} width={width} height={length / 12} patternUnits="userSpaceOnUse">
            <rect x="0" y="0" width={width} height={length / 24} fill="rgba(255,255,255,0.06)" />
            <rect x="0" y={length / 24} width={width} height={length / 24} fill="rgba(0,0,0,0.06)" />
          </pattern>
          <clipPath id={`pitch-area-${format}`}>
            <rect x={halfLine} y={halfLine} width={width - spec.lineWidth} height={length - spec.lineWidth} rx={0.8} />
          </clipPath>
        </defs>

        <rect x="0" y="0" width={width} height={length} fill={`url(#grass-base-${format})`} />
        <rect x="0" y="0" width={width} height={length} fill={`url(#grass-stripes-${format})`} />

        <g stroke="#ffffff" strokeWidth={spec.lineWidth} fill="none" strokeLinecap="round">
          <rect x={halfLine} y={halfLine} width={width - spec.lineWidth} height={length - spec.lineWidth} rx={0.8} />
          <line x1={halfLine} y1={centerY} x2={width - halfLine} y2={centerY} />
          <circle cx={centerX} cy={centerY} r={spec.centerCircleRadius} />
          <circle cx={centerX} cy={centerY} r={spec.lineWidth * 1.1} fill="#ffffff" stroke="none" />

          <rect
            x={centerX - spec.goalWidth / 2}
            y={topGoalY}
            width={spec.goalWidth}
            height={spec.goalDepth}
          />
          <rect
            x={centerX - spec.goalWidth / 2}
            y={bottomGoalY}
            width={spec.goalWidth}
            height={spec.goalDepth}
          />

          {spec.penaltyArea ? (
            <>
              <rect
                x={topPenaltyLeft}
                y={halfLine}
                width={spec.penaltyArea.width}
                height={topPenaltyTop}
              />
              <rect
                x={topPenaltyLeft}
                y={bottomPenaltyTop}
                width={spec.penaltyArea.width}
                height={spec.penaltyArea.depth}
              />
            </>
          ) : null}

          {spec.goalArea ? (
            <>
              <rect
                x={topGoalAreaLeft}
                y={halfLine}
                width={spec.goalArea.width}
                height={topGoalAreaTop}
              />
              <rect
                x={topGoalAreaLeft}
                y={bottomGoalAreaTop}
                width={spec.goalArea.width}
                height={spec.goalArea.depth}
              />
            </>
          ) : null}

          {spec.semiCirclePenaltyRadius ? (
            <>
              <path d={arcPath(centerX, 0, spec.semiCirclePenaltyRadius, 0, 180)} />
              <path d={arcPath(centerX, length, spec.semiCirclePenaltyRadius, 180, 360)} />
            </>
          ) : null}

          {spec.penaltyArcRadius && spec.penaltySpotDistance ? (
            <>
              <path
                d={arcPath(centerX, topPenaltySpotY, spec.penaltyArcRadius, 37, 143)}
                clipPath={`url(#pitch-area-${format})`}
              />
              <path
                d={arcPath(centerX, bottomPenaltySpotY, spec.penaltyArcRadius, 217, 323)}
                clipPath={`url(#pitch-area-${format})`}
              />
            </>
          ) : null}

          {spec.penaltySpotDistance ? (
            <>
              <circle cx={centerX} cy={topPenaltySpotY} r={spec.lineWidth * 1.1} fill="#ffffff" stroke="none" />
              <circle cx={centerX} cy={bottomPenaltySpotY} r={spec.lineWidth * 1.1} fill="#ffffff" stroke="none" />
            </>
          ) : null}
        </g>
      </svg>
      {children}
    </div>
  );
}

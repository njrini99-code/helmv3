'use client';

// =============================================================================
// src/components/lifting/soreness/BodySilhouetteBack.tsx
//
// Realistic illustrated athlete — BACK VIEW.
//
// Same approach as the front: a premium illustrated athlete raster asset with
// transparent, severity-keyed interactive soreness regions overlaid. Region IDs
// are unchanged, so every caller is untouched.
//
// Asset:   /public/body-map/athlete-back.webp  (454 × 1012, cream ground)
// viewBox: 0 0 454 1012
// =============================================================================

import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import type { RegionHitState } from './BodySilhouetteFront';
import { severityFill, severityStroke } from './severity-colors';

interface Props {
  selected: Partial<Record<SorenessRegionId, RegionHitState>>;
  onRegionTap?: (id: SorenessRegionId) => void;
  className?: string;
  readOnly?: boolean;
}

interface RegionDef {
  id: SorenessRegionId;
  title: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

// On the BACK view (figure faces away) the athlete's left is on the viewer's
// LEFT (lower x) — the mirror of the front view.
const BACK_REGIONS: readonly RegionDef[] = [
  { id: 'neck', title: 'Neck', cx: 230, cy: 159, rx: 30, ry: 24 },
  { id: 'upper_back', title: 'Upper Back', cx: 230, cy: 279, rx: 56, ry: 44 },
  { id: 'mid_back', title: 'Mid Back', cx: 230, cy: 394, rx: 52, ry: 46 },
  { id: 'lower_back', title: 'Lower Back', cx: 230, cy: 489, rx: 50, ry: 34 },
  { id: 'left_shoulder', title: 'Left Shoulder', cx: 113, cy: 239, rx: 40, ry: 34 },
  { id: 'right_shoulder', title: 'Right Shoulder', cx: 347, cy: 239, rx: 40, ry: 34 },
  { id: 'left_hip', title: 'Left Hip', cx: 163, cy: 539, rx: 32, ry: 30 },
  { id: 'right_hip', title: 'Right Hip', cx: 300, cy: 539, rx: 32, ry: 30 },
  { id: 'left_glute', title: 'Left Glute', cx: 183, cy: 574, rx: 36, ry: 32 },
  { id: 'right_glute', title: 'Right Glute', cx: 278, cy: 574, rx: 36, ry: 32 },
  { id: 'left_hamstring', title: 'Left Hamstring', cx: 176, cy: 649, rx: 34, ry: 58 },
  { id: 'right_hamstring', title: 'Right Hamstring', cx: 287, cy: 649, rx: 34, ry: 58 },
  { id: 'left_calf', title: 'Left Calf', cx: 164, cy: 794, rx: 30, ry: 52 },
  { id: 'right_calf', title: 'Right Calf', cx: 297, cy: 794, rx: 30, ry: 52 },
  { id: 'left_ankle_foot', title: 'Left Ankle / Foot', cx: 163, cy: 944, rx: 30, ry: 30 },
  { id: 'right_ankle_foot', title: 'Right Ankle / Foot', cx: 297, cy: 944, rx: 30, ry: 30 },
];

function rgbCore(rgba: string): string {
  return rgba.replace(/rgba?\(([^)]+)\)/, (_m, inner: string) => {
    const parts = inner.split(',').slice(0, 3).map((s) => s.trim());
    return `rgb(${parts.join(',')})`;
  });
}

function RegionHit({
  def,
  state,
  onTap,
  readOnly,
  viewKey,
}: {
  def: RegionDef;
  state: RegionHitState | undefined;
  onTap?: (id: SorenessRegionId) => void;
  readOnly: boolean;
  viewKey: string;
}) {
  const { id, title, cx, cy, rx, ry } = def;
  const isSelected = state !== undefined;
  const severity = state?.severity ?? 0;
  const interactive = !readOnly && !!onTap;
  const gradId = `heat-${viewKey}-${id}`;

  const core = severityFill(severity);
  const rgb = rgbCore(core);
  const alphaMatch = core.match(/[\d.]+\)$/);
  const peak = alphaMatch ? Math.min(1, parseFloat(alphaMatch[0]) * 1.55) : 0.6;
  const glowRx = rx * 1.4;
  const glowRy = ry * 1.4;

  return (
    <g>
      {isSelected && (
        <>
          <defs>
            <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={rgb} stopOpacity={peak} />
              <stop offset="55%" stopColor={rgb} stopOpacity={peak * 0.45} />
              <stop offset="100%" stopColor={rgb} stopOpacity={0} />
            </radialGradient>
          </defs>
          <ellipse
            cx={cx}
            cy={cy}
            rx={glowRx}
            ry={glowRy}
            fill={`url(#${gradId})`}
            style={{ pointerEvents: 'none', mixBlendMode: 'multiply' }}
          />
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill="none"
            stroke={severityStroke(severity)}
            strokeWidth={2.5}
            style={{ pointerEvents: 'none' }}
          />
        </>
      )}
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="transparent"
        stroke="none"
        style={{ cursor: interactive ? 'pointer' : 'default' }}
        onClick={interactive ? () => onTap!(id) : undefined}
        role={interactive ? 'button' : undefined}
        aria-label={interactive ? title : undefined}
        aria-pressed={interactive ? isSelected : undefined}
      >
        <title>{title}</title>
      </ellipse>
    </g>
  );
}

export function BodySilhouetteBack({ selected, onRegionTap, className = '', readOnly = false }: Props) {
  return (
    <svg
      viewBox="0 0 454 1012"
      className={`w-full mx-auto select-none ${className}`}
      aria-label="Body map back view — tap a region to mark soreness"
      role={readOnly ? 'img' : undefined}
    >
      <image
        href="/body-map/athlete-back.webp"
        x="0"
        y="0"
        width="454"
        height="1012"
        preserveAspectRatio="xMidYMid meet"
      />
      {BACK_REGIONS.map((def) => (
        <RegionHit
          key={def.id}
          def={def}
          state={selected[def.id]}
          onTap={onRegionTap}
          readOnly={readOnly}
          viewKey="b"
        />
      ))}
    </svg>
  );
}

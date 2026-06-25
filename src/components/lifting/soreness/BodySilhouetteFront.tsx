'use client';

// =============================================================================
// src/components/lifting/soreness/BodySilhouetteFront.tsx
//
// Realistic illustrated athlete — FRONT VIEW.
//
// The figure is a premium, hand-illustrated college baseball athlete (warm
// studio lighting, real human proportions, compression shorts) rendered as a
// raster asset — NOT a hand-coded SVG dummy. Interactive soreness regions are
// transparent hit-areas overlaid on the figure, each with a severity-keyed
// radial "heat" glow so a tapped/sore area lights up amber→red over the skin.
//
// Asset:   /public/body-map/athlete-front.webp  (454 × 1012, cream ground)
// viewBox: 0 0 454 1012  (region coords measured against this asset)
//
// Region IDs are unchanged from the prior silhouette, so every caller
// (SorenessBodyMap, performance history overlays, coach previews) is untouched.
// =============================================================================

import type { SorenessRegionId } from '@/lib/lifting/soreness-regions';
import { severityFill, severityStroke } from './severity-colors';

export interface RegionHitState {
  severity: number; // 0 = selected, no severity set yet; 1–10 = severity
}

interface Props {
  selected: Partial<Record<SorenessRegionId, RegionHitState>>;
  onRegionTap?: (id: SorenessRegionId) => void;
  /** Extra class names on the svg wrapper */
  className?: string;
  /** When true, renders display-only (no cursor pointer, no handlers) */
  readOnly?: boolean;
}

// ─── Region definition (ellipse hit-area, measured on the 454×1012 asset) ──────

interface RegionDef {
  id: SorenessRegionId;
  title: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

// Anatomical left/right are the ATHLETE's. On the front (figure faces viewer)
// the athlete's left appears on the viewer's right (higher x), and vice-versa.
const FRONT_REGIONS: readonly RegionDef[] = [
  { id: 'neck', title: 'Neck', cx: 226, cy: 194, rx: 30, ry: 24 },
  { id: 'chest', title: 'Chest', cx: 226, cy: 234, rx: 56, ry: 40 },
  { id: 'abs_core', title: 'Abs / Core', cx: 226, cy: 374, rx: 50, ry: 62 },
  { id: 'left_shoulder', title: 'Left Shoulder', cx: 340, cy: 199, rx: 40, ry: 34 },
  { id: 'right_shoulder', title: 'Right Shoulder', cx: 113, cy: 199, rx: 40, ry: 34 },
  { id: 'left_elbow', title: 'Left Elbow', cx: 351, cy: 372, rx: 30, ry: 32 },
  { id: 'right_elbow', title: 'Right Elbow', cx: 101, cy: 372, rx: 30, ry: 32 },
  { id: 'left_forearm', title: 'Left Forearm', cx: 345, cy: 442, rx: 28, ry: 40 },
  { id: 'right_forearm', title: 'Right Forearm', cx: 103, cy: 442, rx: 28, ry: 40 },
  { id: 'left_wrist_hand', title: 'Left Wrist / Hand', cx: 357, cy: 519, rx: 28, ry: 30 },
  { id: 'right_wrist_hand', title: 'Right Wrist / Hand', cx: 101, cy: 519, rx: 28, ry: 30 },
  { id: 'left_hip', title: 'Left Hip', cx: 298, cy: 539, rx: 34, ry: 30 },
  { id: 'right_hip', title: 'Right Hip', cx: 155, cy: 539, rx: 34, ry: 30 },
  { id: 'groin', title: 'Groin', cx: 226, cy: 584, rx: 32, ry: 24 },
  { id: 'left_quad', title: 'Left Quad', cx: 288, cy: 674, rx: 34, ry: 62 },
  { id: 'right_quad', title: 'Right Quad', cx: 165, cy: 674, rx: 34, ry: 62 },
  { id: 'left_knee', title: 'Left Knee', cx: 281, cy: 766, rx: 30, ry: 26 },
  { id: 'right_knee', title: 'Right Knee', cx: 173, cy: 766, rx: 30, ry: 26 },
  { id: 'left_ankle_foot', title: 'Left Ankle / Foot', cx: 295, cy: 949, rx: 30, ry: 30 },
  { id: 'right_ankle_foot', title: 'Right Ankle / Foot', cx: 157, cy: 949, rx: 30, ry: 30 },
];

// ─── Heat overlay + interactive hit area ───────────────────────────────────────

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

// ─── Component ─────────────────────────────────────────────────────────────────

export function BodySilhouetteFront({ selected, onRegionTap, className = '', readOnly = false }: Props) {
  return (
    <svg
      viewBox="0 0 454 1012"
      className={`w-full mx-auto select-none ${className}`}
      aria-label="Body map front view — tap a region to mark soreness"
      role={readOnly ? 'img' : undefined}
    >
      <image
        href="/body-map/athlete-front.webp"
        x="0"
        y="0"
        width="454"
        height="1012"
        preserveAspectRatio="xMidYMid meet"
      />
      {FRONT_REGIONS.map((def) => (
        <RegionHit
          key={def.id}
          def={def}
          state={selected[def.id]}
          onTap={onRegionTap}
          readOnly={readOnly}
          viewKey="f"
        />
      ))}
    </svg>
  );
}

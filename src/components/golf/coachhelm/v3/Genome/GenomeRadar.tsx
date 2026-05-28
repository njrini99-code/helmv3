'use client';

/**
 * GenomeRadar — pure SVG radar chart (W34).
 *
 * Renders one polygon per data series over a shared spider grid. Up to
 * two series can be overlaid (for /compare). Spokes are labeled with
 * the dim label + colored by category. Null dim values render as a
 * locked-spoke ghost marker rather than collapsing inward (which
 * would make weak data look worse than locked data).
 *
 * Design notes:
 *   - 360 / N angular steps, first spoke at 12 o'clock
 *   - Spider grid: 4 concentric rings (0.25, 0.5, 0.75, 1.0)
 *   - Polygon stroked + filled at low opacity for the player series
 *   - Framer-motion path stagger draws the polygon in over ~600ms
 *   - Hover label only — keeps the visual quiet
 */

import { useMemo, useState } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';
import type { GenomeVector } from '@/lib/coachhelm/v3/genome/types';
import { EASE_CINEMATIC, EASE_TAP, DURATION } from '@/lib/coachhelm/v3/motion';

export interface RadarSeries {
  label: string;
  /** Tailwind color token base, e.g. "primary-600" or "amber-500". */
  colorClass: string;
  /** Inline SVG color (stroke + fill base). */
  hex: string;
  vector: GenomeVector;
}

export interface GenomeRadarProps {
  series: RadarSeries[];
  /** SVG box size in CSS px. Square. */
  size?: number;
}

interface SpokePoint {
  dim_id: string;
  label: string;
  /** Coordinates on the unit circle (radius=1). x = cos θ, y = sin θ. */
  ux: number;
  uy: number;
  /** Pre-computed text-anchor position outside the outer ring. */
  labelX: number;
  labelY: number;
  textAnchor: 'start' | 'middle' | 'end';
}

export function GenomeRadar({ series, size = 360 }: GenomeRadarProps) {
  const [hover, setHover] = useState<{ dim_id: string; series_idx: number } | null>(null);
  const prefersReducedMotion = useReducedMotion() ?? false;
  // Scale all entrance delays to 0 when reduced motion is set. This
  // collapses the polygon-draw + dot stagger into an instant render —
  // the radar still arrives, it just doesn't perform.
  const motionScale = prefersReducedMotion ? 0 : 1;

  // --- Geometry: spokes + the unit-vector lookup for each dim ---
  const spokes = useMemo<SpokePoint[]>(() => {
    const n = GENOME_DIMENSIONS.length;
    return GENOME_DIMENSIONS.map((d, i) => {
      // -π/2 puts the first spoke at the top; clockwise from there.
      const theta = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const ux = Math.cos(theta);
      const uy = Math.sin(theta);
      const labelRadius = 1.18;
      const labelX = ux * labelRadius;
      const labelY = uy * labelRadius;
      // Anchor by quadrant for readability.
      const textAnchor: SpokePoint['textAnchor'] =
        ux > 0.2 ? 'start' : ux < -0.2 ? 'end' : 'middle';
      return { dim_id: d.id, label: d.label, ux, uy, labelX, labelY, textAnchor };
    });
  }, []);

  // --- View geometry: SVG viewBox is -1.4..+1.4 to leave room for labels ---
  const VB = 1.4;

  function project(s: RadarSeries): Array<{ x: number; y: number; norm: number | null }> {
    return spokes.map((sp) => {
      const norm = normalizeForRadar(sp.dim_id, s.vector[sp.dim_id] ?? { value: null, confidence: null });
      const r = norm ?? 0; // null → collapse to center for polygon path
      return { x: sp.ux * r, y: sp.uy * r, norm };
    });
  }

  // Polygon path for each series.
  function buildPolygonPath(points: Array<{ x: number; y: number }>): string {
    if (points.length === 0) return '';
    const head = points[0];
    if (!head) return '';
    const rest = points.slice(1).map((p) => `L${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ');
    return `M${head.x.toFixed(4)},${head.y.toFixed(4)} ${rest} Z`;
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        viewBox={`-${VB} -${VB} ${VB * 2} ${VB * 2}`}
        width={size}
        height={size}
        aria-label="Player genome radar"
        role="img"
      >
        <defs>
          {/* Subtle Gaussian glow for the polygon so the silhouette feels
              like it sits IN the surface rather than on it. Stays soft —
              we don't want it to look like Tron. */}
          <filter id="genome-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.018" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ----- Spider grid: 4 rings (animated entrance, outermost first) ----- */}
        {[1, 0.75, 0.5, 0.25].map((r, i) => (
          <m.circle
            key={r}
            cx={0}
            cy={0}
            r={r}
            fill="none"
            stroke="rgba(28,25,23,0.08)"
            strokeWidth={0.005}
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: DURATION.medium,
              delay: 0.05 * i * motionScale,
              ease: EASE_CINEMATIC,
            }}
          />
        ))}
        {/* ----- Spokes (faint, staggered after rings) ----- */}
        {spokes.map((sp, i) => (
          <m.line
            key={sp.dim_id}
            x1={0}
            y1={0}
            x2={sp.ux}
            y2={sp.uy}
            stroke="rgba(28,25,23,0.08)"
            strokeWidth={0.004}
            initial={prefersReducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: DURATION.medium,
              delay: (0.25 + 0.02 * i) * motionScale,
              ease: EASE_CINEMATIC,
            }}
          />
        ))}
        {/* Center dot — visual anchor */}
        <m.circle
          cx={0} cy={0} r={0.012}
          fill="rgba(28,25,23,0.35)"
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.short, delay: 0.4 * motionScale, ease: EASE_TAP }}
        />
        {/* ----- Series polygons (animated entrance + glow) ----- */}
        {series.map((s, idx) => {
          const points = project(s);
          const path = buildPolygonPath(points);
          return (
            <g key={s.label} filter="url(#genome-glow)">
              <m.path
                d={path}
                fill={s.hex}
                fillOpacity={0.14}
                stroke={s.hex}
                strokeWidth={0.014}
                strokeLinejoin="round"
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  duration: DURATION.long,
                  ease: EASE_CINEMATIC,
                  delay: (0.5 + idx * 0.15) * motionScale,
                }}
                style={{ transformOrigin: '0 0' }}
              />
              {/* Per-dim dots */}
              {points.map((p, i) => {
                const spoke = spokes[i];
                if (!spoke) return null;
                const sourceNorm = p.norm;
                const isLocked = sourceNorm === null;
                const r = isLocked ? 0.025 : 0.03;
                const fill = isLocked ? 'rgba(28,25,23,0.2)' : s.hex;
                return (
                  <m.circle
                    key={`${s.label}-${spoke.dim_id}`}
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fill={fill}
                    stroke="white"
                    strokeWidth={0.008}
                    initial={prefersReducedMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: DURATION.short,
                      delay: (0.4 + idx * 0.15 + i * 0.03) * motionScale,
                      ease: EASE_TAP,
                    }}
                    onMouseEnter={() => setHover({ dim_id: spoke.dim_id, series_idx: idx })}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
            </g>
          );
        })}
        {/* ----- Spoke labels ----- */}
        {spokes.map((sp) => (
          <text
            key={sp.dim_id}
            x={sp.labelX}
            y={sp.labelY}
            textAnchor={sp.textAnchor}
            dominantBaseline="middle"
            fontSize={0.075}
            fill="rgb(120,113,108)"
            style={{ fontFamily: 'inherit', letterSpacing: '0.02em' }}
          >
            {sp.label}
          </text>
        ))}
      </svg>

      {/* ----- Hover tooltip — series-colored dot + label + value ----- */}
      {hover && (
        <div
          role="tooltip"
          className="absolute top-1 left-1/2 -translate-x-1/2 bg-warm-900/95 backdrop-blur-sm text-white text-xs px-3.5 py-2 rounded-full shadow-xl pointer-events-none flex items-center gap-2 whitespace-nowrap"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: series[hover.series_idx]?.hex ?? '#fff' }}
          />
          {tooltipText(series, hover)}
        </div>
      )}
    </div>
  );
}

function tooltipText(
  series: RadarSeries[],
  hover: { dim_id: string; series_idx: number },
): string {
  const s = series[hover.series_idx];
  if (!s) return '';
  const dim = GENOME_DIMENSIONS.find((d) => d.id === hover.dim_id);
  const r = s.vector[hover.dim_id];
  if (!dim || !r) return '';
  if (r.value === null) return `${dim.label}: locked (more rounds needed)`;
  const valStr = typeof r.value === 'number' ? r.value : String(r.value);
  return r.label ? `${dim.label}: ${r.label} (${valStr})` : `${dim.label}: ${valStr}`;
}

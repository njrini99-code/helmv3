/**
 * HoleShotPath — the premium round-review hole visualization.
 *
 * What it shows: every shot on one hole, plotted geometrically from
 * the player's logged distance/lie/miss data, connected by Bezier
 * ball-flight arcs, with hazards rendered AT the actual endpoint
 * where the player's ball ended up.
 *
 * Reads the same canonical motion library + surface tokens as the
 * rest of v3 — drops into any surface tier (strip in a grid, card
 * inline, or hero in a hole detail page).
 *
 * Public API: see ./types.ts — HoleShotPathProps. The component is
 * purely presentational; data comes from server-fetched shot rows.
 */

'use client';

import { useMemo, useState } from 'react';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { Turf } from './turf';
import { Hazards } from './hazards';
import {
  VB,
  plotHole,
  segmentPath,
  formatYards,
  scoreToParLabel,
  type PlottedShot,
} from './geometry';
import type { HoleShotPathProps, Lie } from './types';
import {
  EASE_CINEMATIC,
  enterVariants,
  enterTransition,
  stagger,
  liftHover,
  tapPress,
  useReducedMotionGuard,
} from '@/lib/coachhelm/v3/motion';

// -----------------------------------------------------------------------------
// Size variants — defined once, picked via `size` prop.
// -----------------------------------------------------------------------------

const SIZES = {
  strip: {
    /** ~28×112 — fits inside an 18-hole grid cell */
    className: 'w-7 h-28 md:w-8 md:h-32',
    showShotNumbers: false,
    showScore: false,
    showHeader: false,
    showFlag: false,
    interactive: false,
    // Too narrow to hold the "No shots logged" caption without overflow —
    // the turf/pin visual alone reads fine as an empty state at this scale.
    showEmptyLabel: false,
  },
  inline: {
    /** Compact round-review preview: enough room to read the flight without
     * turning the review hero into a full-height course map. */
    className: 'w-[112px] h-[240px] md:w-[124px] md:h-[264px]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
  },
  card: {
    /** ~140×320 — inline next to per-hole text in round review */
    className: 'w-[140px] h-[320px] md:w-[160px] md:h-[360px]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
  },
  reviewCard: {
    /** Fluid round-review card — fills its framed grid cell (capped by the
     *  parent's max-width) instead of a fixed 140px strip, so holes read as
     *  distinct, well-spaced cards rather than a butted-together dark wall.
     *  Aspect mirrors the fixed card (140:320). */
    className: 'w-full aspect-[140/320]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
  },
  hero: {
    /** ~280×560 — primary visual on a hole-detail page. Fluid on narrow
     *  screens (w-full) but capped at 280px so it never overflows a
     *  320px viewport, growing back to the desktop size at md. */
    className: 'w-full max-w-[280px] h-[560px] md:max-w-[320px] md:h-[640px]',
    showShotNumbers: true,
    showScore: true,
    showHeader: true,
    showFlag: true,
    interactive: true,
    showEmptyLabel: true,
  },
} as const;

// -----------------------------------------------------------------------------
// Lie → swatch color (matches DispersionStats palette so colors are
// consistent across the v3 stats surface).
// -----------------------------------------------------------------------------

const LIE_COLOR: Record<Lie | 'other', string> = {
  tee: '#f4ecd8',
  fairway: '#86c89e',
  rough: '#3a6b50',
  heavy_rough: '#2a5040', // unused after normalize but kept for safety
  light_rough: '#4a7d62',
  sand: '#d4b97a',
  bunker: '#d4b97a',
  green: '#86c89e',
  fringe: '#a8c89a',
  water: '#3a8fb8',
  penalty: '#c14a3a',
  other: '#a8a39a',
};

const LIE_LABEL: Record<Lie | 'other', string> = {
  tee: 'Tee',
  fairway: 'Fairway',
  rough: 'Rough',
  heavy_rough: 'Heavy rough',
  light_rough: 'Light rough',
  sand: 'Bunker',
  bunker: 'Bunker',
  green: 'Green',
  fringe: 'Fringe',
  water: 'Water',
  penalty: 'Penalty',
  other: '—',
};

// Tooltip-only labels for the richer shot fields (never drive geometry or
// color — see ShotInput's doc comment on the 3-bucket club model).
const CLUB_LABEL: Record<string, string> = {
  driver: 'Driver',
  non_driver: 'Approach',
  putter: 'Putter',
};

const PENALTY_LABEL: Record<string, string> = {
  ob: 'OB',
  water: 'water',
  unplayable: 'unplayable',
  lost: 'lost ball',
};

const PUTT_BREAK_LABEL: Record<string, string> = {
  right_to_left: 'Right-to-left break',
  left_to_right: 'Left-to-right break',
  straight: 'Straight putt',
  multiple: 'Multiple breaks',
};

const PUTT_SLOPE_LABEL: Record<string, string> = {
  uphill: 'uphill',
  downhill: 'downhill',
  level: 'level',
  severe: 'severe slope',
};

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function HoleShotPath({
  hole_number,
  par,
  yardage,
  score,
  shots,
  size = 'card',
  onClick,
  className,
  ringClassName,
}: HoleShotPathProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const variant = SIZES[size];
  const [hovered, setHovered] = useState<PlottedShot | null>(null);

  // Plot once per (shots, par, yardage) — memoize so re-renders from
  // hover state don't recompute the Bezier control points.
  const plot = useMemo(
    () => plotHole({ shots, par, yardage }),
    [shots, par, yardage],
  );

  const scoreLabel = scoreToParLabel(score, par);
  const scoreColor =
    scoreLabel === null
      ? 'text-warm-500'
      : scoreLabel === 'E'
        ? 'text-warm-700'
        : scoreLabel.startsWith('-') || ['Albatross', 'Eagle', 'Birdie'].includes(scoreLabel)
          ? 'text-primary-600'
          : 'text-rose-600';

  return (
    <LazyMotion features={loadFeatures}>
      <m.div
        className={[
          'group relative',
          variant.interactive ? 'cursor-pointer' : '',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
        whileHover={variant.interactive && onClick ? liftHover : undefined}
        whileTap={variant.interactive && onClick ? tapPress : undefined}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        aria-label={
          hole_number
            ? `Hole ${hole_number}${par ? ` par ${par}` : ''}${score ? `, scored ${score}` : ''}`
            : 'Hole shot path'
        }
      >
        {/* Header — hole number, par, yardage, score */}
        {variant.showHeader && (
          <div className="mb-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-0.5 overflow-clip px-1">
            <div className="flex min-w-0 items-baseline gap-1 overflow-hidden whitespace-nowrap">
              {hole_number !== undefined && (
                <span className="shrink-0 text-eyebrow uppercase tracking-[0.12em] text-warm-500">
                  Hole {hole_number}
                </span>
              )}
              {par !== undefined && (
                <span className="shrink-0 text-eyebrow text-warm-400 tabular-nums">
                  Par {par}
                </span>
              )}
            </div>
            {scoreLabel && (
              <span className={`min-w-0 max-w-full truncate text-caption font-semibold tabular-nums tracking-[-0.01em] ${scoreColor}`}>
                {scoreLabel}
              </span>
            )}
            {plot.total_yardage > 0 && (
              <span className="col-span-2 truncate text-eyebrow text-warm-400 tabular-nums">
                {Math.round(plot.total_yardage)}y
              </span>
            )}
          </div>
        )}

        {/* The visualization — single SVG, rounded with a hairline ring */}
        <div
          className={[
            variant.className,
            'rounded-2xl overflow-hidden shadow-[0_18px_40px_-22px_rgba(15,42,30,0.55)]',
            ringClassName ?? 'ring-1 ring-white/10',
            'bg-[#1a382e]',
          ].join(' ')}
        >
          <svg
            viewBox={`0 0 ${VB.width} ${VB.height}`}
            preserveAspectRatio="xMidYMid slice"
            className="h-full w-full"
          >
            <Turf showPinFlag={variant.showFlag} />
            <Hazards hazards={plot.hazards} staticRender={!variant.interactive} />

            {/* Shot connection paths — drawn from previous endpoint to
                this one. Each segment animates its length with
                pathLength: 0 → 1 in stagger so the round "draws itself." */}
            <g>
              {plot.segments.map((seg, i) => {
                const isPenalty = plot.shots[seg.to_index]?.is_penalty;
                return (
                  <m.path
                    key={`seg-${seg.to_index}`}
                    d={segmentPath(seg)}
                    fill="none"
                    stroke={isPenalty ? '#e3543b' : '#f8f2dd'}
                    strokeWidth={0.9}
                    strokeLinecap="round"
                    strokeDasharray={isPenalty ? '2 1.5' : undefined}
                    opacity={0.92}
                    initial={variant.interactive && !prefersReducedMotion ? { pathLength: 0, opacity: 0 } : false}
                    animate={variant.interactive ? { pathLength: 1, opacity: 0.92 } : undefined}
                    transition={prefersReducedMotion ? { duration: 0 } : (variant.interactive
                        ? {
                            duration: 0.55,
                            delay: 0.2 + stagger(i),
                            ease: EASE_CINEMATIC,
                          }
                        : undefined)}
                  />
                );
              })}
            </g>

            {/* Numbered shot dots */}
            <g>
              {plot.shots.map((s, i) => {
                const fill = LIE_COLOR[s.lie] ?? '#a8a39a';
                const isLast = i === plot.shots.length - 1;
                const ringColor = isLast ? '#ffffff' : 'rgba(255,255,255,0.55)';
                const r = isLast ? 2.6 : 2.2;

                return (
                  <m.g
                    key={`dot-${s.shot_number}`}
                    initial={variant.interactive && !prefersReducedMotion ? { scale: 0, opacity: 0 } : false}
                    animate={variant.interactive ? { scale: 1, opacity: 1 } : undefined}
                    transition={prefersReducedMotion ? { duration: 0 } : (variant.interactive
                        ? {
                            duration: 0.4,
                            delay: 0.32 + stagger(i),
                            ease: EASE_CINEMATIC,
                          }
                        : undefined)}
                    onMouseEnter={() => variant.interactive && setHovered(s)}
                    onMouseLeave={() => variant.interactive && setHovered(null)}
                    onFocus={() => variant.interactive && setHovered(s)}
                    onBlur={() => variant.interactive && setHovered(null)}
                    style={{ transformOrigin: `${s.x}px ${s.y}px` }}
                    tabIndex={variant.interactive ? 0 : undefined}
                  >
                    {/* Outer ring */}
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r={r + 0.7}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth={0.4}
                      opacity={0.9}
                    />
                    {/* Filled dot — lie color */}
                    <circle cx={s.x} cy={s.y} r={r} fill={fill} stroke="#1a382e" strokeWidth={0.3} />
                    {/* Number — per-hole position (1, 2, 3…), not the raw
                        DB shot_number which may be round-wide or synthetic. */}
                    {variant.showShotNumbers && (
                      <text
                        x={s.x}
                        y={s.y + 0.9}
                        textAnchor="middle"
                        fontSize="2.6"
                        fontWeight={600}
                        fill="#1a382e"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {s.display_index}
                      </text>
                    )}
                  </m.g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Hover tooltip — pinned below the SVG, no portal so it never
            escapes the parent surface. Only renders for interactive
            variants. */}
        {variant.interactive && hovered && (
          <m.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.18, ease: EASE_CINEMATIC })}
            className="absolute left-1/2 -translate-x-1/2 mt-2 z-10 pointer-events-none surface-lift rounded-xl px-3 py-2 text-eyebrow text-warm-800 whitespace-nowrap shadow-lg"
            role="tooltip"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-warm-900">Shot {hovered.display_index}</span>
              <span className="text-warm-500">→ {LIE_LABEL[hovered.lie]}</span>
              {hovered.club_type && (
                <span className="text-warm-400">· {CLUB_LABEL[hovered.club_type] ?? hovered.club_type}</span>
              )}
            </div>
            <div className="text-warm-500 tabular-nums">
              {formatYards(hovered.shot_yards)}
              {hovered.distance_to_pin !== null && (
                <> · {formatYards(hovered.distance_to_pin)} to pin</>
              )}
              {hovered.miss_direction && (
                <> · missed {hovered.miss_direction}</>
              )}
              {hovered.is_penalty && (
                <span className="ml-1.5 font-medium text-danger">
                  {hovered.penalty_type
                    ? `penalty: ${PENALTY_LABEL[hovered.penalty_type] ?? hovered.penalty_type}`
                    : 'penalty'}
                </span>
              )}
            </div>
            {hovered.lie === 'green' && (hovered.putt_break || hovered.putt_slope) && (
              <div className="text-warm-500">
                {[
                  hovered.putt_break ? PUTT_BREAK_LABEL[hovered.putt_break] ?? hovered.putt_break : null,
                  hovered.putt_slope ? PUTT_SLOPE_LABEL[hovered.putt_slope] ?? hovered.putt_slope : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            )}
            {hovered.notes && (
              <div className="mt-0.5 max-w-[200px] whitespace-normal text-warm-500 italic">
                “{hovered.notes}”
              </div>
            )}
          </m.div>
        )}

        {/* Empty state */}
        {variant.showEmptyLabel && plot.shots.length === 0 && (
          <m.div
            variants={enterVariants}
            initial="hidden"
            animate="visible"
            transition={prefersReducedMotion ? { duration: 0 } : (enterTransition)}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <span className="text-eyebrow uppercase tracking-[0.14em] text-warm-100/70">
              No shots logged
            </span>
          </m.div>
        )}
      </m.div>
    </LazyMotion>
  );
}

export type { HoleShotPathProps } from './types';

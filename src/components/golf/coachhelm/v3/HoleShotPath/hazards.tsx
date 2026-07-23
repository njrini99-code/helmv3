/**
 * HoleShotPath — hazards layer.
 *
 * Each REAL-lie hazard (water/sand/rough) is rendered AT the (x,y) where the
 * player's ball actually came to rest. This is the user's correction made
 * literal: "If they say miss-bunker 112 yards away… we know the distance, we
 * place the bunker there." The hole map is reconstructed FROM the player's
 * data, never imagined.
 *
 * CLEAN-SCHEMATIC rebuild (2026-07-23): the hole diagram is a flat, confident
 * vector schematic (a premium infographic, not a fake aerial), so hazards are
 * crisp flat glyphs — no organic edge-noise wobble, no photoreal radial
 * gradients, no soft dark "smudge" underlays.
 *
 * REAL-LIE kinds (rested-in-hazard endpoints — position IS the data):
 *   - water: a crisp pond ellipse (subtle 2-stop blue) over a solid bank ring,
 *            plus one clean surface line at standard/rich sizes
 *   - sand:  a crisp tan bunker ellipse with a thin rim + a soft highlight
 *   - rough: a single understated flat patch (the lie is already carried by
 *            the shot marker's own lie-colored halo, so this stays quiet)
 *
 * PENALTY-TYPE kinds (WAVE B, 2026-07-23) — `ob` | `unplayable` | `penalty`.
 * HONESTY: a penalty shot has NO real rested position — its plotted (x,y) is
 * the drop/start point (see geometry.ts), which is a stylization, not a
 * measured lie. Drawing a big fabricated pond/bunker there would misrepresent
 * a made-up location as data. So these three render as SMALL, flat TYPE
 * badges offset just off the shot's point (co-located with, not stacked on,
 * the symbolic "+1" marker the corridor draws there) — they only answer
 * "which kind of penalty," they never claim a location:
 *   - ob:          a small cream/neutral boundary-stake glyph (post + flat
 *                   cap). Folds in `lost` — neither is a water event and
 *                   both use the out-of-bounds visual grammar.
 *   - unplayable:  a small red-outlined circle-slash ("no" symbol) — distinct
 *                   from both the stake and the pennant.
 *   - penalty:     the generic is_penalty fallback (no/unrecognized
 *                   penalty_type) — a small red pennant-on-a-post flag.
 *                   NEVER the rough-patch look these used to fall through to.
 *
 * Stagger reveals via Framer Motion so the hazards "land" with the shot path
 * rather than popping in all at once. `size` only trims decorative detail
 * (the water surface line / sand highlight / OB stake's ground tick) at the
 * tiny `strip` tier.
 */

'use client';

import { m } from 'framer-motion';
import { useId } from 'react';
import type { PlottedHazard } from './geometry';
import type { HoleShotPathProps } from './types';
import { EASE_CINEMATIC, useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';

type Size = NonNullable<HoleShotPathProps['size']>;

export interface HazardsProps {
  hazards: PlottedHazard[];
  /** Skip entrance animation (e.g. when rendered in a static thumbnail strip). */
  staticRender?: boolean;
  /** Density/scale variant — mirrors `HoleShotPathProps['size']`. */
  size?: Size;
  /** Origin shot number of the hazard currently under hover/focus elsewhere
   *  in the visual (e.g. its corridor dot) — gives that hazard a brighter
   *  halo so the hazard reacts, not just the dot. Optional; omit for no
   *  cross-highlight wiring. */
  activeOriginShot?: number | null;
}

// -----------------------------------------------------------------------------
// Size → density. Flat glyphs are near-identical across sizes; only the tiny
// `strip` tier sheds the one decorative surface line / highlight.
// -----------------------------------------------------------------------------

type Tier = 'coarse' | 'standard' | 'rich';

function tierOf(size: Size): Tier {
  if (size === 'strip') return 'coarse';
  if (size === 'hero') return 'rich';
  return 'standard';
}

const TIER = {
  coarse: { strokeScale: 0.8, showDetail: false },
  standard: { strokeScale: 1, showDetail: true },
  rich: { strokeScale: 1.2, showDetail: true },
} as const;

export function Hazards({ hazards, staticRender = false, size = 'card', activeOriginShot = null }: HazardsProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const rawId = useId();
  const id = rawId.replace(/:/g, '-');
  const waterGrad = `waterGrad-${id}`;

  if (hazards.length === 0) return null;

  const tierCfg = TIER[tierOf(size)];
  const ss = tierCfg.strokeScale;
  const skipAnimation = staticRender || prefersReducedMotion;

  return (
    <g>
      <defs>
        {/* One crisp 2-stop water gradient — a touch of depth, no photoreal
            ripple texture. Flat and clean to match the schematic corridor. */}
        <linearGradient id={waterGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4aa6cc" />
          <stop offset="100%" stopColor="#2f7ba0" />
        </linearGradient>
      </defs>

      {hazards.map((h, i) => {
        const key = `${h.kind}-${h.origin_shot}-${i}`;
        const delay = staticRender ? 0 : 0.25 + i * 0.07;
        // Proper initial-prop gating: under reduced motion the element never
        // passes through a "hidden" state at all (matches SSR, avoids a
        // hydration pop-in flash for reduced-motion users).
        const initial = skipAnimation ? (false as const) : { opacity: 0, scale: 0.6 };
        const animate = { opacity: 1, scale: 1 };
        const transition = skipAnimation ? { duration: 0 } : { duration: 0.6, delay, ease: EASE_CINEMATIC };
        const active = activeOriginShot != null && activeOriginShot === h.origin_shot;

        if (h.kind === 'water') {
          return (
            <m.g
              key={key}
              initial={initial}
              animate={animate}
              transition={transition}
              style={{ transformOrigin: `${h.x}px ${h.y}px` }}
            >
              {active && (
                <ellipse cx={h.x} cy={h.y} rx={h.r * 1.2} ry={h.r * 0.92} fill="none" stroke="#f4ecd8" strokeOpacity="0.5" strokeWidth={0.6 * ss} />
              )}
              {/* Crisp bank ring — a clean edge, not a soft dark smudge. */}
              <ellipse cx={h.x} cy={h.y} rx={h.r * 1.08} ry={h.r * 0.82} fill="#1f5d80" />
              {/* Flat pool. */}
              <ellipse cx={h.x} cy={h.y} rx={h.r} ry={h.r * 0.74} fill={`url(#${waterGrad})`} />
              {tierCfg.showDetail && (
                <ellipse cx={h.x - h.r * 0.14} cy={h.y - h.r * 0.18} rx={h.r * 0.5} ry={h.r * 0.13} fill="none" stroke="#d8f1fb" strokeOpacity="0.5" strokeWidth={0.3 * ss} />
              )}
            </m.g>
          );
        }

        if (h.kind === 'sand') {
          return (
            <m.g
              key={key}
              initial={initial}
              animate={animate}
              transition={transition}
              style={{ transformOrigin: `${h.x}px ${h.y}px` }}
            >
              {active && (
                <ellipse cx={h.x} cy={h.y} rx={h.r * 1.18} ry={h.r * 0.86} fill="none" stroke="#f4ecd8" strokeOpacity="0.5" strokeWidth={0.6 * ss} />
              )}
              {/* Flat bunker with a thin rim. */}
              <ellipse cx={h.x} cy={h.y} rx={h.r * 1.02} ry={h.r * 0.72} fill="#d9be7f" stroke="#a8915a" strokeWidth={0.4 * ss} />
              {tierCfg.showDetail && (
                <ellipse cx={h.x - h.r * 0.12} cy={h.y - h.r * 0.1} rx={h.r * 0.44} ry={h.r * 0.24} fill="#f2e1af" opacity="0.55" />
              )}
            </m.g>
          );
        }

        if (h.kind === 'ob') {
          // OB boundary stake — small, cream/neutral (never red — this isn't
          // a severity signal, just "which kind"), offset just off the shot
          // point so it sits beside the corridor's symbolic +1 marker rather
          // than stacked on top of it. Folds in `lost` per geometry.ts.
          const bx = h.x + 3.4 * ss;
          const by = h.y - 3.0 * ss;
          const postTop = by - 2.0 * ss;
          const postBottom = by + 2.0 * ss;
          const postW = 0.9 * ss;
          return (
            <m.g
              key={key}
              initial={initial}
              animate={animate}
              transition={transition}
              style={{ transformOrigin: `${bx}px ${by}px` }}
            >
              {active && (
                <circle cx={bx} cy={by} r={4.4 * ss} fill="none" stroke="#f4ecd8" strokeOpacity="0.5" strokeWidth={0.5 * ss} />
              )}
              {tierCfg.showDetail && (
                <ellipse cx={bx} cy={postBottom + 0.3 * ss} rx={1.3 * ss} ry={0.45 * ss} fill="#10241c" opacity="0.35" />
              )}
              {/* Post. */}
              <rect
                x={bx - postW / 2}
                y={postTop}
                width={postW}
                height={postBottom - postTop}
                rx={0.2 * ss}
                fill="#f4ecd8"
                stroke="#10241c"
                strokeWidth={0.25 * ss}
              />
              {/* Flat cap. */}
              <rect
                x={bx - 1.0 * ss}
                y={postTop - 0.85 * ss}
                width={2.0 * ss}
                height={0.85 * ss}
                rx={0.15 * ss}
                fill="#f8f2dd"
                stroke="#10241c"
                strokeWidth={0.25 * ss}
              />
            </m.g>
          );
        }

        if (h.kind === 'unplayable') {
          // Circle-slash "no" symbol — small, red-outlined, distinct from
          // both the OB stake and the penalty pennant.
          const bx = h.x + 3.4 * ss;
          const by = h.y - 3.0 * ss;
          const r = 2.3 * ss;
          const d = r * 0.72;
          return (
            <m.g
              key={key}
              initial={initial}
              animate={animate}
              transition={transition}
              style={{ transformOrigin: `${bx}px ${by}px` }}
            >
              {active && (
                <circle cx={bx} cy={by} r={4.4 * ss} fill="none" stroke="#f4ecd8" strokeOpacity="0.5" strokeWidth={0.5 * ss} />
              )}
              <circle cx={bx} cy={by} r={r} fill="#16332a" fillOpacity="0.7" stroke="#f0715c" strokeWidth={0.55 * ss} />
              <line x1={bx - d} y1={by + d} x2={bx + d} y2={by - d} stroke="#f0715c" strokeWidth={0.55 * ss} strokeLinecap="round" />
            </m.g>
          );
        }

        if (h.kind === 'penalty') {
          // Generic penalty pennant — small red flag-on-a-post. The
          // is_penalty fallback when penalty_type is unlogged/unrecognized —
          // must never read as the rough patch.
          const bx = h.x + 3.4 * ss;
          const by = h.y - 3.0 * ss;
          const postTop = by - 3.4 * ss;
          const postBottom = by + 1.4 * ss;
          return (
            <m.g
              key={key}
              initial={initial}
              animate={animate}
              transition={transition}
              style={{ transformOrigin: `${bx}px ${by}px` }}
            >
              {active && (
                <circle cx={bx} cy={by} r={4.4 * ss} fill="none" stroke="#f4ecd8" strokeOpacity="0.5" strokeWidth={0.5 * ss} />
              )}
              <line x1={bx} y1={postBottom} x2={bx} y2={postTop} stroke="#f4ecd8" strokeWidth={0.5 * ss} strokeLinecap="round" />
              <polygon
                points={`${bx},${postTop} ${bx + 2.6 * ss},${postTop + 0.85 * ss} ${bx},${postTop + 1.7 * ss}`}
                fill="#f0715c"
                stroke="#7a2e22"
                strokeWidth={0.25 * ss}
              />
            </m.g>
          );
        }

        // rough — a single understated flat patch. The lie is already carried
        // by the shot marker's own lie-colored halo, so this stays quiet and
        // never clutters the schematic.
        return (
          <m.g
            key={key}
            initial={initial}
            animate={animate}
            transition={transition}
            style={{ transformOrigin: `${h.x}px ${h.y}px` }}
          >
            {active && (
              <ellipse cx={h.x} cy={h.y} rx={h.r} ry={h.r * 0.68} fill="none" stroke="#f4ecd8" strokeOpacity="0.4" strokeWidth={0.5 * ss} />
            )}
            <ellipse cx={h.x} cy={h.y} rx={h.r * 0.82} ry={h.r * 0.54} fill="#2f5a44" stroke="#3a6b50" strokeWidth={0.3 * ss} opacity="0.9" />
          </m.g>
        );
      })}
    </g>
  );
}

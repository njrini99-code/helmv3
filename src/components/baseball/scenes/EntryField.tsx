/**
 * EntryField — "The Practice Field at First Light" (docs/baseball/
 * ENTRY_SCENES_DESIGN.md ⚠ AMENDMENT, 2026-07-02: "the svg baseball
 * login looks terrible" — Nick, confirmed by Fable). Replaces the
 * deleted `YardScene` + `HomePlateScene` (a flat clip-art stadium — the
 * infield read as an orange blob, the towers as smudges, the mobile
 * crop as a murky field with a stray white "V") with ONE responsive,
 * abstract scene: cream→sage atmospheric washes, one warm bloom, and a
 * quiet chalk-geometry field diagram. Closer to a Bauhaus field
 * blueprint than a stadium drawing. NO literal illustration — no
 * stadium, no towers, no infield, no flag, ever.
 *
 * Single `viewBox="0 0 1600 900"` + `preserveAspectRatio="xMidYMax
 * slice"` (the same technique the deleted YardScene used) — portrait
 * recomposition happens for free from the slice crop itself.
 *
 * GEOMETRY REBUILD 2026-07-02 (Nick, looking at the rendered login: "put
 * the diamond in the back so it renders" — the field didn't read as
 * baseball because the base path was a shallow decorative arc, not an
 * actual diamond, and it sat low enough that it read as barely-there).
 * One coherent field drawing now, not two overlays: `HOME`/`FIRST`/
 * `SECOND`/`THIRD` below are the four corners of a real rotated-square
 * base path (each side equal length, right angles at every corner —
 * see the constants' own comment for the math), and each foul line is
 * a STRAIGHT ray exactly collinear with the base path's own home→first
 * / home→third edge (Nick, second pass: "the square isn't flush with
 * the foul line" — the previous curved lines matched the edge only at
 * home, then bent away). One chalk geometry, no drift possible.
 * `HOME` sits lower-center-LEFT (not dead-center) so it clears
 * the auth panel, which floats right on desktop; `SECOND` (the diamond's
 * top vertex) lands mid-frame (y≈540 of 900) so the diamond's full body
 * is clearly visible, not scrunched into the bottom edge behind the
 * panel/bottom-sheet. The diamond's horizontal reach (x 600–880) is
 * deliberately kept inside the MOBILE crop window's visible band
 * (`xMidYMax slice` on a 390×844 viewport shows viewBox x≈[592,1008] —
 * see the constants' comment for the derivation) so all four corners
 * render at both the 1440×900 desktop and 390×844 mobile breakpoints;
 * the foul lines' outer/upper reaches are still expected to run off
 * either crop's edge exactly as before (by design — only the diamond
 * itself has the "must be fully in-viewport at both breakpoints" bar).
 *
 * `stage` (0–4 | 'full') drives the onboarding arc ("the field gets
 * chalked"): 0 = bare morning air (washes + bloom only) → 1 = first
 * (third-base side) foul line draws in (stroke-draw via `pathLength`,
 * 1.2s) → 2 = second (first-base side) foul line → 3 = the diamond's
 * closed outline completes → 4 = the batter's-box whispers appear + the
 * bloom warms one step. Auth pages always pass the default ('full') —
 * everything present from first paint, so no draw-in animation ever
 * fires on mount (the `stroke-dashoffset` resolves to its final value
 * on the very first render; a transition only plays when a LATER prop
 * change moves the stage forward — same pattern the deleted YardScene
 * used for its bases-on/flag-raised opacity transitions).
 *
 * `variant` ('dawn' | 'dusk') tints the sky wash + bloom. BOTH STAY
 * LIGHT — the SAGE & CREAM amendment: "the page never goes dark." Dawn
 * is warmer with a larger bloom; dusk is cooler with a deeper sage
 * cast, never dark or murky.
 *
 * Exactly one living detail (family rule #4): chalk-dust motes drifting
 * up the right foul line, `data-scene-animated` — killed under
 * `prefers-reduced-motion` by the shared global rule (`globals.css`
 * `[data-scene-animated] { animation: none !important; }`, confirmed
 * live for the golf scenes this mirrors).
 *
 * `aria-hidden`, decorative, zero pointer events — never focusable,
 * never announced.
 */
import { ENTRY_FIELD_PALETTE } from './palette';

export type SceneStage = 0 | 1 | 2 | 3 | 4 | 'full';
export type SceneVariant = 'dawn' | 'dusk';

/**
 * The base-path diamond — a real rotated square, not a decorative arc.
 * `HOME` is the square's bottom vertex; `FIRST`/`SECOND`/`THIRD` are
 * derived from it by walking 90°-apart 45°-diagonal steps (`DIAMOND_R`
 * is the half-diagonal), which guarantees all four sides are equal
 * length and every corner is a right angle — an actual diamond, not an
 * approximation:
 *   FIRST  = (HOME.x + r, HOME.y - r)   — right vertex
 *   SECOND = (HOME.x,     HOME.y - 2r)  — top vertex
 *   THIRD  = (HOME.x - r, HOME.y - r)   — left vertex
 *
 * Placement math (viewBox 1600×900, `preserveAspectRatio="xMidYMax
 * slice"`): for BOTH the 1440×900 desktop and 390×844 mobile targets,
 * the "slice" cover-scale is height-driven (height ratio > width
 * ratio at both sizes), so the FULL viewBox height (y 0–900) is always
 * visible at every breakpoint — only the horizontal window varies:
 *   desktop 1440×900 → scale 1.0   → visible x ∈ [80, 1520]
 *   mobile   390×844 → scale 0.938 → visible x ∈ [~592, ~1008]
 * Mobile's ~416-unit-wide centered window is the binding constraint.
 * `HOME.x = 740` (55 units left of the viewBox's true horizontal
 * center, 800 — "lower-center-left," clearing the auth panel, which
 * floats right on desktop) with `DIAMOND_R = 140` puts the diamond's
 * horizontal reach at x ∈ [600, 880] — inside the mobile window with
 * margin on both sides. `HOME.y = 820` keeps home near the bottom of
 * the frame while `SECOND` (y 540) rises to mid-frame, so the whole
 * body reads clearly rather than hugging the bottom edge.
 */
const DIAMOND_R = 140;
const HOME = { x: 740, y: 820 };
const FIRST = { x: HOME.x + DIAMOND_R, y: HOME.y - DIAMOND_R };
const SECOND = { x: HOME.x, y: HOME.y - 2 * DIAMOND_R };
const THIRD = { x: HOME.x - DIAMOND_R, y: HOME.y - DIAMOND_R };
const DIAMOND_PATH = `M ${HOME.x} ${HOME.y} L ${FIRST.x} ${FIRST.y} L ${SECOND.x} ${SECOND.y} L ${THIRD.x} ${THIRD.y} Z`;

/**
 * The two foul lines: STRAIGHT rays, exactly collinear with the
 * diamond's own edges. On a real field the foul line IS the base
 * path extended — home→first continues through first base to the
 * right-field foul pole, home→third through third to left field.
 * So each ray starts at `HOME`, passes exactly through `FIRST` /
 * `THIRD` (slope ±1, true 45°), and runs off-canvas. Derived from
 * HOME so the chalk can never drift out of register with the
 * diamond: endpoint x is fixed at the frame overshoot, endpoint y
 * falls out of the 45° constraint (Δy = −Δx).
 */
const RIGHT_FOUL_X = 1660;
const LEFT_FOUL_X = -180;
const RIGHT_FOUL_LINE = `M ${HOME.x} ${HOME.y} L ${RIGHT_FOUL_X} ${HOME.y - (RIGHT_FOUL_X - HOME.x)}`;
const LEFT_FOUL_LINE = `M ${HOME.x} ${HOME.y} L ${LEFT_FOUL_X} ${HOME.y - (HOME.x - LEFT_FOUL_X)}`;

/** Chalk-dust drift points, computed ON `RIGHT_FOUL_LINE`'s straight
 * ray (t ≈ 0.18, 0.32, 0.48, 0.62 of home→foul-pole) so the "living
 * detail" visibly rides the chalk rather than floating off it. */
const dustAt = (t: number) => ({
  cx: Math.round(HOME.x + (RIGHT_FOUL_X - HOME.x) * t),
  cy: Math.round(HOME.y - (RIGHT_FOUL_X - HOME.x) * t),
});
const DUST_POINTS = [dustAt(0.18), dustAt(0.32), dustAt(0.48), dustAt(0.62)] as const;

export interface EntryFieldProps {
  /** Optional className on the root decorative wrapper. */
  className?: string;
  /** Unique suffix for SVG ids/keyframes — avoids collisions when
   * multiple EntryFields could ever render (defensive; auth pages only
   * ever mount one). */
  idSuffix?: string;
  /** Onboarding-arc progress; auth surfaces always use the default. */
  stage?: SceneStage;
  /** Dawn/dusk light tint, computed client-side from local hour by the
   * caller (see `@/lib/entry/greeting`'s `resolveSceneVariant`). */
  variant?: SceneVariant;
}

function stageToNumber(stage: SceneStage): number {
  return stage === 'full' ? 4 : stage;
}

export function EntryField({ className, idSuffix = 'entry', stage = 'full', variant = 'dawn' }: EntryFieldProps) {
  const P = ENTRY_FIELD_PALETTE;
  const stageNum = stageToNumber(stage);
  const line1On = stageNum >= 1;
  const line2On = stageNum >= 2;
  const diamondOn = stageNum >= 3;
  const boxesOn = stageNum >= 4;
  const bloomWarm = stageNum >= 4;

  const skyId = `${idSuffix}-sky`;
  const bloomId = `${idSuffix}-bloom`;
  const chalkBlurId = `${idSuffix}-chalk-blur`;
  const grainId = `${idSuffix}-grain`;
  const dustKey = `${idSuffix}-dust-drift`;

  const sky = P.sky[variant];
  const bloom = P.bloom[variant];
  // Dawn: bigger, higher-right bloom. Dusk: tighter, cooler-cast bloom.
  const bloomCx = variant === 'dawn' ? 0.82 : 0.8;
  const bloomCy = variant === 'dawn' ? 0.08 : 0.06;

  const drawTransition = (delayMs: number) =>
    `stroke-dashoffset 1200ms cubic-bezier(0.22,0.7,0,1) ${delayMs}ms`;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <style>{`
        @keyframes ${dustKey} {
          0%, 100% { transform: translate(0, 0); opacity: .1; }
          50% { transform: translate(4px, -26px); opacity: .38; }
        }
      `}</style>
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={sky[0]} />
            <stop offset="65%" stopColor={sky[1]} />
            <stop offset="100%" stopColor={sky[2]} />
          </linearGradient>
          <radialGradient id={bloomId} cx={bloomCx} cy={bloomCy} r={bloom.r}>
            <stop offset="0%" stopColor={bloom.inner} />
            <stop offset="45%" stopColor={bloom.mid} />
            <stop offset="100%" stopColor={bloom.mid} stopOpacity="0" />
          </radialGradient>
          <filter id={chalkBlurId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.3" />
          </filter>
        </defs>

        {/* Layer 1 — morning air: the abstract cream -> sage-mist -> sage
            wash. No horizon line, no objects. */}
        <rect width="1600" height="900" fill={`url(#${skyId})`} />

        {/* Layer 2 — the warm bloom ("the sun you never see"); warms one
            step at the final onboarding stage. */}
        <rect
          width="1600"
          height="900"
          fill={`url(#${bloomId})`}
          opacity={bloomWarm ? 1 : 0.8}
          style={{ transition: 'opacity 1200ms cubic-bezier(0.22,0.7,0,1)' }}
        />

        {/* Layer 3 — the chalk geometry, ONE coherent field drawing: the
            base-path diamond (HOME/FIRST/SECOND/THIRD) plus the two foul
            lines, each starting at HOME and continuing that base-path
            edge's own slope outward to the fence (not a second, unrelated
            overlay — see the module-level constants' comment above for
            the geometry). A soft blurred pass underneath a crisp hairline
            pass, both very faint (the amendment's 6–10% band). */}
        <g filter={`url(#${chalkBlurId})`} opacity="0.4">
          <path
            d={LEFT_FOUL_LINE}
            stroke={P.chalk}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: line1On ? 0 : 1, transition: drawTransition(0) }}
          />
          <path
            d={RIGHT_FOUL_LINE}
            stroke={P.chalk}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: line2On ? 0 : 1, transition: drawTransition(150) }}
          />
          <path
            d={DIAMOND_PATH}
            stroke={P.chalk}
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: diamondOn ? 0 : 1, transition: drawTransition(300) }}
          />
        </g>
        <path
          d={LEFT_FOUL_LINE}
          stroke={P.chalk}
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
          opacity="0.09"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: line1On ? 0 : 1, transition: drawTransition(0) }}
        />
        <path
          d={RIGHT_FOUL_LINE}
          stroke={P.chalk}
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
          opacity="0.09"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: line2On ? 0 : 1, transition: drawTransition(150) }}
        />

        {/* The diamond itself — a real rotated square, not a decorative
            arc: HOME -> FIRST -> SECOND -> THIRD -> Z, drawn in as one
            closed stroke at stage 3, after both foul lines have landed.
            Slightly stronger than the foul lines' own hairline (0.1 vs
            0.09, still inside the amendment's 6–10% band) so the
            diamond's body reads clearly rather than disappearing. */}
        <path
          d={DIAMOND_PATH}
          stroke={P.chalk}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.1"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: diamondOn ? 0 : 1, transition: drawTransition(300) }}
        />

        {/* Batter's-box whispers — flank HOME (left = third-base side,
            right = first-base side), offset from HOME the same way the
            original design offset them from its implied home position. */}
        <g opacity={boxesOn ? 0.07 : 0} style={{ transition: 'opacity 900ms cubic-bezier(0.22,0.7,0,1) 450ms' }}>
          <rect x={HOME.x - 58} y={HOME.y - 64} width="42" height="58" rx="3" stroke={P.chalk} strokeWidth="1.5" fill="none" />
          <rect x={HOME.x + 16} y={HOME.y - 64} width="42" height="58" rx="3" stroke={P.chalk} strokeWidth="1.5" fill="none" />
        </g>

        {/* Layer 5 — the living detail: chalk-dust drifting up the right
            (first-base) foul line, computed on RIGHT_FOUL_LINE's straight
            ray (see DUST_POINTS). Only once that line has drawn in. */}
        {line2On && (
          <g opacity="0.85">
            {DUST_POINTS.map((point, i) => (
              <circle
                key={i}
                data-scene-animated
                cx={point.cx}
                cy={point.cy}
                r={i % 2 === 0 ? 1.6 : 1.1}
                fill={P.dust}
                style={{
                  // House curve (CLAUDE.md motion rule — no linear/ease-in-out),
                  // not the default ease-in-out, for both keyframe halves.
                  animation: `${dustKey} ${16 + i * 2}s cubic-bezier(0.22,0.7,0,1) infinite`,
                  animationDelay: `${i * 1.6}s`,
                  willChange: 'transform, opacity',
                }}
              />
            ))}
          </g>
        )}
      </svg>

      {/* Layer 4 — static film grain, the family's perf-tuned recipe
          (numOctaves 1, baseFrequency 1.2, static, no mix-blend-mode). */}
      <svg
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: -20,
          width: 'calc(100% + 40px)',
          height: 'calc(100% + 40px)',
          opacity: 0.05,
          pointerEvents: 'none',
        }}
      >
        <filter id={grainId}>
          <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves={1} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${grainId})`} />
      </svg>
    </div>
  );
}

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
 * recomposition happens for free from the slice crop itself: the two
 * foul lines start at the canvas's extreme left/right edges and only
 * enter a narrow mobile viewport's cropped window once they've
 * converged most of the way toward the vanishing point, so a phone
 * naturally only ever shows them "converged higher" in the frame — the
 * amendment's mobile requirement, satisfied by CSS/viewBox handling
 * with no second component and no duplicated geometry.
 *
 * `stage` (0–4 | 'full') drives the onboarding arc ("the field gets
 * chalked"): 0 = bare morning air (washes + bloom only) → 1 = first
 * foul line draws in (stroke-draw via `pathLength`, 1.2s) → 2 = second
 * foul line → 3 = the base-path arc completes → 4 = the batter's-box
 * whispers appear + the bloom warms one step. Auth pages always pass
 * the default ('full') — everything present from first paint, so no
 * draw-in animation ever fires on mount (the `stroke-dashoffset`
 * resolves to its final value on the very first render; a transition
 * only plays when a LATER prop change moves the stage forward — same
 * pattern the deleted YardScene used for its bases-on/flag-raised
 * opacity transitions).
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
  const arcOn = stageNum >= 3;
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

        {/* Layer 3 — the chalk geometry, the ONLY motif: a groundskeeper's
            blueprint, not a stadium. Two foul lines rising from the
            bottom corners to a shared vanishing point, the base-path
            arc, a whisper of the batter's boxes. A soft blurred pass
            underneath a crisp hairline pass, both very faint (the
            amendment's 6–10% band). */}
        <g filter={`url(#${chalkBlurId})`} opacity="0.4">
          <path
            d="M -60 900 C 220 760, 520 560, 800 300"
            stroke={P.chalk}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: line1On ? 0 : 1, transition: drawTransition(0) }}
          />
          <path
            d="M 1660 900 C 1380 760, 1080 560, 800 300"
            stroke={P.chalk}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: line2On ? 0 : 1, transition: drawTransition(150) }}
          />
        </g>
        <path
          d="M -60 900 C 220 760, 520 560, 800 300"
          stroke={P.chalk}
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
          opacity="0.09"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: line1On ? 0 : 1, transition: drawTransition(0) }}
        />
        <path
          d="M 1660 900 C 1380 760, 1080 560, 800 300"
          stroke={P.chalk}
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
          opacity="0.09"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: line2On ? 0 : 1, transition: drawTransition(150) }}
        />

        {/* Base-path arc — the faint suggestion of the diamond, no bases drawn */}
        <path
          d="M 560 900 Q 800 660 1040 900"
          stroke={P.chalk}
          strokeWidth="1.75"
          strokeLinecap="round"
          fill="none"
          opacity="0.08"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: arcOn ? 0 : 1, transition: drawTransition(300) }}
        />

        {/* Batter's-box whispers */}
        <g opacity={boxesOn ? 0.07 : 0} style={{ transition: 'opacity 900ms cubic-bezier(0.22,0.7,0,1) 450ms' }}>
          <rect x="742" y="836" width="42" height="58" rx="3" stroke={P.chalk} strokeWidth="1.5" fill="none" />
          <rect x="816" y="836" width="42" height="58" rx="3" stroke={P.chalk} strokeWidth="1.5" fill="none" />
        </g>

        {/* Layer 5 — the living detail: chalk-dust drifting up the right
            foul line. Only once that line has drawn in. */}
        {line2On && (
          <g opacity="0.85">
            {[0, 1, 2, 3].map((i) => (
              <circle
                key={i}
                data-scene-animated
                cx={1180 - i * 110}
                cy={720 - i * 90}
                r={i % 2 === 0 ? 1.6 : 1.1}
                fill={P.dust}
                style={{
                  animation: `${dustKey} ${16 + i * 2}s ease-in-out infinite`,
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

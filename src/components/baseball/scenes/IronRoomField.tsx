/**
 * IronRoomField — "The Iron Room", respecced (docs/baseball/
 * ENTRY_SCENES_DESIGN.md ⚠ AMENDMENT's "Lift Lab 'Iron Room', respecced"
 * paragraph). Replaces the deleted painterly `IronRoomScene` (windows,
 * volumetric light shafts, interior illustration — all void per the
 * amendment) with an abstract product surface: a warm-graphite →
 * sage-ink vertical wash, the bar as one clean brass-hairline
 * horizontal, plates as precise concentric circles with brass rims, and
 * the single kept kelly `#16A34A` collar — deliberately kept: this is
 * an in-app product surface (Lift Lab), not front-door chrome, so
 * product green is at home here (unlike `EntryField`/the auth pages,
 * which never use kelly — see the SAGE & CREAM amendment).
 *
 * This surface may read darker than `EntryField` — it lives inside the
 * app, not the front door (the amendment's own words) — but it must
 * read considered, not murky: a controlled, warm, purposeful dark.
 *
 * `stage` (0–4 | 'full') is the onboarding mechanic — "the bar IS the
 * progress bar": 0 = bar empty, 1–3 = one more mirrored plate-pair
 * loads per step, 4/'full' = all plates loaded + the collar clicks on.
 *
 * Exactly one living detail: a slow glint on the outermost loaded
 * plate's brass rim. Chalk-dust motes are cut here (the amendment: "the
 * plate-glint IS the living detail"). `data-scene-animated` — killed
 * under `prefers-reduced-motion` by the shared global rule
 * (`globals.css`).
 *
 * `aria-hidden`, decorative, zero pointer events.
 */
import { IRON_ROOM_PALETTE } from './palette';

export type IronRoomStage = 0 | 1 | 2 | 3 | 4 | 'full';

export interface IronRoomFieldProps {
  /** Optional className on the root decorative wrapper. */
  className?: string;
  /** Unique suffix for SVG ids/keyframes — avoids collisions. */
  idSuffix?: string;
  /** Plates-loaded / collar-on progress — mirrors `EntryField`'s stage contract. */
  stage?: IronRoomStage;
}

function stageToNumber(stage: IronRoomStage): number {
  return stage === 'full' ? 4 : stage;
}

// Plate radii, outermost (loaded first) to innermost (loaded last).
const PLATE_RADII = [96, 78, 60] as const;

export function IronRoomField({ className, idSuffix = 'iron-room', stage = 'full' }: IronRoomFieldProps) {
  const P = IRON_ROOM_PALETTE;
  const stageNum = stageToNumber(stage);
  const platesLoaded = Math.min(stageNum, PLATE_RADII.length);
  const collarOn = stageNum >= 4;

  const washId = `${idSuffix}-wash`;
  const plateId = `${idSuffix}-plate`;
  const grainId = `${idSuffix}-grain`;
  const glintKey = `${idSuffix}-glint`;

  const barY = 460;
  const barLeft = 360;
  const barRight = 1240;
  const collarInset = 34;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <style>{`
        @keyframes ${glintKey} {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.55; }
        }
      `}</style>
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id={washId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={P.wash[0]} />
            <stop offset="100%" stopColor={P.wash[1]} />
          </linearGradient>
          <radialGradient id={plateId} cx="0.38" cy="0.32" r="0.75">
            <stop offset="0%" stopColor={P.plateFace} />
            <stop offset="100%" stopColor={P.plateShadow} />
          </radialGradient>
        </defs>

        <rect width="1600" height="900" fill={`url(#${washId})`} />

        {/* The bar — one clean brass-hairline horizontal, with a soft
            underglow so it reads as steel under quiet light. */}
        <line x1={barLeft} y1={barY} x2={barRight} y2={barY} stroke={P.brass} strokeWidth="12" opacity="0.12" />
        <line x1={barLeft} y1={barY} x2={barRight} y2={barY} stroke={P.brass} strokeWidth="4" opacity="0.85" />

        {/* Plates — precise concentric circles with brass rims, loaded
            from the bar ends inward as `stage` advances (mirrored). */}
        {PLATE_RADII.map((r, i) => {
          const on = i < platesLoaded;
          const cxLeft = barLeft + 28 + i * 34;
          const cxRight = barRight - 28 - i * 34;
          return (
            <g
              key={r}
              opacity={on ? 1 : 0}
              style={{ transition: `opacity 700ms cubic-bezier(0.22,0.7,0,1) ${i * 120}ms` }}
            >
              {[cxLeft, cxRight].map((cx) => (
                <g key={cx}>
                  <circle cx={cx} cy={barY} r={r} fill={`url(#${plateId})`} stroke={P.brass} strokeWidth="3" />
                  <circle cx={cx} cy={barY} r={r - 10} fill="none" stroke={P.brass} strokeWidth="1" opacity="0.35" />
                </g>
              ))}
            </g>
          );
        })}

        {/* The living detail — a slow glint on the outermost loaded
            plate's brass rim. Chalk-dust motes are cut here. */}
        {platesLoaded > 0 && (
          <g
            data-scene-animated
            style={{
              // House curve (CLAUDE.md motion rule — no linear/ease-in-out).
              animation: `${glintKey} 5s cubic-bezier(0.22,0.7,0,1) infinite`,
              willChange: 'opacity',
            }}
          >
            <circle cx={barLeft + 28} cy={barY - PLATE_RADII[0] * 0.7} r="3" fill={P.glint} opacity="0.4" />
            <circle cx={barRight - 28} cy={barY - PLATE_RADII[0] * 0.7} r="3" fill={P.glint} opacity="0.4" />
          </g>
        )}

        {/* The collar — the single kept kelly accent (in-app product
            chrome; this scene does not follow the auth pages' no-kelly
            rule). Clicks on at the final onboarding stage. */}
        <g opacity={collarOn ? 1 : 0} style={{ transition: 'opacity 500ms cubic-bezier(0.22,0.7,0,1) 500ms' }}>
          <circle cx={barLeft + collarInset} cy={barY} r="14" fill={P.collar} stroke={P.collarRim} strokeWidth="1.5" />
          <circle cx={barRight - collarInset} cy={barY} r="14" fill={P.collar} stroke={P.collarRim} strokeWidth="1.5" />
        </g>
      </svg>

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

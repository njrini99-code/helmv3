/**
 * Portrait mobile pairing for `<YardScene />` — "Home Plate" (docs/baseball/
 * ENTRY_SCENES_DESIGN.md Scene 1, "Mobile pair"). Minimal, iconic crop: the
 * plate low-center, two chalk lines converging upward into the dusk sky,
 * one light-tower glow bleeding in from a top corner. Same craft DNA as
 * `<YardScene />` (grain recipe, `data-scene-animated` reduced-motion
 * contract) but its own composition, not a literal crop of the desktop SVG —
 * mirrors how golf's `CourseScene` is a standalone mobile pairing for
 * `CoastalScene` rather than a viewBox crop of it.
 */
import { SCENE_PALETTE } from './palette';
import type { SceneVariant } from './YardScene';

export interface HomePlateSceneProps {
  className?: string;
  idSuffix?: string;
  variant?: SceneVariant;
}

export function HomePlateScene({ className, idSuffix = 'home-plate', variant = 'dusk' }: HomePlateSceneProps) {
  const P = SCENE_PALETTE.yard;
  const sky = variant === 'dawn' ? P.sky.dawn : P.sky.dusk;

  const skyId = `${idSuffix}-sky`;
  const towerGlowId = `${idSuffix}-tower-glow`;
  const chalkBlurId = `${idSuffix}-chalk-blur`;
  const grainId = `${idSuffix}-grain`;
  const moteKey = `${idSuffix}-mote`;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <style>{`
        @keyframes ${moteKey} {
          0%, 100% { transform: translate(0, 0); opacity: .16; }
          50% { transform: translate(-5px, -18px); opacity: .5; }
        }
      `}</style>
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        viewBox="0 0 900 1600"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky[0]} />
            <stop offset="48%" stopColor={sky[1]} />
            <stop offset="100%" stopColor={sky[2]} />
          </linearGradient>
          <radialGradient id={towerGlowId} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={P.towerGlow} stopOpacity="0.7" />
            <stop offset="55%" stopColor={P.towerGlow} stopOpacity="0.22" />
            <stop offset="100%" stopColor={P.towerGlow} stopOpacity="0" />
          </radialGradient>
          <filter id={chalkBlurId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width="900" height="1600" fill={`url(#${skyId})`} />

        {/* Light-tower glow bleeding in from a top corner */}
        <circle cx="760" cy="220" r="360" fill={`url(#${towerGlowId})`} />

        {/* The one living detail: dust motes inside the glow */}
        <g opacity="0.85">
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              data-scene-animated
              cx={640 + i * 70}
              cy={140 + i * 90}
              r={i === 1 ? 1.7 : 1.2}
              fill={P.mote}
              style={{
                animation: `${moteKey} ${15 + i * 3}s ease-in-out infinite`,
                animationDelay: `${i * 1.6}s`,
              }}
            />
          ))}
        </g>

        {/* Faint tree-line horizon for continuity with the desktop scene */}
        <path d="M -20 1180 C 200 1166, 460 1176, 700 1162 C 800 1157, 880 1166, 920 1160 L 920 1220 L -20 1220 Z" fill={P.treeLine} opacity="0.5" />

        {/* Chalk foul lines converging upward from the plate into the sky */}
        <g filter={`url(#${chalkBlurId})`}>
          <path d="M 450 1548 C 320 1200, 220 760, 150 380" stroke={P.chalk} strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.12" />
          <path d="M 450 1548 C 560 1200, 660 760, 720 260" stroke={P.chalk} strokeWidth="10" strokeLinecap="round" fill="none" opacity="0.12" />
        </g>
        <path d="M 450 1548 C 320 1200, 220 760, 150 380" stroke={P.chalk} strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.7" />
        <path d="M 450 1548 C 560 1200, 660 760, 720 260" stroke={P.chalk} strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0.7" />

        {/* Home plate */}
        <path
          d="M 450 1524 L 428 1546 L 428 1568 L 472 1568 L 472 1546 Z"
          fill={P.base}
          stroke="#7A6A4E"
          strokeWidth="1"
          opacity="0.95"
        />
      </svg>

      {/* Gentle vignette */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 60% at 50% 65%, transparent 40%, rgba(10,18,14,0.3) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Static film grain — no animation, no mix-blend-mode (Safari perf). */}
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

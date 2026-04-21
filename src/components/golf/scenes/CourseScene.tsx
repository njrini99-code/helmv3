/**
 * Painterly "golf course at dusk" scene, shared across iOS login and
 * post-login welcome animation. Portrait-optimised — designed for small
 * viewports. Desktop uses `<CoastalScene />` instead.
 *
 * All keyframes are declared in `globals.css` (prefixed `helmScene…`).
 * Decorative elements carry `data-scene-animated` so reduced-motion
 * disables them without hitting focus rings or status indicators.
 */
import { SCENE_PALETTE } from './palette';

const Tree = ({ x, y, scale = 1, sway = 0 }: { x: number; y: number; scale?: number; sway?: number }) => (
  <g transform={`translate(${x}, ${y})`}>
    <g
      data-scene-animated
      style={{
        transformBox: 'fill-box',
        transformOrigin: '50% 100%',
        animation: `helmSceneTreeSway ${7 + sway}s ease-in-out infinite`,
        animationDelay: `${sway * 0.5}s`,
        willChange: 'transform',
      }}
    >
      <path
        d={`M -2 ${18 * scale} Q -1 ${36 * scale}, -3 ${50 * scale} L 3 ${50 * scale} Q 1 ${36 * scale}, 2 ${18 * scale} Z`}
        fill={SCENE_PALETTE.trunk}
        opacity="0.85"
      />
      <circle cx={0} cy={0} r={24 * scale} fill={SCENE_PALETTE.treeTones[0]} />
      <circle cx={-16 * scale} cy={-4 * scale} r={18 * scale} fill={SCENE_PALETTE.treeTones[1]} />
      <circle cx={14 * scale} cy={-10 * scale} r={17 * scale} fill={SCENE_PALETTE.treeTones[0]} />
      <circle cx={-4 * scale} cy={-22 * scale} r={15 * scale} fill={SCENE_PALETTE.treeTones[1]} />
      <circle cx={12 * scale} cy={-22 * scale} r={12 * scale} fill={SCENE_PALETTE.treeTones[2]} />
      <circle cx={-2 * scale} cy={10 * scale} r={20 * scale} fill={SCENE_PALETTE.treeTones[2]} />
      <circle cx={16 * scale} cy={8 * scale} r={14 * scale} fill={SCENE_PALETTE.treeTones[3]} />
      <circle cx={-18 * scale} cy={12 * scale} r={13 * scale} fill={SCENE_PALETTE.treeTones[3]} />
      <circle cx={6 * scale} cy={-16 * scale} r={6 * scale} fill="#e8eec8" opacity="0.35" />
    </g>
  </g>
);

export interface CourseSceneProps {
  /** Unique suffix for SVG filter/clip ids — set when multiple scenes render at once. */
  idSuffix?: string;
  /** Optional className passthrough on the root decorative wrapper. */
  className?: string;
}

export function CourseScene({ idSuffix = 'course', className }: CourseSceneProps) {
  const grainFilterId = `grain-filter-${idSuffix}`;
  const P = SCENE_PALETTE;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(180deg, ${P.cream1} 0%, ${P.cream2} 55%, ${P.cream3} 100%)`,
        }}
      />
      <div
        data-scene-animated
        style={{
          position: 'absolute',
          top: -140,
          left: '30%',
          width: 480,
          height: 480,
          background: `radial-gradient(circle, ${P.glow} 0%, transparent 70%)`,
          animation: 'helmSceneSunPulse 8s ease-in-out infinite',
          pointerEvents: 'none',
          willChange: 'transform, opacity',
        }}
      />
      <svg
        style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 340, pointerEvents: 'none', display: 'block' }}
        viewBox="0 0 390 340"
        preserveAspectRatio="xMidYMax slice"
      >
        <path
          d="M -20 220 C 40 200, 90 225, 150 215 C 210 200, 260 225, 330 215 C 370 210, 400 220, 410 225 L 410 360 L -20 360 Z"
          fill={P.grass}
          opacity="0.85"
        />
        <path d="M 20 260 Q 120 248, 220 262 Q 310 255, 390 268" stroke={P.grassShadow} strokeWidth="1.5" fill="none" opacity="0.5" />
        <path d="M -10 300 Q 100 290, 200 302 Q 300 295, 400 305" stroke={P.grassShadow} strokeWidth="1.5" fill="none" opacity="0.4" />
        <path
          d="M 30 240 C 10 238, -5 252, 5 268 C 15 285, 55 288, 95 280 C 130 275, 145 260, 125 248 C 95 240, 60 238, 30 240 Z"
          fill={P.sand}
        />
        <path d="M 10 270 C 35 282, 75 284, 115 276" stroke={P.sandShadow} strokeWidth="1.2" fill="none" opacity="0.6" />
        <path
          d="M 290 260 C 315 254, 365 258, 395 268 C 405 285, 375 295, 340 292 C 305 288, 275 278, 285 266 Z"
          fill={P.sand}
        />
        <path d="M 300 280 C 335 290, 375 288, 395 280" stroke={P.sandShadow} strokeWidth="1.2" fill="none" opacity="0.6" />
        <ellipse cx="200" cy="260" rx="72" ry="22" fill={P.grassShadow} opacity="0.95" />
        <ellipse cx="200" cy="258" rx="66" ry="18" fill={P.grass} opacity="0.7" />
        <ellipse cx="205" cy="258" rx="4.5" ry="2.2" fill="#1a1612" />
        <ellipse cx="205" cy="257.5" rx="3.5" ry="1.5" fill="#000" />
        <g transform="translate(205, 258)">
          <line x1="0" y1="0" x2="0" y2="-52" stroke="#2d2a25" strokeWidth="2.4" strokeLinecap="round" />
          <g
            data-scene-animated
            style={{
              transformBox: 'fill-box',
              transformOrigin: '0% 50%',
              animation: 'helmSceneFlagFlutter 2.4s ease-in-out infinite',
              willChange: 'transform',
            }}
          >
            <path
              d="M 0 -52 C 7 -54, 15 -50, 22 -52 L 22 -38 C 15 -36, 7 -40, 0 -38 Z"
              fill={P.flag}
              stroke={P.flagShadow}
              strokeWidth="0.8"
              strokeOpacity="0.5"
            />
          </g>
          <circle cx="0" cy="0" r="2" fill="#1c1917" />
        </g>
      </svg>
      <svg
        style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 340, pointerEvents: 'none', display: 'block' }}
        viewBox="0 0 390 340"
        preserveAspectRatio="xMidYMax slice"
      >
        <Tree x={42} y={258} scale={1.35} sway={0} />
        <Tree x={22} y={290} scale={1.0} sway={1} />
        <Tree x={345} y={260} scale={1.2} sway={2} />
        <Tree x={368} y={295} scale={0.95} sway={0.5} />
        <Tree x={112} y={278} scale={0.7} sway={1.5} />
        <Tree x={290} y={282} scale={0.7} sway={2.5} />
      </svg>
      {/*
       * Static grain overlay — no animation, no mix-blend-mode. Cuts the
       * 4Hz `feTurbulence` repaint cost and the software-composite fallback
       * that the animated/blended version triggered.
       */}
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
        <filter id={grainFilterId}>
          <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves={1} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${grainFilterId})`} />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 220,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.45) 40%, rgba(255,255,255,0) 100%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

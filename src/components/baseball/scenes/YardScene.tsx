/**
 * Desktop-only painterly scene — "The Yard at Dusk" (docs/baseball/
 * ENTRY_SCENES_DESIGN.md Scene 1). Paired with the portrait `<HomePlateScene />`
 * via a `useMediaQuery` switch in `BaseballAuthShell`. Craft DNA mirrors
 * `src/components/golf/scenes/CoastalScene.tsx` exactly: same grain recipe
 * (feTurbulence numOctaves=1, baseFrequency=1.2, static, no mix-blend-mode),
 * same `data-scene-animated` reduced-motion contract, `willChange` reserved
 * for the fastest loop only (the flag), viewBox 1600×900 + preserveAspectRatio
 * slice.
 *
 * `stage` drives the onboarding arc (docs/baseball/ENTRY_SCENES_DESIGN.md
 * "The onboarding arc"): 0 = dark yard, lights off; 1 = first tower on;
 * 2 = second tower on + bases appear; 3 = chalk lines complete; 4/'full' =
 * everything on, flag raised, dust motes drifting. Auth pages always pass
 * the default ('full').
 */
import { SCENE_PALETTE } from './palette';

export type SceneStage = 0 | 1 | 2 | 3 | 4 | 'full';
export type SceneVariant = 'dawn' | 'dusk';

export interface YardSceneProps {
  /** Optional className on the root decorative wrapper. */
  className?: string;
  /** Unique suffix for SVG ids — avoids collision when multiple scenes render. */
  idSuffix?: string;
  /** Onboarding-arc progress; auth surfaces always use the default. */
  stage?: SceneStage;
  /** Dawn/dusk sky tint, computed client-side from local hour by the caller. */
  variant?: SceneVariant;
}

function stageToNumber(stage: SceneStage): number {
  return stage === 'full' ? 4 : stage;
}

export function YardScene({ className, idSuffix = 'yard', stage = 'full', variant = 'dusk' }: YardSceneProps) {
  const P = SCENE_PALETTE.yard;
  const stageNum = stageToNumber(stage);
  const tower1On = stageNum >= 1;
  const tower2On = stageNum >= 2;
  const basesOn = stageNum >= 2;
  const chalkFull = stageNum >= 4;
  const flagRaised = stageNum >= 4;
  const motesOn = tower1On || tower2On;

  const skyId = `${idSuffix}-sky`;
  const infieldId = `${idSuffix}-infield`;
  const towerGlowId = `${idSuffix}-tower-glow`;
  const fairwayClipId = `${idSuffix}-mow-clip`;
  const chalkBlurId = `${idSuffix}-chalk-blur`;
  const grainId = `${idSuffix}-grain`;
  const moteKeyA = `${idSuffix}-mote-a`;
  const moteKeyB = `${idSuffix}-mote-b`;

  const sky = variant === 'dawn' ? P.sky.dawn : P.sky.dusk;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <style>{`
        @keyframes ${moteKeyA} {
          0%, 100% { transform: translate(0, 0); opacity: .18; }
          50% { transform: translate(6px, -22px); opacity: .55; }
        }
        @keyframes ${moteKeyB} {
          0%, 100% { transform: translate(0, 0); opacity: .14; }
          50% { transform: translate(-8px, -30px); opacity: .48; }
        }
      `}</style>
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={sky[0]} />
            <stop offset="55%" stopColor={sky[1]} />
            <stop offset="100%" stopColor={sky[2]} />
          </linearGradient>
          <radialGradient id={infieldId} cx="0.5" cy="0.35" r="0.75">
            <stop offset="0%" stopColor={P.infield[0]} />
            <stop offset="100%" stopColor={P.infield[1]} />
          </radialGradient>
          <radialGradient id={towerGlowId} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor={P.towerGlow} stopOpacity="0.85" />
            <stop offset="55%" stopColor={P.towerGlow} stopOpacity="0.28" />
            <stop offset="100%" stopColor={P.towerGlow} stopOpacity="0" />
          </radialGradient>
          <clipPath id={fairwayClipId}>
            <path d="M -50 900 L -50 700 C 200 674, 500 660, 800 656 C 1100 660, 1400 674, 1650 700 L 1650 900 Z" />
          </clipPath>
          <filter id={chalkBlurId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>

        {/* Sky */}
        <rect width="1600" height="900" fill={`url(#${skyId})`} />

        {/* Tree-line silhouette */}
        <path
          d="M -50 512 C 120 496, 260 520, 420 500 C 580 486, 720 512, 880 496 C 1040 484, 1180 508, 1340 492 C 1450 482, 1560 500, 1650 494 L 1650 580 L -50 580 Z"
          fill={P.treeLine}
          opacity="0.92"
        />

        {/* Outfield wall + distance marker */}
        <path
          d="M -50 566 C 160 552, 420 542, 800 538 C 1180 542, 1440 552, 1650 566 L 1650 604 C 1440 592, 1180 584, 800 582 C 420 584, 160 592, -50 604 Z"
          fill={P.wall}
        />
        <text
          x="800"
          y="568"
          textAnchor="middle"
          fontSize="26"
          fontFamily="Georgia, serif"
          fill={P.marker}
          opacity="0.08"
          letterSpacing="2"
        >
          398
        </text>

        {/* Outfield grass — mow stripes clipped to the field body */}
        <path d="M -50 900 L -50 700 C 200 674, 500 660, 800 656 C 1100 660, 1400 674, 1650 700 L 1650 900 Z" fill={P.grassLight} />
        <g clipPath={`url(#${fairwayClipId})`}>
          <path d="M -60 700 C 260 676, 560 662, 800 660 C 1040 662, 1340 676, 1660 700 L 1660 724 C 1340 704, 1040 692, 800 690 C 560 692, 260 704, -60 724 Z" fill={P.grassDark} opacity="0.55" />
          <path d="M -60 748 C 260 730, 560 720, 800 718 C 1040 720, 1340 730, 1660 748 L 1660 772 C 1340 758, 1040 748, 800 746 C 560 748, 260 758, -60 772 Z" fill={P.grassDark} opacity="0.45" />
          <path d="M -60 796 C 260 782, 560 774, 800 772 C 1040 774, 1340 782, 1660 796 L 1660 900 L -60 900 Z" fill={P.grassDark} opacity="0.32" />
        </g>

        {/* Chalk foul lines — home plate to the wall corners, slight blur */}
        <g filter={`url(#${chalkBlurId})`}>
          <path
            d="M 800 878 C 620 800, 340 690, 150 588"
            stroke={P.chalk}
            strokeWidth="9"
            strokeLinecap="round"
            fill="none"
            opacity={chalkFull ? 0.14 : 0.06}
          />
          <path
            d="M 800 878 C 980 800, 1260 690, 1450 588"
            stroke={P.chalk}
            strokeWidth="9"
            strokeLinecap="round"
            fill="none"
            opacity={chalkFull ? 0.14 : 0.06}
          />
        </g>
        <path
          d="M 800 878 C 620 800, 340 690, 150 588"
          stroke={P.chalk}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
          opacity={chalkFull ? 0.85 : 0.4}
        />
        <path
          d="M 800 878 C 980 800, 1260 690, 1450 588"
          stroke={P.chalk}
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
          opacity={chalkFull ? 0.85 : 0.4}
        />

        {/* Infield dirt, mound, bases */}
        <path
          d="M 800 892 C 660 838, 610 760, 640 700 C 668 646, 740 610, 800 604 C 860 610, 932 646, 960 700 C 990 760, 940 838, 800 892 Z"
          fill={`url(#${infieldId})`}
        />
        <ellipse cx="800" cy="782" rx="34" ry="16" fill={P.mound} opacity="0.85" />
        <ellipse cx="800" cy="778" rx="24" ry="10" fill={P.infield[0]} opacity="0.5" />

        <g opacity={basesOn ? 1 : 0} style={{ transition: 'opacity 900ms cubic-bezier(0.22,0.7,0,1)' }}>
          <rect x="792" y="864" width="16" height="16" fill={P.base} transform="rotate(45 800 872)" stroke="#7A6A4E" strokeWidth="0.6" />
          <rect x="924" y="702" width="14" height="14" fill={P.base} transform="rotate(45 931 709)" stroke="#7A6A4E" strokeWidth="0.6" />
          <rect x="793" y="640" width="14" height="14" fill={P.base} transform="rotate(45 800 647)" stroke="#7A6A4E" strokeWidth="0.6" />
          <rect x="662" y="702" width="14" height="14" fill={P.base} transform="rotate(45 669 709)" stroke="#7A6A4E" strokeWidth="0.6" />
        </g>

        {/* Foul pole — left corner, carries the flag */}
        <line x1="150" y1="588" x2="150" y2="330" stroke={P.marker} strokeWidth="3" opacity="0.55" />
        <g
          opacity={flagRaised ? 1 : 0}
          style={{ transition: 'opacity 700ms cubic-bezier(0.22,0.7,0,1)' }}
        >
          <g
            data-scene-animated
            style={{
              transformBox: 'fill-box',
              transformOrigin: '0% 50%',
              animation: flagRaised ? 'helmSceneFlagFlutter 2.4s ease-in-out infinite' : undefined,
              willChange: flagRaised ? 'transform' : undefined,
            }}
          >
            <path d="M 150 330 C 162 327, 174 334, 188 330 L 188 306 C 174 302, 162 309, 150 306 Z" fill={P.flag} stroke={P.flagShadow} strokeWidth="0.8" strokeOpacity="0.55" />
          </g>
        </g>

        {/* Foul pole — right corner (unlit, no flag; the family rule is one living detail per scene) */}
        <line x1="1450" y1="588" x2="1450" y2="330" stroke={P.marker} strokeWidth="3" opacity="0.4" />

        {/* Stadium light towers */}
        {[{ x: 260, on: tower1On }, { x: 1340, on: tower2On }].map(({ x, on }) => (
          <g key={x}>
            <line x1={x} y1="560" x2={x} y2="150" stroke={P.towerMast} strokeWidth="6" opacity="0.85" />
            <rect x={x - 46} y="120" width="92" height="30" rx="4" fill={P.towerMast} opacity="0.9" />
            <circle
              cx={x}
              cy="135"
              r="130"
              fill={`url(#${towerGlowId})`}
              opacity={on ? 1 : 0}
              style={{ transition: 'opacity 900ms cubic-bezier(0.22,0.7,0,1)' }}
            />
            {/* Dust motes drifting through this tower's light beam — the living detail */}
            {on && motesOn && (
              <g opacity="0.9">
                {[0, 1, 2, 3, 4].map((i) => (
                  <circle
                    key={i}
                    data-scene-animated
                    cx={x - 60 + i * 28}
                    cy={220 + (i % 3) * 90}
                    r={i % 2 === 0 ? 1.6 : 1.1}
                    fill={P.mote}
                    style={{
                      animation: `${i % 2 === 0 ? moteKeyA : moteKeyB} ${14 + i * 2}s ease-in-out infinite`,
                      animationDelay: `${i * 1.3}s`,
                    }}
                  />
                ))}
              </g>
            )}
          </g>
        ))}
      </svg>

      {/* Gentle vignette — CSS radial, cheaper than an SVG filter for a static edge darken */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 70% at 50% 55%, transparent 45%, rgba(10,18,14,0.28) 100%)',
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

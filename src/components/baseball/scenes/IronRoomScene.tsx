/**
 * Interior painterly scene — "The Iron Room at Dawn" (docs/baseball/
 * ENTRY_SCENES_DESIGN.md Scene 2). Empty gym, 6 a.m., light shafts through
 * high windows; a barbell on a rack is the still-life center. Reserved for
 * Lift Lab's entry/first-run surface once it has one distinct from the team
 * dashboard shell (currently unwired — see PR description). Same craft DNA
 * as `<YardScene />`: grain recipe, `data-scene-animated` reduced-motion
 * contract, viewBox 1600×900 + preserveAspectRatio slice.
 *
 * `stage` drives the Lift Lab first-run arc ("the bar starts empty → each
 * completed step loads a plate → final step: the green collar clicks on"):
 * 0 = empty bar; 1–3 = that many plates loaded per side; 4/'full' = fully
 * loaded + the green collar (the only saturated accent in the room).
 */
import { SCENE_PALETTE } from './palette';
import type { SceneStage, SceneVariant } from './YardScene';

export interface IronRoomSceneProps {
  className?: string;
  idSuffix?: string;
  stage?: SceneStage;
  variant?: SceneVariant;
}

function stageToNumber(stage: SceneStage): number {
  return stage === 'full' ? 4 : stage;
}

const PLATE_RADII = [30, 24, 18] as const;

export function IronRoomScene({ className, idSuffix = 'iron-room', stage = 'full', variant = 'dawn' }: IronRoomSceneProps) {
  const P = SCENE_PALETTE.ironRoom;
  const stageNum = stageToNumber(stage);
  const platesPerSide = Math.min(stageNum, 3);
  const collarOn = stageNum >= 4;
  const isDawn = variant === 'dawn';

  const roomId = `${idSuffix}-room`;
  const shaftId = `${idSuffix}-shaft`;
  const grainId = `${idSuffix}-grain`;
  const dustKey = `${idSuffix}-dust`;

  const barCx = 1040;
  const barCy = 560;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      <style>{`
        @keyframes ${dustKey} {
          0%, 100% { transform: translate(0, 0); opacity: .12; }
          50% { transform: translate(10px, -26px); opacity: .42; }
        }
      `}</style>
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id={roomId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={P.roomTop} />
            <stop offset="100%" stopColor={P.roomBottom} />
          </linearGradient>
          <linearGradient id={shaftId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={P.window} stopOpacity={isDawn ? 0.16 : 0.08} />
            <stop offset="100%" stopColor={P.window} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Room */}
        <rect width="1600" height="900" fill={`url(#${roomId})`} />

        {/* Floor platform lines */}
        <g stroke={P.floorLine} strokeWidth="2" opacity="0.6">
          <line x1="0" y1="760" x2="1600" y2="760" />
          <line x1="0" y1="820" x2="1600" y2="820" />
          <rect x="140" y="700" width="1320" height="180" fill="none" stroke={P.floorLine} strokeWidth="3" opacity="0.5" />
        </g>

        {/* High windows, upper-left */}
        <g opacity="0.9">
          <rect x="140" y="90" width="60" height="150" rx="4" fill={P.window} opacity="0.1" />
          <rect x="216" y="90" width="60" height="150" rx="4" fill={P.window} opacity="0.1" />
          <rect x="292" y="90" width="60" height="150" rx="4" fill={P.window} opacity="0.1" />
          <g stroke={P.window} strokeWidth="1" opacity="0.18">
            <line x1="140" y1="165" x2="200" y2="165" />
            <line x1="216" y1="165" x2="276" y2="165" />
            <line x1="292" y1="165" x2="352" y2="165" />
          </g>
        </g>

        {/* Volumetric light shafts — angle/intensity eases with `variant`.
            Plain alpha layering (no mix-blend-mode — forces software
            composite on Safari, same perf note as the grain recipe). */}
        <g>
          <polygon points="150,90 260,90 620,900 320,900" fill={`url(#${shaftId})`} />
          <polygon points="260,90 340,90 760,900 500,900" fill={`url(#${shaftId})`} opacity="0.75" />
        </g>

        {/* Chalk dust motes floating inside the light shafts — the living detail */}
        <g opacity="0.9">
          {[0, 1, 2, 3, 4].map((i) => (
            <circle
              key={i}
              data-scene-animated
              cx={260 + i * 70}
              cy={260 + (i % 3) * 140}
              r={i % 2 === 0 ? 1.6 : 1.1}
              fill={P.chalkDust}
              style={{
                animation: `${dustKey} ${16 + i * 2}s ease-in-out infinite`,
                animationDelay: `${i * 1.4}s`,
              }}
            />
          ))}
        </g>

        {/* The barbell on a rack — clean geometric silhouette, center-right */}
        <g>
          {/* Rack uprights */}
          <rect x={barCx - 240} y={barCy - 6} width="10" height="220" fill={P.barSteel} opacity="0.8" />
          <rect x={barCx + 230} y={barCy - 6} width="10" height="220" fill={P.barSteel} opacity="0.8" />
          {/* Bar — a single line */}
          <line x1={barCx - 260} y1={barCy} x2={barCx + 260} y2={barCy} stroke={P.barSteel} strokeWidth="6" strokeLinecap="round" />

          {/* Plates — concentric circles with brass rims, loaded per `stage` */}
          {[-1, 1].map((side) =>
            PLATE_RADII.map((r, i) => {
              const loaded = i < platesPerSide;
              const cx = barCx + side * (60 + i * 22);
              return (
                <g
                  key={`${side}-${i}`}
                  opacity={loaded ? 1 : 0}
                  style={{
                    transform: loaded ? 'translateY(0)' : `translateY(${side * -10}px)`,
                    transition: 'opacity 700ms cubic-bezier(0.22,0.7,0,1), transform 700ms cubic-bezier(0.22,0.7,0,1)',
                  }}
                >
                  <circle cx={cx} cy={barCy} r={r} fill={P.roomBottom} stroke={P.brass} strokeWidth="2.5" />
                  <circle cx={cx} cy={barCy} r={r - 8} fill="none" stroke={P.brass} strokeWidth="1" opacity="0.5" />
                </g>
              );
            })
          )}

          {/* The green collar — the only saturated accent in the room */}
          <g
            opacity={collarOn ? 1 : 0}
            style={{ transition: 'opacity 500ms cubic-bezier(0.22,0.7,0,1)' }}
          >
            <rect x={barCx + 116} y={barCy - 9} width="12" height="18" rx="2" fill={P.collar} />
            <rect x={barCx - 128} y={barCy - 9} width="12" height="18" rx="2" fill={P.collar} />
          </g>
        </g>
      </svg>

      {/* Deep vignette */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 80% 70% at 50% 55%, transparent 35%, rgba(8,7,6,0.42) 100%)',
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

'use client';

import { memo, type RefObject } from 'react';
import { BUNKERS, CLUBHOUSE_FLAG, FAIRWAY, FLAG_FOLD, FLAG_WAVE, PIN, POND, sceneGeometry, type Bunker, type Limb, type Pad } from './scene-geometry';
import { skyAt, tintFor, type Sky } from './scene-sky';

/**
 * The painted course, drawn as separate stacked SVGs instead of one. The
 * design draws everything in one SVG, which makes a phone repaint the whole
 * landscape (blur filters and all) every frame the flag waves or a cloud
 * drifts. Here the still landscape is one layer, painted once per sky; each
 * thing that moves lives on a layer of its own, so a cloud drifting is the
 * compositor moving a bitmap and only the small layers ever repaint.
 *
 *   sky (still) > stars (twinkle) > clouds (drift) > birds (fly) > land (still) > fx (flag, water, oaks, ball)
 *
 * Every layer shares the viewBox and `xMidYMax slice`, so they register. The
 * drawing order matches design/handoff/auth/src/scene.jsx, except that the two
 * oak groups, the pond's shimmer and reeds, and the flag cloth are drawn in
 * `fx` (above the land) because they animate; none of them overlaps anything
 * the design draws after them.
 */

export type SceneCrop = 'wide' | 'tall';

/**
 * The phone's crop centres the hole, rather than the clubhouse. All layers use
 * the same crop so the pin, ball, green and their shadows stay registered.
 */
const VIEWBOX: Record<SceneCrop, string> = { wide: '0 0 1600 1000', tall: '650 0 760 1000' };

interface LayerProps {
  /** The local decimal hour, already quantized by the scene. */
  hour: number;
  crop: SceneCrop;
  /** Unique per scene on the page, so gradient and clip ids never collide. */
  uid: string;
}

const svgProps = (crop: SceneCrop, className: string) => ({
  className: `ch-au-layer ${className}`,
  viewBox: VIEWBOX[crop],
  preserveAspectRatio: 'xMidYMax slice',
  focusable: 'false' as const,
});

function useSky(hour: number) {
  const sky = skyAt(hour);
  return { sky, T: tintFor(sky) };
}

// ── Sky and stars ─────────────────────────────────────────────────────────────

export const SkyLayer = memo(function SkyLayer({ hour, crop, uid }: LayerProps) {
  const { sky: k } = useSky(hour);
  const id = (n: string) => `${uid}-${n}`;
  const u = (n: string) => `url(#${uid}-${n})`;
  return (
    <svg {...svgProps(crop, 'ch-au-layer--sky')}>
      <defs>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="600" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={k.top} />
          <stop offset=".62" stopColor={k.mid} />
          <stop offset="1" stopColor={k.low} />
        </linearGradient>
        <radialGradient id={id('sun')}>
          <stop offset="0" stopColor={k.glow} stopOpacity=".95" />
          <stop offset=".3" stopColor={k.glow} stopOpacity=".42" />
          <stop offset="1" stopColor={k.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('moon')}>
          <stop offset="0" stopColor="#DCE4F4" stopOpacity=".5" />
          <stop offset="1" stopColor="#DCE4F4" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="-200" y="-200" width="2000" height="1400" fill={u('sky')} />
      {k.moon > 0.01 && (
        <g opacity={k.moon}>
          <circle cx={k.moonX} cy={k.moonY} r="110" fill={u('moon')} />
          <mask id={id('moonm')}>
            <circle cx={k.moonX} cy={k.moonY} r="17" fill="#fff" />
            <circle cx={k.moonX + 8} cy={k.moonY - 5} r="15" fill="#000" />
          </mask>
          <circle cx={k.moonX} cy={k.moonY} r="17" fill="#F4F1E4" mask={u('moonm')} />
          <circle cx={k.moonX} cy={k.moonY} r="17" fill="#F4F1E4" opacity=".06" />
        </g>
      )}
      <circle cx={k.sunX} cy={k.sunY} r="520" fill={u('sun')} opacity={k.glowA} />
      <circle cx={k.sunX} cy={k.sunY} r={k.sunR} fill={k.sun} opacity={k.sunA} />
      <circle cx={k.sunX} cy={k.sunY} r={k.sunR * 2.2} fill={k.sun} opacity={k.sunA * 0.18} />
    </svg>
  );
});

export const StarsLayer = memo(function StarsLayer({ hour, crop }: LayerProps) {
  const { sky: k } = useSky(hour);
  if (k.stars <= 0.01) return null;
  const { stars } = sceneGeometry();
  return (
    <svg {...svgProps(crop, 'ch-au-layer--stars')}>
      <g opacity={k.stars}>
        {stars.map(([x, y, r0, t], i) => (
          <circle key={i} cx={x} cy={y} r={r0} fill="#F4F1E4" opacity={0.35 + t * 0.65} className={t > 0.72 ? 'ch-au-tw' : undefined} style={t > 0.72 ? { animationDelay: `${(-t * 4).toFixed(2)}s` } : undefined} />
        ))}
      </g>
    </svg>
  );
});

// ── Clouds and birds: each drifts as a whole layer ────────────────────────────

export const CloudsLayer = memo(function CloudsLayer({ hour, crop, uid }: LayerProps) {
  const { sky: k } = useSky(hour);
  return (
    <svg {...svgProps(crop, 'ch-au-layer--clouds')}>
      <defs>
        <filter id={`${uid}-soft`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <g filter={`url(#${uid}-soft)`} fill={k.cloud} opacity={k.cloudA}>
        <ellipse cx="300" cy="170" rx="260" ry="26" />
        <ellipse cx="520" cy="200" rx="200" ry="16" opacity=".7" />
        <ellipse cx="1080" cy="120" rx="300" ry="22" opacity=".8" />
        <ellipse cx="1400" cy="260" rx="220" ry="18" opacity=".65" />
        <ellipse cx="820" cy="300" rx="160" ry="12" opacity=".55" />
      </g>
    </svg>
  );
});

export const BirdsLayer = memo(function BirdsLayer({ hour, crop }: LayerProps) {
  const { sky: k } = useSky(hour);
  return (
    <svg {...svgProps(crop, 'ch-au-layer--birds')}>
      <g stroke="#4C5A50" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity={0.45 * (1 - k.stars)}>
        <path d="M420 250 q8 -7 16 0 q8 -7 16 0" />
        <path d="M468 276 q6 -5 12 0 q6 -5 12 0" />
      </g>
    </svg>
  );
});

// ── The clubhouse ─────────────────────────────────────────────────────────────

function Clubhouse({ win, lightsOnly, T = (c: string) => c, glow }: { win: number; lightsOnly?: boolean; T?: (c: string) => string; glow: string }) {
  const W = T('#F5F1E6');
  const SH = T('#D9D1BC');
  const ROOF = T('#3E5647');
  const ROOF2 = T('#56705E');
  const SHUT = T('#24503A');
  const GL = T('#3A4943');
  const upX = Array.from({ length: 9 }).map((_, i) => -72 + i * 18);
  const col = Array.from({ length: 13 }).map((_, i) => -84 + i * 14);
  const wingW = [-140, -118, -96];
  const wingE = [96, 118, 140];
  const winRects: number[][] = [
    ...upX.map((x) => [x - 3.5, -70, 7, 12]),
    ...[-77, -49, -21, 21, 49, 77].map((x) => [x - 4, -31, 8, 16]),
    ...wingW.concat(wingE).map((x) => [x - 3.5, -30, 7, 13]),
    [-3.5, -90, 7, 8],
    [-40, -97, 5, 5],
    [35, -97, 5, 5],
  ];
  if (lightsOnly) {
    return (
      <g opacity={win}>
        <g fill="#FFD48A">
          {winRects.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} opacity={i % 5 === 2 ? 0.45 : 1} />
          ))}
        </g>
        <rect x="-88" y="-38" width="176" height="34" fill="#FFC870" opacity=".22" />
        <g fill="#FFE2A8">
          {[-63, -35, -7, 7, 35, 63].map((x) => (
            <circle key={x} cx={x} cy="-35" r="1.4" />
          ))}
        </g>
        <ellipse cx="0" cy="-20" rx="140" ry="36" fill="#FFB855" opacity=".16" filter={glow} />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx="0" cy="3" rx="190" ry="8" fill={T('#1F3A28')} opacity=".35" />
      {[-1, 1].map((sd) => (
        <g key={sd} transform={`scale(${sd} 1)`}>
          <rect x="86" y="-40" width="68" height="40" fill={W} />
          <rect x="86" y="-40" width="68" height="40" fill={SH} opacity=".25" />
          <path d="M82,-40 L96,-54 L150,-54 L158,-40 Z" fill={ROOF} />
          <path d="M96,-54 L150,-54 L151,-52 L95,-52 Z" fill={ROOF2} />
          <rect x="132" y="-62" width="7" height="12" fill={T('#B8AE98')} />
          <rect x="86" y="-4" width="68" height="4" fill={SH} />
        </g>
      ))}
      <rect x="-92" y="-80" width="184" height="80" fill={W} />
      <rect x="-92" y="-42" width="184" height="3" fill={SH} />
      <rect x="-88" y="-38" width="176" height="34" fill={T('#C9C0A8')} />
      <rect x="-88" y="-38" width="176" height="6" fill={T('#A99F88')} opacity=".6" />
      <path d="M-100,-80 L-72,-110 L72,-110 L100,-80 Z" fill={ROOF} />
      <path d="M-72,-110 L72,-110 L74,-107 L-74,-107 Z" fill={ROOF2} />
      <path d="M-100,-80 L100,-80 L100,-78 L-100,-78 Z" fill={T('#2E4236')} />
      <rect x="-62" y="-122" width="8" height="16" fill={T('#B8AE98')} />
      <rect x="54" y="-122" width="8" height="16" fill={T('#B8AE98')} />
      {[-40, 35].map((x) => (
        <g key={x}>
          <path d={`M${x - 7},-94 L${x + 2.5},-104 L${x + 12},-94 Z`} fill={W} />
          <rect x={x - 5} y="-94" width="15" height="8" fill={W} />
        </g>
      ))}
      <path d="M-30,-80 L0,-100 L30,-80 Z" fill={W} />
      <path d="M-30,-80 L0,-100 L30,-80" fill="none" stroke={SH} strokeWidth="1.2" />
      <rect x="-10" y="-126" width="20" height="16" fill={W} />
      <rect x="-10" y="-126" width="20" height="2" fill={SH} />
      <path d="M-13,-126 L0,-140 L13,-126 Z" fill={ROOF} />
      <line x1="0" y1="-140" x2="0" y2="-156" stroke={T('#2E3A32')} strokeWidth="1" />
      <path d="M-6,-152 L6,-152 L3,-154 M6,-152 L3,-150" stroke={T('#2E3A32')} strokeWidth="1" fill="none" />
      {upX.map((x) => (
        <g key={x}>
          <rect x={x - 7.5} y="-71" width="3.5" height="14" fill={SHUT} />
          <rect x={x + 4} y="-71" width="3.5" height="14" fill={SHUT} />
          <rect x={x - 3.5} y="-70" width="7" height="12" fill={GL} />
          <rect x={x - 3.5} y="-64.5" width="7" height=".8" fill={W} opacity=".7" />
        </g>
      ))}
      <rect x="-92" y="-44" width="184" height="2" fill={W} />
      {Array.from({ length: 46 }).map((_, i) => (
        <rect key={i} x={-91 + i * 4} y="-52" width="1" height="8" fill={W} opacity=".9" />
      ))}
      <rect x="-92" y="-53" width="184" height="1.4" fill={W} />
      {[-77, -49, -21, 21, 49, 77].map((x) => (
        <rect key={x} x={x - 4} y="-31" width="8" height="16" fill={GL} />
      ))}
      <rect x="-7" y="-33" width="14" height="29" fill={T('#2C3A34')} />
      <path d="M-7,-33 Q0,-40 7,-33 Z" fill={SH} />
      {col.map((x) => (
        <g key={x}>
          <rect x={x - 1.6} y="-38" width="3.2" height="34" fill={W} />
          <rect x={x + 0.6} y="-38" width="1" height="34" fill={SH} />
        </g>
      ))}
      <rect x="-88" y="-16" width="176" height="1.4" fill={W} />
      {Array.from({ length: 44 }).map((_, i) => (
        <rect key={i} x={-87 + i * 4} y="-15" width=".9" height="11" fill={W} opacity=".85" />
      ))}
      <rect x="-94" y="-4" width="188" height="4" fill={SH} />
      {wingW.concat(wingE).map((x) => (
        <g key={x}>
          <rect x={x - 6.5} y="-31" width="3" height="15" fill={SHUT} />
          <rect x={x + 3.5} y="-31" width="3" height="15" fill={SHUT} />
          <rect x={x - 3.5} y="-30" width="7" height="13" fill={GL} />
        </g>
      ))}
      {[
        [-150, 14],
        [-118, 18],
        [118, 18],
        [150, 14],
      ].map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <line x1="0" y1="0" x2="0" y2="-14" stroke={T('#E9E4D6')} strokeWidth=".9" />
          <path d="M-11,-12 Q0,-22 11,-12 Z" fill={T('#2F6A45')} />
          <path d="M-3.6,-12 Q0,-21.6 3.6,-12 Z" fill={T('#F4F0E4')} />
          <ellipse cx="0" cy="0" rx="6" ry="1.6" fill={T('#EDE8DA')} />
          <ellipse cx="0" cy="2" rx="12" ry="2" fill={T('#1F3A28')} opacity=".25" />
        </g>
      ))}
      <line x1="-178" y1="4" x2="-178" y2="-104" stroke={T('#EDE8DA')} strokeWidth="1.4" />
      <circle cx="-178" cy="-105" r="1.6" fill={T('#EDE8DA')} />
    </g>
  );
}

function Bunkers({ u, id, T }: { u: (n: string) => string; id: (n: string) => string; T: (c: string) => string }) {
  return (
    <>
      {BUNKERS.map((b: Bunker) => (
        <g key={b.id}>
          <path d={b.d} transform="translate(0 -3.5)" fill={T('#3F6B3E')} />
          <path d={b.d} transform="translate(0 2)" fill={T('#A9C987')} opacity=".8" />
          <clipPath id={id(b.id)}>
            <path d={b.d} />
          </clipPath>
          <path d={b.d} fill={u('sand')} />
          <g clipPath={u(b.id)}>
            <path d={b.d} transform="translate(0 -5)" fill="none" stroke={T('#8C7550')} strokeWidth="9" opacity=".32" filter={u('bl3')} />
            {b.rake.map((y, i) => (
              <path key={i} d={`M300,${y} Q800,${y - 5} 1300,${y}`} fill="none" stroke={T('#D9C8A0')} strokeWidth=".9" opacity=".75" />
            ))}
            {b.rake.map((y, i) => (
              <path key={`h${i}`} d={`M300,${y + 1.6} Q800,${y - 3.4} 1300,${y + 1.6}`} fill="none" stroke={T('#FFFBEF')} strokeWidth=".7" opacity=".6" />
            ))}
          </g>
          <path d={b.d} fill="none" stroke={T('#35593A')} strokeWidth=".8" opacity=".5" />
        </g>
      ))}
    </>
  );
}

// ── The still landscape ───────────────────────────────────────────────────────

export const LandLayer = memo(function LandLayer({ hour, crop, uid }: LayerProps) {
  const { sky: k, T } = useSky(hour);
  const G = sceneGeometry();
  const id = (n: string) => `${uid}-${n}`;
  const u = (n: string) => `url(#${uid}-${n})`;
  const shadowDx = Math.max(-80, Math.min(80, (1064 - k.sunX) * 0.1));
  return (
    <svg {...svgProps(crop, 'ch-au-layer--land')}>
      <defs>
        <filter id={id('glow')} x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
        <linearGradient id={id('haze')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={k.haze} stopOpacity="0" />
          <stop offset=".6" stopColor={k.haze} stopOpacity=".7" />
          <stop offset="1" stopColor={k.haze} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id('ground')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T('#7E9F5E')} />
          <stop offset=".45" stopColor={T('#5E8748')} />
          <stop offset="1" stopColor={T('#3C6634')} />
        </linearGradient>
        <linearGradient id={id('fw')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T('#B7CE89')} />
          <stop offset="1" stopColor={T('#86AC5F')} />
        </linearGradient>
        <radialGradient id={id('green')} cx=".42" cy=".38" r=".7">
          <stop offset="0" stopColor={T('#CBE39A')} />
          <stop offset=".7" stopColor={T('#A6C979')} />
          <stop offset="1" stopColor={T('#93BA69')} />
        </radialGradient>
        <linearGradient id={id('pond')} x1="0" y1="696" x2="0" y2="748" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={T('#24443A')} />
          <stop offset=".35" stopColor={T('#3B625B')} />
          <stop offset=".75" stopColor={T('#5F8B84')} />
          <stop offset="1" stopColor={T('#4E7770')} />
        </linearGradient>
        <filter id={id('bl3')} x="-10%" y="-40%" width="120%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <clipPath id={id('pondc')}>
          <path d={POND} />
        </clipPath>
        <linearGradient id={id('sand')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={T('#C6B083')} />
          <stop offset=".4" stopColor={T('#EADFC0')} />
          <stop offset="1" stopColor={T('#F6EFD9')} />
        </linearGradient>
        <clipPath id={id('fwc')}>
          <path d={FAIRWAY} />
        </clipPath>
        <filter id={id('sh')} x="-10%" y="-20%" width="120%" height="140%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <path d="M-50,548 C160,520 330,536 520,522 C720,508 900,530 1100,516 C1300,504 1460,526 1650,512 L1650,590 L-50,590 Z" fill={T(k.far)} opacity=".55" />
      <g fill={T(k.far)} opacity=".9">
        {G.far.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <rect x="-50" y="520" width="1700" height="70" fill={u('haze')} />
      <g opacity=".85">
        {G.back.map((t, i) => (
          <g key={i}>
            <path d={`M${t.x},${t.base} L${t.x + t.lean},${t.top + 10}`} stroke={T('#58675A')} strokeWidth={t.w * 0.8} />
            {t.tiers.map((q, j) => (
              <g key={j}>
                <path d={q.d} fill={T('#557A60')} />
                <path d={q.lit} fill={T('#7A9A7C')} opacity=".6" />
              </g>
            ))}
          </g>
        ))}
      </g>
      <path d={G.mass} fill={T('#2F5A40')} />
      <g fill={T('#46714E')} opacity=".8">
        {G.mlit.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <g>
        {G.front.map((t, i) => (
          <g key={i}>
            <path d={`M${t.x},${t.base} L${t.x + t.lean},${t.top + 14}`} stroke={T('#3A3226')} strokeWidth={t.w} />
            {t.tiers.map((q, j) => (
              <g key={j}>
                <path d={q.d} fill={j % 2 ? T('#24472F') : T('#2B5237')} />
                <path d={q.lit} fill={T('#4F7B52')} opacity=".75" />
              </g>
            ))}
          </g>
        ))}
      </g>
      <path d="M-50,586 C200,580 400,592 640,586 C900,580 1200,594 1650,584 L1650,606 L-50,606 Z" fill={T('#2B4F37')} />
      <g transform="translate(560 604) scale(1.36)">
        <Clubhouse win={0} T={T} glow={u('glow')} />
      </g>
      <path d="M-50,604 C240,592 520,606 820,598 C1100,590 1380,604 1650,596 L1650,1000 L-50,1000 Z" fill={u('ground')} />
      <path d="M-50,604 C240,592 520,606 820,598 C1100,590 1380,604 1650,596 L1650,622 C1380,630 1100,616 820,624 C520,632 240,618 -50,630 Z" fill={T('#20402A')} opacity=".25" />
      <path d="M-50,640 C200,620 420,650 640,632 L640,660 C420,680 200,650 -50,672 Z" fill={T('#6E9452')} opacity=".5" />
      <g fill={T('#F7F1E3')} opacity=".85">
        {G.bloom.map(([x, y, s], i) => (
          <circle key={i} cx={x} cy={y} r={s} />
        ))}
      </g>
      <path d={FAIRWAY} fill={u('fw')} />
      <g clipPath={u('fwc')} fill={T('#3E6A38')} opacity=".13">
        {G.stripes.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      <path d="M-60,1000 C200,870 520,770 820,698 C900,680 980,664 1040,660 C1110,656 1170,664 1196,676 C1260,720 1370,860 1520,1000" fill="none" stroke={T('#E4EDBF')} strokeWidth="1.4" opacity=".55" />
      <g>
        <path d={POND} transform="translate(0 5)" fill={T('#9CC074')} opacity=".9" />
        <path d={POND} transform="translate(0 1.4)" fill={T('#4A6440')} />
        <path d={POND} fill={u('pond')} />
        <g clipPath={u('pondc')}>
          <path d="M470,704 C520,712 560,700 600,710 C650,716 690,702 740,710 C790,716 830,704 870,712 L870,690 L470,690 Z" fill={T('#1E3A2A')} opacity=".55" filter={u('bl3')} />
          <g fill={T('#2A4A33')} opacity=".35" filter={u('bl3')}>
            <ellipse cx="560" cy="712" rx="44" ry="6" />
            <ellipse cx="700" cy="710" rx="60" ry="5" />
            <ellipse cx="820" cy="714" rx="30" ry="5" />
          </g>
          <ellipse cx="660" cy="738" rx="170" ry="9" fill={k.mid} opacity=".4" filter={u('bl3')} />
        </g>
        <path d="M486,716 C530,700 640,693 742,697 C804,700 846,708 856,719" fill="none" stroke={T('#28452F')} strokeWidth="1.4" opacity=".7" />
      </g>
      <ellipse cx="1050" cy="668" rx="158" ry="18" fill={T('#28482A')} opacity=".28" />
      <ellipse cx="1040" cy="654" rx="140" ry="27" fill={T('#83AE5E')} />
      <ellipse cx="1040" cy="652" rx="124" ry="21" fill={u('green')} />
      <path d="M932,650 Q1040,640 1150,652 M944,660 Q1040,652 1140,662" stroke={T('#D8EAB0')} strokeWidth="3" fill="none" opacity=".35" />
      <Bunkers u={u} id={id} T={T} />
      <path d="M1500,720 C1300,760 1000,850 780,940 L860,1000 C1080,900 1360,800 1600,760 Z" fill={T('#1F3A22')} opacity=".2" filter={u('sh')} />
      <path d="M1600,860 C1420,880 1260,930 1120,1000 L1600,1000 Z" fill={T('#1F3A22')} opacity=".22" filter={u('sh')} />
      <g transform={`translate(${PIN.x} ${PIN.y})`}>
        <line x1="0" y1="0" x2={shadowDx} y2="10" stroke={T('#2A4A2A')} strokeWidth="2" opacity={0.32 * (1 - k.ambA)} strokeLinecap="round" />
        <ellipse cx="0" cy="0" rx="6" ry="2.2" fill={T('#1B2A1B')} />
        <line x1="0" y1="0" x2="0" y2="-104" stroke={T('#F4F1E8')} strokeWidth="2.6" strokeLinecap="round" />
        <line x1=".9" y1="-2" x2=".9" y2="-102" stroke={T('#B9B2A1')} strokeWidth=".9" />
        <circle cx="0" cy="-105" r="2.2" fill={T('#E9E3D2')} />
      </g>
      <g transform="translate(560 604) scale(1.36)">
        <Clubhouse win={k.win} lightsOnly glow={u('glow')} />
      </g>
    </svg>
  );
});

// ── The things that move inside the scene ─────────────────────────────────────

export interface FxRefs {
  ball: RefObject<SVGCircleElement | null>;
  shadow: RefObject<SVGEllipseElement | null>;
}

export const FxLayer = memo(function FxLayer({ hour, crop, uid, ball, shadow }: LayerProps & FxRefs) {
  const { T } = useSky(hour);
  const G = sceneGeometry();
  const id = (n: string) => `${uid}-${n}`;
  const u = (n: string) => `url(#${uid}-${n})`;
  return (
    <svg {...svgProps(crop, 'ch-au-layer--fx')}>
      <defs>
        <linearGradient id={id('flag')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={T('#8E1D17')} />
          <stop offset=".3" stopColor={T('#C23A2B')} />
          <stop offset=".62" stopColor={T('#A42A20')} />
          <stop offset="1" stopColor={T('#C8412F')} />
          <animateTransform attributeName="gradientTransform" type="translate" values="-.25 0;.25 0;-.25 0" dur="1.9s" repeatCount="indefinite" />
        </linearGradient>
        <clipPath id={id('pondfx')}>
          <path d={POND} />
        </clipPath>
      </defs>
      <g className="ch-au-oak ch-au-oak--l">
        {G.oakL.map((q, i) => (
          <path key={i} d={q.d} fill={i % 3 ? T('#3F6B46') : T('#355E3E')} />
        ))}
        {G.oakL.map((q, i) => (
          <path key={`l${i}`} d={q.lit} fill={T('#7AA064')} opacity=".6" />
        ))}
      </g>
      <g className="ch-au-oak ch-au-oak--r">
        {G.oakR.map((q, i) => (
          <path key={i} d={q.d} fill={i % 3 ? T('#3B6543') : T('#325A3B')} />
        ))}
        {G.oakR.map((q, i) => (
          <path key={`l${i}`} d={q.lit} fill={T('#80A767')} opacity=".6" />
        ))}
      </g>
      <g clipPath={u('pondfx')}>
        <g className="ch-au-shim" stroke={T('#FBF8EE')} strokeLinecap="round">
          <line x1="560" y1="727" x2="612" y2="727" strokeWidth="1.3" />
          <line x1="660" y1="733" x2="742" y2="733" strokeWidth="1.5" />
          <line x1="520" y1="738" x2="548" y2="738" strokeWidth="1.1" />
          <line x1="770" y1="724" x2="806" y2="724" strokeWidth="1" />
        </g>
      </g>
      <g stroke={T('#4E6B3A')} strokeWidth="1.3" strokeLinecap="round" className="ch-au-reeds">
        {G.reeds.map(([a, b, c], i) => {
          const x = 470 + a * 34;
          const h = 10 + b * 16;
          return <path key={i} d={`M${x.toFixed(1)},${(740 - c * 6).toFixed(1)} q${(b * 4 - 1).toFixed(1)},${(-h / 2).toFixed(1)} ${(b * 6 - 2).toFixed(1)},${(-h).toFixed(1)}`} fill="none" opacity={0.6 + c * 0.4} />;
        })}
      </g>
      <g transform="translate(560 604) scale(1.36)">
        <path fill={T('#1F6B45')}>
          <animate attributeName="d" dur="2.6s" repeatCount="indefinite" values={CLUBHOUSE_FLAG} />
        </path>
      </g>
      <g transform={`translate(${PIN.x + 1} ${PIN.y - 104})`}>
        <path fill={u('flag')}>
          <animate attributeName="d" dur="1.9s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values={FLAG_WAVE} />
        </path>
        <path fill="#FFFFFF" opacity=".16">
          <animate attributeName="d" dur="1.9s" repeatCount="indefinite" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values={FLAG_FOLD} />
        </path>
      </g>
      <ellipse ref={shadow} fill="#1B331D" style={{ opacity: 0 }} />
      <circle ref={ball} fill="#FFFFFF" stroke="#C9C2B0" strokeWidth=".6" style={{ opacity: 0 }} />
    </svg>
  );
});

// ── The foreground pine and the bough: camera-out as one, sway on their own ───

function LimbPads({ limbs, extra, T, lit }: { limbs: Limb[]; extra?: Pad[]; T: (c: string) => string; lit: number }) {
  const pads = [...limbs.flatMap((l) => l.pads), ...(extra ?? [])];
  return (
    <>
      {pads.map((q, i) => (
        <g key={i}>
          <path d={q.under} fill={T('#12281A')} opacity=".85" />
          <path d={q.d} fill={T(q.t > 0.5 ? '#1C3A27' : '#21422D')} />
          <path d={q.lit} fill={T('#3E6C47')} opacity={lit + q.t * 0.3} />
        </g>
      ))}
    </>
  );
}

export const PineLayer = memo(function PineLayer({ hour }: { hour: number }) {
  const { T } = useSky(hour);
  const G = sceneGeometry();
  const box = { viewBox: '0 0 560 1000', overflow: 'visible', preserveAspectRatio: 'xMinYMax meet', focusable: 'false' as const };
  return (
    <div className="ch-au-pine">
      <svg className="ch-au-pine__trunk" {...box}>
        <path d="M60,1000 C68,720 86,420 104,-40 L118,-40 C108,420 100,720 100,1000 Z" fill={T('#2B231A')} />
        <path d="M112,-30 C104,420 98,720 96,1000" stroke={T('#7A6547')} strokeWidth="2" fill="none" opacity=".45" />
        <path d="M0,930 C80,900 180,910 260,950 C320,980 360,990 420,1000 L0,1000 Z" fill={T('#2E5530')} />
      </svg>
      <svg className="ch-au-pine__canopy ch-au-sway" {...box}>
        {G.pine.map((l, i) => (
          <path key={`b${i}`} d={l.d} stroke={T('#2B231A')} strokeWidth={l.w} fill="none" strokeLinecap="round" />
        ))}
        <LimbPads limbs={G.pine} extra={G.pineTop} T={T} lit={0.55} />
      </svg>
    </div>
  );
});

export const BoughLayer = memo(function BoughLayer({ hour }: { hour: number }) {
  const { T } = useSky(hour);
  const G = sceneGeometry();
  return (
    <div className="ch-au-bough">
      <svg className="ch-au-sway ch-au-sway--bough" viewBox="0 0 520 300" overflow="visible" preserveAspectRatio="xMaxYMin meet" focusable="false">
        {G.bough.map((l, i) => (
          <path key={`b${i}`} d={l.d} stroke={T('#2B231A')} strokeWidth={l.w + 1} fill="none" strokeLinecap="round" />
        ))}
        <LimbPads limbs={G.bough} T={T} lit={0.5} />
      </svg>
    </div>
  );
});

export const GrainLayer = memo(function GrainLayer({ uid }: { uid: string }) {
  return (
    <svg className="ch-au-grain" preserveAspectRatio="none" focusable="false">
      <filter id={`${uid}-grain`}>
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${uid}-grain)`} />
    </svg>
  );
});

export type { Sky };

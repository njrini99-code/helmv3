'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayHoleHero  (PREMIUM HOLE COCKPIT)
 * ----------------------------------------------------------------------------
 * A minimal, glassy top-down hole rendered left → right (tee left, pin right)
 * on a helm-green turf cockpit, fused with the distance readout. All viewports.
 *
 * Geometry: each recorded shot's landing is reconstructed by intersecting two
 * circles — `shotDistance` from the prior lie and `distanceToHoleAfter` around
 * the pin — with the miss choosing the side. A dot marks every landing; the
 * current ball (glossy) sits at the latest and animates to each new lie.
 * Lateral + along-line share one yards→px scale, so angles are true.
 *
 * Brand: the putting green uses the LOCKED helm green (#16A34A). The card carries
 * a subtle glass sheen (user-requested — a deliberate exception to the otherwise
 * matte Fairway system). PRESENTATION ONLY.
 * ========================================================================== */

import type { ShotRecord, RoundHole } from '@/lib/types/golf';

const HELM_GREEN = '#16A34A';

/** Ball/landing ring tint per lie. */
const LIE_RING: Record<string, string> = {
  tee: '#cbb892',
  fairway: '#4ade80',
  rough: '#3f8a63',
  sand: '#e8d9a6',
  green: '#34d17a',
  other: '#cfcac3',
};

type Pt = { x: number; y: number };

const toYd = (v: number, unit: 'yards' | 'feet') => (unit === 'feet' ? v / 3 : v);

function missSide(s: ShotRecord): number {
  const m = `${s.missDirection ?? ''} ${s.approachMissDirection ?? ''}`.toLowerCase();
  if (m.includes('left')) return -1;
  if (m.includes('right')) return 1;
  return 0;
}

function intersect(c0: Pt, r0: number, c1: Pt, r1: number, side: number): Pt | null {
  const dx = c1.x - c0.x;
  const dy = c1.y - c0.y;
  const d = Math.hypot(dx, dy);
  if (d === 0 || d > r0 + r1 || d < Math.abs(r0 - r1)) return null;
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d);
  const h2 = r0 * r0 - a * a;
  if (h2 < 0) return null;
  const h = Math.sqrt(h2);
  const xm = c0.x + (a * dx) / d;
  const ym = c0.y + (a * dy) / d;
  const ox = (-dy / d) * h;
  const oy = (dx / d) * h;
  const s1 = { x: xm + ox, y: ym + oy };
  const s2 = { x: xm - ox, y: ym - oy };
  if (side > 0) return s1.y >= s2.y ? s1 : s2;
  if (side < 0) return s1.y <= s2.y ? s1 : s2;
  return Math.abs(s1.y) <= Math.abs(s2.y) ? s1 : s2;
}

function buildPath(shots: ShotRecord[], L: number): Pt[] {
  const pin: Pt = { x: L, y: 0 };
  const pts: Pt[] = [{ x: 0, y: 0 }];
  let prev: Pt = { x: 0, y: 0 };
  for (const s of shots) {
    if (s.isPenalty) continue;
    const dAfter = toYd(s.distanceToHoleAfter ?? 0, s.distanceUnitAfter ?? 'yards');
    const sd = s.shotDistance ?? 0;
    const sol = intersect(prev, sd, pin, dAfter, missSide(s));
    const next = sol ?? { x: Math.max(0, Math.min(L, L - dAfter)), y: missSide(s) * Math.min(sd * 0.12, 24) };
    pts.push(next);
    prev = next;
  }
  return pts;
}

function HoleViz({
  currentHole,
  shotHistory,
  currentLie,
}: {
  currentHole: RoundHole;
  shotHistory: ShotRecord[];
  currentLie: string;
}) {
  const L = currentHole.yardage || 1;
  const TEE_X = 20;
  const PIN_X = 300;
  const MID_Y = 52;
  const MIN_Y = 14;
  const MAX_Y = 90;
  const scale = (PIN_X - TEE_X) / L;

  const ring = LIE_RING[currentLie] ?? LIE_RING.fairway!;
  const pathYd = buildPath(shotHistory, L);
  const mapX = (xYd: number) => TEE_X + xYd * scale;
  const mapY = (yYd: number) => Math.max(MIN_Y, Math.min(MAX_Y, MID_Y + yYd * scale));
  const svgPts = pathYd.map((p) => ({ x: mapX(p.x), y: mapY(p.y) }));
  const ball = svgPts[svgPts.length - 1] ?? { x: TEE_X, y: MID_Y };
  const landings = svgPts.slice(1, -1); // intermediate shot landings (tee + ball excluded)
  const trail = svgPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg viewBox="0 0 320 104" className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="fwGreen" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#34d17a" />
          <stop offset="60%" stopColor={HELM_GREEN} />
          <stop offset="100%" stopColor="#0f7a37" />
        </radialGradient>
        <linearGradient id="fwGreenGloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="fwBall" cx="34%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d6dbd6" />
        </radialGradient>
      </defs>

      {/* Fairway corridor — translucent helm green lane */}
      <line x1={TEE_X} y1={MID_Y} x2={PIN_X} y2={MID_Y} stroke={HELM_GREEN} strokeOpacity="0.26" strokeWidth="42" strokeLinecap="round" />
      <line x1={TEE_X} y1={MID_Y} x2={PIN_X} y2={MID_Y} stroke="#ffffff" strokeOpacity="0.05" strokeWidth="42" strokeLinecap="round" />

      {/* Green — helm green, glassy */}
      <ellipse cx={PIN_X} cy={MID_Y} rx="17" ry="24" fill="url(#fwGreen)" />
      <ellipse cx={PIN_X} cy={MID_Y} rx="17" ry="24" fill="url(#fwGreenGloss)" />
      <ellipse cx={PIN_X} cy={MID_Y} rx="17" ry="24" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.8" />

      {/* Pin */}
      <line x1={PIN_X} y1={MID_Y} x2={PIN_X} y2={MID_Y - 22} stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1.2" strokeLinecap="round" />
      <path d={`M${PIN_X},${MID_Y - 22} L${PIN_X + 10},${MID_Y - 19} L${PIN_X},${MID_Y - 16} Z`} fill="#e0563b" />
      <circle cx={PIN_X} cy={MID_Y} r="1.8" fill="#0a1410" />

      {/* Tee */}
      <circle cx={TEE_X} cy={MID_Y} r="2.6" fill="#cbb892" />

      {/* Shot trail */}
      {svgPts.length > 1 && (
        <polyline points={trail} fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0.5 4" />
      )}

      {/* Landing dots — where the ball came to rest each shot */}
      {landings.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.2" fill="#ffffff" opacity="0.92" />
          <circle cx={p.x} cy={p.y} r="3.2" fill="none" stroke={LIE_RING.fairway} strokeWidth="1" strokeOpacity="0.7" />
        </g>
      ))}

      {/* Current ball — glassy, animates to each new lie */}
      <g style={{ transform: `translate(${ball.x.toFixed(1)}px, ${ball.y.toFixed(1)}px)`, transition: 'transform 600ms cubic-bezier(0.22,1,0.36,1)' }}>
        <circle r="7" fill={ring} opacity="0.22" />
        <circle r="3.6" fill="url(#fwBall)" stroke={ring} strokeWidth="1.1" />
        <circle cx="-1" cy="-1" r="1.05" fill="#ffffff" opacity="0.9" />
      </g>
    </svg>
  );
}

export function FairwayHoleHero({
  currentHole,
  isHoleComplete,
  shotHistory,
  shotHistoryLength,
  puttCount,
  holeScore,
  currentShot,
  shotTypeLabel,
  currentLie,
  displayDistance,
  displayUnit,
}: FairwayHoleHeroProps) {
  const lieLabel = currentLie.charAt(0).toUpperCase() + currentLie.slice(1);
  const subtitle = isHoleComplete
    ? `${shotHistoryLength} shots${puttCount > 0 ? ` · ${puttCount} putts` : ''}`
    : `Shot ${currentShot} · ${shotTypeLabel}${shotTypeLabel.toLowerCase() === currentLie.toLowerCase() ? '' : ` · ${lieLabel}`}`;

  return (
    <div
      className="relative overflow-hidden rounded-card shadow-soft ring-1 ring-inset ring-white/10"
      style={{ background: 'linear-gradient(157deg, #0c2a1e 0%, #114030 100%)' }}
    >
      {/* glass sheen + soft brand glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 38%)' }} />
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full" style={{ background: 'radial-gradient(circle, rgba(52,209,122,0.20) 0%, transparent 70%)' }} />

      {/* header row */}
      <div className="relative flex items-end justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-fw-display text-h2 font-light tracking-[-0.02em] text-white">Hole {currentHole.number}</h2>
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-white/65">
              Par {currentHole.par}
            </span>
          </div>
          <p className="mt-1 font-fw-sans text-body-sm text-white/55">{subtitle}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-1.5">
            <span className="font-fw-display text-display font-light leading-none tabular-nums text-white">
              {isHoleComplete ? holeScore : displayDistance}
            </span>
            <span className="font-fw-sans text-eyebrow font-medium uppercase tracking-wider text-white/50">
              {isHoleComplete ? 'score' : displayUnit === 'yards' ? 'yds' : 'ft'}
            </span>
          </div>
          {!isHoleComplete && <p className="font-fw-sans text-eyebrow uppercase tracking-wider text-white/40">to pin</p>}
        </div>
      </div>

      {/* the hole, left → right */}
      <div className="relative mt-1 h-[112px] w-full px-2 pb-2">
        <HoleViz currentHole={currentHole} shotHistory={shotHistory} currentLie={currentLie} />
      </div>
    </div>
  );
}

interface FairwayHoleHeroProps {
  currentHole: RoundHole;
  isHoleComplete: boolean;
  shotHistory: ShotRecord[];
  shotHistoryLength: number;
  puttCount: number;
  holeScore: number;
  currentShot: number;
  shotTypeLabel: string;
  currentLie: string;
  missDirection: string | null;
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  progressPercent: number;
  displayDistance: number;
  displayUnit: 'yards' | 'feet';
}

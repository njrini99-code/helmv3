'use client';

/**
 * ============================================================================
 * Fairway · Rounds · Tracking — FairwayHoleHero  (LIGHT HOLE COCKPIT)
 * ----------------------------------------------------------------------------
 * The hole context instrument that sits above the live shot-entry panel. It is
 * a calm LIGHT Fairway surface (warm cream card on the canvas), NOT a dark
 * garish gradient — the dark band fought the light body and the labels collided
 * with the flyover art. The redesign separates the two concerns cleanly:
 *
 *   1. HEADER ROW (light) — Hole N · Par chip · subtitle on the left, the big
 *      distance / score readout on the right. Plain Fairway text tokens on the
 *      cream surface; nothing is overlaid on the art, so nothing can collide.
 *
 *   2. FLYOVER BAND (the only green) — a single rounded inset that holds the
 *      top-down hole, tee → pin, on a soft helm-green turf. It owns a fixed,
 *      comfortable WIDE aspect (the natural shape of a left→right hole), so the
 *      trees, shot dots and pin always have room and never crush. The wide
 *      viewBox is rendered into a wide band — never squeezed into a tall column.
 *
 * Geometry (unchanged): each recorded shot's landing is reconstructed by
 * intersecting two circles — `shotDistance` from the prior lie and
 * `distanceToHoleAfter` around the pin — with the miss choosing the side. A dot
 * marks every landing; the current ball sits at the latest and animates to each
 * new lie. Lateral + along-line share one yards→px scale, so angles are true.
 *
 * Brand: the turf uses the LOCKED helm green (#16A34A). PRESENTATION ONLY — the
 * geometry, props and data contract are untouched.
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

/**
 * The top-down hole. Rendered into a WIDE band (viewBox 0 0 320 120, ~8:3) on a
 * soft helm-green turf. The band is the ONLY green; it owns its own fixed aspect
 * so the corridor + green + dots never crush regardless of the card's width.
 */
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
  const TEE_X = 24;
  const PIN_X = 296;
  const MID_Y = 60;
  const MIN_Y = 18;
  const MAX_Y = 102;
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
    <svg
      viewBox="0 0 320 120"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        {/* soft turf wash — calm, not garish */}
        <linearGradient id="fwTurf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a6e44" />
          <stop offset="100%" stopColor="#0f5a36" />
        </linearGradient>
        <radialGradient id="fwGreen" cx="50%" cy="42%" r="62%">
          <stop offset="0%" stopColor="#3fd585" />
          <stop offset="62%" stopColor={HELM_GREEN} />
          <stop offset="100%" stopColor="#0e7034" />
        </radialGradient>
        <radialGradient id="fwBall" cx="34%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dfe4df" />
        </radialGradient>
      </defs>

      {/* turf backdrop */}
      <rect x="0" y="0" width="320" height="120" fill="url(#fwTurf)" rx="0" />

      {/* Fairway corridor — a lighter mown lane down the middle */}
      <line x1={TEE_X} y1={MID_Y} x2={PIN_X} y2={MID_Y} stroke="#2e9b63" strokeOpacity="0.55" strokeWidth="44" strokeLinecap="round" />
      <line x1={TEE_X} y1={MID_Y} x2={PIN_X} y2={MID_Y} stroke="#ffffff" strokeOpacity="0.05" strokeWidth="44" strokeLinecap="round" />

      {/* Green — helm green putting surface */}
      <ellipse cx={PIN_X} cy={MID_Y} rx="19" ry="27" fill="url(#fwGreen)" />
      <ellipse cx={PIN_X} cy={MID_Y} rx="19" ry="27" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.8" />

      {/* Pin */}
      <line x1={PIN_X} y1={MID_Y} x2={PIN_X} y2={MID_Y - 25} stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.3" strokeLinecap="round" />
      <path d={`M${PIN_X},${MID_Y - 25} L${PIN_X + 11},${MID_Y - 21} L${PIN_X},${MID_Y - 17} Z`} fill="#e0563b" />
      <circle cx={PIN_X} cy={MID_Y} r="2" fill="#0a1410" />

      {/* Tee */}
      <circle cx={TEE_X} cy={MID_Y} r="3" fill="#d8c79e" />
      <circle cx={TEE_X} cy={MID_Y} r="3" fill="none" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="0.8" />

      {/* Shot trail */}
      {svgPts.length > 1 && (
        <polyline points={trail} fill="none" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0.5 4.5" />
      )}

      {/* Landing dots — where the ball came to rest each shot */}
      {landings.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.4" fill="#ffffff" opacity="0.94" />
          <circle cx={p.x} cy={p.y} r="3.4" fill="none" stroke={LIE_RING.fairway} strokeWidth="1" strokeOpacity="0.7" />
        </g>
      ))}

      {/* Current ball — glassy, animates to each new lie */}
      <g style={{ transform: `translate(${ball.x.toFixed(1)}px, ${ball.y.toFixed(1)}px)`, transition: 'transform 600ms cubic-bezier(0.22,1,0.36,1)' }}>
        <circle r="8" fill={ring} opacity="0.24" />
        <circle r="4" fill="url(#fwBall)" stroke={ring} strokeWidth="1.2" />
        <circle cx="-1.1" cy="-1.1" r="1.1" fill="#ffffff" opacity="0.9" />
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
    <section
      aria-label={`Hole ${currentHole.number}, par ${currentHole.par}`}
      className="overflow-hidden rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]"
    >
      {/* ── Header row (LIGHT) — labels live here, never on the art ───────────── */}
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-fw-display text-h2 font-semibold tracking-[-0.018em] text-text-primary">
              Hole {currentHole.number}
            </h2>
            <span className="rounded-fw-sm bg-surface-sunken px-2 py-0.5 font-fw-sans text-eyebrow font-semibold uppercase tracking-wider text-text-secondary">
              Par {currentHole.par}
            </span>
          </div>
          <p className="mt-1.5 truncate font-fw-sans text-body-sm text-text-tertiary">{subtitle}</p>
        </div>

        <div className="flex-shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-1.5">
            <span className="font-fw-display text-display font-semibold leading-none tabular-nums text-text-primary sm:text-stat-lg">
              {isHoleComplete ? holeScore : displayDistance}
            </span>
            <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-wider text-text-tertiary">
              {isHoleComplete ? 'score' : displayUnit === 'yards' ? 'yds' : 'ft'}
            </span>
          </div>
          {!isHoleComplete && (
            <p className="mt-0.5 font-fw-sans text-eyebrow uppercase tracking-wider text-text-tertiary">to pin</p>
          )}
        </div>
      </div>

      {/* ── Flyover band (the ONLY green) — owns a fixed wide aspect so the
            corridor, dots and green never crush. Inset rounded so it reads as a
            contained instrument, not a full-bleed dark slab. ──────────────────── */}
      <div className="px-3 pb-3 pt-4">
        <div className="aspect-[8/3] w-full overflow-hidden rounded-fw-md ring-1 ring-inset ring-black/10">
          <HoleViz currentHole={currentHole} shotHistory={shotHistory} currentLie={currentLie} />
        </div>
      </div>
    </section>
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

/**
 * ClimbArc — the Development "Climb" (spec §6 P2 #8; replaces "no plan yet").
 *
 * A season progress arc on PAPER (not clay — this is the athlete's own cover
 * story, not the analytics desk). One tracked skill (exit velo, K-rate, a
 * composite…) draws as a `<Trace>` filling a smooth arc across the season, with:
 *   • a faint "then" GHOST trace at the start (where the season began),
 *   • a bright, glowing "now" head at the latest reading,
 *   • the single best day pinned in `--sodium` as a PR marker,
 *   • an optional coach `goal` as a target tick line.
 * The live current value rides a {@link StatReadout} in the header so it rolls on
 * the odometer and flashes sodium the day it becomes a personal record.
 *
 * ┌─ COORDINATE CONTRACT ─────────────────────────────────────────────────────┐
 * │ `points` are an ORDERED season series (oldest → newest); index is the       │
 * │ x-axis (evenly spaced), `value` is the y-axis. The plot auto-scales to the  │
 * │ value range (plus any `goal`) so a feed hands raw values in — no            │
 * │ pre-normalising. Higher `value` sits higher on the arc.                     │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Composition only — no hooks. `<Trace>` / `<StatReadout>` own their client
 * boundaries + the reduced-motion contract. Fewer than 2 points → an honest
 * {@link EditorsLetter} ("not enough data yet"), never a fabricated curve.
 */
import { cn } from '@/lib/utils';
import { EditorsLetter } from '../EditorsLetter';
import { Eyebrow } from '../Eyebrow';
import { formatRate } from '../format';
import { PaperCard } from '../PaperCard';
import { StatReadout } from '../StatReadout';
import { Trace } from '../Trace';

export interface ClimbPoint {
  /** Optional axis label for this reading (e.g. a date). */
  label?: string;
  /** The tracked value. */
  value: number;
}

export interface ClimbArcProps {
  /** Ordered season series (oldest → newest). Fewer than 2 → honest empty. */
  points: ClimbPoint[];
  /** Coach-assigned target — shown as a tick line across the arc. */
  goal?: number;
  /** Small-caps unit for the readout + goal caption (e.g. `MPH`, `%`). */
  unit?: string;
  /** Eyebrow title above the arc. */
  title?: string;
  /** Lane ink for the climb stroke (default team green). */
  ink?: 'team';
  /**
   * Decimal places for the readout / PR / goal captions. When omitted, derives
   * from the series: an all-integer series gets 0; a series with any
   * non-integer reading gets 3 when its magnitude is small (< 10 — a
   * batting-average-style rate, where `.250` vs `.300` is the whole point) or
   * 1 otherwise (e.g. an exit-velo-style reading). A caller with a known
   * house style (e.g. AVG) should still pass this explicitly.
   */
  decimals?: number;
  /**
   * Signature line under the "not enough data yet" honest-empty state (e.g.
   * `— My Development`). `ClimbArc` is shared across multiple features, so
   * there is no correct default — omit for no signoff.
   */
  signoff?: string;
  className?: string;
}

// ── Frame geometry (SVG user units; the caller owns the viewBox) ──────────────
const VBW = 340;
const VBH = 180;
const PAD = { l: 18, r: 18, t: 22, b: 26 };
const PLOT_W = VBW - PAD.l - PAD.r;
const PLOT_H = VBH - PAD.t - PAD.b;

interface PlotPoint {
  x: number;
  y: number;
  value: number;
  label?: string;
}

/** Smooth curve through points via quadratic midpoint interpolation. */
function smoothPath(pts: PlotPoint[]): string {
  const first = pts[0];
  if (!first) return '';
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;
  let prev = first;
  for (let i = 1; i < pts.length; i += 1) {
    const cur = pts[i];
    if (!cur) continue;
    const midX = (prev.x + cur.x) / 2;
    const midY = (prev.y + cur.y) / 2;
    d += ` Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${midX.toFixed(2)} ${midY.toFixed(2)}`;
    prev = cur;
  }
  return `${d} L ${prev.x.toFixed(2)} ${prev.y.toFixed(2)}`;
}

/** A round-cap dot (a near-zero-length subpath renders as a filled circle). */
function dotPath(px: number, py: number): string {
  return `M ${px.toFixed(2)} ${py.toFixed(2)} l 0.01 0`;
}

function pct(coord: number, span: number): string {
  return `${(coord / span) * 100}%`;
}

export function ClimbArc({
  points,
  goal,
  unit,
  title,
  ink = 'team',
  decimals: decimalsProp,
  signoff,
  className,
}: ClimbArcProps) {
  if (points.length < 2) {
    return (
      <EditorsLetter
        className={className}
        live
        title="Not enough data yet"
        body="The Climb draws itself once a couple of readings are on the record — then every session adds to the arc, with the best day pinned as a personal record."
        signoff={signoff}
      />
    );
  }

  const values = points.map((p) => p.value);
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (typeof goal === 'number') {
    lo = Math.min(lo, goal);
    hi = Math.max(hi, goal);
  }
  if (hi === lo) {
    // Flat series — give the arc a little air so it doesn't sit on the floor.
    hi = lo + 1;
    lo -= 1;
  } else {
    const airspace = (hi - lo) * 0.12;
    lo -= airspace;
    hi += airspace;
  }

  const n = points.length;
  const xAt = (i: number): number => PAD.l + (i / (n - 1)) * PLOT_W;
  const yAt = (v: number): number => PAD.t + (1 - (v - lo) / (hi - lo)) * PLOT_H;

  const pts: PlotPoint[] = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value), value: p.value, label: p.label }));

  let bestIdx = 0;
  let bestVal = -Infinity;
  values.forEach((v, i) => {
    if (v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  });
  const lastIdx = n - 1;
  const nowIsPeak = bestIdx === lastIdx;

  // Precision: an explicit `decimals` prop wins. Otherwise derive from the
  // series itself — a batting-average-style rate (small magnitude, non-integer
  // readings) needs 3 decimals or `.250` vs `.300` reads as the same number;
  // an integer series (counts, lb) stays at 0.
  const magnitude = Math.max(...values.map((v) => Math.abs(v)));
  const decimals =
    typeof decimalsProp === 'number'
      ? decimalsProp
      : values.some((v) => !Number.isInteger(v))
        ? magnitude < 10
          ? 3
          : 1
        : 0;
  // House style (formatRate): drop the leading zero once the series is a
  // sub-1 rate (`.250`, not `0.250`). Gated on `decimals > 0` so a caller can
  // never trip `formatRate`'s own decimals=0 edge case (it collapses `0` to
  // an empty string) — an integer series never qualifies.
  const dropLeadingZero = decimals > 0 && magnitude < 1;
  const fmt = (v: number): string => (dropLeadingZero ? formatRate(v, decimals) : v.toFixed(decimals));

  // The faint "then" ghost — the opening stretch of the season, drawn behind.
  const ghostCut = Math.max(2, Math.ceil(n * 0.35));
  const ghostPts = pts.slice(0, ghostCut);

  const now = pts[lastIdx];
  const best = pts[bestIdx];
  const start = pts[0];
  // Unreachable given the `points.length < 2` guard above; narrows for TS
  // under noUncheckedIndexedAccess without a non-null assertion.
  if (!now || !best || !start) return null;

  const goalValue = typeof goal === 'number' ? goal : null;
  const goalY = goalValue !== null ? yAt(goalValue) : null;

  return (
    <PaperCard className={cn('p-5', className)}>
      {/* Header — title + the live current reading (odometer + PR flash). */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          {title ? <Eyebrow>{title}</Eyebrow> : null}
          <span className="text-microlabel font-medium uppercase tracking-[0.14em] text-text-tertiary">Season climb</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-microlabel font-semibold uppercase tracking-[0.14em] text-grade-plus">Now</span>
          {dropLeadingZero ? (
            // A sub-1 rate (AVG-style): render the house-style formatted
            // string (leading zero dropped) — a static figure, matching how
            // every other rate stat on the Living Annual kit displays.
            <StatReadout
              value={fmt(now.value)}
              emphasis
              pr={nowIsPeak}
              className="text-h1 leading-none"
              ariaLabel={title ?? 'current value'}
            />
          ) : (
            <StatReadout
              value={now.value}
              decimals={decimals}
              emphasis
              pr={nowIsPeak}
              className="text-h1 leading-none"
              ariaLabel={title ?? 'current value'}
            />
          )}
          {unit ? (
            <span className="font-annual text-caption uppercase tracking-[0.12em] text-text-tertiary">{unit}</span>
          ) : null}
        </div>
      </div>

      {/* The arc */}
      <div className="relative mt-3 aspect-[340/180] w-full">
        <svg viewBox={`0 0 ${VBW} ${VBH}`} className="absolute inset-0 h-full w-full" aria-hidden>
          {/* Goal target tick — a dashed team hairline across the plot. */}
          {goalY !== null ? (
            <line
              x1={PAD.l}
              y1={goalY}
              x2={VBW - PAD.r}
              y2={goalY}
              strokeWidth={1.25}
              strokeDasharray="4 4"
              opacity={0.5}
              style={{ stroke: 'var(--grade-plus)' }}
            />
          ) : null}

          {/* "Then" ghost — the opening stretch, faint + static, drawn behind. */}
          <Trace d={smoothPath(ghostPts)} ink={ink} weight={2} animate={false} className="opacity-25" />

          {/* The climb — the signature filling arc. */}
          <Trace d={smoothPath(pts)} ink={ink} weight={2.6} glow />

          {/* Start dot ("then" anchor). */}
          <Trace d={dotPath(start.x, start.y)} ink={ink} weight={5} animate={false} className="opacity-40" />

          {/* PR marker — the best day, pinned in sodium (skip if it IS "now"). */}
          {nowIsPeak ? null : <Trace d={dotPath(best.x, best.y)} ink="sodium" weight={7} glow />}

          {/* "Now" head — bright + glowing; sodium when the latest is the PR. */}
          <Trace d={dotPath(now.x, now.y)} ink={nowIsPeak ? 'sodium' : ink} weight={7} glow />
        </svg>

        {/* Overlay captions — small-caps, pinned to their marks. */}
        <span
          className="pointer-events-none absolute -translate-y-full text-microbadge font-semibold uppercase tracking-[0.14em] text-text-tertiary"
          style={{ left: pct(start.x, VBW), top: pct(start.y, VBH) }}
        >
          Then
        </span>
        {nowIsPeak ? null : (
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full font-annual text-microbadge font-semibold uppercase tracking-[0.14em]"
            style={{ left: pct(best.x, VBW), top: pct(best.y, VBH), color: 'var(--sodium)' }}
          >
            PR <span className="tabular-nums">{fmt(best.value)}</span>
          </span>
        )}
        {goalY !== null && goalValue !== null ? (
          <span
            className="pointer-events-none absolute right-0 -translate-y-1/2 font-annual text-microbadge font-semibold uppercase tracking-[0.14em] text-grade-plus"
            style={{ top: pct(goalY, VBH) }}
          >
            Goal <span className="tabular-nums">{fmt(goalValue)}</span>
            {unit ? ` ${unit}` : ''}
          </span>
        ) : null}
      </div>

      {/* Axis — first + last labels. */}
      {start.label || now.label ? (
        <div className="mt-1 flex items-center justify-between font-annual text-microbadge font-medium uppercase tracking-[0.14em] text-text-tertiary">
          <span>{start.label ?? ''}</span>
          <span>{now.label ?? ''}</span>
        </div>
      ) : null}
    </PaperCard>
  );
}

'use client';

/**
 * Putting: "How putts miss".
 *
 * Make % for the length band (and any break × slope filter), the 3-putt rate
 * on first putts, a band picker, the misses placed around the hole, the four
 * miss tiles, and make % by break and slope.
 *
 * Each placed miss is honest on both axes: its distance from the hole is the
 * MEASURED leave (the next putt's length) and its direction is the TAGGED
 * side / depth. Low side sits left of the hole, high side right, short toward
 * the golfer (bottom) and long past the hole (top); a two-tag miss sits on
 * the diagonal and a one-tag miss on its axis. Misses without a tag, or
 * without a recorded leave, are counted in the caption instead of guessed.
 */
import { useId, useMemo, useState } from 'react';
import { EmptyState, PressTarget } from '@/components/fairway';
import { SegmentedPill, TRACK_SUNKEN_SHADOW } from '@/components/fairway/controls/segmented';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import {
  PUTT_BANDS,
  PUTT_BREAKS,
  PUTT_SLOPES,
  inRounds,
  puttSummary,
  puttsIn,
  type PuttBandId,
} from '@/lib/golf/team-intelligence/aggregate';
import type { PuttBreak, PuttShot, PuttSlope } from '@/lib/golf/team-intelligence/types';
import { formatPct, type CauseProps } from '../shared';

/** Below this many putts a figure is shown but not judged. */
const LOW_N = 8;

const MISS_FILL = 'var(--fw-color-text-secondary)';
const THREE_PUTT_FILL = 'var(--fw-viz-div-neg)';

/** Turf, mixed from the accent token so the green follows light and dark. */
const TURF = 'color-mix(in oklab, var(--fw-color-accent-500) 30%, var(--fw-color-surface-sunken))';
const TURF_HI = 'color-mix(in oklab, var(--fw-color-accent-500) 20%, var(--fw-color-surface))';
/** Ring and axis lines: primary ink at low strength, dark on light turf and light on dark turf. */
const TURF_LINE = 'color-mix(in oklab, var(--fw-color-text-primary) 24%, transparent)';
/** The dominant miss direction's half of the green. */
const LEAN_FILL = 'color-mix(in oklab, var(--fw-viz-div-neg) 16%, transparent)';

const TINT = {
  lossStrong: 'color-mix(in oklab, var(--fw-viz-div-neg) 24%, var(--fw-color-surface-sunken))',
  loss: 'color-mix(in oklab, var(--fw-viz-div-neg) 12%, var(--fw-color-surface-sunken))',
  gain: 'color-mix(in oklab, var(--fw-viz-div-pos) 16%, var(--fw-color-surface-sunken))',
} as const;

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

type BandSel = PuttBandId | 'all';
type Direction = 'low' | 'high' | 'short' | 'long';

const PILL =
  'inline-flex items-center whitespace-nowrap rounded-full bg-surface-sunken px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums text-text-secondary';

function pointGap(value: number | null, ref: number | null): number | null {
  return value == null || ref == null ? null : Math.round(value) - Math.round(ref);
}

function cellTint(gap: number | null): string | undefined {
  if (gap == null) return undefined;
  if (gap <= -8) return TINT.lossStrong;
  if (gap <= -3) return TINT.loss;
  if (gap >= 5) return TINT.gain;
  return undefined;
}

// ---------------------------------------------------------------------------
// The green
// ---------------------------------------------------------------------------

const G = { w: 300, h: 232, cx: 150, cy: 116, pxPerFt: 21, rings: 4, beyond: 9 } as const;
const OUTER = G.pxPerFt * G.rings;

interface GreenDot {
  key: number;
  x: number;
  y: number;
  threePutt: boolean;
}

/**
 * Place each tagged miss at radius = its leave (clamped just past the 4 ft
 * ring) along the tagged direction. Misses that would overlap slide along
 * the tangent in alternating steps (0, +1, −1, +2 …), so the layout is
 * deterministic and a miss never leaves its direction.
 */
function placeMisses(misses: readonly { p: PuttShot; key: number }[], r: number): GreenDot[] {
  const ordered = [...misses].sort(
    (a, b) =>
      (a.p.side ?? '').localeCompare(b.p.side ?? '') ||
      (a.p.depth ?? '').localeCompare(b.p.depth ?? '') ||
      (a.p.leaveFeet ?? 0) - (b.p.leaveFeet ?? 0) ||
      a.key - b.key,
  );
  const out: GreenDot[] = [];
  const gap = 2 * r + 1;
  for (const { p, key } of ordered) {
    const dx = p.side === 'low' ? -1 : p.side === 'high' ? 1 : 0;
    const dy = p.depth === 'long' ? -1 : p.depth === 'short' ? 1 : 0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const leave = Math.max(0, p.leaveFeet ?? 0);
    const radius = leave > G.rings ? OUTER + G.beyond : Math.max(r + 6, leave * G.pxPerFt);
    let best = { x: G.cx + ux * radius, y: G.cy + uy * radius };
    for (let step = 0; step < 13; step += 1) {
      const t = step === 0 ? 0 : Math.ceil(step / 2) * (step % 2 === 1 ? 1 : -1) * gap;
      const cand = { x: G.cx + ux * radius - uy * t, y: G.cy + uy * radius + ux * t };
      if (out.every((d) => Math.hypot(d.x - cand.x, d.y - cand.y) >= gap - 0.5)) {
        best = cand;
        break;
      }
    }
    out.push({
      key,
      x: Math.min(G.w - r - 2, Math.max(r + 2, best.x)),
      y: Math.min(G.h - r - 2, Math.max(r + 2, best.y)),
      threePutt: p.first && p.threePutt,
    });
  }
  return out;
}

const LEAN_RECT: Record<Direction, [number, number, number, number]> = {
  low: [6, 6, G.cx - 6, G.h - 12],
  high: [G.cx, 6, G.w - G.cx - 6, G.h - 12],
  long: [6, 6, G.w - 12, G.cy - 6],
  short: [6, G.cy, G.w - 12, G.h - G.cy - 6],
};

function MissGreen({
  dots,
  r,
  lean,
  label,
}: {
  dots: readonly GreenDot[];
  r: number;
  lean: Direction | null;
  label: string;
}) {
  const gradientId = `putt-green-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const ringLabel = (i: number) => {
    // Along the upper right, between the long axis and the long / high
    // diagonal, where no miss is ever placed.
    const radius = i * G.pxPerFt;
    const a = (-67.5 * Math.PI) / 180;
    return { x: G.cx + Math.cos(a) * radius + 3, y: G.cy + Math.sin(a) * radius - 2 };
  };
  const halo = { stroke: TURF, fill: 'var(--fw-color-text-secondary)' };
  const leanRect = lean ? LEAN_RECT[lean] : null;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${G.w} ${G.h}`}
      className="block h-auto w-full max-w-[21.25rem] font-fw-sans"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="50%" r="60%">
          <stop offset="0%" style={{ stopColor: TURF_HI }} />
          <stop offset="100%" style={{ stopColor: TURF }} />
        </radialGradient>
      </defs>
      <rect width={G.w} height={G.h} rx={16} fill={`url(#${gradientId})`} />
      {leanRect ? (
        <rect x={leanRect[0]} y={leanRect[1]} width={leanRect[2]} height={leanRect[3]} rx={10} style={{ fill: LEAN_FILL }} />
      ) : null}
      <g fill="none" strokeDasharray="2 3" style={{ stroke: TURF_LINE }}>
        {[1, 2, 3, 4].map((i) => (
          <circle key={i} cx={G.cx} cy={G.cy} r={i * G.pxPerFt} />
        ))}
      </g>
      <g style={{ stroke: TURF_LINE }}>
        <line x1={G.cx} x2={G.cx} y1={18} y2={G.h - 18} />
        <line x1={58} x2={G.w - 58} y1={G.cy} y2={G.cy} />
      </g>
      <g fontSize={11} paintOrder="stroke" strokeWidth={3} strokeLinejoin="round" style={halo}>
        {[1, 2, 3, 4].map((i) => {
          const p = ringLabel(i);
          return (
            <text key={i} x={p.x} y={p.y}>
              {i === G.rings ? '4+ ft' : `${i} ft`}
            </text>
          );
        })}
      </g>
      {dots.map((d) => (
        <circle
          key={d.key}
          cx={d.x}
          cy={d.y}
          r={r}
          strokeWidth={1}
          style={{ fill: d.threePutt ? THREE_PUTT_FILL : MISS_FILL, stroke: 'var(--fw-color-surface)' }}
        />
      ))}
      <circle cx={G.cx} cy={G.cy} r={5} strokeWidth={1.5} style={{ fill: 'var(--fw-color-warm-950)', stroke: 'var(--fw-color-surface)' }} />
      <g fontSize={11} fontWeight={600} paintOrder="stroke" strokeWidth={3} strokeLinejoin="round" style={halo}>
        <text x={G.cx} y={13} textAnchor="middle">
          Long
        </text>
        <text x={G.cx} y={G.h - 5} textAnchor="middle">
          Short
        </text>
        <text x={6} y={G.cy - 8}>
          Low side
        </text>
        <text x={G.w - 6} y={G.cy - 8} textAnchor="end">
          High side
        </text>
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function PuttCause({ data, allowed, playerId, playerName, className }: CauseProps) {
  const [band, setBand] = useState<BandSel>('all');
  const [brk, setBrk] = useState<PuttBreak | 'all'>('all');
  const [slope, setSlope] = useState<PuttSlope | 'all'>('all');
  const headingId = useId();
  const pillId = `putt-band-${useId()}`;
  const reduceMotion = useReducedMotionGuard();
  const isPlayer = playerId != null;

  const read = useMemo(() => {
    const slice = inRounds(data.putts, allowed, data.rounds, playerId);
    const filtered = puttsIn(slice, band, brk, slope);
    const summary = puttSummary(filtered);
    const inBand = puttsIn(slice, band);
    const bandMake = puttSummary(inBand).makePct;
    const bands = [{ id: 'all' as const, label: 'All' }, ...PUTT_BANDS].map((b) => {
      const sub = puttsIn(slice, b.id, brk, slope);
      return { id: b.id as BandSel, label: b.label, n: sub.length, make: puttSummary(sub).makePct };
    });
    const cells = PUTT_SLOPES.map((s) =>
      PUTT_BREAKS.map((k) => {
        const sub = puttsIn(slice, band, k.id, s.id);
        const make = puttSummary(sub).makePct;
        return { slope: s, brk: k, n: sub.length, make, gap: sub.length >= LOW_N ? pointGap(make, bandMake) : null };
      }),
    );

    // Misses, their tags and leaves.
    const index = new Map(data.putts.map((p, i) => [p, i] as const));
    const misses = filtered.filter((p) => !p.made);
    const tagged = misses.filter((p) => p.side || p.depth);
    const placed = tagged.filter((p) => p.leaveFeet != null).map((p) => ({ p, key: index.get(p) ?? 0 }));
    const sided = misses.filter((p) => p.side);
    const depthed = misses.filter((p) => p.depth);
    const tiles: { dir: Direction; label: string; pct: number | null; count: number; of: number }[] = [
      { dir: 'low', label: 'Low side', pct: summary.lowPct, count: sided.filter((p) => p.side === 'low').length, of: sided.length },
      { dir: 'high', label: 'High side', pct: summary.highPct, count: sided.filter((p) => p.side === 'high').length, of: sided.length },
      { dir: 'short', label: 'Short', pct: summary.shortPct, count: depthed.filter((p) => p.depth === 'short').length, of: depthed.length },
      { dir: 'long', label: 'Long', pct: summary.longPct, count: depthed.filter((p) => p.depth === 'long').length, of: depthed.length },
    ];
    const ranked = tiles.filter((t) => t.pct != null).sort((a, b) => b.pct! - a.pct!);
    const lean =
      ranked.length > 0 && (ranked.length === 1 || Math.round(ranked[0]!.pct!) > Math.round(ranked[1]!.pct!))
        ? ranked[0]!.dir
        : null;

    return {
      total: slice.length,
      summary,
      firsts: filtered.filter((p) => p.first).length,
      bands,
      cells,
      bandMake,
      gridUntagged: inBand.filter((p) => !p.brk || !p.slope).length,
      under3: puttsIn(slice, 'all', brk, slope).filter((p) => p.feet < PUTT_BANDS[0].min).length,
      misses: misses.length,
      placed,
      untagged: misses.length - tagged.length,
      noLeave: tagged.length - placed.length,
      threePutts: placed.filter(({ p }) => p.first && p.threePutt).length,
      tiles,
      lean,
    };
  }, [data, allowed, playerId, band, brk, slope]);

  const { summary } = read;
  const who = playerName ?? (isPlayer ? 'Player' : 'Whole team');
  const bandLabel = band === 'all' ? null : `${PUTT_BANDS.find((b) => b.id === band)?.label ?? ''} ft`;
  const filterLabel =
    brk === 'all' && slope === 'all'
      ? null
      : [PUTT_SLOPES.find((s) => s.id === slope)?.label, PUTT_BREAKS.find((k) => k.id === brk)?.label.toLowerCase()]
          .filter(Boolean)
          .join(', ');
  const overline = [who, `${summary.n} ${plural(summary.n, 'putt')}`, bandLabel, filterLabel].filter(Boolean).join(' · ');

  const pills: string[] = [];
  if (summary.n === 0) pills.push('No putts');
  else {
    pills.push(read.firsts === 0 ? 'No first putts' : `3-putt ${formatPct(summary.threePuttPct)}`);
    if (summary.n < LOW_N) pills.push(`Low sample · ${summary.n} ${plural(summary.n, 'putt')}`);
  }

  const dotR = isPlayer ? 3.75 : 3.25;
  const dots = useMemo(() => placeMisses(read.placed, dotR), [read.placed, dotR]);
  const filtering = brk !== 'all' || slope !== 'all';

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={headingId} className="font-fw-display text-h3 font-semibold text-text-primary">
          How putts miss
        </h3>
        <p className="truncate font-fw-sans text-caption text-text-tertiary">{overline}</p>
      </div>
      {read.total > 0 ? (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            data-figure=""
            className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary"
          >
            {formatPct(summary.makePct)}
          </span>
          <span className="font-fw-sans text-caption text-text-tertiary">made</span>
          <span className="flex flex-col items-end gap-1">
            {pills.map((p) => (
              <span key={p} className={PILL}>
                {p}
              </span>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  );

  if (read.total === 0) {
    return (
      <section
        aria-labelledby={headingId}
        className={cn(
          'flex min-w-0 flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
          className,
        )}
      >
        {header}
        <EmptyState
          variant="subtle"
          title="No putts in this slice"
          description="No tracked putts in these rounds yet. They show up here once rounds are logged shot by shot."
        />
      </section>
    );
  }

  const leanTile = read.tiles.find((t) => t.dir === read.lean);
  const greenLabel =
    read.placed.length === 0
      ? 'No misses to place around the hole.'
      : `Missed putts around the hole: ${read.placed.length} placed by measured leave and tagged side${
          leanTile ? `; ${formatPct(leanTile.pct)} of tagged misses finish ${leanTile.dir === 'low' || leanTile.dir === 'high' ? `on the ${leanTile.label.toLowerCase()}` : leanTile.label.toLowerCase()}` : ''
        }. ${read.threePutts} led to a 3-putt.`;
  const unplaced = [
    read.untagged > 0 ? `${read.untagged} untagged ${plural(read.untagged, 'miss', 'misses')}` : null,
    read.noLeave > 0 ? `${read.noLeave} with no leave recorded` : null,
  ].filter(Boolean);

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-card border border-border-subtle bg-surface p-4 [container-type:inline-size] sm:p-5',
        className,
      )}
    >
      {header}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Make % by length</h4>
          <span className="font-fw-sans text-caption text-text-tertiary">Feet</span>
        </div>
        <div
          role="group"
          aria-label="Putt length"
          className="grid grid-cols-[3.5rem_repeat(3,minmax(0,1fr))] gap-1 rounded-fw-md border border-border-control bg-surface-sunken p-1 [@container(min-width:460px)]:grid-cols-[repeat(7,minmax(0,1fr))]"
          style={{ boxShadow: TRACK_SUNKEN_SHADOW }}
        >
          {read.bands.map((b, i) => {
            const on = band === b.id;
            const blocked = b.n === 0 && !on;
            return (
              <PressTarget
                key={b.id}
                haptic={!blocked}
                aria-pressed={on}
                aria-disabled={blocked || undefined}
                aria-label={`${b.id === 'all' ? 'All lengths' : `${b.label} ft`}: ${
                  b.n === 0 ? 'no putts' : `${formatPct(b.make)} made, ${b.n} ${plural(b.n, 'putt')}`
                }`}
                onClick={() => {
                  if (!blocked) setBand(on && b.id !== 'all' ? 'all' : b.id);
                }}
                className={cn(
                  'relative isolate flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-fw-sm px-1 py-1.5 font-fw-sans text-caption tabular-nums',
                  i === 0 && 'row-span-2 [@container(min-width:460px)]:row-span-1',
                  on
                    ? 'font-semibold text-text-on-accent-fill dark:text-accent-ink'
                    : 'text-text-primary hover:bg-surface',
                  blocked && 'cursor-default',
                )}
              >
                {on ? <SegmentedPill layoutId={reduceMotion ? undefined : pillId} reduceMotion={reduceMotion} /> : null}
                <span className="font-semibold">{b.label}</span>
                <span className={cn(!on && 'text-text-tertiary')}>{b.n === 0 ? '—' : formatPct(b.make)}</span>
              </PressTarget>
            );
          })}
        </div>
        {band === 'all' && read.under3 > 0 ? (
          <p className="font-fw-sans text-caption text-text-tertiary">
            {`All includes ${read.under3} ${plural(read.under3, 'putt')} inside 3 ft.`}
          </p>
        ) : null}
      </div>

      {summary.n === 0 ? (
        <p className="rounded-fw-md bg-surface-sunken px-3 py-4 text-center font-fw-sans text-body-sm text-text-secondary">
          No putts match this filter.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 items-center gap-4 [@container(min-width:640px)]:grid-cols-[minmax(0,18.75rem)_minmax(0,1fr)]">
            <div className="flex justify-center">
              <MissGreen dots={dots} r={dotR} lean={read.lean} label={greenLabel} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {read.tiles.map((t) => {
                const dom = t.dir === read.lean;
                return (
                  <div
                    key={t.dir}
                    className={cn(
                      'flex min-w-0 flex-col gap-1.5 rounded-fw-md border p-3',
                      dom ? 'border-fw-warning-ring bg-fw-warning-bg' : 'border-border-subtle bg-surface-sunken',
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-fw-sans text-caption font-medium text-text-secondary">{t.label}</span>
                      <span className="font-fw-sans text-body font-semibold tabular-nums text-text-primary">
                        {formatPct(t.pct)}
                      </span>
                    </span>
                    <span aria-hidden className="block h-1 rounded-full bg-surface">
                      {t.pct != null ? (
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, Math.max(0, t.pct))}%`,
                            background: dom ? THREE_PUTT_FILL : 'var(--fw-color-warm-400)',
                          }}
                        />
                      ) : null}
                    </span>
                    <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                      {t.of > 0 ? `${t.count} of ${t.of} tagged` : 'No tags'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: MISS_FILL }} />
              Missed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: THREE_PUTT_FILL }} />
              Led to a 3-putt
            </span>
          </div>
          <p className="font-fw-sans text-caption text-text-tertiary">
            {read.misses === 0
              ? 'No misses in this slice.'
              : `Leave is measured (the next putt's length); direction is the tagged side.${
                  unplaced.length ? ` Not placed: ${unplaced.join(' and ')}.` : ''
                }`}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Make % by break and slope</h4>
          <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">
            {filtering ? 'Tap again to clear' : 'Tap to filter'}
          </span>
        </div>
        <div
          role="group"
          aria-label="Make % by break and slope"
          className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] gap-1.5 [@container(min-width:480px)]:grid-cols-[6rem_repeat(3,minmax(0,1fr))]"
        >
          <span aria-hidden />
          {PUTT_BREAKS.map((k) => (
            <span
              key={k.id}
              className="flex items-end justify-center pb-1 text-center font-fw-sans text-caption leading-tight text-text-tertiary"
            >
              {k.label}
            </span>
          ))}
          {read.cells.map((row, si) => {
            const s = PUTT_SLOPES[si]!;
            return [
              <span
                key={`${s.id}-label`}
                className="flex items-center font-fw-sans text-caption font-medium text-text-secondary [@container(min-width:480px)]:text-body-sm"
              >
                {s.label}
              </span>,
              ...row.map((c) => {
                const on = brk === c.brk.id && slope === c.slope.id;
                const blocked = c.n === 0 && !on;
                const thin = c.n < LOW_N;
                const tint = cellTint(c.gap);
                return (
                  <PressTarget
                    key={`${s.id}-${c.brk.id}`}
                    haptic={!blocked}
                    aria-pressed={on}
                    aria-disabled={blocked || undefined}
                    aria-label={`${c.slope.label}, ${c.brk.label.toLowerCase()}: ${
                      c.n === 0
                        ? 'no putts'
                        : `${formatPct(c.make)} made, ${c.n} ${plural(c.n, 'putt')}${thin ? ', low sample' : ''}`
                    }`}
                    onClick={() => {
                      if (blocked) return;
                      if (on) {
                        setBrk('all');
                        setSlope('all');
                      } else {
                        setBrk(c.brk.id);
                        setSlope(c.slope.id);
                      }
                    }}
                    className={cn(
                      'flex min-h-14 min-w-0 flex-col items-start justify-center gap-0.5 rounded-fw-md px-2.5 py-2 text-left',
                      !tint && 'bg-surface-sunken',
                      on ? 'ring-2 ring-text-primary' : 'ring-1 ring-border-subtle',
                      blocked && 'cursor-default',
                    )}
                    style={tint ? { background: tint } : undefined}
                  >
                    <span
                      className={cn(
                        'font-fw-sans text-body font-semibold leading-tight tabular-nums',
                        thin ? 'text-text-tertiary' : 'text-text-primary',
                      )}
                    >
                      {c.n === 0 ? '—' : formatPct(c.make)}
                    </span>
                    <span className="font-fw-sans text-caption leading-tight tabular-nums text-text-tertiary">
                      {c.n === 0 ? (
                        'no putts'
                      ) : thin ? (
                        <>
                          <span className="whitespace-nowrap">{c.n} ·</span>{' '}
                          <span className="whitespace-nowrap">low sample</span>
                        </>
                      ) : (
                        `${c.n} putts`
                      )}
                    </span>
                  </PressTarget>
                );
              }),
            ];
          })}
        </div>
        <p className="font-fw-sans text-caption text-text-tertiary">
          {`Shaded against ${band === 'all' ? 'all putts' : bandLabel}, ${formatPct(read.bandMake)} made.`}
          {read.gridUntagged > 0
            ? ` ${read.gridUntagged} ${plural(read.gridUntagged, 'putt')} without a break and slope tag ${
                read.gridUntagged === 1 ? "isn't" : "aren't"
              } in the grid.`
            : ''}
        </p>
      </div>
    </section>
  );
}

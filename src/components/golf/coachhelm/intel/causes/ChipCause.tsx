'use client';

/**
 * Around the green: "Where scrambles are lost".
 *
 * Up-and-down rate for the slice, a lie × distance grid that filters the
 * read, and where the first chips finished (a beeswarm of leaves, 0 to 20+ ft).
 *
 * There is no college baseline in the data, so nothing here invents one. A
 * player is read against the whole team (the same lie and distance), and the
 * whole team against its own overall rate. The card covers chips from inside
 * 30 yd (the grid's range) so the headline, grid and swarm always reconcile;
 * anything longer is counted in a footnote.
 */
import { Fragment, useId, useLayoutEffect, useMemo, useState } from 'react';
import { EmptyState, PressTarget } from '@/components/fairway';
import { cn } from '@/lib/utils';
import {
  CHIP_BANDS,
  CHIP_LIES,
  approachSummary,
  chipSummary,
  chipsIn,
  inRounds,
  type ChipBandId,
} from '@/lib/golf/team-intelligence/aggregate';
import type { ChipLie, ChipShot } from '@/lib/golf/team-intelligence/types';
import { formatPct, type CauseProps } from '../shared';

/** Below this many chips a figure is shown but not judged. */
const LOW_N = 5;
/** The grid's reach: chips from this far or more are outside the card. */
const GRID_MAX_YD = Math.max(...CHIP_BANDS.map((b) => b.max));

const SAVED_FILL = 'var(--fw-viz-div-pos)';
const MISSED_FILL = 'var(--fw-viz-div-neg)';

/** Cell tints: amber for chips lost against the reference, green when ahead.
 *  Mixed from tokens so both themes follow. */
const TINT = {
  lossStrong: 'color-mix(in oklab, var(--fw-viz-div-neg) 24%, var(--fw-color-surface-sunken))',
  loss: 'color-mix(in oklab, var(--fw-viz-div-neg) 12%, var(--fw-color-surface-sunken))',
  gain: 'color-mix(in oklab, var(--fw-viz-div-pos) 16%, var(--fw-color-surface-sunken))',
} as const;

/** Lie swatches (decorative). */
const LIE_SWATCH: Record<ChipLie, string> = {
  fairway: 'color-mix(in oklab, var(--fw-color-accent-500) 70%, var(--fw-color-surface))',
  rough: 'color-mix(in oklab, var(--fw-color-accent-500) 45%, var(--fw-color-warm-600))',
  sand: 'color-mix(in oklab, var(--fw-color-warning) 60%, var(--fw-color-surface))',
};

/** Make zone band in the swarm (0–4 ft). */
const ZONE_FILL = 'color-mix(in oklab, var(--fw-color-accent-500) 14%, var(--fw-color-surface))';

const FEET = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const feet = (v: number) => `${FEET.format(v)} ft`;
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

type Tone = 'neutral' | 'loss' | 'gain';
const PILL_TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  loss: 'bg-fw-warning-bg text-fw-warning-ink',
  gain: 'bg-accent-wash text-accent-ink',
};
const PILL =
  'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-fw-sans text-caption font-semibold tabular-nums';

function upAndDown(shots: readonly ChipShot[]): number | null {
  return shots.length ? (shots.filter((s) => s.saved).length / shots.length) * 100 : null;
}

/** Gap in whole points between two DISPLAYED percentages, so the words and
 *  the figures on screen always agree. */
function pointGap(value: number | null, ref: number | null): number | null {
  return value == null || ref == null ? null : Math.round(value) - Math.round(ref);
}

function cellTint(gap: number | null): string | undefined {
  if (gap == null) return undefined;
  if (gap <= -15) return TINT.lossStrong;
  if (gap <= -5) return TINT.loss;
  if (gap >= 5) return TINT.gain;
  return undefined;
}

function headlinePill(n: number, gap: number | null): { text: string; tone: Tone } | null {
  if (n === 0) return { text: 'No chips', tone: 'neutral' };
  if (n < LOW_N) return { text: `Low sample · ${n} ${plural(n, 'chip')}`, tone: 'neutral' };
  if (gap == null) return null;
  if (gap === 0) return { text: 'Level with team', tone: 'neutral' };
  const pts = `${Math.abs(gap)} ${plural(Math.abs(gap), 'pt')}`;
  return {
    text: `${pts} ${gap < 0 ? 'below' : 'above'} team`,
    tone: gap <= -3 ? 'loss' : gap >= 3 ? 'gain' : 'neutral',
  };
}

/** "Misses mostly short · 63% of 8 tagged", from the chips' tagged misses;
 *  null without five tagged misses or a clear lean. */
function missLean(shots: readonly ChipShot[]): string | null {
  const s = approachSummary(shots);
  if (s.missed < LOW_N) return null;
  const ranked = (['short', 'long', 'left', 'right'] as const)
    .map((k) => ({ k, n: s.misses[k] }))
    .sort((a, b) => b.n - a.n);
  const top = ranked[0]!;
  if (top.n === ranked[1]!.n || top.n * 2 < s.missed) return null;
  return `Misses mostly ${top.k} · ${formatPct((top.n / s.missed) * 100)} of ${s.missed} tagged`;
}

// ---------------------------------------------------------------------------
// Beeswarm of first-chip leaves
// ---------------------------------------------------------------------------

const MAX_FT = 20;
const ZONE_FT = 4;
const SW = {
  padX: 12,
  medianY: 12,
  bandTop: 20,
  zoneLabelY: 33,
  dotsTop: 40,
  minPlot: 44,
  maxPlot: 120,
  labelGap: 17,
  bottomPad: 4,
} as const;
const TICKS = [0, 5, 10, 15, 20] as const;

interface SwarmDot {
  key: number;
  cx: number;
  cy: number;
  r: number;
  saved: boolean;
}

/**
 * Columns are laid out per make zone (4 ft), so the zone's edge always falls
 * on a column boundary. Dots stack saved-first, shortest-first; when the
 * tallest stack will not fit, the dots shrink (down to r 2) and after that the
 * chart grows taller. Dots are never clamped onto each other.
 */
function layoutSwarm(leaves: readonly { feet: number; saved: boolean }[], width: number, baseR: number) {
  const plotW = Math.max(120, width - SW.padX * 2);
  const zoneW = (plotW * ZONE_FT) / MAX_FT;
  const order = leaves
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => Number(b.saved) - Number(a.saved) || a.feet - b.feet);
  let r = baseR;
  for (;;) {
    const perZone = Math.max(1, Math.round(zoneW / (2 * r + 1.5)));
    const step = zoneW / perZone;
    const dotR = Math.min(r, (step - 1.2) / 2);
    const columns = (MAX_FT / ZONE_FT) * perZone;
    const heights = new Array<number>(columns).fill(0);
    const placed = order.map((l) => {
      const clamped = Math.min(Math.max(l.feet, 0), MAX_FT);
      const k = Math.min(columns - 1, Math.floor((clamped * perZone) / ZONE_FT));
      const level = heights[k]!;
      heights[k] = level + 1;
      return { l, k, level };
    });
    const pitch = 2 * dotR + 1;
    const need = Math.max(0, ...heights) * pitch;
    if (need <= SW.maxPlot || r <= 2) {
      const base = SW.dotsTop + Math.max(SW.minPlot, need + 4);
      const dots: SwarmDot[] = placed.map(({ l, k, level }) => ({
        key: l.i,
        cx: SW.padX + (k + 0.5) * step,
        cy: base - dotR - 0.5 - level * pitch,
        r: dotR,
        saved: l.saved,
      }));
      return { dots, base, plotW, zoneW, height: base + SW.labelGap + SW.bottomPad };
    }
    r = Math.max(2, r * 0.85);
  }
}

/** Width of a node, measured before paint and kept current. */
function useMeasuredWidth(fallback: number) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    if (!node) return undefined;
    const read = () => {
      const w = Math.round(node.getBoundingClientRect().width);
      if (w > 0) setWidth((prev) => (prev === w ? prev : w));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width] as const;
}

function LeaveSwarm({
  leaves,
  median,
  dense,
  label,
}: {
  leaves: readonly { feet: number; saved: boolean }[];
  median: number | null;
  dense: boolean;
  label: string;
}) {
  const [ref, width] = useMeasuredWidth(320);
  const { dots, base, plotW, zoneW, height } = useMemo(
    () => layoutSwarm(leaves, width, dense ? 3.25 : 4),
    [leaves, width, dense],
  );
  const x = (ft: number) => SW.padX + (Math.min(Math.max(ft, 0), MAX_FT) / MAX_FT) * plotW;
  const medianX = median == null ? null : x(median);
  const medianAnchor =
    medianX == null ? 'middle' : medianX < SW.padX + 36 ? 'start' : medianX > width - SW.padX - 36 ? 'end' : 'middle';

  return (
    <div ref={ref} className="w-full min-w-0">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible font-fw-sans"
      >
        <rect x={SW.padX} y={SW.bandTop} width={zoneW} height={base - SW.bandTop} rx={6} style={{ fill: ZONE_FILL }} />
        <text
          x={SW.padX + 6}
          y={SW.zoneLabelY}
          fontSize={11}
          fontWeight={600}
          paintOrder="stroke"
          strokeWidth={3}
          strokeLinejoin="round"
          style={{ fill: 'var(--fw-color-accent-ink)', stroke: ZONE_FILL }}
        >
          Make zone
        </text>
        <line x1={SW.padX} x2={SW.padX + plotW} y1={base} y2={base} style={{ stroke: 'var(--fw-color-border-strong)' }} />
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={base} y2={base + 4} style={{ stroke: 'var(--fw-color-border-strong)' }} />
            <text
              x={x(t)}
              y={base + SW.labelGap - 2}
              fontSize={11}
              textAnchor={t === MAX_FT ? 'end' : t === 0 ? 'start' : 'middle'}
              style={{ fill: 'var(--fw-color-text-tertiary)' }}
            >
              {t === MAX_FT ? '20+ ft' : t}
            </text>
          </g>
        ))}
        {dots.map((d) => (
          <circle
            key={d.key}
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            strokeWidth={1}
            style={{ fill: d.saved ? SAVED_FILL : MISSED_FILL, stroke: 'var(--fw-color-surface)' }}
          />
        ))}
        {medianX != null && median != null ? (
          <g>
            <line
              x1={medianX}
              x2={medianX}
              y1={SW.bandTop - 2}
              y2={base}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              style={{ stroke: 'var(--fw-color-text-primary)' }}
            />
            <text
              x={medianX}
              y={SW.medianY}
              fontSize={11}
              fontWeight={600}
              textAnchor={medianAnchor}
              style={{ fill: 'var(--fw-color-text-primary)' }}
            >
              {`median ${feet(median)}`}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export function ChipCause({ data, allowed, playerId, playerName, className }: CauseProps) {
  const [band, setBand] = useState<ChipBandId | 'all'>('all');
  const [lie, setLie] = useState<ChipLie | 'all'>('all');
  const headingId = useId();
  const isPlayer = playerId != null;

  const read = useMemo(() => {
    const all = inRounds(data.chips, allowed, data.rounds, playerId);
    const inGrid = (s: ChipShot) => s.fromYards >= 0 && s.fromYards < GRID_MAX_YD;
    const shots = all.filter(inGrid);
    const team = playerId ? inRounds(data.chips, allowed, data.rounds, null).filter(inGrid) : shots;
    const filtered = chipsIn(shots, band, lie);
    const summary = chipSummary(filtered);
    const teamFiltered = chipsIn(team, band, lie);
    const teamSummary = chipSummary(teamFiltered);
    const teamOverall = upAndDown(team);
    const cells = CHIP_LIES.map((l) =>
      CHIP_BANDS.map((b) => {
        const mine = chipsIn(shots, b.id, l.id);
        const pct = upAndDown(mine);
        const ref = playerId ? upAndDown(chipsIn(team, b.id, l.id)) : teamOverall;
        return { lie: l, band: b, n: mine.length, pct, ref, gap: mine.length >= LOW_N ? pointGap(pct, ref) : null };
      }),
    );
    return {
      total: all.length,
      beyond: all.length - shots.length,
      rowN: Object.fromEntries(CHIP_LIES.map((l) => [l.id, chipsIn(shots, 'all', l.id).length])) as Record<ChipLie, number>,
      colN: Object.fromEntries(CHIP_BANDS.map((b) => [b.id, chipsIn(shots, b.id, 'all').length])) as Record<ChipBandId, number>,
      grid: shots.length,
      summary,
      teamSummary,
      teamOverall,
      offGreen: filtered.filter((s) => s.leaveFeet == null).length,
      lean: missLean(filtered),
      cells,
    };
  }, [data, allowed, playerId, band, lie]);

  const { summary } = read;
  const who = playerName ?? (isPlayer ? 'Player' : 'Whole team');
  const bandLabel = band === 'all' ? null : (CHIP_BANDS.find((b) => b.id === band)?.label ?? null);
  const lieLabel = lie === 'all' ? null : (CHIP_LIES.find((l) => l.id === lie)?.label ?? null);
  const overline = [
    who,
    `${summary.n} ${plural(summary.n, 'chip')}`,
    bandLabel,
    lieLabel?.toLowerCase() ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
  const pill = headlinePill(summary.n, isPlayer ? pointGap(summary.upAndDownPct, read.teamSummary.upAndDownPct) : null);
  const filtering = band !== 'all' || lie !== 'all';

  const pickCell = (b: ChipBandId, l: ChipLie) => {
    if (band === b && lie === l) {
      setBand('all');
      setLie('all');
    } else {
      setBand(b);
      setLie(l);
    }
  };

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={headingId} className="font-fw-display text-h3 font-semibold text-text-primary">
          Where scrambles are lost
        </h3>
        <p className="truncate font-fw-sans text-caption text-text-tertiary">{overline}</p>
      </div>
      {read.grid > 0 ? (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            data-figure=""
            className="font-fw-sans text-h1 font-semibold leading-none tabular-nums text-text-primary"
          >
            {formatPct(summary.upAndDownPct)}
          </span>
          <span className="font-fw-sans text-caption text-text-tertiary">up and down</span>
          {pill ? <span className={cn(PILL, PILL_TONE[pill.tone])}>{pill.text}</span> : null}
        </div>
      ) : null}
    </div>
  );

  if (read.grid === 0) {
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
          title={read.total > 0 ? 'No chips inside 30 yd' : 'No chips in this slice'}
          description={
            read.total > 0
              ? `Every chip in these rounds was from 30 yd or more, outside this card's grid.`
              : `No tracked chips in these rounds yet. They show up here once rounds are logged shot by shot.`
          }
        />
      </section>
    );
  }

  const swarmLabel =
    summary.leaves.length === 0
      ? 'No first-chip leaves on the green'
      : `First-chip leaves: ${summary.leaves.length} ${plural(summary.leaves.length, 'chip')} on the green, median ${feet(
          summary.medianLeave ?? 0,
        )}, ${formatPct(summary.inside4Pct)} inside 4 ft. ${summary.leaves.filter((l) => l.saved).length} got up and down, ${
          summary.leaves.filter((l) => !l.saved).length
        } missed.`;

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
          <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Up and down by lie and distance</h4>
          <span className="shrink-0 font-fw-sans text-caption text-text-tertiary">
            {filtering ? 'Tap again to clear' : 'Tap to filter'}
          </span>
        </div>
        <div
          role="group"
          aria-label="Up and down by lie and distance"
          className="grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] gap-1.5 [@container(min-width:480px)]:grid-cols-[6rem_repeat(3,minmax(0,1fr))]"
        >
          <span className="flex items-end gap-1.5 pb-1.5 font-fw-sans text-caption text-text-tertiary">
            <span aria-hidden className="h-3 w-0.5 rounded-full bg-text-primary" />
            Team
          </span>
          {CHIP_BANDS.map((b) => {
            const on = band === b.id;
            const blocked = read.colN[b.id] === 0 && !on;
            return (
              <PressTarget
                key={b.id}
                haptic={!blocked}
                aria-pressed={on}
                aria-disabled={blocked || undefined}
                aria-label={`${b.label}, all lies`}
                onClick={() => {
                  if (!blocked) setBand(on ? 'all' : b.id);
                }}
                className={cn(
                  'flex min-h-8 min-w-0 items-end justify-center rounded-fw-sm px-1 pb-1.5 font-fw-sans text-caption tabular-nums [@media(pointer:coarse)]:min-h-11',
                  on ? 'bg-surface-sunken font-semibold text-text-primary' : 'text-text-tertiary hover:text-text-primary',
                  blocked && 'cursor-default',
                )}
              >
                {b.label}
              </PressTarget>
            );
          })}
          {read.cells.map((row, li) => {
            const l = CHIP_LIES[li]!;
            const rowOn = lie === l.id;
            const rowBlocked = read.rowN[l.id] === 0 && !rowOn;
            return (
              <Fragment key={l.id}>
                <PressTarget
                  haptic={!rowBlocked}
                  aria-pressed={rowOn}
                  aria-disabled={rowBlocked || undefined}
                  aria-label={`${l.label}, all distances`}
                  onClick={() => {
                    if (!rowBlocked) setLie(rowOn ? 'all' : l.id);
                  }}
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 rounded-fw-sm px-1 text-left font-fw-sans text-caption [@container(min-width:480px)]:px-2 [@container(min-width:480px)]:text-body-sm',
                    rowOn
                      ? 'bg-surface-sunken font-semibold text-text-primary'
                      : 'font-medium text-text-secondary hover:text-text-primary',
                    rowBlocked && 'cursor-default',
                  )}
                >
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: LIE_SWATCH[l.id] }} />
                  <span className="min-w-0 truncate">{l.label}</span>
                </PressTarget>
                {row.map((c) => {
                  const on = band === c.band.id && lie === c.lie.id;
                  const blocked = c.n === 0 && !on;
                  const thin = c.n < LOW_N;
                  const tint = cellTint(c.gap);
                  const refText = c.ref == null ? '' : `, team ${formatPct(c.ref)}`;
                  const state = c.n === 0 ? 'no chips' : thin ? `${c.n} ${plural(c.n, 'chip')}, low sample` : `${c.n} chips`;
                  return (
                    <PressTarget
                      key={c.band.id}
                      haptic={!blocked}
                      aria-pressed={on}
                      aria-disabled={blocked || undefined}
                      aria-label={`${c.lie.label}, ${c.band.label}: ${
                        c.n === 0 ? 'no chips' : `${formatPct(c.pct)} up and down, ${state}${refText}`
                      }`}
                      onClick={() => {
                        if (!blocked) pickCell(c.band.id, c.lie.id);
                      }}
                      className={cn(
                        'flex min-h-16 min-w-0 flex-col items-stretch justify-between gap-1.5 rounded-fw-md p-2 text-left [@container(min-width:480px)]:p-3',
                        !tint && 'bg-surface-sunken',
                        on ? 'ring-2 ring-text-primary' : 'ring-1 ring-border-subtle',
                        blocked && 'cursor-default',
                      )}
                      style={tint ? { background: tint } : undefined}
                    >
                      <span
                        className={cn(
                          'font-fw-sans text-body-lg font-semibold leading-none tabular-nums',
                          thin ? 'text-text-tertiary' : 'text-text-primary',
                        )}
                      >
                        {c.n === 0 ? '—' : formatPct(c.pct)}
                      </span>
                      <span aria-hidden className="relative block h-1 rounded-full bg-surface">
                        {!thin && c.pct != null ? (
                          <span
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${Math.min(100, Math.max(0, c.pct))}%`,
                              background: c.gap != null && c.gap <= -5 ? MISSED_FILL : SAVED_FILL,
                            }}
                          />
                        ) : null}
                        {c.ref != null ? (
                          <span
                            className="absolute -bottom-1 -top-1 w-0.5 -translate-x-1/2 rounded-full bg-text-primary"
                            style={{ left: `${Math.min(100, Math.max(0, c.ref))}%` }}
                          />
                        ) : null}
                      </span>
                      <span className="font-fw-sans text-caption leading-tight tabular-nums text-text-tertiary">
                        {c.n === 0 ? (
                          'no chips'
                        ) : thin ? (
                          <>
                            <span className="whitespace-nowrap">{c.n} ·</span>{' '}
                            <span className="whitespace-nowrap">low sample</span>
                          </>
                        ) : (
                          `${c.n} chips`
                        )}
                      </span>
                    </PressTarget>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
        <p className="font-fw-sans text-caption text-text-tertiary">
          {isPlayer
            ? 'The tick is the whole team in the same lie and distance.'
            : `The tick is the team's overall rate, ${formatPct(read.teamOverall)}.`}
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-subtle pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">First chip leaves</h4>
          {summary.leaves.length > 0 ? (
            <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
              {`${formatPct(summary.inside4Pct)} of ${summary.leaves.length} inside 4 ft`}
              {isPlayer ? ` · team ${formatPct(read.teamSummary.inside4Pct)}` : ''}
            </span>
          ) : null}
        </div>
        {summary.n === 0 ? (
          <p className="rounded-fw-md bg-surface-sunken px-3 py-4 text-center font-fw-sans text-body-sm text-text-secondary">
            No chips match this filter.
          </p>
        ) : summary.leaves.length === 0 ? (
          <p className="rounded-fw-md bg-surface-sunken px-3 py-4 text-center font-fw-sans text-body-sm text-text-secondary">
            None of these chips finished on the green.
          </p>
        ) : (
          <LeaveSwarm leaves={summary.leaves} median={summary.medianLeave} dense={!isPlayer} label={swarmLabel} />
        )}
        {summary.leaves.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-fw-sans text-caption text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: SAVED_FILL }} />
              Got up and down
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: MISSED_FILL }} />
              Missed
            </span>
            {read.lean ? <span className="text-text-tertiary">{read.lean}</span> : null}
          </div>
        ) : null}
        {read.offGreen > 0 && summary.leaves.length > 0 ? (
          <p className="font-fw-sans text-caption text-text-tertiary">
            {`${read.offGreen} ${plural(read.offGreen, 'chip')} that finished off the green ${
              read.offGreen === 1 ? 'counts' : 'count'
            } toward up and down but ${read.offGreen === 1 ? "isn't" : "aren't"} plotted.`}
          </p>
        ) : null}
      </div>

      {read.beyond > 0 ? (
        <p className="-mt-2 font-fw-sans text-caption text-text-tertiary">
          {`${read.beyond} ${plural(read.beyond, 'chip')} from 30 yd or more ${
            read.beyond === 1 ? 'is' : 'are'
          } left out of this card.`}
        </p>
      ) : null}
    </section>
  );
}

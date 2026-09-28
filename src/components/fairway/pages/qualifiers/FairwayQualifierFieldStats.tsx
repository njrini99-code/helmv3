'use client';

/**
 * ============================================================================
 * Fairway · Qualifiers · FairwayQualifierFieldStats — "The field"
 * ----------------------------------------------------------------------------
 * The numbers a coach reads off a qualifier after the board: the field's
 * average, the low round and who shot it, the spread from first to last, the
 * shots across the travel cut; then each round's scores on one scale, the
 * rounds to par, and who moved after the latest round.
 *
 * Two sources (see qualifier-stats.ts): the tiles for the field average,
 * spread and cut read the board's live standings; the low round and the
 * round charts read the linked round cards, and the card says how many
 * scorecards they leave out. Scores keyed onto the entries as totals get the
 * totals tiles and one line saying there are no round cards to chart.
 *
 * No green bands: tiles are sunken wells split by hairlines, the charts are
 * ink. Data renders final on mount (static dots and bars, no draw-on).
 * ========================================================================== */

import { useId } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';

import { Surface, Avatar } from '@/components/fairway';
import { formatToPar } from '@/lib/golf/format-to-par';
import { formatMetricText } from '@/lib/golf/metrics/display-registry';
import { cn } from '@/lib/utils';

import { positionLabel, type Standing } from './qualifier-display';
import {
  distribution,
  fieldTotals,
  lowRound,
  movers,
  roundOverRound,
  roundSummaries,
  type LinkedRound,
  type Mover,
  type RoundSummary,
} from './qualifier-stats';

export interface FairwayQualifierFieldStatsProps {
  /** The board's standings once its feed has loaded; null before. */
  standings: Standing[] | null;
  /** The qualifier's linked round cards (golf_rounds) with a score. */
  linkedRounds: LinkedRound[];
  numRounds: number;
  /** Travel-squad size; 0 → no cut tile. */
  selectionSlotsTotal: number;
  completed: boolean;
  className?: string;
}

const avg = (n: number) => formatMetricText('scoring_average', n);

/** "4th", "tied 2nd": a golf position read aloud. */
function spokenPosition(p: { position: number | null; tied: boolean }): string {
  if (p.position === null) return 'no position';
  const n = p.position;
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${p.tied ? 'tied ' : ''}${n}${suffix}`;
}

export function FairwayQualifierFieldStats({
  standings,
  linkedRounds,
  numRounds,
  selectionSlotsTotal,
  completed,
  className,
}: FairwayQualifierFieldStatsProps) {
  const headingId = useId();
  // Nothing to say until the board has scores (it carries the empty states).
  if (!standings || !standings.some((s) => s.hasScore)) return null;

  const totals = fieldTotals(standings, selectionSlotsTotal);
  const low = lowRound(linkedRounds);
  const linked = linkedRounds.length;
  const missing = Math.max(0, totals.cards - linked);

  const tiles: Array<{ key: string; label: string; value: React.ReactNode; sub: React.ReactNode }> = [];
  if (totals.averageScore !== null) {
    tiles.push({
      key: 'avg',
      label: 'Field avg',
      value: avg(totals.averageScore),
      sub:
        totals.averageToPar !== null
          ? `${formatMetricText('scoring_average_vs_par', totals.averageToPar)} to par a round`
          : 'strokes a round',
    });
  }
  if (low) {
    const first = low.holders[0] as LinkedRound;
    tiles.push({
      key: 'low',
      label: 'Low round',
      value: (
        <>
          {low.score}
          {low.toPar !== null ? (
            <span className="ml-1.5 text-body font-semibold">{formatToPar(low.toPar)}</span>
          ) : null}
        </>
      ),
      sub: `${first.playerName} · R${first.roundNumber}${low.holders.length > 1 ? ` +${low.holders.length - 1} more` : ''}`,
    });
  }
  if (totals.spread) {
    tiles.push({
      key: 'spread',
      label: 'Spread',
      value: <Figure n={totals.spread.shots} unit={totals.spread.shots === 1 ? 'shot' : 'shots'} />,
      sub: `${formatToPar(totals.spread.best)} to ${formatToPar(totals.spread.worst)}, first to last`,
    });
  }
  if (totals.travelCut) {
    const cut = totals.travelCut;
    tiles.push({
      key: 'cut',
      label: 'Travel cut',
      value: cut.shots > 0 ? <Figure n={cut.shots} unit={cut.shots === 1 ? 'shot' : 'shots'} /> : 'Level',
      sub:
        cut.shots > 0
          ? `${formatToPar(cut.lastIn)} in, ${formatToPar(cut.firstOut)} out`
          : `${formatToPar(cut.lastIn)} on both sides of it`,
    });
  }

  const colsMd = ['md:grid-cols-1', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3', 'md:grid-cols-4'][tiles.length] ?? 'md:grid-cols-4';

  return (
    <Surface padding="none" aria-labelledby={headingId} className={cn('overflow-hidden', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-3 pt-4 md:px-6">
        <h2 id={headingId} className="font-fw-sans text-h3 text-text-primary">
          The field
        </h2>
        <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">
          {totals.cards} {totals.cards === 1 ? 'scorecard' : 'scorecards'} · {totals.players}{' '}
          {totals.players === 1 ? 'player' : 'players'}
        </p>
      </div>

      {tiles.length > 0 ? (
        <dl className={cn('grid grid-cols-2 gap-px border-y border-border-subtle bg-border-subtle', colsMd)}>
          {tiles.map((tile, i) => (
            <div
              key={tile.key}
              className={cn(
                'flex min-w-0 flex-col gap-1 bg-surface-sunken px-4 py-3 md:px-5',
                i === tiles.length - 1 && tiles.length % 2 === 1 && 'col-span-2 md:col-span-1',
              )}
            >
              <dt className="font-fw-sans text-caption font-semibold text-text-secondary">{tile.label}</dt>
              <dd className="font-fw-sans text-h2 tabular-nums text-text-primary">{tile.value}</dd>
              <dd className="font-fw-sans text-caption text-text-tertiary">{tile.sub}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {linked > 0 ? (
        <>
          <div className="grid gap-x-8 gap-y-6 px-4 py-5 md:grid-cols-2 md:px-6">
            <ByRound rounds={linkedRounds} numRounds={numRounds} completed={completed} />
            <ToParDistribution rounds={linkedRounds} />
          </div>
          <Movers rounds={linkedRounds} />
          {missing > 0 ? (
            <p className="border-t border-border-subtle px-4 py-3 font-fw-sans text-caption text-text-tertiary md:px-6">
              {missing} of {totals.cards} scorecards on the board have no linked round card, so the round stats leave{' '}
              {missing === 1 ? 'it' : 'them'} out.
            </p>
          ) : null}
        </>
      ) : (
        <p className="px-4 py-4 font-fw-sans text-body-sm text-text-secondary md:px-6">
          Scores were entered as totals, so there are no round cards to chart by round.
        </p>
      )}
    </Surface>
  );
}

/** A tile figure with a quieter unit: "14 shots". */
function Figure({ n, unit }: { n: number; unit: string }) {
  return (
    <>
      {n}
      <span className="ml-1 text-body-sm font-medium text-text-secondary">{unit}</span>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * By round — every card as a dot on one to-par scale, the average marked
 * ──────────────────────────────────────────────────────────────────────── */

function ByRound({ rounds, numRounds, completed }: { rounds: LinkedRound[]; numRounds: number; completed: boolean }) {
  const summaries = roundSummaries(rounds, numRounds);
  const change = roundOverRound(rounds);
  // One scale for every round: to par when every card has it, else strokes.
  const onToPar = rounds.every((r) => typeof r.toPar === 'number');
  const valueOf = (r: LinkedRound) => (onToPar ? (r.toPar as number) : r.score);
  const values = rounds.map(valueOf);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const at = (v: number) => (max === min ? 50 : ((v - min) / (max - min)) * 100);
  const label = (v: number) => (onToPar ? formatToPar(v) : String(v));

  return (
    <section aria-label="Scores by round" className="min-w-0">
      <h3 className="font-fw-sans text-caption font-semibold text-text-secondary">By round</h3>
      <ul className="mt-3 space-y-2">
        {summaries.map((s) => (
          <RoundStrip
            key={s.roundNumber}
            summary={s}
            values={rounds.filter((r) => r.roundNumber === s.roundNumber).map(valueOf)}
            average={onToPar ? s.averageToPar : s.averageScore}
            at={at}
            label={label}
            completed={completed}
          />
        ))}
      </ul>
      {/* The shared scale, under the strips */}
      <div aria-hidden className="mt-1 grid grid-cols-[2rem_minmax(0,1fr)_4rem] gap-3">
        <span />
        <div className="relative mx-1.5 h-4 font-fw-sans text-caption tabular-nums text-text-tertiary">
          <span className="absolute left-0 -translate-x-1/2">{label(min)}</span>
          {onToPar && min < 0 && max > 0 ? (
            <span className="absolute -translate-x-1/2" style={{ left: `${at(0)}%` }}>
              E
            </span>
          ) : null}
          {max !== min ? <span className="absolute right-0 translate-x-1/2">{label(max)}</span> : null}
        </div>
        <span />
      </div>
      {change ? (
        <p className="mt-2 font-fw-sans text-body-sm text-text-secondary">
          {Math.abs(change.delta) < 0.05
            ? `Round ${change.to} ran level with round ${change.from}`
            : `Round ${change.to} ran ${avg(Math.abs(change.delta))} shots ${change.delta < 0 ? 'better' : 'higher'} than round ${change.from}`}
          {` for the ${change.players} ${change.players === 1 ? 'player' : 'players'} who played both.`}
        </p>
      ) : null}
    </section>
  );
}

function RoundStrip({
  summary,
  values,
  average,
  at,
  label,
  completed,
}: {
  summary: RoundSummary;
  values: number[];
  average: number | null;
  at: (v: number) => number;
  label: (v: number) => string;
  completed: boolean;
}) {
  // Stack repeats of a value above and below the line, not on top of it.
  const seen = new Map<number, number>();
  const dots = values.map((v) => {
    const k = seen.get(v) ?? 0;
    seen.set(v, k + 1);
    const offset = k === 0 ? 0 : (k % 2 === 1 ? -1 : 1) * Math.ceil(k / 2) * 6;
    return { v, offset };
  });
  const sorted = [...values].sort((a, b) => a - b);

  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-3">
      <span className="font-fw-sans text-caption font-semibold tabular-nums text-text-tertiary">R{summary.roundNumber}</span>
      {summary.cards > 0 ? (
        <div aria-hidden className="relative mx-1.5 h-7">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-subtle" />
          {average !== null ? (
            <span
              className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-tertiary"
              style={{ left: `${at(average)}%` }}
            />
          ) : null}
          {dots.map(({ v, offset }, i) => (
            <span
              key={i}
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-primary ring-2 ring-surface"
              style={{ left: `${at(v)}%`, marginTop: offset }}
            />
          ))}
        </div>
      ) : (
        <span className="font-fw-sans text-body-sm text-text-tertiary">{completed ? 'Not played' : 'To play'}</span>
      )}
      <span className="text-right font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
        {summary.averageScore !== null ? avg(summary.averageScore) : ''}
        {summary.cards > 0 ? (
          <span className="block text-caption font-normal text-text-tertiary">
            {summary.cards} {summary.cards === 1 ? 'card' : 'cards'}
          </span>
        ) : null}
      </span>
      {summary.cards > 0 && sorted.length > 0 ? (
        <span className="sr-only">
          Round {summary.roundNumber}: {summary.cards} {summary.cards === 1 ? 'card' : 'cards'}, averaging{' '}
          {summary.averageScore !== null ? avg(summary.averageScore) : 'no score'}, from {label(sorted[0] as number)} to{' '}
          {label(sorted[sorted.length - 1] as number)}.
        </span>
      ) : null}
    </li>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * To par — the rounds by bucket
 * ──────────────────────────────────────────────────────────────────────── */

function ToParDistribution({ rounds }: { rounds: LinkedRound[] }) {
  const buckets = distribution(rounds);
  if (!buckets) return null;
  const most = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <section aria-label="Rounds to par" className="min-w-0">
      <h3 className="font-fw-sans text-caption font-semibold text-text-secondary">Rounds to par</h3>
      <ul className="mt-3 space-y-2">
        {buckets.map((b) => (
          <li key={b.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_1.5rem] items-center gap-3">
            <span className="font-fw-sans text-caption text-text-secondary">{b.label}</span>
            <span aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-sunken">
              <span
                className={cn('block h-full rounded-full', b.count > 0 ? 'bg-text-primary' : 'bg-transparent')}
                style={{ width: `${(b.count / most) * 100}%` }}
              />
            </span>
            <span
              className={cn(
                'text-right font-fw-sans text-body-sm font-semibold tabular-nums',
                b.count > 0 ? 'text-text-primary' : 'text-text-tertiary',
              )}
            >
              {b.count}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Movers — who changed places after the latest round
 * ──────────────────────────────────────────────────────────────────────── */

function Movers({ rounds }: { rounds: LinkedRound[] }) {
  const result = movers(rounds);
  if (!result) return null;
  const shown = result.moves.slice(0, 4);
  return (
    <section aria-label={`Movers after round ${result.round}`} className="border-t border-border-subtle px-4 py-5 md:px-6">
      <h3 className="font-fw-sans text-caption font-semibold text-text-secondary">After round {result.round}</h3>
      {shown.length === 0 ? (
        <p className="mt-2 font-fw-sans text-body-sm text-text-secondary">
          No one changed places in round {result.round}.
        </p>
      ) : (
        <ul className="mt-1.5 divide-y divide-border-subtle">
          {shown.map((m) => (
            <MoverRow key={m.playerId} move={m} round={result.round} />
          ))}
        </ul>
      )}
    </section>
  );
}

function MoverRow({ move, round }: { move: Mover; round: number }) {
  const up = move.change > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  const places = Math.abs(move.change);
  return (
    <li className="flex min-h-11 items-center gap-3 py-2">
      <Avatar name={move.playerName} identityKey={move.playerId} tone="identity" size="xs" decorative />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-fw-sans text-body-sm font-medium text-text-primary">{move.playerName}</span>
        <span className="block font-fw-sans text-caption tabular-nums text-text-tertiary">
          {move.round.score}
          {move.round.toPar !== null ? ` (${formatToPar(move.round.toPar)})` : ''} in round {round}
        </span>
      </span>
      <span aria-hidden className="inline-flex shrink-0 items-center gap-1.5 font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
        <Arrow className={cn('h-4 w-4', up ? 'text-text-primary' : 'text-text-tertiary')} strokeWidth={2.25} />
        {positionLabel(move.before)} → {positionLabel(move.after)}
      </span>
      <span className="sr-only">
        {up ? 'Up' : 'Down'} {places} {places === 1 ? 'place' : 'places'}, from {spokenPosition(move.before)} to{' '}
        {spokenPosition(move.after)}
      </span>
    </li>
  );
}

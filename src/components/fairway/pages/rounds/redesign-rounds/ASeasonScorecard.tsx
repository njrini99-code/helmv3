'use client';

// REDESIGN-SCRATCH (docs/redesign/rounds): Direction A, season scorecard. The signature.
//
// A real scorecard grid for the season. The columns are the last 9 counted rounds, dated
// like holes and read oldest to newest. Rows: ROUND (the date, which opens the round),
// PAR, SCORE (drawn with scorecard marks) and TO PAR. The trailing OUT / IN / TOT block
// holds the season averages over counted 18-hole rounds, labelled "avg of n".
//
// Built as a real <table> so a screen reader gets row and column headers; the row labels
// are sticky and the container scrolls sideways on a phone, starting scrolled to the end
// so the latest round sits beside the season averages.
import * as React from 'react';
import Link from 'next/link';

import { Button } from '@/components/fairway/controls/button';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { Surface } from '@/components/fairway/surfaces/surface';
import { formatToPar } from '@/lib/golf/format-to-par';
import { cn } from '@/lib/utils';

import {
  DASH,
  averagesCaption,
  buildScorecard,
  formatAvg,
  formatAvgToPar,
  markKind,
  windowCaption,
  type ARound,
  type Scorecard,
} from './AModel';
import { ScoreMark } from './AScoreMark';

// ── Shared cell recipes ─────────────────────────────────────────────────────

/** Sticky row label ("PAR", "SCORE"). Opaque so scrolled columns slide under it. */
const ROW_LABEL =
  'sticky left-0 z-10 w-16 whitespace-nowrap border-r border-border-strong px-2.5 text-left font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.06em] text-text-secondary';

/** Trailing-block header label ("OUT", "IN", "TOT"). */
const BLOCK_LABEL =
  'bg-surface-sunken px-2 py-1.5 text-center font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.06em] text-text-secondary';

function toParInk(toPar: number | null): string {
  if (toPar === null) return 'text-text-tertiary';
  if (toPar < 0) return 'font-semibold text-accent-ink';
  if (toPar === 0) return 'text-text-secondary';
  return 'text-text-primary';
}

// ── The grid ────────────────────────────────────────────────────────────────

function ScorecardGrid({ card }: { card: Scorecard }) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { columns, averages } = card;
  const last = columns.length - 1;

  // Start at the newest round. Instant positioning before paint, not an animation.
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [columns.length]);

  // A short season should not stretch three columns across a desktop card.
  const maxWidth = `${4 + (columns.length + 3) * 6.5}rem`;

  return (
    <div ref={scrollRef} className="overflow-x-auto">
      <table
        className="w-full min-w-max border-separate border-spacing-0 tabular-nums"
        style={{ maxWidth }}
      >
        <caption className="sr-only">
          {windowCaption(card)}, oldest to newest, with season averages for out, in and total.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              rowSpan={2}
              className={cn(ROW_LABEL, 'border-b border-b-border-strong bg-surface-tint')}
            >
              Round
            </th>
            {columns.map((c, i) => (
              <th
                key={c.id}
                scope="col"
                rowSpan={2}
                className={cn(
                  'min-w-14 border-b border-b-border-strong bg-surface-tint p-0 font-fw-sans',
                  i < last && 'border-r border-r-border-subtle',
                )}
              >
                <Link
                  href={c.href}
                  className="flex min-h-11 flex-col items-center justify-center px-1 py-2 text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
                >
                  <span className="text-body-sm font-semibold">{c.label}</span>
                  {c.holes !== 18 && (
                    <span className="text-caption font-normal text-text-secondary">{c.holes} holes</span>
                  )}
                </Link>
              </th>
            ))}
            <th
              scope="col"
              colSpan={3}
              className="border-b border-l border-b-border-subtle border-l-border-strong bg-surface-sunken px-2 py-1 text-center font-fw-sans text-caption font-medium text-text-secondary"
            >
              {averages ? `avg of ${averages.n}` : 'avg'}
            </th>
          </tr>
          <tr>
            <th
              scope="col"
              className={cn(BLOCK_LABEL, 'border-b border-l border-b-border-strong border-l-border-strong')}
            >
              Out
            </th>
            <th
              scope="col"
              className={cn(BLOCK_LABEL, 'border-b border-l border-b-border-strong border-l-border-subtle')}
            >
              In
            </th>
            <th
              scope="col"
              className={cn(BLOCK_LABEL, 'border-b border-l border-b-border-strong border-l-border-subtle')}
            >
              Tot
            </th>
          </tr>
        </thead>

        <tbody>
          {/* PAR */}
          <tr>
            <th scope="row" className={cn(ROW_LABEL, 'h-10 border-b border-b-border-subtle bg-surface')}>
              Par
            </th>
            {columns.map((c, i) => (
              <td
                key={c.id}
                className={cn(
                  'h-10 border-b border-b-border-subtle bg-surface px-1 text-center font-fw-mono text-body-sm text-text-secondary',
                  i < last && 'border-r border-r-border-subtle',
                )}
              >
                {c.par ?? DASH}
              </td>
            ))}
            <td
              colSpan={3}
              className="h-10 border-b border-l border-b-border-subtle border-l-border-strong bg-surface-tint"
            />
          </tr>

          {/* SCORE: the loud row */}
          <tr>
            <th scope="row" className={cn(ROW_LABEL, 'h-16 border-b border-b-border-subtle bg-surface')}>
              Score
            </th>
            {columns.map((c, i) => (
              <td
                key={c.id}
                className={cn(
                  'h-16 border-b border-b-border-subtle bg-surface px-1 text-center',
                  i < last && 'border-r border-r-border-subtle',
                )}
              >
                <ScoreMark kind={markKind(c.toPar)} size="lg">
                  {c.score}
                </ScoreMark>
              </td>
            ))}
            <td
              className={cn(
                'h-16 border-b border-l border-b-border-subtle border-l-border-strong bg-surface-tint px-2 text-center font-fw-mono text-h3 text-text-primary',
                !averages && 'text-text-tertiary',
              )}
            >
              {averages ? formatAvg(averages.front) : DASH}
            </td>
            <td
              className={cn(
                'h-16 border-b border-l border-b-border-subtle border-l-border-subtle bg-surface-tint px-2 text-center font-fw-mono text-h3 text-text-primary',
                !averages && 'text-text-tertiary',
              )}
            >
              {averages ? formatAvg(averages.back) : DASH}
            </td>
            <td
              className={cn(
                'h-16 border-b border-l border-b-border-subtle border-l-border-subtle bg-surface-tint px-2 text-center font-fw-mono text-h2 text-text-primary',
                !averages && 'text-text-tertiary',
              )}
            >
              {averages ? formatAvg(averages.total) : DASH}
            </td>
          </tr>

          {/* TO PAR */}
          <tr>
            <th scope="row" className={cn(ROW_LABEL, 'h-10 bg-surface')}>
              To par
            </th>
            {columns.map((c, i) => (
              <td
                key={c.id}
                className={cn(
                  'h-10 bg-surface px-1 text-center font-fw-mono text-body-sm',
                  toParInk(c.toPar),
                  i < last && 'border-r border-r-border-subtle',
                )}
              >
                {formatToPar(c.toPar)}
              </td>
            ))}
            <td colSpan={2} className="h-10 border-l border-l-border-strong bg-surface-tint" />
            <td
              className={cn(
                'h-10 border-l border-l-border-subtle bg-surface-tint px-2 text-center font-fw-mono text-body-sm',
                toParInk(averages?.toPar ?? null),
              )}
            >
              {averages && averages.toPar !== null ? formatAvgToPar(averages.toPar) : ''}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────

function MarkLegend() {
  return (
    <ul aria-label="Score marks" className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <li className="inline-flex items-center gap-1.5 font-fw-sans text-caption text-text-secondary">
        <ScoreMark kind="circle" size="xs" />
        Under par
      </li>
      <li className="inline-flex items-center gap-1.5 font-fw-sans text-caption text-text-secondary">
        <ScoreMark kind="square" size="xs" />
        1 to 4 over
      </li>
      <li className="inline-flex items-center gap-1.5 font-fw-sans text-caption text-text-secondary">
        <ScoreMark kind="double-square" size="xs" />
        5 or more over
      </li>
    </ul>
  );
}

// ── The empty scorecard: dotted cells waiting for a round ───────────────────

const GHOST_ROWS: ReadonlyArray<{ label: string; height: string }> = [
  { label: 'Round', height: 'h-6' },
  { label: 'Par', height: 'h-6' },
  { label: 'Score', height: 'h-9' },
  { label: 'To par', height: 'h-6' },
];

function GhostGrid() {
  return (
    <div aria-hidden="true" className="px-4 pb-2 pt-1">
      <div className="grid grid-cols-[3.25rem_repeat(12,minmax(0,1fr))] items-center gap-1">
        {GHOST_ROWS.map((row) => (
          <React.Fragment key={row.label}>
            <span className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.06em] text-text-tertiary">
              {row.label}
            </span>
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className={cn(
                  'border border-dotted border-border-strong',
                  row.height,
                  i >= 9 && 'bg-surface-tint',
                )}
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function EmptyScorecard({ reason }: { reason: 'no-rounds' | 'none-counted' }) {
  const titleId = React.useId();
  return (
    <Surface as="section" aria-labelledby={titleId} padding="none" className="overflow-hidden">
      <div className="px-4 pb-3 pt-4">
        <h2 id={titleId} className="font-fw-display text-body-lg font-semibold text-text-primary">
          Season scorecard
        </h2>
      </div>
      <GhostGrid />
      {reason === 'no-rounds' ? (
        <EmptyState
          variant="subtle"
          icon={null}
          title="No rounds yet"
          description="Every round you log becomes a column here, with your front nine, back nine and total."
          action={
            // The header carries the one primary action, so this one is secondary.
            <Button asChild variant="secondary" size="md">
              <Link href="/golf/dashboard/rounds/new">Log your first round</Link>
            </Button>
          }
        />
      ) : (
        <EmptyState
          variant="subtle"
          icon={null}
          title="No counted rounds yet"
          description="A round counts once its nines have plausible scores. Rounds that don't count stay in the list below."
        />
      )}
    </Surface>
  );
}

// ── Entry ───────────────────────────────────────────────────────────────────

export function ASeasonScorecard({ rounds }: { rounds: readonly ARound[] }) {
  const card = React.useMemo(() => buildScorecard(rounds), [rounds]);
  const titleId = React.useId();

  if (rounds.length === 0) return <EmptyScorecard reason="no-rounds" />;
  if (card.columns.length === 0) return <EmptyScorecard reason="none-counted" />;

  const note = averagesCaption(card);

  return (
    <Surface as="section" aria-labelledby={titleId} padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pb-3 pt-4">
        <h2 id={titleId} className="font-fw-display text-body-lg font-semibold text-text-primary">
          Season scorecard
        </h2>
        <p className="font-fw-sans text-caption text-text-secondary">{windowCaption(card)}</p>
      </div>

      <ScorecardGrid card={card} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle px-4 py-3">
        <MarkLegend />
        {note && <p className="font-fw-sans text-caption text-text-secondary">{note}</p>}
      </div>
    </Surface>
  );
}

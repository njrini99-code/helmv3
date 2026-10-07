'use client';

// REDESIGN-SCRATCH (docs/redesign/rounds): Direction G, the rich round rows.
//
// One row per round, newest first (G gives up month grouping to keep the run of form). Each row
// carries what a list of text hides:
//   - date, course and type, then the score;
//   - the round's to-par, big, drawn with its mark: a circle when it beat the player's usual
//     band, a square when it fell below it, nothing for an ordinary round (a hole's mark is
//     against par; a round's is against "your usual", which is the whole idea of G);
//   - the delta against the usual median;
//   - the worst three holes in a row, from the hole scores;
//   - a four-segment strokes-gained mini bar (Tee, Approach, Short, Putt).
// A round that is not counted stays in the list, muted and dashed, and says so.
import * as React from 'react';

import { formatSigned } from '@/components/fairway/charts/theme';
import { Chip } from '@/components/fairway/controls/badge';
import { Surface } from '@/components/fairway/surfaces/surface';
import { formatToPar } from '@/lib/golf/format-to-par';
import { cn } from '@/lib/utils';

import { TypeFilterPills } from './PageChrome';
import { ROW_MODELS, SG_CATEGORIES, USUAL, type RowModel, type TypeFilterKey } from './model';
import { ScoreMark } from './ScoreMark';
import { SgMiniBar } from './SgMiniBar';

const ROUND_MEANING = {
  eagle: 'far better than your usual',
  birdie: 'better than your usual',
  par: 'within your usual',
  bogey: 'worse than your usual',
  double: 'far worse than your usual',
} as const;

function deltaInk(delta: number): string {
  if (Math.abs(delta) < 0.05) return 'text-text-secondary';
  return delta < 0 ? 'font-semibold text-accent-ink' : 'font-semibold text-fw-warning-text';
}

function RoundRow({ row }: { row: RowModel }) {
  const toParText = formatToPar(row.toPar);
  const holesNote = row.holes === 18 ? '' : ` · ${row.holes} holes`;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-11 shrink-0 leading-tight">
          <p className="m-0 font-fw-sans text-caption text-text-secondary">{row.weekday}</p>
          <p className="m-0 font-fw-display text-body-sm font-medium tabular-nums text-text-primary">
            {row.dateShort}
          </p>
        </div>

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'm-0 truncate font-fw-sans text-body font-medium',
              row.counted ? 'text-text-primary' : 'text-text-secondary',
            )}
            title={row.course}
          >
            {row.short}
          </p>
          <p className="m-0 mt-0.5 flex items-center gap-1.5 font-fw-sans text-caption tabular-nums text-text-secondary">
            <Chip tone="neutral" size="sm" className="shrink-0">
              {row.typeLabel}
            </Chip>
            <span className="truncate">
              {row.score}
              {holesNote}
            </span>
          </p>
        </div>

        <ScoreMark
          kind={row.counted ? row.kind : 'uncounted'}
          size="lg"
          label={
            row.counted
              ? `${toParText} to par, ${ROUND_MEANING[row.kind]}`
              : `${toParText} to par, not counted`
          }
        >
          {toParText}
        </ScoreMark>
      </div>

      {row.counted ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-14 font-fw-sans text-caption tabular-nums">
          {row.delta !== null ? (
            <span className={deltaInk(row.delta)}>{formatSigned(row.delta, 1)} vs usual</span>
          ) : null}
          {row.stretch ? (
            <span className="text-text-secondary">
              {row.stretch.over > 0
                ? `Holes ${row.stretch.from}–${row.stretch.to} · ${formatSigned(row.stretch.over, 0)}`
                : 'No rough patch'}
            </span>
          ) : null}
          {row.sg ? <SgMiniBar values={row.sg} className="ml-auto" /> : null}
        </div>
      ) : (
        <p className="m-0 mt-2 pl-14 font-fw-sans text-caption text-fw-warning-text">
          Not counted, so it stays out of your usual
        </p>
      )}
    </li>
  );
}

/** What the marks and the little bars mean, in one quiet line above the list. */
function Legend() {
  return (
    <div className="flex flex-col gap-1.5 font-fw-sans text-caption text-text-secondary">
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <ScoreMark kind="birdie" size="xs" decorative /> Better than your usual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ScoreMark kind="bogey" size="xs" decorative /> Worse
        </span>
        <span>No mark: an ordinary round for you</span>
      </p>
      <p className="m-0 tabular-nums">
        Bars: strokes gained on {SG_CATEGORIES.map((c) => c.short).join(', ')}
        {USUAL ? `. Usual is ${formatSigned(USUAL.median, 1)} to par.` : '.'}
      </p>
    </div>
  );
}

export function GRoundRows() {
  const [filter, setFilter] = React.useState<TypeFilterKey>('all');
  const rows = filter === 'all' ? ROW_MODELS : ROW_MODELS.filter((r) => r.type === filter);

  return (
    <Surface padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-3 px-4 pb-3 pt-4">
        <TypeFilterPills value={filter} onChange={setFilter} />
        <Legend />
      </div>
      <ul className="m-0 list-none divide-y divide-border-subtle border-t border-border-subtle p-0">
        {rows.map((row) => (
          <RoundRow key={row.id} row={row} />
        ))}
      </ul>
    </Surface>
  );
}

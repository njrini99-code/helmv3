'use client';

/**
 * ============================================================================
 * SpineLedger — the spine's stat row (mockup §01 .ledger)
 * ----------------------------------------------------------------------------
 * A row of stat columns (Rounds · Fairways · Greens · Putts / rd): the value
 * big and dark on top, the label small and secondary below — the "27 Rounds /
 * 14 This Year / 15 Courses" idiom. Up to four rows sit in one row of equal
 * columns; more than four fall back to two columns so nothing gets crushed.
 * Sits under the last divider in `Spine`, before the CTA. Exported
 * standalone so drill panels can reuse the same treatment.
 *
 * Semantics: still a `<dl>` with `<dt>` (label) before `<dd>` (value) in the
 * DOM, so AT reads "Rounds, 24"; `flex-col-reverse` puts the value on top
 * visually.
 *
 * Each row optionally carries a `delta` (§ types.ts `SpineLedgerRow`) — a
 * signed ▲/▼/► annotation rendered beside the value. Color is never the only
 * channel: the glyph is always the row's LITERAL direction, and `good` alone
 * decides the tint (accent ink for an improvement, secondary otherwise) — so
 * a "fewer putts is good" delta still shows a ▼ (the number really did go
 * down), just in the accent tone instead of the muted one.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from '../charts/theme';
import type { SpineLedgerDelta, SpineLedgerProps } from './types';

const DELTA_GLYPH: Record<SpineLedgerDelta['direction'], string> = {
  up: '▲',
  down: '▼',
  flat: '►',
};

const DELTA_WORD: Record<SpineLedgerDelta['direction'], string> = {
  up: 'up',
  down: 'down',
  flat: 'unchanged',
};

function deltaAriaLabel(label: string, delta: SpineLedgerDelta): string {
  const qualifier = delta.direction === 'flat' ? '' : delta.good ? ', improvement' : ', decline';
  return `${label} ${DELTA_WORD[delta.direction]} ${delta.text}${qualifier}`;
}

const COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

/** Column class for `count` stats: one row of up to 4, else 2 columns. */
export function spineLedgerColumns(count: number): string {
  return COLUMNS[count] ?? 'grid-cols-2';
}

export function SpineLedger({ rows, className }: SpineLedgerProps) {
  return (
    <dl
      data-slot="spine-ledger"
      className={cn('grid gap-x-2 gap-y-4', spineLedgerColumns(rows.length), className)}
    >
      {rows.map((row) => (
        <div key={row.label} data-slot="spine-ledger-stat" className="flex min-w-0 flex-col-reverse gap-0.5">
          <dt className="font-fw-sans text-caption text-text-secondary [overflow-wrap:anywhere]">
            {row.label}
          </dt>
          <dd
            style={TABULAR_NUMS}
            className="flex items-baseline gap-1 font-fw-sans text-h3 font-semibold tabular-nums text-text-primary"
          >
            {row.value}
            {row.delta ? (
              <span
                className={cn(
                  'inline-flex items-center text-eyebrow font-semibold',
                  row.delta.good ? 'text-accent-ink' : 'text-text-secondary',
                )}
              >
                {/*
                  sr-only text, NOT aria-label: aria-label is prohibited on a
                  generic-role element, so AT dropped it entirely and the
                  direction was announced as silence — the glyph beside it is
                  aria-hidden (audit P-19). Same pattern as TrendChip.
                */}
                <span className="sr-only">{deltaAriaLabel(row.label, row.delta)}</span>
                <span aria-hidden="true">{DELTA_GLYPH[row.delta.direction]}</span>
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

'use client';

/**
 * ============================================================================
 * SpineLedger — the spine's key/value footer rows (mockup §01 .ledger)
 * ----------------------------------------------------------------------------
 * A tight label/value list (Rounds · Fairways · Greens · Putts / round) that
 * sits under the last hairline in `Spine`, before the CTA. Exported
 * standalone so drill panels can reuse the same ledger row treatment.
 *
 * Each row optionally carries a `delta` (§ types.ts `SpineLedgerRow`) — a
 * signed ▲/▼/► annotation rendered beside the value. Color is never the only
 * channel: the glyph is always the row's LITERAL direction, and `good` alone
 * decides the tint (bright accent for an improvement, muted tertiary
 * otherwise) — so a "fewer putts is good" delta still shows a ▼ (the number
 * really did go down), just in the accent tone instead of the muted one.
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

export function SpineLedger({ rows, className }: SpineLedgerProps) {
  return (
    <dl data-slot="spine-ledger" className={cn('grid gap-1.5', className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 font-fw-sans text-caption text-ink-on-deep">
          <dt className="min-w-0 truncate">{row.label}</dt>
          <dd
            style={TABULAR_NUMS}
            className="flex items-center gap-1.5 font-fw-mono font-normal tabular-nums text-text-on-accent"
          >
            {row.value}
            {row.delta ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-caption font-semibold',
                  row.delta.good ? 'text-accent-300' : 'text-text-tertiary',
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

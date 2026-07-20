'use client';

/**
 * ============================================================================
 * SpineLedger — the spine's key/value footer rows (mockup §01 .ledger)
 * ----------------------------------------------------------------------------
 * A tight label/value list (Rounds · Fairways · Greens · Putts / round) that
 * sits under the last hairline in `Spine`, before the CTA. Exported
 * standalone so drill panels can reuse the same ledger row treatment.
 * ========================================================================== */

import { cn } from '@/lib/utils';
import { TABULAR_NUMS } from '../charts/theme';

export interface SpineLedgerRow {
  label: string;
  value: string;
}

export interface SpineLedgerProps {
  rows: SpineLedgerRow[];
  className?: string;
}

export function SpineLedger({ rows, className }: SpineLedgerProps) {
  return (
    <dl data-slot="spine-ledger" className={cn('grid gap-1.5', className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 font-fw-sans text-caption text-accent-100">
          <dt className="min-w-0 truncate">{row.label}</dt>
          <dd
            style={TABULAR_NUMS}
            className="font-fw-mono font-normal tabular-nums text-text-on-accent"
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

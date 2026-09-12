/**
 * ============================================================================
 * Fairway · modules · StatMatrix — several related values as ONE object
 * ----------------------------------------------------------------------------
 * Accepted / Maybe / No / Pending. Wins / Losses / Ties. FW / GIR / Putts /
 * Penalties. Four numbers that belong together are one information object:
 * a shared boundary with internal seams — never four cards.
 *
 *   <StatMatrix
 *     label="Responses"
 *     detail="7 invited"
 *     items={[{ label: 'Accepted', value: 5, tone: 'accent' }, …]}
 *   />
 *
 * Layout: 2×2 on a phone, one row of N from `sm` up (override with `columns`).
 * Semantics: a `<dl>` — each cell is a term/definition pair, so the group reads
 * as data, not decoration. Numerals are tabular. Value colour is semantic and
 * only when it means something (`tone`); otherwise ink.
 * ========================================================================== */

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type StatMatrixTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'muted';

export interface StatMatrixItem {
  label: string;
  value: ReactNode;
  /** Semantic ink for the value. Default `neutral`. */
  tone?: StatMatrixTone;
  /** Extra line under the label (a delta, a unit). */
  hint?: ReactNode;
}

export interface StatMatrixProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  items: readonly StatMatrixItem[];
  /** Eyebrow above the matrix (e.g. "Responses"). */
  label?: string;
  /** Quiet detail beside the eyebrow (e.g. "7 invited"). */
  detail?: ReactNode;
  /** Columns from `sm` up. Default: the item count (max 6). Phones are 2×N. */
  columns?: 2 | 3 | 4 | 5 | 6;
  /** `inset` (default): sunken well. `matte`: hairline + surface. `plain`: seams only. */
  variant?: 'inset' | 'matte' | 'plain';
  /** Cell density. */
  size?: 'sm' | 'md';
}

const TONE: Record<StatMatrixTone, string> = {
  neutral: 'text-text-primary',
  accent: 'text-accent-700',
  warning: 'text-fw-warning-ink',
  danger: 'text-fw-danger-ink',
  muted: 'text-text-tertiary',
};

const COLS: Record<NonNullable<StatMatrixProps['columns']>, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
};

const VARIANT: Record<NonNullable<StatMatrixProps['variant']>, string> = {
  inset: 'rounded-fw-md bg-surface-sunken',
  matte: 'rounded-fw-md border border-border-subtle bg-surface',
  plain: '',
};

export function StatMatrix({
  items,
  label,
  detail,
  columns,
  variant = 'inset',
  size = 'md',
  className,
  ...props
}: StatMatrixProps) {
  const cols = (columns ?? Math.min(Math.max(items.length, 2), 6)) as NonNullable<StatMatrixProps['columns']>;
  return (
    <section data-slot="stat-matrix" className={cn('min-w-0', className)} {...props}>
      {label ? (
        <div className="mb-2 flex items-baseline gap-2 px-0.5">
          <h3 className="font-fw-sans text-eyebrow font-semibold uppercase tracking-[0.08em] text-text-tertiary">{label}</h3>
          {detail ? <span className="font-fw-sans text-caption text-text-tertiary">{detail}</span> : null}
        </div>
      ) : null}
      <dl className={cn('grid grid-cols-2 overflow-hidden', COLS[cols], VARIANT[variant])}>
        {items.map((item, i) => {
          const phoneLeft = i % 2 === 1;
          const phoneTop = i >= 2;
          const wideLeft = i % cols !== 0;
          const wideTop = i >= cols;
          return (
            <div
              key={`${item.label}-${i}`}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center text-center border-border-subtle',
                size === 'md' ? 'gap-0.5 px-3 py-3' : 'gap-0 px-2 py-2',
                phoneLeft ? 'border-l' : 'border-l-0',
                phoneTop ? 'border-t' : 'border-t-0',
                wideLeft ? 'sm:border-l' : 'sm:border-l-0',
                wideTop ? 'sm:border-t' : 'sm:border-t-0',
              )}
            >
              <dd
                className={cn(
                  'order-1 font-fw-sans font-semibold tabular-nums leading-none tracking-[-0.01em]',
                  size === 'md' ? 'text-h2' : 'text-h3',
                  TONE[item.tone ?? 'neutral'],
                )}
              >
                {item.value}
              </dd>
              <dt className="order-2 font-fw-sans text-caption text-text-secondary">{item.label}</dt>
              {item.hint ? <span className="order-3 font-fw-sans text-eyebrow text-text-tertiary">{item.hint}</span> : null}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

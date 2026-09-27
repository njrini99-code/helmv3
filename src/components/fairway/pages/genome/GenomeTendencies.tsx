/**
 * "How they play": the genome's character traits as a hairline ledger.
 * Server-safe (no hooks); the compute action, when present, is passed in.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { GENOME_WINDOW_DAYS } from '@/lib/coachhelm/v3/genome/types';
import type { Tendency } from './tendencies-model';

export interface GenomeTendenciesProps {
  tendencies: readonly Tendency[];
  /** rounds_basis from the genome row, or null when no genome exists. */
  roundsBasis: number | null;
  /** Already worded by formatGenomeRefreshed (UTC), or null. */
  refreshed: string | null;
  /** Rendered when no genome exists yet (e.g. a compute button). */
  emptyAction?: React.ReactNode;
  className?: string;
}

export function GenomeTendencies({ tendencies, roundsBasis, refreshed, emptyAction, className }: GenomeTendenciesProps) {
  const anyLive = tendencies.some((t) => t.status === 'live');
  return (
    <section aria-labelledby="genome-tendencies" className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="genome-tendencies" className="font-fw-sans text-h3 text-text-primary">
          How they play
        </h2>
        <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">
          Last {GENOME_WINDOW_DAYS} days
          {roundsBasis != null ? ` · ${roundsBasis} ${roundsBasis === 1 ? 'round' : 'rounds'}` : ''}
          {refreshed ? ` · refreshed ${refreshed}` : ''}
        </p>
      </div>
      <ul className="border-t border-border-strong">
        {tendencies.map((t) => (
          <li
            key={t.id}
            className="flex min-h-12 items-center justify-between gap-4 border-b border-border-subtle py-2.5"
          >
            <span className={cn('font-fw-sans text-body', t.status === 'live' ? 'text-text-primary' : 'text-text-secondary')}>
              {t.label}
            </span>
            {t.status === 'live' ? (
              <span className="flex min-w-0 flex-col items-end text-right">
                <span className="font-fw-sans text-body font-semibold text-text-primary">{t.word ?? ''}</span>
                <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                  {t.detail}
                  {t.read ? ` · ${t.read}` : ''}
                </span>
              </span>
            ) : (
              <span className="font-fw-sans text-body-sm text-text-tertiary">
                {t.status === 'not_tracked' ? 'Not tracked' : 'Needs more rounds'}
              </span>
            )}
          </li>
        ))}
      </ul>
      {!anyLive && emptyAction ? <div className="pt-1">{emptyAction}</div> : null}
    </section>
  );
}

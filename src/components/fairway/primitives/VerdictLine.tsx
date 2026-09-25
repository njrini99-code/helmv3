/**
 * VerdictLine: the one-sentence takeaway that leads a screen or section
 * (design-direction §4.1, §5 #4; ledger DS-12).
 *
 * The verdict is built only from typed fields. Pass `clauses`: each clause
 * that is null, undefined, false or an empty string is dropped, and when
 * nothing is left the whole line renders nothing. It never ellipsises. Pass
 * `children` instead for a sentence that is already whole.
 *
 * A small tone mark says whether the read is good news, a concern, or not
 * settled yet (green for better, amber for worse, the MetricValue rule). The
 * sentence carries the meaning; the mark is decorative. The optional `basis`
 * line says what the verdict rests on ("Last 10 rounds · Solid read").
 *
 * No hooks, so it renders on the server as well as in client trees.
 */

import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type VerdictTone = 'good' | 'bad' | 'neutral' | 'early';

export type VerdictClause = ReactNode | null | undefined | false;

const MARK: Record<VerdictTone, string> = {
  good: 'bg-fw-success',
  bad: 'bg-fw-warning',
  neutral: 'bg-text-tertiary',
  early: 'ring-1 ring-inset ring-text-tertiary',
};

export interface VerdictLineProps {
  /** Sentence clauses, joined with a space; empty ones are dropped. */
  clauses?: VerdictClause[];
  /** A whole sentence, used when `clauses` is not given. */
  children?: ReactNode;
  tone?: VerdictTone;
  /** What the verdict rests on: window, sample, read quality. */
  basis?: ReactNode;
  /** `lg` is the 20/28 masthead verdict; `md` leads a section. */
  size?: 'md' | 'lg';
  className?: string;
}

function present(c: VerdictClause): boolean {
  return c !== null && c !== undefined && c !== false && c !== '' && c !== true;
}

export function VerdictLine({ clauses, children, tone = 'neutral', basis, size = 'md', className }: VerdictLineProps) {
  const kept = clauses ? clauses.filter(present) : present(children) ? [children] : [];
  if (kept.length === 0) return null;

  return (
    <div data-slot="verdict-line" data-tone={tone} className={cn('min-w-0', className)}>
      <p
        className={cn(
          'flex items-baseline gap-2 font-fw-sans text-text-primary text-pretty',
          size === 'lg' ? 'text-title-3 font-normal leading-7' : 'text-body',
        )}
      >
        <span
          aria-hidden="true"
          className={cn('relative -top-px inline-block size-2 flex-shrink-0 rounded-full', MARK[tone])}
        />
        <span className="min-w-0">
          {kept.map((c, i) => (
            <Fragment key={i}>
              {i > 0 ? ' ' : null}
              {c}
            </Fragment>
          ))}
        </span>
      </p>
      {basis ? <p className="mt-1 pl-4 font-fw-sans text-caption text-text-secondary">{basis}</p> : null}
    </div>
  );
}

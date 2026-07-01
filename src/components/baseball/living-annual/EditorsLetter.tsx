'use client';

/**
 * EditorsLetter — the composed empty & error state (spec §6 #3, §7).
 *
 * This REPLACES yellow warning boxes everywhere. Day-one emptiness and soft
 * errors read like a signed editor's letter, not a broken CRM: a serif letter
 * voice on Paper stock with an ink rule that DRAWS on mount. Optional
 * `STANDING BY` live breathing dot marks a surface genuinely awaiting data.
 *
 * Ink follows the lane: `team` green (default, team/dev), `pursuit` clay
 * (recruiting). Reduced motion → rule drawn, dot solid (no breathing).
 */
import { m, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { PaperCard } from './PaperCard';
import { rulesDraw } from './motion';

export interface EditorsLetterProps {
  /** The letter's headline, e.g. `Standing by — awaiting first pitch`. */
  title: string;
  /** The letter body — serif reading voice. */
  body?: ReactNode;
  /** Lane ink for the rule + dot (default team green). */
  ink?: 'team' | 'pursuit';
  /** Show the `STANDING BY` live breathing dot. */
  live?: boolean;
  /** Override the live label. */
  liveLabel?: string;
  /** Signature / desk line, e.g. `— From the desk of CoachHelm`. */
  signoff?: ReactNode;
  /** Optional call-to-action row. */
  action?: ReactNode;
  className?: string;
}

const INK: Record<'team' | 'pursuit', { text: string; bg: string; varRef: string }> = {
  team: { text: 'text-grade-plus', bg: 'bg-grade-plus', varRef: 'var(--grade-plus)' },
  pursuit: { text: 'text-pursuit', bg: 'bg-pursuit', varRef: 'var(--pursuit-ink)' },
};

export function EditorsLetter({
  title,
  body,
  ink = 'team',
  live = false,
  liveLabel = 'Standing by',
  signoff,
  action,
  className,
}: EditorsLetterProps) {
  const reduced = useReducedMotion() ?? false;
  const tone = INK[ink];

  return (
    <PaperCard className={cn('px-7 py-8', className)}>
      {live ? (
        <span className={cn('mb-3 inline-flex items-center gap-2 text-eyebrow font-semibold uppercase tracking-[0.14em]', tone.text)}>
          <m.span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: tone.varRef }}
            animate={reduced ? undefined : { opacity: [1, 0.3, 1], scale: [1, 0.82, 1] }}
            transition={reduced ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          {liveLabel}
        </span>
      ) : null}

      {/* Ink rule — the signature draw */}
      <m.div
        aria-hidden
        initial="hidden"
        animate="visible"
        variants={rulesDraw(reduced)}
        className={cn('mb-4 h-[2px] w-14 origin-left rounded-full', tone.bg)}
      />

      <h3 className="font-serif text-2xl font-normal leading-tight text-text-primary">{title}</h3>

      {body ? <div className="mt-3 max-w-prose font-serif text-body-lg leading-relaxed text-text-secondary">{body}</div> : null}

      {signoff ? <p className="mt-4 font-serif text-sm italic text-text-tertiary">{signoff}</p> : null}

      {action ? <div className="mt-6">{action}</div> : null}
    </PaperCard>
  );
}

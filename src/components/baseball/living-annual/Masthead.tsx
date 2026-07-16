'use client';

/**
 * Masthead — the two-line editorial name block (spec §4.1, §7).
 *
 * Given name in serif regular over `SURNAME` in serif small-caps — a player
 * or program set like a magazine masthead. On mount both lines SETTLE in
 * (staggered). Optional dateline eyebrow + die-cut registration tick.
 *
 * `scrollShrink` opts into the passport behavior: the name scales toward a
 * sticky byline as the page scrolls (transform-only, GPU-cheap). Reduced
 * motion → no scroll transform and no settle (names render final).
 *
 * `accentRule` (founder addendum) hangs a bold section accent under the name —
 * GREEN in team lanes, clay in the War Room — the visible green wayfinding a
 * section masthead should carry.
 */
import { m, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Eyebrow } from './Eyebrow';
import { inkColumn, inkSettles, rulesDraw } from './motion';

const ACCENT_RULE: Record<'team' | 'pursuit', string> = {
  team: 'bg-grade-plus',
  pursuit: 'bg-pursuit',
};

export interface MastheadProps {
  /** Given name — serif regular. */
  given: string;
  /** Surname — serif small-caps, the dominant line. */
  surname: string;
  /** Dateline segments (rendered via <Eyebrow>) or free content. */
  dateline?: ReactNode;
  /** Lane ink for the dateline + registration tick. */
  ink?: 'team' | 'pursuit';
  /** Die-cut registration crop-mark at the top-left. */
  registrationTick?: boolean;
  /** Bold lane-ink section accent rule under the name (green in team lanes). */
  accentRule?: boolean;
  /** Scroll-linked shrink-to-byline behavior. */
  scrollShrink?: boolean;
  className?: string;
}

export function Masthead({
  given,
  surname,
  dateline,
  ink = 'team',
  registrationTick = false,
  accentRule = false,
  scrollShrink = false,
  className,
}: MastheadProps) {
  const reduced = useReducedMotion() ?? false;

  // Hooks must run unconditionally; the transform is only APPLIED when the
  // scroll-shrink behavior is on and reduced motion is off.
  const { scrollY } = useScroll();
  const scale = useTransform(scrollY, [0, 160], [1, 0.62]);
  const y = useTransform(scrollY, [0, 160], [0, -8]);
  const active = scrollShrink && !reduced;

  const container = inkColumn(reduced);
  const item = inkSettles(reduced);

  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={container}
      style={active ? { scale, y, transformOrigin: 'left top' } : undefined}
      className={cn('relative min-w-0', className)}
    >
      {registrationTick ? (
        <span aria-hidden className="pointer-events-none absolute -left-2 -top-2 h-3.5 w-3.5">
          <span className={cn('absolute left-0 top-0 h-px w-3.5', ink === 'team' ? 'bg-grade-plus' : 'bg-pursuit')} />
          <span className={cn('absolute left-0 top-0 h-3.5 w-px', ink === 'team' ? 'bg-grade-plus' : 'bg-pursuit')} />
        </span>
      ) : null}

      {dateline ? (
        <m.div variants={item} className="mb-2">
          {typeof dateline === 'string' ? <Eyebrow ink={ink}>{dateline}</Eyebrow> : dateline}
        </m.div>
      ) : null}

      <m.div
        variants={item}
        className="break-words font-annual text-3xl font-normal leading-[0.95] text-text-primary md:text-4xl"
      >
        {given}
      </m.div>
      <m.div
        variants={item}
        className="break-words font-annual text-5xl font-medium uppercase leading-[0.9] tracking-tight text-text-primary md:text-7xl"
        style={{ fontVariant: 'small-caps' }}
      >
        {surname}
      </m.div>

      {accentRule ? (
        <m.div
          aria-hidden
          variants={rulesDraw(reduced)}
          className={cn('mt-3 h-[3px] w-16 origin-left rounded-full', ACCENT_RULE[ink])}
        />
      ) : null}
    </m.div>
  );
}

'use client';

/**
 * RuledStatLine — THE signature atom of the Living Annual.
 *
 * A small-caps, hung-left label sits above a serif ink numeral that rests ON a
 * hairline baseline rule. On mount the rule DRAWS (`scaleX 0→1`, spec §4.4 #2)
 * and the numeral SETTLES in (opacity + translateY + blur). The value rolls via
 * `<StatReadout>` (odometer truth).
 *
 * Stacks fractally: three of these make a slash line (`.341 / .420 / .611`),
 * a column of them makes a passport stat stack.
 *
 * Variants:
 *   • `verified` → a green `ON THE RECORD` check on the label row.
 *   • `ink`      → the lane accent: `team` = green (team/dev), `pursuit` = clay
 *     (recruiting). The numeral itself stays graphite; ink tints the check.
 *   • `ghost`    → 40% placeholder for an unfilled measurable (em-dash figure).
 *
 * `prefers-reduced-motion` → rule renders drawn, numeral set, no pulse.
 */
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { StatReadout } from './StatReadout';
import { inkSettles, rulesDraw } from './motion';

export interface RuledStatLineProps {
  /** Small-caps measurable name, e.g. `60-YARD`, `EXIT VELO`, `POP TIME`. */
  label: string;
  /** The measurable. Numbers roll; strings render statically. Ignored when `ghost`. */
  value: number | string;
  /** Trailing unit, set in small mono figures (e.g. `MPH`, `SEC`). */
  unit?: string;
  /** `hero` = passport/cover numeral; `row` = record-book row numeral. */
  size?: 'hero' | 'row';
  /** Verified measurable — wears the `ON THE RECORD` check. */
  verified?: boolean;
  /** Lane ink for the accent: team (green) or pursuit (clay). */
  ink?: 'team' | 'pursuit';
  /** Unfilled measurable — ghosted at 40%, waiting to be filled. */
  ghost?: boolean;
  /**
   * Render the numeral itself in the lane ink (green/clay) for emphasis instead
   * of graphite. Use sparingly — the point of the graphite default is maximum
   * contrast; emphasis is for a headline figure that should read green.
   */
  emphasis?: boolean;
  /**
   * This value leads its column (team best). Renders the numeral green and hangs
   * a small green `LEADS` tick on the label row — so the eye lands on the green.
   */
  leader?: boolean;
  /** Decimals for a numeric value. */
  decimals?: number;
  className?: string;
}

const INK_TEXT: Record<'team' | 'pursuit', string> = {
  team: 'text-grade-plus',
  pursuit: 'text-pursuit',
};

// The baseline rule carries the lane ink (green in team lanes, clay in the War
// Room) — NOT a faint gray hairline. This is the primary source of green
// presence + crisp row separation the founder asked for.
const RULE_INK: Record<'team' | 'pursuit', string> = {
  team: 'bg-grade-plus',
  pursuit: 'bg-pursuit',
};

function OnTheRecordCheck({ ink }: { ink: 'team' | 'pursuit' }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-eyebrow uppercase tracking-[0.14em]', INK_TEXT[ink])}>
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M2.5 6.5 5 9l4.5-5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      On the Record
    </span>
  );
}

export function RuledStatLine({
  label,
  value,
  unit,
  size = 'row',
  verified = false,
  ink = 'team',
  ghost = false,
  emphasis = false,
  leader = false,
  decimals = 0,
  className,
}: RuledStatLineProps) {
  const reduced = useReducedMotion() ?? false;
  const settle = inkSettles(reduced);
  const rule = rulesDraw(reduced);
  const numeralSize = size === 'hero' ? 'text-ink-hero' : 'text-ink';
  // Numeral is graphite by default (max contrast); green when it's an emphasis
  // figure or the column leader. A ghost placeholder stays neutral.
  const numeralInk = !ghost && (emphasis || leader) ? INK_TEXT[ink] : 'text-text-primary';

  return (
    <div className={cn('flex flex-col gap-1', ghost && 'opacity-40', className)}>
      {/* Label row — small-caps, hung left */}
      <div className="flex items-center justify-between gap-4">
        <span className="text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">{label}</span>
        <span className="inline-flex items-center gap-2">
          {leader && !ghost ? (
            <span className="inline-flex items-center gap-1 text-eyebrow font-semibold uppercase tracking-[0.14em] text-grade-plus">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-grade-plus" />
              Leads
            </span>
          ) : null}
          {verified && !ghost ? <OnTheRecordCheck ink={ink} /> : null}
        </span>
      </div>

      {/* Numeral sitting ON the rule */}
      <div className="relative">
        <m.div
          initial="hidden"
          animate="visible"
          variants={settle}
          className={cn('flex items-baseline gap-2 pb-1 font-serif leading-none', numeralInk, numeralSize)}
        >
          {ghost ? (
            <span aria-hidden className="tabular-nums">
              —
            </span>
          ) : (
            <StatReadout value={value} decimals={decimals} className="text-[inherit]" ariaLabel={label} />
          )}
          {unit ? (
            <span className="font-fw-mono text-[0.32em] uppercase tracking-[0.12em] text-text-tertiary">{unit}</span>
          ) : null}
        </m.div>
        {/* Baseline rule carries the lane ink (green/clay), not a gray hairline;
            a ghost row keeps a faint hairline so an unfilled measurable reads empty. */}
        <m.div
          aria-hidden
          initial="hidden"
          animate="visible"
          variants={rule}
          className={cn('h-[1.5px] origin-left', ghost ? 'bg-[color:var(--hairline)]' : RULE_INK[ink])}
        />
      </div>
    </div>
  );
}

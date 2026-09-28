'use client';

/**
 * ============================================================================
 * CoachHelm · Home — the greeting
 * ----------------------------------------------------------------------------
 * The first thing on the CoachHelm page's Home view: whose program this is,
 * and a status line with the roster size and how fresh the data is. Small,
 * but it is the difference between reading a number and trusting it.
 *
 * It used to carry quick-action chips, an "Ask about …" composer and the
 * program pulse as well. Asking now has its own tab (Chat), and the pulse's
 * findings open that tab's empty state, so the greeting stands alone.
 *
 * The pulse is deterministic and database-backed (see `program-pulse.ts`);
 * the counts below are read straight off it.
 * ========================================================================== */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { getTimeOfDay } from '@/lib/utils/time-of-day';
import { formatDateOnlyShort } from '@/lib/golf/date-only';
import type { ProgramPulse } from '@/lib/coachhelm/v3/chat/program-pulse';

export interface CommandOpeningProps {
  teamName: string;
  coachFirstName: string | null;
  pulse: ProgramPulse;
  className?: string;
}

export function CommandOpening({ teamName, coachFirstName, pulse, className }: CommandOpeningProps) {
  // Was the hardcoded literal "Morning," — so the Brief greeted every coach
  // with "Morning" at any hour, including 7pm, while the dashboard on the same
  // session correctly said "Good evening". Bucket boundaries come from the
  // shared util so the two surfaces can't drift again.
  //
  // Resolved in an effect, not at render: this component is SSR'd, and reading
  // the clock during render makes the server (UTC) and the client (local)
  // disagree — a hydration mismatch. 'Welcome back' is the initial value
  // because it is the one greeting that is never wrong at any hour.
  const [timeWord, setTimeWord] = React.useState('Welcome back');
  React.useEffect(() => {
    const t = getTimeOfDay();
    setTimeWord(
      t === 'morning' ? 'Morning'
        : t === 'afternoon' ? 'Afternoon'
        : t === 'evening' ? 'Evening'
        : 'Welcome back',
    );
  }, []);

  return (
    <header className={cn('flex flex-col', className)}>
      <h1 className="font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
        {coachFirstName ? `${timeWord}, ${coachFirstName}.` : teamName}
      </h1>
      <StatusLine pulse={pulse} teamName={teamName} />
    </header>
  );
}

function StatusLine({ pulse, teamName }: { pulse: ProgramPulse; teamName: string }) {
  // "Today / 3 days ago" reads the clock, so it is computed after mount; the
  // server and first client render show the calendar date (HYD-12).
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const bits: string[] = [teamName];
  bits.push(`${pulse.active_roster} active player${pulse.active_roster === 1 ? '' : 's'}`);
  if (pulse.latest_round_at) {
    bits.push(
      `last round ${mounted ? relativeDays(pulse.latest_round_at) : formatDateOnlyShort(pulse.latest_round_at)}`,
    );
  } else {
    bits.push('no rounds recorded yet');
  }
  return (
    <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">{bits.join(' · ')}</p>
  );
}

/**
 * `iso` is `golf_rounds.round_date` — a Postgres `date`, serialized by
 * PostgREST as a bare `YYYY-MM-DD`. It carries no time-of-day and no offset,
 * so it must never be formatted through an ambient-zone read.
 *
 * `new Date('2026-08-02')` is UTC midnight; formatting that without pinning
 * the formatter to UTC prints "Aug 1" everywhere west of Greenwich, and
 * disagrees between SSR (server zone) and hydration (client zone) — the string
 * changes under the reader. Observed in production 2026-08-17: a stored
 * `round_date` of 2026-08-02 rendered as "last round Aug 1".
 *
 * `formatDateOnlyShort` pulls the Y/M/D digits straight out of the string, so
 * the calendar day is identical in every zone. See `src/lib/golf/date-only.ts`.
 *
 * The elapsed-day count below is deliberately still an absolute-instant
 * measure. Both operands are instants, so it is zone-independent, but its day
 * boundary is UTC's — a round logged late in the US evening can read
 * "yesterday" within hours. Fixing that needs the TEAM's timezone, which this
 * component is not given; it is not the off-by-one bug above.
 */
export function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return formatDateOnlyShort(iso);
}

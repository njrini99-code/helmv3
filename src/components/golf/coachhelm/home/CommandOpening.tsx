'use client';

/**
 * ============================================================================
 * CoachHelm · Brief — the command opening
 * ----------------------------------------------------------------------------
 * The first viewport of `/golf/dashboard/intelligence`. Above the existing
 * Triage Desk, which is preserved intact below it.
 *
 * Five things, in this order, because that is the order a coach uses them:
 *
 *   1. A greeting that says whose program this is.
 *   2. A live status line — roster size and how fresh the data is. Small, but
 *      it is the difference between reading a number and trusting it.
 *   3. Contextual actions above the composer, so the capability is discoverable
 *      without having to guess the phrasing.
 *   4. The composer.
 *   5. Program pulse — the few things that actually changed.
 *
 * The pulse is deterministic and database-backed (see `program-pulse.ts`); this
 * component only renders what it was handed. No count in this file is computed
 * from anything other than the array it is describing, which is the specific
 * discipline that keeps "four players have not responded" true.
 * ========================================================================== */

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTimeOfDay } from '@/lib/utils/time-of-day';
import type { ProgramPulse, PulseItem } from '@/lib/coachhelm/v3/chat/program-pulse';
import { PromptComposer, type ComposerPlayer } from '../chat/PromptComposer';
import type { ChatContextChip } from '../chat/useCoachHelmChat';

/** The five openers. Each seeds the composer — none sends blind. */
const QUICK_ACTIONS: { label: string; seed: string; complete: boolean }[] = [
  { label: 'Brief me', seed: 'Brief me on the team', complete: true },
  { label: 'Analyze a player', seed: 'Analyze ', complete: false },
  { label: 'Compare players', seed: 'Compare ', complete: false },
  { label: 'Plan practice', seed: 'Create a recurring practice every ', complete: false },
  { label: 'Send a team update', seed: 'Draft a team update about ', complete: false },
];

export interface CommandOpeningProps {
  teamName: string;
  coachFirstName: string | null;
  players: ComposerPlayer[];
  pulse: ProgramPulse;
  /** Sends the question and navigates to the full Ask surface. */
  onAsk: (text: string) => void;
  className?: string;
}

export function CommandOpening({
  teamName,
  coachFirstName,
  players,
  pulse,
  onAsk,
  className,
}: CommandOpeningProps) {
  const [context, setContext] = React.useState<ChatContextChip[]>([]);
  // `seed` remounts the composer with a starting value. A quick action that
  // SENT immediately would fire half a sentence ("Analyze "), so anything that
  // needs the coach to finish the thought seeds the field instead.
  const [seed, setSeed] = React.useState<{ key: number; text: string }>({ key: 0, text: '' });

  const addContext = React.useCallback((chip: ChatContextChip) => {
    setContext((prev) => (prev.some((c) => c.id === chip.id) ? prev : [...prev, chip]));
  }, []);
  const removeContext = React.useCallback((id: string) => {
    setContext((prev) => prev.filter((c) => c.id !== id));
  }, []);

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

  const runQuickAction = React.useCallback(
    (action: { label: string; seed: string; complete: boolean }) => {
      if (action.complete) {
        onAsk(action.seed);
        return;
      }
      setSeed((prev) => ({ key: prev.key + 1, text: action.seed }));
    },
    [onAsk],
  );

  return (
    <section className={cn('flex flex-col gap-5', className)} aria-label="Ask CoachHelm">
      <header>
        <h1 className="font-fw-display text-h1 font-semibold tracking-[-0.02em] text-text-primary">
          {coachFirstName ? `${timeWord}, ${coachFirstName}.` : teamName}
        </h1>
        <StatusLine pulse={pulse} teamName={teamName} />
      </header>

      <div>
        {/* Contextual actions sit ABOVE the field: they are how you decide what
            to ask, so they have to be readable before the cursor is in the box. */}
        <ul className="-mx-4 mb-2.5 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {QUICK_ACTIONS.map((a) => (
            <li key={a.label} className="shrink-0 snap-start">
              {/* eslint-disable-next-line helm/no-raw-button -- quick-action chip — a rounded-full pill of its own scale */}
              <button
                type="button"
                onClick={() => runQuickAction(a)}
                className={cn(
                  'inline-flex min-h-[40px] items-center rounded-full border border-border-subtle bg-surface px-3.5',
                  'font-fw-sans text-body-sm text-text-secondary transition-colors',
                  'hover:border-accent-300 hover:text-text-primary',
                  'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
                )}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>

        <PromptComposer
          key={seed.key}
          initialValue={seed.text}
          onSend={onAsk}
          players={players}
          context={context}
          onAddContext={addContext}
          onRemoveContext={removeContext}
          placeholder={`Ask about ${teamName}`}
        />
      </div>

      <ProgramPulsePanel pulse={pulse} onAsk={onAsk} />
    </section>
  );
}

function StatusLine({ pulse, teamName }: { pulse: ProgramPulse; teamName: string }) {
  const bits: string[] = [teamName];
  bits.push(`${pulse.active_roster} active player${pulse.active_roster === 1 ? '' : 's'}`);
  if (pulse.latest_round_at) {
    bits.push(`last round ${relativeDays(pulse.latest_round_at)}`);
  } else {
    bits.push('no rounds recorded yet');
  }
  return (
    <p className="mt-1 font-fw-sans text-body-sm text-text-tertiary">{bits.join(' · ')}</p>
  );
}

function ProgramPulsePanel({
  pulse,
  onAsk,
}: {
  pulse: ProgramPulse;
  onAsk: (text: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  // Three by default. A pulse that shows everything it found is a wall of cards
  // and gets scrolled past; the point is the few things that changed.
  const visible = expanded ? pulse.items : pulse.items.slice(0, 3);

  if (pulse.items.length === 0) {
    return (
      <section aria-label="Program pulse" className="rounded-card border border-border-subtle bg-surface px-4 py-3.5">
        <h2 className="font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
          Program pulse
        </h2>
        <p className="mt-1.5 font-fw-sans text-body-sm text-text-secondary">
          {pulse.active_roster === 0
            ? 'No active players yet.'
            : 'Nothing needs your attention right now.'}
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Program pulse" className="rounded-card border border-border-subtle bg-surface">
      <h2 className="border-b border-border-subtle px-4 py-2.5 font-fw-sans text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
        Program pulse
      </h2>
      <ul>
        {visible.map((item) => (
          <PulseRow key={item.id} item={item} onAsk={onAsk} />
        ))}
      </ul>
      {pulse.items.length > 3 && (
        // eslint-disable-next-line helm/no-raw-button -- expand/collapse row spanning the panel foot
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'min-h-[44px] w-full border-t border-border-subtle px-4 text-left',
            'font-fw-sans text-caption text-text-tertiary transition-colors hover:text-text-primary',
            'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
        >
          {expanded ? 'Show less' : `Show ${pulse.items.length - 3} more`}
        </button>
      )}
    </section>
  );
}

function PulseRow({ item, onAsk }: { item: PulseItem; onAsk: (text: string) => void }) {
  return (
    <li className="border-b border-border-subtle px-4 py-3 last:border-0">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
            item.tone === 'attention'
              ? 'bg-accent-600'
              : item.tone === 'positive'
                ? 'bg-accent-300'
                : 'bg-border-strong',
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-fw-sans text-body-sm font-medium text-text-primary [text-wrap:pretty]">
            {item.headline}
          </p>
          {/* Evidence is always shown, never behind a disclosure. A claim a
              coach has to click to verify is a claim they will act on unverified. */}
          <p className="mt-0.5 font-fw-sans text-caption text-text-tertiary [text-wrap:pretty]">
            {item.evidence}
          </p>

          {(item.ask || item.action) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {item.ask && (
                // eslint-disable-next-line helm/no-raw-button -- pulse-row ask chip — a compact rounded-full pill
                <button
                  type="button"
                  onClick={() => onAsk(item.ask!)}
                  className={cn(
                    'inline-flex min-h-[36px] items-center rounded-full border border-border-subtle px-3',
                    'font-fw-sans text-caption text-text-secondary transition-colors',
                    'hover:border-accent-300 hover:text-text-primary',
                    'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                  )}
                >
                  Ask CoachHelm
                </button>
              )}
              {item.action && (
                <Link
                  href={item.action.href}
                  className={cn(
                    'inline-flex min-h-[36px] items-center gap-1 rounded-full px-1',
                    'font-fw-sans text-caption text-accent-700 transition-colors hover:text-accent-800',
                    'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                  )}
                >
                  {item.action.label}
                  <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

'use client';

/**
 * ============================================================================
 * CoachHelm · chat · task activity — one surface for "what is it doing"
 * ----------------------------------------------------------------------------
 * Replaces a single floating progress line that showed only the LATEST step and
 * threw the rest away, plus a separate "Thinking" indicator that could sit
 * directly beneath it saying the same thing twice.
 *
 * Everything here is derived from state the stream already publishes. The
 * server writes one `data-progress` part per tool call (`{ label, tool }`, with
 * a stable id) and one `data-evidence` part when that call returns. No backend
 * change was needed or made:
 *
 *   · every announced step is kept, in order, instead of being replaced;
 *   · the last one is ACTIVE while the turn is streaming, the rest are done;
 *   · when the turn ends the whole list collapses to one receipt line.
 *
 * What it deliberately does NOT do:
 *
 *   · invent future steps. Only the tool calls that have actually been
 *     announced are known, so a greyed-out "○ Preparing recommendations" would
 *     be a guess drawn as a plan.
 *   · show a percentage. Nothing upstream knows how many tools a turn will use.
 *   · show reasoning. These are operational labels ("Reading 28 recorded
 *     rounds"), never the model's chain of thought.
 *   · time a restored conversation. The elapsed figure is real wall-clock,
 *     measured only when this component actually observed the turn finish;
 *     reopening yesterday's thread shows the receipt without a duration rather
 *     than a fabricated one.
 * ========================================================================== */

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';

export interface TaskStep {
  id: string;
  label: string;
}

export interface TaskActivityProps {
  steps: TaskStep[];
  /** True while this turn is still streaming. */
  busy: boolean;
  /** Evidence returned so far — the receipt's numbers come from here. */
  envelopes: ToolEnvelope[];
  onStop?: () => void;
  className?: string;
}

export function TaskActivity({ steps, busy, envelopes, onStop, className }: TaskActivityProps) {
  const elapsed = useElapsedWhileBusy(busy);

  if (steps.length === 0) return null;

  // ── Finished: collapse to a receipt ──────────────────────────────────────
  if (!busy) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-fw-sans text-caption text-text-secondary">
        <Check aria-hidden className="h-3.5 w-3.5 shrink-0 text-accent-700" />
        {describeWork(steps, envelopes, elapsed)}
      </p>
    );
  }

  // ── Working ──────────────────────────────────────────────────────────────
  const lastIndex = steps.length - 1;

  return (
    <section
      className={cn('rounded-fw-lg border border-border-subtle bg-surface-sunken p-3', className)}
      aria-label="Progress"
    >
      <div className="flex items-start justify-between gap-3">
        {/*
          The list IS the live region, announcing each step as it is added.
          A separate `sr-only` copy of the active label was the obvious way to
          do this and put the same sentence in the DOM twice — read once as a
          list item and again as the announcement.
        */}
        <ol
          className="flex min-w-0 flex-col gap-1.5"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {steps.map((step, i) => {
            const active = i === lastIndex;
            return (
              <li
                key={step.id}
                className="flex items-start gap-2.5 font-fw-sans text-caption"
                // Only the step that is actually changing is announced. Marking
                // the whole list live would re-read every completed step each
                // time a new one arrives.
                aria-current={active ? 'step' : undefined}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="relative mt-[6px] h-[2px] w-7 shrink-0 overflow-hidden rounded-full bg-border-subtle"
                  >
                    <span className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-accent-600 motion-safe:animate-scan" />
                  </span>
                ) : (
                  <Check aria-hidden className="mt-[1px] h-3.5 w-3.5 shrink-0 text-accent-700" />
                )}
                {/*
                  Completed steps stay at `text-text-secondary` — the same
                  weight as the active one. Fading them out would be dimming
                  real text to signal "past", and a coach scanning what was
                  actually read needs every line legible.
                */}
                <span className="min-w-0 text-text-secondary [overflow-wrap:anywhere]">
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        {onStop && (
          // eslint-disable-next-line helm/no-raw-button -- compact inline stop inside the activity surface
          <button
            type="button"
            onClick={onStop}
            className={cn(
              'shrink-0 rounded-fw-md border border-border-subtle px-2.5 py-1',
              'font-fw-sans text-caption text-text-secondary transition-colors',
              'hover:bg-surface hover:text-text-primary',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            )}
          >
            Stop
          </button>
        )}
      </div>

    </section>
  );
}

/**
 * Wall-clock for the turn, in seconds, or null.
 *
 * Starts when this component first sees `busy`, stops when it sees the turn
 * end. Null on a thread restored from history: that turn's real duration is not
 * something the browser can know after the fact, and a plausible-looking number
 * is worse than none.
 */
function useElapsedWhileBusy(busy: boolean): number | null {
  const startedAt = React.useRef<number | null>(null);
  const [elapsed, setElapsed] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (busy) {
      if (startedAt.current === null) startedAt.current = performance.now();
      return;
    }
    if (startedAt.current !== null) {
      setElapsed((performance.now() - startedAt.current) / 1000);
      startedAt.current = null;
    }
  }, [busy]);

  return elapsed;
}

/**
 * The receipt sentence.
 *
 * Sample sizes are taken as the MAX per unit, never the sum. Four metrics each
 * measured over the same 15 rounds is fifteen rounds read, not sixty — summing
 * would inflate the figure every time a tool returned more than one number
 * about the same window, which is the normal case.
 */
export function describeWork(
  steps: TaskStep[],
  envelopes: ToolEnvelope[],
  elapsedSeconds: number | null,
): string {
  const measurements = envelopes.flatMap((e) => e.measurements);

  const maxBy = (unit: string) =>
    measurements
      .filter((m) => m.sample_unit === unit)
      .reduce((max, m) => Math.max(max, m.sample_size), 0);

  const rounds = maxBy('rounds');
  const players = new Set(
    measurements.filter((m) => m.entity.kind === 'player').map((m) => m.entity.id),
  ).size;

  const bits: string[] = [];
  if (rounds > 0) bits.push(`${rounds} round${rounds === 1 ? '' : 's'}`);
  if (players > 1) bits.push(`${players} players`);
  if (bits.length === 0) {
    bits.push(`${steps.length} step${steps.length === 1 ? '' : 's'}`);
  }

  const work = `Read ${bits.join(' across ')}`;
  return elapsedSeconds === null ? work : `${work} · ${elapsedSeconds.toFixed(1)}s`;
}

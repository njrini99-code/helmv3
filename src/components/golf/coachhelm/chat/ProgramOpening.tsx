'use client';

/**
 * ============================================================================
 * CoachHelm · chat · the opening
 * ----------------------------------------------------------------------------
 * What fills an empty Ask page.
 *
 * It used to be nothing. A greeting and a composer floated in the vertical
 * middle of a full-height column, so the top third of the page was blank canvas
 * and the coach's first impression of the product was an empty room with a text
 * box in it.
 *
 * The fix is not decoration. The page ALREADY reads the program pulse on the
 * server — five ranked findings, each with a headline, the evidence behind it,
 * a tone, somewhere to go and a question worth asking. All of that was being
 * thrown away: `suggestionsFromPulse` kept only `item.ask` and rendered the
 * bare strings as pills. A coach saw "Why have 3 players not responded?" with
 * no indication of what prompted it, which reads as a canned prompt rather than
 * something the system actually found.
 *
 * So the opening shows the finding, not just the question it implies:
 *
 *     ● 3 players have not responded for Wednesday Practice
 *       Wed 4:00 PM · 5 of 8 responded                          Calendar ↗
 *
 * Pressing the row asks CoachHelm about it. The row IS the suggestion, with its
 * reason attached — which is the difference between a prompt library and a
 * program that noticed something.
 *
 * Structure note: the row's ask-button and its `action` link are SIBLINGS, not
 * nested. A link inside a button is invalid HTML and a hydration-crash class —
 * the same trap `BentoCell` documents.
 * ========================================================================== */

import Link from 'next/link';
import { ArrowUpRight, CornerDownLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PulseItem, PulseTone } from '@/lib/coachhelm/v3/chat/program-pulse';

/**
 * Tone is carried by a dot, never by a coloured side-rail and never by tinting
 * the headline — the standing rule, and the reason the text here is always
 * `text-text-primary` regardless of urgency.
 */
const TONE_DOT: Record<PulseTone, string> = {
  attention: 'bg-fw-warning',
  positive: 'bg-fw-success',
  neutral: 'bg-border-strong',
};

const TONE_LABEL: Record<PulseTone, string> = {
  attention: 'Needs attention',
  positive: 'Improving',
  neutral: 'For information',
};

/**
 * How many findings the opening shows.
 *
 * The pulse routinely returns eight. All eight is a wall — the coach scrolls
 * past an unranked-looking list to reach a composer that is the actual point of
 * the page, and the ranking that `weight` encodes stops being legible because
 * everything is present. Five is the most that reads as "here is what stands
 * out" rather than "here is a report".
 *
 * The remainder is NOT dropped silently — the count and a route to the rest are
 * printed below. A capped list that looks complete is worse than no cap.
 */
const VISIBLE_FINDINGS = 5;

export interface ProgramOpeningProps {
  items: PulseItem[];
  /** Honest coverage line, e.g. "6 of 8 players have recorded rounds". */
  coverage?: string | null;
  /** Preformatted on the server — formatting a time on the client mismatches. */
  asOfLabel?: string | null;
  onAsk: (text: string) => void;
  className?: string;
}

export function ProgramOpening({
  items,
  coverage,
  asOfLabel,
  onAsk,
  className,
}: ProgramOpeningProps) {
  if (items.length === 0) return null;

  const shown = items.slice(0, VISIBLE_FINDINGS);
  const remaining = items.length - shown.length;

  /**
   * The top-weighted finding is pulled out and set at display weight; the rest
   * stay as the dense hairline rows below.
   *
   * `items` arrives ranked by `weight`, and the cap above exists specifically
   * to keep that ranking legible — but every row used to render identically
   * (same 13px headline, same 12px evidence, same 6px dot), so the ranking
   * lived in the data and was invisible on screen. A screen where the first
   * and fifth finding look the same has not decided what matters, and reads as
   * a list rather than a briefing.
   *
   * One large statement over four quiet rows is the whole hierarchy: the coach
   * reads the lead from across the room, and the remainder stays scannable
   * without competing. No new data is needed to do this — `weight` already
   * said which one it is.
   */
  const [lead, ...rest] = shown;

  return (
    <section className={cn('mt-6', className)} aria-labelledby="program-opening-heading">
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="program-opening-heading"
          className="font-fw-sans text-eyebrow uppercase tracking-[0.12em] text-text-tertiary"
        >
          Where your program stands
        </h2>
        {asOfLabel && (
          <span className="shrink-0 font-fw-mono text-caption tabular-nums text-text-tertiary">
            {asOfLabel}
          </span>
        )}
      </div>

      {lead && <LeadFinding item={lead} onAsk={onAsk} />}

      <ul className={cn(rest.length > 0 && 'mt-1')}>
        {rest.map((item, i) => (
          <li
            key={item.id}
            className={cn(
              'group/row flex items-start gap-3 border-t border-border-subtle py-2.5',
              'motion-safe:animate-fade-up',
            )}
            // A short stagger, not a cascade. Every row is on screen inside
            // 240ms — this is arrival, not choreography.
            style={{ animationDelay: `${Math.min(i, 5) * 40}ms`, animationFillMode: 'backwards' }}
          >
            <span
              aria-hidden
              className={cn('mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full', TONE_DOT[item.tone])}
            />

            <Finding item={item} onAsk={onAsk} />

            {item.action && (
              <Link
                href={item.action.href}
                className={cn(
                  'mt-0.5 hidden shrink-0 items-center gap-1 rounded-fw-md px-2 py-1.5 sm:inline-flex',
                  'font-fw-sans text-caption text-text-secondary transition-colors',
                  'hover:bg-surface-sunken hover:text-text-primary',
                  'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                )}
              >
                {item.action.label}
                <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border-subtle pt-3">
        {coverage && (
          <p className="font-fw-sans text-caption text-text-secondary">{coverage}</p>
        )}
        {remaining > 0 && (
          <Link
            href="/golf/dashboard/intelligence"
            className={cn(
              'inline-flex items-center gap-1 rounded-fw-md font-fw-sans text-caption',
              'text-accent-700 transition-colors hover:text-fw-success-ink',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            )}
          >
            {remaining} more in Intelligence
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * The lead finding — the same data as a row, given the room to be read first.
 *
 * Type does the work, not colour or ornament: the headline steps from
 * `body-sm` (13px) to `h3`/`h2` (18/24px), which is the first time anything on
 * this surface leaves the 11–15px band the rest of the opening lives in. The
 * standing tone rule still holds — the dot carries urgency, the headline is
 * never tinted — so this reads as emphasis, not as an alert.
 */
function LeadFinding({ item, onAsk }: { item: PulseItem; onAsk: (text: string) => void }) {
  const headline = (
    <>
      <span className="sr-only">{TONE_LABEL[item.tone]}. </span>
      <span className="block text-balance font-fw-sans text-h3 text-text-primary sm:text-h2">
        {item.headline}
      </span>
      <span className="mt-1.5 block font-fw-sans text-body-sm text-text-secondary">
        {item.evidence}
      </span>
    </>
  );

  return (
    <div
      className={cn(
        'flex items-start gap-3 py-4 motion-safe:animate-fade-up',
        // A rule under the lead, not around it — the opening is a briefing on
        // the page, not a card floating on it.
        'border-b border-border-subtle',
      )}
      style={{ animationFillMode: 'backwards' }}
    >
      {/* Scaled with the type it sits beside; still a dot, still the only tone carrier. */}
      <span
        aria-hidden
        className={cn('mt-2.5 h-2 w-2 shrink-0 rounded-full sm:mt-3.5', TONE_DOT[item.tone])}
      />

      <div className="min-w-0 flex-1">
        {item.ask ? (
          // eslint-disable-next-line helm/no-raw-button -- a finding, not a <Button> pill
          <button
            type="button"
            onClick={() => onAsk(item.ask!)}
            className={cn(
              'group/lead -my-1 block w-full rounded-fw-md py-1 text-left',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            )}
          >
            {headline}
            <span
              className={cn(
                'mt-2.5 inline-flex items-start gap-1.5 font-fw-sans text-body-sm',
                'text-text-secondary transition-colors',
                'group-hover/lead:text-accent-700 group-focus-visible/lead:text-accent-700',
              )}
            >
              <CornerDownLeft aria-hidden className="mt-[5px] h-3.5 w-3.5 shrink-0" />
              {item.ask}
            </span>
          </button>
        ) : (
          headline
        )}
      </div>

      {/* Sibling of the button, never nested — a link inside a button is a hydration crash. */}
      {item.action && (
        <Link
          href={item.action.href}
          className={cn(
            'mt-1 hidden shrink-0 items-center gap-1 rounded-fw-md px-2 py-1.5 sm:inline-flex',
            'font-fw-sans text-caption text-text-secondary transition-colors',
            'hover:bg-surface-sunken hover:text-text-primary',
            'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
          )}
        >
          {item.action.label}
          <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

/**
 * The finding itself — a button when there is a question worth asking, plain
 * text when there is not.
 *
 * Not every pulse item earns an ask. Rendering one as a dead button teaches the
 * coach that rows here sometimes do nothing, which costs more than the
 * consistency is worth.
 */
function Finding({ item, onAsk }: { item: PulseItem; onAsk: (text: string) => void }) {
  const body = (
    <>
      <span className="block font-fw-sans text-body-sm font-medium text-text-primary">
        {item.headline}
      </span>
      <span className="mt-0.5 block font-fw-sans text-caption text-text-secondary">
        {item.evidence}
      </span>
    </>
  );

  if (!item.ask) {
    return (
      <div className="min-w-0 flex-1">
        <span className="sr-only">{TONE_LABEL[item.tone]}. </span>
        {body}
      </div>
    );
  }

  return (
    // eslint-disable-next-line helm/no-raw-button -- a finding row, not a <Button> pill
    <button
      type="button"
      onClick={() => onAsk(item.ask!)}
      className={cn(
        'group/ask -my-1 min-w-0 flex-1 rounded-fw-md py-1 pr-1 text-left',
        'outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
      )}
    >
      {/* The tone is in the dot, which a screen reader cannot see. */}
      <span className="sr-only">{TONE_LABEL[item.tone]}. </span>
      {body}
      {/*
        The ask sits at secondary weight and takes the accent only when the row
        is engaged. Printed in `accent-700` at rest it put a green sentence
        under all five findings at once, and five green lines down a cream page
        read as five warnings rather than five available questions — the accent
        stopped meaning anything because everything had it.

        This is a hierarchy token, not an opacity dim: the sentence is fully
        legible at rest, it simply is not the loudest thing in its own row. The
        headline above it is what the coach is reading first.
      */}
      <span
        className={cn(
          // `items-start`, not `items-center`: at 390px these asks wrap to two
          // lines and a centred glyph floats into the gutter between them.
          'mt-1.5 inline-flex items-start gap-1.5 font-fw-sans text-caption',
          'text-text-secondary transition-colors',
          'group-hover/row:text-accent-700 group-focus-visible/ask:text-accent-700',
        )}
      >
        <CornerDownLeft aria-hidden className="mt-[3px] h-3 w-3 shrink-0" />
        {item.ask}
      </span>
    </button>
  );
}

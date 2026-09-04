'use client';

/**
 * Fairway · messages · StructuredMessage — the Helm objects (§36-42).
 *
 * This is the layer that makes Helm's chat Helm's. A practice change, an RSVP,
 * a poll and a travel plan are REAL team objects, and rendering them as cards
 * inside the conversation is what stops a team's operations living in three
 * places at once.
 *
 * A Surface IS appropriate here, and deliberately is not for ordinary bubbles:
 * a structured message represents an object with state and actions, which is
 * exactly what a card means. A sentence someone typed is not.
 *
 * Everything renders from a NARROWED payload (see `parseStructuredPayload`) —
 * a malformed one produces no card at all rather than a card with blank
 * headings.
 */

import * as React from 'react';
import NumberFlow from '@number-flow/react';
import { CalendarDays, MapPin, Bus, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Surface } from '@/components/fairway/surfaces/surface';
import { Button } from '@/components/fairway/controls/button';
import { PressTarget } from '@/components/fairway/controls/press-target';
import {
  type StructuredPayload,
  RSVP_CHOICES,
  RSVP_LABELS,
  TRAVEL_ACK,
  formatEventWindow,
} from '@/lib/golf/structured-message';

export interface ResponseTallyLikeProp {
  counts: Readonly<Record<string, number>>;
  mine: string | null;
  total: number;
}

export interface StructuredMessageProps {
  payload: StructuredPayload;
  tally: ResponseTallyLikeProp;
  onRespond?: (choice: string) => void;
  /** Open a linked calendar event. Absent when the payload carries no eventId. */
  onOpenEvent?: (eventId: string) => void;
}

/** The small all-caps label that names what kind of object this is. */
function ObjectLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-fw-sans text-eyebrow font-semibold uppercase text-accent-700">
      {children}
    </span>
  );
}

function MetaRow({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 font-fw-sans text-body-sm text-text-secondary">
      <Icon size={14} aria-hidden="true" className="flex-shrink-0 text-text-tertiary" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function StructuredMessage({
  payload,
  tally,
  onRespond,
  onOpenEvent,
}: StructuredMessageProps) {
  // System narration is NOT a card and NOT a bubble — it is the thread telling
  // you something happened. Centred, quiet, no author, no avatar (§40).
  if (payload.kind === 'system') {
    return (
      <p className="px-4 py-1.5 text-center font-fw-sans text-caption text-text-tertiary">
        {payload.text}
      </p>
    );
  }

  return (
    <Surface
      padding="none"
      className="w-full max-w-[86%] overflow-hidden rounded-card px-3.5 py-3"
    >
      {payload.kind === 'practice' || payload.kind === 'event' ? (
        <div className="flex flex-col gap-2">
          <ObjectLabel>
            {payload.kind === 'practice' ? 'Practice updated' : 'Event'}
          </ObjectLabel>
          <p className="font-fw-sans text-body font-semibold text-text-primary">
            {payload.title}
          </p>
          <div className="flex flex-col gap-1">
            <MetaRow icon={CalendarDays}>
              {formatEventWindow(payload.startsAt, payload.endsAt)}
            </MetaRow>
            {payload.location ? <MetaRow icon={MapPin}>{payload.location}</MetaRow> : null}
          </div>

          {payload.kind === 'practice' && typeof payload.notifiedCount === 'number' ? (
            <p className="font-fw-sans text-caption text-text-tertiary">
              <NumberFlow value={payload.notifiedCount} /> players notified
            </p>
          ) : null}

          {payload.kind === 'event' && payload.notes?.length ? (
            <ul className="flex flex-col gap-0.5">
              {payload.notes.map(n => (
                <li key={n} className="font-fw-sans text-caption text-text-secondary">
                  {n}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Only when the object actually links somewhere. A "View in Calendar"
              that opens nothing is worse than no button (§37). */}
          {payload.eventId && onOpenEvent ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-0.5 w-full justify-between font-fw-sans"
              onClick={() => onOpenEvent(payload.eventId as string)}
            >
              View in Calendar
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {payload.kind === 'rsvp' ? (
        <div className="flex flex-col gap-2">
          <ObjectLabel>RSVP</ObjectLabel>
          <p className="font-fw-sans text-body font-semibold text-text-primary">
            {payload.title}
          </p>
          {payload.startsAt ? (
            <MetaRow icon={CalendarDays}>{formatEventWindow(payload.startsAt)}</MetaRow>
          ) : null}
          {payload.location ? <MetaRow icon={MapPin}>{payload.location}</MetaRow> : null}

          {/* Counts above the buttons, so the answer you are about to give sits
              next to what everyone else said. NumberFlow on the NUMBER only. */}
          <div className="flex gap-3 pt-0.5">
            {RSVP_CHOICES.map(c => (
              <span key={c} className="font-fw-sans text-caption text-text-secondary">
                {RSVP_LABELS[c]}{' '}
                <span className="font-semibold tabular-nums text-text-primary">
                  <NumberFlow value={tally.counts[c] ?? 0} />
                </span>
              </span>
            ))}
          </div>

          <div className="flex gap-1.5 pt-0.5">
            {RSVP_CHOICES.map(c => {
              const picked = tally.mine === c;
              return (
                <PressTarget
                  key={c}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onRespond?.(c)}
                  className={cn(
                    'flex-1 rounded-full px-3 py-2 text-center',
                    'font-fw-sans text-body-sm transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                    picked
                      ? 'bg-accent-650 font-medium text-text-on-accent'
                      : 'bg-surface-sunken text-text-secondary active:bg-surface',
                  )}
                >
                  {RSVP_LABELS[c]}
                </PressTarget>
              );
            })}
          </div>
        </div>
      ) : null}

      {payload.kind === 'poll' ? (
        <div className="flex flex-col gap-2">
          <p className="font-fw-sans text-body font-semibold text-text-primary">
            {payload.question}
          </p>
          <div className="flex flex-col gap-1.5">
            {payload.options.map(o => {
              const count = tally.counts[o.key] ?? 0;
              const picked = tally.mine === o.key;
              // Share of the vote, guarded against 0/0 — a NaN width silently
              // renders a full-width bar.
              const pct = tally.total > 0 ? Math.round((count / tally.total) * 100) : 0;
              return (
                <PressTarget
                  key={o.key}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onRespond?.(o.key)}
                  className={cn(
                    'relative w-full overflow-hidden rounded-fw-md px-3 py-2 text-left',
                    'bg-surface-sunken transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                  )}
                >
                  {/* The bar is BEHIND the label, not beside it — a bar that
                      takes its own column makes long options wrap. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-y-0 left-0 transition-[width] duration-300 motion-reduce:transition-none',
                      // NOT `bg-surface` for the unpicked bar. On a
                      // `surface-sunken` track that is 0.984 against 0.963 — a
                      // two percent difference, which renders as no bar at all.
                      // Same defect as the message bubbles and the inbox
                      // avatars: a fill that is only nominally distinct from
                      // its ground is invisible. Both states use the accent
                      // ramp, so a vote is readable and yours is stronger.
                      picked ? 'bg-accent-200' : 'bg-accent-50',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative flex items-center justify-between gap-3">
                    <span
                      className={cn(
                        'min-w-0 truncate font-fw-sans text-body-sm',
                        picked ? 'font-medium text-text-primary' : 'text-text-secondary',
                      )}
                    >
                      {o.label}
                    </span>
                    <span className="flex-shrink-0 font-fw-sans text-caption font-semibold tabular-nums text-text-primary">
                      <NumberFlow value={count} />
                    </span>
                  </span>
                </PressTarget>
              );
            })}
          </div>
        </div>
      ) : null}

      {payload.kind === 'travel' ? (
        <div className="flex flex-col gap-2">
          <ObjectLabel>Travel</ObjectLabel>
          <p className="font-fw-sans text-body font-semibold text-text-primary">
            {payload.title}
          </p>
          <MetaRow icon={Bus}>{formatEventWindow(payload.departsAt)}</MetaRow>
          {payload.location ? <MetaRow icon={MapPin}>{payload.location}</MetaRow> : null}
          {payload.notes ? (
            <p className="font-fw-sans text-caption text-text-secondary">{payload.notes}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <span className="font-fw-sans text-caption text-text-tertiary">
              <NumberFlow value={tally.total} /> acknowledged
            </span>
            <PressTarget
              type="button"
              aria-pressed={tally.mine === TRAVEL_ACK}
              onClick={() => onRespond?.(TRAVEL_ACK)}
              className={cn(
                'rounded-full px-3.5 py-1.5 font-fw-sans text-body-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
                tally.mine === TRAVEL_ACK
                  ? 'bg-accent-650 font-medium text-text-on-accent'
                  : 'bg-surface-sunken text-text-secondary active:bg-surface',
              )}
            >
              {tally.mine === TRAVEL_ACK ? 'Acknowledged' : 'Acknowledge'}
            </PressTarget>
          </div>
        </div>
      ) : null}
    </Surface>
  );
}

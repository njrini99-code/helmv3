'use client';

/**
 * EventPeopleSection — "People" (invited + status) in event detail (§2.10,
 * §18 "who is involved").
 *
 * DATA: one `getEventRSVP` per drawer open, not two. The calendar
 * orchestrator already calls it for a coach (it fills the response
 * StatMatrix) and its `summary.attendees` is this exact list, so the coach
 * path hands the attendees down as a prop and this section fetches NOTHING.
 * A player's orchestrator only fetches their own status, so with no prop the
 * section fetches for itself, keyed by `active` + `eventId`, failure-silent
 * to a Retry state so a read error never renders as an empty roster.
 *
 * Presentation (calendar.mobile.md "CONTAINERS TO REMOVE / MERGE" item 5):
 * an eyebrow ("People · N", the same overline recipe StatMatrix's label
 * uses) above one InsetGroup, a row per person — no per-row bordered <li>,
 * no wrapper card around the section in the drawer.
 */

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, StatusPill, Skeleton, InsetGroup, Eyebrow } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { getEventRSVP, type RSVPStats } from '@/app/golf/actions/golf';

type Attendee = RSVPStats['summary']['attendees'][number];

const STATUS_META: Record<Attendee['status'], { label: string; tone: FwStatusTone; tint: string; tintBg: string }> = {
  accepted: { label: 'Going', tone: 'success', tint: 'var(--fw-color-success-ink)', tintBg: 'var(--fw-color-success-bg)' },
  tentative: { label: 'Maybe', tone: 'warning', tint: 'var(--fw-color-warning-ink)', tintBg: 'var(--fw-color-warning-bg)' },
  declined: { label: 'Declined', tone: 'danger', tint: 'var(--fw-color-danger-ink)', tintBg: 'var(--fw-color-danger-bg)' },
  pending: { label: 'No response', tone: 'neutral', tint: 'var(--fw-color-text-tertiary)', tintBg: 'var(--fw-color-surface-sunken)' },
};

export type EventAttendee = Attendee;

export interface EventPeopleSectionProps {
  eventId: string;
  active: boolean;
  /**
   * Attendees already fetched by the orchestrator (the coach's single
   * `getEventRSVP` call). `undefined` = manage the fetch here (player
   * path, and the orchestrator's own failure fallback); `null` = the
   * orchestrator is still fetching — render the loading rows, do not fetch;
   * an array = loaded.
   */
  attendees?: Attendee[] | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; attendees: Attendee[] }
  | { status: 'failed'; error: string };

export function EventPeopleSection({ eventId, active, attendees: provided }: EventPeopleSectionProps) {
  const [ownState, setOwnState] = React.useState<LoadState>({ status: 'loading' });
  const requestRef = React.useRef(0);
  const managed = provided !== undefined;

  const load = React.useCallback(() => {
    if (!active || !eventId || managed) return;
    const requestId = ++requestRef.current;
    setOwnState({ status: 'loading' });
    void (async () => {
      try {
        const result = await getEventRSVP(eventId);
        if (requestId !== requestRef.current) return;
        if (!result.success) {
          setOwnState({ status: 'failed', error: result.error || 'Could not load who’s invited.' });
          return;
        }
        setOwnState({ status: 'loaded', attendees: result.data.summary.attendees });
      } catch {
        if (requestId === requestRef.current) {
          setOwnState({ status: 'failed', error: 'Could not load who’s invited.' });
        }
      }
    })();
  }, [active, eventId, managed]);

  React.useEffect(() => {
    load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  if (!active) return null;

  const state: LoadState = managed
    ? provided === null
      ? { status: 'loading' }
      : { status: 'loaded', attendees: provided }
    : ownState;
  const attendees = state.status === 'loaded' ? state.attendees : [];

  return (
    <div className="flex flex-col">
      <Eyebrow as="p" className="mb-2">
        People{state.status === 'loaded' ? ` · ${attendees.length}` : ''}
      </Eyebrow>
      {state.status === 'loading' ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-fw-md" />
          ))}
        </div>
      ) : state.status === 'failed' ? (
        <div className={cn('flex items-center justify-between gap-3 rounded-fw-md px-4 py-3', 'border border-fw-warning-ring bg-fw-warning-bg text-fw-warning-ink')}>
          <p className="font-fw-sans text-body-sm">{state.error}</p>
          <Button variant="secondary" size="sm" onClick={load} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
            Retry
          </Button>
        </div>
      ) : attendees.length === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary">No one invited yet.</p>
      ) : (
        <InsetGroup variant="inset">
          {attendees.map((a) => {
            const meta = STATUS_META[a.status] ?? STATUS_META.pending;
            return (
              <InsetGroup.Row
                key={a.playerId}
                trailing={
                  <StatusPill tone={meta.tone} size="sm" dot={false}>
                    {meta.label}
                  </StatusPill>
                }
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-fw-sans text-microbadge font-semibold"
                    style={{ color: meta.tint, backgroundColor: meta.tintBg }}
                  >
                    {initials(a.playerName)}
                  </span>
                  <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                    {a.playerName}
                  </span>
                </span>
              </InsetGroup.Row>
            );
          })}
        </InsetGroup>
      )}
    </div>
  );
}

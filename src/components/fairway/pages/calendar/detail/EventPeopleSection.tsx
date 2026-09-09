'use client';

/**
 * EventPeopleSection — "People" (invited + status) in event detail (§2.10,
 * §18 "who is involved"). Self-contained fetch of `getEventRSVP` keyed by
 * `active` + `eventId`, matching the drawer's existing linked-itinerary
 * lookup pattern — no orchestrator threading, failure-silent to a Retry
 * state so a read error never renders as an empty roster.
 */

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, StatusPill, Skeleton } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway';
import { getEventRSVP, type RSVPStats } from '@/app/golf/actions/golf';

type Attendee = RSVPStats['summary']['attendees'][number];

const STATUS_META: Record<Attendee['status'], { label: string; tone: FwStatusTone }> = {
  accepted: { label: 'Going', tone: 'success' },
  tentative: { label: 'Maybe', tone: 'warning' },
  declined: { label: 'Declined', tone: 'danger' },
  pending: { label: 'No response', tone: 'neutral' },
};

export interface EventPeopleSectionProps {
  eventId: string;
  active: boolean;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'loaded'; attendees: Attendee[] }
  | { status: 'failed'; error: string };

export function EventPeopleSection({ eventId, active }: EventPeopleSectionProps) {
  const [state, setState] = React.useState<LoadState>({ status: 'loading' });
  const requestRef = React.useRef(0);

  const load = React.useCallback(() => {
    if (!active || !eventId) return;
    const requestId = ++requestRef.current;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const result = await getEventRSVP(eventId);
        if (requestId !== requestRef.current) return;
        if (!result.success) {
          setState({ status: 'failed', error: result.error || 'Could not load who’s invited.' });
          return;
        }
        setState({ status: 'loaded', attendees: result.data.summary.attendees });
      } catch {
        if (requestId === requestRef.current) {
          setState({ status: 'failed', error: 'Could not load who’s invited.' });
        }
      }
    })();
  }, [active, eventId]);

  React.useEffect(() => {
    load();
    return () => {
      requestRef.current += 1;
    };
  }, [load]);

  if (!active) return null;

  const attendees = state.status === 'loaded' ? state.attendees : [];

  return (
    <div>
      <p className="mb-2.5 font-fw-sans text-body-sm font-medium text-text-secondary">
        People{state.status === 'loaded' ? ` · ${attendees.length}` : ''}
      </p>
      {state.status === 'loading' ? (
        <div className="space-y-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 rounded-fw-md" />
          ))}
        </div>
      ) : state.status === 'failed' ? (
        <div className="flex items-center justify-between gap-3 rounded-fw-md bg-surface-sunken px-4 py-3">
          <p className="font-fw-sans text-body-sm text-text-secondary">{state.error}</p>
          <Button variant="secondary" size="sm" onClick={load} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
            Retry
          </Button>
        </div>
      ) : attendees.length === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary">No one invited yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attendees.map((a) => {
            const meta = STATUS_META[a.status] ?? STATUS_META.pending;
            return (
              <li
                key={a.playerId}
                className="flex items-center justify-between gap-3 rounded-fw-md bg-surface-sunken px-3.5 py-2.5"
              >
                <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                  {a.playerName}
                </span>
                <StatusPill tone={meta.tone} size="sm" dot={false}>
                  {meta.label}
                </StatusPill>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

'use client';

/**
 * EventPeopleSection — "People" (invited + status) in event detail (§2.10,
 * §18 "who is involved"). Self-contained fetch of `getEventRSVP` keyed by
 * `active` + `eventId`, matching the drawer's existing linked-itinerary
 * lookup pattern — no orchestrator threading, failure-silent to a Retry
 * state so a read error never renders as an empty roster.
 */

import * as React from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { Button, StatusPill, Skeleton } from '@/components/fairway';
import type { FwStatusTone } from '@/components/fairway';
import { cn } from '@/lib/utils';
import { getEventRSVP, type RSVPStats } from '@/app/golf/actions/golf';
import surfaces from '../CalendarSurfaces.module.css';

type Attendee = RSVPStats['summary']['attendees'][number];

const STATUS_META: Record<Attendee['status'], { label: string; tone: FwStatusTone; tint: string; tintBg: string }> = {
  accepted: { label: 'Going', tone: 'success', tint: 'var(--fw-color-success-ink)', tintBg: 'var(--fw-color-success-bg)' },
  tentative: { label: 'Maybe', tone: 'warning', tint: 'var(--fw-color-warning-ink)', tintBg: 'var(--fw-color-warning-bg)' },
  declined: { label: 'Declined', tone: 'danger', tint: 'var(--fw-color-danger-ink)', tintBg: 'var(--fw-color-danger-bg)' },
  pending: { label: 'No response', tone: 'neutral', tint: 'var(--fw-color-text-tertiary)', tintBg: 'var(--fw-color-surface-sunken)' },
};

export interface EventPeopleSectionProps {
  eventId: string;
  active: boolean;
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span aria-hidden className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full', surfaces.rowIcon)}>
          <Users className="h-4 w-4" aria-hidden />
        </span>
        <p className="font-fw-sans text-body-sm font-semibold text-text-primary">
          People{state.status === 'loaded' ? ` · ${attendees.length}` : ''}
        </p>
      </div>
      {state.status === 'loading' ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 rounded-fw-md" />
          ))}
        </div>
      ) : state.status === 'failed' ? (
        <div className={cn('flex items-center justify-between gap-3 rounded-fw-md px-4 py-3', surfaces.attention)}>
          <p className="font-fw-sans text-body-sm">{state.error}</p>
          <Button variant="secondary" size="sm" onClick={load} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
            Retry
          </Button>
        </div>
      ) : attendees.length === 0 ? (
        <p className="font-fw-sans text-body-sm text-text-tertiary">No one invited yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attendees.map((a) => {
            const meta = STATUS_META[a.status] ?? STATUS_META.pending;
            return (
              <li
                key={a.playerId}
                className={cn('flex min-h-12 items-center justify-between gap-3 rounded-fw-md py-2 pl-4 pr-3', surfaces.row)}
                style={{ '--row-tint': meta.tint, '--row-tint-bg': meta.tintBg } as React.CSSProperties}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden
                    className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full font-fw-sans text-microbadge font-semibold', surfaces.rowIcon)}
                  >
                    {initials(a.playerName)}
                  </span>
                  <span className="min-w-0 truncate font-fw-sans text-body-sm font-medium text-text-primary">
                    {a.playerName}
                  </span>
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

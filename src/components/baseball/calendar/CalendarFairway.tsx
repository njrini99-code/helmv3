'use client';

/**
 * ============================================================================
 * CalendarFairway — Fairway (warm-premium) presentation of the baseball
 * Calendar page. Phase B leaf migration, Wave 1 · calendar. Flag-gated behind
 * `isRedesignEnabled()` — see the page fork.
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Migrates the page-owned chrome — the canvas background,
 * the event-summary strip, and the college-coach recruiting empty state — to
 * Fairway primitives. The interactive grid (`BaseballCalendarWrapper` →
 * `PremiumCalendarClient`) is a SHARED component and is reused verbatim inside
 * the new frame per the migration playbook §3.5. No data path, action, event
 * mapping, RSVP bridge, or query is touched here — the wrapper keeps every
 * baseball action handler and capability flag it already had.
 *
 * A full Fairway-native month grid (as golf built under
 * `components/fairway/pages/calendar`) is a separate, larger effort.
 * ========================================================================== */

import type { ComponentProps } from 'react';
import Link from 'next/link';
import { Calendar as CalendarIcon } from 'lucide-react';
import { EmptyState, StatusPill, Button, type FwStatusTone } from '@/components/fairway';
import { fairwayScope } from '@/lib/redesign/flag';
import { BaseballCalendarWrapper } from './BaseballCalendarWrapper';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

type WrapperProps = ComponentProps<typeof BaseballCalendarWrapper>;

/** Event-type → label + Fairway status tone for the summary strip. */
const EVENT_TYPE_META: Record<string, { label: string; tone: FwStatusTone }> = {
  game: { label: 'Game', tone: 'info' },
  practice: { label: 'Practice', tone: 'accent' },
  camp: { label: 'Camp', tone: 'warning' },
  tryout: { label: 'Tryout', tone: 'warning' },
  meeting: { label: 'Meeting', tone: 'neutral' },
  travel: { label: 'Travel', tone: 'info' },
  other: { label: 'Other', tone: 'neutral' },
};

// Preserve the legacy full-height flex shell so PremiumCalendarClient's h-full
// resolves; only the gradient background is swapped for the Fairway canvas.
const SHELL = 'flex h-[calc(100vh-5.5rem-env(safe-area-inset-bottom))] flex-col md:h-screen';

export interface CalendarFairwayProps {
  /** College coach with no team → recruiting-focused empty state. */
  recruitingEmpty: boolean;
  events: CalendarEvent[];
  teamMembers: WrapperProps['teamMembers'];
  teamId: string | null;
  isCoach: boolean;
  currentUserId?: string;
  upcomingEvents: number;
  eventTypeCounts: Record<string, number>;
}

export function CalendarFairway({
  recruitingEmpty,
  events,
  teamMembers,
  teamId,
  isCoach,
  currentUserId,
  upcomingEvents,
  eventTypeCounts,
}: CalendarFairwayProps) {
  if (recruitingEmpty) {
    return (
      <div className={fairwayScope(SHELL, 'bg-canvas')}>
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={CalendarIcon}
            title="Your recruiting calendar is empty"
            description="Camp visits and official visit windows will appear here as you schedule recruiting activity."
            action={
              <Button asChild variant="primary">
                <Link href="/baseball/dashboard/discover">Browse prospects</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className={fairwayScope(SHELL, 'bg-canvas')}>
      {events.length > 0 && (
        <div className="flex-shrink-0 px-4 pb-2 pt-4 md:px-6 md:pt-6">
          <div className="flex items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="whitespace-nowrap text-sm font-medium text-text-secondary">
              {upcomingEvents} upcoming event{upcomingEvents !== 1 ? 's' : ''}
            </span>
            <span className="text-border-strong" aria-hidden>
              ·
            </span>
            {Object.entries(eventTypeCounts).map(([type, count]) => {
              const meta = EVENT_TYPE_META[type] ?? {
                label: type,
                tone: 'neutral' as FwStatusTone,
              };
              return (
                <StatusPill key={type} tone={meta.tone} size="sm" dot>
                  {count} {meta.label}
                </StatusPill>
              );
            })}
          </div>
        </div>
      )}

      {/* overflow-hidden is required so PremiumCalendarClient's h-full resolves. */}
      <div className="min-h-0 flex-1 overflow-hidden p-4 pt-2 md:p-6 md:pt-2">
        <BaseballCalendarWrapper
          initialEvents={events}
          teamMembers={teamMembers}
          teamId={teamId}
          isCoach={isCoach}
          currentUserId={currentUserId}
        />
      </div>
    </div>
  );
}

export default CalendarFairway;

'use client';

/**
 * ============================================================================
 * CalendarFairway — "The Living Annual" presentation of the baseball Calendar
 * page (spec: docs/baseball/design-system-living-annual.md; map:
 * docs/baseball/ui-migration-map.md `calendar` row — `SectionMasthead` +
 * `EmptyIssue`/`EditorsLetter` consistency pass).
 * ----------------------------------------------------------------------------
 * PRESENTATION ONLY. Migrates the page-owned chrome — the canvas background,
 * the masthead, the event-summary strip, and the college-coach recruiting
 * empty state — to the Living-Annual kit. The interactive grid
 * (`BaseballCalendarWrapper` → `PremiumCalendarClient`) is a SHARED component
 * and is reused verbatim inside the new frame per the migration playbook §3.5.
 * No data path, action, event mapping, RSVP bridge, or query is touched here —
 * the wrapper keeps every baseball action handler and capability flag it
 * already had.
 *
 * A full Fairway-native month grid (as golf built under
 * `components/fairway/pages/calendar`) is a separate, larger effort.
 * ========================================================================== */

import type { ComponentProps } from 'react';
import Link from 'next/link';
import { Button } from '@/components/fairway';
import { SectionMasthead, EditorsLetter, InkBadge, LiveDot } from '@/components/baseball/living-annual';
import { fairwayScope } from '@/lib/redesign/flag';
import { BaseballCalendarWrapper } from './BaseballCalendarWrapper';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

type WrapperProps = ComponentProps<typeof BaseballCalendarWrapper>;

/** Event-type → singular label for the ruled summary strip. */
const EVENT_TYPE_LABEL: Record<string, string> = {
  game: 'game',
  practice: 'practice',
  camp: 'camp',
  tryout: 'tryout',
  meeting: 'meeting',
  travel: 'travel event',
  other: 'other',
};

/** Pluralize a singular event-type label for the count badge ("1 game" / "3 games"). */
function pluralizeEventLabel(label: string, count: number): string {
  if (count === 1) return label;
  return label.endsWith('s') ? label : `${label}s`;
}

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
        <div className="flex-shrink-0 px-4 pt-4 md:px-6 md:pt-6">
          <SectionMasthead eyebrow="THE WAR ROOM · CALENDAR" title="Calendar" ink="pursuit" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          {/* Not the `calendar` EmptyIssue preset ("No dates on the card") —
              this is the recruiting-specific narrative (camp/official-visit
              windows), so it stays a bespoke EditorsLetter like the other
              Batch A surfaces' non-preset states (e.g. TasksFairway/
              AnnouncementsFairway "no team selected"). */}
          <EditorsLetter
            ink="pursuit"
            title="Your recruiting calendar is empty"
            body="Camp visits and official visit windows will appear here as you schedule recruiting activity."
            action={
              <Button asChild variant="primary">
                <Link href="/baseball/dashboard/discover">Browse prospects</Link>
              </Button>
            }
            className="max-w-md"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={fairwayScope(SHELL, 'bg-canvas')}>
      <div className="flex-shrink-0 px-4 pt-4 md:px-6 md:pt-6">
        <SectionMasthead eyebrow="THE PRESSBOX · SCHEDULE" title="Calendar" ink="team" />
      </div>

      {/* Gated on `upcomingEvents` (not `events.length`) — the strip reads
          "N upcoming events", so a team with only past events has nothing
          upcoming to summarize. `eventTypeCounts` is derived from the same
          upcoming-only list (see the page component), so these two numbers
          can never contradict each other again. Row wraps instead of
          scrolling horizontally so nothing clips off the 390px viewport with
          no visible way to reach it (visual-verify coach-ops__calendar). */}
      {upcomingEvents > 0 && (
        <div className="flex-shrink-0 px-4 pb-2 pt-3 md:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <LiveDot ink="team" label={`${upcomingEvents} upcoming event${upcomingEvents !== 1 ? 's' : ''}`} />
            {Object.entries(eventTypeCounts).map(([type, count]) => {
              const label = EVENT_TYPE_LABEL[type] ?? type;
              return (
                <InkBadge key={type} tone="team" label={`${count} ${pluralizeEventLabel(label, count)}`} />
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

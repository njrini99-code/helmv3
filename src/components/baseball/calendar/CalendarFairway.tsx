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
import { eventInk } from '@/app/baseball/(dashboard)/dashboard/events/event-ink';
import { BaseballCalendarWrapper } from './BaseballCalendarWrapper';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

type WrapperProps = ComponentProps<typeof BaseballCalendarWrapper>;

/**
 * Event-type → singular label for the ruled summary strip. Kept in sync with
 * the `event_type` values `createBaseballEvent`/`EventsClient` actually write
 * (game/practice/showcase/tryout/tournament/meeting/other) — the badge's
 * *ink* for each of these comes from `eventInk()` in event-ink.ts so this
 * strip never drifts from the Events list's tone/variant mapping.
 */
const EVENT_TYPE_LABEL: Record<string, string> = {
  game: 'game',
  practice: 'practice',
  showcase: 'showcase',
  tryout: 'tryout',
  tournament: 'tournament',
  meeting: 'meeting',
  other: 'other',
};

/** Pluralize a singular event-type label for the count badge ("1 game" / "3 games"). */
function pluralizeEventLabel(label: string, count: number): string {
  if (count === 1) return label;
  return label.endsWith('s') ? label : `${label}s`;
}

// ── Shell height (#485) ──────────────────────────────────────────────────────
//
// PremiumCalendarClient's own internal grid/scroll region (its `data-scroll-
// container` div) needs a DETERMINATE ancestor height for its `h-full`/`flex-1`
// cascade to resolve — an in-flow, unbounded-height wrapper collapses it to 0
// (confirmed: its outer wrapper is `flex ... h-full` and its content pane is
// `flex-1 overflow-y-auto`, both percentage/flex-basis values that need a real
// number above them). So this shell still hands it a real height — but the
// height is now derived from the shell's ACTUAL chrome, not a flat guessed
// `5.5rem`/`100vh` (the #485 defect): that guess predates the current
// AppShell (sticky glass top bar + a coach-only Team-hub sub-nav strip) and
// never matched either.
//
// Terms subtracted from `100dvh` (dvh, not vh, so iOS Safari's dynamic
// toolbar can't leave a dead-space/double-scroll sliver — the exact symptom
// #485 reports):
//   1. `var(--golf-mobile-header-offset)` — the shared AppShell's own glass
//      top bar (h-16 + safe-area-inset-top), exposed as a CSS custom property
//      on the content column every baseball page (including this one)
//      renders inside (AppShell.tsx). Reading the var instead of a literal
//      keeps this file from drifting if the top bar's height ever changes.
//   2. `45px` — hub-sub-nav.tsx's Team-hub tab row (`min-h-[44px]` + a 1px
//      `border-b`), ONLY when the viewer is a coach: Calendar lives inside
//      the coach TEAM hub (nav-registry.ts `hub: 'team'`, hub-definitions.ts
//      `TEAM_ORDER`), so `BaseballFairwayShell` mounts `HubSubNav` above
//      `<main>` for a coach on this exact route — but Calendar is a flat,
//      hub-less tab for players (hub-definitions.ts's `PLAYER_TEAM_TABS` has
//      no `calendar` entry; `resolve-active-hub.ts`'s player branch never
//      matches this pathname), so no sub-nav strip renders for a player and
//      nothing should be subtracted for one.
//   3. AppShell's own bottom clearance below `<main>`'s content — mirrored
//      from AppShell.tsx's `bottomNav && 'pb-[calc(2rem+56px+env(safe-area-
//      inset-bottom,0px))] md:pb-[calc(2rem+env(safe-area-inset-bottom,0px))]'`
//      (always applied: every baseball dashboard route passes a `bottomNav`)
//      rather than reinvented, so the two numbers can't silently diverge
//      again. `56px` (the mobile bottom-tab bar's own height) drops out at
//      `md:` since that bar is `md:hidden`.
//
// Two full literal strings (not string-built from the parts above) so
// Tailwind's static class scanner can actually find and generate both — a
// template-built arbitrary-value class is invisible to it.
const SHELL_PLAYER =
  'flex h-[calc(100dvh-var(--golf-mobile-header-offset)-(2rem+56px+env(safe-area-inset-bottom,0px)))] flex-col md:h-[calc(100dvh-var(--golf-mobile-header-offset)-(2rem+env(safe-area-inset-bottom,0px)))]';
const SHELL_COACH =
  'flex h-[calc(100dvh-var(--golf-mobile-header-offset)-45px-(2rem+56px+env(safe-area-inset-bottom,0px)))] flex-col md:h-[calc(100dvh-var(--golf-mobile-header-offset)-45px-(2rem+env(safe-area-inset-bottom,0px)))]';

export interface CalendarFairwayProps {
  /** College coach with no team → recruiting-focused empty state. */
  recruitingEmpty: boolean;
  /** Any other role (non-college coach, or player) with no team resolved yet
   *  → generic "no team assigned" state, distinct from `recruitingEmpty`'s
   *  recruiting-specific narrative. Mutually exclusive with `recruitingEmpty`. */
  noTeamEmpty: boolean;
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
  noTeamEmpty,
  events,
  teamMembers,
  teamId,
  isCoach,
  currentUserId,
  upcomingEvents,
  eventTypeCounts,
}: CalendarFairwayProps) {
  // Both empty-state branches below render for the SAME route the main
  // branch does (`resolveActiveHub` keys off pathname + role only, never off
  // whether a team/events resolved), so the sub-nav — and thus the height
  // this shell needs — is present under the identical isCoach condition in
  // all three branches.
  const shell = isCoach ? SHELL_COACH : SHELL_PLAYER;

  if (recruitingEmpty) {
    return (
      <div className={fairwayScope(shell, 'bg-canvas')}>
        <div className="flex-shrink-0 px-4 pt-4 md:px-6 md:pt-6">
          <SectionMasthead eyebrow="THE WAR ROOM · CALENDAR" title="Calendar" ink="pursuit" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          {/* Not the `calendar` EmptyIssue preset ("No dates on the card") —
              this is the recruiting-specific narrative (camp/official-visit
              windows), so it stays a bespoke EditorsLetter like the other
              Batch A surfaces' non-preset states (e.g. TasksFairway/
              AnnouncementsFairway "no team selected").

              MODULE GATE: this branch renders only when `recruitingEmpty` is
              true, and that prop is computed by `resolveCalendarEmptyState`
              (src/lib/baseball/calendar/empty-state.ts), which returns false
              for everyone while the recruiting module is sunset. Without that
              gate the "Browse prospects" link below points at a route the
              middleware redirects — which is exactly what a college coach with
              no team saw on their first login. The gate is named here rather
              than left implicit because this component only receives the
              decision; it does not make it. */}
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

  if (noTeamEmpty) {
    return (
      <div className={fairwayScope(shell, 'bg-canvas')}>
        <div className="flex-shrink-0 px-4 pt-4 md:px-6 md:pt-6">
          <SectionMasthead eyebrow="THE PRESSBOX · SCHEDULE" title="Calendar" ink="team" />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <EditorsLetter
            ink="team"
            title="No team assigned"
            body="Join or select a team to see its calendar of practices, games, and events."
            className="max-w-md"
          />
        </div>
      </div>
    );
  }

  return (
    <div className={fairwayScope(shell, 'bg-canvas')}>
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
            <LiveDot ink="team" label={`${upcomingEvents} upcoming ${pluralizeEventLabel('event', upcomingEvents)}`} />
            {Object.entries(eventTypeCounts).map(([type, count]) => {
              const label = EVENT_TYPE_LABEL[type] ?? type;
              const ink = eventInk(type);
              return (
                <InkBadge
                  key={type}
                  tone={ink.tone}
                  variant={ink.variant}
                  label={`${count} ${pluralizeEventLabel(label, count)}`}
                />
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

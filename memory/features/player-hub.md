# Feature: Player Hub

## Status

- active

## Current State

Player Hub is the player’s personal action center. It combines upcoming travel, assigned tasks, event invitations, RSVP actions, announcements, and lightweight insight signals into one landing surface.

It depends on Team Operations, Calendar, and Team Communications. Because it aggregates multiple systems, it is especially sensitive to stale data and cross-table truth mismatches.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/hub/page.tsx`

### Components

- `src/components/golf/player-hub/PlayerHub.tsx`
- `src/components/golf/player-hub/PlayerHubWrapper.tsx`
- `src/components/golf/player-hub/PlayerHubAnnouncementsSection.tsx`
- `src/components/golf/player-hub/HubInsightSignalCard.tsx`

### Actions

- `src/app/golf/actions/dashboard-data.ts`
- `src/app/golf/actions/travel.ts`
- `src/app/golf/actions/tasks.ts`
- `src/app/golf/actions/attendance.ts`

## Core Data

- `golf_travel_itineraries`
- `golf_tasks`
- `golf_task_assignments`
- `golf_task_completions`
- `golf_events`
- `golf_event_attendance`
- `golf_announcements`
- related player/team membership records for scoping.

## Data Flow

```txt
Player opens hub
  -> load player team context
  -> read upcoming travel
  -> read assigned tasks and completion status
  -> read upcoming events and RSVP state
  -> read recent announcements
  -> render action cards with inline RSVP/task affordances
```

## Business Rules

- Player Hub must only show data for the authenticated player's team and assignments.
- RSVP actions update event attendance, not generic task state.
- Task completion truth must match the write path used by `completeTask()`.
- Travel details can include sensitive logistics and should stay team/player scoped.

## UI Contract

- Hub should prioritize near-term action: travel, due tasks, event RSVPs, announcements.
- Cards should make overdue, upcoming, mandatory, urgent, and completed states visually distinct.
- Inline actions must update the visible card state or clearly show pending/error behavior.
- Empty states should distinguish no travel, no tasks, no events, and no announcements.
- Mobile density matters; this screen should get users to content quickly.

## Known Risk Areas

- Known high-risk mismatch: Hub reads `golf_task_completions`, while `completeTask()` writes `golf_task_assignments`.
- Hub can become stale if it aggregates data without revalidating after RSVP/task actions.
- Calendar/travel/task/announcement dependencies mean a change in one feature can break the hub.

## Tests To Prefer

- Browser/mobile smoke for hub load, RSVP action, and task completion visibility.
- Action tests for any dashboard-data aggregation change.
- Tests or assertions for the task completion source of truth before modifying hub task UI.

## Related Docs

- `memory/features/team-operations.md`
- `memory/features/calendar-events.md`
- `memory/features/team-communications.md`
- `memory/context/golfhelm-features.md`

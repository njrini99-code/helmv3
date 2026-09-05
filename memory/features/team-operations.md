# Feature: Team Operations

<!-- schema-drift-banner -->
> **⚠️ 1 identifier named below does not exist in the database.**
> Verified 2026-08-19 against production. `golf_travel_expense_splits`
>
> It is described here as if live. Do not query, type, or build on it —
> check `src/lib/types/database.ts` (or `memory/glossary.md`'s AUTOGEN blocks)
> before trusting any table name in this file. Declared absent
> below so `npm run docs:schema-drift` exempts them structurally
> instead of carrying them in the numeric baseline. Removing this
> reference entirely is a ratchet-down — re-run
> `node scripts/check-doc-schema-drift.mjs --update` after.

<!-- schema-drift-absent: golf_travel_expense_splits -->


## Status

- active

## Current State

Team Operations covers tasks, documents, travel, and the player-facing Team
Hub that assembles those operational objects into daily workflows. The former
standalone Player Hub is a dashboard redirect; Team Hub is the full player
operations destination.

Tasks let coaches assign work to players. Documents provide a team file library with versioning and visibility controls. Travel manages itinerary details and partially implemented budget/expense tracking. The player hub pulls travel, task, and event data into a player action center.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/tasks/**`
- `src/app/golf/(dashboard)/dashboard/documents/**`
- `src/app/golf/(dashboard)/dashboard/travel/**`
- `src/app/golf/(dashboard)/dashboard/hub/**`
- `src/app/golf/(dashboard)/dashboard/team-hub/**`

### Components

- `src/components/golf/tasks/**`
- `src/components/golf/documents/**`
- `src/components/golf/travel/**`
- `src/components/golf/player-hub/**`
- `src/components/fairway/pages/team-hub/**`

### Actions

- `src/app/golf/actions/tasks.ts`
- `src/app/golf/actions/task-templates.ts`
- `src/app/golf/actions/task-reminders.ts`
- `src/app/golf/actions/documents.ts`
- `src/app/golf/actions/event-documents.ts`
- `src/app/golf/actions/travel.ts`
- `src/app/golf/actions/dashboard-data.ts`

## Core Data

- `golf_tasks`
- `golf_task_assignments`
- `golf_task_templates`
- `golf_task_reminders`
- `golf_documents`
- `golf_document_versions`
- `golf_travel_itineraries`
- `golf_travel_budgets`
- `golf_travel_expenses`
- `golf_travel_expense_splits`
- Player hub also reads travel, tasks, events, and RSVP records.

## Data Flow

```txt
Task create
  -> createTask()
  -> INSERT golf_tasks
  -> INSERT golf_task_assignments per player

Task complete
  -> completeTask()
  -> UPDATE golf_task_assignments with status/upload/notes

Document upload/version
  -> documents action/storage flow
  -> WRITE golf_documents or golf_document_versions
  -> may link to announcements or events

Travel create
  -> createTravelItinerary()
  -> WRITE golf_travel_itineraries
  -> optional event_id link to calendar

Player hub
  -> reads travel, tasks, and events
  -> lets player act on tasks and RSVPs

Player Team Hub
  -> resolves active team membership, then reads task assignments, travel,
     announcements, classes, and team timezone in parallel
  -> presents an Overview plus Tasks, Announcements, Travel, and Class schedule
  -> derives "next trip" from departure_date >= today's team-local date; past
     itineraries remain visible only in the Travel detail tab
  -> completeTask() is the only write and stays in the client wrapper
  -> a failed task, travel, class, or announcement read is displayed as a
     retryable load failure, never as a cheerful empty state
```

## Business Rules

- Coach task/document/travel writes must be team-scoped.
- Removing a player from a roster must fail safe when they have a saved
  in-progress round: retain the round and tell the coach to have the player
  finish or explicitly discard it. This is a handled warning, not a server
  error.
- Player task completion must only update assignments for that player.
- Task templates create defaults, but assigned task records remain the operational truth.
- Travel itinerary data can include hotel, flight, room, packing, and uniform details; treat as potentially sensitive.
- Documents need visibility controls and safe versioning.
- Travel expense split support is incomplete; do not assume per-player split logic exists.

## UI Contract

- Tasks need pending, overdue, completed, reminder, template, upload-required, and empty states.
- Documents need preview, version history, upload new version, category/visibility, and unsupported-file states.
- Travel needs itinerary cards, transport/hotel/packing/room assignment details, budget/expense affordances where wired, and player-friendly status.
- Player Hub should not lie about task completion state; it must read the same operational truth as task completion writes.
- Player Team Hub is player-only and starts on an operations Overview; its
  ordered detail tabs are Tasks, Announcements, Travel, and Class schedule.
- Player Team navigation order is Team Hub, My Qualifiers, Roster, then Team
  Info. The Team Hub must not duplicate the roster as an inner tab.
- Empty and failed reads are different states. Only successful empty reads may
  say there are no tasks, trips, classes, or announcements.

## Known Risk Areas

- Task reminder auto-send is missing; setting `reminder_at` does not imply notifications will fire.
- Travel expense split table exists but dedicated split calculation/assignment logic is incomplete.
- Budget/expense actions may exist even when UI exposure is partial.
- Documents and travel can carry sensitive data; review storage and visibility carefully.

## Tests To Prefer

- `src/app/golf/actions/__tests__/travel.test.ts`
- Action tests for task assignment/completion when task behavior changes.
- Browser/mobile checks for task completion, document preview/versioning, and travel itinerary display.
- RLS/storage tests when document or travel visibility changes.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/PUSH_NOTIFICATION_AUDIT.md`

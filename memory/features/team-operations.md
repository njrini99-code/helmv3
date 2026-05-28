# Feature: Team Operations

## Status

- active

## Current State

Team Operations covers tasks, documents, travel, and the player hub surfaces that assemble those operational objects into daily player workflows.

Tasks let coaches assign work to players. Documents provide a team file library with versioning and visibility controls. Travel manages itinerary details and partially implemented budget/expense tracking. The player hub pulls travel, task, and event data into a player action center.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/tasks/**`
- `src/app/golf/(dashboard)/dashboard/documents/**`
- `src/app/golf/(dashboard)/dashboard/travel/**`
- `src/app/golf/(dashboard)/dashboard/hub/**`

### Components

- `src/components/golf/tasks/**`
- `src/components/golf/documents/**`
- `src/components/golf/travel/**`
- `src/components/golf/player-hub/**`

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
- `golf_task_completions`
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
```

## Business Rules

- Coach task/document/travel writes must be team-scoped.
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

## Known Risk Areas

- Player Hub has a known task completion mismatch: it reads `golf_task_completions`, while `completeTask()` writes `golf_task_assignments`.
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

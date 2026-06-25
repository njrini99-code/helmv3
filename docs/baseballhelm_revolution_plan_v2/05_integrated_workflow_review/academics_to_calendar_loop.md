# Academics To Calendar Loop



## Trigger

A real baseball event creates the need: schedule change, practice planning, post-game review, import upload, player status change, lift result, class conflict, or staff meeting.

## User

Primary user depends on workflow: head coach, assistant coach, pitching coach, hitting coach, strength coach, director of ops, player, or admin.

## Data created

- event records
- acknowledgement records
- practice blocks and attendance
- player timeline events
- import rows and source labels
- availability/wellness records
- stats/development metrics
- notes/tasks
- AI insight records with source refs

## Where data appears

- Coach Command Center
- Player Today
- Player Profile / Timeline
- Calendar / Team Ops
- Practice Planner
- Stats Center
- Performance
- Reports
- AI brief/action cards

## What AI reads

Only permission-safe structured records and approved notes. AI reads source objects, not vague screen text. Every output must store source refs, confidence, and visibility.

## Notifications/tasks created

- player acknowledgements
- staff follow-up tasks
- availability confirmation tasks
- import review tasks
- meeting prep tasks
- practice publish notifications

## Coach action

Coach reviews the brief, confirms source data, modifies plan, assigns tasks, messages staff/players, or logs a note.

## Player action

Player checks schedule, completes acknowledgement/check-in/lift task, views personal focus, and responds to coach-directed action.

## Logged/reported

Everything important creates a durable audit or timeline event and can appear in staff reports, player development briefs, and seasonal reviews.

## Acceptance criteria

- Workflow creates at least one durable source object.
- Source object appears in the correct role-specific surfaces.
- AI output, if created, cites source records.
- Player visibility never leaks staff-only notes or private academic/wellness details.

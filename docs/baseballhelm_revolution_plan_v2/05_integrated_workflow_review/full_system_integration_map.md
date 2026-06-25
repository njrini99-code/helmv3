# Full System Integration Map


## Object graph

| Object | Connected to |
|---|---|
| Player | roster, stats, practice attendance, practice grades, development notes, lifts, wellness, availability, class schedule, travel roster, tasks, AI insights, reports |
| Calendar Event | practice, lift, game, travel, class conflict, player availability, acknowledgements, reminders, tasks |
| Practice | calendar, blocks, player groups, staff assignments, attendance, grades, notes, AI, reports |
| Game | schedule, stats, player profile, pitcher workload, development notes, AI recap, reports |
| Lift | calendar, assignment, completion, maxes, wellness, availability, workload risk, player profile, AI |
| Import | validation, matching, history, rollback, AI cleanup, reports |
| AI Insight | source data, confidence, permission, suggested action, related object, dismissal/status, audit log |


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

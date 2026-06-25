# V2 Screen Acceptance Specs

Every primary screen must define intent, CTA, data, empty state, error state, mobile behavior, desktop behavior, and AI placement.

## Coach Command Center

Intent: help staff decide what matters today.

First viewport:

- date/team selector
- CoachHelm Daily Brief
- Today schedule
- players needing attention
- acknowledgement gaps
- availability/readiness summary

Primary CTA:

- Review Today
- Publish Practice
- Resolve Import
- Open Staff Meeting

Required cards:

- Today
- Availability
- Practice Plan
- Import Status
- AI Brief
- Open Tasks
- Recent Player Timeline Changes

Empty state:

- prompt to import roster or seed demo team
- show next setup action, not blank dashboard

Error state:

- scoped message by data source
- retry button
- no raw stack trace

Desktop:

- dense two/three-column layout
- sticky action rail acceptable

Mobile:

- readable but coach desktop is primary; stack cards

AI placement:

- brief at top
- source refs expandable
- actions convert to task/note/dismiss

## Player Today

Intent: one daily player checklist.

First viewport:

- next required event
- check-in/ack task
- lift or practice assignment
- availability status

Primary CTA:

- Check In
- Acknowledge
- View Today Plan

Required cards:

- Today schedule
- My tasks
- My lift/performance
- Practice group
- Player-visible coach note
- My recent progress

Never show:

- staff-only notes
- other players' private status
- staff AI risk labels

Mobile:

- primary experience
- bottom nav
- large tap targets

Desktop:

- acceptable but not dominant

## Player Profile

Intent: staff/player meeting source of truth.

Required sections:

- identity/status header
- availability marker
- player timeline
- stats snapshot
- development goals
- practice/lift/wellness summaries
- notes by visibility
- AI decision brief

Role behavior:

- staff view includes private notes if permitted
- player view includes only player-visible notes and summaries

Primary CTA:

- Add Note
- Start Player Meeting
- Add Timeline Item

## Import Center

Intent: safely convert messy files into trusted records.

Required steps:

1. choose import type
2. upload file
3. map columns
4. match players
5. validate rows
6. preview changes
7. commit
8. review result/rollback

Required UI:

- side-by-side raw/mapped preview
- confidence chips for player matches
- blocking error count
- warning count
- affected objects summary
- duplicate import warning
- rollback button after commit

AI placement:

- suggest mappings
- explain anomalies
- never auto-commit

## Practice Planner Lite

Intent: build and publish a realistic college baseball practice fast.

Required:

- practice header linked to calendar event
- focus
- blocks/stations with duration and owner
- player groups
- staff assignments
- publish status
- attendance/participation
- recap notes

Primary CTA:

- Publish Practice
- Mark Attendance
- Complete Recap

AI placement:

- practice focus suggestions from recent stats, notes, availability, and upcoming schedule

## Performance Lite

Intent: connect lifts, wellness, and availability to baseball decisions.

Required:

- lift compliance table
- assigned workout list
- check-in summary
- availability board
- limited/unavailable player list
- staff notes

Player view:

- own assignment
- own check-in
- own status

Strength staff view:

- performance details
- no private academic notes by default

## Staff Decision Room

Intent: prepare weekly baseball staff meeting.

Required sections:

- wins since last meeting
- players trending up/down
- availability concerns
- practice attendance
- lift compliance
- academic/travel conflicts
- recent imports
- open tasks
- source-backed action recommendations with sources

Primary CTA:

- Create Action Items
- Export Summary

## Definition Of Polished

- no page is blank with empty data
- no primary action is hidden below unrelated tables
- all tables have search/filter/sort where useful
- all status labels are plain baseball language
- all AI cards cite source data
- role boundaries are visible in tests and server-side checks

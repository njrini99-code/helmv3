# Academics — Acceptance Criteria

## Purpose

The player Academics tab gives the athlete class schedule and academic tasks without exposing coach-only complexity.

## Player jobs to be done

- Know what I need to do today.
- Know where I need to be and when.
- Complete tasks, lifts, check-ins, acknowledgements, and reflections.
- See coach feedback and my progress in a constructive way.
- Upload or attach data when requested.

## Coach control points

Coaches decide what practice details, stats, notes, AI summaries, and reports are player-visible. Sensitive staff-only notes remain hidden.

## Data visible to player

Own schedule, own tasks, team announcements, permitted practice blocks, own lift assignment/results, own stats, own approved feedback, own goals, own wellness entries, own class schedule, own approved AI summary.

## Data hidden from player

Staff-only notes, internal risk scores, private academic/advisor notes, recruiting board notes, other players' sensitive data, unapproved AI staff flags, injury speculation.

## Key cards / sections

- Class Schedule
- Study Hall
- Tasks
- Travel Conflicts

## Player workflow

1. Open Today or this tab.
2. Review next action.
3. Complete/check in/log data.
4. Add comment/reflection if prompted.
5. See confirmation and impact on personal timeline.

## UI layout

Mobile-first stacked cards, clear CTAs, minimal filters, status chips, readable typography, thumb-friendly actions. Desktop is secondary.

## Component spec

Use `PlayerActionCard`, `PlayerScheduleItem`, `PlayerTaskRow`, `PlayerProgressCard`, `PlayerAIMessage`, `PlayerUploadCard`, and `PlayerEmptyState`.

## AI features

AI may summarize only player-visible data. Tone should be constructive, specific, and action-oriented. Example: “Your QAB rate improved this week; your next focus is two-strike contact, based on coach grades from the last three games.”

## Permissions

Player can view own data, submit own check-ins/results/reflections, acknowledge assigned messages, and edit limited profile fields. Player cannot edit official stats, staff notes, or team schedules.

## Edge cases

No linked player profile, multiple teams, transfer/inactive player, missed due task, offline check-in, coach unpublished practice plan, corrected stat after player viewed old stat.

## Acceptance criteria

- Works on mobile viewport.
- Shows only permitted data.
- Has empty/loading/error states.
- Allows completion of assigned tasks.
- Writes audit log for sensitive submissions.
- AI summary never references hidden data.

## Implementation tasks

- Create route and data service.
- Add RLS tests for player-only visibility.
- Add seeded demo data.
- Add mobile UI test.
- Add notification hooks for due items.

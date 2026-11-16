# 2026-11-15 — practice hours (CARA) log

## 2026-11-15 — Practice hours (launch readiness F-03)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-03); no owner board. Built from shared ui primitives and tokens only (Section, InlineNotice, EmptyState, Modal, Segmented, Field, ExportButton)
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f03)
Contract IDs:   60180–60184, 60980–60982; CH-6080–6082, CH-6180–6181, CH-6280–6285 (60688), CH-6380–6382, CH-6480, CH-6880–6881
Actions:        ACT-P006-HOURS-LIMITS, ACT-P006-HOURS-ADJUST, ACT-P006-HOURS-EXPORT (new)
Data impact:    reads golf_events, golf_event_attendance and the roster through RLS; new tables golf_team_hours_settings and golf_hours_adjustments in migration 20261115230000 (HELD, not applied). Until it is applied the page drafts on the division from Settings, Team and says saving waits (CH-6283)
Held items:     supabase/migrations/20261115230000_golf_team_hours.sql (HELD.md row)
```

### Changed

- New page **Practice hours** at `/golf/dashboard/calendar/hours`, pushed
  below Calendar (Calendar › More › Practice hours; a player's is **Your
  practice hours**). It drafts each player's week from the calendar and
  attendance: a day a column, the week against its limit ("20.5 of 20"), the
  days off. Practices and meetings count their length; a qualifier or
  tournament day counts 3, and a practice round there the day before counts as
  a practice day; travel and class count nothing; a player marked absent or a
  no-show counts nothing that day.
- Each day or week over its limit, and a week short of its days off, is a
  warning in words with the NCAA bylaw behind it. Limits follow the team's
  association (Division I, II, III, NAIA or Custom), its season dates and the
  day its week starts; for a D-I autonomy conference a travel day is not a day off.
  Every NCAA figure is cited on the page ("The rules this week is read
  against") and can be replaced with Custom limits.
- **What counted** lists every event of the week by day with whether it
  counted, how much and why. A coach can change how one event counts (**Set
  hours**, or **Doesn’t count** with a note, for a compliance meeting); a
  player sees the change as "your coach’s change".
- **Limits** (coach) saves the team's own limits; **Export** writes the week as
  CSV, a row a player a day and a row for the week.
- An event with no times counts nothing until times or a standard for untimed
  practices are set, and its figures carry a + (CH-6381).

- If the team's saved limits fail to load (the tables are there), the week reads
  the defaults, Limits and Change are hidden and CH-6285 says so, so a save never
  writes the defaults over the stored seasons and custom limits (review, 16 Nov).

### Why

- NCAA programs keep a weekly countable-hours log (the CARA form) for every
  player. Coaches were doing it by hand from the calendar the app already has.

### Verification

- Unit: `screens/calendar/hours/__tests__/hours.test.ts` (rules, the draft,
  a real staging team's fall 2026 calendar read read-only, the CSV),
  `src/lib/golf/__tests__/practice-hours.test.ts`,
  `src/app/golf/actions/__tests__/hours.test.ts`.
- Component: `src/clubhouse/__tests__/practice-hours.test.tsx` (coach
  and player, every state code), `src/clubhouse/__tests__/calendar.test.tsx`
  (the More entry).
- RLS: `supabase/tests/rls/golf_team_hours.sql` (runs once the migration is
  applied).
- Not yet: real-app screenshots on staging (the Mac was offline); the saving
  paths on a database with the migration applied.

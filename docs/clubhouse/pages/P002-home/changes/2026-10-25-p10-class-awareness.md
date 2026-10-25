# 2026-10-25 — Class awareness (P-10): Coach Home's class line

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: 20202, 20416, 20501-20508, 20623-20626, 20701, 21101, 21603, 21808 (new); P002 categories 05 and 11 are now DEFINED
Actions: saveTeamTerm, addTeamBreak, removeTeamBreak (src/app/golf/actions/class-status.ts)
Data impact: reads golf_team_class_day, golf_team_terms and golf_class_exceptions; writes the last two. All behind class_awareness_v1 (off) and held migrations 20261025070000-070400
Held items: the migrations; nothing is on until they are applied and the flag is turned on
```

### Changed

- Coach Home gets a class line: first row of the phone body under the Day card, and the desktop head's subline row between the greeting and the actions. "4 of 9 in class now" over "Everyone out of class 11:50 AM to 1:00 PM", with the rest of the plan's copy table. It is a line, not a card: no border, no fill, no left edge. It is hidden on a weekend, on a team-wide no-class day, outside 7 AM to 7 PM team time, after the last block, and with no term and no schedules.
- A tap opens the In class now sheet (phone: bottom sheet; desktop: popover 380 wide anchored to the line). It holds the today strip, In class, Next today, Travelling and No class status, the term row with Edit, and Mark a day with no classes. A row opens that player's 1:1 thread. With no confirmed term and schedules in, the line asks for the term and opens the Term sheet directly.
- The Term sheet confirms a term (name, classes start, last day, exams end, class time zone). Saving is the confirmation; the dates are suggested from the label's usual window and say so until changed. The no-class days sheet marks a team-wide range of at most 21 days and lists the ones ahead, with a delete that asks first.
- `ChCoachHome.teamId` is now returned by `loadCoachHome` (optional in fixtures).

### Why

- A coach should not message a player mid-lecture without knowing. The line only says what is true: it counts tracked players, never "everyone is free".

### Decisions taken (the plan's recommended defaults)

- The line's second row on the coverage case reads "N of M have added classes", not "shared": the coach cannot learn who turned sharing off.
- "Ask for schedules" is a button in the sheet (a button inside the line's own button is not valid), and the prefilled message goes to every player without a class status, because the coach cannot be told who turned sharing off.

### Verification

- home-line.test.ts, in-class-model.test.ts, term-form.test.ts, class-awareness.test.tsx (every new CH code), use-class-day.test.tsx.

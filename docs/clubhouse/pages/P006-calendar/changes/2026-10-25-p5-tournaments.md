# 2026-10-25 — Calendar: P-5 tournaments from the calendar

## 2026-10-25 — Steps 1 to 5: the editor's tournament section and its actions

```text
Design package: P-5 build plan + CHANGELOG-2026-10-25, section P-05
PR/commit:      claude/clubhouse-tournaments-from-calendar
Contract IDs:   CH-6040, CH-6048 to CH-6061, CH-6140 to CH-6149, CH-6241,
                CH-6340, CH-6640, CH-6840 to CH-6842
Actions:        createTournamentFromCalendar, updateTournamentRound,
                setTournamentCancelled, untrackTournament
                (src/app/golf/actions/tournaments-calendar.ts)
Data impact:    held: 20261025040000, 20261025040100 (not applied)
Held items:     docs/clubhouse/held/data/tournaments-from-calendar.md, tournaments-calendar-sync.md
```

### Changed

- Behind `golf_tournaments_v1` (off, and not yet registered, so it reads off):
  choosing Tournament in the editor opens a Tournament details section with
  Track in Tournaments on. The editor's own date, time, all-day, repeat, place
  and find-a-time fields step aside; the section owns the days, the course (the
  qualifier picker, with Pick tees later and a typed course name), the rounds
  (one each day, or Custom), the lineup lock line, counting, format and More
  details. The receipt becomes the tournament's sentence.
- One save makes the tournament and one calendar entry per round, atomically.
  An event made before P-5 opens with Track off and its own hint; turning it on
  makes that event R1, keeping its replies and files.
- A refusal keeps the editor open with one numbered notice at the top of the
  section, focused. The toast after a save has Open and no Undo.
- The calendar draws the new rounds the moment the save lands, until the page's
  re-read replaces them.
- With the flag off, the editor is exactly today's.
- Events carry `courseId`; a plain hard delete of a tournament round is refused
  with "This round belongs to a tournament. Manage it in Tournaments."

### Reserved for the tournaments page (P016)

P-5 numbers that are catalogued on the tournaments page once 4.33's page
lands, not here: CH-16050 to CH-16053, CH-16253, CH-16352, CH-16353,
CH-16450, CH-16550, CH-16551, CH-16650, CH-16850.

## 2026-10-25 — Step 6: rounds on the calendar

```text
Design package: P-5 build plan, 4.9
PR/commit:      claude/clubhouse-tournaments-from-calendar
Contract IDs:   none new
Actions:        none
Data impact:    none (round refs are read only with golf_tournaments_v1 on)
Held items:     as above
```

### Changed

- A tracked round's block shows the tournament's name and an `R1` pill at its
  top right (hidden from speech; the block's name says "round 1 of 3"). A
  cancelled round's pill is a hairline ring led by Ban. A block under 28 px
  keeps the stored "Name · R1".
- Month chips and the week's all-day bars put " R1" after the name, kept whole
  while the name ellipsizes. The agenda keeps the title and adds a trailing
  "R1 of 3"; the phone list adds it to the second line.
- The inspector, for a round: the badge reads "Tournament · R2 of 3", the title
  is the tournament's name, and the facts add the course, how it starts and the
  lineup (a player sees only Published or Not published yet). Open in
  Tournaments leads; a coach gets Edit round while the round is upcoming.
  Duplicate, Cancel event and Delete permanently are not offered for a round.
- An event of type Tournament that isn't tracked (coach, flag on) shows "Not in
  Tournaments" with Set up, which opens the editor with Track on.
- Without refs (the flag off, or the read failed) every surface shows the
  stored title, as before.

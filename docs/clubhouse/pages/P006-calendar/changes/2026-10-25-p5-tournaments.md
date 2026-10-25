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

## 2026-10-25 — Step 7: round mode

```text
Design package: P-5 build plan, 4.3
PR/commit:      claude/clubhouse-tournaments-from-calendar
Contract IDs:   CH-6041, CH-6240 (and CH-6143, CH-6241, CH-6503 reused)
Actions:        updateTournamentRound; updateGolfEvent when the ref failed
Data impact:    none new
Held items:     as above
```

### Changed

- Edit round on a tracked round opens round mode, not the event editor: a
  banner ("Part of Pinehurst Invitational · R2 of 3", Edit tournament to the
  desk, after the discard question when there are changes), then Day, First
  tee, Ends (moving with the tee), Start, Notes, Invite and Ask players to
  RSVP. No title, type, place, repeat or find a time.
- Saves go through `updateTournamentRound` with the round's version; a move
  toasts where it went (CH-6041). A stale version keeps the values with Reload
  (CH-6241); an out-of-order day is refused in order words (CH-6143).
- A round under way, final, or in a cancelled tournament opens read-only with
  only Close. A round whose ref didn't load shows CH-6240 and changes only its
  day and times, through the calendar's own save.

## 2026-10-25 — Step 8 (calendar side): cancel and restore

```text
Design package: P-5 build plan, 4.10; changelog should 5
PR/commit:      claude/clubhouse-tournaments-from-calendar
Contract IDs:   CH-6042 to CH-6044, CH-6540, CH-6541
                (CH-6050, CH-6051, CH-6058 reused)
Actions:        setTournamentCancelled
Data impact:    none new
Held items:     as above
```

### Changed

- Cancel round (the inspector's menu, round mode) asks CH-6540, with an
  optional reason and "Cancel the whole tournament instead" (CH-6541).
- Confirming strikes the rounds through at once and toasts with Undo; the
  write waits until the toast goes (or the page is left), so Undo sends nothing
  and players hear only of a cancel that stands. A refusal that comes back then
  (scores entered meanwhile) un-strikes the rounds and says why.
- Restore round and Restore tournament write at once, toast CH-6044 and offer
  no Undo; a restore another round moved in front of is refused (CH-6058).
- The desk's Stop tracking and Cancel tournament dialogs wait for 4.33's
  tournaments page.

## 2026-10-25 — Step 10: moving a round by drag (ties to P-4)

```text
Design package: P-5 build plan, 6.4; P-4 4.8
PR/commit:      claude/clubhouse-tournaments-from-calendar
Contract IDs:   CH-6843 (CH-6018, CH-6050, CH-6143 reused)
Actions:        updateTournamentRound (from P-4's held move)
Data impact:    none new
Held items:     as above
```

### Changed

- A round dropped where it would break the round order is refused before
  anything is asked: it snaps back, felt as an error, and CH-6843 says why.
  The check is the editor's and the RPC's rule; cancelled rounds don't count.
- Any other drop asks "Move Pinehurst Invitational R2 to Fri 6 Nov, 8:42 AM?"
  with "Players’ tee times aren’t changed." and Cancel / Move round; then it is
  held with Undo as any move.
- The held write goes to `updateTournamentRound` with the round's version (and
  the newest one after a save); stale is P-4's stale path; a refusal shows its
  own words. An all-day round moved by its bar stays all day.
- Rounds that aren't upcoming, of a cancelled tournament, or whose ref didn't
  load don't drag.

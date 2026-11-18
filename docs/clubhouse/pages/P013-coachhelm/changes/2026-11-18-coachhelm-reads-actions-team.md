# 2026-11-18 — coachhelm

## 2026-11-18 — CoachHelm's read: the coach acts on it, the focus verdict, Team reads, and the player's own card

```text
Design package: COACHHELM_2_TO_10.md section 6 ("the five things that would make it a 10")
PR/commit:      agent/coachhelm-reads (#2585)
Contract IDs:   CH-13015, CH-13016, CH-13017, CH-13215, CH-13216, CH-13316 (new)
Actions:        setFocusFromCoachHelmRead, markCoachHelmRead (src/app/golf/actions/coachhelm-reads.ts)
Data impact:    inserts into the held golf_coach_read_focus and golf_coach_read_feedback (append-only, RLS); reads golf_coach_reads
Held items:     flag coachhelm_reads_v1 off everywhere; migrations 20261117120000 and 20261117121000 HOLD
```

### Added

- On "CoachHelm's read" (coach, the listed team only): Set as focus, Not useful,
  and Wrong (a sheet asks for the reason). Each change shows at once and goes
  back, with an error toast and Try again, when the server says no (CH-13015 to
  CH-13017). A Retry sends the same one-time id, so a row is written once.
- The focus line: "Focus set 3 Nov on approach, 1.4 strokes a round lost then.
  Since then: 4 rounds, from 1.4 to 0.9 strokes a round lost." and one word
  with what it means ("Too early: the verdict comes after 8 rounds", "Did not
  move: within what the rounds would have drifted to anyway"). Until the next
  saved read: "No round counted since yet."
- Team reads (`?view=team-reads`, linked from the board for a team on reads): the
  part most of the team shares, said once; the players grouped by the part that
  costs them the most, each with their own line and figure; who improved; who has
  no read yet. Built for a full roster (12 to 21 players). CH-13215 (didn't load),
  CH-13316 (no read saved yet).
- The player's own read on Your week ("CoachHelm's read of your game"), spoken to
  them, with no team figure, no coach's verdict, no focus and no actions; a read the
  coach marked down is not shown. CH-13216 (didn't load).

### Changed

- For a team on reads, What's new, the notification receipts and the Monday brief
  drop notes and good news, as the board and the file already did.

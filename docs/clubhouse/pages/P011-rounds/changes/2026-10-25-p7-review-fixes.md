# 2026-10-25 — Rounds: the P-7 review fixes (changelog 2026-10-25)

## 2026-10-25 — The course page and review stats, corrected after review

```text
Design package: P-7 build plan, CHANGELOG-2026-10-25 "P-07", "If you already
                built from the old plan"
PR/commit:      feature/p7-course-review-stats
Contract IDs:   none new
Actions:        none
Data impact:    reads only; one more read (golf_course_tee_holes, the tee
                cards of nine-hole rounds) and the team's zone
Held items:     20261025060000_golf_rounds_player_course_completed_idx.sql
                (HOLD, conditional on measurement)
```

### Changed

- Hole tiles take colour only from five plays and past two standard errors.
  The spread is the player's own at this course from 30 degrees of freedom,
  else 3.6 / √18 (about 0.85). From two to four plays a tile is an early
  read on the level fill; the section note says "Colour shows from 5 plays of
  a hole".
- Stretches measure each three holes against the player's own average for
  three holes (window less 3/18 of the round), from five rounds, past 2.6
  standard errors: "Holes 13 to 15 · 1.4 a round over your usual". The coach
  draft says the same.
- "How it plays": inside one standard error it says "about the same" only when
  that SE is a shot or less, else "No clear difference yet".
- Nine-hole rounds (stored 1 to 9 whichever nine) count in hole figures only
  when `nineOf` places them on the tee card or the player's own 18-hole card;
  the note names the ones left out. The review names no stretch on a nine, its
  closing three reads "Last three holes", and Here before uses 18-hole rounds.
- The season turns on 1 August in the team's zone (`loadTeamZone`); a round's
  own season is `seasonStartOfDay(round_date)`. Best nines compare 18-hole
  rounds only.
- Putts per green: "5 on 3 greens" under 10 greens, the rate from 10. A nine
  shows the per-round big-numbers usual. The tour figure is gone.
- The turning band's gains are stage red at 0.12 with red edges (D-42).
- Posted rounds keep no start hole, so the reads no longer select it.
- Record chips are static (owner call 9, default).
- Phone hole map: owner call 2 is open, so a phone (under 600 px) shows the
  List only. Elsewhere the map shows while nine tiles fit "+8.8" (a container
  query in em, mirrored to the switch by a ResizeObserver).
- `.ch-ch` uses the phone page and section tokens; the review's Tot column
  keeps `border-left: 2px solid transparent`; the arc scrolls with `pan-y`;
  dates go through `lib/golf/date-only.ts` ("Sep 2025").
- The review's history (stage 3: the player's rounds list, the team's zone, then
  the holes it needs) streams in after the review (`loadReviewHistory`, from
  `routes/round-review.tsx`), so the review still paints after its two read
  waves (`rounds-reads.test.ts`). Record chips, Here before, the usual and the
  compare ghosts fill in when it lands; a failed or cut-off stream shows none
  of them and says nothing. This sets aside "present on first paint" in owner
  call 9 until the owner rules on it.

### Verification

- `course-history-shape.test.ts`, `record-marks.test.ts`,
  `round-history-shape.test.ts`, `round-says.test.tsx`, `hole-map.test.tsx`,
  `course-arc.test.tsx`, `course-coach.test.tsx`, `record-chips.test.tsx`,
  `score-flow-slider.test.tsx`, `course-page-css.test.ts`,
  `review-history-stream.test.tsx`.
- pgTAP written, run in the end batch: `golf_rounds_player_course_idx.sql`,
  `golf_course_history_reads.sql`.

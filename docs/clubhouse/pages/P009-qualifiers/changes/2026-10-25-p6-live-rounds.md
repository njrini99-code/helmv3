# 2026-10-25 — Live rounds (P-6): the qualifier page stops re-reading on every autosave

## 2026-10-25 — A five-second gap, and the push channel (slices 0 and 3)

```text
Design package: build plan P-6 section 8.14 and 8.1 (handoff 4.34.6)
PR/commit:      claude/clubhouse-live-rounds (slices 0 and 3)
Contract IDs:   none new
Actions:        none
Data impact:    none to the qualifier loader. With held migration 20261025050100 applied the page also joins the team's
                coach topic (golf-live:coach:<team>) as the signed-in coach; nothing else changes
Held items:     docs/clubhouse/held/data/live-rounds-realtime.md
```

### Changed

- `useLiveStandings` (qualifiers/live.ts): `recompute_golf_round_totals` updates `golf_rounds` about 37 times per autosave,
  so every watching page re-read on every autosave of every player. A change now re-reads the page only when the round's
  `updated_at` or status is new, and two re-reads are never closer than five seconds (the 800 ms debounce stays).
- With the push migration applied, the page joins the coach topic as well; a message about this qualifier re-reads the page
  through the same gate, and while that channel is up the `golf_rounds` feed no longer re-reads the page (it keeps the Live
  label honest). If the channel is not there or drops, the `golf_rounds` feed does the work as before.

### Why

- Without it every autosave on a qualifier day refreshes every coach's page.

### Verification

- `screens/qualifiers/__tests__/live-refresh-gate.test.ts`, `screens/qualifiers/__tests__/live-push.test.tsx` and the
  existing `qualifiers.test.tsx` (90304). The live standings still come from the loader.

## 2026-10-25 — The qualifier page and list say who is on the course (slice 4)

```text
Design package: build plan P-6 (handoff 4.34.6) with the 2026-10-25 changelog and recheck applied; Live rounds has no page of its own (P016 is Tournaments)
PR/commit:      claude/clubhouse-live-rounds (slice 4)
Contract IDs:   CH-16620, CH-16621, CH-16622
Actions:        none (reads only)
Data impact:    The detail route loads this qualifier's live lanes beside the standings (Promise.all); the list route loads the team's lanes for a coach. A failed live read is an empty snapshot, never an error
Held items:     none
```

### Changed

- A coach's qualifier page, while in progress, gets an "On the course · n" section above the leaderboard (today's round
  only, live lanes only, no event rows), with See all opening the live view narrowed to the qualifier. `LiveChip` is
  unchanged; `FreshnessChip` is the shared form for the live view.
- A player with a round of their own under way on this qualifier sees "Standings update when your round is posted." and
  their board stops following the feed (the privacy rule: their own round hides the field's lanes). The coach's page joins
  the coach topic through the same refresh gate.
- The coach's list adds "Round 2 live · 3 on the course" under the name of a qualifier that has players out.

### Why

- Qualifier day is the busiest live day; the coach should see the field without leaving the page (plan section 4.7).

### Verification

- `screens/qualifiers/__tests__/on-course.test.tsx`, `live-push.test.tsx`; tsgo clean. No screenshots (no browser was run).

# 2026-11-17 — coachhelm

## 2026-11-17 — CoachHelm's read on the coach's file (stage 1)

```text
Design package: COACHHELM_2_TO_10.md sections 4 and 6 (stage 1); STAGE1_RECON.md
PR/commit:      agent/coachhelm-reads
Contract IDs:   none changed
Actions:        none
Data impact:    reads the held table golf_coach_reads (its current view) with the coach's session; nothing written from the page
Held items:     flag coachhelm_reads_v1 is off everywhere; COACHHELM_READS_TEAM_IDS is unset; migration 20261117120000 is HOLD
```

### Added

- On the coach's file on one player, for a team the flag lists, one card above
  today's cards: "CoachHelm's read" (`file/AnalystRead.tsx`). It says where the
  strokes go (which part, strokes a round), how sure (Clear, Likely or
  Leaning), one level down (the distance, lie or kind of tee shot, else "spread
  across the part") with the counted pattern, the team sentence (coach only),
  "How we found this" in three sentences, "What would change this", and
  `Through {date}, N rounds` (with `No new rounds since {date}` after three
  weeks). A player without five rounds with every shot logged reads what is
  missing ("Needs 5 ...; has 3.").
- "The N rounds behind it" opens a sheet: each round worst first, with date,
  course, score and what in it carries the read, and the shots, each round
  opening the round (`/golf/dashboard/rounds/<id>`).
- States: nothing drawn when the flag is off, the table is not applied, or no
  read is saved yet; `Couldn't load {first}'s read` when the read fails, the
  rest of the file unchanged.

### Changed

- For a listed team only: the coach's file and the CoachHelm board leave out
  today's "nothing found" (note) and good-news (strength) rows and the
  one-sentence root cause. Nothing is deleted; every other team is as before.

### Verified

- Unit and render tests (`file/__tests__/analyst-read.test.tsx`). No
  screenshots: the card draws only with the held table applied and the flag on
  for a team, which no environment has yet.

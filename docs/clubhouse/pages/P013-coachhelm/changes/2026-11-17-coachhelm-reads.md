# 2026-11-17 — coachhelm

## 2026-11-17 — CoachHelm's read on the coach's file, behind a team flag (insights rebuild, stage 1)

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
  "Through <date>, N rounds" (with "No new rounds since <date>" after three
  weeks). A player without five rounds with every shot logged reads what is
  missing ("Needs 5 ...; has 3.").
- "The N rounds behind it" opens a sheet: each round worst first, with date,
  course, score and what in it carries the read, and the shots, each round
  opening the round (`/golf/dashboard/rounds/<id>`).
- States: nothing drawn when the flag is off, the table is not applied, or no
  read is saved yet; "Couldn't load <first>'s read" when the read fails, the
  rest of the file unchanged.

### Changed

- For a listed team only: the coach's file and the CoachHelm board leave out
  today's "nothing found" (note) and good-news (strength) rows and the
  one-sentence root cause. Nothing is deleted; every other team is as before.

### Verified

- Unit and render tests (`file/__tests__/analyst-read.test.tsx`). No
  screenshots: the card draws only with the held table applied and the flag on
  for a team, which no environment has yet.

## 2026-11-18 — The four parts, what else is unusual, memory and the focus line (insights rebuild, stages 2, 4 and 5)

```text
Design package: COACHHELM_2_TO_10.md sections 3, 5 and 6 (stages 2, 4, 5)
PR/commit:      agent/coachhelm-reads (#2585)
Contract IDs:   none changed
Actions:        none
Data impact:    reads the held tables golf_coach_read_feedback and golf_coach_read_focus (missing reads as none); nothing written from the page
Held items:     flag coachhelm_reads_v1 off everywhere; coachhelm_v2_writer_stop_v1 off everywhere; migrations 20261117120000 and 20261117121000 are HOLD
```

### Added

- On the same card, for a listed team: "The four parts" (off the tee,
  approach, around the green, putting: strokes a round, the last 10 against
  the 10 before, where one level down, and the team's middle for a coach) and
  "Also unusual" (at most three counted reads from the catalogue, one per
  family, each against the teammates' median).
- Memory: the words change only at a checkpoint (3 new rounds or 20 new shots
  of that kind). A stronger or weaker read says what changed in one line; an
  improvement says what it was and what it is now before it clears.
- A focus made from the read shows a one-word verdict and the "since the focus
  was set" line.
- A read a coach marked "not useful" or "wrong" draws only "You marked this
  read ...: <reason>. It stays down until the evidence changes."
- The weekly team brief exists as data only (`reads/team-brief.ts`): no
  screen, no send.

### Changed

- For a listed team, the old engine's Tier-1 checks stop writing new cards.
  Rows already written stay, and every other team is unchanged.
- A coach's Deep dive now names the player in a cause's driver labels, and so
  does a coach's audit line when no gauge is drawn ("Jonah's right-to-left make
  %", not "Your ..."). This applies to every team, not only listed ones.

### Verified

- Unit tests: the catalogue floors and signal test, the engine gates, the
  memory rules, a season replayed in date order, the focus words, the brief,
  and the coach-voice cases (`coachhelm-coach-voice.test.ts`,
  `coachhelm-dive.test.tsx`). No screenshots, for the same reason as stage 1.

# 2026-11-18 — coachhelm

## 2026-11-18 — CoachHelm's read: the four parts, more, and memory (stages 2-4)

```text
Design package: COACHHELM_2_TO_10.md sections 3, 5 and 6
PR/commit:      agent/coachhelm-reads
Contract IDs:   none changed
Actions:        none
Data impact:    reads the held golf_coach_reads payload only
Held items:     flags coachhelm_reads_v1 and coachhelm_reads_written_v1 off everywhere; migrations 20261117120000 and 20261117121000 HOLD
```

### Added

- On "CoachHelm's read" (the listed team only): "The four parts" (each part's
  strokes a round this season, the last 10 rounds against the 10 before, one
  level down, and the team's middle for the coach), and "Also unusual" (at most
  three counted reads that stand out in the team, each with the team's middle).
- Memory on the card: "was X, now Y" first the night a card clears, one line
  when it strengthens, weakens or changes, "This is back", and a "since the
  focus was set" line with its one word at the horizon.
- A card the coach marked "not useful" or "wrong" collapses to one line with
  the reason until the evidence changes.
- The model-written paragraph (stage 3), when its own switch is on.

### Verified

- Unit and render tests. No screenshots: nothing draws until the held tables
  are applied and the flag is on for a team.

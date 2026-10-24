# 2026-10-24 — Palette People: the right words, and a quiet loading line

## 2026-10-24 — A coach's search says when players are still on their way or didn't load; no more "open the Roster"

```text
Design package: none (Clubhouse A+ Round 1, S3; found by S1, decision 16 follow-up)
PR/commit:      agent/aplus-s3
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The no-match line no longer says "Players appear here once you have opened
  the Roster": since 9c348546e a coach's players are read when the palette
  opens.
- CommandLayer tracks that read (`ChPeopleState`: idle, loading, ready,
  failed) and hands it to the palette. While a coach's search runs and the
  players are on their way, one quiet status line says "Looking up your
  players…", under the results or inside the no-match line, and goes once they
  land. If they didn't come (a throw, or no list), the line says "Your players
  didn’t load. Close this and open it again to try again.", and the next
  opening asks again (a null answer used to stop it asking for that scope).
- Nothing changes with nothing typed (the launcher shows no People) or for a
  player. The line reuses `.ch-cmd-empty`; no new styles.

### Why

- The old copy sent the coach to the Roster for something the palette now
  does itself, and a first search made before the players arrived looked as if
  the team had none.

### Verification

- command-layer.test: the loading line under results and in the no-match
  line, gone once the players land; the failed line and a second opening that
  asks again; no players line for a player; the no-match line without the
  Roster sentence.

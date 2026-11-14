# 2026-11-13 — coachhelm

## 2026-11-13 — The Team board and the player's Your week start their reads together (F-0013)

```text
Design package: none (owner's browser audit, finding F-0013, S2 speed)
PR/commit:      agent/ch-look-speed
Contract IDs:   none changed (data order only; every figure and state is as it was)
Actions:        none
Data impact:    none (the same reads, in fewer and wider rounds; no write, no schema change)
Held items:     the lab measurement (below)
```

### Changed

- The coach's Team board read its roster in two round trips (members, then
  the players' names), the team's row twice, and the Tour comparison's
  standings only after everything else had landed. The roster is now one
  read (each member row carries the player it names), the team's row is read
  once for its name, its tour and the Tour's values, and the standings start
  with the insights, so the hero and the stations no longer wait for them.
  The timezone read is no longer ahead of the insights, the heads and the
  rounds: it is needed only to shape the board.
- A player the coach cannot read is left out of the roster, as before.
- The player's Your week started its own reads only after the feed had
  loaded; they now start beside it (the feed still answers first when it is
  not ready, and a not-ready feed discards them unused).

### Verification

- `data/__tests__/coachhelm-team-waves.test.ts` (new): serial depth of the
  loader by rounds (gate, roster, then one wide round), one request per kind,
  a slow timezone read holding nothing back, failed roster and standings
  reads. These fail on the previous loader.
- `data/__tests__/coachhelm-file-loader.test.ts`: two tests for the Your week
  overlap.
- `coachhelm-streaming.test.tsx`: its roster fixture now carries the players
  on the member rows.

### Not measured

- No browser, build or database was used. The LCP target (2.5 s) and the
  100 ms route skeleton need a WebKit phone-lab run on staging
  (`scripts/phone/`); the loader's depth is proven in tests, the seconds are not.

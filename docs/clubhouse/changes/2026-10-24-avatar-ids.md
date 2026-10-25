# 2026-10-24 — A player's coin keeps one colour across the app

## 2026-10-24 — Stats and Qualifiers key their coins by player id

```text
Design package: none (review of #2361, avatar tint; B19)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     coins with no player behind them keep the name: a program or
                team, an invite, a join request, the signed-in account
```

### Changed

- The player Stats hero (desktop and phone), Team Stats' season bests, the
  qualifier board, its squad and qualifying lists, Manage selections and the
  qualifier form pass the player's id to `Avatar`, as Roster and Messages do.
  A player's coin no longer changes colour between those screens.

### Verification

- `avatar-ids.test.ts`: no coin in `screens/stats` or `screens/qualifiers`
  falls back to the name. Stats and Qualifiers suites pass.

# 2026-10-24 — Player Stats: the coach's page paints before CoachHelm's reads

## 2026-10-24 — The reads stream in behind the profile (C2)

```text
Design package: none (Clubhouse A+ Phase 3, C2, row 16)
PR/commit:      agent/aplus-phase3
Contract IDs:   CH-5215
Actions:        none
Data impact:    none (the same reads, no longer awaited before the page)
Held items:     a speed trace on an iPhone; npm run build (a server route now
                hands a promise to a client screen)
```

### Changed

- A coach opening a player's Stats page waited for the CoachHelm scope check
  (gate, membership, the player's gate) and the reads before anything drew.
  The route now awaits only the profile and passes the reads as a promise that
  never rejects; Game detail's "CoachHelm sees" lines and the CH-5215 notice
  each sit in their own Suspense and land when the reads do.
- The player's own page is unchanged (its reads were already beside the
  profile and are quick).

### Verification

- `stats-player.test.tsx`: the route hands over a promise; Game detail draws
  before the reads and shows CH-5215 once they land as failed.

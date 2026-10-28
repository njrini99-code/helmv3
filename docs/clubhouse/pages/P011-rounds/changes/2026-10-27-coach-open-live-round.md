# 2026-10-27 — A coach's Open round on a live player

## 2026-10-27 — A round still being played sends a coach to Live, not Home

```text
Design package: none (WIRING_REVIEW-2026-10-27, item 1)
PR/commit:      fix/clubhouse-wiring-breaks
Contract IDs:   none new (110109, CH-11307 unchanged)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The round review sends a round still being played to the player's own
  continue page only for the player. A coach on their team is sent to Live,
  narrowed to that player (`/golf/dashboard/live?player=`). The continue page
  is player-only, and before this it bounced a coach to sign-in and Home. A
  coach off the team still gets "This round isn't here" (CH-11307).
- A live lane's long press offers Open round only for a posted round. A round
  still being played offers Follow on Live instead. This covers Live, Home's
  Live now card, Team rounds and a qualifier's On the course list.

### Why

- Wiring review 2026-10-27, item 1: "Open round" on a live player went
  nowhere for a coach.

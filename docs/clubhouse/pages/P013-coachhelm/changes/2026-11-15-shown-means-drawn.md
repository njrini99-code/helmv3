# 2026-11-15 — a coach's player read counts as shown only when it is drawn

## 2026-11-15 — Standing records nothing; the dive records what it draws

```text
Design package: none (launch readiness DF-P-03)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        `getInsightsForCoach` takes `drawnLater` (as the player feed does)
Data impact:    fewer `golf_insight_exposure` (`coach_feed`) rows: none from the coach's player Standing; only the drawn reads from the dive
Held items:     none
```

### Changed

- `data/coachhelm-player.ts`: the coach's player Standing reads the coach feed only to mark which metrics have an open read. It drew no
  card, but every open recorded the whole feed (up to 30 reads) as shown to the coach. It now passes a `drawnLater` that draws nothing.
- `data/coachhelm-player.ts`: the coach's player dive records the reads it draws (not a note, not one the lifecycle leaves out, not a row
  of another player's), and only once the dive is sure to render; a dive that ends in "didn't load" records nothing.
- `app/golf/actions/insight-delivery.ts`: the coach feed records only the ids `drawnLater` returns, when a caller passes it.

### Why

- A coach opening one player's Standing marked every read on that player as seen, so the effectiveness ledger and Track record counted
  reads the coach never saw.

### Verification

- `data/__tests__/coachhelm-player.test.ts`, `lib/coachhelm/delivery/__tests__/player-feed-contract.test.ts`.
- Not checked in a browser or on a device in this change.

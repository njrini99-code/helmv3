# 2026-11-12 — tournaments

## 2026-11-12 — A live round with nobody in it is drawn as itself (G15)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   CH-16370 (no team line and no Go live with nobody in the round)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The preview fixture's empty state builds Pinehurst round 1 with nobody in it through the loader's own `buildLive`, so tournament-live?state=empty is the real no-lanes page, not the full lineup.
- With no lanes the page leaves out the team line ("No scores yet", which stood over "Nobody is in this round yet") and Go live (nobody to score): the empty state and its Open the lineup are the page.

### Why

- Grading 2d-A (G15): the empty state looked like the default, so it was never seen; once it was, it said it twice.

### Verification

- `fixtures-tournaments.test.ts`, `live-empty.test.tsx`, `tournaments-live.test.tsx`, `tournaments-views.test.tsx`: exit 0.

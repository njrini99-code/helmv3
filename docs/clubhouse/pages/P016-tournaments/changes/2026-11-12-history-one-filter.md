# 2026-11-12 — tournaments

## 2026-11-12 — History on a phone: one filter, and a trophy for its empty state (G17)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   CH-16340 (its medallion)
Actions:        none
Data impact:    none
Held items:     the empty state's copy and action (W19/Q3, the owner's)
```

### Changed

- Phone: one filter of three (Rating, Returning, The field) in place of the desk's two stacked filters; each writes the same address the desk's pair does. The desk keeps its two.
- The empty state draws the trophy the Events view's first run draws, not a plus tile.

### Why

- Grading 2d-A (G17): two segmented controls stacked before any content, and a sixth empty idiom.

### Verification

- `tournaments-history.test.tsx` (the phone's filter count changed with the contract), `tournaments-views.test.tsx`: exit 0. docs/clubhouse/phone/tournaments.md updated.

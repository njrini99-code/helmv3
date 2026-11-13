# 2026-11-12 — tournaments

## 2026-11-12 — Tournament live on a phone: one primary, quiet rows (G16)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Phone: Finish round is the one primary, with Suspend play a quiet ghost key
  beside it in one row (they were two full-width keys stacked).
- Phone: an editable lane is one row that opens its score (chevron, pressed
  wash, focus ring, as the player's event rows).
- Phone: Score by hole is offered inside the score sheet ("Score hole by hole
  instead"); the lane carries no keys. The desk is unchanged.

### Why

- Grading 2d-A (G16): about twelve keys on the first screen, two per lane.

### Verification

- `live-phone.test.tsx` (new), `tournaments-live.test.tsx`,
  `look-feel-pass-css.test.ts` (the row button's font is a type token): exit 0.

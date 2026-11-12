# 2026-11-12 — rounds

## 2026-11-12 — Round review says the score once (W47)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The card's head is its name and tees: its total (the hero's score again) is gone on screen; the Total column and the printed head keep it.
- With the card drawn, the strip of front, back, putts, fairways and greens is gone (each was the card's Out, In and Total cells), and Zone 1 leaves out its "Out · In" line. A round posted as a total, with no card, keeps both.

### Why

- Nick's walk (W47): the round's figures appeared three times.

### Verification

- `round-review.test.tsx` (111811 rewritten for the contract), `rounds.test.tsx`, card and debrief tests: exit 0. docs/clubhouse/phone/rounds.md updated.

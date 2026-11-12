# 2026-11-12 — qualifiers

## 2026-11-12 — A qualifier past its last day asks the coach to close it (W33)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W33)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none (the link opens the detail, where Close qualifier already is)
Data impact:    none
Held items:     the pill keeps "Waiting on n rounds" / "Past last day" (F-0068 keeps "Ended" for a completed qualifier);
                a Close button on the list card itself would be a write from the list, a product call
```

### Changed

- For a coach, a live qualifier past its last day reads "Review and close" as its card's link words, on the hero and
  on the smaller cards, instead of "View leaderboard". Players and qualifiers inside their dates are unchanged.

### Why

- Nick's walk (W33): "Fall Invitational Qualifier" ran Sep 25 to 29, sat as Active and "Waiting on 7 rounds" six weeks
  on, and nothing asked the coach to close it.

### Verification

- `qualifiers-premium.test.tsx` (W33 case); qualifier suites 29 files, 386 tests, exit 0; eslint exit 0.

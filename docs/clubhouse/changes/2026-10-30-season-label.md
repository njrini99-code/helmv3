# 2026-10-30 — One season label helper

## 2026-10-30 — `seasonLabelOf` moves to `lib/season-start.ts` (F-0002)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0002; fix plan
                PR 2)
PR/commit:      claude/audit-fix-02-season-label
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `seasonLabelOf(date)` lives in `lib/season-start.ts` beside
  `seasonStartOfDay`; `rounds-model.ts` re-exports it and `tournaments-shape`
  uses it, so a season is written one way ("2026–27", en dash, two digits).
  `currentSeasonLabel(now, zone)` in `data/season.ts` gives the season turning
  now.

### Verification

- `season-label.test.ts` and `rounds-model.test.ts` pass.

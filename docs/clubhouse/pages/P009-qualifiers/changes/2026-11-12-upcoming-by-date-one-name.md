# 2026-11-12 — qualifiers

## 2026-11-12 — Upcoming by date, and one name for the page (W34)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W34)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Under the Active hero, the remaining qualifiers run live first, then upcoming by start date. When they are all upcoming
  the section is headed "Upcoming" (it read "Also active").
- The coach's page title is "Qualifiers", the name the sidebar, breadcrumb and phone top bar use; it read "Lineup
  decisions". The lede ("Rank players over counted rounds and pick who travels.") still says the job.
  `docs/clubhouse/phone/qualifiers.md` notes the change. Fairway's own qualifier page is untouched.

### Why

- Nick's walk (W34): "Also active" held two upcoming qualifiers, Nov 23 listed before Nov 20, and the page had two names.

### Verification

- `qualifiers.test.tsx` (title and section expectations updated), `qualifiers-premium.test.tsx` (W34 case); qualifier
  suites 29 files, 387 tests, exit 0; eslint exit 0.

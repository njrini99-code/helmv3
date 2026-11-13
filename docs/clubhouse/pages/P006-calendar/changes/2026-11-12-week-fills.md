# 2026-11-12 — calendar

## 2026-11-12 — Week blocks one step stronger (W43)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W43)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new (P-4 4.1 type key: same materials, stronger)
Actions:        none
Data impact:    none
Held items:     a left rule per type (W43's suggestion) is against the owner's "no side stripe" (2026-10-24)
```

### Changed

- Practice and workout blocks: green-100 (was green-50), ring 0.24 (was 0.16).
- Meeting and other: the paper block's edge is border-strong (was
  border-control).
- Classes: the slate's ring is 0.24 (was 0.16).
- Applies to every view that draws `.ch-ev--*` (week, day, bars). Dark mode
  keeps its own rules.

### Why

- Nick's walk (W43): on his 1x monitor the week read empty; a meeting was
  rgb(252,250,245) on rgb(246,244,238).
- Not done: W43 also suggests a left rule per type; the owner ruled out side
  stripes on 2026-10-24 (calendar.css P-4 4.1
  note), so that stays out.

### Verification

- `screens/calendar/__tests__/week-fills-stronger.test.ts`; calendar suites,
  event block and every test reading
  calendar.css: 22 files pass. The one failure in that run,
  `spacing-scale.test.ts` on `stats-redesign.css`, comes from
  e4f3144673 on the base branch.

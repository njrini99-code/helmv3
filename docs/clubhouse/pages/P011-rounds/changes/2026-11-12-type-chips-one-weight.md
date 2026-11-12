# 2026-11-12 — rounds

## 2026-11-12 — Round type chips at one weight (W31)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W31)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     an icon per type was not added; the tint follows the calendar's type colours
```

### Changed

- Tournament is no longer a black pill: it is the same chip as the others, a green-100 tint with forest ink. Qualifier
  keeps its pale green tint and loses its ring; Practice stays neutral. This applies to Team rounds and the player's
  library, which share the chip.

### Why

- Nick's walk (W31): three styles for three types, and the black pill was the loudest thing on the page.

### Verification

- `type-pill-one-weight.test.ts`; `dark-ink-guard.test.ts` drops the tournament chip from its ivory-ink list (it no
  longer uses ivory ink); rounds suites 151 files, 1060 tests, exit 0.

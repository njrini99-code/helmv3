# 2026-11-12 — roster

## 2026-11-12 — The leaders row says its rule (W24)

```text
Design package: none (preview walk fix, PREVIEW_ISSUES.md W24)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     using the cards' rule (no floor) instead; that changes what "Low average" means, an owner call
```

### Changed

- Under the coach's leader cards (Low average, On a heater, Needs a look) one
  quiet line: "Leaders count active players
  with 3+ counting rounds." On desktop it spans the top grid. Hidden in print.

### Why

- Nick's walk (W24): Low average named a 77.5 while player cards below showed
  72.0; those players had fewer than three
  counting rounds, and nothing said so.

### Verification

- `screens/roster/__tests__/leaders-rule.test.tsx`; roster suites 17 files, 147
  tests, exit 0.

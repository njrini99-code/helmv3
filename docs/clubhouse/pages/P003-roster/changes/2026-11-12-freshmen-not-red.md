# 2026-11-12 — roster

## 2026-11-12 — Freshmen are not red on Roster (G4)

```text
Design package: none (preview grade G4, GRADE_A.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     the shared --ch-yr-fr token (Team page coins, avatars elsewhere) keeps its terracotta; one tone app-wide is a design call
```

### Changed

- Inside Roster the Freshmen tone is a muted violet (#63597e light, #6e6590 dark): the class bar, its legend and the
  year chips on Roster move together. White on it holds 6.4:1 and 5.3:1.

### Why

- The class bar drew Freshmen in red. D-42 keeps red for under par, the pin flag and destructive actions, so a class
  read as a warning. The coordinator ruled the shared token stays; Roster sets its own.

### Verification

- `screens/roster/__tests__/freshmen-not-red.test.ts`; roster-matching suites with refresh-tokens and look-feel-pass-css, 53 files, 384 tests, exit 0.

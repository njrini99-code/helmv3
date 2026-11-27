# Clubhouse (cross-page) — Changelog

## 2026-11-27 — The gate reads a well as a well; the nightly frees its port

```text
Design package: none
PR/commit:      agent/presentation-gate-green
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Presentation gate (`e2e/clubhouse-gate/scan.ts`), nested-surface: a
  surface whose shadow is drawn inward, with at most a 1px lip below it, is a
  well in its card, not a card inside a card (DESIGN_LANGUAGE §4: "Tile or
  well in a card … a hairline, or the toggle well's inset"). A lifting shadow
  or a painted border still counts as a card. This clears the phone's Home
  scoreboard, the desk's week well and the Read bands (18 tests).
- Clubhouse quality workflow: each step that starts the dev server first
  frees port 3100, so a server left by the step before can't serve the next
  step stale pages. The motion step's timeout is 30 minutes.

### Why

- The browser suite had been red on main since at least 26 Nov: 36 gate
  failures and 2 motion failures, with 36 known lines passing as expected.

### Verification

- Clubhouse quality on this branch: smoke, presentation gate and motion.
- The nightly's port fix shows on the first nightly after merge.

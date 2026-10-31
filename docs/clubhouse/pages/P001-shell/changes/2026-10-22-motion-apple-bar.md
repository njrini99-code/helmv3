# 2026-10-22 — Motion pass (mot-01, mot-03)

## 2026-10-22 — The sidebar fold and section switches

```text
Design package: none (owner-approved motion pass, 2026-10-22)
PR/commit: branch claude/clubhouse-motion-apple-bar
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- RailToggle marks the fold as moving (lib/rail-fold.ts) so size readers and
  Lenis wait it out, and the brand panel drops its frost while it moves
  (shell.css). A tab bar or sidebar item swaps the page at once; RouteFrame's
  comment says so (shell.css, data-ch-tab).

### Why

- The cross-page entry, docs/clubhouse/changes/2026-10-22-motion-apple-bar.md,
  holds the reasons.

### Verification

- rail-fold.test.tsx and native-nav.test.tsx.

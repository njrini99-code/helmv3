# 2026-10-22 — Look-and-feel pass

## 2026-10-22 — Type weights, placeholders and motion catch-up

```text
Design package: none (owner-approved look-and-feel pass, 2026-10-22)
PR/commit: branch claude/clubhouse-motion-apple-bar
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Back during a phone push reverses from where the push stood (lib/nav-motion.ts
  takeRunningPush). A sheet reopened while closing picks up where it stood
  (lib/dialog-lifetime.ts). The More sheet's list rows are 400 and the shell's
  650s are 600 (shell.css); the base button is 500 (ui.css).

### Why

- The cross-page entry, docs/clubhouse/changes/2026-10-22-look-and-feel-pass.md,
  holds the reasons.

### Verification

- look-feel-pass-css.test.ts and native-nav.test.tsx.

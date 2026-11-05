# 2026-10-22 — Motion pass (mot-01)

## 2026-10-22 — Round zones read their label size once after the sidebar folds

```text
Design package: none (owner-approved motion pass, 2026-10-22)
PR/commit: branch claude/clubhouse-motion-apple-bar
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- RoundZones re-reads the label size when the sidebar's fold settles, not on
  every frame of it.

### Why

- The cross-page entry, docs/clubhouse/changes/2026-10-22-motion-apple-bar.md,
  holds the reasons.

### Verification

- The Clubhouse unit suite.

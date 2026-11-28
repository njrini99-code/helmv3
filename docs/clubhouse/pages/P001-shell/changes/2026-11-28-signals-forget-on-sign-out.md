# P001-shell — Changelog

## 2026-11-28 — the front door no longer sends as whoever signed out

```text
Design package: Bridge reliability follow-up (review of #2672)
PR/commit: agent/bridge-review-fixes
Contract IDs: none new
Actions: none
Data impact: none
Held items: none
```

### Changed

- `useChSignals` with `hold` (the front door while nobody is signed in) now
  tells the queue to forget whoever it was configured for, before it counts the
  held view. A queue never configured has nothing to forget.
- `use-signals.test.tsx` covers a dashboard session followed by the front door.

### Why

Codex review of #2672. The cross-page entry,
`docs/clubhouse/changes/2026-11-28-signals-forget-on-sign-out.md`.

# 2026-10-23 — Two stray sizes back on the type scale

## 2026-10-23 — 12.5px to 13px (mot-08 pin)

```text
Design package: none (owner-approved type scale, mot-08)
PR/commit: branch agent/clubhouse-aplus-wp1
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `coachhelm-profile.css:62` and `rounds-track.css:973` sat at 12.5px, off
  the 11-step scale. Both are 13px, the nearest step (ties round up).

### Why

- PRs #2328 and #2333 merged with these sizes after mot-08 pinned the scale,
  so `look-feel-pass-css.test.ts` was red on `main` (handoff W7, PR-1).

### Verification

- `src/clubhouse/__tests__/look-feel-pass-css.test.ts` passes again.

# P007 — Changelog

## 2026-11-27 — Two undefined token references removed

```text
Design package: none (design lab governance, dsx-09)
PR/commit: #2659, claude/project-thread-13od9x
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The typing bubble (`.ch-msv-typing` in `messages.css`) drops
  `filter: var(--ch-bubble-theirs-shadow)`: no such token exists, so the filter
  never drew, and received bubbles are flat (DM-06).
- The recipient token (`.ch-msp-tok`) reads `--ch-text-on-accent` instead of
  the undefined `--ch-on-accent` and its `#fff` fallback. In dark mode the
  text is the theme's on-accent ivory rather than white.

### Why

- The new token-reference check (`scripts/clubhouse/token-refs.mjs`, run by
  `clubhouse:check`) fails any `var(--ch-*)` that names a custom property
  nothing defines (design lab GAP-B3). This was one of the three on main.

### Verification

- What renders is unchanged, except as noted above: each old reference computed
  to the value now written, or to nothing.
- `npm run clubhouse:token-refs` and `npm run clubhouse:css` are clean.

# 2026-11-17 — comment fix

## 2026-11-17 — A coachhelm.css comment says CH-13405 is retired

```text
Design package: none (docs-currency pass; comment-only)
PR/commit:      agent/clubhouse-docs-current
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `styles/coachhelm.css`: the loading-height comment now says CH-13405 was
  retired with the old board (tombstoned as 130212).

### Why

- A comment cited a retired catalog code as if it were live.

### Verification

- No runtime change: only a CSS comment. `npm run clubhouse:check`.

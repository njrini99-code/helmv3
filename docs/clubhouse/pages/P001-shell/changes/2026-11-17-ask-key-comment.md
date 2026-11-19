# 2026-11-17 — comment fix

## 2026-11-17 — A shell.css comment says CH-1840 is retired

```text
Design package: none (docs-currency pass; comment-only)
PR/commit:      agent/clubhouse-docs-current
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `styles/shell.css`: the comment above the hero Ask key now says CH-1840 was
  retired on 2026-11-15 (the quick chat replaced the key).

### Why

- A comment cited a retired catalog code as if it were live.

### Verification

- No runtime change: only a CSS comment. `npm run clubhouse:check`.

# 2026-10-27 — Press prefetch: the row mark no longer depends on the router

## 2026-10-27 — usePressPrefetch draws data-ch-ahead with or without a router

```text
Design package: none (production polish pass;
                doctrine in .claude/rules/clubhouse.md)
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `usePressPrefetch` drew a row's `data-ch-ahead` mark only when it had the app
  router. The mark is now drawn either way; the press handler still needs the
  router (`shell/use-prefetch-tabs.ts`). Outside the app router (a preview
  harness, a test rendering one row) the rows now carry the mark too.

### Why

- The mark says a row is worth fetching ahead whatever renders it. In Next 16
  the server render does provide the app router, so production was drawing the
  same mark on both sides already: this is not a hydration fix, and no
  production mismatch was seen.

### Verification

- `shell/__tests__/prefetch-on-press.test.tsx` (new case: same mark with and
  without a router).

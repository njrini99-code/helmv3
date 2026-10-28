# 2026-10-27 — Press prefetch: the row mark matches the server's HTML

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
  router. The server renders client components without one, so every list that
  prefetches on press (Rounds, team rounds, Qualifiers, the Tournaments form,
  Stats lists) hydrated with an attribute mismatch, and React kept the server's
  markless rows. `useIdleRowsAhead` then found no rows to fetch ahead. The mark
  is now drawn either way; the press handler still needs the router
  (`shell/use-prefetch-tabs.ts`).

### Why

- A hydration mismatch that React does not patch leaves the page's own idle
  prefetch switched off in production.

### Verification

- `shell/__tests__/prefetch-on-press.test.tsx` (new case: same mark with and
  without a router). WebKit: no hydration error on Rounds, Qualifiers and the
  Tournaments form.

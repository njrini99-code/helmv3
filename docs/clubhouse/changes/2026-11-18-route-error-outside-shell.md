# Shared route errors — Changelog

## 2026-11-18 — Route error words for a view outside the shell

```text
Design package: none
PR/commit: agent/clubhouse-screen-audience
Contract IDs: CH-1202 to CH-1206, CH-1290 (unchanged words)
Actions: none
Data impact: none
Held items: none
```

### Changed

- `ui/Notices.tsx`: exports `RouteErrorViewProps` and `routeErrorWords` (the
  title, body and catalog number for a route error), so the sign-in room's
  `GateError` draws the same words and numbers as `RouteErrorView`.
- `RouteErrorBoundary` (`src/components/errors`): an optional `outsideShell`
  view, drawn instead of the generic fallback outside the Clubhouse shell.
  Inside the shell `RouteErrorView` still wins. BaseballHelm and Lift Lab pass
  nothing and are unchanged.

### Why

- GolfHelm draws Clubhouse only (owner, 2026-11-18).

### Verification

- `route-error-outside-shell.test.tsx`, `route-error-offline.test.tsx`.

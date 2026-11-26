# Clubhouse shared — Changelog

## 2026-11-24 — Bridge signals (Bridge plan PR 1)

```text
Design package: Clubhouse Bridge redesign, 2026-11-18 (§4, §12 PR 1)
PR/commit: bridge/pr1-spine (#2611)
Contract IDs: none (signals carry the CH codes that already exist)
Actions: none
Data impact: none until the held migration 20261124090000 is applied
Held items: 20261124090000_clubhouse_bridge_signals.sql; the clubhouse_signals flag stays off
```

### Changed

- `lib/signal.ts` queues signal envelopes and posts them to
  `/api/ch/signal` every 10 s, at 20, and on pagehide (sendBeacon, then a
  keepalive fetch). It sends nothing while `clubhouse_signals` is off,
  stores nothing in the tab until the shell turns it on, and never blocks
  or fails a tap.
- `useAction` counts each save's start, success, failure, offline and
  busy, with its duration. A throw is now reported once, at medium; a
  handled failure once, at low; a quiet one not at all (Bridge writes it).
- `Toast` counts each coded toast, and an unreported error toast as a
  failure. Try again on a coded toast counts as a retry.
- `SectionBoundary` and the route error boundary count a crash, linked
  to the row `chReport` or `logError` writes.
- `EmptyState`, `InlineNotice` and `PageNotice` count each coded state
  they draw. A danger page with no code counts as CH-1211.
- `track.ts` feeds the signal trail. A `chReport` call made inside
  `reportingSignal()` carries that signal's place, so callers keep their
  arguments and the Bridge stamps the row instead of writing another.

### Why

- The Bridge has no live counts: a code exists in the catalog but nothing
  says how often people meet it. These signals are what fills it.

### Verification

- `signal.test.ts`, `signal-page.test.ts`, `use-action-signals.test.tsx`
  and the existing shell, states, toast and route error tests.

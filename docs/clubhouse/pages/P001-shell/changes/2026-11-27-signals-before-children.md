# P001 — Changelog

## 2026-11-27 — The signal queue is configured before a page's own signals

```text
Design package: none (Bridge data findings on #2611)
PR/commit: agent/bridge-signal-fixes
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `shell/use-signals.ts`: the effect that configures the signal queue and
  counts the view is a layout effect. React runs a child's effects before its
  parent's, so a new page's own signals (a failed load, a notice) used to be
  built on the page just left, and on a first load started a session before
  the queue knew whose it was.

### Why

- Failed loads were landing on the Bridge under the previous page (finding 2
  on #2611).

### Verification

- `use-signals.test.tsx`: after a switch, the queue is configured for the
  new page before a child's signal sent in its own effect, and the view goes
  before the page's states.

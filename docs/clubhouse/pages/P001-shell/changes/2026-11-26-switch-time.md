# P001 — Changelog

## 2026-11-26 — Page switch time on views (Bridge spaces PR A)

```text
Design package: Bridge spaces build, 2026-11-26 (PR A)
PR/commit: agent/bridge-switch-time
Contract IDs: none (views keep the codes they had)
Actions: none
Data impact: views gain durationMs; the hourly rows bucket it like any duration (no migration)
Held items: none
```

### Changed

- `shell/use-signals.ts`: a view after a tap on an in-app link, or after
  back or forward, carries the time from that tap to the new page's first
  frame as `durationMs`. The first view of a load (LCP covers it), a switch
  with no known start (a push from code) and one over 60 s carry none. A
  view that is left before it paints, or whose tab is put away, still
  counts, untimed.

### Why

- The Bridge Speed board shows page-to-page switch time per page, role and
  device.

### Verification

- `use-signals.test.tsx` (first view, tap, back, unknown start, slow
  switch, left before paint, tab hidden), `signal.test.ts` (a timed view
  keeps its page and duration) and `ingest.test.ts` (a timed view lands in
  the hourly buckets).

- A switch is a change of path or of Bridge page: Team stats to one player (`?player=`, P004 to P005) is timed; a query that only filters one page, or a hash, is not. A start dropped when the tab is put away before the new page arrives.

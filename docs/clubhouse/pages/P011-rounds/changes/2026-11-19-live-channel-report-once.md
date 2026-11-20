# Live channel reports once per outage — Changelog

## 2026-11-19 — Telemetry noise fix

```text
Design package: none
PR/commit: #2592 (agent/health-20261119-0347)
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `joinLiveTopic` (`src/clubhouse/live/channel.ts`) no longer reports a
  Realtime drop that its backoff rejoins. It reports once per outage, after
  four failed joins in a row; a SUBSCRIBED resets it. Nothing the user sees
  changes. Bridge fingerprints c1ecfd3a, 06e78d3c, 96fc4eb8, 2ab92bbf.

### Verification

- `src/clubhouse/live/__tests__/channel.test.ts` fails 2/2 on the old code,
  passes 2/2 with the fix; `npm run clubhouse:check`.

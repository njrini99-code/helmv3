# P007 Messages — 2026-11-15

## 2026-11-15 — Each day separator in a thread has its own React key

```text
Design package: none (desktop health routine, Sentry JAVASCRIPT-NEXTJS-1EH / 1MG)
PR/commit:      agent/health-20261115-1548 (#2533)
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/messages/thread/model.ts` (`threadItems`): a day separator's key is
  `d<day>:<id of the message that opens the day>` (was `d<day>`). Nothing the
  reader sees changes.

### Why

- When a thread's list comes back round to a day, the second separator
  repeated the first one's key. React warned ("two children with the same key,
  `d2026-10-15`") 35 times in an hour on the preview and may drop or duplicate
  one of them on update.

### Verification

- `src/clubhouse/screens/messages/__tests__/thread-model.test.ts` (RED, then
  GREEN); the full unit suite passes.
- No screenshots: no visual change.

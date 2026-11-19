# P007 Messages — Changelog

## 2026-11-18 — Leaving a thread mid-request is not an error

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: none (logging only; G-13 guards unchanged)
Actions: none
Data impact: none
Held items: none
```

### Changed

- `src/hooks/golf/use-golf-messages.ts`: `cutOffByLeaving(err, left)`. A request
  the browser cancelled (WebKit "Load failed", "Fetch is aborted", an
  AbortError) is not logged once the reader has left: the thread hook unmounted
  or another thread is open. Covers the mark-read write, the messages read, the
  read-receipt read, and the rail's team-chat and team-scope reads
  (`loadGolfConversationRail` takes `isLive`). The same failure while the reader
  is still there is still logged and shown.

### Why

- Clubhouse audit 2026-11-18 (P2): going Back from a thread logged
  "[useGolfMessages] Failed to mark messages as read: Load failed" and sent the
  cancelled reads to error logging.

### Verification

- `src/hooks/golf/__tests__/use-golf-messages.leave-abort.test.tsx`; the hook's
  other tests, including the G-13 source guard count, still pass.
- Not removable from here: WebKit's own console line "Fetch API cannot load …
  due to access control checks" for any cancelled fetch (Next's server action
  and Sentry's tunnel included) is printed by the engine.

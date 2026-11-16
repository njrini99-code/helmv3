# Shared pieces — 2026-11-15

## 2026-11-15 — Offline error, slow saves give up, one failure line

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-05, GAP-S-30,
GAP-S-31, GAP-S-33, GAP-S-35, GAP-H-08)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   10690 (CH-1290), 10790 (CH-1990), 10791 (CH-1991); CH-1905 row
updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `ui/Notices.tsx`: the route error has an `offline` kind (CH-1290), "You’re
  offline" + "This page needs a connection. It loads by itself when you’re
  back online." `FAILURE_COPY.page` ("Nothing you saved is lost. Try again.")
  replaces the generic failure bodies on 15 sites in 11 screen files (Team Hub,
  Roster, Recruiting, the CoachHelm player file, Messages).
- `ui/Retry.tsx`: `useIsOffline()` (through `useSyncExternalStore`; the server
  snapshot is online, so hydration is safe).
- `components/errors/RouteErrorBoundary.tsx`: inside Clubhouse, a transient or
  load failure while offline is the offline page; nothing retries by itself
  while offline, and the `online` event retries once. The artificial 1 s wait
  before a retry is gone everywhere; the progress shows only while the refresh
  runs.
- `lib/use-action.ts`: a save still out after 20 seconds replaces "Still
  saving…" (CH-1902) with "This is taking longer than usual" + "You can keep
  waiting, or cancel. Your changes are kept." and Cancel (CH-1990). Cancel
  stops waiting: "Stopped waiting" + "Your changes are kept. If it saves after
  all, you’ll see it here." (CH-1991); the button is free and the form keeps
  what was typed. A second Save while the stopped one is still out sends
  nothing and says "Your last save hasn’t answered yet", so nothing is written
  twice.
- `ui/PhoneBar.tsx`: `PhoneIconAction` takes `disabled` (`aria-disabled`, the
  tap does nothing), as `PhoneTextAction` does. First user: Ask's New chat.

### Why

- GAP-S-05, S-30, S-35: offline, a failed page said "slow to respond" and
  retried into the same failure; every retry waited a second first.
- GAP-S-31: a save that never answered spun forever, with no way out.
- GAP-S-33: the same failure was worded several ways.
- GAP-H-08: New chat had no inert state while a reply streamed.

### Verification

- `src/components/errors/__tests__/route-error-offline.test.tsx`,
  `src/clubhouse/__tests__/shell.test.tsx` (CH-1290),
  `src/clubhouse/lib/__tests__/use-action-give-up.test.tsx` (CH-1990, CH-1991,
  the second Save), `error-copy.test.ts`.
- Preview: `/clubhouse-preview/home?state=error-offline`.

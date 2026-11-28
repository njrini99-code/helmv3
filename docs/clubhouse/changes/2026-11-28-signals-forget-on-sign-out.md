# Signals forget the last person on a sign-out that stays in the tab

## 2026-11-28 — the front door no longer sends as whoever signed out

```text
Design package: Bridge reliability follow-up (review of #2672)
PR/commit: agent/bridge-review-fixes
Contract IDs: none new
Actions: none
Data impact: none (no table, column or migration)
Held items: none
```

### Changed

- `suspendSignals()` in `src/clubhouse/lib/signal.ts`: what is queued goes out
  as the person who was here, then signals wait in memory as they do before the
  first configure, until a sign-in says whose they are. The session is kept
  with its owner, so the same person signing back in carries on with it and
  anyone else starts their own. The failure context (the envelopes sent) and
  the trail are forgotten, so a later failure carries none of theirs.
- A sign-in by someone else on the same tab (configureSignals with a new user)
  forgets the failure context and trail too.
- `signal.test.ts` covers the hold after a sign-out, the same person signing
  back in, a hold before any configure, and a new person's failure context.

### Why

Codex review of #2672: after the idle timeout signs someone out with a
client-side move to the front door, the module's config stayed set, so the
front door's views and taps went out under the last person's role, team, page
and session, and a sign-in by someone else would have carried them on.

# 2026-10-27 — A player on a coach's page is told so

## 2026-10-27 — Not-rebuilt page: "Only coaches use Recruiting" for players

```text
Design package: none (production polish pass before launch); copy follows Qualifiers' CH-09311 coach-only state
PR/commit:      agent/clubhouse-polish
Contract IDs:   CH-1301 (same state, coach-only wording)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A player who opened a page rebuilt for coaches only got "Recruiting hasn't been
  rebuilt yet. It's on the list for the new GolfHelm design." The Recruiting
  page's own redirect home never ran, because the frame does not render a page
  that is not rebuilt for the role. What's new is an alias, so its page renders
  hidden, but for a player it draws a Fairway notice rather than redirecting, and
  after the 2 s wait the same not-rebuilt page showed. Now, when the page is rebuilt
  for coaches, a player sees "Only coaches use Recruiting" (or What's new), the
  line "Your rounds, stats and team are on Home." and Back to Home, under a lock
  (`shell/NotRebuilt.tsx` `coachOnly`, `shell/ClubhouseFrame.tsx`).

### Why

- "It's on the list" promised a player a page they will never get.

### Verification

- `__tests__/shell.test.tsx` (new case). The frame tests and the alias tests pass
  (260). Signed-in on the local stack, a player at `/golf/dashboard/recruiting`
  and at `/golf/dashboard/whats-new` showed the old wording before the change.

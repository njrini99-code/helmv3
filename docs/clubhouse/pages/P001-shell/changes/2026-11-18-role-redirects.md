# Shell role redirects — Changelog

## 2026-11-18 — A role's dead ends open that role's nearest page (L-004)

```text
Design package: none
PR/commit: agent/clubhouse-polish-fixes (#2586)
Contract IDs: none (CH-1301 and CH-11390 stay as the fallback when a redirect doesn't run)
Actions: none
Data impact: none (routing only)
Held items: none
```

Owner decision, 18 Nov 2026: instead of a lock or "isn't available here", each
route's layout sends the other role on with
`redirectToClubhouse`. This is the same pattern Live and What's new already use;
a page never redirects from a role branch,
which is the #201 / React #310 guard.

- Player: Intelligence goes to CoachHelm, CoachHelm compare goes to their Stats,
  Recruiting goes to Home, New qualifier goes to
  Qualifiers, and Tournaments' Compare, History, Link rounds and New event go to
  Tournaments.
- Coach: Classes goes to Home, and New round and Recover round go to the team's
  Rounds.

`CH_ALIASED_ROUTES` adds the addresses the frame wouldn't otherwise render for
that role: Recruiting, CoachHelm compare,
Classes, New round and Recover round. New qualifier and Tournaments' pages are
already rendered for both roles, so their
redirects run without a row. The guard tests now say so. `aliasSkeletonFor`
draws each destination's skeleton while it
waits. Practice's coach pages already sent a player to their own Practice.

# 2026-11-16 — roster limit log

## 2026-11-16 — The roster limit on the coach's Roster (launch readiness F-05)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-05); no owner board. Built from Badge, Button, Modal, Segmented, Select and the field and help classes only; the head's line keeps the head's own type
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f05)
Contract IDs:   30180, 30181, 30681 (CH-3081), 30682 (CH-3082), 30683 (CH-3283), 30781 (CH-3981), 30782 (CH-3982), 30980, 30981
Actions:        ACT-P003-ROSTER-LIMIT, ACT-P003-ROSTER-EXEMPT (new)
Data impact:    reads golf_team_roster_limits and golf_roster_exemptions through RLS, tolerant of their absence; the team's division from golf_teams → organizations. New tables in migration 20261115250000 (HELD, not applied). Until it is applied a Division I team reads on at 9 and every other team off, nobody is marked, and nothing can be changed
Held items:     supabase/migrations/20261115250000_golf_roster_limits.sql (HELD.md row)
```

### Changed

- Under the head's counts, the coach's Roster states the roster limit: "7 of 9
  count toward the roster limit." Only active players count. NCAA Division I
  Bylaw 17.2 (Manual 2026-27) sets 9 in golf for a school in the House
  settlement, so a Division I team starts on at 9; every other team starts off
  and sees "Set a roster limit".
- Over the limit the line reads "10 count toward the roster limit of 9: 1 over."
  with an amber badge, and a sentence under it says what to do (CH-3981).
- Roster limit opens a sheet: On or Off (Segmented) and Players who count (1 to
  40), with the bylaw named, because a conference may set fewer. Before the held
  migration it states the limit in force and has no Save (CH-3982).
- A player's actions (row menu, Player actions on the phone) offer "Doesn’t count
  toward the limit…": a sheet asks why, Designated student-athlete or Medical
  (can't compete again), the two NCAA exceptions. A marked player says "Not
  counted" in their row and offers "Count toward the roster limit".
- A save that fails says so (CH-3081, CH-3082); a mark shows at once and goes
  back on failure. Who doesn't count that fails to load is said under the line
  and every active player is counted (CH-3283).

### Why

- Division I golf rosters are capped at 9 from 2025-26. A coach needs to see the
  count where they manage the roster, with the players the bylaw leaves out
  marked, before the roster is due.

### Verification

- Component: `src/clubhouse/__tests__/roster-limit.test.tsx` (desk and phone).
- Rules and the read: `src/lib/golf/__tests__/roster-limit.test.ts`.
- Saves: `src/app/golf/actions/__tests__/roster-limit.test.ts`.
- RLS: `supabase/tests/rls/golf_roster_limits.sql` (runs once the migration is
  applied).
- Staging, read only: UNC Wilmington Golf (DI) has 10 active players, so it
  would read "10 count toward the roster limit of 9: 1 over."; Demo University
  Golf (D1) has 8, "8 of 9"; the nine Division III teams start off.
- Not yet: real-app screenshots on staging; saving on a database with the
  migration applied.

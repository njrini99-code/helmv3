# P001 Shell — 2026-11-15

## 2026-11-15 — The shell keeps what it knew over a failed read, old links draw where they go, and wrong-role pages speak plainly

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-14, GAP-S-19, GAP-S-25, GAP-R-03, GAP-R-06, GAP-R-11, GAP-R-12, GAP-S-34)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   110490 (CH-11390); CH-1301 row updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `data/shell.ts` reports which fields it couldn't read (`unknown`), and
  `shell/shell-memory.ts` keeps the last value the shell knew in this session:
  a failed read on a refresh no longer drops Resume or turns "Head coach" into
  "Coach" (GAP-S-14). With nothing known yet, the fallback shows.
- `AliasWait` (`shell/NotRebuilt.tsx`) draws the destination's skeleton while an
  old address redirects, and keeps waiting while the segment still streams;
  "hasn’t been rebuilt yet" (CH-1301) shows only after the segment rendered
  without redirecting (GAP-S-19).
- A malformed id under a rebuilt screen (`isRebuiltDynamicChild`) renders that
  screen's own not-found instead of "not rebuilt" (GAP-R-03).
- A coach on a player's round flow is told "Only players log rounds" with Back
  to Rounds (CH-11390, `PlayersOnlyRounds`, GAP-R-12). /courses opens Home for
  players too. Live and What's new use Clubhouse's coach-only page, and the
  completed-round hop draws the round review skeleton (GAP-R-11).
- What's new is in the account menu and the sidebar's More list (GAP-R-06).
- Error pages: the dead `title`/`message` props are gone from 58 `error.tsx`
  files, and each page's way back is its section (GAP-S-25).
- Home's skeleton is declared once: the duplicate `(dashboard)/loading.tsx` is
  removed (GAP-S-34). Nothing a user sees changes.

### Why

- GAP-S-14: one failed read demoted a head coach and hid their round in progress.
- GAP-S-19: an old link drew a blank canvas, then "not rebuilt" on a slow line.
- GAP-R-03, R-11, R-12: malformed ids and wrong-role pages fell to Fairway
  leftovers or "isn’t available here", which read as broken.

### Verification

- `shell-memory.test.tsx`, `shell-unknown.test.ts`, `alias-wait.test.tsx`,
  `players-only-rounds.test.tsx`, `dynamic-child.test.ts`, `shell.test.tsx`,
  `round-entry-routes.test.tsx`, `whats-new` page test.

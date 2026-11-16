# 2026-11-16 — configurable qualifying log

## 2026-11-16 — Best rounds count, exempt players, next round groups (launch readiness F-06)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-06); no owner board. Owner decision 16 Nov 2026: an exempt player is set before the qualifier and takes a coach's pick. Built from Select, Checkbox, the filter Segmented and the page's existing side-panel and list classes only; no new card, toggle, shadow or duration
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f06)
Contract IDs:   90182, 90183, 90184, 90580 (CH-09180), 90581 (CH-09181), 90582 (CH-09182), 90682 (CH-09282), 90683 (CH-09283), 90982, 90983
Actions:        ACT-P009-EXEMPT (new); ACT-P009-TIE-RULE now also saves the rounds that count
Data impact:    count_best added to golf_qualifier_rules in migration 20261115240000 (HELD, never applied, so edited in place); new table golf_qualifier_exemptions in migration 20261116100000 (HELD). Both read tolerantly: until applied every round counts, nobody is exempt, and the form says so or hides the field. Next round groups store nothing
Held items:     supabase/migrations/20261115240000_golf_qualifier_rules.sql, supabase/migrations/20261116100000_golf_qualifier_exemptions.sql (HELD.md rows)
```

### Changed

- **Rounds that count** (form, under Ties): Every round, or Best N of M. The
  board, the selection workspace and its confirm sum only each player's best N
  (lower to par, then strokes, then the earlier round). A player who has played
  N rounds is not short against one with more. The dropped rounds stay on the
  player's cards marked "Dropped, not counted", and the standings caption
  states the rule: "Counts each player’s best 2 of 3 rounds: the worst round is
  dropped."
- **Exempt players** (form, under Travel squad, only with a coach's pick to
  take): tick an entrant and give a reason. When selection closes each exempt
  player becomes a coach's pick with "Exempt: (the reason)", in the closer's name,
  never past the picks. A pick for an exempt player needs no scored round
  (Q-115 is waived for them only). Once the qualifier starts the exemptions are
  fixed and the form says to give a place with a coach's pick. The reason is
  the coach's only (D-33).
- **Round N groups** (coach's detail, while a round is still to play): the
  next round's groups from the standings, leaders off last and players with no
  score off first, in threes or fours, as even as the field allows.

### Why

- College qualifiers commonly drop a player's worst round, exempt a returning
  starter, and pair the next round by score. Without them a coach keeps the
  real rule on paper beside the app.

### Verification

- `src/clubhouse/__tests__/qualifier-f06.test.tsx` (board, caption, workspace
  ranking, form fields and saves, validation, groups).
- `src/lib/coachhelm/v3/qualifying/__tests__/exemptions.test.ts` (close places
  picks; Q-115 waived only for the exempt).
- `src/app/golf/actions/__tests__/qualifier-exemptions.test.ts`,
  `src/app/golf/actions/__tests__/qualifier-rules.test.ts` (saves).
- RLS: `supabase/tests/rls/golf_qualifier_rules.sql`,
  `supabase/tests/rls/golf_qualifier_exemptions.sql` (run once applied).
- Not yet: real-app screenshots on staging; saving on a database with the
  migrations applied.

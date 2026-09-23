# player_coachhelm_development test ledger

## 2026-09-23 — repair-plan §14.12: observed-outcome language fix (InsightCard OutcomeBadge)

- SHA: (pending push).
- New: `src/test/coachhelm/observed-outcome-language.test.ts` (6) — an
  AST-walk guard (TypeScript compiler API, not a raw-text regex) over
  string/template literals and JSX text under `components/golf/coachhelm`,
  `components/fairway/pages/coachhelm`, and `lib/coachhelm/v3/chat`. One
  test runs the real full-tree scan and asserts zero violations (also
  guards the guard: fails if the scanned file count collapses to near-zero,
  e.g. a moved directory silently emptying the scan). The other five pin
  the detector itself: it catches the exact pre-fix `OutcomeBadge` shape
  (JSX text split around an expression — "Saved {impact} strokes/rd"), does
  not flag the fixed hedged phrasing, catches "proven"/"caused by"/
  "guaranteed" in a plain string literal (e.g. a chat tool description),
  does not flag an unrelated "Draft saved" with no nearby "strokes", and
  does not flag developer comments or code identifiers (a `CausalRelation
  shipRow` type import, `surface-lift` CSS class) — proving the AST
  restriction to string/JSX spans is actually doing the work, not just
  coincidentally passing.
- Extended: `src/test/golf/components/InsightCard.test.tsx` — new
  `describe('InsightCard OutcomeBadge (observed-outcome language audit)')`
  block (6 cases, no prior coverage of this badge existed): improved +
  meaningful impact renders "Improved · ~N str/rd at stake" and never
  "Saved"; improved + zero/no impact suppresses the badge entirely;
  worsened renders the neutral "Outcome regressed" label; no_change omits
  the badge (intentional); no recorded `outcome_status` omits the badge
  (the typical case); the badge is live in hero density too, not just
  default (confirms it isn't dead code guarded behind an unused density
  branch).
- Verification: both files together, 47 passed / 2 skipped (the 2 skips
  are pre-existing and unrelated to this change). `npm run typecheck:fast`
  clean, `npx eslint` clean on touched files. Build not run locally
  (session rule) — CI's Next build job covers it.

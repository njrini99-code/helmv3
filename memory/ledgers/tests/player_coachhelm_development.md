# player_coachhelm_development test ledger

## 2026-09-23 — repair-plan §14.12: observed-outcome language fix (InsightCard OutcomeBadge)

- SHA: 961d255b1.
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

## 2026-09-23 — #2023 re-review (rev-2023): widened guard + updated fixtures

- SHA: (pending push).
- Extended: `src/test/coachhelm/observed-outcome-language.test.ts` gained
  6 new cases pinning the widened patterns — the abbreviated "Saved ~N
  str/rd" form, the REVERSED "N strokes saved" order (both spelled-out
  and abbreviated), and `it.each` over all 4 conjugations of "prove"
  (prove/proves/proved/proven), plus a false-positive guard proving
  "improve"/"improvement" is never caught by the widened prove-family
  pattern (word-boundary check — "prov" inside "im-PROV-e" has no
  preceding boundary). The real full-tree scan (no fixture) now also
  covers `components/golf/player-hub` and
  `lib/coachhelm/v3/{brief,composite,insights}` (zero hits, unchanged
  pass).
- Updated: `src/test/golf/components/DiagnosisPanel.test.tsx`'s
  observed_sequence case now asserts "Preceded by" and explicitly asserts
  "Caused by" is ABSENT (was: only asserted "Caused by" present).
  `src/test/golf/components/InsightCard.test.tsx`'s OutcomeBadge describe
  block's improved/worsened cases now assert "Coach marked improved"/
  "Coach marked worsened" instead of "Improved"/"Outcome regressed".
  `src/test/golf/actions/coachhelm-analytics.test.ts`'s P070 comment
  updated to reference the new "were accurate" hero-sentence wording (the
  comment only, no assertion changed — the test itself checks numeric
  pairing, not the rendered string).
- Verification: `observed-outcome-language.test.ts` — 20 tests (was 6: 14
  new/changed), all passing including the real full-tree scan (0
  violations after the 6 FairwayEffectiveness.tsx fixes landed).
  `DiagnosisPanel.test.tsx`, `InsightCard.test.tsx`,
  `coachhelm-analytics.test.ts`, and the 4 `FairwayEffectiveness*.test.
  ts{,x}` files all re-run clean. Full coachhelm/golf-actions/
  golf-components/fairway-coachhelm regression sweep: 240 files / 2240
  passed / 6 skipped (pre-existing), 0 failed. `npm run typecheck:fast`
  clean. `npx eslint` on every touched file: 0 problems.

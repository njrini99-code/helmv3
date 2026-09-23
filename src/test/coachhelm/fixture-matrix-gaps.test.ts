/**
 * §15.2 regression fixture matrix (repair plan, coachhelm-repair-plan) —
 * rows with NO code path on `main` yet. Per the matrix task: don't build a
 * harness or a production feature just to make a row green. Each entry
 * below is a placeholder that names the row, the reason it has no path
 * today, and where the real implementation (or its own test suite) should
 * eventually land. Delete an entry here once its row is covered by a real
 * test against real code.
 */
import { describe, it } from 'vitest';

describe('§15.2 — "Same event contributing to multiple generators: no double-counted stroke savings"', () => {
  // A6 `groupIssues` (situational-ranking.ts, PR #2003) is the module that
  // would own cross-generator/cross-issue attribution dedup, but as of this
  // PR #2003 is still open and unmerged — the module does not exist on
  // `main`, and even once merged its own doc states it is not yet wired
  // into `ranking/score.ts` or any delivery path. No LIVE generator today
  // reconciles double-counted stroke savings across generators sharing one
  // underlying shot/event; there is nothing on `main` to test.
  it.todo(
    'no live generator dedups stroke-savings attribution when the same event feeds multiple generators — pending A6 (#2003) merge + wiring into score.ts',
  );
});

describe('§15.2 — "Some generators fail, others succeed: partial output persists; failed generators get bounded recovery" (orchestrator layer)', () => {
  // The PER-GENERATOR gate (isEnabled/aggregate/sample-floor/standing) is
  // thoroughly covered by generator-base-run-lifecycle.test.ts. This row is
  // about the layer above it: v2/orchestrator.ts's analyzePlayer() —
  // tier1Generators + Promise.allSettled + the failure-summary capture (see
  // orchestrator.ts, "closes audit Q-NEW-5", ~line 373-524). That capture
  // logic is inline in a 180-line method that constructs ~20 generator
  // instances directly; testing it in isolation needs either a from-scratch
  // mock of all ~20 generator classes plus analyzePlayer's other
  // dependencies (calibration bootstrap, stats cache, composite synthesis),
  // or a small, non-behavioral refactor extracting the
  // settle-and-summarize loop into its own testable function. Neither is a
  // fixture addition, so flagging rather than building either blind.
  it.todo(
    'analyzePlayer aggregates tier1Generators failures into one generatorSummary (successes/failures) without one throwing generator dropping the batch — needs a scoped mock harness or a pure-function extraction first',
  );
});

describe('§15.2 — "Par-3 tee miss: not counted as a missed fairway opportunity" (SQL layer)', () => {
  // The par>=4 fairway-denominator exclusion lives in the Postgres function
  // `recompute_golf_round_totals` (see src/lib/golf/stat-formulas.ts:11-12
  // — "fairway denominator = par-4/5 holes with a RECORDED fairway result"),
  // not in any TypeScript path. `computeFairwayPct` itself is denominator-
  // agnostic. No pgTAP fixture in supabase/tests/rls/ exercises this
  // function's par-3 exclusion. A vitest it.todo can't cover SQL behavior —
  // this needs a pgTAP case (scripts/test-pgtap.sh), tracked here so the row
  // isn't silently dropped from the matrix.
  it.todo(
    'recompute_golf_round_totals excludes par-3 holes from the fairway-hit denominator — needs a pgTAP fixture, not a vitest one; none exists today',
  );
});

describe('§15.2 — "Two simultaneous missing-review creators" backfill variant / pre-warm skip-existing', () => {
  // scripts/coachhelm-prewarm-round-reviews.ts implements repair-plan §16.1
  // point 9 ("pre-warm missing 30-day reviews with atomic skip-existing and
  // a resumable run") and reads cleanly (skipped_existing outcome, fixed
  // manifest cutoff, resume cursor — see its header comment and Outcome
  // type). But every helper (existingReviewRoundIds, loadCursor/saveCursor,
  // mapWithConcurrency) is an unexported top-level function in a CLI
  // script, not a module with a testable surface, and there is no test file
  // for it under scripts/__tests__ or named in vitest.config.ts. Exporting
  // those helpers for testing is a (safe, non-behavioral) source change
  // this fixture-only PR intentionally avoids — flagging as a follow-up
  // instead of doing it silently as a drive-by.
  it.todo(
    'coachhelm-prewarm-round-reviews.ts skips rounds that already have a review and never overwrites one — needs its helpers exported for testing first; no test file exists today',
  );
});

describe('§15.2 — practice/follow-up outcome tracking (rows: "focus assigned, no completion data" / "practice improves, course data sparse" / "two of three follow-ups improve")', () => {
  // src/lib/coachhelm/focus-areas/ (catalog.ts, direction.ts, due-for-review.ts,
  // duplicate-guard.ts, target-metric.ts) has no concept of practice-
  // completion tracking, sparse-course-data labeling, or follow-up-outcome
  // counting/"proven" language today. These three rows describe a future
  // package, not a gap in an existing implementation.
  it.todo(
    'a focus area with no practice-completion data reports completion as unknown, not as "practice did not occur" — no completion-tracking concept exists in focus-areas/ yet',
  );
  it.todo(
    'practice improvement and course-data sparsity are displayed as two separate, independently-labeled signals — no such split exists yet',
  );
  it.todo(
    'two of three follow-ups improving is reported as an exact small-sample observation, never as "proven" — no follow-up-outcome aggregation exists yet',
  );
});

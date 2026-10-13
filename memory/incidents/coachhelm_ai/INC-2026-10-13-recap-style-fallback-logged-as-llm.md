# INC-2026-10-13: style-rejected round recaps logged as model output

- Feature: `coachhelm_ai`
- Surface: `/admin/errors/1cd457e7` (info), Sentry JAVASCRIPT-NEXTJS-15A, `golf_coachhelm_llm_calls`, Bridge AI availability
- Status: FIXED in PR #2192 (branch commit d31278783); needs owner deploy
- Risk: R1. Telemetry only: one best-effort UPDATE of the call-log row compose() just wrote. No schema, RLS, grant or player-visible change.
- Signal: `round recap: model reply broke style limits (too_many_words); using template` fired 7 times in the 24h to 2026-10-13 22:40Z (12 `round_review` calls in the same window), while every matching call row (e.g. 5424a44e, 01f1221f) said `verified=true, fallback_to_template=false`.

## What was wrong

`compose()` (`src/lib/coachhelm/v3/llm/compose.ts`) logs a reply that passes
citation verification as an LLM success. `generateLLMRecap` in
`src/app/golf/actions/round-recap.ts` then runs `checkRecapStyle` and, on a
violation, persists the deterministic template instead. Nothing told the call
log, so `fallback_to_template` undercounted and
`src/lib/admin/data/ai-availability.ts` read template recaps as model output.
The recap provenance row (`source: 'deterministic'`) was already right.

## Fix

`markCallFellBackToTemplate(callLogId, { reason, violations })` in
`compose.ts` flips the row to `fallback_to_template=true` and merges
`citations.reason='style_violation'` plus the violations, the key compose()'s
own fallbacks use. `verified` is left as written (the citations did verify).
Best-effort: a failed write is logged, never thrown.

Regression tests: `src/app/golf/actions/__tests__/round-recap-style-fallback-call-log.test.ts`
(fails on ff0a440c3), `src/lib/coachhelm/v3/llm/__tests__/mark-call-fell-back.test.ts`.
Replay: `replay/manifests/recap-style-fallback-call-log-2026-10-13.yml`.

## Not fixed here

The rejection rate itself (about 7 of 12 recaps over the 36-word limit). Feeding
style violations into compose()'s one corrective retry would likely rescue most
of them, but that retry is shared by every compose() task, so it is a proposal
for the owner, not a repair.

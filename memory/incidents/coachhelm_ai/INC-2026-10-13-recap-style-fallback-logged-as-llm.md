# INC-2026-10-13: style-rejected round recaps logged as model output

- Feature: `coachhelm_ai`
- Surface: `/admin/errors/1cd457e7` (info), Sentry JAVASCRIPT-NEXTJS-15A, `golf_coachhelm_llm_calls`, Bridge AI availability
- Status: FIXED on branch `agent/health-20261015-0042` (commits c47febbfd, f0ea56892); needs merge and owner deploy. The first attempt (d31278783) was pushed to #2192's branch 2 minutes before that PR merged and never reached main.
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
(fails on ecd16beea), `src/lib/coachhelm/v3/llm/__tests__/mark-call-fell-back.test.ts`.
Replay: `replay/manifests/recap-style-fallback-call-log-2026-10-13.yml`.

## Not fixed here

The rejection rate itself (about 7 of 12 recaps over the 36-word limit). Feeding
style violations into compose()'s one corrective retry would likely rescue most
of them, but that retry is shared by every compose() task, so it is a proposal
for the owner, not a repair.

## Follow-up 2026-10-20: every model recap rejected once the limit was enforced

- Status: FIXED on branch `agent/health-20261020-0316`; needs merge and owner deploy.
- Risk: R1. One extra `round_review` compose() call only when the first reply's sole violation is `too_many_words`. Same budget gate, same field evidence, same style check. compose() itself is unchanged, so no other task is affected.
- Signal: after the 2026-10-18 14:32Z deploy (dpl_426mj5nN, 1e8a9fad8) made the call log honest, 5 of 5 `round_review` calls (10-18: 2, 10-19: 3) were `fallback_to_template=true, citations.reason='style_violation'` with an average of about 68 completion tokens (roughly 45 words against the 36-word cap). Every player got the template recap. Bridge 1cd457e7 fired 3 times on 2026-10-19 (16:36Z-18:43Z), Sentry JAVASCRIPT-NEXTJS-15A.

### What was wrong

The model overshoots the prompt's "36 words or fewer" by about 10 words almost every time, and `generateLLMRecap` had no path but the template once `checkRecapStyle` said `too_many_words`.

### Fix

When the only violation is `too_many_words`, `generateLLMRecap` marks the first call as a style fallback and makes one rewrite call (`buildRecapShortenPrompt`: the model's own draft, a 28-word target for headroom under the enforced 36, keep every number). The rewrite is verified against the same field evidence and must pass `checkRecapStyle`, or the player gets the template as before and both call rows say so. Any other violation (em-dash, sentence count) still goes straight to the template. This is the local retry the "Not fixed here" note above proposed, kept inside round-recap.ts rather than compose().

Regression test: `src/app/golf/actions/__tests__/round-recap-style-fallback-call-log.test.ts` (rewrite case fails on 07810c413). Replay: `replay/manifests/recap-word-limit-rewrite-2026-10-20.yml`.

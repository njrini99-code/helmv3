# CoachHelm v3 — Testing Standards

> Required test types per feature category. Every v3 PR's verification checklist includes these as gates. Tests live next to the code they cover (`__tests__/` directories) unless otherwise noted.

---

## Generators (W21-W24)

Each `BaseGenerator` subclass requires:

1. **Aggregate test** — given a fixture round set in `src/test/fixtures/generators/<name>/`, `aggregate()` returns the expected aggregate object (including correct `sampleN`).
2. **MinSampleN gate** — below the configured `minSampleN`, `run()` returns `{ id: null, gated: false }` and writes nothing.
3. **Standing injection** — verify `evidence.standing` is present and populated from `loadStandingForMetric()`. Mock the loader; assert call shape.
4. **Counterfactual injection** — verify `evidence.counterfactual` is present when delta ≥ 0.3 strokes; absent when below.
5. **Signature prefix** — assert the upserted signature starts with `v3:`.
6. **engine_version stamp** — assert `engine_version: 'v3'` is passed to `upsertInsight`.
7. **Idempotency** — running the same generator twice on the same fixture set must upsert (not duplicate). Use the existing signature dedup in `v2/insights/upsert.ts`.

Fixture rounds are committed as JSON. Do not generate fixtures programmatically — drift between fixture and prod is the #1 source of false-positive tests.

---

## Composite Insights (W28)

Each rule in `v3/composite/rules/` requires:

1. **Detect-positive** — fixture set where the rule should fire; assertion that `detect()` returns a non-null match.
2. **Detect-negative** — adjacent fixture set where the rule should NOT fire; assertion that `detect()` returns null.
3. **Source-insight subset** — assert that the returned `source_insight_ids` are the exact insights the rule depends on (no extras).
4. **Conflict suppression** — if rule A subsumes rule B per the priority order, write a test where both would fire and assert B is suppressed.

Composites also require an **orchestrator integration test** in `v3/composite/__tests__/synthesis.test.ts` that runs the full 12-rule pass on a multi-finding fixture.

---

## LLM Layer (W30+)

Each composer (`composeRoundReview`, `composeHeroNarrative`, `composeCoachChat`) requires:

1. **Citation enforcement** — verify the relevant citation method (tool-grounded for round_review / coach_chat; regex post-check for hero_narrative) actually rejects an unverified response.
2. **Regenerate-once** — first response fails verification → composer regenerates → second response passes → returned. Mock the LLM call boundary.
3. **Fallback to template** — second response also fails → composer returns the deterministic template result with `fallback_to_template = true` recorded in `golf_coachhelm_llm_calls`.
4. **Budget exhaustion** — coach over budget → `coach_chat` and `round_review` continue (per priority), `hero_narrative` falls back. Test the priority ordering explicitly.
5. **Prompt-snapshot** — every composer ships with a frozen prompt-snapshot test under `src/test/llm/snapshots/`. Editing the prompt must update the snapshot in the same PR. Drift between prompt and snapshot fails CI.

LLM tests never call the real API. The model boundary is mocked via the `compose()` wrapper.

---

## RLS Policies

Every new table with RLS ships with policy tests in `src/test/rls/<table-name>.test.ts`:

1. **Positive** — authorized user can read/write their rows.
2. **Negative** — unauthorized user gets zero rows on SELECT, error on INSERT/UPDATE/DELETE.
3. **Cross-team** — coach on team A cannot access team B's rows.
4. **Helper coverage** — every helper used (`current_player_id`, `is_team_coach`, etc.) is exercised by at least one test.

Tests use Supabase's session-helper API or service-role escape hatches as appropriate. See [`docs/v3-rls-template.md`](./v3-rls-template.md) §Testing Standards.

---

## State Lifecycle (Goals, Qualifier Selections)

Tables with state machines (e.g. `golf_goals.state`) ship transition tests:

1. **Happy-path transitions** — `active → achieved`, `active → missed`, `active → partial`, `pending_baseline → active`.
2. **Forbidden transitions** — any state → `active` from `achieved` requires explicit re-open path; assert the auto-evaluator can't move it.
3. **Auto-evaluator timing** — given `ends_at < now()` and `state = 'active'`, the cron must flip to terminal state on next run.
4. **Manual transitions** — `pause()` and `abandon()` server actions move the state correctly and write timestamps.

---

## Backfill (W12, W20, W27 default, W33, W35)

Backfills ship in their own PR per Rule 1. Tests required:

1. **Idempotency** — running the backfill twice in a row leaves identical row counts and values (use `ON CONFLICT DO UPDATE` or pre-check with `NOT EXISTS`).
2. **Chunk boundaries** — fixture set spans more than one chunk; verify nothing is dropped at chunk edges.
3. **Partial-failure resumability** — kill the cron mid-run; re-run; result equals a clean run. (Mock failure by throwing in the middle.)
4. **Empty start** — backfill on an empty source produces zero target rows, no error.

---

## Migrations

Every migration file is its own gate per Rule 2:

1. **`-- VERIFIED:` comment block** present, citing the prod query used to confirm state.
2. **`-- ROLLBACK:` comment block** present with the safe undo SQL.
3. **Idempotent re-run** — running the migration twice locally produces no errors and no schema change on the second run.
4. **One purpose** — one table OR one column OR one constraint OR one enum value. Reviewer rejects multi-purpose migrations.

CI runs `supabase db reset` + the full migration chain on every PR to catch order-dependency bugs.

---

## Front-End State Coverage

Every new component ships with renders for:

1. **Happy path** — populated data.
2. **Cold-start** — data exists but below thresholds (e.g. StandingBar with team_n < 5).
3. **Loading** — skeleton or shimmer rendered.
4. **Error** — friendly fallback, no raw stack.
5. **Empty** — no data, empty-state copy.

These five render states are non-negotiable per Part XXV verification checklist.

---

## What We Do NOT Test

- Library internals (Supabase, Resend, web-push) — trust the boundary.
- LLM creative output — only verify structure, citations, and verification logic.
- Cosmetic CSS — visual regression is out of scope until a separate tooling decision.

---

## Running Tests

```bash
npm test                        # full suite
npm test -- generators/         # one feature area
npm test -- --watch             # iterating
npm test -- --update-snapshots  # accept new LLM prompt snapshots
```

Tests must pass locally and in CI before merge. No `it.skip` or `xit` in v3 code — a skipped test is a deleted test; either fix it or remove it.

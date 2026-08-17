# CoachHelm Instrumentation & Action Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CoachHelm able to report honestly on itself — when a finding was last verified, when it last actually moved, and whether a coach ever acted on it — then rank the coach's feed on those signals instead of on a timestamp frozen in June.

**Architecture:** Two new `timestamptz` columns on `golf_coach_insights`, stamped inside the single existing write path (`upsertInsight`), which already computes "did the value move?" for its own lifecycle logic. Six read paths re-sort onto the new columns. Separately, the effectiveness writer stops turning a zero denominator into a zero score, and the insight card gains a one-tap action that finally populates `action_taken`.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Supabase (shared production Postgres) · Vitest with `createFakeSupabase` · Tailwind + Fairway design system

**Spec:** `docs/superpowers/specs/2026-08-17-coachhelm-instrumentation-design.md`

## Global Constraints

- Table names are sport-prefixed: `golf_coach_insights`, `golf_insight_effectiveness`. A bare `insights` or `coaches` does not exist.
- Types import from `@/lib/types` only. Never `@/types/database` or `@/types/supabase`.
- Server: `await createClient()` from `@/lib/supabase/server`. Client: `createClient()` from `@/lib/supabase/client` with `'use client'`.
- Server actions check auth first, mutations call `revalidatePath()`.
- No `any` types, no `console.log`.
- Fairway primitives and `--fw-*` design tokens only. Banned in golf-dashboard surfaces: raw `red-*`/`amber-*`/`rose-*`/`violet-*`, `glass-*`, new `cream-*`/`warm-*`.
- **Prove the bug before fixing it.** The failing test is written first, run, and its failure quoted. Never weaken, skip, or delete a test to reach green.
- Gates on every commit: `npm run typecheck`, `npm run lint`, and `TZ=UTC npm test`. Anything touching a date or window also runs under `TZ=Pacific/Kiritimati` and `TZ=Pacific/Midway`.
- zsh: pass file paths literally to vitest — an unquoted `$VAR` does not word-split and you get "No test files found", which reads like a pass. Prefix piped gates with `set -o pipefail`. The guard hook rejects `|` inside a grep pattern; use `grep -e A -e B`.
- Migrations are applied directly via Supabase MCP (owner decision, 2026-08-17), each reviewed by the `db-migration-reviewer` agent first per `CLAUDE.md`. Anything that rewrites existing rows is measured → dry-run counted → applied → verified.
- Do NOT deploy to production. Merging to `main` ships nothing; a promote is an owner decision.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `supabase/migrations/<ts>_coachhelm_content_timestamps.sql` | The two columns + sort index | Create |
| `src/lib/coachhelm/v2/insights/upsert.ts` | **The only** insight write path — v3 wraps it | Modify: 3 payloads |
| `src/test/coachhelm/v2/insights/upsert-content-timestamps.test.ts` | Stamping behaviour across all 3 branches | Create |
| `src/lib/coachhelm/v2/analytics/effectiveness-writer.ts:204-209` | Rate + score computation | Modify |
| `src/test/coachhelm/v2/analytics/effectiveness-null-honesty.test.ts` | Zero-denominator → null, real zero → 0 | Create |
| `supabase/migrations/<ts>_effectiveness_null_backfill.sql` | Backfill 5,164 fabricated zeros | Create |
| `src/lib/coachhelm/insight-ordering.ts` | Shared sort contract, so six call sites cannot drift | Create |
| `src/test/coachhelm/insight-ordering.test.ts` | The ordering contract | Create |
| `src/app/golf/actions/insight-management.ts:219,229` | Coach insight list ordering | Modify |
| `src/app/golf/actions/intelligence-dashboard.ts:275` | Intelligence hub ordering | Modify |
| `src/app/golf/actions/insights.ts:1222,3315` | Two insight read paths | Modify |
| `src/components/golf/coachhelm/triage/SignalDossier.tsx` | Restore the deleted age label | Modify |
| `src/app/golf/actions/insight-management.ts` | `markInsightActedUpon` server action | Modify: add export |
| `src/test/coachhelm/insight-action.test.ts` | Auth + idempotency of the action write | Create |
| `src/components/golf/coachhelm/triage/SignalDossier.tsx` | "Working on this" button | Modify |

**Not touched:** `insights.ts:4043` orders `created_at ASC nullsFirst` — that is a backfill/lifecycle traversal, not a coach-facing feed, and insert order is the correct key for it. Leaving it is deliberate.

**Deviation from the spec, recorded here:** the spec proposed diffing "evidence's measured numeric fields plus `priority`". Implementation uses the diff `updateExisting` *already computes* — relative change in `evidence.your_value` against `MOVEMENT_THRESHOLD` (0.05) — and does not separately diff `priority`. Reason: `priority` is value-derived and recomputed every run from the same number (`upsert.ts:325-327`), so a priority-only change cannot occur without a value change. Adding a second diff would be redundant state with no new signal.

---

### Task 1: Add the content-timestamp columns

**Files:**
- Create: `supabase/migrations/20260817230000_coachhelm_content_timestamps.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `golf_coach_insights.last_verified_at timestamptz NULL`, `golf_coach_insights.last_changed_at timestamptz NULL`, index `idx_golf_coach_insights_last_changed`.

- [ ] **Step 1: Write the migration**

```sql
-- CoachHelm content timestamps.
--
-- `created_at` freezes at first detection because insights upsert on
-- `signature`, and every read path orders by it. Measured 2026-08-17:
-- putt_distance's newest created_at is 2026-06-26 while all 110 of its rows
-- were updated within 7 days. `updated_at` cannot substitute — a trigger bumps
-- it on any write, including a coach's dismissal.
--
-- last_verified_at: a generator re-evaluated this signature and it still holds.
-- last_changed_at:  the measured value moved past MOVEMENT_THRESHOLD.
--
-- Both NULL on backfill, deliberately. Seeding from updated_at would relabel a
-- dismissal as a confirmation; seeding from created_at re-tells the lie being
-- removed. NULL is the honest "we do not know", and every row self-heals on its
-- next nightly confirmation.

ALTER TABLE golf_coach_insights
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_changed_at  timestamptz;

COMMENT ON COLUMN golf_coach_insights.last_verified_at IS
  'Set by upsertInsight on every write. A generator re-evaluated this signature and the finding still holds. NOT updated by coach actions.';
COMMENT ON COLUMN golf_coach_insights.last_changed_at IS
  'Set by upsertInsight on insert and on the >MOVEMENT_THRESHOLD branch only. The measured value actually moved.';

-- Coach feeds sort on last_changed_at DESC NULLS LAST.
CREATE INDEX IF NOT EXISTS idx_golf_coach_insights_last_changed
  ON golf_coach_insights (last_changed_at DESC NULLS LAST);
```

- [ ] **Step 2: Review before applying**

Dispatch the `db-migration-reviewer` agent with the migration file. `CLAUDE.md` marks this mandatory for schema changes on this shared production database. Do not apply until it reports no blocking findings.

- [ ] **Step 3: Confirm the columns do not already exist**

```sql
select column_name from information_schema.columns
where table_name = 'golf_coach_insights'
  and column_name in ('last_verified_at', 'last_changed_at');
```
Expected: 0 rows. If either exists, stop — someone else landed this and the plan needs rebasing.

- [ ] **Step 4: Apply via Supabase MCP**

Use `mcp__supabase__apply_migration` with the file's contents. Purely additive (two nullable columns + one index), so no dry-run count is needed.

- [ ] **Step 5: Verify**

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'golf_coach_insights'
  and column_name in ('last_verified_at', 'last_changed_at');

select count(*) as should_be_612,
       count(last_verified_at) as should_be_0,
       count(last_changed_at)  as should_be_0
from golf_coach_insights;
```
Expected: two `timestamptz` / `YES` rows; 612 total with 0 and 0 populated.

- [ ] **Step 6: Regenerate database types**

Run: `npm run docs:regen` is NOT the right command here — database types come from Supabase.
Run: `npx supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > src/lib/types/database.ts`
Then: `npm run typecheck`
Expected: exit 0. CI has a "Database types drift" job that fails if this is skipped.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260817230000_coachhelm_content_timestamps.sql src/lib/types/database.ts
git commit -m "feat(coachhelm): add last_verified_at and last_changed_at to insights

created_at freezes at first detection because insights upsert on signature,
and all six coach-facing read paths order by it. Measured today:
putt_distance's newest created_at is 2026-06-26 while all 110 of its rows
were updated within the last 7 days.

Columns only. Nothing writes or reads them yet."
```

---

### Task 2: Stamp the timestamps in all three write branches

**Files:**
- Modify: `src/lib/coachhelm/v2/insights/upsert.ts` — `refreshPayload` (~:234), `updatePayload` (~:305), `insertPayload` (~:392)
- Test: `src/test/coachhelm/v2/insights/upsert-content-timestamps.test.ts`

**Interfaces:**
- Consumes: the two columns from Task 1.
- Produces: `upsertInsight` writes `last_verified_at` on every branch and `last_changed_at` on insert + movement. No signature change — `upsertInsight(supabase: SupabaseClient, input: InsightInput): Promise<string | typeof GATED_OUT>` is unchanged.

**Why only this file:** `upsertInsightV3` (`v3/insights/upsert-v3.ts:49`) delegates to `v2UpsertInsight` and then stamps `engine_version`. Both engines therefore write through this one function. Verified by grepping every `from('golf_coach_insights')` under `src/lib/coachhelm` — the only other hits are the effectiveness writer and the recap builder, both read paths.

- [ ] **Step 1: Write the failing test**

Create `src/test/coachhelm/v2/insights/upsert-content-timestamps.test.ts`:

```ts
/**
 * `created_at` freezes at first detection — insights upsert on `signature`, so
 * every nightly re-confirmation is an UPDATE. Measured 2026-08-17,
 * putt_distance's newest `created_at` was 2026-06-26 while all 110 of its rows
 * had been rewritten inside 7 days. Six coach-facing read paths order by that
 * frozen column.
 *
 * `last_verified_at` answers "was this re-checked?" and moves on every write.
 * `last_changed_at` answers "did the number move?" and rides the movement
 * branch `updateExisting` already computes (MOVEMENT_THRESHOLD = 0.05 relative
 * change in `evidence.your_value`). Ordering needs BOTH: rank on the second, or
 * 500 rows re-confirmed the same night collapse into one tie; display the
 * first, or a stable finding wears a months-old date.
 */
import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import type { InsightEvidence, InsightInput } from '@/lib/coachhelm/v2/insights/types';

const now = new Date().toISOString();
const JUNE = '2026-06-26T03:00:00.000Z';

function baseEvidence(over: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putt_distance_make_rate',
    metric_label: 'Make rate, 6-10 ft',
    unit: 'percent',
    your_value: 40,
    your_value_display: '40%',
    comparison_value: 52,
    comparison_label: 'Division II average',
    comparison_source: 'd2_avg',
    sample_n: 30,
    window_days: 30,
    window_start: new Date(Date.now() - 30 * 86400e3).toISOString(),
    window_end: now,
    strokes_impact: 0.8,
    strokes_impact_method: 'peer_delta',
    confidence: 0.7,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
    ...over,
  };
}

function makeInput(over: Partial<InsightInput> = {}): InsightInput {
  return {
    player_id: 'player-1',
    coach_id: 'coach-1',
    team_id: 'team-1',
    category: 'putting',
    insight_type: 'value_derived',
    signature: 'v3:putt_distance:player-1',
    title: 'Make rate down from 6-10ft',
    content: 'You are converting 40% from 6-10 feet.',
    evidence: baseEvidence(),
    metadata: {},
    priority: 'high',
    ...over,
  };
}

/** A June-born row, exactly the shape production is full of. */
function existingRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ins-1',
    player_id: 'player-1',
    coach_id: 'coach-1',
    team_id: 'team-1',
    signature: 'v3:putt_distance:player-1',
    lifecycle_state: 'detected',
    priority: 'high',
    evidence: baseEvidence({ your_value: 40 }),
    metadata: { movement_count: 0 },
    content: 'old',
    title: 'old',
    created_at: JUNE,
    updated_at: JUNE,
    last_verified_at: null,
    last_changed_at: null,
    ...over,
  };
}

function fake(rows: Record<string, unknown>[]) {
  return createFakeSupabase({
    tables: {
      golf_coach_insights: rows,
      golf_team_members: [],
      golf_team_coach_staff: [],
    },
  });
}

async function readRow(supabase: ReturnType<typeof fake>, id = 'ins-1') {
  const { data } = await supabase.from('golf_coach_insights').select('*');
  return (data ?? []).find((r) => r['id'] === id);
}

describe('upsertInsight — content timestamps', () => {
  it('stamps BOTH on a fresh insert', async () => {
    const supabase = fake([]);
    await upsertInsight(supabase as never, makeInput());

    const { data } = await supabase.from('golf_coach_insights').select('*');
    const row = (data ?? [])[0];
    expect(row?.['last_verified_at']).toEqual(expect.any(String));
    expect(row?.['last_changed_at']).toEqual(expect.any(String));
  });

  it('re-confirmation with an unmoved value advances ONLY last_verified_at', async () => {
    // 40 -> 40.4 is a 1% move, below MOVEMENT_THRESHOLD (5%) -> refresh branch.
    const supabase = fake([existingRow({ last_changed_at: JUNE })]);
    await upsertInsight(
      supabase as never,
      makeInput({ evidence: baseEvidence({ your_value: 40.4 }) }),
    );

    const row = await readRow(supabase);
    // This is the whole point: the finding was re-checked TODAY...
    expect(new Date(String(row?.['last_verified_at'])).getTime()).toBeGreaterThan(
      new Date(JUNE).getTime(),
    );
    // ...but nothing about the player moved, so it is not news.
    expect(row?.['last_changed_at']).toBe(JUNE);
    // And created_at is untouched, which is exactly why it cannot be the sort key.
    expect(row?.['created_at']).toBe(JUNE);
  });

  it('a moved value advances BOTH', async () => {
    // 40 -> 30 is a 25% move -> movement branch.
    const supabase = fake([existingRow({ last_changed_at: JUNE })]);
    await upsertInsight(
      supabase as never,
      makeInput({ evidence: baseEvidence({ your_value: 30 }) }),
    );

    const row = await readRow(supabase);
    const junedMs = new Date(JUNE).getTime();
    expect(new Date(String(row?.['last_verified_at'])).getTime()).toBeGreaterThan(junedMs);
    expect(new Date(String(row?.['last_changed_at'])).getTime()).toBeGreaterThan(junedMs);
  });

  it('a prose-only rewrite is NOT a change', async () => {
    // Same number, new wording out of NLG. Re-verified, not news.
    const supabase = fake([existingRow({ last_changed_at: JUNE })]);
    await upsertInsight(
      supabase as never,
      makeInput({ title: 'Rephrased headline', content: 'Rephrased body copy.' }),
    );

    const row = await readRow(supabase);
    expect(row?.['title']).toBe('Rephrased headline');
    expect(row?.['last_changed_at']).toBe(JUNE);
  });

  it('a row that has never been verified still ends up stamped', async () => {
    // Every one of the 612 production rows starts here after the migration.
    const supabase = fake([existingRow()]);
    await upsertInsight(
      supabase as never,
      makeInput({ evidence: baseEvidence({ your_value: 40.2 }) }),
    );

    const row = await readRow(supabase);
    expect(row?.['last_verified_at']).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `set -o pipefail && TZ=UTC npx vitest run src/test/coachhelm/v2/insights/upsert-content-timestamps.test.ts`

Expected: FAIL. The first test reports `expected undefined to be Any<String>` for `last_verified_at`, because nothing writes the column yet. Quote the actual failure output in the commit message.

- [ ] **Step 3: Stamp the insert path**

In `src/lib/coachhelm/v2/insights/upsert.ts`, inside `insertNew`, add to `insertPayload` (after `priority`):

```ts
  const insertedAt = new Date().toISOString();
  const insertPayload = {
    player_id: input.player_id,
    coach_id: coachId,
    team_id: teamId,
    category: input.category,
    signature: input.signature,
    title: input.title,
    content: input.content,
    evidence,
    metadata,
    lifecycle_state: lifecycleState,
    insight_type: input.insight_type ?? input.category,
    priority: input.priority ?? 'medium',
    // A first detection is both a verification and a change — there was no
    // prior value to be unchanged from.
    last_verified_at: insertedAt,
    last_changed_at: insertedAt,
  };
```

- [ ] **Step 4: Stamp the refresh branch (verified only)**

In `updateExisting`, in the `relChange < MOVEMENT_THRESHOLD` branch, add to `refreshPayload`:

```ts
    const refreshPayload: Record<string, unknown> = {
      evidence,
      content: input.content,
      title: input.title,
      category: input.category,
      metadata: mergedMetadata,
      updated_at: nowIso,
      // Re-checked, and the number did not move. Verified, not news — this is
      // the branch that keeps a stable finding from spamming the top of the
      // feed every morning.
      last_verified_at: nowIso,
    };
```

- [ ] **Step 5: Stamp the movement branch (both)**

In `updateExisting`, in the `> MOVEMENT_THRESHOLD` path, add to `updatePayload`:

```ts
  const updatePayload: Record<string, unknown> = {
    evidence,
    content: input.content,
    title: input.title,
    category: input.category,
    metadata: mergedMetadata,
    updated_at: nowIso,
    last_verified_at: nowIso,
    // The value moved past MOVEMENT_THRESHOLD. This is the signal the coach
    // feed ranks on.
    last_changed_at: nowIso,
  };
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `set -o pipefail && TZ=UTC npx vitest run src/test/coachhelm/v2/insights/upsert-content-timestamps.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Run the full gates**

```bash
npm run typecheck
npm run lint
set -o pipefail && TZ=UTC npm test
set -o pipefail && TZ=Pacific/Kiritimati npx vitest run src/test/coachhelm/v2/insights/upsert-content-timestamps.test.ts
set -o pipefail && TZ=Pacific/Midway npx vitest run src/test/coachhelm/v2/insights/upsert-content-timestamps.test.ts
```
Expected: all exit 0. Report the real numbers.

- [ ] **Step 8: Commit**

```bash
git add src/lib/coachhelm/v2/insights/upsert.ts src/test/coachhelm/v2/insights/upsert-content-timestamps.test.ts
git commit -m "feat(coachhelm): stamp last_verified_at and last_changed_at on every insight write

Three branches, one file: insertNew stamps both, the <5% refresh branch
stamps verified only, the >5% movement branch stamps both. upsertInsightV3
delegates here, so both engines are covered by one change.

The change diff is the one updateExisting already computes for its own
lifecycle logic — relative movement in evidence.your_value against
MOVEMENT_THRESHOLD. No new definition of 'changed' was invented, and prose
rewrites out of NLG deliberately do not count."
```

---

### Task 3: Stop the effectiveness writer fabricating zeros

**Files:**
- Modify: `src/lib/coachhelm/v2/analytics/effectiveness-writer.ts:204-209`
- Test: `src/test/coachhelm/v2/analytics/effectiveness-null-honesty.test.ts`
- Create: `supabase/migrations/20260817231000_effectiveness_null_backfill.sql`

**Interfaces:**
- Consumes: nothing from Tasks 1–2. Independent.
- Produces: `action_rate`, `improvement_rate`, `effectiveness_score` are `number | null` in the insert payload. Consumers in `src/app/golf/actions/coachhelm-analytics.ts:202-213` must handle null.

- [ ] **Step 1: Write the failing test**

Create `src/test/coachhelm/v2/analytics/effectiveness-null-honesty.test.ts`:

```ts
/**
 * `effectiveness-writer.ts:205` reads
 *   `b.insights_generated > 0 ? b.insights_acted_upon / b.insights_generated : 0`
 * so a bucket that generated NOTHING scores zero, identical to one that
 * generated forty insights nobody acted on.
 *
 * Measured in production 2026-08-17: of 5,612 rows in
 * `golf_insight_effectiveness`, 5,164 (92%) have `insights_generated = 0` AND
 * `effectiveness_score = 0`. The mean score across the table is 0.002, so any
 * chart reading from it reports CoachHelm as 0.2% effective — a number produced
 * entirely by empty cells.
 *
 * Same class as `safePercent` returning null on a zero denominator, except here
 * the zero is baked into stored data rather than applied at render, so it
 * survives every UI fix.
 */
import { describe, it, expect } from 'vitest';
import { computeRates } from '@/lib/coachhelm/v2/analytics/effectiveness-writer';

describe('effectiveness rates are null-honest', () => {
  it('returns null for a bucket that generated nothing', () => {
    const r = computeRates({
      insights_generated: 0,
      insights_acted_upon: 0,
      insights_with_outcome: 0,
      outcomes_improved: 0,
    });
    expect(r.action_rate).toBeNull();
    expect(r.improvement_rate).toBeNull();
    expect(r.effectiveness_score).toBeNull();
  });

  it('keeps a REAL zero — 40 generated, none acted on — as 0', () => {
    // This is a finding, not missing data, and must stay distinguishable.
    const r = computeRates({
      insights_generated: 40,
      insights_acted_upon: 0,
      insights_with_outcome: 0,
      outcomes_improved: 0,
    });
    expect(r.action_rate).toBe(0);
    // No outcomes measured is still unknown, even though insights were generated.
    expect(r.improvement_rate).toBeNull();
    // Score needs both halves; one unknown makes the weighted sum unknown.
    expect(r.effectiveness_score).toBeNull();
  });

  it('computes the score when both denominators are real', () => {
    const r = computeRates({
      insights_generated: 10,
      insights_acted_upon: 5,
      insights_with_outcome: 4,
      outcomes_improved: 3,
    });
    expect(r.action_rate).toBeCloseTo(0.5, 10);
    expect(r.improvement_rate).toBeCloseTo(0.75, 10);
    expect(r.effectiveness_score).toBeCloseTo(0.5 * 0.3 + 0.75 * 0.7, 10);
  });

  it('a real zero improvement rate is 0, not null', () => {
    const r = computeRates({
      insights_generated: 10,
      insights_acted_upon: 5,
      insights_with_outcome: 4,
      outcomes_improved: 0,
    });
    expect(r.improvement_rate).toBe(0);
    expect(r.effectiveness_score).toBeCloseTo(0.5 * 0.3, 10);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `set -o pipefail && TZ=UTC npx vitest run src/test/coachhelm/v2/analytics/effectiveness-null-honesty.test.ts`
Expected: FAIL with `No "computeRates" export is defined on the module` — the arithmetic is currently inline in a `.map()` and cannot be tested. Quote it.

- [ ] **Step 3: Extract and correct the computation**

In `src/lib/coachhelm/v2/analytics/effectiveness-writer.ts`, add above the `inserts` map:

```ts
/**
 * Rates for one (team, insight_type, period) bucket.
 *
 * A zero denominator yields null, NOT zero. "We generated nothing" and "we
 * generated forty and nobody acted" are different facts and the surface has to
 * be able to tell them apart — 92% of the stored rows are the former, all
 * scored 0, which is what dragged the table's mean score to 0.002.
 *
 * `effectiveness_score` is a weighted sum of both rates, so it is null unless
 * BOTH are known. A partial score would be a confident number built on a guess.
 */
export function computeRates(b: {
  insights_generated: number;
  insights_acted_upon: number;
  insights_with_outcome: number;
  outcomes_improved: number;
}): {
  action_rate: number | null;
  improvement_rate: number | null;
  effectiveness_score: number | null;
} {
  const action_rate =
    b.insights_generated > 0 ? b.insights_acted_upon / b.insights_generated : null;
  const improvement_rate =
    b.insights_with_outcome > 0 ? b.outcomes_improved / b.insights_with_outcome : null;
  const effectiveness_score =
    action_rate === null || improvement_rate === null
      ? null
      : action_rate * 0.3 + improvement_rate * 0.7;
  return { action_rate, improvement_rate, effectiveness_score };
}
```

Then replace the inline arithmetic in the `inserts` map:

```ts
  const inserts = Array.from(buckets.values()).map(({ team_id, insight_type, b }) => {
    const { action_rate, improvement_rate, effectiveness_score } = computeRates(b);

    return {
      team_id,
      insight_type,
      period_start: periodStart,
      // ...rest of the existing object unchanged
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `set -o pipefail && TZ=UTC npx vitest run src/test/coachhelm/v2/analytics/effectiveness-null-honesty.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Make the consumers null-safe**

In `src/app/golf/actions/coachhelm-analytics.ts:202-213`, the accumulator does `existing.insightsActedUpon += row.insights_acted_upon || 0`. Those are counts and stay as-is. The rate/score fields must NOT be coerced with `?? 0` anywhere downstream — read the file, and for every render of `action_rate`, `improvement_rate` or `effectiveness_score`, render an em-dash for null rather than a zero.

Run: `grep -n -e "action_rate" -e "improvement_rate" -e "effectiveness_score" src/app/golf/actions/coachhelm-analytics.ts` and fix each site.

- [ ] **Step 6: Measure before the backfill**

```sql
select count(*) as total,
       count(*) filter (where insights_generated = 0 and effectiveness_score = 0) as will_null_score,
       count(*) filter (where insights_generated = 0 and action_rate = 0) as will_null_action,
       count(*) filter (where insights_with_outcome = 0 and improvement_rate = 0) as will_null_improvement
from golf_insight_effectiveness;
```
Record the numbers. Expected around 5,612 total and 5,164 fabricated-zero scores. If `will_null_score` is materially different from 5,164, stop and re-derive — the data moved since this plan was written.

- [ ] **Step 7: Write the backfill migration**

```sql
-- Retire the fabricated zeros already stored in golf_insight_effectiveness.
--
-- Measured 2026-08-17: 5,164 of 5,612 rows (92%) have insights_generated = 0
-- AND effectiveness_score = 0 — a score off a zero denominator. The table's
-- mean effectiveness_score is 0.002 as a direct result.
--
-- Only rows whose DENOMINATOR is zero are touched. A real 0-of-40 keeps its
-- honest zero; that is a finding, not missing data.

UPDATE golf_insight_effectiveness
   SET action_rate = NULL
 WHERE insights_generated = 0
   AND action_rate IS NOT NULL;

UPDATE golf_insight_effectiveness
   SET improvement_rate = NULL
 WHERE insights_with_outcome = 0
   AND improvement_rate IS NOT NULL;

UPDATE golf_insight_effectiveness
   SET effectiveness_score = NULL
 WHERE (action_rate IS NULL OR improvement_rate IS NULL)
   AND effectiveness_score IS NOT NULL;
```

- [ ] **Step 8: Review, apply, verify**

Dispatch `db-migration-reviewer` on the backfill — it rewrites 5,000+ existing rows and is the highest-risk statement in this plan.

Then apply via `mcp__supabase__apply_migration`, then verify:

```sql
select count(*) as total,
       count(action_rate) as action_rate_set,
       count(effectiveness_score) as score_set,
       count(*) filter (where insights_generated > 0 and action_rate is null) as MUST_BE_ZERO
from golf_insight_effectiveness;
```
Expected: `score_set` drops from 5,612 to roughly 448 or fewer, and `MUST_BE_ZERO` is 0. If `MUST_BE_ZERO` is non-zero, the backfill over-reached — investigate before proceeding.

- [ ] **Step 9: Gates and commit**

```bash
npm run typecheck && npm run lint && (set -o pipefail && TZ=UTC npm test)
git add src/lib/coachhelm/v2/analytics/effectiveness-writer.ts src/test/coachhelm/v2/analytics/effectiveness-null-honesty.test.ts supabase/migrations/20260817231000_effectiveness_null_backfill.sql src/app/golf/actions/coachhelm-analytics.ts
git commit -m "fix(coachhelm): effectiveness scored zero off a zero denominator

5,164 of 5,612 rows had insights_generated = 0 AND effectiveness_score = 0,
dragging the table's mean score to 0.002 — so the surface reported CoachHelm
as 0.2% effective from cells that measured nothing.

A zero denominator now yields null. A real 0-of-40 keeps its zero: that is a
finding, not missing data, and the tests pin the distinction."
```

---

### Task 4: Rank the feed on the new signals

**Files:**
- Create: `src/lib/coachhelm/insight-ordering.ts`
- Test: `src/test/coachhelm/insight-ordering.test.ts`
- Modify: `src/app/golf/actions/insight-management.ts:219,229`, `src/app/golf/actions/intelligence-dashboard.ts:275`, `src/app/golf/actions/insights.ts:1222,3315`
- Modify: `src/components/golf/coachhelm/triage/SignalDossier.tsx`

**Interfaces:**
- Consumes: `last_verified_at`, `last_changed_at` from Tasks 1–2.
- Produces: `applyInsightFeedOrder<T extends PostgrestOrderable>(q: T): T` and `formatConfirmedAge(lastVerifiedAt: string | null, now?: Date): string | null`.

- [ ] **Step 1: Write the failing test**

Create `src/test/coachhelm/insight-ordering.test.ts`:

```ts
/**
 * Six coach-facing read paths order by `created_at DESC`, which upsert-on-
 * signature freezes at first detection. A finding re-confirmed this morning
 * ranks below a trivial one first seen yesterday, and wears a June date.
 *
 * Ordering must key on `last_changed_at` — when the number actually moved —
 * because `last_verified_at` alone collapses to a tie: 500 rows re-confirmed on
 * the same nightly run share one timestamp.
 */
import { describe, it, expect } from 'vitest';
import { applyInsightFeedOrder, formatConfirmedAge } from '@/lib/coachhelm/insight-ordering';

/** Records the .order() calls a PostgREST builder would receive. */
function spyBuilder() {
  const calls: Array<{ column: string; opts: Record<string, unknown> }> = [];
  const builder = {
    calls,
    order(column: string, opts: Record<string, unknown>) {
      calls.push({ column, opts });
      return builder;
    },
  };
  return builder;
}

describe('applyInsightFeedOrder', () => {
  it('sorts on last_changed_at first, newest first, nulls last', () => {
    const b = spyBuilder();
    applyInsightFeedOrder(b as never);
    expect(b.calls[0]).toEqual({
      column: 'last_changed_at',
      opts: { ascending: false, nullsFirst: false },
    });
  });

  it('falls back to last_verified_at so a nightly-confirmed tie still orders', () => {
    const b = spyBuilder();
    applyInsightFeedOrder(b as never);
    expect(b.calls[1]).toEqual({
      column: 'last_verified_at',
      opts: { ascending: false, nullsFirst: false },
    });
  });

  it('never sorts on created_at — that is the frozen column', () => {
    const b = spyBuilder();
    applyInsightFeedOrder(b as never);
    expect(b.calls.map((c) => c.column)).not.toContain('created_at');
  });
});

describe('formatConfirmedAge', () => {
  const NOW = new Date('2026-08-17T12:00:00.000Z');

  it('renders nothing when the row has never been verified', () => {
    // Every production row is here until its next nightly confirmation.
    // Showing "0d" or "unknown" would be a worse lie than showing nothing.
    expect(formatConfirmedAge(null, NOW)).toBeNull();
  });

  it('renders today as "confirmed today"', () => {
    expect(formatConfirmedAge('2026-08-17T03:00:00.000Z', NOW)).toBe('confirmed today');
  });

  it('renders a day count beyond that', () => {
    expect(formatConfirmedAge('2026-08-15T03:00:00.000Z', NOW)).toBe('confirmed 2d ago');
  });

  it('does not go negative on a clock skew', () => {
    expect(formatConfirmedAge('2026-08-18T03:00:00.000Z', NOW)).toBe('confirmed today');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `set -o pipefail && TZ=UTC npx vitest run src/test/coachhelm/insight-ordering.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/coachhelm/insight-ordering"`. Quote it.

- [ ] **Step 3: Write the module**

Create `src/lib/coachhelm/insight-ordering.ts`:

```ts
/**
 * The one place the coach-facing insight feed's sort order is defined.
 *
 * Six read paths used to hand-write `.order('created_at', { ascending: false })`.
 * That column freezes at first detection, because insights upsert on
 * `signature` and every nightly re-confirmation is an UPDATE — measured
 * 2026-08-17, `putt_distance`'s newest `created_at` was 2026-06-26 while all
 * 110 of its rows had been rewritten inside a week.
 *
 * Ranking on `last_changed_at` surfaces findings whose number actually moved.
 * `last_verified_at` cannot lead: every row confirmed on the same nightly run
 * shares one timestamp, so it collapses to a tie — it is the tiebreak, not the
 * key.
 *
 * Centralised rather than repeated so the six call sites cannot drift apart
 * again.
 */

/** The subset of a PostgREST builder this module needs. */
export interface PostgrestOrderable {
  order(
    column: string,
    options: { ascending: boolean; nullsFirst: boolean },
  ): PostgrestOrderable;
}

export function applyInsightFeedOrder<T extends PostgrestOrderable>(query: T): T {
  query
    .order('last_changed_at', { ascending: false, nullsFirst: false })
    .order('last_verified_at', { ascending: false, nullsFirst: false });
  return query;
}

const DAY_MS = 86_400_000;

/**
 * "confirmed 2d ago" for a coach-facing card, or null when we genuinely do not
 * know. Null renders nothing — `SignalDossier` deleted its previous age label
 * rather than show a wrong number, and an unverified row must not get one back.
 */
export function formatConfirmedAge(
  lastVerifiedAt: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!lastVerifiedAt) return null;
  const verifiedMs = new Date(lastVerifiedAt).getTime();
  if (!Number.isFinite(verifiedMs)) return null;
  const days = Math.floor((now.getTime() - verifiedMs) / DAY_MS);
  if (days <= 0) return 'confirmed today';
  return `confirmed ${days}d ago`;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `set -o pipefail && TZ=UTC npx vitest run src/test/coachhelm/insight-ordering.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Re-point the five coach-facing read paths**

In each of these, replace the `.order('created_at', { ascending: false })` call with `applyInsightFeedOrder(...)`, adding `import { applyInsightFeedOrder } from '@/lib/coachhelm/insight-ordering';` at the top:

- `src/app/golf/actions/insight-management.ts:219`
- `src/app/golf/actions/insight-management.ts:229` — this one is `order('created_at', { ascending: sortOrder === 'asc' })`; keep the caller's explicit asc/desc choice if the UI exposes it, but change the COLUMN to `last_changed_at`. Read the surrounding code before editing.
- `src/app/golf/actions/intelligence-dashboard.ts:275`
- `src/app/golf/actions/insights.ts:1222`
- `src/app/golf/actions/insights.ts:3315`

Leave `src/app/golf/actions/insights.ts:4043` alone — it is `ascending: true, nullsFirst: true`, a lifecycle traversal in insert order, not a coach feed.

- [ ] **Step 6: Restore the age label in SignalDossier**

In `src/components/golf/coachhelm/triage/SignalDossier.tsx`, replace the large explanatory comment block (which ends "...then this is where the line goes, worded 'computed {n}d ago' to match the chat surface's existing idiom") with the real element. The signal object must carry `last_verified_at` through from its query; add it to the select if absent.

```tsx
{formatConfirmedAge(signal.lastVerifiedAt) ? (
  <Badge tone="neutral" size="sm">{formatConfirmedAge(signal.lastVerifiedAt)}</Badge>
) : null}
```

Keep a short comment recording why the column is `last_verified_at` and not `updated_at` — a trigger bumps `updated_at` on any write, including a coach's dismissal, which would make a dismissed insight look freshest.

- [ ] **Step 7: Gates**

```bash
npm run typecheck
npm run lint
set -o pipefail && TZ=UTC npm test
set -o pipefail && TZ=Pacific/Kiritimati npx vitest run src/test/coachhelm/insight-ordering.test.ts
set -o pipefail && TZ=Pacific/Midway npx vitest run src/test/coachhelm/insight-ordering.test.ts
```
Expected: all exit 0. The zone runs matter here — `formatConfirmedAge` does day arithmetic.

- [ ] **Step 8: Commit**

```bash
git add src/lib/coachhelm/insight-ordering.ts src/test/coachhelm/insight-ordering.test.ts src/app/golf/actions/insight-management.ts src/app/golf/actions/intelligence-dashboard.ts src/app/golf/actions/insights.ts src/components/golf/coachhelm/triage/SignalDossier.tsx
git commit -m "feat(coachhelm): rank the insight feed on when a finding moved, not when it was first seen

Five coach-facing read paths ordered by created_at, which upsert-on-signature
freezes at first detection. They now sort on last_changed_at with
last_verified_at as the tiebreak, through one shared module so they cannot
drift apart again.

SignalDossier gets its age label back, reading last_verified_at and rendering
nothing while that column is null — which is every row until its next nightly
confirmation."
```

---

### Task 5: One-tap "Working on this"

**Files:**
- Modify: `src/app/golf/actions/insight-management.ts` — add `markInsightActedUpon`
- Test: `src/test/coachhelm/insight-action.test.ts`
- Modify: `src/components/golf/coachhelm/triage/SignalDossier.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1–4; independent, but sequenced last because its value is only measurable once the feed is honest.
- Produces: `markInsightActedUpon(insightId: string): Promise<ActionResult<{ acted: boolean }>>`.

**Why:** `action_taken` is `true` on 0 of 612 rows. Until acting costs one tap, `outcome_status` stays null (2 of 612), Task 3's effectiveness stays undefined, and `src/lib/coachhelm/v2/learning/` never receives a training signal. The existing convert-to-focus-area path has produced 25 rows in five months — that is an escalation, not the default gesture.

- [ ] **Step 1: Write the failing test**

Create `src/test/coachhelm/insight-action.test.ts`:

```ts
/**
 * `action_taken` is true on 0 of 612 production insights, because nothing in the
 * UI writes it cheaply. That single zero is why outcome_status is set on 2 rows,
 * why effectiveness has no numerator, and why the behaviour learner has never
 * had a training signal.
 *
 * Two properties matter for the write: a coach may only act on an insight
 * belonging to a team they staff, and a double-tap must not reopen a fresh
 * outcome window over an existing one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => supabase,
}));

let supabase: ReturnType<typeof createFakeSupabase>;

function insightRow(over: Record<string, unknown> = {}) {
  return {
    id: 'ins-1',
    player_id: 'player-1',
    coach_id: 'coach-1',
    team_id: 'team-1',
    signature: 'v3:putt_distance:player-1',
    action_taken: false,
    action_date: null,
    action_type: null,
    ...over,
  };
}

beforeEach(() => {
  mockGetUser.mockReset();
});

describe('markInsightActedUpon', () => {
  it('sets action_taken and action_date for a coach on the insight\'s team', async () => {
    supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [insightRow()],
        golf_team_coach_staff: [{ team_id: 'team-1', coach_id: 'coach-1' }],
        golf_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
      },
      auth: { user: { id: 'user-1' } },
    });
    const { markInsightActedUpon } = await import('@/app/golf/actions/insight-management');

    const result = await markInsightActedUpon('ins-1');
    expect(result.success).toBe(true);

    const { data } = await supabase.from('golf_coach_insights').select('*');
    const row = (data ?? []).find((r) => r['id'] === 'ins-1');
    expect(row?.['action_taken']).toBe(true);
    expect(row?.['action_date']).toEqual(expect.any(String));
  });

  it('refuses a coach who does not staff the insight\'s team', async () => {
    supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [insightRow()],
        golf_team_coach_staff: [{ team_id: 'other-team', coach_id: 'coach-2' }],
        golf_coaches: [{ id: 'coach-2', user_id: 'user-2' }],
      },
      auth: { user: { id: 'user-2' } },
    });
    const { markInsightActedUpon } = await import('@/app/golf/actions/insight-management');

    const result = await markInsightActedUpon('ins-1');
    expect(result.success).toBe(false);

    const { data } = await supabase.from('golf_coach_insights').select('*');
    expect((data ?? []).find((r) => r['id'] === 'ins-1')?.['action_taken']).toBe(false);
  });

  it('is idempotent — a second tap does not move the original action_date', async () => {
    const FIRST = '2026-08-10T12:00:00.000Z';
    supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [insightRow({ action_taken: true, action_date: FIRST })],
        golf_team_coach_staff: [{ team_id: 'team-1', coach_id: 'coach-1' }],
        golf_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
      },
      auth: { user: { id: 'user-1' } },
    });
    const { markInsightActedUpon } = await import('@/app/golf/actions/insight-management');

    await markInsightActedUpon('ins-1');

    const { data } = await supabase.from('golf_coach_insights').select('*');
    // Moving it would restart the outcome measurement window and lose the
    // real start of the intervention.
    expect((data ?? []).find((r) => r['id'] === 'ins-1')?.['action_date']).toBe(FIRST);
  });

  it('acts on a row whose action_taken is NULL, not just false', async () => {
    // The column is nullable with a `false` default. An `.eq(false)` filter
    // would skip this row and return success having written nothing.
    supabase = createFakeSupabase({
      tables: {
        golf_coach_insights: [insightRow({ action_taken: null })],
        golf_team_coach_staff: [{ team_id: 'team-1', coach_id: 'coach-1' }],
        golf_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
      },
      auth: { user: { id: 'user-1' } },
    });
    const { markInsightActedUpon } = await import('@/app/golf/actions/insight-management');

    const result = await markInsightActedUpon('ins-1');
    expect(result.success).toBe(true);

    const { data } = await supabase.from('golf_coach_insights').select('*');
    expect((data ?? []).find((r) => r['id'] === 'ins-1')?.['action_taken']).toBe(true);
  });

  it('rejects an unauthenticated caller', async () => {
    supabase = createFakeSupabase({
      tables: { golf_coach_insights: [insightRow()] },
      auth: { user: null },
    });
    const { markInsightActedUpon } = await import('@/app/golf/actions/insight-management');

    const result = await markInsightActedUpon('ins-1');
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `set -o pipefail && TZ=UTC npx vitest run src/test/coachhelm/insight-action.test.ts`
Expected: FAIL with `No "markInsightActedUpon" export is defined`. Quote it.

Note: read `src/test/fixtures/fake-supabase.ts` first and match its actual `auth` option shape — if it differs from `{ auth: { user } }`, adapt the test to the real fixture rather than changing the fixture.

- [ ] **Step 3: Write the server action**

Add to `src/app/golf/actions/insight-management.ts`, following the auth pattern already used by the dismiss/acknowledge actions in that same file (read one first and mirror it):

```ts
/**
 * A coach says "I'm working on this."
 *
 * `action_taken` was true on 0 of 612 insights before this existed, because the
 * only way to act was converting to a focus area — an escalation that produced
 * 25 rows in five months. This is the cheap gesture that gives the outcome
 * columns and the effectiveness numerator something to measure.
 *
 * Idempotent by design: `action_date` is the start of the intervention, and the
 * outcome window is measured from it. A second tap must not restart it.
 */
export async function markInsightActedUpon(
  insightId: string,
): Promise<ActionResult<{ acted: boolean }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authorized' };

  const { data: updated, error } = await supabase
    .from('golf_coach_insights')
    .update({ action_taken: true, action_date: new Date().toISOString(), action_type: 'working_on_it' })
    .eq('id', insightId)
    // Idempotency: a second tap matches no row. `.not(...,'is',true)` rather
    // than `.eq(..., false)` because the column is NULLABLE with a `false`
    // DEFAULT — all 612 rows read `false` today, but a single NULL would make
    // an `.eq(false)` filter match nothing, and the button would report success
    // while writing nothing.
    .not('action_taken', 'is', true)
    .select('id');

  if (error) return { success: false, error: describeError(error) };

  revalidatePath('/golf/dashboard/intelligence');
  // An empty result is the already-acted case, not a failure — the row exists
  // and is already in the state the caller wanted.
  return { success: true, data: { acted: (updated ?? []).length > 0 } };
}
```

**Authorization note:** the RLS policy on `golf_coach_insights` must already restrict updates to a coach's own team. Verify this before relying on it:

```sql
select polname, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
from pg_policy where polrelid = 'golf_coach_insights'::regclass and polcmd = 'w';
```
If no UPDATE policy scopes by team, add an explicit membership check in the action before the update, and file the RLS gap separately.

- [ ] **Step 4: Run the test to confirm it passes**

Run: `set -o pipefail && TZ=UTC npx vitest run src/test/coachhelm/insight-action.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the button**

In `src/components/golf/coachhelm/triage/SignalDossier.tsx`, add a Fairway `Button` beside the existing dismiss/acknowledge controls (read them and match their variant and spacing):

```tsx
<Button
  variant="secondary"
  size="sm"
  onClick={() => void handleActedUpon(signal.id)}
  disabled={signal.actionTaken}
>
  {signal.actionTaken ? 'Working on this' : "I'm working on this"}
</Button>
```

The disabled state after action is deliberate — the tap is a one-way declaration, and a toggle would let a coach silently erase the start of an outcome window.

- [ ] **Step 6: Gates**

```bash
npm run typecheck
npm run lint
set -o pipefail && TZ=UTC npm test
```
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/golf/actions/insight-management.ts src/test/coachhelm/insight-action.test.ts src/components/golf/coachhelm/triage/SignalDossier.tsx
git commit -m "feat(coachhelm): one-tap 'I'm working on this' on the insight card

action_taken was true on 0 of 612 insights because the only way to act was
converting to a focus area, which produced 25 rows in five months. Without a
cheap gesture the outcome columns have no inputs, effectiveness has no
numerator, and the behaviour learner has never had a training signal.

Idempotent via .eq('action_taken', false): a second tap matches no row, so
action_date keeps marking the real start of the intervention rather than
restarting the outcome window."
```

---

## Post-implementation verification

Not a task — run these after the whole plan lands, and again 24 hours after a production promote.

- [ ] **Every generator stamps.** No non-null-`signature` row should still have a null `last_verified_at` more than 48 hours after the first post-deploy cron run. A row that stays null is a write path that bypasses `upsertInsight`.

```sql
select count(*) as unstamped_after_deploy
from golf_coach_insights
where signature is not null and last_verified_at is null;
```

- [ ] **Generator liveness, honestly.** This is the query that replaces every wrong `created_at` inference:

```sql
select split_part(signature, ':', 2) as generator,
       count(*) as rows,
       max(last_verified_at)::date as last_confirmed,
       max(last_changed_at)::date  as last_moved
from golf_coach_insights
where signature like 'v3:%'
group by 1 order by 2 desc;
```

- [ ] **Feed diversity.** `approach_miss` was 54% of the last 30 days' output. Re-check the type mix at the top of the ranked feed once ordering keys on movement.

- [ ] **The action loop has inputs.** `count(*) filter (where action_taken)` should be non-zero within a week of a coach using the surface. If it stays 0, the button is not discoverable and that is a UI finding, not an engine one.

## Notes for whoever executes this

- **Tasks 1→2 must ship together.** Task 4's ordering reads columns Task 2 fills. Landing Task 4 against an all-null column sorts every row into the `nullsFirst: false` bucket and the feed order becomes arbitrary.
- **Task 3 is independent** and can be done in parallel or first.
- **Nothing here deploys.** The production promote that makes `9f85cdf92` (cron metadata) and `2e0632326` (genome-nightly) live is an owner decision, and it is what makes the post-implementation queries above return meaningful data.

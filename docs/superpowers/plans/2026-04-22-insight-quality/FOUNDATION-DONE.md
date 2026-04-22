# Foundation (F1–F4) — done

Status as of 2026-04-21. Live DB: `qmnssrrolpinvwjjnufo`. All four foundation
tasks landed on `main` in four commits (one per F-task, conventional commit
messages). Downstream generator teams (A = putts, B = approach / scrambling /
tee, C = scoring / course-management / pressure) and the UI team are
unblocked.

Design contract is the canonical source of truth:
[`00-design-contract.md`](./00-design-contract.md).

---

## What's available

### 1. Schema on `public.golf_coach_insights` (F1)

Three new columns every generator MUST populate:

| column | type | purpose |
| --- | --- | --- |
| `evidence` | `JSONB` | Canonical `InsightEvidence` shape from contract Rule 1. Required. |
| `signature` | `TEXT` | Deterministic dedup key. Format `${player_id}:${metric}:${bucket}`. Required. |
| `category` | `TEXT` | One of putting / tee / approach / short_game / scoring / pressure / course_management. Required. |

Plus lifecycle plumbing:

| column | type | purpose |
| --- | --- | --- |
| `lifecycle_state` | `TEXT` | CHECK-constrained to tentative / detected / matured / addressed / resolved / archived. Nullable for legacy rows; `upsertInsight` always sets it. |
| `addressed_at` | `TIMESTAMPTZ` | Coach or player action timestamp. |
| `archived_at` | `TIMESTAMPTZ` | Set by the lifecycle cron when a row ages out. |

Indexes:
- `idx_insights_signature_recent (player_id, signature, created_at DESC)` — powers the dedup lookup in `upsertInsight`.
- `idx_insights_category_lifecycle (player_id, category, lifecycle_state)` — powers the Fingerprint UI grouping.

The partial predicate `WHERE created_at > now() - INTERVAL '30 days'` that the
contract described is enforced in application code (`upsertInsight` filters
by `.gte('created_at', cutoff)`) because `now()` is not IMMUTABLE and so
cannot be used in a partial index. The composite index covers the lookup
efficiently.

### 2. Drill library (F1 + F4)

Two tables:

- `public.golf_drills` — 63 seeded real-world drills. Columns: `slug` (unique), `title`, `category`, `tags` (text[] with GIN index), `description`, `duration_min`, `difficulty` (beginner/intermediate/advanced), `video_url` (null for now), `created_at`.
- `public.golf_insight_drill_attachments (insight_id, drill_id, rank)` — many-to-many, rank 0..2.

RLS:
- `golf_drills` is world-readable by any authenticated user.
- `golf_insight_drill_attachments` SELECT is gated by the existence of the parent insight.

Seed counts by category: putting 15 / tee 10 / approach 12 / short_game 10 / scoring 6 / pressure 5 / course_management 5.

### 3. Helper API (F2)

Every Tier-1 generator goes through **these two functions only** — no direct
`INSERT INTO golf_coach_insights`.

```ts
import { upsertInsight, attachDrills } from '@/lib/coachhelm/v2/insights/upsert';
import type {
  InsightInput,
  InsightEvidence,
  InsightCategory,
} from '@/lib/coachhelm/v2/insights/types';
import { calcConfidence } from '@/lib/coachhelm/v2/insights/types';

// Generator pattern
const evidence: InsightEvidence = {
  metric: 'putt_make_rate_6_10ft',
  metric_label: 'Make rate from 6-10 feet',
  unit: 'percent',
  your_value: 0.38,
  your_value_display: '38%',
  comparison_value: 0.52,
  comparison_label: 'D2 average',
  comparison_source: 'd2_avg',
  sample_n: 47,
  window_days: 30,
  window_start: '2026-03-22',
  window_end: '2026-04-21',
  strokes_impact: 2.1,
  strokes_impact_method: 'peer_delta',
  confidence: 0, // upsertInsight recomputes this for you
  confidence_factors: {
    sample_adequacy: Math.min(47 / 30, 1),
    recency: 1.0,
    variance: 0.9,
  },
};

const insightId = await upsertInsight(supabase, {
  player_id: playerId,
  category: 'putting',
  signature: `${playerId}:putt_make_rate:6_10ft`,
  title: '6-10ft putts: 38%',
  content: composeContent(...),
  evidence,
  drill_tags: ['6_10ft', 'speed_control', 'face_alignment'],
});

await attachDrills(supabase, insightId, 'putting',
  ['6_10ft', 'speed_control', 'face_alignment']);
```

Enforced automatically by `upsertInsight`:
- Throws on `evidence.sample_n < 5`.
- Recomputes `confidence = 0.4*sample_adequacy + 0.3*recency + 0.3*variance`. Don't pre-compute, just fill `confidence_factors` honestly.
- `confidence < 0.4` → `lifecycle_state = 'tentative'`; otherwise `'detected'` on first insert.
- Dedup by `(player_id, signature)` within 30 days.
  - `|new - existing| / existing < 5%` → refreshes evidence + content + metadata.last_refreshed_at; **no new row, no lifecycle change**.
  - `≥ 5%` movement → refreshes + sets `metadata.movement = { from, to, direction, percent_change }` and increments `metadata.movement_count`.
  - 3rd movement on a `detected` row → promotes to `matured`.
- Returns the row id (new or existing).

`attachDrills(supabase, insightId, category, tags)`:
- Pulls all drills matching category AND tag-overlap.
- Ranks by count of overlapping tags; takes top 3.
- Idempotent upsert into `golf_insight_drill_attachments` (rank 0/1/2).

### 4. Lifecycle cron (F3)

`GET /api/cron/coachhelm-insight-lifecycle` — runs daily at 02:00 UTC.
Registered in `vercel.json`. Auth via `Authorization: Bearer ${CRON_SECRET}`.

Rules implemented:
- `addressed → resolved` when `|your_value - comparison_value| / comparison_value ≤ 0.20` for **2 consecutive cycles**. Consecutive tracking via `metadata.healthy_cycles_count` (incremented when in band, reset to 0 when out of band). Sets `resolved_at`.
- `detected` with `metadata.movement_count == 0`, age > 30d, and null `addressed_at` → `archived`. Sets `archived_at`.
- Any non-matured, non-addressed insight older than 90d → `archived`.
- Recency decay: `evidence.confidence_factors.recency` drops by 0.2 per 30d beyond `window_days`. Confidence is recomputed. If a `detected` row's new confidence falls below 0.4, it's demoted to `tentative`.

Response shape `{ success, total, resolved, archived, recency_adjusted, demoted_to_tentative, healthy_cycles_updated, failed }` — useful for dashboards.

---

## Migration files (source of truth)

| File | Applied |
| --- | --- |
| `supabase/migrations/20260422100000_insight_evidence_lifecycle.sql` | yes |
| `supabase/migrations/20260422100001_drill_library_seed.sql` | yes |

Both rows exist in `supabase_migrations.schema_migrations`.

---

## Interpretation notes for downstream teams

A few contract clauses required interpretation:

1. **"Within 80% of comparison"** (Rule F3-1). Read as "the gap has closed to within 20% of the comparison" — i.e. `|your_value - comparison_value| / |comparison_value| ≤ 0.20`. This is the only reading that matches the intent ("metric has moved into healthy range"); the literal "value is 80% of target" reading would flag `your_value = 0.32` against `comparison = 0.40` as healthy, which is backwards when your_value is the miss-rate.
2. **"No movement" for soft-archive** (Rule F3-2). Read as `metadata.movement_count == 0` — i.e. the row has never been updated with a >5% swing. A row that wiggles inside the 5% band still counts as "no movement" because those refreshes don't increment `movement_count`.
3. **`lifecycle_state` column did NOT pre-exist** on `golf_coach_insights`. Contract said "already exists; ensure check constraint". It did not. F1 adds the column AND the constraint. No data migration needed — legacy rows have `NULL` lifecycle_state, which is allowed by the check.
4. **Partial index on `created_at > now() - 30 days`** is not legal (now() is not IMMUTABLE). Replaced with a composite `(player_id, signature, created_at DESC)` index and an application-side 30-day filter. Equivalent lookup cost.
5. **`insight_type`** is `NOT NULL` on the legacy table. `upsertInsight` fills it with the category string on insert so we don't break the pre-existing constraint while we migrate callers. New schema-aware code should read `category`, not `insight_type`.

---

## Tests

`src/test/coachhelm/v2/insights/upsert.test.ts` — 7 cases, all passing:

1. `sample_n < 5` throws
2. `calcConfidence` matches contract formula
3. low confidence → tentative on INSERT
4. no existing row → INSERT with detected
5. same signature, within 5% → UPDATE, no movement metadata
6. same signature, >5% movement → UPDATE with movement metadata
7. 3rd movement → promotes detected → matured

Run: `npx vitest run src/test/coachhelm/v2/insights/`

---

## Commits landed on main

1. `feat(db): insight evidence + signature + category + drill library schema` (F1)
2. `feat(insights): upsertInsight helper with dedup + lifecycle progression` (F2)
3. `feat(cron): nightly insight lifecycle progression` (F3)
4. `feat(drills): seed drill library with 60 evidence-tagged drills` (F4)

Downstream teams: you're unblocked. Consume the helper, use the types, tag
your drill_tags from the vocabulary the seed established. When you need a
new signature prefix, add it to the table in `00-design-contract.md` first.

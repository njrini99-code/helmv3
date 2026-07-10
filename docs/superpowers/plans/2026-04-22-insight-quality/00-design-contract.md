<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: Entry point for the docs/superpowers/plans/2026-04-22-insight-quality/ directory (with FOUNDATION-DONE.md) — a completed-wave April planning doc, absorbed into and superseded by the later 2026-06 CoachHelm audits (COACHHELM_FULL_VALIDITY_AND_FACET_AUDIT_2026-06-06.md, COACHHELM_MASTER_ENGINE_FEATURE_REMEDIATION_AUDIT_2026-06-21.md).
KEPT FOR HISTORY -- do not delete this file.
-->

# Insight Quality Phase — Design Contract

> **Read this BEFORE writing any code.** Every team plan in this directory references this contract. Do not deviate from the shapes/rules below without coordinating.

**Goal:** Make CoachHelm insights specific, evidence-backed, and non-repetitive. Replace the current "fire 1 insight per pattern, dedupe by string" pipeline with "every insight emits standardized evidence, deduped by signature, lifecycle-progressed over time."

**End-state vibe:** A player opens CoachHelm and every insight reads like *"You miss 6-10ft putts at 38%. D2 average is 52%. Based on 47 putts in the last 30 days. This costs you ~2.1 strokes/round."* — never *"your putting is below average."*

---

## The 4 universal rules every insight must follow

### Rule 1 — Every insight has structured evidence

`golf_coach_insights.evidence` (NEW JSONB column) MUST be set on every insert.

**Canonical shape:**

```typescript
interface InsightEvidence {
  // What was measured
  metric: string;                    // 'putt_make_rate_6_10ft' | 'par5_scoring_avg' | etc.
  metric_label: string;              // 'Make rate from 6-10 feet' (human-readable)
  unit: 'percent' | 'strokes' | 'count' | 'yards' | 'feet';

  // Your number
  your_value: number;
  your_value_display: string;        // '38%' | '+1.1' | '24 yd' (pre-formatted)

  // What you're being compared to
  comparison_value: number;
  comparison_label: string;          // 'D2 average' | 'your 90-day baseline' | 'team average' | 'peer percentile 50'
  comparison_source: 'd2_avg' | 'd1_avg' | 'd3_avg' | 'naia_avg' | 'juco_avg'
                   | 'your_baseline' | 'team_avg' | 'peer_percentile'
                   | 'pga_baseline' | 'absolute_target';

  // Sample / window
  sample_n: number;                  // count of underlying observations
  window_days: number;               // 30 | 90 | 365 — what time range
  window_start: string;              // ISO date
  window_end: string;                // ISO date

  // Impact
  strokes_impact: number;            // estimated strokes/round if gap closed (can be 0 if not estimable)
  strokes_impact_method: 'sg_baseline' | 'historical_correlation' | 'peer_delta' | 'rough_estimate';

  // Confidence
  confidence: number;                // 0..1
  confidence_factors: {
    sample_adequacy: number;         // sample_n / target_n, capped at 1
    recency: number;                 // 1 if all within window_days/2; <1 if older-weighted
    variance: number;                // 1 - (your_stddev / comparison_stddev), capped 0..1
  };

  // Drill-down detail (optional, for UI expand)
  detail?: Record<string, unknown>;  // generator-specific richer breakdown
}
```

**Confidence calculation (standard for all generators):**

```typescript
function calcConfidence(evidence: Pick<InsightEvidence, 'sample_n' | 'confidence_factors'>) {
  const { sample_adequacy, recency, variance } = evidence.confidence_factors;
  return 0.4 * sample_adequacy + 0.3 * recency + 0.3 * variance;
}
```

If `sample_n < 5` → DO NOT EMIT the insight. Period.
If `confidence < 0.4` → emit with `lifecycle_state = 'tentative'` (won't appear in main UI).

### Rule 2 — Every insight has a deterministic signature for dedup

`golf_coach_insights.signature` (NEW TEXT column, indexed) MUST be set.

**Format:** `${player_id}:${metric}:${bucket}` where `bucket` is the most specific facet (distance bucket, lie, par-type, etc.).

**Examples:**
- `player-uuid:putt_make_rate:6_10ft`
- `player-uuid:par_scoring:par5`
- `player-uuid:approach_miss_lie:175_200_rough`
- `player-uuid:scrambling:bunker`
- `player-uuid:tee_strategy:driver_vs_layback`

**Dedup rule (enforced by `upsertInsight()` helper):**
- Look up existing insight with same `signature` AND `created_at > now() - 30 days`.
- If found AND new evidence has `your_value` within ±5% of existing: UPDATE the existing row's `evidence`, `content`, `updated_at`. Do NOT create a new row.
- If found AND new evidence shows >5% movement: UPDATE existing AND set `metadata.movement = { from, to, direction }`. Still 1 row, but the UI shows movement annotation.
- If not found OR existing is older than 30 days: INSERT new row.

This stops the *"Approach 200+ severe misses fires 3× with 41% / 67% / 68%"* problem we have today.

### Rule 3 — Every insight progresses through a lifecycle

`golf_coach_insights.lifecycle_state` (existing column) values:

- `tentative` — confidence 0.4-0.6 OR sample_n < 10. Hidden from main UI.
- `detected` — first time fired with confidence ≥ 0.6 + sample_n ≥ 10
- `matured` — same signature has been re-detected ≥ 3 times across ≥ 3 distinct rounds
- `addressed` — coach OR player marked it (sets `addressed_at`)
- `resolved` — metric has moved into healthy range (within 80% of comparison) for ≥ 2 consecutive evaluation windows
- `archived` — older than 90 days AND not matured AND not addressed

**Player-side default UI shows ONLY `matured` + `addressed` insights.** Tentative + detected are noise reduction.

A nightly cron progresses insights through this state machine (Foundation team builds the cron).

### Rule 4 — Every insight has a `category` for routing

`golf_coach_insights.category` (NEW TEXT column, indexed):

- `putting` — drives PuttingSection of the Fingerprint
- `tee` — driver/non-driver strategy
- `approach` — approach shot performance + miss patterns
- `short_game` — scrambling, sand saves, around-green
- `scoring` — par-type, hole-pattern, warm-up
- `pressure` — practice vs tournament gap
- `course_management` — worst-hole analysis, club selection

The Fingerprint UI groups insights by category. Generators always set this.

---

## Required DB changes (Foundation team owns)

```sql
-- Migration: 20260422_evidence_lifecycle_dedup
ALTER TABLE public.golf_coach_insights
  ADD COLUMN evidence JSONB,
  ADD COLUMN signature TEXT,
  ADD COLUMN category TEXT;

-- lifecycle_state already exists; ensure check constraint:
ALTER TABLE public.golf_coach_insights
  DROP CONSTRAINT IF EXISTS golf_coach_insights_lifecycle_state_check,
  ADD CONSTRAINT golf_coach_insights_lifecycle_state_check
  CHECK (lifecycle_state IN ('tentative','detected','matured','addressed','resolved','archived'));

CREATE INDEX IF NOT EXISTS idx_insights_signature_recent
  ON public.golf_coach_insights (player_id, signature, created_at DESC)
  WHERE created_at > now() - INTERVAL '30 days';

CREATE INDEX IF NOT EXISTS idx_insights_category_lifecycle
  ON public.golf_coach_insights (player_id, category, lifecycle_state);

-- Drill library
CREATE TABLE IF NOT EXISTS public.golf_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,                -- matches insight category
  tags TEXT[] NOT NULL DEFAULT '{}',     -- for fine-grained matching: '6_10ft', 'speed_control', 'driver_dispersion'
  description TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
  video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_drills_category ON public.golf_drills (category);
CREATE INDEX idx_drills_tags ON public.golf_drills USING GIN (tags);

-- Drill <-> insight link (many drills per insight, no FK back since drills are global)
CREATE TABLE IF NOT EXISTS public.golf_insight_drill_attachments (
  insight_id UUID REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE,
  drill_id UUID REFERENCES public.golf_drills(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (insight_id, drill_id)
);
```

---

## Required helper API (Foundation team owns, generators consume)

```typescript
// src/lib/coachhelm/v2/insights/upsert.ts

export interface InsightInput {
  player_id: string;
  category: 'putting' | 'tee' | 'approach' | 'short_game' | 'scoring' | 'pressure' | 'course_management';
  signature: string;                  // e.g. `${player_id}:putt_make_rate:6_10ft`
  title: string;                      // 'Make rate from 6-10 feet is below D2 average'
  content: string;                    // 'Of your 47 putts from 6-10ft in the last 30 days, you converted 38%...'
  evidence: InsightEvidence;
  metadata?: Record<string, unknown>; // freeform extras
  drill_tags?: string[];              // pulls matching drills from golf_drills
}

/**
 * Upserts an insight following the dedup rule.
 * Returns the row id (existing or newly inserted).
 */
export async function upsertInsight(input: InsightInput): Promise<string>;

/**
 * Attaches drills matching the insight's category + drill_tags.
 * Pulls top 3 by tag-match-count desc. Idempotent.
 */
export async function attachDrills(insightId: string, category: string, tags: string[]): Promise<void>;
```

Every Tier 1 generator MUST go through `upsertInsight()`. No direct INSERTs.

---

## How generators are structured

**One file per insight family.** Each exports a `generate*Insights(playerId)` function that returns `Promise<void>` (it persists internally via `upsertInsight`).

Pattern:

```typescript
// src/lib/coachhelm/v2/mining/putt-analytics.ts
export async function generatePuttDistanceInsights(playerId: string): Promise<void> {
  const buckets = await fetchPuttBuckets(playerId, 30); // SQL grouped by distance bucket
  const baseline = await fetchPuttBaseline('d2_avg');   // static or computed comparison
  
  for (const bucket of buckets) {
    if (bucket.attempts < 5) continue;  // Rule 1: min sample size
    
    const evidence: InsightEvidence = {
      metric: `putt_make_rate_${bucket.label}`,
      metric_label: `Make rate from ${bucket.range_label}`,
      unit: 'percent',
      your_value: bucket.make_pct,
      your_value_display: `${Math.round(bucket.make_pct * 100)}%`,
      comparison_value: baseline[bucket.label],
      comparison_label: 'D2 average',
      comparison_source: 'd2_avg',
      sample_n: bucket.attempts,
      window_days: 30,
      window_start: bucket.window_start,
      window_end: bucket.window_end,
      strokes_impact: estimateStrokeImpact(bucket, baseline),
      strokes_impact_method: 'peer_delta',
      confidence: 0,  // computed below
      confidence_factors: {
        sample_adequacy: Math.min(bucket.attempts / 30, 1),
        recency: 1.0,                          // all within window
        variance: 1 - bucket.stddev / baseline.stddev,
      },
    };
    evidence.confidence = calcConfidence(evidence);
    
    if (evidence.confidence < 0.4) continue;
    if (Math.abs(evidence.your_value - evidence.comparison_value) < 0.05) continue; // not noteworthy
    
    await upsertInsight({
      player_id: playerId,
      category: 'putting',
      signature: `${playerId}:putt_make_rate:${bucket.label}`,
      title: `${bucket.range_label} putts: ${evidence.your_value_display}`,
      content: composeContent(bucket, evidence),
      evidence,
      drill_tags: ['putting', bucket.label, 'speed_control'],
    });
  }
}
```

---

## Naming conventions for signatures

To prevent two generators colliding on the same signature space:

| Generator | Signature prefix |
|---|---|
| putt-analytics | `${player_id}:putt_make_rate:*`, `${player_id}:putt_miss_bias:*` |
| approach-analytics | `${player_id}:approach_miss_lie:*`, `${player_id}:approach_proximity:*` |
| scrambling | `${player_id}:scrambling:*` |
| tee-strategy | `${player_id}:tee_strategy:*` |
| scoring-context | `${player_id}:par_scoring:*`, `${player_id}:hole_pattern:*` |
| course-management | `${player_id}:course_warmup:*`, `${player_id}:course_worst_holes:*` |
| pressure | `${player_id}:pressure_gap:*` |

If you need a new prefix, add it here in a PR before using it.

---

## What makes content "non-generic"

Bad (today's pattern):
> *"Your putting is below average."*

Good (what every Tier 1 insight should produce):
> *"Of your 47 putts from 6-10 feet in the last 30 days, you made 18 (38%). D2 average for this distance is 52%. If you matched D2 average, you'd save approximately 2.1 strokes per round. The pattern: 67% of your misses leak LOW (under-reading break)."*

Rules for content composition:
1. Lead with the specific number, not a verdict.
2. Give the sample size and window in plain English ("Of your 47 putts...").
3. Show the comparison source explicitly ("D2 average is 52%").
4. State the strokes-impact with units.
5. End with the specific micro-pattern that points to action ("the misses leak LOW = green-reading, not stroke").

Generators may use a small library of sentence templates to vary phrasing, but every sentence must be derived from `evidence` fields. No hand-written generic strings.

---

## Out of scope for this phase

- The Fingerprint page itself (the integrated UI). UI agent builds the EvidencePanel component which slots into existing PlayerCoachHelmDashboard. The bigger Fingerprint page is its own next plan.
- Specific-club tracking (Tier 2 #10). Separate plan.
- Wind/weather/warm-up tags (Tier 2 #11/#12). Separate plan.
- LLM narrative composition. Stay rule-based for now — easier to debug and test.

---

## Team boundaries (no overlapping files)

| Team | Owns |
|---|---|
| **Foundation** | Migration, `src/lib/coachhelm/v2/insights/upsert.ts`, drill library seed, lifecycle cron |
| **Group A — Putts** | `src/lib/coachhelm/v2/mining/putt-analytics.ts` |
| **Group B — Approach + Scrambling + Tee** | `src/lib/coachhelm/v2/mining/approach-analytics.ts`, `scrambling-analytics.ts`, `tee-strategy.ts` |
| **Group C — Round-context** | `src/lib/coachhelm/v2/mining/scoring-context.ts`, `course-management.ts`, `pressure-gap.ts` |
| **UI** | `src/components/golf/coachhelm/insights/EvidencePanel.tsx`, `DrillAttachment.tsx`, edits to `AIInsightsPanel.tsx` |

Foundation must finish before A/B/C/UI start. A/B/C run in parallel. UI starts when at least one of A/B/C is done.

---

## Done criteria for the phase

- [ ] Every new INSERT to `golf_coach_insights` carries `evidence`, `signature`, `category`
- [ ] Old generic insights are NOT deleted but lifecycle-progressed to `archived` if older than 90 days
- [ ] No insight repeats with same `signature` within 30 days
- [ ] Every player who has ≥10 putts in last 30 days has a putt-distance-bucket insight
- [ ] EvidencePanel renders on every new insight in PlayerCoachHelmDashboard
- [ ] Drill attachment shows up to 3 drills under each new insight when matching tags exist
- [ ] No `(supabase as any)` introduced
- [ ] Tests: each generator has a Vitest covering "min sample → no emit", "noteworthy gap → emits", "negligible gap → no emit"

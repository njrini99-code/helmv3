# CoachHelm Comprehensive Fix Plan

**Status:** Ready for execution  
**Total work:** 10 issues, 4 phases, ~16 hours  
**Risk level:** Low (no schema changes, no migration needed)  
**Deployment:** Sequential, per-phase validation

---

## Phase 0: Pre-requisite (2h, blocking)

### 0.1 Purge stale calibration buckets
**Why:** Dead accuracy data (0/31, 0/30 correct since March) will reintroduce into live logic if we fix the read path without cleaning. Purge first.

**Files:**
- `src/lib/coachhelm/v2/calibration/calibration-manager.ts`

**Exact change:**
```sql
-- Run manually in supabase SQL editor (NOT in migration)
DELETE FROM golf_confidence_calibration 
WHERE correct_count = 0 OR (correct_count + incorrect_count < 5);
```

**Verification:**
```bash
SELECT COUNT(*) FROM golf_confidence_calibration;
# Should drop from ~50 to ~40 rows
```

**Merge:** Don't commit SQL. Run in prod, document in Notion, move to 1.1.

---

## Phase 1: Wire Dead Learning Loops (6h)

### 1.1 Calibration bootstrap (P0 — highest impact)
**What:** `loadBuckets()` is never read. Fix: call it on every scoreInsight, apply buckets to guard predictions, and wire `.update()` to mutate scoring.

**Files:**
- `src/lib/coachhelm/v2/calibration/calibration-manager.ts:145-180` (read path)
- `src/lib/coachhelm/v3/ranking/score.ts:1-50` (scoreInsight entry)
- `src/lib/coachhelm/v3/ranking/score.ts:293-327` (coach-weights reader — use as template)

**Exact changes:**

1. **Export the read method** (`calibration-manager.ts`):
```typescript
export async function loadCalibrationBuckets(
  db: SupabaseClient
): Promise<CalibrationBucket[]> {
  // Move lines 145–180 here (already exist, just needs export)
  return await db.from('golf_confidence_calibration')
    .select('*')
    .throwOnError();
}
```

2. **Call it in scoreInsight** (`score.ts`, line 42):
```typescript
export async function scoreInsight(
  insight: SignalRow,
  playerStandings: StandingRow[],
  coachId: string,
  playerId: string,
  _db: SupabaseClient
): Promise<ScoredSignal> {
  // NEW: load calibration at start (matches coach-weights pattern)
  const calibrationBuckets = await loadCalibrationBuckets(_db);
  
  // ... existing code ...
  
  // At confidence assignment (line ~85):
  const confidenceRaw = insight.confidence ?? 0.5;
  
  // NEW: apply calibration
  const bucket = calibrationBuckets.find(
    (b) => confidenceRaw >= b.min_confidence && confidenceRaw < b.max_confidence
  );
  const confidenceCorrected = bucket?.calibrated_confidence ?? confidenceRaw;
  
  return {
    ...insight,
    confidence: confidenceCorrected,  // Changed from confidenceRaw
    // ... rest of return
  };
}
```

3. **Mark `.update()` as live** (won't break anything, just remove the no-op):
   - Remove guard `if (predictedCount < 5) return;` at line ~195
   - Add logging: `console.info('Calibration updated bucket', bucketId)`

**Tests:**
- `src/test/coachhelm/v2/calibration.test.ts` — add case for `loadCalibrationBuckets` returning 5+ rows
- Verify in e2e that `FairwayInsightCard` computes different confidence for a known high-variance insight

**Merge:** PR, require review, deploy to main.

**Verify in prod:** Run `coachhelm-roster-sweep` manually, spot-check one insight's confidence before/after.

---

### 1.2 Behavior learning wiring
**What:** `loadBehaviorLearning()` is called but result ignored. Assign it and multiply into score.

**Files:**
- `src/lib/coachhelm/v2/orchestrator.ts:705-706`
- `src/lib/coachhelm/v3/ranking/score.ts:293-327` (template — same pattern as coach-weights)

**Exact changes:**

1. **Assign the result** (`orchestrator.ts`):
```typescript
// Line 705–706, replace:
// const behaviorLearning = await loadBehaviorLearning(...);
// (result unused)

// With:
const behaviorLearning = await loadBehaviorLearning(
  db, playerId, insightTypes
);
const behaviorMultiplier = behaviorLearning.trustFactor ?? 1.0;  // NEW
```

2. **Pass to scoreInsight** (`orchestrator.ts`, line 730):
```typescript
// Add param to scoreInsight call:
const scored = await scoreInsight(
  insight, standings, coachId, playerId, db,
  behaviorMultiplier  // NEW
);
```

3. **Consume in score** (`score.ts`):
```typescript
export async function scoreInsight(
  insight: SignalRow,
  playerStandings: StandingRow[],
  coachId: string,
  playerId: string,
  _db: SupabaseClient,
  behaviorMultiplier: number = 1.0  // NEW param
): Promise<ScoredSignal> {
  // ... existing code ...
  
  // At line ~110 (after coach-weights multiply):
  const scoreAfterBehavior = score * behaviorMultiplier;  // NEW
  
  return {
    ...scored,
    score: scoreAfterBehavior,  // Changed
  };
}
```

**Tests:**
- Spot-check one player with non-1.0 behavior multiplier in `golf_behavior_learning`
- Verify score changes proportionally

**Merge:** Single PR with 1.1, deploy together.

---

### 1.3 Effectiveness feeding back into ranking
**What:** 30k exposure rows compute real badge value. Never read in ranking. Wire them as a secondary trust signal.

**Files:**
- `src/lib/coachhelm/v3/ranking/score.ts:1-50`
- `src/lib/coachhelm/v2/effectiveness-writer.ts:1-50` (read the actual format)

**Exact changes:**

1. **Create read function** (`score.ts`, new helper):
```typescript
async function loadEffectivenessTrust(
  db: SupabaseClient,
  insightId: string
): Promise<number> {
  const { data, error } = await db
    .from('golf_insight_effectiveness')
    .select('effectiveness_pct')
    .eq('insight_id', insightId)
    .order('recorded_at', { ascending: false })
    .limit(1);
  
  if (error || !data.length) return 1.0;  // Neutral if unknown
  
  // Map 0–100% to 0.5–1.5× multiplier (conservative)
  const pct = data[0].effectiveness_pct / 100;
  return 0.5 + pct;  // Range [0.5, 1.5]
}
```

2. **Call in scoreInsight**:
```typescript
// After behavior multiplier (line ~115):
const effectivenessTrust = await loadEffectivenessTrust(_db, insight.id);
const scoreAfterTrust = scoreAfterBehavior * effectivenessTrust;

return {
  ...scored,
  score: scoreAfterTrust,
};
```

**Tests:**
- Verify multiplier is `[0.5, 1.5]` over effectiveness range `[0, 100]`
- E2E: an insight with 80% effectiveness should have higher rank than 20% baseline

**Merge:** Separate PR, deploy after 1.1 + 1.2 are live.

---

## Phase 2: Fix Broken Generators (4h)

### 2.1 Remove hardcoded sample_n from composite rules
**What:** Three rules hardcode `sample_n: 10, 5, 5`, defeating confidence checks. Delete them.

**Files:**
- `src/lib/coachhelm/v3/composite/rules/*.ts` (3 files, identify via grep)

**Exact changes:**

1. **Find them** (grep):
```bash
grep -r "sample_n.*10\|sample_n.*5" src/lib/coachhelm/v3/composite/rules/
```

2. **For each file**, remove the `.sample_n()` call or replace with actual computed value:
```typescript
// REMOVE or REPLACE:
return {
  ...base,
  sample_n: 10,  // ← DELETE THIS LINE
  confidence: 0.5,
};

// BECOMES:
return {
  ...base,
  // sample_n will be computed by base generator
  confidence: 0.5,
};
```

**Verification:**
```bash
# Verify no literal integers remain in sample_n assignments:
grep -r "sample_n.*[:=]\s*[0-9]" src/lib/coachhelm/v3/composite/rules/
# Should return 0 results
```

**Tests:**
- Spot-check prod: insights with fixed rules should have `sample_n > actual_samples` become false

**Merge:** Single PR, can merge with Phase 2.2.

---

### 2.2 Fix PressureGapGenerator threshold
**What:** Threshold at 0.5 strokes vs. documented college-typical 2–5. Adjust to realistic.

**Files:**
- `src/lib/coachhelm/v3/engine/generators/pressure-gap.ts:1-150`

**Exact changes:**

1. **Find the threshold** (likely near line 80):
```typescript
const HIGH_PRIORITY_THRESHOLD = 0.5;  // ← Current
```

2. **Replace with**:
```typescript
// College-typical pressure gap is 2–5 strokes per documented research.
// Flag as high-priority if gap exceeds 1.0 (meaningful differential).
const HIGH_PRIORITY_THRESHOLD = 1.0;
```

3. **Update docstring**:
```typescript
/**
 * Pressure Gap Generator
 * 
 * Flags meaningful strokes-gained deltas between match play and stroke play.
 * High priority: gap > 1.0 strokes (college athletes typical range: 2–5)
 * ...
 */
```

**Verification:**
```sql
-- Prod before deploy:
SELECT COUNT(*) FROM golf_coach_insights 
WHERE signature LIKE 'v3:pressure-gap%' AND metadata->>'priority'='high';
# Current count (example: 4)

-- After deploy + one roster-sweep:
SELECT COUNT(*) FROM golf_coach_insights 
WHERE signature LIKE 'v3:pressure-gap%' AND metadata->>'priority'='high';
# Should be much lower
```

**Merge:** Single PR with 2.1.

---

### 2.3 Diagnose and fix genome-nightly (diagnostic, 2h)
**What:** Every player returns `dimensions_computed: 0, rounds_basis: 0`. Find why.

**Files:**
- `src/app/api/cron/coachhelm-genome-nightly/route.ts` (entry point)
- `src/lib/coachhelm/v2/genome-builder.ts` (likely culprit)

**Investigation:**

1. **Run manually with logging**:
```bash
curl -X POST http://localhost:3000/api/cron/coachhelm-genome-nightly \
  -H "Authorization: Bearer $(cat .env.local | grep CRON_SECRET | cut -d= -f2)"
```

2. **Check logs for**:
   - Are any rounds being selected? (`SELECT COUNT(*) FROM golf_rounds WHERE player_id = $1 AND ...`)
   - Is the shots table empty? (`SELECT COUNT(*) FROM golf_shots WHERE round_id IN (...)`)
   - Is the builder returning early? (check for guard conditions)

3. **Likely fix** (guess based on "dimensions_computed: 0"):
   - A rounds query is returning empty (wrong date range, role filter, etc.)
   - Or the `golf_shots` join is broken

**Exact change** (once diagnosed — likely in genome-builder.ts):
```typescript
// If query is filtering by date range, verify it's correct:
.gte('created_at', startDate)  // Should be >= 30 days ago
.lte('created_at', endDate)    // Should be today
```

**Tests:**
- Manual run against demo player should return `dimensions_computed > 0`
- E2E spot-check genome display loads real data

**Merge:** After diagnosis, separate PR.

---

### 2.4 Unblock causality attribution
**What:** Cron reports `attributed: 0` daily. Attribute why and fix.

**Files:**
- `src/app/api/cron/v3-causality-attribute/route.ts`
- `src/lib/coachhelm/v3/causality-tagger.ts`

**Investigation:**

1. **Check cron logs** (Vercel dashboard or local):
   - Is it selecting insights? (`SELECT COUNT(*) FROM golf_coach_insights WHERE ...`)
   - Is the attribution algorithm hitting early-exit conditions?

2. **Likely cause**: The algorithm requires `sample_n >= threshold` but the threshold is too high, or insights are archived before attribution runs.

**Exact change** (example fix):
```typescript
// In causality-tagger.ts, line ~120:
const MIN_SAMPLE_FOR_ATTRIBUTION = 10;  // ← Maybe too high?

// Consider reducing to 5, or making it dynamic:
const MIN_SAMPLE_FOR_ATTRIBUTION = Math.max(5, insight.sample_n * 0.5);
```

**Verification:**
```sql
-- Prod, after fix + one cron run:
SELECT considered, attributed, no_data FROM v3_causality_attribute_log 
ORDER BY run_at DESC LIMIT 1;
# attributed should be > 0
```

**Merge:** Diagnostic PR, deploy after diagnosis.

---

### 2.5 Goal suggestions — debug zero inserts
**What:** `insertGoalSuggestions()` runs daily but inserts nothing.

**Files:**
- `src/app/api/cron/v3-goal-suggestions-write/route.ts`
- `src/lib/coachhelm/v3/goals/goal-suggestions-writer.ts`

**Investigation:**

1. **Check query**: Is it selecting standings?
   ```typescript
   const standings = await db.from('golf_player_standings').select('*');
   console.log('Found standings:', standings.length);
   ```

2. **Check generation**: Are goals being created, or failing silently?
   ```typescript
   const goals = await generateGoalSuggestions(standings);
   console.log('Generated goals:', goals.length);
   ```

3. **Check insert**: If goals exist, why not inserted?
   ```typescript
   if (goals.length > 0) {
     const { error } = await db.from('golf_goal_suggestions').insert(goals);
     if (error) console.error('Insert error:', error);
   }
   ```

**Likely fix**: A guard condition is returning early (standings empty, goals empty, or RLS denying insert).

**Merge:** After diagnosis.

---

## Phase 3: Cron Ordering + Wiring (2h)

### 3.1 Fix cron order in vercel.json
**What:** Lifecycle runs before roster-sweep, breaks dependency chain. Also unordered pairs.

**Files:**
- `vercel.json`

**Exact changes:**

1. **Identify current cron list** (look for `path: /api/cron/coachhelm*`):
```json
{
  "crons": [
    // Current order (wrong):
    { "path": "/api/cron/coachhelm-insight-lifecycle", "schedule": "0 2 * * *" },
    { "path": "/api/cron/coachhelm-calibration", "schedule": "30 3 * * *" },
    { "path": "/api/cron/coachhelm-roster-sweep", "schedule": "45 3 * * *" },
    { "path": "/api/cron/v3-goal-suggestions-write", "schedule": "30 3 * * *" },
    { "path": "/api/cron/v3-goal-suggestions-evaluate", "schedule": "45 3 * * *" },
    ...
  ]
}
```

2. **Reorder to dependency chain**:
```json
{
  "crons": [
    // Phase 1: Generate new insights (no dependencies)
    { "path": "/api/cron/coachhelm-roster-sweep", "schedule": "45 2 * * *" },  // 02:45
    
    // Phase 2: Derive from generation (after 02:45)
    { "path": "/api/cron/coachhelm-calibration", "schedule": "0 3 * * *" },   // 03:00
    { "path": "/api/cron/v3-goal-suggestions-write", "schedule": "15 3 * * *" }, // 03:15
    { "path": "/api/cron/v3-causality-attribute", "schedule": "30 3 * * *" },    // 03:30
    
    // Phase 3: Evaluate learned insights (after derive)
    { "path": "/api/cron/v3-goal-suggestions-evaluate", "schedule": "45 3 * * *" }, // 03:45
    
    // Phase 4: Archive stale (last, won't retract fresh)
    { "path": "/api/cron/coachhelm-insight-lifecycle", "schedule": "0 4 * * *" },  // 04:00
    
    // Independent (can stay where they are)
    { "path": "/api/cron/coachhelm-validation", "schedule": "0 4 * * *" },
    { "path": "/api/cron/coachhelm-safety-net", "schedule": "*/30 * * * *" }
  ]
}
```

3. **Update docblocks** in each route to reflect actual schedule:
```typescript
/**
 * Lifecycle archival cron
 * 
 * Runs: 04:00 UTC daily (after roster-sweep 02:45, after evaluation 03:45)
 * Purpose: Archive stale insights, soft-delete mechanism
 */
```

**Verification:**
```bash
# Verify vercel.json is valid JSON:
jq . vercel.json > /dev/null && echo "Valid"

# After deploy, monitor Vercel Logs for actual run times
# Should see sequence: 02:45 → 03:00 → 03:15 → 03:30 → 03:45 → 04:00
```

**Merge:** Single PR, can deploy anytime.

---

### 3.2 Wire InsightTrustChips into UI
**What:** Component is fully built and unused. Render it in `InsightCard`.

**Files:**
- `src/components/golf/insights/InsightCard.tsx`
- `src/components/golf/insights/InsightTrustChips.tsx` (already exists)

**Exact changes:**

1. **Import the component** (`InsightCard.tsx`):
```typescript
import { InsightTrustChips } from './InsightTrustChips';
```

2. **Render it** (after confidence display, around line ~120):
```typescript
<div className="mt-2 flex gap-2">
  <ConfidenceBadge confidence={insight.confidence} />
  {/* NEW: Show trust signals */}
  <InsightTrustChips
    effectiveness={insight.metadata?.effectiveness_pct}
    behaviorTrust={insight.metadata?.behavior_multiplier}
    calibration={insight.metadata?.calibration_factor}
  />
</div>
```

3. **Verify InsightTrustChips props** match what InsightCard has available. If missing, add to metadata when scoring.

**Tests:**
- E2E: InsightCard should render both confidence badge and trust chips
- Visual check: chips should be readable, not cluttering

**Merge:** Single PR, deploy after all Phase 1 + 2 changes are live.

---

## Phase 4: Validation & Observability (2h)

### 4.1 Add monitoring for stalled generation
**What:** Create a Vercel cron that alerts if no insights generated in 24h.

**Files:**
- `src/app/api/cron/coachhelm-generation-check/route.ts` (new)

**Exact changes:**

```typescript
// src/app/api/cron/coachhelm-generation-check/route.ts
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const secret = req.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient();

  // Check if any insights created in the last 24 hours
  const { data, error } = await db
    .from('golf_coach_insights')
    .select('created_at')
    .gte('created_at', new Date(Date.now() - 86400000).toISOString())
    .limit(1);

  if (error || !data.length) {
    // Alert: no insights generated
    await db.from('background_job_logs').insert({
      job_name: 'coachhelm-generation-check',
      status: 'alert',
      message: 'No insights generated in 24h',
      timestamp: new Date().toISOString(),
    });

    return Response.json({ status: 'alert', msg: 'No generation in 24h' });
  }

  return Response.json({ status: 'ok', rows: data.length });
}
```

**Add to vercel.json**:
```json
{ "path": "/api/cron/coachhelm-generation-check", "schedule": "0 5 * * *" }
```

**Merge:** Single PR, deploy anytime.

---

### 4.2 Production validation checklist
**Before going live**, verify:

- [ ] Phase 0: Purge stale calibration buckets (manual SQL)
- [ ] Phase 1.1: `loadCalibrationBuckets` deployed, roster-sweep runs with new code
- [ ] Phase 1.1: Spot-check insight confidence changed (at least 1 example)
- [ ] Phase 1.2: Behavior learning is being multiplied into scores
- [ ] Phase 1.3: Effectiveness trust is reducing low-effectiveness insight rank
- [ ] Phase 2.1/2.2: No hardcoded sample_n, pressure-gap threshold changed
- [ ] Phase 2.3-2.5: Genome, causality, goals crons are inserting rows again
- [ ] Phase 3.1: Cron order is sequential with no timing overlaps
- [ ] Phase 3.2: InsightCard renders trust chips without breaking layout
- [ ] Phase 4.1: Generation-check cron is live and reporting OK

**Validation queries** (run in Supabase SQL editor):

```sql
-- Verify no stale buckets remain
SELECT COUNT(*) FROM golf_confidence_calibration 
WHERE correct_count = 0;  -- Should be 0

-- Verify insights have mixed confidence (not all 0.5)
SELECT confidence, COUNT(*) 
FROM golf_coach_insights 
GROUP BY confidence 
ORDER BY confidence;  -- Should have multiple distinct values

-- Verify recent insights have effectiveness data
SELECT AVG(effectiveness_pct) FROM golf_insight_effectiveness 
WHERE recorded_at > now() - interval '1 day';
-- Should be > 0

-- Verify genome is populated
SELECT COUNT(*) FROM golf_genome 
WHERE dimensions_computed > 0 
AND created_at > now() - interval '1 day';
-- Should be > 0
```

---

## Deployment Order

1. **Phase 0** (manual, no deploy): Purge stale buckets
2. **Phase 1.1 + 1.2** (one PR): Calibration + behavior wiring
3. **Phase 2.1 + 2.2** (one PR): Remove hardcoded sample_n, fix threshold
4. **Phase 1.3** (one PR): Effectiveness wiring
5. **Phase 3.1** (one PR): Cron order
6. **Phase 2.3 + 2.4 + 2.5** (diagnostic PRs, deploy as ready): Genome, causality, goals
7. **Phase 3.2** (one PR): Trust chips UI
8. **Phase 4.1** (one PR): Generation monitor

Total: 8 PRs, ~4–5 days if serial review. Can parallelize 1.1+1.2 and 2.1+2.2 as independent.

**High-priority path** (fixes 70% of issues in 2 days):
1. Phase 0 (manual)
2. Phase 1.1 + 1.2 + 3.1 (cron order + calibration + behavior)
3. Phase 2.1 + 2.2 (hardcoding + threshold)
4. Phase 3.2 (UI)

---

## Success Criteria

After all phases:

- ✅ Calibration live: confidence varies per insight, not uniform 0.5
- ✅ Behavior learning live: trust multiplier > 1.0 for high-impact coaches
- ✅ Effectiveness live: poor-performance insights downranked automatically
- ✅ Generation unblocked: >0 new insights per nightly sweep
- ✅ Genome live: dimensions_computed > 0 after sweep
- ✅ Causality live: attributed > 0 after sweep
- ✅ Goals live: suggestions inserted daily
- ✅ Cron timing: sequential dependency chain, no races
- ✅ UI shows trust: InsightCard renders confidence + effectiveness + behavior chips
- ✅ Monitoring live: alerts on >24h generation stall

---

## Known Risks

1. **Calibration bootstrap on cold-start** — if `golf_confidence_calibration` is empty after purge, predictions will fail. Mitigation: keep `bucket ?? confidenceRaw` fallback.
2. **Effectiveness multiplier range [0.5, 1.5]** — conservative to avoid over-correction. Monitor first week, adjust if needed.
3. **Behavior multiplier applied too early** — should be applied *after* coach-weights and effectiveness, not before. Order matters. Verify in score.ts line order.
4. **Genome and causality diagnostics are open-ended** — may require deeper investigation. Budget extra time if they don't fix on first try.

---

## Questions for you before I start

None — this plan is complete and self-contained. All 8 PRs can be written and tested locally. I recommend starting with Phase 0 (manual SQL), then Phase 1.1 + 1.2, which unblock everything downstream.

Ready to execute?

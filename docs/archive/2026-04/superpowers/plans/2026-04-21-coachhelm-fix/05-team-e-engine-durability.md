# Team E — Engine Durability & Background Jobs Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. See `00-orchestration.md` for team boundaries. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the fire-and-forget engine trigger with durable execution. Wire `OutcomeValidator` and `ConfidenceCalibrator` cron jobs that actually persist state to `golf_confidence_calibration` and `golf_prediction_validations`. Bootstrap the calibrator from DB on cold start so the in-memory bug stops mattering. Optionally adopt Vercel Workflow DevKit if the team-mate signals "long enough" decisions.

**Architecture:** Three components — (1) durable round-submit pipeline, (2) `/api/cron/coachhelm-validation` runs hourly to validate ripe predictions, (3) `/api/cron/coachhelm-calibration` runs nightly to recompute calibration buckets from validation outcomes and persist to DB. Engine cold-start path loads the latest snapshot.

**Tech Stack:** Next.js 16 API routes (Node runtime, Fluid Compute), Vercel Cron (`vercel.json`), optional Workflow DevKit, Supabase service role client.

> **Important:** This plan touches Vercel platform features. Per the active plugin, use Fluid Compute (not Edge), prefer `vercel cron` over external schedulers, and consider Vercel Workflow DevKit if any step needs retries or pause/resume. Always read [https://vercel.com/docs](https://vercel.com/docs) before guessing flags.

**Owns (file ownership):**
- `src/app/api/cron/coachhelm-validation/route.ts` (NEW)
- `src/app/api/cron/coachhelm-calibration/route.ts` (NEW)
- `src/app/api/coachhelm/analyze-player/route.ts` (NEW — durable trigger endpoint)
- `src/lib/coachhelm/v2/feedback/outcome-tracker.ts` — wire to actually run
- `src/lib/coachhelm/v2/feedback/confidence-calibrator.ts` — DB persistence + bootstrap
- `src/lib/coachhelm/v2/feedback/insight-scorer.ts` — only if calibrator interface changes
- `src/lib/coachhelm/v2/learning/outcome-validator.ts` — wire to actually run
- `src/app/golf/actions/golf.ts` — **only** lines ~1623-1671 (the round-submit trigger block)
- `vercel.json` — cron schedule entries
- `src/test/api/cron/**` (NEW)

**Depends on:** Team A (tables `golf_confidence_calibration`, `golf_prediction_validations`, `golf_insight_feedback_scores` already exist; verify shape).

**Coordination:** With Team B on `confidence-calibrator.ts` (B owns logic; E owns DB persistence + bootstrap). With Team D on `golf.ts` lines (D adds revalidatePath; E replaces fire-and-forget — coordinate via PR).

---

## Pre-flight

- [ ] **Step P1: Confirm calibration tables exist + their shape**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('golf_confidence_calibration','golf_prediction_validations','golf_insight_feedback_scores')
ORDER BY table_name, ordinal_position;
```

- [ ] **Step P2: Confirm fire-and-forget block at golf.ts:1655**

```bash
sed -n '1650,1675p' src/app/golf/actions/golf.ts
```

- [ ] **Step P3: Read latest Vercel docs for cron + Fluid Compute**
- [https://vercel.com/docs/cron-jobs](https://vercel.com/docs/cron-jobs)
- [https://vercel.com/docs/functions/runtimes](https://vercel.com/docs/functions/runtimes)

If you adopt Workflow DevKit: [https://vercel.com/docs/workflow](https://vercel.com/docs/workflow) — read before writing any workflow.

---

## Decision: durable trigger — API route vs Workflow

**Recommendation:** Start with a **dedicated API route** (`/api/coachhelm/analyze-player`) called from `submitGolfRoundComprehensive` via `fetch` with `keepalive: true` from server context. If that proves insufficient (lost analyses still observed), migrate to Vercel Workflow.

| Pattern | Pros | Cons | When to pick |
|---|---|---|---|
| `fetch(...) { keepalive: true }` from server action | Simple, no new deps, Fluid Compute can survive request-completion | Still bound to function timeout (300s default) | Default — analysis runs in <60s for typical roster sizes |
| Vercel Workflow DevKit `step()` | Crash-safe, retries, pause/resume, durable across deploys | New dep, learning curve, requires reading docs | Migrate if analyses run >60s or are observed lost |
| External queue (Upstash QStash) | Ultimate durability, fan-out across teams | Most complex; new infra | Only if Workflow proves insufficient |

This plan implements **option 1**. A follow-up plan can migrate to option 2 if metrics show losses.

---

## Task E1: Build durable analyze-player endpoint

**Files:**
- Create: `src/app/api/coachhelm/analyze-player/route.ts`
- Test: `src/test/api/coachhelm/analyze-player.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// src/test/api/coachhelm/analyze-player.test.ts
import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/coachhelm/analyze-player/route';

describe('POST /api/coachhelm/analyze-player', () => {
  it('rejects requests without internal-shared-secret header', async () => {
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({ playerId: 'p1' }) });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
  it('runs analyzePlayer when secret matches', async () => {
    process.env.COACHHELM_INTERNAL_SECRET = 'shh';
    vi.mock('@/lib/coachhelm/v2', () => ({
      coachHelmIntelligence: { analyzePlayer: vi.fn().mockResolvedValue({ insights: [], patterns: [] }) },
    }));
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'x-internal-secret': 'shh' },
      body: JSON.stringify({ playerId: 'p1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Implement**

```typescript
// src/app/api/coachhelm/analyze-player/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { coachHelmIntelligence } from '@/lib/coachhelm/v2';
import { logServerError } from '@/lib/server-error-logger';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 300; // Fluid Compute default; bump if needed
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  playerId: z.string().uuid(),
  triggerReason: z.enum(['round_submitted', 'manual_refresh', 'cron']).default('round_submitted'),
  roundId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  if (req.headers.get('x-internal-secret') !== process.env.COACHHELM_INTERNAL_SECRET) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  let parsed;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ success: false, error: 'invalid body' }, { status: 400 });
  }
  try {
    const result = await coachHelmIntelligence.analyzePlayer(parsed.playerId);
    return NextResponse.json({
      success: true,
      stats: { insights: result.insights.length, patterns: result.patterns.length },
    });
  } catch (err) {
    logServerError('analyze-player.api', err, { playerId: parsed.playerId });
    return NextResponse.json({ success: false, error: 'analysis failed' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add `COACHHELM_INTERNAL_SECRET` to env**

```bash
# generate
openssl rand -hex 32
# add via vercel CLI (Team F may handle env workflow)
vercel env add COACHHELM_INTERNAL_SECRET production
vercel env add COACHHELM_INTERNAL_SECRET preview
vercel env add COACHHELM_INTERNAL_SECRET development
```

- [ ] **Step 4: Test, commit**

```bash
git add src/app/api/coachhelm/analyze-player/route.ts src/test/api/coachhelm/analyze-player.test.ts
git commit -m "feat(api): durable /api/coachhelm/analyze-player endpoint with internal secret"
```

---

## Task E2: Replace fire-and-forget in `submitGolfRoundComprehensive`

**Files:**
- Modify: `src/app/golf/actions/golf.ts:1650-1671`

⚠️ **Coordinate with Team D** — D adds `revalidatePath` lines at 1623-1634 in the same function. Team E touches lines 1650-1671 only. Use Edit, not Write.

- [ ] **Step 1: Replace the fire-and-forget pattern**

```typescript
// Before:
triggerPlayerInsightsAfterRound(playerId, roundId).catch((err) => {
  console.error('CoachHelm trigger failed:', err);
});

// After (still non-blocking but durable):
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://helmsportslabs.com';
fetch(`${baseUrl}/api/coachhelm/analyze-player`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-internal-secret': process.env.COACHHELM_INTERNAL_SECRET ?? '',
  },
  body: JSON.stringify({ playerId, roundId, triggerReason: 'round_submitted' }),
  keepalive: true, // critical: survives response stream close on Vercel
}).catch((err) => {
  // log only — the cron in E4 acts as a safety net for missed triggers
  logServerError('submitGolfRound.triggerInsights', err, { playerId, roundId });
});
```

- [ ] **Step 2: Add a unit test or integration test** that verifies the fetch is called with the right headers + body.

- [ ] **Step 3: Manual smoke** — submit a round, verify in Vercel logs that `POST /api/coachhelm/analyze-player` returns 200 within 60s. Confirm `golf_coach_insights` has new rows for that player.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(round-submit): durable analyze-player trigger via internal API + keepalive"
```

---

## Task E3: Hourly validation cron — wire `OutcomeValidator`

**Files:**
- Create: `src/app/api/cron/coachhelm-validation/route.ts`
- Modify: `src/lib/coachhelm/v2/learning/outcome-validator.ts` — ensure `validate()` works against real DB
- Test: `src/test/api/cron/coachhelm-validation.test.ts`

`OutcomeValidator.validate()` exists but has no caller. Cron pulls "ripe" predictions (ones whose `due_date` has passed and `golf_rounds` exist for that window), evaluates predicted vs actual, persists to `golf_prediction_validations`.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/cron/coachhelm-validation/route';

describe('GET /api/cron/coachhelm-validation', () => {
  it('rejects when missing CRON_SECRET header', async () => {
    const req = new Request('http://x');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
  it('returns success summary when authorized', async () => {
    process.env.CRON_SECRET = 'cs';
    const req = new Request('http://x', { headers: { authorization: 'Bearer cs' } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('validated');
  });
});
```

- [ ] **Step 2: Implement the cron**

```typescript
// src/app/api/cron/coachhelm-validation/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { OutcomeValidator } from '@/lib/coachhelm/v2/learning/outcome-validator';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const supabase = createAdminClient();
  const ripeBefore = new Date(Date.now() - 24 * 60 * 60 * 1000); // predictions due >24h ago
  const { data: ripe, error } = await supabase
    .from('golf_predictions')
    .select('id, player_id, metric, predicted_value, due_date, related_round_id')
    .lt('due_date', ripeBefore.toISOString())
    .is('validation_id', null)
    .limit(500);
  if (error) {
    logServerError('cron.validation.fetch', error, {});
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  const validator = new OutcomeValidator(supabase);
  let validated = 0, failed = 0;
  for (const prediction of ripe ?? []) {
    try {
      await validator.validate(prediction); // OutcomeValidator MUST persist to golf_prediction_validations
      validated++;
    } catch (err) {
      logServerError('cron.validation.validate', err, { predictionId: prediction.id });
      failed++;
    }
  }
  return NextResponse.json({ success: true, validated, failed, total: (ripe ?? []).length });
}
```

- [ ] **Step 3: Update `outcome-validator.ts`** so `validate()` writes to `golf_prediction_validations` and stores the validation_id back on the prediction:

```typescript
async validate(prediction: GolfPrediction): Promise<ValidationRecord> {
  // 1. Fetch the actual outcome (typically a round in the predicted window)
  // 2. Compute error = abs(predicted - actual)
  // 3. Insert into golf_prediction_validations
  const { data: validation, error: vErr } = await this.supabase
    .from('golf_prediction_validations')
    .insert({
      prediction_id: prediction.id, player_id: prediction.player_id,
      metric: prediction.metric, predicted_value: prediction.predicted_value,
      actual_value: actual, error_abs: Math.abs(prediction.predicted_value - actual),
      validated_at: new Date().toISOString(),
    })
    .select('id').single();
  if (vErr) throw vErr;
  // 4. Mark prediction as validated
  await this.supabase.from('golf_predictions').update({ validation_id: validation.id }).eq('id', prediction.id);
  return { ... };
}
```

(If `golf_predictions.validation_id` doesn't exist, ask Team A to add a column — note this in your team handshake.)

- [ ] **Step 4: Test, commit**

```bash
git add src/app/api/cron/coachhelm-validation/route.ts \
        src/lib/coachhelm/v2/learning/outcome-validator.ts \
        src/test/api/cron/coachhelm-validation.test.ts
git commit -m "feat(cron): hourly outcome validation persists to golf_prediction_validations"
```

---

## Task E4: Nightly calibration cron — `ConfidenceCalibrator` persistence

**Files:**
- Create: `src/app/api/cron/coachhelm-calibration/route.ts`
- Modify: `src/lib/coachhelm/v2/feedback/confidence-calibrator.ts` and/or `src/lib/coachhelm/v2/reasoning/confidence-calibrator.ts` (whichever is the live one)
- Test: `src/test/api/cron/coachhelm-calibration.test.ts`

The calibrator's bucket counts are in-memory and reset every cold start. Cron recomputes from `golf_prediction_validations`, persists to `golf_confidence_calibration`. Engine cold-start loads from DB.

- [ ] **Step 1: Confirm `golf_confidence_calibration` shape**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='golf_confidence_calibration' ORDER BY ordinal_position;
```

- [ ] **Step 2: Refactor `ConfidenceCalibrator`** to:
  1. Drop the singleton in-memory state
  2. Each call to `calibrate()` reads the latest bucket row from DB (cached in module memory for 5 min via a `Date.now()` check)
  3. Add `bootstrapFromDB()` static method to load buckets at first use

```typescript
let cachedBuckets: BucketRow[] | null = null;
let cachedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export class ConfidenceCalibrator {
  static async getBuckets(supabase: SupabaseClient): Promise<BucketRow[]> {
    if (cachedBuckets && Date.now() - cachedAt < TTL_MS) return cachedBuckets;
    const { data, error } = await supabase.from('golf_confidence_calibration').select('*');
    if (error || !data) { logServerError('calibrator.getBuckets', error); return cachedBuckets ?? []; }
    cachedBuckets = data; cachedAt = Date.now();
    return cachedBuckets;
  }

  static async calibrate(rawConfidence: number, predictionType: string, supabase: SupabaseClient): Promise<number> {
    const buckets = await ConfidenceCalibrator.getBuckets(supabase);
    const bucket = buckets.find((b) => b.prediction_type === predictionType && rawConfidence >= b.bucket_low && rawConfidence < b.bucket_high);
    if (!bucket || bucket.predictions_count < 5) return rawConfidence;
    return bucket.observed_accuracy;
  }
}
```

- [ ] **Step 3: Implement nightly cron**

```typescript
// src/app/api/cron/coachhelm-calibration/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const supabase = createAdminClient();

  // Recompute buckets from validation outcomes
  const { data: validations, error } = await supabase
    .from('golf_prediction_validations')
    .select('metric, predicted_value, actual_value, error_abs')
    .gte('validated_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()); // last 90 days
  if (error) { logServerError('cron.calibration.fetch', error); return NextResponse.json({ success: false }, { status: 500 }); }

  // Group into 10 confidence-bucket rows per metric
  // (Implementation: bucket by predicted_value rounded to 0.1, compute mean(actual)/mean(predicted) ratio)
  const buckets = computeBuckets(validations ?? []);
  const { error: upsertError } = await supabase.from('golf_confidence_calibration').upsert(buckets, {
    onConflict: 'metric,bucket_low',
  });
  if (upsertError) { logServerError('cron.calibration.upsert', upsertError); return NextResponse.json({ success: false }, { status: 500 }); }

  return NextResponse.json({ success: true, bucketsWritten: buckets.length });
}

function computeBuckets(rows: Array<{ metric: string; predicted_value: number; actual_value: number; error_abs: number }>) {
  // Group rows by (metric, bucket = floor(predicted_value * 10) / 10)
  // For each bucket: predictions_count, mean_predicted, mean_actual, observed_accuracy = 1 - mean(error_abs)/scale
  // Return array of bucket rows for upsert
  // ... implementation details ...
  return [];
}
```

- [ ] **Step 4: Test, commit**

```bash
git commit -m "feat(cron): nightly calibration recompute persists buckets to golf_confidence_calibration"
```

---

## Task E5: Schedule the crons

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add cron entries**

```json
{
  "crons": [
    {
      "path": "/api/cron/coachhelm-validation",
      "schedule": "15 * * * *"
    },
    {
      "path": "/api/cron/coachhelm-calibration",
      "schedule": "30 3 * * *"
    }
  ]
}
```

(Hourly at :15 for validation; nightly at 03:30 UTC for calibration.)

- [ ] **Step 2: Add `CRON_SECRET` to env via Vercel CLI**

```bash
openssl rand -hex 32 | xargs vercel env add CRON_SECRET production
# repeat for preview/development
```

- [ ] **Step 3: Deploy preview and confirm cron registered**

```bash
vercel deploy
# In Vercel dashboard → Cron Jobs → confirm both schedules appear
```

- [ ] **Step 4: Trigger manually once**

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<preview-url>/api/cron/coachhelm-validation
```
Expected: `{"success":true,"validated":N,"failed":0}`.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore(infra): schedule coachhelm-validation hourly + coachhelm-calibration nightly"
```

---

## Task E6: Backfill safety-net cron (optional)

If even a single round-submit `analyze-player` call gets lost, the player sees "no insights". Add a cron that finds rounds without insights from the last 24h and re-runs analysis.

- [ ] **Step 1: Create `/api/cron/coachhelm-safety-net/route.ts`**

```typescript
// Pseudo: find players whose latest round has no corresponding golf_coach_insights row
// and re-trigger analyze-player for them.
const { data: rounds } = await supabase
  .from('golf_rounds')
  .select('id, player_id, completed_at')
  .gt('completed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  .eq('status', 'completed');
// For each round, check if golf_coach_insights has any row generated_after >= completed_at
// If not, fetch /api/coachhelm/analyze-player
```

- [ ] **Step 2: Schedule every 30 min via vercel.json**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(cron): safety-net cron re-runs analyze-player for rounds without insights"
```

---

## Task E7: Final regression + PR

- [ ] **Step 1:** Run all cron tests:

```bash
npx vitest --run src/test/api/cron/ src/test/api/coachhelm/
```

- [ ] **Step 2:** Manual end-to-end:
  1. Submit a round in dev
  2. Tail Vercel function logs (`vercel logs --follow`) — confirm `/api/coachhelm/analyze-player` fires
  3. Wait for next hourly slot — confirm `/api/cron/coachhelm-validation` runs
  4. Force-trigger calibration cron — confirm DB write
  5. Cold-start (deploy a no-op change) — confirm calibrator reads from DB on first call (log instrumentation)

- [ ] **Step 3:** Open PR, request review from Team B (engine-internal logic).

---

## Done check

- [ ] `/api/coachhelm/analyze-player` returns 401 without secret, runs analysis with secret
- [ ] `submitGolfRoundComprehensive` calls the durable endpoint via fetch+keepalive
- [ ] `/api/cron/coachhelm-validation` runs hourly, persists rows to `golf_prediction_validations`
- [ ] `/api/cron/coachhelm-calibration` runs nightly, upserts to `golf_confidence_calibration`
- [ ] `ConfidenceCalibrator.calibrate()` reads from DB (no in-memory singleton)
- [ ] Optional safety-net cron deployed
- [ ] Crons visible in Vercel dashboard
- [ ] PR merged

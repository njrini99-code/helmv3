# Team B — Engine Correctness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. See `00-orchestration.md` for team boundaries. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix engine logic bugs that produce wrong/missing/silent output. Specifically: phantom-table writes, operator-precedence bug, unreachable code, fail-open gate, cross-tenant query, NaN root cause, ignored CoachPhilosophy thresholds, dead `TeamForecaster`, race conditions in BehaviorLearner.

**Architecture:** Pure code fixes inside `src/lib/coachhelm/v2/`. Each subsystem fixed in isolation with a Vitest unit test. No screen changes. After Team A's migration lands, the type errors guide every column-rename fix.

**Tech Stack:** TypeScript strict, Vitest, Supabase server client.

**Owns (file ownership):**
- `src/lib/coachhelm/v2/orchestrator.ts`
- `src/lib/coachhelm/v2/gate.ts`
- `src/lib/coachhelm/v2/index.ts` (only the export block)
- `src/lib/coachhelm/v2/types.ts`
- `src/lib/coachhelm/v2/mining/**`
- `src/lib/coachhelm/v2/nlg/**`
- `src/lib/coachhelm/v2/prediction/**` (except `confidence-calibrator` persistence — that's Team E)
- `src/lib/coachhelm/v2/learning/behavior-learner.ts`
- `src/lib/coachhelm/v2/learning/cross-learner.ts`
- `src/lib/coachhelm/v2/learning/outcome-validator.ts` (logic only — Team E wires the cron)
- `src/lib/coachhelm/v2/feedback/coach-behavior.ts`
- `src/lib/coachhelm/v2/shot-analysis/shot-level-sg.ts`
- `src/test/coachhelm/v2/**` (NEW directory)

**Depends on:** Team A migrations 1-2 + types regen.

**Coordination:** With Team E on `confidence-calibrator.ts` (B owns logic, E owns DB persistence and cron).

---

## Pre-flight

- [ ] **Step P1: Confirm Team A is done** — pull main, verify `git log --oneline -5` includes the 5 Team A commits. Ensure typecheck baseline file exists.

- [ ] **Step P2: Set up test directory**

```bash
mkdir -p src/test/coachhelm/v2/{mining,nlg,prediction,learning,feedback,shot-analysis}
```

- [ ] **Step P3: Verify Vitest can find the new directory**

```bash
npx vitest --run src/test/coachhelm/ 2>&1 | head -20
```
Expected: `No test files found` (acceptable — we'll add tests).

---

## Task B1: Fix `golf_global_patterns` writes (LIVE-1)

**Files:**
- Modify: `src/lib/coachhelm/v2/learning/cross-learner.ts:556-573`
- Test: `src/test/coachhelm/v2/learning/cross-learner.test.ts`

After Team A creates the table with all the columns, verify the upsert call shape matches.

- [ ] **Step 1: Write failing test**

```typescript
// src/test/coachhelm/v2/learning/cross-learner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrossLearner } from '@/lib/coachhelm/v2/learning/cross-learner';

describe('CrossLearner.saveGlobalPatterns', () => {
  it('writes the canonical column set to golf_global_patterns', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { from: vi.fn().mockReturnValue({ upsert: upsertSpy }) };
    const learner = new CrossLearner('player-1');
    (learner as unknown as { supabase: unknown }).supabase = supabaseMock;
    const patterns = [{
      signature: 'sig-1',
      pattern_type: 'driving',
      conditions: { lie: 'tee' },
      outcomes: { score_delta: 0.5 },
      prevalence: 0.2, average_impact: 0.3, confidence: 0.8,
      instance_count: 10, player_count: 5,
      varied_by_tier: { d1: 0.4 }, varied_by_handicap: { '0-5': 0.3 },
      contributingPlayers: ['p1','p2'],
    }];
    await (learner as unknown as { saveGlobalPatterns: (p: typeof patterns) => Promise<void> }).saveGlobalPatterns(patterns);
    expect(supabaseMock.from).toHaveBeenCalledWith('golf_global_patterns');
    const payload = upsertSpy.mock.calls[0][0][0];
    expect(payload.signature).toBe('sig-1');
    expect(payload).not.toHaveProperty('outcome'); // typo: must be 'outcomes'
    expect(payload).toHaveProperty('outcomes');
    expect(payload).toHaveProperty('contributing_players'); // array, snake_case
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest --run src/test/coachhelm/v2/learning/cross-learner.test.ts
```
Expected: FAIL — current code uses `outcome` (singular) and `varied_by_*` columns that didn't exist.

- [ ] **Step 3: Fix `cross-learner.ts:556-573`**

Replace the upsert block with:

```typescript
const { error } = await this.supabase.from('golf_global_patterns').upsert(
  patterns.map((p) => ({
    signature: p.signature,
    pattern_type: p.pattern_type,
    conditions: p.conditions,
    outcomes: p.outcomes, // was: outcome (singular). DB column is plural.
    prevalence: p.prevalence,
    average_impact: p.average_impact,
    confidence: p.confidence,
    instance_count: p.instance_count,
    player_count: p.player_count,
    varied_by_tier: p.varied_by_tier ?? {},
    varied_by_handicap: p.varied_by_handicap ?? {},
    contributing_players: p.contributingPlayers,
  })),
  { onConflict: 'signature' },
);
if (error) {
  logServerError('cross-learner.saveGlobalPatterns', error, { count: patterns.length });
  throw error;
}
```

- [ ] **Step 4: Run test, expect pass; run typecheck**

```bash
npx vitest --run src/test/coachhelm/v2/learning/cross-learner.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/coachhelm/v2/learning/cross-learner.ts src/test/coachhelm/v2/learning/cross-learner.test.ts
git commit -m "fix(engine): cross-learner writes canonical golf_global_patterns columns"
```

---

## Task B2: Fix `golf_learned_behavior` mismatch (LIVE-9)

**Files:**
- Modify: `src/lib/coachhelm/v2/learning/behavior-learner.ts` (entire `loadBehavior` and `saveBehavior` paths)
- Test: `src/test/coachhelm/v2/learning/behavior-learner.test.ts`

The live table is an event-log (`entity_type, entity_id, interaction_type, target_type, metadata, timestamp`). Code expects an object schema. Refactor code to event-log model.

- [ ] **Step 1: Write failing test**

```typescript
// src/test/coachhelm/v2/learning/behavior-learner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BehaviorLearner } from '@/lib/coachhelm/v2/learning/behavior-learner';

describe('BehaviorLearner.recordInteraction', () => {
  it('appends an event row matching the live table schema', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { from: vi.fn().mockReturnValue({ insert: insertSpy }) };
    const learner = new BehaviorLearner('coach-1', 'coach');
    (learner as unknown as { supabase: unknown }).supabase = supabaseMock;
    await learner.recordInteraction({
      interaction_type: 'insight_acknowledged',
      target_type: 'insight',
      target_id: 'insight-uuid',
      metadata: { delay_seconds: 12 },
    });
    expect(supabaseMock.from).toHaveBeenCalledWith('golf_learned_behavior');
    const payload = insertSpy.mock.calls[0][0];
    expect(payload).toMatchObject({
      entity_type: 'coach',
      entity_id: 'coach-1',
      interaction_type: 'insight_acknowledged',
      target_type: 'insight',
    });
    expect(payload.timestamp).toBeDefined();
    // No object-shape columns
    expect(payload).not.toHaveProperty('interactions');
    expect(payload).not.toHaveProperty('learned_thresholds');
  });

  it('aggregates events on read', async () => {
    const eventRows = [
      { interaction_type: 'insight_acknowledged', target_type: 'insight', target_id: 'a', timestamp: '2026-04-10', metadata: {} },
      { interaction_type: 'insight_dismissed', target_type: 'insight', target_id: 'b', timestamp: '2026-04-15', metadata: {} },
      { interaction_type: 'insight_acknowledged', target_type: 'insight', target_id: 'c', timestamp: '2026-04-20', metadata: {} },
    ];
    const supabaseMock = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: eventRows, error: null }) }) }) }) }),
    };
    const learner = new BehaviorLearner('coach-1', 'coach');
    (learner as unknown as { supabase: unknown }).supabase = supabaseMock;
    const profile = await learner.loadBehavior();
    expect(profile.acknowledgmentRate).toBeCloseTo(2/3);
    expect(profile.totalInteractions).toBe(3);
  });
});
```

- [ ] **Step 2: Run test, confirm fail**

- [ ] **Step 3: Refactor `behavior-learner.ts`**

Replace the entire `loadBehavior`/`saveBehavior` pair with:

```typescript
// File: src/lib/coachhelm/v2/learning/behavior-learner.ts
// Top of file:
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

export interface BehaviorEvent {
  interaction_type: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown>;
}

export interface BehaviorProfile {
  totalInteractions: number;
  acknowledgmentRate: number;
  dismissalRate: number;
  lastInteractionAt: string | null;
  byInsightType: Record<string, { acks: number; dismisses: number }>;
}

export class BehaviorLearner {
  private supabase: SupabaseClient = createAdminClient();
  constructor(private entityId: string, private entityType: 'coach' | 'player') {}

  async recordInteraction(event: BehaviorEvent): Promise<void> {
    const { error } = await this.supabase.from('golf_learned_behavior').insert({
      entity_type: this.entityType,
      entity_id: this.entityId,
      interaction_type: event.interaction_type,
      target_type: event.target_type,
      target_id: event.target_id,
      metadata: event.metadata,
      timestamp: new Date().toISOString(),
    });
    if (error) {
      logServerError('behavior-learner.recordInteraction', error, { entityId: this.entityId });
    }
  }

  async loadBehavior(): Promise<BehaviorProfile> {
    const { data, error } = await this.supabase
      .from('golf_learned_behavior')
      .select('interaction_type, target_type, target_id, timestamp, metadata')
      .eq('entity_type', this.entityType)
      .eq('entity_id', this.entityId)
      .order('timestamp', { ascending: false });
    if (error || !data) {
      logServerError('behavior-learner.loadBehavior', error, { entityId: this.entityId });
      return { totalInteractions: 0, acknowledgmentRate: 0, dismissalRate: 0, lastInteractionAt: null, byInsightType: {} };
    }
    const acks = data.filter((e) => e.interaction_type === 'insight_acknowledged').length;
    const dismisses = data.filter((e) => e.interaction_type === 'insight_dismissed').length;
    const total = data.length;
    return {
      totalInteractions: total,
      acknowledgmentRate: total > 0 ? acks / total : 0,
      dismissalRate: total > 0 ? dismisses / total : 0,
      lastInteractionAt: data[0]?.timestamp ?? null,
      byInsightType: this.groupByInsightType(data),
    };
  }

  private groupByInsightType(events: Array<{ interaction_type: string; metadata: Record<string, unknown> }>) {
    const out: Record<string, { acks: number; dismisses: number }> = {};
    for (const e of events) {
      const key = String(e.metadata?.insight_type ?? 'unknown');
      out[key] ??= { acks: 0, dismisses: 0 };
      if (e.interaction_type === 'insight_acknowledged') out[key].acks++;
      else if (e.interaction_type === 'insight_dismissed') out[key].dismisses++;
    }
    return out;
  }
}
```

- [ ] **Step 4: Update callers**

```bash
grep -rn "learnFromInteraction\|saveBehavior\|loadBehavior" src/ | head -20
```
Update each caller to use `recordInteraction` (event-shaped) instead of the object-mutation pattern. There should be ≤ 5 callers.

- [ ] **Step 5: Run test + typecheck, commit**

```bash
npx vitest --run src/test/coachhelm/v2/learning/behavior-learner.test.ts
npm run typecheck
git add src/lib/coachhelm/v2/learning/behavior-learner.ts src/test/coachhelm/v2/learning/behavior-learner.test.ts
git commit -m "fix(engine): refactor BehaviorLearner to event-log schema matching live DB"
```

---

## Task B3: Fix `golf_coach_behavior_log` insert (LIVE-10)

**Files:**
- Modify: `src/lib/coachhelm/v2/feedback/coach-behavior.ts:155-161`
- Test: `src/test/coachhelm/v2/feedback/coach-behavior.test.ts`

Code inserts `timestamp` field; live column is `created_at` (auto-default). Drop the `timestamp` field; surface insert errors.

- [ ] **Step 1: Write failing test**

```typescript
// src/test/coachhelm/v2/feedback/coach-behavior.test.ts
import { describe, it, expect, vi } from 'vitest';
import { recordCoachAction } from '@/lib/coachhelm/v2/feedback/coach-behavior';

describe('recordCoachAction', () => {
  it('inserts only valid columns and propagates DB errors', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: { message: 'simulated' } });
    const supabaseMock = { from: vi.fn().mockReturnValue({ insert: insertSpy }) };
    await expect(recordCoachAction({ coachId: 'c-1', actionType: 'reviewed', targetId: 'i-1', metadata: {} },
                                    supabaseMock as never)).rejects.toThrow();
    const payload = insertSpy.mock.calls[0][0];
    expect(payload).not.toHaveProperty('timestamp');
    expect(Object.keys(payload).sort()).toEqual(['action_type','coach_id','metadata','target_id']);
  });
});
```

- [ ] **Step 2: Verify fail, then fix `coach-behavior.ts:150-170`**

```typescript
export async function recordCoachAction(
  args: { coachId: string; actionType: string; targetId: string; metadata: Record<string, unknown> },
  supabase: SupabaseClient = createAdminClient(),
): Promise<void> {
  const { error } = await supabase.from('golf_coach_behavior_log').insert({
    coach_id: args.coachId,
    action_type: args.actionType,
    target_id: args.targetId,
    metadata: args.metadata,
  });
  if (error) {
    logServerError('coach-behavior.recordCoachAction', error, { coachId: args.coachId });
    throw error;
  }
}
```

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(engine): recordCoachAction drops bogus timestamp field, surfaces errors"
```

---

## Task B4: Operator-precedence bug — `actionability` (LIVE-14)

**Files:**
- Modify: `src/lib/coachhelm/v2/mining/shot-pattern-miner.ts:682`
- Test: `src/test/coachhelm/v2/mining/shot-pattern-miner.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/test/coachhelm/v2/mining/shot-pattern-miner.test.ts
import { describe, it, expect } from 'vitest';
import { computeActionability } from '@/lib/coachhelm/v2/mining/shot-pattern-miner';

describe('computeActionability', () => {
  it.each([
    [{ frequency: 0.3 }, 0.6],
    [{ frequency: 0.6 }, 0.9],
    [{ frequency: 0.51 }, 0.9],
    [{ frequency: 0.5 }, 0.6],
    [undefined, 0.6],
  ])('%j → %d', (tendency, expected) => {
    expect(computeActionability(tendency ? [tendency] : [])).toBe(expected);
  });
});
```

- [ ] **Step 2: Extract & fix the calculation**

In `shot-pattern-miner.ts`, replace the inline expression at line 682 with a named helper exported at the top of the file:

```typescript
export function computeActionability(tendencies: Array<{ frequency?: number }>): number {
  const freq = tendencies[0]?.frequency ?? 0;
  return freq > 0.5 ? 0.9 : 0.6; // was: tendencies[0]?.frequency ?? 0 > 0.5 ? 0.9 : 0.6 — bound wrong
}
// at line 682:
actionability: computeActionability(pattern.tendencies),
```

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(engine): correct operator precedence in shot-pattern-miner actionability"
```

---

## Task B5: `'l'` collision — long vs left (LIVE-15)

**Files:**
- Modify: `src/lib/coachhelm/v2/mining/lie-specific-analysis.ts:485-495`
- Test: `src/test/coachhelm/v2/mining/lie-specific-analysis.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeMissDirection } from '@/lib/coachhelm/v2/mining/lie-specific-analysis';

describe('normalizeMissDirection', () => {
  it.each([
    ['left','left'], ['Left','left'], ['l','left'],
    ['right','right'], ['r','right'],
    ['long','long'], ['Long','long'], ['lng','long'],
    ['short','short'], ['s','short'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeMissDirection(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Fix**

In `lie-specific-analysis.ts:485-495` replace the function:

```typescript
export function normalizeMissDirection(raw: string | null | undefined): MissDirection | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === 'left' || lower === 'l') return 'left';
  if (lower === 'right' || lower === 'r') return 'right';
  if (lower === 'long' || lower === 'lng') return 'long'; // was: || lower === 'l' (unreachable, also collided with left)
  if (lower === 'short' || lower === 's') return 'short';
  return null;
}
```

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(engine): normalizeMissDirection — 'l' is left only, 'lng' is long"
```

---

## Task B6: `gate.ts` fail-closed (LIVE-17)

**Files:**
- Modify: `src/lib/coachhelm/v2/gate.ts:142-150,228-236`
- Test: `src/test/coachhelm/v2/gate.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';

describe('gate fail-closed behavior', () => {
  it('coach gate returns disabled when coach lookup errors', async () => {
    const supabaseMock = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'transient' } }) }) }) }) };
    const result = await isCoachHelmEnabledForCoach('coach-1', supabaseMock as never);
    expect(result.effectivelyEnabled).toBe(false);
    expect(result.disabledReason).toMatch(/lookup failed/i);
  });
  it('player gate returns disabled when player lookup errors', async () => {
    const supabaseMock = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'transient' } }) }) }) }) };
    const result = await isCoachHelmEnabledForPlayer('player-1', supabaseMock as never);
    expect(result.effectivelyEnabled).toBe(false);
  });
});
```

- [ ] **Step 2: Fix**

In each function, change:

```typescript
if (error) return { effectivelyEnabled: true, disabledReason: null };
```
to:
```typescript
if (error) {
  logServerError('gate.isCoachHelmEnabled', error, { id });
  return { effectivelyEnabled: false, disabledReason: 'lookup failed' };
}
```

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(engine): gate.ts fails closed on DB lookup error"
```

---

## Task B7: Cross-tenant `loadShotStates` (LIVE-18)

**Files:**
- Modify: `src/lib/coachhelm/v2/mining/shot-state-intelligence.ts:373,414-491`
- Test: `src/test/coachhelm/v2/mining/shot-state-intelligence.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { ShotStateIntelligence } from '@/lib/coachhelm/v2/mining/shot-state-intelligence';

describe('ShotStateIntelligence.loadShotStates scope', () => {
  it('filters golf_rounds by player_id, not the entire platform', async () => {
    const eqSpy = vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    const fromSpy = vi.fn().mockReturnValue({ select: () => ({ eq: eqSpy }) });
    const supabaseMock = { from: fromSpy };
    const intel = new ShotStateIntelligence('player-42');
    (intel as unknown as { supabase: unknown }).supabase = supabaseMock;
    await (intel as unknown as { loadShotStates: () => Promise<unknown> }).loadShotStates();
    // Round query MUST include .eq('player_id', 'player-42')
    const playerEqCalls = eqSpy.mock.calls.filter(([col]) => col === 'player_id');
    expect(playerEqCalls.length).toBeGreaterThan(0);
    expect(playerEqCalls[0][1]).toBe('player-42');
  });
});
```

- [ ] **Step 2: Fix**

In `loadShotStates`, change the rounds query to:

```typescript
const { data: rounds, error: roundsError } = await this.supabase
  .from('golf_rounds')
  .select('id, player_id, round_date, total_score')
  .eq('player_id', this.playerId)        // SCOPE — was missing
  .eq('status', 'completed')
  .order('round_date', { ascending: false })
  .limit(50);                            // also cap; was unbounded
if (roundsError) {
  logServerError('shot-state-intelligence.loadShotStates', roundsError, { playerId: this.playerId });
  return [];
}
```

Then the `states.filter(state.playerId === this.playerId)` line at 373 is now redundant — remove it (was only there because of the unscoped query).

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(engine): scope ShotStateIntelligence rounds query to player_id"
```

---

## Task B8: NaN root cause (LIVE-16)

**Files:**
- Modify: `src/lib/coachhelm/v2/mining/pattern-miner.ts:411,480` (computation)
- Modify: `src/lib/coachhelm/v2/nlg/insight-composer.ts:21-30` (remove sanitize hack — keep but as defensive)
- Test: `src/test/coachhelm/v2/mining/pattern-miner.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { computeConvictionSafe } from '@/lib/coachhelm/v2/mining/pattern-miner';

describe('computeConvictionSafe', () => {
  it.each([
    { confidence: 0.5, support: 0.5, expected: 1 },
    { confidence: 1.0, support: 0.5, expected: Infinity }, // upstream divide-by-zero — return null
    { confidence: 1.0, support: 1.0, expected: null },
    { confidence: NaN, support: 0.3, expected: null },
  ])('confidence=%f support=%f → %s', ({ confidence, support, expected }) => {
    const result = computeConvictionSafe(confidence, support);
    if (expected === null) expect(result).toBeNull();
    else if (expected === Infinity) expect(result).toBe(Infinity);
    else expect(result).toBeCloseTo(expected!);
  });
});
```

- [ ] **Step 2: Add helper, replace inline calculations**

In `pattern-miner.ts`:

```typescript
export function computeConvictionSafe(confidence: number, support: number): number | null {
  if (!Number.isFinite(confidence) || !Number.isFinite(support)) return null;
  if (confidence >= 1) return support >= 1 ? null : Infinity;
  return ((1 - support) * confidence) / (1 - confidence);
}
```

Use it everywhere conviction is computed. Cap callers to substitute a sentinel (e.g. `5`) when receiving Infinity.

In `insight-composer.ts:21-30` keep the `sanitizeText` as a defensive belt-and-braces, but add a comment that the root-cause fix is upstream.

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(engine): patch divide-by-zero root cause in pattern conviction calc"
```

---

## Task B9: Hardcoded thresholds → CoachPhilosophy (LIVE-24)

**Files:**
- Modify: `src/lib/coachhelm/v2/orchestrator.ts:481,493,508`
- Test: `src/test/coachhelm/v2/orchestrator-thresholds.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { applyPhilosophyThresholds } from '@/lib/coachhelm/v2/orchestrator';

describe('applyPhilosophyThresholds', () => {
  it('aggressive philosophy lowers alert thresholds', () => {
    const result = applyPhilosophyThresholds(
      { predictedValue: 2.5, strokeImpact: 1.5 } as never,
      { declineThreshold: 1.5, pressureGapThreshold: 1.0 } as never,
    );
    expect(result.shouldAlert).toBe(true);
  });
  it('conservative philosophy raises thresholds', () => {
    const result = applyPhilosophyThresholds(
      { predictedValue: 2.5, strokeImpact: 1.5 } as never,
      { declineThreshold: 4.0, pressureGapThreshold: 3.0 } as never,
    );
    expect(result.shouldAlert).toBe(false);
  });
});
```

- [ ] **Step 2: Extract helper, wire CoachPhilosophy**

In `orchestrator.ts`, add at top of file:

```typescript
import type { CoachPhilosophy } from '@/lib/types';

export function applyPhilosophyThresholds(
  signal: { predictedValue?: number; strokeImpact?: number },
  philosophy: Pick<CoachPhilosophy, 'declineThreshold' | 'pressureGapThreshold'>,
): { shouldAlert: boolean; severity: 'critical' | 'warning' | 'info' } {
  const decline = philosophy.declineThreshold ?? 3;
  const pressure = philosophy.pressureGapThreshold ?? 2;
  const triggersDecline = (signal.predictedValue ?? 0) > decline;
  const triggersPressure = (signal.strokeImpact ?? 0) > pressure;
  const shouldAlert = triggersDecline || triggersPressure;
  const severity = (signal.predictedValue ?? 0) > decline + 2 ? 'critical' : shouldAlert ? 'warning' : 'info';
  return { shouldAlert, severity };
}
```

Replace lines 481, 493, 508 with calls to this helper, sourced from `coachPhilosophy` (load it once at the top of `analyzePlayer`).

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(engine): orchestrator honors CoachPhilosophy decline/pressure thresholds"
```

---

## Task B10: Race condition in BehaviorLearner already covered by B2 refactor

The event-log model in B2 eliminates the load→mutate→save race. No additional task needed; mark complete as part of B2.

- [ ] Confirm: in the new `recordInteraction`, two concurrent inserts produce two rows (no race), not one merged write. Add a 2nd test in B2's test file:

```typescript
it('two concurrent recordInteraction calls produce two rows', async () => {
  const insertSpy = vi.fn().mockResolvedValue({ error: null });
  const supabaseMock = { from: () => ({ insert: insertSpy }) };
  const learner = new BehaviorLearner('coach-1', 'coach');
  (learner as unknown as { supabase: unknown }).supabase = supabaseMock;
  await Promise.all([
    learner.recordInteraction({ interaction_type: 'a', target_type: 'i', target_id: '1', metadata: {} }),
    learner.recordInteraction({ interaction_type: 'b', target_type: 'i', target_id: '2', metadata: {} }),
  ]);
  expect(insertSpy).toHaveBeenCalledTimes(2);
});
```

---

## Task B11: Dead code — remove `TeamForecaster`

**Files:**
- Delete: `src/lib/coachhelm/v2/prediction/team-forecaster.ts`
- Modify: `src/lib/coachhelm/v2/prediction/index.ts` (no-op since it wasn't exported)

- [ ] **Step 1: Confirm no callers**

```bash
grep -rn "team-forecaster\|TeamForecaster" src/ --include="*.ts" --include="*.tsx"
```
Expected: only the file itself.

- [ ] **Step 2: Delete file, confirm typecheck still passes**

```bash
rm src/lib/coachhelm/v2/prediction/team-forecaster.ts
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "chore(engine): remove unused TeamForecaster (~23KB dead code)"
```

---

## Task B12: Wire baselines into `StatsInsightGenerator` (engine-internal)

**Files:**
- Modify: `src/lib/coachhelm/v2/mining/stats-insight-generator.ts:19-69`
- Modify: `src/lib/coachhelm/v2/orchestrator.ts:140` (pass baseline)
- Test: `src/test/coachhelm/v2/mining/stats-insight-generator.test.ts`

The orchestrator computes per-player baselines via `stats/baselines.ts` but passes nothing to `StatsInsightGenerator`. Pass it.

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { StatsInsightGenerator } from '@/lib/coachhelm/v2/mining/stats-insight-generator';

describe('StatsInsightGenerator', () => {
  it('uses player baseline when provided instead of static D2 average', () => {
    const stats = { driving_accuracy: 0.6 };
    const baseline = { driving_accuracy: { ewma: 0.55 } };
    const gen = new StatsInsightGenerator(baseline as never);
    const insights = gen.generateInsights(stats as never);
    // 0.6 vs baseline 0.55 → "above your average", not "below D2 avg"
    expect(insights[0]?.body).toMatch(/above your.*average/i);
  });
});
```

- [ ] **Step 2: Refactor `StatsInsightGenerator`** to accept baseline in constructor and prefer it over `BENCHMARKS`. Pass through orchestrator.

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(engine): StatsInsightGenerator prefers per-player baseline over static benchmarks"
```

---

## Task B13: Patterns include lifecycle metadata (engine-side)

**Files:**
- Modify: `src/lib/coachhelm/v2/mining/pattern-miner.ts:614-640`

- [ ] **Step 1: Update upsert payload**

```typescript
const { error } = await this.supabase.from('golf_patterns_v2').upsert(
  patterns.map((p) => ({
    // ... existing fields ...
    severity: p.severity ?? 'medium',
    lifecycle_state: 'detected',
    source_round_ids: p.sourceRoundIds ?? [],
    // ...
  })),
  { onConflict: 'player_id,pattern_type,signature' },
);
```

- [ ] **Step 2: Verify typecheck (column types must match Team A's regen). Commit.**

```bash
git commit -m "fix(engine): pattern-miner persists severity, lifecycle_state, source_round_ids"
```

---

## Task B14: Save partial successes — pattern-miner

**Files:**
- Modify: `src/lib/coachhelm/v2/mining/pattern-miner.ts:614-645`

- [ ] **Step 1: Replace single bulk upsert with `Promise.allSettled` per-pattern OR a single bulk `upsert` (already bulk; just don't throw on first error). Failed inserts go to logServerError; do not abort.**

```typescript
const results = await Promise.allSettled(
  patterns.map((p) => this.supabase.from('golf_patterns_v2').upsert(toRow(p), { onConflict: 'player_id,pattern_type,signature' })),
);
for (const r of results) {
  if (r.status === 'rejected') logServerError('pattern-miner.savePatterns', r.reason, {});
  else if (r.value.error) logServerError('pattern-miner.savePatterns', r.value.error, {});
}
```

- [ ] **Step 2: Test, commit.**

```bash
git commit -m "fix(engine): pattern-miner persists what it can, logs the rest (no abort on first error)"
```

---

## Task B15: `shot-level-sg` — distance-after correctness

**Files:**
- Modify: `src/lib/coachhelm/v2/shot-analysis/shot-level-sg.ts:131-135`
- Test: `src/test/coachhelm/v2/shot-analysis/shot-level-sg.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateShotSG } from '@/lib/coachhelm/v2/shot-analysis/shot-level-sg';

describe('calculateShotSG holed detection', () => {
  it('null distanceAfter does NOT count as holed', () => {
    const result = calculateShotSG({ distanceBefore: 150, distanceAfter: null, lieAfter: 'green', result: 'on_green' });
    expect(result.isHoled).toBe(false);
  });
  it('result=hole counts as holed regardless of distance', () => {
    const result = calculateShotSG({ distanceBefore: 5, distanceAfter: 0, lieAfter: 'hole', result: 'hole' });
    expect(result.isHoled).toBe(true);
  });
});
```

- [ ] **Step 2: Fix**

```typescript
const isHoled = result === 'hole' || lieAfter === 'hole';
```

- [ ] **Step 3: Test, commit.**

```bash
git commit -m "fix(engine): shot-level-sg detects holed via result/lie, not distance==0"
```

---

## Task B16: Final regression sweep + commit

- [ ] **Step 1:** Run the full coachhelm test directory:

```bash
npx vitest --run src/test/coachhelm/
```
Expected: all green.

- [ ] **Step 2:** Run typecheck.

```bash
npm run typecheck
```

- [ ] **Step 3:** Open PR, request Team C review (since C consumes engine output).

---

## Done check

- [ ] All 14 task suites green in `src/test/coachhelm/`
- [ ] No `(supabase as any)` introduced
- [ ] No `console.error` for handled errors
- [ ] PR merged
- [ ] Smoke test: pick a real player from `qmnssrrolpinvwjjnufo`, call `coachHelmIntelligence.analyzePlayer(playerId)` from a server-action shell, confirm no errors and insights are persisted

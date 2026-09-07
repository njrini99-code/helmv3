# Team C — Coach Screens & Action-Layer Schema Drift Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. See `00-orchestration.md` for team boundaries. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fix every action-layer query that references columns the live DB doesn't have. Add a single shared `verifyTeamAccess` / `verifyPlayerAccess` helper that handles multi-team coaches correctly. Stop coach screens from silently falling back to mock data on real errors. Fix the missing ownership checks on pattern-mutation actions.

**Architecture:** Server-action layer changes only. Each action file gets typed (no `as any` casts). Each touch is paired with a Vitest action test that mocks the supabase client and asserts the SQL shape. Pages get minor edits where the bug is in the page (refresh, focus areas link, etc.).

**Tech Stack:** Next.js 16 server actions, Supabase typed client, Vitest, React Testing Library for the page tweaks.

**Owns (file ownership):**
- `src/lib/auth/verify-player-access.ts` (NEW — replaces 4 duplicate helpers)
- `src/app/golf/actions/insight-management.ts`
- `src/app/golf/actions/intelligence-dashboard.ts`
- `src/app/golf/actions/coachhelm-analytics.ts`
- `src/app/golf/actions/pattern-management.ts`
- `src/app/golf/actions/development.ts`
- `src/app/golf/actions/alerts.ts` (only the broken bits — heavy `generateAlerts` is Team E's queue work)
- `src/app/golf/actions/insights.ts` (only `verifyPlayerAccess` removal — call C's helper)
- `src/app/golf/(dashboard)/dashboard/insights/InsightsPageContent.tsx` (search bug)
- `src/app/golf/(dashboard)/dashboard/patterns/PatternsDashboardClient.tsx` (useState snapshot bug)
- `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx` (3× duplicate team lookup)
- `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx` (Focus Areas link only — D owns the rest)
- `src/test/golf/actions/**` (NEW directory)

**Depends on:** Team A migrations + types regen.

**Coordination:** With Team D on `PlayerCoachHelmDashboard.tsx` — D owns feedback wiring; C only touches the Focus Areas link. Use Edit (not Write) and confine to lines around the link.

---

## Pre-flight

- [ ] **Step P1:** Verify Team A is done (`git log --oneline | grep -E "regenerate Supabase types|canonical_coachhelm"`).

- [ ] **Step P2:** Pull current typecheck baseline:

```bash
cat docs/superpowers/plans/2026-04-21-coachhelm-fix/typecheck-baseline.txt | head -100
```
Expect to see errors in: `insight-management.ts`, `intelligence-dashboard.ts`, `pattern-management.ts`, `development.ts`, `coachhelm-analytics.ts`, `players/[playerId]/page.tsx`. These are the schema-drift symptoms.

- [ ] **Step P3:** Live-DB sanity — confirm columns exist as expected:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='golf_coach_insights'
ORDER BY column_name;
```
Confirm: `content` (not `description`), `metadata` (recommendation lives in metadata jsonb), `dismissed`, `dismissed_at`, `status`.

---

## Task C1: Create `verifyPlayerAccess` shared helper (LIVE-25)

**Files:**
- Create: `src/lib/auth/verify-player-access.ts`
- Test: `src/test/lib/auth/verify-player-access.test.ts`

Replaces the 4 duplicates in `insights.ts`, `shot-analytics.ts`, `round-reviews.ts`, `round-review-system.ts` — all of which used `.limit(1).maybeSingle()` on the org's first team.

- [ ] **Step 1: Write failing test**

```typescript
// src/test/lib/auth/verify-player-access.test.ts
import { describe, it, expect, vi } from 'vitest';
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';

describe('verifyPlayerAccess', () => {
  it('grants when player belongs to ANY team the coach staffs', async () => {
    const supabaseMock = {
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    };
    const result = await verifyPlayerAccess('player-1', 'user-1', supabaseMock as never);
    expect(result.allowed).toBe(true);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('verify_coach_owns_player', { p_player_id: 'player-1', p_user_id: 'user-1' });
  });
  it('grants for the player themselves', async () => {
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'player-1' }, error: null }) }) }) }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    const result = await verifyPlayerAccess('player-1', 'user-1', supabaseMock as never);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('self');
  });
  it('denies when neither check passes', async () => {
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    };
    const result = await verifyPlayerAccess('player-1', 'user-1', supabaseMock as never);
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Add the SQL helper via a tiny migration** (Team A is done, so this is Team C's own micro-migration)

```sql
-- supabase/migrations/20260421010000_verify_coach_owns_player.sql
CREATE OR REPLACE FUNCTION public.verify_coach_owns_player(p_player_id UUID, p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.golf_team_members gtm
    JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtm.player_id = p_player_id
      AND gtm.status = 'active'::team_member_status
      AND gc.user_id = p_user_id
  );
END $$;
GRANT EXECUTE ON FUNCTION public.verify_coach_owns_player(UUID, UUID) TO authenticated;
```

Apply via `mcp__plugin_supabase_supabase__apply_migration`.

- [ ] **Step 3: Write `verify-player-access.ts`**

```typescript
// src/lib/auth/verify-player-access.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

export interface VerifyResult {
  allowed: boolean;
  reason?: 'self' | 'coach' | 'denied';
}

export async function verifyPlayerAccess(
  playerId: string,
  userId: string,
  supabase?: SupabaseClient,
): Promise<VerifyResult> {
  const sb = supabase ?? (await createClient());
  // Self check first (cheaper)
  const { data: ownPlayer, error: selfError } = await sb
    .from('golf_players').select('id').eq('id', playerId).eq('user_id', userId).maybeSingle();
  if (selfError) {
    logServerError('verifyPlayerAccess.self', selfError, { playerId, userId });
    return { allowed: false, reason: 'denied' };
  }
  if (ownPlayer) return { allowed: true, reason: 'self' };
  // Coach check via RPC (handles multi-team-per-org correctly)
  const { data: isCoach, error: coachError } = await sb.rpc('verify_coach_owns_player', {
    p_player_id: playerId, p_user_id: userId,
  });
  if (coachError) {
    logServerError('verifyPlayerAccess.coach', coachError, { playerId, userId });
    return { allowed: false, reason: 'denied' };
  }
  return { allowed: !!isCoach, reason: isCoach ? 'coach' : 'denied' };
}
```

- [ ] **Step 4: Test, typecheck**

```bash
npx vitest --run src/test/lib/auth/verify-player-access.test.ts
npm run typecheck
```

- [ ] **Step 5: Replace 4 callers**

```bash
grep -rn "function verifyPlayerAccess\|function verifyReviewAccess" src/app/golf/actions/
```
Expected files: `insights.ts`, `shot-analytics.ts`, `round-reviews.ts`, `round-review-system.ts`.

In each, replace the local helper with:

```typescript
import { verifyPlayerAccess } from '@/lib/auth/verify-player-access';
// ...
const access = await verifyPlayerAccess(playerId, user.id);
if (!access.allowed) throw new Error('Forbidden');
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260421010000_verify_coach_owns_player.sql \
        src/lib/auth/verify-player-access.ts \
        src/test/lib/auth/verify-player-access.test.ts \
        src/app/golf/actions/insights.ts \
        src/app/golf/actions/shot-analytics.ts \
        src/app/golf/actions/round-reviews.ts \
        src/app/golf/actions/round-review-system.ts
git commit -m "refactor(auth): single verifyPlayerAccess helper, multi-team-safe via RPC"
```

---

## Task C2: Fix `searchInsights` (LIVE-8 — `description`→`content`)

**Files:**
- Modify: `src/app/golf/actions/insight-management.ts:101-103,140-160`
- Test: `src/test/golf/actions/insight-management.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// src/test/golf/actions/insight-management.test.ts
import { describe, it, expect, vi } from 'vitest';
import { searchInsights } from '@/app/golf/actions/insight-management';

describe('searchInsights', () => {
  it('searches title.ilike and content.ilike (NOT description)', async () => {
    const orSpy = vi.fn().mockReturnThis();
    const eqSpy = vi.fn().mockReturnThis();
    const orderSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: () => ({ select: () => ({ or: orSpy, eq: eqSpy, order: orderSpy }) }),
    };
    await searchInsights({ query: 'putting', coachId: 'coach-1' }, supabaseMock as never);
    const orFilter = orSpy.mock.calls[0][0] as string;
    expect(orFilter).toContain('content.ilike');
    expect(orFilter).not.toContain('description.ilike');
  });
});
```

- [ ] **Step 2: Fix the OR filter** in `searchInsights`:

```typescript
.or(`title.ilike.%${q}%,content.ilike.%${q}%`)
```

- [ ] **Step 3: Test, typecheck, commit**

```bash
git commit -m "fix(coach-actions): searchInsights queries content (not nonexistent description)"
```

---

## Task C3: Fix `exportInsights` (LIVE-8 cont.)

**Files:**
- Modify: `src/app/golf/actions/insight-management.ts:447-463,526-547`

- [ ] **Step 1: Pin selected columns** to ones that exist:

```typescript
.select('id, title, content, status, priority, dismissed, dismissed_at, outcome_status, metadata, created_at, player_id')
```

- [ ] **Step 2: Derive `recommendation` in JS from `metadata.recommendation` for the export rows:**

```typescript
recommendation: (row.metadata as Record<string, unknown> | null)?.recommendation ?? null,
```

- [ ] **Step 3: Add a test that the exported CSV/JSON has `recommendation` column populated when metadata has it.**

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(coach-actions): exportInsights selects only existing columns; derives recommendation from metadata"
```

---

## Task C4: Fix `bulkDismissInsights` to set `dismissed=true` (LIVE-8 cont.)

**Files:**
- Modify: `src/app/golf/actions/insight-management.ts:271`

- [ ] **Step 1: Failing test**

```typescript
it('bulkDismissInsights writes dismissed=true and dismissed_at', async () => {
  const updateSpy = vi.fn().mockResolvedValue({ error: null });
  const supabaseMock = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ update: updateSpy, in: () => ({ select: () => ({ data: [], error: null }) }) }),
  };
  // call bulkDismissInsights ...
  const payload = updateSpy.mock.calls[0][0];
  expect(payload.status).toBe('dismissed');
  expect(payload.dismissed).toBe(true);
  expect(payload.dismissed_at).toBeDefined();
});
```

- [ ] **Step 2: Fix the update payload**

```typescript
.update({
  status: 'dismissed',
  dismissed: true,
  dismissed_at: new Date().toISOString(),
})
```

- [ ] **Step 3: Add `revalidatePath` for `/golf/dashboard/alerts`, `/intelligence`, `/insights`.** Test, commit.

```bash
git commit -m "fix(coach-actions): bulkDismissInsights sets dismissed=true so alerts/intel filter works"
```

---

## Task C5: Fix `intelligence-dashboard.ts` golf_players.team_id and patterns_v2.team_id/pattern_name (LIVE-8 cont.)

**Files:**
- Modify: `src/app/golf/actions/intelligence-dashboard.ts:362-368,478-481`
- Test: `src/test/golf/actions/intelligence-dashboard.test.ts`

- [ ] **Step 1: Replace `golf_players.team_id` query** with `golf_team_members` join:

```typescript
const { data: teamPlayers } = await supabase
  .from('golf_team_members')
  .select('player_id, golf_players!inner(id, first_name, last_name)')
  .eq('team_id', teamId)
  .eq('status', 'active');
```

- [ ] **Step 2: Replace `golf_patterns_v2.team_id` and `pattern_name` query** with player_id-scoped query that derives team via `golf_team_members`:

```typescript
const playerIds = teamPlayers?.map((p) => p.player_id) ?? [];
const { data: patterns } = await supabase
  .from('golf_patterns_v2')
  .select('id, player_id, pattern_type, metadata, confidence, support, stroke_impact')
  .in('player_id', playerIds);
// description lives in metadata.description per the live schema
```

- [ ] **Step 3: Update the page-side render** to read `pattern.metadata.description` and `pattern.pattern_type` instead of `pattern_name`/`description`.

- [ ] **Step 4: Tests for both queries — assert they no longer reference `team_id` on either table.**

- [ ] **Step 5: Commit**

```bash
git commit -m "fix(coach-actions): intelligence-dashboard uses golf_team_members for team scope"
```

---

## Task C6: `coachhelm-analytics.ts` — stop silent fallback to mock data (LIVE-8 cont.)

**Files:**
- Modify: `src/app/golf/actions/coachhelm-analytics.ts:155-171,167-171,436-451,629-637`

- [ ] **Step 1: Failing test**

```typescript
it('returns error result (not mock data) when query fails', async () => {
  const supabaseMock = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: 'simulated' } }) }) }),
  };
  const result = await getInsightEffectiveness('team-1', supabaseMock as never);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/simulated/);
  // Must NOT silently return zeroed mock
});
```

- [ ] **Step 2: Refactor each fallback block:**

```typescript
if (error) {
  logServerError('coachhelm-analytics.getInsightEffectiveness', error, { teamId });
  return { success: false, error: error.message };
}
return { success: true, data };
```

Drop `generateMockInsightEffectiveness` calls from the live path. Keep the mock generator for use in Storybook/tests only — move to `src/test/fixtures/coachhelm-analytics-mock.ts`.

- [ ] **Step 3: Standardize on one column** — replace all `strokes_impact` with `stroke_impact` (the canonical column; Team A's docs confirm). Use `COALESCE(stroke_impact, strokes_impact)` ONLY if both columns are populated in prod (run a sanity SQL):

```sql
SELECT count(*) FILTER (WHERE stroke_impact IS NOT NULL) AS with_singular,
       count(*) FILTER (WHERE strokes_impact IS NOT NULL) AS with_plural,
       count(*) FILTER (WHERE stroke_impact IS NOT NULL AND strokes_impact IS NOT NULL) AS both
FROM golf_patterns_v2;
```
If `with_plural=0`, drop `strokes_impact` entirely (and Team A drops the column in a later migration). Otherwise keep COALESCE.

- [ ] **Step 4: Add `verifyTeamAccess` helper call** to every action that takes `teamId`:

```typescript
const access = await verifyTeamAccess(teamId, user.id, supabase);
if (!access.allowed) return { success: false, error: 'Forbidden' };
```

(Add `verifyTeamAccess` to `src/lib/auth/verify-player-access.ts` — same pattern as `verifyPlayerAccess` but team-scoped.)

- [ ] **Step 5: Test, commit**

```bash
git commit -m "fix(coach-actions): coachhelm-analytics surfaces errors instead of silent mock fallback"
```

---

## Task C7: Fix `pattern-management.ts` ownership checks (LIVE-25)

**Files:**
- Modify: `src/app/golf/actions/pattern-management.ts:335-406,425,470,519`

The 5 mutation functions (`validatePattern`, `dismissPattern`, `markPatternAddressed`, `resolvePattern`, `updatePatternNotes`, `createFocusAreaFromPattern`) currently update by pattern_id without verifying the coach owns the player.

- [ ] **Step 1: Failing test**

```typescript
it('validatePattern rejects when coach does not own the pattern player', async () => {
  // Mock: pattern.player_id = 'p-stranger', coach has different team
  const result = await validatePattern('pattern-1', supabaseMock);
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/forbidden/i);
});
```

- [ ] **Step 2: Add a `verifyPatternAccess` helper** at the top of the file:

```typescript
async function verifyPatternAccess(patternId: string, userId: string, supabase: SupabaseClient): Promise<boolean> {
  const { data: pattern } = await supabase.from('golf_patterns_v2').select('player_id').eq('id', patternId).maybeSingle();
  if (!pattern) return false;
  const access = await verifyPlayerAccess(pattern.player_id, userId, supabase);
  return access.allowed;
}
```

Call it at the start of each of the 5 mutation functions. On false, return `{ success: false, error: 'Forbidden' }`.

- [ ] **Step 3: Fix the `createFocusAreaFromPatternInternal` schema-drift columns at line 601-613.**

```typescript
.insert({
  player_id: pattern.player_id,
  area_type: deriveAreaType(pattern.pattern_type),
  from_insight_id: null,
  // 'source', 'source_id', 'target_improvement' don't exist — drop them
  metadata: { source_pattern_id: patternId, target: pattern.metadata?.target_improvement },
})
```

- [ ] **Step 4: Test, commit**

```bash
git commit -m "fix(coach-actions): pattern mutations verify coach owns the player; fix focus-area columns"
```

---

## Task C8: Fix `development.ts` `from_insight_id` (LIVE-8 cont.)

**Files:**
- Modify: `src/app/golf/actions/development.ts:418,467`

- [ ] **Step 1: Failing test** for `createFocusAreaFromInsight`:

```typescript
it('createFocusAreaFromInsight uses from_insight_id (not source_insight_id)', async () => {
  const insertSpy = vi.fn().mockResolvedValue({ error: null, data: [{ id: 'fa-1' }] });
  // ... call ...
  const payload = insertSpy.mock.calls[0][0];
  expect(payload).toHaveProperty('from_insight_id');
  expect(payload).not.toHaveProperty('source_insight_id');
});
```

- [ ] **Step 2: Rename the insert/select column. Add ownership check via `verifyPlayerAccess`. Add `revalidatePath('/golf/dashboard/development')` AND `'/my-development'`.**

- [ ] **Step 3: Also fix `updateFocusAreaProgress` at line 237-262 to add `verifyPlayerAccess` ownership check.**

- [ ] **Step 4: Test, commit**

```bash
git commit -m "fix(coach-actions): development.ts uses from_insight_id; adds ownership checks"
```

---

## Task C9: Fix the players/[playerId] page schema drift (LIVE-8 cont.)

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/players/[playerId]/page.tsx:184`
- Modify: `src/app/golf/(dashboard)/dashboard/players/[playerId]/player-insight-client.tsx:86,664`

- [ ] **Step 1: Replace prediction column references**

```typescript
.select('id, metric, predicted_value, confidence, trend, due_date, prediction_context, related_round_id, created_at')
```

Drop references to `prediction_type`, `title`, `timeframe`, `predicted_score`, `prediction_date`. Where the UI needs a "title", derive from `metric` (e.g., `formatMetricLabel(metric)`).

- [ ] **Step 2: Test by running the page** in dev mode against a real player ID:

```bash
npm run dev
# visit /golf/dashboard/players/<real-player-id>
```
Confirm no console errors, predictions render with metric labels.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(coach-screens): players/[id] page uses live golf_predictions columns"
```

---

## Task C10: Fix `PatternsDashboardClient` snapshot bug

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/patterns/PatternsDashboardClient.tsx:42-49`

- [ ] **Step 1: Replace `useState(initialPatterns)` with synced state**

```typescript
const [patterns, setPatterns] = useState(initialPatterns);
useEffect(() => { setPatterns(initialPatterns); }, [initialPatterns]);
```

- [ ] **Step 2: Add a Vitest+RTL test** that asserts changing the prop updates the rendered list.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(patterns-page): client state syncs to refreshed server props"
```

---

## Task C11: Fix `intelligence/page.tsx` 3× duplicate team lookup

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx:38-49`

- [ ] **Step 1: Hoist team lookup**

```typescript
const teamLookup = await getCoachTeamId(user.id); // single source of truth
const teamId = teamLookup.teamId;
const [overview, categoryInsights] = await Promise.all([
  getTeamOverview(teamId),
  getTeamCategoryInsights(teamId), // refactor signature to accept teamId
]);
```

- [ ] **Step 2: Refactor `getTeamCategoryInsights` and `getTeamOverview` signatures** to accept `teamId` instead of looking it up themselves. Use `verifyTeamAccess(teamId, user.id)` instead of re-deriving.

- [ ] **Step 3: Confirm via Network tab in dev that the same SQL query no longer fires 3×.**

- [ ] **Step 4: Commit**

```bash
git commit -m "perf(intelligence-page): hoist team lookup to fire once instead of 3x"
```

---

## Task C12: Fix `Suspense` dead code on intelligence page

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx:99-105`

- [ ] **Step 1: Remove the unnecessary `<Suspense>`** wrapping `<IntelligenceCommandCenter>` (it's a client component; nothing async to suspend).

```typescript
// Before:
<Suspense fallback={<PageLoading />}>
  <IntelligenceCommandCenter ... />
</Suspense>
// After:
<IntelligenceCommandCenter ... />
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor(intelligence-page): drop dead Suspense around client component"
```

---

## Task C13: Settings — debounce + server action wrapper

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx`
- Create: `src/app/golf/actions/coaching-philosophy.ts`
- Test: `src/test/golf/actions/coaching-philosophy.test.ts`

- [ ] **Step 1: Move write logic into a server action**

```typescript
// src/app/golf/actions/coaching-philosophy.ts
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function saveCoachingPhilosophy(coachId: string, patch: Record<string, unknown>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  // verify coach ownership
  const { data: coach } = await supabase.from('golf_coaches').select('id').eq('id', coachId).eq('user_id', user.id).maybeSingle();
  if (!coach) throw new Error('Forbidden');
  const { error } = await supabase.from('golf_coach_philosophy').upsert({ coach_id: coachId, ...patch });
  if (error) throw error;
  revalidatePath('/golf/dashboard/settings/coaching-intelligence');
  revalidatePath('/golf/dashboard/insights');
  revalidatePath('/golf/dashboard/alerts');
  return { success: true };
}
```

- [ ] **Step 2: In the page, debounce slider/toggle changes**

```typescript
import { useDebouncedCallback } from 'use-debounce';
const debouncedSave = useDebouncedCallback((patch) => saveCoachingPhilosophy(coachId, patch), 600);
```

- [ ] **Step 3: Convert page to server component** for initial render (load coachId server-side; pass to client form):

```typescript
// page.tsx — server component
export default async function Page() {
  const profile = await getCoachProfile();
  if (!profile) return notFound();
  return <CoachingIntelligenceForm initialPhilosophy={profile.philosophy} coachId={profile.coachId} />;
}
```

- [ ] **Step 4: Hide the "Saved" indicator until first save fires.**

- [ ] **Step 5: Test, commit**

```bash
git commit -m "fix(settings): coaching philosophy uses server action + debounce + server-rendered shell"
```

---

## Task C14: Fix Focus Areas link mismatch (LIVE / player audit I2)

**Files:**
- Modify: `src/components/golf/coachhelm/player/FocusAreasGrid.tsx:190`

The card shows AI-derived focus areas (from analysis); the link goes to `/my-development` which only shows coach-assigned ones.

- [ ] **Step 1: Two options — pick one with the user.** Default: change the link to `/golf/dashboard/coachhelm#focus-areas` (anchor on same page) OR add a "Discuss with coach" CTA that opens a message draft. Pick anchor-on-same-page for simplicity:

```typescript
<Link href="/golf/dashboard/coachhelm#focus-areas">View all</Link>
```

- [ ] **Step 2:** Add `id="focus-areas"` to the focus areas section in `PlayerCoachHelmDashboard.tsx`.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(player-screens): Focus Areas card links to its own anchor, not unrelated /my-development"
```

---

## Task C15: Alerts page — fix `useEffect` race condition

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/alerts/page.tsx:32-74`

- [ ] **Step 1: Add deps + guard**

```typescript
useEffect(() => {
  if (!coachId || !teamId) return; // wait for context
  fetchAlerts();
}, [coachId, teamId, showAcknowledged]);
```

Remove the `eslint-disable` line.

- [ ] **Step 2: Replace the silent redirect on null `coachId`** with a "Setting up..." skeleton until context resolves.

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(alerts-page): waits for coachId/teamId from context before fetching"
```

---

## Task C16: `useState` dispatch + final regression

- [ ] **Step 1: Run all action tests**

```bash
npx vitest --run src/test/golf/actions/ src/test/lib/auth/
```

- [ ] **Step 2: Typecheck the entire repo**

```bash
npm run typecheck
```
Expect zero errors in any of Team C's owned files.

- [ ] **Step 3: Open PR, request review from Team B (engine consumer side).**

---

## Done check

- [ ] `verifyPlayerAccess` is the single source of truth (no remaining duplicates in 4 files)
- [ ] No action file references `description`, `recommendation`, `source_insight_id`, `prediction_type`, `title`, `timeframe`, `golf_players.team_id`, `golf_patterns_v2.team_id`, or `pattern_name`
- [ ] `coachhelm-analytics.ts` returns `{ success: false }` on errors instead of silent mock data
- [ ] All 5 pattern-mutation actions verify ownership
- [ ] No `(supabase as any)` introduced
- [ ] `bulkDismissInsights` writes `dismissed=true` and `dismissed_at`
- [ ] PR merged

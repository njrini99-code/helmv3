# Team D — Player Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. See `00-orchestration.md` for team boundaries. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wire the missing player → engine feedback path. Players can mark insights helpful/not helpful/dismissed; the action persists to `golf_insight_player_feedback`, calls `BehaviorLearner.recordInteraction`, and revalidates the right paths. Round review acknowledgement chain becomes operational.

**Architecture:** New server action `rateInsightAsPlayer` writes to a new dedicated table (created by Team A). Existing `AIInsightsPanel` already supports `onAcknowledge`/`onDismiss` callbacks — just needs them passed in. Round review page calls `markReviewAsViewed` on mount. Fix the broken `revalidatePath` targets in `round-reviews.ts`.

**Tech Stack:** Next.js 16 server actions, React (Suspense, transitions), Vitest + React Testing Library, Supabase typed client.

**Owns (file ownership):**
- `src/app/golf/actions/player-feedback.ts` (NEW)
- `src/app/golf/actions/round-reviews.ts` — **only** `revalidatePath` lines and the `markReviewAsViewed` / `addPlayerFeedback` revalidate strings (no other changes)
- `src/components/golf/coachhelm/player/AIInsightsPanel.tsx` — wire `onAcknowledge`/`onDismiss`
- `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx` — pass callbacks (Team C touches this for the link only; D owns the rest)
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` — call markAsViewed
- `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerFeedbackToast.tsx` (NEW)
- `src/test/golf/actions/player-feedback.test.ts` (NEW)
- `src/test/golf/components/AIInsightsPanel.test.tsx` (NEW)

**Depends on:** Team A migration creating `golf_insight_player_feedback`.

**Coordination:** With Team C on `PlayerCoachHelmDashboard.tsx` (C touches the Focus Areas link line; D touches everything else around feedback wiring). Use Edit, not Write. With Team B on `recordInteraction` signature.

---

## Pre-flight

- [ ] **Step P1:** Confirm Team A migration applied — table exists:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='golf_insight_player_feedback'
ORDER BY column_name;
```
Expected: `created_at, id, insight_id, note, player_id, rating`.

- [ ] **Step P2:** Confirm `revalidatePath` bug still reproduces — grep:

```bash
grep -n "revalidatePath.*golf/reviews" src/app/golf/actions/round-reviews.ts
```
Expected: 3 hits (lines 787, 865, 1238 per the audit).

- [ ] **Step P3:** Confirm `AIInsightsPanel` only renders the buttons when `onAcknowledge`/`onDismiss` provided:

```bash
grep -n "onAcknowledge\|onDismiss" src/components/golf/coachhelm/player/AIInsightsPanel.tsx
```
Expected: conditional rendering at lines ~215-241.

---

## Task D1: Create `rateInsightAsPlayer` action

**Files:**
- Create: `src/app/golf/actions/player-feedback.ts`
- Test: `src/test/golf/actions/player-feedback.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/test/golf/actions/player-feedback.test.ts
import { describe, it, expect, vi } from 'vitest';
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';

describe('rateInsightAsPlayer', () => {
  it('rejects unauthenticated users', async () => {
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: null } }) },
    };
    await expect(rateInsightAsPlayer({ insightId: 'i1', rating: 'helpful' }, supabaseMock as never))
      .rejects.toThrow(/unauthorized/i);
  });

  it('rejects when player record does not match auth user', async () => {
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    };
    await expect(rateInsightAsPlayer({ insightId: 'i1', rating: 'helpful' }, supabaseMock as never))
      .rejects.toThrow(/player not found/i);
  });

  it('verifies the insight belongs to the authed player', async () => {
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'golf_players') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1' }, error: null }) }) }) };
        if (table === 'golf_coach_insights') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { player_id: 'p-stranger' }, error: null }) }) }) };
        return {};
      }),
    };
    await expect(rateInsightAsPlayer({ insightId: 'i1', rating: 'helpful' }, supabaseMock as never))
      .rejects.toThrow(/forbidden/i);
  });

  it('upserts feedback row and calls BehaviorLearner', async () => {
    const upsertSpy = vi.fn().mockResolvedValue({ error: null });
    const recordSpy = vi.fn().mockResolvedValue(undefined);
    const supabaseMock = {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'golf_players') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1' }, error: null }) }) }) };
        if (table === 'golf_coach_insights') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { player_id: 'p1', metadata: { insight_type: 'driving' } }, error: null }) }) }) };
        if (table === 'golf_insight_player_feedback') return { upsert: upsertSpy };
        return {};
      }),
    };
    const result = await rateInsightAsPlayer(
      { insightId: 'i1', rating: 'helpful', note: 'thanks coach' },
      supabaseMock as never,
      { recordInteraction: recordSpy } as never,
    );
    expect(result).toEqual({ success: true });
    expect(upsertSpy.mock.calls[0][0]).toMatchObject({ insight_id: 'i1', player_id: 'p1', rating: 'helpful', note: 'thanks coach' });
    expect(recordSpy).toHaveBeenCalledWith({
      interaction_type: 'insight_rated_helpful',
      target_type: 'insight',
      target_id: 'i1',
      metadata: expect.objectContaining({ insight_type: 'driving' }),
    });
  });
});
```

- [ ] **Step 2: Run test → confirm fail (file doesn't exist)**

- [ ] **Step 3: Implement the action**

```typescript
// src/app/golf/actions/player-feedback.ts
'use server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { BehaviorLearner } from '@/lib/coachhelm/v2/learning/behavior-learner';
import { logServerError } from '@/lib/server-error-logger';

const ratingSchema = z.object({
  insightId: z.string().uuid(),
  rating: z.enum(['helpful', 'not_helpful', 'dismissed', 'acknowledged']),
  note: z.string().max(500).optional(),
});

type RatingInput = z.infer<typeof ratingSchema>;

const ratingToInteraction: Record<RatingInput['rating'], string> = {
  helpful: 'insight_rated_helpful',
  not_helpful: 'insight_rated_not_helpful',
  dismissed: 'insight_dismissed',
  acknowledged: 'insight_acknowledged',
};

export async function rateInsightAsPlayer(
  input: RatingInput,
  supabaseOverride?: SupabaseClient,
  learnerOverride?: { recordInteraction: BehaviorLearner['recordInteraction'] },
): Promise<{ success: true } | never> {
  const parsed = ratingSchema.parse(input);
  const supabase = supabaseOverride ?? (await createClient());

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: player, error: playerErr } = await supabase
    .from('golf_players').select('id').eq('user_id', user.id).maybeSingle();
  if (playerErr) {
    logServerError('rateInsightAsPlayer.player', playerErr, { userId: user.id });
    throw new Error('Player lookup failed');
  }
  if (!player) throw new Error('Player not found');

  const { data: insight, error: insightErr } = await supabase
    .from('golf_coach_insights').select('player_id, metadata').eq('id', parsed.insightId).maybeSingle();
  if (insightErr) {
    logServerError('rateInsightAsPlayer.insight', insightErr, { insightId: parsed.insightId });
    throw new Error('Insight lookup failed');
  }
  if (!insight || insight.player_id !== player.id) throw new Error('Forbidden');

  const { error: upsertErr } = await supabase
    .from('golf_insight_player_feedback')
    .upsert({
      insight_id: parsed.insightId,
      player_id: player.id,
      rating: parsed.rating,
      note: parsed.note ?? null,
    }, { onConflict: 'insight_id,player_id' });
  if (upsertErr) {
    logServerError('rateInsightAsPlayer.upsert', upsertErr, { insightId: parsed.insightId });
    throw upsertErr;
  }

  const learner = learnerOverride ?? new BehaviorLearner(player.id, 'player');
  await learner.recordInteraction({
    interaction_type: ratingToInteraction[parsed.rating],
    target_type: 'insight',
    target_id: parsed.insightId,
    metadata: {
      insight_type: (insight.metadata as Record<string, unknown> | null)?.insight_type ?? 'unknown',
      rating: parsed.rating,
    },
  });

  revalidatePath('/golf/dashboard/coachhelm');
  revalidatePath('/golf/dashboard/my-development');
  return { success: true };
}
```

- [ ] **Step 4: Test passes; commit**

```bash
git add src/app/golf/actions/player-feedback.ts src/test/golf/actions/player-feedback.test.ts
git commit -m "feat(player-feedback): rateInsightAsPlayer action — persists + records behavior + revalidates"
```

---

## Task D2: Wire callbacks into `AIInsightsPanel`

**Files:**
- Modify: `src/components/golf/coachhelm/player/AIInsightsPanel.tsx`
- Test: `src/test/golf/components/AIInsightsPanel.test.tsx`

The buttons already render conditionally on `onAcknowledge`/`onDismiss`. We need to:
1. Verify the prop interface accepts both
2. Add a third button "Helpful" if not present
3. Trigger UI feedback (toast) on click

- [ ] **Step 1: Failing test**

```tsx
// src/test/golf/components/AIInsightsPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIInsightsPanel } from '@/components/golf/coachhelm/player/AIInsightsPanel';

describe('AIInsightsPanel', () => {
  const insight = { id: 'i1', headline: 'Work on driving', body: 'Your fairways % dropped', priority: 'high' as const, metadata: {} };

  it('renders no buttons when no callbacks provided', () => {
    render(<AIInsightsPanel insights={[insight]} maxDisplay={1} />);
    expect(screen.queryByRole('button', { name: /helpful|got it|dismiss/i })).not.toBeInTheDocument();
  });

  it('renders Helpful, Got It, Dismiss when callbacks provided', () => {
    render(<AIInsightsPanel insights={[insight]} maxDisplay={1}
      onRate={vi.fn()} onAcknowledge={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole('button', { name: /helpful/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('calls onRate("helpful", insight.id) when Helpful clicked', async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(<AIInsightsPanel insights={[insight]} maxDisplay={1} onRate={onRate}
      onAcknowledge={vi.fn()} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /helpful/i }));
    await waitFor(() => expect(onRate).toHaveBeenCalledWith('helpful', 'i1'));
  });
});
```

- [ ] **Step 2: Update `AIInsightsPanel.tsx` interface**

```typescript
export interface AIInsightsPanelProps {
  insights: ComposedInsight[];
  maxDisplay?: number;
  onRate?: (rating: 'helpful' | 'not_helpful', insightId: string) => Promise<void>;
  onAcknowledge?: (insightId: string) => Promise<void>;
  onDismiss?: (insightId: string) => Promise<void>;
}
```

Render the buttons in a row — Helpful (thumbs-up icon), Got It (check icon), Dismiss (x icon). Each button shows a brief inline transition spinner while the callback resolves. Use `useTransition` for the React 19 pending state.

- [ ] **Step 3: Test → pass; commit**

```bash
git add src/components/golf/coachhelm/player/AIInsightsPanel.tsx src/test/golf/components/AIInsightsPanel.test.tsx
git commit -m "feat(player-ui): AIInsightsPanel exposes Helpful/Got It/Dismiss with onRate callback"
```

---

## Task D3: Wire `PlayerCoachHelmDashboard` → action

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/coachhelm/components/PlayerCoachHelmDashboard.tsx:237-241` (just the `<AIInsightsPanel>` props)

⚠️ **Coordinate with Team C** — they touch the Focus Areas link in the same file (one line). Use Edit, not Write. Confine your changes to the AIInsightsPanel block.

- [ ] **Step 1: Pass callbacks**

```tsx
import { rateInsightAsPlayer } from '@/app/golf/actions/player-feedback';
// ...
<AIInsightsPanel
  insights={data.insights}
  maxDisplay={5}
  onRate={async (rating, id) => {
    await rateInsightAsPlayer({ insightId: id, rating });
  }}
  onAcknowledge={async (id) => {
    await rateInsightAsPlayer({ insightId: id, rating: 'acknowledged' });
  }}
  onDismiss={async (id) => {
    await rateInsightAsPlayer({ insightId: id, rating: 'dismissed' });
  }}
/>
```

- [ ] **Step 2: Add a `<PlayerFeedbackToast>` (Sonner-style or shadcn `useToast`) for success/failure feedback.** Reuse existing toast infra (`useToast` from `@/components/ui/use-toast` if present).

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
# log in as a real player, visit /golf/dashboard/coachhelm
# click Helpful → toast appears, button disabled briefly
# verify in DB: SELECT * FROM golf_insight_player_feedback WHERE player_id='<real-id>';
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(player-ui): wire AIInsightsPanel callbacks to rateInsightAsPlayer + toast feedback"
```

---

## Task D4: Round review — call `markReviewAsViewed` on mount

**Files:**
- Modify: `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx`

- [ ] **Step 1: Add a `useEffect` that calls `markReviewAsViewed` once per session**

```tsx
import { markReviewAsViewed } from '@/app/golf/actions/round-reviews';
// inside the component:
useEffect(() => {
  if (!storedReview?.id) return;
  if (storedReview.viewed_at) return; // already viewed
  void markReviewAsViewed(storedReview.id).catch(() => { /* logged server-side */ });
}, [storedReview?.id, storedReview?.viewed_at]);
```

- [ ] **Step 2: Add a Vitest+RTL test** that confirms `markReviewAsViewed` is invoked exactly once on first render with an unviewed review.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(round-review): mark as viewed on mount once per session"
```

---

## Task D5: Fix broken `revalidatePath` targets in `round-reviews.ts`

**Files:**
- Modify: `src/app/golf/actions/round-reviews.ts:787,865,1238`

- [ ] **Step 1: Replace with the actual route**

```bash
sed -i '' "s|revalidatePath('/golf/reviews/\${|revalidatePath('/golf/dashboard/rounds/\${|g" src/app/golf/actions/round-reviews.ts
sed -i '' "s|/review')|/review')|g" src/app/golf/actions/round-reviews.ts
```

(Or do the rewrite manually with Edit calls — three callsites.)

- [ ] **Step 2: Add `revalidatePath('/golf/dashboard/coachhelm')` and `'/golf/dashboard/my-development')` to `addPlayerFeedback` and `acknowledgeReview` so the player's CoachHelm view picks up the change.**

- [ ] **Step 3: Test by manually triggering** — complete a round, view review, mark as viewed, verify view count updates.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(round-reviews): revalidate /golf/dashboard/rounds/[id]/review (was a non-existent route)"
```

---

## Task D6: Add `revalidatePath` for engine view to `submitGolfRoundComprehensive` (LIVE-22)

**Files:**
- Modify: `src/app/golf/actions/golf.ts:1623-1671`

⚠️ **Coordinate with Team E** — they're refactoring lines 1655 (the fire-and-forget block). Coordinate via PR; Team D touches the `revalidatePath` block at lines 1623-1634 only.

- [ ] **Step 1: Add the missing paths**

```typescript
revalidatePath('/golf/dashboard');
revalidatePath('/golf/dashboard/rounds');
revalidatePath('/golf/dashboard/stats');
revalidatePath('/golf/dashboard/coachhelm');       // NEW — engine view
revalidatePath('/golf/dashboard/my-qualifiers');   // NEW — qualifier progress
revalidatePath('/golf/dashboard/my-development');  // NEW — focus areas may shift
if (qualifierId) revalidatePath('/golf/dashboard/qualifiers');
```

- [ ] **Step 2: Test by submitting a round** in dev mode and confirming the player's CoachHelm screen reflects the new round on next nav (no hard reload required).

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(round-submit): revalidate coachhelm/my-development/my-qualifiers after round save"
```

---

## Task D7: Final regression + PR

- [ ] **Step 1:** Run all Team D tests:

```bash
npx vitest --run src/test/golf/actions/player-feedback.test.ts src/test/golf/components/AIInsightsPanel.test.tsx
```

- [ ] **Step 2:** End-to-end manual smoke test:
  1. Sign in as a real player on `qmnssrrolpinvwjjnufo`
  2. Submit a new round
  3. Within 5s, navigate to `/golf/dashboard/coachhelm` — confirm new insight appears (no hard reload)
  4. Click "Helpful" on an insight — confirm toast, confirm button disabled briefly
  5. SQL: `SELECT * FROM golf_insight_player_feedback WHERE player_id='<your-id>' ORDER BY created_at DESC LIMIT 5;` — confirm row
  6. SQL: `SELECT * FROM golf_learned_behavior WHERE entity_type='player' AND entity_id='<your-id>' ORDER BY timestamp DESC LIMIT 5;` — confirm event row
  7. Visit `/golf/dashboard/rounds/<round-id>/review`
  8. SQL: `SELECT id, viewed_at FROM golf_round_reviews WHERE id='<review-id>';` — confirm `viewed_at IS NOT NULL`

- [ ] **Step 3: Open PR**, request review from Team B (engine consumer of feedback events).

---

## Done check

- [ ] `rateInsightAsPlayer` action exists, with auth + ownership + Zod validation
- [ ] `AIInsightsPanel` renders Helpful/Got It/Dismiss when callbacks are provided
- [ ] `PlayerCoachHelmDashboard` passes all 3 callbacks
- [ ] `markReviewAsViewed` is called on review mount
- [ ] All `revalidatePath` calls in `round-reviews.ts` point at the real route
- [ ] `submitGolfRoundComprehensive` revalidates the player engine view + my-qualifiers + my-development
- [ ] Manual smoke shows: feedback row in `golf_insight_player_feedback`, behavior event in `golf_learned_behavior`, view count updated on `golf_round_reviews`
- [ ] PR merged

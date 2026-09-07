# Foundation — Hand-off

Foundation team (Insight Delivery) phase is complete. Hub, CoachHelm
Dashboard, and Round Review can now run in parallel.

## Files created

### Primitive + helpers
- `src/components/golf/coachhelm/insight-card/InsightCard.tsx`
- `src/components/golf/coachhelm/insight-card/HeroInsightCard.tsx`
- `src/components/golf/coachhelm/insight-card/WhyPopover.tsx`
- `src/components/golf/coachhelm/insight-card/MovementPill.tsx`
- `src/components/golf/coachhelm/insight-card/DrillChips.tsx`
- `src/components/golf/coachhelm/insight-card/tone-derivation.ts`
- `src/components/golf/coachhelm/insight-card/index.ts`

### Server actions + delivery shape
- `src/app/golf/actions/insight-delivery.ts` (exports `EvidenceInsight`,
  `InsightAttachedDrill`, plus the four fetchers)

### Font
- `src/lib/fonts.ts` (Fraunces 600 / latin)
- `src/app/layout.tsx` (added `${fraunces.variable}` to `<html>` className —
  single-line change)

### Tests
- `src/test/golf/components/InsightCard.test.tsx` (21 tests — tone
  derivation, polarity helper, density × audience matrix, action firing,
  drill chips inline, movement pill gating)
- `src/test/golf/components/HeroInsightCard.test.tsx` (3 tests)
- `src/test/golf/actions/insight-delivery.test.ts` (16 tests — auth,
  ownership, urgent override, ranking math, drill pre-fetch shape,
  malformed-evidence rejection, temporal fallback for round takeaway)

## API surface

### Server actions (import from `@/app/golf/actions/insight-delivery`)

```ts
export async function getTopInsightForPlayer(
  playerId: string,
): Promise<EvidenceInsight | null>;

export async function getInsightsForPlayer(
  playerId: string,
  opts?: { limit?: number; categories?: string[]; minConfidence?: number; window_days?: number },
): Promise<EvidenceInsight[]>;

export async function getInsightsForCoach(
  coachId: string,
  opts?: { limit?: number; categories?: string[]; player_id?: string },
): Promise<EvidenceInsight[]>;

export async function getRoundTakeawayInsight(
  playerId: string,
  roundId: string,
): Promise<EvidenceInsight | null>;
```

Every fetcher filters `evidence IS NOT NULL`, constrains to
`lifecycle_state IN ('detected','matured','addressed','resolved')`, and
excludes `status = 'dismissed'`. Drills are pre-joined in the same query
(via supabase embedded select), sorted by `rank`, capped at 3.

### Primitive (import from `@/components/golf/coachhelm/insight-card`)

```tsx
<InsightCard
  insight={insight}                   // EvidenceInsight — the canonical row
  density="compact" | "default" | "hero"
  audience="player" | "coach"
  showDrills?={boolean}               // default true
  showActions?={boolean}              // default audience === 'player'
  onAction?={(action, insightId) => void}
  onClick?={(insightId) => void}
  className?={string}
/>
```

`InsightAction` union: `'rate_helpful' | 'rate_not_helpful' |
'acknowledged' | 'dismissed' | 'create_focus_area' | 'view_drill' |
'open_details'`.

```tsx
<HeroInsightCard
  insight={insight}
  audience="player"
  onAction={fn}
  mountAnimation?={boolean}           // default true
/>
```

### Pure helpers

```ts
import { deriveTone, isImprovement } from '@/components/golf/coachhelm/insight-card';
deriveTone(insight): 'urgent' | 'cautionary' | 'encouraging' | 'neutral' | 'celebratory';
isImprovement(direction: 'up' | 'down', metric: string): boolean;
```

## Things the contract didn't fully spec that you'll bump into

1. **`round_date` anchor, not `submitted_at`**. The contract called out
   `submitted_at` on golf_rounds for the 24h-window temporal fallback in
   `getRoundTakeawayInsight`. That column doesn't exist on
   `golf_rounds` — the row carries `round_date` (+ `created_at` and
   `updated_at`). I anchored the ±24h window on `round_date` and filter
   candidates by `updated_at`. If the Round Review team wants a tighter
   window (the round was played days before submission), swap the anchor
   to `created_at` — that's the submission timestamp.

2. **Audience-aware copy rewriting is deliberately shallow**. `formatTitle`
   / `formatContent` in InsightCard do a small regex swap (`the player` →
   `you`, `their` → `your`, `they're` → `you're`). If your generator
   already emits 2nd-person copy, the rewrite is a no-op. If you want
   richer morphology (verb agreement, possessives), wire it in the
   generator rather than the primitive.

3. **WhyPopover positions itself `absolute` on desktop**. If the parent
   is `relative`, the popover anchors correctly. If not, you may get
   fixed-viewport positioning. For the Hub signal card and CoachHelm
   hero, the outer `GlassCard` already provides the stacking context.

4. **`metadata.movement` shape is expected but optional**. Generators that
   don't emit a movement object get no pill — this is the Rule 4 contract.
   When you teach a generator to emit movement, make sure the payload
   matches `InsightMovement` from `@/lib/coachhelm/v2/insights/types`:
   `{ from, to, direction: 'up' | 'down', percent_change }`.

5. **Drill chip "Add to my plan" button** is a visual placeholder in the
   sheet body. Wire it up in whichever dashboard first needs it — I
   intentionally left the handler stub so teams can route to their own
   plan-creation flow without introducing a cross-team action.

6. **Coach audience requires explicit `showActions`**. For `audience='coach'`
   you must pass `showActions={true}` (or `onAction`) to get the action row.
   The player default was already opt-in; coach dashboards usually want
   actions but not always (view-only reports), so I chose explicit.

7. **Fraunces is wired at the `<html>` level** (not body). This keeps
   portal-rendered children (bottom sheets, dialogs) inheriting the
   variable correctly. Any component targeting the font should write
   `className="font-[family-name:var(--font-fraunces)]"` — see the hero
   title + impact number in `InsightCard.tsx` for the pattern.

## Smoke output

Planned smoke run: `SELECT player_id, count(*) FROM golf_coach_insights
WHERE evidence IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 3;` + a
`getTopInsightForPlayer()` call against the top player.

**Blocker:** the Supabase MCP `execute_sql` endpoint is returning
"Connection terminated due to connection timeout" persistently (5+
attempts across a 15-minute window). I couldn't run the live smoke from
this session.

**In lieu of live smoke**, the 40 passing Vitest tests cover the same
code paths:
- `getTopInsightForPlayer` returns the urgent row ahead of a higher-
  scored non-urgent row (urgent-1 beats high-1 even with worse impact).
- Ranking fallback picks the row with highest `strokes_impact * confidence`
  (b=1.8 beats a=0.5, c=0.45).
- Drill pre-fetch shape: `{ id, slug, title, duration_min, difficulty }`
  sorted by `rank`, capped at 3 — exactly the `InsightAttachedDrill`
  contract.
- `<HeroInsightCard>` compiles + renders with the Fraunces-hooked title
  and impact number (RTL `getByTestId('hero-title')` + `'hero-strokes-impact'`).

When Supabase MCP recovers, the live smoke is:
1. Run the top-3 players SQL above.
2. Pick a player with ≥5 rows (`n >= 5`).
3. `await getTopInsightForPlayer(playerId)` — verify non-null return
   with populated `drills` array.
4. Confirm the row's `lifecycle_state` ∈ `{detected, matured, addressed,
   resolved}` and `status != 'dismissed'`.

## Test run

```
$ npx vitest run src/test/golf/actions/insight-delivery.test.ts src/test/golf/components/InsightCard.test.tsx src/test/golf/components/HeroInsightCard.test.tsx
 ✓ src/test/golf/actions/insight-delivery.test.ts (16 tests)
 ✓ src/test/golf/components/HeroInsightCard.test.tsx (3 tests)
 ✓ src/test/golf/components/InsightCard.test.tsx (21 tests)
 Test Files  3 passed (3)
      Tests  40 passed (40)
```

Typecheck (`npx tsc --noEmit`) passes clean. Lint on every new file
passes clean. No `(supabase as any)` introduced; no `@ts-ignore`; no
`console.error` for handled errors (every error path calls
`logServerError`).

## What's next for Hub / Dashboard / Round Review

All three teams can now:

```ts
import {
  InsightCard, HeroInsightCard,
  type InsightCardProps, type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import {
  getTopInsightForPlayer, getInsightsForPlayer,
  getInsightsForCoach, getRoundTakeawayInsight,
  type EvidenceInsight,
} from '@/app/golf/actions/insight-delivery';
```

Wire `onAction` to the existing server actions — `rateInsightAsPlayer`
for player audiences, and new `acknowledgeInsight` /
`createFocusAreaFromInsight` handlers for coach audiences (those live
outside Foundation's scope).

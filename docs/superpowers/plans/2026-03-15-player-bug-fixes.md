# Player Feature Bug Fixes — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan.

**Goal:** Fix all critical, high, and medium bugs found across player features. 10 issues total.

**Agent Split:** 3 parallel agents with zero file overlap.

---

## Agent 1: Core Feature Fixes (Rounds + Dashboard Data)

**Files owned:**
- `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx`
- `src/app/golf/actions/dashboard-data.ts`
- `src/app/golf/actions/travel.ts`
- `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx`

### FIX 1 (CRITICAL — already done): roundSetup → setupData variable name
- File: `new-round-client.tsx`, lines 212-213
- Already fixed in working tree. Verify it's correct.

### FIX 2 (HIGH): Travel CRUD missing coach role authorization
- File: `travel.ts`, lines 120-304
- Read the file. Find `createGolfTravelItinerary`, `updateGolfTravelItinerary`, `deleteGolfTravelItinerary`.
- After the auth check (`if (!user)`), add a coach role verification:
```typescript
// Verify user is a coach
const { data: coach } = await supabase
  .from('golf_coaches')
  .select('id')
  .eq('user_id', user.id)
  .maybeSingle();
if (!coach) {
  return { success: false, error: 'Only coaches can manage travel itineraries' };
}
```
- Add this to ALL three mutation functions (create, update, delete).

### FIX 3 (MEDIUM): Player/coach scoring avg not normalized for 9-hole rounds
- File: `dashboard-data.ts`
- Find where scoring averages are computed (around lines 450-453 for coach, 788-790 for player).
- The query already fetches `holes_played`. Use it to normalize:
```typescript
// Instead of: scores.reduce((s, r) => s + r.total_score, 0) / scores.length
// Use:
const normalizedScores = rounds
  .filter(r => r.total_score != null && r.total_score > 0)
  .map(r => {
    const holes = r.holes_played ?? 18;
    return holes < 18 ? (r.total_score / holes) * 18 : r.total_score;
  });
const scoringAvg = normalizedScores.length > 0
  ? normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length
  : 0;
```
- Apply the same normalization to `bestRound` calculation.

### FIX 4 (MEDIUM): Round review auth bypass for non-player users
- File: `review/page.tsx`, around line 132
- When `currentPlayerId` is undefined (user has no player record), deny access:
```typescript
if (!currentPlayerId) {
  // Non-player users cannot view round reviews
  return <ErrorState error="You must be a player to view round reviews." />;
}
```

---

## Agent 2: CoachHelm Component Fixes

**Files owned:**
- `src/components/golf/coachhelm/player/FocusAreasGrid.tsx`
- `src/components/golf/coachhelm/player/TrendDashboard.tsx`
- `src/components/golf/coachhelm/player/WhatIfPanel.tsx`
- `src/components/golf/coachhelm/player/CompositeRatingCard.tsx`
- `src/components/golf/coachhelm/player/PerformancePrediction.tsx`

### FIX 5 (MEDIUM): FocusAreasGrid onClick always defined → Link branch dead code
- File: `FocusAreasGrid.tsx`
- Find where `FocusAreaCard` is rendered with `onClick` (around line 256-262).
- Change: `onClick={() => onAreaClick?.(area)}`
- To: `onClick={onAreaClick ? () => onAreaClick(area) : undefined}`
- This way when `onAreaClick` is not provided, `onClick` is `undefined`, and the `FocusAreaCard` falls through to the `<Link>` branch.

### FIX 6 (MEDIUM): SG bars extend wrong direction
- File: `FocusAreasGrid.tsx`, lines 128-146
- The issue: inline style `[isPositive ? 'right' : 'left']: '50%'` overrides the CSS class.
- Fix: For positive SG (bar extends right from center), use `left: '50%'` so the bar starts at center and grows right.
- For negative SG (bar extends left from center), use `right: '50%'` so the bar starts at center and grows left.
```typescript
style={{
  [isPositive ? 'left' : 'right']: '50%',  // Swapped from the current
}}
```
- Also update the CSS class to match: positive = no position class needed (left is set by style), negative = no position class needed.

### FIX 7 (MEDIUM): Streak magnitude sign confusing for golf
- File: `TrendDashboard.tsx`, lines 198-202
- The magnitude is cumulative deviation from baseline. For a "hot" streak (below baseline = good in golf), magnitude is negative. For "cold" streak, it's positive.
- Change display to show absolute value with context:
```typescript
// Instead of: {Number(streak.magnitude ?? 0) > 0 ? '+' : ''}{Number(streak.magnitude ?? 0).toFixed(1)} strokes
// Use:
{Math.abs(Number(streak.magnitude ?? 0)).toFixed(1)} strokes {streak.type === 'hot' ? 'below' : 'above'} avg
```

### FIX 8 (LOW → include): WhatIfPanel shows "0.0" instead of "N/A" when no prediction
- File: `WhatIfPanel.tsx`, around line 107
- When `resolvedCurrentPrediction` is 0 AND no profileData exists, show "--" instead of "0.0":
```typescript
const hasPrediction = currentPrediction != null || (profileData?.prediction != null);
// In the display:
{hasPrediction ? (
  <>{Number(resolvedCurrentPrediction ?? 0) > 0 ? '+' : ''}{Number(resolvedCurrentPrediction ?? 0).toFixed(1)}</>
) : '--'}
```

### FIX 9 (LOW → include): CompositeRating SVG clamp for negative values
- File: `CompositeRatingCard.tsx`, around line 109
- Clamp `displayComposite` to 0-100:
```typescript
const displayComposite = Math.max(0, Math.min(100, Number(resolvedComposite ?? 0)));
```

### FIX 10 (LOW → include): PerformancePrediction range div-by-zero
- File: `PerformancePrediction.tsx`, around line 165
- Guard the range position calculation:
```typescript
const rangeSpan = Number(rangeHigh) - Number(rangeLow);
const markerPosition = rangeSpan > 0 ? ((predictedValue - Number(rangeLow)) / rangeSpan) * 100 : 50;
```

---

## Agent 3: Page-Level Fixes

**Files owned:**
- `src/app/golf/(dashboard)/dashboard/my-development/page.tsx`
- `src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx`
- `src/app/golf/(dashboard)/dashboard/my-qualifiers/my-qualifiers-client.tsx`

### FIX 11 (MEDIUM): My Development progress calc flawed for "lower is better"
- File: `my-development/page.tsx`, lines 94-113
- The current formula for lower-is-better uses `target / current * 100` which is wrong without a baseline.
- Fix: When no starting baseline exists, show a simpler metric:
```typescript
// For lower-is-better: show how close current is to target
// If current <= target, progress = 100% (goal met)
// If current > target, progress = target / current * 100 (percentage of way there)
if (isLowerBetter) {
  if (current <= target) return 100;
  return Math.round((target / current) * 100);
}
```
- This is still not perfect without a baseline, but it's less misleading.

### FIX 12 (MEDIUM): Qualifier numRounds inferred incorrectly
- File: `my-qualifiers/page.tsx`, lines 97-99
- Current: `inferredNumRounds = Math.max(roundsCompleted + 1, 1)` — always current+1
- Fix: Fetch `num_rounds` from the qualifier record. Add it to the select query:
  - Find the query that fetches qualifiers (around line 18-32)
  - Add `num_rounds` to the select
  - Use `qualifier.num_rounds ?? inferredNumRounds` as fallback

### FIX 13 (LOW → include): My Qualifiers formatDate timezone shift
- File: `my-qualifiers-client.tsx`, lines 35-41
- Replace `new Date(dateStr).toLocaleDateString(...)` with manual date parsing (same pattern as travel fix):
```typescript
const formatDate = (dateStr: string) => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts = dateStr.split('T')[0]?.split('-');
  if (parts && parts.length === 3) {
    const month = months[parseInt(parts[1]!, 10) - 1] ?? parts[1];
    return `${month} ${parseInt(parts[2]!, 10)}, ${parts[0]}`;
  }
  return dateStr;
};
```

---

## Execution

All 3 agents run in parallel — zero file overlap. Do NOT push to git.

# Remaining Agent Tasks (8 Separate Chats)

> Generated from Multi-Agent Review Report triage on 2026-02-12.
> The 4 in-chat agents already fixed: non-null assertions, N+1 RSVP query,
> 10 travel expense auth gaps, timeline config lookup, team pulse pluralization.
> These 8 tasks cover the remaining medium/low priority improvements.

---

## Task 1: Timezone Handling System

**Priority**: Medium | **Files**: 5-8 files | **Risk**: Medium (behavioral change)

### Problem
All date/time handling uses the browser's local timezone. A coach in EST creating
a 2 PM practice sees it rendered at 2 PM, but a player in CST sees it at 2 PM too
(wrong - should show 1 PM CST). This affects `TodayTimeline`, `EventDetailModal`,
calendar events, round dates, and action item deadlines.

### Scope
- `src/components/golf/dashboard/today-timeline.tsx` - `formatTime()`, `toDecimalHour()`, `getTimeUntil()`
- `src/components/golf/calendar/EventDetailModal.tsx` - event time display
- `src/app/golf/actions/dashboard-data.ts` - `getTodayRange()`, `today` variable, event queries
- `src/app/golf/actions/stats-data.ts` - round date filtering

### Implementation
1. Add `timezone TEXT` column to `golf_teams` table (default `'America/New_York'`)
2. Create utility `src/lib/utils/timezone.ts`:
   ```typescript
   export function formatInTeamTz(iso: string, tz: string, opts?: Intl.DateTimeFormatOptions): string {
     return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(new Date(iso));
   }
   export function getTodayRangeForTz(tz: string): { start: string; end: string } { ... }
   ```
3. Thread team timezone through dashboard data payloads
4. Update all `formatTime()` calls to use team timezone
5. Update `getTodayRange()` to compute day boundaries in team timezone

### Verification
- Create events in one timezone, verify display in another
- Verify "Today's Schedule" only shows events for today in the team's timezone
- Verify round dates display correctly regardless of browser timezone

---

## Task 2: React Error Boundaries

**Priority**: Medium | **Files**: 3-4 files | **Risk**: Low (additive)

### Problem
No React Error Boundaries exist. If `TrendChart`, `TeamPulseCard`, `TodayTimeline`,
or any dashboard widget throws during render, the entire page crashes to a white screen.
This is especially risky because these components process real-time data that may have
unexpected shapes.

### Scope
- New: `src/components/golf/dashboard/error-boundary.tsx`
- Modify: `src/app/golf/(dashboard)/dashboard/components/CoachDashboard.tsx`
- Modify: `src/app/golf/(dashboard)/dashboard/components/PlayerDashboard.tsx`

### Implementation
1. Create `DashboardErrorBoundary` component:
   ```typescript
   'use client';
   import { Component, ReactNode } from 'react';

   interface Props { children: ReactNode; fallback?: ReactNode; name?: string; }
   interface State { hasError: boolean; error?: Error; }

   export class DashboardErrorBoundary extends Component<Props, State> {
     state: State = { hasError: false };
     static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
     render() {
       if (this.state.hasError) {
         return this.props.fallback ?? (
           <div className="bg-white/60 backdrop-blur-xl border border-white/40 rounded-2xl p-6 text-center">
             <p className="text-sm text-warm-600 font-medium mb-2">
               {this.props.name ?? 'Widget'} failed to load
             </p>
             <button onClick={() => this.setState({ hasError: false })}
               className="text-xs text-primary-600 hover:text-primary-700 font-medium">
               Try again
             </button>
           </div>
         );
       }
       return this.props.children;
     }
   }
   ```
2. Wrap each major section in CoachDashboard and PlayerDashboard:
   - `<DashboardErrorBoundary name="Schedule"><TodayTimeline .../></DashboardErrorBoundary>`
   - `<DashboardErrorBoundary name="Team Pulse"><TeamPulseCard .../></DashboardErrorBoundary>`
   - `<DashboardErrorBoundary name="Trend Chart"><TrendChart .../></DashboardErrorBoundary>`
   - `<DashboardErrorBoundary name="Stats"><StatCardSparkline .../></DashboardErrorBoundary>`

### Verification
- Temporarily throw in a child component, verify fallback renders
- Verify "Try again" button recovers the component
- Verify other sections remain functional when one fails

---

## Task 3: Dashboard State Management Refactor

**Priority**: Medium | **Files**: 1 file | **Risk**: Medium (logic change)

### Problem
`page.tsx` has 7 separate `useState` hooks that form a coupled state machine:
```typescript
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
const [coachData, setCoachData] = useState<CoachDashboardData | null>(null);
const [playerData, setPlayerData] = useState<PlayerDashboardData | null>(null);
const [coachEnhanced, setCoachEnhanced] = useState<CoachDashboardPayload | null>(null);
const [playerEnhanced, setPlayerEnhanced] = useState<PlayerDashboardPayload | null>(null);
const [retryCount, setRetryCount] = useState(0);
```
This allows impossible states (e.g., `loading=false, error=null, coachData=null, playerData=null`).

### Scope
- `src/app/golf/(dashboard)/dashboard/page.tsx`

### Implementation
1. Define discriminated union state type:
   ```typescript
   type DashboardState =
     | { status: 'loading' }
     | { status: 'coach'; data: CoachDashboardData; enhanced: CoachDashboardPayload | null }
     | { status: 'player'; data: PlayerDashboardData; enhanced: PlayerDashboardPayload | null }
     | { status: 'error'; message: string }
     | { status: 'unavailable' };
   ```
2. Create reducer:
   ```typescript
   type Action =
     | { type: 'COACH_LOADED'; data: CoachDashboardData; enhanced: CoachDashboardPayload }
     | { type: 'PLAYER_LOADED'; data: PlayerDashboardData; enhanced: PlayerDashboardPayload }
     | { type: 'ERROR'; message: string }
     | { type: 'RETRY' }
     | { type: 'UNAVAILABLE' };
   ```
3. Replace all `useState` calls with single `useReducer`
4. Update `loadDashboard` to dispatch actions instead of calling multiple setters
5. Update render logic to switch on `state.status`

### Verification
- Verify coach dashboard loads correctly
- Verify player dashboard loads correctly
- Verify error state shows retry button
- Verify retry triggers fresh data load
- Run typecheck

---

## Task 4: Database Index & Query Performance

**Priority**: Medium | **Files**: 2 files | **Risk**: Low (additive migration)

### Problem
Several frequently-hit queries in `dashboard-data.ts` and `stats-data.ts` lack optimal
composite indexes. The team scoring trend query scans all rounds for all players without
a covering index. The events query for "today" has no index on `(team_id, start_time)`.

### Scope
- New: `supabase/migrations/067_performance_indexes.sql`
- Verify: `src/app/golf/actions/dashboard-data.ts` query patterns

### Implementation
1. Audit all Supabase queries and identify missing indexes:
   ```sql
   -- Rounds by player + date (used in scoring trends, sparklines, recent rounds)
   CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_date
     ON golf_rounds(player_id, round_date DESC);

   -- Rounds filtering non-null scores (used with .not('total_score', 'is', null))
   CREATE INDEX IF NOT EXISTS idx_golf_rounds_player_score
     ON golf_rounds(player_id, round_date DESC)
     WHERE total_score IS NOT NULL;

   -- Events by team + start_time (used in today timeline, upcoming count)
   CREATE INDEX IF NOT EXISTS idx_golf_events_team_start
     ON golf_events(team_id, start_time);

   -- Event attendance by event (used in RSVP counts)
   CREATE INDEX IF NOT EXISTS idx_golf_event_attendance_event
     ON golf_event_attendance(event_id, status);

   -- Rounds by course for course breakdown
   CREATE INDEX IF NOT EXISTS idx_golf_rounds_course
     ON golf_rounds(player_id, course_name);

   -- Travel expenses by itinerary
   CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_itinerary
     ON golf_travel_expenses(itinerary_id, expense_date DESC);

   -- Travel expenses by team
   CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_team
     ON golf_travel_expenses(team_id, created_at DESC);
   ```
2. Test with `EXPLAIN ANALYZE` on the most common queries
3. Verify no performance regression on writes

### Verification
- Run migration against dev database
- Compare query plans before/after for dashboard load
- Verify dashboard still loads correctly

---

## Task 5: Memoization & Render Optimization

**Priority**: Low | **Files**: 4 files | **Risk**: Low

### Problem
CoachDashboard and PlayerDashboard create new object references on each render that
break `memo()` in child components. The `greeting` useMemo has an empty dependency
array which is correct for "compute once" but could theoretically show stale greeting
across midnight. Several computed values are not memoized.

### Scope
- `src/app/golf/(dashboard)/dashboard/components/CoachDashboard.tsx`
- `src/app/golf/(dashboard)/dashboard/components/PlayerDashboard.tsx`
- `src/components/golf/dashboard/stat-card-sparkline.tsx`
- `src/components/golf/dashboard/today-timeline.tsx`

### Implementation
1. In CoachDashboard, memoize computed props:
   ```typescript
   const todayEvents = useMemo(() => enhancedData?.todayEvents ?? EMPTY_EVENTS, [enhancedData]);
   const actionItems = useMemo(() => enhancedData?.actionItems ?? EMPTY_ACTION_ITEMS, [enhancedData]);
   const teamPulse = useMemo(() => enhancedData?.teamPulse ?? EMPTY_TEAM_PULSE, [enhancedData]);
   ```
2. In PlayerDashboard, same pattern for sparkline data:
   ```typescript
   const scoringSparkline = useMemo(
     () => enhancedData?.sparklines.scoringAvg.sparkline ?? EMPTY_SPARKLINE,
     [enhancedData]
   );
   ```
3. Audit all props passed to `memo()` components - verify stable references
4. Add React DevTools Profiler snapshots (before/after) to confirm reduced re-renders

### Verification
- Use React DevTools Profiler to measure render counts
- Verify no visual regressions
- Run typecheck

---

## Task 6: Comprehensive Test Suite

**Priority**: Medium | **Files**: 8+ new files | **Risk**: None (additive)

### Problem
Zero test coverage across the golf dashboard. Critical server actions, data
transformations, and UI components are untested. Regressions are caught only
by manual testing.

### Scope
- New: `src/app/golf/actions/__tests__/dashboard-data.test.ts`
- New: `src/app/golf/actions/__tests__/stats-data.test.ts`
- New: `src/app/golf/actions/__tests__/travel.test.ts`
- New: `src/components/golf/dashboard/__tests__/today-timeline.test.tsx`
- New: `src/components/golf/dashboard/__tests__/team-pulse-card.test.tsx`
- New: `src/components/golf/dashboard/__tests__/stat-card-sparkline.test.tsx`

### Implementation
1. **Server action tests** (mock Supabase client):
   - Auth gate: verify throws when unauthenticated
   - Auth gate: verify throws when wrong user
   - Happy path: verify correct data shape returned
   - Edge cases: empty roster, no rounds, null scores
   - Travel auth: verify all 10 expense functions reject unauthorized users
2. **Component tests** (React Testing Library):
   - TodayTimeline: empty state, single event, overlapping events, midnight-spanning
   - TeamPulseCard: all improving, all declining, mixed, zero total
   - StatCardSparkline: null value, numeric value with trend, with/without sparkline
3. **Data transformation tests** (pure function unit tests):
   - `computeTrend()`: improving, declining, stable, insufficient data
   - `buildSparkline()`: normal, single point, empty
   - GIR/FIR percentage calculations with edge values

### Verification
- All tests pass with `npm test`
- Coverage report shows >80% on critical paths
- CI pipeline runs tests on PR

---

## Task 7: Travel Expense Module Hardening

**Priority**: Medium | **Files**: 1 file | **Risk**: Low

### Problem
The auth fixes applied today secured the 10 expense functions, but the module still
lacks input validation (Zod schemas), proper `revalidatePath` calls after mutations,
consistent error return types, and amount bounds checking. The `createTravelExpense`
and `updateTravelExpense` have Zod but others don't validate input shape.

### Scope
- `src/app/golf/actions/travel.ts`

### Implementation
1. Add Zod schemas for all expense inputs that don't have them:
   ```typescript
   const expenseIdSchema = z.string().uuid();
   const itineraryIdSchema = z.string().uuid();
   const teamIdSchema = z.string().uuid();
   ```
2. Add `revalidatePath('/golf/dashboard/travel')` after all mutation operations:
   - `createTravelExpense` (after insert)
   - `updateTravelExpense` (after update)
   - `deleteTravelExpense` (after delete)
   - `setBudget` (after upsert)
3. Add amount bounds checking:
   ```typescript
   amount: z.number().min(0).max(1_000_000),
   budgeted_amount: z.number().min(0).max(10_000_000),
   ```
4. Audit `uploadExpenseReceipt` for path traversal:
   - Sanitize `file.name` to strip `../` and special characters
   - Enforce allowed extensions (jpg, jpeg, png, pdf, heic)
   - Add file size limit check
5. Replace `console.error` with structured logging or remove (per CLAUDE.md "no console.log")

### Verification
- Test with invalid inputs (negative amounts, non-UUID IDs)
- Test file upload with malicious filenames
- Verify revalidation refreshes UI after mutations
- Run typecheck

---

## Task 8: Accessibility & ARIA Audit

**Priority**: Low | **Files**: 5 files | **Risk**: Low (additive)

### Problem
The dashboard components lack proper ARIA attributes for screen readers. The horizontal
scrolling timeline has no keyboard navigation. Animated numbers announce intermediate
values. The team pulse progress bar has no accessible role. Focus indicators are missing
on some interactive elements.

### Scope
- `src/components/golf/dashboard/today-timeline.tsx`
- `src/components/golf/dashboard/stat-card-sparkline.tsx`
- `src/components/golf/dashboard/team-pulse-card.tsx`
- `src/components/ui/animated-number.tsx`
- `src/components/ui/sparkline.tsx`

### Implementation
1. **TodayTimeline**:
   - Add `role="region"` and `aria-label="Today's schedule"` to container
   - Add `aria-roledescription="timeline"` for semantic meaning
   - Add keyboard navigation: Left/Right arrows to scroll, Tab to focus events
   - Add `aria-label` to each event block with full details
2. **StatCardSparkline**:
   - Already has `aria-label` - verify it reads correctly
   - Add `aria-live="polite"` to animated number so final value is announced
3. **TeamPulseCard**:
   - Add `role="img"` with `aria-label` describing the distribution to the bar
   - Or use `role="progressbar"` on each segment with `aria-valuenow`
4. **AnimatedNumber**:
   - Add `aria-live="off"` during animation, `aria-live="polite"` on completion
   - Or use `aria-hidden="true"` on the animated span and a visually-hidden span
     with the final value for screen readers
5. **Sparkline**:
   - Add `role="img"` and `aria-label` describing the trend
   - Add visually-hidden text describing the data (e.g., "Scoring trend: improving over 5 rounds")

### Verification
- Test with VoiceOver (macOS) / NVDA (Windows)
- Verify all interactive elements are keyboard-reachable
- Verify animated values don't spam screen reader
- Run `axe-core` audit in browser DevTools

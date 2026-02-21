# GolfHelm Performance Fix Architecture Plan

**Created:** 2026-02-20  
**Status:** PLANNING ONLY — No code written  
**Target:** Fix dashboard timeouts, N+1 queries, unbounded queries, giant components

---

## Executive Summary

GolfHelm suffers from 30s+ dashboard timeouts with 50-100% failure rates under load. Root causes:

1. **N+1 query patterns** in stats calculation and dashboard data fetching
2. **639 unbounded queries** across action files (missing `.limit()`)
3. **Giant monolithic components** (2,934+ lines) causing slow renders and difficult maintenance
4. **Sequential query chains** despite existing `Promise.all` parallelization

### Success Metrics
- Dashboard load time: 30s+ → <3s (p95)
- Stats page load: 15s+ → <2s (p95)
- Timeout rate: 50-100% → <1%
- Largest component: 2,934 lines → <500 lines each

---

## Part 1: Database Changes Needed

### 1.1 Create Materialized View for Dashboard Aggregates

The dashboard currently makes 10+ queries. Create a pre-computed view:

```sql
-- PLANNED: Create materialized view for coach dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_coach_dashboard_stats AS
SELECT 
    tm.team_id,
    COUNT(DISTINCT tm.player_id) AS roster_size,
    COUNT(DISTINCT CASE WHEN e.start_time > NOW() THEN e.id END) AS upcoming_events,
    COUNT(DISTINCT CASE WHEN q.status IN ('upcoming', 'in_progress') THEN q.id END) AS active_qualifiers,
    AVG(r.total_score) FILTER (WHERE r.round_date > NOW() - INTERVAL '90 days') AS team_scoring_avg,
    AVG(r.total_score) FILTER (WHERE r.round_date BETWEEN NOW() - INTERVAL '180 days' AND NOW() - INTERVAL '90 days') AS previous_scoring_avg
FROM golf_team_members tm
LEFT JOIN golf_events e ON e.team_id = tm.team_id
LEFT JOIN golf_qualifiers q ON q.team_id = tm.team_id
LEFT JOIN golf_rounds r ON r.player_id = tm.player_id AND r.status = 'completed'
WHERE tm.status = 'active'
GROUP BY tm.team_id;

-- Refresh strategy: via trigger or scheduled job
CREATE UNIQUE INDEX ON mv_coach_dashboard_stats(team_id);
```

### 1.2 Add Missing Composite Indexes

Despite existing indexes, query patterns show gaps:

```sql
-- PLANNED: Index for team-level round aggregation (used by dashboard)
CREATE INDEX IF NOT EXISTS idx_golf_rounds_team_completed
  ON golf_rounds(team_id, round_date DESC)
  WHERE status = 'completed' AND total_score IS NOT NULL AND team_id IS NOT NULL;

-- PLANNED: Index for sparkline data (recent rounds with metrics)
CREATE INDEX IF NOT EXISTS idx_golf_rounds_sparkline
  ON golf_rounds(player_id, round_date DESC)
  INCLUDE (total_score, total_gir, total_gir_possible, total_putts)
  WHERE status = 'completed' AND total_score IS NOT NULL;

-- PLANNED: Index for shot analytics (currently unbounded)
CREATE INDEX IF NOT EXISTS idx_golf_shots_round_ordered
  ON golf_shots(round_id, hole_number, shot_number);
```

### 1.3 Create RPC Functions for Common Aggregates

Move heavy computation to Postgres:

```sql
-- PLANNED: Get team stats in one call
CREATE OR REPLACE FUNCTION get_team_dashboard_stats(p_team_id UUID)
RETURNS TABLE(
    roster_size INT,
    upcoming_events INT,
    active_qualifiers INT,
    team_scoring_avg NUMERIC,
    previous_avg NUMERIC,
    rounds_this_week INT
) AS $$
BEGIN
    -- Single query with all aggregates
    RETURN QUERY
    SELECT ...;
END;
$$ LANGUAGE plpgsql STABLE;
```

### 1.4 Leverage Existing Cache Tables

The codebase already has `golf_player_stats_cache` (77 columns!) and `golf_round_stats_cache`. These are underutilized:

**Current state:** Cache exists but queries still hit raw tables  
**Target state:** Dashboard and stats pages query cache first, fall back to computation

---

## Part 2: Query Optimization Strategy

### 2.1 Add `.limit()` to All Unbounded Queries

**Current:** 639 queries without limits identified  
**Fix:** Add explicit limits everywhere

| Query Type | Recommended Limit | Reasoning |
|------------|------------------|-----------|
| Dashboard recent rounds | 10-20 | Only showing recent activity |
| Stats trend analysis | 100 | Enough for meaningful trends |
| Shot analytics | 1000 | Max shots per request |
| Player lists | 200 | Pagination required |
| Event lists | 50 | Pagination required |

### 2.2 Batch RSVP Queries

**Current pattern (N+1):**
```typescript
// Fetch events
const events = await supabase.from('golf_events').select('*');
// Then separately for each event...
for (const event of events) {
    const rsvps = await supabase.from('golf_event_attendance')...
}
```

**Target pattern (1+1):**
```typescript
// Fetch events
const events = await supabase.from('golf_events').select('*');
// Single batch query for all RSVP counts
const eventIds = events.map(e => e.id);
const rsvps = await supabase
    .from('golf_event_attendance')
    .select('event_id, status')
    .in('event_id', eventIds);
// Aggregate in memory
```

### 2.3 Use Cache Tables Instead of Raw Computation

**Current flow:**
```
Request → Fetch all rounds → Fetch all holes → Fetch all shots → Calculate stats
```

**Target flow:**
```
Request → Check golf_player_stats_cache → Return cached data
         → If stale/missing: background refresh
```

### 2.4 Eliminate Sequential Query Chains

**Files requiring optimization:**

| File | Current Queries | After Optimization |
|------|-----------------|-------------------|
| `dashboard-data.ts` | 10 parallel + 2 sequential | 2-3 parallel |
| `stats-data.ts` | 5+ per analysis | 2-3 using cache |
| `stats-client.tsx` | Player list + N player stats | Batch query |

### 2.5 Add Query Timeouts and Fallbacks

```typescript
// PLANNED: Add timeout wrapper
async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T
): Promise<T> {
    const timeout = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Query timeout')), timeoutMs)
    );
    try {
        return await Promise.race([promise, timeout]);
    } catch {
        console.error('Query timeout, using fallback');
        return fallback;
    }
}
```

---

## Part 3: Component Refactoring Approach

### 3.1 Split Giant Components

| Component | Current Lines | Target | Split Strategy |
|-----------|---------------|--------|----------------|
| `GolfStatsDisplay.tsx` | 2,934 | 5 × ~500 | By category tab |
| `ShotTrackingComprehensive.tsx` | 2,336 | 4 × ~500 | By feature area |
| `ShotDispersionChart.tsx` | 1,934 | 3 × ~500 | Chart + controls + analysis |
| `IntelligenceCommandCenter.tsx` | 1,763 | 4 × ~400 | By panel/widget |
| `stats-client.tsx` | 1,135 | 3 × ~350 | Container + list + detail |

### 3.2 GolfStatsDisplay.tsx Decomposition

**Extract these sub-components:**

```
src/components/golf/stats/
├── GolfStatsDisplay.tsx        (~300 lines - container/orchestrator)
├── stats-overview/
│   ├── StatsOverviewTab.tsx    (~400 lines)
│   └── StatCard.tsx            (~100 lines)
├── stats-scoring/
│   ├── StatsScoringTab.tsx     (~500 lines)
│   └── ScoringBreakdown.tsx    (~200 lines)
├── stats-driving/
│   └── StatsDrivingTab.tsx     (~400 lines)
├── stats-approach/
│   └── StatsApproachTab.tsx    (~400 lines)
├── stats-putting/
│   └── StatsPuttingTab.tsx     (~400 lines)
├── stats-scrambling/
│   └── StatsScrambleTab.tsx    (~300 lines)
├── stats-strokes-gained/
│   └── StrokesGainedTab.tsx    (~400 lines)
└── shared/
    ├── Sparkline.tsx           (~100 lines) - already exists, extract
    ├── TrendIndicator.tsx      (~50 lines)
    └── StatFilter.tsx          (~150 lines)
```

### 3.3 Lazy Load Tab Content

**Current:** All tabs render on mount  
**Target:** Only active tab renders; others load on demand

```typescript
// PLANNED: Use React.lazy for tab content
const StatsOverviewTab = React.lazy(() => import('./stats-overview/StatsOverviewTab'));
const StatsScoringTab = React.lazy(() => import('./stats-scoring/StatsScoringTab'));
// etc.

// In render:
<Suspense fallback={<TabSkeleton />}>
    {activeTab === 'overview' && <StatsOverviewTab data={data} />}
    {activeTab === 'scoring' && <StatsScoringTab data={data} />}
</Suspense>
```

### 3.4 Memoize Expensive Calculations

**Identified computations to memoize:**
- `calculateStatsFromShots()` - expensive shot analysis
- `generateStatisticalStrengthsWeaknesses()` - strokes gained calc
- `buildSparkline()` - data transformation
- Trend calculations in player cards

```typescript
// PLANNED: Memoize heavy computations
const memoizedStats = useMemo(() => 
    calculateStatsFromShots(shots, holes, rounds),
    [shots, holes, rounds]
);
```

### 3.5 Virtualize Long Lists

**Components with potentially long lists:**
- Player roster (coach view)
- Round history
- Shot-by-shot breakdown

```typescript
// PLANNED: Use react-window for virtual scrolling
import { FixedSizeList } from 'react-window';

<FixedSizeList
    height={400}
    itemCount={rounds.length}
    itemSize={72}
>
    {({ index, style }) => (
        <RoundRow round={rounds[index]} style={style} />
    )}
</FixedSizeList>
```

---

## Part 4: Implementation Order

### Phase 1: Stop the Bleeding (Week 1)
**Goal:** Eliminate timeouts immediately

| Step | Task | Impact | Effort |
|------|------|--------|--------|
| 1.1 | Add `.limit(100)` to all unbounded stats queries | HIGH | LOW |
| 1.2 | Add query timeout wrapper with fallback | HIGH | LOW |
| 1.3 | Batch RSVP queries in dashboard-data.ts | MEDIUM | LOW |
| 1.4 | Add loading states to prevent re-fetches | MEDIUM | LOW |

### Phase 2: Database Optimization (Week 2)
**Goal:** Make queries fast at the source

| Step | Task | Impact | Effort |
|------|------|--------|--------|
| 2.1 | Create composite indexes (see 1.2) | HIGH | LOW |
| 2.2 | Query `golf_player_stats_cache` instead of computing | HIGH | MEDIUM |
| 2.3 | Create `get_team_dashboard_stats` RPC function | MEDIUM | MEDIUM |
| 2.4 | Create materialized view for dashboard | MEDIUM | MEDIUM |

### Phase 3: Component Splitting (Week 3-4)
**Goal:** Faster renders, better maintainability

| Step | Task | Impact | Effort |
|------|------|--------|--------|
| 3.1 | Extract shared components (Sparkline, TrendIndicator) | LOW | LOW |
| 3.2 | Split GolfStatsDisplay into tab-based modules | MEDIUM | HIGH |
| 3.3 | Add React.lazy for tab content | MEDIUM | LOW |
| 3.4 | Add useMemo for expensive calculations | MEDIUM | LOW |
| 3.5 | Virtualize player/round lists | MEDIUM | MEDIUM |

### Phase 4: Advanced Optimization (Week 5+)
**Goal:** Near-instant perceived performance

| Step | Task | Impact | Effort |
|------|------|--------|--------|
| 4.1 | Implement optimistic UI for common actions | MEDIUM | MEDIUM |
| 4.2 | Add stale-while-revalidate caching | MEDIUM | MEDIUM |
| 4.3 | Server-side streaming for dashboard | HIGH | HIGH |
| 4.4 | Edge caching for static data | LOW | MEDIUM |

---

## Part 5: Risks and Edge Cases

### 5.1 Data Freshness vs. Performance

**Risk:** Using cached stats may show stale data  
**Mitigation:** 
- Cache invalidation triggers already exist on `golf_rounds` table
- Show "Last updated X minutes ago" indicator
- Allow manual refresh button

### 5.2 Migration Complexity

**Risk:** Splitting 2,934-line component may introduce regressions  
**Mitigation:**
- Add E2E tests for stats page before refactoring
- Use TypeScript strictly (no `any` during refactor)
- Incremental extraction: one tab at a time

### 5.3 Index Maintenance Cost

**Risk:** Adding indexes increases write latency  
**Mitigation:**
- All proposed indexes are on read-heavy tables
- `golf_rounds` table has ~35 writes/day vs thousands of reads
- Use partial indexes to minimize storage

### 5.4 RPC Function Security

**Risk:** RPC functions may bypass RLS  
**Mitigation:**
- Use `SECURITY INVOKER` not `SECURITY DEFINER`
- Add explicit permission checks in function body
- Limit to authenticated users only

### 5.5 Breaking Changes

**Risk:** Component split may break imports elsewhere  
**Mitigation:**
- Keep original file as re-export barrel
- Use TypeScript path aliases
- Update all imports in single PR

---

## Part 6: Monitoring & Verification

### 6.1 Before Starting

```bash
# Baseline metrics to capture:
1. Dashboard load time (Vercel Analytics or Datadog)
2. API response times for /actions/dashboard-data
3. Supabase query durations (Supabase Dashboard → Logs)
4. Error rate in production
```

### 6.2 After Each Phase

| Metric | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|--------|---------------|----------------|----------------|
| Dashboard p95 | <10s | <5s | <3s |
| Stats p95 | <8s | <4s | <2s |
| Timeout rate | <10% | <2% | <1% |
| Error rate | <5% | <2% | <1% |

### 6.3 Monitoring Tools

- **Vercel Analytics:** Page load times, Web Vitals
- **Supabase Dashboard:** Query performance, slow query log
- **Sentry:** Error tracking, performance tracing
- **Custom logging:** Add `console.time()` around critical paths (dev only)

---

## Appendix A: Files to Modify

### High Priority (Phase 1-2)
```
src/app/golf/actions/dashboard-data.ts
src/app/golf/actions/stats-data.ts
src/app/golf/(dashboard)/dashboard/stats/stats-client.tsx
supabase/migrations/YYYYMMDD_performance_indexes.sql
```

### Medium Priority (Phase 3)
```
src/components/golf/stats/GolfStatsDisplay.tsx
src/components/golf/stats/ShotDispersionChart.tsx
src/components/golf/ShotTrackingComprehensive.tsx
src/components/golf/coachhelm/v2/IntelligenceCommandCenter.tsx
```

### New Files to Create
```
src/components/golf/stats/stats-overview/StatsOverviewTab.tsx
src/components/golf/stats/stats-scoring/StatsScoringTab.tsx
src/components/golf/stats/stats-driving/StatsDrivingTab.tsx
src/components/golf/stats/stats-putting/StatsPuttingTab.tsx
src/components/golf/stats/shared/Sparkline.tsx
src/lib/utils/query-helpers.ts (timeout wrapper, batch helpers)
```

---

## Appendix B: Unbounded Query Audit

**Total unbounded queries found:** 639

**By file (top offenders):**
| File | Unbounded Queries | Priority |
|------|-------------------|----------|
| `stats-data.ts` | ~45 | HIGH |
| `dashboard-data.ts` | ~20 | HIGH |
| `insights.ts` | ~80 | MEDIUM |
| `golf.ts` | ~60 | MEDIUM |
| `admin-data.ts` | ~50 | LOW (admin only) |

**Query patterns requiring limits:**
1. All `.select()` without `.limit()`, `.single()`, or `.maybeSingle()`
2. Trend/historical queries without date bounds
3. Shot-level queries for round analysis

---

## Appendix C: Component Size Analysis

| Component | Lines | Renders | Re-renders on State Change | Priority |
|-----------|-------|---------|---------------------------|----------|
| `GolfStatsDisplay.tsx` | 2,934 | Full on tab change | HIGH | CRITICAL |
| `ShotTrackingComprehensive.tsx` | 2,336 | Per shot input | HIGH | HIGH |
| `ShotDispersionChart.tsx` | 1,934 | On data change | MEDIUM | HIGH |
| `IntelligenceCommandCenter.tsx` | 1,763 | On panel toggle | MEDIUM | MEDIUM |
| `stats-client.tsx` | 1,135 | On player select | HIGH | HIGH |

---

*This plan is PLANNING ONLY. No code has been written. Implementation should proceed in phases with verification at each step.*

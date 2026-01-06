# Performance Optimization Plan

## Issues Identified

### 1. **Client-Side Dashboard (CRITICAL)**
- Dashboard page runs ALL queries on client-side sequentially
- Each query waits for previous one to complete
- No server-side caching
- **Impact**: 2-5 second initial load time

### 2. **Sequential Queries in Availability**
- `getUserBusyPeriods` runs 5+ queries sequentially
- Should run in parallel where possible
- **Impact**: 500ms-1s delay per availability check

### 3. **Over-fetching Data**
- Using `select('*')` when only need 2-3 columns
- Fetching entire objects when only need IDs
- **Impact**: 2-3x more data transferred

### 4. **Missing Composite Indexes**
- Queries filter by `team_id + start_date` but no composite index
- `player_id + status + round_date` queries could be faster
- **Impact**: Full table scans on large datasets

### 5. **No Query Result Caching**
- Calendar has `revalidate=60` but dashboard doesn't
- Availability queries run every time (no cache)
- **Impact**: Repeated database hits for same data

### 6. **Layout Sequential Queries**
- Layout queries coach, then if not found queries player
- Could query both in parallel
- **Impact**: 100-200ms wasted on every page load

## Optimization Strategy

### Phase 1: Database Indexes (Quick Win)
- Add composite indexes for common query patterns
- Estimated improvement: 30-50% faster queries

### Phase 2: Parallel Queries (High Impact)
- Convert sequential queries to parallel Promise.all()
- Estimated improvement: 50-70% faster page loads

### Phase 3: Server Components (Critical)
- Convert dashboard to server component
- Add caching headers
- Estimated improvement: 60-80% faster initial load

### Phase 4: Query Optimization (Medium Impact)
- Replace select('*') with specific columns
- Add pagination where appropriate
- Estimated improvement: 20-40% less data transfer

### Phase 5: React Optimizations (Polish)
- Add React.memo to expensive components
- Use useMemo for computed values
- Estimated improvement: Smoother UI interactions

## Expected Results

**Before:**
- Dashboard load: 2-5 seconds
- Tab transitions: 500ms-1s
- Availability check: 500ms-1s

**After:**
- Dashboard load: 0.5-1 second
- Tab transitions: 100-200ms
- Availability check: 200-300ms

**Overall improvement: 70-80% faster**

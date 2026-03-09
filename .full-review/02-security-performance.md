# Phase 2: Security & Performance Review

## Security Findings

### Critical
**SEC-1: RLS Policies Reference Non-Existent Columns** (CWE-863)
- Original policies in migration 034 reference `golf_coaches.team_id` which doesn't exist. Later migrations added correct policies using `is_golf_team_coach()`. Production currently has BOTH broken and correct policies. The broken ones are inert (return zero rows) while correct ones work. Confirmed via production `pg_policies` query.
- **Status**: Mitigated by correct policies already in production. Broken policies should be cleaned up.

### High
**SEC-2: Silent Success on Zero-Row Update/Delete** (CWE-754)
- Same as CQ-1. `updateGolfEvent` and `deleteGolfEvent` return `{ success: true }` when 0 rows affected. Masks authorization failures.
- **Fix**: Add `.select('id')` and verify row count.

### Medium
**SEC-3: No UUID Validation on eventId Parameter** (CWE-20)
- `eventId` in update/delete accepts unvalidated string. PostgreSQL rejects non-UUIDs, but this violates defense-in-depth.
- **Fix**: Add `z.string().uuid()` validation.

**SEC-4: Players Can Trigger Update/Delete on Same-Team Events** (CWE-285)
- `updateGolfEvent` and `deleteGolfEvent` allow players to pass the team_id ownership check. Only the UI restricts editing to coaches. `createGolfEvent` correctly has a coach-only guard.
- **Fix**: Add `if (!coach) return { success: false, error: 'Only coaches can update/delete team events' }` before mutations.

### Low
**SEC-5: String Fields Lack Content Sanitization** (CWE-79) — Title/location/description have length limits but no content sanitization. React auto-escapes, but notification templates may not.
**SEC-6: Bare Date in timestamptz** (CWE-704) — Can shift event dates across timezone boundaries. Not exploitable for privilege escalation.
**SEC-7: Client-Side Authorization Is Cosmetic** (CWE-602) — `isCoach` prop gates UI but server actions don't enforce.
**SEC-8: Attendance Management Lacks Player Validation** (CWE-862) — attendeeIds not validated against team membership.

---

## Performance Findings

### High
**PERF-1: Sequential Query Waterfall in updateGolfEvent**
- 5-7 sequential DB round-trips adding 200-400ms per update.
- **Fix**: Parallelize auth+role lookups; make notifications fire-and-forget.

### Medium
**PERF-2: O(days x events) Rendering in MonthView/WeekView**
- `getEventsForDate` runs full filter over all events per day cell. 100 events x 42 cells = 4,200 iterations with Date allocations.
- **Fix**: Pre-index events into `Map<string, CalendarEvent[]>` keyed by date string.

**PERF-3: Double-Refresh via Realtime + router.refresh()**
- Every save triggers two full server re-renders (explicit refresh + realtime subscription).
- **Fix**: Debounce realtime handler with 2-second cooldown after explicit refresh.

**PERF-4: Bare Dates in timestamptz May Cause Timezone Query Issues**
- Same as SEC-6/AR-4. Bare date strings interpreted as midnight in server timezone.
- **Fix**: Always store `T00:00:00+00:00` for all-day events.

**PERF-5: N+1 Notification Queries in createGolfEvent**
- 4 sequential queries + 2 async calls for notifications. Could be combined into single join.
- **Fix**: Single query: `golf_team_members JOIN golf_players JOIN users`.

### Low
**PERF-6: router.refresh() Triggers Full Page Re-render** — ~200-500ms per save. Fix: optimistic UI updates.
**PERF-7: O(n^2) Overlap Layout in WeekView** — Negligible at current scale (<20 events/day).
**PERF-8: Realtime Subscription Churn on Refresh** — Channel torn down/recreated on every refresh due to prop identity change.

---

## Critical Issues for Phase 3 Context

1. **SEC-4 (Players can update/delete)**: Tests should verify that player-initiated mutations are rejected
2. **PERF-2 (O(days*events))**: Test coverage should include rendering performance with large event sets
3. **SEC-2/CQ-1 (Silent success)**: Integration tests should verify that 0-row updates return failure

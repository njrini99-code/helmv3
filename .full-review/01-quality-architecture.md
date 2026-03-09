# Phase 1: Code Quality & Architecture Review

## Executive Summary

Both reviews converge on the same root causes: the RLS migration was **redundant** (policies were already correct), and the real issues are in the application code. Two Critical issues and several High-severity bugs explain why event editing doesn't persist.

## Code Quality Findings

### Critical

**CQ-1: Silent Update Failure — No Row Count Verification**
- **File:** `src/app/golf/actions/golf.ts:1555`
- `updateGolfEvent` does `const { error } = await query;` — Supabase returns no error when 0 rows are affected (RLS blocks or filter mismatch). Action returns `{ success: true }` even when nothing was saved.
- **Fix:** Add `.select('id')` and verify returned array is non-empty.

### High

**CQ-2: `allDay` Flag Derived from Parsed Time, Not Database Value (Desktop)**
- **File:** `src/components/golf/calendar/EventDetailModal.tsx:295,307`
- Form sets `allDay: !hasTime` where `hasTime` comes from datetime parsing. The `event.all_day` DB boolean is ignored. All-day events get normalized to `T00:00:00` by the server page, so `hasTime` is always `true`, converting all-day events to timed events on edit.
- **Fix:** Use `event.all_day ?? false` directly.

**CQ-3: Same `allDay` Bug in MobileEventSheet**
- **File:** `src/components/golf/calendar/MobileEventSheet.tsx:168`
- `allDay: !startTime && !endTime` — same problem as CQ-2.
- **Fix:** Use `event.all_day ?? false` directly.

**CQ-4: Time-Only Edit Can Strip Time Component**
- **File:** `src/app/golf/actions/golf.ts:65-69`
- `buildDateTimeString` returns date-only when `time` is undefined/falsy. If form sends `startTime: null ?? undefined = undefined` for a timed event, the time is silently stripped.
- **Fix:** Guard against undefined time when `allDay` is false.

### Medium

**CQ-5: `??` vs `||` Coercion Asymmetry Between Desktop and Mobile**
- **File:** `PremiumCalendarClient.tsx:465` (desktop `??`) vs line 889 (mobile `||`)
- Empty string `""` passes through `??` but not `||`. Can produce malformed datetime like `"2026-03-07T"`.
- **Fix:** Standardize on `||` or add `.min(1)` to Zod time fields.

**CQ-6: `deleteGolfEvent` Same Silent Failure Pattern**
- **File:** `src/app/golf/actions/golf.ts` (deleteGolfEvent function)
- Same issue as CQ-1 — no row count verification on delete.

### Low

**CQ-7: `isMandatory` Always Reset to False on Edit** — EventDetailModal:311
**CQ-8: No Visual Multi-Day Spanning** — MonthView/WeekView render separate blocks per day
**CQ-9: Duplicate RLS Policies** — Harmless but should be cleaned up

---

## Architecture Findings

### Critical

**AR-1: Silent Success on Zero-Row Update** (same as CQ-1)
- The entire error propagation chain Client -> Server Action -> Supabase has a gap where success is reported but nothing changed. This is the most likely root cause.

**AR-2: All-Day Detection Heuristic Destroys Times on Edit** (same as CQ-2/CQ-3)
- The heuristic ignores the authoritative `event.all_day` boolean. Combined with server-side date normalization, this creates a data corruption loop.

### High

**AR-3: Duplicated Save Logic Across Desktop and Mobile**
- Three separate save implementations with subtle differences (field sets, null coalescing, error handling).
- **Fix:** Extract shared `buildEventPayload()` function.

**AR-4: Bare Date Strings in timestamptz Column**
- `src/app/golf/actions/golf.ts:1531` stores `endDate` as bare date string (e.g., `"2026-03-15"`) in a `timestamptz` column. Postgres interprets this as midnight UTC, shifting the date backward in western timezones.
- **Fix:** Never store date-only strings in timestamptz; always construct full timestamps.

**AR-5: Form Type Divergence Between Desktop and Mobile**
- `GolfEventFormData` has 14 fields; `MobileEventFormData` has 8. Mobile edits don't include RSVP/attendee fields.

### Medium

**AR-6: Unused `useCalendarEvents` Hook Creates Dual Data Paths**
**AR-7: `router.refresh()` Creates Stale Data Window**
**AR-8: Multi-Day Event Query Misses Events Starting Before Visible Range**
- `.gte('start_time', threeMonthsAgo)` excludes events whose end_time extends into visible range.

### Low

**AR-9: `GolfEventInput` Type vs Zod Schema Mismatch**
**AR-10: Error Presentation — Errors Thrown Into Void**

---

## Critical Issues for Phase 2 Context

1. **Silent update success** (CQ-1/AR-1) — Security review should verify if this creates an authorization bypass where users believe they've modified data they can't actually change
2. **Bare date in timestamptz** (AR-4) — Performance review should check if timezone-dependent queries return incorrect results
3. **No error feedback to user** (AR-10) — After fixing CQ-1, errors need to surface in the UI

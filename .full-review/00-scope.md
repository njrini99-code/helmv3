# Review Scope

## Target

Determine whether the golf_events RLS migration fully resolves the reported calendar issues:
1. Can't edit events (UPDATE silently fails)
2. Multi-day events don't show correct date range
3. Can't edit time of qualifier (UPDATE doesn't persist)
4. Event creation populates wrong date range

## User Report (from Ben - screenshot)
- "It's not letting me edit, or when I create, it won't populate to the correct date range"
- "It'll just show up on one day, and not all the dates if it is multiple"
- "when I try to edit the time of the qualifier next week it does not edit when I save it"

## RLS Migration Applied
Fixed `golf_events` UPDATE and DELETE policies to use `is_golf_team_coach(team_id)` instead of broken `golf_coaches.team_id` lookup.

## CRITICAL FINDING: Pre-existing Correct Policies
The production database ALREADY had correctly-named policies before this migration:
- `golf_events_insert_coach` (INSERT) — already using `is_golf_team_coach(team_id)`
- `golf_events_update_coach` (UPDATE) — already using `is_golf_team_coach(team_id)`
- `golf_events_delete_coach` (DELETE) — already using `is_golf_team_coach(team_id)`

Our migration created DUPLICATE policies with plural names (`golf_events_update_coaches`, `golf_events_delete_coaches`). The RLS was NOT the root cause of the current issues.

## Files Under Review

### Server Actions (Event CRUD)
- `src/app/golf/actions/golf.ts` — updateGolfEvent (line 1447), createGolfEvent (line 1256), deleteGolfEvent (line 1613), buildDateTimeString (line 65)

### Calendar Components (Event Forms)
- `src/components/golf/calendar/PremiumCalendarClient.tsx` — handleSaveEvent (line 433)
- `src/components/golf/calendar/MobileCalendarWrapper.tsx` — handleSaveEvent (line 111)
- `src/components/golf/calendar/EventDetailModal.tsx` — GolfEventFormData, form population
- `src/components/golf/calendar/MobileEventSheet.tsx` — MobileEventFormData

### Calendar Display (Multi-day)
- `src/components/golf/calendar/MonthView.tsx` — multi-day event rendering
- `src/components/golf/calendar/WeekView.tsx` — multi-day event spanning

### Database
- `supabase/migrations/034_all_rls_policies.sql` — original broken policies
- `supabase/migrations/20260204200000_fix_golf_rls_infinite_recursion.sql` — is_golf_team_coach function
- Production policies (7 active on golf_events, including duplicates)

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js (App Router)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report

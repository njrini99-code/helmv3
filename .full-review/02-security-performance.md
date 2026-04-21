# Phase 2: Security & Performance Review

Detailed findings:
- `02a-security.md` — security-auditor agent
- `02b-performance.md` — performance engineer agent

## Findings consolidated by severity

### CRITICAL

#### S-C4 (NEW). PostgREST filter injection in CRM Resend email search
**Source:** 2A
**File:** `src/app/golf/actions/resend-activity.ts:187-195`
**Issue:** `filters.search` was interpolated directly into `.or(...)` with `subject.ilike.%${q}%,from_address.ilike.%${q}%,to_addresses.cs.{${q}}`. Admin-supplied search input could inject arbitrary PostgREST filter terms (commas split OR clauses, braces delimit array literals, etc.). Admin-only scope, but the admin boundary is the only gate before all Resend email PII.
**Status:** **FIXED** in commit `3fd4f91d` — `.replace(/[,()\\:{}%]/g, '')` strips metacharacters before use.

#### P-C1 (NEW). Migration 00004 had hallucinated column names — admin rollup broken in production
**Source:** 2B
**File:** `supabase/migrations/20260421000004_secure_perf_rpcs.sql`
**Issue:** My earlier hotfix used column names that don't exist on the actual schema:
- `users.last_seen_at` (actual: `last_seen`)
- `golf_coaches.onboarded_at` (actual: `onboarding_completed`)
Also replaced 00001's single-pass `signup_trend` CTE with 30 correlated sub-selects (~1.5s at 1M users). The call site swallows the error via `.catch(() => null)` so this was silently broken — the entire "95 queries → 1 RPC" win was reverted.
**Status:** **FIXED** in commit `1072ae5b` — migration rewritten to preserve 00001's body verbatim, only wraps it in the admin-role check.

#### P-C2 (NEW). `get_coach_today_schedule` had two live overloads
**Source:** 2B
**File:** `supabase/migrations/20260421000004_secure_perf_rpcs.sql`
**Issue:** Original 00003 defines `get_coach_today_schedule(uuid, timestamptz, timestamptz)` — **3 args**. My first hotfix added a NEW 2-arg version `(uuid, date)` alongside, so Postgres had both. The TS call site hits the 3-arg version which had NO ownership check — the "fix" was dead code.
**Status:** **FIXED** in commit `1072ae5b` — `DROP FUNCTION IF EXISTS public.get_coach_today_schedule(uuid, date)`, then redefine the 3-arg version with the ownership guard.

### Phase 1 criticals verified closed

Phase 2A confirmed all three Phase 1 critical fixes landed correctly (after the corrected commit above):
- Cross-tenant RPC data leak → closed by auth.uid() ownership guards
- Admin RPC readable by non-admins → closed by admin-role gate
- `unstable_cache` cookies violation → closed by auth-check-outside-cache pattern

### HIGH

#### S-H1. Unfiltered realtime on `email_events`
**Source:** 2A
**File:** `src/app/golf/admin/crm/components/resend/LiveActivityFeed.tsx:50-72`
**Issue:** `.channel().on('postgres_changes', { table: 'email_events', event: 'INSERT' })` has no `filter:`. RLS protects the data, but any admin token compromise = full PII firehose. Also bulk campaigns stream 1000+ events per burst to every open admin tab.
**Recommendation:** add `filter: 'sent_at=gte.<ts>'` + rate-limit UI updates. Defer to wave-3.

#### S-H2/H3. Sibling non-RPC queries still rely on RLS alone
**Source:** 2A
**Files:** `src/app/golf/actions/dashboard-data.ts`, `src/app/golf/actions/player-notifications.ts`, `src/app/golf/(dashboard)/dashboard/hub/page.tsx`
**Issue:** The RPC hotfix closed the RPC path, but adjacent `.from('golf_events')` / `.from('golf_announcements')` calls in the same actions still pass caller-supplied `teamId`/`playerId` and rely on RLS alone. If RLS is incorrectly scoped anywhere, the unauthed path is still open.
**Recommendation:** audit RLS policies on `golf_events`, `golf_announcements`, `golf_event_attendance`, `golf_announcement_*`. Add defense-in-depth ownership guards to the actions themselves. Defer to wave-3 unless RLS audit reveals a gap.

#### P-H1. PlayerHub `React.memo` defeated by inline callback props
**Source:** 2B, matches Phase 1A M1
**File:** `src/components/golf/player-hub/PlayerHub.tsx`
**Issue:** TripCard / PlayerTaskCard / EventRSVPCard are `React.memo`'d, but parent passes fresh inline arrow callbacks (`onExpand={() => setSelectedTrip(trip)}`, `onComplete={() => handleCompleteTask(task.id)}`, etc.) every render. New function identities defeat memo comparators → cards re-render anyway.
**Recommendation:** use per-id `useCallback` (e.g., a stable `Map<id, callback>`) OR drop the `React.memo` as dead weight. Defer to wave-3; memoization still wins on the per-mount `now` effect removal.

#### P-H5. 17 admin files still import `motion` (not `m`)
**Source:** 2B, expanded from Phase 1 H1
**Files:** 17 files under `src/app/golf/admin/` including `AdminStatCard.tsx`, `TracerHealthOverview.tsx`, `LiveActivityFeed.tsx`, all of `crm/components/resend/*.tsx`, `tracer/*.tsx`, and more
**Issue:** Despite the marketing-page sweep + `<LazyMotion>` wrapper added in this commit cycle, 17 admin files still use `<motion.X>` instead of `<m.X>`. The full framer-motion feature bundle (~30KB gz) is still loaded on admin chunks.
**Recommendation:** scripted sweep — `motion` → `m` across all 17 files, verify via grep. Deferred to wave-3 due to scope (17 files × mechanical replacement + typecheck verification).

#### P-H2. `invalidateAdminDashboardRollup` uses `revalidatePath`, not tag
**Source:** 2B
**File:** `src/app/golf/actions/admin-data.ts:82-88`
**Issue:** The cache tag `admin-dashboard` is now dead code — `invalidateAdminDashboardRollup()` calls `revalidatePath('/golf/admin')` instead. The 60s `unstable_cache` revalidate window is the only freshness guarantee; the tag-based invalidation never fires.
**Recommendation:** either remove the tag metadata OR wire `revalidateTag` with the correct Next.js 16 signature once the API stabilizes. Accept 60s staleness for now.

### MEDIUM

#### P-M1. `LiveActivityFeed` realtime subscription doesn't pause on tab hide
**Source:** 2B
**File:** `src/app/golf/admin/crm/components/resend/LiveActivityFeed.tsx:46-77`
**Issue:** The 30s tick and 60s stats poll were wrapped in `useVisibilityAwareInterval` (good), but the actual realtime channel `.channel().on(...).subscribe()` keeps running when the tab is hidden. Bulk campaigns during off-hours still stream events into the background, allocating memory and triggering setState.
**Recommendation:** unsubscribe on `document.visibilityState === 'hidden'`, resubscribe on visible. Could reuse `useVisibilityAwareInterval` pattern. Easy win, defer to wave-3.

#### S-M4. Service-role client has no runtime context guard
**Source:** 2A
**File:** `src/lib/supabase/admin.ts`
**Issue:** `createAdminClient()` returns a full service-role Supabase client with no check that the caller is server-side. If it's ever imported and used from a client component accidentally, the service role key would NOT be exposed (env vars are server-side) but the code would throw confusingly.
**Recommendation:** add `if (typeof window !== 'undefined') throw new Error('createAdminClient is server-only')` at the top. Belt-and-suspenders.

#### S-M1/M2. Webhook always-200 posture
**Source:** 2A (pre-existing)
**File:** `src/app/api/webhooks/resend/route.ts`
**Issue:** Resend webhook dedup errors + processing errors return 200 to suppress Resend retries. Hides real incidents from monitoring.
**Recommendation:** log to Sentry on dedup-miss + internal failure; keep 200 response. Defer.

### LOW

#### S-L2. `email_clicks.ip_address` stored plaintext with no TTL
**Source:** 2A
**File:** `supabase/migrations/20260421000000_email_clicks_and_coach_denorm.sql`
**Issue:** IP addresses stored indefinitely on email-click events. GDPR consideration — IPs are personal data in EU.
**Recommendation:** add a TTL cleanup job (30-90 days) via pg_cron, OR truncate the last octet on ingest.

#### L-assorted. Pre-existing TS6133 unused-import warnings
93+ in the codebase; unchanged by this diff.

## Critical Issues for Phase 3 Context

Phase 3 (testing + documentation) should know:
- All three "new critical" findings (S-C4, P-C1, P-C2) **are fixed** — Phase 3 should verify the fixes are covered by tests (likely none exist; worth flagging as test coverage gaps)
- The dashboard RPCs have zero integration tests — Phase 3 should recommend adding them
- Migrations aren't currently test-covered — worth flagging

## Fixes landed this session (commits)

- `3fd4f91d` — PostgREST filter injection fix (Resend search sanitizer)
- `94291a19` — Next.js 16 `revalidateTag` signature fix (before review)
- `850632e7..1072ae5b` range includes the corrected migration 00004

## Wave-3 backlog (from Phase 2)

1. PlayerHub inline-callback stabilization (P-H1)
2. Admin framer-motion sweep across 17 files (P-H5)
3. `email_events` realtime filter + visibility-aware subscription (S-H1 + P-M1)
4. Defense-in-depth ownership guards on adjacent `.from()` queries (S-H2/H3)
5. Service-role client runtime guard (S-M4)
6. Webhook Sentry wiring (S-M1/M2)
7. `email_clicks.ip_address` TTL (S-L2)

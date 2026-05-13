# Security Hardening Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 16 findings across three Codex Security reviews (shared calendar, admin dashboard / error tracking, CoachHelm accuracy). Already shipped tonight via separate migration (`20260511200000`): golf_messages UPDATE policy + `get_golf_message_attachments` RPC.

**Architecture:** Three phases, ordered by risk × effort.
- **Phase 1 — Tonight hotfix:** RLS tightening + auth-required routes. Single SQL migration + 2 route patches. Same shape as the migration we shipped earlier today.
- **Phase 2 — Next-sprint route hardening:** Server-action input validation, RSVP/conflict authorization, stack-trace scrubbing. No DDL.
- **Phase 3 — Product-decision workstreams:** CoachHelm evidence pipeline + admin BI metric accuracy. These are refactors plus copy/labeling decisions, not hotfixes — written as scoped sub-plans, not TDD tasks.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), TypeScript strict. Production DB: `qmnssrrolpinvwjjnufo` (Helm-Production). Migration history has 28+ ghost migrations (drift) — Phase 1 ships via dashboard SQL editor, not `supabase db push`.

**Verification pattern:** Each Phase 1 + 2 task lands with:
1. Code edit or SQL migration.
2. A `pg_policy` / `pg_proc` / route-level verification query or curl.
3. Atomic commit (one task per commit).

---

## Phase 1 — Tonight Hotfix (3 findings, ~30 min)

### Task 1: RLS tightening — `golf_calendar_feeds` + `error_logs`

**Files:**
- Create: `supabase/migrations/20260511220000_calendar_feeds_and_error_logs_rls_hardening.sql`

**Findings addressed:**
- Calendar **High**: `golf_calendar_feeds` USING-only policy lets a user point their own feed row at any team and export it via `/api/calendar/feeds/[token]` (admin-client export, RLS-bypassed).
- Admin **Medium**: `error_logs` INSERT policy is `WITH CHECK (true)` for both `anon` and `authenticated` — clients can write arbitrary log rows directly bypassing the API route.

**Background context (cite once, used by Tasks 1–3):**
- Existing `golf_calendar_feeds` policy: `supabase/migrations/20260427210000_canonical_rls_snapshot.sql:1655` — USING `user_id = auth.uid()`, no `WITH CHECK`, no team constraint.
- Existing `error_logs` INSERT: same file, line 1499 — `WITH CHECK (true)` for `anon, authenticated`.
- Membership helpers already in the database: `is_golf_team_coach(team_id)` and `is_golf_team_player(team_id)` — used throughout `golf_event_attendance` policies (same file, line 1925+). These return `true` when `auth.uid()` is a staff member or active player on `team_id`.

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260511220000_calendar_feeds_and_error_logs_rls_hardening.sql
--
-- Closes two findings from the 2026-05-11 Codex Security reviews:
--   Calendar High — golf_calendar_feeds: any authenticated user can insert/update
--     a feed row pointing at another team's team_id; the /api/calendar/feeds/[token]
--     route then uses an admin client to export that team's events via the token.
--   Admin   Medium — error_logs INSERT WITH CHECK (true) lets clients bypass
--     /api/log-error and write arbitrary log rows directly via PostgREST.

BEGIN;

-- Calendar feeds: scope writes to the user's own teams (coach OR active player).
DROP POLICY IF EXISTS "Users can manage their own feeds" ON public.golf_calendar_feeds;

CREATE POLICY golf_calendar_feeds_select_own ON public.golf_calendar_feeds
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY golf_calendar_feeds_insert_own_team ON public.golf_calendar_feeds
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR is_golf_team_coach(team_id)
      OR is_golf_team_player(team_id)
    )
  );

CREATE POLICY golf_calendar_feeds_update_own_team ON public.golf_calendar_feeds
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND (
      team_id IS NULL
      OR is_golf_team_coach(team_id)
      OR is_golf_team_player(team_id)
    )
  );

CREATE POLICY golf_calendar_feeds_delete_own ON public.golf_calendar_feeds
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- error_logs: bind authenticated writes to the caller's uid; reject anon direct
-- inserts entirely (the /api/log-error route uses the admin client for the
-- "anonymous client crash" case after auth has been verified server-side).
DROP POLICY IF EXISTS "Anyone can create error logs" ON public.error_logs;

CREATE POLICY error_logs_insert_authenticated_self ON public.error_logs
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMIT;
```

- [ ] **Step 2: Apply via Supabase SQL Editor**

Open: `https://supabase.com/dashboard/project/qmnssrrolpinvwjjnufo/sql/new`
Paste the migration body, click Run. Confirm the "destructive operations" warning (DROP POLICY) and Run.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify policies landed**

Paste in a new SQL editor tab and Run:

```sql
SELECT polname, polcmd,
       pg_get_expr(polqual, polrelid)      AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy
WHERE polrelid IN ('public.golf_calendar_feeds'::regclass,
                   'public.error_logs'::regclass)
ORDER BY polrelid::text, polname;
```

Expected rows include:
- `golf_calendar_feeds_insert_own_team` — `polcmd=a`, `check_expr` mentions `is_golf_team_coach` + `is_golf_team_player`.
- `golf_calendar_feeds_update_own_team` — `polcmd=w`, same `check_expr`.
- `error_logs_insert_authenticated_self` — `polcmd=a`, `check_expr=(user_id = auth.uid())`.
- The old `"Anyone can create error logs"` and `"Users can manage their own feeds"` policies are **gone**.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260511220000_calendar_feeds_and_error_logs_rls_hardening.sql
git commit -m "fix(security): tighten golf_calendar_feeds + error_logs RLS

Closes Codex Security calendar-High (feed team_id cross-team export) and
admin-Medium (error_logs WITH CHECK (true) bypass)."
```

---

### Task 2: Defense-in-depth — `/api/calendar/feeds/[token]` re-validates feed.team_id

**Files:**
- Modify: `src/app/api/calendar/feeds/[token]/route.ts` — after the existing feed lookup at line 188.

**Finding addressed:** Calendar **High** (route side). Task 1 stops new cross-team feed rows from being written. Task 2 ensures that any pre-existing or service-role-inserted feed row is re-verified server-side before we export with the admin client.

- [ ] **Step 1: Add ownership re-check between feed lookup and event query**

In `src/app/api/calendar/feeds/[token]/route.ts`, after the existing block that fetches `feed` (lines 188–197), and before the `last_synced_at` update at line 202, insert:

```typescript
    // Defense in depth: even though RLS now requires the feed owner to be
    // a coach/player on feed.team_id at insert/update time, we re-verify
    // here in case of legacy rows or service-role writes. If the feed's
    // owner is no longer authorized for the team, return 404 — do NOT
    // leak that the token is otherwise valid.
    if (typedFeed.team_id) {
      const { data: authorized } = await supabase.rpc('is_user_on_team', {
        p_user_id: typedFeed.id ? undefined : undefined, // placeholder — see Step 2
        p_team_id: typedFeed.team_id,
      });
      void authorized; // replaced below
    }
```

NOTE: the RPC does not exist yet. We need a small helper. See Step 2.

- [ ] **Step 2: Add `is_user_on_team(p_user_id UUID, p_team_id UUID)` SQL helper**

Append to the same migration file from Task 1 (before `COMMIT`), or create a second migration. Recommended: append to Task 1 so the whole hotfix is atomic. Insert before `COMMIT;`:

```sql
-- Helper used by /api/calendar/feeds/[token] and /api/calendar/coach/[token]
-- to re-verify, server-side, that a token holder still has team authorization.
CREATE OR REPLACE FUNCTION public.is_user_on_team(p_user_id UUID, p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- coach staff
    SELECT 1
    FROM public.golf_team_coach_staff tcs
    JOIN public.golf_coaches c ON c.id = tcs.coach_id
    WHERE tcs.team_id = p_team_id
      AND c.user_id   = p_user_id
  ) OR EXISTS (
    -- active player
    SELECT 1
    FROM public.golf_team_members tm
    JOIN public.golf_players p ON p.id = tm.player_id
    WHERE tm.team_id = p_team_id
      AND p.user_id  = p_user_id
      AND tm.status  = 'active'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_user_on_team(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_user_on_team(UUID, UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_user_on_team(UUID, UUID) TO authenticated, service_role;
```

(If you append to Task 1's migration, re-apply via the SQL editor and re-verify with the Task 1 Step 3 query plus:
```sql
SELECT proname, prosecdef FROM pg_proc
WHERE proname = 'is_user_on_team' AND pronamespace = 'public'::regnamespace;
```
Expected: one row, `prosecdef = true`.)

- [ ] **Step 3: Replace the placeholder in the route**

In `src/app/api/calendar/feeds/[token]/route.ts`, replace the placeholder block from Step 1 with the real check. Note we need feed `user_id` — extend the select on line 190 first:

```typescript
    // existing query was:
    //   .select('id, feed_token, feed_type, team_id, name, is_active, last_synced_at')
    // change to:
    const { data: feed, error: feedError } = await supabase
      .from('golf_calendar_feeds')
      .select('id, feed_token, feed_type, team_id, name, is_active, last_synced_at, user_id')
      .eq('feed_token', token)
      .eq('is_active', true)
      .single();
```

And update the `CalendarFeed` interface at line 54 to include `user_id: string`.

Then replace the placeholder block with:

```typescript
    if (typedFeed.team_id) {
      const { data: authorized, error: authError } = await supabase.rpc('is_user_on_team', {
        p_user_id: typedFeed.user_id,
        p_team_id: typedFeed.team_id,
      });
      if (authError || authorized !== true) {
        return new NextResponse('Invalid or inactive feed', { status: 404 });
      }
    }
```

(404, not 403, to avoid leaking that the token itself is valid.)

- [ ] **Step 4: Live-test against staging or a throwaway feed row**

1. Create a feed row pointing at a team you DO belong to → `curl` the token URL → expect 200 + iCal body.
2. Manually update that feed row via the SQL editor (which uses service_role and bypasses RLS) to point at a `team_id` you do NOT belong to → `curl` → expect 404.
3. Restore the row.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calendar/feeds/[token]/route.ts \
        supabase/migrations/20260511220000_calendar_feeds_and_error_logs_rls_hardening.sql
git commit -m "fix(security): re-verify calendar feed team authorization server-side

Defense-in-depth for Codex Security calendar-High: even with the new RLS
WITH CHECK constraint, the public token route re-validates that the feed
owner is still authorized for feed.team_id via is_user_on_team(). Adds
the SECURITY DEFINER helper to the same migration."
```

---

### Task 3: Defense-in-depth — `/api/calendar/coach/[token]` requires coach owns team

**Files:**
- Modify: `src/app/api/calendar/coach/[token]/route.ts` — between line 53 and line 56.

**Finding addressed:** Calendar **Medium**. Same defense-in-depth, but the coach iCal route also has a `feed.team_id` fallback that prefers the feed's team without checking the coach is staff on it.

- [ ] **Step 1: Insert authorization check between coach lookup and `teamId` resolution**

In `src/app/api/calendar/coach/[token]/route.ts`, after line 53 (the `if (!coach)` block), and before the `let teamId = feed.team_id;` at line 56, insert:

```typescript
    // If the feed pins a team_id, the coach MUST be staff on that team.
    // Otherwise an authenticated user who can write a feed row (or a legacy
    // row that predates the RLS fix) could export another team's events.
    if (feed.team_id) {
      const { data: authorized, error: authError } = await supabase.rpc('is_user_on_team', {
        p_user_id: feed.user_id,
        p_team_id: feed.team_id,
      });
      if (authError || authorized !== true) {
        return new NextResponse('Invalid or disabled feed', { status: 404 });
      }
    }
```

- [ ] **Step 2: Verify the existing select already returns `user_id`**

Line 35 already selects `'id, user_id, team_id, name, is_active'` — no schema change needed.

- [ ] **Step 3: Live-test parity with Task 2**

Create a feed row pointing at the coach's own team → 200. Repoint to a team the coach is not staff on (via SQL editor) → 404. Restore.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/calendar/coach/[token]/route.ts
git commit -m "fix(security): coach iCal route requires coach is staff on feed.team_id

Defense-in-depth for Codex Security calendar-Medium. Mirrors Task 2."
```

---

### Task 4: `/api/log-error` requires authenticated user; reroute anon crash reports

**Files:**
- Modify: `src/app/api/log-error/route.ts` — auth gate around line 16.

**Finding addressed:** Admin **High**. Currently anonymous POSTs can write arbitrary `error_logs` AND `admin_events` rows using the service-role admin client, poisoning admin telemetry.

**Decision point:** the simplest defensible fix is to require auth and drop the anonymous-crash-report use case for now. If you want anonymous crash reports to keep working, that's a follow-up Task (4b) that creates an `untrusted_crash_reports` table promoted server-side after filtering. Phase 1 ships the auth gate only.

- [ ] **Step 1: Add auth gate**

In `src/app/api/log-error/route.ts`, replace the existing block (lines 15–17) with:

```typescript
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const errorReport = await request.json();
    const adminClient = createAdminClient();
```

(Note: this also moves the `request.json()` parse after the auth check so we don't waste work on anon requests.)

- [ ] **Step 2: Bind `user_id` to the authenticated user (don't trust the body)**

In the same file, the two `user_id: user?.id ?? null` assignments (lines 66 and 75) — change to `user_id: user.id`. The `?? null` paths are now unreachable.

Same for `user_email: user?.email ?? null` (line 76) → `user_email: user.email ?? null` (`user.email` itself can be null for OAuth-only accounts, that part is correct).

- [ ] **Step 3: Live-test**

```bash
# unauthenticated
curl -X POST https://helmsportslabs.com/api/log-error \
  -H 'content-type: application/json' \
  -d '{"message":"poison","severity":"critical"}'
# expect: HTTP 401, body {"success":false}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/log-error/route.ts
git commit -m "fix(security): /api/log-error requires authenticated user

Closes Codex Security admin-High: anonymous POSTs could write arbitrary
error_logs + admin_events rows via the service-role client, poisoning
admin dashboard incident counts. Anonymous crash-report ingestion is
deferred to a separate untrusted-table pipeline (Phase 2 follow-up)."
```

---

## Phase 2 — Next-Sprint Route Hardening (6 findings)

These are smaller, route-level fixes. Each is one file, one diff, no DDL. Bundle into one PR if you like.

### Task 5: `/api/admin/log-event` — restrict to admins

**Files:**
- Modify: `src/app/api/admin/log-event/route.ts` — auth block at lines 176–184.

**Finding:** Admin **Medium**. Endpoint requires auth but not admin role, while `AdminErrorHandler` is mounted in the root layout (`src/app/layout.tsx:111`), so any logged-in user can fabricate admin telemetry events.

- [ ] **Step 1: After the existing `if (!user)` guard at line 183, add an admin check.**

```typescript
    const { data: roleRow } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (roleRow?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Admin role required' },
        { status: 403 }
      );
    }
```

- [ ] **Step 2: Audit `AdminErrorHandler` call sites**

```bash
grep -rn "AdminErrorHandler\|/api/admin/log-event" src/
```

If `AdminErrorHandler` posts from non-admin pages, either (a) move the mount under `/golf/admin/layout.tsx` only, OR (b) make it short-circuit when the current user is not an admin. Pick whichever matches the existing component's design intent.

- [ ] **Step 3: Commit.**

---

### Task 6: `createRecurringEvent` must not trust client `teamId`

**Files:**
- Modify: `src/app/golf/actions/recurring-events.ts:196`.

**Finding:** Calendar **Medium**. Server action accepts `input.teamId` and falls back to the coach's team.

- [ ] **Step 1: Replace line 196**

```typescript
    // BEFORE: const teamId = input.teamId || coachTeamId;
    // Trust only server-derived team membership. If a teamId is supplied,
    // verify the coach is staff on it; otherwise default to their canonical team.
    let teamId = coachTeamId;
    if (input.teamId && input.teamId !== coachTeamId) {
      const { data: isStaff } = await supabase.rpc('is_golf_team_coach', {
        team_id: input.teamId,
      });
      if (isStaff !== true) {
        return { success: false, error: 'Not authorized for that team' };
      }
      teamId = input.teamId;
    }
```

- [ ] **Step 2: Confirm `is_golf_team_coach` is callable from `authenticated`.** Grep `supabase/migrations/` for its definition; if not exposed, write a thin SQL wrapper similar to `is_user_on_team` in Task 2.

- [ ] **Step 3: Commit.**

---

### Task 7: `checkScheduleConflicts` — filter `attendeeIds` to caller's authorized roster

**Files:**
- Modify: `src/app/golf/actions/golf.ts:2798` (action) — filtering belongs here, not in `src/lib/calendar/conflicts.ts`.

**Finding:** Calendar **Low/Medium** data-mining surface. Action accepts arbitrary `attendeeIds` and resolves user identities + busy-period titles via `conflicts.ts`.

- [ ] **Step 1: After the `if (!user) throw new Error('Unauthorized');` at line 2809, restrict `attendeeIds` to teams the caller belongs to.**

```typescript
    // Restrict to players on the caller's authorized teams. A coach may
    // schedule across any team they staff; a player can only check conflicts
    // for themselves.
    const { data: callerTeams } = await supabase
      .from('golf_team_coach_staff')
      .select('team_id')
      .eq('coach_id', user.id /* fix: see note */);
    // NOTE during implementation: golf_team_coach_staff.coach_id is the
    // golf_coaches.id, not auth.uid(). Resolve via golf_coaches.user_id first.
    // Then load roster:
    //   SELECT player_id FROM golf_team_members WHERE team_id IN (...)
    // Intersect with attendeeIds. Reject if intersection empty.
```

Implementation note: this one needs a careful read of the coach-team join chain. Do not ship Task 7 without writing the equivalent of a `getAuthorizedPlayerIdsForCaller(user.id)` helper that returns a `Set<string>`, and filtering `attendeeIds` against it. If after the filter the array is empty, return `{ success: true, data: { hasConflict: false, conflicts: [], suggestedTimes: [] } }`.

- [ ] **Step 2: Add a unit test** at `src/lib/calendar/__tests__/conflicts-authorization.test.ts` that verifies a caller with team A cannot pass team-B player IDs.

- [ ] **Step 3: Commit.**

---

### Task 8: `getEventRSVP` — coach-or-self gate

**Files:**
- Modify: `src/app/golf/actions/golf.ts:3186`.

**Finding:** Calendar **Medium**. Action returns full RSVP roster with player names/avatars on any event id the caller can guess, with no team check at the action layer (RLS allows team players to read team attendance, but the action is named "coach view" and is widely callable).

**Decision:** if players SHOULD see everyone's RSVP, leave as-is (RLS already enforces team-membership read). If this is coach-only data, gate it. Codex flagged it because the JSdoc says "(coach view)". The conservative fix: add an explicit "caller is coach on this event's team OR caller is the only attendee they can see" check.

- [ ] **Step 1: Resolve event → team → coach check**

```typescript
    // Load the event's team_id, then verify caller is staff on that team.
    const { data: ev } = await supabase
      .from('golf_events')
      .select('team_id')
      .eq('id', eventId)
      .maybeSingle();
    if (!ev?.team_id) return { success: false, error: 'Event not found' };

    const { data: isStaff } = await supabase.rpc('is_golf_team_coach', {
      team_id: ev.team_id,
    });
    if (isStaff !== true) {
      return { success: false, error: 'Not authorized' };
    }
```

- [ ] **Step 2: Commit.**

---

### Task 9: `PremiumCalendarClient` — send `[]` when attendees cleared

**Files:**
- Modify: `src/components/golf/calendar/PremiumCalendarClient.tsx:581`.

**Finding:** Logic-accuracy. Empty selection becomes `undefined`, server reconciles only when present, RSVP rows stick around.

- [ ] **Step 1: Change line 581**

```typescript
    // BEFORE: attendeeIds: data.attendeeIds.length > 0 ? data.attendeeIds : undefined,
    attendeeIds: data.attendeeIds, // always send; [] means "clear all attendees"
```

- [ ] **Step 2: Confirm the matching server action treats `[]` as "clear" rather than "skip".** Read `updateEvent` action wherever it lives and the `attendeeIds` branch — if it currently does `if (attendeeIds) { ...reconcile }`, change to `if (attendeeIds !== undefined) { ...reconcile }`.

- [ ] **Step 3: Commit.**

---

### Task 10: Strip stack traces from admin UI + debug-rollup JSON

**Files:**
- Modify: `src/app/golf/admin/error.tsx:26-34` — delete the `<pre>` debug block.
- Modify: `src/app/api/admin/debug-rollup/route.ts:13-29` — strip `stack` and `cause` from `serializeError`.

**Finding:** Admin **Medium**. Even admin-only, raw stack traces in the browser are unnecessary noise + accidental info disclosure.

- [ ] **Step 1: Delete the `<pre>` block (lines 26–34) from `error.tsx`** and leave the user-friendly message + Try Again button.

- [ ] **Step 2: In `debug-rollup/route.ts:serializeError`, return only `{ name, message }` for `Error` instances** — drop `stack`, `cause` (or hash them and return a short opaque id only). Logging the full stack to Sentry / server logs is fine; surfacing it in a browser-fetchable JSON is not.

- [ ] **Step 3: Commit.**

---

## Phase 3 — Product-Decision Workstreams (CoachHelm + Admin BI accuracy)

These findings are about claim accuracy, not auth boundaries. They are bigger than a hotfix because they involve:
1. Architectural decisions (make `upsertInsight` mandatory, downgrade language)
2. Copy/labeling that's user-visible
3. Per-claim math review

Each subsection below is a **scoped sub-plan** that should be opened as its own planning session. I'm not writing TDD steps here because the right tasks depend on product calls you haven't made yet.

### Sub-plan A: CoachHelm — evidence-backed insight pipeline + language downgrades

**Findings (5):**
- High: `generateTeamInsights` bypasses `upsertInsight` evidence contract (`insights.ts:825`, `upsert.ts:57`).
- High: `CausalEngine` labels relationships causal from weak heuristics with no confounder control (`causal-engine.ts:181,256,336`).
- High: prediction alert thresholds compare absolute predicted score to a decline threshold, not a delta (`orchestrator.ts:115,603`, `performance-predictor.ts:91`).
- Medium: team insights pinned to `players[0].id` + dedupe key mismatch causes duplicates (`insights.ts:780,902`).
- Medium: pressure-putting "correlation" uses synthetic 0.6/-0.6 coefficients presented as real Pearson r (`correlation-discovery.ts:310`, `orchestrator.ts:1687`).

**Decision points to settle before writing tasks:**
1. Is `upsertInsight`'s evidence envelope (sample_n ≥ 5, lifecycle, dedupe) the source of truth that every persisted insight must pass through? (Recommended: yes.)
2. Language downgrades: are we OK with "associated with" / "forecast" / "possible driver" until math supports stronger claims? Need a copy doc.
3. For team insights, what's the canonical owner key? (Options: no `player_id` at all + a `team_id` column; a "team" pseudo-player; per-player rows with shared headline.)
4. For prediction alerts, what's the right comparison? Delta from baseline? Delta from rolling 8-round trend? Both?

**Once decided, the plan would have ~8–10 tasks:** add evidence column to team-insight path, refactor `CausalEngine` to "association" semantics + add confounder gates, rework predictor threshold math, change dedupe key + storage shape for team insights, replace synthetic correlation coefficients, plus a copy pass across the CoachHelm UI.

### Sub-plan B: Admin BI — label or recompute synthetic metrics

**Findings (2):**
- `aiCoachIds` is built from `player_id` (mislabeled set name) — `admin-bi-data.ts:135`.
- "Insight action rate" = `totalInsights / aiTotal` clamped to 1, not a real follow-up-action rate — `admin-bi-data.ts:202`.
- `avgResponseMs` = current dashboard fetch time, `p95ResponseMs = avg * 1.5`, `errorRate` = total errors / API calls — `admin-data.ts:2979–2987`. Not real measurements.

**Decision points:**
1. Are the BI cards a "rough proxy" or a "real metric"? If proxy: relabel only. If real: source from actual logged AI cohort + action events.
2. For infra latency: are we OK sourcing from `admin_api_perf_log` only? Or do we need real p95 instrumentation in the routes?

**Once decided, this is a 2–4 task plan** (rename `aiCoachIds` → `aiPlayerIds`, relabel "action rate" → "insight density", drop the synthetic p95/errorRate or source them from `admin_api_perf_log` + `error_logs`).

---

## Self-Review Notes

- **Spec coverage:** All 16 Codex findings + 1 logic-accuracy item are addressed: Phase 1 covers calendar-High + admin-High + admin-Medium#1 (3). Phase 2 covers admin-Medium#2, calendar-Medium#1, calendar-Low/Medium, calendar-Medium#2, calendar logic-accuracy, admin-Medium#3 (6). Phase 3 covers CoachHelm-High×3 + CoachHelm-Medium×2 + admin-Accuracy×2 (7). Total = 16 + 1 = 17. ✅
- **Drift caveat:** Phase 1 + 2 SQL ships via dashboard editor because `supabase db push` is blocked by 28 ghost migrations. Reconciling drift is its own task — not in this plan.
- **Phase 3 honesty:** I deliberately did not write TDD steps for CoachHelm. The right tasks depend on product decisions about claim semantics (Sub-plan A) and metric definitions (Sub-plan B). Forcing fake TDD here would produce throwaway code.

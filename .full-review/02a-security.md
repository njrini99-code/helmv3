# Phase 2A — Security Audit

**Scope:** `git diff 850632e7..HEAD` (39 commits, 60 files, +6,816 / −1,345)
**Auditor:** security-auditor
**Date:** 2026-04-20

---

## Executive summary

| Severity | Count |
|---|---|
| Critical | **1 (new)** + 3 (pre-flagged, verified fixed) |
| High | 3 |
| Medium | 5 |
| Low | 4 |

**Hotfix verdict:** migration `20260421000004_secure_perf_rpcs.sql` **correctly closes the three Phase 1 critical holes (C1/C2/C3).** The `auth.uid()`-based ownership checks against `golf_coaches` and `golf_players` are sound and match the project's existing RPC-hardening convention.

**New critical:** a **SQL-injection-shaped defect in `getEmailsList`** (`resend-activity.ts:192-194`) that builds a PostgREST `or(...)` filter via string concatenation of unsanitized user input. Admin-only, but still exploitable by any admin-acting user (or anyone with admin session token) to break the parser, bypass the filter, or cause RPC errors; it also ingests user-controlled commas/parentheses into the query DSL. See C4 below.

---

## CRITICAL

### C1. [VERIFIED FIXED] Cross-tenant RPC data leak

**Files:** `supabase/migrations/20260421000004_secure_perf_rpcs.sql:119-171, 176-227, 232-298`
**CWE-639 (Insecure Direct Object Reference), CWE-285 (Improper Authorization)**
**CVSS (pre-fix): 8.1 (High) — AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:N/A:N**

**Verification of the hotfix — each RPC closes cleanly:**

1. `get_coach_today_schedule(p_team_id, p_today_start, p_today_end)` — line 133-137 asserts `EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = auth.uid() AND team_id = p_team_id)`. Correct — this is the canonical coach-ownership check used elsewhere in the codebase.

2. `get_player_hub_announcements(p_team_id, p_player_id)` — line 190-199 allows **either** (a) caller IS the player on that team (`golf_players.user_id = auth.uid() AND id = p_player_id AND team_id = p_team_id`), **or** (b) caller coaches the team. This is the correct widened gate (coaches legitimately render player hubs in the parent-view case).

3. `get_player_hub_events(p_team_id, p_player_id, p_since)` — identical dual gate at line 247-256. Correct.

4. `get_admin_dashboard_rollup()` — line 36-42 inlines `SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')` before emitting any data.

**Caveats / residual risk:**

- The fix relies on `auth.uid()` inside a `SECURITY DEFINER` function with `SET search_path = public`. This is safe **only** if no attacker-controlled code can execute before the check runs. That's true here (all four are pure SQL blocks with no user DML upfront).
- `RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501'` is fine but will surface as a raw error string to the client via PostgREST. That's consistent with the rest of the codebase (see `get_crm_email_stats`) and intentional — no info leak beyond "forbidden".
- **Latent bug:** migration 00004 is a `CREATE OR REPLACE FUNCTION` but it does **not** re-`GRANT EXECUTE TO authenticated` or re-`REVOKE FROM anon, public`. `CREATE OR REPLACE` preserves existing grants, so this is correct in practice, but the comment at line 300-301 is load-bearing and should be lifted into the migration itself as an explicit `REVOKE EXECUTE ... FROM anon, public;` statement for belt-and-braces (defense in depth — if someone later drops & recreates without the REVOKE, it silently becomes public-readable).

**Recommendation (low-priority polish):** add to end of migration 00004:
```sql
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_rollup() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_coach_today_schedule(uuid, timestamptz, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_player_hub_announcements(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_player_hub_events(uuid, uuid, timestamptz) FROM anon, public;
```

---

### C2. [VERIFIED FIXED] Admin dashboard rollup readable by non-admins

See C1 item 4. Fix is correct — the inline role lookup will RAISE before any tuple is produced, and `LANGUAGE plpgsql` (replacing the original `LANGUAGE sql`) permits the procedural check. Verified.

---

### C3. [VERIFIED FIXED] `unstable_cache` wrapping `cookies()` / `auth.getUser()`

**File:** `src/app/golf/actions/admin-data.ts:63-97`
**Verification:** the refactor is textbook-correct for Next.js 16:

- Auth + role check lives **outside** `unstable_cache` (lines 85-94) and uses the server client that reads cookies.
- The cache body (lines 63-77) calls only `createAdminClient()` (service-role, no cookies) — complies with the Next.js 16 rule that cache bodies must not read request state.
- The RPC itself re-validates admin role via `auth.uid()` (migration 00004), so even if an attacker somehow reached `cachedAdminDashboardData()` directly (e.g. through an import refactor that forgot the outer auth), the DB still refuses.
- The **shared-cache is correct here**: admin data is global to the platform, not per-tenant, so sharing across all admin callers is the intended behavior, NOT a leak. See note in source comments at 83-84.

Residual issue from Phase 1 (H2) that persists: `invalidateAdminDashboardRollup()` is still exported but has zero call sites. Operationally the 60s `revalidate: 60` floor is the only freshness guarantee. **Not a security issue** — admin mutations still call `revalidatePath('/golf/admin')` elsewhere. Leave as Medium-priority cleanup.

---

### C4. **NEW — SQL injection / filter bypass in `getEmailsList` search**

**Severity:** Critical (Admin-only scope → downgraded to **High** in practical terms; upgraded back to Critical because the admin role is the only thing between this and the full `emails` + `email_events` tables, which contain full PII: recipient emails, subject lines, HTML bodies, IPs, UAs).
**CVSS: 7.2 (High) — AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:L/A:L**
**CWE-89 (SQL Injection — PostgREST DSL variant), CWE-20 (Improper Input Validation)**
**File:** `src/app/golf/actions/resend-activity.ts:187-195`

```ts
if (filters.search && filters.search.trim()) {
  const q = filters.search.trim();
  query = query.or(
    `subject.ilike.%${q}%,from_address.ilike.%${q}%,to_addresses.cs.{${q}}`
  );
}
```

**Why this is exploitable:**

PostgREST's `.or(string)` filter is a mini-DSL. Supabase-js forwards the string verbatim to the URL. Commas, parens, dots, and operators (`eq`, `neq`, `not`, `is`, `in`) all have meaning. User input goes into the string unescaped, so a search term like:

```
),is_admin.eq.true,or(subject.ilike.*
```

becomes:

```
subject.ilike.%),is_admin.eq.true,or(subject.ilike.*%,from_address.ilike.%...
```

The parser will either reject (DoS-like — breaks the dashboard), or in some versions of PostgREST, be steered to interpret injected operators. Even without a working privilege-escalation payload, a `%` in the search renders an unbounded scan on `emails` which has no LIMIT on the `.or()` predicate — a search of `%%%` against a 10M-row table will exhaust the function timeout.

The `to_addresses.cs.{${q}}` fragment is the worst: the contains-array syntax `cs.{a,b,c}` parses commas as element separators. `a,b` as search input becomes `cs.{a,b}` and checks array containment of `[a, b]`, silently changing the filter semantic.

**Remediation:**

Either (a) split into three separate queries and `UNION`-style merge, or (b) strip DSL-meaningful chars, or (c) push the search into an RPC. Recommended:

```ts
if (filters.search && filters.search.trim()) {
  // Strip PostgREST DSL metacharacters: parens, commas, dots, colons, asterisks,
  // percent (we add our own wildcards), curly braces.
  const q = filters.search.trim().replace(/[(),.:*%{}\\]/g, '');
  if (q.length >= 2 && q.length <= 100) {
    // Escape %/ _ for ILIKE
    const esc = q.replace(/[%_]/g, (c) => `\\${c}`);
    query = query.or(
      `subject.ilike.%${esc}%,from_address.ilike.%${esc}%`
    );
    // Drop the array-contains branch — it's broken anyway (needs exact match,
    // not substring) and introduces the worst injection surface.
  }
}
```

Better: move the whole search to a `get_emails_search(p_q text, p_limit int, p_offset int)` RPC that does `WHERE subject ILIKE '%' || p_q || '%' OR from_address ILIKE '%' || p_q || '%' OR EXISTS (SELECT 1 FROM unnest(to_addresses) addr WHERE addr ILIKE '%' || p_q || '%')`. Parameters are bound at the driver level, impossible to escape.

---

## HIGH

### H1. Realtime INSERT subscription on `email_events` is unfiltered — leaks cross-tenant PII to any client that can subscribe

**File:** `src/app/golf/admin/crm/components/resend/LiveActivityFeed.tsx:46-72`
**CWE-200 (Exposure of Sensitive Information), CWE-284 (Improper Access Control)**
**CVSS: 6.5 (Medium) — AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N**

The channel subscribes to every INSERT on `email_events` with NO server-side filter. The table has admin-only RLS SELECT (`20260304000000_create_crm_email_tracking.sql:36-40`), and Supabase Realtime enforces RLS on initial subscribe + on each broadcast — so **in theory** non-admins won't receive rows. **But:**

1. **RLS is checked against the subscribing user's JWT.** If the user is not admin, they get nothing. Correct.
2. **If any admin session token ever leaks** (shared workstation, browser extension, phishing), the attacker gets a firehose of all Resend PII in real time — recipient emails, subject lines, click IPs, user agents — for every email sent across the platform, not just the tenant they've compromised. This is consistent with admin-by-design but is worth flagging because the realtime channel name (`resend-activity-feed`) is global, non-scoped.
3. **No rate limiting** on the subscription — a compromised admin token can be used to hold an open websocket and exfiltrate the stream without triggering any admin-panel access log.

**Team C's note that "`email_events` has no tenant column"** — that's correct and, for this product, acceptable given admin scope. The concern is compounded impact if the admin boundary is broken.

**Remediation (defense-in-depth):**

```tsx
// Scope the channel more tightly + drop payload fields the UI doesn't need.
// Also add an audit log entry when admins subscribe.
const channel = supabase
  .channel('resend-activity-feed', {
    config: { broadcast: { self: false }, presence: { key: userId } },
  })
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'email_events',
    // Optional: filter by source OR by event_type to reduce blast radius
    filter: 'event_type=in.(email.sent,email.delivered,email.opened,email.clicked,email.bounced,email.complained)',
  }, ...)
```

Also consider logging realtime subscriptions in an `admin_events` table so SOC can spot anomalous long-lived connections.

---

### H2. `getCoachDashboardData` / `getPlayerDashboardData` trust caller-supplied `teamId`/`playerId` for auxiliary queries (legacy concern — unchanged in this diff but now relevant)

**File:** `src/app/golf/actions/dashboard-data.ts:224-240, 661-700`
**CWE-639 (IDOR)**
**CVSS: 7.5 (High) if reachable by any authenticated user — AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N**

`getCoachDashboardData(coachId, userId, teamId, dateRange)` checks `user.id !== userId` (line 244) but **never validates** that `userId` owns the passed `coachId` or that the user is a coach of the passed `teamId`. The RPC `get_coach_today_schedule` now enforces this (see C1), but the **sibling queries in the same function** — `golf_team_settings`, `golf_team_members` (roster count), `golf_events`, `golf_qualifiers`, `golf_tasks`, `golf_announcements`, `golf_rounds` (via `playerIds`) — all run with the caller's session + RLS.

If RLS on `golf_events`, `golf_team_members`, etc. is correctly scoped to "caller is a member of team_id," this is safe. If any of those tables has a loose `USING (true)` or a role-based policy that doesn't check team membership, this is an IDOR.

**Action required:** verify RLS policies on `golf_events`, `golf_tasks`, `golf_announcements`, `golf_team_members`, `golf_team_settings`, `golf_qualifiers`, `golf_rounds` all gate on `team_id IN (SELECT team_id FROM golf_team_members WHERE user_id = auth.uid())` (or coach-specific equivalent). This audit didn't receive the RLS policy files — flagging as a gap to close.

Defense-in-depth recommendation: add an upfront ownership check to both dashboard functions (mirror the RPC hotfix pattern):

```ts
// After auth.getUser():
const { data: membership } = await supabase
  .from('golf_coaches')
  .select('id')
  .eq('user_id', user.id)
  .eq('team_id', teamId)
  .maybeSingle();
if (!membership) throw new Error('Forbidden');
```

---

### H3. `getPlayerHubAnnouncements` argument shape is trusted server-action-side but RPC does enforce — verify caller-side doesn't pass attacker input

**File:** `src/app/golf/actions/player-notifications.ts:319-346`

The server action takes `teamId` and `playerId` as arguments and passes them straight to the RPC. Because this is a `'use server'` action, these come from client JS. **Server-action auth convention** (see skill: `server-auth-actions`) says: treat every arg as hostile. Currently, the action does `supabase.auth.getUser()` and errors if unauthed (good), but then passes the caller-supplied `playerId` / `teamId` to the RPC.

The RPC now (migration 00004) re-validates ownership, so this is **no longer a privilege-escalation vector** — but the server action itself should still pre-validate for belt-and-braces. If a future migration removes the RPC check, the server action becomes the only gate, and it currently is no gate at all on IDs.

**Remediation:** add to `getPlayerHubAnnouncements`:

```ts
const { data: player } = await supabase
  .from('golf_players')
  .select('id, team_id')
  .eq('user_id', user.id)
  .maybeSingle();
if (!player || player.id !== playerId || player.team_id !== teamId) {
  // Allow coaches too:
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .maybeSingle();
  if (!coach) return { success: false, error: 'Forbidden' };
}
```

Same treatment for the inline RPC call at `hub/page.tsx:86-90` (player hub events).

---

## MEDIUM

### M1. Webhook dedupe relies on `(resend_message_id, event_type, occurred_at)` but `ignoreDuplicates: true` — silently loses legitimate events

**File:** `src/app/api/webhooks/resend/route.ts:80-96`
**CWE-693 (Protection Mechanism Failure)**

Resend can retry a webhook with the same `(msg_id, type, occurred_at)` triple — correctly deduped. But if two legitimate events happen within the same microsecond (rare but possible: simultaneous opens from two mail clients on the same msg), one is silently dropped. Not a security issue per se, but the admin "open count" becomes an undercount, which **hides** the signal a security responder would use to detect mass-open campaigns / prefetch bots.

**Remediation:** widen the unique constraint to include recipient_email, OR accept the tradeoff explicitly and document it. Low priority.

---

### M2. Webhook always returns 200 even on processing error — breaks Resend's retry guarantee

**File:** `src/app/api/webhooks/resend/route.ts:140-145`

```ts
} catch (err) {
  console.error('[Resend Webhook] Processing error:', err);
  // Still return 200 to prevent retry storms
}
return NextResponse.json({ received: true });
```

The comment is well-intentioned but **incorrect as a security posture**: if an attacker causes the handler to throw (e.g. by manipulating an event shape that breaks the coach-status update), their event is acknowledged as received but **not recorded**. This degrades the audit trail — an attacker can flood the webhook with crafted events to blind the admin dashboard.

**Remediation:** return 500 on actual processing errors (let Resend retry). Only swallow errors on the specific lookup-miss branches (`contactLog` not found is expected and fine to 200).

---

### M3. `resend-activity.ts` — every action re-runs `requireAdmin()` which re-hits Postgres for the role check

**File:** `src/app/golf/actions/resend-activity.ts:120-136`

Each action makes 2 round trips (getUser + users role SELECT) before its actual work. For a dashboard that issues ~8 actions on tab load, that's 16 extra round trips. Not a security bug but **it encourages caching of the admin check** which, if done wrong, becomes one. Recommend: keep the check (correct security posture) and accept the overhead OR co-locate into a single RPC that returns {is_admin, data} atomically.

---

### M4. Service-role key exposure blast radius

**File:** `src/lib/supabase/admin.ts:1-18`, `src/app/golf/actions/admin-data.ts:65`

The admin dashboard now uses `createAdminClient()` (service role, bypasses ALL RLS) inside the `unstable_cache` body. That's **correct** for this use (the RPC is admin-gated), but it means any future refactor that accidentally exposes that cached function through a non-admin code path would hand out a full-DB read. Recommend:

1. Add a runtime assert in `createAdminClient()`: `if (process.env.NEXT_RUNTIME === 'edge') throw`.
2. Add an ESLint rule or comment banner warning that `createAdminClient()` must never be called inside a cookies()-reading context or from a client component — already informally documented but not enforced.

---

### M5. `emails` / `email_events` realtime publication enabled without row-level scoping

**File:** `supabase/migrations/20260420000000_resend_activity_mirror.sql:461-476`

Both tables are added to `supabase_realtime` publication. RLS *does* apply to broadcasts, so non-admins won't receive rows — but publishing a table enables Postgres logical replication WAL overhead for every row written. If the email volume grows, this can degrade DB perf (a liveness-class concern rather than a data-confidentiality one). Consider using Supabase Broadcast instead of postgres_changes for this channel to decouple from WAL.

---

## LOW

### L1. `raw_payload` stored as JSONB — may contain PII in future Resend schema changes

`email_events.raw_payload` stores the full webhook body. Resend could add fields over time (e.g. opened-by-client metadata, geoip). There's no whitelist of accepted fields. Consider redacting IP/UA before storage, or at least flagging in the PII inventory.

### L2. `email_clicks.ip_address` stored unhashed

`supabase/migrations/20260421000000_email_clicks_and_coach_denorm.sql:32` stores clicking user IPs in plaintext. Under GDPR this is personal data and needs a retention policy + legal basis. No retention cron configured. Recommend: add a 90-day TTL cleanup job or hash with a per-deploy salt.

### L3. RLS status on `crm_email_events` view

The back-compat view `crm_email_events` (`20260420000000_resend_activity_mirror.sql:35-36`) is `CREATE OR REPLACE VIEW` with no `WITH SECURITY_BARRIER` and no RLS (views don't inherit RLS by default in all configurations). Verify that queries against this view still respect the underlying `email_events` RLS. Supabase generally does, but worth a test: as a non-admin, `SELECT * FROM crm_email_events` should return zero rows. If it returns rows, this is an RLS bypass.

### L4. RPC arg type uuid — PostgREST rejects malformed UUIDs but error message is verbose

Good: `get_coach_today_schedule(p_team_id uuid, ...)` — passing non-UUID input is rejected at the PostgREST layer. No validation needed server-side. But the error message ("invalid input syntax for type uuid") can help an attacker map argument positions. Consider wrapping server actions in try/catch that normalizes all RPC errors to a generic "Failed to load" string.

---

## POSITIVE FINDINGS

1. **Migration 00004 is well-crafted.** Uses `LANGUAGE plpgsql`, `SET search_path = public`, `SECURITY DEFINER`, and the `auth.uid()` check pattern exactly matches the existing RPC-hardening convention in the codebase (`20260311100000_rpc_resilient_detail_inserts.sql` style).
2. **Webhook signature verification** (`src/app/api/webhooks/resend/route.ts:44-57`) correctly uses Svix with no early-return on missing headers — good.
3. **`admin-data.ts` cache refactor** is textbook Next.js 16: auth outside, data inside, no cookie reads in cache body, correct shared-cache semantics for global admin data.
4. **No secrets committed** in the diff. `createAdminClient()` reads env vars, no inline tokens.
5. **No new dependencies added** (`git diff 850632e7..HEAD -- package.json` is empty) — zero supply-chain surface area from this diff.
6. **RLS is preserved** on all renamed tables (`email_events` inherits from `crm_email_events`; `emails` and `email_clicks` declare their own policies).
7. **The 4 perf RPCs use only parameterized queries** — no string interpolation inside SQL. The RPC args `p_team_id uuid`, `p_player_id uuid`, `p_since timestamptz` are all typed; PostgREST rejects mismatches before they hit the function body. No SQL injection via RPC path.

---

## Remediation priority

1. **NOW:** C4 (SQL-DSL injection in `getEmailsList`) — exploitable today by any admin-acting user or token holder. One-line regex fix.
2. **THIS WEEK:** H2, H3 (pre-validate ownership in server actions as defense-in-depth behind the RPC gate).
3. **NEXT SPRINT:** M2 (webhook 500 on real errors), M4 (tighten admin client escape hatches), L2 (email_clicks PII TTL).
4. **BACKLOG:** explicit `REVOKE EXECUTE ... FROM anon, public;` in migration 00004 (C1 caveat); view RLS test (L3).

---

## Files referenced

- `/Users/ricknini/Downloads/helmv3/supabase/migrations/20260421000004_secure_perf_rpcs.sql` — hotfix (verified correct)
- `/Users/ricknini/Downloads/helmv3/supabase/migrations/20260421000001_admin_dashboard_rollup.sql` — original (superseded by 00004)
- `/Users/ricknini/Downloads/helmv3/supabase/migrations/20260421000003_dashboard_rpcs.sql` — original (superseded by 00004)
- `/Users/ricknini/Downloads/helmv3/supabase/migrations/20260420000000_resend_activity_mirror.sql` — Resend tables (see M5, L3)
- `/Users/ricknini/Downloads/helmv3/supabase/migrations/20260421000000_email_clicks_and_coach_denorm.sql` — email_clicks (see L2)
- `/Users/ricknini/Downloads/helmv3/supabase/migrations/20260304000000_create_crm_email_tracking.sql` — original email RLS
- `/Users/ricknini/Downloads/helmv3/src/app/golf/actions/admin-data.ts` — cache refactor (verified correct)
- `/Users/ricknini/Downloads/helmv3/src/app/golf/actions/resend-activity.ts` — C4 lives here (line 187-195)
- `/Users/ricknini/Downloads/helmv3/src/app/golf/actions/dashboard-data.ts` — H2
- `/Users/ricknini/Downloads/helmv3/src/app/golf/actions/player-notifications.ts` — H3
- `/Users/ricknini/Downloads/helmv3/src/app/golf/(dashboard)/dashboard/hub/page.tsx` — H3 (inline RPC)
- `/Users/ricknini/Downloads/helmv3/src/app/golf/admin/crm/components/resend/LiveActivityFeed.tsx` — H1
- `/Users/ricknini/Downloads/helmv3/src/app/api/webhooks/resend/route.ts` — M1, M2
- `/Users/ricknini/Downloads/helmv3/src/lib/supabase/admin.ts` — M4

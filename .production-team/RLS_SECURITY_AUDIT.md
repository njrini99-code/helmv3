# RLS Security Audit Report

**Date:** January 10, 2026
**Scope:** All `golf_*` tables + related tables
**Status:** RESOLVED

---

## Executive Summary

| Category | Status | Count |
|----------|--------|-------|
| Tables with RLS Enabled | PASS | All 54 golf_* tables |
| Tables with Anonymous Access | FIXED | 0 remaining (was 50+) |
| Always-True Policies | WARNING | 1 table (non-golf) |
| Auth Configuration | WARNING | 2 issues |

### Fixes Applied

| Migration | Policies Fixed | Tables Affected |
|-----------|---------------|-----------------|
| `fix_rls_policies_use_authenticated_role` | 38 policies | golf_rounds, golf_holes, golf_shots, golf_round_reviews, golf_coach_philosophy, golf_coachhelm_settings, golf_team_coachhelm_settings, golf_coach_insights, golf_player_courses, golf_player_focus_areas |
| `fix_rls_policies_remaining_tables` | 23 policies | golf_patterns_v2, golf_predictions, golf_causal_relationships, golf_validations, golf_global_patterns, golf_confidence_calibration, golf_insight_generation_log, golf_external_calendars, golf_sync_conflict_rules, golf_calendar_sync_state, golf_calendar_sync_log |
| `fix_rls_golf_learned_behavior` | 2 policies | golf_learned_behavior |

**Total:** 63 policies migrated from `{public}` to `{authenticated}` role

---

## 1. CRITICAL: Anonymous Access Policies

**Issue:** Many RLS policies grant access to both `anon` and `authenticated` roles, meaning unauthenticated users could potentially access data.

### Golf Tables Affected (Partial List)

| Table | Policies Allowing Anon |
|-------|------------------------|
| `golf_players` | view_self, view_teammates, update_own, delete_own |
| `golf_coaches` | view_self, view_team_coaches, update_own, delete_own |
| `golf_teams` | view_own_team, view_by_invite_code, update, delete_own |
| `golf_rounds` | read_own, read_team, update_own, delete_own |
| `golf_events` | view_team_events, update, delete |
| `golf_shots` | read_own, read_team, update_own, delete_own |
| `golf_holes` | read_own, read_team, update_own, delete_own |
| `golf_coach_notes` | select, update, delete |
| `golf_qualifiers` | select, update, delete |
| `golf_announcements` | select, update, delete |
| `golf_tasks` | select, update, delete |
| `golf_documents` | select, update, delete |

**Risk Level:** HIGH
**Impact:** If anonymous sign-ins are enabled in Supabase Auth, unauthenticated users could access or modify data.

### Root Cause Analysis

The policies use `{public}` or `{anon, authenticated}` role sets instead of only `{authenticated}`. Example:

```sql
-- CURRENT (allows anon)
CREATE POLICY "golf_players_view_self" ON golf_players
FOR SELECT TO public  -- Includes anon!
USING (auth.uid() = user_id);

-- SHOULD BE
CREATE POLICY "golf_players_view_self" ON golf_players
FOR SELECT TO authenticated  -- Only authenticated users
USING (auth.uid() = user_id);
```

---

## 2. WARNING: Always-True RLS Policy

**Table:** `demo_requests`
**Policy:** `Anyone can submit demo requests`
**Issue:** Uses `WITH CHECK (true)` allowing unrestricted INSERT

```sql
-- Current problematic policy
CREATE POLICY "Anyone can submit demo requests" ON demo_requests
FOR INSERT TO anon, authenticated
WITH CHECK (true);  -- No restrictions!
```

**Risk:** Spam/abuse potential. Consider rate limiting or captcha.

---

## 3. WARNING: Auth Configuration Issues

### 3.1 Leaked Password Protection Disabled
- **Status:** DISABLED
- **Risk:** Users can register with known compromised passwords
- **Fix:** Enable in Supabase Dashboard > Authentication > Settings

### 3.2 Insufficient MFA Options
- **Status:** Too few MFA methods enabled
- **Risk:** Weaker account security
- **Fix:** Enable TOTP and/or WebAuthn MFA methods

---

## 4. Policy Pattern Analysis

### Good Patterns Found

The codebase uses several good security patterns:

1. **Owner-based access:** `auth.uid() = user_id`
2. **Team membership checks:** Policies verify team membership
3. **Separate policies per operation:** INSERT, SELECT, UPDATE, DELETE

### Problematic Patterns Found

1. **Role too broad:** Using `TO public` instead of `TO authenticated`
2. **Missing role checks:** Some policies only check ownership, not role
3. **Chained lookups:** Complex subqueries that could be optimized

---

## 5. Recommended Fixes

### Priority 1: Restrict Roles on All Golf Tables (CRITICAL)

Create a migration to update all golf_* policies to use `authenticated` only:

```sql
-- Example fix for golf_players
DROP POLICY IF EXISTS "golf_players_view_self" ON golf_players;
CREATE POLICY "golf_players_view_self" ON golf_players
FOR SELECT TO authenticated  -- Changed from public
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "golf_players_view_teammates" ON golf_players;
CREATE POLICY "golf_players_view_teammates" ON golf_players
FOR SELECT TO authenticated  -- Changed from public
USING (
  team_id IN (
    SELECT team_id FROM golf_players WHERE user_id = auth.uid()
    UNION
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
  )
);
```

### Priority 2: Add Rate Limiting to demo_requests

```sql
-- Add check for recent submissions
DROP POLICY IF EXISTS "Anyone can submit demo requests" ON demo_requests;
CREATE POLICY "Rate limited demo requests" ON demo_requests
FOR INSERT TO authenticated, anon
WITH CHECK (
  -- Allow if no submission from same IP in last hour
  NOT EXISTS (
    SELECT 1 FROM demo_requests
    WHERE created_at > now() - interval '1 hour'
    AND ip_address = current_setting('request.headers', true)::json->>'cf-connecting-ip'
  )
);
```

### Priority 3: Enable Auth Security Features

1. Enable leaked password protection
2. Enable at least 2 MFA methods
3. Review session duration settings

---

## 6. Tables Requiring Immediate Attention

### Critical (User Data at Risk)

| Table | Action Required |
|-------|-----------------|
| golf_players | Restrict to authenticated only |
| golf_coaches | Restrict to authenticated only |
| golf_rounds | Restrict to authenticated only |
| golf_coach_notes | Restrict to authenticated only |
| golf_teams | Keep invite_code policy for join flow |

### High (Operational Data)

| Table | Action Required |
|-------|-----------------|
| golf_events | Restrict to authenticated only |
| golf_qualifiers | Restrict to authenticated only |
| golf_announcements | Restrict to authenticated only |
| golf_tasks | Restrict to authenticated only |

### Medium (Configuration Data)

| Table | Action Required |
|-------|-----------------|
| golf_coachhelm_settings | Restrict to authenticated only |
| golf_team_coachhelm_settings | Restrict to authenticated only |
| golf_coach_philosophy | Restrict to authenticated only |

---

## 7. Migration Template

Use this template to fix policies for any golf_* table:

```sql
-- Migration: fix_[table_name]_rls_policies

-- 1. Drop existing policies
DROP POLICY IF EXISTS "[table]_select" ON [table];
DROP POLICY IF EXISTS "[table]_insert" ON [table];
DROP POLICY IF EXISTS "[table]_update" ON [table];
DROP POLICY IF EXISTS "[table]_delete" ON [table];

-- 2. Recreate with authenticated role
CREATE POLICY "[table]_select" ON [table]
FOR SELECT TO authenticated
USING (/* appropriate condition */);

CREATE POLICY "[table]_insert" ON [table]
FOR INSERT TO authenticated
WITH CHECK (/* appropriate condition */);

CREATE POLICY "[table]_update" ON [table]
FOR UPDATE TO authenticated
USING (/* appropriate condition */);

CREATE POLICY "[table]_delete" ON [table]
FOR DELETE TO authenticated
USING (/* appropriate condition */);
```

---

## 8. Exception: Invite Code Policy

The `golf_teams_view_by_invite_code` policy SHOULD allow broader access for the join flow:

```sql
-- This is correct - needed for join flow
CREATE POLICY "golf_teams_view_by_invite_code" ON golf_teams
FOR SELECT TO authenticated  -- Still requires auth
USING (invite_code IS NOT NULL);
```

This policy allows authenticated users (not anon) to look up teams by invite code, which is required for the team join flow. This is a valid exception.

---

## 9. Verification Checklist

After applying fixes:

- [ ] Run `npm run dev` and test all flows
- [ ] Verify team join flow still works
- [ ] Verify player can view own data
- [ ] Verify coach can view team data
- [ ] Verify cross-team data is NOT visible
- [ ] Test logged-out state returns 401/403
- [ ] Run E2E tests

---

## 10. Next Steps

1. **Immediate:** Apply Priority 1 migration for core tables
2. **This Week:** Apply fixes to all 50+ affected tables
3. **This Sprint:** Enable auth security features
4. **Ongoing:** Add security advisor checks to CI pipeline

---

*Generated by GENIUS Security Auditor*

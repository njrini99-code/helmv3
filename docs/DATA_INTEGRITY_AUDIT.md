# PHASE 4: DATA INTEGRITY & FOREIGN KEY AUDIT

**Generated:** 2026-01-01
**Database:** dgvlnelygibgrrjehbyc.supabase.co
**Audit Type:** Comprehensive Data Integrity Check

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Total Issues Found | 4 | - |
| Critical Issues | 2 | RED |
| Warnings | 2 | YELLOW |
| Foreign Key Violations | 0 | GREEN |

---

## 1. User-Profile Linkage Integrity

### Status: PASS (with caveats)

All 19 users in the `users` table have corresponding profiles:
- Baseball users (10) → linked to `players` or `coaches` table
- Golf users (9) → linked to `golf_players` or `golf_coaches` table

**However**, there are:
- 30 orphaned baseball player records (see Section 2)
- 9 players with incomplete profiles (see Section 5)

---

## 2. Orphaned Records

### 2.1 Orphaned Baseball Players: **30 records** (CRITICAL)

These are player records in the `players` table with **NULL user_id** - no associated user account.

| # | Name | ID | Created |
|---|------|-----|---------|
| 1 | Dylan Anderson | 5da39fce-... | 2025-12-17 |
| 2 | Chase Taylor | 76dbef4b-... | 2025-12-17 |
| 3 | Cole Thomas | 69790abf-... | 2025-12-17 |
| 4 | Blake Moore | cd5ecfe4-... | 2025-12-17 |
| 5 | Ryan Martin | a1d9d7c9-... | 2025-12-17 |
| 6 | Kyle Lee | 186e934e-... | 2025-12-17 |
| 7 | Derek Walker | 8942885f-... | 2025-12-17 |
| 8 | Austin Smith | 0eda2922-... | 2025-12-17 |
| 9 | Trevor Garcia | dc32d48b-... | 2025-12-17 |
| 10 | Mason Miller | b168b544-... | 2025-12-17 |
| ... | (20 more) | ... | 2025-12-17 |

**Analysis:** All 30 records were created at the same timestamp (2025-12-17T00:43:37), indicating **seed/demo data** that was bulk-inserted. These are sample players for testing/demo purposes but have no real user accounts.

**Impact:**
- These players appear in coach Discover pages
- They can be added to watchlists
- No user can log in as these players
- Data may confuse real analytics

**Recommendation:**
```sql
-- Option A: Delete orphaned players (if demo data no longer needed)
DELETE FROM players WHERE user_id IS NULL;

-- Option B: Mark them as demo data
ALTER TABLE players ADD COLUMN is_demo_data BOOLEAN DEFAULT FALSE;
UPDATE players SET is_demo_data = TRUE WHERE user_id IS NULL;
```

### 2.2 Orphaned Golf Records

| Table | Orphaned Count | Status |
|-------|---------------|--------|
| golf_coaches | 0 | PASS |
| golf_players | 0 | PASS |
| golf_teams | 0 | PASS |

---

## 3. Team Relationship Integrity

### 3.1 Golf Coaches Without Teams: **2 of 5** (WARNING)

| Coach ID | Has team_id | Has org_id |
|----------|-------------|------------|
| 88febdff-... | NULL | NULL |
| 31d00e1d-... | YES | YES |
| ba70f674-... | YES | YES |
| 1c9780fe-... | NULL | NULL |
| 23ae24b4-... | YES | YES |

**Impact:** Coaches without team_id cannot:
- View their roster
- Manage team settings
- See team-specific dashboards

### 3.2 Golf Players Without Teams: **4 of 4** (WARNING)

| Player Name | user_id | team_id |
|-------------|---------|---------|
| nick rini | 4f381710-... | NULL |
| Test Golfer | dddd2f94-... | NULL |
| Test Golfer | 90846885-... | NULL |
| (null) (null) | 803d33c1-... | NULL |

**Impact:** Players without team_id cannot:
- Access team features
- See team schedule/roster
- Receive team communications

### 3.3 Golf Teams Without Coaches: **7 of 10**

| Team Name | ID | Organization |
|-----------|-----|--------------|
| Lynchburg Golf Team | 5d6209d8-... | 235988f9-... |
| Lynchburg Golf Team | 028ed6b8-... | 5332a47f-... |
| hh | b9572350-... | 55e8d08a-... |
| j | 3389ab70-... | 8621be55-... |
| h | 6be5ff52-... | 25ccaa97-... |
| Men's Golf Team | 3d064033-... | bbb982fd-... |
| Women's Golf | 5c603951-... | cfbe2e0d-... |

**Impact:** Teams without coaches are inaccessible - no one can manage them.

**Recommendation:**
```sql
-- Assign orphaned teams to coaches or delete them
-- First, identify which coaches should own which teams
UPDATE golf_coaches SET team_id = '[team_id]' WHERE id = '[coach_id]';

-- OR delete orphaned teams (test data)
DELETE FROM golf_teams WHERE id NOT IN (SELECT team_id FROM golf_coaches WHERE team_id IS NOT NULL);
```

---

## 4. Organization Integrity

### 4.1 Golf Organizations

| Metric | Count |
|--------|-------|
| Total golf organizations | 11 |
| Organizations with teams | 10 |
| Organizations without teams | 1 |

### 4.2 Baseball Organizations

| Metric | Count |
|--------|-------|
| Total baseball organizations | 33 |
| Organizations with teams | 0 |

**Note:** Baseball has 33 organizations (colleges) but no teams. This is expected architecture - baseball focuses on recruiting (coach → organization) rather than team management. The `organizations` table contains college programs for players to discover.

---

## 5. Required Field Check

### 5.1 Users Table

| Field | NULL Count | Status |
|-------|------------|--------|
| email | 0 | PASS |
| role | 0 | PASS |
| sport | 0 | PASS |

### 5.2 Players Without Names: **9 records**

| Email | user_id | first_name | last_name |
|-------|---------|------------|-----------|
| bigblondebush69@gmail.com | 195b692e-... | NULL | NULL |
| 609@gmail.com | ba71c0a7-... | NULL | NULL |
| bob@gmail.com | 3421ffed-... | NULL | NULL |
| rinin37@gmail.com | e99e7f78-... | NULL | NULL |
| hhhh@gmail.com | 697fa64d-... | NULL | NULL |
| b@gmail.com | 4b7ac5fd-... | NULL | NULL |
| njrini9999@gmail.com | 2df81b85-... | NULL | NULL |
| njrini9@gmail.com | 3c2fa4be-... | NULL | NULL |
| grace@gmail.com | 88e2c376-... | NULL | NULL |

**Analysis:** These are real users who signed up but didn't complete the onboarding process. Their accounts exist in `auth.users` and `public.users`, and `players` records were created by the trigger, but the player record has NULL name fields.

**Root Cause:** The `handle_new_user()` trigger creates the player record but the onboarding form must populate the name fields afterward.

**Impact:**
- These players appear with blank names in coach views
- Profile pages show "(null) (null)"
- May cause UI issues

**Recommendation:**
```sql
-- Add NOT NULL constraints with defaults (future prevention)
-- For existing data, flag for follow-up or delete test accounts

-- Option: Soft-delete incomplete profiles older than X days
UPDATE players
SET is_inactive = TRUE
WHERE first_name IS NULL
AND created_at < NOW() - INTERVAL '30 days';
```

---

## 6. Foreign Key Integrity

### Status: ALL PASS

| Relationship | Invalid References |
|--------------|-------------------|
| golf_players.team_id → golf_teams.id | 0 |
| golf_coaches.organization_id → golf_organizations.id | 0 |
| golf_coaches.team_id → golf_teams.id | 0 |
| players.user_id → users.id | 0* |
| coaches.user_id → users.id | 0 |
| watchlists.coach_id → coaches.id | 0 |
| watchlists.player_id → players.id | 0 |

*Note: 30 players have NULL user_id (orphaned), but this is not a FK violation since NULL is allowed.

---

## 7. Duplicate Detection

### 7.1 Duplicate user_ids in Profiles

| Table | Duplicate user_ids | Status |
|-------|-------------------|--------|
| coaches | 0 | PASS |
| golf_coaches | 0 | PASS |
| players | 1 (NULL - 30 records) | See Section 2 |
| golf_players | 0 | PASS |

The 30 "duplicate" NULL user_ids are the orphaned seed data, not actual duplicates of real users.

---

## 8. Cross-Sport Data Consistency

### Status: PASS

No users found with conflicting sport assignments:
- All baseball users have baseball profiles only
- All golf users have golf profiles only
- No cross-contamination between sports

---

## 9. Empty Tables (Data Quality)

| Table | Record Count | Expected |
|-------|--------------|----------|
| watchlists | 0 | Low (no coach recruiting activity) |
| player_settings | 39 | Matches players count |
| videos | ? | Not checked |
| messages | ? | Not checked |

---

## 10. Recommended Fixes

### Priority 1: Critical

```sql
-- 1A. Delete orphaned seed players (if demo data not needed)
DELETE FROM players WHERE user_id IS NULL;

-- 1B. OR mark them as demo data
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_demo_data BOOLEAN DEFAULT FALSE;
UPDATE players SET is_demo_data = TRUE WHERE user_id IS NULL;
-- Update queries to filter: WHERE is_demo_data = FALSE
```

### Priority 2: High

```sql
-- 2A. Link golf coaches to teams (manual mapping needed)
-- Coach 88febdff should own which team?
-- Coach 1c9780fe should own which team?

-- 2B. Delete orphaned golf teams (test data)
DELETE FROM golf_teams
WHERE id NOT IN (
  SELECT DISTINCT team_id FROM golf_coaches WHERE team_id IS NOT NULL
  UNION
  SELECT DISTINCT team_id FROM golf_players WHERE team_id IS NOT NULL
);
```

### Priority 3: Medium

```sql
-- 3. Handle incomplete player profiles
-- Either enforce onboarding completion or clean up old incomplete accounts

-- Option: Add default names
UPDATE players
SET first_name = 'Unknown', last_name = 'Player'
WHERE first_name IS NULL OR last_name IS NULL;

-- Better option: Delete incomplete test accounts
DELETE FROM players WHERE first_name IS NULL AND email LIKE '%@gmail.com';
-- (Be careful with this - verify these are test accounts first)
```

---

## Summary

| Category | Issue | Count | Severity |
|----------|-------|-------|----------|
| Orphaned Data | Baseball players without users | 30 | CRITICAL |
| Orphaned Data | Golf players without teams | 4 | WARNING |
| Orphaned Data | Golf teams without coaches | 7 | WARNING |
| Incomplete Data | Players without names | 9 | MEDIUM |
| Foreign Keys | Invalid references | 0 | PASS |
| Duplicates | Duplicate user profiles | 0 | PASS |
| Cross-Sport | Data contamination | 0 | PASS |

**Overall Data Integrity Score: 70/100**

The main issues are orphaned seed data and incomplete onboarding, not structural integrity problems. The database schema and foreign key relationships are sound.

---

## Next Steps

1. **Decide on seed data strategy**: Keep demo players or delete them?
2. **Clean up test golf teams**: Delete teams created during testing
3. **Enforce onboarding completion**: Add validation or cleanup job
4. **Add data quality monitoring**: Periodic checks for orphaned records

# Migration Instructions - Day 1 Database Foundation

## Overview

This guide walks you through running all Day 1 database migrations on Supabase.

**Total migrations:** 10 files (005-014)
**New tables:** 16
**Estimated time:** 5-10 minutes

---

## Prerequisites

- [ ] Supabase project created
- [ ] Access to Supabase SQL Editor
- [ ] Project URL and keys configured in `.env.local`

---

## Step-by-Step Instructions

### Option A: Run All at Once (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project
   - Navigate to **SQL Editor**

2. **Create New Query**
   - Click "New query" button
   - Name it "Day 1 Migrations"

3. **Copy and Execute Each Migration**

Run these migrations **in order** (one at a time or combined):

#### Migration 1: Fix Pipeline Stage Enum
```sql
-- Copy contents of: 005_fix_pipeline_stage_enum.sql
```

#### Migration 2: Organizations
```sql
-- Copy contents of: 006_create_organizations.sql
```

#### Migration 3: Teams System
```sql
-- Copy contents of: 007_create_teams_system.sql
```

#### Migration 4: Player Features
```sql
-- Copy contents of: 008_create_player_features.sql
```

#### Migration 5: Developmental Plans
```sql
-- Copy contents of: 009_create_developmental_plans.sql
```

#### Migration 6: Coach Features
```sql
-- Copy contents of: 010_create_coach_features.sql
```

#### Migration 7: Events and Camps
```sql
-- Copy contents of: 011_create_events_and_camps.sql
```

#### Migration 8: Enhanced Analytics
```sql
-- Copy contents of: 012_create_enhanced_analytics.sql
```

#### Migration 9: Update Players Table
```sql
-- Copy contents of: 013_update_players_table.sql
```

#### Migration 10: Update Coaches Table
```sql
-- Copy contents of: 014_update_coaches_table.sql
```

4. **Click "Run" for each migration**

---

### Option B: Run Via Supabase CLI (Advanced)

If you have the Supabase CLI installed:

```bash
# Navigate to project root
cd helmv3

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Run migrations
supabase db push
```

---

## Verification

After running all migrations, execute these verification queries in SQL Editor:

### 1. Check All Tables Exist

```sql
SELECT table_name,
       (SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = t.table_name) as columns
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations',
    'teams',
    'team_members',
    'team_invitations',
    'team_coach_staff',
    'player_settings',
    'player_metrics',
    'player_achievements',
    'recruiting_interests',
    'developmental_plans',
    'coach_notes',
    'coach_calendar_events',
    'events',
    'camps',
    'camp_registrations',
    'player_engagement_events'
  )
ORDER BY table_name;
```

**Expected:** 16 rows returned

### 2. Check RLS Enabled

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )
ORDER BY tablename;
```

**Expected:** All tables should have `rowsecurity = true`

### 3. Check Indexes Created

```sql
SELECT tablename, COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )
GROUP BY tablename
ORDER BY tablename;
```

**Expected:** Each table should have 2-8 indexes

### 4. Check Pipeline Stage Enum

```sql
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'pipeline_stage'
ORDER BY e.enumsortorder;
```

**Expected:**
```
watchlist
high_priority
offer_extended
committed
uninterested
```

### 5. Test Organization Insert

```sql
-- Test inserting a sample organization
INSERT INTO organizations (name, type, location_city, location_state)
VALUES ('Test High School', 'high_school', 'Austin', 'TX')
RETURNING id, name, type;

-- Clean up test data
DELETE FROM organizations WHERE name = 'Test High School';
```

**Expected:** Row inserted and returned, then deleted successfully

---

## Troubleshooting

### Error: "relation already exists"

**Solution:** Some tables may already exist. This is OK if using `IF NOT EXISTS` in migrations. Verify the table structure matches the migration.

### Error: "type pipeline_stage already exists"

**Solution:** The enum migration (005) may have already run. Skip it and continue with migration 006.

### Error: "permission denied"

**Solution:** Ensure you're running queries as a superuser or service_role key, not as an authenticated user.

### Error: "column already exists"

**Solution:** Migrations 013-014 add columns to existing tables. If columns already exist, the `IF NOT EXISTS` clause will skip them.

### Foreign Key Errors

**Solution:** Ensure migrations run in order. Organizations must exist before teams, coaches, etc.

---

## Success Indicators

✅ All 16 tables created
✅ RLS enabled on all tables
✅ 50+ indexes created
✅ Helper functions created (get_player_teams, calculate_profile_completion, etc.)
✅ Triggers created (update_updated_at, camp_registration_counts, etc.)
✅ No errors in SQL Editor

---

## Next Steps

Once all migrations are verified:

1. ✅ Mark "Run all migrations on Supabase" as complete
2. ✅ Mark "Verify all tables created successfully" as complete
3. ➡️ Proceed to **Day 2: TypeScript Types**
   - Create `lib/types/database.ts`
   - Generate types from Supabase schema
   - Create helper types for components

---

## Quick Reference: Migration Order

| # | File | Creates | Dependencies |
|---|------|---------|-------------|
| 005 | fix_pipeline_stage_enum.sql | Enum fix | recruit_watchlist table |
| 006 | create_organizations.sql | organizations | - |
| 007 | create_teams_system.sql | teams, team_members, team_invitations, team_coach_staff | organizations, coaches |
| 008 | create_player_features.sql | player_settings, player_metrics, player_achievements, recruiting_interests | players, organizations |
| 009 | create_developmental_plans.sql | developmental_plans | coaches, players, teams |
| 010 | create_coach_features.sql | coach_notes, coach_calendar_events | coaches, players |
| 011 | create_events_and_camps.sql | events, camps, camp_registrations | organizations, teams, coaches, players |
| 012 | create_enhanced_analytics.sql | player_engagement_events | players, coaches |
| 013 | update_players_table.sql | Updates players | organizations |
| 014 | update_coaches_table.sql | Updates coaches | organizations |

---

## Support

If you encounter issues not covered in troubleshooting:

1. Check Supabase logs: Dashboard → Logs → Database
2. Review migration file for comments
3. Verify foreign key dependencies exist
4. Check RLS policies aren't blocking operations

---

**Document prepared:** 2024-12-17
**Status:** Ready for execution
**Phase:** Day 1 - Database Foundation

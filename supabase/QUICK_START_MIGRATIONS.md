# Quick Start: Run Migrations Manually

If the local Supabase setup is taking too long or you prefer to use your hosted Supabase project, follow these steps to run migrations directly in the Supabase SQL Editor.

## Option 1: Use Hosted Supabase (Recommended for Quick Start)

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click "SQL Editor" in the left sidebar

### Step 2: Run Each Migration in Order

Copy and paste each migration file contents into the SQL Editor and click "Run".

**✅ Run these in order:**

1. [005_fix_pipeline_stage_enum.sql](./migrations/005_fix_pipeline_stage_enum.sql)
2. [006_create_organizations.sql](./migrations/006_create_organizations.sql)
3. [007_create_teams_system.sql](./migrations/007_create_teams_system.sql)
4. [008_create_player_features.sql](./migrations/008_create_player_features.sql)
5. [009_create_developmental_plans.sql](./migrations/009_create_developmental_plans.sql)
6. [010_create_coach_features.sql](./migrations/010_create_coach_features.sql)
7. [011_create_events_and_camps.sql](./migrations/011_create_events_and_camps.sql)
8. [012_create_enhanced_analytics.sql](./migrations/012_create_enhanced_analytics.sql)
9. [013_update_players_table.sql](./migrations/013_update_players_table.sql)
10. [014_update_coaches_table.sql](./migrations/014_update_coaches_table.sql)

### Step 3: Verify Installation

After running all 10 migrations, run this verification query:

```sql
-- Check all tables exist
SELECT
  table_name,
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

**Expected result:** 16 rows

---

## Option 2: Wait for Local Supabase (Currently Running)

The local Supabase instance is currently starting up. Once it's ready, you can run:

```bash
cd helmv3
supabase db push
```

This will automatically apply all migrations in the `supabase/migrations` folder.

---

## What Each Migration Does

| Migration | Tables Created | Purpose |
|-----------|----------------|---------|
| 005 | - | Fixes pipeline_stage enum values |
| 006 | organizations | Unified org table for colleges, high schools, JUCOs, showcases |
| 007 | teams, team_members, team_invitations, team_coach_staff | Complete team management system |
| 008 | player_settings, player_metrics, player_achievements, recruiting_interests | Player privacy, metrics, achievements |
| 009 | developmental_plans | Coach-created development plans with goals/drills |
| 010 | coach_notes, coach_calendar_events | Private coach notes and calendar |
| 011 | events, camps, camp_registrations | Events, camps, and camp registration system |
| 012 | player_engagement_events | Comprehensive engagement tracking (replaces profile_views) |
| 013 | - | Adds missing fields to players table |
| 014 | - | Adds missing fields to coaches table |

**Total: 16 new tables created + 2 tables updated**

---

## Troubleshooting

### Error: "relation already exists"
- **Solution:** Table may already exist from previous migration attempts. This is OK if using `IF NOT EXISTS`.

### Error: "type pipeline_stage already exists"
- **Solution:** Skip migration 005 if the enum already has correct values.

### Error: "permission denied"
- **Solution:** Ensure you're using the service_role key or running as a superuser in Supabase dashboard.

### Foreign key errors
- **Solution:** Ensure migrations run in order. Organizations must exist before teams, coaches must exist before notes, etc.

---

## Next Steps After Migrations

Once all migrations are verified:

1. ✅ Generate TypeScript types:
   ```bash
   npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/types/database.ts
   ```

2. ✅ Test database connection in your app:
   ```typescript
   import { createClient } from '@/lib/supabase/client';
   const supabase = createClient();
   const { data } = await supabase.from('organizations').select('*').limit(1);
   console.log('Connection test:', data);
   ```

3. ✅ Proceed to Days 3-4: TypeScript Types & API Patterns

---

## Status Check

Run this query to get a full migration status report:

```sql
-- Migration status report
SELECT
  'Tables Created' as metric,
  COUNT(*)::text as value
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )

UNION ALL

SELECT
  'Indexes Created',
  COUNT(*)::text
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )

UNION ALL

SELECT
  'RLS Policies',
  COUNT(*)::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'teams', 'team_members', 'team_invitations', 'team_coach_staff',
    'player_settings', 'player_metrics', 'player_achievements', 'recruiting_interests',
    'developmental_plans', 'coach_notes', 'coach_calendar_events',
    'events', 'camps', 'camp_registrations', 'player_engagement_events'
  )

UNION ALL

SELECT
  'Functions',
  COUNT(*)::text
FROM pg_proc
WHERE proname IN (
  'get_player_teams',
  'calculate_profile_completion',
  'get_player_notes',
  'get_upcoming_events',
  'get_player_engagement_summary',
  'get_recent_engagement',
  'get_coach_profile',
  'get_coach_teams',
  'calculate_coach_completion'
);
```

**Expected results:**
- Tables Created: 16
- Indexes Created: 50+
- RLS Policies: 30+
- Functions: 9

---

**Last Updated:** 2024-12-17
**Status:** Ready for execution
**Phase:** Day 1 - Database Foundation

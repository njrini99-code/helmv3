# 🔒 Apply Batch 9 RLS Policies

## Quick Apply (Recommended)

Go to your Supabase Dashboard SQL Editor and run the migration:

https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc/sql/new

**Copy and paste the contents of:**
```
supabase/migrations/041_batch9_rls_policies.sql
```

Or run this command to view the file:
```bash
cat supabase/migrations/041_batch9_rls_policies.sql
```

## What These Policies Do

### 🎯 Watchlists (Pipeline Feature)
- ✅ Coaches can view/edit/delete their own watchlist
- ✅ Coaches can add players to watchlist
- ✅ Coaches can update pipeline stages

### 📊 Player Metrics (Stats)
- ✅ Players can view/edit their own stats
- ✅ Coaches can view stats for watchlisted players
- ✅ Coaches can view/edit stats for team players

### 👤 Players (Discovery & Cards)
- ✅ Players can view their own profile
- ✅ Players can update their own profile
- ✅ Coaches can view recruiting-activated players
- ✅ Players can view other recruiting-activated players

### 🏫 Organizations
- ✅ Anyone can view organizations (for school selection)
- ✅ Coaches can create/update their organization

### 🎥 Videos
- ✅ Players can upload/edit/delete their videos
- ✅ Coaches can view videos for watchlisted players
- ✅ Coaches can view videos for recruiting-activated players

### 👔 Coaches
- ✅ Coaches can view/update their own profile
- ✅ Anyone can view coach profiles (for program pages)

## Performance Indexes

The migration also adds indexes for:
- `watchlists` queries (by coach_id, player_id, pipeline_stage)
- `player_metrics` queries (by player_id, metric_label)
- `videos` queries (by player_id)
- `players` recruiting queries (by recruiting_activated, grad_year, position)

## Alternative: Apply via CLI

If you want to use the CLI (requires fixing migration conflicts first):

```bash
# This will prompt you to confirm
npx supabase db push --include-all
```

**Note:** Migrations 031-040 have conflicts with existing database objects. The SQL file (041) can be run independently without issues.

## Verify RLS is Working

After applying, test with these queries in the SQL editor:

```sql
-- Check watchlist policies exist
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'watchlists';

-- Check player_metrics policies
SELECT policyname FROM pg_policies
WHERE tablename = 'player_metrics';

-- Check RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('watchlists', 'player_metrics', 'players', 'videos')
AND schemaname = 'public';
```

Expected result: All tables should have `rowsecurity = true` and multiple policies.

## Troubleshooting

If you see errors like "policy already exists":
- This is OK! It means those policies were already created
- The database is correctly configured
- You can safely ignore these errors

If RLS blocks legitimate access:
- Check you're logged in as the correct user role
- Verify the user has corresponding coach/player record
- Check the `auth.uid()` matches the user_id in coaches/players table

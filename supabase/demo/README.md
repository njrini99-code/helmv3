# GolfHelm Shared Demo — Database Scripts

These scripts set up and maintain the shared-demo coach experience at `/golf/demo`.

## Files and Execution Order

| # | File | What it does |
|---|------|-------------|
| 01 | `01_demo_sessions_table.sql` | Creates `golf_demo_sessions` table, enables RLS, adds indexes. |
| 02 | `02_shared_demo_coach.sql` | Creates the shared demo coach login + attaches it to the demo team. |
| 03 | `03_gapfill_tyler_passmore.sql` | Seeds 11 rounds + stats for Tyler Passmore (the roster gap). |
| 04 | `04_reset_demo.sql` | **Manual-use only.** Prunes stale visitor data. Has a safety gate. |

Run scripts **01 → 02 → 03** in order. Script 04 is run manually as needed.

---

## Placeholder Substitution (Script 02)

Before executing `02_shared_demo_coach.sql`, replace these two placeholders:

| Placeholder | What to put there | Example |
|-------------|------------------|---------|
| `__DEMO_EMAIL__` | The demo coach email address | `demo-coach@helmsportslabs.com` |
| `__DEMO_PASSWORD__` | A strong random password (≥20 chars) | `Xk9m!2vQz#rT8pLnW3sY` |

These values should match the environment variables:
- `DEMO_COACH_EMAIL` (read by `src/lib/demo/config.ts → getDemoCoachCredentials()`)
- `DEMO_COACH_PASSWORD` (same)

**Never commit real credentials.** Substitute at execution time only.

### Quick substitution via sed (bash):
```bash
sed \
  -e 's/__DEMO_EMAIL__/demo-coach@helmsportslabs.com/g' \
  -e 's/__DEMO_PASSWORD__/YOUR_STRONG_PASSWORD_HERE/g' \
  supabase/demo/02_shared_demo_coach.sql \
  > /tmp/02_substituted.sql
# Then execute /tmp/02_substituted.sql
```

---

## How to Run via Supabase MCP

The orchestrator executes these via `apply_migration` (or `execute_sql` for
non-migration scripts). All scripts require the **service-role** connection
because they write to `auth.*` and bypass RLS.

```
# Via Supabase MCP (orchestrator):
apply_migration(name="create_golf_demo_sessions",    query=<contents of 01>)
apply_migration(name="create_shared_demo_coach",     query=<substituted 02>)
apply_migration(name="gapfill_tyler_passmore",       query=<contents of 03>)
# Script 04 is never applied automatically — run manually when needed.
```

### Via psql (alternative):
```bash
# Requires SUPABASE_DB_URL (from project dashboard → Settings → Database)
PGPASSWORD=... psql "$SUPABASE_DB_URL" -f supabase/demo/01_demo_sessions_table.sql
PGPASSWORD=... psql "$SUPABASE_DB_URL" -f /tmp/02_substituted.sql
PGPASSWORD=... psql "$SUPABASE_DB_URL" -f supabase/demo/03_gapfill_tyler_passmore.sql
```

---

## Migration Convention

Script 01 has a **canonical copy in `supabase/migrations/`** as
`20260611000000_create_golf_demo_sessions.sql`. This ensures the new table is
tracked in the migration history and will be applied to any fresh branch/environment
that replays the migration log. Scripts 02–04 are NOT in `supabase/migrations/`
because they are one-off seed/data operations, not schema changes.

After script 01 runs, regenerate TypeScript DB types:
```bash
npm run db:types
# or: supabase gen types typescript --project-id qmnssrrolpinvwjjnufo > src/lib/types/database.ts
```

---

## Verification Queries

Run these after execution to confirm correctness:

```sql
-- 1. golf_demo_sessions table exists with RLS enabled
SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
 WHERE tablename = 'golf_demo_sessions';

-- 2. No public policies on golf_demo_sessions (expect 0 rows)
SELECT policyname, cmd FROM pg_policies
 WHERE tablename = 'golf_demo_sessions';

-- 3. Shared demo coach exists in auth.users
SELECT id, email, email_confirmed_at, created_at
  FROM auth.users
 WHERE email = 'demo-coach@helmsportslabs.com';

-- 4. Shared demo coach has auth.identities row (required for password sign-in)
SELECT u.email, i.provider, i.provider_id
  FROM auth.users u
  JOIN auth.identities i ON i.user_id = u.id
 WHERE u.email = 'demo-coach@helmsportslabs.com';

-- 5. Demo coach in golf_team_coach_staff (is_primary must be false)
SELECT gtcs.role, gtcs.is_primary, gc.email, gt.name AS team_name
  FROM public.golf_team_coach_staff gtcs
  JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
  JOIN public.golf_teams   gt ON gt.id = gtcs.team_id
 WHERE gc.email = 'demo-coach@helmsportslabs.com';

-- 6. Tyler Passmore now has 11 rounds
SELECT player_id, COUNT(*) AS rounds, MIN(round_date), MAX(round_date)
  FROM public.golf_rounds
 WHERE player_id = 'ed1ff03e-b33a-4a80-891e-09685b7db3d0'
 GROUP BY player_id;

-- 7. Tyler Passmore stats cache
SELECT player_id, rounds_played, scoring_average, best_round, worst_round,
       gir_percentage, driving_accuracy_percentage, putts_per_round
  FROM public.golf_player_stats_cache
 WHERE player_id = 'ed1ff03e-b33a-4a80-891e-09685b7db3d0';

-- 8. Tyler Passmore round reviews (expect 2)
SELECT round_id, round_score, round_score_to_par, status, sentiment_score
  FROM public.golf_round_reviews
 WHERE player_id = 'ed1ff03e-b33a-4a80-891e-09685b7db3d0';

-- 9. Full team round counts (Tyler should now match the others)
SELECT gp.first_name, gp.last_name, COUNT(gr.id) AS rounds
  FROM public.golf_players gp
  LEFT JOIN public.golf_rounds gr ON gr.player_id = gp.id
                                  AND gr.team_id = '6ecdd1a6-63fe-4beb-b094-00118f334163'
 GROUP BY gp.id, gp.first_name, gp.last_name
 ORDER BY rounds DESC;
```

---

## Reset Script (Script 04)

`04_reset_demo.sql` is **commented out by default** with a SAFETY GATE
(`RAISE EXCEPTION`). To use it:

1. Open the file.
2. Comment out or remove the `RAISE EXCEPTION` line.
3. Uncomment the DELETE blocks.
4. Execute via MCP or psql using the service-role connection.
5. Run the verification queries above to confirm expected row counts.

The reset removes:
- `golf_demo_sessions` entries older than 30 days.
- Visitor-created rounds (post-seed date, non-sentinel) on the demo team.

It does **NOT** remove: seeded player rounds, Nick Rini's data, the shared
demo coach account, or any non-round data (insights, events, tasks, etc.).

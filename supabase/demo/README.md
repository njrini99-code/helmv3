# GolfHelm Shared Demo — Database Scripts

These scripts set up the shared-demo coach login at `/golf/demo`. The demo
team's data (players, rounds, holes, shots, events, tournaments, qualifiers,
practice plans, tasks, trips, messages) is not seeded from here any more: the
demo generator (`src/lib/golf/demo`) writes it, fully synthetic and dated
around today, through the database functions of migration
`20261115211000_golf_demo_generator.sql`.

- Daily: the cron `/api/cron/golf-demo-refresh` (behind the
  `golf_demo_refresh_v1` flag, off by default).
- By hand: `npm run golf:demo:refresh` (a dry run; `--apply` writes) and
  `npm run golf:demo:verify` (read-only check of what a prospect sees).
  Both refuse production unless `HELM_ALLOW_PRODUCTION=1`.

The older seeders that cloned real players' rounds onto the demo team, the
gap-fill rounds, the visitor-round reset and the interim date shift were
removed with the generator (launch readiness DD-02, DD-04, DD-11, DD-15). Do
not bring them back: the generator owns every row it writes through its
ledger and never touches a row it did not write.

## Files and Execution Order

| # | File | What it does |
|---|------|-------------|
| 01 | `01_demo_sessions_table.sql` | Creates `golf_demo_sessions` table, enables RLS, adds indexes. |
| 02 | `02_shared_demo_coach.sql` | Creates the shared demo coach login + attaches it to the demo team. |

Run scripts **01 → 02** in order, on staging first.

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
```

### Via psql (alternative):
```bash
# Requires SUPABASE_DB_URL (from project dashboard → Settings → Database)
PGPASSWORD=... psql "$SUPABASE_DB_URL" -f supabase/demo/01_demo_sessions_table.sql
PGPASSWORD=... psql "$SUPABASE_DB_URL" -f /tmp/02_substituted.sql
```

---

## Migration Convention

Script 01 has a **canonical copy in `supabase/migrations/`** as
`20260611000000_create_golf_demo_sessions.sql`. This ensures the new table is
tracked in the migration history and will be applied to any fresh branch/environment
that replays the migration log. Script 02 is NOT in `supabase/migrations/`
because it is a one-off data operation, not a schema change.

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
```

For the demo team's data, run `npm run golf:demo:verify` instead.

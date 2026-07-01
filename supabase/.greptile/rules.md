# Supabase / database review rules (cascades onto the root `.greptile/rules.md`)

This is a multi-tenant college-athletics SaaS holding minors' academic +
athletic PII. **Database safety IS product safety** — a cross-tenant leak is the
worst-case, business-ending failure. Patterns + required tests:
`docs/v3-rls-template.md`. Schema: `memory/context/{golfhelm,baseballhelm}-database.md`.

## Always check on a migration / policy PR
- **RLS on every table** — `CREATE TABLE` ships with `ENABLE ROW LEVEL SECURITY`
  + at least one `CREATE POLICY` in the same migration.
- **No cross-team `USING (true)` on PII tables** — a SELECT policy that returns
  every row to any authenticated user (e.g. on `baseball_players`,
  `golf_*` player/roster tables) is a cross-tenant PII exposure. Read access must
  gate through the canonical helpers (`is_team_coach`, `is_team_player`,
  `is_baseball_team_staff`, `current_player_id`, `can_view_baseball_player`, …).
- **Forward-only migrations** — never edit a migration with timestamp prefix
  <= `20260527120000`. Fix replay failures with a new migration.
- **Service-role stays server-only** — no service-role logic outside
  `src/lib/supabase/admin*` / `src/app/api/**/admin/**`.
- **SECURITY DEFINER hygiene** — every `SECURITY DEFINER` function pins
  `SET search_path = ''` (or `'public'` per existing convention).
- **Indexes** — every FK column and every column used in an RLS predicate has an
  index. Enum additions ship in a separate migration BEFORE the migration that
  uses them (Postgres 55P04). One purpose per migration.
- **No destructive writes / idempotent imports** — no DELETE-then-INSERT in
  save/submit/sync SQL; importers update/merge, never duplicate, and preserve
  source/timestamp/confidence.
- **Verified + rollback** — migrations carry a `-- VERIFIED:` prod-state query
  and a `-- ROLLBACK:` note; `IF [NOT] EXISTS` guards; `DO $$…$$` around renames.
  Remember: a migration file being present does NOT mean it's applied in prod
  (verify against `information_schema`, not the migration history).

## Block if
- a new table lacks RLS or a policy; a policy allows cross-team access or is a
  bare `USING (true)` on PII;
- a migration edits historical (baseline) migrations instead of adding a forward
  one;
- service-role capability leaks outside admin/server-only paths;
- a destructive delete/insert can lose user data;
- a new FK or RLS-predicate column lacks an index;
- a `SECURITY DEFINER` function omits `search_path`.

## Suggest (non-blocking) enhancements
- A missing positive/negative/cross-team/transfer RLS test for a new policy
  (`docs/v3-rls-template.md` testing section).
- An index that a new RLS predicate or hot query will need.
- Capturing source/timestamp/confidence columns on a new import target so later
  automation and dedup are possible.

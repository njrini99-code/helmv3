# Team A — Database Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development. See `00-orchestration.md` for team boundaries. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile schema drift, fix RLS read-holes, eliminate phantom-table writes, regenerate types. After this lands, all schema-drift bugs in code become TypeScript errors that B/C/E must fix.

**Architecture:** Three migrations applied in order — (1) create missing tables, (2) fix RLS, (3) clean up duplicate policies. Then regenerate `src/lib/types/database.ts` from live DB. Finally re-snapshot the human-readable schema doc.

**Tech Stack:** Supabase Postgres 17, `mcp__plugin_supabase_supabase__apply_migration`.

**Owns (file ownership boundary):**
- `supabase/migrations/20260421000000_canonical_coachhelm_schema.sql` (NEW)
- `supabase/migrations/20260421000100_canonical_coachhelm_rls.sql` (NEW)
- `supabase/migrations/20260421000200_coachhelm_cleanup_dup_policies.sql` (NEW)
- `supabase/migrations/20260421000300_coachhelm_function_search_path.sql` (NEW)
- `supabase/migrations/20260421000400_coachhelm_storage_buckets.sql` (NEW)
- `src/lib/types/database.ts` (REGENERATED)
- `memory/context/golfhelm-database.md` (REGENERATED snapshot)
- This plan file

**Blocks:** Teams B, C, E.

---

## Pre-flight: live-DB verification

- [ ] **Step P1: Confirm `golf_global_patterns` does not exist**

```sql
SELECT EXISTS(SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='golf_global_patterns');
```
Expected: `false`. Use `mcp__plugin_supabase_supabase__execute_sql` with `project_id='qmnssrrolpinvwjjnufo'`.

- [ ] **Step P2: Confirm `golf_insight_effectiveness_select` is `USING (true)`**

```sql
SELECT policyname, qual::text FROM pg_policies
WHERE tablename='golf_insight_effectiveness' AND cmd='SELECT';
```
Expected: at least one row with `qual = 'true'`.

- [ ] **Step P3: Confirm `golf_player_baselines` SELECT compares `auth.uid() = player_id`**

```sql
SELECT policyname, qual::text FROM pg_policies
WHERE tablename='golf_player_baselines';
```
Expected: row containing `(auth.uid() = player_id)`.

- [ ] **Step P4: Snapshot all current `golf_*` policies for diffing later**

```sql
SELECT tablename, policyname, cmd, qual::text, with_check::text, roles
FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'golf_%'
ORDER BY tablename, policyname;
```
Save output to `/tmp/golf-rls-pre.json`.

---

## Task A1: Migration 1 — create missing tables

**Files:**
- Create: `supabase/migrations/20260421000000_canonical_coachhelm_schema.sql`

This creates the missing `golf_global_patterns` table and the `golf_insight_player_feedback` table that Team D needs.

- [ ] **Step 1: Write the migration**

```sql
-- 20260421000000_canonical_coachhelm_schema.sql
-- Creates tables that the engine code references but production lacks.

-- golf_global_patterns: cross-learner writes to it; previously a phantom table
CREATE TABLE IF NOT EXISTS public.golf_global_patterns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature       TEXT NOT NULL,
  pattern_type    TEXT NOT NULL,
  conditions      JSONB NOT NULL DEFAULT '{}'::jsonb,
  outcomes        JSONB NOT NULL DEFAULT '{}'::jsonb,
  prevalence      NUMERIC(5,4) NOT NULL DEFAULT 0,
  average_impact  NUMERIC(6,3) NOT NULL DEFAULT 0,
  confidence      NUMERIC(5,4) NOT NULL DEFAULT 0,
  instance_count  INTEGER NOT NULL DEFAULT 0,
  player_count    INTEGER NOT NULL DEFAULT 0,
  varied_by_tier      JSONB NOT NULL DEFAULT '{}'::jsonb,
  varied_by_handicap  JSONB NOT NULL DEFAULT '{}'::jsonb,
  contributing_players UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT golf_global_patterns_signature_unique UNIQUE (signature)
);
CREATE INDEX IF NOT EXISTS idx_golf_global_patterns_pattern_type ON public.golf_global_patterns (pattern_type);
CREATE INDEX IF NOT EXISTS idx_golf_global_patterns_confidence ON public.golf_global_patterns (confidence DESC);
ALTER TABLE public.golf_global_patterns ENABLE ROW LEVEL SECURITY;

-- golf_insight_player_feedback: Team D's player feedback target
CREATE TABLE IF NOT EXISTS public.golf_insight_player_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id  UUID NOT NULL REFERENCES public.golf_coach_insights(id) ON DELETE CASCADE,
  player_id   UUID NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  rating      TEXT NOT NULL CHECK (rating IN ('helpful','not_helpful','dismissed','acknowledged')),
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT golf_insight_player_feedback_unique UNIQUE (insight_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_golf_insight_player_feedback_insight ON public.golf_insight_player_feedback (insight_id);
CREATE INDEX IF NOT EXISTS idx_golf_insight_player_feedback_player ON public.golf_insight_player_feedback (player_id, created_at DESC);
ALTER TABLE public.golf_insight_player_feedback ENABLE ROW LEVEL SECURITY;

-- updated_at trigger for golf_global_patterns
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS golf_global_patterns_touch ON public.golf_global_patterns;
CREATE TRIGGER golf_global_patterns_touch
  BEFORE UPDATE ON public.golf_global_patterns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

- [ ] **Step 2: Apply via MCP**

```
mcp__plugin_supabase_supabase__apply_migration
  project_id: qmnssrrolpinvwjjnufo
  name: 20260421000000_canonical_coachhelm_schema
  query: <contents of file>
```

- [ ] **Step 3: Verify tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('golf_global_patterns','golf_insight_player_feedback')
ORDER BY table_name;
```
Expected: 2 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260421000000_canonical_coachhelm_schema.sql
git commit -m "feat(db): create golf_global_patterns + golf_insight_player_feedback"
```

---

## Task A2: Migration 2 — canonical RLS for engine tables

**Files:**
- Create: `supabase/migrations/20260421000100_canonical_coachhelm_rls.sql`

Fixes LIVE-3, LIVE-4, LIVE-5, LIVE-6, LIVE-7, LIVE-13, LIVE-26 in one consolidated migration.

- [ ] **Step 1: Write the migration**

```sql
-- 20260421000100_canonical_coachhelm_rls.sql
-- Replaces broken/permissive RLS on engine tables with canonical helper-based policies.

-- =================================================================
-- golf_insight_effectiveness — was USING (true), now coach-scoped
-- =================================================================
DROP POLICY IF EXISTS "golf_insight_effectiveness_select" ON public.golf_insight_effectiveness;
DROP POLICY IF EXISTS "Anyone can view insight effectiveness" ON public.golf_insight_effectiveness;
CREATE POLICY "effectiveness_select_team_coach" ON public.golf_insight_effectiveness
  FOR SELECT TO authenticated
  USING (is_golf_team_coach(team_id));
CREATE POLICY "effectiveness_select_admin" ON public.golf_insight_effectiveness
  FOR SELECT TO authenticated
  USING (is_admin());
CREATE POLICY "effectiveness_insert_service" ON public.golf_insight_effectiveness
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'service_role');

-- =================================================================
-- golf_coach_behavior_log — was WITH CHECK (true) + broken SELECT
-- =================================================================
DROP POLICY IF EXISTS "Coaches can view own behavior" ON public.golf_coach_behavior_log;
DROP POLICY IF EXISTS "System can insert behavior" ON public.golf_coach_behavior_log;
CREATE POLICY "coach_behavior_select_own" ON public.golf_coach_behavior_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_coaches c
            WHERE c.id = golf_coach_behavior_log.coach_id AND c.user_id = auth.uid())
  );
CREATE POLICY "coach_behavior_insert_service" ON public.golf_coach_behavior_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "coach_behavior_admin_read" ON public.golf_coach_behavior_log
  FOR SELECT TO authenticated USING (is_admin());

-- =================================================================
-- golf_player_baselines — fix player SELECT (auth.uid() != player_id)
-- =================================================================
DROP POLICY IF EXISTS "Coaches and players can view baselines" ON public.golf_player_baselines;
CREATE POLICY "baselines_select_player" ON public.golf_player_baselines
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_player_baselines.player_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "baselines_select_coach" ON public.golf_player_baselines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_player_baselines.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );
CREATE POLICY "baselines_write_service" ON public.golf_player_baselines
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =================================================================
-- golf_percentile_cache — same fix as baselines
-- =================================================================
DROP POLICY IF EXISTS "Coaches and players can view percentiles" ON public.golf_percentile_cache;
CREATE POLICY "percentile_select_player" ON public.golf_percentile_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_percentile_cache.player_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "percentile_select_coach" ON public.golf_percentile_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_percentile_cache.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );
CREATE POLICY "percentile_write_service" ON public.golf_percentile_cache
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =================================================================
-- golf_team_coachhelm_settings — was org-wide, now team-scoped
-- =================================================================
DROP POLICY IF EXISTS "Coaches can update team coachhelm settings" ON public.golf_team_coachhelm_settings;
DROP POLICY IF EXISTS "Coaches can view team coachhelm settings" ON public.golf_team_coachhelm_settings;
CREATE POLICY "team_chs_settings_select_team" ON public.golf_team_coachhelm_settings
  FOR SELECT TO authenticated
  USING (is_golf_team_coach(team_id));
CREATE POLICY "team_chs_settings_write_team" ON public.golf_team_coachhelm_settings
  FOR ALL TO authenticated
  USING (is_golf_team_coach(team_id))
  WITH CHECK (is_golf_team_coach(team_id));

-- =================================================================
-- golf_global_patterns — service role write, all auth read (no PII)
-- =================================================================
CREATE POLICY "global_patterns_select_authed" ON public.golf_global_patterns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "global_patterns_write_service" ON public.golf_global_patterns
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- =================================================================
-- golf_insight_player_feedback (NEW)
-- =================================================================
CREATE POLICY "ipf_player_select_own" ON public.golf_insight_player_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_insight_player_feedback.player_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "ipf_player_insert_own" ON public.golf_insight_player_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_insight_player_feedback.player_id AND gp.user_id = auth.uid())
  );
CREATE POLICY "ipf_coach_select_team" ON public.golf_insight_player_feedback
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_insight_player_feedback.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );

-- =================================================================
-- Add policies to LIVE-26 tables that have RLS but no policies
-- =================================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'api_call_logs','auth_metrics_hourly','background_job_logs',
    'error_rate_hourly','golf_platform_metrics_daily','golf_tracer_health_snapshot'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_admin())',
                   t || '_admin_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
                   t || '_service_write', t);
  END LOOP;
END$$;

-- =================================================================
-- Drop the malformed announcement policies (LIVE-13)
-- =================================================================
DROP POLICY IF EXISTS "golf_ann_documents_select_team" ON public.golf_announcement_documents;
DROP POLICY IF EXISTS "golf_ann_tasks_select_team" ON public.golf_announcement_tasks;
CREATE POLICY "ann_documents_select_team" ON public.golf_announcement_documents
  FOR SELECT TO authenticated
  USING (
    announcement_id IN (
      SELECT a.id FROM public.golf_announcements a
      WHERE is_golf_team_coach(a.team_id) OR is_golf_team_player(a.team_id)
    )
  );
CREATE POLICY "ann_tasks_select_team" ON public.golf_announcement_tasks
  FOR SELECT TO authenticated
  USING (
    announcement_id IN (
      SELECT a.id FROM public.golf_announcements a
      WHERE is_golf_team_coach(a.team_id) OR is_golf_team_player(a.team_id)
    )
  );
```

- [ ] **Step 2: Apply via MCP** (same pattern as A1, name `20260421000100_canonical_coachhelm_rls`)

- [ ] **Step 3: Verify the read holes are closed**

```sql
-- Should return 0 rows now (was 1)
SELECT policyname, qual::text FROM pg_policies
WHERE tablename='golf_insight_effectiveness' AND cmd='SELECT' AND qual = 'true';

-- Should return 0 rows
SELECT policyname FROM pg_policies
WHERE tablename='golf_coach_behavior_log' AND with_check = 'true';

-- Should return rows containing both player and coach SELECT policies
SELECT policyname FROM pg_policies
WHERE tablename='golf_player_baselines' ORDER BY policyname;
```

- [ ] **Step 4: Smoke test as a player user via service role impersonation**

```sql
-- Impersonate a real player and check they can read their own baselines
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub":"<a real auth.users.id from golf_players>","role":"authenticated"}';
SELECT count(*) FROM golf_player_baselines;
RESET ROLE;
```
Expected: count ≥ 0 without error (was 0 before fix).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260421000100_canonical_coachhelm_rls.sql
git commit -m "fix(db): canonical RLS for engine tables — close player read holes, remove WITH CHECK true"
```

---

## Task A3: Migration 3 — clean up duplicate policies on golf_round_reviews

**Files:**
- Create: `supabase/migrations/20260421000200_coachhelm_cleanup_dup_policies.sql`

Fixes LIVE-11 — six overlapping SELECT policies on golf_round_reviews.

- [ ] **Step 1: Inventory current policies**

```sql
SELECT policyname, cmd FROM pg_policies
WHERE tablename='golf_round_reviews' ORDER BY cmd, policyname;
```
Document the current set in a comment block at the top of the migration.

- [ ] **Step 2: Write migration**

```sql
-- 20260421000200_coachhelm_cleanup_dup_policies.sql
-- Consolidates 6 overlapping golf_round_reviews policies into 4 canonical ones.
-- Pre-existing (live):
--   ALL  "Coaches can manage team reviews"           — coach via tcs join
--   SEL  "Coaches can view shared team reviews"      — coach + shared_with_coach=true
--   SEL  "Players can view their own reviews"        — player owns
--   INS  "Players can create their own reviews"      — player owns
--   UPD  "Players can update their own reviews"      — player owns
--   SEL  "admin_read_all"                            — admin
--   SEL  "golf_reviews_select_coach"                 — coach via is_golf_team_coach helper

DROP POLICY IF EXISTS "Coaches can manage team reviews" ON public.golf_round_reviews;
DROP POLICY IF EXISTS "Coaches can view shared team reviews" ON public.golf_round_reviews;
DROP POLICY IF EXISTS "golf_reviews_select_coach" ON public.golf_round_reviews;

CREATE POLICY "round_reviews_select_player" ON public.golf_round_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.golf_players gp
            WHERE gp.id = golf_round_reviews.player_id AND gp.user_id = auth.uid())
  );

CREATE POLICY "round_reviews_select_coach" ON public.golf_round_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_round_reviews.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );

CREATE POLICY "round_reviews_write_coach" ON public.golf_round_reviews
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.golf_team_members gtm
      WHERE gtm.player_id = golf_round_reviews.player_id
        AND gtm.status = 'active'::team_member_status
        AND is_golf_team_coach(gtm.team_id)
    )
  );
```

- [ ] **Step 3: Apply, verify, commit**

```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename='golf_round_reviews' ORDER BY cmd, policyname;
```
Expected: 4 policies (player SELECT, coach SELECT, coach UPDATE, admin SELECT, plus player INSERT/UPDATE retained).

```bash
git add supabase/migrations/20260421000200_coachhelm_cleanup_dup_policies.sql
git commit -m "refactor(db): consolidate 6 overlapping golf_round_reviews policies into canonical 4"
```

---

## Task A4: Migration 4 — pin function search_path

**Files:**
- Create: `supabase/migrations/20260421000300_coachhelm_function_search_path.sql`

Fixes LIVE-28. Supabase advisor flagged 30+ functions with mutable search_path; the engine-related ones must be pinned.

- [ ] **Step 1: Pull list from advisor + write migration**

```sql
-- 20260421000300_coachhelm_function_search_path.sql
-- Pin search_path on functions touched by the CoachHelm engine and stats pipeline.

ALTER FUNCTION public.update_round_stats_cache() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_player_stats_cache() SET search_path = public, pg_temp;
ALTER FUNCTION public.recalculate_round_strokes_gained() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_player_stats_strokes_gained() SET search_path = public, pg_temp;
ALTER FUNCTION public.sg_normalize_lie(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.sg_expected_strokes(numeric, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.sg_estimate_from_holes(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_golf_team_coach(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_golf_team_player(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
-- (Additional baseball/CRM functions pinned in a separate per-team migration.)
```

- [ ] **Step 2: Apply via MCP, verify**

```sql
SELECT proname, proconfig FROM pg_proc
WHERE proname IN ('update_round_stats_cache','is_golf_team_coach','is_admin','handle_new_user');
```
Expected: each row has `proconfig` containing `search_path=public, pg_temp`.

- [ ] **Step 3: Re-run advisor**

```
mcp__plugin_supabase_supabase__get_advisors  type: security
```
Confirm function_search_path_mutable count drops by ≥ 12.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260421000300_coachhelm_function_search_path.sql
git commit -m "chore(db): pin search_path on engine-related functions (advisor LIVE-28)"
```

---

## Task A5: Migration 5 — fix public storage buckets

**Files:**
- Create: `supabase/migrations/20260421000400_coachhelm_storage_buckets.sql`

Fixes LIVE-29.

- [ ] **Step 1: Write migration**

```sql
-- 20260421000400_coachhelm_storage_buckets.sql
-- Public storage buckets currently allow listing all files; restrict to direct URL access only.

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view documents" ON storage.objects;

-- Avatars: still publicly readable by URL (handled at bucket level), but listing requires auth
CREATE POLICY "Avatars accessible to authenticated" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');

-- Documents: only team members can list (URL access handled by signed URLs in app code)
-- Switch this bucket to private to enforce signed URLs
UPDATE storage.buckets SET public = false WHERE name = 'documents';
CREATE POLICY "Documents accessible to authed users" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
```

- [ ] **Step 2: Apply, verify, commit** — same pattern as A4. Expected: advisor public_bucket_allows_listing entries drop by 2.

---

## Task A6: Regenerate TypeScript types

**Files:**
- Modify (regenerate): `src/lib/types/database.ts`

After all DDL above, the codebase's generated types are stale. Regenerate.

- [ ] **Step 1: Generate fresh types via MCP**

```
mcp__plugin_supabase_supabase__generate_typescript_types  project_id: qmnssrrolpinvwjjnufo
```

- [ ] **Step 2: Write to `src/lib/types/database.ts`** (overwrite full file)

- [ ] **Step 3: Run typecheck, expect a wave of errors**

```bash
cd /Users/ricknini/Downloads/helmv3
npm run typecheck 2>&1 | tee /tmp/typecheck-after-types.log
```
Expected: many errors. **These errors are the proof that schema-drift bugs exist** — they're now visible. Teams B/C will fix them in their plans.

- [ ] **Step 4: Document the failing files**

Save the output to `docs/superpowers/plans/2026-04-21-coachhelm-fix/typecheck-baseline.txt`. Teams B/C use this as their work list.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/database.ts docs/superpowers/plans/2026-04-21-coachhelm-fix/typecheck-baseline.txt
git commit -m "chore(types): regenerate Supabase types from live DB; capture typecheck baseline"
```

---

## Task A7: Re-snapshot the human-readable schema doc

**Files:**
- Modify (regenerate): `memory/context/golfhelm-database.md`

The doc says "Last verified 2026-02-13"; we are 2026-04-21 with new tables.

- [ ] **Step 1: Pull authoritative column list from live DB**

```sql
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema='public' AND c.table_name LIKE 'golf_%'
ORDER BY c.table_name, c.ordinal_position;
```

- [ ] **Step 2: Format into the existing markdown structure** of `golfhelm-database.md`. Keep the per-table heading + column list pattern. Add the 3 newly-documented tables: `golf_global_patterns`, `golf_insight_player_feedback`, `golf_causal_relationships`, `golf_coach_behavior_log` (the audit noted they were missing from the doc).

- [ ] **Step 3: Update the "Last verified" line** to `2026-04-21 (live DB query via Supabase MCP)`.

- [ ] **Step 4: Commit**

```bash
git add memory/context/golfhelm-database.md
git commit -m "docs(memory): re-snapshot golfhelm-database.md from live DB (2026-04-21)"
```

---

## Task A8: Hand-off announcement

- [ ] **Step 1: Post in shared channel** (or update the orchestration doc):

> Team A done. New tables: `golf_global_patterns`, `golf_insight_player_feedback`. RLS canonical for: `golf_insight_effectiveness`, `golf_coach_behavior_log`, `golf_player_baselines`, `golf_percentile_cache`, `golf_team_coachhelm_settings`, `golf_announcement_*`. Types regenerated — see `typecheck-baseline.txt` for the work list.
>
> **Teams B, C, E: green light to start. Team D: `golf_insight_player_feedback` is live.**

- [ ] **Step 2: Open PR**, request review from one other team's lead, merge to `main`.

---

## Done check

- [ ] All 5 migrations applied to `qmnssrrolpinvwjjnufo`
- [ ] `mcp__plugin_supabase_supabase__get_advisors type=security` count of `rls_policy_always_true` for engine tables = 0
- [ ] `golf_player_baselines` and `golf_percentile_cache` readable by player JWT (smoke test in A2.4)
- [ ] `src/lib/types/database.ts` regenerated; typecheck baseline captured
- [ ] `memory/context/golfhelm-database.md` re-snapshotted
- [ ] PR merged to `main`

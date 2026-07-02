-- W1: single-super-admin allowlist + is_super_admin() gate.
-- Deliberately a table (not a hardcoded UUID in SQL) so rotation is a data
-- change, not a migration. RLS ENABLE + FORCE with ZERO anon/authenticated
-- policies — reads happen only via the SECURITY DEFINER function; writes are
-- service_role-only.
CREATE TABLE IF NOT EXISTS public.admin_allowlist (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_allowlist FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_allowlist WHERE user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Helm Bridge gate: true iff auth.uid() is in admin_allowlist. Runs with definer-rights (elevated, not caller''s) privileges so RLS policies and internally-gated RPCs can consult the (RLS-locked) allowlist. auth.uid() is NULL under service_role, so this returns false for service-role callers by design.';

-- Seed: Nick only (admin@helmsportslabs.com, id confirmed via auth.users).
-- INSERT ... SELECT ... WHERE EXISTS (not a bare VALUES INSERT) — fresh
-- instances (CI, local resets) have an empty auth.users, and the FK on
-- user_id would otherwise abort the migration. Prod already has this row;
-- this guard only affects replays where the seed user doesn't exist yet.
INSERT INTO public.admin_allowlist (user_id, email, note)
SELECT 'b9673959-1c90-405b-93f7-b468a9f4daa3'::uuid, 'admin@helmsportslabs.com', 'Helm Bridge super admin — seeded W1'
WHERE EXISTS (SELECT 1 FROM auth.users WHERE id = 'b9673959-1c90-405b-93f7-b468a9f4daa3'::uuid)
ON CONFLICT (user_id) DO NOTHING;

-- ── Safety rails ──────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.admin_allowlist FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated;
-- authenticated needs EXECUTE so future RLS policies / internally-gated RPCs
-- invoked with the admin's user-scoped JWT can call it. anon gets NOTHING.
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ACL assertions — migration fails loudly on grant drift.
DO $$
DECLARE
  v_fn oid;
BEGIN
  IF has_table_privilege('anon', 'public.admin_allowlist', 'SELECT')
     OR has_table_privilege('authenticated', 'public.admin_allowlist', 'SELECT')
     OR has_table_privilege('anon', 'public.admin_allowlist', 'INSERT')
     OR has_table_privilege('authenticated', 'public.admin_allowlist', 'INSERT') THEN
    RAISE EXCEPTION 'ACL check failed: admin_allowlist readable/writable by anon or authenticated';
  END IF;

  SELECT p.oid INTO v_fn
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_super_admin';

  IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: is_super_admin executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL check failed: is_super_admin NOT executable by authenticated (RLS policies need it)';
  END IF;

  -- Exactly 1 row when the seed user exists in auth.users (prod, and any
  -- replay against a real snapshot); 0 on a fresh instance (CI, empty local
  -- reset) where the WHERE EXISTS guard above skipped the insert entirely.
  IF (SELECT count(*) FROM public.admin_allowlist) <> (
    CASE WHEN EXISTS (SELECT 1 FROM auth.users WHERE id = 'b9673959-1c90-405b-93f7-b468a9f4daa3'::uuid)
         THEN 1 ELSE 0 END
  ) THEN
    RAISE EXCEPTION 'Seed check failed: admin_allowlist row count does not match whether the seed user exists in auth.users';
  END IF;
END $$;

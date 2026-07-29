-- =============================================================================
-- unresolve_admin_event — make Bridge's only mutation reversible.
--
-- NOT YET APPLIED. Authored as a file so a human can review and apply it
-- deliberately, per the standing rule for this shared production database.
--
-- WHY
-- ---
-- `resolve_admin_event()` is the console's only writable mutation and it is
-- one-way: there is no unresolve anywhere in the schema. BulkResolveButton's
-- own comment records the consequence — "a mis-set filter chip plus one click
-- was irreversible" — and works around it with a two-click confirm.
--
-- That irreversibility is now the main thing arguing against automation. The
-- nightly job (src/lib/admin/auto-resolve.ts) resolves on three rules, and
-- Rule C in particular is about to age out ~87,653 historical rows in bulk.
-- Every one of those decisions is currently permanent. A reviewer's fair
-- question about any auto-resolve rule is "what if the rule is wrong?", and
-- right now the honest answer is "you cannot undo it" — which is a reason to
-- keep the rules timid, and timid rules are why the backlog exists.
--
-- With this in place the answer becomes "unresolve the affected ids", so the
-- rules can be set where they actually belong.
--
-- SHAPE
-- -----
-- Deliberately the mirror image of `resolve_admin_event`, so the pair is
-- obviously symmetric to anyone reading either one:
--
--   * same `p_event_ids uuid[]` signature
--   * same SECURITY DEFINER + `SET search_path` hardening
--   * same `is_super_admin()` gate raising 42501 (see the note below)
--   * same "only touch rows in the opposite state" idempotence, so replaying
--     it is a no-op rather than an error
--   * returns the number of rows actually flipped
--
-- `resolved_by` and `resolved_at` are cleared, not preserved. A row that is
-- unresolved has no resolution, and leaving a stale resolver on it would make
-- `queryPriorResolutions` (the 90-day regression lookback) believe a
-- resolution happened that has since been retracted.
--
-- GRANT NOTE
-- ----------
-- EXECUTE goes to `authenticated`, matching `resolve_admin_event`. The gate is
-- inside the function, not on the grant — identical to the existing pattern.
-- Worth stating plainly because `authenticated` on a mutating definer function
-- looks alarming in an audit: any signed-in user may CALL it, and every one of
-- them who is not in `admin_allowlist` gets 42501 before a single row moves.
--
-- KNOWN DIVERGENCE THIS DOES NOT FIX
-- ----------------------------------
-- `is_super_admin()` reads the `admin_allowlist` TABLE while the application's
-- `requireSuperAdmin()` reads the `SUPER_ADMIN_USER_IDS` ENV VAR. Those are two
-- different sources of truth and they drifted in production on 2026-07-29: an
-- account with full console access was absent from the table, so every Resolve
-- click raised 42501 and silently did nothing. Unifying them is a separate
-- decision — `is_super_admin()` also gates RLS policies elsewhere in the
-- schema, so changing what it reads is a much wider blast radius than this
-- function. This migration deliberately matches the existing gate rather than
-- quietly introducing a second, different one.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.unresolve_admin_event(p_event_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_events
  SET resolved = false,
      resolved_at = NULL,
      resolved_by = NULL
  WHERE id = ANY(p_event_ids)
    AND resolved = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.unresolve_admin_event(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unresolve_admin_event(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.unresolve_admin_event(uuid[]) IS
  'Reverses resolve_admin_event for the given ids. Super-admin gated via '
  'is_super_admin(); idempotent (only touches resolved = true rows); clears '
  'resolved_at/resolved_by so the regression lookback does not see a '
  'retracted resolution. Added 2026-07-29 so bulk auto-resolution is a '
  'reversible decision.';

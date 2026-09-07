SET check_function_bodies = false;

CREATE OR REPLACE FUNCTION "public"."__admin_rollup_b_gate"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN;
  END IF;
  IF NOT (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

ALTER FUNCTION "public"."__admin_rollup_b_gate"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."admin_auto_resolve_error_fingerprint"("p_fingerprint" "text", "p_last_seen_at" timestamp with time zone, "p_fixed_in_sha" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
declare
  v_source text;
begin
  if p_fingerprint is null or length(trim(p_fingerprint)) = 0 then
    return false;
  end if;

  select resolution_source into v_source
  from public.admin_error_resolutions
  where fingerprint = trim(p_fingerprint);

  if found and v_source = 'manual' then
    return false;
  end if;

  insert into public.admin_error_resolutions as r (
    fingerprint, resolved_at, resolved_by, resolution_source,
    fixed_in_sha, note, last_seen_at_resolution
  ) values (
    trim(p_fingerprint), now(), null, 'auto',
    nullif(trim(coalesce(p_fixed_in_sha, '')), ''), p_note, p_last_seen_at
  )
  on conflict (fingerprint) do update set
    resolved_at = now(),
    resolution_source = 'auto',
    fixed_in_sha = coalesce(excluded.fixed_in_sha, r.fixed_in_sha),
    note = coalesce(excluded.note, r.note),
    last_seen_at_resolution = excluded.last_seen_at_resolution,
    reopened_at = null,
    updated_at = now();

  return true;
end;
$$;

ALTER FUNCTION "public"."admin_auto_resolve_error_fingerprint"("p_fingerprint" "text", "p_last_seen_at" timestamp with time zone, "p_fixed_in_sha" "text", "p_note" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."admin_mark_error_regressed"("p_fingerprint" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  update public.admin_error_resolutions
  set reopened_at = coalesce(reopened_at, now()),
      reopened_count = reopened_count + case when reopened_at is null then 1 else 0 end,
      updated_at = now()
  where fingerprint = trim(p_fingerprint);
end;
$$;

ALTER FUNCTION "public"."admin_mark_error_regressed"("p_fingerprint" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."admin_resolve_error_fingerprint"("p_fingerprint" "text", "p_pr_number" integer DEFAULT NULL::integer, "p_pr_url" "text" DEFAULT NULL::"text", "p_fixed_in_sha" "text" DEFAULT NULL::"text", "p_note" "text" DEFAULT NULL::"text", "p_last_seen_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_fingerprint is null or length(trim(p_fingerprint)) = 0 then
    raise exception 'fingerprint is required' using errcode = '22023';
  end if;

  insert into public.admin_error_resolutions as r (
    fingerprint, resolved_at, resolved_by, resolution_source,
    pr_number, pr_url, fixed_in_sha, note, last_seen_at_resolution
  ) values (
    trim(p_fingerprint), now(), auth.uid(), 'manual',
    p_pr_number, p_pr_url,
    nullif(trim(coalesce(p_fixed_in_sha, '')), ''), p_note, p_last_seen_at
  )
  on conflict (fingerprint) do update set
    resolved_at = now(),
    resolved_by = auth.uid(),
    resolution_source = 'manual',
    pr_number = coalesce(excluded.pr_number, r.pr_number),
    pr_url = coalesce(excluded.pr_url, r.pr_url),
    fixed_in_sha = coalesce(excluded.fixed_in_sha, r.fixed_in_sha),
    note = coalesce(excluded.note, r.note),
    last_seen_at_resolution = coalesce(excluded.last_seen_at_resolution, r.last_seen_at_resolution),
    reopened_at = null,
    updated_at = now();
end;
$$;

ALTER FUNCTION "public"."admin_resolve_error_fingerprint"("p_fingerprint" "text", "p_pr_number" integer, "p_pr_url" "text", "p_fixed_in_sha" "text", "p_note" "text", "p_last_seen_at" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."admin_unresolve_error_fingerprint"("p_fingerprint" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
begin
  if not public.is_super_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  delete from public.admin_error_resolutions where fingerprint = trim(p_fingerprint);
end;
$$;

ALTER FUNCTION "public"."admin_unresolve_error_fingerprint"("p_fingerprint" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."baseball_accept_staff_invite"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_invitation  public.baseball_staff_invitations%ROWTYPE;
  v_user_id     uuid;
  v_coach_id    uuid;
  v_result      jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_invitation
  FROM public.baseball_staff_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_token');
  END IF;

  INSERT INTO public.baseball_coaches (user_id, email, full_name)
  VALUES (
    v_user_id,
    v_invitation.email,
    COALESCE(v_invitation.invitee_name, split_part(v_invitation.email, '@', 1))
  )
  ON CONFLICT (user_id) DO UPDATE
    SET email = EXCLUDED.email
  RETURNING id INTO v_coach_id;

  IF v_coach_id IS NULL THEN
    SELECT id INTO v_coach_id FROM public.baseball_coaches WHERE user_id = v_user_id;
  END IF;

  INSERT INTO public.baseball_team_coach_staff (team_id, coach_id, role, capabilities, is_primary)
  VALUES (
    v_invitation.team_id,
    v_coach_id,
    COALESCE(v_invitation.role, 'assistant'),
    COALESCE(v_invitation.capabilities, '{}'::jsonb),
    false
  )
  ON CONFLICT (team_id, coach_id) DO NOTHING;

  UPDATE public.baseball_staff_invitations
  SET status = 'accepted',
      accepted_by_user_id = v_user_id,
      accepted_at = now()
  WHERE id = v_invitation.id;

  v_result := jsonb_build_object(
    'ok', true,
    'team_id', v_invitation.team_id,
    'coach_id', v_coach_id,
    'role', COALESCE(v_invitation.role, 'assistant')
  );

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."baseball_accept_staff_invite"("p_token" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."baseball_announcement_has_recipients"("p_announcement_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcement_recipients
    WHERE announcement_id = p_announcement_id
  );
$$;

ALTER FUNCTION "public"."baseball_announcement_has_recipients"("p_announcement_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."baseball_announcement_is_recipient"("p_announcement_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_announcement_recipients
    WHERE announcement_id = p_announcement_id
      AND player_id = public.get_my_player_id()
  );
$$;

ALTER FUNCTION "public"."baseball_announcement_is_recipient"("p_announcement_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."baseball_can_invite_staff"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    public.is_baseball_primary_coach(p_team_id)
    OR EXISTS (
      SELECT 1
      FROM public.baseball_team_coach_staff tcs
      JOIN public.baseball_coaches c ON c.id = tcs.coach_id
      WHERE c.user_id = auth.uid()
        AND tcs.team_id = p_team_id
        AND (tcs.is_head_coach = true OR tcs.can_invite_staff = true)
    );
$$;

ALTER FUNCTION "public"."baseball_can_invite_staff"("p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."baseball_conversation_has_other_participant"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
      from public.baseball_conversation_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id <> (select auth.uid())
  );
$$;

ALTER FUNCTION "public"."baseball_conversation_has_other_participant"("p_conversation_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."baseball_conversation_has_other_participant"("p_conversation_id" "uuid") IS 'Baseball counterpart of golf_conversation_has_other_participant.';

CREATE OR REPLACE FUNCTION "public"."baseball_conversation_on_my_team"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_conversations c
    WHERE c.id = p_conversation_id
      AND c.team_id IS NOT NULL
      AND public.is_baseball_team_member(c.team_id)
  );
$$;

ALTER FUNCTION "public"."baseball_conversation_on_my_team"("p_conversation_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."baseball_conversation_on_my_team"("p_conversation_id" "uuid") IS 'Does the CALLER belong to the team that owns this baseball conversation? Runs with definer rights so it is not subject to baseball_conversations SELECT — that is what keeps the DM-creation bootstrap working. Mirrors golf_conversation_on_my_team.';

CREATE OR REPLACE FUNCTION "public"."baseball_is_announcement_coach"("p_announcement_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT public.is_baseball_team_coach(a.team_id)
  FROM public.baseball_announcements a
  WHERE a.id = p_announcement_id;
$$;

ALTER FUNCTION "public"."baseball_is_announcement_coach"("p_announcement_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."baseball_players_guard_recruiting_activated"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.player_type IS DISTINCT FROM OLD.player_type
     AND current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'player_type can only be changed via the service-role server path.'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.recruiting_activated IS NOT DISTINCT FROM OLD.recruiting_activated THEN
    RETURN NEW;
  END IF;
  IF NEW.recruiting_activated IS TRUE
     AND NEW.player_type = 'college'::baseball_player_type
  THEN
    RAISE EXCEPTION 'College players cannot activate recruiting exposure.'
      USING ERRCODE = '23514';
  END IF;
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'recruiting_activated can only be changed via the gated service-role server action path.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."baseball_players_guard_recruiting_activated"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."baseball_players_guard_recruiting_activated"() IS 'BEFORE UPDATE OF recruiting_activated guard on public.baseball_players. Blocks any non-service-role change to recruiting_activated (closes the raw-browser-write bypass of the recruiting_exposure_enabled toggle — CONFIRMED P1, gap-fill 2026-07-09) and restates the college-player-never-activates rule already enforced by CHECK constraints. Requires two companion changes, both already landed alongside this migration: (1) W0a — activateRecruitingExposure/deactivateRecruitingExposure in src/app/baseball/actions/player-access.ts write this column via createAdminClient() (src/lib/supabase/admin.ts); (2) joinTeamImpl (JUCO auto-enable) in src/app/baseball/actions/teams.ts does the same. Without both, the affected writes 42501.';

CREATE OR REPLACE FUNCTION "public"."baseball_register_for_camp"("p_camp_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_player_id uuid;
  v_capacity int;
  v_active int;
  v_existing_id uuid;
  v_existing_status text;
BEGIN
  -- Resolve the caller's player row from their authenticated user id (no IDOR).
  SELECT id INTO v_player_id
  FROM public.baseball_players
  WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN 'unauthorized';
  END IF;

  -- Lock the camp row so concurrent registrations serialize on its capacity.
  SELECT capacity INTO v_capacity
  FROM public.baseball_camps
  WHERE id = p_camp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  -- Existing (possibly cancelled) registration for this player + camp?
  SELECT id, status INTO v_existing_id, v_existing_status
  FROM public.baseball_camp_registrations
  WHERE camp_id = p_camp_id AND player_id = v_player_id;

  IF v_existing_id IS NOT NULL AND v_existing_status IS DISTINCT FROM 'cancelled' THEN
    RETURN 'already_registered';
  END IF;

  -- Count active (non-cancelled) registrations while holding the camp lock.
  SELECT count(*) INTO v_active
  FROM public.baseball_camp_registrations
  WHERE camp_id = p_camp_id
    AND status IS DISTINCT FROM 'cancelled';

  IF v_capacity IS NOT NULL AND v_active >= v_capacity THEN
    RETURN 'full';
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.baseball_camp_registrations
    SET status = 'registered'
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.baseball_camp_registrations (camp_id, player_id, status, created_at)
    VALUES (p_camp_id, v_player_id, 'registered', now());
  END IF;

  RETURN 'registered';
END;
$$;

ALTER FUNCTION "public"."baseball_register_for_camp"("p_camp_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."baseball_replace_lineup_positions"("p_lineup_id" "uuid", "p_name" "text", "p_positions" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_coach_id   uuid;
  v_team_id    uuid;
  v_is_staff   boolean;
  v_count      integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthorized');
  END IF;

  SELECT c.id INTO v_coach_id
  FROM public.baseball_coaches c
  WHERE c.user_id = v_uid;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_coach');
  END IF;

  SELECT l.team_id INTO v_team_id
  FROM public.baseball_team_lineups l
  WHERE l.id = p_lineup_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_team_coach_staff tcs
    WHERE tcs.team_id = v_team_id
      AND tcs.coach_id = v_coach_id
      AND COALESCE(tcs.status, 'active') = 'active'
      AND (
        tcs.is_primary IS TRUE
        OR tcs.is_head_coach IS TRUE
        OR tcs.can_manage_lineups IS TRUE
      )
  ) INTO v_is_staff;

  IF NOT v_is_staff THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  IF p_positions IS NULL OR jsonb_typeof(p_positions) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_positions');
  END IF;

  v_count := jsonb_array_length(p_positions);
  IF v_count < 1 OR v_count > 9 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_count');
  END IF;

  UPDATE public.baseball_team_lineups
  SET name = p_name
  WHERE id = p_lineup_id;

  DELETE FROM public.baseball_lineup_positions
  WHERE lineup_id = p_lineup_id;

  INSERT INTO public.baseball_lineup_positions (lineup_id, batting_order, player_id)
  SELECT
    p_lineup_id,
    (elem ->> 'batting_order')::integer,
    (elem ->> 'player_id')::uuid
  FROM jsonb_array_elements(p_positions) AS elem;

  RETURN jsonb_build_object('ok', true);
END;
$$;

ALTER FUNCTION "public"."baseball_replace_lineup_positions"("p_lineup_id" "uuid", "p_name" "text", "p_positions" "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."baseball_replace_lineup_positions"("p_lineup_id" "uuid", "p_name" "text", "p_positions" "jsonb") IS 'Atomically replaces a baseball lineup name + batting-order positions in one transaction. Re-validates can_manage_lineups inside the definer body. Fixes the non-transactional delete-then-insert data-loss bug in updateLineup().';

CREATE OR REPLACE FUNCTION "public"."baseball_staff_has_note_capability"("p_team_id" "uuid", "p_capability" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_team_coach_staff tcs
    JOIN public.baseball_coaches c ON c.id = tcs.coach_id
    WHERE tcs.team_id = p_team_id
      AND c.user_id = auth.uid()
      AND (
        tcs.is_primary = true
        OR (tcs.capabilities IS NOT NULL AND tcs.capabilities ? p_capability)
      )
  );
$$;

ALTER FUNCTION "public"."baseball_staff_has_note_capability"("p_team_id" "uuid", "p_capability" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."bridge_baseball_coach_lifting_access"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.organization_id IS NOT NULL
     AND OLD.user_id IS NOT NULL
     AND (OLD.organization_id IS DISTINCT FROM NEW.organization_id
          OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.baseball_coaches bc2
      WHERE bc2.id <> OLD.id
        AND bc2.user_id = OLD.user_id
        AND bc2.organization_id = OLD.organization_id
    ) THEN
      UPDATE public.helm_lifting_org_viewers
      SET can_edit = false
      WHERE organization_id = OLD.organization_id
        AND user_id = OLD.user_id
        AND sport = 'baseball';
    END IF;
  END IF;

  IF NEW.organization_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
    INSERT INTO public.helm_lifting_org_viewers (organization_id, user_id, sport, can_edit, granted_by)
    VALUES (NEW.organization_id, NEW.user_id, 'baseball', true, 'trigger:baseball-coach-lifting-bridge')
    ON CONFLICT (organization_id, user_id, sport)
    DO UPDATE SET can_edit = true;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."bridge_baseball_coach_lifting_access"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."bridge_baseball_coach_lifting_revoke_on_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.organization_id IS NOT NULL AND OLD.user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.baseball_coaches bc2
      WHERE bc2.id <> OLD.id
        AND bc2.user_id = OLD.user_id
        AND bc2.organization_id = OLD.organization_id
    ) THEN
      UPDATE public.helm_lifting_org_viewers
      SET can_edit = false
      WHERE organization_id = OLD.organization_id
        AND user_id = OLD.user_id
        AND sport = 'baseball';
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

ALTER FUNCTION "public"."bridge_baseball_coach_lifting_revoke_on_delete"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."calculate_round_strokes_gained"("p_round_id" "uuid") RETURNS TABLE("sg_total" numeric, "sg_tee" numeric, "sg_approach" numeric, "sg_around_green" numeric, "sg_putting" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_off_tee NUMERIC := 0; v_approach NUMERIC := 0; v_around NUMERIC := 0; v_putting NUMERIC := 0;
  v_player_id UUID; v_scale NUMERIC := 1.0;
BEGIN
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  v_scale := sg_scale_for_player(v_player_id);

  WITH normalized AS (
    SELECT gs.shot_type, gs.shot_number, gh.par,
      CASE WHEN gs.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(gs.lie_before) END AS lie_before_norm,
      CASE WHEN gs.distance_unit_before='feet' THEN gs.distance_to_hole_before/3.0 ELSE gs.distance_to_hole_before END AS dist_before_yards,
      (gs.putt_made=TRUE OR gs.result IN ('holed','hole')) AS is_holed,
      CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 0
        WHEN gs.distance_to_hole_after IS NOT NULL THEN
          CASE WHEN gs.distance_unit_after='feet' THEN gs.distance_to_hole_after/3.0 ELSE gs.distance_to_hole_after END
        ELSE CASE WHEN LEAD(gs.distance_unit_before) OVER w='feet'
          THEN COALESCE(LEAD(gs.distance_to_hole_before) OVER w,0)/3.0
          ELSE COALESCE(LEAD(gs.distance_to_hole_before) OVER w,0) END END AS dist_after_yards,
      CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 'green'
        WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
        ELSE sg_normalize_lie(LEAD(gs.lie_before) OVER w) END AS lie_after_norm,
      COALESCE(gs.is_penalty,FALSE) AS is_penalty
    FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
    WHERE gs.round_id=p_round_id AND gs.shot_type IS NOT NULL
      AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0
    WINDOW w AS (PARTITION BY gs.hole_id ORDER BY gs.shot_number)
  ),
  categorized AS (
    SELECT CASE
             WHEN is_penalty THEN
               CASE WHEN lie_before_norm='tee' THEN (CASE WHEN par=3 THEN 'approach' ELSE 'off_tee' END)
                    WHEN lie_before_norm='green' THEN 'around_green'
                    WHEN dist_before_yards<=50 THEN 'around_green'
                    ELSE 'approach' END
             WHEN shot_type='putting' THEN 'putting'
             WHEN shot_type='tee' THEN 'off_tee'
             WHEN shot_type='around_green' THEN 'around_green'
             ELSE 'approach' END AS category,
      CASE WHEN is_penalty THEN 0 ELSE sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) END AS exp_before,
      CASE WHEN is_penalty THEN 0 WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
      CASE WHEN is_penalty THEN TRUE ELSE (is_holed OR dist_after_yards>0) END AS has_after
    FROM normalized WHERE dist_before_yards>0
  )
  SELECT
    ROUND(COALESCE(SUM(CASE WHEN category='off_tee' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='approach' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='around_green' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
    ROUND(COALESCE(SUM(CASE WHEN category='putting' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3)
  INTO v_off_tee, v_approach, v_around, v_putting FROM categorized;

  sg_tee := v_off_tee; sg_approach := v_approach; sg_around_green := v_around; sg_putting := v_putting;
  sg_total := ROUND((COALESCE(v_off_tee,0)+COALESCE(v_approach,0)+COALESCE(v_around,0)+COALESCE(v_putting,0))::NUMERIC,3);
  RETURN NEXT;
END;
$$;

ALTER FUNCTION "public"."calculate_round_strokes_gained"("p_round_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_insert_baseball_team_member"("p_team_id" "uuid", "p_status" "public"."team_member_status") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_invite_policy          text;
  v_require_coach_approval boolean;
BEGIN
  IF p_team_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    COALESCE(bt.invite_policy, 'invite_only'),
    COALESCE(bt.require_coach_approval, true)
  INTO v_invite_policy, v_require_coach_approval
  FROM public.baseball_teams bt
  WHERE bt.id = p_team_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_invite_policy = 'closed' THEN
    RETURN false;
  END IF;

  IF p_status = 'active' AND v_require_coach_approval THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

ALTER FUNCTION "public"."can_insert_baseball_team_member"("p_team_id" "uuid", "p_status" "public"."team_member_status") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."can_insert_baseball_team_member"("p_team_id" "uuid", "p_status" "public"."team_member_status") IS 'RLS helper (#502): gates direct baseball_team_members INSERTs against the owning team''s invite_policy/require_coach_approval, mirroring the app-layer check in joinTeam(). Fails closed (false) when the team row cannot be resolved.';

CREATE OR REPLACE FUNCTION "public"."can_manage_baseball_lift_group"("p_team_id" "uuid", "p_group_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Post helm-unification: legacy strength-group creator-override is gone
  -- (baseball_strength_groups graveyarded); capability is the sole check.
  -- Kept (not dropped) because graveyarded lift-table policies reference it
  -- and must stay restorable.
  RETURN public.has_baseball_staff_capability(p_team_id, 'can_manage_lifting');
END;
$$;

ALTER FUNCTION "public"."can_manage_baseball_lift_group"("p_team_id" "uuid", "p_group_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_notify_baseball_user"("p_target_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    p_target_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.baseball_team_members btm
      JOIN public.baseball_players bp ON bp.id = btm.player_id
      WHERE bp.user_id = p_target_user_id
        AND public.is_baseball_team_staff(btm.team_id)
    );
$$;

ALTER FUNCTION "public"."can_notify_baseball_user"("p_target_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_read_golf_shot_detail"("p_shot_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER COST 10000
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_shots gs
    JOIN public.golf_holes gh          ON gh.id = gs.hole_id
    JOIN public.golf_rounds gr_hole    ON gr_hole.id = gh.round_id
    JOIN public.golf_players gp_hole   ON gp_hole.id = gr_hole.player_id
    JOIN public.golf_rounds gr_shot    ON gr_shot.id = gs.round_id
    JOIN public.golf_players gp_shot   ON gp_shot.id = gr_shot.player_id
    WHERE gs.id = p_shot_id
      AND (
        gp_shot.user_id = (SELECT auth.uid())
        OR gp_hole.user_id = (SELECT auth.uid())
        OR (gr_shot.team_id IS NOT NULL AND public.is_golf_team_coach(gr_shot.team_id))
        OR (gr_shot.team_id IS NOT NULL AND public.is_golf_team_player(gr_shot.team_id))
        OR (gr_hole.team_id IS NOT NULL AND public.is_golf_team_coach(gr_hole.team_id))
        OR public.is_admin()
      )
      AND (
        gp_hole.user_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.golf_team_members gtm
          JOIN public.golf_teams gt   ON gt.id = gtm.team_id
          JOIN public.golf_coaches gc ON gc.organization_id = gt.organization_id
          WHERE gtm.player_id = gp_hole.id
            AND gc.user_id = (SELECT auth.uid())
        )
      )
  );
$$;

ALTER FUNCTION "public"."can_read_golf_shot_detail"("p_shot_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."can_read_golf_shot_detail"("p_shot_id" "uuid") IS 'RLS helper for putt_details / approach_miss_details SELECT. Correlated on the caller''s shot_id so the predicate costs one index lookup per row instead of a full RLS-filtered scan of golf_shots. SECURITY DEFINER only to avoid re-entering the golf_shots policy stack — the shot-readability conjunct is reproduced explicitly inside.';

CREATE OR REPLACE FUNCTION "public"."can_view_baseball_player"("p_player_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.baseball_team_members tm
      WHERE tm.player_id = p_player_id
        AND public.is_baseball_team_staff(tm.team_id)
    )
    OR p_player_id = public.get_my_baseball_player_id();
$$;

ALTER FUNCTION "public"."can_view_baseball_player"("p_player_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_view_baseball_player"("p_team_id" "uuid", "p_player_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_coach_id uuid := public.get_my_coach_id();
  v_staff    public.baseball_team_coach_staff%ROWTYPE;
BEGIN
  IF p_player_id = public.get_my_baseball_player_id() THEN
    RETURN true;
  END IF;

  IF v_coach_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_baseball_primary_coach(p_team_id) THEN
    RETURN true;
  END IF;

  SELECT tcs.*
    INTO v_staff
    FROM public.baseball_team_coach_staff tcs
   WHERE tcs.team_id = p_team_id
     AND tcs.coach_id = v_coach_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_staff.status IN ('suspended', 'removed', 'invited') THEN
    RETURN false;
  END IF;

  IF v_staff.is_head_coach THEN
    RETURN true;
  END IF;

  IF v_staff.scope_player_ids IS NOT NULL AND cardinality(v_staff.scope_player_ids) > 0 THEN
    RETURN p_player_id = ANY (v_staff.scope_player_ids);
  END IF;

  -- No explicit player scope set -> full team visibility for active staff.
  RETURN true;
END;
$$;

ALTER FUNCTION "public"."can_view_baseball_player"("p_team_id" "uuid", "p_player_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."check_rate_limit_atomic"("p_key" "text", "p_window_ms" bigint, "p_max_attempts" integer, "p_block_ms" bigint DEFAULT NULL::bigint) RETURNS TABLE("count" integer, "window_start" timestamp with time zone, "blocked_until" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  INSERT INTO public.auth_rate_limits AS arl (key, count, window_start, blocked_until, updated_at)
  VALUES (p_key, 1, now(), NULL, now())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE
      WHEN arl.blocked_until IS NOT NULL AND arl.blocked_until > now() THEN arl.count
      WHEN arl.window_start + make_interval(secs => p_window_ms / 1000.0) < now() THEN 1
      ELSE arl.count + 1
    END,
    window_start = CASE
      WHEN arl.blocked_until IS NOT NULL AND arl.blocked_until > now() THEN arl.window_start
      WHEN arl.window_start + make_interval(secs => p_window_ms / 1000.0) < now() THEN now()
      ELSE arl.window_start
    END,
    blocked_until = CASE
      WHEN arl.blocked_until IS NOT NULL AND arl.blocked_until > now() THEN arl.blocked_until
      WHEN p_block_ms IS NOT NULL
        AND (
          CASE
            WHEN arl.window_start + make_interval(secs => p_window_ms / 1000.0) < now() THEN 1
            ELSE arl.count + 1
          END
        ) > p_max_attempts
        THEN now() + make_interval(secs => p_block_ms / 1000.0)
      ELSE NULL
    END,
    updated_at = now()
  RETURNING arl.count, arl.window_start, arl.blocked_until;
$$;

ALTER FUNCTION "public"."check_rate_limit_atomic"("p_key" "text", "p_window_ms" bigint, "p_max_attempts" integer, "p_block_ms" bigint) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."check_rate_limit_atomic"("p_key" "text", "p_window_ms" bigint, "p_max_attempts" integer, "p_block_ms" bigint) IS 'Atomic rate-limit increment for auth_rate_limits. Returns the post-increment row. service_role only.';

CREATE OR REPLACE FUNCTION "public"."coach_id_for_team"("p_team_id" "uuid", "p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT gc.id
  FROM public.golf_team_coach_staff gtcs
  JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
  WHERE gtcs.team_id = p_team_id
    AND gc.user_id = p_user_id
  LIMIT 1;
$$;

ALTER FUNCTION "public"."coach_id_for_team"("p_team_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."current_coach_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_coach_id uuid;
BEGIN
  SELECT id INTO v_coach_id
  FROM golf_coaches
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN v_coach_id;
END;
$$;

ALTER FUNCTION "public"."current_coach_id"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."current_coach_id"() IS 'v3 RLS helper: returns the golf_coaches.id for the currently authenticated user, or NULL if the user is not a coach.';

CREATE OR REPLACE FUNCTION "public"."current_player_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_player_id uuid;
BEGIN
  SELECT id INTO v_player_id
  FROM golf_players
  WHERE user_id = auth.uid()
  LIMIT 1;
  RETURN v_player_id;
END;
$$;

ALTER FUNCTION "public"."current_player_id"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."current_player_id"() IS 'v3 RLS helper: returns the golf_players.id for the currently authenticated user, or NULL if the user is not a player. Use in player-scoped policies via "player_id = current_player_id()".';

CREATE OR REPLACE FUNCTION "public"."extract_email_click_from_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_clicked_url text;
  v_user_agent  text;
  v_ip_address  text;
  v_recipient   text;
BEGIN
  IF NEW.event_type <> 'email.clicked' THEN
    RETURN NEW;
  END IF;

  v_clicked_url := NEW.raw_payload #>> '{data,click,link}';
  v_user_agent  := NEW.raw_payload #>> '{data,click,userAgent}';
  v_ip_address  := NEW.raw_payload #>> '{data,click,ipAddress}';

  -- Prefer event.recipient_email; fall back to the first entry in data.to
  IF NEW.recipient_email IS NOT NULL THEN
    v_recipient := NEW.recipient_email;
  ELSIF NEW.raw_payload #> '{data,to}' IS NOT NULL THEN
    v_recipient := (NEW.raw_payload #> '{data,to}' ->> 0);
  ELSE
    v_recipient := '';
  END IF;

  INSERT INTO email_clicks (
    email_event_id,
    resend_message_id,
    recipient_email,
    clicked_url,
    user_agent,
    ip_address,
    occurred_at
  ) VALUES (
    NEW.id,
    NEW.resend_message_id,
    v_recipient,
    v_clicked_url,
    v_user_agent,
    v_ip_address,
    NEW.occurred_at
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."extract_email_click_from_event"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."find_baseball_player_by_email_for_roster"("p_team_id" "uuid", "p_email" "text") RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "primary_position" "text", "grad_year" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF p_team_id IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RETURN;
  END IF;

  IF NOT public.has_baseball_staff_capability(p_team_id, 'can_manage_roster') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.first_name, p.last_name, p.primary_position, p.grad_year
  FROM public.baseball_players p
  WHERE lower(btrim(p.email)) = v_email
  LIMIT 1;
END;
$$;

ALTER FUNCTION "public"."find_baseball_player_by_email_for_roster"("p_team_id" "uuid", "p_email" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_active_sessions"("p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY row_data->>'updated_at' DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'session_id',      s.id,
      'user_id',         s.user_id,
      'email',           u.email,
      'created_at',      s.created_at,
      'updated_at',      s.updated_at,
      'last_sign_in_at', u.last_sign_in_at
    ) AS row_data
    FROM auth.sessions s
    JOIN auth.users u ON u.id = s.user_id
    WHERE p_user_id IS NULL OR s.user_id = p_user_id
    ORDER BY s.updated_at DESC
    LIMIT 500
  ) rows;

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_active_sessions"("p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_admin_analytics_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH
    analytics_raw AS (
      SELECT event_type, page_path, feature_name, session_id, user_id, created_at, duration_ms
      FROM admin_analytics_events WHERE created_at >= p_ago7d
    ),
    analytics_events_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'event_type', event_type, 'page_path', page_path, 'feature_name', feature_name,
        'session_id', session_id, 'user_id', user_id, 'created_at', created_at, 'duration_ms', duration_ms
      )), '[]'::jsonb) AS events FROM analytics_raw
    ),
    coach_insight_rollup AS (
      SELECT coach_id, COUNT(*)::int AS total_insights, MAX(created_at) AS last_insight_at
      FROM golf_coach_insights
      WHERE coach_id IS NOT NULL AND created_at >= p_ago12w
      GROUP BY coach_id
    ),
    coach_insight_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'coach_id', coach_id, 'total_insights', total_insights, 'last_insight_at', last_insight_at
      )), '[]'::jsonb) AS rows FROM coach_insight_rollup
    ),
    round_reviews_joined AS (
      SELECT rr.published_by, rr.round_id, rr.created_at AS review_at,
             gr.player_id, gr.created_at AS round_at
      FROM golf_round_reviews rr
      LEFT JOIN golf_rounds gr ON gr.id = rr.round_id
      WHERE rr.created_at >= p_ago12w
    ),
    coach_review_rollup AS (
      SELECT published_by AS coach_id, COUNT(*)::int AS reviews,
        COALESCE(AVG(EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0)
          FILTER (WHERE round_at IS NOT NULL AND review_at IS NOT NULL
            AND review_at >= round_at
            AND EXTRACT(EPOCH FROM (review_at - round_at)) / 3600.0 < 720), NULL) AS avg_response_hours
      FROM round_reviews_joined WHERE published_by IS NOT NULL GROUP BY published_by
    ),
    coach_review_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'coach_id', coach_id, 'reviews', reviews,
        'avg_response_hours', CASE WHEN avg_response_hours IS NULL THEN NULL ELSE ROUND(avg_response_hours::numeric, 2) END
      )), '[]'::jsonb) AS rows FROM coach_review_rollup
    ),
    player_review_rollup AS (
      SELECT player_id, COUNT(*)::int AS reviews
      FROM round_reviews_joined WHERE player_id IS NOT NULL GROUP BY player_id
    ),
    player_review_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'reviews', reviews)), '[]'::jsonb) AS rows
      FROM player_review_rollup
    ),
    players_with_reviews_json AS (
      SELECT COALESCE(jsonb_agg(DISTINCT player_id), '[]'::jsonb) AS ids
      FROM round_reviews_joined WHERE player_id IS NOT NULL
    ),
    player_insight_rollup AS (
      SELECT player_id, SUM(COALESCE(insights_generated, 1))::int AS insights
      FROM golf_insight_generation_log
      WHERE player_id IS NOT NULL AND created_at >= p_ago12w
      GROUP BY player_id
    ),
    player_insight_rollup_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'insights', insights)), '[]'::jsonb) AS rows
      FROM player_insight_rollup
    ),
    teams_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'season', season, 'organization_id', organization_id)), '[]'::jsonb) AS rows
      FROM golf_teams
    ),
    team_members_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('player_id', player_id, 'team_id', team_id)), '[]'::jsonb) AS rows
      FROM golf_team_members WHERE status = 'active'
    ),
    team_coach_staff_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'team_id', team_id, 'coach_id', coach_id, 'role', role, 'is_primary', is_primary
      )), '[]'::jsonb) AS rows
      FROM golf_team_coach_staff
    ),
    players_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'user_id', user_id, 'first_name', first_name, 'last_name', last_name,
        'onboarding_completed', COALESCE(onboarding_completed, false)
      )), '[]'::jsonb) AS rows FROM golf_players
    ),
    coaches_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'user_id', user_id, 'full_name', full_name, 'organization_id', organization_id,
        'onboarding_completed', COALESCE(onboarding_completed, false)
      )), '[]'::jsonb) AS rows FROM golf_coaches
    ),
    users_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'role', u.role::text,
        'created_at', u.created_at,
        'last_seen', GREATEST(u.last_seen, au.last_sign_in_at)
      ) ORDER BY u.created_at DESC NULLS LAST), '[]'::jsonb) AS rows
      FROM users u
      LEFT JOIN auth.users au ON au.id = u.id
    ),
    philosophy_coach_ids AS (
      SELECT COALESCE(jsonb_agg(DISTINCT coach_id), '[]'::jsonb) AS ids
      FROM golf_coach_philosophy WHERE coach_id IS NOT NULL
    ),
    player_stats_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'player_id', player_id, 'first_name', gp.first_name, 'last_name', gp.last_name,
        'scoring_average', scoring_average, 'driving_accuracy', driving_accuracy_percentage,
        'gir_percentage', gir_percentage, 'putts_per_round', putts_per_round, 'rounds_played', rounds_played
      )), '[]'::jsonb) AS rows
      FROM golf_player_stats_cache psc LEFT JOIN golf_players gp ON gp.id = psc.player_id
    ),
    error_count_24h AS (
      SELECT COUNT(*)::int AS errors_24h FROM error_logs
      WHERE created_at IS NOT NULL AND created_at >= (now() - interval '24 hours')
    ),
    error_count_7d AS (
      SELECT COUNT(*)::int AS errors_7d FROM error_logs
      WHERE created_at IS NOT NULL AND created_at >= p_ago7d
    ),
    admin_error_events AS (
      SELECT id, event_type, severity::text AS severity,
             COALESCE(resolved, false) AS resolved, created_at
      FROM admin_events
      WHERE severity::text IN ('error', 'critical') AND created_at >= p_ago30d
    ),
    admin_error_events_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'event_type', event_type, 'severity', severity,
        'resolved', resolved, 'created_at', created_at
      )), '[]'::jsonb) AS rows,
      COALESCE(SUM(CASE WHEN NOT resolved THEN 1 ELSE 0 END), 0)::int AS unresolved
      FROM admin_error_events
    )
  SELECT jsonb_build_object(
    'generated_at', now(), 'ago7d', p_ago7d, 'ago30d', p_ago30d, 'ago12w', p_ago12w,
    'analyticsEvents', (SELECT events FROM analytics_events_json),
    'coachInsightRollup', (SELECT rows FROM coach_insight_rollup_json),
    'coachReviewRollup', (SELECT rows FROM coach_review_rollup_json),
    'playerReviewRollup', (SELECT rows FROM player_review_rollup_json),
    'playersWithReviews', (SELECT ids FROM players_with_reviews_json),
    'playerInsightRollup', (SELECT rows FROM player_insight_rollup_json),
    'teams', (SELECT rows FROM teams_json),
    'teamMembers', (SELECT rows FROM team_members_json),
    'teamCoachStaff', (SELECT rows FROM team_coach_staff_json),
    'players', (SELECT rows FROM players_json),
    'coaches', (SELECT rows FROM coaches_json),
    'users', (SELECT rows FROM users_json),
    'philosophyCoachIds', (SELECT ids FROM philosophy_coach_ids),
    'playerStats', (SELECT rows FROM player_stats_json),
    'errors24h', (SELECT errors_24h FROM error_count_24h),
    'errors7d', (SELECT errors_7d FROM error_count_7d),
    'adminErrorEvents', (SELECT rows FROM admin_error_events_json),
    'adminErrorEventsUnresolved', (SELECT unresolved FROM admin_error_events_json)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_admin_analytics_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_admin_analytics_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) IS 'Slice C of admin dashboard refactor: consolidates Batch-5 enhanced analytics (admin_analytics_events, golf_coach_insights, golf_round_reviews, golf_insight_generation_log, golf_teams, admin_events, error_logs) into one JSONB payload. Caller supplies allRoundsMinimal separately to avoid a second golf_rounds scan (Slice A''s C1 RPC already emits it).';

CREATE OR REPLACE FUNCTION "public"."get_admin_baseball_rollup"("p_ago30d" timestamp with time zone DEFAULT ("now"() - '30 days'::interval)) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_total_players          bigint := 0;
  v_total_coaches          bigint := 0;
  v_players_onboarded      bigint := 0;
  v_coaches_onboarded      bigint := 0;
  v_recruiting_activated   bigint := 0;
  v_watchlist_stages       jsonb  := '{}'::jsonb;
  v_videos30d              bigint := 0;
  v_engagement30d          bigint := 0;
  v_messages30d            bigint := 0;
  v_conversations30d       bigint := 0;
  v_total_teams            bigint := 0;
  v_total_events           bigint := 0;
  v_total_camps            bigint := 0;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  IF to_regclass('public.baseball_players') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_players' INTO v_total_players;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_players WHERE onboarding_completed = TRUE$q$ INTO v_players_onboarded;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_players WHERE recruiting_activated = TRUE$q$ INTO v_recruiting_activated;
  END IF;

  IF to_regclass('public.baseball_coaches') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_coaches' INTO v_total_coaches;
    EXECUTE $q$SELECT COUNT(*)::bigint FROM baseball_coaches WHERE onboarding_completed = TRUE$q$ INTO v_coaches_onboarded;
  END IF;

  IF to_regclass('public.baseball_watchlists') IS NOT NULL THEN
    EXECUTE
      $q$SELECT COALESCE(jsonb_object_agg(stage, cnt), '{}'::jsonb)
         FROM (
           SELECT COALESCE(pipeline_stage::text, 'unknown') AS stage,
                  COUNT(*)::int AS cnt
           FROM baseball_watchlists
           GROUP BY 1
         ) s$q$
      INTO v_watchlist_stages;
  END IF;

  IF to_regclass('public.baseball_videos') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_videos WHERE created_at >= $1'
      INTO v_videos30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_player_engagement_events') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_player_engagement_events WHERE created_at >= $1'
      INTO v_engagement30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_messages') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_messages WHERE created_at >= $1'
      INTO v_messages30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_conversations') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_conversations WHERE created_at >= $1'
      INTO v_conversations30d USING p_ago30d;
  END IF;

  IF to_regclass('public.baseball_teams') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_teams' INTO v_total_teams;
  END IF;

  IF to_regclass('public.baseball_events') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_events' INTO v_total_events;
  END IF;

  IF to_regclass('public.baseball_camps') IS NOT NULL THEN
    EXECUTE 'SELECT COUNT(*)::bigint FROM baseball_camps' INTO v_total_camps;
  END IF;

  RETURN jsonb_build_object(
    'total_players',               v_total_players,
    'total_coaches',               v_total_coaches,
    'watchlist_stages',            v_watchlist_stages,
    'recruiting_activated_players', v_recruiting_activated,
    'videos_30d',                  v_videos30d,
    'engagement_events_30d',       v_engagement30d,
    'messages_30d',                v_messages30d,
    'conversations_30d',           v_conversations30d,
    'players_onboarded',           v_players_onboarded,
    'coaches_onboarded',           v_coaches_onboarded,
    'total_teams',                 v_total_teams,
    'total_events',                v_total_events,
    'total_camps',                 v_total_camps
  );
END;
$_$;

ALTER FUNCTION "public"."get_admin_baseball_rollup"("p_ago30d" timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_admin_baseball_rollup"("p_ago30d" timestamp with time zone) IS 'Slice B / C5 — collapses 14 baseball_* admin dashboard count queries into a single JSONB rollup. Resilient: missing baseball_* tables return 0.';

CREATE OR REPLACE FUNCTION "public"."get_admin_coachhelm_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '30s'
    AS $$
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      igl_totals AS (
        SELECT
          MAX(created_at)                                                      AS last_insight_at,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int                   AS insights_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d
                            AND COALESCE(insights_generated, 0) = 0)::int     AS insights_failed_7d
        FROM golf_insight_generation_log
      ),
      igl_12w AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'created_at',         created_at,
                'insights_generated', COALESCE(insights_generated, 0)
              )
              ORDER BY created_at ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_insight_generation_log
        WHERE created_at >= p_ago12w
      ),
      igl_30d_count AS (
        SELECT COUNT(*)::int AS cnt
        FROM golf_insight_generation_log
        WHERE created_at >= p_ago30d
      ),
      igl_by_week AS (
        -- Bucketed weekly insight series (12 weeks). Payload mirrors L1699.
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM golf_insight_generation_log
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      latest_insights AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                  id,
                'insight_type',        insight_type,
                'insights_generated',  insights_generated,
                'created_at',          created_at
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, insight_type, insights_generated, created_at
          FROM golf_insight_generation_log
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      -- Covers L3226 (Slice C): (player_id, insights_generated) rows.
      insight_player_rows AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'player_id',          player_id,
                'insights_generated', insights_generated
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_insight_generation_log
        WHERE player_id IS NOT NULL
      ),
      reviews_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_reviews_all_time,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int   AS reviews_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS reviews_30d
        FROM golf_round_reviews
      ),
      reviews_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM golf_round_reviews
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      -- funnel.roundsReviewed denominator: distinct reviewed round_ids.
      reviewed_round_ids AS (
        SELECT
          COALESCE(
            jsonb_agg(DISTINCT round_id),
            '[]'::jsonb
          ) AS arr
        FROM golf_round_reviews
        WHERE round_id IS NOT NULL
      ),
      patterns_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_patterns,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS patterns_30d
        FROM golf_patterns_v2
      ),
      predictions_totals AS (
        SELECT
          COUNT(*)::int                                        AS total_predictions,
          COUNT(*) FILTER (WHERE created_at >= p_ago30d)::int  AS predictions_30d
        FROM golf_predictions
      ),
      philosophy_count AS (
        SELECT COUNT(*)::int AS cnt FROM golf_coach_philosophy
      ),
      model_performance AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'model_type',         model_type,
                'accuracy_rate',      accuracy_rate,
                'calibration_score',  calibration_score,
                'predictions_made',   predictions_made
              )
              ORDER BY period_end DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT model_type, accuracy_rate, calibration_score, predictions_made, period_end
          FROM golf_prediction_model_performance
          ORDER BY period_end DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      insight_effectiveness AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'insight_type',         insight_type,
                'action_rate',          action_rate,
                'improvement_rate',     improvement_rate,
                'effectiveness_score',  effectiveness_score
              )
              ORDER BY period_end DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT insight_type, action_rate, improvement_rate, effectiveness_score, period_end
          FROM golf_insight_effectiveness
          ORDER BY period_end DESC NULLS LAST
          LIMIT 10
        ) t
      )

    SELECT jsonb_build_object(
      'generatedAt',             now(),
      'lastInsightAt',           (SELECT last_insight_at     FROM igl_totals),
      'insightsThisWeek',        (SELECT insights_this_week  FROM igl_totals),
      'insightsFailed7d',        (SELECT insights_failed_7d  FROM igl_totals),
      'insightGenLog12w',        (SELECT arr FROM igl_12w),
      'insightGenLog30dCount',   (SELECT cnt FROM igl_30d_count),
      'insightsByWeek',          (SELECT arr FROM igl_by_week),
      'latestInsights',          (SELECT arr FROM latest_insights),
      'insightPlayerRows',       (SELECT arr FROM insight_player_rows),
      'totalReviewsAllTime',     (SELECT total_reviews_all_time FROM reviews_totals),
      'reviewsThisWeek',         (SELECT reviews_this_week      FROM reviews_totals),
      'reviews30d',              (SELECT reviews_30d            FROM reviews_totals),
      'reviewsByWeek',           (SELECT arr FROM reviews_by_week),
      'reviewedRoundIds',        (SELECT arr FROM reviewed_round_ids),
      'totalPatterns',           (SELECT total_patterns     FROM patterns_totals),
      'patterns30d',             (SELECT patterns_30d       FROM patterns_totals),
      'totalPredictions',        (SELECT total_predictions  FROM predictions_totals),
      'predictions30d',          (SELECT predictions_30d    FROM predictions_totals),
      'coachPhilosophyCount',    (SELECT cnt FROM philosophy_count),
      'modelPerformance',        (SELECT arr FROM model_performance),
      'insightEffectiveness',    (SELECT arr FROM insight_effectiveness)
    )
  );
END;
$$;

ALTER FUNCTION "public"."get_admin_coachhelm_rollup"("p_ago7d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_admin_dashboard_rollup"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      user_stats AS (
        SELECT
          COUNT(*)                                                           AS total,
          COUNT(*) FILTER (WHERE role = 'admin')                             AS admins,
          COUNT(*) FILTER (WHERE role = 'coach')                             AS coaches,
          COUNT(*) FILTER (WHERE role = 'player')                            AS players,
          COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')     AS new_last_7d,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')    AS new_last_30d,
          COUNT(*) FILTER (WHERE last_seen > now() - interval '1 hour')      AS active_1h,
          COUNT(*) FILTER (WHERE last_seen > now() - interval '24 hours')    AS active_24h,
          COUNT(*) FILTER (WHERE last_seen > now() - interval '7 days')      AS active_7d,
          COUNT(*) FILTER (WHERE last_seen > now() - interval '30 days')     AS active_30d
        FROM users
      ),
      round_player_rollup AS (
        SELECT
          player_id,
          COUNT(*)                                                           AS rounds_total,
          MAX(created_at)                                                    AS last_round_at,
          COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')     AS rounds_last_7d,
          COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')    AS rounds_last_30d
        FROM golf_rounds
        WHERE player_id IS NOT NULL
        GROUP BY player_id
      ),
      round_stats AS (
        SELECT
          COALESCE(SUM(rounds_total), 0)                                     AS total_rounds,
          COALESCE(SUM(rounds_last_7d), 0)                                   AS rounds_last_7d,
          COALESCE(SUM(rounds_last_30d), 0)                                  AS rounds_last_30d,
          COUNT(*)                                                           AS active_players,
          COUNT(*) FILTER (WHERE last_round_at > now() - interval '30 days') AS players_active_30d,
          COUNT(*) FILTER (WHERE last_round_at < now() - interval '30 days'
                              OR last_round_at IS NULL)                     AS at_risk_players
        FROM round_player_rollup
      ),
      round_today AS (
        SELECT COUNT(*) AS rounds_today
        FROM golf_rounds
        WHERE created_at >= date_trunc('day', now())
      ),
      team_stats AS (
        SELECT
          (SELECT COUNT(*) FROM golf_teams)                                   AS golf_teams,
          (SELECT COUNT(*) FROM golf_teams
             WHERE created_at > now() - interval '30 days')                   AS golf_teams_new_30d,
          (SELECT COUNT(DISTINCT team_id) FROM golf_team_members
             WHERE status = 'active')                                         AS golf_teams_active,
          COALESCE(
            (SELECT COUNT(*)::bigint FROM baseball_teams
               WHERE to_regclass('public.baseball_teams') IS NOT NULL),
            0
          )                                                                   AS baseball_teams
      ),
      signup_trend AS (
        SELECT
          jsonb_agg(
            jsonb_build_object(
              'date',  to_char(bucket, 'YYYY-MM-DD'),
              'count', cnt
            )
            ORDER BY bucket ASC
          ) AS series
        FROM (
          SELECT date_trunc('day', created_at) AS bucket,
                 COUNT(*)                       AS cnt
          FROM users
          WHERE created_at > now() - interval '30 days'
          GROUP BY 1
        ) s
      ),
      onboarding_stats AS (
        SELECT
          (SELECT COUNT(*) FROM golf_coaches WHERE onboarding_completed = TRUE) AS coaches_onboarded,
          (SELECT COUNT(*) FROM golf_players WHERE onboarding_completed = TRUE) AS players_onboarded,
          (SELECT COUNT(*) FROM golf_coaches)                                   AS coaches_total,
          (SELECT COUNT(*) FROM golf_players)                                   AS players_total
      )
    SELECT jsonb_build_object(
      'generated_at',     now(),
      'users',            (SELECT row_to_json(user_stats)       FROM user_stats),
      'rounds',           (SELECT row_to_json(round_stats)      FROM round_stats),
      'rounds_today',     (SELECT rounds_today                  FROM round_today),
      'teams',            (SELECT row_to_json(team_stats)       FROM team_stats),
      'onboarding',       (SELECT row_to_json(onboarding_stats) FROM onboarding_stats),
      'signup_trend_30d', COALESCE((SELECT series FROM signup_trend), '[]'::jsonb)
    )
  );
END;
$$;

ALTER FUNCTION "public"."get_admin_dashboard_rollup"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_admin_dashboard_rollup"() IS 'Single-call admin dashboard rollup. Returns JSONB with user/round/team/onboarding counts + 30-day signup trend. Replaces ~95-query client path.';

CREATE OR REPLACE FUNCTION "public"."get_admin_errors_rollup"("p_ago7d" timestamp with time zone DEFAULT ("now"() - '7 days'::interval), "p_ago24h" timestamp with time zone DEFAULT ("now"() - '24:00:00'::interval)) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_error_logs_recent       jsonb := '[]'::jsonb;
  v_error_logs_total_7d     bigint := 0;
  v_error_logs_critical_7d  bigint := 0;
  v_error_logs_count_24h    bigint := 0;
  v_error_summary           jsonb := NULL;
  v_audit_recent            jsonb := '[]'::jsonb;
  v_audit_total_7d          bigint := 0;
  v_login_recent            jsonb := '[]'::jsonb;
  v_login_locked_count      bigint := 0;
  v_admin_events_recent     jsonb := '[]'::jsonb;
  v_admin_events_unresolved jsonb := '[]'::jsonb;
  v_admin_events_error_only jsonb := '[]'::jsonb;
  v_admin_event_summary     jsonb := NULL;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'message', e.message,
        'severity', e.severity,
        'stack', e.stack,
        'url', e.url,
        'user_id', e.user_id,
        'context', e.context,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_error_logs_recent
  FROM (
    SELECT id, message, severity, stack, url, user_id, context, created_at
    FROM error_logs
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  SELECT COUNT(*)::bigint INTO v_error_logs_total_7d
    FROM error_logs WHERE created_at >= p_ago7d;
  SELECT COUNT(*)::bigint INTO v_error_logs_critical_7d
    FROM error_logs WHERE created_at >= p_ago7d AND severity = 'critical';
  SELECT COUNT(*)::bigint INTO v_error_logs_count_24h
    FROM error_logs WHERE created_at >= p_ago24h;

  BEGIN
    SELECT jsonb_build_object(
      'by_severity', by_severity,
      'top_errors', top_errors,
      'daily_rate', daily_rate,
      'total_count', total_count,
      'critical_count', critical_count
    )
    INTO v_error_summary
    FROM public.get_error_summary(7);
  EXCEPTION WHEN OTHERS THEN
    v_error_summary := NULL;
  END;

  BEGIN
    v_audit_recent := COALESCE(public.get_audit_log_recent(50)::jsonb, '[]'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_audit_recent := '[]'::jsonb;
  END;

  SELECT COUNT(*)::bigint INTO v_audit_total_7d
    FROM audit_log WHERE created_at >= p_ago7d;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'email', l.email,
        'failed_attempts', l.failed_attempts,
        'last_attempt', l.last_attempt,
        'locked_until', l.locked_until
      )
      ORDER BY l.last_attempt DESC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_login_recent
  FROM (
    SELECT email, failed_attempts, last_attempt, locked_until
    FROM login_attempts
    ORDER BY last_attempt DESC NULLS LAST
    LIMIT 20
  ) l;

  SELECT COUNT(*)::bigint INTO v_login_locked_count
    FROM login_attempts WHERE locked_until >= now();

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'user_id', e.user_id,
        'user_email', e.user_email,
        'url', e.url,
        'resolved', e.resolved,
        'resolved_at', e.resolved_at,
        'resolved_by', e.resolved_by,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_recent
  FROM (
    SELECT id, event_type, severity, title, message, user_id, user_email,
           url, resolved, resolved_at, resolved_by, created_at
    FROM admin_events
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'resolved', e.resolved,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_unresolved
  FROM (
    SELECT id, event_type, severity, title, message, resolved, created_at
    FROM admin_events
    WHERE resolved = FALSE
      AND severity IN ('critical', 'error')
    ORDER BY created_at DESC
    LIMIT 20
  ) e;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'severity', e.severity::text,
        'title', e.title,
        'message', e.message,
        'metadata', e.metadata,
        'user_id', e.user_id,
        'user_email', e.user_email,
        'url', e.url,
        'resolved', e.resolved,
        'resolved_at', e.resolved_at,
        'resolved_by', e.resolved_by,
        'created_at', e.created_at
      )
      ORDER BY e.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_admin_events_error_only
  FROM (
    SELECT id, event_type, severity, title, message, metadata, user_id,
           user_email, url, resolved, resolved_at, resolved_by, created_at
    FROM admin_events
    WHERE event_type = 'error'
    ORDER BY created_at DESC
    LIMIT 500
  ) e;

  BEGIN
    v_admin_event_summary := COALESCE(public.get_admin_event_summary(7), '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    v_admin_event_summary := NULL;
  END;

  RETURN jsonb_build_object(
    'error_logs', jsonb_build_object(
      'recent', v_error_logs_recent,
      'total_7d', v_error_logs_total_7d,
      'critical_7d', v_error_logs_critical_7d,
      'count_24h', v_error_logs_count_24h
    ),
    'error_summary', v_error_summary,
    'audit_log', jsonb_build_object(
      'recent', v_audit_recent,
      'total_7d', v_audit_total_7d
    ),
    'login_security', jsonb_build_object(
      'recent', v_login_recent,
      'locked_count', v_login_locked_count
    ),
    'admin_events', jsonb_build_object(
      'recent', v_admin_events_recent,
      'unresolved_critical', v_admin_events_unresolved,
      'error_only', v_admin_events_error_only,
      'summary', v_admin_event_summary
    )
  );
END;
$$;

ALTER FUNCTION "public"."get_admin_errors_rollup"("p_ago7d" timestamp with time zone, "p_ago24h" timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_admin_errors_rollup"("p_ago7d" timestamp with time zone, "p_ago24h" timestamp with time zone) IS 'Slice B / C6 — rollup of error_logs + audit_log + login_attempts + admin_events. Wraps get_error_summary and get_admin_event_summary with exception handlers so their failure degrades gracefully (TS sets errorSummaryDegraded / adminEventSummaryDegraded flags).';

CREATE OR REPLACE FUNCTION "public"."get_admin_event_summary"("p_days_back" integer DEFAULT 7) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  cutoff timestamptz := now() - (p_days_back || ' days')::interval;
  result jsonb;
BEGIN
  -- Same admin gate as every other admin rollup RPC (get_admin_baseball_rollup,
  -- get_admin_errors_rollup, etc.) — service_role (cron/internal) passes
  -- through; otherwise caller must be is_super_admin() or users.role = 'admin'.
  PERFORM public.__admin_rollup_b_gate();

  WITH
    totals AS (
      SELECT
        count(*)                                                   AS total_events,
        count(*) FILTER (WHERE severity::text = 'error')           AS error_count,
        count(*) FILTER (WHERE severity::text = 'critical')        AS critical_count,
        count(*) FILTER (WHERE NOT resolved)                       AS unresolved_count
      FROM admin_events
      WHERE created_at >= cutoff
    ),
    by_type AS (
      SELECT coalesce(jsonb_object_agg(event_type, cnt), '{}'::jsonb) AS j
      FROM (
        SELECT event_type, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY event_type
      ) t
    ),
    by_severity AS (
      SELECT coalesce(jsonb_object_agg(severity::text, cnt), '{}'::jsonb) AS j
      FROM (
        SELECT severity, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY severity
      ) t
    ),
    by_day AS (
      SELECT coalesce(
        jsonb_agg(
          jsonb_build_object('date', d::text, 'count', coalesce(dc.cnt, 0))
          ORDER BY d
        ),
        '[]'::jsonb
      ) AS j
      FROM generate_series(cutoff::date, current_date, '1 day') d
      LEFT JOIN (
        SELECT created_at::date AS day, count(*) AS cnt
        FROM admin_events
        WHERE created_at >= cutoff
        GROUP BY 1
      ) dc ON dc.day = d
    )
  SELECT jsonb_build_object(
    'total_events',      totals.total_events,
    'error_count',       totals.error_count,
    'critical_count',    totals.critical_count,
    'unresolved_count',  totals.unresolved_count,
    'events_by_type',    by_type.j,
    'events_by_severity',by_severity.j,
    'events_by_day',     by_day.j
  )
  INTO result
  FROM totals, by_type, by_severity, by_day;

  RETURN result;
END;
$$;

ALTER FUNCTION "public"."get_admin_event_summary"("p_days_back" integer) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_admin_event_summary"("p_days_back" integer) IS 'Admin-only 7-day (default) admin_events rollup (totals/by_type/by_severity/by_day). Gated 2026-07-09 via __admin_rollup_b_gate() (service_role, is_super_admin(), or users.role = ''admin'') to match its 16 sibling admin rollup RPCs — previously had zero self-gating and EXECUTE granted to PUBLIC/anon. Consumed by get_admin_errors_rollup, itself gated.';

CREATE OR REPLACE FUNCTION "public"."get_admin_feature_adoption_rollup"("p_ago30d" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '30s'
    AS $$
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'generatedAt',   now(),
    'qualifiers', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_qualifiers),
      'last30d',  (SELECT COUNT(*)::int FROM golf_qualifiers  WHERE created_at >= p_ago30d)
    ),
    'events', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_events),
      'last30d',  (SELECT COUNT(*)::int FROM golf_events       WHERE created_at >= p_ago30d)
    ),
    'tasks', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_tasks),
      'last30d',  (SELECT COUNT(*)::int FROM golf_tasks        WHERE created_at >= p_ago30d)
    ),
    'announcements', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_announcements),
      'last30d',  (SELECT COUNT(*)::int FROM golf_announcements WHERE created_at >= p_ago30d)
    ),
    'messages', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_messages),
      'last30d',  (SELECT COUNT(*)::int FROM golf_messages     WHERE created_at >= p_ago30d)
    ),
    'documents', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_documents),
      'last30d',  (SELECT COUNT(*)::int FROM golf_documents    WHERE created_at >= p_ago30d)
    ),
    'travel', jsonb_build_object(
      'total',    (SELECT COUNT(*)::int FROM golf_travel_itineraries),
      'last30d',  (SELECT COUNT(*)::int FROM golf_travel_itineraries WHERE created_at >= p_ago30d)
    )
  );
END;
$$;

ALTER FUNCTION "public"."get_admin_feature_adoption_rollup"("p_ago30d" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_admin_platform_stat_averages"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  SELECT jsonb_build_object(
    'scoring_average',             AVG(scoring_average),
    'driving_accuracy_percentage', AVG(driving_accuracy_percentage),
    'gir_percentage',              AVG(gir_percentage),
    'putts_per_round',             AVG(putts_per_round),
    'player_count',                COUNT(*) FILTER (WHERE scoring_average IS NOT NULL)
  )
  INTO v
  FROM golf_player_stats_cache;

  RETURN COALESCE(v, '{}'::jsonb);
END;
$$;

ALTER FUNCTION "public"."get_admin_platform_stat_averages"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_admin_rounds_rollup"("p_today" timestamp with time zone, "p_ago24h" timestamp with time zone, "p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago60d" timestamp with time zone, "p_ago12w" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '30s'
    AS $$
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      -- Active-user distinct sets (health.activeUsers{24h,7d,30d}).
      active_24h AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago24h
      ),
      active_7d AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago7d
      ),
      active_30d AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL AND created_at >= p_ago30d
      ),
      -- Churn window: player sets active in [30d, 60d) vs [0, 30d).
      active_30_60 AS (
        SELECT DISTINCT player_id
        FROM golf_rounds
        WHERE player_id IS NOT NULL
          AND created_at >= p_ago60d
          AND created_at <  p_ago30d
      ),
      -- Window + total counts.
      window_counts AS (
        SELECT
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)                      AS rounds_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago14d
                             AND created_at <  p_ago7d)                     AS rounds_last_week,
          COUNT(*) FILTER (WHERE created_at >= p_today)                      AS rounds_today,
          COUNT(*)                                                           AS total_rounds,
          COUNT(*) FILTER (WHERE status = 'completed')                       AS completed_rounds,
          COUNT(*) FILTER (WHERE total_score IS NOT NULL)                    AS verified_rounds,
          MAX(created_at)                                                    AS last_round_at
        FROM golf_rounds
      ),
      -- Weekly/type breakdown over last 12 weeks.
      by_week_type AS (
        SELECT
          date_trunc('week', created_at) AS week_start,
          COALESCE(round_type, 'unknown') AS round_type,
          COUNT(*)                        AS cnt
        FROM golf_rounds
        WHERE created_at >= p_ago12w
        GROUP BY 1, 2
      ),
      rounds_by_type AS (
        SELECT
          COALESCE(
            jsonb_object_agg(round_type, total),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT round_type, SUM(cnt)::int AS total
          FROM by_week_type
          GROUP BY round_type
        ) t
      ),
      rounds_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(week_start, 'YYYY-MM-DD'),
                'count', weekly_cnt
              )
              ORDER BY week_start ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT week_start, SUM(cnt)::int AS weekly_cnt
          FROM by_week_type
          GROUP BY week_start
        ) t
      ),
      -- Per-team rounds this week (team_id may be NULL — preserved for TS).
      team_rounds_this_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'team_id',   team_id,
                'player_id', player_id
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT team_id, player_id
          FROM golf_rounds
          WHERE created_at >= p_ago7d
        ) t
      ),
      -- Completed-round scoring distribution (raw total_score list, TS buckets).
      scoring_dist AS (
        SELECT
          COALESCE(
            jsonb_agg(total_score),
            '[]'::jsonb
          ) AS arr
        FROM golf_rounds
        WHERE status = 'completed' AND total_score IS NOT NULL
      ),
      -- Best recent rounds: top 5 by score_to_par ASC among completed.
      best_rounds AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'total_score',  r.total_score,
                'score_to_par', r.score_to_par,
                'course_name',  r.course_name,
                'round_date',   r.round_date,
                'golf_players', CASE
                  WHEN p.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'first_name', p.first_name,
                    'last_name',  p.last_name
                  )
                END
              )
              ORDER BY r.score_to_par ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, player_id, total_score, score_to_par, course_name, round_date
          FROM golf_rounds
          WHERE status = 'completed' AND total_score IS NOT NULL
          ORDER BY score_to_par ASC NULLS LAST
          LIMIT 5
        ) r
        LEFT JOIN golf_players p ON p.id = r.player_id
      ),
      -- Most recent 10 rounds (for activity.recentRounds).
      recent_rounds AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',            r.id,
                'total_score',   r.total_score,
                'score_to_par',  r.score_to_par,
                'round_type',    r.round_type,
                'course_name',   r.course_name,
                'created_at',    r.created_at,
                'golf_players',  CASE
                  WHEN p.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'first_name', p.first_name,
                    'last_name',  p.last_name
                  )
                END
              )
              ORDER BY r.created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, player_id, total_score, score_to_par, round_type,
                 course_name, created_at
          FROM golf_rounds
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) r
        LEFT JOIN golf_players p ON p.id = r.player_id
      ),
      -- Round-count per player (replaces L2142 full scan).
      player_round_counts AS (
        SELECT
          COALESCE(
            jsonb_object_agg(player_id::text, cnt),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT player_id, COUNT(*)::int AS cnt
          FROM golf_rounds
          WHERE player_id IS NOT NULL
          GROUP BY player_id
        ) t
      ),
      -- Last round per player (replaces L2144 full scan).
      player_last_round AS (
        SELECT
          COALESCE(
            jsonb_object_agg(player_id::text, last_round_at),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT player_id, MAX(created_at) AS last_round_at
          FROM golf_rounds
          WHERE player_id IS NOT NULL
          GROUP BY player_id
        ) t
      ),
      -- Daily rounds over last 30 days (visitsByDay, engagement daily chart).
      rounds_by_day_30d AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'date',        to_char(bucket, 'YYYY-MM-DD'),
                'player_id',   player_id
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('day', created_at) AS bucket, player_id
          FROM golf_rounds
          WHERE created_at >= p_ago30d
        ) t
      ),
      -- Bounded minimal rounds array Slice C consumes (last 12 weeks of
      -- player_id/created_at/team_id triples, ordered DESC).
      all_rounds_minimal AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'player_id',  player_id,
                'created_at', created_at,
                'team_id',    team_id
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT player_id, created_at, team_id
          FROM golf_rounds
          WHERE created_at >= p_ago12w
            AND player_id IS NOT NULL
        ) t
      )

    SELECT jsonb_build_object(
      'generatedAt',            now(),
      'activeUsers24h',         (SELECT COUNT(*)::int FROM active_24h),
      'activeUsers7d',          (SELECT COUNT(*)::int FROM active_7d),
      'activeUsers30d',         (SELECT COUNT(*)::int FROM active_30d),
      'playerSetActive30d',     COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_30d),
                                  '[]'::jsonb
                                ),
      'playerSetActive30_60d',  COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_30_60),
                                  '[]'::jsonb
                                ),
      'playersThisWeek',        COALESCE(
                                  (SELECT jsonb_agg(player_id) FROM active_7d),
                                  '[]'::jsonb
                                ),
      'roundsThisWeek',         (SELECT rounds_this_week  FROM window_counts),
      'roundsLastWeek',         (SELECT rounds_last_week  FROM window_counts),
      'roundsToday',            (SELECT rounds_today      FROM window_counts),
      'totalRounds',            (SELECT total_rounds      FROM window_counts),
      'completedRounds',        (SELECT completed_rounds  FROM window_counts),
      'verifiedRounds',         (SELECT verified_rounds   FROM window_counts),
      'lastRoundAt',            (SELECT last_round_at     FROM window_counts),
      'roundsByType',           (SELECT obj FROM rounds_by_type),
      'roundsByWeek',           (SELECT arr FROM rounds_by_week),
      'teamRoundsThisWeek',     (SELECT arr FROM team_rounds_this_week),
      'scoringDistribution',    (SELECT arr FROM scoring_dist),
      'recentBestRounds',       (SELECT arr FROM best_rounds),
      'recentRounds',           (SELECT arr FROM recent_rounds),
      'playerRoundCounts',      (SELECT obj FROM player_round_counts),
      'playerLastRound',        (SELECT obj FROM player_last_round),
      'roundsByDay30d',         (SELECT arr FROM rounds_by_day_30d),
      'allRoundsMinimal',       (SELECT arr FROM all_rounds_minimal)
    )
  );
END;
$$;

ALTER FUNCTION "public"."get_admin_rounds_rollup"("p_today" timestamp with time zone, "p_ago24h" timestamp with time zone, "p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago60d" timestamp with time zone, "p_ago12w" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_admin_teams_scoring_rollup"("p_ago7d" timestamp with time zone DEFAULT ("now"() - '7 days'::interval)) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_teams                    jsonb := '[]'::jsonb;
  v_team_members             jsonb := '[]'::jsonb;
  v_team_rounds_week         jsonb := '[]'::jsonb;
  v_player_stats_top50       jsonb := '[]'::jsonb;
  v_player_team_map          jsonb := '[]'::jsonb;
  v_coach_orgs               jsonb := '[]'::jsonb;
  v_scoring_distribution     jsonb := '[]'::jsonb;
  v_recent_best_rounds       jsonb := '[]'::jsonb;
  v_strokes_gained           jsonb := NULL;
  v_stats_cache_last_updated text  := NULL;
  v_demo_total               bigint := 0;
  v_demo_pending             bigint := 0;
  v_demo_recent              jsonb := '[]'::jsonb;
  v_announcements_total      bigint := 0;
  v_ack_count                bigint := 0;
  v_messages_total           bigint := 0;
  v_conversations_total      bigint := 0;
  v_attendance_pcts          jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.__admin_rollup_b_gate();

  -- Teams + org name
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',              t.id,
        'name',            t.name,
        'organization_id', t.organization_id,
        'org_name',        o.name
      )
      ORDER BY t.name
    ),
    '[]'::jsonb
  )
  INTO v_teams
  FROM golf_teams t
  LEFT JOIN organizations o ON o.id = t.organization_id;

  -- Active team members joined to player name
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'team_id',    m.team_id,
        'player_id',  m.player_id,
        'first_name', p.first_name,
        'last_name',  p.last_name
      )
    ),
    '[]'::jsonb
  )
  INTO v_team_members
  FROM golf_team_members m
  LEFT JOIN golf_players p ON p.id = m.player_id
  WHERE m.status = 'active';

  -- player_id ↔ team (for team-name resolution on topPerformers / directory)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id', m.player_id,
        'team_id',   t.id,
        'team_name', t.name
      )
    ),
    '[]'::jsonb
  )
  INTO v_player_team_map
  FROM golf_team_members m
  JOIN golf_teams t ON t.id = m.team_id
  WHERE m.status = 'active';

  -- Rounds this week per team (raw rows — TS bucketizes)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id', r.player_id,
        'team_id',   r.team_id
      )
    ),
    '[]'::jsonb
  )
  INTO v_team_rounds_week
  FROM golf_rounds r
  WHERE r.created_at >= p_ago7d;

  -- Top 50 performers by scoring_average (with player name)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id',                    s.player_id,
        'scoring_average',              s.scoring_average,
        'driving_accuracy_percentage',  s.driving_accuracy_percentage,
        'gir_percentage',               s.gir_percentage,
        'putts_per_round',              s.putts_per_round,
        'rounds_played',                s.rounds_played,
        'first_name',                   p.first_name,
        'last_name',                    p.last_name
      )
      ORDER BY s.scoring_average ASC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_player_stats_top50
  FROM (
    SELECT player_id, scoring_average, driving_accuracy_percentage,
           gir_percentage, putts_per_round, rounds_played
    FROM golf_player_stats_cache
    WHERE scoring_average IS NOT NULL
    ORDER BY scoring_average ASC
    LIMIT 50
  ) s
  LEFT JOIN golf_players p ON p.id = s.player_id;

  -- Coach organization ids (for team.coachCount resolution)
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('organization_id', c.organization_id)),
    '[]'::jsonb
  )
  INTO v_coach_orgs
  FROM golf_coaches c
  WHERE c.organization_id IS NOT NULL;

  -- Scoring distribution: raw total_score rows (TS bucketizes)
  SELECT COALESCE(
    jsonb_agg(r.total_score),
    '[]'::jsonb
  )
  INTO v_scoring_distribution
  FROM golf_rounds r
  WHERE r.total_score IS NOT NULL
    AND r.status = 'completed';

  -- Recent 5 best rounds
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'total_score',  r.total_score,
        'score_to_par', r.score_to_par,
        'course_name',  r.course_name,
        'round_date',   r.round_date,
        'first_name',   p.first_name,
        'last_name',    p.last_name
      )
      ORDER BY r.score_to_par ASC
    ),
    '[]'::jsonb
  )
  INTO v_recent_best_rounds
  FROM (
    SELECT player_id, total_score, score_to_par, course_name, round_date
    FROM golf_rounds
    WHERE total_score IS NOT NULL
      AND status = 'completed'
    ORDER BY score_to_par ASC
    LIMIT 5
  ) r
  LEFT JOIN golf_players p ON p.id = r.player_id;

  -- Platform strokes-gained averages (single pass)
  SELECT jsonb_build_object(
    'sg_total',        AVG(strokes_gained_total),
    'sg_tee',          AVG(strokes_gained_tee),
    'sg_approach',     AVG(strokes_gained_approach),
    'sg_around_green', AVG(strokes_gained_around_green),
    'sg_putting',      AVG(strokes_gained_putting)
  )
  INTO v_strokes_gained
  FROM golf_player_stats_cache
  WHERE strokes_gained_total IS NOT NULL;

  -- Stats cache last updated (single row)
  SELECT MAX(updated_at)::text INTO v_stats_cache_last_updated
  FROM golf_player_stats_cache;

  -- Demo requests: total + pending + recent 10
  SELECT COUNT(*)::bigint INTO v_demo_total FROM demo_requests;
  SELECT COUNT(*)::bigint INTO v_demo_pending
    FROM demo_requests WHERE status = 'pending';

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name',          d.name,
        'email',         d.email,
        'organization',  d.organization,
        'interest_type', d.interest_type,
        'status',        d.status,
        'created_at',    d.created_at
      )
      ORDER BY d.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_demo_recent
  FROM (
    SELECT name, email, organization, interest_type, status, created_at
    FROM demo_requests
    ORDER BY created_at DESC
    LIMIT 10
  ) d;

  -- Golf communication counts
  SELECT COUNT(*)::bigint INTO v_announcements_total FROM golf_announcements;
  SELECT COUNT(*)::bigint INTO v_ack_count FROM golf_announcement_acknowledgements;
  SELECT COUNT(*)::bigint INTO v_messages_total FROM golf_messages;
  SELECT COUNT(*)::bigint INTO v_conversations_total FROM golf_conversations;

  -- Attendance percentages (if table present)
  IF to_regclass('public.golf_attendance_summary') IS NOT NULL THEN
    EXECUTE $q$SELECT COALESCE(jsonb_agg(attendance_percentage), '[]'::jsonb)
              FROM golf_attendance_summary
              WHERE attendance_percentage IS NOT NULL$q$
      INTO v_attendance_pcts;
  END IF;

  RETURN jsonb_build_object(
    'teams',                    v_teams,
    'team_members',             v_team_members,
    'team_rounds_week',         v_team_rounds_week,
    'player_stats_top50',       v_player_stats_top50,
    'player_team_map',          v_player_team_map,
    'coach_orgs',               v_coach_orgs,
    'scoring_distribution',     v_scoring_distribution,
    'recent_best_rounds',       v_recent_best_rounds,
    'strokes_gained',           v_strokes_gained,
    'stats_cache_last_updated', v_stats_cache_last_updated,
    'demo_requests', jsonb_build_object(
      'total',   v_demo_total,
      'pending', v_demo_pending,
      'recent',  v_demo_recent
    ),
    'golf_communication', jsonb_build_object(
      'total_announcements', v_announcements_total,
      'ack_count',           v_ack_count,
      'total_messages',      v_messages_total,
      'total_conversations', v_conversations_total
    ),
    'attendance_percentages', v_attendance_pcts
  );
END;
$_$;

ALTER FUNCTION "public"."get_admin_teams_scoring_rollup"("p_ago7d" timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_admin_teams_scoring_rollup"("p_ago7d" timestamp with time zone) IS 'Slice B / C7 — single rollup for teams, rosters, scoring, strokes-gained, demo_requests and golf_communication admin-dashboard data.';

CREATE OR REPLACE FUNCTION "public"."get_admin_users_rollup"("p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '30s'
    AS $$
DECLARE
  -- Cohort boundaries: weeks 1..4 back from now. Week N covers the 7-day
  -- bucket that starts N*7 days ago and ends (N-1)*7 days ago.
  v_w4_start timestamptz := now() - interval '28 days';
  v_w4_end   timestamptz := now() - interval '21 days';
  v_w3_start timestamptz := now() - interval '21 days';
  v_w3_end   timestamptz := now() - interval '14 days';
  v_w2_start timestamptz := now() - interval '14 days';
  v_w2_end   timestamptz := now() - interval '7 days';
  v_w1_start timestamptz := now() - interval '7 days';
BEGIN
  IF NOT (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH
      user_counts AS (
        SELECT
          COUNT(*)::int                                                AS total_platform_users,
          COUNT(*) FILTER (WHERE role = 'admin')::int                  AS total_admins,
          COUNT(*) FILTER (WHERE created_at >= p_ago7d)::int           AS new_users_this_week,
          COUNT(*) FILTER (WHERE created_at >= p_ago14d
                            AND created_at <  p_ago7d)::int            AS new_users_last_week
        FROM users
      ),
      signups_by_week AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'week',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('week', created_at) AS bucket,
                 COUNT(*)::int                   AS cnt
          FROM users
          WHERE created_at >= p_ago12w
          GROUP BY 1
        ) t
      ),
      signups_by_day_30d AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'date',  to_char(bucket, 'YYYY-MM-DD'),
                'count', cnt
              )
              ORDER BY bucket ASC
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT date_trunc('day', created_at) AS bucket,
                 COUNT(*)::int                  AS cnt
          FROM users
          WHERE created_at >= p_ago30d
          GROUP BY 1
        ) t
      ),
      coach_counts AS (
        SELECT
          COUNT(*)::int                                           AS total_coaches,
          COUNT(*) FILTER (WHERE onboarding_completed IS TRUE)::int AS coaches_onboarded
        FROM golf_coaches
      ),
      player_counts AS (
        SELECT
          COUNT(*)::int                                           AS total_players,
          COUNT(*) FILTER (WHERE onboarding_completed IS TRUE)::int AS players_onboarded,
          COUNT(*) FILTER (WHERE onboarding_completed IS NOT TRUE)::int AS players_pending
        FROM golf_players
      ),
      active_teams AS (
        SELECT
          COUNT(DISTINCT team_id)::int AS active_team_count
        FROM golf_team_members
        WHERE status = 'active'
      ),
      players_by_year AS (
        SELECT
          COALESCE(
            jsonb_object_agg(year_key, cnt),
            '{}'::jsonb
          ) AS obj
        FROM (
          SELECT
            COALESCE(graduation_year::text, 'unknown') AS year_key,
            COUNT(*)::int                              AS cnt
          FROM golf_players
          GROUP BY 1
        ) t
      ),
      -- playersByStatus embeds graduation_year per-member so the TS layer can
      -- rebuild the status→graduation breakdown (matches the shape at L1644).
      players_by_status AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'status',          tm.status::text,
                'graduation_year', p.graduation_year
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_team_members tm
        LEFT JOIN golf_players p ON p.id = tm.player_id
        WHERE tm.status IS NOT NULL
      ),
      -- Latest 10 signups for activity.recentSignups.
      latest_signups AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',         id,
                'email',      email,
                'role',       role,
                'created_at', created_at
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM (
          SELECT id, email, role, created_at
          FROM users
          ORDER BY created_at DESC NULLS LAST
          LIMIT 10
        ) t
      ),
      -- Cohort retention: users who signed up in each of the last 4 weeks.
      cohort_w1 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w1_start
      ),
      cohort_w2 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w2_start AND created_at <= v_w2_end
      ),
      cohort_w3 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w3_start AND created_at <= v_w3_end
      ),
      cohort_w4 AS (
        SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) AS ids
        FROM users
        WHERE created_at >= v_w4_start AND created_at <= v_w4_end
      ),
      -- Directory: full users list ordered by created_at DESC.
      users_for_directory AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',         id,
                'email',      email,
                'role',       role,
                'created_at', created_at,
                'last_seen',  last_seen
              )
              ORDER BY created_at DESC NULLS LAST
            ),
            '[]'::jsonb
          ) AS arr
        FROM users
      ),
      -- Player detail map (id → id/user_id/name/grad/onboard).
      player_map AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                   id,
                'user_id',              user_id,
                'first_name',           first_name,
                'last_name',            last_name,
                'graduation_year',      graduation_year,
                'onboarding_completed', onboarding_completed
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_players
      ),
      -- Coach detail map.
      coach_map AS (
        SELECT
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',                   id,
                'user_id',              user_id,
                'full_name',            full_name,
                'email',                email,
                'organization_id',      organization_id,
                'onboarding_completed', onboarding_completed
              )
            ),
            '[]'::jsonb
          ) AS arr
        FROM golf_coaches
      )

    SELECT jsonb_build_object(
      'generatedAt',          now(),
      'totalPlatformUsers',   (SELECT total_platform_users FROM user_counts),
      'totalAdmins',          (SELECT total_admins         FROM user_counts),
      'newUsersThisWeek',     (SELECT new_users_this_week  FROM user_counts),
      'newUsersLastWeek',     (SELECT new_users_last_week  FROM user_counts),
      'totalCoaches',         (SELECT total_coaches        FROM coach_counts),
      'coachesOnboarded',     (SELECT coaches_onboarded    FROM coach_counts),
      'totalPlayers',         (SELECT total_players        FROM player_counts),
      'playersOnboarded',     (SELECT players_onboarded    FROM player_counts),
      'playersPending',       (SELECT players_pending      FROM player_counts),
      'activeTeamCount',      (SELECT active_team_count    FROM active_teams),
      'signupsByWeek',        (SELECT arr FROM signups_by_week),
      'signupsByDay30d',      (SELECT arr FROM signups_by_day_30d),
      'playersByYear',        (SELECT obj FROM players_by_year),
      'playersByStatus',      (SELECT arr FROM players_by_status),
      'latestSignups',        (SELECT arr FROM latest_signups),
      'cohortWeeks', jsonb_build_object(
        'w1', (SELECT ids FROM cohort_w1),
        'w2', (SELECT ids FROM cohort_w2),
        'w3', (SELECT ids FROM cohort_w3),
        'w4', (SELECT ids FROM cohort_w4)
      ),
      'usersForDirectory',    (SELECT arr FROM users_for_directory),
      'playerMap',            (SELECT arr FROM player_map),
      'coachMap',             (SELECT arr FROM coach_map)
    )
  );
END;
$$;

ALTER FUNCTION "public"."get_admin_users_rollup"("p_ago7d" timestamp with time zone, "p_ago14d" timestamp with time zone, "p_ago30d" timestamp with time zone, "p_ago12w" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_api_performance_summary"("days_back" integer DEFAULT 7) RETURNS TABLE("route" "text", "total_requests" integer, "total_errors" integer, "error_rate" numeric, "avg_ms" integer, "p50_ms" integer, "p95_ms" integer, "p99_ms" integer)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.route,
    SUM(a.request_count)::INT,
    SUM(a.error_count)::INT,
    ROUND(SUM(a.error_count)::NUMERIC / NULLIF(SUM(a.request_count), 0) * 100, 2),
    ROUND(AVG(a.avg_duration_ms))::INT,
    ROUND(AVG(a.p50_ms))::INT,
    ROUND(AVG(a.p95_ms))::INT,
    ROUND(AVG(a.p99_ms))::INT
  FROM api_call_logs a
  WHERE a.recorded_at >= now() - (days_back || ' days')::interval
  GROUP BY a.route
  ORDER BY SUM(a.request_count) DESC;
END;
$$;

ALTER FUNCTION "public"."get_api_performance_summary"("days_back" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_audit_log_recent"("limit_count" integer DEFAULT 50) RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(json_agg(a), '[]'::json) INTO result
  FROM (
    SELECT
      al.id,
      al.user_id,
      al.action,
      al.table_name,
      al.record_id,
      al.old_data,
      al.new_data,
      al.ip_address,
      al.created_at,
      u.email as user_email
    FROM audit_log al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT limit_count
  ) a;

  RETURN result;
END;
$$;

ALTER FUNCTION "public"."get_audit_log_recent"("limit_count" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_baseball_conversations_with_details"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "creator_id" "text", "last_message_content" "text", "last_message_at" timestamp with time zone, "last_message_sender_id" "uuid", "unread_count" bigint, "participant_ids" "uuid"[], "participant_names" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  -- p_user_id retained for compatibility and deliberately IGNORED (#1267).
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.created_at,
    c.updated_at,
    c.created_by::text AS creator_id,
    (SELECT m.content    FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.created_at FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.sender_id  FROM baseball_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1),
    (SELECT COUNT(*)     FROM baseball_messages m WHERE m.conversation_id = c.id AND m.read = FALSE AND m.sender_id <> v_uid),
    ARRAY(SELECT cp2.user_id FROM baseball_conversation_participants cp2 WHERE cp2.conversation_id = c.id),
    ARRAY(SELECT COALESCE(u.email, 'Unknown') FROM baseball_conversation_participants cp2 JOIN users u ON u.id = cp2.user_id WHERE cp2.conversation_id = c.id)
  FROM baseball_conversations c
  JOIN baseball_conversation_participants cp ON cp.conversation_id = c.id
  WHERE cp.user_id = v_uid
  ORDER BY c.updated_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_baseball_conversations_with_details"("p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_baseball_public_player_stats"("p_player_id" "uuid", "p_season_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_is_self          boolean := false;
  v_is_staff         boolean := false;
  v_public_ok        boolean := false;
  v_show_academics   boolean := true;
  v_stats            jsonb;
  v_batting_log      jsonb;
  v_pitching_log     jsonb;
BEGIN
  IF p_player_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM baseball_players bp
    WHERE bp.id = p_player_id AND bp.user_id = auth.uid()
  ) INTO v_is_self;

  SELECT EXISTS (
    SELECT 1
    FROM baseball_team_members tm
    WHERE tm.player_id = p_player_id
      AND public.is_baseball_team_staff(tm.team_id)
  ) INTO v_is_staff;

  SELECT
    COALESCE(bp.recruiting_activated, false)
    AND COALESCE(ps.profile_visibility, 'public') = 'public'
    AND EXISTS (
      SELECT 1
      FROM baseball_team_members tm
      JOIN baseball_program_settings pgs ON pgs.team_id = tm.team_id
      WHERE tm.player_id = p_player_id
        AND pgs.public_profiles_enabled = true
    ),
    COALESCE(ps.show_academics, true)
  INTO v_public_ok, v_show_academics
  FROM baseball_players bp
  LEFT JOIN baseball_player_settings ps ON ps.player_id = bp.id
  WHERE bp.id = p_player_id;

  IF NOT (v_is_self OR v_is_staff OR v_public_ok) THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(s.*) INTO v_stats
  FROM baseball_player_season_stats s
  WHERE s.player_id = p_player_id
    AND s.season_year = p_season_year
  ORDER BY s.last_updated DESC NULLS LAST
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.game_date DESC NULLS LAST), '[]'::jsonb)
  INTO v_batting_log
  FROM (
    SELECT
      b.id, b.game_id, b.ab, b.r, b.h, b.doubles, b.triples, b.hr, b.rbi,
      b.bb, b.k, b.sb, b.cs, b.hbp, b.sac, b.sf, b.lob,
      b.avg, b.obp, b.slg, b.ops,
      g.game_date, g.opponent_name, g.game_type, g.our_score, g.opponent_score, g.status
    FROM baseball_box_score_batting b
    JOIN baseball_games g ON g.id = b.game_id
    WHERE b.player_id = p_player_id
      AND g.status = 'completed'
      AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.game_date DESC NULLS LAST), '[]'::jsonb)
  INTO v_pitching_log
  FROM (
    SELECT
      p.id, p.game_id, p.ip, p.h, p.r, p.er, p.bb, p.k, p.hr,
      p.era, p.whip, p.k9, p.bb9, p.result,
      g.game_date, g.opponent_name, g.game_type, g.our_score, g.opponent_score, g.status
    FROM baseball_box_score_pitching p
    JOIN baseball_games g ON g.id = p.game_id
    WHERE p.player_id = p_player_id
      AND g.status = 'completed'
      AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year
  ) t;

  RETURN jsonb_build_object(
    'season_year',   p_season_year,
    'show_academics', v_show_academics,
    'stats',         v_stats,
    'batting_log',   COALESCE(v_batting_log, '[]'::jsonb),
    'pitching_log',  COALESCE(v_pitching_log, '[]'::jsonb)
  );
END;
$$;

ALTER FUNCTION "public"."get_baseball_public_player_stats"("p_player_id" "uuid", "p_season_year" integer) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_baseball_public_player_stats"("p_player_id" "uuid", "p_season_year" integer) IS 'Public recruiting-profile season stats + game logs for a player. SECURITY DEFINER; re-enforces the public-profile gate (recruiting_activated + profile_visibility=public + a team with public_profiles_enabled) OR staff/self, returning NULL otherwise. anon EXECUTE is intentional — the function body is the security boundary, not table grants.';

CREATE OR REPLACE FUNCTION "public"."get_baseball_team_join_context"("p_team_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "team_type" "public"."baseball_coach_type", "invite_policy" "text", "require_coach_approval" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT bt.id, bt.name, bt.team_type, bt.invite_policy, bt.require_coach_approval
  FROM public.baseball_teams bt
  WHERE bt.id = p_team_id
  LIMIT 1;
$$;

ALTER FUNCTION "public"."get_baseball_team_join_context"("p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_coach_effectiveness_metrics"() RETURNS TABLE("coach_id" "uuid", "coach_name" "text", "team_count" integer, "player_count" integer, "reviews_published" integer, "avg_review_time_hours" numeric, "has_philosophy" boolean, "effectiveness_score" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.full_name,
    COUNT(DISTINCT t.id)::INT,
    COUNT(DISTINCT tm.player_id)::INT,
    COUNT(DISTINCT grr.id)::INT,
    ROUND(AVG(EXTRACT(EPOCH FROM (grr.created_at - gr.created_at)) / 3600)::NUMERIC, 1),
    EXISTS(SELECT 1 FROM golf_coach_philosophy gcp WHERE gcp.coach_id = gc.id),
    ROUND(
      (LEAST(COUNT(DISTINCT grr.id)::NUMERIC / NULLIF(COUNT(DISTINCT gr.id), 0), 1) * 40) +
      (CASE WHEN EXISTS(SELECT 1 FROM golf_coach_philosophy gcp WHERE gcp.coach_id = gc.id) THEN 30 ELSE 0 END) +
      (LEAST(COUNT(DISTINCT tm.player_id)::NUMERIC / 10, 1) * 30)
    , 1)
  FROM golf_coaches gc
  LEFT JOIN organizations o ON o.id = gc.organization_id
  LEFT JOIN golf_teams t ON t.organization_id = o.id
  LEFT JOIN golf_team_members tm ON tm.team_id = t.id AND tm.status = 'active'
  LEFT JOIN golf_rounds gr ON gr.player_id = tm.player_id AND gr.created_at >= now() - interval '30 days'
  LEFT JOIN golf_round_reviews grr ON grr.round_id = gr.id AND grr.published_by = gc.id
  GROUP BY gc.id, gc.full_name;
END;
$$;

ALTER FUNCTION "public"."get_coach_effectiveness_metrics"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_coach_today_schedule"("p_team_id" "uuid", "p_today_start" timestamp with time zone, "p_today_end" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM golf_coaches gc
    JOIN golf_teams   gt ON gt.organization_id = gc.organization_id
    WHERE gc.user_id = auth.uid()
      AND gt.id = p_team_id
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH today_events AS (
      SELECT id, title, event_type, start_time, end_time, location
      FROM golf_events
      WHERE team_id = p_team_id
        AND start_time >= p_today_start
        AND start_time <  p_today_end
        -- A synced class meeting is one player's personal schedule, not the
        -- team's day. event_type is NOT NULL, so this cannot drop untyped rows.
        AND event_type <> 'class'
      ORDER BY start_time ASC
      LIMIT 10
    ),
    counts AS (
      SELECT a.event_id,
             count(*) FILTER (WHERE a.status IN ('attending','yes')) AS yes_count,
             count(*)::int                                            AS total_count
      FROM golf_event_attendance a
      WHERE a.event_id IN (SELECT id FROM today_events)
      GROUP BY a.event_id
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',         e.id,
          'title',      e.title,
          'event_type', e.event_type,
          'start_time', e.start_time,
          'end_time',   e.end_time,
          'location',   e.location,
          'rsvp_yes',   COALESCE(c.yes_count, 0),
          'rsvp_total', COALESCE(c.total_count, 0)
        )
        ORDER BY e.start_time ASC
      ),
      '[]'::jsonb
    )
    FROM today_events e
    LEFT JOIN counts c ON c.event_id = e.id
  );
END;
$$;

ALTER FUNCTION "public"."get_coach_today_schedule"("p_team_id" "uuid", "p_today_start" timestamp with time zone, "p_today_end" timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_coach_today_schedule"("p_team_id" "uuid", "p_today_start" timestamp with time zone, "p_today_end" timestamp with time zone) IS 'Coach dashboard: today''s TEAM events for a team the caller coaches, with RSVP counts. Excludes synced class meetings (event_type = ''class''), which are a player''s personal schedule rather than the team''s day.';

CREATE OR REPLACE FUNCTION "public"."get_crm_click_destinations"("p_window" "text" DEFAULT '30d'::"text", "p_limit" integer DEFAULT 25) RETURNS TABLE("clicked_url" "text", "click_count" integer, "unique_recipients" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH window_days AS (
    SELECT (CASE p_window WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days' WHEN '90d' THEN now() - interval '90 days' ELSE now() - interval '30 days' END) AS since
  )
  SELECT clicked_url, COUNT(*)::int, COUNT(DISTINCT recipient_email)::int
  FROM email_clicks WHERE occurred_at >= (SELECT since FROM window_days) AND clicked_url IS NOT NULL AND clicked_url <> ''
  GROUP BY clicked_url ORDER BY 2 DESC LIMIT GREATEST(p_limit, 1);
$$;

ALTER FUNCTION "public"."get_crm_click_destinations"("p_window" "text", "p_limit" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_coach_email_events"("p_coach_id" "uuid") RETURNS TABLE("id" "uuid", "event_type" "text", "subject" "text", "occurred_at" timestamp with time zone, "recipient_email" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    ee.id,
    ee.event_type::text,
    cl.subject,
    ee.occurred_at,
    ee.recipient_email
  FROM crm_email_events ee
  JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
  WHERE cl.coach_id = p_coach_id
  ORDER BY ee.occurred_at DESC;
$$;

ALTER FUNCTION "public"."get_crm_coach_email_events"("p_coach_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_coach_stage_history"("p_coach_id" "uuid") RETURNS TABLE("from_status" "text", "to_status" "text", "changed_at" timestamp with time zone, "source" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.from_status, t.to_status, t.changed_at, t.source
  FROM crm_stage_transitions t
  WHERE t.coach_id = p_coach_id
    AND EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  ORDER BY t.changed_at DESC;
$$;

ALTER FUNCTION "public"."get_crm_coach_stage_history"("p_coach_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_email_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    WITH crm_msg AS (
      SELECT DISTINCT resend_message_id
      FROM crm_contact_log
      WHERE resend_message_id IS NOT NULL
    )
    SELECT jsonb_build_object(
      'total_sent', (SELECT count(*) FROM crm_msg),
      'delivered',  (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.delivered'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg)),
      'opened',     (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.opened'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg)),
      'clicked',    (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.clicked'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg)),
      'bounced',    (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.bounced'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg)),
      'complained', (SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
                       WHERE ee.event_type = 'email.complained'
                         AND ee.resend_message_id IN (SELECT resend_message_id FROM crm_msg))
    )
  );
END;
$$;

ALTER FUNCTION "public"."get_crm_email_stats"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_email_stats_detailed"() RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totals', (
      SELECT json_build_object(
        'sent', COUNT(*) FILTER (WHERE event_type = 'email.sent'),
        'delivered', COUNT(*) FILTER (WHERE event_type = 'email.delivered'),
        'opened', COUNT(*) FILTER (WHERE event_type = 'email.opened'),
        'clicked', COUNT(*) FILTER (WHERE event_type = 'email.clicked'),
        'bounced', COUNT(*) FILTER (WHERE event_type = 'email.bounced'),
        'complained', COUNT(*) FILTER (WHERE event_type = 'email.complained')
      )
      FROM crm_email_events
    ),
    'recent_events', (
      SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
      FROM (
        SELECT ee.id, ee.event_type, cl.subject, ee.occurred_at, ee.recipient_email,
               c.name AS coach_name, c.school
        FROM crm_email_events ee
        LEFT JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
        LEFT JOIN crm_coaches c ON c.id = cl.coach_id
        ORDER BY ee.occurred_at DESC
        LIMIT 50
      ) r
    ),
    'bounced_coaches', (
      SELECT COALESCE(json_agg(row_to_json(b)), '[]'::json)
      FROM (
        SELECT c.id, c.name, c.email, c.school, c.email_status
        FROM crm_coaches c
        WHERE c.email_status IN ('bounced', 'complained')
        ORDER BY c.updated_at DESC
      ) b
    )
  ) INTO result;
  RETURN result;
END;
$$;

ALTER FUNCTION "public"."get_crm_email_stats_detailed"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_events_in_range"("p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS TABLE("id" "uuid", "title" "text", "description" "text", "event_type" "public"."crm_event_type", "start_time" timestamp with time zone, "end_time" timestamp with time zone, "all_day" boolean, "location" "text", "meeting_url" "text", "coach_id" "uuid", "coach_name" "text", "coach_school" "text", "status" "text", "google_event_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT
    e.id, e.title, e.description, e.event_type,
    e.start_time, e.end_time, e.all_day, e.location, e.meeting_url,
    e.coach_id, c.name as coach_name, c.school as coach_school,
    e.status, e.google_event_id
  FROM crm_events e
  LEFT JOIN crm_coaches c ON c.id = e.coach_id
  WHERE e.start_time >= p_start AND e.start_time < p_end
  ORDER BY e.start_time;
END;
$$;

ALTER FUNCTION "public"."get_crm_events_in_range"("p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_funnel"("p_window" "text" DEFAULT '30d'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_since timestamptz;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_since := CASE p_window
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE now() - interval '30 days'
  END;

  SELECT jsonb_build_object(
    'window', p_window,
    'since', v_since,
    'sent', (
      SELECT count(*) FROM crm_contact_log cl
      WHERE cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'delivered', (
      SELECT count(*) FROM email_events ee
      JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
      WHERE ee.event_type = 'email.delivered'
        AND cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'opened', (
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
      WHERE ee.event_type = 'email.opened'
        AND cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'clicked', (
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      JOIN crm_contact_log cl ON cl.id = ee.contact_log_id
      WHERE ee.event_type = 'email.clicked'
        AND cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'replied', (
      SELECT count(*) FROM crm_replies r WHERE r.received_at >= v_since
    ),
    'coaches_emailed', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      WHERE cl.contact_type = 'email' AND cl.contact_date >= v_since
    ),
    'coaches_opened', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      JOIN email_events ee ON ee.contact_log_id = cl.id
      WHERE ee.event_type = 'email.opened' AND cl.contact_date >= v_since
    ),
    'coaches_clicked', (
      SELECT count(DISTINCT cl.coach_id) FROM crm_contact_log cl
      JOIN email_events ee ON ee.contact_log_id = cl.id
      WHERE ee.event_type = 'email.clicked' AND cl.contact_date >= v_since
    ),
    'coaches_replied', (
      SELECT count(DISTINCT r.coach_id) FROM crm_replies r
      WHERE r.received_at >= v_since AND r.coach_id IS NOT NULL
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_crm_funnel"("p_window" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_stage_ages"() RETURNS TABLE("coach_id" "uuid", "stage_since" timestamp with time zone, "is_seed" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT DISTINCT ON (t.coach_id)
    t.coach_id, t.changed_at AS stage_since, (t.source = 'seed') AS is_seed
  FROM crm_stage_transitions t
  WHERE EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
  ORDER BY t.coach_id, t.changed_at DESC;
$$;

ALTER FUNCTION "public"."get_crm_stage_ages"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_template_performance"("p_window" "text" DEFAULT '30d'::"text") RETURNS TABLE("template_id" "uuid", "template_name" "text", "sent_count" integer, "delivered_count" integer, "opened_count" integer, "clicked_count" integer, "bounced_count" integer, "open_rate" numeric, "click_rate" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH window_days AS (
    SELECT (CASE p_window WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days' WHEN '90d' THEN now() - interval '90 days' ELSE now() - interval '30 days' END) AS since
  ),
  template_logs AS (
    SELECT t.id AS template_id, t.name AS template_name, cl.id AS contact_log_id
    FROM crm_email_templates t
    JOIN crm_contact_log cl
      ON (cl.metadata->>'template_id' = t.id::text)
      OR (cl.metadata->>'template_id' IS NULL AND cl.subject = t.subject)
    WHERE cl.contact_date >= (SELECT since FROM window_days) AND cl.contact_type = 'email'
  )
  SELECT tl.template_id, tl.template_name,
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.delivered'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.opened'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.clicked'))::int,
    COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM email_events ee WHERE ee.contact_log_id = tl.contact_log_id AND ee.event_type = 'email.bounced'))::int,
    NULL::numeric, NULL::numeric
  FROM template_logs tl GROUP BY tl.template_id, tl.template_name ORDER BY 3 DESC;
$$;

ALTER FUNCTION "public"."get_crm_template_performance"("p_window" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_time_to_open"("p_window" "text" DEFAULT '30d'::"text") RETURNS TABLE("bucket_min" integer, "bucket_max" integer, "count" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH window_days AS (
    SELECT (CASE p_window WHEN '7d' THEN now() - interval '7 days' WHEN '30d' THEN now() - interval '30 days' WHEN '90d' THEN now() - interval '90 days' ELSE now() - interval '30 days' END) AS since
  ),
  paired AS (
    SELECT sent.contact_log_id, EXTRACT(EPOCH FROM (MIN(opened.occurred_at) - sent.occurred_at)) AS seconds_to_open
    FROM email_events sent
    JOIN email_events opened ON opened.contact_log_id = sent.contact_log_id AND opened.event_type = 'email.opened' AND opened.occurred_at > sent.occurred_at
    WHERE sent.event_type = 'email.sent' AND sent.occurred_at >= (SELECT since FROM window_days)
    GROUP BY sent.contact_log_id, sent.occurred_at
  ),
  bucketed AS (
    SELECT CASE WHEN seconds_to_open < 60 THEN '0-60' WHEN seconds_to_open < 600 THEN '60-600' WHEN seconds_to_open < 3600 THEN '600-3600' WHEN seconds_to_open < 14400 THEN '3600-14400' WHEN seconds_to_open < 86400 THEN '14400-86400' ELSE '86400+' END AS bucket FROM paired
  )
  SELECT (split_part(bucket, '-', 1))::int, CASE WHEN bucket = '86400+' THEN 999999 ELSE (split_part(bucket, '-', 2))::int END, COUNT(*)::int
  FROM bucketed GROUP BY bucket ORDER BY 1;
END;
$$;

ALTER FUNCTION "public"."get_crm_time_to_open"("p_window" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_crm_weekly_kpis"("p_weeks" integer DEFAULT 8) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
  v_weeks integer := LEAST(GREATEST(COALESCE(p_weeks, 8), 1), 26);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  WITH weeks AS (
    SELECT date_trunc('week', now())::date - (7 * gs) AS week_start
    FROM generate_series(v_weeks - 1, 0, -1) AS gs
  )
  SELECT jsonb_agg(jsonb_build_object(
    'week_start', w.week_start,
    'sent', (
      SELECT count(*) FROM crm_contact_log cl
      WHERE cl.contact_type = 'email'
        AND cl.contact_date >= w.week_start AND cl.contact_date < w.week_start + 7
    ),
    'calls', (
      SELECT count(*) FROM crm_contact_log cl
      WHERE cl.contact_type = 'call'
        AND cl.contact_date >= w.week_start AND cl.contact_date < w.week_start + 7
    ),
    'opened', (
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      WHERE ee.event_type = 'email.opened'
        AND ee.occurred_at >= w.week_start AND ee.occurred_at < w.week_start + 7
    ),
    'clicked', (
      SELECT count(DISTINCT ee.resend_message_id) FROM email_events ee
      WHERE ee.event_type = 'email.clicked'
        AND ee.occurred_at >= w.week_start AND ee.occurred_at < w.week_start + 7
    ),
    'replied', (
      SELECT count(*) FROM crm_replies r
      WHERE r.received_at >= w.week_start AND r.received_at < w.week_start + 7
    ),
    'stage_advances', (
      SELECT count(*) FROM crm_stage_transitions t
      WHERE t.source = 'app'
        AND t.to_status IN ('contacted', 'engaged', 'proposal', 'won')
        AND t.changed_at >= w.week_start AND t.changed_at < w.week_start + 7
    )
  ) ORDER BY w.week_start)
  INTO v_result
  FROM weeks w;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

ALTER FUNCTION "public"."get_crm_weekly_kpis"("p_weeks" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_current_golf_player_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM golf_players WHERE user_id = auth.uid() LIMIT 1
$$;

ALTER FUNCTION "public"."get_current_golf_player_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_current_player_team_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT gtm.team_id 
  FROM golf_team_members gtm
  JOIN golf_players gp ON gp.id = gtm.player_id
  WHERE gp.user_id = auth.uid()
  AND gtm.status = 'active'
$$;

ALTER FUNCTION "public"."get_current_player_team_ids"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_db_telemetry"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_role text;
  v_caller uuid;
  v_active int;
  v_idle int;
  v_db_size bigint;
  v_top_tables jsonb;
  v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    v_caller := auth.uid();
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT role::text INTO v_role
    FROM public.users
    WHERE id = v_caller;

    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE state = 'active'),
    COUNT(*) FILTER (WHERE state = 'idle')
  INTO v_active, v_idle
  FROM pg_stat_activity
  WHERE datname = current_database();

  v_db_size := pg_database_size(current_database());

  SELECT COALESCE(
    jsonb_agg(t ORDER BY (t->>'size_bytes')::bigint DESC),
    '[]'::jsonb
  )
  INTO v_top_tables
  FROM (
    SELECT jsonb_build_object(
      'schema',       n.nspname,
      'table',        c.relname,
      'size_bytes',   pg_total_relation_size(c.oid),
      'row_estimate', GREATEST(c.reltuples::bigint, 0)
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND n.nspname NOT LIKE 'pg_toast_temp_%'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 10
  ) sub;

  v_result := jsonb_build_object(
    'connection_pool_active', COALESCE(v_active, 0),
    'connection_pool_idle',   COALESCE(v_idle, 0),
    'db_size_bytes',          COALESCE(v_db_size, 0),
    'top_tables',             COALESCE(v_top_tables, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_db_telemetry"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_db_telemetry"() IS 'Admin-only DB telemetry: connection pool, db size, and top 10 tables by total relation size.';

CREATE OR REPLACE FUNCTION "public"."get_enhanced_system_health"() RETURNS TABLE("metric_name" "text", "metric_value" "text", "status" "text", "detail" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 'db_size'::TEXT, pg_size_pretty(pg_database_size(current_database())), 'ok'::TEXT, ''::TEXT
  UNION ALL
  SELECT 'active_connections', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 80 THEN 'critical' WHEN COUNT(*) > 50 THEN 'warning' ELSE 'ok' END,
    'Max: 100'
  FROM pg_stat_activity WHERE state = 'active'
  UNION ALL
  SELECT 'idle_connections', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 30 THEN 'warning' ELSE 'ok' END, ''
  FROM pg_stat_activity WHERE state = 'idle'
  UNION ALL
  SELECT 'errors_last_hour', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 50 THEN 'critical' WHEN COUNT(*) > 10 THEN 'warning' ELSE 'ok' END, ''
  FROM error_logs WHERE created_at >= now() - interval '1 hour'
  UNION ALL
  SELECT 'failed_logins_today', COUNT(*)::TEXT,
    CASE WHEN COUNT(*) > 20 THEN 'warning' ELSE 'ok' END, ''
  FROM login_attempts WHERE last_attempt >= CURRENT_DATE AND failed_attempts > 0;
END;
$$;

ALTER FUNCTION "public"."get_enhanced_system_health"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_error_summary"("days_back" integer DEFAULT 7) RETURNS TABLE("by_severity" "jsonb", "top_errors" "jsonb", "daily_rate" "jsonb", "total_count" bigint, "critical_count" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  cutoff timestamptz := now() - (days_back || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH base AS (
    -- Projection trimmed from SELECT * — stack + context JSONB + url are not
    -- used by any downstream aggregate, and pulling them across 70k rows was
    -- the dominant cost.
    SELECT message, severity, user_id, created_at
    FROM error_logs
    WHERE created_at >= cutoff
  )
  SELECT
    coalesce((
      SELECT jsonb_agg(jsonb_build_object('severity', s.severity, 'count', s.cnt))
      FROM (SELECT b.severity, count(*) AS cnt FROM base b GROUP BY b.severity) s
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.cnt DESC)
      FROM (
        SELECT b.message,
               min(b.severity) AS severity,
               count(*)        AS cnt,
               min(b.created_at)::text AS first_seen,
               max(b.created_at)::text AS last_seen,
               count(DISTINCT b.user_id) AS affected_users
        FROM base b
        GROUP BY b.message
        ORDER BY count(*) DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'day', d::text || 'T00:00:00+00:00', 'count', coalesce(dc.cnt, 0)
      ) ORDER BY d)
      FROM generate_series(cutoff::date, current_date, '1 day') d
      LEFT JOIN (
        SELECT b.created_at::date AS day, count(*) AS cnt
        FROM base b
        GROUP BY 1
      ) dc ON dc.day = d
    ), '[]'::jsonb),
    (SELECT count(*) FROM base),
    (SELECT count(*) FROM base WHERE base.severity = 'critical');
END;
$$;

ALTER FUNCTION "public"."get_error_summary"("days_back" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_feature_health"("p_features" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  f jsonb;
  v_key text;
  v_table text;
  v_col text;
  v_heartbeat timestamptz;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_features IS NULL OR jsonb_typeof(p_features) <> 'array' THEN
    RAISE EXCEPTION 'p_features must be a jsonb array of feature descriptors';
  END IF;
  IF jsonb_array_length(p_features) > 500 THEN
    RAISE EXCEPTION 'p_features must be a jsonb array of <= 500 feature descriptors (got %)',
      jsonb_array_length(p_features);
  END IF;

  FOR f IN SELECT * FROM jsonb_array_elements(p_features) LOOP
    v_key := f->>'key';
    CONTINUE WHEN v_key IS NULL OR length(v_key) > 64;

    v_table := f->>'heartbeat_table';
    v_col := COALESCE(f->>'heartbeat_column', 'created_at');
    v_heartbeat := NULL;
    IF v_table IS NOT NULL
       AND length(v_col) <= 63
       AND (v_table LIKE 'golf\_%'
            OR v_table LIKE 'baseball\_%'
            OR v_table LIKE 'helm\_lifting\_%'
            OR v_table IN ('admin_events', 'error_logs'))
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = v_table
           AND column_name = v_col)
    THEN
      EXECUTE format('SELECT max(%I) FROM public.%I', v_col, v_table)
        INTO v_heartbeat;
    END IF;

    v_result := v_result || jsonb_build_object(
      'key', v_key,
      'events_24h', COALESCE((
        SELECT jsonb_build_object(
          'total',               count(*),
          'errors',              count(*) FILTER (WHERE severity IN ('error','critical') AND resolved IS NOT TRUE),
          'critical_unresolved', count(*) FILTER (WHERE severity = 'critical' AND NOT resolved),
          'warnings',            count(*) FILTER (WHERE severity = 'warning' AND source <> 'rls_denial'),
          'fingerprints',        count(DISTINCT fingerprint) FILTER (WHERE severity IN ('error','critical') AND resolved IS NOT TRUE),
          'rls_denials',         count(*) FILTER (WHERE source = 'rls_denial' AND resolved IS NOT TRUE),
          'rls_denial_fingerprints', count(DISTINCT fingerprint) FILTER (WHERE source = 'rls_denial' AND resolved IS NOT TRUE),
          'rls_denial_users',    count(DISTINCT user_id) FILTER (WHERE source = 'rls_denial' AND resolved IS NOT TRUE)
        )
        FROM public.admin_events
        WHERE feature = v_key
          AND created_at >= now() - interval '24 hours'), '{}'::jsonb),
      'top_signatures', COALESCE((
        SELECT jsonb_agg(sig ORDER BY (sig->>'count')::int DESC)
        FROM (
          SELECT jsonb_build_object(
            'fingerprint', fingerprint,
            'title',       min(title),
            'count',       count(*),
            'first_seen',  min(created_at),
            'last_seen',   max(created_at),
            'severity',    CASE WHEN bool_or(severity = 'critical') THEN 'critical' ELSE 'error' END,
            'resolved',    bool_and(resolved)
          ) AS sig
          FROM public.admin_events
          WHERE feature = v_key
            AND created_at >= now() - interval '24 hours'
            AND severity IN ('error','critical')
            AND fingerprint IS NOT NULL
          GROUP BY fingerprint
          ORDER BY count(*) DESC
          LIMIT 5
        ) top5), '[]'::jsonb),
      'fingerprints_prev_24h', (
        SELECT count(DISTINCT fingerprint)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND resolved IS NOT TRUE
          AND created_at >= now() - interval '48 hours'
          AND created_at <  now() - interval '24 hours'),
      'errors_prev_24h', (
        SELECT count(*)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND resolved IS NOT TRUE
          AND created_at >= now() - interval '48 hours'
          AND created_at <  now() - interval '24 hours'),
      'fingerprints_7d', (
        SELECT count(DISTINCT fingerprint)
        FROM public.admin_events
        WHERE feature = v_key
          AND severity IN ('error','critical')
          AND created_at >= now() - interval '7 days'),
      'integrity_status', (
        SELECT CASE WHEN severity IN ('error','critical') THEN 'fail' ELSE 'pass' END
        FROM public.admin_events
        WHERE feature = v_key AND source = 'integrity'
        ORDER BY created_at DESC
        LIMIT 1),
      'heartbeat_last_activity', v_heartbeat
    );
  END LOOP;

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_feature_health"("p_features" "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_feature_health"("p_features" "jsonb") IS 'Helm Bridge feature-health rollup (W15). p_features: jsonb array of {"key","heartbeat_table","heartbeat_column"} descriptors, max 500 — built by rpcInput() in src/lib/admin/feature-registry.ts. heartbeat_table must be golf_*, baseball_*, helm_lifting_*, admin_events or error_logs AND actually carry heartbeat_column (default created_at); anything else resolves NULL, which makes the caller skip the staleness rule entirely rather than assume freshness. events_24h.errors/.fingerprints/.rls_denials*, errors_prev_24h and fingerprints_prev_24h all exclude resolved=true rows (20260821050000) — fingerprints_7d and total deliberately do not, since fingerprints_7d feeds hasNoFeatureData and filtering it would misclassify a freshly-cleared feature as having no data at all.';

CREATE OR REPLACE FUNCTION "public"."get_golf_conversations_with_details"("p_user_id" "uuid") RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "creator_id" "uuid", "last_message_content" "text", "last_message_at" timestamp with time zone, "last_message_sender_id" "uuid", "unread_count" bigint, "participant_ids" "uuid"[], "participant_names" "text"[], "is_group" boolean, "title" "text", "participant_count" bigint, "is_team_channel" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.created_at, c.updated_at, c.created_by,
    (SELECT m.content FROM golf_messages m WHERE m.conversation_id=c.id AND m.is_deleted=FALSE ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.created_at FROM golf_messages m WHERE m.conversation_id=c.id AND m.is_deleted=FALSE ORDER BY m.created_at DESC LIMIT 1),
    (SELECT m.sender_id FROM golf_messages m WHERE m.conversation_id=c.id AND m.is_deleted=FALSE ORDER BY m.created_at DESC LIMIT 1),
    (SELECT COUNT(*) FROM golf_messages m WHERE m.conversation_id=c.id AND m.read=FALSE AND m.is_deleted=FALSE AND m.sender_id!=v_uid),
    ARRAY(SELECT cp2.user_id FROM golf_conversation_participants cp2 WHERE cp2.conversation_id=c.id),
    ARRAY(SELECT COALESCE(u.email,'Unknown') FROM golf_conversation_participants cp2 JOIN users u ON u.id=cp2.user_id WHERE cp2.conversation_id=c.id),
    COALESCE(c.is_team_chat,FALSE), c.title,
    (SELECT COUNT(*) FROM golf_conversation_participants cp2 WHERE cp2.conversation_id=c.id),
    COALESCE(c.is_team_channel,FALSE)
  FROM golf_conversations c JOIN golf_conversation_participants cp ON cp.conversation_id=c.id
  WHERE cp.user_id=v_uid
  ORDER BY c.is_team_channel DESC NULLS LAST, c.updated_at DESC;
END;
$$;

ALTER FUNCTION "public"."get_golf_conversations_with_details"("p_user_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_golf_conversations_with_details"("p_user_id" "uuid") IS 'Get golf conversations with details including group and team channel metadata';

CREATE OR REPLACE FUNCTION "public"."get_golf_message_attachments"("p_message_id" "uuid") RETURNS TABLE("id" "uuid", "file_name" "text", "file_type" "text", "mime_type" "text", "file_size" integer, "storage_path" "text", "thumbnail_url" "text", "width" integer, "height" integer, "duration_seconds" integer, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  BEGIN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.golf_messages m
      JOIN public.golf_conversation_participants cp
        ON cp.conversation_id = m.conversation_id
      WHERE m.id = p_message_id
        AND cp.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'not a participant in this conversation'
        USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
      a.id,
      a.file_name,
      a.file_type,
      a.mime_type,
      a.file_size,
      a.storage_path,
      a.thumbnail_url,
      a.width,
      a.height,
      a.duration_seconds,
      a.created_at
    FROM public.golf_message_attachments a
    WHERE a.message_id = p_message_id
    ORDER BY a.created_at ASC;
  END;
  $$;

ALTER FUNCTION "public"."get_golf_message_attachments"("p_message_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_my_baseball_conversation_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT conversation_id FROM baseball_conversation_participants WHERE user_id = auth.uid();
$$;

ALTER FUNCTION "public"."get_my_baseball_conversation_ids"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_my_baseball_player_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT id FROM public.baseball_players WHERE user_id = auth.uid() LIMIT 1;
$$;

ALTER FUNCTION "public"."get_my_baseball_player_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_my_coach_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1;
$$;

ALTER FUNCTION "public"."get_my_coach_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_my_player_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1;
$$;

ALTER FUNCTION "public"."get_my_player_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_onboarding_funnel_analysis"() RETURNS TABLE("step_name" "text", "step_order" integer, "total_count" integer, "completed_count" integer, "completion_rate" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  WITH totals AS (
    SELECT COUNT(*)::INT AS total_users FROM users
  ),
  steps AS (
    SELECT 'signed_up' AS sname, 1 AS sorder, (SELECT total_users FROM totals) AS cnt
    UNION ALL
    SELECT 'profile_created', 2, (SELECT COUNT(*)::INT FROM users u WHERE EXISTS (SELECT 1 FROM golf_players gp WHERE gp.user_id = u.id) OR EXISTS (SELECT 1 FROM golf_coaches gc WHERE gc.user_id = u.id))
    UNION ALL
    SELECT 'onboarding_completed', 3, (SELECT COUNT(*)::INT FROM users u LEFT JOIN golf_players gp ON gp.user_id = u.id LEFT JOIN golf_coaches gc ON gc.user_id = u.id WHERE COALESCE(gp.onboarding_completed, gc.onboarding_completed, false) = true)
    UNION ALL
    SELECT 'first_round', 4, (SELECT COUNT(DISTINCT player_id)::INT FROM golf_rounds)
    UNION ALL
    SELECT 'active_this_week', 5, (SELECT COUNT(DISTINCT player_id)::INT FROM golf_rounds WHERE created_at >= now() - interval '7 days')
  )
  SELECT
    s.sname,
    s.sorder,
    (SELECT total_users FROM totals),
    s.cnt,
    ROUND(s.cnt::NUMERIC / NULLIF((SELECT total_users FROM totals), 0) * 100, 1)
  FROM steps s
  ORDER BY s.sorder;
END;
$$;

ALTER FUNCTION "public"."get_onboarding_funnel_analysis"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_pending_task_reminders"() RETURNS TABLE("task_id" "uuid", "team_id" "uuid", "title" "text", "due_date" "date", "reminder_at" timestamp with time zone, "assigned_to" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as task_id,
    t.team_id,
    t.title,
    t.due_date,
    t.reminder_at,
    t.assigned_to
  FROM golf_tasks t
  WHERE t.reminder_at IS NOT NULL
    AND t.reminder_at <= NOW()
    AND t.reminder_sent = false
    AND t.status != 'completed'
  ORDER BY t.reminder_at ASC;
END;
$$;

ALTER FUNCTION "public"."get_pending_task_reminders"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_platform_health_stats"() RETURNS TABLE("active_users_1h" integer, "active_users_24h" integer, "active_users_7d" integer, "active_users_30d" integer, "active_sessions" integer, "total_sessions" integer, "total_auth_users" integer, "users_signed_in_today" integer, "users_never_signed_in" integer, "db_size_bytes" bigint, "largest_tables" "jsonb", "active_connections" integer, "idle_connections" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_1h    TIMESTAMPTZ := NOW() - INTERVAL '1 hour';
  v_24h   TIMESTAMPTZ := NOW() - INTERVAL '24 hours';
  v_7d    TIMESTAMPTZ := NOW() - INTERVAL '7 days';
  v_30d   TIMESTAMPTZ := NOW() - INTERVAL '30 days';
  v_today TIMESTAMPTZ := DATE_TRUNC('day', NOW());
  v_largest jsonb;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(t ORDER BY (t->>'size_bytes')::bigint DESC),
    '[]'::jsonb
  )
  INTO v_largest
  FROM (
    SELECT jsonb_build_object(
      'table_name', n.nspname || '.' || c.relname,
      'size_bytes', pg_total_relation_size(c.oid),
      'row_count',  GREATEST(c.reltuples::bigint, 0)
    ) AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND n.nspname NOT LIKE 'pg_temp_%'
      AND n.nspname NOT LIKE 'pg_toast_temp_%'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 5
  ) sub;

  RETURN QUERY SELECT
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_1h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_24h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_7d),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_30d),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_1h),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen IS NOT NULL),
    (SELECT COUNT(*)::INTEGER FROM users),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen >= v_today),
    (SELECT COUNT(*)::INTEGER FROM users WHERE last_seen IS NULL),
    (SELECT pg_database_size(current_database())::BIGINT),
    COALESCE(v_largest, '[]'::jsonb),
    (SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'active' AND datname = current_database()),
    (SELECT COUNT(*)::INTEGER FROM pg_stat_activity WHERE state = 'idle'   AND datname = current_database());
END;
$$;

ALTER FUNCTION "public"."get_platform_health_stats"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_player_hub_announcements"("p_team_id" "uuid", "p_player_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1
      FROM golf_players       gp
      JOIN golf_team_members  gtm ON gtm.player_id = gp.id
      WHERE gp.id = p_player_id
        AND gp.user_id = auth.uid()
        AND gtm.team_id = p_team_id
        AND gtm.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM golf_coaches gc
      JOIN golf_teams   gt ON gt.organization_id = gc.organization_id
      WHERE gc.user_id = auth.uid()
        AND gt.id = p_team_id
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH recent AS (
      SELECT *
      FROM golf_announcements
      WHERE team_id = p_team_id
        AND published_at IS NOT NULL
        AND published_at >= (now() - interval '30 days')
      ORDER BY published_at DESC
      LIMIT 10
    ),
    recipients AS (
      SELECT announcement_id,
             count(*)::int                      AS recipient_count,
             bool_or(player_id = p_player_id)   AS player_in_recipients
      FROM golf_announcement_recipients
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    acks AS (
      SELECT announcement_id,
             count(*)::int                      AS ack_count,
             bool_or(player_id = p_player_id)   AS player_acknowledged
      FROM golf_announcement_acknowledgements
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    docs AS (
      SELECT announcement_id, count(*)::int AS doc_count
      FROM golf_announcement_documents
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    task_counts AS (
      SELECT announcement_id, count(*)::int AS task_count
      FROM golf_announcement_tasks
      WHERE announcement_id IN (SELECT id FROM recent)
      GROUP BY announcement_id
    ),
    visible AS (
      SELECT r.*,
             COALESCE(rp.recipient_count, 0)       AS recipient_count,
             COALESCE(rp.player_in_recipients, FALSE) AS player_in_recipients,
             COALESCE(ak.ack_count, 0)             AS ack_count,
             COALESCE(ak.player_acknowledged, FALSE) AS player_acknowledged,
             COALESCE(d.doc_count, 0)              AS doc_count,
             COALESCE(t.task_count, 0)             AS task_count
      FROM recent r
      LEFT JOIN recipients  rp ON rp.announcement_id = r.id
      LEFT JOIN acks        ak ON ak.announcement_id = r.id
      LEFT JOIN docs        d  ON d.announcement_id  = r.id
      LEFT JOIN task_counts t  ON t.announcement_id  = r.id
      WHERE COALESCE(rp.recipient_count, 0) = 0
         OR COALESCE(rp.player_in_recipients, FALSE)
      ORDER BY r.published_at DESC
      LIMIT 5
    )
    SELECT COALESCE(
      jsonb_agg(
        to_jsonb(v.*)
          - 'player_in_recipients'
          - 'player_acknowledged'
          - 'ack_count'
          - 'doc_count'
          - 'task_count'
          - 'recipient_count'
        || jsonb_build_object(
          'recipient_count',          v.recipient_count,
          'acknowledged_count',       v.ack_count,
          'total_recipients',         v.recipient_count,
          'task_count',               v.task_count,
          'completed_task_count',     0,
          'document_count',           v.doc_count,
          'has_player_acknowledged',  v.player_acknowledged
        )
        ORDER BY v.published_at DESC
      ),
      '[]'::jsonb
    )
    FROM visible v
  );
END;
$$;

ALTER FUNCTION "public"."get_player_hub_announcements"("p_team_id" "uuid", "p_player_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_player_hub_announcements"("p_team_id" "uuid", "p_player_id" "uuid") IS 'Returns up to 5 player-visible announcements with ack/docs/tasks counts. Replaces 5-query waterfall in getPlayerHubAnnouncements.';

CREATE OR REPLACE FUNCTION "public"."get_player_hub_events"("p_team_id" "uuid", "p_player_id" "uuid", "p_since" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1
      FROM golf_players       gp
      JOIN golf_team_members  gtm ON gtm.player_id = gp.id
      WHERE gp.id = p_player_id
        AND gp.user_id = auth.uid()
        AND gtm.team_id = p_team_id
        AND gtm.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM golf_coaches gc
      JOIN golf_teams   gt ON gt.organization_id = gc.organization_id
      WHERE gc.user_id = auth.uid()
        AND gt.id = p_team_id
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH events AS (
      -- is_mandatory is exposed to the client; not a real column on golf_events.
      SELECT id, title, event_type, start_time, end_time, location
      FROM golf_events
      WHERE team_id = p_team_id
        AND start_time >= p_since
      ORDER BY start_time ASC
      LIMIT 20
    ),
    counts AS (
      SELECT event_id,
             count(*) FILTER (WHERE status IN ('accepted','checked_in')) AS going_count,
             count(*) FILTER (WHERE status = 'tentative')                AS maybe_count
      FROM golf_event_attendance
      WHERE event_id IN (SELECT id FROM events)
      GROUP BY event_id
    ),
    my_rsvp AS (
      SELECT event_id, status
      FROM golf_event_attendance
      WHERE player_id = p_player_id
        AND event_id IN (SELECT id FROM events)
    )
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id',           e.id,
          'event_id',     e.id,
          'title',        e.title,
          'event_type',   e.event_type,
          'start_time',   e.start_time,
          'end_time',     e.end_time,
          'location',     e.location,
          'is_mandatory', FALSE,
          'rsvp_status',  (SELECT status FROM my_rsvp WHERE event_id = e.id),
          'going_count',  COALESCE(c.going_count, 0)::int,
          'maybe_count',  COALESCE(c.maybe_count, 0)::int
        )
        ORDER BY e.start_time ASC
      ),
      '[]'::jsonb
    )
    FROM events e
    LEFT JOIN counts c ON c.event_id = e.id
  );
END;
$$;

ALTER FUNCTION "public"."get_player_hub_events"("p_team_id" "uuid", "p_player_id" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_player_hub_events"("p_team_id" "uuid", "p_player_id" "uuid", "p_since" timestamp with time zone) IS 'Returns upcoming events for a team with player RSVP + going/maybe counts joined. Replaces 3-round-trip waterfall in hub/page.tsx.';

CREATE OR REPLACE FUNCTION "public"."get_player_stats_summary"("p_player_id" "uuid") RETURNS TABLE("scoring_average" numeric, "rounds_played" integer, "best_round" integer, "worst_round" integer, "last_5_average" numeric, "last_10_average" numeric, "improvement_trend" numeric, "trend_direction" "text", "gir_percentage" numeric, "fairway_percentage" numeric, "putts_per_round" numeric, "scrambling_percentage" numeric, "is_stale" boolean, "last_updated" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Parameter is genuine (a coach reads a player's summary), so it is gated
  -- rather than ignored (#1268).
  IF NOT (
       p_player_id IN (SELECT gp.id FROM golf_players gp WHERE gp.user_id = (SELECT auth.uid()))
    OR public.user_is_coach_of_golf_player(p_player_id)
    OR public.user_is_teammate_of_golf_player(p_player_id)
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    psc.scoring_average,
    psc.rounds_played,
    psc.best_round,
    psc.worst_round,
    psc.last_5_average,
    psc.last_10_average,
    psc.improvement_trend,
    psc.trend_direction,
    psc.gir_percentage,
    psc.driving_accuracy_percentage AS fairway_percentage,
    psc.putts_per_round,
    psc.scrambling_percentage,
    psc.is_stale,
    psc.updated_at AS last_updated
  FROM golf_player_stats_cache psc
  WHERE psc.player_id = p_player_id;
END;
$$;

ALTER FUNCTION "public"."get_player_stats_summary"("p_player_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_player_stats_summary"("p_player_id" "uuid") IS 'Returns cached player stats summary for instant dashboard loads';

CREATE OR REPLACE FUNCTION "public"."get_qualifier_leaderboard"("qualifier_uuid" "uuid") RETURNS TABLE("player_id" "uuid", "first_name" "text", "last_name" "text", "rounds_played" bigint, "total_score" bigint, "avg_score" numeric, "best_score" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_team uuid;
BEGIN
  SELECT gq.team_id INTO v_team FROM golf_qualifiers gq WHERE gq.id = qualifier_uuid;

  -- Unknown qualifier: reveal nothing, not even whether it exists.
  IF v_team IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.is_golf_team_coach(v_team) OR public.is_golf_team_player(v_team)) THEN
    RAISE EXCEPTION 'not authorized for this qualifier' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    gqe.player_id,
    gp.first_name,
    gp.last_name,
    COUNT(gr.id) AS rounds_played,
    COALESCE(SUM(gr.total_score), 0)::BIGINT AS total_score,
    CASE WHEN COUNT(gr.id) > 0 THEN ROUND(AVG(gr.total_score)::NUMERIC, 1) ELSE NULL END AS avg_score,
    MIN(gr.total_score) AS best_score
  FROM golf_qualifier_entries gqe
  JOIN golf_players gp ON gp.id = gqe.player_id
  LEFT JOIN golf_rounds gr ON gr.qualifier_id = qualifier_uuid
    AND gr.player_id = gqe.player_id
    AND gr.status = 'completed'
  WHERE gqe.qualifier_id = qualifier_uuid
  GROUP BY gqe.player_id, gp.first_name, gp.last_name
  ORDER BY
    CASE WHEN COUNT(gr.id) > 0 THEN 0 ELSE 1 END,
    COALESCE(SUM(gr.total_score), 0) ASC;
END;
$$;

ALTER FUNCTION "public"."get_qualifier_leaderboard"("qualifier_uuid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_resend_activity_stats"("p_window" "text" DEFAULT '7d'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_since timestamptz;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_since := CASE p_window
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    ELSE 'epoch'::timestamptz
  END;

  SELECT jsonb_build_object(
    'window', p_window,
    'since',  v_since,

    'total',     count(*),
    'sent',      count(*) FILTER (WHERE sent_at IS NOT NULL),
    'delivered', count(*) FILTER (WHERE delivered_at IS NOT NULL),
    'opened',    count(*) FILTER (WHERE opened_at IS NOT NULL),
    'clicked',   count(*) FILTER (WHERE clicked_at IS NOT NULL),
    'bounced',   count(*) FILTER (WHERE bounced_at IS NOT NULL),
    'complained',count(*) FILTER (WHERE complained_at IS NOT NULL),
    'pending',   count(*) FILTER (WHERE sent_at IS NOT NULL AND delivered_at IS NULL AND bounced_at IS NULL AND delivery_delayed_at IS NULL),

    'open_count',  coalesce(sum(open_count), 0),
    'click_count', coalesce(sum(click_count), 0),

    'by_source', (
      SELECT jsonb_object_agg(source, cnt) FROM (
        SELECT source, count(*) AS cnt FROM emails
        WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        GROUP BY source
      ) s
    ),
    'by_day', (
      SELECT jsonb_agg(jsonb_build_object(
        'day',       day,
        'sent',      sent,
        'delivered', delivered,
        'opened',    opened,
        'clicked',   clicked,
        'bounced',   bounced
      ) ORDER BY day)
      FROM (
        SELECT
          date_trunc('day', coalesce(sent_at, first_seen_at))::date AS day,
          count(*) FILTER (WHERE sent_at IS NOT NULL)      AS sent,
          count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
          count(*) FILTER (WHERE opened_at IS NOT NULL)    AS opened,
          count(*) FILTER (WHERE clicked_at IS NOT NULL)   AS clicked,
          count(*) FILTER (WHERE bounced_at IS NOT NULL)   AS bounced
        FROM emails
        WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        GROUP BY day
      ) d
    )
  )
  INTO v_result
  FROM emails
  WHERE (sent_at >= v_since OR first_seen_at >= v_since);

  RETURN v_result;
END;
$$;

ALTER FUNCTION "public"."get_resend_activity_stats"("p_window" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_resend_domain_breakdown"("p_window" "text" DEFAULT '30d'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_since timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_since := CASE p_window
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    ELSE 'epoch'::timestamptz
  END;

  RETURN (
    SELECT jsonb_agg(row_to_json(d) ORDER BY d.total DESC)
    FROM (
      SELECT
        split_part(lower(addr), '@', 2) AS domain,
        count(*)                                           AS total,
        count(*) FILTER (WHERE delivered_at IS NOT NULL)   AS delivered,
        count(*) FILTER (WHERE opened_at IS NOT NULL)      AS opened,
        count(*) FILTER (WHERE clicked_at IS NOT NULL)     AS clicked,
        count(*) FILTER (WHERE bounced_at IS NOT NULL)     AS bounced
      FROM emails, unnest(to_addresses) AS addr
      WHERE (sent_at >= v_since OR first_seen_at >= v_since)
        AND addr IS NOT NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 25
    ) d
  );
END;
$$;

ALTER FUNCTION "public"."get_resend_domain_breakdown"("p_window" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_shot_data_quality"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  v_role text;
  v_caller uuid;
  v_total bigint;
  v_missing_distance bigint;
  v_missing_lie bigint;
  v_missing_club bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    v_caller := auth.uid();
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
    END IF;

    SELECT role::text INTO v_role
    FROM public.users
    WHERE id = v_caller;

    IF v_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE distance_to_hole_before IS NULL),
    count(*) FILTER (WHERE lie_before IS NULL),
    count(*) FILTER (WHERE club_type IS NULL)
  INTO v_total, v_missing_distance, v_missing_lie, v_missing_club
  FROM golf_shots;

  RETURN jsonb_build_object(
    'total_shots',             COALESCE(v_total, 0),
    'missing_distance_before', COALESCE(v_missing_distance, 0),
    'missing_lie_before',      COALESCE(v_missing_lie, 0),
    'missing_club_type',       COALESCE(v_missing_club, 0)
  );
END;
$$;

ALTER FUNCTION "public"."get_shot_data_quality"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."get_shot_data_quality"() IS 'Admin-only shot telemetry data-quality counts: total shots plus rows missing distance_to_hole_before / lie_before / club_type. One scan of golf_shots via conditional aggregation; replaces four head-count queries that admin-data.ts used to issue per dashboard load. Service role bypasses the user-role gate.';

CREATE OR REPLACE FUNCTION "public"."get_team_health_dashboard"() RETURNS TABLE("team_id" "uuid", "team_name" "text", "org_name" "text", "member_count" integer, "active_7d" integer, "active_30d" integer, "rounds_30d" integer, "avg_rounds_per_player" numeric, "health_score" numeric, "health_tier" "text", "has_ai_philosophy" boolean)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    o.name,
    COUNT(DISTINCT tm.player_id)::INT,
    COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::INT,
    COUNT(DISTINCT CASE WHEN gr30.player_id IS NOT NULL THEN tm.player_id END)::INT,
    COUNT(DISTINCT gr30.id)::INT,
    CASE WHEN COUNT(DISTINCT tm.player_id) > 0
      THEN ROUND(COUNT(DISTINCT gr30.id)::NUMERIC / COUNT(DISTINCT tm.player_id), 1)
      ELSE 0 END,
    CASE WHEN COUNT(DISTINCT tm.player_id) > 0
      THEN ROUND(
        (COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
         NULLIF(COUNT(DISTINCT tm.player_id), 0) * 50) +
        (LEAST(COUNT(DISTINCT gr30.id)::NUMERIC / NULLIF(COUNT(DISTINCT tm.player_id), 0) / 4, 1) * 30) +
        (CASE WHEN bool_or(gcp.coach_id IS NOT NULL) THEN 20 ELSE 0 END)
      , 1)
      ELSE 0 END,
    CASE
      WHEN COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
           NULLIF(COUNT(DISTINCT tm.player_id), 0) >= 0.6 THEN 'thriving'
      WHEN COUNT(DISTINCT CASE WHEN gr7.player_id IS NOT NULL THEN tm.player_id END)::NUMERIC /
           NULLIF(COUNT(DISTINCT tm.player_id), 0) >= 0.3 THEN 'healthy'
      WHEN COUNT(DISTINCT CASE WHEN gr30.player_id IS NOT NULL THEN tm.player_id END) > 0 THEN 'at_risk'
      ELSE 'inactive'
    END,
    bool_or(gcp.coach_id IS NOT NULL)
  FROM golf_teams t
  LEFT JOIN organizations o ON o.id = t.organization_id
  LEFT JOIN golf_team_members tm ON tm.team_id = t.id AND tm.status = 'active'
  LEFT JOIN golf_rounds gr7 ON gr7.player_id = tm.player_id AND gr7.created_at >= now() - interval '7 days'
  LEFT JOIN golf_rounds gr30 ON gr30.player_id = tm.player_id AND gr30.created_at >= now() - interval '30 days'
  LEFT JOIN golf_coaches gc ON gc.organization_id = t.organization_id
  LEFT JOIN golf_coach_philosophy gcp ON gcp.coach_id = gc.id
  GROUP BY t.id, t.name, o.name;
END;
$$;

ALTER FUNCTION "public"."get_team_health_dashboard"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_engagement_summary"("time_range_days" integer DEFAULT 30) RETURNS TABLE("user_id" "uuid", "email" "text", "role" "text", "rounds_in_period" integer, "reviews_in_period" integer, "messages_in_period" integer, "insights_acknowledged" integer, "events_attended" integer, "engagement_score" numeric, "lifecycle_stage" "text", "last_active_at" timestamp with time zone, "days_since_signup" integer)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - (time_range_days || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH user_activity AS (
    SELECT
      u.id AS uid,
      u.email AS uemail,
      u.role::text AS urole,
      u.created_at AS ucreated,
      u.last_seen AS ulast_seen,
      COALESCE(gp.id, gc.id) AS profile_id,
      COALESCE(gp.onboarding_completed, gc.onboarding_completed, false) AS onboarding_done
    FROM users u
    LEFT JOIN golf_players gp ON gp.user_id = u.id
    LEFT JOIN golf_coaches gc ON gc.user_id = u.id
  ),
  round_counts AS (
    SELECT gr.player_id, COUNT(*) AS cnt
    FROM golf_rounds gr
    WHERE gr.created_at >= cutoff
    GROUP BY gr.player_id
  ),
  review_counts AS (
    SELECT grr.player_id, COUNT(*) AS cnt
    FROM golf_round_reviews grr
    WHERE grr.created_at >= cutoff
    GROUP BY grr.player_id
  ),
  message_counts AS (
    SELECT gm.sender_id, COUNT(*) AS cnt
    FROM golf_messages gm
    WHERE gm.created_at >= cutoff
    GROUP BY gm.sender_id
  )
  SELECT
    ua.uid,
    ua.uemail,
    ua.urole,
    COALESCE(rc.cnt, 0)::INT,
    COALESCE(rv.cnt, 0)::INT,
    COALESCE(mc.cnt, 0)::INT,
    0::INT,
    0::INT,
    (COALESCE(rc.cnt, 0) * 3 + COALESCE(rv.cnt, 0) * 2 + COALESCE(mc.cnt, 0))::NUMERIC AS engagement_score,
    CASE
      WHEN ua.ucreated > now() - interval '7 days' AND NOT ua.onboarding_done THEN 'brand_new'
      WHEN NOT ua.onboarding_done THEN 'onboarding'
      WHEN COALESCE(rc.cnt, 0) = 0 AND ua.ulast_seen < now() - interval '30 days' THEN 'churned'
      WHEN COALESCE(rc.cnt, 0) = 0 AND ua.ulast_seen < now() - interval '14 days' THEN 'at_risk'
      WHEN COALESCE(rc.cnt, 0) >= 10 THEN 'power_user'
      WHEN COALESCE(rc.cnt, 0) >= 3 THEN 'engaged'
      WHEN COALESCE(rc.cnt, 0) >= 1 THEN 'active'
      ELSE 'dormant'
    END AS lifecycle_stage,
    ua.ulast_seen,
    EXTRACT(DAY FROM now() - ua.ucreated)::INT
  FROM user_activity ua
  LEFT JOIN golf_players gp2 ON gp2.user_id = ua.uid
  LEFT JOIN round_counts rc ON rc.player_id = gp2.id
  LEFT JOIN review_counts rv ON rv.player_id = gp2.id
  LEFT JOIN message_counts mc ON mc.sender_id = ua.uid;
END;
$$;

ALTER FUNCTION "public"."get_user_engagement_summary"("time_range_days" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_golf_organization_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  org_id uuid;
BEGIN
  SELECT gc.organization_id INTO org_id
  FROM golf_coaches gc
  WHERE gc.user_id = auth.uid()
  LIMIT 1;
  RETURN org_id;
END;
$$;

ALTER FUNCTION "public"."get_user_golf_organization_id"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_golf_team_ids"() RETURNS SETOF "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT gtm.team_id
  FROM golf_team_members gtm
  JOIN golf_players gp ON gp.id = gtm.player_id
  WHERE gp.user_id = auth.uid()
    AND gtm.status = 'active';
END;
$$;

ALTER FUNCTION "public"."get_user_golf_team_ids"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_user_last_active"() RETURNS TABLE("user_id" "uuid", "last_active_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    u.id AS user_id,
    GREATEST(
      -- Most recent session refresh (best indicator of app usage)
      (SELECT MAX(s.refreshed_at::timestamptz) FROM auth.sessions s WHERE s.user_id = u.id),
      -- Fallback to last sign-in
      u.last_sign_in_at
    ) AS last_active_at
  FROM auth.users u;
$$;

ALTER FUNCTION "public"."get_user_last_active"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."get_users_with_auth"() RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT (public.is_super_admin() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(json_agg(u), '[]'::json) INTO result
  FROM (
    SELECT
      pu.id,
      pu.email,
      pu.role,
      pu.created_at,
      pu.last_seen,
      au.last_sign_in_at,
      au.email_confirmed_at,
      au.created_at as auth_created_at
    FROM users pu
    LEFT JOIN auth.users au ON au.id = pu.id
    ORDER BY pu.created_at DESC
  ) u;

  RETURN result;
END;
$$;

ALTER FUNCTION "public"."get_users_with_auth"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."golf_announcement_addressed_to_me"("p_announcement_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.golf_announcement_recipients r
      WHERE r.announcement_id = p_announcement_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.golf_announcement_recipients r
      JOIN public.golf_players p ON p.id = r.player_id
      WHERE r.announcement_id = p_announcement_id
        AND p.user_id = (SELECT auth.uid())
    );
$$;

ALTER FUNCTION "public"."golf_announcement_addressed_to_me"("p_announcement_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_announcement_addressed_to_me"("p_announcement_id" "uuid") IS 'True when the announcement is all-team (no recipient rows) or addressed to the calling user. SECURITY DEFINER to break the golf_announcements <-> golf_announcement_recipients RLS cycle. Answers only about auth.uid().';

CREATE OR REPLACE FUNCTION "public"."golf_conversation_created_by_me"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.golf_conversations c
    WHERE c.id = p_conversation_id AND c.created_by = auth.uid()
  );
$$;

ALTER FUNCTION "public"."golf_conversation_created_by_me"("p_conversation_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_conversation_created_by_me"("p_conversation_id" "uuid") IS 'Did the CALLER create this conversation? Runs with definer rights because golf_conversations SELECT denies a brand-new row, which is exactly the moment DM creation needs this answer.';

CREATE OR REPLACE FUNCTION "public"."golf_conversation_has_me"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_conversation_participants p
    WHERE p.conversation_id = p_conversation_id
      AND p.user_id = (SELECT auth.uid())
  );
$$;

ALTER FUNCTION "public"."golf_conversation_has_me"("p_conversation_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_conversation_has_me"("p_conversation_id" "uuid") IS 'Is the CALLER a participant in this conversation? SECURITY DEFINER so it is not subject to golf_conversation_participants SELECT, which would make any policy built on it circular. Reads auth.uid() internally, so it answers for the caller and cannot be aimed at another user.';

CREATE OR REPLACE FUNCTION "public"."golf_conversation_has_other_participant"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
      from public.golf_conversation_participants p
     where p.conversation_id = p_conversation_id
       and p.user_id <> (select auth.uid())
  );
$$;

ALTER FUNCTION "public"."golf_conversation_has_other_participant"("p_conversation_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_conversation_has_other_participant"("p_conversation_id" "uuid") IS 'True when the conversation already holds a participant other than the current user. SECURITY DEFINER so the participant INSERT policy can ask about its own table without recursing. Reads only; grants no access.';

CREATE OR REPLACE FUNCTION "public"."golf_conversation_on_my_team"("p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_conversations c
    WHERE c.id = p_conversation_id
      AND c.team_id IS NOT NULL
      AND (public.is_golf_team_player(c.team_id) OR public.is_golf_team_coach(c.team_id))
  );
$$;

ALTER FUNCTION "public"."golf_conversation_on_my_team"("p_conversation_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_conversation_on_my_team"("p_conversation_id" "uuid") IS 'Does the CALLER belong to the team that owns this conversation? SECURITY DEFINER on purpose: it must not be subject to golf_conversations SELECT, or the DM-creation bootstrap in src/app/actions/messages.ts breaks. Reads auth.uid() through is_golf_team_player/is_golf_team_coach, so it answers for the caller, not the owner.';

CREATE OR REPLACE FUNCTION "public"."golf_courses_set_normalized_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.normalized_name := golf_normalize_name(NEW.name);
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."golf_courses_set_normalized_name"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."golf_event_documents_assert_same_team"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  event_team uuid;
  doc_team uuid;
BEGIN
  SELECT team_id INTO event_team FROM public.golf_events WHERE id = NEW.event_id;
  SELECT team_id INTO doc_team   FROM public.golf_documents WHERE id = NEW.document_id;
  IF event_team IS NULL THEN
    RAISE EXCEPTION 'event_id % does not exist', NEW.event_id;
  END IF;
  IF doc_team IS NULL THEN
    RAISE EXCEPTION 'document_id % does not exist', NEW.document_id;
  END IF;
  IF event_team <> doc_team THEN
    RAISE EXCEPTION 'document % and event % belong to different teams', NEW.document_id, NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."golf_event_documents_assert_same_team"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."golf_holes_recompute_round_totals_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_round uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_round := OLD.round_id;
  ELSE
    v_round := NEW.round_id;
  END IF;

  PERFORM public.recompute_golf_round_totals(v_round);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END
$$;

ALTER FUNCTION "public"."golf_holes_recompute_round_totals_fn"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."golf_holes_set_gir_fn"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.par IS NOT NULL AND NEW.score IS NOT NULL THEN
    NEW.gir := (NEW.par >= 3
                AND NEW.score > 0
                AND (NEW.score - COALESCE(NEW.putts, 0)) > 0
                AND (NEW.score - COALESCE(NEW.putts, 0)) <= (NEW.par - 2));
  END IF;
  RETURN NEW;
END
$$;

ALTER FUNCTION "public"."golf_holes_set_gir_fn"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."golf_join_team_with_code"("p_code" "text") RETURNS TABLE("team_id" "uuid", "team_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_uid       uuid := (SELECT auth.uid());
  v_player_id uuid;
  v_team      record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT gp.id INTO v_player_id
  FROM public.golf_players gp WHERE gp.user_id = v_uid LIMIT 1;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'no golf player profile for this account' USING ERRCODE = '42501';
  END IF;

  SELECT t.id, t.name INTO v_team
  FROM public.golf_teams t
  WHERE t.join_code IS NOT NULL
    AND upper(t.join_code) = upper(btrim(coalesce(p_code, '')))
    AND btrim(coalesce(p_code, '')) <> ''
  LIMIT 1;

  IF v_team.id IS NULL THEN
    RAISE EXCEPTION 'invalid join code' USING ERRCODE = '22023';
  END IF;

  -- No status filter: ANY membership of a DIFFERENT team blocks the join.
  IF EXISTS (
    SELECT 1 FROM public.golf_team_members m
    WHERE m.player_id = v_player_id AND m.team_id <> v_team.id
  ) THEN
    RAISE EXCEPTION 'already on another team' USING ERRCODE = '23505';
  END IF;

  -- Re-joining the team you are already on stays a no-op success, which the
  -- invite flow relies on: it runs the join twice by design.
  INSERT INTO public.golf_team_members (player_id, team_id, status)
  VALUES (v_player_id, v_team.id, 'active')
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_team.id, v_team.name;
END;
$$;

ALTER FUNCTION "public"."golf_join_team_with_code"("p_code" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_join_team_with_code"("p_code" "text") IS 'Joins the caller''s golf player to the team matching the supplied code, verified server-side (#1257).';

CREATE OR REPLACE FUNCTION "public"."golf_my_join_requests"() RETURNS TABLE("id" "uuid", "status" "text", "message" "text", "created_at" timestamp with time zone, "team_id" "uuid", "team_name" "text", "organization_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT r.id,
         r.status,
         r.message,
         r.created_at,
         r.team_id,
         t.name,
         o.name
  FROM   public.golf_team_join_requests r
  JOIN   public.golf_players p ON p.id = r.player_id
  LEFT   JOIN public.golf_teams t ON t.id = r.team_id
  LEFT   JOIN public.organizations o ON o.id = t.organization_id
  WHERE  p.user_id = auth.uid()
    AND  r.status = 'pending'
  ORDER  BY r.created_at DESC;
$$;

ALTER FUNCTION "public"."golf_my_join_requests"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_my_join_requests"() IS 'The CALLER''s own pending golf join requests, with team and organization names resolved. Runs with definer rights because a pending requester is not yet a member and so cannot read golf_teams under RLS. Scoped internally by golf_players.user_id = auth.uid() — it cannot answer for anyone else.';

CREATE OR REPLACE FUNCTION "public"."golf_normalize_name"("p" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      lower(btrim(coalesce(p, ''))),
      '(#|\mno\M\.?|\mnumber\M)', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ))
$$;

ALTER FUNCTION "public"."golf_normalize_name"("p" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_normalize_name"("p" "text") IS 'Normalizes a course/tee name for dedup (lower, trim, drop No./No/#/Number tokens, collapse spaces). Anchored on word boundaries so it cannot strip "No" out of words like "Northwood". IMMUTABLE.';

CREATE OR REPLACE FUNCTION "public"."golf_player_anonymize_on_unlink"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
    if old.user_id is not null and new.user_id is null then
        new.first_name := null;
        new.last_name := null;
        new.email := null;
        new.phone := null;
        new.avatar_url := null;
        new.hometown := null;
        new.state := null;
        new.high_school_name := null;
        new.graduation_year := null;
        new.gpa := null;
        new.anonymized_at := now();
    end if;
    return new;
end;
$$;

ALTER FUNCTION "public"."golf_player_anonymize_on_unlink"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."golf_recruit_documents_assert_same_team"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_recruit_team uuid;
begin
  select team_id into v_recruit_team from public.golf_recruits where id = new.recruit_id;
  if v_recruit_team is null then
    raise exception 'Recruit % not found', new.recruit_id;
  end if;
  if new.team_id is distinct from v_recruit_team then
    raise exception 'Document team_id (%) must match recruit team_id (%)', new.team_id, v_recruit_team;
  end if;
  return new;
end;
$$;

ALTER FUNCTION "public"."golf_recruit_documents_assert_same_team"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."golf_recruit_documents_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

ALTER FUNCTION "public"."golf_recruit_documents_touch_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."golf_team_by_join_code"("p_code" "text") RETURNS TABLE("id" "uuid", "name" "text", "season" "text", "organization_id" "uuid", "organization_name" "text", "organization_city" "text", "organization_state" "text", "organization_logo_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT t.id, t.name, t.season, t.organization_id,
         o.name, o.location_city, o.location_state, o.logo_url
  FROM public.golf_teams t
  LEFT JOIN public.organizations o ON o.id = t.organization_id
  WHERE t.join_code IS NOT NULL
    AND upper(t.join_code) = upper(btrim(coalesce(p_code, '')))
    AND btrim(coalesce(p_code, '')) <> ''
  LIMIT 1;
$$;

ALTER FUNCTION "public"."golf_team_by_join_code"("p_code" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."golf_team_by_join_code"("p_code" "text") IS 'Resolves exactly the team matching a supplied join code for /golf/join/[code]. Returns no join_code. Replaces the USING (join_code IS NOT NULL) policy (#1257).';

CREATE OR REPLACE FUNCTION "public"."guard_users_role_self_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() = OLD.id
     AND NEW.role IS DISTINCT FROM OLD.role
  THEN
    IF NEW.role NOT IN ('player'::user_role, 'coach'::user_role) THEN
      RAISE EXCEPTION 'role cannot be self-escalated to %', NEW.role;
    END IF;

    IF OLD.role = 'admin'::user_role AND public.is_super_admin() THEN
      RAISE EXCEPTION 'role cannot be self-demoted away from admin for an allowlisted super admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."guard_users_role_self_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  user_role_value user_role;
  user_email TEXT;
  user_sport TEXT;
  meta_first_name TEXT;
  meta_last_name TEXT;
BEGIN
  user_email := NEW.email;

  -- W0 P0: self-service signup may only mint 'player' or 'coach'.
  user_role_value := CASE NEW.raw_user_meta_data->>'role'
    WHEN 'coach'  THEN 'coach'::user_role
    WHEN 'player' THEN 'player'::user_role
    ELSE 'player'::user_role
  END;

  user_sport := NEW.raw_user_meta_data->>'sport';
  meta_first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  meta_last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');

  INSERT INTO public.users (
    id,
    email,
    role,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    user_email,
    user_role_value,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  IF user_sport = 'baseball' AND user_role_value = 'player'::user_role THEN
    BEGIN
      INSERT INTO public.baseball_players (
        user_id,
        player_type,
        first_name,
        last_name,
        email,
        recruiting_activated,
        onboarding_completed,
        profile_completion_percent
      ) VALUES (
        NEW.id,
        'high_school'::public.baseball_player_type,
        NULLIF(meta_first_name, ''),
        NULLIF(meta_last_name, ''),
        user_email,
        false,
        false,
        0
      )
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'handle_new_user: baseball_players seed failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_any_baseball_team_membership"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_team_members btm
    JOIN public.baseball_players bp ON bp.id = btm.player_id
    WHERE btm.team_id = p_team_id
      AND bp.user_id = auth.uid()
  );
$$;

ALTER FUNCTION "public"."has_any_baseball_team_membership"("p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."has_baseball_staff_capability"("p_team_id" "uuid", "p_capability" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row public.baseball_team_coach_staff%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.baseball_team_coach_staff s
  WHERE s.team_id = p_team_id
    AND s.coach_id = (
      SELECT id FROM public.baseball_coaches WHERE user_id = auth.uid() LIMIT 1
    )
    AND COALESCE(s.status, 'active') = 'active'
  LIMIT 1;

  IF NOT FOUND THEN RETURN false; END IF;
  IF COALESCE(v_row.is_head_coach, false) THEN RETURN true; END IF;

  RETURN CASE p_capability
    WHEN 'can_manage_roster'       THEN COALESCE(v_row.can_manage_roster,       false)
    WHEN 'can_manage_practice'     THEN COALESCE(v_row.can_manage_practice,     false)
    WHEN 'can_manage_lifting'      THEN COALESCE(v_row.can_manage_lifting,      false)
    WHEN 'can_view_academics'      THEN COALESCE(v_row.can_view_academics,      false)
    WHEN 'can_manage_imports'      THEN COALESCE(v_row.can_manage_imports,      false)
    WHEN 'can_manage_stats'        THEN COALESCE(v_row.can_manage_stats,        false)
    WHEN 'can_invite_staff'        THEN COALESCE(v_row.can_invite_staff,        false)
    WHEN 'can_manage_settings'     THEN COALESCE(v_row.can_manage_settings,     false)
    WHEN 'can_view_medical'        THEN COALESCE(v_row.can_view_medical,        false)
    WHEN 'can_message_team'        THEN COALESCE(v_row.can_message_team,        false)
    WHEN 'can_manage_calendar'     THEN COALESCE(v_row.can_manage_calendar,     false)
    WHEN 'can_manage_lineups'      THEN COALESCE(v_row.can_manage_lineups,      false)
    WHEN 'can_view_readiness'      THEN COALESCE(v_row.can_view_readiness,      false)
    WHEN 'can_modify_availability' THEN COALESCE(v_row.can_modify_availability, false)
    WHEN 'can_view_private_notes'  THEN COALESCE(v_row.can_view_private_notes,  false)
    WHEN 'can_message_players'     THEN COALESCE(v_row.can_message_players,     false)
    WHEN 'can_export_reports'      THEN COALESCE(v_row.can_export_reports,      false)
    ELSE false
  END;
END;
$$;

ALTER FUNCTION "public"."has_baseball_staff_capability"("p_team_id" "uuid", "p_capability" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."heartbeat"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE users SET last_seen = NOW() WHERE id = auth.uid();
END;
$$;

ALTER FUNCTION "public"."heartbeat"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_db_health_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_current jsonb;
  v_previous jsonb;
begin
  select jsonb_build_object(
    'sampled_at', clock_timestamp(),
    'stats_reset_at', d.stats_reset,
    'connections_total', (
      select count(*) from pg_stat_activity where datname = current_database()
    ),
    'connections_active', (
      select count(*) from pg_stat_activity
      where datname = current_database() and state = 'active' and pid <> pg_backend_pid()
    ),
    'connections_idle_in_tx', (
      select count(*) from pg_stat_activity
      where datname = current_database() and state = 'idle in transaction'
    ),
    'connections_waiting_lock', (
      select count(*) from pg_locks l
      join pg_stat_activity a on a.pid = l.pid
      where not l.granted and a.datname = current_database()
    ),
    'longest_active_ms', (
      select coalesce(max(extract(epoch from (clock_timestamp() - query_start)) * 1000)::integer, 0)
      from pg_stat_activity
      where datname = current_database() and state = 'active' and pid <> pg_backend_pid()
    ),
    'longest_idle_in_tx_ms', (
      select coalesce(max(extract(epoch from (clock_timestamp() - state_change)) * 1000)::integer, 0)
      from pg_stat_activity
      where datname = current_database() and state = 'idle in transaction'
    ),
    'longest_lock_wait_ms', (
      select coalesce(max(extract(epoch from (clock_timestamp() - a.query_start)) * 1000)::integer, 0)
      from pg_locks l
      join pg_stat_activity a on a.pid = l.pid
      where not l.granted and a.datname = current_database()
    ),
    'xact_commit', d.xact_commit,
    'xact_rollback', d.xact_rollback,
    'deadlocks', d.deadlocks,
    'conflicts', d.conflicts,
    'tup_returned', d.tup_returned,
    'tup_fetched', d.tup_fetched,
    'tup_inserted', d.tup_inserted,
    'tup_updated', d.tup_updated,
    'tup_deleted', d.tup_deleted,
    'temp_files', d.temp_files,
    'temp_bytes', d.temp_bytes,
    'blks_read', d.blks_read,
    'blks_hit', d.blks_hit,
    'db_size_bytes', pg_database_size(current_database()),
    'max_connections', (select setting::integer from pg_settings where name = 'max_connections')
  )
  into v_current
  from pg_stat_database d
  where d.datname = current_database();

  select to_jsonb(s) into v_previous
  from (
    select sampled_at, stats_reset_at, xact_commit, xact_rollback, deadlocks,
      conflicts, tup_returned, tup_fetched, tup_inserted, tup_updated,
      tup_deleted, temp_files, temp_bytes, blks_read, blks_hit
    from helm_debug.db_health_samples
    order by sampled_at desc
    limit 1
  ) s;

  return jsonb_build_object('current', v_current, 'previous', v_previous);
end;
$$;

ALTER FUNCTION "public"."helm_debug_db_health_snapshot"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_db_lock_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_rows
  from (
    select
      a.pid,
      case
        when a.usename in ('anon', 'authenticated', 'authenticator') then 'app'
        when a.usename = 'service_role' then 'service'
        else 'other'
      end as role_class,
      a.state,
      case
        when a.state = 'idle in transaction' then
          coalesce((extract(epoch from (clock_timestamp() - a.state_change)) * 1000)::integer, 0)
        else
          coalesce((extract(epoch from (clock_timestamp() - a.query_start)) * 1000)::integer, 0)
      end as duration_ms,
      a.wait_event_type,
      coalesce(array_length(pg_blocking_pids(a.pid), 1), 0) as blocked_pid_count,
      (coalesce(array_length(pg_blocking_pids(a.pid), 1), 0) > 0) as is_waiting_on_lock,
      case
        when a.query is null or a.query = '' then 'idle'
        when left(a.query, 200) = '<insufficient privilege>' then 'unknown_privilege'
        else trim(
          coalesce(lower((regexp_match(left(a.query, 200), '^\s*(\w+)'))[1]), 'unknown')
          || ' ' ||
          coalesce(
            lower((regexp_match(
              left(a.query, 200),
              '(?:from|into|update|join|call)\s+"?(?:public|helm_debug)?"?\.?"?([a-zA-Z_][a-zA-Z0-9_]{0,63})"?',
              'i'
            ))[1]),
            ''
          )
        )
      end as safe_query_class,
      (
        select bc.relname
        from pg_locks l
        join pg_class bc on bc.oid = l.relation
        where l.pid = a.pid and not l.granted
        order by l.relation
        limit 1
      ) as relation_name,
      (
        select case
          when ba.query is null or ba.query = '' then null
          when left(ba.query, 200) = '<insufficient privilege>' then 'unknown_privilege'
          else trim(
            coalesce(lower((regexp_match(left(ba.query, 200), '^\s*(\w+)'))[1]), 'unknown')
            || ' ' ||
            coalesce(
              lower((regexp_match(
                left(ba.query, 200),
                '(?:from|into|update|join|call)\s+"?(?:public|helm_debug)?"?\.?"?([a-zA-Z_][a-zA-Z0-9_]{0,63})"?',
                'i'
              ))[1]),
              ''
            )
          )
        end
        from unnest(pg_blocking_pids(a.pid)) as bp(pid)
        join pg_stat_activity ba on ba.pid = bp.pid
        order by bp.pid
        limit 1
      ) as blocking_query_class
    from pg_stat_activity a
    where a.datname = current_database()
      and a.pid <> pg_backend_pid()
      and (
        a.state in ('active', 'idle in transaction')
        or coalesce(array_length(pg_blocking_pids(a.pid), 1), 0) > 0
      )
    order by duration_ms desc
    limit 50
  ) t;

  return v_rows;
end;
$$;

ALTER FUNCTION "public"."helm_debug_db_lock_snapshot"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_db_table_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_current jsonb;
  v_prior jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_current
  from (
    select
      s.schemaname || '.' || s.relname as relation_name,
      coalesce(s.n_live_tup, 0) as n_live_tup,
      coalesce(s.n_dead_tup, 0) as n_dead_tup,
      s.last_autovacuum,
      s.last_autoanalyze,
      coalesce(s.seq_scan, 0) as seq_scan,
      coalesce(s.idx_scan, 0) as idx_scan,
      coalesce(s.n_tup_ins, 0) as n_tup_ins,
      coalesce(s.n_tup_upd, 0) as n_tup_upd,
      coalesce(s.n_tup_del, 0) as n_tup_del,
      pg_total_relation_size(s.relid) as total_bytes,
      pg_indexes_size(s.relid) as index_bytes
    from pg_stat_user_tables s
    where s.schemaname in ('public', 'helm_debug')
    order by pg_total_relation_size(s.relid) desc
    limit 40
  ) t;

  select coalesce(jsonb_object_agg(p.relation_name, to_jsonb(p) - 'relation_name' - 'sampled_at'), '{}'::jsonb)
  into v_prior
  from (
    select distinct on (relation_name)
      relation_name, sampled_at, n_dead_tup, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del
    from helm_debug.db_table_samples
    where relation_name in (select jsonb_array_elements(v_current) ->> 'relation_name')
    order by relation_name, sampled_at desc
  ) p;

  return jsonb_build_object('current', v_current, 'prior', v_prior);
end;
$$;

ALTER FUNCTION "public"."helm_debug_db_table_snapshot"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_finalize_trace"("p_trace_id" "uuid", "p_status" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug', 'helm_private'
    AS $$
declare
  v_metadata jsonb := helm_private.trace_safe_metadata(p_metadata);
  v_observed integer;
  v_observed_app integer;
  v_missing  integer;
  v_expected integer;
  v_status   text;
begin
  -- Truth about what was actually recorded, not what the caller believes.
  -- observed_step_count (below) counts every row, both layers -- the Bridge
  -- shows both. The blind check below counts a SEPARATE, narrower total:
  -- application-layer rows only, so a Postgres-layer checkpoint the RPC
  -- writes about its own execution can never mask a JS layer that recorded
  -- nothing.
  select count(*) into v_observed
  from helm_debug.trace_steps
  where trace_id = p_trace_id;

  select count(*) into v_observed_app
  from helm_debug.trace_steps
  where trace_id = p_trace_id
    and layer is distinct from 'postgres';

  select
    coalesce((v_metadata ->> 'missing_required_step_count')::integer, missing_required_step_count, 0),
    coalesce(expected_step_count, 0)
  into v_missing, v_expected
  from helm_debug.trace_runs
  where trace_id = p_trace_id;

  -- A run is blind if it is missing a required step, or the application
  -- layer recorded nothing at all against a workflow that expected
  -- something -- Postgres-layer rows do not count toward "recorded
  -- something" here, because they exist whether or not the JS layer ever
  -- ran.
  v_status := p_status;
  if p_status = 'success'
     and (coalesce(v_missing, 0) > 0 or (coalesce(v_expected, 0) > 0 and v_observed_app = 0)) then
    v_status := 'warning';
  end if;

  update helm_debug.trace_runs
  set status = v_status,
      finished_at = clock_timestamp(),
      duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer),
      observed_step_count = v_observed,
      missing_required_step_count = coalesce((v_metadata ->> 'missing_required_step_count')::integer, missing_required_step_count),
      failure_step = coalesce(nullif(v_metadata ->> 'failure_step', ''), failure_step),
      failure_code = coalesce(nullif(v_metadata ->> 'failure_code', ''), failure_code),
      failure_summary = coalesce(nullif(v_metadata ->> 'failure_summary', ''), failure_summary),
      metadata = metadata
        || v_metadata
        || case
             when v_status is distinct from p_status
               then jsonb_build_object(
                 'status_downgraded_from', p_status,
                 'status_downgraded_reason', 'required steps missing or no application-layer steps recorded')
             else '{}'::jsonb
           end,
      updated_at = clock_timestamp()
  where trace_id = p_trace_id;
end;
$$;

ALTER FUNCTION "public"."helm_debug_finalize_trace"("p_trace_id" "uuid", "p_status" "text", "p_metadata" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_get_trace"("p_trace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
  select coalesce((
    select jsonb_build_object(
      'run', to_jsonb(r),
      'steps', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.created_at, s.id)
        from helm_debug.trace_steps s
        where s.trace_id = r.trace_id
      ), '[]'::jsonb)
    )
    from helm_debug.trace_runs r
    where r.trace_id = p_trace_id
  ), '{}'::jsonb)
$$;

ALTER FUNCTION "public"."helm_debug_get_trace"("p_trace_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_list_traces"("p_limit" integer DEFAULT 50, "p_workflow" "text" DEFAULT NULL::"text", "p_round_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
  from (
    select trace_id, workflow, environment, status, started_at, finished_at,
      duration_ms, round_id, team_id, player_id, sentry_trace_id, root_span_id,
      expected_step_count, observed_step_count, missing_required_step_count,
      failure_step, failure_code, failure_summary
    from helm_debug.trace_runs
    where (p_workflow is null or workflow = p_workflow)
      and (p_round_id is null or round_id = p_round_id)
    order by started_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ) r
$$;

ALTER FUNCTION "public"."helm_debug_list_traces"("p_limit" integer, "p_workflow" "text", "p_round_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_prune"("p_retention_days" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_retention_days integer := greatest(1, least(coalesce(p_retention_days, 30), 3650));
  v_cutoff timestamptz := clock_timestamp() - make_interval(days => v_retention_days);
  v_deleted_steps bigint := 0;
  v_deleted_runs bigint := 0;
begin
  -- Child rows first (see FK-order note in the header comment above).
  -- DELETE and its WHERE stay on one line by convention in this repo (see
  -- this file's own guard-sql.sh: a DELETE whose WHERE clause is not on the
  -- same line is indistinguishable, to a line-based scanner, from a DELETE
  -- with no WHERE clause at all).
  with doomed_runs as (
    select trace_id from helm_debug.trace_runs where started_at < v_cutoff
  ),
  deleted_steps as (
    delete from helm_debug.trace_steps where trace_id in (select trace_id from doomed_runs)
    returning 1
  )
  select count(*) into v_deleted_steps from deleted_steps;

  with deleted_runs as (
    delete from helm_debug.trace_runs where started_at < v_cutoff
    returning 1
  )
  select count(*) into v_deleted_runs from deleted_runs;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'retention_days', v_retention_days,
    'deleted_trace_steps', v_deleted_steps,
    'deleted_trace_runs', v_deleted_runs
  );
end;
$$;

ALTER FUNCTION "public"."helm_debug_prune"("p_retention_days" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_prune_observability"("p_error_events_retention_days" integer DEFAULT 30, "p_health_samples_retention_days" integer DEFAULT 30, "p_stat_deltas_retention_days" integer DEFAULT 14, "p_prior_state_retention_days" integer DEFAULT 14) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_error_events_days integer := greatest(1, least(coalesce(p_error_events_retention_days, 30), 3650));
  v_health_days integer := greatest(1, least(coalesce(p_health_samples_retention_days, 30), 3650));
  v_stat_days integer := greatest(1, least(coalesce(p_stat_deltas_retention_days, 14), 3650));
  v_prior_days integer := greatest(1, least(coalesce(p_prior_state_retention_days, 14), 3650));
  -- Fixed internal constants (brief §44: locks 30d, table samples 30d) —
  -- NOT new parameters. See file header for why.
  v_lock_incidents_days constant integer := 30;
  v_table_samples_days constant integer := 30;
  v_deleted_error_events bigint := 0;
  v_deleted_health_samples bigint := 0;
  v_deleted_stat_deltas bigint := 0;
  v_deleted_prior_state bigint := 0;
  v_deleted_lock_incidents bigint := 0;
  v_deleted_table_samples bigint := 0;
begin
  with deleted as (
    delete from helm_debug.db_error_events
    where occurred_at < clock_timestamp() - make_interval(days => v_error_events_days)
    returning 1
  )
  select count(*) into v_deleted_error_events from deleted;

  with deleted as (
    delete from helm_debug.db_health_samples
    where sampled_at < clock_timestamp() - make_interval(days => v_health_days)
    returning 1
  )
  select count(*) into v_deleted_health_samples from deleted;

  with deleted as (
    delete from helm_debug.db_stat_deltas
    where sampled_at < clock_timestamp() - make_interval(days => v_stat_days)
    returning 1
  )
  select count(*) into v_deleted_stat_deltas from deleted;

  with deleted as (
    delete from helm_debug.db_stat_prior_state
    where last_seen_at < clock_timestamp() - make_interval(days => v_prior_days)
    returning 1
  )
  select count(*) into v_deleted_prior_state from deleted;

  with deleted as (
    delete from helm_debug.db_lock_incidents
    where detected_at < clock_timestamp() - make_interval(days => v_lock_incidents_days)
    returning 1
  )
  select count(*) into v_deleted_lock_incidents from deleted;

  with deleted as (
    delete from helm_debug.db_table_samples
    where sampled_at < clock_timestamp() - make_interval(days => v_table_samples_days)
    returning 1
  )
  select count(*) into v_deleted_table_samples from deleted;

  return jsonb_build_object(
    'cutoff_error_events', clock_timestamp() - make_interval(days => v_error_events_days),
    'cutoff_health_samples', clock_timestamp() - make_interval(days => v_health_days),
    'cutoff_stat_deltas', clock_timestamp() - make_interval(days => v_stat_days),
    'cutoff_prior_state', clock_timestamp() - make_interval(days => v_prior_days),
    'cutoff_lock_incidents', clock_timestamp() - make_interval(days => v_lock_incidents_days),
    'cutoff_table_samples', clock_timestamp() - make_interval(days => v_table_samples_days),
    'deleted_db_error_events', v_deleted_error_events,
    'deleted_db_health_samples', v_deleted_health_samples,
    'deleted_db_stat_deltas', v_deleted_stat_deltas,
    'deleted_db_stat_prior_state', v_deleted_prior_state,
    'deleted_db_lock_incidents', v_deleted_lock_incidents,
    'deleted_db_table_samples', v_deleted_table_samples
  );
end;
$$;

ALTER FUNCTION "public"."helm_debug_prune_observability"("p_error_events_retention_days" integer, "p_health_samples_retention_days" integer, "p_stat_deltas_retention_days" integer, "p_prior_state_retention_days" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_read_db_error_events"("p_limit" integer DEFAULT 100, "p_since" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_min_severity" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.last_seen_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_error_events
    where (p_since is null or last_seen_at >= p_since)
      and (
        p_min_severity is null
        or (p_min_severity = 'warning' and severity in ('warning', 'error', 'critical'))
        or (p_min_severity = 'error' and severity in ('error', 'critical'))
        or (p_min_severity = 'critical' and severity = 'critical')
        or p_min_severity = 'info'
      )
    order by last_seen_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) t
$$;

ALTER FUNCTION "public"."helm_debug_read_db_error_events"("p_limit" integer, "p_since" timestamp with time zone, "p_min_severity" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_read_db_health_history"("p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sampled_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_health_samples
    order by sampled_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) t
$$;

ALTER FUNCTION "public"."helm_debug_read_db_health_history"("p_limit" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_read_db_lock_incidents"("p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.detected_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_lock_incidents
    order by detected_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) t
$$;

ALTER FUNCTION "public"."helm_debug_read_db_lock_incidents"("p_limit" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_read_db_platform_history"("p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sampled_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_platform_samples
    order by sampled_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  ) t
$$;

ALTER FUNCTION "public"."helm_debug_read_db_platform_history"("p_limit" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_read_db_stat_deltas"("p_regression_lookback_hours" integer DEFAULT 24) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_latest_sampled_at timestamptz;
  v_latest jsonb;
  v_regressions jsonb;
begin
  select max(sampled_at) into v_latest_sampled_at from helm_debug.db_stat_deltas;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.total_exec_ms_delta desc nulls last), '[]'::jsonb)
  into v_latest
  from (
    select * from helm_debug.db_stat_deltas where sampled_at = v_latest_sampled_at
  ) t;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.sampled_at desc), '[]'::jsonb)
  into v_regressions
  from (
    select *
    from helm_debug.db_stat_deltas
    where regression_flags <> '{}'
      and sampled_at >= clock_timestamp() - make_interval(hours => greatest(1, least(coalesce(p_regression_lookback_hours, 24), 168)))
    order by sampled_at desc
    limit 100
  ) t;

  return jsonb_build_object(
    'latest_sampled_at', v_latest_sampled_at,
    'latest', v_latest,
    'recent_regressions', v_regressions
  );
end;
$$;

ALTER FUNCTION "public"."helm_debug_read_db_stat_deltas"("p_regression_lookback_hours" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_read_db_table_health"("p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.sampled_at desc), '[]'::jsonb)
  from (
    select *
    from helm_debug.db_table_samples
    order by sampled_at desc
    limit greatest(1, least(coalesce(p_limit, 200), 2000))
  ) t
$$;

ALTER FUNCTION "public"."helm_debug_read_db_table_health"("p_limit" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_read_jobs_health"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_cron jsonb;
  v_cron_capability text := 'available';
  v_net_queue_depth bigint;
  v_net_queue_capability text := 'available';
  v_net_responses jsonb;
  v_net_responses_capability text := 'available';
begin
  begin
    select coalesce(jsonb_agg(row_to_json(j)), '[]'::jsonb) into v_cron
    from (
      select
        j.jobid,
        j.jobname,
        j.schedule,
        j.active,
        (
          select coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
          from (
            select
              d.status,
              d.start_time,
              d.end_time,
              case
                when d.end_time is not null and d.start_time is not null
                  then (extract(epoch from (d.end_time - d.start_time)) * 1000)::integer
                else null
              end as duration_ms,
              left(coalesce(d.return_message, ''), 200) as return_message
            from cron.job_run_details d
            where d.jobid = j.jobid
            order by d.start_time desc
            limit 20
          ) r
        ) as recent_runs
      from cron.job j
      order by j.jobid
    ) j;
  exception
    when undefined_table or insufficient_privilege then
      v_cron := null;
      v_cron_capability := 'unavailable';
  end;

  begin
    select count(*) into v_net_queue_depth from net.http_request_queue;
  exception
    when undefined_table or insufficient_privilege then
      v_net_queue_depth := null;
      v_net_queue_capability := 'unavailable';
  end;

  begin
    select coalesce(jsonb_agg(row_to_json(s)), '[]'::jsonb) into v_net_responses
    from (
      select
        status_code,
        (error_msg is not null) as has_error,
        count(*) as response_count
      from net._http_response
      where created >= clock_timestamp() - interval '24 hours'
      group by status_code, (error_msg is not null)
    ) s;
  exception
    when undefined_table or insufficient_privilege then
      v_net_responses := null;
      v_net_responses_capability := 'unavailable';
  end;

  return jsonb_build_object(
    'cron', v_cron,
    'cron_capability', v_cron_capability,
    'net_queue_depth', v_net_queue_depth,
    'net_queue_capability', v_net_queue_capability,
    'net_responses_24h', v_net_responses,
    'net_responses_capability', v_net_responses_capability
  );
end;
$$;

ALTER FUNCTION "public"."helm_debug_read_jobs_health"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_read_observability_sizes"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  from (
    select 'db_error_events'::text as table_name,
      pg_total_relation_size('helm_debug.db_error_events'::regclass) as total_bytes,
      (select count(*) from helm_debug.db_error_events) as row_count,
      (select count(*) from helm_debug.db_error_events where occurred_at >= clock_timestamp() - interval '1 day') as rows_last_24h
    union all
    select 'db_health_samples',
      pg_total_relation_size('helm_debug.db_health_samples'::regclass),
      (select count(*) from helm_debug.db_health_samples),
      (select count(*) from helm_debug.db_health_samples where sampled_at >= clock_timestamp() - interval '1 day')
    union all
    select 'db_stat_deltas',
      pg_total_relation_size('helm_debug.db_stat_deltas'::regclass),
      (select count(*) from helm_debug.db_stat_deltas),
      (select count(*) from helm_debug.db_stat_deltas where sampled_at >= clock_timestamp() - interval '1 day')
    union all
    select 'db_stat_prior_state',
      pg_total_relation_size('helm_debug.db_stat_prior_state'::regclass),
      (select count(*) from helm_debug.db_stat_prior_state),
      (select count(*) from helm_debug.db_stat_prior_state where last_seen_at >= clock_timestamp() - interval '1 day')
    union all
    select 'db_lock_incidents',
      pg_total_relation_size('helm_debug.db_lock_incidents'::regclass),
      (select count(*) from helm_debug.db_lock_incidents),
      (select count(*) from helm_debug.db_lock_incidents where detected_at >= clock_timestamp() - interval '1 day')
    union all
    select 'db_table_samples',
      pg_total_relation_size('helm_debug.db_table_samples'::regclass),
      (select count(*) from helm_debug.db_table_samples),
      (select count(*) from helm_debug.db_table_samples where sampled_at >= clock_timestamp() - interval '1 day')
  ) t
$$;

ALTER FUNCTION "public"."helm_debug_read_observability_sizes"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_record_trace_step"("p_trace_id" "uuid", "p_step_key" "text", "p_layer" "text", "p_status" "text", "p_requiredness" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug', 'helm_private'
    AS $$
declare
  v_metadata jsonb := helm_private.trace_safe_metadata(p_metadata);
  v_finished_at timestamptz := case when p_status in ('success', 'failure', 'skipped', 'missing', 'warning') then clock_timestamp() else null end;
begin
  insert into helm_debug.trace_steps (
    trace_id, step_key, parent_step_key, layer, category, status, requiredness,
    started_at, finished_at, duration_ms, table_name, function_name, trigger_name,
    error_code, error_summary, expected, observed, metadata
  ) values (
    p_trace_id,
    p_step_key,
    nullif(v_metadata ->> 'parent_step_key', ''),
    p_layer,
    nullif(v_metadata ->> 'category', ''),
    p_status,
    p_requiredness,
    coalesce(nullif(v_metadata ->> 'started_at', '')::timestamptz, clock_timestamp()),
    v_finished_at,
    nullif(v_metadata ->> 'duration_ms', '')::integer,
    nullif(v_metadata ->> 'table_name', ''),
    nullif(v_metadata ->> 'function_name', ''),
    nullif(v_metadata ->> 'trigger_name', ''),
    nullif(v_metadata ->> 'error_code', ''),
    nullif(v_metadata ->> 'error_summary', ''),
    v_metadata -> 'expected',
    v_metadata -> 'observed',
    v_metadata
  )
  on conflict (trace_id, step_key) do update set
    parent_step_key = excluded.parent_step_key,
    layer = excluded.layer,
    category = excluded.category,
    status = excluded.status,
    requiredness = excluded.requiredness,
    finished_at = coalesce(excluded.finished_at, helm_debug.trace_steps.finished_at),
    duration_ms = coalesce(excluded.duration_ms, helm_debug.trace_steps.duration_ms),
    table_name = coalesce(excluded.table_name, helm_debug.trace_steps.table_name),
    function_name = coalesce(excluded.function_name, helm_debug.trace_steps.function_name),
    trigger_name = coalesce(excluded.trigger_name, helm_debug.trace_steps.trigger_name),
    error_code = coalesce(excluded.error_code, helm_debug.trace_steps.error_code),
    error_summary = coalesce(excluded.error_summary, helm_debug.trace_steps.error_summary),
    expected = coalesce(excluded.expected, helm_debug.trace_steps.expected),
    observed = coalesce(excluded.observed, helm_debug.trace_steps.observed),
    metadata = helm_debug.trace_steps.metadata || excluded.metadata,
    updated_at = clock_timestamp();

  update helm_debug.trace_runs
  set observed_step_count = (
        select count(*) from helm_debug.trace_steps where trace_id = p_trace_id
      ),
      updated_at = clock_timestamp()
  where trace_id = p_trace_id;
end;
$$;

ALTER FUNCTION "public"."helm_debug_record_trace_step"("p_trace_id" "uuid", "p_step_key" "text", "p_layer" "text", "p_status" "text", "p_requiredness" "text", "p_metadata" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_start_trace"("p_trace_id" "uuid", "p_workflow" "text", "p_environment" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug', 'helm_private'
    AS $$
declare
  v_metadata jsonb := helm_private.trace_safe_metadata(p_metadata);
begin
  if p_workflow !~ '^golf[.]' then
    raise exception using errcode = '22023', message = 'Flight recorder workflow must be a Golf workflow.';
  end if;

  insert into helm_debug.trace_runs (
    trace_id, workflow, environment, round_id, team_id, player_id,
    sentry_trace_id, root_span_id, expected_step_count, metadata
  ) values (
    p_trace_id,
    p_workflow,
    left(coalesce(nullif(p_environment, ''), 'unknown'), 64),
    nullif(v_metadata ->> 'round_id', '')::uuid,
    nullif(v_metadata ->> 'team_id', '')::uuid,
    nullif(v_metadata ->> 'player_id', '')::uuid,
    nullif(v_metadata ->> 'sentry_trace_id', ''),
    nullif(v_metadata ->> 'root_span_id', ''),
    coalesce((v_metadata ->> 'expected_step_count')::integer, 0),
    v_metadata
  )
  on conflict (trace_id) do update set
    workflow = excluded.workflow,
    environment = excluded.environment,
    metadata = helm_debug.trace_runs.metadata || excluded.metadata,
    updated_at = clock_timestamp();

  return p_trace_id;
end;
$$;

ALTER FUNCTION "public"."helm_debug_start_trace"("p_trace_id" "uuid", "p_workflow" "text", "p_environment" "text", "p_metadata" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_debug_stat_statements_snapshot"("p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'extensions', 'helm_debug'
    AS $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 50));
  v_stats_reset timestamptz;
  v_current jsonb;
  v_prior jsonb;
begin
  select stats_reset into v_stats_reset from pg_stat_statements_info;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_current
  from (
    select
      s.queryid::text as queryid,
      s.calls,
      s.total_exec_time as total_exec_ms,
      s.mean_exec_time as mean_exec_ms,
      s.max_exec_time as max_exec_ms,
      s.rows,
      s.shared_blks_hit,
      s.shared_blks_read,
      s.temp_blks_read,
      s.temp_blks_written,
      coalesce(s.wal_bytes, 0) as wal_bytes,
      case
        when left(s.query, 200) ilike '%wal->>%' then 'realtime_wal_decode'
        when left(s.query, 200) ilike '%pg_publication%' then 'realtime_catalog'
        when left(s.query, 200) ilike '%pgrst_source%' or left(s.query, 200) ilike '%pgrst_call%' then 'postgrest_query'
        when left(s.query, 200) ilike '%cron.job%' then 'pg_cron_internal'
        when left(s.query, 200) ilike '%net.http%' or left(s.query, 200) ilike '%net_http%' then 'pg_net_internal'
        when left(s.query, 200) ilike '%helm_debug%' or left(s.query, 200) ilike '%record_db_%' then 'helm_observability'
        else 'unclassified'
      end as safe_query_class,
      case
        when left(s.query, 200) ilike '%wal->>%' or left(s.query, 200) ilike '%pg_publication%' then 'supabase_realtime'
        when left(s.query, 200) ilike '%pgrst_source%' or left(s.query, 200) ilike '%pgrst_call%' then 'helm_product'
        when left(s.query, 200) ilike '%cron.job%' then 'pg_cron_job'
        when left(s.query, 200) ilike '%net.http%' or left(s.query, 200) ilike '%net_http%' then 'pg_net_job'
        when left(s.query, 200) ilike '%helm_debug%' or left(s.query, 200) ilike '%record_db_%' then 'observability'
        else 'unknown'
      end as source_class
    from pg_stat_statements s
    where s.dbid = (select oid from pg_database where datname = current_database())
    order by s.total_exec_time desc
    limit v_limit
  ) t;

  select coalesce(jsonb_object_agg(p.queryid, to_jsonb(p) - 'queryid'), '{}'::jsonb) into v_prior
  from helm_debug.db_stat_prior_state p
  where p.queryid in (select jsonb_array_elements(v_current) ->> 'queryid');

  return jsonb_build_object(
    'stats_reset_at', v_stats_reset,
    'current', v_current,
    'prior', v_prior
  );
end;
$$;

ALTER FUNCTION "public"."helm_debug_stat_statements_snapshot"("p_limit" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_accept_invite"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_invite  public.helm_lifting_coach_invites%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_email   text;
  v_coach_id uuid;
BEGIN
  -- Must be authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthenticated');
  END IF;

  -- Resolve the caller's email from public.users
  SELECT email INTO v_email
  FROM public.users
  WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('error', 'user_not_found');
  END IF;

  -- Re-validate the token: status=pending, not expired, email matches
  SELECT * INTO v_invite
  FROM public.helm_lifting_coach_invites
  WHERE token  = p_token
    AND status = 'pending'
    AND expires_at > now()
    AND lower(email) = lower(v_email);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_or_expired_invite');
  END IF;

  -- Stage-and-swap UPSERT for the coach profile
  INSERT INTO public.helm_lifting_coaches
    (user_id, organization_id, email, title, status, onboarding_completed)
  VALUES
    (v_user_id, v_invite.organization_id, v_email, v_invite.role_title, 'active', false)
  ON CONFLICT (user_id, organization_id)
  DO UPDATE SET
    status               = 'active',
    title                = COALESCE(EXCLUDED.title, helm_lifting_coaches.title),
    email                = COALESCE(EXCLUDED.email, helm_lifting_coaches.email),
    updated_at           = now()
  RETURNING id INTO v_coach_id;

  -- Flip the invite to accepted
  UPDATE public.helm_lifting_coach_invites
  SET status     = 'accepted',
      updated_at = now()
  WHERE id = v_invite.id;

  -- Downgrade every head-coach org viewer to can_edit=false (coach-active switch)
  -- This is a non-destructive UPDATE — viewer rows are preserved for SELECT access.
  UPDATE public.helm_lifting_org_viewers
  SET can_edit = false
  WHERE organization_id = v_invite.organization_id
    AND can_edit = true;

  RETURN jsonb_build_object(
    'ok',       true,
    'coach_id', v_coach_id,
    'org_id',   v_invite.organization_id
  );
END;
$$;

ALTER FUNCTION "public"."helm_lifting_accept_invite"("p_token" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_assign_team"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid", "p_team_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_coach_id uuid;
  v_assign_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Caller must be an active lifting coach for this org
  SELECT id INTO v_coach_id
  FROM public.helm_lifting_coaches
  WHERE user_id       = v_user_id
    AND organization_id = p_org
    AND status          = 'active';

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'not_a_lifting_coach_for_org';
  END IF;

  -- Upsert the assignment (stage-and-swap; reactivate if previously deactivated)
  INSERT INTO public.helm_lifting_coach_assignments
    (coach_id, organization_id, sport, team_id, team_name_snapshot, is_active, assigned_by_user_id)
  VALUES
    (v_coach_id, p_org, p_sport, p_team_id, p_team_name, true, v_user_id)
  ON CONFLICT (coach_id, sport, team_id)
  DO UPDATE SET
    is_active           = true,
    team_name_snapshot  = COALESCE(EXCLUDED.team_name_snapshot, helm_lifting_coach_assignments.team_name_snapshot),
    updated_at          = now()
  RETURNING id INTO v_assign_id;

  RETURN v_assign_id;
END;
$$;

ALTER FUNCTION "public"."helm_lifting_assign_team"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid", "p_team_name" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_can_edit_org"("p_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT (
    public.helm_lifting_coach_for_org(p_org)
    OR EXISTS (
      SELECT 1
      FROM public.helm_lifting_org_viewers v
      WHERE v.organization_id = p_org
        AND v.user_id         = auth.uid()
        AND v.can_edit        = true
    )
  );
$$;

ALTER FUNCTION "public"."helm_lifting_can_edit_org"("p_org" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_can_view_org"("p_org" "uuid", "p_sport" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT (
    public.helm_lifting_coach_for_org(p_org)
    OR EXISTS (
      SELECT 1
      FROM public.helm_lifting_org_viewers v
      WHERE v.organization_id = p_org
        AND v.user_id         = auth.uid()
        AND v.sport           = p_sport
    )
  );
$$;

ALTER FUNCTION "public"."helm_lifting_can_view_org"("p_org" "uuid", "p_sport" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_coach_for_org"("p_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.helm_lifting_coaches c
    WHERE c.organization_id = p_org
      AND c.user_id         = auth.uid()
      AND c.status          = 'active'
  );
$$;

ALTER FUNCTION "public"."helm_lifting_coach_for_org"("p_org" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_is_head_coach_viewer"("p_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT public.helm_lifting_can_edit_org(p_org);
$$;

ALTER FUNCTION "public"."helm_lifting_is_head_coach_viewer"("p_org" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_is_my_athlete"("p_athlete" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.helm_lifting_athletes a
    WHERE a.id      = p_athlete
      AND a.user_id = auth.uid()
  );
$$;

ALTER FUNCTION "public"."helm_lifting_is_my_athlete"("p_athlete" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_mark_athlete_onboarded"("p_athlete_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_onboarded_at timestamptz;
BEGIN
  IF p_athlete_id IS NULL OR NOT public.helm_lifting_is_my_athlete(p_athlete_id) THEN
    RETURN NULL;
  END IF;

  UPDATE public.helm_lifting_athletes
  SET onboarded_at = COALESCE(onboarded_at, now())
  WHERE id = p_athlete_id
  RETURNING onboarded_at INTO v_onboarded_at;

  RETURN v_onboarded_at;
END;
$$;

ALTER FUNCTION "public"."helm_lifting_mark_athlete_onboarded"("p_athlete_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."helm_lifting_sync_org_athletes"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count   integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT public.helm_lifting_can_edit_org(p_org) THEN
    RAISE EXCEPTION 'not_a_lifting_coach_for_org';
  END IF;

  IF p_sport = 'baseball' THEN
    INSERT INTO public.helm_lifting_athletes
      (organization_id, sport, sport_player_id, user_id, team_id, first_name, last_name, position, is_active)
    SELECT
      p_org,
      'baseball',
      bp.id,
      bp.user_id,
      p_team_id,
      bp.first_name,
      bp.last_name,
      bp.primary_position,
      true
    FROM public.baseball_players bp
    JOIN public.baseball_team_members btm ON btm.player_id = bp.id
    WHERE btm.team_id = p_team_id
    ON CONFLICT (organization_id, sport, sport_player_id) DO UPDATE SET
      -- Repair the account link once it exists; never blank one that does.
      user_id    = COALESCE(EXCLUDED.user_id, helm_lifting_athletes.user_id),
      -- Only fill an absent team; see the header for why this is not an
      -- overwrite.
      team_id    = COALESCE(helm_lifting_athletes.team_id, EXCLUDED.team_id),
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      position   = EXCLUDED.position,
      updated_at = now();
      -- is_active is ABSENT on purpose. See the header: including it would
      -- resurrect every cut player on every sync.

    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF p_sport = 'golf' THEN
    INSERT INTO public.helm_lifting_athletes
      (organization_id, sport, sport_player_id, user_id, team_id, first_name, last_name, position, is_active)
    SELECT
      p_org,
      'golf',
      gp.id,
      gp.user_id,
      p_team_id,
      gp.first_name,
      gp.last_name,
      NULL, -- golf_players has no primary_position equivalent
      true
    FROM public.golf_players gp
    JOIN public.golf_team_members gtm ON gtm.player_id = gp.id
    WHERE gtm.team_id = p_team_id
    ON CONFLICT (organization_id, sport, sport_player_id) DO UPDATE SET
      user_id    = COALESCE(EXCLUDED.user_id, helm_lifting_athletes.user_id),
      team_id    = COALESCE(helm_lifting_athletes.team_id, EXCLUDED.team_id),
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      updated_at = now();
      -- position is not refreshed for golf: the source has no equivalent
      -- column, so EXCLUDED.position is always NULL and writing it would blank
      -- anything a coach had set by hand.

    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSE
    RAISE EXCEPTION 'unsupported_sport: %', p_sport;
  END IF;

  RETURN v_count;
END;
$$;

ALTER FUNCTION "public"."helm_lifting_sync_org_athletes"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."helm_lifting_sync_org_athletes"("p_org" "uuid", "p_sport" "text", "p_team_id" "uuid") IS 'Seed/refresh helm_lifting_athletes for one (org, sport, team). Upserts identity fields — user_id (COALESCEd so a link is repaired but never blanked), names, position — so re-running Sync Athletes repairs an athlete seeded before their account was linked, which was previously permanent and locked them out of /lifting/dashboard forever. Deliberately does NOT touch is_active: including it would resurrect roster-deactivated players on every sync. Returns the number of rows inserted or updated.';

CREATE OR REPLACE FUNCTION "public"."hypopg_reset"() RETURNS "void"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT extensions.hypopg_reset();
$$;

ALTER FUNCTION "public"."hypopg_reset"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."ingest_external_round_atomic"("p_round" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '30s'
    SET "lock_timeout" TO '15s'
    AS $$
declare
  v_round_id      uuid;
  v_hole          jsonb;
  v_shot          jsonb;
  v_hole_id       uuid;
  v_hole_number   int;
  v_hole_id_map   jsonb := '{}'::jsonb;
  v_shots_inserted int := 0;
  v_holes_inserted int := 0;
begin
  if p_round is null or jsonb_typeof(p_round) <> 'object' then
    raise exception 'ingest_external_round_atomic: p_round must be a json object';
  end if;

  insert into golf_rounds (
    player_id, round_date, course_name, course_city, course_state,
    tees_played, total_score, total_putts, total_fairways, total_fairways_hit,
    total_gir, total_gir_possible, total_penalties, holes_played,
    weather_conditions, round_type, status, notes
  ) values (
    (p_round->>'player_id')::uuid,
    (p_round->>'round_date')::date,
    p_round->>'course_name',
    p_round->>'course_city',
    p_round->>'course_state',
    p_round->>'tees_played',
    nullif(p_round->>'total_score','')::int,
    nullif(p_round->>'total_putts','')::int,
    nullif(p_round->>'total_fairways','')::int,
    nullif(p_round->>'total_fairways_hit','')::int,
    nullif(p_round->>'total_gir','')::int,
    nullif(p_round->>'total_gir_possible','')::int,
    nullif(p_round->>'total_penalties','')::int,
    nullif(p_round->>'holes_played','')::int,
    p_round->>'weather_conditions',
    coalesce(p_round->>'round_type', 'practice'),
    coalesce(p_round->>'status', 'completed'),
    p_round->>'notes'
  )
  returning id into v_round_id;

  if p_holes is not null and jsonb_typeof(p_holes) = 'array' then
    for v_hole in select * from jsonb_array_elements(p_holes) loop
      insert into golf_holes (
        round_id, hole_number, par, yardage, score, putts, fairway_hit, gir
      ) values (
        v_round_id,
        (v_hole->>'hole_number')::int,
        nullif(v_hole->>'par','')::int,
        nullif(v_hole->>'yardage','')::int,
        nullif(v_hole->>'score','')::int,
        nullif(v_hole->>'putts','')::int,
        nullif(v_hole->>'fairway_hit','')::boolean,
        nullif(v_hole->>'gir','')::boolean
      )
      returning id, hole_number into v_hole_id, v_hole_number;
      v_hole_id_map := v_hole_id_map || jsonb_build_object(v_hole_number::text, v_hole_id);
      v_holes_inserted := v_holes_inserted + 1;
    end loop;
  end if;

  if p_shots is not null and jsonb_typeof(p_shots) = 'array' then
    for v_shot in select * from jsonb_array_elements(p_shots) loop
      v_hole_id := nullif(v_hole_id_map->>(v_shot->>'hole_number'), '')::uuid;
      insert into golf_shots (
        round_id, hole_id, hole_number, shot_number, club_type, shot_type,
        lie_before, result, shot_distance, distance_to_hole_before,
        distance_to_hole_after, is_penalty, penalty_type
      ) values (
        v_round_id,
        v_hole_id,
        (v_shot->>'hole_number')::int,
        nullif(v_shot->>'shot_number','')::int,
        v_shot->>'club_type',
        v_shot->>'shot_type',
        v_shot->>'lie_before',
        v_shot->>'result',
        nullif(v_shot->>'shot_distance','')::numeric,
        nullif(v_shot->>'distance_to_hole_before','')::numeric,
        nullif(v_shot->>'distance_to_hole_after','')::numeric,
        coalesce(nullif(v_shot->>'is_penalty','')::boolean, false),
        v_shot->>'penalty_type'
      );
      v_shots_inserted := v_shots_inserted + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'success', true,
    'round_id', v_round_id,
    'holes_inserted', v_holes_inserted,
    'shots_inserted', v_shots_inserted
  );
end;
$$;

ALTER FUNCTION "public"."ingest_external_round_atomic"("p_round" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_baseball_player_recruiting_discoverable"("p_player_id" "uuid", "p_player_type" "public"."baseball_player_type", "p_activated" boolean) RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_coach_id    uuid := public.get_my_coach_id();
  v_coach_type  public.baseball_coach_type;
  v_player_type public.baseball_player_type := p_player_type;
  v_activated   boolean := p_activated;
BEGIN
  IF v_coach_id IS NULL OR p_player_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT coach_type INTO v_coach_type
    FROM public.baseball_coaches
   WHERE id = v_coach_id;

  IF v_coach_type IS NULL OR v_coach_type NOT IN ('college', 'juco') THEN
    RETURN false;
  END IF;

  IF v_activated IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF v_player_type = 'college'::public.baseball_player_type THEN
    RETURN false;
  END IF;

  IF v_coach_type = 'juco' AND v_player_type = 'juco'::public.baseball_player_type THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.baseball_player_settings s
     WHERE s.player_id = p_player_id
       AND s.profile_visibility = 'private'
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.baseball_team_members btm
    JOIN public.baseball_teams bt ON bt.id = btm.team_id
    JOIN public.organizations o ON o.id = bt.organization_id
    WHERE btm.player_id = p_player_id
      AND o.type IN ('high_school', 'showcase', 'juco')
  );
END;
$$;

ALTER FUNCTION "public"."is_baseball_player_recruiting_discoverable"("p_player_id" "uuid", "p_player_type" "public"."baseball_player_type", "p_activated" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_baseball_primary_coach"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.baseball_team_coach_staff s
    WHERE s.team_id = p_team_id
      AND s.coach_id = (
        SELECT id FROM public.baseball_coaches WHERE user_id = auth.uid() LIMIT 1
      )
      AND COALESCE(s.is_primary, false) = true
  );
$$;

ALTER FUNCTION "public"."is_baseball_primary_coach"("p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_baseball_team_coach"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff tcs
    WHERE tcs.team_id = team_uuid
    AND tcs.coach_id = get_my_coach_id()
    AND COALESCE(tcs.status, 'active') = 'active'
  );
$$;

ALTER FUNCTION "public"."is_baseball_team_coach"("team_uuid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_baseball_team_coach_v2"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_coach_staff
    WHERE team_id = p_team_id
      AND coach_id = (SELECT id FROM baseball_coaches WHERE user_id = auth.uid() LIMIT 1)
      AND COALESCE(status, 'active') = 'active'
  );
$$;

ALTER FUNCTION "public"."is_baseball_team_coach_v2"("p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_baseball_team_member"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.baseball_team_members btm
    JOIN public.baseball_players bp ON bp.id = btm.player_id
    WHERE btm.team_id = team_uuid
      AND bp.user_id = auth.uid()
      AND btm.status = 'active'
  );
END;
$$;

ALTER FUNCTION "public"."is_baseball_team_member"("team_uuid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_baseball_team_member_v2"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM baseball_team_members
    WHERE team_id = p_team_id
      AND player_id = (SELECT id FROM baseball_players WHERE user_id = auth.uid() LIMIT 1)
  );
$$;

ALTER FUNCTION "public"."is_baseball_team_member_v2"("p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_baseball_team_player"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM baseball_team_members btm
    JOIN baseball_players bp ON bp.id = btm.player_id
    WHERE btm.team_id = team_uuid
    AND bp.user_id = auth.uid()
    AND btm.status = 'active'
  );
END;
$$;

ALTER FUNCTION "public"."is_baseball_team_player"("team_uuid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_baseball_team_staff"("p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.baseball_team_coach_staff tcs
    WHERE tcs.team_id = p_team_id
      AND tcs.coach_id = public.get_my_coach_id()
      AND COALESCE(tcs.status, 'active') NOT IN ('suspended', 'removed', 'invited')
  );
$$;

ALTER FUNCTION "public"."is_baseball_team_staff"("p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_golf_coach"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.golf_coaches gc
    WHERE gc.user_id = auth.uid()
  );
END;
$$;

ALTER FUNCTION "public"."is_golf_coach"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_golf_coach"() IS 'True when the current auth.uid() has a golf_coaches row (any team/org) — the Course Library coach-open/player-blocked write gate (Decision-1 option A). Not team-scoped; see is_golf_team_coach(team_uuid) for team-scoped checks.';

CREATE OR REPLACE FUNCTION "public"."is_golf_team_coach"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
    AND gc.user_id = auth.uid()
  );
END;
$$;

ALTER FUNCTION "public"."is_golf_team_coach"("team_uuid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_golf_team_head_coach"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = auth.uid()
      AND gtcs.role = 'head_coach'
  );
END;
$$;

ALTER FUNCTION "public"."is_golf_team_head_coach"("team_uuid" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_golf_team_head_coach"("team_uuid" "uuid") IS 'True if the current user is a head_coach (any is_primary) on the specified team. Use for team-management policies so a program head can manage BOTH of their teams. SECURITY DEFINER avoids RLS recursion.';

CREATE OR REPLACE FUNCTION "public"."is_golf_team_player"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM golf_team_members gtm
    JOIN golf_players gp ON gp.id = gtm.player_id
    WHERE gtm.team_id = team_uuid
    AND gp.user_id = auth.uid()
    AND gtm.status = 'active'
  );
END;
$$;

ALTER FUNCTION "public"."is_golf_team_player"("team_uuid" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."is_golf_team_primary_coach"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = team_uuid
      AND gc.user_id = auth.uid()
      AND gtcs.is_primary = TRUE
  );
END;
$$;

ALTER FUNCTION "public"."is_golf_team_primary_coach"("team_uuid" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_golf_team_primary_coach"("team_uuid" "uuid") IS 'Check if current user is a PRIMARY coach on the specified team. SECURITY DEFINER avoids RLS recursion.';

CREATE OR REPLACE FUNCTION "public"."is_in_team"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN public.is_team_coach(team_uuid) OR public.is_team_player(team_uuid);
END;
$$;

ALTER FUNCTION "public"."is_in_team"("team_uuid" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_in_team"("team_uuid" "uuid") IS 'v3 RLS helper: either-or convenience. True if the current user is a coach OR an active player on the given team. Use for team-scoped shared-read policies (Pattern 3 in docs/v3-rls-template.md).';

CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_allowlist WHERE user_id = auth.uid()
  );
$$;

ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_super_admin"() IS 'Helm Bridge gate: true iff auth.uid() is in admin_allowlist. SECURITY DEFINER so RLS policies and internally-gated RPCs can consult the (RLS-locked) allowlist. auth.uid() is NULL under service_role, so this returns false for service-role callers by design.';

CREATE OR REPLACE FUNCTION "public"."is_team_coach"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_coach_staff s
    JOIN golf_coaches c ON c.id = s.coach_id
    WHERE s.team_id = team_uuid
      AND c.user_id = auth.uid()
  );
END;
$$;

ALTER FUNCTION "public"."is_team_coach"("team_uuid" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_team_coach"("team_uuid" "uuid") IS 'v3 RLS helper: true if the current user is on the given team''s coaching staff (any role). Broader than is_golf_team_primary_coach, which restricts to primary only.';

CREATE OR REPLACE FUNCTION "public"."is_team_player"("team_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM golf_team_members m
    JOIN golf_players p ON p.id = m.player_id
    WHERE m.team_id = team_uuid
      AND p.user_id = auth.uid()
      AND m.status = 'active'::team_member_status
  );
END;
$$;

ALTER FUNCTION "public"."is_team_player"("team_uuid" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."is_team_player"("team_uuid" "uuid") IS 'v3 RLS helper: true if the current user is an ACTIVE player on the given team. Players with status (pending|inactive|removed) return false.';

CREATE OR REPLACE FUNCTION "public"."is_user_on_team"("p_user_id" "uuid", "p_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff tcs
    JOIN public.golf_coaches c ON c.id = tcs.coach_id
    WHERE tcs.team_id = p_team_id
      AND c.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.golf_team_members tm
    JOIN public.golf_players p ON p.id = tm.player_id
    WHERE tm.team_id = p_team_id
      AND p.user_id = p_user_id
      AND tm.status = 'active'
  );
$$;

ALTER FUNCTION "public"."is_user_on_team"("p_user_id" "uuid", "p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."log_crm_stage_transition"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO crm_stage_transitions (coach_id, from_status, to_status, changed_by, source)
    VALUES (NEW.id, OLD.status::text, NEW.status::text, auth.uid(), 'app');
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."log_crm_stage_transition"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."log_review_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO golf_review_events (review_id, player_id, actor_id, event_type, event_data)
    VALUES (
      NEW.id,
      NEW.player_id,
      NEW.published_by,
      CASE NEW.status
        WHEN 'published' THEN 'coach_published'
        ELSE 'review_generated'
      END,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."log_review_status_change"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."mark_golf_messages_read"("p_conversation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_conversation_ids(v_uid) AS conv_id
    WHERE conv_id = p_conversation_id
  ) THEN
    RETURN;
  END IF;

  UPDATE golf_messages
  SET read = true
  WHERE conversation_id = p_conversation_id
    AND sender_id != v_uid
    AND read = false;
END;
$$;

ALTER FUNCTION "public"."mark_golf_messages_read"("p_conversation_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."mark_player_stats_stale"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE golf_player_stats_cache
  SET
    is_stale = TRUE,
    updated_at = NOW()
  WHERE player_id = p_player_id;
END;
$$;

ALTER FUNCTION "public"."mark_player_stats_stale"("p_player_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."mark_player_stats_stale"("p_player_id" "uuid") IS 'Marks a players stats cache as stale, indicating a refresh is needed';

CREATE OR REPLACE FUNCTION "public"."mark_task_reminder_sent"("p_task_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE golf_tasks
  SET reminder_sent = true
  WHERE id = p_task_id;

  RETURN FOUND;
END;
$$;

ALTER FUNCTION "public"."mark_task_reminder_sent"("p_task_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."owns_golf_shot"("p_shot_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.golf_shots gs
    JOIN public.golf_holes gh   ON gh.id = gs.hole_id
    JOIN public.golf_rounds gr  ON gr.id = gh.round_id
    JOIN public.golf_players gp ON gp.id = gr.player_id
    WHERE gs.id = p_shot_id
      AND gp.user_id = (SELECT auth.uid())
  );
$$;

ALTER FUNCTION "public"."owns_golf_shot"("p_shot_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."owns_golf_shot"("p_shot_id" "uuid") IS 'RLS helper for putt_details / approach_miss_details INSERT/UPDATE/DELETE. True when the caller is the player whose round the shot belongs to — the same predicate the old uncorrelated *_own policies expressed, correlated on shot_id so logging a round does not scan golf_shots.';

CREATE OR REPLACE FUNCTION "public"."prevent_golf_qualifier_round_cap_regression"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE recorded_max_round integer;
BEGIN
  IF NEW.num_rounds IS NULL OR NEW.num_rounds < 1 OR NEW.num_rounds > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Qualifier round count must be between 1 and 50.';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.num_rounds < OLD.num_rounds THEN
    SELECT coalesce(max(qualifier_round_number), 0) INTO recorded_max_round
    FROM public.golf_rounds
    WHERE qualifier_id = NEW.id AND qualifier_round_number IS NOT NULL AND status IN ('in_progress', 'completed');
    IF recorded_max_round > NEW.num_rounds THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'Qualifier round count cannot be reduced below a recorded round.',
        DETAIL = format('Round %s is already recorded for this qualifier.', recorded_max_round);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."prevent_golf_qualifier_round_cap_regression"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."prune_stale_player_standing"("p_team_ids" "uuid"[], "p_cutoff" timestamp with time zone) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted bigint;
  v_orphans bigint;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL OR p_cutoff IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.golf_player_standing s
  WHERE s.computed_at < p_cutoff
    AND EXISTS (
      SELECT 1 FROM public.golf_team_members tm
      WHERE tm.player_id = s.player_id
        AND tm.status = 'active'::team_member_status
        AND tm.team_id = ANY (p_team_ids)
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  DELETE FROM public.golf_player_standing s
  WHERE s.computed_at < p_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.golf_team_members tm
      WHERE tm.player_id = s.player_id
        AND tm.status = 'active'::team_member_status
    );
  GET DIAGNOSTICS v_orphans = ROW_COUNT;

  RETURN v_deleted + v_orphans;
END;
$$;

ALTER FUNCTION "public"."prune_stale_player_standing"("p_team_ids" "uuid"[], "p_cutoff" timestamp with time zone) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recalculate_baseball_season_stats"("p_player_id" "uuid", "p_team_id" "uuid", "p_season_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_g integer := 0; v_ab integer := 0; v_r integer := 0; v_h integer := 0;
  v_doubles integer := 0; v_triples integer := 0; v_hr integer := 0; v_rbi integer := 0;
  v_bb integer := 0; v_k integer := 0; v_sb integer := 0; v_cs integer := 0;
  v_hbp integer := 0; v_sac integer := 0; v_sf integer := 0;
  v_ibb integer := 0; v_gidp integer := 0; v_roe integer := 0;
  v_two_out_rbi integer := 0; v_lob integer := 0;
  v_avg numeric(5,3); v_obp numeric(5,3); v_slg numeric(5,3); v_ops numeric(5,3);
  v_g_p integer := 0; v_w integer := 0; v_l integer := 0; v_sv integer := 0;
  v_ip numeric(6,1) := 0; v_h_allowed integer := 0; v_r_allowed integer := 0; v_er integer := 0;
  v_bb_allowed integer := 0; v_k_thrown integer := 0; v_hr_allowed integer := 0;
  v_gf integer := 0; v_holds integer := 0; v_blown integer := 0;
  v_bf integer := 0; v_p_hbp integer := 0; v_wp integer := 0;
  v_era numeric(5,2); v_whip numeric(5,3); v_k9 numeric(5,2); v_bb9 numeric(5,2);
  v_singles integer; v_pa integer;
BEGIN
  -- Body-level guard (preserved from 20260528000000): caller must be a coach of
  -- the target team; service_role bypasses for cron/import paths.
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_baseball_team_coach_v2(p_team_id)
  THEN
    RAISE EXCEPTION 'forbidden: caller is not a coach of team %', p_team_id
      USING ERRCODE = '42501';
  END IF;

  -- ---- Batting aggregation (completed games — scope unchanged) ----
  SELECT
    COUNT(DISTINCT bsb.game_id)::integer,
    COALESCE(SUM(bsb.ab), 0)::integer,
    COALESCE(SUM(bsb.r), 0)::integer,
    COALESCE(SUM(bsb.h), 0)::integer,
    COALESCE(SUM(bsb.doubles), 0)::integer,
    COALESCE(SUM(bsb.triples), 0)::integer,
    COALESCE(SUM(bsb.hr), 0)::integer,
    COALESCE(SUM(bsb.rbi), 0)::integer,
    COALESCE(SUM(bsb.bb), 0)::integer,
    COALESCE(SUM(bsb.k), 0)::integer,
    COALESCE(SUM(bsb.sb), 0)::integer,
    COALESCE(SUM(bsb.cs), 0)::integer,
    COALESCE(SUM(bsb.hbp), 0)::integer,
    COALESCE(SUM(bsb.sac), 0)::integer,
    COALESCE(SUM(bsb.sf), 0)::integer,
    COALESCE(SUM(bsb.ibb), 0)::integer,
    COALESCE(SUM(bsb.gidp), 0)::integer,
    COALESCE(SUM(bsb.roe), 0)::integer,
    COALESCE(SUM(bsb.two_out_rbi), 0)::integer,
    COALESCE(SUM(bsb.lob), 0)::integer
  INTO
    v_g, v_ab, v_r, v_h, v_doubles, v_triples, v_hr, v_rbi,
    v_bb, v_k, v_sb, v_cs, v_hbp, v_sac, v_sf,
    v_ibb, v_gidp, v_roe, v_two_out_rbi, v_lob
  FROM baseball_box_score_batting bsb
  JOIN baseball_games g ON g.id = bsb.game_id
  WHERE bsb.player_id = p_player_id
    AND bsb.team_id = p_team_id
    AND g.status = 'completed'
    AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year;

  IF v_ab > 0 THEN
    v_avg := ROUND(v_h::numeric / v_ab, 3);
    v_singles := v_h - v_doubles - v_triples - v_hr;
    v_slg := ROUND((v_singles + 2 * v_doubles + 3 * v_triples + 4 * v_hr)::numeric / v_ab, 3);
  END IF;

  v_pa := v_ab + v_bb + v_hbp + v_sf;
  IF v_pa > 0 THEN
    v_obp := ROUND((v_h + v_bb + v_hbp)::numeric / v_pa, 3);
  END IF;
  IF v_obp IS NOT NULL AND v_slg IS NOT NULL THEN
    v_ops := ROUND(v_obp + v_slg, 3);
  END IF;

  -- ---- Pitching aggregation (scope unchanged) ----
  SELECT
    COUNT(DISTINCT bsp.game_id)::integer,
    COUNT(CASE WHEN bsp.result = 'W' THEN 1 END)::integer,
    COUNT(CASE WHEN bsp.result = 'L' THEN 1 END)::integer,
    COUNT(CASE WHEN bsp.result = 'S' THEN 1 END)::integer,
    COALESCE(SUM(bsp.ip), 0),
    COALESCE(SUM(bsp.h), 0)::integer,
    COALESCE(SUM(bsp.r), 0)::integer,
    COALESCE(SUM(bsp.er), 0)::integer,
    COALESCE(SUM(bsp.bb), 0)::integer,
    COALESCE(SUM(bsp.k), 0)::integer,
    COALESCE(SUM(bsp.hr), 0)::integer,
    COALESCE(SUM(bsp.gf), 0)::integer,
    COUNT(CASE WHEN bsp.result = 'H' THEN 1 END)::integer + COALESCE(SUM(bsp.holds), 0)::integer,
    COUNT(CASE WHEN bsp.result = 'BS' THEN 1 END)::integer + COALESCE(SUM(bsp.blown_saves), 0)::integer,
    COALESCE(SUM(bsp.bf), 0)::integer,
    COALESCE(SUM(bsp.hbp), 0)::integer,
    COALESCE(SUM(bsp.wp), 0)::integer
  INTO
    v_g_p, v_w, v_l, v_sv, v_ip, v_h_allowed, v_r_allowed, v_er,
    v_bb_allowed, v_k_thrown, v_hr_allowed,
    v_gf, v_holds, v_blown, v_bf, v_p_hbp, v_wp
  FROM baseball_box_score_pitching bsp
  JOIN baseball_games g ON g.id = bsp.game_id
  WHERE bsp.player_id = p_player_id
    AND bsp.team_id = p_team_id
    AND g.status = 'completed'
    AND EXTRACT(YEAR FROM g.game_date)::integer = p_season_year;

  IF v_ip > 0 THEN
    v_era := ROUND(9.0 * v_er / v_ip, 2);
    v_whip := ROUND((v_bb_allowed + v_h_allowed)::numeric / v_ip, 3);
    v_k9 := ROUND(9.0 * v_k_thrown / v_ip, 2);
    v_bb9 := ROUND(9.0 * v_bb_allowed / v_ip, 2);
  END IF;

  INSERT INTO baseball_player_season_stats (
    player_id, team_id, season_year,
    g, ab, r, h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf,
    ibb, gidp, roe, two_out_rbi, lob,
    avg, obp, slg, ops,
    g_p, gs, w, l, sv, ip, h_allowed, r_allowed, er, bb_allowed, k_thrown, hr_allowed,
    gf, holds, blown_saves, bf, p_hbp, wp,
    era, whip, k9, bb9,
    last_updated
  )
  VALUES (
    p_player_id, p_team_id, p_season_year,
    v_g, v_ab, v_r, v_h, v_doubles, v_triples, v_hr, v_rbi, v_bb, v_k, v_sb, v_cs, v_hbp, v_sac, v_sf,
    v_ibb, v_gidp, v_roe, v_two_out_rbi, v_lob,
    v_avg, v_obp, v_slg, v_ops,
    v_g_p, 0, v_w, v_l, v_sv, v_ip, v_h_allowed, v_r_allowed, v_er, v_bb_allowed, v_k_thrown, v_hr_allowed,
    v_gf, v_holds, v_blown, v_bf, v_p_hbp, v_wp,
    v_era, v_whip, v_k9, v_bb9,
    now()
  )
  ON CONFLICT (player_id, team_id, season_year)
  DO UPDATE SET
    g = EXCLUDED.g, ab = EXCLUDED.ab, r = EXCLUDED.r, h = EXCLUDED.h,
    doubles = EXCLUDED.doubles, triples = EXCLUDED.triples, hr = EXCLUDED.hr,
    rbi = EXCLUDED.rbi, bb = EXCLUDED.bb, k = EXCLUDED.k, sb = EXCLUDED.sb,
    cs = EXCLUDED.cs, hbp = EXCLUDED.hbp, sac = EXCLUDED.sac, sf = EXCLUDED.sf,
    ibb = EXCLUDED.ibb, gidp = EXCLUDED.gidp, roe = EXCLUDED.roe,
    two_out_rbi = EXCLUDED.two_out_rbi, lob = EXCLUDED.lob,
    avg = EXCLUDED.avg, obp = EXCLUDED.obp, slg = EXCLUDED.slg, ops = EXCLUDED.ops,
    g_p = EXCLUDED.g_p, w = EXCLUDED.w, l = EXCLUDED.l, sv = EXCLUDED.sv,
    ip = EXCLUDED.ip, h_allowed = EXCLUDED.h_allowed, r_allowed = EXCLUDED.r_allowed,
    er = EXCLUDED.er, bb_allowed = EXCLUDED.bb_allowed, k_thrown = EXCLUDED.k_thrown,
    hr_allowed = EXCLUDED.hr_allowed,
    gf = EXCLUDED.gf, holds = EXCLUDED.holds, blown_saves = EXCLUDED.blown_saves,
    bf = EXCLUDED.bf, p_hbp = EXCLUDED.p_hbp, wp = EXCLUDED.wp,
    era = EXCLUDED.era, whip = EXCLUDED.whip, k9 = EXCLUDED.k9, bb9 = EXCLUDED.bb9,
    last_updated = now();
END;
$$;

ALTER FUNCTION "public"."recalculate_baseball_season_stats"("p_player_id" "uuid", "p_team_id" "uuid", "p_season_year" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recalculate_round_strokes_gained"("p_round_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_player_id UUID; v_shot_count INTEGER;
  v_sg_off_tee NUMERIC := 0; v_sg_approach NUMERIC := 0; v_sg_around NUMERIC := 0;
  v_sg_putting NUMERIC := 0; v_sg_total NUMERIC := 0;
  v_scale NUMERIC := 1.0;
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'stats_cache', true);
  SELECT player_id INTO v_player_id FROM golf_rounds WHERE id = p_round_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_scale := sg_scale_for_player(v_player_id);

  SELECT COUNT(*) INTO v_shot_count FROM golf_shots gs
  WHERE gs.round_id = p_round_id AND gs.shot_type IS NOT NULL AND gs.lie_before IS NOT NULL
    AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before > 0
    AND (gs.distance_to_hole_after IS NOT NULL OR gs.putt_made = TRUE OR gs.result IN ('holed','hole'));
  IF v_shot_count > 0 THEN
    WITH normalized AS (
      SELECT gs.shot_type, gs.shot_number, gh.par,
        CASE WHEN gs.shot_type='putting' THEN 'green' ELSE sg_normalize_lie(gs.lie_before) END AS lie_before_norm,
        CASE WHEN gs.distance_unit_before='feet' THEN gs.distance_to_hole_before/3.0 ELSE gs.distance_to_hole_before END AS dist_before_yards,
        (gs.putt_made=TRUE OR gs.result IN ('holed','hole')) AS is_holed,
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 0
          WHEN gs.distance_to_hole_after IS NOT NULL THEN
            CASE WHEN gs.distance_unit_after='feet' THEN gs.distance_to_hole_after/3.0 ELSE gs.distance_to_hole_after END
          ELSE CASE WHEN LEAD(gs.distance_unit_before) OVER w='feet'
            THEN COALESCE(LEAD(gs.distance_to_hole_before) OVER w,0)/3.0
            ELSE COALESCE(LEAD(gs.distance_to_hole_before) OVER w,0) END END AS dist_after_yards,
        CASE WHEN gs.putt_made=TRUE OR gs.result IN ('holed','hole') THEN 'green'
          WHEN gs.lie_after IS NOT NULL THEN sg_normalize_lie(gs.lie_after)
          ELSE sg_normalize_lie(LEAD(gs.lie_before) OVER w) END AS lie_after_norm,
        COALESCE(gs.is_penalty,FALSE) AS is_penalty
      FROM golf_shots gs JOIN golf_holes gh ON gh.id=gs.hole_id
      WHERE gs.round_id=p_round_id AND gs.shot_type IS NOT NULL
        AND gs.distance_to_hole_before IS NOT NULL AND gs.distance_to_hole_before>0
      WINDOW w AS (PARTITION BY gs.hole_id ORDER BY gs.shot_number)
    ),
    categorized AS (
      SELECT CASE
               WHEN is_penalty THEN
                 CASE WHEN lie_before_norm='tee' THEN (CASE WHEN par=3 THEN 'approach' ELSE 'off_tee' END)
                      WHEN lie_before_norm='green' THEN 'around_green'
                      WHEN dist_before_yards<=50 THEN 'around_green'
                      ELSE 'approach' END
               WHEN shot_type='putting' THEN 'putting'
               WHEN shot_type='tee' THEN 'off_tee'
               WHEN shot_type='around_green' THEN 'around_green'
               ELSE 'approach' END AS category,
        CASE WHEN is_penalty THEN 0 ELSE sg_expected_strokes(lie_before_norm,dist_before_yards,v_scale) END AS exp_before,
        CASE WHEN is_penalty THEN 0 WHEN is_holed THEN 0 WHEN dist_after_yards>0 THEN sg_expected_strokes(lie_after_norm,dist_after_yards,v_scale) ELSE 0 END AS exp_after,
        CASE WHEN is_penalty THEN TRUE ELSE (is_holed OR dist_after_yards>0) END AS has_after
      FROM normalized WHERE dist_before_yards>0
    )
    SELECT
      ROUND(COALESCE(SUM(CASE WHEN category='off_tee' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='approach' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='around_green' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3),
      ROUND(COALESCE(SUM(CASE WHEN category='putting' AND has_after THEN exp_before-exp_after-1 END),0)::NUMERIC,3)
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting FROM categorized;
  ELSE
    SELECT sg_off_tee, sg_approach, sg_around_green, sg_putting
    INTO v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting FROM sg_estimate_from_holes(p_round_id);
  END IF;
  v_sg_total := ROUND((COALESCE(v_sg_off_tee,0)+COALESCE(v_sg_approach,0)+COALESCE(v_sg_around,0)+COALESCE(v_sg_putting,0))::NUMERIC,3);
  INSERT INTO golf_round_stats_cache (id, round_id, player_id, strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting, created_at, updated_at)
  SELECT gen_random_uuid(), p_round_id, v_player_id, v_sg_total, v_sg_off_tee, v_sg_approach, v_sg_around, v_sg_putting, now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM golf_round_stats_cache WHERE round_id=p_round_id);
  UPDATE golf_round_stats_cache SET strokes_gained_total=v_sg_total, strokes_gained_tee=v_sg_off_tee,
    strokes_gained_approach=v_sg_approach, strokes_gained_around_green=v_sg_around,
    strokes_gained_putting=v_sg_putting, updated_at=now() WHERE round_id=p_round_id;
  UPDATE golf_rounds SET strokes_gained_total=v_sg_total, strokes_gained_tee=v_sg_off_tee,
    strokes_gained_approach=v_sg_approach, strokes_gained_around_green=v_sg_around, strokes_gained_putting=v_sg_putting
  WHERE id=p_round_id AND (
    strokes_gained_total IS DISTINCT FROM v_sg_total OR strokes_gained_tee IS DISTINCT FROM v_sg_off_tee
    OR strokes_gained_approach IS DISTINCT FROM v_sg_approach OR strokes_gained_around_green IS DISTINCT FROM v_sg_around
    OR strokes_gained_putting IS DISTINCT FROM v_sg_putting);
END;
$$;

ALTER FUNCTION "public"."recalculate_round_strokes_gained"("p_round_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recalculate_team_baseball_season_stats"("p_team_id" "uuid", "p_season_year" integer DEFAULT (EXTRACT(year FROM "now"()))::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_player_id uuid;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND coalesce(auth.role(), '') <> 'service_role'
     AND NOT public.is_baseball_team_coach_v2(p_team_id)
  THEN
    RAISE EXCEPTION 'forbidden: caller is not a coach of team %', p_team_id
      USING ERRCODE = '42501';
  END IF;

  FOR v_player_id IN
    SELECT DISTINCT player_id FROM baseball_team_members WHERE team_id = p_team_id
  LOOP
    PERFORM recalculate_baseball_season_stats(v_player_id, p_team_id, p_season_year);
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."recalculate_team_baseball_season_stats"("p_team_id" "uuid", "p_season_year" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."reclassify_golf_round"("p_round_id" "uuid", "p_round_type" "text", "p_qualifier_id" "uuid", "p_qualifier_round_number" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_round      public.golf_rounds%ROWTYPE;
  v_qualifier  public.golf_qualifiers%ROWTYPE;
  v_updated_id uuid;
  v_is_owner   boolean := false;
  v_is_coach   boolean := false;
  v_round_no   integer;
BEGIN
  IF p_round_type NOT IN ('practice', 'tournament', 'qualifier') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported round type.';
  END IF;

  SELECT * INTO v_round FROM public.golf_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF v_round.status NOT IN ('completed', 'in_progress') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'Only a live or submitted round can be re-typed.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.golf_players gp
    WHERE gp.id = v_round.player_id AND gp.user_id = auth.uid()
  ) INTO v_is_owner;
  SELECT public.is_golf_team_coach(v_round.team_id) INTO v_is_coach;

  IF NOT (v_is_owner OR coalesce(v_is_coach, false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'You do not have permission to change this round.';
  END IF;

  IF p_round_type = 'qualifier' THEN
    IF p_qualifier_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'A qualifier round must be attached to a qualifier.';
    END IF;

    SELECT * INTO v_qualifier FROM public.golf_qualifiers WHERE id = p_qualifier_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'That qualifier does not exist.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.golf_qualifier_entries e
      WHERE e.qualifier_id = p_qualifier_id AND e.player_id = v_round.player_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'This player is not entered in that qualifier.';
    END IF;

    IF v_round.team_id IS NOT NULL
      AND v_qualifier.team_id IS DISTINCT FROM v_round.team_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'That qualifier belongs to a different team.';
    END IF;

    -- REMOVED 2026-08-31: the refusal on v_qualifier.status = 'completed'.
    -- Owner instruction: no time limit on correcting what a round counts toward.

    v_round_no := coalesce(p_qualifier_round_number, v_round.qualifier_round_number, 1);
    IF v_round_no < 1 OR v_round_no > coalesce(v_qualifier.num_rounds, 1) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'That round number is outside this qualifier.';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.golf_rounds r
      WHERE r.qualifier_id = p_qualifier_id
        AND r.player_id = v_round.player_id
        AND r.qualifier_round_number = v_round_no
        AND r.status <> 'abandoned'
        AND r.id <> p_round_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505',
        MESSAGE = 'That qualifier round number is already taken by another round.';
    END IF;
  END IF;

  PERFORM set_config('helm.golf_lifecycle_write', 'reclassify', true);

  UPDATE public.golf_rounds
  SET round_type = p_round_type,
      qualifier_id = CASE WHEN p_round_type = 'qualifier' THEN p_qualifier_id ELSE NULL END,
      qualifier_round_number = CASE WHEN p_round_type = 'qualifier' THEN v_round_no ELSE NULL END
  WHERE id = p_round_id
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id;
END;
$$;

ALTER FUNCTION "public"."reclassify_golf_round"("p_round_id" "uuid", "p_round_type" "text", "p_qualifier_id" "uuid", "p_qualifier_round_number" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recompute_golf_round_totals"("p_round_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE golf_rounds r
  SET
    total_putts = COALESCE(t.sum_putts, 0),
    total_gir = COALESCE(t.sum_gir, 0),
    total_gir_possible = COALESCE(t.cnt, 0),
    total_fairways_hit = COALESCE(t.sum_fwy_hit, 0),
    total_fairways = COALESCE(t.cnt_par4plus, 0)
  FROM (
    SELECT
      SUM(putts) AS sum_putts,
      SUM(CASE
            WHEN par >= 3
             AND score > 0
             AND (score - COALESCE(putts, 0)) > 0
             AND (score - COALESCE(putts, 0)) <= (par - 2)
            THEN 1 ELSE 0
          END) AS sum_gir,
      COUNT(*) AS cnt,
      SUM(CASE WHEN par >= 4 AND fairway_hit = true THEN 1 ELSE 0 END) AS sum_fwy_hit,
      SUM(CASE WHEN par >= 4 AND fairway_hit IS NOT NULL THEN 1 ELSE 0 END) AS cnt_par4plus
    FROM golf_holes
    WHERE round_id = p_round_id
  ) t
  WHERE r.id = p_round_id;
END
$$;

ALTER FUNCTION "public"."recompute_golf_round_totals"("p_round_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."recompute_team_sg"("p_team_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE r RECORD; pid UUID;
BEGIN
  FOR r IN
    SELECT gr.id FROM golf_rounds gr
    JOIN golf_team_members tm ON tm.player_id = gr.player_id AND tm.status='active'
    WHERE tm.team_id = p_team_id AND gr.status = 'completed'
  LOOP
    PERFORM recalculate_round_strokes_gained(r.id);
  END LOOP;

  FOR pid IN
    SELECT tm.player_id FROM golf_team_members tm
    WHERE tm.team_id = p_team_id AND tm.status='active'
  LOOP
    PERFORM refresh_player_stats_cache(pid);
  END LOOP;

  PERFORM refresh_player_standing(ARRAY[p_team_id]);
  PERFORM refresh_player_standing_round_metrics(ARRAY[p_team_id]);
  PERFORM refresh_player_standing_shot_metrics(ARRAY[p_team_id]);
END;
$$;

ALTER FUNCTION "public"."recompute_team_sg"("p_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_db_error_event"("p_service" "text", "p_environment" "text", "p_runtime" "text", "p_feature" "text", "p_action" "text", "p_operation" "text", "p_severity" "text", "p_expectedness" "text", "p_retryability" "text", "p_fingerprint" "text", "p_normalized_message" "text", "p_terminal" boolean DEFAULT true, "p_release_sha" "text" DEFAULT NULL::"text", "p_sport" "text" DEFAULT NULL::"text", "p_journey" "text" DEFAULT NULL::"text", "p_relation_name" "text" DEFAULT NULL::"text", "p_rpc_name" "text" DEFAULT NULL::"text", "p_function_name" "text" DEFAULT NULL::"text", "p_bucket_class" "text" DEFAULT NULL::"text", "p_error_code" "text" DEFAULT NULL::"text", "p_sqlstate" "text" DEFAULT NULL::"text", "p_postgrest_code" "text" DEFAULT NULL::"text", "p_auth_code" "text" DEFAULT NULL::"text", "p_storage_code" "text" DEFAULT NULL::"text", "p_http_status" integer DEFAULT NULL::integer, "p_safe_details" "text" DEFAULT NULL::"text", "p_safe_hint" "text" DEFAULT NULL::"text", "p_helm_trace_id" "text" DEFAULT NULL::"text", "p_sentry_trace_id" "text" DEFAULT NULL::"text", "p_sentry_span_id" "text" DEFAULT NULL::"text", "p_duration_ms" integer DEFAULT NULL::integer, "p_attempt" integer DEFAULT NULL::integer, "p_safe_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_force_individual_row" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_id uuid;
  v_bucket timestamptz := date_trunc('hour', clock_timestamp());
  -- helm_private.trace_safe_metadata already exists (20260825200811) and
  -- strips the same accidental top-level secret keys; reused rather than
  -- redefined so the two observability writers cannot drift apart on this
  -- one rule.
  v_safe_metadata jsonb := helm_private.trace_safe_metadata(p_safe_metadata);
begin
  if p_force_individual_row then
    insert into helm_debug.db_error_events (
      service, environment, runtime, feature, action, operation, severity,
      expectedness, retryability, fingerprint, normalized_message, terminal,
      release_sha, sport, journey, relation_name, rpc_name, function_name,
      bucket_class, error_code, sqlstate, postgrest_code, auth_code,
      storage_code, http_status, safe_details, safe_hint, helm_trace_id,
      sentry_trace_id, sentry_span_id, duration_ms, attempt, safe_metadata,
      bucket_started_at, is_individual
    ) values (
      p_service, p_environment, p_runtime, p_feature, p_action, p_operation,
      p_severity, p_expectedness, p_retryability, p_fingerprint,
      p_normalized_message, p_terminal, p_release_sha, p_sport, p_journey,
      p_relation_name, p_rpc_name, p_function_name, p_bucket_class,
      p_error_code, p_sqlstate, p_postgrest_code, p_auth_code,
      p_storage_code, p_http_status, p_safe_details, p_safe_hint,
      p_helm_trace_id, p_sentry_trace_id, p_sentry_span_id, p_duration_ms,
      p_attempt, v_safe_metadata, v_bucket, true
    )
    returning id into v_id;
    return v_id;
  end if;

  insert into helm_debug.db_error_events (
    service, environment, runtime, feature, action, operation, severity,
    expectedness, retryability, fingerprint, normalized_message, terminal,
    release_sha, sport, journey, relation_name, rpc_name, function_name,
    bucket_class, error_code, sqlstate, postgrest_code, auth_code,
    storage_code, http_status, safe_details, safe_hint, helm_trace_id,
    sentry_trace_id, sentry_span_id, duration_ms, attempt, safe_metadata,
    bucket_started_at
  ) values (
    p_service, p_environment, p_runtime, p_feature, p_action, p_operation,
    p_severity, p_expectedness, p_retryability, p_fingerprint,
    p_normalized_message, p_terminal, p_release_sha, p_sport, p_journey,
    p_relation_name, p_rpc_name, p_function_name, p_bucket_class,
    p_error_code, p_sqlstate, p_postgrest_code, p_auth_code, p_storage_code,
    p_http_status, p_safe_details, p_safe_hint, p_helm_trace_id,
    p_sentry_trace_id, p_sentry_span_id, p_duration_ms, p_attempt,
    v_safe_metadata, v_bucket
  )
  on conflict (fingerprint, bucket_started_at) where not is_individual
  do update set
    occurrence_count = helm_debug.db_error_events.occurrence_count + 1,
    last_seen_at = clock_timestamp(),
    -- Refresh the evidence to the LATEST occurrence, not the first — a
    -- fingerprint's normalized_message/safe_details can legitimately vary
    -- occurrence to occurrence (e.g. a duration or a changed hint), and the
    -- most recent one is the more useful one for triage.
    normalized_message = excluded.normalized_message,
    safe_details = excluded.safe_details,
    safe_hint = excluded.safe_hint,
    duration_ms = excluded.duration_ms,
    attempt = excluded.attempt,
    helm_trace_id = excluded.helm_trace_id,
    sentry_trace_id = excluded.sentry_trace_id,
    sentry_span_id = excluded.sentry_span_id,
    severity = excluded.severity,
    expectedness = excluded.expectedness,
    terminal = excluded.terminal,
    safe_metadata = excluded.safe_metadata
  returning id into v_id;

  return v_id;
end;
$$;

ALTER FUNCTION "public"."record_db_error_event"("p_service" "text", "p_environment" "text", "p_runtime" "text", "p_feature" "text", "p_action" "text", "p_operation" "text", "p_severity" "text", "p_expectedness" "text", "p_retryability" "text", "p_fingerprint" "text", "p_normalized_message" "text", "p_terminal" boolean, "p_release_sha" "text", "p_sport" "text", "p_journey" "text", "p_relation_name" "text", "p_rpc_name" "text", "p_function_name" "text", "p_bucket_class" "text", "p_error_code" "text", "p_sqlstate" "text", "p_postgrest_code" "text", "p_auth_code" "text", "p_storage_code" "text", "p_http_status" integer, "p_safe_details" "text", "p_safe_hint" "text", "p_helm_trace_id" "text", "p_sentry_trace_id" "text", "p_sentry_span_id" "text", "p_duration_ms" integer, "p_attempt" integer, "p_safe_metadata" "jsonb", "p_force_individual_row" boolean) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_db_health_sample"("p_stats_reset_at" timestamp with time zone, "p_connections_total" integer, "p_connections_active" integer, "p_connections_idle_in_tx" integer, "p_connections_waiting_lock" integer, "p_connections_pct_max" numeric, "p_longest_active_ms" integer, "p_longest_idle_in_tx_ms" integer, "p_longest_lock_wait_ms" integer, "p_xact_commit" bigint, "p_xact_rollback" bigint, "p_deadlocks" bigint, "p_conflicts" bigint, "p_tup_returned" bigint, "p_tup_fetched" bigint, "p_tup_inserted" bigint, "p_tup_updated" bigint, "p_tup_deleted" bigint, "p_temp_files" bigint, "p_temp_bytes" bigint, "p_blks_read" bigint, "p_blks_hit" bigint, "p_db_size_bytes" bigint, "p_xact_commit_delta" bigint, "p_xact_rollback_delta" bigint, "p_deadlocks_delta" bigint, "p_conflicts_delta" bigint, "p_tup_returned_delta" bigint, "p_tup_fetched_delta" bigint, "p_tup_inserted_delta" bigint, "p_tup_updated_delta" bigint, "p_tup_deleted_delta" bigint, "p_temp_files_delta" bigint, "p_temp_bytes_delta" bigint, "p_blks_read_delta" bigint, "p_blks_hit_delta" bigint, "p_cache_hit_ratio" numeric, "p_collector_status" "text" DEFAULT 'ok'::"text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_id bigint;
begin
  insert into helm_debug.db_health_samples (
    stats_reset_at, connections_total, connections_active,
    connections_idle_in_tx, connections_waiting_lock, connections_pct_max,
    longest_active_ms, longest_idle_in_tx_ms, longest_lock_wait_ms,
    xact_commit, xact_rollback, deadlocks, conflicts, tup_returned,
    tup_fetched, tup_inserted, tup_updated, tup_deleted, temp_files,
    temp_bytes, blks_read, blks_hit, db_size_bytes, xact_commit_delta,
    xact_rollback_delta, deadlocks_delta, conflicts_delta,
    tup_returned_delta, tup_fetched_delta, tup_inserted_delta,
    tup_updated_delta, tup_deleted_delta, temp_files_delta,
    temp_bytes_delta, blks_read_delta, blks_hit_delta, cache_hit_ratio,
    collector_status
  ) values (
    p_stats_reset_at, p_connections_total, p_connections_active,
    p_connections_idle_in_tx, p_connections_waiting_lock,
    p_connections_pct_max, p_longest_active_ms, p_longest_idle_in_tx_ms,
    p_longest_lock_wait_ms, p_xact_commit, p_xact_rollback, p_deadlocks,
    p_conflicts, p_tup_returned, p_tup_fetched, p_tup_inserted,
    p_tup_updated, p_tup_deleted, p_temp_files, p_temp_bytes, p_blks_read,
    p_blks_hit, p_db_size_bytes, p_xact_commit_delta, p_xact_rollback_delta,
    p_deadlocks_delta, p_conflicts_delta, p_tup_returned_delta,
    p_tup_fetched_delta, p_tup_inserted_delta, p_tup_updated_delta,
    p_tup_deleted_delta, p_temp_files_delta, p_temp_bytes_delta,
    p_blks_read_delta, p_blks_hit_delta, p_cache_hit_ratio,
    coalesce(p_collector_status, 'ok')
  )
  returning id into v_id;

  return v_id;
end;
$$;

ALTER FUNCTION "public"."record_db_health_sample"("p_stats_reset_at" timestamp with time zone, "p_connections_total" integer, "p_connections_active" integer, "p_connections_idle_in_tx" integer, "p_connections_waiting_lock" integer, "p_connections_pct_max" numeric, "p_longest_active_ms" integer, "p_longest_idle_in_tx_ms" integer, "p_longest_lock_wait_ms" integer, "p_xact_commit" bigint, "p_xact_rollback" bigint, "p_deadlocks" bigint, "p_conflicts" bigint, "p_tup_returned" bigint, "p_tup_fetched" bigint, "p_tup_inserted" bigint, "p_tup_updated" bigint, "p_tup_deleted" bigint, "p_temp_files" bigint, "p_temp_bytes" bigint, "p_blks_read" bigint, "p_blks_hit" bigint, "p_db_size_bytes" bigint, "p_xact_commit_delta" bigint, "p_xact_rollback_delta" bigint, "p_deadlocks_delta" bigint, "p_conflicts_delta" bigint, "p_tup_returned_delta" bigint, "p_tup_fetched_delta" bigint, "p_tup_inserted_delta" bigint, "p_tup_updated_delta" bigint, "p_tup_deleted_delta" bigint, "p_temp_files_delta" bigint, "p_temp_bytes_delta" bigint, "p_blks_read_delta" bigint, "p_blks_hit_delta" bigint, "p_cache_hit_ratio" numeric, "p_collector_status" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_db_lock_incident"("p_kind" "text", "p_severity" "text", "p_role_class" "text", "p_wait_ms" integer, "p_blocked_query_class" "text" DEFAULT NULL::"text", "p_blocking_query_class" "text" DEFAULT NULL::"text", "p_blocked_pid_count" integer DEFAULT NULL::integer, "p_relation_name" "text" DEFAULT NULL::"text", "p_feature" "text" DEFAULT NULL::"text", "p_action" "text" DEFAULT NULL::"text", "p_release_sha" "text" DEFAULT NULL::"text", "p_helm_trace_id" "text" DEFAULT NULL::"text", "p_safe_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_id bigint;
  v_existing_id bigint;
begin
  select id into v_existing_id
  from helm_debug.db_lock_incidents
  where kind = p_kind
    and blocked_query_class is not distinct from p_blocked_query_class
    and resolved_at is null
    and detected_at >= clock_timestamp() - interval '15 minutes'
  order by detected_at desc
  limit 1;

  if v_existing_id is not null then
    update helm_debug.db_lock_incidents
    set wait_ms = p_wait_ms,
        detected_at = clock_timestamp(),
        severity = p_severity,
        blocking_query_class = coalesce(p_blocking_query_class, blocking_query_class),
        blocked_pid_count = coalesce(p_blocked_pid_count, blocked_pid_count),
        relation_name = coalesce(p_relation_name, relation_name),
        feature = coalesce(p_feature, feature),
        action = coalesce(p_action, action),
        release_sha = coalesce(p_release_sha, release_sha),
        helm_trace_id = coalesce(p_helm_trace_id, helm_trace_id),
        safe_metadata = coalesce(p_safe_metadata, safe_metadata)
    where id = v_existing_id;
    return v_existing_id;
  end if;

  insert into helm_debug.db_lock_incidents (
    kind, severity, role_class, wait_ms, blocked_query_class,
    blocking_query_class, blocked_pid_count, relation_name, feature,
    action, release_sha, helm_trace_id, safe_metadata
  ) values (
    p_kind, p_severity, p_role_class, p_wait_ms, p_blocked_query_class,
    p_blocking_query_class, p_blocked_pid_count, p_relation_name, p_feature,
    p_action, p_release_sha, p_helm_trace_id, coalesce(p_safe_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

ALTER FUNCTION "public"."record_db_lock_incident"("p_kind" "text", "p_severity" "text", "p_role_class" "text", "p_wait_ms" integer, "p_blocked_query_class" "text", "p_blocking_query_class" "text", "p_blocked_pid_count" integer, "p_relation_name" "text", "p_feature" "text", "p_action" "text", "p_release_sha" "text", "p_helm_trace_id" "text", "p_safe_metadata" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_db_platform_sample"("p_db_up" smallint, "p_cpu_pct" numeric, "p_memory_pct" numeric, "p_connections_used" integer, "p_connections_max" integer, "p_pool_saturation_pct" numeric, "p_wal_or_replication_lag_seconds" numeric, "p_io_pressure" numeric, "p_db_size_bytes" bigint, "p_autovacuum_or_bloat_signal" numeric, "p_postgrest_pool_used" integer, "p_postgrest_pool_max" integer, "p_postgrest_pool_saturation_pct" numeric, "p_auth_pool_used" integer, "p_auth_pool_max" integer, "p_auth_pool_saturation_pct" numeric, "p_realtime_subscriptions" integer, "p_source_status" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_id bigint;
begin
  insert into helm_debug.db_platform_samples (
    db_up, cpu_pct, memory_pct, connections_used, connections_max,
    pool_saturation_pct, wal_or_replication_lag_seconds, io_pressure,
    db_size_bytes, autovacuum_or_bloat_signal, postgrest_pool_used,
    postgrest_pool_max, postgrest_pool_saturation_pct, auth_pool_used,
    auth_pool_max, auth_pool_saturation_pct, realtime_subscriptions,
    source_status
  ) values (
    p_db_up, p_cpu_pct, p_memory_pct, p_connections_used, p_connections_max,
    p_pool_saturation_pct, p_wal_or_replication_lag_seconds, p_io_pressure,
    p_db_size_bytes, p_autovacuum_or_bloat_signal, p_postgrest_pool_used,
    p_postgrest_pool_max, p_postgrest_pool_saturation_pct, p_auth_pool_used,
    p_auth_pool_max, p_auth_pool_saturation_pct, p_realtime_subscriptions,
    coalesce(p_source_status, 'unreachable')
  )
  returning id into v_id;

  return v_id;
end;
$$;

ALTER FUNCTION "public"."record_db_platform_sample"("p_db_up" smallint, "p_cpu_pct" numeric, "p_memory_pct" numeric, "p_connections_used" integer, "p_connections_max" integer, "p_pool_saturation_pct" numeric, "p_wal_or_replication_lag_seconds" numeric, "p_io_pressure" numeric, "p_db_size_bytes" bigint, "p_autovacuum_or_bloat_signal" numeric, "p_postgrest_pool_used" integer, "p_postgrest_pool_max" integer, "p_postgrest_pool_saturation_pct" numeric, "p_auth_pool_used" integer, "p_auth_pool_max" integer, "p_auth_pool_saturation_pct" numeric, "p_realtime_subscriptions" integer, "p_source_status" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_db_stat_snapshot"("p_sampled_at" timestamp with time zone, "p_stats_reset_at" timestamp with time zone, "p_delta_rows" "jsonb", "p_prior_state_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_row jsonb;
  v_count integer := 0;
begin
  for v_row in select * from jsonb_array_elements(coalesce(p_delta_rows, '[]'::jsonb))
  loop
    insert into helm_debug.db_stat_deltas (
      sampled_at, stats_reset_at, queryid, safe_query_class, source_class,
      calls_delta, total_exec_ms_delta, mean_exec_ms_window,
      max_exec_ms_observed, rows_delta, wal_bytes_delta,
      shared_blks_hit_delta, shared_blks_read_delta, temp_blks_read_delta,
      temp_blks_written_delta, regression_flags, baseline_status
    ) values (
      p_sampled_at, p_stats_reset_at,
      v_row ->> 'queryid',
      v_row ->> 'safeQueryClass',
      v_row ->> 'sourceClass',
      nullif(v_row ->> 'callsDelta', '')::bigint,
      nullif(v_row ->> 'totalExecMsDelta', '')::numeric,
      nullif(v_row ->> 'meanExecMsWindow', '')::numeric,
      nullif(v_row ->> 'maxExecMsObserved', '')::numeric,
      nullif(v_row ->> 'rowsDelta', '')::bigint,
      nullif(v_row ->> 'walBytesDelta', '')::bigint,
      nullif(v_row ->> 'sharedBlksHitDelta', '')::bigint,
      nullif(v_row ->> 'sharedBlksReadDelta', '')::bigint,
      nullif(v_row ->> 'tempBlksReadDelta', '')::bigint,
      nullif(v_row ->> 'tempBlksWrittenDelta', '')::bigint,
      coalesce(
        array(select jsonb_array_elements_text(v_row -> 'regressionFlags')),
        '{}'
      ),
      coalesce(v_row ->> 'baselineStatus', 'collecting')
    );
    v_count := v_count + 1;
  end loop;

  for v_row in select * from jsonb_array_elements(coalesce(p_prior_state_rows, '[]'::jsonb))
  loop
    insert into helm_debug.db_stat_prior_state (
      queryid, last_seen_at, stats_reset_at, calls, total_exec_ms, rows,
      shared_blks_hit, shared_blks_read, temp_blks_read, temp_blks_written,
      wal_bytes, mean_exec_ms_baseline, max_exec_ms_baseline,
      rows_per_call_baseline, sample_count, baseline_status
    ) values (
      v_row ->> 'queryid', p_sampled_at, p_stats_reset_at,
      (v_row ->> 'calls')::bigint,
      (v_row ->> 'totalExecMs')::numeric,
      (v_row ->> 'rows')::bigint,
      (v_row ->> 'sharedBlksHit')::bigint,
      (v_row ->> 'sharedBlksRead')::bigint,
      (v_row ->> 'tempBlksRead')::bigint,
      (v_row ->> 'tempBlksWritten')::bigint,
      (v_row ->> 'walBytes')::bigint,
      nullif(v_row ->> 'meanExecMsBaseline', '')::numeric,
      nullif(v_row ->> 'maxExecMsBaseline', '')::numeric,
      nullif(v_row ->> 'rowsPerCallBaseline', '')::numeric,
      coalesce((v_row ->> 'sampleCount')::integer, 0),
      coalesce(v_row ->> 'baselineStatus', 'collecting')
    )
    on conflict (queryid) do update set
      last_seen_at = excluded.last_seen_at,
      stats_reset_at = excluded.stats_reset_at,
      calls = excluded.calls,
      total_exec_ms = excluded.total_exec_ms,
      rows = excluded.rows,
      shared_blks_hit = excluded.shared_blks_hit,
      shared_blks_read = excluded.shared_blks_read,
      temp_blks_read = excluded.temp_blks_read,
      temp_blks_written = excluded.temp_blks_written,
      wal_bytes = excluded.wal_bytes,
      mean_exec_ms_baseline = excluded.mean_exec_ms_baseline,
      max_exec_ms_baseline = excluded.max_exec_ms_baseline,
      rows_per_call_baseline = excluded.rows_per_call_baseline,
      sample_count = excluded.sample_count,
      baseline_status = excluded.baseline_status;
  end loop;

  return v_count;
end;
$$;

ALTER FUNCTION "public"."record_db_stat_snapshot"("p_sampled_at" timestamp with time zone, "p_stats_reset_at" timestamp with time zone, "p_delta_rows" "jsonb", "p_prior_state_rows" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_db_table_samples"("p_rows" "jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'helm_debug'
    AS $$
declare
  v_row jsonb;
  v_count integer := 0;
begin
  for v_row in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    insert into helm_debug.db_table_samples (
      relation_name, n_live_tup, n_dead_tup, dead_ratio, last_autovacuum,
      last_autoanalyze, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del,
      total_bytes, index_bytes, n_dead_tup_delta, seq_scan_delta,
      idx_scan_delta, n_tup_ins_delta, n_tup_upd_delta, n_tup_del_delta,
      collector_status
    ) values (
      v_row ->> 'relationName',
      (v_row ->> 'nLiveTup')::bigint,
      (v_row ->> 'nDeadTup')::bigint,
      nullif(v_row ->> 'deadRatio', '')::numeric,
      nullif(v_row ->> 'lastAutovacuum', '')::timestamptz,
      nullif(v_row ->> 'lastAutoanalyze', '')::timestamptz,
      (v_row ->> 'seqScan')::bigint,
      (v_row ->> 'idxScan')::bigint,
      (v_row ->> 'nTupIns')::bigint,
      (v_row ->> 'nTupUpd')::bigint,
      (v_row ->> 'nTupDel')::bigint,
      (v_row ->> 'totalBytes')::bigint,
      (v_row ->> 'indexBytes')::bigint,
      nullif(v_row ->> 'nDeadTupDelta', '')::bigint,
      nullif(v_row ->> 'seqScanDelta', '')::bigint,
      nullif(v_row ->> 'idxScanDelta', '')::bigint,
      nullif(v_row ->> 'nTupInsDelta', '')::bigint,
      nullif(v_row ->> 'nTupUpdDelta', '')::bigint,
      nullif(v_row ->> 'nTupDelDelta', '')::bigint,
      coalesce(v_row ->> 'collectorStatus', 'ok')
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

ALTER FUNCTION "public"."record_db_table_samples"("p_rows" "jsonb") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."record_round_coachhelm_terminal_state"("p_round_id" "uuid", "p_analyzed_at" timestamp with time zone, "p_failed_at" timestamp with time zone, "p_failure_reason" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE updated_round_id uuid;
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'coachhelm_terminal', true);
  UPDATE public.golf_rounds
  SET coachhelm_analyzed_at = p_analyzed_at, coachhelm_failed_at = p_failed_at, coachhelm_failure_reason = p_failure_reason
  WHERE id = p_round_id AND status = 'completed'
  RETURNING id INTO updated_round_id;
  RETURN updated_round_id;
END;
$$;

ALTER FUNCTION "public"."record_round_coachhelm_terminal_state"("p_round_id" "uuid", "p_analyzed_at" timestamp with time zone, "p_failed_at" timestamp with time zone, "p_failure_reason" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."record_round_coachhelm_terminal_state"("p_round_id" "uuid", "p_analyzed_at" timestamp with time zone, "p_failed_at" timestamp with time zone, "p_failure_reason" "text") IS 'Service-only terminal metadata writer for completed-round CoachHelm
processing.';

CREATE OR REPLACE FUNCTION "public"."refresh_crm_coach_engagement"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Transaction-scoped: released on COMMIT *and* on ROLLBACK, so a failed
  -- refresh cannot strand the lock in a pooled PostgREST connection.
  PERFORM pg_advisory_xact_lock(7777);
  REFRESH MATERIALIZED VIEW CONCURRENTLY crm_coach_engagement;
END; $$;

ALTER FUNCTION "public"."refresh_crm_coach_engagement"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."refresh_player_standing"("p_team_ids" "uuid"[]) RETURNS TABLE("metric_id" "text", "rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  v_bindings text[][] := ARRAY[
    ['sg_total',                  'cache.sg_total_per_round',          'higher_better'],
    ['sg_ott',                    'cache.sg_tee_per_round',            'higher_better'],
    ['sg_approach',               'cache.sg_approach_per_round',       'higher_better'],
    ['sg_around_green',           'cache.sg_around_green_per_round',   'higher_better'],
    ['sg_putting',                'cache.sg_putting_per_round',        'higher_better'],
    ['putts_made_3_5ft_pct',      'cache.putt_make_pct_3_5ft',         'higher_better'],
    ['putts_made_5_10ft_pct',     'cache.putt_make_pct_5_10ft',        'higher_better'],
    ['putts_made_10_15ft_pct',    'cache.putt_make_pct_10_15ft',       'higher_better'],
    ['gir_pct',                   'cache.gir_percentage',              'higher_better'],
    ['scrambling_pct_sand',       'cache.sand_save_percentage',        'higher_better'],
    ['penalty_rate_per_round',    'cache.penalty_strokes_per_round',   'lower_better'],
    ['big_number_rate',           'CASE WHEN COALESCE(cache.eagles,0)+COALESCE(cache.birdies,0)+COALESCE(cache.pars,0)+COALESCE(cache.bogeys,0)+COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0) > 0 THEN 100.0 * (COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0))::numeric / (COALESCE(cache.eagles,0)+COALESCE(cache.birdies,0)+COALESCE(cache.pars,0)+COALESCE(cache.bogeys,0)+COALESCE(cache.double_bogeys,0)+COALESCE(cache.triple_plus,0)) ELSE NULL END',
                                                                       'lower_better'],
    ['scoring_par_3',             'cache.par3_average',                'lower_better'],
    ['scoring_par_4',             'cache.par4_average',                'lower_better'],
    ['scoring_par_5',             'cache.par5_average',                'lower_better'],
    ['putts_made_15_25ft_pct',    'cache.putt_make_pct_15_25ft',       'higher_better'],
    ['putts_made_25_plus_ft_pct', 'cache.putt_make_pct_25_plus_ft',    'higher_better']
  ];
  v_n int := array_length(v_bindings, 1);
  v_i int; v_metric text; v_expr text; v_dir text; v_rank_order text; v_sql text; v_rows bigint;
  v_min_cohort_n constant int := 8;
  v_min_team_n constant int := 3;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN RETURN; END IF;
  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bindings[v_i][1];
    v_expr   := v_bindings[v_i][2];
    v_dir    := v_bindings[v_i][3];
    v_rank_order := CASE WHEN v_dir = 'lower_better' THEN 'DESC' ELSE 'ASC' END;
    v_sql := format($q$
      WITH team_values AS (
        SELECT p.id AS player_id, tm.team_id,
               COALESCE(t.gender, 'mens') AS gender,
               (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm ON tm.player_id = p.id AND tm.status = 'active'::team_member_status
        JOIN public.golf_teams t ON t.id = tm.team_id
        JOIN public.golf_player_stats_cache cache ON cache.player_id = p.id
        WHERE tm.team_id = ANY($1) AND cache.rounds_played >= 5 AND (%s) IS NOT NULL
      ),
      team_stats AS (SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n FROM team_values GROUP BY team_id),
      ranked AS (
        SELECT tv.player_id, tv.team_id, tv.gender, tv.player_value, ts.team_avg, ts.team_n,
          100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value %s)) AS team_pct
        FROM team_values tv JOIN team_stats ts ON ts.team_id = tv.team_id
      ),
      population_values AS (
        SELECT DISTINCT p.id AS player_id,
               COALESCE(t.gender, 'mens') AS gender,
               (%s) AS player_value
        FROM public.golf_players p
        JOIN public.golf_team_members tm ON tm.player_id = p.id AND tm.status = 'active'::team_member_status
        JOIN public.golf_teams t ON t.id = tm.team_id
        JOIN public.golf_player_stats_cache cache ON cache.player_id = p.id
        WHERE cache.rounds_played >= 5 AND (%s) IS NOT NULL
      ),
      pop_stats AS (SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n FROM population_values GROUP BY gender),
      pop_ranked AS (SELECT player_id, gender, 100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value %s)) AS level_pct FROM population_values),
      pga AS (SELECT pga_tour_value, pga_p50 FROM public.golf_pga_standards WHERE metric_id = $2 ORDER BY season DESC LIMIT 1)
      INSERT INTO public.golf_player_standing AS s (
        player_id, metric_id, player_value, team_avg, team_n, team_pct,
        level_avg, level_n, level_pct, pga_value, pga_delta, computed_at
      )
      SELECT
        r.player_id, $2::text, r.player_value, r.team_avg, r.team_n::int,
        CASE WHEN r.team_n >= $4 THEN r.team_pct ELSE NULL END,
        CASE WHEN ps.level_n >= $3 THEN ps.level_avg ELSE NULL END,
        ps.level_n::int,
        CASE WHEN ps.level_n >= $3 THEN pr.level_pct ELSE NULL END,
        COALESCE(pga.pga_tour_value, pga.pga_p50),
        r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50), now()
      FROM ranked r
      JOIN pop_stats ps ON ps.gender = r.gender
      LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
      CROSS JOIN pga
      WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
      ON CONFLICT (player_id, metric_id) DO UPDATE
      SET player_value = EXCLUDED.player_value, team_avg = EXCLUDED.team_avg, team_n = EXCLUDED.team_n,
          team_pct = EXCLUDED.team_pct, level_avg = EXCLUDED.level_avg, level_n = EXCLUDED.level_n,
          level_pct = EXCLUDED.level_pct, pga_value = EXCLUDED.pga_value, pga_delta = EXCLUDED.pga_delta, computed_at = now();
    $q$, v_expr, v_expr, v_rank_order, v_expr, v_expr, v_rank_order);
    EXECUTE v_sql USING p_team_ids, v_metric, v_min_cohort_n, v_min_team_n;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    metric_id := v_metric; rows_upserted := v_rows; RETURN NEXT;
    v_i := v_i + 1;
  END LOOP;
END;
$_$;

ALTER FUNCTION "public"."refresh_player_standing"("p_team_ids" "uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."refresh_player_standing"("p_team_ids" "uuid"[]) IS 'v3 W11 + gender-scoped level cohort (audit P3, 2026-06-09). Loops over the metric bindings and upserts golf_player_standing rows for the given team chunk. team_avg/team_pct per team (MIN_TEAM_N=3); level_avg/level_n/level_pct are now an app-wide cohort SCOPED BY golf_teams.gender (MIN_COHORT_N=8) so women and men no longer share a pooled baseline. Trusted SECURITY DEFINER — value expressions come from the function body, not the caller.';

CREATE OR REPLACE FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) RETURNS TABLE("out_metric_id" "text", "out_rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_window_days int := 90;
  v_min_rounds int := 5;
  v_rows bigint;
  v_min_team_n constant int := 3;
  v_min_cohort_n constant int := 8;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      COALESCE(t.gender, 'mens') AS gender,
      AVG(r.score_to_par) FILTER (WHERE r.round_type IN ('tournament','qualifier'))
        - AVG(r.score_to_par) FILTER (WHERE r.round_type = 'practice')
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_teams t
      ON t.id = tm.team_id
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
    HAVING
      COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) >= 3
      AND COUNT(*) FILTER (WHERE r.round_type = 'practice') >= 3
      AND COUNT(*) >= v_min_rounds
  ),
  team_stats AS (
    SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
    FROM team_values
    WHERE player_value IS NOT NULL
    GROUP BY team_id
  ),
  ranked AS (
    SELECT
      tv.player_id,
      tv.team_id,
      tv.gender,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  population_values AS (
    SELECT DISTINCT player_id, gender, player_value FROM (
      SELECT
        p.id AS player_id,
        tm.team_id,
        COALESCE(t.gender, 'mens') AS gender,
        AVG(r.score_to_par) FILTER (WHERE r.round_type IN ('tournament','qualifier'))
          - AVG(r.score_to_par) FILTER (WHERE r.round_type = 'practice')
          AS player_value
      FROM public.golf_players p
      JOIN public.golf_team_members tm
        ON tm.player_id = p.id
       AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
      JOIN public.golf_rounds r
        ON r.player_id = p.id
       AND r.status = 'completed'
       AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
      GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
      HAVING
        COUNT(*) FILTER (WHERE r.round_type IN ('tournament','qualifier')) >= 3
        AND COUNT(*) FILTER (WHERE r.round_type = 'practice') >= 3
        AND COUNT(*) >= v_min_rounds
    ) pop
    WHERE pop.player_value IS NOT NULL
  ),
  pop_stats AS (
    SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n
    FROM population_values
    GROUP BY gender
  ),
  pop_ranked AS (
    SELECT
      player_id,
      gender,
      100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value DESC)) AS level_pct
    FROM population_values
  ),
  pga AS (
    SELECT pga_tour_value, pga_p50
    FROM public.golf_pga_standards
    WHERE metric_id = 'practice_tournament_delta'
    ORDER BY season DESC
    LIMIT 1
  )
  INSERT INTO public.golf_player_standing AS s (
    player_id, metric_id, player_value, team_avg, team_n, team_pct,
    level_avg, level_n, level_pct,
    pga_value, pga_delta, computed_at
  )
  SELECT
    r.player_id,
    'practice_tournament_delta'::text,
    r.player_value,
    r.team_avg,
    r.team_n::int,
    CASE WHEN r.team_n >= v_min_team_n THEN r.team_pct ELSE NULL END,
    CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg ELSE NULL END,
    ps.level_n::int,
    CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct ELSE NULL END,
    COALESCE(pga.pga_tour_value, pga.pga_p50),
    r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
    now()
  FROM ranked r
  JOIN pop_stats ps ON ps.gender = r.gender
  LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
  CROSS JOIN pga
  WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
  ON CONFLICT (player_id, metric_id) DO UPDATE
  SET player_value = EXCLUDED.player_value,
      team_avg     = EXCLUDED.team_avg,
      team_n       = EXCLUDED.team_n,
      team_pct     = EXCLUDED.team_pct,
      level_avg    = EXCLUDED.level_avg,
      level_n      = EXCLUDED.level_n,
      level_pct    = EXCLUDED.level_pct,
      pga_value    = EXCLUDED.pga_value,
      pga_delta    = EXCLUDED.pga_delta,
      computed_at  = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_metric_id := 'practice_tournament_delta';
  out_rows_upserted := v_rows;
  RETURN NEXT;
  WITH team_values AS (
    SELECT
      p.id AS player_id,
      tm.team_id,
      COALESCE(t.gender, 'mens') AS gender,
      AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
        - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18)
        AS player_value
    FROM public.golf_players p
    JOIN public.golf_team_members tm
      ON tm.player_id = p.id
     AND tm.status = 'active'::team_member_status
    JOIN public.golf_teams t
      ON t.id = tm.team_id
    JOIN public.golf_rounds r
      ON r.player_id = p.id
     AND r.status = 'completed'
     AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
    JOIN public.golf_holes h
      ON h.round_id = r.id
     AND h.score IS NOT NULL
     AND h.par IS NOT NULL
    WHERE tm.team_id = ANY(p_team_ids)
    GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
    HAVING
      COUNT(DISTINCT r.id) >= v_min_rounds
      AND COUNT(*) FILTER (WHERE h.hole_number = 1) > 0
      AND COUNT(*) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) > 0
  ),
  team_stats AS (
    SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
    FROM team_values
    WHERE player_value IS NOT NULL
    GROUP BY team_id
  ),
  ranked AS (
    SELECT
      tv.player_id,
      tv.team_id,
      tv.gender,
      tv.player_value,
      ts.team_avg,
      ts.team_n,
      100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
    FROM team_values tv
    JOIN team_stats ts ON ts.team_id = tv.team_id
    WHERE tv.player_value IS NOT NULL
  ),
  population_values AS (
    SELECT DISTINCT player_id, gender, player_value FROM (
      SELECT
        p.id AS player_id,
        tm.team_id,
        COALESCE(t.gender, 'mens') AS gender,
        AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number = 1)
          - AVG((h.score - h.par)::numeric) FILTER (WHERE h.hole_number BETWEEN 2 AND 18)
          AS player_value
      FROM public.golf_players p
      JOIN public.golf_team_members tm
        ON tm.player_id = p.id
       AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
      JOIN public.golf_rounds r
        ON r.player_id = p.id
       AND r.status = 'completed'
       AND r.round_date > (CURRENT_DATE - (v_window_days || ' days')::interval)
      JOIN public.golf_holes h
        ON h.round_id = r.id
       AND h.score IS NOT NULL
       AND h.par IS NOT NULL
      GROUP BY p.id, tm.team_id, COALESCE(t.gender, 'mens')
      HAVING
        COUNT(DISTINCT r.id) >= v_min_rounds
        AND COUNT(*) FILTER (WHERE h.hole_number = 1) > 0
        AND COUNT(*) FILTER (WHERE h.hole_number BETWEEN 2 AND 18) > 0
    ) pop
    WHERE pop.player_value IS NOT NULL
  ),
  pop_stats AS (
    SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n
    FROM population_values
    GROUP BY gender
  ),
  pop_ranked AS (
    SELECT
      player_id,
      gender,
      100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value DESC)) AS level_pct
    FROM population_values
  ),
  pga AS (
    SELECT pga_tour_value, pga_p50
    FROM public.golf_pga_standards
    WHERE metric_id = 'opening_hole_delta'
    ORDER BY season DESC
    LIMIT 1
  )
  INSERT INTO public.golf_player_standing AS s (
    player_id, metric_id, player_value, team_avg, team_n, team_pct,
    level_avg, level_n, level_pct,
    pga_value, pga_delta, computed_at
  )
  SELECT
    r.player_id,
    'opening_hole_delta'::text,
    r.player_value,
    r.team_avg,
    r.team_n::int,
    CASE WHEN r.team_n >= v_min_team_n THEN r.team_pct ELSE NULL END,
    CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg ELSE NULL END,
    ps.level_n::int,
    CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct ELSE NULL END,
    COALESCE(pga.pga_tour_value, pga.pga_p50),
    r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50),
    now()
  FROM ranked r
  JOIN pop_stats ps ON ps.gender = r.gender
  LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
  CROSS JOIN pga
  WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
  ON CONFLICT (player_id, metric_id) DO UPDATE
  SET player_value = EXCLUDED.player_value,
      team_avg     = EXCLUDED.team_avg,
      team_n       = EXCLUDED.team_n,
      team_pct     = EXCLUDED.team_pct,
      level_avg    = EXCLUDED.level_avg,
      level_n      = EXCLUDED.level_n,
      level_pct    = EXCLUDED.level_pct,
      pga_value    = EXCLUDED.pga_value,
      pga_delta    = EXCLUDED.pga_delta,
      computed_at  = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  out_metric_id := 'opening_hole_delta';
  out_rows_upserted := v_rows;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."refresh_player_standing_round_metrics"("p_team_ids" "uuid"[]) IS 'v3 W24 prep + cohort baseline (SC3, 2026-06-06) + gender-scoped level cohort (audit P3, 2026-06-09). Round-level standing for practice_tournament_delta + opening_hole_delta with per-team team_avg/team_pct AND an app-wide college-population level_avg/level_n/level_pct now SCOPED BY golf_teams.gender (MIN_COHORT_N=8) so women and men no longer share a pooled baseline. team_pct is NULLed when team_n<3 (tiny-N percentile guard, EC-2). Companion to refresh_player_standing. Same (metric_id, rows_upserted) return shape (aliased out_*). pg-2 (2026-06-09): pressure buckets gated at >=3 to match the TS MIN_ROUNDS_PER_BUCKET floor.';

CREATE OR REPLACE FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) RETURNS TABLE("out_metric_id" "text", "out_rows_upserted" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_bands text[][] := ARRAY[
    ['approach_proximity_50_125ft',   '50',  '125'],
    ['approach_proximity_125_175ft',  '125', '175'],
    ['approach_proximity_175_plus_ft','175', '100000']
  ];
  v_n int := array_length(v_bands, 1);
  v_i int;
  v_metric text;
  v_lo numeric;
  v_hi numeric;
  v_rows bigint;
  v_min_greens constant int := 3;
  v_min_cohort_n constant int := 8;
  v_min_team_n constant int := 3;
BEGIN
  IF p_team_ids IS NULL OR array_length(p_team_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  v_i := 1;
  WHILE v_i <= v_n LOOP
    v_metric := v_bands[v_i][1];
    v_lo := v_bands[v_i][2]::numeric;
    v_hi := v_bands[v_i][3]::numeric;
    WITH base AS (
      SELECT
        p.id AS player_id,
        AVG(
          CASE WHEN lower(coalesce(s.distance_unit_after, 'feet')) = 'yards'
               THEN s.distance_to_hole_after * 3.0
               ELSE s.distance_to_hole_after END
        ) AS player_value,
        COUNT(*) AS greens
      FROM public.golf_players p
      JOIN public.golf_team_members tmx
        ON tmx.player_id = p.id AND tmx.status = 'active'::team_member_status
      JOIN public.golf_rounds r
        ON r.player_id = p.id AND r.status = 'completed'
      JOIN public.golf_shots s
        ON s.round_id = r.id
       AND s.shot_type = 'approach'
       AND s.distance_to_hole_before IS NOT NULL
       AND s.distance_to_hole_after IS NOT NULL
       AND (lower(coalesce(s.result, '')) IN ('green', 'hole', 'gir')
            OR lower(coalesce(s.lie_after, '')) = 'green')
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet'
                 THEN s.distance_to_hole_before / 3.0
                 ELSE s.distance_to_hole_before END) >= v_lo
       AND (CASE WHEN lower(coalesce(s.distance_unit_before, 'yards')) = 'feet'
                 THEN s.distance_to_hole_before / 3.0
                 ELSE s.distance_to_hole_before END) < v_hi
      GROUP BY p.id
      HAVING COUNT(*) >= v_min_greens
    ),
    team_values AS (
      SELECT b.player_id, tm.team_id, COALESCE(t.gender, 'mens') AS gender, b.player_value
      FROM base b
      JOIN public.golf_team_members tm
        ON tm.player_id = b.player_id AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
      WHERE tm.team_id = ANY (p_team_ids)
    ),
    team_stats AS (
      SELECT team_id, AVG(player_value) AS team_avg, COUNT(*) AS team_n
      FROM team_values GROUP BY team_id
    ),
    ranked AS (
      SELECT tv.player_id, tv.team_id, tv.gender, tv.player_value, ts.team_avg, ts.team_n,
        100 * (PERCENT_RANK() OVER (PARTITION BY tv.team_id ORDER BY tv.player_value DESC)) AS team_pct
      FROM team_values tv JOIN team_stats ts ON ts.team_id = tv.team_id
    ),
    population_values AS (
      SELECT DISTINCT b.player_id, COALESCE(t.gender, 'mens') AS gender, b.player_value
      FROM base b
      JOIN public.golf_team_members tm
        ON tm.player_id = b.player_id AND tm.status = 'active'::team_member_status
      JOIN public.golf_teams t
        ON t.id = tm.team_id
    ),
    pop_stats AS (
      SELECT gender, AVG(player_value) AS level_avg, COUNT(*) AS level_n
      FROM population_values GROUP BY gender
    ),
    pop_ranked AS (
      SELECT player_id, gender,
        100 * (PERCENT_RANK() OVER (PARTITION BY gender ORDER BY player_value DESC)) AS level_pct
      FROM population_values
    ),
    pga AS (
      SELECT pga_tour_value, pga_p50 FROM public.golf_pga_standards
      WHERE metric_id = v_metric ORDER BY season DESC LIMIT 1
    )
    INSERT INTO public.golf_player_standing AS s (
      player_id, metric_id, player_value, team_avg, team_n, team_pct,
      level_avg, level_n, level_pct, pga_value, pga_delta, computed_at
    )
    SELECT r.player_id, v_metric, r.player_value, r.team_avg, r.team_n::int,
      CASE WHEN r.team_n >= v_min_team_n THEN r.team_pct ELSE NULL END,
      CASE WHEN ps.level_n >= v_min_cohort_n THEN ps.level_avg ELSE NULL END,
      ps.level_n::int,
      CASE WHEN ps.level_n >= v_min_cohort_n THEN pr.level_pct ELSE NULL END,
      COALESCE(pga.pga_tour_value, pga.pga_p50),
      r.player_value - COALESCE(pga.pga_tour_value, pga.pga_p50), now()
    FROM ranked r
    JOIN pop_stats ps ON ps.gender = r.gender
    LEFT JOIN pop_ranked pr ON pr.player_id = r.player_id AND pr.gender = r.gender
    CROSS JOIN pga
    WHERE COALESCE(pga.pga_tour_value, pga.pga_p50) IS NOT NULL
    ON CONFLICT (player_id, metric_id) DO UPDATE
    SET player_value = EXCLUDED.player_value, team_avg = EXCLUDED.team_avg, team_n = EXCLUDED.team_n,
        team_pct = EXCLUDED.team_pct, level_avg = EXCLUDED.level_avg, level_n = EXCLUDED.level_n,
        level_pct = EXCLUDED.level_pct, pga_value = EXCLUDED.pga_value, pga_delta = EXCLUDED.pga_delta,
        computed_at = now();
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    out_metric_id := v_metric;
    out_rows_upserted := v_rows;
    RETURN NEXT;
    v_i := v_i + 1;
  END LOOP;
END;
$$;

ALTER FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."refresh_player_standing_shot_metrics"("p_team_ids" "uuid"[]) IS 'v3 2026-06-05 + tiny-N team_pct guard (EC-2, 2026-06-06) + gender-scoped level cohort (audit P3, 2026-06-09). Shot-level approach-proximity-by-band standings (50-125 / 125-175 / 175+ yd, on-green feet) with team + app-wide cohort (now SCOPED BY golf_teams.gender, MIN_COHORT_N=8) + PGA. team_pct is NULLed when team_n<3. Companion to refresh_player_standing; same (metric_id, rows_upserted) shape (aliased out_*). MIN_GREENS=3 per band.';

CREATE OR REPLACE FUNCTION "public"."refresh_player_stats_cache"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM golf_round_stats_cache WHERE player_id = p_player_id;

  IF NOT EXISTS (SELECT 1 FROM golf_rounds WHERE player_id = p_player_id AND status = 'completed') THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = p_player_id;
    RETURN;
  END IF;

  INSERT INTO golf_round_stats_cache (
    round_id, player_id, total_score, score_to_par, front_nine, back_nine,
    fairways_hit, fairways_total, greens_hit, greens_total, total_putts, one_putts, three_putts,
    scrambles_converted, scramble_attempts, sand_saves, sand_attempts,
    eagles, birdies, pars, bogeys, double_bogeys, triple_plus, penalty_strokes, driving_distance_avg,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  )
  SELECT
    r.id, r.player_id, r.total_score, r.score_to_par,
    COALESCE(r.front_nine, SUM(h.score) FILTER (WHERE h.hole_number <= 9), 0),
    COALESCE(r.back_nine, SUM(h.score) FILTER (WHERE h.hole_number > 9), 0),
    COALESCE(r.total_fairways_hit, COUNT(*) FILTER (WHERE h.fairway_hit = true)),
    COALESCE(r.total_fairways, COUNT(*) FILTER (WHERE h.par > 3 AND h.fairway_hit IS NOT NULL)),
    COALESCE(r.total_gir, COUNT(*) FILTER (WHERE h.gir = true)),
    COALESCE(r.total_gir_possible, COUNT(*) FILTER (WHERE h.score IS NOT NULL)),
    COALESCE(r.total_putts, SUM(h.putts)),
    COALESCE(COUNT(*) FILTER (WHERE h.putts = 1), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.putts >= 3), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND (h.score - h.par) <= 0 AND h.score IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.gir = false AND h.score IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save = true), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.sand_save IS NOT NULL), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) <= -2), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = -1), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 0), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 1), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) = 2), 0),
    COALESCE(COUNT(*) FILTER (WHERE h.score IS NOT NULL AND (h.score - h.par) >= 3), 0),
    SUM(COALESCE(h.penalty_strokes, 0)),
    (SELECT AVG(gs.shot_distance) FROM golf_shots gs JOIN golf_holes gh ON gh.id = gs.hole_id
      WHERE gh.round_id = r.id AND gs.shot_type = 'tee' AND gs.shot_distance IS NOT NULL AND gs.shot_distance > 0),
    r.strokes_gained_total, r.strokes_gained_tee, r.strokes_gained_approach, r.strokes_gained_around_green, r.strokes_gained_putting,
    NOW(), NOW()
  FROM golf_rounds r
  LEFT JOIN golf_holes h ON h.round_id = r.id
  WHERE r.player_id = p_player_id AND r.status = 'completed'
  GROUP BY r.id, r.player_id, r.total_score, r.score_to_par, r.front_nine, r.back_nine,
    r.total_fairways_hit, r.total_fairways, r.total_gir, r.total_gir_possible, r.total_putts, r.total_penalties,
    r.strokes_gained_total, r.strokes_gained_tee, r.strokes_gained_approach, r.strokes_gained_around_green, r.strokes_gained_putting
  ON CONFLICT (round_id) DO UPDATE SET
    total_score = EXCLUDED.total_score, score_to_par = EXCLUDED.score_to_par,
    front_nine = EXCLUDED.front_nine, back_nine = EXCLUDED.back_nine,
    fairways_hit = EXCLUDED.fairways_hit, fairways_total = EXCLUDED.fairways_total,
    greens_hit = EXCLUDED.greens_hit, greens_total = EXCLUDED.greens_total,
    total_putts = EXCLUDED.total_putts, one_putts = EXCLUDED.one_putts, three_putts = EXCLUDED.three_putts,
    scrambles_converted = EXCLUDED.scrambles_converted, scramble_attempts = EXCLUDED.scramble_attempts,
    sand_saves = EXCLUDED.sand_saves, sand_attempts = EXCLUDED.sand_attempts,
    eagles = EXCLUDED.eagles, birdies = EXCLUDED.birdies, pars = EXCLUDED.pars,
    bogeys = EXCLUDED.bogeys, double_bogeys = EXCLUDED.double_bogeys, triple_plus = EXCLUDED.triple_plus,
    penalty_strokes = EXCLUDED.penalty_strokes, driving_distance_avg = EXCLUDED.driving_distance_avg,
    strokes_gained_total = EXCLUDED.strokes_gained_total, strokes_gained_tee = EXCLUDED.strokes_gained_tee,
    strokes_gained_approach = EXCLUDED.strokes_gained_approach, strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting = EXCLUDED.strokes_gained_putting, updated_at = NOW();

  UPDATE golf_player_stats_cache psc
  SET par3_average = sub.par3_avg, par4_average = sub.par4_avg, par5_average = sub.par5_avg,
      up_and_down_percentage = sub.ud_pct, updated_at = NOW()
  FROM (
    SELECT AVG(h.score) FILTER (WHERE h.par = 3) AS par3_avg,
           AVG(h.score) FILTER (WHERE h.par = 4) AS par4_avg,
           AVG(h.score) FILTER (WHERE h.par = 5) AS par5_avg,
           CASE WHEN COUNT(*) FILTER (WHERE h.up_and_down IS NOT NULL) > 0
                THEN 100.0 * COUNT(*) FILTER (WHERE h.up_and_down IS TRUE)
                     / COUNT(*) FILTER (WHERE h.up_and_down IS NOT NULL)
           END AS ud_pct
    FROM golf_holes h JOIN golf_rounds r ON r.id = h.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed'
  ) sub
  WHERE psc.player_id = p_player_id;

  PERFORM update_player_putt_make_pct(p_player_id);

  PERFORM update_player_distance_proximity(p_player_id);

  UPDATE golf_player_stats_cache SET is_stale = false, updated_at = NOW() WHERE player_id = p_player_id;
END;
$$;

ALTER FUNCTION "public"."refresh_player_stats_cache"("p_player_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."refresh_player_stats_cache"("p_player_id" "uuid") IS 'RPC function to fully recompute stats cache for a specific player. Normalizes all per-round stats to 18-hole equivalents.';

CREATE OR REPLACE FUNCTION "public"."release_baseball_team_invitation_redemption"("p_invitation_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.baseball_team_invitations
  SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
  WHERE id = p_invitation_id;
END;
$$;

ALTER FUNCTION "public"."release_baseball_team_invitation_redemption"("p_invitation_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."resolve_admin_event"("p_event_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_events
  SET resolved = true,
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = ANY(p_event_ids)
    AND resolved = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

ALTER FUNCTION "public"."resolve_admin_event"("p_event_ids" "uuid"[]) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."resolve_baseball_team_by_join_code"("p_join_code" "text") RETURNS TABLE("id" "uuid", "name" "text", "team_type" "public"."baseball_coach_type", "organization_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT bt.id, bt.name, bt.team_type, bt.organization_id
  FROM public.baseball_teams bt
  WHERE bt.join_code = p_join_code
  LIMIT 1;
$$;

ALTER FUNCTION "public"."resolve_baseball_team_by_join_code"("p_join_code" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."resolve_baseball_team_invitation_by_code"("p_code" "text") RETURNS TABLE("invitation_id" "uuid", "team_id" "uuid", "expires_at" timestamp with time zone, "is_active" boolean, "max_uses" integer, "used_count" integer, "team_name" "text", "team_type" "public"."baseball_coach_type", "organization_name" "text", "organization_city" "text", "organization_state" "text", "organization_logo_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT
    bti.id,
    bti.team_id,
    bti.expires_at,
    bti.is_active,
    bti.max_uses,
    bti.used_count,
    bt.name,
    bt.team_type,
    o.name,
    o.location_city,
    o.location_state,
    o.logo_url
  FROM public.baseball_team_invitations bti
  JOIN public.baseball_teams bt ON bt.id = bti.team_id
  LEFT JOIN public.organizations o ON o.id = bt.organization_id
  WHERE bti.code = p_code
  LIMIT 1;
$$;

ALTER FUNCTION "public"."resolve_baseball_team_invitation_by_code"("p_code" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, new_data)
  VALUES (auth.uid(), 'admin.revoke_sessions', 'auth.sessions', p_user_id,
          jsonb_build_object('revoked_count', v_count, 'target_user', p_user_id));

  RETURN v_count;
END;
$$;

ALTER FUNCTION "public"."revoke_user_sessions"("p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."run_integrity_checks"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v jsonb := '[]'::jsonb;
  n bigint;
  sample jsonb;
BEGIN
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT m.id, row_number() OVER () AS rn
    FROM golf_team_members m
    LEFT JOIN golf_teams t ON t.id = m.team_id
    WHERE m.team_id IS NOT NULL AND t.id IS NULL
  ) q;
  v := v || jsonb_build_object('check', 'orphaned_golf_team_members',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT c.id, row_number() OVER () AS rn
    FROM golf_player_stats_cache c
    LEFT JOIN golf_players p ON p.id = c.player_id
    WHERE p.id IS NULL
  ) q;
  v := v || jsonb_build_object('check', 'stats_cache_deleted_players',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);
  SELECT count(*) INTO n FROM (
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='admin_allowlist')
    UNION ALL
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='admin_events' AND column_name='fingerprint')
    UNION ALL
    SELECT 1 WHERE NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
      WHERE ns.nspname='public' AND p.proname='is_super_admin')
  ) missing;
  v := v || jsonb_build_object('check', 'bridge_schema_canaries',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', '[]'::jsonb);
  SELECT count(*), COALESCE(jsonb_agg(objname) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT c.relname AS objname, row_number() OVER () AS rn
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relname IN ('admin_allowlist', 'admin_events', 'error_logs', 'background_job_logs', 'audit_log', 'login_attempts')
      AND (has_table_privilege('anon', c.oid, 'SELECT')
        OR has_table_privilege('anon', c.oid, 'INSERT')
        OR has_table_privilege('anon', c.oid, 'UPDATE')
        OR has_table_privilege('anon', c.oid, 'DELETE'))
  ) q;
  v := v || jsonb_build_object('check', 'anon_grant_drift',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);
  SELECT count(*), COALESCE(jsonb_agg(objname) FILTER (WHERE rn <= 15), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT t.tbl AS objname, row_number() OVER () AS rn
    FROM unnest(ARRAY[
      'demo_requests', 'crm_coaches', 'crm_contact_log', 'crm_events',
      'crm_email_templates', 'crm_notes', 'crm_replies', 'crm_segments',
      'crm_sequences', 'crm_sequence_steps', 'crm_sequence_enrollments',
      'crm_tasks', 'crm_automations', 'crm_email_suppressions', 'email_events'
    ]) AS t(tbl)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = t.tbl
        AND p.cmd IN ('SELECT', 'ALL')
        AND p.roles && ARRAY['authenticated', 'public']::name[]
    )
  ) q;
  v := v || jsonb_build_object('check', 'admin_count_vs_list_readability',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);
  SELECT count(*), COALESCE(jsonb_agg(id) FILTER (WHERE rn <= 5), '[]'::jsonb)
  INTO n, sample
  FROM (
    SELECT r.id, row_number() OVER (ORDER BY r.created_at DESC) AS rn
    FROM golf_rounds r
    WHERE r.status = 'completed'
      AND r.id <> ALL (ARRAY[
        '0b000000-0000-4000-b000-000000000001',
        '0b000000-0000-4000-b000-000000000002',
        '0b000000-0000-4000-b000-000000000003',
        '0b000000-0000-4000-b000-000000000004'
      ]::uuid[])
      AND NOT EXISTS (
        SELECT 1 FROM golf_holes h
        WHERE h.round_id = r.id AND h.score IS NOT NULL
      )
  ) q;
  v := v || jsonb_build_object('check', 'completed_round_zero_scored_holes',
    'status', CASE WHEN n = 0 THEN 'pass' ELSE 'fail' END, 'count', n, 'sample', sample);
  RETURN v;
END;
$$;

ALTER FUNCTION "public"."run_integrity_checks"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."save_baseball_full_box_score"("p_game_id" "uuid", "p_batting" "jsonb", "p_pitching" "jsonb", "p_our_score" integer, "p_opponent_score" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_coach_id uuid;
  v_team_id uuid;
  v_season_year integer;
  v_player_id uuid;
  v_bat jsonb;
  v_pit jsonb;
  v_batting_player_ids uuid[] := ARRAY[]::uuid[];
  v_pitching_player_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT bc.id INTO v_coach_id
  FROM public.baseball_coaches bc
  WHERE bc.user_id = v_user_id;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Coach profile not found');
  END IF;

  SELECT bg.team_id, EXTRACT(YEAR FROM bg.game_date)::integer
  INTO v_team_id, v_season_year
  FROM public.baseball_games bg
  WHERE bg.id = p_game_id;

  IF v_team_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Game not found');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.baseball_team_coach_staff tcs
    WHERE tcs.team_id = v_team_id
      AND tcs.coach_id = v_coach_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  IF p_batting IS NOT NULL AND jsonb_typeof(p_batting) = 'array' THEN
    SELECT COALESCE(array_agg((elem->>'player_id')::uuid), ARRAY[]::uuid[])
    INTO v_batting_player_ids
    FROM jsonb_array_elements(p_batting) AS elem
    WHERE elem->>'player_id' IS NOT NULL;

    FOR v_bat IN SELECT * FROM jsonb_array_elements(p_batting)
    LOOP
      INSERT INTO public.baseball_box_score_batting (
        game_id, player_id, team_id, batting_order,
        ab, r, h, doubles, triples, hr, rbi, bb, k, sb, cs, hbp, sac, sf, lob,
        avg, obp, slg, ops
      ) VALUES (
        p_game_id,
        (v_bat->>'player_id')::uuid,
        v_team_id,
        NULLIF(v_bat->>'batting_order', '')::integer,
        COALESCE((v_bat->>'ab')::integer, 0),
        COALESCE((v_bat->>'r')::integer, 0),
        COALESCE((v_bat->>'h')::integer, 0),
        COALESCE((v_bat->>'doubles')::integer, 0),
        COALESCE((v_bat->>'triples')::integer, 0),
        COALESCE((v_bat->>'hr')::integer, 0),
        COALESCE((v_bat->>'rbi')::integer, 0),
        COALESCE((v_bat->>'bb')::integer, 0),
        COALESCE((v_bat->>'k')::integer, 0),
        COALESCE((v_bat->>'sb')::integer, 0),
        COALESCE((v_bat->>'cs')::integer, 0),
        COALESCE((v_bat->>'hbp')::integer, 0),
        COALESCE((v_bat->>'sac')::integer, 0),
        COALESCE((v_bat->>'sf')::integer, 0),
        COALESCE((v_bat->>'lob')::integer, 0),
        NULLIF(v_bat->>'avg', '')::numeric,
        NULLIF(v_bat->>'obp', '')::numeric,
        NULLIF(v_bat->>'slg', '')::numeric,
        NULLIF(v_bat->>'ops', '')::numeric
      )
      ON CONFLICT (game_id, player_id) DO UPDATE SET
        team_id = EXCLUDED.team_id,
        batting_order = EXCLUDED.batting_order,
        ab = EXCLUDED.ab,
        r = EXCLUDED.r,
        h = EXCLUDED.h,
        doubles = EXCLUDED.doubles,
        triples = EXCLUDED.triples,
        hr = EXCLUDED.hr,
        rbi = EXCLUDED.rbi,
        bb = EXCLUDED.bb,
        k = EXCLUDED.k,
        sb = EXCLUDED.sb,
        cs = EXCLUDED.cs,
        hbp = EXCLUDED.hbp,
        sac = EXCLUDED.sac,
        sf = EXCLUDED.sf,
        lob = EXCLUDED.lob,
        avg = EXCLUDED.avg,
        obp = EXCLUDED.obp,
        slg = EXCLUDED.slg,
        ops = EXCLUDED.ops;
    END LOOP;
  END IF;

  DELETE FROM public.baseball_box_score_batting
  WHERE game_id = p_game_id
    AND player_id <> ALL (v_batting_player_ids);

  IF p_pitching IS NOT NULL AND jsonb_typeof(p_pitching) = 'array' THEN
    SELECT COALESCE(array_agg((elem->>'player_id')::uuid), ARRAY[]::uuid[])
    INTO v_pitching_player_ids
    FROM jsonb_array_elements(p_pitching) AS elem
    WHERE elem->>'player_id' IS NOT NULL;

    FOR v_pit IN SELECT * FROM jsonb_array_elements(p_pitching)
    LOOP
      INSERT INTO public.baseball_box_score_pitching (
        game_id, player_id, team_id,
        ip, h, r, er, bb, k, hr, pitch_count, strikes, result,
        era, whip, k9, bb9
      ) VALUES (
        p_game_id,
        (v_pit->>'player_id')::uuid,
        v_team_id,
        COALESCE(NULLIF(v_pit->>'ip', '')::numeric, 0),
        COALESCE((v_pit->>'h')::integer, 0),
        COALESCE((v_pit->>'r')::integer, 0),
        COALESCE((v_pit->>'er')::integer, 0),
        COALESCE((v_pit->>'bb')::integer, 0),
        COALESCE((v_pit->>'k')::integer, 0),
        COALESCE((v_pit->>'hr')::integer, 0),
        NULLIF(v_pit->>'pitch_count', '')::integer,
        NULLIF(v_pit->>'strikes', '')::integer,
        NULLIF(v_pit->>'result', ''),
        NULLIF(v_pit->>'era', '')::numeric,
        NULLIF(v_pit->>'whip', '')::numeric,
        NULLIF(v_pit->>'k9', '')::numeric,
        NULLIF(v_pit->>'bb9', '')::numeric
      )
      ON CONFLICT (game_id, player_id) DO UPDATE SET
        team_id = EXCLUDED.team_id,
        ip = EXCLUDED.ip,
        h = EXCLUDED.h,
        r = EXCLUDED.r,
        er = EXCLUDED.er,
        bb = EXCLUDED.bb,
        k = EXCLUDED.k,
        hr = EXCLUDED.hr,
        pitch_count = EXCLUDED.pitch_count,
        strikes = EXCLUDED.strikes,
        result = EXCLUDED.result,
        era = EXCLUDED.era,
        whip = EXCLUDED.whip,
        k9 = EXCLUDED.k9,
        bb9 = EXCLUDED.bb9;
    END LOOP;
  END IF;

  DELETE FROM public.baseball_box_score_pitching
  WHERE game_id = p_game_id
    AND player_id <> ALL (v_pitching_player_ids);

  UPDATE public.baseball_games
  SET status = 'completed',
      our_score = p_our_score,
      opponent_score = p_opponent_score,
      updated_at = now()
  WHERE id = p_game_id;

  FOR v_player_id IN
    SELECT DISTINCT player_id FROM (
      SELECT player_id FROM public.baseball_box_score_batting WHERE game_id = p_game_id
      UNION
      SELECT player_id FROM public.baseball_box_score_pitching WHERE game_id = p_game_id
    ) players
  LOOP
    BEGIN
      PERFORM public.recalculate_baseball_season_stats(v_player_id, v_team_id, v_season_year);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'save_baseball_full_box_score: recalc failed for player % game % season %: % (SQLSTATE %)',
          v_player_id, p_game_id, v_season_year, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Box score save failed',
      'error_detail', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$;

ALTER FUNCTION "public"."save_baseball_full_box_score"("p_game_id" "uuid", "p_batting" "jsonb", "p_pitching" "jsonb", "p_our_score" integer, "p_opponent_score" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."save_partial_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb" DEFAULT NULL::"jsonb", "p_approach_details" "jsonb" DEFAULT NULL::"jsonb", "p_expected_updated_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '20s'
    SET "lock_timeout" TO '10s'
    AS $$
DECLARE
  v_player_id UUID;
  v_round_status TEXT;
  v_current_updated_at TIMESTAMPTZ;
  v_hole_record JSONB;
  v_shot_group JSONB;
  v_shot JSONB;
  v_detail JSONB;
  v_inserted_holes JSONB := '[]'::JSONB;
  v_inserted_shots JSONB := '[]'::JSONB;
  v_hole_id UUID;
  v_hole_number INT;
  v_shot_id UUID;
  v_new_updated_at TIMESTAMPTZ;
  v_warnings JSONB := '[]'::JSONB;
  v_err_state TEXT;
  v_err_msg TEXT;
  -- Sanitized values
  v_distance_feet NUMERIC;
  v_break_direction TEXT;
  v_lie_type TEXT;
  v_miss_direction TEXT;
  v_distance_from_green NUMERIC;
  v_estimated_break INT;
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);
  PERFORM helm_private.configure_trace_context(p_round_data);
  PERFORM helm_private.trace_checkpoint('db.save_partial_round_atomic', NULL, 'enter', 'started', jsonb_build_object('function', 'save_partial_round_atomic'));
  SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Player profile not found for authenticated user.'
    );
  END IF;

  -- SINGLE-FLIGHT GUARD. NOWAIT means: if any writer already holds this
  -- round's row (a concurrent auto-save mid-transaction, or a submit), do not
  -- queue behind it — skip this save. The caller treats 'busy' as a no-op and
  -- the next auto-save tick re-sends the full state.
  BEGIN
    SELECT status, updated_at INTO v_round_status, v_current_updated_at
    FROM golf_rounds
    WHERE id = p_round_id
      AND player_id = v_player_id
    FOR UPDATE NOWAIT;
  EXCEPTION WHEN lock_not_available THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'busy'
    );
  END;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round not found or you do not have permission to update it.'
    );
  END IF;

  IF v_round_status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Round has already been completed. Auto-save skipped.'
    );
  END IF;

  -- Optimistic locking: reject if the round was modified since the client last saved
  IF p_expected_updated_at IS NOT NULL
     AND v_current_updated_at IS NOT NULL
     AND v_current_updated_at > p_expected_updated_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'conflict'
    );
  END IF;


  -- Validate before the round row, holes, or shots are changed. Returning a
  -- normal ActionResult keeps the prior durable graph available to Continue
  -- Round and avoids turning a stale browser payload into destructive work.
  IF p_shots IS NOT NULL AND jsonb_typeof(p_shots) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_snapshot',
      'error', 'Your round snapshot could not be verified. Your saved shots are safe; please retry.'
    );
  END IF;

  IF p_shots IS NOT NULL AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_shots) AS shot_group
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_holes) = 'array' THEN p_holes
          ELSE '[]'::jsonb
        END
      ) AS hole_record
      WHERE hole_record->>'hole_number' = shot_group->>'hole_number'
    )
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_snapshot',
      'error', 'Your round snapshot could not be verified. Your saved shots are safe; please retry.'
    );
  END IF;


  v_new_updated_at := NOW();

  PERFORM helm_private.trace_checkpoint('db.save_partial_round_atomic.update_round', 'db.save_partial_round_atomic', 'before', 'started', jsonb_build_object('table', 'golf_rounds'));
  UPDATE golf_rounds SET
    course_name = COALESCE(p_round_data->>'course_name', course_name),
    course_city = p_round_data->>'course_city',
    course_state = p_round_data->>'course_state',
    course_rating = CASE WHEN p_round_data->>'course_rating' IS NULL THEN NULL ELSE (p_round_data->>'course_rating')::NUMERIC END,
    course_slope = CASE WHEN p_round_data->>'course_slope' IS NULL THEN NULL ELSE (p_round_data->>'course_slope')::INT END,
    tees_played = p_round_data->>'tees_played', tee_id = CASE WHEN p_round_data->>'tee_id' IS NULL THEN NULL ELSE (p_round_data->>'tee_id')::uuid END, course_id = COALESCE((p_round_data->>'course_id')::uuid, course_id),
    round_type = case when qualifier_id is not null then 'qualifier' else coalesce(p_round_data->>'round_type', round_type) end,
    round_date = COALESCE((p_round_data->>'round_date')::DATE, round_date),
    holes_played = COALESCE((p_round_data->>'holes_played')::INT, holes_played),
    current_hole = CASE WHEN p_round_data->>'current_hole' IS NULL THEN current_hole ELSE (p_round_data->>'current_hole')::INT END,
    draft_data = CASE
      WHEN p_round_data->'draft_data' IS NOT NULL
      THEN p_round_data->'draft_data'
      ELSE draft_data
    END,
    updated_at = v_new_updated_at
  WHERE id = p_round_id
    AND player_id = v_player_id;

  PERFORM helm_private.trace_checkpoint('db.save_partial_round_atomic.replace_snapshot', 'db.save_partial_round_atomic', 'before', 'started', jsonb_build_object('tables', jsonb_build_array('golf_shots', 'golf_holes')));
  DELETE FROM golf_shots WHERE round_id = p_round_id;
  DELETE FROM golf_holes WHERE round_id = p_round_id;

  PERFORM helm_private.trace_checkpoint('db.save_partial_round_atomic.insert_holes', 'db.save_partial_round_atomic', 'before', 'started', jsonb_build_object('expected_holes', coalesce(jsonb_array_length(p_holes), 0)));
  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN
    FOR v_hole_record IN SELECT * FROM jsonb_array_elements(p_holes)
    LOOP
      INSERT INTO golf_holes (
        round_id, hole_number, par, score, putts,
        fairway_hit, gir, penalty_strokes,
        up_and_down, sand_save, yardage
      ) VALUES (
        p_round_id,
        (v_hole_record->>'hole_number')::INT,
        (v_hole_record->>'par')::INT,
        CASE WHEN v_hole_record->>'score' IS NULL THEN NULL ELSE (v_hole_record->>'score')::INT END,
        CASE WHEN v_hole_record->>'putts' IS NULL THEN NULL ELSE (v_hole_record->>'putts')::INT END,
        CASE WHEN v_hole_record->>'fairway_hit' IS NULL THEN NULL ELSE (v_hole_record->>'fairway_hit')::BOOLEAN END,
        CASE WHEN v_hole_record->>'gir' IS NULL THEN NULL ELSE (v_hole_record->>'gir')::BOOLEAN END,
        CASE WHEN v_hole_record->>'penalty_strokes' IS NULL THEN NULL ELSE (v_hole_record->>'penalty_strokes')::INT END,
        CASE WHEN v_hole_record->>'up_and_down' IS NULL THEN NULL ELSE (v_hole_record->>'up_and_down')::BOOLEAN END,
        CASE WHEN v_hole_record->>'sand_save' IS NULL THEN NULL ELSE (v_hole_record->>'sand_save')::BOOLEAN END,
        CASE WHEN v_hole_record->>'yardage' IS NULL THEN NULL ELSE (v_hole_record->>'yardage')::INT END
      )
      RETURNING id, hole_number INTO v_hole_id, v_hole_number;

      v_inserted_holes := v_inserted_holes || jsonb_build_object(
        'hole_id', v_hole_id,
        'hole_number', v_hole_number
      );
    END LOOP;
  END IF;

  PERFORM helm_private.trace_checkpoint('db.save_partial_round_atomic.insert_shots', 'db.save_partial_round_atomic', 'before', 'started', jsonb_build_object('shot_groups', coalesce(jsonb_array_length(p_shots), 0)));
  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN
    FOR v_shot_group IN SELECT * FROM jsonb_array_elements(p_shots)
    LOOP
      v_hole_number := (v_shot_group->>'hole_number')::INT;
      SELECT (elem->>'hole_id')::UUID INTO v_hole_id
      FROM jsonb_array_elements(v_inserted_holes) elem
      WHERE (elem->>'hole_number')::INT = v_hole_number
      LIMIT 1;


      IF v_hole_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'Round snapshot has a shot group without a persisted hole.',
          DETAIL = format('round_id=%s hole_number=%s', p_round_id, v_hole_number),
          HINT = 'Retry with a complete round snapshot.';
      END IF;


      FOR v_shot IN SELECT * FROM jsonb_array_elements(v_shot_group->'shots')
      LOOP
        INSERT INTO golf_shots (
          round_id, hole_id, hole_number, shot_number,
          shot_type, club_type, lie_before, lie_after,
          distance_to_hole_before, distance_unit_before,
          result, distance_to_hole_after, distance_unit_after,
          shot_distance, miss_direction,
          putt_break, putt_slope, putt_distance_feet, putt_made,
          is_penalty, penalty_type
        ) VALUES (
          p_round_id,
          v_hole_id,
          v_hole_number,
          (v_shot->>'shot_number')::INT,
          v_shot->>'shot_type',
          v_shot->>'club_type',
          v_shot->>'lie_before',
          v_shot->>'lie_after',
          (v_shot->>'distance_to_hole_before')::NUMERIC,
          v_shot->>'distance_unit_before',
          v_shot->>'result',
          CASE WHEN v_shot->>'distance_to_hole_after' IS NULL THEN NULL ELSE (v_shot->>'distance_to_hole_after')::NUMERIC END,
          v_shot->>'distance_unit_after',
          CASE WHEN v_shot->>'shot_distance' IS NULL THEN NULL ELSE (v_shot->>'shot_distance')::NUMERIC END,
          v_shot->>'miss_direction',
          v_shot->>'putt_break',
          v_shot->>'putt_slope',
          CASE WHEN v_shot->>'putt_distance_feet' IS NULL THEN NULL ELSE (v_shot->>'putt_distance_feet')::NUMERIC END,
          CASE WHEN v_shot->>'putt_made' IS NULL THEN NULL ELSE (v_shot->>'putt_made')::BOOLEAN END,
          COALESCE((v_shot->>'is_penalty')::BOOLEAN, false),
          v_shot->>'penalty_type'
        )
        RETURNING id INTO v_shot_id;

        v_inserted_shots := v_inserted_shots || jsonb_build_object(
          'shot_id', v_shot_id,
          'hole_number', v_hole_number,
          'shot_number', (v_shot->>'shot_number')::INT
        );
      END LOOP;
    END LOOP;
  END IF;

  -- Insert putt_details with SANITIZATION + resilient savepoints
  IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_putt_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_detail->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_detail->>'shot_number')::INT
      LIMIT 1;

      IF v_shot_id IS NOT NULL THEN
        -- Sanitize distance_feet: clamp to 0-500
        BEGIN
          v_distance_feet := (v_detail->>'distance_feet')::NUMERIC;
          IF v_distance_feet IS NOT NULL THEN
            v_distance_feet := GREATEST(0, LEAST(500, v_distance_feet));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_feet := NULL;
        END;

        -- Sanitize break_direction
        v_break_direction := v_detail->>'break_direction';
        IF v_break_direction IS NOT NULL AND v_break_direction NOT IN ('left_to_right', 'right_to_left', 'straight', 'multiple') THEN
          v_break_direction := NULL;
        END IF;

        -- Sanitize estimated_break_inches: clamp to 0-120
        BEGIN
          v_estimated_break := (v_detail->>'estimated_break_inches')::INT;
          IF v_estimated_break IS NOT NULL THEN
            v_estimated_break := GREATEST(0, LEAST(120, v_estimated_break));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_estimated_break := NULL;
        END;

        BEGIN
          INSERT INTO putt_details (shot_id, miss_tags, break_direction, estimated_break_inches, distance_feet, made)
          VALUES (
            v_shot_id,
            CASE WHEN v_detail->'miss_tags' IS NULL THEN '{}' ELSE ARRAY(SELECT jsonb_array_elements_text(v_detail->'miss_tags')) END,
            v_break_direction,
            v_estimated_break,
            v_distance_feet,
            CASE WHEN v_detail->>'made' IS NULL THEN NULL ELSE (v_detail->>'made')::BOOLEAN END
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_putt_details',
            'hole_number', (v_detail->>'hole_number')::INT,
            'shot_number', (v_detail->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg,
            'failing_data', v_detail
          );
        END;
      END IF;
    END LOOP;
  END IF;

  -- Insert approach_miss_details with SANITIZATION + resilient savepoints
  IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN
    FOR v_detail IN SELECT * FROM jsonb_array_elements(p_approach_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_detail->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_detail->>'shot_number')::INT
      LIMIT 1;

      IF v_shot_id IS NOT NULL THEN
        -- Sanitize lie_type: NULL if not in expanded allowed list
        v_lie_type := v_detail->>'lie_type';
        IF v_lie_type IS NOT NULL AND v_lie_type NOT IN (
          'fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard',
          'green', 'tee', 'other', 'penalty', 'deep_rough'
        ) THEN
          v_lie_type := NULL;
        END IF;

        -- Sanitize miss_direction
        v_miss_direction := v_detail->>'miss_direction';
        IF v_miss_direction IS NOT NULL AND v_miss_direction NOT IN (
          'short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'
        ) THEN
          v_miss_direction := NULL;
        END IF;

        -- Sanitize distance_from_green_yards: clamp >= 0
        BEGIN
          v_distance_from_green := (v_detail->>'distance_from_green_yards')::NUMERIC;
          IF v_distance_from_green IS NOT NULL AND v_distance_from_green < 0 THEN
            v_distance_from_green := 0;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_from_green := NULL;
        END;

        BEGIN
          INSERT INTO approach_miss_details (shot_id, miss_direction, lie_type, distance_from_green_yards)
          VALUES (
            v_shot_id,
            v_miss_direction,
            v_lie_type,
            v_distance_from_green
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_approach_miss_details',
            'hole_number', (v_detail->>'hole_number')::INT,
            'shot_number', (v_detail->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg,
            'failing_data', v_detail
          );
        END;
      END IF;
    END LOOP;
  END IF;

  PERFORM helm_private.trace_checkpoint('db.save_partial_round_atomic.commit', 'db.save_partial_round_atomic', 'before_return', 'success', jsonb_build_object('round_id', p_round_id, 'holes', jsonb_array_length(v_inserted_holes), 'shots', jsonb_array_length(v_inserted_shots)));
  RETURN jsonb_build_object(
    'success', true,
    'round_id', p_round_id,
    'updated_at', v_new_updated_at,
    'warnings', v_warnings
  );
EXCEPTION WHEN OTHERS THEN
  BEGIN
    PERFORM helm_private.trace_exception_checkpoint(p_round_data, 'db.save_partial_round_atomic.exception', 'db.save_partial_round_atomic', SQLSTATE, SQLERRM);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END;
$$;

ALTER FUNCTION "public"."save_partial_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb", "p_expected_updated_at" timestamp with time zone) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."save_partial_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb", "p_expected_updated_at" timestamp with time zone) IS 'Auto-save for an in-progress round. Single-flight per round: FOR UPDATE NOWAIT on the golf_rounds row, returning {success:false, error:busy} when any writer (another auto-save or a submit) already holds it. Callers treat busy as a silent skip - every save carries the full round state, so the next tick covers it.';

CREATE OR REPLACE FUNCTION "public"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT helm_private.save_round_ai_recap(p_round_id, p_recap, auth.uid());
$$;

ALTER FUNCTION "public"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."save_round_ai_recap"("p_round_id" "uuid", "p_recap" "text") IS 'Definer-boundary wrapper for helm_private.save_round_ai_recap. Must stay SECURITY DEFINER: helm_private grants no USAGE to authenticated, so an invoker wrapper cannot reach the implementation (see 20260825233000).';

CREATE OR REPLACE FUNCTION "public"."select_stalest_teams"("p_limit" integer) RETURNS TABLE("team_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.id AS team_id
  FROM public.golf_teams t
  LEFT JOIN LATERAL (
    SELECT MIN(s.computed_at) AS oldest_standing
    FROM public.golf_team_members tm
    JOIN public.golf_player_standing s ON s.player_id = tm.player_id
    WHERE tm.team_id = t.id AND tm.status = 'active'::team_member_status
  ) f ON TRUE
  ORDER BY f.oldest_standing ASC NULLS FIRST, t.created_at ASC
  LIMIT GREATEST(COALESCE(p_limit, 0), 0);
$$;

ALTER FUNCTION "public"."select_stalest_teams"("p_limit" integer) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_calendar_feed_token"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.feed_token IS NULL OR NEW.feed_token = '' THEN
    NEW.feed_token = encode(gen_random_bytes(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_calendar_feed_token"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."set_document_version_number"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Get next version number for this document
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO NEW.version_number
  FROM golf_document_versions
  WHERE document_id = NEW.document_id;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_document_version_number"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sg_baseline_scale"("p_key" "text") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT CASE p_key
    WHEN 'pga_tour' THEN 1.000
    WHEN 'womens'   THEN 1.083
    ELSE 1.000
  END;
$$;

ALTER FUNCTION "public"."sg_baseline_scale"("p_key" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sg_estimate_from_holes"("p_round_id" "uuid") RETURNS TABLE("sg_off_tee" numeric, "sg_approach" numeric, "sg_around_green" numeric, "sg_putting" numeric)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  r_off_tee      NUMERIC := 0;
  r_approach     NUMERIC := 0;
  r_around_green NUMERIC := 0;
  r_putting      NUMERIC := 0;
BEGIN
  SELECT
    ROUND(SUM(1.75 - COALESCE(h.putts, 1.75))::NUMERIC, 2),
    ROUND(SUM(
      CASE WHEN h.par >= 4 THEN
        CASE h.fairway_hit WHEN TRUE THEN 0.20 WHEN FALSE THEN -0.15 ELSE 0 END
      ELSE 0 END
    )::NUMERIC, 2),
    ROUND(SUM(
      CASE h.gir WHEN TRUE THEN 0.25 WHEN FALSE THEN -0.20 ELSE 0 END
    )::NUMERIC, 2),
    ROUND(SUM(
      CASE
        WHEN h.gir = FALSE AND h.up_and_down = TRUE  THEN  0.50
        WHEN h.gir = FALSE AND h.up_and_down = FALSE THEN -0.30
        ELSE 0
      END +
      CASE
        WHEN h.sand_save = TRUE  THEN  0.30
        WHEN h.sand_save = FALSE THEN -0.40
        ELSE 0
      END
    )::NUMERIC, 2)
  INTO r_putting, r_off_tee, r_approach, r_around_green
  FROM golf_holes h
  WHERE h.round_id = p_round_id;

  RETURN QUERY SELECT
    COALESCE(r_off_tee,      0),
    COALESCE(r_approach,     0),
    COALESCE(r_around_green, 0),
    COALESCE(r_putting,      0);
END;
$$;

ALTER FUNCTION "public"."sg_estimate_from_holes"("p_round_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_distances NUMERIC[]; v_strokes NUMERIC[]; v_distance NUMERIC;
  n INTEGER; i INTEGER; ud NUMERIC; ld NUMERIC; us NUMERIC; ls NUMERIC;
BEGIN
  IF p_lie = 'green' THEN
    v_distance  := p_distance_yards * 3.0;
    v_distances := ARRAY[90,60,50,40,30,20,15,10,9,8,7,6,5,4,3,2,1,0]::NUMERIC[];
    v_strokes   := ARRAY[2.40,2.21,2.14,2.06,1.98,1.87,1.78,1.61,1.56,1.50,
                         1.42,1.34,1.23,1.13,1.04,1.01,1.00,0]::NUMERIC[];
  ELSIF p_lie = 'tee' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,540,400,300,240,200,150,120,100,80]::NUMERIC[];
    v_strokes   := ARRAY[4.85,4.65,3.99,3.71,3.25,3.12,2.95,2.88,2.82,2.78]::NUMERIC[];
  ELSIF p_lie = 'fairway' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,180,140,100,80,20]::NUMERIC[];
    v_strokes   := ARRAY[4.78,4.11,3.78,3.45,3.19,3.08,2.91,2.80,2.75,2.40]::NUMERIC[];
  ELSIF p_lie = 'rough' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,100,20]::NUMERIC[];
    v_strokes   := ARRAY[4.97,4.30,3.90,3.64,3.42,3.02,2.59]::NUMERIC[];
  ELSIF p_lie = 'sand' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,100,20]::NUMERIC[];
    v_strokes   := ARRAY[5.36,4.69,4.04,3.84,3.55,3.23,2.53]::NUMERIC[];
  ELSE
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,180,140,100,80,20]::NUMERIC[];
    v_strokes   := ARRAY[4.78,4.11,3.78,3.45,3.19,3.08,2.91,2.80,2.75,2.40]::NUMERIC[];
  END IF;
  IF v_distance <= 0 THEN RETURN 0; END IF;
  n := array_length(v_distances, 1);
  IF v_distance >= v_distances[1] THEN RETURN v_strokes[1]; END IF;
  IF v_distance <= v_distances[n] THEN RETURN v_strokes[n]; END IF;
  FOR i IN 1..(n-1) LOOP
    ud := v_distances[i]; ld := v_distances[i+1];
    IF v_distance <= ud AND v_distance >= ld THEN
      us := v_strokes[i]; ls := v_strokes[i+1];
      RETURN ls + (v_distance - ld)/(ud - ld)*(us - ls);
    END IF;
  END LOOP;
  RETURN 3.0;
END;
$$;

ALTER FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric, "p_scale" numeric DEFAULT 1.0) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_distances NUMERIC[]; v_strokes NUMERIC[]; v_distance NUMERIC;
  n INTEGER; i INTEGER; ud NUMERIC; ld NUMERIC; us NUMERIC; ls NUMERIC;
  v_es NUMERIC;
BEGIN
  IF p_lie = 'green' THEN
    v_distance  := p_distance_yards * 3.0;
    v_distances := ARRAY[90,60,50,40,30,20,15,10,9,8,7,6,5,4,3,2,1,0]::NUMERIC[];
    v_strokes   := ARRAY[2.40,2.21,2.14,2.06,1.98,1.87,1.78,1.61,1.56,1.50,
                         1.42,1.34,1.23,1.13,1.04,1.01,1.00,0]::NUMERIC[];
  ELSIF p_lie = 'tee' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[600,540,400,300,240,200,150,120,100,80]::NUMERIC[];
    v_strokes   := ARRAY[4.85,4.65,3.99,3.71,3.25,3.12,2.95,2.88,2.82,2.78]::NUMERIC[];
  ELSIF p_lie = 'fairway' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,180,140,100,80,20]::NUMERIC[];
    v_strokes   := ARRAY[4.78,4.11,3.78,3.45,3.19,3.08,2.91,2.80,2.75,2.40]::NUMERIC[];
  ELSIF p_lie = 'rough' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,100,20]::NUMERIC[];
    v_strokes   := ARRAY[4.97,4.30,3.90,3.64,3.42,3.02,2.59]::NUMERIC[];
  ELSIF p_lie = 'sand' THEN
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,100,20]::NUMERIC[];
    v_strokes   := ARRAY[5.36,4.69,4.04,3.84,3.55,3.23,2.53]::NUMERIC[];
  ELSE
    v_distance  := p_distance_yards;
    v_distances := ARRAY[540,400,300,240,200,180,140,100,80,20]::NUMERIC[];
    v_strokes   := ARRAY[4.78,4.11,3.78,3.45,3.19,3.08,2.91,2.80,2.75,2.40]::NUMERIC[];
  END IF;
  IF v_distance <= 0 THEN RETURN 0; END IF;
  n := array_length(v_distances, 1);
  IF v_distance >= v_distances[1] THEN
    v_es := v_strokes[1];
  ELSIF v_distance <= v_distances[n] THEN
    v_es := v_strokes[n];
  ELSE
    v_es := 3.0;
    FOR i IN 1..(n-1) LOOP
      ud := v_distances[i]; ld := v_distances[i+1];
      IF v_distance <= ud AND v_distance >= ld THEN
        us := v_strokes[i]; ls := v_strokes[i+1];
        v_es := ls + (v_distance - ld)/(ud - ld)*(us - ls);
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN v_es * COALESCE(p_scale, 1.0);
END;
$$;

ALTER FUNCTION "public"."sg_expected_strokes"("p_lie" "text", "p_distance_yards" numeric, "p_scale" numeric) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sg_normalize_lie"("p_lie" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  CASE lower(coalesce(p_lie, 'fairway'))
    WHEN 'tee', 'teebox'                                           THEN RETURN 'tee';
    WHEN 'fairway'                                                 THEN RETURN 'fairway';
    WHEN 'rough', 'primary_rough'                                  THEN RETURN 'rough';
    WHEN 'sand', 'bunker', 'greenside_bunker', 'fairway_bunker'    THEN RETURN 'sand';
    WHEN 'green', 'fringe'                                         THEN RETURN 'green';
    ELSE                                                                RETURN 'fairway';
  END CASE;
END;
$$;

ALTER FUNCTION "public"."sg_normalize_lie"("p_lie" "text") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sg_scale_for_player"("p_player_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_gender TEXT; v_baseline TEXT;
BEGIN
  SELECT t.gender, gts.sg_baseline INTO v_gender, v_baseline
  FROM golf_team_members tm
  JOIN golf_teams t ON t.id = tm.team_id
  LEFT JOIN golf_team_settings gts ON gts.team_id = t.id
  WHERE tm.player_id = p_player_id AND tm.status = 'active'
  ORDER BY tm.created_at NULLS LAST
  LIMIT 1;
  RETURN sg_baseline_scale(COALESCE(v_baseline, CASE WHEN v_gender = 'womens' THEN 'womens' ELSE 'pga_tour' END));
END;
$$;

ALTER FUNCTION "public"."sg_scale_for_player"("p_player_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."shares_my_baseball_organization"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT p_org_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM baseball_coaches me
    WHERE me.user_id = (SELECT auth.uid())
      AND me.organization_id = p_org_id
  );
$$;

ALTER FUNCTION "public"."shares_my_baseball_organization"("p_org_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."shares_my_baseball_organization"("p_org_id" "uuid") IS 'True when the caller coaches in the given organization. Exists so baseball_coaches_select can scope to the caller''s own program without an inline subquery over baseball_coaches, which would re-enter that policy and raise "infinite recursion detected in policy". EXISTS rather than LIMIT 1 so a coach holding rows in two organizations matches both.';

CREATE OR REPLACE FUNCTION "public"."shares_my_golf_organization"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT p_org_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.golf_coaches c
      WHERE c.user_id = (SELECT auth.uid())
        AND c.organization_id = p_org_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.golf_team_members m
      JOIN public.golf_players p ON p.id = m.player_id
      JOIN public.golf_teams   t ON t.id = m.team_id
      WHERE p.user_id = (SELECT auth.uid())
        AND t.organization_id = p_org_id
    )
  );
$$;

ALTER FUNCTION "public"."shares_my_golf_organization"("p_org_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."shares_my_golf_organization"("p_org_id" "uuid") IS 'True when the caller belongs to the given organization, as a coach or as a player on one of its teams. Mirrors shares_my_baseball_organization. Used by golf_coaches RLS (#1258).';

CREATE OR REPLACE FUNCTION "public"."stop_sequences_on_reply"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.coach_id IS NOT NULL THEN
    UPDATE crm_sequence_enrollments
       SET status = 'stopped', stopped_at = NEW.received_at, stop_reason = 'replied'
     WHERE coach_id = NEW.coach_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."stop_sequences_on_reply"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."submit_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb" DEFAULT '[]'::"jsonb", "p_approach_details" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "statement_timeout" TO '30s'
    SET "lock_timeout" TO '15s'
    AS $_$
DECLARE
  v_player_id UUID;
  v_hole_record JSONB;
  v_shot_group JSONB;
  v_shot JSONB;
  v_inserted_holes JSONB := '[]'::JSONB;
  v_inserted_shots JSONB := '[]'::JSONB;
  v_hole_id UUID;
  v_hole_number INT;
  v_shot_id UUID;
  v_shot_number INT;
  v_putt JSONB;
  v_approach JSONB;
  v_target_shot_id UUID;
  v_warnings JSONB := '[]'::JSONB;
  v_err_state TEXT;
  v_err_msg TEXT;
  v_distance_feet NUMERIC;
  v_break_direction TEXT;
  v_lie_type TEXT;
  v_miss_direction TEXT;
  v_distance_from_green NUMERIC;
  v_estimated_break INT;
  v_expected_holes INT;
  v_supplied_holes INT := 0;
  v_null_score_holes INT := 0;
  v_null_putt_holes INT := 0;
  v_hole_score_sum INT := 0;
  v_hole_putt_sum INT := 0;
  v_distinct_hole_numbers INT := 0;
  v_min_hole_number INT;
  v_max_hole_number INT;
BEGIN
  PERFORM set_config('helm.golf_lifecycle_write', 'atomic', true);
  PERFORM helm_private.configure_trace_context(p_round_data);
  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic', NULL, 'enter', 'started', jsonb_build_object('function', 'submit_round_atomic'));
  SELECT id INTO v_player_id FROM golf_players WHERE user_id = auth.uid();

  IF v_player_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player profile not found.');
  END IF;

  -- SINGLE-FLIGHT GUARD (bounded wait, not NOWAIT -- see header). If a
  -- same-round auto-save (or a second submit) already holds this row, wait up
  -- to 3s for it to release rather than failing on first contact; if the
  -- round is still locked past that, fail fast with 'busy' instead of queuing
  -- behind the function's ambient 15s lock_timeout.
  BEGIN
    SET LOCAL lock_timeout = '3s';
    PERFORM 1 FROM golf_rounds
    WHERE id = p_round_id
      AND player_id = v_player_id
      AND status != 'completed'
    FOR UPDATE;
  EXCEPTION WHEN lock_not_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'busy');
  END;
  SET LOCAL lock_timeout = '15s';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round not found, already completed, or no permission.');
  END IF;

  IF p_holes IS NULL OR jsonb_typeof(p_holes) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round submission requires a complete hole payload.');
  END IF;

  v_supplied_holes := jsonb_array_length(p_holes);
  v_expected_holes := COALESCE((p_round_data->>'holes_played')::INT, v_supplied_holes);

  IF v_supplied_holes = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Round submission requires at least one hole.');
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE elem->>'score' IS NULL),
    COUNT(*) FILTER (WHERE elem->>'putts' IS NULL),
    COALESCE(SUM(CASE WHEN elem->>'score' IS NULL THEN 0 ELSE (elem->>'score')::INT END), 0),
    COALESCE(SUM(CASE WHEN elem->>'putts' IS NULL THEN 0 ELSE (elem->>'putts')::INT END), 0),
    COUNT(DISTINCT (elem->>'hole_number')::INT),
    MIN((elem->>'hole_number')::INT),
    MAX((elem->>'hole_number')::INT)
  INTO
    v_null_score_holes, v_null_putt_holes, v_hole_score_sum, v_hole_putt_sum,
    v_distinct_hole_numbers, v_min_hole_number, v_max_hole_number
  FROM jsonb_array_elements(p_holes) elem;

  IF v_supplied_holes <> v_expected_holes THEN
    RETURN jsonb_build_object('success', false, 'error', format('Hole count mismatch: expected %s got %s.', v_expected_holes, v_supplied_holes));
  END IF;

  IF v_distinct_hole_numbers <> v_supplied_holes
     OR COALESCE(v_min_hole_number, 0) <> 1
     OR COALESCE(v_max_hole_number, 0) <> v_expected_holes THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requires one complete hole entry for every hole.');
  END IF;

  IF v_null_score_holes > 0 OR v_null_putt_holes > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', format('%s scores and %s putts missing.', v_null_score_holes, v_null_putt_holes));
  END IF;

  IF p_round_data->>'total_score' IS NOT NULL AND v_hole_score_sum <> (p_round_data->>'total_score')::INT THEN
    RETURN jsonb_build_object('success', false, 'error', format('Score mismatch: round %s vs holes %s.', (p_round_data->>'total_score')::INT, v_hole_score_sum));
  END IF;

  IF p_round_data->>'total_putts' IS NOT NULL AND v_hole_putt_sum <> (p_round_data->>'total_putts')::INT THEN
    RETURN jsonb_build_object('success', false, 'error', format('Putt mismatch: round %s vs holes %s.', (p_round_data->>'total_putts')::INT, v_hole_putt_sum));
  END IF;


  -- The action layer validates these conditions for a helpful UI error. Keep
  -- this SECURITY DEFINER guard too: a direct RPC must not bypass a coach's
  -- manual closure or finish a legacy qualifier row without a safe number.
  IF EXISTS (
    SELECT 1
    FROM golf_rounds r
    JOIN golf_qualifiers q ON q.id = r.qualifier_id
    WHERE r.id = p_round_id
      AND q.status = 'completed'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This qualifier has already been completed. Rounds can no longer be submitted.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM golf_rounds r
    WHERE r.id = p_round_id
      AND r.qualifier_id IS NOT NULL
      AND r.qualifier_round_number IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM golf_qualifiers q
        JOIN golf_qualifier_entries qe
          ON qe.qualifier_id = q.id
         AND qe.player_id = v_player_id
        WHERE q.id = r.qualifier_id
          AND q.status IS DISTINCT FROM 'completed'
          AND p_round_data->>'qualifier_id' = r.qualifier_id::TEXT
          -- CASE guarantees malformed or oversized text is never cast to INT.
          AND CASE
            WHEN (p_round_data->>'qualifier_round_number') ~ '^[1-9][0-9]{0,8}$'
              THEN (p_round_data->>'qualifier_round_number')::INT <= q.num_rounds
            ELSE false
          END
      )
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This started qualifier round needs a valid qualifier round number.'
    );
  END IF;

  -- Serialize the only legacy compatibility mutation before checking for an
  -- existing result. The unique index below remains the durable backstop.
  IF EXISTS (
    SELECT 1
    FROM golf_rounds r
    WHERE r.id = p_round_id
      AND r.qualifier_id IS NOT NULL
      AND r.qualifier_round_number IS NULL
  ) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      (SELECT r.qualifier_id::TEXT FROM golf_rounds r WHERE r.id = p_round_id)
        || ':' || v_player_id::TEXT || ':' || (p_round_data->>'qualifier_round_number'),
      0
    ));

    IF EXISTS (
      SELECT 1
      FROM golf_rounds duplicate_round
      WHERE duplicate_round.qualifier_id = (
        SELECT r.qualifier_id FROM golf_rounds r WHERE r.id = p_round_id
      )
        AND duplicate_round.player_id = v_player_id
        AND duplicate_round.qualifier_round_number =
          (p_round_data->>'qualifier_round_number')::INT
        AND duplicate_round.status IS DISTINCT FROM 'abandoned'
        AND duplicate_round.id <> p_round_id
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'You have already submitted this qualifier round.'
      );
    END IF;
  END IF;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.update_round', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('table', 'golf_rounds'));

  -- Validate before the round row, holes, or shots are changed. Returning a
  -- normal ActionResult keeps the prior durable graph available to Continue
  -- Round and avoids turning a stale browser payload into destructive work.
  IF p_shots IS NOT NULL AND jsonb_typeof(p_shots) <> 'array' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_snapshot',
      'error', 'Your round snapshot could not be verified. Your saved shots are safe; please retry.'
    );
  END IF;

  IF p_shots IS NOT NULL AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_shots) AS shot_group
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_holes) = 'array' THEN p_holes
          ELSE '[]'::jsonb
        END
      ) AS hole_record
      WHERE hole_record->>'hole_number' = shot_group->>'hole_number'
    )
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'invalid_snapshot',
      'error', 'Your round snapshot could not be verified. Your saved shots are safe; please retry.'
    );
  END IF;


  UPDATE golf_rounds SET
    course_name = COALESCE(p_round_data->>'course_name', course_name),
    course_city = p_round_data->>'course_city',
    course_state = p_round_data->>'course_state',
    course_rating = CASE WHEN p_round_data->>'course_rating' IS NULL THEN NULL ELSE (p_round_data->>'course_rating')::NUMERIC END,
    course_slope = CASE WHEN p_round_data->>'course_slope' IS NULL THEN NULL ELSE (p_round_data->>'course_slope')::INT END,
    tees_played = p_round_data->>'tees_played',
    tee_id = CASE WHEN p_round_data->>'tee_id' IS NULL THEN NULL ELSE (p_round_data->>'tee_id')::uuid END,
    course_id = COALESCE((p_round_data->>'course_id')::uuid, course_id),
    round_type = CASE WHEN qualifier_id IS NOT NULL THEN 'qualifier' ELSE round_type END,
    round_date = COALESCE((p_round_data->>'round_date')::DATE, round_date),
    status = 'completed',
    holes_played = COALESCE((p_round_data->>'holes_played')::INT, holes_played),
    total_score = CASE WHEN p_round_data->>'total_score' IS NULL THEN NULL ELSE (p_round_data->>'total_score')::INT END,
    score_to_par = CASE WHEN p_round_data->>'score_to_par' IS NULL THEN NULL ELSE (p_round_data->>'score_to_par')::INT END,
    total_putts = CASE WHEN p_round_data->>'total_putts' IS NULL THEN NULL ELSE (p_round_data->>'total_putts')::INT END,
    total_fairways_hit = CASE WHEN p_round_data->>'total_fairways_hit' IS NULL THEN NULL ELSE (p_round_data->>'total_fairways_hit')::INT END,
    total_fairways = CASE WHEN p_round_data->>'total_fairways' IS NULL THEN NULL ELSE (p_round_data->>'total_fairways')::INT END,
    total_gir = CASE WHEN p_round_data->>'total_gir' IS NULL THEN NULL ELSE (p_round_data->>'total_gir')::INT END,
    total_gir_possible = CASE WHEN p_round_data->>'total_gir_possible' IS NULL THEN NULL ELSE (p_round_data->>'total_gir_possible')::INT END,
    total_penalties = CASE WHEN p_round_data->>'total_penalties' IS NULL THEN NULL ELSE (p_round_data->>'total_penalties')::INT END,
    front_nine = CASE WHEN p_round_data->>'front_nine' IS NULL THEN NULL ELSE (p_round_data->>'front_nine')::INT END,
    back_nine = CASE WHEN p_round_data->>'back_nine' IS NULL THEN NULL ELSE (p_round_data->>'back_nine')::INT END,
    qualifier_id = qualifier_id,
    qualifier_round_number = CASE WHEN qualifier_round_number IS NOT NULL THEN qualifier_round_number WHEN qualifier_id IS NOT NULL THEN CASE WHEN (p_round_data->>'qualifier_round_number') ~ '^[1-9][0-9]{0,8}$' THEN (p_round_data->>'qualifier_round_number')::INT END ELSE qualifier_round_number END,
    draft_data = NULL,
    updated_at = NOW()
  WHERE id = p_round_id AND player_id = v_player_id;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.replace_snapshot', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('tables', jsonb_build_array('golf_shots', 'golf_holes')));
  DELETE FROM golf_shots WHERE round_id = p_round_id;
  DELETE FROM golf_holes WHERE round_id = p_round_id;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.insert_holes', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('expected_holes', coalesce(jsonb_array_length(p_holes), 0)));
  IF p_holes IS NOT NULL AND jsonb_array_length(p_holes) > 0 THEN
    FOR v_hole_record IN SELECT * FROM jsonb_array_elements(p_holes)
    LOOP
      INSERT INTO golf_holes (
        round_id, hole_number, par, score, putts,
        fairway_hit, gir, penalty_strokes,
        up_and_down, sand_save, yardage
      ) VALUES (
        p_round_id,
        (v_hole_record->>'hole_number')::INT,
        (v_hole_record->>'par')::INT,
        CASE WHEN v_hole_record->>'score' IS NULL THEN NULL ELSE (v_hole_record->>'score')::INT END,
        CASE WHEN v_hole_record->>'putts' IS NULL THEN NULL ELSE (v_hole_record->>'putts')::INT END,
        CASE WHEN v_hole_record->>'fairway_hit' IS NULL THEN NULL ELSE (v_hole_record->>'fairway_hit')::BOOLEAN END,
        CASE WHEN v_hole_record->>'gir' IS NULL THEN NULL ELSE (v_hole_record->>'gir')::BOOLEAN END,
        CASE WHEN v_hole_record->>'penalty_strokes' IS NULL THEN NULL ELSE (v_hole_record->>'penalty_strokes')::INT END,
        CASE WHEN v_hole_record->>'up_and_down' IS NULL THEN NULL ELSE (v_hole_record->>'up_and_down')::BOOLEAN END,
        CASE WHEN v_hole_record->>'sand_save' IS NULL THEN NULL ELSE (v_hole_record->>'sand_save')::BOOLEAN END,
        CASE WHEN v_hole_record->>'yardage' IS NULL THEN NULL ELSE (v_hole_record->>'yardage')::INT END
      )
      RETURNING id, hole_number INTO v_hole_id, v_hole_number;

      v_inserted_holes := v_inserted_holes || jsonb_build_object('hole_id', v_hole_id, 'hole_number', v_hole_number);
    END LOOP;
  END IF;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.insert_shots', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('shot_groups', coalesce(jsonb_array_length(p_shots), 0)));
  IF p_shots IS NOT NULL AND jsonb_array_length(p_shots) > 0 THEN
    FOR v_shot_group IN SELECT * FROM jsonb_array_elements(p_shots)
    LOOP
      v_hole_number := (v_shot_group->>'hole_number')::INT;
      SELECT (elem->>'hole_id')::UUID INTO v_hole_id
      FROM jsonb_array_elements(v_inserted_holes) elem
      WHERE (elem->>'hole_number')::INT = v_hole_number
      LIMIT 1;


      IF v_hole_id IS NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'Round snapshot has a shot group without a persisted hole.',
          DETAIL = format('round_id=%s hole_number=%s', p_round_id, v_hole_number),
          HINT = 'Retry with a complete round snapshot.';
      END IF;


      FOR v_shot IN SELECT * FROM jsonb_array_elements(v_shot_group->'shots')
      LOOP
        INSERT INTO golf_shots (
          round_id, hole_id, hole_number, shot_number,
          shot_type, club_type, lie_before, lie_after,
          distance_to_hole_before, distance_unit_before,
          result, distance_to_hole_after, distance_unit_after,
          shot_distance, miss_direction,
          putt_break, putt_slope, putt_distance_feet, putt_made,
          is_penalty, penalty_type
        ) VALUES (
          p_round_id,
          v_hole_id,
          v_hole_number,
          (v_shot->>'shot_number')::INT,
          v_shot->>'shot_type',
          v_shot->>'club_type',
          v_shot->>'lie_before',
          v_shot->>'lie_after',
          (v_shot->>'distance_to_hole_before')::NUMERIC,
          v_shot->>'distance_unit_before',
          v_shot->>'result',
          CASE WHEN v_shot->>'distance_to_hole_after' IS NULL THEN NULL ELSE (v_shot->>'distance_to_hole_after')::NUMERIC END,
          v_shot->>'distance_unit_after',
          CASE WHEN v_shot->>'shot_distance' IS NULL THEN NULL ELSE (v_shot->>'shot_distance')::NUMERIC END,
          v_shot->>'miss_direction',
          v_shot->>'putt_break',
          v_shot->>'putt_slope',
          CASE WHEN v_shot->>'putt_distance_feet' IS NULL THEN NULL ELSE (v_shot->>'putt_distance_feet')::NUMERIC END,
          CASE WHEN v_shot->>'putt_made' IS NULL THEN NULL ELSE (v_shot->>'putt_made')::BOOLEAN END,
          COALESCE((v_shot->>'is_penalty')::BOOLEAN, false),
          v_shot->>'penalty_type'
        )
        RETURNING id, hole_number, shot_number INTO v_shot_id, v_hole_number, v_shot_number;

        v_inserted_shots := v_inserted_shots || jsonb_build_object('shot_id', v_shot_id, 'hole_number', v_hole_number, 'shot_number', v_shot_number);
      END LOOP;
    END LOOP;
  END IF;

  IF p_putt_details IS NOT NULL AND jsonb_array_length(p_putt_details) > 0 THEN
    FOR v_putt IN SELECT * FROM jsonb_array_elements(p_putt_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_putt->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_putt->>'shot_number')::INT
      LIMIT 1;

      IF v_target_shot_id IS NOT NULL THEN
        BEGIN
          v_distance_feet := (v_putt->>'distance_feet')::NUMERIC;
          IF v_distance_feet IS NOT NULL THEN
            v_distance_feet := GREATEST(0, LEAST(500, v_distance_feet));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_feet := NULL;
        END;

        v_break_direction := v_putt->>'break_direction';
        IF v_break_direction IS NOT NULL AND v_break_direction NOT IN ('left_to_right', 'right_to_left', 'straight', 'multiple') THEN
          v_break_direction := NULL;
        END IF;

        BEGIN
          v_estimated_break := (v_putt->>'estimated_break_inches')::INT;
          IF v_estimated_break IS NOT NULL THEN
            v_estimated_break := GREATEST(0, LEAST(120, v_estimated_break));
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_estimated_break := NULL;
        END;

        BEGIN
          INSERT INTO putt_details (shot_id, miss_tags, break_direction, estimated_break_inches, distance_feet, made)
          VALUES (
            v_target_shot_id,
            CASE WHEN v_putt->'miss_tags' IS NULL THEN '{}'::TEXT[] ELSE ARRAY(SELECT jsonb_array_elements_text(v_putt->'miss_tags')) END,
            v_break_direction,
            v_estimated_break,
            v_distance_feet,
            COALESCE((v_putt->>'made')::BOOLEAN, false)
          );
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_putt_details',
            'hole_number', (v_putt->>'hole_number')::INT,
            'shot_number', (v_putt->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg
          );
        END;
      END IF;
    END LOOP;
  END IF;

  IF p_approach_details IS NOT NULL AND jsonb_array_length(p_approach_details) > 0 THEN
    FOR v_approach IN SELECT * FROM jsonb_array_elements(p_approach_details)
    LOOP
      SELECT (elem->>'shot_id')::UUID INTO v_target_shot_id
      FROM jsonb_array_elements(v_inserted_shots) elem
      WHERE (elem->>'hole_number')::INT = (v_approach->>'hole_number')::INT
        AND (elem->>'shot_number')::INT = (v_approach->>'shot_number')::INT
      LIMIT 1;

      IF v_target_shot_id IS NOT NULL THEN
        v_lie_type := v_approach->>'lie_type';
        IF v_lie_type IS NOT NULL AND v_lie_type NOT IN ('fairway','rough','sand','bunker','recovery','hazard','green','tee','other','penalty','deep_rough') THEN
          v_lie_type := NULL;
        END IF;

        v_miss_direction := v_approach->>'miss_direction';
        IF v_miss_direction IS NOT NULL AND v_miss_direction NOT IN ('short','long','left','right','short_left','short_right','long_left','long_right') THEN
          v_miss_direction := NULL;
        END IF;

        BEGIN
          v_distance_from_green := (v_approach->>'distance_from_green_yards')::NUMERIC;
          IF v_distance_from_green IS NOT NULL AND v_distance_from_green < 0 THEN
            v_distance_from_green := 0;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          v_distance_from_green := NULL;
        END;

        BEGIN
          INSERT INTO approach_miss_details (shot_id, miss_direction, lie_type, distance_from_green_yards)
          VALUES (v_target_shot_id, v_miss_direction, v_lie_type, v_distance_from_green);
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS v_err_state = RETURNED_SQLSTATE, v_err_msg = MESSAGE_TEXT;
          v_warnings := v_warnings || jsonb_build_object(
            'step', 'insert_approach_miss_details',
            'hole_number', (v_approach->>'hole_number')::INT,
            'shot_number', (v_approach->>'shot_number')::INT,
            'error_code', v_err_state,
            'error', v_err_msg
          );
        END;
      END IF;
    END LOOP;
  END IF;

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.recalculate_strokes_gained', 'db.submit_round_atomic', 'before', 'started', jsonb_build_object('round_id', p_round_id));
  PERFORM recalculate_round_strokes_gained(p_round_id);

  PERFORM helm_private.trace_checkpoint('db.submit_round_atomic.commit', 'db.submit_round_atomic', 'before_return', 'success', jsonb_build_object('round_id', p_round_id, 'holes', jsonb_array_length(v_inserted_holes), 'shots', jsonb_array_length(v_inserted_shots)));
  RETURN jsonb_build_object('success', true, 'round_id', p_round_id, 'warnings', v_warnings);
EXCEPTION WHEN OTHERS THEN
  BEGIN
    PERFORM helm_private.trace_exception_checkpoint(p_round_data, 'db.submit_round_atomic.exception', 'db.submit_round_atomic', SQLSTATE, SQLERRM);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE;
END;
$_$;

ALTER FUNCTION "public"."submit_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."submit_round_atomic"("p_round_id" "uuid", "p_round_data" "jsonb", "p_holes" "jsonb", "p_shots" "jsonb", "p_putt_details" "jsonb", "p_approach_details" "jsonb") IS 'Terminal round submit. A started round retains its persisted qualifier link and type even if a stale client retry omits or changes identity fields. A legacy missing qualifier round number may be filled only for the same entered player, open configured qualifier, and an unused valid round number.';

CREATE OR REPLACE FUNCTION "public"."sync_coach_last_email_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_coach_id        uuid;
  v_normalized_type text;
BEGIN
  IF NEW.contact_log_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coach_id INTO v_coach_id
    FROM crm_contact_log
   WHERE id = NEW.contact_log_id;

  IF v_coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Strip the 'email.' prefix for the denorm column so downstream
  -- consumers see a clean value like 'opened' instead of 'email.opened'.
  IF NEW.event_type LIKE 'email.%' THEN
    v_normalized_type := substring(NEW.event_type FROM 7);
  ELSE
    v_normalized_type := NEW.event_type;
  END IF;

  UPDATE crm_coaches
     SET last_email_event_type = v_normalized_type,
         last_email_event_at   = NEW.occurred_at,
         updated_at            = now()
   WHERE id = v_coach_id
     AND (last_email_event_at IS NULL OR NEW.occurred_at >= last_email_event_at);

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_coach_last_email_event"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."sync_email_snapshot_from_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_from       text;
  v_to         text[];
  v_subject    text;
  v_tags       jsonb;
  v_source     text;
  v_recipient  text;
BEGIN
  -- Pull message fields from the raw payload (if present)
  v_from    := NEW.raw_payload #>> '{data,from}';
  v_subject := NEW.raw_payload #>> '{data,subject}';
  v_tags    := NEW.raw_payload -> 'data' -> 'tags';

  -- Resend sends `to` as a JSON array of strings. Fall back to recipient_email.
  IF NEW.raw_payload #> '{data,to}' IS NOT NULL THEN
    SELECT array_agg(value::text) INTO v_to
      FROM jsonb_array_elements_text(NEW.raw_payload #> '{data,to}');
  ELSIF NEW.recipient_email IS NOT NULL THEN
    v_to := ARRAY[NEW.recipient_email];
  ELSE
    v_to := '{}';
  END IF;

  -- Classify source by whether it links to a CRM contact log
  IF NEW.contact_log_id IS NOT NULL THEN
    v_source := 'crm';
  ELSE
    v_source := 'transactional';
  END IF;

  INSERT INTO emails AS e (
    resend_message_id,
    from_address,
    to_addresses,
    subject,
    tags,
    contact_log_id,
    source,
    sent_at,
    delivered_at,
    delivery_delayed_at,
    opened_at,
    clicked_at,
    bounced_at,
    complained_at,
    last_event_type,
    last_event_at,
    open_count,
    click_count,
    first_seen_at,
    updated_at
  ) VALUES (
    NEW.resend_message_id,
    v_from,
    v_to,
    v_subject,
    v_tags,
    NEW.contact_log_id,
    v_source,
    CASE WHEN NEW.event_type = 'email.sent'              THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.delivered'         THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.delivery_delayed'  THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.opened'            THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.clicked'           THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.bounced'           THEN NEW.occurred_at END,
    CASE WHEN NEW.event_type = 'email.complained'        THEN NEW.occurred_at END,
    NEW.event_type,
    NEW.occurred_at,
    CASE WHEN NEW.event_type = 'email.opened'  THEN 1 ELSE 0 END,
    CASE WHEN NEW.event_type = 'email.clicked' THEN 1 ELSE 0 END,
    NEW.occurred_at,
    now()
  )
  ON CONFLICT (resend_message_id) DO UPDATE SET
    -- Only fill content fields if currently null (email.sent usually arrives first)
    from_address       = COALESCE(e.from_address, EXCLUDED.from_address),
    to_addresses       = CASE WHEN e.to_addresses = '{}'::text[] THEN EXCLUDED.to_addresses ELSE e.to_addresses END,
    subject            = COALESCE(e.subject, EXCLUDED.subject),
    tags               = COALESCE(e.tags, EXCLUDED.tags),
    contact_log_id     = COALESCE(e.contact_log_id, EXCLUDED.contact_log_id),
    source             = CASE WHEN e.source = 'unknown' THEN EXCLUDED.source ELSE e.source END,

    -- Status timestamps: take earliest per event type
    sent_at             = LEAST(e.sent_at,             EXCLUDED.sent_at),
    delivered_at        = LEAST(e.delivered_at,        EXCLUDED.delivered_at),
    delivery_delayed_at = LEAST(e.delivery_delayed_at, EXCLUDED.delivery_delayed_at),
    opened_at           = LEAST(e.opened_at,           EXCLUDED.opened_at),
    clicked_at          = LEAST(e.clicked_at,          EXCLUDED.clicked_at),
    bounced_at          = LEAST(e.bounced_at,          EXCLUDED.bounced_at),
    complained_at       = LEAST(e.complained_at,       EXCLUDED.complained_at),

    -- Latest event wins for last_event_*
    last_event_type = CASE WHEN EXCLUDED.last_event_at > COALESCE(e.last_event_at, 'epoch'::timestamptz)
                           THEN EXCLUDED.last_event_type ELSE e.last_event_type END,
    last_event_at   = GREATEST(e.last_event_at, EXCLUDED.last_event_at),

    open_count  = e.open_count  + CASE WHEN NEW.event_type = 'email.opened'  THEN 1 ELSE 0 END,
    click_count = e.click_count + CASE WHEN NEW.event_type = 'email.clicked' THEN 1 ELSE 0 END,

    updated_at = now();

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."sync_email_snapshot_from_event"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."try_redeem_baseball_team_invitation"("p_invitation_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.baseball_team_invitations
  SET used_count = COALESCE(used_count, 0) + 1
  WHERE id = p_invitation_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR COALESCE(used_count, 0) < max_uses)
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

ALTER FUNCTION "public"."try_redeem_baseball_team_invitation"("p_invitation_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."unresolve_admin_event"("p_event_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;

ALTER FUNCTION "public"."unresolve_admin_event"("p_event_ids" "uuid"[]) OWNER TO "postgres";

COMMENT ON FUNCTION "public"."unresolve_admin_event"("p_event_ids" "uuid"[]) IS 'Reverses resolve_admin_event for the given ids. Super-admin gated via is_super_admin(); idempotent (only touches resolved = true rows); clears resolved_at/resolved_by so the regression lookback does not see a retracted resolution. Added 2026-07-29 so bulk auto-resolution is a reversible decision.';

CREATE OR REPLACE FUNCTION "public"."update_crm_automations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

ALTER FUNCTION "public"."update_crm_automations_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_crm_coaches_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_crm_coaches_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_crm_events_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_crm_events_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_crm_google_tokens_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_crm_google_tokens_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_crm_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

ALTER FUNCTION "public"."update_crm_notes_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_crm_segments_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

ALTER FUNCTION "public"."update_crm_segments_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_crm_sequences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

ALTER FUNCTION "public"."update_crm_sequences_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_crm_tasks_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

ALTER FUNCTION "public"."update_crm_tasks_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_device_tokens_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_device_tokens_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_document_version_info"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Update the parent document with new version info
  UPDATE golf_documents
  SET
    current_version_id = NEW.id,
    version_count = (
      SELECT COUNT(*) FROM golf_document_versions WHERE document_id = NEW.document_id
    ),
    file_url = NEW.file_url,
    file_size = NEW.file_size,
    updated_at = NOW()
  WHERE id = NEW.document_id;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_document_version_info"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_golf_expenses_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_golf_expenses_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_golf_task_reminders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_golf_task_reminders_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_golf_task_templates_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_golf_task_templates_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_golf_team_join_requests_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_golf_team_join_requests_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_message_has_attachments"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE golf_messages
    SET has_attachments = TRUE
    WHERE id = NEW.message_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Check if any attachments remain
    IF NOT EXISTS (
      SELECT 1 FROM golf_message_attachments
      WHERE message_id = OLD.message_id
    ) THEN
      UPDATE golf_messages
      SET has_attachments = FALSE
      WHERE id = OLD.message_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."update_message_has_attachments"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_player_distance_proximity"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  WITH hole_shots AS (
    SELECT gs.shot_number, lower(gs.shot_type) AS shot_type, gs.result,
           gs.miss_direction, gs.distance_to_hole_after, gs.distance_unit_after,
           h.id AS h_id, h.par, h.gir, h.putts
    FROM golf_shots gs
    JOIN golf_holes h  ON h.round_id = gs.round_id AND h.hole_number = gs.hole_number
    JOIN golf_rounds r ON r.id = h.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL
  ),
  gf AS (
    SELECT DISTINCT ON (h_id) h_id, shot_number AS gf_num, result AS gf_result,
           miss_direction AS gf_md, distance_to_hole_after AS gf_da, distance_unit_after AS gf_ua
    FROM hole_shots WHERE result IN ('green','gir','hole') ORDER BY h_id, shot_number
  ),
  rs AS (
    SELECT DISTINCT ON (h_id) h_id, result AS reg_result, miss_direction AS reg_md,
           distance_to_hole_after AS reg_da, distance_unit_after AS reg_ua
    FROM hole_shots WHERE shot_number = GREATEST(par - 2, 1) ORDER BY h_id, shot_number
  ),
  putt_counts AS (
    SELECT h_id, COUNT(*) FILTER (WHERE shot_type = 'putting') AS pc FROM hole_shots GROUP BY h_id
  ),
  ho AS (SELECT DISTINCT h_id, par, gir, putts FROM hole_shots),
  perhole AS (
    SELECT
      COALESCE(ho.gir, (gf.gf_num IS NOT NULL AND gf.gf_num <= ho.par - 2)) AS gir_eff,
      COALESCE(ho.putts, pc.pc) AS putts,
      CASE WHEN gf.h_id IS NOT NULL AND gf.gf_num < GREATEST(ho.par - 2, 1) THEN gf.gf_result
           WHEN rs.h_id IS NOT NULL THEN rs.reg_result
           WHEN gf.h_id IS NOT NULL THEN gf.gf_result END AS a_result,
      CASE WHEN gf.h_id IS NOT NULL AND gf.gf_num < GREATEST(ho.par - 2, 1) THEN gf.gf_md
           WHEN rs.h_id IS NOT NULL THEN rs.reg_md
           WHEN gf.h_id IS NOT NULL THEN gf.gf_md END AS a_md,
      CASE WHEN gf.h_id IS NOT NULL AND gf.gf_num < GREATEST(ho.par - 2, 1) THEN gf.gf_da
           WHEN rs.h_id IS NOT NULL THEN rs.reg_da
           WHEN gf.h_id IS NOT NULL THEN gf.gf_da END AS a_da,
      CASE WHEN gf.h_id IS NOT NULL AND gf.gf_num < GREATEST(ho.par - 2, 1) THEN gf.gf_ua
           WHEN rs.h_id IS NOT NULL THEN rs.reg_ua
           WHEN gf.h_id IS NOT NULL THEN gf.gf_ua END AS a_ua
    FROM ho
    LEFT JOIN gf ON gf.h_id = ho.h_id
    LEFT JOIN rs ON rs.h_id = ho.h_id
    LEFT JOIN putt_counts pc ON pc.h_id = ho.h_id
  ),
  prox AS (
    SELECT CASE WHEN a_result IN ('green','gir','hole') THEN
             CASE WHEN a_result = 'hole' THEN 0
                  WHEN a_da IS NOT NULL THEN (CASE WHEN a_ua = 'yards' THEN a_da * 3 ELSE a_da END)
             END
           END AS p
    FROM perhole
  ),
  miss AS (
    SELECT lower(a_md) AS md FROM perhole
    WHERE gir_eff IS NOT TRUE AND a_result IS NOT NULL
      AND a_result NOT IN ('green','gir','hole') AND a_md IS NOT NULL
  ),
  miss_agg AS (
    SELECT
      ROUND(100.0 * COUNT(*) FILTER (WHERE md IN ('short','short_left','short_right')) / NULLIF(COUNT(*),0), 1) AS s,
      ROUND(100.0 * COUNT(*) FILTER (WHERE md IN ('long','long_left','long_right'))   / NULLIF(COUNT(*),0), 1) AS lo,
      ROUND(100.0 * COUNT(*) FILTER (WHERE md IN ('left','short_left','long_left'))    / NULLIF(COUNT(*),0), 1) AS le,
      ROUND(100.0 * COUNT(*) FILTER (WHERE md IN ('right','short_right','long_right'))  / NULLIF(COUNT(*),0), 1) AS ri
    FROM miss
  ),
  dd AS (
    SELECT ROUND(AVG(gs.shot_distance)::numeric, 2) AS v
    FROM golf_shots gs JOIN golf_rounds r ON r.id = gs.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL
      AND gs.shot_type = 'tee' AND gs.shot_distance IS NOT NULL AND gs.shot_distance > 0
  )
  UPDATE golf_player_stats_cache psc SET
    driving_distance_average   = (SELECT v FROM dd),
    approach_proximity_average = (SELECT ROUND(AVG(p)::numeric, 2) FROM prox WHERE p IS NOT NULL),
    putts_per_gir              = (SELECT ROUND(AVG(putts)::numeric, 2) FROM perhole WHERE gir_eff IS TRUE),
    approach_miss_short_pct    = (SELECT s  FROM miss_agg),
    approach_miss_long_pct     = (SELECT lo FROM miss_agg),
    approach_miss_left_pct     = (SELECT le FROM miss_agg),
    approach_miss_right_pct    = (SELECT ri FROM miss_agg),
    updated_at = now()
  WHERE psc.player_id = p_player_id;
END;
$$;

ALTER FUNCTION "public"."update_player_distance_proximity"("p_player_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_player_putt_make_pct"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  WITH putts AS (
    SELECT LEAST(GREATEST(gs.distance_to_hole_before, 0), 120) AS feet,
           (gs.result = 'hole' OR gs.putt_made IS TRUE) AS made
    FROM golf_shots gs
    JOIN golf_rounds r ON r.id = gs.round_id
    WHERE r.player_id = p_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL
      AND lower(gs.shot_type) = 'putting' AND gs.distance_to_hole_before IS NOT NULL
  ),
  agg AS (
    SELECT
      ROUND(100.0*COUNT(*) FILTER (WHERE feet<=3 AND made)              / NULLIF(COUNT(*) FILTER (WHERE feet<=3),0),1)               AS p0_3,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>3  AND feet<=5  AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>3  AND feet<=5),0),1)   AS p3_5,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>5  AND feet<=10 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>5  AND feet<=10),0),1)  AS p5_10,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>10 AND feet<=15 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>10 AND feet<=15),0),1)  AS p10_15,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>15 AND feet<=20 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>15 AND feet<=20),0),1)  AS p15_20,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>20 AND made)             / NULLIF(COUNT(*) FILTER (WHERE feet>20),0),1)               AS p20_plus,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>15 AND feet<=25 AND made) / NULLIF(COUNT(*) FILTER (WHERE feet>15 AND feet<=25),0),1)  AS p15_25,
      ROUND(100.0*COUNT(*) FILTER (WHERE feet>25 AND made)             / NULLIF(COUNT(*) FILTER (WHERE feet>25),0),1)               AS p25_plus,
      COUNT(*) FILTER (WHERE feet>3  AND feet<=5)  AS n3_5,
      COUNT(*) FILTER (WHERE feet>5  AND feet<=10) AS n5_10,
      COUNT(*) FILTER (WHERE feet>10 AND feet<=15) AS n10_15,
      COUNT(*) FILTER (WHERE feet>15 AND feet<=25) AS n15_25,
      COUNT(*) FILTER (WHERE feet>25)              AS n25_plus
    FROM putts
  )
  UPDATE golf_player_stats_cache psc
  SET putt_make_pct_0_3ft         = agg.p0_3,
      putt_make_pct_3_5ft         = agg.p3_5,
      putt_make_pct_5_10ft        = agg.p5_10,
      putt_make_pct_10_15ft       = agg.p10_15,
      putt_make_pct_15_20ft       = agg.p15_20,
      putt_make_pct_20_plus_ft    = agg.p20_plus,
      putt_make_pct_15_25ft       = agg.p15_25,
      putt_make_pct_25_plus_ft    = agg.p25_plus,
      putt_attempts_3_5ft         = agg.n3_5,
      putt_attempts_5_10ft        = agg.n5_10,
      putt_attempts_10_15ft       = agg.n10_15,
      putt_attempts_15_25ft       = agg.n15_25,
      putt_attempts_25_plus_ft    = agg.n25_plus,
      first_round_date            = (SELECT MIN(round_date) FROM golf_rounds
                                     WHERE player_id = p_player_id
                                       AND status = 'completed' AND total_score IS NOT NULL),
      updated_at                  = now()
  FROM agg
  WHERE psc.player_id = p_player_id;
END;
$$;

ALTER FUNCTION "public"."update_player_putt_make_pct"("p_player_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_player_stats_complete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_player_id UUID;
  v_rounds_played INTEGER; v_total_score NUMERIC; v_total_score_to_par NUMERIC;
  v_best_round INTEGER; v_worst_round INTEGER;
  v_total_eagles INTEGER; v_total_birdies INTEGER; v_total_pars INTEGER;
  v_total_bogeys INTEGER; v_total_double_bogeys INTEGER; v_total_triple_plus INTEGER;
  v_total_fairways_hit INTEGER; v_total_fairways INTEGER;
  v_total_greens_hit INTEGER; v_total_greens INTEGER;
  v_total_scrambles_converted INTEGER; v_total_scramble_attempts INTEGER;
  v_total_sand_saves INTEGER; v_total_sand_attempts INTEGER;
  v_total_putts INTEGER; v_total_one_putts INTEGER; v_total_three_putts INTEGER;
  v_total_penalties INTEGER;
  v_driving_accuracy NUMERIC(5,2); v_gir_percentage NUMERIC(5,2);
  v_scrambling_percentage NUMERIC(5,2); v_sand_save_percentage NUMERIC(5,2);
  v_putts_per_round NUMERIC(4,2); v_total_holes INTEGER;
  v_one_putt_percentage NUMERIC(5,2); v_three_putt_percentage NUMERIC(5,2);
  v_penalty_per_round NUMERIC(4,2);
  v_scoring_average NUMERIC(5,2); v_scoring_average_vs_par NUMERIC(5,2);
  v_best_round_normalized NUMERIC(5,2); v_worst_round_normalized NUMERIC(5,2);
  v_first_round_date DATE; v_last_round_date DATE;
  v_par3_average NUMERIC(4,2); v_par4_average NUMERIC(4,2); v_par5_average NUMERIC(4,2);
  v_up_down_made INTEGER; v_up_down_attempts INTEGER; v_up_and_down_pct NUMERIC(5,2);
  v_rounds_18 INTEGER; v_total_score_18 NUMERIC; v_score_to_par_18 NUMERIC;
  v_last_5_avg NUMERIC(5,2); v_last_10_avg NUMERIC(5,2); v_prev_5_avg NUMERIC(5,2);
  v_improvement NUMERIC(5,2); v_trend TEXT;
  v_round_ids UUID[]; v_season_start DATE; v_rounds_this_season INTEGER;
  v_sg_total_avg NUMERIC; v_sg_tee_avg NUMERIC; v_sg_approach_avg NUMERIC;
  v_sg_ag_avg NUMERIC; v_sg_putting_avg NUMERIC;
  v_sg_total_sum NUMERIC; v_sg_tee_sum NUMERIC; v_sg_approach_sum NUMERIC;
  v_sg_ag_sum NUMERIC; v_sg_putting_sum NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN v_player_id := OLD.player_id; ELSE v_player_id := NEW.player_id; END IF;

  SELECT COUNT(*), SUM(total_score), SUM(score_to_par), MIN(total_score), MAX(total_score),
    SUM(eagles), SUM(birdies), SUM(pars), SUM(bogeys), SUM(double_bogeys), SUM(triple_plus),
    SUM(fairways_hit), SUM(fairways_total), SUM(greens_hit), SUM(greens_total),
    SUM(scrambles_converted), SUM(scramble_attempts), SUM(sand_saves), SUM(sand_attempts),
    SUM(total_putts), SUM(one_putts), SUM(three_putts), SUM(penalty_strokes)
  INTO v_rounds_played, v_total_score, v_total_score_to_par, v_best_round, v_worst_round,
    v_total_eagles, v_total_birdies, v_total_pars, v_total_bogeys, v_total_double_bogeys, v_total_triple_plus,
    v_total_fairways_hit, v_total_fairways, v_total_greens_hit, v_total_greens,
    v_total_scrambles_converted, v_total_scramble_attempts, v_total_sand_saves, v_total_sand_attempts,
    v_total_putts, v_total_one_putts, v_total_three_putts, v_total_penalties
  FROM golf_round_stats_cache WHERE player_id = v_player_id;

  SELECT MIN(round_date), MAX(round_date) INTO v_first_round_date, v_last_round_date
  FROM golf_rounds WHERE player_id = v_player_id AND status = 'completed';

  SELECT AVG(CASE WHEN par=3 THEN score END), AVG(CASE WHEN par=4 THEN score END), AVG(CASE WHEN par=5 THEN score END),
         COUNT(*) FILTER (WHERE h.up_and_down IS TRUE), COUNT(*) FILTER (WHERE h.up_and_down IS NOT NULL)
  INTO v_par3_average, v_par4_average, v_par5_average, v_up_down_made, v_up_down_attempts
  FROM golf_holes h JOIN golf_rounds r ON r.id = h.round_id
  WHERE r.player_id = v_player_id AND r.status = 'completed';

  IF v_up_down_attempts > 0 THEN
    v_up_and_down_pct := (v_up_down_made::NUMERIC / v_up_down_attempts) * 100;
  END IF;

  SELECT COALESCE(SUM(COALESCE(holes_played, 18)), 0) INTO v_total_holes
  FROM golf_rounds WHERE player_id = v_player_id AND status = 'completed';

  SELECT COUNT(*), SUM(r.total_score), SUM(r.score_to_par) INTO v_rounds_18, v_total_score_18, v_score_to_par_18
  FROM golf_rounds r WHERE r.player_id = v_player_id AND r.status = 'completed'
    AND r.total_score IS NOT NULL AND COALESCE(r.holes_played, 18) = 18;

  IF v_total_fairways > 0 THEN v_driving_accuracy := (v_total_fairways_hit::NUMERIC / v_total_fairways) * 100; END IF;
  IF v_total_greens > 0 THEN v_gir_percentage := (v_total_greens_hit::NUMERIC / v_total_greens) * 100; END IF;
  IF v_total_scramble_attempts > 0 THEN v_scrambling_percentage := (v_total_scrambles_converted::NUMERIC / v_total_scramble_attempts) * 100; END IF;
  IF v_total_sand_attempts > 0 THEN v_sand_save_percentage := (v_total_sand_saves::NUMERIC / v_total_sand_attempts) * 100; END IF;
  IF v_rounds_18 > 0 THEN v_scoring_average := v_total_score_18::NUMERIC / v_rounds_18; v_scoring_average_vs_par := v_score_to_par_18::NUMERIC / v_rounds_18; END IF;
  IF v_total_holes > 0 THEN
    v_putts_per_round := (v_total_putts::NUMERIC / v_total_holes) * 18;
    v_penalty_per_round := (v_total_penalties::NUMERIC / v_total_holes) * 18;
    v_one_putt_percentage := (v_total_one_putts::NUMERIC / v_total_holes) * 100;
    v_three_putt_percentage := (v_total_three_putts::NUMERIC / v_total_holes) * 100;
  ELSIF v_rounds_played > 0 THEN
    v_putts_per_round := v_total_putts::NUMERIC / v_rounds_played;
    v_penalty_per_round := v_total_penalties::NUMERIC / v_rounds_played;
  END IF;

  SELECT MIN(r.total_score * (18.0 / COALESCE(r.holes_played, 18))), MAX(r.total_score * (18.0 / COALESCE(r.holes_played, 18)))
  INTO v_best_round_normalized, v_worst_round_normalized
  FROM golf_rounds r WHERE r.player_id = v_player_id AND r.status = 'completed' AND r.total_score IS NOT NULL;

  IF v_rounds_played = 0 OR v_rounds_played IS NULL THEN
    DELETE FROM golf_player_stats_cache WHERE player_id = v_player_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Enhanced stats
  v_season_start := make_date(CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 8 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::INTEGER END, 8, 1);
  SELECT COUNT(*), ARRAY_AGG(rsc.round_id ORDER BY r.round_date DESC) INTO v_rounds_this_season, v_round_ids
  FROM golf_round_stats_cache rsc JOIN golf_rounds r ON r.id = rsc.round_id WHERE rsc.player_id = v_player_id AND r.round_date >= v_season_start;

  SELECT AVG(r.total_score) INTO v_last_5_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 5) r;
  SELECT AVG(r.total_score) INTO v_last_10_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 10) r;
  SELECT AVG(r.total_score) INTO v_prev_5_avg FROM (SELECT r2.total_score FROM golf_rounds r2 WHERE r2.player_id = v_player_id AND r2.status = 'completed' AND r2.total_score IS NOT NULL AND COALESCE(r2.holes_played, 18) = 18 ORDER BY r2.round_date DESC LIMIT 5 OFFSET 5) r;

  IF v_last_5_avg IS NOT NULL AND v_prev_5_avg IS NOT NULL THEN
    v_improvement := v_prev_5_avg - v_last_5_avg;
    v_trend := CASE WHEN v_improvement > 1.0 THEN 'improving' WHEN v_improvement < -1.0 THEN 'declining' ELSE 'stable' END;
  ELSE v_improvement := NULL; v_trend := 'stable'; END IF;

  -- Strokes gained
  SELECT AVG(strokes_gained_total), AVG(strokes_gained_tee), AVG(strokes_gained_approach), AVG(strokes_gained_around_green), AVG(strokes_gained_putting),
    SUM(strokes_gained_total), SUM(strokes_gained_tee), SUM(strokes_gained_approach), SUM(strokes_gained_around_green), SUM(strokes_gained_putting)
  INTO v_sg_total_avg, v_sg_tee_avg, v_sg_approach_avg, v_sg_ag_avg, v_sg_putting_avg, v_sg_total_sum, v_sg_tee_sum, v_sg_approach_sum, v_sg_ag_sum, v_sg_putting_sum
  FROM golf_round_stats_cache WHERE player_id = v_player_id AND strokes_gained_total IS NOT NULL;

  INSERT INTO golf_player_stats_cache (player_id, scoring_average, scoring_average_vs_par, rounds_played, best_round, worst_round,
    par3_average, par4_average, par5_average, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    driving_accuracy_percentage, fairways_hit, fairways_total, gir_percentage, greens_hit, greens_total,
    scrambling_percentage, scrambles_converted, scramble_attempts, sand_save_percentage, sand_saves, sand_attempts,
    putts_per_round, one_putt_percentage, three_putt_percentage, total_putts, penalty_strokes_per_round, total_penalties,
    up_and_down_percentage,
    last_round_date, rounds_in_calculation, calculation_period_start, calculation_period_end,
    last_5_average, last_10_average, improvement_trend, trend_direction, rounds_this_season, season_start_date, round_ids_included,
    strokes_gained_total, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
    sg_total_per_round, sg_tee_per_round, sg_approach_per_round, sg_around_green_per_round, sg_putting_per_round,
    is_stale, next_refresh_due, created_at, updated_at
  ) VALUES (
    v_player_id, v_scoring_average, v_scoring_average_vs_par, v_rounds_played,
    COALESCE(v_best_round_normalized::INTEGER, v_best_round), COALESCE(v_worst_round_normalized::INTEGER, v_worst_round),
    v_par3_average, v_par4_average, v_par5_average, v_total_eagles, v_total_birdies, v_total_pars, v_total_bogeys, v_total_double_bogeys, v_total_triple_plus,
    v_driving_accuracy, v_total_fairways_hit, v_total_fairways, v_gir_percentage, v_total_greens_hit, v_total_greens,
    v_scrambling_percentage, v_total_scrambles_converted, v_total_scramble_attempts, v_sand_save_percentage, v_total_sand_saves, v_total_sand_attempts,
    v_putts_per_round, v_one_putt_percentage, v_three_putt_percentage, v_total_putts, v_penalty_per_round, v_total_penalties,
    v_up_and_down_pct,
    v_last_round_date, v_rounds_played, v_first_round_date, v_last_round_date,
    v_last_5_avg, v_last_10_avg, v_improvement, v_trend, v_rounds_this_season, v_season_start, v_round_ids,
    v_sg_total_sum, v_sg_tee_sum, v_sg_approach_sum, v_sg_ag_sum, v_sg_putting_sum,
    ROUND(v_sg_total_avg, 2), ROUND(v_sg_tee_avg, 2), ROUND(v_sg_approach_avg, 2), ROUND(v_sg_ag_avg, 2), ROUND(v_sg_putting_avg, 2),
    FALSE, NOW() + INTERVAL '1 hour', NOW(), NOW()
  ) ON CONFLICT (player_id) DO UPDATE SET
    scoring_average=EXCLUDED.scoring_average, scoring_average_vs_par=EXCLUDED.scoring_average_vs_par,
    rounds_played=EXCLUDED.rounds_played, best_round=EXCLUDED.best_round, worst_round=EXCLUDED.worst_round,
    par3_average=EXCLUDED.par3_average, par4_average=EXCLUDED.par4_average, par5_average=EXCLUDED.par5_average,
    eagles=EXCLUDED.eagles, birdies=EXCLUDED.birdies, pars=EXCLUDED.pars, bogeys=EXCLUDED.bogeys, double_bogeys=EXCLUDED.double_bogeys, triple_plus=EXCLUDED.triple_plus,
    driving_accuracy_percentage=EXCLUDED.driving_accuracy_percentage, fairways_hit=EXCLUDED.fairways_hit, fairways_total=EXCLUDED.fairways_total,
    gir_percentage=EXCLUDED.gir_percentage, greens_hit=EXCLUDED.greens_hit, greens_total=EXCLUDED.greens_total,
    scrambling_percentage=EXCLUDED.scrambling_percentage, scrambles_converted=EXCLUDED.scrambles_converted, scramble_attempts=EXCLUDED.scramble_attempts,
    sand_save_percentage=EXCLUDED.sand_save_percentage, sand_saves=EXCLUDED.sand_saves, sand_attempts=EXCLUDED.sand_attempts,
    putts_per_round=EXCLUDED.putts_per_round, one_putt_percentage=EXCLUDED.one_putt_percentage, three_putt_percentage=EXCLUDED.three_putt_percentage,
    total_putts=EXCLUDED.total_putts, penalty_strokes_per_round=EXCLUDED.penalty_strokes_per_round, total_penalties=EXCLUDED.total_penalties,
    up_and_down_percentage=EXCLUDED.up_and_down_percentage,
    last_round_date=EXCLUDED.last_round_date, rounds_in_calculation=EXCLUDED.rounds_in_calculation,
    calculation_period_start=EXCLUDED.calculation_period_start, calculation_period_end=EXCLUDED.calculation_period_end,
    last_5_average=EXCLUDED.last_5_average, last_10_average=EXCLUDED.last_10_average, improvement_trend=EXCLUDED.improvement_trend, trend_direction=EXCLUDED.trend_direction,
    rounds_this_season=EXCLUDED.rounds_this_season, season_start_date=EXCLUDED.season_start_date, round_ids_included=EXCLUDED.round_ids_included,
    strokes_gained_total=EXCLUDED.strokes_gained_total, strokes_gained_tee=EXCLUDED.strokes_gained_tee, strokes_gained_approach=EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green=EXCLUDED.strokes_gained_around_green, strokes_gained_putting=EXCLUDED.strokes_gained_putting,
    sg_total_per_round=EXCLUDED.sg_total_per_round, sg_tee_per_round=EXCLUDED.sg_tee_per_round, sg_approach_per_round=EXCLUDED.sg_approach_per_round,
    sg_around_green_per_round=EXCLUDED.sg_around_green_per_round, sg_putting_per_round=EXCLUDED.sg_putting_per_round,
    is_stale=FALSE, next_refresh_due=NOW()+INTERVAL '1 hour', updated_at=NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$;

ALTER FUNCTION "public"."update_player_stats_complete"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_player_stats_strokes_gained"("p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count          INTEGER;
  v_sg_total       NUMERIC;
  v_sg_tee         NUMERIC;
  v_sg_approach    NUMERIC;
  v_sg_around      NUMERIC;
  v_sg_putting     NUMERIC;
BEGIN
  SELECT
    COUNT(*),
    SUM(rsc.strokes_gained_total),
    SUM(rsc.strokes_gained_tee),
    SUM(rsc.strokes_gained_approach),
    SUM(rsc.strokes_gained_around_green),
    SUM(rsc.strokes_gained_putting)
  INTO v_count, v_sg_total, v_sg_tee, v_sg_approach, v_sg_around, v_sg_putting
  FROM golf_round_stats_cache rsc
  JOIN golf_rounds r ON r.id = rsc.round_id
  WHERE rsc.player_id    = p_player_id
    AND r.status         = 'completed'
    AND rsc.strokes_gained_total IS NOT NULL;

  IF v_count = 0 THEN RETURN; END IF;

  UPDATE golf_player_stats_cache
  SET
    strokes_gained_total        = ROUND(v_sg_total::NUMERIC,    3),
    strokes_gained_tee          = ROUND(v_sg_tee::NUMERIC,      3),
    strokes_gained_approach     = ROUND(v_sg_approach::NUMERIC, 3),
    strokes_gained_around_green = ROUND(v_sg_around::NUMERIC,   3),
    strokes_gained_putting      = ROUND(v_sg_putting::NUMERIC,  3),
    sg_total_per_round          = ROUND((v_sg_total    / v_count)::NUMERIC, 3),
    sg_tee_per_round            = ROUND((v_sg_tee      / v_count)::NUMERIC, 3),
    sg_approach_per_round       = ROUND((v_sg_approach / v_count)::NUMERIC, 3),
    sg_around_green_per_round   = ROUND((v_sg_around   / v_count)::NUMERIC, 3),
    sg_putting_per_round        = ROUND((v_sg_putting  / v_count)::NUMERIC, 3),
    updated_at                  = now()
  WHERE player_id = p_player_id;

  IF NOT FOUND THEN
    INSERT INTO golf_player_stats_cache (
      id, player_id,
      strokes_gained_total, strokes_gained_tee, strokes_gained_approach,
      strokes_gained_around_green, strokes_gained_putting,
      sg_total_per_round, sg_tee_per_round, sg_approach_per_round,
      sg_around_green_per_round, sg_putting_per_round,
      rounds_played, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), p_player_id,
      ROUND(v_sg_total::NUMERIC,    3),
      ROUND(v_sg_tee::NUMERIC,      3),
      ROUND(v_sg_approach::NUMERIC, 3),
      ROUND(v_sg_around::NUMERIC,   3),
      ROUND(v_sg_putting::NUMERIC,  3),
      ROUND((v_sg_total    / v_count)::NUMERIC, 3),
      ROUND((v_sg_tee      / v_count)::NUMERIC, 3),
      ROUND((v_sg_approach / v_count)::NUMERIC, 3),
      ROUND((v_sg_around   / v_count)::NUMERIC, 3),
      ROUND((v_sg_putting  / v_count)::NUMERIC, 3),
      v_count, now(), now()
    );
  END IF;
END;
$$;

ALTER FUNCTION "public"."update_player_stats_strokes_gained"("p_player_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_push_subscriptions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_push_subscriptions_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_qualifier_leaderboard"("p_qualifier_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Update entry totals from rounds
  UPDATE golf_qualifier_entries qe
  SET
    total_score = sub.sum_score,
    total_to_par = sub.sum_to_par,
    rounds_completed = sub.round_count,
    score = sub.sum_score
  FROM (
    SELECT
      player_id,
      COALESCE(SUM(total_score), 0) AS sum_score,
      COALESCE(SUM(score_to_par), 0) AS sum_to_par,
      COUNT(*) FILTER (WHERE status = 'completed') AS round_count
    FROM golf_rounds
    WHERE qualifier_id = p_qualifier_id
    GROUP BY player_id
  ) sub
  WHERE qe.qualifier_id = p_qualifier_id
    AND qe.player_id = sub.player_id;

  -- Update positions based on total_to_par
  WITH ranked AS (
    SELECT
      id,
      RANK() OVER (ORDER BY total_to_par ASC) as pos,
      COUNT(*) OVER (PARTITION BY total_to_par) > 1 as tied
    FROM golf_qualifier_entries
    WHERE qualifier_id = p_qualifier_id
      AND rounds_completed > 0
  )
  UPDATE golf_qualifier_entries qe
  SET
    position = ranked.pos,
    is_tied = ranked.tied
  FROM ranked
  WHERE qe.id = ranked.id;
END;
$$;

ALTER FUNCTION "public"."update_qualifier_leaderboard"("p_qualifier_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_round_stats_cache"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_front_nine INTEGER; v_back_nine INTEGER;
  v_eagles INTEGER; v_birdies INTEGER; v_pars INTEGER;
  v_bogeys INTEGER; v_double_bogeys INTEGER; v_triple_plus INTEGER;
  v_one_putts INTEGER; v_three_putts INTEGER;
  v_scrambles_converted INTEGER; v_scramble_attempts INTEGER;
  v_sand_saves INTEGER; v_sand_attempts INTEGER;
  v_total_putts_from_holes INTEGER; v_total_penalties_from_holes INTEGER;
  v_hole_count INTEGER;
  v_driving_distance_avg NUMERIC;
BEGIN
  IF NEW.status != 'completed' THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_hole_count FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  -- Compute driving distance average from tee shot distances
  SELECT AVG(gs.shot_distance)
  INTO v_driving_distance_avg
  FROM golf_shots gs
  JOIN golf_holes gh ON gh.id = gs.hole_id
  WHERE gh.round_id = NEW.id
    AND gs.shot_type = 'tee'
    AND gs.shot_distance IS NOT NULL
    AND gs.shot_distance > 0;

  IF v_hole_count = 0 THEN
    INSERT INTO golf_round_stats_cache (
      round_id, player_id, total_score, score_to_par, front_nine, back_nine,
      fairways_hit, fairways_total, greens_hit, greens_total,
      total_putts, one_putts, three_putts, scrambles_converted, scramble_attempts,
      sand_saves, sand_attempts, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
      penalty_strokes, driving_distance_avg,
      strokes_gained_total, strokes_gained_tee,
      strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
      created_at, updated_at
    ) VALUES (
      NEW.id, NEW.player_id, NEW.total_score, NEW.score_to_par,
      NEW.front_nine, NEW.back_nine, NEW.total_fairways_hit, NEW.total_fairways,
      NEW.total_gir, NEW.total_gir_possible, NEW.total_putts, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, v_driving_distance_avg,
      NEW.strokes_gained_total, NEW.strokes_gained_tee,
      NEW.strokes_gained_approach, NEW.strokes_gained_around_green,
      NEW.strokes_gained_putting, NOW(), NOW()
    ) ON CONFLICT (round_id) DO UPDATE SET
      total_score = EXCLUDED.total_score, score_to_par = EXCLUDED.score_to_par,
      front_nine = EXCLUDED.front_nine, back_nine = EXCLUDED.back_nine,
      fairways_hit = EXCLUDED.fairways_hit, fairways_total = EXCLUDED.fairways_total,
      greens_hit = EXCLUDED.greens_hit, greens_total = EXCLUDED.greens_total,
      total_putts = EXCLUDED.total_putts,
      driving_distance_avg = EXCLUDED.driving_distance_avg,
      strokes_gained_total = EXCLUDED.strokes_gained_total,
      strokes_gained_tee = EXCLUDED.strokes_gained_tee,
      strokes_gained_approach = EXCLUDED.strokes_gained_approach,
      strokes_gained_around_green = EXCLUDED.strokes_gained_around_green,
      strokes_gained_putting = EXCLUDED.strokes_gained_putting, updated_at = NOW();
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN hole_number <= 9 THEN score ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN hole_number > 9 THEN score ELSE 0 END), 0)
  INTO v_front_nine, v_back_nine FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN (score-par)<=-2 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=-1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)=2 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN (score-par)>=3 THEN 1 ELSE 0 END),0)
  INTO v_eagles, v_birdies, v_pars, v_bogeys, v_double_bogeys, v_triple_plus
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN putts=1 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN putts>=3 THEN 1 ELSE 0 END),0), COALESCE(SUM(putts),0)
  INTO v_one_putts, v_three_putts, v_total_putts_from_holes
  FROM golf_holes WHERE round_id = NEW.id AND putts IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN gir=false AND (score-par)<=0 THEN 1 ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN gir=false THEN 1 ELSE 0 END),0)
  INTO v_scrambles_converted, v_scramble_attempts
  FROM golf_holes WHERE round_id = NEW.id AND score IS NOT NULL;

  SELECT COALESCE(SUM(CASE WHEN sand_save=true THEN 1 ELSE 0 END),0),
    COALESCE(COUNT(*) FILTER (WHERE sand_save IS NOT NULL),0)
  INTO v_sand_saves, v_sand_attempts FROM golf_holes WHERE round_id = NEW.id;

  SELECT COALESCE(SUM(COALESCE(penalty_strokes,0)),0) INTO v_total_penalties_from_holes
  FROM golf_holes WHERE round_id = NEW.id;

  INSERT INTO golf_round_stats_cache (
    round_id, player_id, total_score, score_to_par, front_nine, back_nine,
    fairways_hit, fairways_total, greens_hit, greens_total,
    total_putts, one_putts, three_putts, scrambles_converted, scramble_attempts,
    sand_saves, sand_attempts, eagles, birdies, pars, bogeys, double_bogeys, triple_plus,
    penalty_strokes, driving_distance_avg,
    strokes_gained_total, strokes_gained_tee,
    strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting,
    created_at, updated_at
  ) VALUES (
    NEW.id, NEW.player_id,
    COALESCE(NEW.total_score, v_front_nine + v_back_nine),
    COALESCE(NEW.score_to_par, (v_front_nine + v_back_nine) - (SELECT COALESCE(SUM(par),0) FROM golf_holes WHERE round_id = NEW.id)),
    v_front_nine, v_back_nine,
    COALESCE(NEW.total_fairways_hit, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND fairway_hit = true)),
    COALESCE(NEW.total_fairways, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND par > 3 AND fairway_hit IS NOT NULL)),
    COALESCE(NEW.total_gir, (SELECT COUNT(*) FROM golf_holes WHERE round_id = NEW.id AND gir = true)),
    COALESCE(NEW.total_gir_possible, v_hole_count),
    COALESCE(NEW.total_putts, v_total_putts_from_holes),
    v_one_putts, v_three_putts, v_scrambles_converted, v_scramble_attempts,
    v_sand_saves, v_sand_attempts,
    v_eagles, v_birdies, v_pars, v_bogeys, v_double_bogeys, v_triple_plus,
    v_total_penalties_from_holes, v_driving_distance_avg,
    NEW.strokes_gained_total, NEW.strokes_gained_tee,
    NEW.strokes_gained_approach, NEW.strokes_gained_around_green,
    NEW.strokes_gained_putting, NOW(), NOW()
  ) ON CONFLICT (round_id) DO UPDATE SET
    total_score=EXCLUDED.total_score, score_to_par=EXCLUDED.score_to_par,
    front_nine=EXCLUDED.front_nine, back_nine=EXCLUDED.back_nine,
    fairways_hit=EXCLUDED.fairways_hit, fairways_total=EXCLUDED.fairways_total,
    greens_hit=EXCLUDED.greens_hit, greens_total=EXCLUDED.greens_total,
    total_putts=EXCLUDED.total_putts, one_putts=EXCLUDED.one_putts, three_putts=EXCLUDED.three_putts,
    scrambles_converted=EXCLUDED.scrambles_converted, scramble_attempts=EXCLUDED.scramble_attempts,
    sand_saves=EXCLUDED.sand_saves, sand_attempts=EXCLUDED.sand_attempts,
    eagles=EXCLUDED.eagles, birdies=EXCLUDED.birdies, pars=EXCLUDED.pars,
    bogeys=EXCLUDED.bogeys, double_bogeys=EXCLUDED.double_bogeys, triple_plus=EXCLUDED.triple_plus,
    penalty_strokes=EXCLUDED.penalty_strokes,
    driving_distance_avg=EXCLUDED.driving_distance_avg,
    strokes_gained_total=EXCLUDED.strokes_gained_total, strokes_gained_tee=EXCLUDED.strokes_gained_tee,
    strokes_gained_approach=EXCLUDED.strokes_gained_approach,
    strokes_gained_around_green=EXCLUDED.strokes_gained_around_green,
    strokes_gained_putting=EXCLUDED.strokes_gained_putting, updated_at=NOW();

  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_round_stats_cache"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."update_user_last_seen"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF target_user_id <> auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE users
  SET last_seen = NOW()
  WHERE id = target_user_id
    AND (last_seen IS NULL OR last_seen < NOW() - INTERVAL '5 minutes');
END;
$$;

ALTER FUNCTION "public"."update_user_last_seen"("target_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."user_conversation_ids"("p_user_id" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT conversation_id
  FROM golf_conversation_participants
  WHERE user_id = (SELECT auth.uid());
$$;

ALTER FUNCTION "public"."user_conversation_ids"("p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."user_has_pending_join_request_to_coach_team"("check_player_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_team_join_requests jr
    JOIN golf_team_coach_staff gtcs ON gtcs.team_id = jr.team_id
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE jr.player_id = check_player_id
      AND jr.status = 'pending'
      AND gc.user_id = auth.uid()
  )
$$;

ALTER FUNCTION "public"."user_has_pending_join_request_to_coach_team"("check_player_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."user_has_pending_join_request_to_coach_team"("check_player_id" "uuid") IS 'True when the current user is STAFFED (golf_team_coach_staff) on a team the player has a pending join request to. Was organization-scoped, which let a coach read players requesting to a sibling team they do not staff (fixed 2026-08-08).';

CREATE OR REPLACE FUNCTION "public"."user_is_coach_of_golf_player"("check_player_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM golf_team_coach_staff gtcs
    JOIN golf_coaches gc ON gc.id = gtcs.coach_id
    JOIN golf_team_members gtm ON gtm.team_id = gtcs.team_id
    WHERE gc.user_id = auth.uid()
      AND gtm.player_id = check_player_id
      AND gtm.status = 'active'
  )
$$;

ALTER FUNCTION "public"."user_is_coach_of_golf_player"("check_player_id" "uuid") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."user_is_coach_of_golf_player"("check_player_id" "uuid") IS 'True if the current user is staffed (golf_team_coach_staff) on a team the player is an active member of. Staff-scoped (was org-scoped) so the mens/womens wall holds within one program.';

CREATE OR REPLACE FUNCTION "public"."user_is_golf_team_member"("check_team_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM golf_team_members gtm
    WHERE gtm.team_id = check_team_id
    AND gtm.player_id = get_current_golf_player_id()
    AND gtm.status = 'active'
  )
$$;

ALTER FUNCTION "public"."user_is_golf_team_member"("check_team_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."user_is_teammate_of_golf_player"("check_player_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM golf_team_members my_tm
    JOIN golf_players my_gp ON my_gp.id = my_tm.player_id
    JOIN golf_team_members their_tm ON their_tm.team_id = my_tm.team_id
    WHERE my_gp.user_id = auth.uid()
      AND my_tm.status = 'active'
      AND their_tm.player_id = check_player_id
      AND their_tm.status = 'active'
  )
$$;

ALTER FUNCTION "public"."user_is_teammate_of_golf_player"("check_player_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."validate_notification_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Ensure notification_preferences is always a valid JSONB object
  IF NEW.notification_preferences IS NOT NULL THEN
    -- Validate required keys exist with defaults
    NEW.notification_preferences = jsonb_build_object(
      'email_messages', COALESCE((NEW.notification_preferences->>'email_messages')::boolean, true),
      'email_pipeline_updates', COALESCE((NEW.notification_preferences->>'email_pipeline_updates')::boolean, true),
      'email_event_reminders', COALESCE((NEW.notification_preferences->>'email_event_reminders')::boolean, true),
      'email_profile_views', COALESCE((NEW.notification_preferences->>'email_profile_views')::boolean, false),
      'email_announcements', COALESCE((NEW.notification_preferences->>'email_announcements')::boolean, true),
      'push_enabled', COALESCE((NEW.notification_preferences->>'push_enabled')::boolean, true),
      'push_messages', COALESCE((NEW.notification_preferences->>'push_messages')::boolean, true),
      'push_events', COALESCE((NEW.notification_preferences->>'push_events')::boolean, true),
      'digest_frequency', COALESCE(NEW.notification_preferences->>'digest_frequency', 'daily')
    );
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."validate_notification_preferences"() OWNER TO "postgres";

COMMENT ON FUNCTION "public"."validate_notification_preferences"() IS 'Validates and normalizes notification_preferences JSONB column on users table';

CREATE OR REPLACE FUNCTION "public"."verify_coach_owns_player"("p_player_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.golf_team_members gtm
    JOIN public.golf_team_coach_staff gtcs ON gtcs.team_id = gtm.team_id
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtm.player_id = p_player_id
      AND gtm.status = 'active'::team_member_status
      AND gc.user_id = p_user_id
  );
END
$$;

ALTER FUNCTION "public"."verify_coach_owns_player"("p_player_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."verify_coach_owns_team"("p_team_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.golf_team_coach_staff gtcs
    JOIN public.golf_coaches gc ON gc.id = gtcs.coach_id
    WHERE gtcs.team_id = p_team_id
      AND gc.user_id = p_user_id
  );
END
$$;

ALTER FUNCTION "public"."verify_coach_owns_team"("p_team_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."write_suppression_on_unsubscribe"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.event_type = 'email.unsubscribed' AND NEW.recipient_email IS NOT NULL THEN
    INSERT INTO crm_email_suppressions (email, reason, source, metadata, suppressed_at)
    VALUES (
      NEW.recipient_email::citext,
      'unsubscribed',
      'resend_webhook',
      jsonb_build_object('email_id', NEW.resend_message_id, 'event_id', NEW.id),
      NEW.occurred_at
    )
    ON CONFLICT (email, reason) DO NOTHING;

    UPDATE crm_coaches c
       SET email_status = 'unsubscribed', updated_at = now()
      FROM crm_contact_log cl
     WHERE cl.id = NEW.contact_log_id AND cl.coach_id = c.id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."write_suppression_on_unsubscribe"() OWNER TO "postgres";

-- 20260421100003_coachhelm_function_search_path.sql
-- Pin search_path on engine-related functions (advisor LIVE-28).
-- Team A — Database Foundation (CoachHelm fix plan, 2026-04-21)
--
-- NOTE: plan listed sg_expected_strokes(numeric, text) but the actual
-- signature in production is (text, numeric). Corrected here.
-- update_player_stats_strokes_gained has two overloads: no-arg trigger
-- function + (uuid) variant. Both pinned.

ALTER FUNCTION public.update_round_stats_cache()                          SET search_path = public, pg_temp;
ALTER FUNCTION public.update_player_stats_cache()                         SET search_path = public, pg_temp;
ALTER FUNCTION public.recalculate_round_strokes_gained(uuid)              SET search_path = public, pg_temp;
ALTER FUNCTION public.update_player_stats_strokes_gained()                SET search_path = public, pg_temp;
ALTER FUNCTION public.update_player_stats_strokes_gained(uuid)            SET search_path = public, pg_temp;
ALTER FUNCTION public.sg_normalize_lie(text)                              SET search_path = public, pg_temp;
ALTER FUNCTION public.sg_expected_strokes(text, numeric)                  SET search_path = public, pg_temp;
ALTER FUNCTION public.sg_estimate_from_holes(uuid)                        SET search_path = public, pg_temp;
ALTER FUNCTION public.is_golf_team_coach(uuid)                            SET search_path = public, pg_temp;
ALTER FUNCTION public.is_golf_team_player(uuid)                           SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin()                                          SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                                   SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_updated_at()                                  SET search_path = public, pg_temp;

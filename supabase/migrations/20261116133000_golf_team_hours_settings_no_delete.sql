-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- Written 16 Nov 2026. Follow-up to 20261115232000_golf_team_hours.sql.
--
-- Risk: LOW. One privilege revoke; no table, column, policy or function changes.
--
-- What: 20261115232000 meant "no delete on settings (a coach changes them)" and
-- granted authenticated only select, insert and update. The project's default
-- privileges had already given authenticated every table privilege when the
-- table was created, and a GRANT does not take any away, so authenticated still
-- held DELETE (production checked read-only 2026-11-16). No delete policy
-- exists, so RLS refused every delete anyway; this makes the privilege match the
-- intent. pgTAP supabase/tests/rls/golf_team_hours.sql test 12 pins it and has
-- been red on main since 232000 landed.
--
-- ROLLBACK: grant delete on table public.golf_team_hours_settings to authenticated;
-- VERIFY: select 1 where not has_table_privilege('authenticated', 'public.golf_team_hours_settings', 'DELETE');

revoke delete on table public.golf_team_hours_settings from authenticated;

# CoachHelm Fix — Team A Hand-off

**Date:** 2026-04-21
**From:** Team A (Database Foundation)
**To:** Teams B, C, D, E

---

## Status: Team A DONE

All 5 migrations applied to live DB `qmnssrrolpinvwjjnufo` (Helm-Production). TypeScript types regenerated. Schema reference doc updated. Typecheck baseline captured.

## New tables available

| Table | Purpose | Team dependency |
|---|---|---|
| `golf_global_patterns` | cross-learner pattern store (fixes LIVE-1 phantom table) | Team B |
| `golf_insight_player_feedback` | player feedback loop target (LIVE-20) | **Team D** |

## RLS made canonical for

| Table | Was | Now |
|---|---|---|
| `golf_insight_effectiveness` | `USING (true)` — any auth user read any team | coach-scoped via `is_golf_team_coach(team_id)` + admin |
| `golf_coach_behavior_log` | `WITH CHECK (true)` + broken `auth.uid() = coach_id` SELECT | service-role INSERT + coach-owns SELECT via `golf_coaches` |
| `golf_player_baselines` | `auth.uid() = player_id` (never matched — players couldn't read) | player via `golf_players.user_id` + coach via `team_members` |
| `golf_percentile_cache` | same as baselines | same fix |
| `golf_team_coachhelm_settings` | org-wide `gc.organization_id = gt.organization_id` | team-scoped `is_golf_team_coach(team_id)` |
| `golf_announcement_documents` / `_tasks` | malformed subqueries | proper `is_golf_team_coach` / `is_golf_team_player` |
| `golf_round_reviews` | 6 overlapping SELECT policies | 4 canonical policies |
| 6 platform tables (LIVE-26) | RLS on, no policies | admin SELECT + service-role ALL |

## Other hardening

- 13 engine-related functions now have pinned `search_path = public, pg_temp` (advisor LIVE-28)
- `documents` storage bucket flipped to private (LIVE-29) — **IMPORTANT**: any code that embeds a direct public URL to `documents` must switch to `createSignedUrl()`. Team C/D to audit.
- `avatars` listing policy now requires `authenticated` (was anonymous)

## Work list for other teams

**Typecheck baseline:** `docs/superpowers/plans/2026-04-21-coachhelm-fix/typecheck-baseline.txt` — 333 errors surfaced after types regeneration. These are the schema-drift bugs audited as LIVE-8 through LIVE-10 plus unrelated `ignoreBuildErrors` accumulation. Teams B and C will fix the CoachHelm-adjacent ones; Team F handles the `ignoreBuildErrors` flip.

## Green lights

- **Team B:** Go. Types + `golf_global_patterns` ready.
- **Team C:** Go. Types ready for all action-layer schema-drift work.
- **Team D:** Go. `golf_insight_player_feedback` table + RLS live.
- **Team E:** Go. Types + engine tables ready.

## Known follow-ups for other teams

1. **Team D / Team C:** audit any `createPublicUrl()` usage against `documents` bucket; switch to `createSignedUrl()`.
2. **Team B:** the `baselines_write_service` and `percentile_write_service` policies require `auth.role() = 'service_role'`. Confirm the engine's write path uses a service-role client (`createServiceClient()`), not the end-user client.
3. **Team B:** `golf_insight_effectiveness_insert_service` similarly requires service-role INSERT. Engine writes only.
4. **Team E:** same service-role requirement for any cron job that writes to baselines / percentile / effectiveness tables.

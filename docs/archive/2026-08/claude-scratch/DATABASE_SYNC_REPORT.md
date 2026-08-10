# Database Migration Sync Report

**Generated:** 2026-02-12
**Status:** OUT OF SYNC

---

## Summary

| Category | Count | Risk |
|----------|-------|------|
| Production-only migrations (no local file) | 23 | Medium — local dev environment missing schema changes |
| Local-only migrations (not deployed) | 5 | High — production missing required schema changes |
| Timestamp mismatches (same content, different version) | ~8 | Low — cosmetic, but breaks `supabase db push` |

---

## Issue 1: 23 Production Migrations Missing from Local

These migrations were applied directly to production (likely via Supabase dashboard SQL editor or CLI) without corresponding local migration files. This means:

- **Local dev databases are missing these schema changes**
- Running `supabase db reset` locally will produce a database that doesn't match production
- Developers can't reproduce production bugs locally
- No version control history for these changes

### Affected Migrations

| Version | Name | Category |
|---------|------|----------|
| `20260205003913` | enable_missing_rls | Security/RLS |
| `20260205182350` | fix_calendar_schema_alignment | Schema fix |
| `20260205185839` | fix_team_join_notifications | Feature fix |
| `20260205220219` | fix_golf_rls_comprehensive_audit | Security/RLS |
| `20260205221946` | add_delete_policies_for_onboarding_cleanup | Security/RLS |
| `20260206221918` | fix_documents_and_add_folders | Feature |
| `20260207154958` | add_golf_documents_folder | Feature |
| `20260207202606` | add_performance_indexes | Performance |
| `20260208002942` | fix_player_putt_tendencies_security_invoker | Security |
| `20260208201432` | baseball_comprehensive_fixes | Schema fix |
| `20260208205719` | add_qualifier_scoring_columns | Schema |
| `20260208205815` | add_team_channel_and_update_conversations_rpc | Feature |
| `20260209002807` | fix_login_attempts_rls | Security/RLS |
| `20260209020330` | fix_golf_shots_check_constraints_deep_rough_recovery | Schema fix |
| `20260209021300` | remove_deep_rough_and_recovery | Schema cleanup |
| `20260209030234` | add_player_insert_update_policy_round_reviews | Security/RLS |
| `20260209223650` | add_admin_to_user_role_enum | Schema |
| `20260210003843` | add_user_last_active_view | Feature |
| `20260210010850` | add_platform_health_stats_function | Feature |
| `20260210152754` | admin_dashboard_v2_infrastructure | Feature |
| `20260210164509` | create_admin_analytics_tables | Feature |
| `20260210174729` | fix_golf_patterns_rls_and_coachhelm_settings | Security/RLS |
| `20260212153359` | fix_golf_team_members_rls_policy | Security/RLS |

### Risk Assessment

- **8 of 23 are RLS/security changes** — local dev may have different access control behavior than production
- **Admin dashboard infrastructure** (`admin_dashboard_v2`, `admin_analytics`, `platform_health_stats`) — entirely missing locally
- **Baseball fixes** (`baseball_comprehensive_fixes`, `qualifier_scoring_columns`) — local baseball features may be broken

### Recommended Fix

Pull each migration's SQL from production and save as local migration files:

```bash
# For each missing migration, fetch the SQL from production
supabase db dump --schema public > production_schema.sql
# Then diff against local schema to generate missing migrations
```

Or use `supabase db pull` to sync remote migrations to local.

---

## Issue 2: 5 Local Migrations Not Deployed to Production

These migrations exist locally but have NOT been applied to the production database:

| Local Version | Name | Impact |
|---------------|------|--------|
| `20260125000000` | fix_baseball_rls_comprehensive | Baseball RLS policies may be inconsistent |
| `20260207100000` | add_lie_types | Golf lie type enums may be missing |
| `20260209000000` | baseball_dashboard_wiring_fixes | Baseball dashboard queries may fail |
| `20260210000000` | fix_stats_cache_9_hole_support | 9-hole round stats may be broken |
| `20260212000001` | **add_team_timezone** | **Blocks new timezone feature from today's work** |

### Critical: `add_team_timezone`

This migration was created by today's agent work (Task 8 - Accessibility). It adds a `timezone` column to `golf_teams`:

```sql
ALTER TABLE golf_teams ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';
```

The new `src/lib/utils/timezone.ts` utility and updated `today-timeline.tsx` component reference this column. **Without this migration, the timezone feature will fall back to browser timezone** (the code handles missing column gracefully, but the feature won't work as intended).

### Potentially Stale: Older Local Migrations

The 4 older local-only migrations (`20260125`, `20260207`, `20260209`, `20260210`) may have been superseded by the production-only migrations that were applied directly. For example:

- Local `20260125000000_fix_baseball_rls_comprehensive` may overlap with production `20260208201432_baseball_comprehensive_fixes`
- Local `20260210000000_fix_stats_cache_9_hole_support` may have been manually applied with different SQL

**These need to be audited before deploying** — blindly running them could cause conflicts.

### Recommended Fix

```bash
# 1. Audit each local-only migration against production schema
# 2. For add_team_timezone (safe, uses IF NOT EXISTS):
supabase db push  # or apply via dashboard

# 3. For older migrations, compare against production schema first
supabase db diff  # see what's different
```

---

## Issue 3: Timestamp Mismatches

Several migrations exist in both local and production but with different version timestamps. This happens when migrations are created locally with simplified timestamps (e.g., `20260203000000`) but applied to production with actual timestamps (e.g., `20260203234317`).

| Local Version | Production Version | Name |
|---------------|-------------------|------|
| `20260203000000` | `20260203234317` | strokes_gained_persistence |
| `20260204000000` | `20260204184217` | fix_golf_team_join_rls |
| `20260204100000` | `20260204195856` | golf_team_join_requests |
| `20260204200000` | `20260204223435` | fix_golf_rls_infinite_recursion |
| `20260204210000` | `20260204231003` | fix_golf_rls_recursion_v2 |
| `20260204235000` | `20260204231437` | fix_golf_rls_recursion_final |
| `20260205000000` | `20260204232307` | allow_coaches_see_join_request_players |
| `20260212000000` | `20260212194115` | dashboard_performance_indexes |

### Impact

- `supabase db push` may try to re-apply migrations it thinks are new
- `supabase migration list` will show mismatches
- Automated deployment pipelines may fail or double-apply

### Recommended Fix

Rename local files to match production timestamps, or use `supabase migration repair` to reconcile the version history.

---

## Issue 4: No Migration Workflow Enforcement

The root cause of all sync issues is that migrations are being applied to production through multiple channels:

1. **Local migration files** — committed to git, applied via `supabase db push`
2. **Supabase dashboard SQL editor** — applied directly, no local file created
3. **Supabase CLI ad-hoc** — applied with auto-generated timestamps

### Recommended Process

1. **All schema changes must go through local migration files** — no direct SQL in dashboard
2. **Use `supabase db pull`** after any direct production changes to sync back
3. **Add CI check** that compares `supabase migration list --local` vs `supabase migration list --remote`
4. **Use `supabase db diff`** before deploying to catch drift

---

## Action Items

### Immediate (before next deploy)

- [ ] Apply `20260212000001_add_team_timezone` to production (required for timezone feature)
- [ ] Audit the 4 older local-only migrations — determine if they're stale or needed

### Short Term (this week)

- [ ] Pull all 23 production-only migrations into local files using `supabase db pull`
- [ ] Reconcile timestamp mismatches with `supabase migration repair`
- [ ] Verify local `supabase db reset` produces a schema matching production

### Long Term

- [ ] Establish migration workflow: all changes through local files only
- [ ] Add CI check for migration sync (e.g., `supabase db diff` in PR checks)
- [ ] Document migration process in `CLAUDE.md` or `docs/DEVELOPMENT_RULES.md`

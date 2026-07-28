# Helm Database Map

**Research date:** 2026-07-26  
**Project:** Helm-Production `qmnssrrolpinvwjjnufo`  
**Live counts:** public tables **264** (RLS on **264**), policies **940**, views **6**, matviews **1**  
**Repo migrations:** 256 under `supabase/migrations/`  
**Types:** `src/lib/types/database.ts` (regen via `npm run db:types`)  
**Detailed columns:** `memory/context/golfhelm-database.md`, `baseballhelm-database.md`, glossary AUTOGEN

**PII policy:** This doc uses table names, schema shape, and aggregate row counts only.

---

## 1. Entity relationship (simplified)

```
auth.users ──< public.users
                 │
                 ├──< organizations
                 │       ├──< golf_teams ──< golf_team_coach_staff ── golf_coaches
                 │       │              └──< golf_team_members ── golf_players
                 │       │                        └── golf_rounds ── golf_holes / golf_shots
                 │       │                        └── golf_event_attendance ── golf_events
                 │       │                        └── golf_player_focus_areas / golf_goals
                 │       │                        └── golf_coach_insights (team/player scoped)
                 │       ├──< baseball_teams ── staff/members ── players
                 │       │         └── games / box scores / practices / recruiting
                 │       └──< helm_lifting_* (athletes, programs, sessions)
                 │
                 ├── notifications, push_subscriptions, device_tokens
                 └── admin_*, crm_*, emails / email_events
```

---

## 2. Domain data dictionary (high-signal tables)

### Shared

| Table | Rows* | Purpose | App use |
|-------|------:|---------|---------|
| users | 123 | App profile + role | Auth layouts |
| organizations | 27 | Tenancy root | Onboarding |
| notifications | 27 | Cross-sport inbox | Notif actions |
| admin_events | 93009 | Helm Bridge telemetry | Admin |
| admin_analytics_events | 20500 | Analytics | Admin |
| error_logs | 91239 | Errors | Admin |
| background_job_logs | 7081 | Jobs | Admin |
| emails / email_events / email_clicks | large | Resend mirror | CRM/notif |
| push_subscriptions | 0 | Web push | Partial |
| device_tokens | 11 | Native push | Partial |
| demo_requests | 4 | Marketing | |
| login_attempts / auth_rate_limits | small | Auth security | |

### Golf core

| Table | Rows* | Notes |
|-------|------:|-------|
| golf_teams | 12 | |
| golf_coaches | 14 | |
| golf_players | 61 | |
| golf_team_members | 51 | |
| golf_team_coach_staff | 15 | |
| golf_team_join_requests | 13 | |
| golf_rounds | 291 | |
| golf_holes | 5148 | |
| golf_shots | 21276 | |
| golf_player_stats_cache | 30 | |
| golf_round_stats_cache | 284 | |
| golf_events | 77 | |
| golf_event_attendance | 453 | |
| golf_messages / conversations | 31 / 5 | |
| golf_tasks / assignments | 16 / 102 | |
| golf_qualifiers / entries | 4 / 26 | |
| golf_courses / tees / tee_holes | 28 / 64 / 1152 | |
| golf_course_holes | **0** | Possible legacy/unused vs tee_holes |
| golf_travel_itineraries | 10 | budgets/expenses 0 |
| golf_demo_sessions | 220 | |

### CoachHelm / AI

| Table | Rows* | Notes |
|-------|------:|-------|
| golf_coach_insights | 550 | Visibility filter app-layer |
| golf_patterns_v2 | 493 | |
| golf_predictions | 522 | |
| golf_round_reviews | 71 | |
| golf_player_focus_areas | 25 | Legacy focus |
| golf_goals | 18 | V3 |
| golf_goal_suggestions | 347 | |
| golf_insight_exposure | 33122 | Ledger |
| golf_insight_action | 4 | Sparse |
| golf_insight_outcome | 44 | |
| golf_insight_effectiveness | 5098 | |
| golf_coachhelm_chat_conversations | 41 | |
| golf_coachhelm_chat_messages | 99 | |
| golf_coachhelm_action_runs | 3 | Idempotency |
| golf_coachhelm_llm_calls | 288 | |
| golf_coachhelm_llm_budget | 28 | |
| golf_player_genome | 52 | |
| golf_player_standing | 464 | |
| golf_metrics / golf_pga_standards | 28 / 56 | Registries |
| golf_coach_behavior_log | **0** | Orphaned feature |
| golf_ingest_connections | 0 | TrackMan etc. dark |

### Baseball (sample)

| Table | Rows* | Notes |
|-------|------:|-------|
| baseball_teams | 13 | |
| baseball_players | 35 | |
| baseball_coaches | 10 | |
| baseball_team_members | 34 | |
| baseball_team_coach_staff | 7 | capabilities |
| baseball_games | 46 | |
| baseball_box_score_batting/pitching | 179 / 53 | |
| baseball_player_stats | 268 | legacy layer |
| baseball_practices | 4 | |
| baseball_events | 28 | |
| baseball_messages | 72 | |
| baseball_watchlists | 9 | |
| baseball_import_runs | 2 | |
| baseball_signals | **0** | Partial AI |
| Many elite event tables | **0** | Scaffold/partial |

### Lift

| Table | Rows* |
|-------|------:|
| helm_lifting_athletes | 22 |
| helm_lifting_sessions | 88 |
| helm_lifting_set_results | 286 |
| helm_lifting_programs | 2 |
| helm_lifting_import_runs | 0 |

### CRM

| Table | Rows* | Notes |
|-------|------:|-------|
| crm_coaches | 2401 | Outreach leads |
| crm_sequence_enrollments | 1756 | |
| crm_contact_log | 1311 | |
| crm_events | **0** | Written unused? (issue #988) |
| crm_email_templates_backup_* | 40 | RLS enabled **no policies** (advisor INFO) |

\*Prod snapshot row counts via MCP `list_tables` — change over time.

---

## 3. RLS summary

- **All 264 public tables have RLS enabled** (SQL check returned zero tables with RLS off).
- **940 policies** — do not assume every policy is correct; use pgTAP suites under `supabase/tests/rls/`.
- Helper functions live: `is_golf_team_coach`, `is_golf_team_head_coach`, `is_golf_team_player`, `is_baseball_team_*`, `current_coach_id`, `current_player_id`.
- Advisor findings (sampled): SECURITY DEFINER views (ERROR level), backup table with RLS and no policies, others truncated in dump.
- Insight lifecycle **not** in RLS — `applyInsightVisibility` only.
- Billing tables: deny-by-default pattern in pgTAP (`billing_deny_by_default.sql`) — service_role only.

---

## 4. Functions / triggers / jobs

| Mechanism | Evidence |
|-----------|----------|
| RLS helpers | SQL list above |
| Vercel crons | 18 paths in `vercel.json` (CoachHelm, standing, genome, goals, reminders, CRM, integrity) |
| pg_cron | 1 job: purge admin_events / admin_analytics_events >180d |
| Inngest | `/api/inngest` + `src/lib/inngest/functions.ts` |
| Edge functions | `create-admin-user` (verify_jwt false — risk), `send-apns-push`, `personalize-email`, `verify-emails` |
| Repo edge folder also has `process-task-reminders` | May differ from deployed set |

---

## 5. Storage buckets

| Bucket | Public | Limit | Use |
|--------|--------|------:|-----|
| avatars | yes | 2MB | Profiles |
| logos | yes | 2MB | Branding |
| course-images | yes | 5MB | Golf courses |
| documents | no | 50MB | Team docs |
| baseball-imports | no | 25MB | Stat files |
| recruit-documents | no | 25MB | Golf recruits |
| lifting-nutrition | no | 25MB | Lift |
| helm-bridge-feedback | no | 8MB | Admin feedback screenshots |

---

## 6. Integrity / mismatch risks

| Risk | Evidence |
|------|----------|
| `golf_course_holes` empty vs tee_holes populated | Row counts |
| Task completion dual tables | glossary |
| Focus areas vs goals dual model | V3 migration in progress |
| v2 insights written but dark | coachhelm-ai.md |
| Types drift | CI `check:types-drift` |
| CRM backup table no policies | advisor |
| create-admin-user JWT verify false | edge function metadata |
| Unused tables with RLS | Many baseball 0-row elite tables |
| Soft delete inconsistent | course tees soft-delete; others hard |
| Prod has demo + real data mixed | demo_sessions, seed scripts |

---

## 7. Code ↔ schema

- Prefer `database.ts` + migrations over stale ownership audit (2026-01).  
- Untyped escape hatch: `fromUntyped` allowlist (`src/lib/supabase/untyped.ts`).  
- When scan asserts columns, generate from live types — do not hardcode from memory docs alone.

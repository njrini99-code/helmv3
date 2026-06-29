# Agent 4: cross-cutting — DONE

## Per-concern verdict

### Settings persistence: WIRED (with type-cast smell)
- Profile name update: `src/app/golf/(dashboard)/dashboard/settings/page.tsx:733-742` — `users.full_name`/`golf_players.first_name,last_name,avatar_url` updates via Supabase client, real writes.
- Avatar upload: `src/components/ui/avatar-upload.tsx:76` (storage upload) + `:88` (`getPublicUrl`) — fully wired, persisted into `avatar_url` column.
- Email change: `settings/page.tsx:805` — `supabase.auth.updateUser({ email })`. Password change: `:853`.
- Notification prefs: `src/app/actions/notification-preferences.ts` (server action exists, schema validated, wired in settings UI at `:920-927`).
- Team settings (head-coach only): `settings/page.tsx:1097-1110` — uses `fromUntyped(supabase, 'golf_team_settings')` because regenerated types don't include the table (smell, not a bug).
- Org name update: `settings/page.tsx:1378` uses `(supabase as any).from('organizations')` — type-system bypass, but write is real.
- Coaching-intelligence philosophy: `settings/coaching-intelligence/page.tsx:80-94` reads, `useCoachPhilosophy` hook handles save via server action.

### Onboarding: WIRED end-to-end
- Coach (3-step) handler: `src/app/golf/(onboarding)/coach/page.tsx:122-151` calls `completeCoachOnboarding` server action.
- `completeCoachOnboarding`: `src/app/golf/actions/onboarding.ts:55-219` creates `organizations`, `golf_coaches`, `golf_teams`, `golf_team_coach_staff` rows with full transactional cleanup on failure (lines 148-194, 207-218).
- Player (4-step) handler: `(onboarding)/player/page.tsx:131-163` calls `completePlayerOnboarding`. Skipped/abandoned handling: `ensurePlayerRecord` at `actions/onboarding.ts:232-285` creates a minimal player row at page load with `onboarding_completed=false`, so abandoned flows are recoverable.

### Auth flows: WIRED
- Login: `(auth)/login/page.tsx:53-65` real `signInWithPassword` flow with role-based routing.
- Signup: `(auth)/signup/page.tsx:45-54` access-code gate then delegates to `<GolfSignUpForm>` (`src/components/auth/golf-sign-up-form.tsx`).
- Forgot-password: `(auth)/forgot-password/page.tsx:26` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })` — Supabase handles email send (no custom Resend route required for reset).
- Reset-password: `(auth)/reset-password/page.tsx:40` calls `supabase.auth.updateUser({ password })`. Real password mutation.

### RLS coverage: GAPS (Major)
Computed by diffing migration grep output:
- **7 tables CREATE TABLE'd but never `ENABLE ROW LEVEL SECURITY`'d** (file:line grep across `supabase/migrations/`): `auth_rate_limits`, `colleges`, `golf_insight_weights`, `golf_player_insights`, `high_schools`, `lineup_positions`, `video_views`. `golf_player_insights` is concerning — it's a player-scoped table.
- **80+ tables have RLS enabled but NO `CREATE POLICY` rows** detected in migrations (full list dumped to /tmp/tables_rls.txt minus /tmp/tables_policy.txt during scan). Notable: `golf_coaches`, `golf_courses`, `messages`, `notifications`, `organizations`, `golf_team_coachhelm_settings`, `golf_global_patterns`, `golf_review_insights`, `golf_qualifier_entries`, `golf_event_attendance`, `golf_event_rsvps`, `crm_*`, `coaches`, `players`, `teams`, `events`. Either policies live outside `supabase/migrations/` (production-only?), or these tables are silently locked from clients (RLS denies all when no policy). Production data exists in many of these, so policies must exist somewhere — but they are NOT in the repo, which breaks the migration-as-source-of-truth model. **Severity: Major** (deploy reproducibility / new env bring-up will be broken).
- 74 places use `fromUntyped(...)` or `(supabase as any).from(...)` — strong signal Supabase generated types are stale. Centralized in `src/lib/supabase/untyped.ts` (one disable, contained), but it leaks type-safety across actions.

### Type cleanliness: top 5 offenders
1. `src/app/baseball/actions/documents.ts` — 28 `as any|as unknown as` casts.
2. `src/app/golf/actions/documents.ts` — 27 casts.
3. `src/app/golf/actions/golf.ts` — 26 casts (CRITICAL PATH: rounds, shots, scoring).
4. `src/app/baseball/actions/games.ts` — 26 casts.
5. `src/app/golf/actions/announcements.ts` — 23 casts; `src/app/golf/actions/insights.ts` — 20 (CRITICAL PATH: CoachHelm AI).
- Totals across `src/`: **449 `as any`**, **255 `as unknown as`**, **0 `@ts-ignore`**, **5 `@ts-expect-error`**, **424 `eslint-disable*`** comments. Auth has minimal casts; payments not present (no Stripe); AI/CoachHelm critical path is contaminated (insights.ts, coachhelm-analytics.ts via fromUntyped).

### Route hygiene: clean
- 125 distinct page routes. Branded 404 exists (`src/app/not-found.tsx:4-15`) — TODO.md:501 is stale.
- All 6 `vercel.json` cron paths map to existing `route.ts` files.
- Redirect targets `(dashboard)/layout.tsx:96 redirect('/golf/coach')` and `:125 redirect('/golf/player')` resolve through the `(onboarding)` route group — no 404/loop.
- No orphan/dead route detected in spot checks; existing TODO.md auto-audit makes no orphan/loop claims.

### Cron jobs: 6 declared, 6 implemented (all real)
- `coach-morning-digest` (419 lines), `coachhelm-validation` (122), `coachhelm-calibration` (155), `coachhelm-safety-net` (139), `coachhelm-insight-lifecycle` (280), `coachhelm-roster-sweep` (107). None return "not implemented" / placeholder. (`src/app/api/cron/*/route.ts`).

### Mobile parity: largely OK; one gap
- coachhelm raw `<table>` uses (`RoundReviewViewer.tsx:489,827`, `analytics/InsightEffectivenessPanel.tsx:189`) — all wrapped in `overflow-x-auto` / `overflow-hidden`, mobile-safe.
- 41 `md:` breakpoint uses across `components/golf/coachhelm` — responsive intent present.
- **Settings page (`settings/page.tsx`, 1544 lines) is a single monolith** with multiple inline subcomponents — has not been audited for `md:` breakpoints in modal subforms; spot-check: many sections use `Section` collapse pattern which works on mobile, but team-settings panel at `:1064-1110` does not appear to test narrow widths. Severity: Minor.

### Empty-table writers
**No writer in code (read-only references → table will stay at 0 rows forever):**
1. `golf_insight_effectiveness` — only read at `actions/coachhelm-analytics.ts:163`. **No writer.** Table is consumed by analytics UI but nothing populates it. (BLOCKER for CoachHelm Analytics surface — UI will always be empty/error.)
2. `golf_prediction_model_performance` — only read at `actions/coachhelm-analytics.ts:305`. **No writer.** Same problem.
3. `golf_team_coachhelm_settings` — read at `actions/insights.ts:3081`. **No writer.** Means team-level CoachHelm disable toggle has no setter.
4. `golf_insight_feedback_scores` — only present in generated types (`lib/types/database.ts:7139`). **Zero references in code.**
5. `golf_review_insights` — written at `actions/round-reviews.ts:1371` via `(supabase.from('golf_review_insights' as any))` then `.update(...)` at `:1373` — UPDATE only, no INSERT. So row source is unclear (likely engine SQL, not app code). Table empty in prod — engine probably never writes them.

**Has writer in code (engine simply hasn't run, or not triggered):**
6. `golf_global_patterns` — `lib/coachhelm/v2/learning/cross-learner.ts:616-617` `.upsert(...)`. Cron `coachhelm-calibration` likely triggers this.
7. `golf_coach_behavior_log` — `lib/coachhelm/v2/feedback/coach-behavior.ts:191-192` `.insert(payload)`. Triggered by user actions; just hasn't fired.
8. `golf_coach_blocked_time` — `actions/golf.ts:3037-3039` `.insert(...)` and updates at `:3094, :3106, :3153, :3177`. UI feature exists; just unused so far.

## Top cross-cutting gaps (ranked)

1. **[BLOCKER]** `src/app/golf/actions/coachhelm-analytics.ts:163` & `:305` — `golf_insight_effectiveness` and `golf_prediction_model_performance` are read by the CoachHelm Analytics dashboard but **no code path writes them**. The Coaching Settings → CoachHelm Analytics surface will show "no data" / empty chart in production forever. Fix: identify whether engine SQL/triggers are supposed to populate these (check production DB triggers or add an aggregation cron).
2. **[MAJOR]** RLS migration drift — 80+ tables in `supabase/migrations/` `ENABLE ROW LEVEL SECURITY` but have no `CREATE POLICY` in repo. Either policies live in untracked production SQL or RLS is silently denying all access. Fix: regenerate `supabase db dump --schema-only` of policies into a tracked migration so a fresh env can be brought up.
3. **[MAJOR]** 7 tables created without RLS at all (`auth_rate_limits`, `colleges`, `golf_insight_weights`, `golf_player_insights`, `high_schools`, `lineup_positions`, `video_views`) — `golf_player_insights` is player-scoped data with no row-level access control. Fix: add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + appropriate policies.
4. **[MAJOR]** Stale Supabase generated types — 74 `fromUntyped`/`(supabase as any).from()` call sites across actions. Action items in critical paths: `actions/insights.ts:3081` (team CoachHelm settings), `actions/round-reviews.ts:1371` (review insights), `settings/page.tsx:1378` (org update). Fix: run `supabase gen types typescript` and regenerate `src/lib/types/database.ts`, then strip the helpers.
5. **[MAJOR]** `golf_team_coachhelm_settings` has zero writers in code (only read) — the per-team CoachHelm disable mechanism is half-implemented. The UI / settings page must add an upsert call or the kill-switch can never be set.
6. **[MINOR]** `settings/page.tsx` is 1544 lines with multiple inline subcomponents and 3 stale type-casts (`as any` on `organizations` at `:1344, :1378, :1380`); split it into `<ProfileSection>`, `<TeamSection>`, `<NotificationsSection>` files for testability.
7. **[MINOR]** Top type-cleanliness offenders cluster in document/announcement/games actions (>20 casts each) — refactor pass after types regen.
8. **[MINOR]** `TODO.md:501` lists "Create custom 404 page" but `src/app/not-found.tsx` already exists — clean stale TODO.

## Summary
Core flows (auth, onboarding, settings persistence, crons) are real and wired — no skeleton routes, no fake handlers, all 6 vercel.json crons have substantive implementations. The biggest cross-cutting risk is data-layer integrity: 80+ tables have RLS enabled but no policies in `supabase/migrations/` (so the migrations directory cannot rebuild a working DB), and two CoachHelm Analytics tables are read-only in code, meaning that dashboard ships permanently empty unless engine-side writers exist outside `src/`. Type-cleanliness debt (449 `as any`, 255 `as unknown as`, centralized `fromUntyped` helper) signals stale generated types — annoying but not user-facing.

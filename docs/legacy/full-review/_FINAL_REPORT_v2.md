# HelmV3 Comprehensive Wiring Audit — v2

Date: 2026-04-27
Method: 4 parallel team-debugger agents (coach surfaces, player surfaces, team-shared, cross-cutting)

## TL;DR — what's left to wire, ranked

| # | Severity | Surface | Gap | Fix sketch |
|---|---|---|---|---|
| 1 | **BLOCKER** | Calendar attendance | `attendance.ts:102,161` writes `responded_at` — column doesn't exist. Live schema uses `rsvp_at`, `checked_in_at`. Coach check-ins silently drop fields. `getAttendanceReport` returns blank timestamps. | Rename column refs to match live schema; add a regression test that asserts insert payloads against generated types |
| 2 | **BLOCKER** | Attendance | `verifyQRCodeCheckIn` (`attendance.ts:395-404`) is an explicit stub — always returns error, no `qr_token` column | Either build it (add `qr_token` column + token gen + verify) or delete it and remove the QR UI |
| 3 | **BLOCKER** | CoachHelm Analytics | 3 production tables (`golf_insight_effectiveness`, `golf_prediction_model_performance`, `golf_team_coachhelm_settings`) are READ but **never WRITTEN** anywhere in `src/`. Page is structurally empty. | Either write them (engine should populate on each insight/prediction lifecycle event) or strip the page back to a "tracking starts in 30 days" empty state |
| 4 | **BLOCKER** | RLS migration drift | 80+ tables enable RLS in migrations but never `CREATE POLICY`; 7 more skip RLS entirely. Live DB has policies that aren't in migrations (just confirmed: `golf_coach_insights` had policies in `034_all_rls_policies.sql` that never applied). **A fresh env cannot be rebuilt from this repo.** | Audit every table with RLS enabled, write missing policies as migrations, apply via `supabase db push`. Snapshot current prod policies first |
| 5 | MAJOR | CoachHelm Analytics | `generateMock*` fallbacks at `coachhelm-analytics.ts:1082-1122` emit zero-shaped objects. Users see "0 strokes saved / 0% / 0 trends" — looks broken | Replace with proper empty-state UI surfaced through return value (`{ status: 'no_data_yet', earliestDate: ... }`) |
| 6 | MAJOR | Intelligence Hub | `intelligence-dashboard.ts:509-535` `generateTeamCorrelations` always ships 2 hardcoded "Fairways→Greens" / "Putting→Scoring" rows tagged `isDefault:true`. UI doesn't differentiate | Either compute real correlations from `golf_player_stats_cache` or hide the tab when `isDefault:true` rows are all that exist |
| 7 | MAJOR | Coach AI | "Strokes Saved" headline KPI (`coachhelm-analytics.ts:676-686`) reads `resolved_at` — basically never set. Always renders "0" | Wire `resolved_at` onto the insight lifecycle (set when `lifecycle_state = 'resolved'`) or change the KPI source |
| 8 | MAJOR | My Development (player) | `updateFocusAreaProgress` action exists at `development.ts:241` but no UI calls it. Player has no way to log progress on coach-curated focus areas. Explains 7/7 zero `from_review` / `from_insight` | Add a "Log progress" modal + button on `my-development/page.tsx:194+` |
| 9 | MAJOR | Roster | `golf.ts:2493-2552` `invitePlayerToTeam` ignores `_email` param ("reserved for future") — only returns join-code URL. Coach can't invite via email | Wire to existing email infra (Resend? SendGrid?); generate one-time join-code email |
| 10 | MAJOR | Announcements | No `updateAnnouncement` action — only create + delete. Coach must delete-and-recreate to fix typos | Add `updateAnnouncement(id, partial)` server action with revalidatePath |
| 11 | MAJOR | Tasks | No `updateTask` action — same delete-and-recreate problem | Add `updateTask(id, partial)` |
| 12 | MAJOR | Coach Alerts | `alerts.ts:20-200` (`getCoachAlerts`, `getAlertCounts`, `acknowledgeAllAlerts`, `dismissAllAlerts`) are orphaned — page now uses `getInsightsForCoach` | Delete the action file or wire it back if intended |
| 13 | MAJOR | Type debt | 449 `as any` + 255 `as unknown as` + 74 `fromUntyped`. Worst hotspots: `documents.ts` (27), `golf.ts` (26), `insights.ts` (20). Stale Supabase generated types | Run `npx supabase gen types typescript` against prod, regenerate `database.ts`, mass-replace casts |
| 14 | Minor | Team Stats | `team-stats-table.tsx:131-134` AI-rating sort silently no-ops on intelligence fetch failure | Add a banner |
| 15 | Minor | Realtime gaps | Announcements / Documents / Travel / Roster rely only on `revalidatePath` — no realtime channel | Add supabase channel subscriptions if "live" UX expected |
| 16 | Minor | Travel | `travel/page.tsx:73-74` hardcodes `check_in_date` and `check_out_date` to `null` | Wire from form input |
| 17 | Minor | Stale TODO entries | `TODO.md:501` flags missing 404 page; custom 404 exists at `src/app/not-found.tsx` | Close out |

## Per-area verdicts

### Coach surfaces (Agent 1)
| Surface | Verdict |
|---|---|
| Alerts | ✅ wired |
| Patterns | ✅ wired |
| Insights | ✅ wired |
| Intelligence Hub | ⚠️ Correlations tab fake |
| **CoachHelm Analytics** | ❌ **skeleton — fake-zero output, no writers for backing tables** |
| Coaching Settings | ✅ wired |
| Development Plans | ✅ wired |
| Create Qualifier | ✅ wired |
| Team Stats | ✅ wired |

### Player surfaces (Agent 2)
| Surface | Verdict |
|---|---|
| Player Hub | ✅ wired |
| **My Development** | ⚠️ **read-only by accident — `updateFocusAreaProgress` unused** |
| My Qualifiers | ✅ wired |
| Round Entry | ✅ wired (autosave + conflict detect) |
| Continue Round | ✅ wired (sparse-hole resume) |
| Classes | ✅ wired |
| My Insights redirect | ✅ wired |

### Team-shared (Agent 3)
| Surface | Verdict |
|---|---|
| **Calendar attendance** | ❌ **schema drift on column names** |
| Calendar/events otherwise | ✅ wired (full realtime) |
| Roster | ⚠️ email invites stubbed |
| Messaging | ✅ wired (full realtime) |
| Announcements | ⚠️ no update action |
| Tasks | ⚠️ no update action |
| Documents | ✅ wired (Supabase Storage + version history) |
| Travel | ✅ wired |
| Qualifiers (view) | ✅ wired |
| Team Info | ✅ wired |

### Cross-cutting (Agent 4)
| Concern | Verdict |
|---|---|
| Settings | ✅ wired |
| Onboarding (coach + player) | ✅ wired |
| Auth flows | ✅ wired |
| 6 cron jobs | ✅ wired |
| 125 routes / 404 page | ✅ wired |
| Mobile | ✅ acceptable (`overflow-x-auto` on tables) |
| **RLS migrations** | ❌ **drift — env not reproducible** |
| **Type cleanliness** | ❌ **778 `as any`/`as unknown` casts** |
| **Empty-table writers** | ❌ **3 tables read but never written** |

## Three things that would actually move the needle

1. **Fix the attendance schema drift** (`attendance.ts:102,161`) — this is a silent prod bug right now, not a polish item. Coach check-ins are dropping fields on the floor.

2. **Decide on CoachHelm Analytics** — either invest a sprint to wire the writers (`golf_insight_effectiveness` is meant to track insight outcome metrics; `golf_prediction_model_performance` tracks accuracy over time), OR pull the page entirely until the writers are real. Today it's anti-marketing — coaches see "0 strokes saved" and conclude the AI doesn't work.

3. **Snapshot prod RLS, write the missing policies into migrations, regenerate types.** Without this, you can't bring up a staging environment that matches prod, and every new query has to fight `as any` casts.

## Files referenced

Raw reports:
- `.full-review/coach-surfaces-review.md`
- `.full-review/player-surfaces-review.md`
- `.full-review/team-shared-review.md`
- `.full-review/cross-cutting-review.md`

# Helm Feature Catalog

**Research date:** 2026-07-26  
**Status legend:** Confirmed active · Partial · UI-only · Backend-only · Scaffolded · Deprecated/shim · Planned/absent · Unclear  
**Confidence:** C=Confirmed · SI=Strongly inferred · T=Tentative · U=Unknown

Template fields: ID, Name, Area, Status, Confidence, Roles, Entry points, Preconditions (brief), Data effects (brief), Evidence, Scan priority.

---

## AUTH / ONBOARDING

### AUTH-001 Sign in (email/password)
- **Area:** Platform · **Status:** Confirmed active · **Conf:** C · **Roles:** all
- **Entry:** `/golf/login`, `/baseball/login`, `/lifting/login`
- **Effects:** Supabase Auth session; redirect to dashboard/onboarding
- **Evidence:** `src/app/golf/actions/auth.ts`, sport auth pages, middleware
- **Priority:** P0

### AUTH-002 Sign up
- **Status:** Confirmed · **Roles:** new users
- **Entry:** `/golf/signup`, `/baseball/signup`, `/lifting/signup`
- **Evidence:** auth actions + signup pages
- **Priority:** P0

### AUTH-003 Password reset
- **Status:** Confirmed · **Entry:** forgot/reset password routes per sport
- **Priority:** P1

### AUTH-004 Sign out
- **Status:** Confirmed · **Evidence:** auth actions / shell menus
- **Priority:** P1

### AUTH-005 Golf coach onboarding
- **Status:** Confirmed · **Entry:** `/golf/coach` · **Tables:** `golf_coaches`, `organizations`, `golf_teams`, `golf_team_coach_staff`
- **Evidence:** `onboarding.ts`, layout incomplete-onboarding redirect
- **Priority:** P0

### AUTH-006 Golf player onboarding + join
- **Status:** Confirmed · **Entry:** `/golf/player`, `/golf/join/[code]`
- **Tables:** `golf_players`, `golf_team_members`, join requests
- **Priority:** P0

### AUTH-007 Baseball coach/player onboarding
- **Status:** Confirmed (ready per matrix) · **Entry:** `/baseball/coach-onboarding`, `/baseball/player`
- **Priority:** P0

### AUTH-008 Demo gate (golf/baseball)
- **Status:** Confirmed · **Entry:** `/golf/demo`, `/baseball/demo`
- **Tables:** `golf_demo_sessions` (220 rows), `baseball_demo_sessions`
- **Priority:** P1

### AUTH-009 Account deletion
- **Status:** Confirmed API · **Entry:** `/api/account/delete`
- **Priority:** P1

### AUTH-010 Magic link / OAuth social login
- **Status:** Unclear/absent as primary UX · Auth schema has OAuth tables empty
- **Priority:** P3 · **Conf:** T

---

## TEAM / ROSTER (GOLF)

### TEAM-001 Create / update team
- **Status:** Confirmed · **Roles:** coach · **Actions:** `teams.ts`
- **Tables:** `golf_teams`, `organizations`, `golf_team_settings`
- **Priority:** P0

### TEAM-002 Switch active team (head coach)
- **Status:** Confirmed · **Actions:** `team-switcher.ts` · Cookie-based
- **Priority:** P0

### ROSTER-001 View roster
- **Status:** Confirmed · **Entry:** `/golf/dashboard/roster`
- **Priority:** P1

### ROSTER-002 Remove player / manage membership
- **Status:** Confirmed · **Actions:** `roster.ts` · **Tables:** `golf_team_members`
- **Priority:** P0

### ROSTER-003 Join request approval
- **Status:** Confirmed · **Tables:** `golf_team_join_requests` (13 rows)
- **Priority:** P1

### ROSTER-004 Recruiting HQ (golf)
- **Status:** Confirmed coach-only · **Entry:** `/golf/dashboard/recruiting`
- **Tables:** `golf_recruits`, `golf_recruit_documents`
- **Priority:** P2

### ROSTER-005 Invite coach / assistant staff
- **Status:** Partial · staff table `golf_team_coach_staff` exists; invite UX less documented than baseball
- **Conf:** SI · **Priority:** P1

---

## CALENDAR / PRACTICE (GOLF)

### PRACTICE-001 Create one-off event
- **Status:** Confirmed · **Entry:** Calendar · **Actions:** `golf.ts` events
- **Tables:** `golf_events`, `golf_event_attendance`
- **Priority:** P0

### PRACTICE-002 Recurring practices
- **Status:** Confirmed · **Actions:** `recurring-events.ts`
- **Tables:** `golf_events` (+ recurrence fields / related)
- **Also:** CoachHelm tool `create_recurring_practice` (Confirm-gated)
- **Priority:** P0

### PRACTICE-003 RSVP / attendance
- **Status:** Confirmed partial gaps · **Actions:** `attendance.ts`, `golf.ts` RSVP
- **Tables:** `golf_event_attendance` (453), `golf_attendance_summary` (0 — unused aggregate?)
- **Priority:** P0

### PRACTICE-004 Calendar feeds (iCal)
- **Status:** Confirmed · **API:** `/api/calendar/feeds/[token]`, coach token route
- **Priority:** P2

### PRACTICE-005 Event reminders cron
- **Status:** Confirmed backend · **Cron:** `/api/cron/event-reminders` hourly
- **Priority:** P1

---

## ROUNDS / STATS / QUALIFIERS (GOLF)

### ROUND-001 New round + shot tracking
- **Status:** Confirmed · **Entry:** `/golf/dashboard/rounds/new` player-only
- **Actions:** `golf.ts`, drafts, auto-save hook
- **Tables:** `golf_rounds`, `golf_holes`, `golf_shots`
- **Side effects:** stats invalidation, CoachHelm, review, qualifier
- **Priority:** P0

### ROUND-002 Continue / recover round
- **Status:** Confirmed · **Routes:** `continue/[id]`, `recover`
- **Priority:** P0

### ROUND-003 Round review (AI)
- **Status:** Confirmed · **Tables:** `golf_round_reviews` (71)
- **Known risk:** stale narrative if score edited (issue #978 P1)
- **Priority:** P1

### STATS-001 Player stats cockpit
- **Status:** Confirmed · **Entry:** `/golf/dashboard/stats` · Cache `golf_player_stats_cache`
- **Priority:** P0

### STATS-002 Team stats
- **Status:** Confirmed coach-only · `/stats/team`
- **Priority:** P1

### STATS-003 Leak maps / standing
- **Status:** Confirmed V3 · **Tables:** `golf_player_standing` (464), nightly cron
- **Priority:** P1

### QUAL-001 Qualifier create / scoreboard
- **Status:** Confirmed · **Routes:** `/qualifiers`, `/qualifiers/new`, `/my-qualifiers`
- **Tables:** `golf_qualifiers`, `golf_qualifier_entries`
- **Priority:** P0

### QUAL-002 Coach picks / qualifying selection
- **Status:** Confirmed V3 · **Tables:** `golf_qualifier_selections` (0 rows — underused)
- **Priority:** P2

### COURSE-001 Course library
- **Status:** Confirmed · **Risk:** shared tee templates (issue #913)
- **Tables:** `golf_courses`, `golf_course_tees`, `golf_course_tee_holes`
- **Priority:** P1

---

## TEAM OPS (GOLF)

### MSG-001 Messaging
- **Status:** Confirmed · **Actions:** `messages.ts` · Realtime hooks
- **Recent fix:** PR #1072 fan-out / coach→player DMs
- **Priority:** P0

### ANN-001 Announcements
- **Status:** Confirmed · **Also:** CoachHelm write tool
- **Priority:** P1

### TASK-001 Tasks
- **Status:** Partial · dual completion tables historically (`golf_task_assignments` vs `golf_task_completions`)
- **Evidence:** glossary dual-table bug note
- **Priority:** P1

### DOC-001 Documents
- **Status:** Confirmed · Storage bucket `documents`
- **Priority:** P2

### TRAVEL-001 Travel itineraries
- **Status:** Partial · itineraries live; budgets/expenses scaffolded (0 budget rows)
- **Priority:** P2

### CLASS-001 Player classes + schedule OCR
- **Status:** Confirmed · **Actions:** `schedule-image.ts` · Recent fix #1071
- **Priority:** P2

---

## COACHHELM / DEVELOPMENT (GOLF)

### COACHHELM-001 Intelligence Brief (command center)
- **Status:** Confirmed · **Entry:** `/golf/dashboard/intelligence`
- **Components:** `CoachIntelligenceHome`, `CommandOpening`, `TriageDesk`
- **Priority:** P0

### COACHHELM-002 Signals (alerts/insights/patterns views)
- **Status:** Confirmed as views inside intelligence · Legacy routes are permanentRedirect shims
- **Priority:** P0

### COACHHELM-003 Ask chat + Confirm write tools
- **Status:** Confirmed · **Entry:** `/golf/dashboard/coachhelm/chat`
- **API:** `/api/coachhelm/v3/chat/stream`
- **Write tools:** focus area, task, announcement, recurring practice
- **Priority:** P0

### COACHHELM-004 Player CoachHelm hub
- **Status:** Confirmed · `/golf/dashboard/coachhelm?view=*`
- **Priority:** P0

### COACHHELM-005 Development plans / focus areas
- **Status:** Confirmed · **Tables:** `golf_player_focus_areas` (legacy) + `golf_goals` (V3)
- **Priority:** P0

### COACHHELM-006 Goals + suggestions
- **Status:** Confirmed · **Tables:** `golf_goals`, `golf_goal_suggestions` (347)
- **Crons:** goal-suggestions-write/evaluate
- **Priority:** P1

### COACHHELM-007 Genome
- **Status:** Confirmed · **Tables:** `golf_player_genome` · Nightly cron
- **Priority:** P2

### COACHHELM-008 Insight effectiveness
- **Status:** Partial · Triage compact scoreboard live; full FairwayEffectiveness DARK
- **Tables:** exposure/action/outcome ledger populated unevenly
- **Priority:** P2

### COACHHELM-009 Coaching philosophy settings
- **Status:** Confirmed · `/settings/coaching-intelligence`
- **Priority:** P1

### COACHHELM-010 Post-round insight generation
- **Status:** Confirmed backend · Orchestrator V2+V3 generators · Safety-net cron
- **Priority:** P0

### COACHHELM-011 Practice Rx
- **Status:** Confirmed generation · UI PracticeRxPanel
- **Priority:** P2

### COACHHELM-012 Drill library
- **Status:** Confirmed · `golf_drills` (63) · attachments table
- **Priority:** P2

---

## NOTIFICATIONS

### NOTIF-001 In-app unified notifications
- **Status:** Confirmed · `notifications`, golf-specific notification state
- **Priority:** P1

### NOTIF-002 Email notifications (Resend)
- **Status:** Confirmed · Webhooks `/api/webhooks/resend*`
- **Priority:** P1

### NOTIF-003 Web push / APNs
- **Status:** Partial · `push_subscriptions` 0 rows; `device_tokens` 11; edge `send-apns-push`
- **Priority:** P2

---

## BILLING

### BILLING-001 Product subscription entitlements
- **Status:** Absent · Business docs: no seat paywall
- **Priority:** P3 (monitor)

### BILLING-002 Admin Stripe invoicing
- **Status:** Scaffold · `/admin/billing`, webhook TODO persistence
- **Priority:** P2

### BILLING-003 CoachHelm LLM daily budget
- **Status:** Confirmed cost control · `golf_coachhelm_llm_budget`
- **Priority:** P1

---

## ADMIN / CRM

### ADMIN-001 Golf admin dashboard
- **Status:** Confirmed · `/golf/admin` · `users.role=admin`
- **Priority:** P1

### ADMIN-002 CRM coach outreach
- **Status:** Confirmed · `/golf/admin/crm` · tables `crm_coaches` (2401), sequences, contact log
- **Priority:** P1

### ADMIN-003 Helm Bridge super-admin
- **Status:** Confirmed · `/admin/**` · SUPER_ADMIN gate
- **Priority:** P0 (security)

### ADMIN-004 Demo session telemetry
- **Status:** Confirmed · golf + baseball demo session tables
- **Priority:** P2

---

## BASEBALL (selected major features)

### BB-AUTH-001 Auth/onboarding — ready
### BB-CMD-001 Command Center — ready · `/baseball/dashboard/command-center`
### BB-CAL-001 Calendar — ready
### BB-ROSTER-001 Roster/staff/capabilities — ready · P0
### BB-STATS-001 Stats Lab / box scores — partial (#379)
### BB-IMPORT-001 Stats file import (GC/Presto/Sidearm XML etc.) — ready · P0
### BB-PRAC-001 Practice planner — ready · P0
### BB-PRAC-002 Practice effectiveness — partial
### BB-LIFT-001 Performance/lifting bridge — ready
### BB-SIG-001 Signals/CoachHelm — partial
### BB-DEC-001 Decision Room — partial
### BB-VID-001 Videos — partial
### BB-DOC-001 Documents — ready
### BB-TRAVEL-001 Travel — ready
### BB-CAMP-001 Camps — ready · seeded e2e
### BB-REC-001 Recruiting pipeline (5 stages) — ready · P0
### BB-WATCH-001 Watchlist/Compare — ready
### BB-DISC-001 Discover — partial/warning in features doc
### BB-PASS-001 Passport / public packet tokens — partial · P0 security
### BB-SET-001 Settings OS + roles — ready
### BB-MSG-001 Messaging/announcements — confirmed in features
### BB-TODAY-001 Player Today — partial (#377)
### BB-GUARD-001 Guardian access settings — exists in program settings · Conf: SI

Evidence: `BASEBALLHELM_FEATURE_READINESS_MATRIX.md`, `baseballhelm-features.md`, route atlas.

---

## LIFT LAB

### LIFT-001 Coach portal programs/sessions/live — Confirmed
### LIFT-002 Athlete today/readiness/check-ins — Confirmed
### LIFT-003 Join via token — Confirmed
### LIFT-004 Import — Confirmed routes; usage low (`import_runs` 0)
### LIFT-005 Nutrition plans — Scaffolded (0 plan rows)

---

## INTEGRATIONS ABSENT / PLANNED

| ID | Name | Status |
|----|------|--------|
| INT-MAPBOX | Maps | Absent |
| INT-TAMBO | Generative UI | Reserved env only |
| INT-GROWTHBOOK | Feature flags SaaS | Not installed |
| INT-UPLOADTHING | Uploads | Reserved; storage uses Supabase |
| INT-GC-API | Live GameChanger API | Deferred; file import only |

---

## Deprecated route features (still test redirect)

Legacy golf CoachHelm pages permanently redirect into intelligence/coachhelm query views — see route inventory. **Editing shim pages does not change UX.**

# Feature Gap / Intent Audit — Documented-Intent Side

**Date:** 2026-08-20
**Scope:** `memory/context/golfhelm-features.md`, `memory/context/baseballhelm-features.md`,
`memory/context/coachhelm-ai.md`, `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`,
`memory/registry.yml` / `memory/features/*.md`, `src/lib/golf/surface-registry.ts`,
`src/lib/admin/feature-registry.ts`.
**Method:** Read-only. Every item below was independently re-verified against the live
tree with `git grep` / `git ls-files` (never `find`/`grep` alone, per the repo's
gitignored-phantom-worktree trap) — table names against `src/lib/types/database.ts`,
callers against a repo-wide grep, cron/route wiring against `vercel.json` and the actual
route files.
**Relationship to prior art:** `docs/audits/UNREACHABLE_CAPABILITY_2026-08-15.md` covered
the **code-first** side (knip-driven, zero-caller exports). This audit is the
**doc-first** side: claims made by the repo's own feature docs, checked against code.
Findings below do not repeat that report's A1–A3/D1 items (PGA/LPGA loader, 4 dead
shot-analysis functions, flyer-lie composite rule) — see that file for those.

---

## 1. Documented but not built

Feature docs describe these as existing, planned, or backed by real schema; the code
does not implement the described behavior.

### 1.1 Golf — Availability Polling (Calendar) — confirmed still not built
`memory/context/golfhelm-features.md:266` marks this **❌ NOT BUILT** outright ("No
`availability-polling.ts`/`availability-locking.ts` or any poll UI exists in code").
Re-verified today: `git grep -n 'availability-polling|availability-locking|golf_availability_polls|golf_poll_responses' -- src/` returns nothing. The doc is accurate here — flagging only because the backing tables it names don't even exist in the DB at all (see §3.2), which is a step further than "orphaned schema."

### 1.2 Golf CoachHelm — coach philosophy priority ranking never reorders insights
`memory/context/golfhelm-features.md:598` and `coachhelm-ai.md:99-144` document a
5-field `priorityBallStriking/ShortGame/Putting/CourseManagement/MentalGame` ranking
(1–5, unique) that a coach sets via the live `PriorityRanker` component
(`src/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence.tsx:443`,
importing `PriorityRanker` from `src/components/golf/coachhelm/settings/PriorityRanker.tsx`
— confirmed reachable, not a dead component). Verified: `git grep -n
'priorityBallStriking|priorityShortGame|priorityPutting' src/lib/coachhelm -r` (excluding
tests) returns **zero hits** — nothing in the engine reads these fields. The settings UI
is live and saves real data to `golf_coach_philosophy`; the read side that was supposed
to consume it was never built.

### 1.3 Golf CoachHelm — weight distribution never reaches the prediction model
Same section, same table: 5 weight sliders (`weightHistorical/RecentForm/Tournament/
Qualifying/Subjective`, must sum to 100%). Verified `src/lib/coachhelm/v2/prediction/
performance-predictor.ts` uses a hardcoded `recentFormAdjustment: 0.6` (line 23) and
fixed sensitivities (line 465) — no reference to `weightHistorical` or its siblings
anywhere in `src/lib/coachhelm`. Matches the doc's own gap ("Prediction model uses fixed
weights (60/20/10/5/5), ignores coach weights").

### 1.4 Golf CoachHelm — no coach-facing "mark insight outcome" workflow
`golfhelm-features.md:604` (High severity): "No workflow for coaches to mark insights as
improved/no_change/worsened." Verified: the only writer of `outcome_status` is the
automated `backfillInsightOutcomes` path in `src/lib/coachhelm/v2/analytics/
effectiveness-writer.ts:326-354` — there is no server action or UI control for a coach to
set this manually. (The rendered `OutcomeBadge` that depends on this field is covered as
a separate, more specific finding in §2.4 — it's not just "no workflow," the automated
path that exists is also broken.)

### 1.5 Golf Travel — expense "split" is a label, not a calculation
`golfhelm-features.md:478`: "Expense splits incomplete | Medium | Table exists but no
split calculation or per-player assignment logic." Verified in
`src/app/golf/actions/travel.ts`: `paid_by` accepts `'split'` as one of four enum values
(line 505) and the expense summary tallies a `byPaidBy.split` bucket (line 1039), but
there is no per-player split amount, no assignment of shares to roster members, and no
`split(...)` calculation anywhere in the file. Doc is accurate.

### 1.6 Golf CoachHelm — no settings page for player insight preferences
`golfhelm-features.md:606` (Low): "Table exists, no settings page for players." The
"no UI" half is confirmed true, but the table itself is fictional — see §3.3.

---

## 2. Built but not reachable in the UI

Server actions, engines, or components that exist and compute real output, but that no
route/nav entry/consumer ever surfaces. These are the highest-value items — candidates
the owner may want to wire up rather than delete.

### 2.1 Golf — an entire insight-generation family runs daily and is invisible everywhere
The "v2 coach-alert" insight family (`bubble_player`, `pattern_detected`, `streak`,
`surge_player`, `plateau`, `tournament_pressure`, `closing_holes`, `par_3_issues`,
`recurring_weakness`, `team_trend`, `scoring_decline`) is actively generated by the
post-round trigger and by the `coachhelm-roster-sweep` cron
(`vercel.json:57-58`, daily). Verified the writer stamps `engine_version: 'v2'` at
`src/app/golf/actions/insights.ts:1143` and `:4482` (never `'v3'`). Every coach/player
read surface (Triage Desk, Alert Center, player Hub, round-review takeaway, roster
top-insight card, the coach-morning-digest cron) is gated by the shared
`applyInsightVisibility` filter (`src/lib/coachhelm/v3/insight-visibility.ts:34,38,77-82`),
which requires `engine_version='v3'` OR a `'v3:%'` signature. This whole family has no v3
successor, so a real, running, daily generation pipeline produces output that can
structurally never reach a user. (`memory/context/coachhelm-ai.md:237,259` documents this
in detail; re-verified the cron and the `engine_version` stamps directly today.)

### 2.2 Golf — `getPlayerCoachHelmDashboard`'s `data.insights` field is computed and dropped
`src/app/golf/actions/insights.ts` computes a merged, correctly-gated `insights` field as
part of the dashboard payload, and `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx`
fetches it and (per `coachhelm-ai.md:216,251`) used to pass it down. Re-verified against
the current file (line numbers have drifted from the doc's 2026-07-25 citations, so
confirming fresh): `PlayerCoachHelmHome.tsx`'s prop interface
(`src/components/golf/coachhelm/home/PlayerCoachHelmHome.tsx:83-95`) has no `insights`
field at all — only `topInsight`/`secondaryInsights` (used throughout, e.g. lines
135-136, 165-169, 326, 333, 397), which page.tsx passes separately at lines 505-506 via a
different, correctly-wired path (`insight-delivery.ts`). The `data.insights` computation
is real, gated, and unread by the one component positioned to read it.

### 2.3 Golf — `BehaviorLearner.getLearnedPreferences()` result discarded in the orchestrator
Verified live today at `src/lib/coachhelm/v2/orchestrator.ts:833-834`:
```
const behaviorLearner = new BehaviorLearner(coachId, 'coach');
await behaviorLearner.getLearnedPreferences();
```
The call is awaited and its return value is never assigned to anything — confirmed the
only reference to the local `behaviorLearner` variable in the file.

### 2.4 Golf — `OutcomeBadge` renders on every insight card, structurally has nothing to show
`OutcomeBadge` is defined and rendered unconditionally in
`src/components/golf/coachhelm/insight-card/InsightCard.tsx:119` (rendered at lines 492
and 631). Its only writer, `metricToRoundField` in
`src/lib/coachhelm/v2/analytics/effectiveness-writer.ts:326-354`, recognizes only v2-era
metric names — none of the v3 generators' `MetricId`s (e.g. `sg_ott`,
`opening_hole_delta`) match, so the field it reads (`outcome_status`) is null for
essentially every row that could reach the card. A live UI element that renders and is
reachable, wired to data that can't populate it.

### 2.5 Golf — `CrossLearner.transferLearning` — built, zero callers
`src/lib/coachhelm/v2/learning/cross-learner.ts:262` defines a complete cold-start
pattern-transfer method. Verified `git grep -n 'transferLearning' -- src/` (excluding its
own test) returns nothing else in the repo — no caller anywhere.

### 2.6 Baseball — `getNextStage()` in the recruiting pipeline — built, zero callers
`src/lib/recruiting/stages.ts:44` exports `getNextStage(currentStage)`. Verified
`git grep -n 'getNextStage' -- src/` finds only its own declaration and an unrelated,
differently-named `getNextStageStatus` in `PipelineView.tsx` — the real
`getNextStage` has no caller anywhere in the app. (`baseballhelm-features.md:145` already
notes this; independently re-confirmed.)

*Cross-reference, not re-reported as new:* `WeightDistributor.tsx`
(`src/components/golf/coachhelm/settings/`) is imported nowhere outside its own barrel —
`docs/audits/UNREACHABLE_CAPABILITY_2026-08-15.md` (§D) already covers this and found it
to be an intentional "coming soon" placeholder, not a bug; confirmed still true via
`FairwaySettingsCoachingIntelligence.tsx:78`'s comment ("UI control (WeightDistributor)
is HIDDEN until the roster-comparison engine..."). Not counted again here.

---

## 3. Doc claims that are now false

Specific stale or contradicted statements, quoted, with the current reality and its
evidence.

### 3.1 `golfhelm-features.md`'s own schema-drift banner contradicts its own body
The file's top banner (line 5) lists 19 identifiers "verified 2026-08-19 against
production" to **not exist** in the database, including `golf_putting_tendencies`,
`golf_review_insights`, `golf_validations`, `golf_insight_feedback`, `golf_insight_weights`,
`golf_player_insight_preferences`. Yet the body of the *same file* still states them as
real:
- Line ~195 (Stats & Analytics DB Tables): `"golf_putting_tendencies | Putting analysis
  (break patterns, distance buckets, miss direction)"` — no caveat.
- Line ~204 (Stats & Analytics Known Gaps): `"golf_putting_tendencies never written |
  Medium | Table exists in DB with RLS policies, but no app code writes to it."` —
  the table doesn't exist at all, so there's no RLS policy to have.
- Line 590 (CoachHelm AI Engine "DB Tables (18 CoachHelm tables)"): lists
  `golf_review_insights`, `golf_validations`, `golf_insight_feedback`,
  `golf_insight_weights`, `golf_player_insight_preferences` — 5 of the 18 named tables
  don't exist.

Independently re-verified: `git grep -c 'golf_putting_tendencies:\|golf_review_insights:\|golf_validations:\|golf_insight_feedback:\|golf_insight_weights:\|golf_player_insight_preferences:' src/lib/types/database.ts` → **0 for every one**.

### 3.2 Calendar & Events' "17 tables" — 10 of 17 don't exist
`golfhelm-features.md:282` lists 17 tables for Calendar & Events. Cross-checked each
against `database.ts`: `golf_event_exclusions`, `golf_event_status_log`,
`golf_availability_polls`, `golf_poll_responses`, `golf_player_availability_blocks`,
`golf_player_attendance_stats`, `golf_calendar_sync_log`, `golf_calendar_sync_state`,
`golf_external_calendars`, and `golf_recurring_events` — **10 of the 17** — all return
0 hits in `database.ts`. Nearly 59% of the claimed table count is fictional. (The
Availability Polling sub-feature is honestly marked ❌ NOT BUILT right above this list —
see §1.1 — but the "orphaned schema only" framing overstates it: the schema isn't
orphaned, it never existed.)

### 3.3 "Effectiveness tracking not wired ... no server actions or UI" is false
`golfhelm-features.md:603` (High severity): "DB schema ready, no server actions or UI to
track/display." Verified false: real, exported server actions exist —
`getInsightEffectiveness` (`src/app/golf/actions/coachhelm-analytics.ts:291`),
`getInsightTrustSignals` (`:1379`), `getCoachHelmOverview` (`:874`) — and real UI exists
(`OutcomeBadge`, `InsightCard.tsx:119`, rendered at 2 call sites). The actual defect,
per `coachhelm-ai.md`'s own later correction and re-confirmed in §2.4 above, is a
metric-name mapping bug in the writer that leaves the field permanently null — not an
absent action/UI layer. The severity assessment and root cause in the older doc are both
wrong even though "effectiveness data is broken for the user" is directionally right.

### 3.4 `coachhelm-ai.md`'s "Live vs Built-but-Dark" table describes two files that no longer exist
Lines 209 and 262 of `coachhelm-ai.md` describe `InsightTrustChips.tsx` and
`src/lib/coachhelm/v2/feedback/coach-behavior.ts` as real, unwired ("DARK") code.
Verified: `git ls-files | grep -i 'InsightTrustChips'` → nothing. `git ls-files | grep -i
'coach-behavior'` → nothing. Both files have been deleted from the repository entirely —
`docs/audits/COACHHELM_APPROVED_FIXES_PLAN_2026-07-25.md:39` records the deletion decision
("`coach-behavior.ts` and its test + both barrel export blocks... delete. Zero callers of
the writer or the readers anywhere outside their own barrel/tests"). `coachhelm-ai.md`
still cites file:line evidence for code that is gone.

### 3.5 Task reminder "no scheduled job triggers notifications" is false
`golfhelm-features.md:362` (Task Management Known Gaps): "Reminder auto-send missing |
Medium | reminder_at field set but no scheduled job triggers notifications." Verified
false: `/api/cron/task-reminders` (`vercel.json:64-65`, hourly `0 * * * *`) calls
`processReminders()` (`src/app/golf/actions/task-reminders.ts:711`), which reads the real
`golf_task_reminders` table (`database.ts:16309`) and dispatches in-app + email + push
reminders with idempotency (marks each reminder sent before the next tick). This is a
fully built, scheduled, production cron — not a missing feature.

### 3.6 `BASEBALLHELM_CANONICAL_SPEC.md` P0-7 — `useTeamRouteProtection` doesn't exist
`docs/audits/BASEBALLHELM_CANONICAL_SPEC.md:565,622`: "`useTeamRouteProtection` is
defined in `src/hooks/use-route-protection.ts` but never called. Must be wired into the
consolidated shell. (P0 security gap)." Verified false: `src/hooks/use-route-protection.ts`
contains exactly one export, `usePlayerRecruitingGate` — no `useTeamRouteProtection`
exists anywhere in the repo (`git grep` finds only doc references, none in `src/`).
`memory/context/baseballhelm-features.md:202` already flags this exact contradiction
("`useTeamRouteProtection` ... does NOT exist — only `usePlayerRecruitingGate` does").
The canonical spec carries no correction and is still cited by `CLAUDE.md` as the
authority for "what baseball should be."

### 3.7 `BASEBALLHELM_CANONICAL_SPEC.md` P0-5 — "Build the Helm Lifting Lab ... not yet started" is badly stale
`docs/audits/BASEBALLHELM_CANONICAL_SPEC.md:619` lists the Lifting Lab as a P0 ship
blocker, "not yet started." Verified: `src/app/baseball/actions/lifting-v11.ts` is a live
2,657-line action file (30 exports covering groups/programs/publish/session lifecycle),
plus `lift-builder.ts`, `lift-onboarding.ts`, dedicated `helm_lifting_*` migrations, and
an RLS-denial test suite (`lifting-v11-rls-denial.test.ts`). The live route
`/baseball/dashboard/performance` is documented as the working Lifting Lab entry point in
`memory/context/baseballhelm-features.md:81`. The spec's premise (nothing built) is the
opposite of current reality.

### 3.8 `BASEBALLHELM_CANONICAL_SPEC.md` P0-6 — nav routes already registered
`docs/audits/BASEBALLHELM_CANONICAL_SPEC.md:621`: "Register 28 orphaned nav routes in
`src/lib/baseball/nav-registry.ts`." Verified done: the file's own code comment reads
"Previously orphaned routes — wired into nav 2026-06-24," with each formerly-orphaned
route now assigned a role + capability gate. `docs/audits/BASEBALLHELM_LIFTLAB_GAP_MAP_
2026-06-25.md:297` independently confirms "`src/lib/baseball/nav-registry.ts` declares 28
routes."

### 3.9 `baseballhelm-features.md`'s `is_anonymous` write-side description is stale
Line 156: "every app writer hardcodes `is_anonymous:false` with a `coach_id`, so the
anonymous branch is currently unreachable — `is_anonymous` is effectively a dead column."
Verified: the column doesn't exist on `baseball_player_engagement_events` at all (0 hits
in `database.ts`), and this was a deliberate, tracked fix —
`docs/audits/PRODUCTION_READINESS_MISSION_2026-07-09.md:54`: "CONFIRMED P1: `is_anonymous`
column doesn't exist"; regression tests now assert writers send payloads **without** the
field (`player-peek-engagement-events.test.ts:186`, `watchlist-engagement-events.test.ts:137`).
The doc's *read-side* description is still accurate and live —
`isAnonymous = !event.coach_id` really is computed at
`CollegeInterestClient.tsx:310` — only the "hardcoded dead column" write-side framing is
wrong; there's no column left to hardcode.

---

## Unverified / lower confidence (flagged, not asserted)

- **Baseball onboarding "default player/lifting group seeding NOT implemented"**
  (`baseballhelm-features.md:187`) — a narrow pattern grep (`default.*lifting.*group`,
  `seedDefaultGroup`, `default_group`) against `src/app/baseball/actions/onboarding.ts`
  found nothing, which is consistent with the doc's claim, but given how much the Lifting
  Lab has grown since this doc's 2026-06-30 trace date (see §3.7), this deserves a fresh
  read of `runCompleteCoachOnboardingCore` before treating it as current.
- **`golf_insight_effectiveness` "not actively populated"** (`golfhelm-features.md:786`) —
  confirmed two real INSERT/write call sites exist (`coachhelm-analytics.ts:168`,
  `effectiveness-writer.ts:230`), so the table is not entirely unwritten, but whether
  writes happen often enough to make the analytics dashboard non-sparse in practice was
  not checked against production row counts.
- **`memory/registry.yml` / `memory/features/*.md` and `src/lib/admin/feature-registry.ts`**
  were read structurally (85 enumerated features across golf/coachhelm/baseball with
  file/action manifests) but not exhaustively cross-checked claim-by-claim against code —
  no additional false claims were found in the portions sampled, but this is a much
  larger surface than time allowed for full coverage.

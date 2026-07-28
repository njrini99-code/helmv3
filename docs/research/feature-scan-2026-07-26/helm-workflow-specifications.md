# Helm Workflow Specifications

**Research date:** 2026-07-26  
**Scope:** P0/P1 workflows traced UI → DB. Runtime not executed; confidence SI unless noted Confirmed by code path.

Observable assertions listed for Playwright + DB.

---

## WF-AUTH-GOLF-SIGNUP-ONBOARD-COACH

**Preconditions:** Anon; unique email; Resend optional for confirm depending on Auth settings (Unknown exact confirm requirement).

**Steps:**
1. `/golf/signup` submit email/password
2. Auth user created; `users` row
3. Redirect onboarding `/golf/coach`
4. Create org/team/coach profile (`onboarding.ts`)
5. Land `/golf/dashboard`

**Data:** `auth.users`, `users`, `organizations`, `golf_coaches`, `golf_teams`, `golf_team_coach_staff`

**Success:** Dashboard coach rail visible; no onboarding loop

**Failures:** Duplicate email; incomplete onboarding → forced `/golf/coach`

**Playwright asserts:** URL, rail “CoachHelm AI”, DB coach+staff rows for user

**Evidence:** auth pages, `onboarding.ts`, dashboard layout

---

## WF-AUTH-GOLF-JOIN-PLAYER

**Preconditions:** Valid team invite code; anon or authed player

**Steps:**
1. `/golf/join/[code]`
2. If unauth → signup with returnTo
3. Player onboarding with joinCode
4. Membership `golf_team_members` or join request pending

**Alt:** Coach code path redirects differently (`join/[code]/page.tsx`)

**Asserts:** Membership status active or pending request; cannot see other team roster

---

## WF-TEAM-SWITCH-HEAD-COACH

**Preconditions:** Head coach on ≥2 teams

**Steps:** Team switcher → cookie set → dashboard data for team B

**Asserts:** Roster players all have team_id B; assistant cannot switch; cookie alone insufficient without staff row

**Evidence:** `team-switcher.ts`, resolve-team

---

## WF-ROUND-CREATE-SUBMIT

**Preconditions:** Golf player active on team; course available

**Steps:**
1. `/rounds/new` wizard setup → holes → shots (auto-save ~15s)
2. Submit `submitGolfRoundComprehensive`
3. Writes rounds/holes/shots; status completed
4. Async: stats cache, insights bridge, round review, qualifier update

**Alt:** Continue in_progress; recover; partial-save beacon API

**Failures:** Network mid-shot (draft); double submit; offline IndexedDB disabled (known gap)

**Asserts UI:** Round appears completed; review link  
**Asserts DB:** hole count; shot count; team_id/player_id match; no cross-team  
**Asserts side effects:** stats cache row refreshed; review row eventually; insight generation log

**Evidence:** golfhelm-features #1, `golf.ts`, hooks

---

## WF-RSVP-ATTENDANCE

**Preconditions:** Event exists; player on roster

**Steps:** Calendar → RSVP → attendance record; coach marks check-in/no-show

**Asserts:** `golf_event_attendance` status; reminder cron does not duplicate spam (idempotency Unknown)

**Evidence:** `attendance.ts`, calendar components

---

## WF-RECURRING-PRACTICE

**Preconditions:** Coach

**Steps:** Create recurring series (`recurring-events.ts`) OR CoachHelm Confirm `create_recurring_practice`

**Alt:** Edit one instance vs series (complex — high risk)

**Asserts:** N event rows; attendance fan-out; action_runs ledger if via AI

---

## WF-QUALIFIER

**Steps:** Coach creates qualifier → players enter rounds linked → entries update → leaderboard

**Asserts:** positions; my-qualifiers player view; coach-only create

---

## WF-MESSAGES

**Steps:** Coach DM player / broadcast; realtime update; mark read

**Recent bugfix:** silent fan-out / DM break (#1072) — regression critical

**Asserts:** message row; participant rows; recipient sees thread; no cross-team

---

## WF-COACHHELM-BRIEF-LOAD

**Steps:** Coach opens `/intelligence` → parallel fetches signal groups, pulse, analytics → CommandOpening + TriageDesk

**Asserts:** Only v3-visible insights; players FeatureUnavailable; query `?view=signals|players|effectiveness`

---

## WF-COACHHELM-ASK-READ

**Steps:** Ask question → stream → tools like `get_player_metrics` → answer with evidence

**Asserts:** Tool results match DB metrics for same player; no off-roster player resolution

**Never trust:** Model prose alone for numbers

---

## WF-COACHHELM-ASK-WRITE-FOCUS

**Steps:**
1. Model calls `create_focus_area` → proposal card
2. Coach Confirm → approval continuation
3. `claimForExecution` → `createFocusArea` → receipt
4. Retry Confirm → same idempotency_key → no duplicate focus

**Asserts DB:** one `golf_player_focus_areas` (or goals path); `golf_coachhelm_action_runs` completed; insight action ledger if from insight

**Evidence:** agent-tools, action-runs, stream route, PR #1063/#1069

---

## WF-INSIGHT-POST-ROUND

**Steps:** Round submit → bridge admin analyzePlayer → upsertInsightV3 → composites → safety-net cron recovers strands

**Asserts:** generation log; insights with engine_version v3; player/coach feeds only visible lifecycle states

---

## WF-BASEBALL-IMPORT

**Steps:** Import Center upload XML/CSV → parse adapter → match players → commit with source trust

**Asserts:** import_run status; box/season stats rows; wrong-team players not matched; no live vendor API called

---

## WF-BASEBALL-PIPELINE

**Steps:** Add prospect → stage transitions (watchlist→…→committed/uninterested only)

**Asserts:** invalid stage rejected; recruitability gates

---

## WF-BASEBALL-PUBLIC-PACKET

**Steps:** Create share token → open `/baseball/packet/[token]` anon

**Asserts:** only allowed fields; revoked token 404; enumeration resistance

---

## WF-LIFT-SESSION

**Steps:** Assign program → athlete opens today → log sets → coach live view

**Asserts:** set_results; org isolation

---

## WF-BILLING (negative)

**Assert:** No paywall redirects on golf/baseball dashboards when Stripe unset; admin billing scaffold does not grant product entitlements

---

## Sequence diagram — Ask write (canonical)

```
Coach UI AskSurface
  → useCoachHelmChat / useChat
  → POST /api/coachhelm/v3/chat/stream
  → resolveCoachChatContext (coach+team+roster)
  → streamText + tools
  → onInputAvailable: recordProposal (action_runs)
  → UI ActionProposalCard Confirm
  → addToolApprovalResponse
  → execute claimForExecution → domain action → recordOutcome
  → data-action-receipt → UI
  → persistence chat messages
```

---

## Persistence testing rule

For every mutating workflow above: **reload page + re-login + query DB** — do not trust optimistic UI or toast alone. Especially: tasks, RSVP, focus areas, AI Confirm, round submit, imports.

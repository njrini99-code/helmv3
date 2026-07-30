# Helm Feature Catalog

## How to read this catalog

Status vocabulary is restricted to **Confirmed active**, **Partially implemented**, **UI-only**, **Backend-only/dormant**, **Unused/orphaned**, **Deprecated**, **Mocked**, **Planned**, or **Unclear**. Confidence labels are Confirmed, Strongly inferred, Tentative, or Unknown. Feature priority is test priority, not a claim that a defect exists.

Snapshot: njrini99-code/helmv3@887218526e4e; live Supabase qmnssrrolpinvwjjnufo; observed 2026-07-26.

## Catalog index

| Feature ID | Feature | Product area | Status | Confidence | Priority | Primary roles |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-001 | Public product discovery | Shared | Confirmed active | Confirmed | P2 | Unauthenticated visitor |
| AUTH-002 | Email/password sign-up and sign-in | Shared | Confirmed active | Confirmed | P0 | Visitor; Registered user |
| AUTH-003 | Password reset and callback | Shared | Confirmed active | Confirmed | P0 | Registered user |
| AUTH-004 | Idle timeout, sign-out, and stale-deployment recovery | Shared | Confirmed active | Confirmed | P1 | All authenticated roles |
| AUTH-005 | Account deletion | Shared | Partially implemented | Strongly inferred | P0 | Authenticated user |
| AUTH-006 | Baseball coach onboarding and team creation | BaseballHelm | Confirmed active | Confirmed | P0 | New Baseball coach |
| AUTH-007 | Baseball player onboarding and team join | BaseballHelm | Confirmed active | Confirmed | P0 | New Baseball player; Invited player |
| AUTH-008 | Baseball staff invitation acceptance | BaseballHelm | Confirmed active | Confirmed | P0 | Invited coach/staff |
| AUTH-009 | Golf coach onboarding | GolfHelm | Confirmed active | Confirmed | P0 | New Golf coach |
| AUTH-010 | Golf player onboarding, join code, and join request | GolfHelm | Partially implemented | Confirmed | P0 | New Golf player; Invited player |
| AUTH-011 | Active-team switching | GolfHelm/BaseballHelm | Confirmed active | Confirmed | P0 | Multi-team Golf head coach; Multi-team Baseball staff |
| TEAM-001 | Baseball team settings and program configuration | BaseballHelm | Confirmed active | Confirmed | P1 | Primary coach; Staff with manage_settings |
| TEAM-002 | Baseball staff roles and scoped capabilities | BaseballHelm | Confirmed active | Confirmed | P0 | Primary/head coach; Scoped staff |
| TEAM-003 | Baseball roster CRUD and roster import | BaseballHelm | Confirmed active | Confirmed | P1 | Coach with manage_roster |
| TEAM-004 | Baseball season module toggles | BaseballHelm | Partially implemented | Confirmed | P1 | Primary coach |
| TEAM-005 | Golf roster and recruit management | GolfHelm | Confirmed active | Confirmed | P1 | Head coach; Assistant coach |
| TEAM-006 | Golf second-team management | GolfHelm | Confirmed active | Confirmed | P1 | Primary/head coach |
| TEAM-007 | Golf team settings and coaching philosophy | GolfHelm | Confirmed active | Confirmed | P1 | Head coach; Assistant coach where RLS permits |
| PRACTICE-001 | Baseball practice planning | BaseballHelm | Confirmed active | Confirmed | P1 | Staff with manage_practice |
| PRACTICE-002 | Golf one-off calendar event | GolfHelm | Confirmed active | Confirmed | P1 | Golf team coach |
| PRACTICE-003 | Golf recurring events and scoped edits | GolfHelm | Confirmed active | Confirmed | P0 | Golf team coach |
| PRACTICE-004 | Golf RSVP and attendance | GolfHelm | Confirmed active | Confirmed | P1 | Player; Coach |
| PRACTICE-005 | Baseball attendance and acknowledgements | BaseballHelm | Confirmed active | Confirmed | P1 | Player; Coach with calendar/practice capability |
| PRACTICE-006 | Practice effectiveness reviews | BaseballHelm | Confirmed active | Confirmed | P2 | Coach |
| PRACTICE-007 | Calendar feeds, external sync, and screenshot import | GolfHelm | Partially implemented | Confirmed | P1 | Coach; Player with feed token |
| STATS-001 | Baseball manual stats and dashboards | BaseballHelm | Confirmed active | Confirmed | P1 | Coach with manage_stats; Player for own views |
| STATS-002 | Baseball box-score entry and CSV upload | BaseballHelm | Confirmed active | Confirmed | P0 | Staff with manage_stats |
| STATS-003 | Baseball event-grain stat imports | BaseballHelm | Confirmed active | Confirmed | P1 | Staff with manage_imports/manage_stats |
| STATS-004 | Baseball player comparison and saved views | BaseballHelm | Confirmed active | Confirmed | P2 | Coach; Player where scoped |
| STATS-005 | Golf round draft, recovery, and submission | GolfHelm | Confirmed active | Confirmed | P0 | Golf player |
| STATS-006 | Golf shot detail editing | GolfHelm | Confirmed active | Confirmed | P1 | Round-owning player |
| STATS-007 | Golf player and team analytics | GolfHelm | Confirmed active | Confirmed | P1 | Player for self; Team coach |
| STATS-008 | Golf qualifiers | GolfHelm | Confirmed active | Confirmed | P1 | Coach; Entered player |
| STATS-009 | Golf round reviews and recaps | GolfHelm/CoachHelm | Confirmed active | Confirmed | P1 | Player; Coach |
| STATS-010 | Golf course library and tee mapping | GolfHelm | Confirmed active | Confirmed | P1 | Coach; Player |
| DEV-001 | Baseball development plans and metrics | BaseballHelm | Confirmed active | Confirmed | P1 | Coach; Scoped player |
| DEV-002 | Baseball coach-only and player-facing notes | BaseballHelm | Confirmed active | Confirmed | P0 | Coach; Player for visible scope |
| DEV-003 | Baseball Player Today, daily contracts, and timeline | BaseballHelm | Confirmed active | Confirmed | P1 | Player; Coach |
| DEV-004 | Baseball signals, insights, and decision room | BaseballHelm | Confirmed active | Confirmed | P1 | Coach |
| DEV-005 | Golf focus areas | GolfHelm/CoachHelm | Confirmed active | Confirmed | P1 | Coach; Player for own assignments |
| DEV-006 | Golf goals and suggestions | GolfHelm/CoachHelm | Confirmed active | Confirmed | P1 | Coach; Player |
| DEV-007 | Golf drill library and assignments | GolfHelm | Confirmed active | Confirmed | P2 | Coach; Player |
| DEV-008 | Golf tasks, assignment, completion, and reminders | GolfHelm/CoachHelm | Partially implemented | Confirmed | P1 | Coach; Assigned player |
| DEV-009 | Player CoachHelm development hub | GolfHelm/CoachHelm | Confirmed active | Confirmed | P1 | Golf player |
| COMM-001 | Baseball announcements | BaseballHelm | Confirmed active | Confirmed | P1 | Coach; Recipient player |
| COMM-002 | Baseball direct and team messaging | BaseballHelm | Confirmed active | Confirmed | P0 | Coach; Player |
| COMM-003 | Baseball notifications | BaseballHelm | Confirmed active | Confirmed | P1 | Coach; Player |
| COMM-004 | Golf announcements | GolfHelm | Partially implemented | Confirmed | P1 | Coach; Player recipient |
| COMM-005 | Golf messaging and attachments | GolfHelm | Confirmed active | Confirmed | P0 | Coach; Player |
| COMM-006 | Unified notification preferences and push | Shared/GolfHelm | Confirmed active | Confirmed | P1 | Authenticated user |
| COMM-007 | Event and task reminder jobs | GolfHelm | Confirmed active | Confirmed | P1 | Coach; Player recipient |
| OPS-001 | Baseball documents and versioning | BaseballHelm | Confirmed active | Confirmed | P0 | Staff with manage_documents; Authorized player |
| OPS-002 | Golf documents and recruit documents | GolfHelm | Confirmed active | Confirmed | P0 | Coach; Player/recruit where allowed |
| OPS-003 | Baseball travel planning | BaseballHelm | Confirmed active | Confirmed | P1 | Coach/staff; Player viewer |
| OPS-004 | Golf travel planning | GolfHelm | Confirmed active | Confirmed | P1 | Coach; Player viewer |
| OPS-005 | Baseball video library and classes | BaseballHelm | Confirmed active | Confirmed | P1 | Coach; Scoped player |
| OPS-006 | Baseball academics and eligibility | BaseballHelm | Confirmed active | Confirmed | P0 | Coach with view_academics; Player for self |
| OPS-007 | Baseball lineups and postgame review | BaseballHelm | Confirmed active | Confirmed | P1 | Coach |
| OPS-008 | Baseball recruiting, discovery, watchlists, and scout packets | BaseballHelm | Confirmed active | Confirmed | P1 | Coach; Player with public passport |
| LIFT-001 | Lifting programs and prescriptions | Helm Lifting | Confirmed active | Confirmed | P1 | Lifting coach |
| LIFT-002 | Lifting sessions, results, and PRs | Helm Lifting | Confirmed active | Confirmed | P1 | Lifting coach; Athlete |
| LIFT-003 | Lifting readiness, soreness, bodyweight, and check-ins | Helm Lifting | Confirmed active | Confirmed | P1 | Athlete; Lifting coach |
| LIFT-004 | Lifting nutrition plans | Helm Lifting | Confirmed active | Confirmed | P2 | Lifting coach; Assigned athlete |
| LIFT-005 | Live weight room | Helm Lifting | Confirmed active | Confirmed | P1 | Lifting coach; Athlete |
| COACHHELM-001 | CoachHelm evidence-backed chat | CoachHelm | Confirmed active | Confirmed | P0 | Golf team coach |
| COACHHELM-002 | CoachHelm confirmed write actions | CoachHelm | Partially implemented | Confirmed | P0 | Golf team coach |
| COACHHELM-003 | CoachHelm insight engine and lifecycle | CoachHelm | Confirmed active | Confirmed | P1 | Golf coach; Player for visible insights |
| COACHHELM-004 | Post-round analysis and safety net | CoachHelm | Confirmed active | Confirmed | P0 | Golf player; Coach |
| COACHHELM-005 | Coach command center and intelligence triage | GolfHelm/CoachHelm | Confirmed active | Confirmed | P1 | Golf coach |
| COACHHELM-006 | CoachHelm qualifying board | CoachHelm | Confirmed active | Confirmed | P1 | Golf coach |
| COACHHELM-007 | CoachHelm deterministic charts and visuals | CoachHelm | Confirmed active | Confirmed | P1 | Golf coach |
| COACHHELM-008 | CoachHelm history, metering, and audit | CoachHelm | Confirmed active | Confirmed | P0 | Golf coach; Platform admin |
| ADMIN-001 | Platform super-admin console | Platform/Admin | Confirmed active | Confirmed | P0 | Platform super-admin |
| ADMIN-002 | Golf CRM and email operations | Platform/Admin | Confirmed active | Confirmed | P0 | Global users.role=admin |
| ADMIN-003 | Operational health, errors, jobs, and telemetry | Platform/Admin | Confirmed active | Confirmed | P1 | Platform super-admin |
| ADMIN-004 | Demo access and tracking | Shared | Confirmed active | Confirmed | P1 | Visitor; Demo user; Admin |
| BILLING-001 | One-off admin invoice billing | Platform/Admin | Partially implemented | Confirmed | P1 | Platform super-admin |
| INTEGRATION-001 | Arccos round ingestion | GolfHelm/CoachHelm | Backend-only/dormant | Confirmed | P1 | Golf player/coach through future setup |
| INTEGRATION-002 | Baseball GameChanger, Presto, and Sidearm imports | BaseballHelm | Confirmed active | Confirmed | P1 | Staff with import/stat capability |
| INTEGRATION-003 | Email, push, monitoring, analytics, and background providers | Shared | Confirmed active | Confirmed | P1 | System |

## AUTH-001 — Public product discovery

- **Product area:** Shared
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P2
- **Primary/secondary roles:** Unauthenticated visitor
- **Entry points:** `/`, `/products`, `/pricing`, `/about`, `/help`, `/support`

### Product contract

Marketing, product comparison, pricing copy, help, support, and legal surfaces route visitors toward BaseballHelm, GolfHelm, or Lifting.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: none in the current live schema or provider-stub state.

### Main workflow

1. Open a public page
2. Choose a product or authentication entry point
3. Navigate without a Supabase session

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** No live persistence object confirmed.
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/page.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/page.tsx)
- [src/app/products/page.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/products/page.tsx)
- [src/app/pricing/page.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/pricing/page.tsx)


## AUTH-002 — Email/password sign-up and sign-in

- **Product area:** Shared
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Visitor; Registered user
- **Entry points:** `/baseball/signup`, `/baseball/login`, `/golf/signup`, `/golf/login`, `/lifting/signup`, `/lifting/login`

### Product contract

Sport-specific authentication screens use Supabase Auth and then route users according to profile/onboarding state.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `users`.

### Main workflow

1. Submit credentials
2. Supabase Auth establishes a session
3. Server resolves app user/profile
4. Redirect to onboarding or dashboard

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- Credentials are never stored in application tables
- Authentication and profile completion are separate states

### Data effects and observable success

- **Tables read/written:** `users`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/auth.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/auth.ts)
- [src/app/golf/actions/auth.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/auth.ts)
- [src/app/lifting/actions/auth.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/auth.ts)
- [src/app/api/golf/auth/login/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/golf/auth/login/route.ts)
- Live database object `public.users`

## AUTH-003 — Password reset and callback

- **Product area:** Shared
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Registered user
- **Entry points:** `/baseball/forgot-password`, `/golf/forgot-password`, `/lifting/forgot-password`, `/auth/callback`

### Product contract

Reset links and authentication callbacks exchange Supabase tokens, recover the user, and continue to the correct product.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `users`.

### Main workflow

1. Request reset
2. Open provider link
3. Exchange callback code
4. Set a new password
5. Redirect

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `users`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/auth/callback/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/auth/callback/route.ts)
- [src/app/baseball/(auth)/forgot-password/page.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/%28auth%29/forgot-password/page.tsx)
- [src/app/golf/(auth)/reset-password/page.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/%28auth%29/reset-password/page.tsx)
- Live database object `public.users`

## AUTH-004 — Idle timeout, sign-out, and stale-deployment recovery

- **Product area:** Shared
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** All authenticated roles
- **Entry points:** `Authenticated shells`, `Account menus`

### Product contract

Client session-activity logic redirects expired sessions and reloads on stale deployment assets.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `users`.

### Main workflow

1. Become idle or choose sign out
2. Session is cleared or considered expired
3. Router redirects to sport login

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `users`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/auth/session-activity.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/auth/session-activity.ts)
- [src/components/providers/StaleDeploymentRecoveryScript.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/providers/StaleDeploymentRecoveryScript.tsx)
- Live database object `public.users`

## AUTH-005 — Account deletion

- **Product area:** Shared
- **Implementation status:** Partially implemented
- **Confidence:** Strongly inferred
- **Scan priority:** P0
- **Primary/secondary roles:** Authenticated user
- **Entry points:** `Account settings`, `/api/account/delete`

### Product contract

Authenticated API handler performs multi-table cleanup with an admin client; it is consequential and lacks a dedicated E2E characterization suite.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `users`, `baseball_coaches`, `baseball_messages`, `golf_coaches`, `golf_messages`.

### Main workflow

1. Confirm deletion in UI
2. DELETE authenticated API request
3. Server deletes/cleans owned data and auth account
4. Session becomes invalid

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- Must be tested only in an isolated project
- Partial cleanup failure must not report a complete deletion

### Data effects and observable success

- **Tables read/written:** `users`, `baseball_coaches`, `baseball_messages`, `golf_coaches`, `golf_messages`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/api/account/delete/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/account/delete/route.ts)
- Live database object `public.users`
- Live database object `public.baseball_coaches`
- Live database object `public.baseball_messages`
- Live database object `public.golf_coaches`
- Live database object `public.golf_messages`

## AUTH-006 — Baseball coach onboarding and team creation

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** New Baseball coach
- **Entry points:** `/baseball/onboarding/coach`, `/baseball/onboarding/team`

### Product contract

Creates the organization/team/coach relationship and establishes the active Baseball team context.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `organizations`, `baseball_coaches`, `baseball_teams`, `baseball_team_coach_staff`.

### Main workflow

1. Authenticate
2. Complete coach profile
3. Create organization/team
4. Create primary staff row
5. Set active context
6. Enter dashboard

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `organizations`, `baseball_coaches`, `baseball_teams`, `baseball_team_coach_staff`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/onboarding.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/onboarding.ts)
- [src/app/baseball/actions/teams.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/teams.ts)
- [src/lib/baseball/active-context.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/baseball/active-context.ts)
- Live database object `public.organizations`
- Live database object `public.baseball_coaches`
- Live database object `public.baseball_teams`
- Live database object `public.baseball_team_coach_staff`

## AUTH-007 — Baseball player onboarding and team join

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** New Baseball player; Invited player
- **Entry points:** `/baseball/onboarding/player`, `/baseball/join/[code]`

### Product contract

Creates/completes a player profile and joins a team by validated code or invitation.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_players`, `baseball_team_members`, `baseball_team_invitations`.

### Main workflow

1. Authenticate
2. Complete player profile
3. Resolve team code/invite
4. Create active membership
5. Render Player Today

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_players`, `baseball_team_members`, `baseball_team_invitations`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/onboarding.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/onboarding.ts)
- [src/app/baseball/actions/teams.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/teams.ts)
- [src/components/baseball/player-today/PlayerTodayTeamless.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/baseball/player-today/PlayerTodayTeamless.tsx)
- Live database object `public.baseball_players`
- Live database object `public.baseball_team_members`
- Live database object `public.baseball_team_invitations`

## AUTH-008 — Baseball staff invitation acceptance

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Invited coach/staff
- **Entry points:** `/baseball/staff-invite/[token]`

### Product contract

The Server Action binds the authenticated email to the invitation before calling the live acceptance RPC; the RPC itself accepts possession of a token without the same email check.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_staff_invitations`, `baseball_coaches`, `baseball_team_coach_staff`.

### Main workflow

1. Open token link
2. Authenticate
3. Server compares invitation email
4. RPC creates coach/staff membership
5. Redirect to team

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_staff_invitations`, `baseball_coaches`, `baseball_team_coach_staff`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/staff.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/staff.ts)
- Live database object `public.baseball_staff_invitations`
- Live database object `public.baseball_coaches`
- Live database object `public.baseball_team_coach_staff`

## AUTH-009 — Golf coach onboarding

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** New Golf coach
- **Entry points:** `/golf/onboarding/coach`

### Product contract

Creates a coach, organization, team, and primary staff relationship with compensating cleanup on failure.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `organizations`, `golf_coaches`, `golf_teams`, `golf_team_coach_staff`.

### Main workflow

1. Authenticate
2. Submit coach/program data
3. Create organization and coach
4. Create team and primary staff row
5. Enter dashboard

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `organizations`, `golf_coaches`, `golf_teams`, `golf_team_coach_staff`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/onboarding.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/onboarding.ts)
- [src/app/golf/(onboarding)/coach/page.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/%28onboarding%29/coach/page.tsx)
- Live database object `public.organizations`
- Live database object `public.golf_coaches`
- Live database object `public.golf_teams`
- Live database object `public.golf_team_coach_staff`

## AUTH-010 — Golf player onboarding, join code, and join request

- **Product area:** GolfHelm
- **Implementation status:** Partially implemented
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** New Golf player; Invited player
- **Entry points:** `/golf/onboarding/player`, `/golf/join/[code]`

### Product contract

Completes the player profile and may join a team directly or request access; onboarding can report success even when automatic joining fails.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_players`, `golf_team_members`, `golf_team_join_requests`.

### Main workflow

1. Authenticate
2. Create/complete player
3. Validate team/code
4. Create membership or pending request
5. Enter player hub

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_players`, `golf_team_members`, `golf_team_join_requests`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/onboarding.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/onboarding.ts)
- [src/app/golf/actions/teams.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/teams.ts)
- [src/app/golf/actions/access-code.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/access-code.ts)
- Live database object `public.golf_players`
- Live database object `public.golf_team_members`
- Live database object `public.golf_team_join_requests`

## AUTH-011 — Active-team switching

- **Product area:** GolfHelm/BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Multi-team Golf head coach; Multi-team Baseball staff
- **Entry points:** `Golf TeamSwitcher`, `Baseball team selector`

### Product contract

A server-validated cookie/context selects the active team and the UI optimistically refreshes the Server Component tree.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_team_coach_staff`, `baseball_team_coach_staff`.

### Main workflow

1. Choose another allowed team
2. Server validates staff membership
3. Set active-team cookie/context
4. Refresh all team-scoped data

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- Golf second-team switching is restricted to multi-team head coaches
- Old-team cached data must never survive the switch

### Data effects and observable success

- **Tables read/written:** `golf_team_coach_staff`, `baseball_team_coach_staff`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/components/golf/TeamSwitcher.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/golf/TeamSwitcher.tsx)
- [src/app/golf/actions/team-switcher.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/team-switcher.ts)
- [src/lib/golf/resolve-team-server.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/golf/resolve-team-server.ts)
- [src/lib/baseball/active-context.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/baseball/active-context.ts)
- Live database object `public.golf_team_coach_staff`
- Live database object `public.baseball_team_coach_staff`

## TEAM-001 — Baseball team settings and program configuration

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Primary coach; Staff with manage_settings
- **Entry points:** `/baseball/dashboard/settings`, `/baseball/dashboard/settings/program`

### Product contract

Coaches manage team identity, season/program settings, and audited configuration.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_teams`, `baseball_program_settings`, `baseball_seasons`, `baseball_settings_audit_log`.

### Main workflow

1. Open team settings
2. Pass capability check
3. Validate fields
4. Update team/program row
5. Write audit event
6. Revalidate

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_teams`, `baseball_program_settings`, `baseball_seasons`, `baseball_settings_audit_log`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/program-settings.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/program-settings.ts)
- [src/app/baseball/actions/team-season-settings.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/team-season-settings.ts)
- [src/app/baseball/actions/teams.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/teams.ts)
- Live database object `public.baseball_teams`
- Live database object `public.baseball_program_settings`
- Live database object `public.baseball_seasons`
- Live database object `public.baseball_settings_audit_log`

## TEAM-002 — Baseball staff roles and scoped capabilities

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Primary/head coach; Scoped staff
- **Entry points:** `/baseball/dashboard/settings/staff`

### Product contract

Primary staff invite coaches, assign granular capabilities/player scopes, revoke access, and audit changes.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_team_coach_staff`, `baseball_staff_invitations`, `baseball_staff_audit_events`.

### Main workflow

1. Invite staff
2. Accept invitation
3. Create active staff row
4. Change capability/scope
5. Server wrapper and RLS enforce future actions

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_team_coach_staff`, `baseball_staff_invitations`, `baseball_staff_audit_events`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/staff.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/staff.ts)
- [src/app/baseball/actions/roles-permissions.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/roles-permissions.ts)
- [src/lib/baseball/with-baseball-action.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/baseball/with-baseball-action.ts)
- Live database object `public.baseball_team_coach_staff`
- Live database object `public.baseball_staff_invitations`
- Live database object `public.baseball_staff_audit_events`

## TEAM-003 — Baseball roster CRUD and roster import

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach with manage_roster
- **Entry points:** `/baseball/dashboard/roster`, `/baseball/dashboard/import`

### Product contract

Coaches add, edit, remove, and import players into the active team roster.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_players`, `baseball_team_members`, `baseball_import_runs`, `baseball_import_sources`.

### Main workflow

1. Open roster
2. Validate capability and active team
3. Create/update player and membership or stage import
4. Refresh roster

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_players`, `baseball_team_members`, `baseball_import_runs`, `baseball_import_sources`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/roster.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/roster.ts)
- [src/app/baseball/actions/imports.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/imports.ts)
- [src/app/baseball/(dashboard)/dashboard/roster/RosterClient.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/%28dashboard%29/dashboard/roster/RosterClient.tsx)
- Live database object `public.baseball_players`
- Live database object `public.baseball_team_members`
- Live database object `public.baseball_import_runs`
- Live database object `public.baseball_import_sources`

## TEAM-004 — Baseball season module toggles

- **Product area:** BaseballHelm
- **Implementation status:** Partially implemented
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Primary coach
- **Entry points:** `/baseball/dashboard/settings/season`

### Product contract

Season/program module toggles are written, but repository issues [#503](https://github.com/njrini99-code/helmv3/issues/503) and [#504](https://github.com/njrini99-code/helmv3/issues/504) report that route availability does not consistently enforce them.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_seasons`, `baseball_program_settings`.

### Main workflow

1. Change module toggle
2. Persist setting
3. Expected route/navigation enforcement is incomplete

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_seasons`, `baseball_program_settings`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/team-season-settings.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/team-season-settings.ts)
- Live database object `public.baseball_seasons`
- Live database object `public.baseball_program_settings`

## TEAM-005 — Golf roster and recruit management

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Head coach; Assistant coach
- **Entry points:** `/golf/dashboard/roster`, `/golf/dashboard/recruiting`

### Product contract

Coaches maintain active players and recruiting records within their team/organization.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_players`, `golf_team_members`, `golf_recruits`.

### Main workflow

1. Open roster/recruiting
2. Create or edit record
3. RLS validates team coach
4. Refresh list/detail

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_players`, `golf_team_members`, `golf_recruits`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/roster.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/roster.ts)
- [src/app/golf/actions/recruiting.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/recruiting.ts)
- Live database object `public.golf_players`
- Live database object `public.golf_team_members`
- Live database object `public.golf_recruits`

## TEAM-006 — Golf second-team management

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Primary/head coach
- **Entry points:** `/golf/dashboard/settings`, `Team switcher`

### Product contract

A primary coach may add a second same-organization team for the other gender and switch between permitted teams.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_teams`, `golf_team_coach_staff`.

### Main workflow

1. Create second team
2. Enforce organization/gender uniqueness
3. Create staff row
4. Switch active team

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_teams`, `golf_team_coach_staff`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/teams.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/teams.ts)
- [src/app/golf/actions/team-switcher.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/team-switcher.ts)
- Live database object `public.golf_teams`
- Live database object `public.golf_team_coach_staff`

## TEAM-007 — Golf team settings and coaching philosophy

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Head coach; Assistant coach where RLS permits
- **Entry points:** `/golf/dashboard/settings`

### Product contract

Coaches manage program settings, philosophy, and CoachHelm team configuration.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_team_settings`, `golf_coach_philosophy`, `golf_team_coachhelm_settings`.

### Main workflow

1. Load active team
2. Edit setting
3. Authorize through team relationship/RLS
4. Persist and refresh

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_team_settings`, `golf_coach_philosophy`, `golf_team_coachhelm_settings`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/teams.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/teams.ts)
- [src/app/golf/actions/coaching-philosophy.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/coaching-philosophy.ts)
- Live database object `public.golf_team_settings`
- Live database object `public.golf_coach_philosophy`
- Live database object `public.golf_team_coachhelm_settings`

## PRACTICE-001 — Baseball practice planning

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Staff with manage_practice
- **Entry points:** `/baseball/dashboard/practice`, `/baseball/dashboard/practice/[id]`

### Product contract

Coaches create structured practices with blocks, objectives, lineup slots, scrimmages, players, and lifecycle updates.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_practices`, `baseball_practice_blocks`, `baseball_practice_block_objectives`, `baseball_practice_lineup_slots`, `baseball_practice_scrimmages`.

### Main workflow

1. Create practice
2. Add blocks/objectives/players
3. Save through capability wrapper
4. Revalidate coach/player practice views

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_practices`, `baseball_practice_blocks`, `baseball_practice_block_objectives`, `baseball_practice_lineup_slots`, `baseball_practice_scrimmages`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/practice.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/practice.ts)
- [src/app/baseball/actions/practice-scrimmage.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/practice-scrimmage.ts)
- Live database object `public.baseball_practices`
- Live database object `public.baseball_practice_blocks`
- Live database object `public.baseball_practice_block_objectives`
- Live database object `public.baseball_practice_lineup_slots`
- Live database object `public.baseball_practice_scrimmages`

## PRACTICE-002 — Golf one-off calendar event

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Golf team coach
- **Entry points:** `/golf/dashboard/calendar`

### Product contract

Coaches create, edit, soft-cancel, restore, and conditionally hard-delete team events; invitations and notifications are secondary effects.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_events`, `golf_event_attendance`, `golf_calendar_notifications`.

### Main workflow

1. Submit event
2. Validate date/time and active team
3. Insert confirmed event
4. Optionally add attendance rows
5. Queue notification fan-out
6. Refresh calendar

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_events`, `golf_event_attendance`, `golf_calendar_notifications`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/golf.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/golf.ts)
- [src/components/fairway/pages/calendar/FairwayEventEditor.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/fairway/pages/calendar/FairwayEventEditor.tsx)
- Live database object `public.golf_events`
- Live database object `public.golf_event_attendance`
- Live database object `public.golf_calendar_notifications`

## PRACTICE-003 — Golf recurring events and scoped edits

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Golf team coach
- **Entry points:** `/golf/dashboard/calendar`

### Product contract

RRULE-based series are materialized as a root plus children, capped at 26 generated occurrences, with this/this-and-future/all edit and delete scopes and root promotion.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_events`, `golf_event_attendance`, `golf_calendar_notifications`.

### Main workflow

1. Create series and occurrences
2. Create attendance rows
3. Select edit/delete scope
4. Shift/update/delete selected rows
5. Promote surviving root when required
6. Notify and refresh

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_events`, `golf_event_attendance`, `golf_calendar_notifications`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/recurring-events.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/recurring-events.ts)
- [src/app/golf/actions/__tests__/recurring-events.test.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/__tests__/recurring-events.test.ts)
- Live database object `public.golf_events`
- Live database object `public.golf_event_attendance`
- Live database object `public.golf_calendar_notifications`

## PRACTICE-004 — Golf RSVP and attendance

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Player; Coach
- **Entry points:** `/golf/dashboard/calendar`, `/golf/dashboard/hub`

### Product contract

Players submit or change their own RSVP; coaches manage attendance and roll-call state.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_event_attendance`, `golf_attendance_summary`.

### Main workflow

1. Open event
2. Resolve own player/event membership
3. Insert/update attendance response
4. Refresh/realtime reconcile

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_event_attendance`, `golf_attendance_summary`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/attendance.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/attendance.ts)
- [src/lib/calendar/rsvp.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/calendar/rsvp.ts)
- [src/hooks/useRSVP.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/hooks/useRSVP.ts)
- Live database object `public.golf_event_attendance`
- Live database object `public.golf_attendance_summary`

## PRACTICE-005 — Baseball attendance and acknowledgements

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Player; Coach with calendar/practice capability
- **Entry points:** `/baseball/dashboard/calendar`, `/baseball/player/today`

### Product contract

Players acknowledge calendar/timeline events and coaches track event attendance.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_events`, `baseball_event_attendance`, `baseball_event_acknowledgements`, `baseball_timeline_event_acks`.

### Main workflow

1. Open event/today view
2. Submit response or acknowledgement
3. Update scoped row
4. Optimistically reconcile then refresh

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_events`, `baseball_event_attendance`, `baseball_event_acknowledgements`, `baseball_timeline_event_acks`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/calendar.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/calendar.ts)
- [src/app/baseball/actions/acknowledgements.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/acknowledgements.ts)
- [src/app/baseball/actions/timeline-acks.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/timeline-acks.ts)
- Live database object `public.baseball_events`
- Live database object `public.baseball_event_attendance`
- Live database object `public.baseball_event_acknowledgements`
- Live database object `public.baseball_timeline_event_acks`

## PRACTICE-006 — Practice effectiveness reviews

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P2
- **Primary/secondary roles:** Coach
- **Entry points:** `/baseball/dashboard/practice/effectiveness`

### Product contract

Coaches rate completed practices and review effectiveness trends.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_practice_effectiveness_reviews`.

### Main workflow

1. Choose practice
2. Submit review
3. Persist rating/notes
4. Refresh effectiveness dashboard

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_practice_effectiveness_reviews`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/practice-effectiveness.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/practice-effectiveness.ts)
- [src/components/baseball/practice-effectiveness/PracticeEffectivenessClient.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/baseball/practice-effectiveness/PracticeEffectivenessClient.tsx)
- Live database object `public.baseball_practice_effectiveness_reviews`

## PRACTICE-007 — Calendar feeds, external sync, and screenshot import

- **Product area:** GolfHelm
- **Implementation status:** Partially implemented
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player with feed token
- **Entry points:** `/golf/dashboard/calendar`, `/api/calendar/feeds/[token]`, `/api/calendar/events`

### Product contract

Tokenized calendar feeds are active; schedule screenshot extraction was added in PR #1071; provider/calendar sync behavior depends on environment configuration.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_calendar_feeds`, `golf_events`.

### Main workflow

1. Create or rotate feed token
2. Read ICS feed
3. Optionally parse schedule image
4. Review before committing events

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_calendar_feeds`, `golf_events`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/calendar-feeds.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/calendar-feeds.ts)
- [src/app/golf/actions/calendar-sync.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/calendar-sync.ts)
- [src/app/golf/actions/schedule-image.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/schedule-image.ts)
- [src/app/api/calendar/feeds/[token]/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/calendar/feeds/[token]/route.ts)
- Live database object `public.golf_calendar_feeds`
- Live database object `public.golf_events`

## STATS-001 — Baseball manual stats and dashboards

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach with manage_stats; Player for own views
- **Entry points:** `/baseball/dashboard/stats-center`, `/baseball/dashboard/players/[id]/stats`

### Product contract

Game and player statistics feed team/player dashboards, aggregates, comparisons, and trends.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_games`, `baseball_player_stats`, `baseball_player_season_stats`, `baseball_player_aggregates`, `baseball_player_percentiles`.

### Main workflow

1. Enter or edit game/player stats
2. Capability check
3. Write event/box score rows
4. Recalculate aggregates
5. Revalidate stats surfaces

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_games`, `baseball_player_stats`, `baseball_player_season_stats`, `baseball_player_aggregates`, `baseball_player_percentiles`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/stats.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/stats.ts)
- [src/app/baseball/actions/games.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/games.ts)
- [docs/baseball/stats-architecture.md](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/docs/baseball/stats-architecture.md)
- Live database object `public.baseball_games`
- Live database object `public.baseball_player_stats`
- Live database object `public.baseball_player_season_stats`
- Live database object `public.baseball_player_aggregates`
- Live database object `public.baseball_player_percentiles`

## STATS-002 — Baseball box-score entry and CSV upload

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Staff with manage_stats
- **Entry points:** `/baseball/dashboard/stats/games/[gameId]`, `/baseball/dashboard/import`

### Product contract

The UI/action path requires the stats capability and invokes a transactional RPC, while the live RPC independently accepts any team staff member.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_games`, `baseball_box_score_batting`, `baseball_box_score_pitching`, `baseball_box_score_uploads`.

### Main workflow

1. Select game/upload
2. Validate and map roster
3. Capability wrapper
4. Atomic save RPC
5. Recalculate/revalidate

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_games`, `baseball_box_score_batting`, `baseball_box_score_pitching`, `baseball_box_score_uploads`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/games.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/games.ts)
- [src/app/baseball/actions/__tests__/save-full-box-score.test.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/__tests__/save-full-box-score.test.ts)
- [src/app/baseball/actions/__tests__/upload-box-score-csv.test.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/__tests__/upload-box-score-csv.test.ts)
- Live database object `public.baseball_games`
- Live database object `public.baseball_box_score_batting`
- Live database object `public.baseball_box_score_pitching`
- Live database object `public.baseball_box_score_uploads`

## STATS-003 — Baseball event-grain stat imports

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Staff with manage_imports/manage_stats
- **Entry points:** `/baseball/dashboard/import`

### Product contract

CSV/file adapters stage, validate, review, and commit event-grain baseball statistics.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_import_runs`, `baseball_import_sources`, `baseball_pitch_events`, `baseball_plate_appearances`, `baseball_batted_ball_events`, `baseball_fielding_events`.

### Main workflow

1. Upload file
2. Detect source/format
3. Stage run and row bands
4. Review errors/warnings
5. Commit valid rows
6. Refresh aggregates

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_import_runs`, `baseball_import_sources`, `baseball_pitch_events`, `baseball_plate_appearances`, `baseball_batted_ball_events`, `baseball_fielding_events`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/stat-event-imports.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/stat-event-imports.ts)
- [src/app/baseball/actions/imports.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/imports.ts)
- Live database object `public.baseball_import_runs`
- Live database object `public.baseball_import_sources`
- Live database object `public.baseball_pitch_events`
- Live database object `public.baseball_plate_appearances`
- Live database object `public.baseball_batted_ball_events`
- Live database object `public.baseball_fielding_events`

## STATS-004 — Baseball player comparison and saved views

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P2
- **Primary/secondary roles:** Coach; Player where scoped
- **Entry points:** `/baseball/dashboard/compare`

### Product contract

Users compare player metrics and retain named visual/stat views.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_player_comparisons`, `baseball_stat_visual_views`.

### Main workflow

1. Select players/date range
2. Load scoped stats
3. Render comparison
4. Optionally save view

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_player_comparisons`, `baseball_stat_visual_views`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/(dashboard)/dashboard/compare/actions.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/%28dashboard%29/dashboard/compare/actions.ts)
- [src/app/baseball/actions/stat-visual-views.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/stat-visual-views.ts)
- Live database object `public.baseball_player_comparisons`
- Live database object `public.baseball_stat_visual_views`

## STATS-005 — Golf round draft, recovery, and submission

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Golf player
- **Entry points:** `/golf/dashboard/rounds/new`, `/golf/dashboard/rounds/continue/[id]`, `/golf/dashboard/rounds/recover/[id]`

### Product contract

Players auto-save a round draft, recover it, and submit validated hole/shot data through atomic RPCs; submission then refreshes caches, qualifiers, notifications, and CoachHelm work.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_rounds`, `golf_holes`, `golf_shots`, `putt_details`, `approach_miss_details`.

### Main workflow

1. Start round
2. Auto-save partial round atomically
3. Resume/recover
4. Validate complete scorecard
5. Submit round atomically
6. Refresh stats
7. Queue CoachHelm/coach notifications

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_rounds`, `golf_holes`, `golf_shots`, `putt_details`, `approach_miss_details`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/golf.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/golf.ts)
- [src/app/golf/actions/round-drafts.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/round-drafts.ts)
- [src/app/golf/actions/__tests__/golf-save-partial-round.test.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/__tests__/golf-save-partial-round.test.ts)
- Live database object `public.golf_rounds`
- Live database object `public.golf_holes`
- Live database object `public.golf_shots`
- Live database object `public.putt_details`
- Live database object `public.approach_miss_details`

## STATS-006 — Golf shot detail editing

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Round-owning player
- **Entry points:** `/golf/dashboard/rounds/[id]`

### Product contract

Players add, edit, and delete shot-level details on their rounds and invalidate derived statistics.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_shots`, `putt_details`, `approach_miss_details`, `golf_rounds`.

### Main workflow

1. Open owned round
2. Edit/delete shot
3. RLS/ownership check
4. Persist detail
5. Recompute/invalidate caches

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_shots`, `putt_details`, `approach_miss_details`, `golf_rounds`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/golf.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/golf.ts)
- [src/app/golf/actions/shot-analytics.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/shot-analytics.ts)
- Live database object `public.golf_shots`
- Live database object `public.putt_details`
- Live database object `public.approach_miss_details`
- Live database object `public.golf_rounds`

## STATS-007 — Golf player and team analytics

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Player for self; Team coach
- **Entry points:** `/golf/dashboard/stats`, `/golf/dashboard/stats/team`, `/golf/dashboard/players/[playerId]/game`

### Product contract

Dashboards compute/filter strokes, scoring, putting, approach, trends, player comparisons, and team summaries from completed rounds and caches.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_rounds`, `golf_shots`, `golf_player_stats_cache`, `golf_round_stats_cache`.

### Main workflow

1. Choose scope/date/season
2. Resolve roster authorization
3. Load paginated round/shot/cache data
4. Render deterministic charts and empty states

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_rounds`, `golf_shots`, `golf_player_stats_cache`, `golf_round_stats_cache`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/stats-data.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/stats-data.ts)
- [src/app/golf/actions/stats-dashboard.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/stats-dashboard.ts)
- [src/app/golf/actions/player-profile-stats.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/player-profile-stats.ts)
- Live database object `public.golf_rounds`
- Live database object `public.golf_shots`
- Live database object `public.golf_player_stats_cache`
- Live database object `public.golf_round_stats_cache`

## STATS-008 — Golf qualifiers

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Entered player
- **Entry points:** `/golf/dashboard/qualifiers`, `/golf/dashboard/my-qualifiers`, `/golf/dashboard/coachhelm/qualifying`

### Product contract

Coaches configure multi-round qualifiers and entries; players submit tagged rounds; standings and selections update.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_round_courses`, `golf_qualifier_selections`, `golf_rounds`.

### Main workflow

1. Create qualifier
2. Add entries/courses
3. Player submits permitted round number
4. Update entry stats
5. Advance/complete and render standings

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_round_courses`, `golf_qualifier_selections`, `golf_rounds`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/golf.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/golf.ts)
- [src/app/golf/actions/qualifier-progress.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/qualifier-progress.ts)
- [src/app/golf/actions/v3/qualifying.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/v3/qualifying.ts)
- Live database object `public.golf_qualifiers`
- Live database object `public.golf_qualifier_entries`
- Live database object `public.golf_qualifier_round_courses`
- Live database object `public.golf_qualifier_selections`
- Live database object `public.golf_rounds`

## STATS-009 — Golf round reviews and recaps

- **Product area:** GolfHelm/CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Player; Coach
- **Entry points:** `/golf/dashboard/rounds/[id]/review`

### Product contract

Deterministic round evidence is combined with a verified LLM narrative or deterministic fallback and persisted for review.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_round_reviews`, `golf_review_events`, `golf_rounds`.

### Main workflow

1. Complete round
2. Compute evidence
3. Generate/verify narrative
4. Persist review/fallback
5. Display citations and recap

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_round_reviews`, `golf_review_events`, `golf_rounds`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/round-reviews.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/round-reviews.ts)
- [src/app/golf/actions/round-review-system.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/round-review-system.ts)
- [src/lib/coachhelm/v3/llm/round-review.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/llm/round-review.ts)
- Live database object `public.golf_round_reviews`
- Live database object `public.golf_review_events`
- Live database object `public.golf_rounds`

## STATS-010 — Golf course library and tee mapping

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player
- **Entry points:** `/golf/dashboard/courses`, `/golf/dashboard/courses/[id]`

### Product contract

Users browse, pin, edit, and select course/tee/hole data for rounds and qualifiers.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_courses`, `golf_course_holes`, `golf_course_tees`, `golf_course_tee_holes`, `golf_player_courses`, `golf_team_saved_courses`.

### Main workflow

1. Search/select course
2. Choose or save tee
3. Validate hole mapping
4. Persist preference/edit history
5. Use course provenance in round

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_courses`, `golf_course_holes`, `golf_course_tees`, `golf_course_tee_holes`, `golf_player_courses`, `golf_team_saved_courses`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/course-library.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/course-library.ts)
- [src/app/golf/actions/courses.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/courses.ts)
- Live database object `public.golf_courses`
- Live database object `public.golf_course_holes`
- Live database object `public.golf_course_tees`
- Live database object `public.golf_course_tee_holes`
- Live database object `public.golf_player_courses`
- Live database object `public.golf_team_saved_courses`

## DEV-001 — Baseball development plans and metrics

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Scoped player
- **Entry points:** `/baseball/dashboard/development`, `/baseball/dashboard/players/[id]/development`

### Product contract

Coaches define player development plans and track measures over time.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_developmental_plans`, `baseball_player_development_metrics`.

### Main workflow

1. Open scoped player
2. Create/edit plan
3. Record metric
4. Persist coach ownership/team
5. Render history

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_developmental_plans`, `baseball_player_development_metrics`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/dev-plans.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/dev-plans.ts)
- [src/app/baseball/actions/development-metrics.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/development-metrics.ts)
- Live database object `public.baseball_developmental_plans`
- Live database object `public.baseball_player_development_metrics`

## DEV-002 — Baseball coach-only and player-facing notes

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Coach; Player for visible scope
- **Entry points:** `/baseball/dashboard/players/[id]`

### Product contract

Separate note models and scope fields support coach-private versus player-visible information.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_coach_notes`, `baseball_coach_player_notes`.

### Main workflow

1. Create note with scope
2. Capability/player-scope check
3. Persist author/team/player
4. Filter read model by viewer

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_coach_notes`, `baseball_coach_player_notes`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/coach-notes.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/coach-notes.ts)
- [src/lib/baseball/read-models/coach-notes.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/baseball/read-models/coach-notes.ts)
- Live database object `public.baseball_coach_notes`
- Live database object `public.baseball_coach_player_notes`

## DEV-003 — Baseball Player Today, daily contracts, and timeline

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Player; Coach
- **Entry points:** `/baseball/player/today`, `/baseball/dashboard/command-center`

### Product contract

Daily assignments, acknowledgements, lifts, practices, and timeline items form the player action surface and coach command center.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_player_daily_contracts`, `baseball_player_timeline_events`, `baseball_timeline_event_acks`.

### Main workflow

1. Coach creates/assigns action
2. Player sees Today card
3. Player acknowledges/completes/withdraws
4. Optimistic UI rolls back on error
5. Refresh persists

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_player_daily_contracts`, `baseball_player_timeline_events`, `baseball_timeline_event_acks`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/daily-contract.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/daily-contract.ts)
- [src/lib/baseball/read-models/player-today.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/baseball/read-models/player-today.ts)
- [src/components/baseball/player-today/PlayerTodayClient.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/baseball/player-today/PlayerTodayClient.tsx)
- Live database object `public.baseball_player_daily_contracts`
- Live database object `public.baseball_player_timeline_events`
- Live database object `public.baseball_timeline_event_acks`

## DEV-004 — Baseball signals, insights, and decision room

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach
- **Entry points:** `/baseball/dashboard/command-center`, `/baseball/dashboard/decision-room`

### Product contract

Operational and development signals feed coach triage, decisions, and meetings.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_signals`, `baseball_coach_insights`, `baseball_decision_log`, `baseball_meeting_items`.

### Main workflow

1. Generate/load scoped signal
2. Coach reviews evidence
3. Acknowledge/act
4. Persist decision/meeting item

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_signals`, `baseball_coach_insights`, `baseball_decision_log`, `baseball_meeting_items`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/signals.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/signals.ts)
- [src/app/baseball/actions/insights.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/insights.ts)
- [src/app/baseball/actions/decision-room.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/decision-room.ts)
- Live database object `public.baseball_signals`
- Live database object `public.baseball_coach_insights`
- Live database object `public.baseball_decision_log`
- Live database object `public.baseball_meeting_items`

## DEV-005 — Golf focus areas

- **Product area:** GolfHelm/CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player for own assignments
- **Entry points:** `/golf/dashboard/player-development`, `/golf/dashboard/my-development`, `CoachHelm action`

### Product contract

Coaches create and track player focus areas manually or through a confirmed CoachHelm action.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_player_focus_areas`.

### Main workflow

1. Select roster player
2. Define focus area
3. Authorize exact active team
4. Insert/update progress
5. Notify player best-effort
6. Deep-link

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_player_focus_areas`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/development.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/development.ts)
- [src/app/golf/actions/v3/focus-area-progress.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/v3/focus-area-progress.ts)
- [src/lib/coachhelm/v3/chat/agent-tools.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/chat/agent-tools.ts)
- Live database object `public.golf_player_focus_areas`

## DEV-006 — Golf goals and suggestions

- **Product area:** GolfHelm/CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player
- **Entry points:** `/golf/dashboard/my-development`

### Product contract

Players/coaches track goals while scheduled jobs evaluate and write goal suggestions.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_goals`, `golf_goal_suggestions`.

### Main workflow

1. Create/accept goal
2. Record progress
3. Scheduled suggestion evaluation
4. Render state/history

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_goals`, `golf_goal_suggestions`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/v3/goals.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/v3/goals.ts)
- [src/app/golf/actions/v3/goal-progress.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/v3/goal-progress.ts)
- [src/app/api/cron/v3/goal-suggestions-write/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/cron/v3/goal-suggestions-write/route.ts)
- Live database object `public.golf_goals`
- Live database object `public.golf_goal_suggestions`

## DEV-007 — Golf drill library and assignments

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P2
- **Primary/secondary roles:** Coach; Player
- **Entry points:** `/golf/dashboard/drills`, `/golf/dashboard/my-development`

### Product contract

Coaches maintain drills and associate them with player development/insights.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_drills`, `golf_insight_drill_attachments`.

### Main workflow

1. Create/select drill
2. Attach to player/insight
3. Persist scoped link
4. Player views assignment

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_drills`, `golf_insight_drill_attachments`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/drills.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/drills.ts)
- Live database object `public.golf_drills`
- Live database object `public.golf_insight_drill_attachments`

## DEV-008 — Golf tasks, assignment, completion, and reminders

- **Product area:** GolfHelm/CoachHelm
- **Implementation status:** Partially implemented
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Assigned player
- **Entry points:** `/golf/dashboard/tasks`, `/golf/dashboard/hub`, `CoachHelm action`

### Product contract

Coaches create/assign/delete tasks and reminders; players complete assignment rows. Task creation returns success even if assignment insertion fails.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_tasks`, `golf_task_assignments`, `golf_task_reminders`.

### Main workflow

1. Create task
2. Insert assignments
3. Notify players best-effort
4. Player completes own assignment
5. Realtime/refetch derives progress

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_tasks`, `golf_task_assignments`, `golf_task_reminders`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/tasks.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/tasks.ts)
- [src/hooks/golf/use-task-realtime.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/hooks/golf/use-task-realtime.ts)
- [src/app/golf/actions/task-reminders.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/task-reminders.ts)
- Live database object `public.golf_tasks`
- Live database object `public.golf_task_assignments`
- Live database object `public.golf_task_reminders`

## DEV-009 — Player CoachHelm development hub

- **Product area:** GolfHelm/CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Golf player
- **Entry points:** `/golf/dashboard/coachhelm/player`, `/golf/dashboard/my-development`

### Product contract

A player-scoped hub combines visible insights, development actions, tasks, RSVP items, and announcements.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_coach_insights`, `golf_player_focus_areas`, `golf_goals`, `golf_task_assignments`.

### Main workflow

1. Resolve authenticated player/team
2. Load only visible/scoped records
3. Render priority cards
4. Complete/acknowledge actions
5. Refresh

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_coach_insights`, `golf_player_focus_areas`, `golf_goals`, `golf_task_assignments`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/player-hub-data.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/player-hub-data.ts)
- [src/components/golf/player-hub/HubInsightSignalCard.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/golf/player-hub/HubInsightSignalCard.tsx)
- Live database object `public.golf_coach_insights`
- Live database object `public.golf_player_focus_areas`
- Live database object `public.golf_goals`
- Live database object `public.golf_task_assignments`

## COMM-001 — Baseball announcements

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Recipient player
- **Entry points:** `/baseball/dashboard/announcements`, `/baseball/player/today`

### Product contract

Coaches publish team/player announcements and players acknowledge them.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_announcements`, `baseball_announcement_recipients`, `baseball_announcement_acknowledgements`.

### Main workflow

1. Compose announcement
2. Select recipients
3. Capability/team checks
4. Insert announcement/recipients
5. Notify
6. Acknowledge

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_announcements`, `baseball_announcement_recipients`, `baseball_announcement_acknowledgements`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/announcements.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/announcements.ts)
- Live database object `public.baseball_announcements`
- Live database object `public.baseball_announcement_recipients`
- Live database object `public.baseball_announcement_acknowledgements`

## COMM-002 — Baseball direct and team messaging

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Coach; Player
- **Entry points:** `/baseball/dashboard/messages`, `/baseball/player/messages`

### Product contract

Conversation/participant/message UI supports direct and team chat, but duplicate permissive live policies include a tautological conversation predicate and a definer RPC trusts a caller-supplied user id.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_conversations`, `baseball_conversation_participants`, `baseball_messages`.

### Main workflow

1. Open/create conversation
2. Resolve participants
3. Insert message
4. Fetch/realtime update
5. Mark/read receipts

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_conversations`, `baseball_conversation_participants`, `baseball_messages`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/messages.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/messages.ts)
- [src/hooks/use-messages.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/hooks/use-messages.ts)
- Live database object `public.baseball_conversations`
- Live database object `public.baseball_conversation_participants`
- Live database object `public.baseball_messages`

## COMM-003 — Baseball notifications

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player
- **Entry points:** `/baseball/dashboard/notifications`, `/baseball/player/notifications`

### Product contract

In-app notification rows deep-link users to Baseball workflows and support read state.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_notifications`.

### Main workflow

1. Create side-effect notification
2. Recipient lists notifications
3. Open deep link
4. Mark read

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_notifications`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/notifications.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/notifications.ts)
- Live database object `public.baseball_notifications`

## COMM-004 — Golf announcements

- **Product area:** GolfHelm
- **Implementation status:** Partially implemented
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player recipient
- **Entry points:** `/golf/dashboard/announcements`, `/golf/dashboard/hub`

### Product contract

Enriched announcements can target recipients and link documents/tasks, but several link/recipient/notification errors are non-fatal.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_announcements`, `golf_announcement_recipients`, `golf_announcement_documents`, `golf_announcement_tasks`.

### Main workflow

1. Compose announcement
2. Insert parent row
3. Insert recipients/links
4. Create notifications
5. Player acknowledges

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_announcements`, `golf_announcement_recipients`, `golf_announcement_documents`, `golf_announcement_tasks`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/announcements.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/announcements.ts)
- [src/app/golf/actions/unified-notifications.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/unified-notifications.ts)
- Live database object `public.golf_announcements`
- Live database object `public.golf_announcement_recipients`
- Live database object `public.golf_announcement_documents`
- Live database object `public.golf_announcement_tasks`

## COMM-005 — Golf messaging and attachments

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Coach; Player
- **Entry points:** `/golf/dashboard/messages`

### Product contract

Golf messaging is live-realtime published, but the helper RPC user_conversation_ids accepts an arbitrary user id and must be tested directly.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_conversations`, `golf_conversation_participants`, `golf_messages`, `golf_message_attachments`.

### Main workflow

1. Open conversation
2. Authorize participant
3. Send message/attachment
4. Realtime update published tables
5. Update unread state

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_conversations`, `golf_conversation_participants`, `golf_messages`, `golf_message_attachments`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/messages.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/messages.ts)
- [src/app/golf/actions/message-attachments.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/message-attachments.ts)
- [src/hooks/golf/use-golf-messages.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/hooks/golf/use-golf-messages.ts)
- Live database object `public.golf_conversations`
- Live database object `public.golf_conversation_participants`
- Live database object `public.golf_messages`
- Live database object `public.golf_message_attachments`

## COMM-006 — Unified notification preferences and push

- **Product area:** Shared/GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Authenticated user
- **Entry points:** `/golf/dashboard/settings/notifications`, `/api/push-subscriptions`

### Product contract

Users configure notification channels; in-app, email, browser push, and APNs paths are present. Live APNs Edge logs showed repeated HTTP 410 responses during the observation window.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `notification_preferences`, `push_subscriptions`, `golf_player_notification_state`.

### Main workflow

1. Save preferences/subscription
2. Workflow queues channel
3. Provider attempts delivery
4. Invalid token should be deactivated/reconciled

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `notification_preferences`, `push_subscriptions`, `golf_player_notification_state`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/v3/notification-prefs.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/v3/notification-prefs.ts)
- [src/app/api/push-subscriptions/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/push-subscriptions/route.ts)
- [supabase/functions/send-apns-push/index.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/supabase/functions/send-apns-push/index.ts)
- Live database object `public.notification_preferences`
- Live database object `public.push_subscriptions`
- Live database object `public.golf_player_notification_state`

## COMM-007 — Event and task reminder jobs

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player recipient
- **Entry points:** `/api/cron/event-reminders`, `/api/cron/task-reminders`

### Product contract

Vercel cron handlers select due reminders, deliver notifications, and mark queue state; task reminder UI writes queue and display columns separately.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_calendar_notifications`, `golf_task_reminders`, `golf_tasks`.

### Main workflow

1. Arm reminder
2. Cron authenticates secret
3. Select due unsent rows
4. Deliver
5. Mark sent or retain retry state

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_calendar_notifications`, `golf_task_reminders`, `golf_tasks`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/api/cron/event-reminders/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/cron/event-reminders/route.ts)
- [src/app/api/cron/task-reminders/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/cron/task-reminders/route.ts)
- [src/app/golf/actions/task-reminders.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/task-reminders.ts)
- Live database object `public.golf_calendar_notifications`
- Live database object `public.golf_task_reminders`
- Live database object `public.golf_tasks`

## OPS-001 — Baseball documents and versioning

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Staff with manage_documents; Authorized player
- **Entry points:** `/baseball/dashboard/documents`

### Product contract

Team-scoped documents support upload, versioning, metadata, and role/capability-gated access.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_documents`, `baseball_document_versions`.

### Main workflow

1. Upload metadata/object
2. Capability/team check
3. Insert document/version
4. List/download by scoped policy

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_documents`, `baseball_document_versions`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/documents.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/documents.ts)
- Live database object `public.baseball_documents`
- Live database object `public.baseball_document_versions`

## OPS-002 — Golf documents and recruit documents

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Coach; Player/recruit where allowed
- **Entry points:** `/golf/dashboard/documents`

### Product contract

Database rows are team-scoped, but the live private documents storage bucket permits any authenticated user to select/upload/update/delete any object in the bucket.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_documents`, `golf_document_versions`, `golf_recruit_documents`, `golf_event_documents`.

### Main workflow

1. Upload object
2. Insert scoped metadata/version
3. Attach to event/recruit
4. Authorize download/delete at both row and object layers

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_documents`, `golf_document_versions`, `golf_recruit_documents`, `golf_event_documents`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/documents.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/documents.ts)
- [src/app/golf/actions/recruit-documents.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/recruit-documents.ts)
- [src/app/golf/actions/event-documents.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/event-documents.ts)
- Live database object `public.golf_documents`
- Live database object `public.golf_document_versions`
- Live database object `public.golf_recruit_documents`
- Live database object `public.golf_event_documents`

## OPS-003 — Baseball travel planning

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach/staff; Player viewer
- **Entry points:** `/baseball/dashboard/travel`

### Product contract

Coaches manage itineraries, logistics, room/flight details, and expenses.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_travel_itineraries`, `baseball_travel_expenses`.

### Main workflow

1. Create itinerary
2. Add logistics/expense
3. Validate team/capability
4. Persist
5. Render player-safe view

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_travel_itineraries`, `baseball_travel_expenses`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/travel.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/travel.ts)
- Live database object `public.baseball_travel_itineraries`
- Live database object `public.baseball_travel_expenses`

## OPS-004 — Golf travel planning

- **Product area:** GolfHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player viewer
- **Entry points:** `/golf/dashboard/travel`

### Product contract

Golf travel combines itinerary, budget, expense, lodging, transport, and gear information.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_travel_itineraries`, `golf_travel_budgets`, `golf_travel_expenses`.

### Main workflow

1. Create trip
2. Add budget/expense/logistics
3. Authorize active team
4. Persist and refresh

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_travel_itineraries`, `golf_travel_budgets`, `golf_travel_expenses`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/travel.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/travel.ts)
- [src/components/fairway/pages/travel/FairwayItineraryModal.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/fairway/pages/travel/FairwayItineraryModal.tsx)
- Live database object `public.golf_travel_itineraries`
- Live database object `public.golf_travel_budgets`
- Live database object `public.golf_travel_expenses`

## OPS-005 — Baseball video library and classes

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Scoped player
- **Entry points:** `/baseball/dashboard/video`, `/baseball/dashboard/video/classes`

### Product contract

Coaches catalog video, organize learning/class activity, and expose scoped player content.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_videos`, `baseball_video_events`.

### Main workflow

1. Add video
2. Assign/tag player/class
3. Persist metadata/event
4. Render scoped library

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_videos`, `baseball_video_events`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/videos.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/videos.ts)
- [src/app/baseball/actions/video-classes.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/video-classes.ts)
- Live database object `public.baseball_videos`
- Live database object `public.baseball_video_events`

## OPS-006 — Baseball academics and eligibility

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Coach with view_academics; Player for self
- **Entry points:** `/baseball/dashboard/academics`

### Product contract

Sensitive academic data is capability- and player-scope-gated.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_academic_eligibility`, `baseball_player_classes`, `baseball_class_conflicts`.

### Main workflow

1. Open academics
2. Validate capability/player scope
3. Read/update eligibility/classes
4. Hide from unauthorized staff

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_academic_eligibility`, `baseball_player_classes`, `baseball_class_conflicts`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/academics.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/academics.ts)
- [src/app/baseball/actions/__tests__/academics-coach-gating.test.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/__tests__/academics-coach-gating.test.ts)
- Live database object `public.baseball_academic_eligibility`
- Live database object `public.baseball_player_classes`
- Live database object `public.baseball_class_conflicts`

## OPS-007 — Baseball lineups and postgame review

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach
- **Entry points:** `/baseball/dashboard/lineups`, `/baseball/dashboard/postgame`

### Product contract

Coaches build lineups and record structured postgame review items.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_team_lineups`, `baseball_lineup_positions`, `baseball_postgame_reviews`, `baseball_postgame_review_items`.

### Main workflow

1. Create lineup/review
2. Add positions/items
3. Validate team
4. Persist and revalidate

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_team_lineups`, `baseball_lineup_positions`, `baseball_postgame_reviews`, `baseball_postgame_review_items`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/lineups.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/lineups.ts)
- [src/app/baseball/actions/postgame.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/postgame.ts)
- Live database object `public.baseball_team_lineups`
- Live database object `public.baseball_lineup_positions`
- Live database object `public.baseball_postgame_reviews`
- Live database object `public.baseball_postgame_review_items`

## OPS-008 — Baseball recruiting, discovery, watchlists, and scout packets

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Coach; Player with public passport
- **Entry points:** `/baseball/dashboard/discover`, `/baseball/dashboard/watchlist`, `/baseball/dashboard/players/[id]/scout-packet`, `/baseball/player/[id]`

### Product contract

Recruiting workflows discover players, manage interest/watchlists, render scout packets, and expose token/privacy-controlled public profiles.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_watchlists`, `baseball_recruiting_interests`, `baseball_player_passport_settings`, `baseball_player_passport_share_tokens`.

### Main workflow

1. Search scoped/public players
2. Add to watchlist or interest
3. Generate packet/share token
4. Enforce passport privacy

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_watchlists`, `baseball_recruiting_interests`, `baseball_player_passport_settings`, `baseball_player_passport_share_tokens`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/discover.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/discover.ts)
- [src/app/baseball/actions/watchlist.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/watchlist.ts)
- [src/app/baseball/actions/scout-packet.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/scout-packet.ts)
- [src/lib/baseball/public-profile-access.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/baseball/public-profile-access.ts)
- Live database object `public.baseball_watchlists`
- Live database object `public.baseball_recruiting_interests`
- Live database object `public.baseball_player_passport_settings`
- Live database object `public.baseball_player_passport_share_tokens`

## LIFT-001 — Lifting programs and prescriptions

- **Product area:** Helm Lifting
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Lifting coach
- **Entry points:** `/lifting/dashboard/programs`, `/lifting/dashboard/exercises`

### Product contract

Coaches build periodized programs and exercise prescriptions and assign them to athletes/groups.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `helm_lifting_programs`, `helm_lifting_weeks`, `helm_lifting_days`, `helm_lifting_sections`, `helm_lifting_prescriptions`, `helm_lifting_exercises`.

### Main workflow

1. Create program/weeks/days
2. Add exercises/prescriptions
3. Assign to athlete/group
4. Publish/refresh

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `helm_lifting_programs`, `helm_lifting_weeks`, `helm_lifting_days`, `helm_lifting_sections`, `helm_lifting_prescriptions`, `helm_lifting_exercises`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/lifting/actions/programs.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/programs.ts)
- [src/app/lifting/actions/assignments.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/assignments.ts)
- Live database object `public.helm_lifting_programs`
- Live database object `public.helm_lifting_weeks`
- Live database object `public.helm_lifting_days`
- Live database object `public.helm_lifting_sections`
- Live database object `public.helm_lifting_prescriptions`
- Live database object `public.helm_lifting_exercises`

## LIFT-002 — Lifting sessions, results, and PRs

- **Product area:** Helm Lifting
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Lifting coach; Athlete
- **Entry points:** `/lifting/dashboard/lift`, `/lifting/dashboard/sessions`

### Product contract

Athletes execute assigned sessions and record sets/results while coaches review progress and personal records.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `helm_lifting_sessions`, `helm_lifting_session_exercises`, `helm_lifting_set_results`, `helm_lifting_prs`, `helm_lifting_maxes`.

### Main workflow

1. Open assigned session
2. Record sets
3. Complete session
4. Derive PR/max signals
5. Coach reviews

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `helm_lifting_sessions`, `helm_lifting_session_exercises`, `helm_lifting_set_results`, `helm_lifting_prs`, `helm_lifting_maxes`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/lifting/actions/sessions.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/sessions.ts)
- [src/app/lifting/actions/player-sessions.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/player-sessions.ts)
- Live database object `public.helm_lifting_sessions`
- Live database object `public.helm_lifting_session_exercises`
- Live database object `public.helm_lifting_set_results`
- Live database object `public.helm_lifting_prs`
- Live database object `public.helm_lifting_maxes`

## LIFT-003 — Lifting readiness, soreness, bodyweight, and check-ins

- **Product area:** Helm Lifting
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Athlete; Lifting coach
- **Entry points:** `/lifting/dashboard/readiness`, `/lifting/dashboard/check-ins`

### Product contract

Athletes submit readiness/soreness/weight data; coaches schedule/check requests and review trends.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `helm_lifting_readiness_checkins`, `helm_lifting_soreness_maps`, `helm_lifting_bodyweight_entries`, `helm_lifting_soreness_check_requests`, `helm_lifting_weight_checkin_requests`.

### Main workflow

1. Coach schedules request
2. Athlete submits own check-in
3. RLS scopes organization/athlete
4. Dashboard updates

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `helm_lifting_readiness_checkins`, `helm_lifting_soreness_maps`, `helm_lifting_bodyweight_entries`, `helm_lifting_soreness_check_requests`, `helm_lifting_weight_checkin_requests`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/lifting/actions/readiness.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/readiness.ts)
- [src/app/lifting/actions/soreness.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/soreness.ts)
- [src/app/lifting/actions/weight-checkins.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/weight-checkins.ts)
- Live database object `public.helm_lifting_readiness_checkins`
- Live database object `public.helm_lifting_soreness_maps`
- Live database object `public.helm_lifting_bodyweight_entries`
- Live database object `public.helm_lifting_soreness_check_requests`
- Live database object `public.helm_lifting_weight_checkin_requests`

## LIFT-004 — Lifting nutrition plans

- **Product area:** Helm Lifting
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P2
- **Primary/secondary roles:** Lifting coach; Assigned athlete
- **Entry points:** `/lifting/dashboard/settings`

### Product contract

Coaches create and assign nutrition plans; private storage supports related files.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `helm_lifting_nutrition_plans`, `helm_lifting_nutrition_plan_assignments`.

### Main workflow

1. Create plan
2. Assign athlete
3. Persist scoped row/object
4. Athlete views

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `helm_lifting_nutrition_plans`, `helm_lifting_nutrition_plan_assignments`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/lifting/actions/nutrition.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/lifting/actions/nutrition.ts)
- Live database object `public.helm_lifting_nutrition_plans`
- Live database object `public.helm_lifting_nutrition_plan_assignments`

## LIFT-005 — Live weight room

- **Product area:** Helm Lifting
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Lifting coach; Athlete
- **Entry points:** `/lifting/dashboard/sessions/live`

### Product contract

Realtime set/session subscriptions support a shared live weight-room surface.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `helm_lifting_sessions`, `helm_lifting_set_results`.

### Main workflow

1. Start live room
2. Athletes record results
3. Realtime events update coach board
4. Reconnect refetches

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `helm_lifting_sessions`, `helm_lifting_set_results`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/components/lifting/sessions/LiveWeightRoomClient.tsx](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/components/lifting/sessions/LiveWeightRoomClient.tsx)
- Live database object `public.helm_lifting_sessions`
- Live database object `public.helm_lifting_set_results`

## COACHHELM-001 — CoachHelm evidence-backed chat

- **Product area:** CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Golf team coach
- **Entry points:** `/golf/dashboard/coachhelm`, `/api/coachhelm/v3/chat/stream`

### Product contract

Streaming chat uses a server-resolved active team and 13 closed, read-only domain tools; numeric claims are audited against tool evidence.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_coachhelm_chat_conversations`, `golf_coachhelm_chat_messages`, `golf_coachhelm_llm_calls`, `golf_coachhelm_llm_budget`.

### Main workflow

1. Authenticate coach
2. Resolve active team/roster
3. Load/persist conversation
4. Model calls bounded tools
5. Audit claims
6. Stream and persist final message

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_coachhelm_chat_conversations`, `golf_coachhelm_chat_messages`, `golf_coachhelm_llm_calls`, `golf_coachhelm_llm_budget`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/api/coachhelm/v3/chat/stream/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/coachhelm/v3/chat/stream/route.ts)
- [src/lib/coachhelm/v3/chat/instructions.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/chat/instructions.ts)
- [src/lib/coachhelm/v3/chat/read-tools.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/chat/read-tools.ts)
- Live database object `public.golf_coachhelm_chat_conversations`
- Live database object `public.golf_coachhelm_chat_messages`
- Live database object `public.golf_coachhelm_llm_calls`
- Live database object `public.golf_coachhelm_llm_budget`

## COACHHELM-002 — CoachHelm confirmed write actions

- **Product area:** CoachHelm
- **Implementation status:** Partially implemented
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Golf team coach
- **Entry points:** `CoachHelm chat approvals`

### Product contract

Four narrow tools propose focus area, task, announcement, or recurring practice writes; SDK approval and idempotent ledger claims gate execution. Denials are not wired to the denial recorder, and pending approval state is not restorable after reload.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_coachhelm_action_runs`, `golf_player_focus_areas`, `golf_tasks`, `golf_announcements`, `golf_events`.

### Main workflow

1. Model proposes typed action
2. Server records proposed run
3. UI displays preview
4. Coach approves
5. Server atomically claims run
6. Existing action executes
7. Receipt/deep link persists

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_coachhelm_action_runs`, `golf_player_focus_areas`, `golf_tasks`, `golf_announcements`, `golf_events`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/coachhelm/v3/chat/agent-tools.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/chat/agent-tools.ts)
- [src/lib/coachhelm/v3/chat/action-runs.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/chat/action-runs.ts)
- [src/test/coachhelm/v3/chat-approval-delivery.test.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/test/coachhelm/v3/chat-approval-delivery.test.ts)
- Live database object `public.golf_coachhelm_action_runs`
- Live database object `public.golf_player_focus_areas`
- Live database object `public.golf_tasks`
- Live database object `public.golf_announcements`
- Live database object `public.golf_events`

## COACHHELM-003 — CoachHelm insight engine and lifecycle

- **Product area:** CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Golf coach; Player for visible insights
- **Entry points:** `/golf/dashboard/intelligence`, `/golf/dashboard/coachhelm/player`

### Product contract

V3 deterministic insight generation and lifecycle states are active; V2 records remain stored but hidden, and several legacy effectiveness/alert components have no live navigation.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_coach_insights`, `golf_insight_generation_log`, `golf_insight_exposure`, `golf_insight_effectiveness`.

### Main workflow

1. Ingest completed rounds
2. Generate evidence/rules
3. Write lifecycle state
4. Apply app visibility helper
5. Expose to coach/player
6. Record exposure/feedback

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_coach_insights`, `golf_insight_generation_log`, `golf_insight_exposure`, `golf_insight_effectiveness`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/coachhelm/v3/engine](https://github.com/njrini99-code/helmv3/tree/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/engine)
- [src/app/golf/actions/insight-management.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/insight-management.ts)
- [memory/context/coachhelm-ai.md](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/memory/context/coachhelm-ai.md)
- Live database object `public.golf_coach_insights`
- Live database object `public.golf_insight_generation_log`
- Live database object `public.golf_insight_exposure`
- Live database object `public.golf_insight_effectiveness`

## COACHHELM-004 — Post-round analysis and safety net

- **Product area:** CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Golf player; Coach
- **Entry points:** `Round submission`, `Inngest`, `/api/cron/coachhelm-safety-net`

### Product contract

Round submission routes durable analysis through Inngest when configured and falls back to a post-response direct call; a cron recovers terminally unanalysed rounds.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_rounds`, `golf_coach_insights`, `golf_round_reviews`.

### Main workflow

1. Submit round
2. Refresh stats cache
3. Send Inngest event or direct trigger
4. Persist analyzed/failed marker
5. Safety-net retries missing terminal state

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_rounds`, `golf_coach_insights`, `golf_round_reviews`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/coachhelm/v2/post-round-trigger.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v2/post-round-trigger.ts)
- [src/app/api/inngest/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/inngest/route.ts)
- [src/app/api/cron/coachhelm-safety-net/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/cron/coachhelm-safety-net/route.ts)
- Live database object `public.golf_rounds`
- Live database object `public.golf_coach_insights`
- Live database object `public.golf_round_reviews`

## COACHHELM-005 — Coach command center and intelligence triage

- **Product area:** GolfHelm/CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Golf coach
- **Entry points:** `/golf/dashboard`, `/golf/dashboard/intelligence`

### Product contract

Coach dashboards rank team signals, standing, tasks, events, and player development priorities.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_coach_insights`, `golf_player_standing`, `golf_player_genome`, `golf_tasks`, `golf_events`.

### Main workflow

1. Resolve active team
2. Load bounded roster-wide evidence
3. Rank triage items
4. Render drill-down/deep links

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_coach_insights`, `golf_player_standing`, `golf_player_genome`, `golf_tasks`, `golf_events`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/intelligence-dashboard.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/intelligence-dashboard.ts)
- [src/app/golf/actions/dashboard-data.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/dashboard-data.ts)
- Live database object `public.golf_coach_insights`
- Live database object `public.golf_player_standing`
- Live database object `public.golf_player_genome`
- Live database object `public.golf_tasks`
- Live database object `public.golf_events`

## COACHHELM-006 — CoachHelm qualifying board

- **Product area:** CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Golf coach
- **Entry points:** `/golf/dashboard/coachhelm/qualifying`

### Product contract

A CoachHelm surface summarizes qualifying status and selection evidence from deterministic qualifier data.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_selections`.

### Main workflow

1. Select qualifier
2. Load entries/rounds
3. Compute ranking/standing
4. Render evidence

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_selections`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/v3/qualifying.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/v3/qualifying.ts)
- [src/lib/coachhelm/v3/qualifying](https://github.com/njrini99-code/helmv3/tree/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/qualifying)
- Live database object `public.golf_qualifiers`
- Live database object `public.golf_qualifier_entries`
- Live database object `public.golf_qualifier_selections`

## COACHHELM-007 — CoachHelm deterministic charts and visuals

- **Product area:** CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Golf coach
- **Entry points:** `Chat responses`

### Product contract

Tool output, not free-form prose, supplies chartable data and evidence cards in chat.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_rounds`, `golf_player_stats_cache`.

### Main workflow

1. Tool returns typed series
2. UI renders chart/card
3. Labels and values match response data
4. No model-invented values

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_rounds`, `golf_player_stats_cache`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/coachhelm/v3/chat/read-tools.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/chat/read-tools.ts)
- [src/components/golf/coachhelm](https://github.com/njrini99-code/helmv3/tree/887218526e4ee98f013a30378105fe012af88307/src/components/golf/coachhelm)
- Live database object `public.golf_rounds`
- Live database object `public.golf_player_stats_cache`

## COACHHELM-008 — CoachHelm history, metering, and audit

- **Product area:** CoachHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Golf coach; Platform admin
- **Entry points:** `/api/coachhelm/v3/chat/conversations`

### Product contract

Conversation, message, model-call, action-run, and budget records support history and audit; spend recording fails open if metering writes fail.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_coachhelm_chat_conversations`, `golf_coachhelm_chat_messages`, `golf_coachhelm_action_runs`, `golf_coachhelm_llm_calls`, `golf_coachhelm_llm_budget`.

### Main workflow

1. List/open owned conversation
2. Persist client turn id and UI parts
3. Record LLM call/spend
4. Record action proposal/result

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_coachhelm_chat_conversations`, `golf_coachhelm_chat_messages`, `golf_coachhelm_action_runs`, `golf_coachhelm_llm_calls`, `golf_coachhelm_llm_budget`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/api/coachhelm/v3/chat/conversations/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/coachhelm/v3/chat/conversations/route.ts)
- [src/lib/coachhelm/v3/chat/action-runs.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/chat/action-runs.ts)
- Live database object `public.golf_coachhelm_chat_conversations`
- Live database object `public.golf_coachhelm_chat_messages`
- Live database object `public.golf_coachhelm_action_runs`
- Live database object `public.golf_coachhelm_llm_calls`
- Live database object `public.golf_coachhelm_llm_budget`

## ADMIN-001 — Platform super-admin console

- **Product area:** Platform/Admin
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Platform super-admin
- **Entry points:** `/admin`

### Product contract

A separate allowlist/user-id gate controls cross-product users, teams, activity, health, errors, jobs, work, and view-as pages.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `admin_events`, `admin_feature_registry`, `error_logs`, `users`.

### Main workflow

1. Authenticate
2. requireSuperAdmin checks the user id against SUPER_ADMIN_USER_IDS
3. Load admin client data
4. Render cross-tenant operations

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `admin_events`, `admin_feature_registry`, `error_logs`, `users`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/admin/require-super-admin.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/admin/require-super-admin.ts)
- [src/app/admin/_components/admin-nav.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/admin/_components/admin-nav.ts)
- Live database object `public.admin_events`
- Live database object `public.admin_feature_registry`
- Live database object `public.error_logs`
- Live database object `public.users`

## ADMIN-002 — Golf CRM and email operations

- **Product area:** Platform/Admin
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P0
- **Primary/secondary roles:** Global users.role=admin
- **Entry points:** `/golf/admin/crm`, `/api/admin/crm/send-email`

### Product contract

Internal CRM supports pipeline, templates, sequences, Gmail/Resend send and reply ingestion, engagement, demo booking, and unsubscribe.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `crm_coaches`, `crm_contact_log`, `emails`, `email_events`, `email_sequences`.

### Main workflow

1. Admin selects contact/template
2. Authorize admin
3. Queue/send provider request
4. Persist email/event/timeline
5. Webhook/reply updates status

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `crm_coaches`, `crm_contact_log`, `emails`, `email_events`, `email_sequences`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/golf/actions/crm-foundations.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/crm-foundations.ts)
- [src/app/golf/actions/crm-gmail-send.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/crm-gmail-send.ts)
- [src/app/api/webhooks/resend/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/webhooks/resend/route.ts)
- Live database object `public.crm_coaches`
- Live database object `public.crm_contact_log`
- Live database object `public.emails`
- Live database object `public.email_events`
- Live database object `public.email_sequences`

## ADMIN-003 — Operational health, errors, jobs, and telemetry

- **Product area:** Platform/Admin
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Platform super-admin
- **Entry points:** `/admin/health`, `/admin/errors`, `/admin/jobs`, `/api/health`

### Product contract

Admin observability aggregates feature health, errors, jobs, utilization, and activity alongside Sentry/Datadog.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `admin_events`, `error_logs`, `admin_jobs`, `admin_feature_registry`.

### Main workflow

1. Collect observed action/error/job event
2. Persist sanitized telemetry
3. Admin queries rollup
4. Open entity/error drill-down

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `admin_events`, `error_logs`, `admin_jobs`, `admin_feature_registry`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/admin/data](https://github.com/njrini99-code/helmv3/tree/887218526e4ee98f013a30378105fe012af88307/src/lib/admin/data)
- [src/app/api/health/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/health/route.ts)
- [src/app/api/internal/log-server-error/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/internal/log-server-error/route.ts)
- Live database object `public.admin_events`
- Live database object `public.error_logs`
- Live database object `public.admin_jobs`
- Live database object `public.admin_feature_registry`

## ADMIN-004 — Demo access and tracking

- **Product area:** Shared
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Visitor; Demo user; Admin
- **Entry points:** `/baseball/demo`, `/golf/demo`

### Product contract

Time-limited demo sessions provide read-only product access and capture aggregate acquisition/session metadata.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_demo_sessions`, `golf_demo_sessions`, `demo_requests`.

### Main workflow

1. Request demo
2. Create/validate demo session
3. Apply read-only guard
4. Expire and redirect

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_demo_sessions`, `golf_demo_sessions`, `demo_requests`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/demo-access.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/demo-access.ts)
- [src/app/golf/actions/demo-access.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/golf/actions/demo-access.ts)
- [src/lib/auth/session-activity.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/auth/session-activity.ts)
- Live database object `public.baseball_demo_sessions`
- Live database object `public.golf_demo_sessions`
- Live database object `public.demo_requests`

## BILLING-001 — One-off admin invoice billing

- **Product area:** Platform/Admin
- **Implementation status:** Partially implemented
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Platform super-admin
- **Entry points:** `/admin/billing`, `/api/webhooks/stripe`

### Product contract

An admin-only Stripe invoice action and signed webhook shell exist, but webhook handlers are TODO and the billing tables migration is absent from the live project. No self-service subscriptions, trials, upgrades, referrals, or access enforcement were found.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: none in the current live schema or provider-stub state.

### Main workflow

1. Admin creates test-mode invoice
2. Stripe request
3. Expected webhook persistence is not implemented

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** No live persistence object confirmed.
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/admin/actions/billing.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/admin/actions/billing.ts)
- [src/app/api/webhooks/stripe/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/webhooks/stripe/route.ts)
- [supabase/migrations/20260715120000_billing_invoices_stripe.sql](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/supabase/migrations/20260715120000_billing_invoices_stripe.sql)


## INTEGRATION-001 — Arccos round ingestion

- **Product area:** GolfHelm/CoachHelm
- **Implementation status:** Backend-only/dormant
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Golf player/coach through future setup
- **Entry points:** `V3 ingest cron/backend`

### Product contract

An Arccos OAuth/fetch/atomic ingest provider exists, but no user-facing connection flow and no live connection rows were found; Garmin and TrackMan providers are explicit stubs.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `golf_ingest_connections`, `golf_ingest_sync_log`, `golf_rounds`.

### Main workflow

1. Create provider connection (missing UI)
2. Cron fetches rounds
3. Deduplicate/map
4. Atomic insert and sync log

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `golf_ingest_connections`, `golf_ingest_sync_log`, `golf_rounds`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/coachhelm/v3/ingest/providers/arccos.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/coachhelm/v3/ingest/providers/arccos.ts)
- [src/app/api/cron/v3/ingest-sync/route.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/api/cron/v3/ingest-sync/route.ts)
- Live database object `public.golf_ingest_connections`
- Live database object `public.golf_ingest_sync_log`
- Live database object `public.golf_rounds`

## INTEGRATION-002 — Baseball GameChanger, Presto, and Sidearm imports

- **Product area:** BaseballHelm
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** Staff with import/stat capability
- **Entry points:** `/baseball/dashboard/import`

### Product contract

These names identify supported file/parser formats and mappings; no live OAuth/API synchronization was found.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `baseball_import_runs`, `baseball_import_sources`, `baseball_integration_configs`.

### Main workflow

1. Upload export file
2. Detect adapter
3. Map/validate roster and events
4. Review
5. Commit

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `baseball_import_runs`, `baseball_import_sources`, `baseball_integration_configs`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/app/baseball/actions/imports.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/imports.ts)
- [src/app/baseball/actions/stat-event-imports.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/app/baseball/actions/stat-event-imports.ts)
- Live database object `public.baseball_import_runs`
- Live database object `public.baseball_import_sources`
- Live database object `public.baseball_integration_configs`

## INTEGRATION-003 — Email, push, monitoring, analytics, and background providers

- **Product area:** Shared
- **Implementation status:** Confirmed active
- **Confidence:** Confirmed
- **Scan priority:** P1
- **Primary/secondary roles:** System
- **Entry points:** `Server actions`, `API routes`, `cron/Inngest`

### Product contract

Resend/Gmail, web push/APNs, Sentry, Datadog, PostHog, Inngest, Upstash, and Vercel jobs support side effects and observability.

### Preconditions

- The viewer has the authentication state implied by the role above.
- Team/player/organization context is resolved server-side before any consequential write.
- Product-specific capability, membership, subscription, integration, and environment requirements must be enforced where the evidence names them.
- Required fixture rows: `emails`, `email_events`, `push_subscriptions`, `admin_events`.

### Main workflow

1. Domain action commits primary data
2. Queue/provider call runs
3. Persist delivery/telemetry where implemented
4. Retry/log failure

### Alternate and interruption workflows

- Edit/cancel/delete/duplicate/reschedule/reassign/retry paths must use an explicit action where the feature exposes one; absence of such an action is not treated as support.
- Reload and a second browser context must re-read committed state rather than trust a toast or optimistic state.
- Double submission and network retry must not create duplicate primary or secondary rows.
- A team switch during the workflow must either complete against the originally authorized team or fail; it must never silently retarget.
- Mobile/back-navigation behavior is only Confirmed where route/component evidence explicitly supplies it; otherwise it is a required runtime characterization.

### Business rules

- All user-supplied record identifiers require server-side membership/ownership validation.
- RLS is a backstop, not a substitute for role/capability checks in service-role or SECURITY DEFINER paths.
- Primary writes and secondary notifications must be reported separately when they can fail independently.

### Data effects and observable success

- **Tables read/written:** `emails`, `email_events`, `push_subscriptions`, `admin_events`
- **Expected UI:** the control enters a pending/disabled state, success is shown only after the primary write is confirmed, the modal/sheet closes or redirects as designed, and refreshed data matches the database.
- **Expected database:** correct team/organization/player/creator/status links; no duplicate or cross-tenant rows; dependent rows either complete or are honestly reported as partial.
- **Cache/synchronization:** route or tag revalidation/router refresh/realtime must converge. The automated scan should always reload after writes.

### Failure cases to automate

- Validation: missing, malformed, duplicate, overlong, invalid date/status/file values.
- Authorization: wrong role/team/org/player, removed membership, expired invite, direct route/API/RPC, hidden-control bypass.
- Reliability: database denial, offline/timeout, provider failure, duplicate click/retry, partial child write, stale record, team change mid-flight.
- Presentation: small/large iPhone, tablet, desktop, keyboard/focus/error announcement, meaningful visual state.

### Evidence

- [src/lib/notifications/email.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/notifications/email.ts)
- [src/lib/notifications/push.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/lib/notifications/push.ts)
- [src/instrumentation.ts](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/src/instrumentation.ts)
- [vercel.json](https://github.com/njrini99-code/helmv3/blob/887218526e4ee98f013a30378105fe012af88307/vercel.json)
- Live database object `public.emails`
- Live database object `public.email_events`
- Live database object `public.push_subscriptions`
- Live database object `public.admin_events`

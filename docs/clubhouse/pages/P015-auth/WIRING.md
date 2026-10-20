# P015 — Auth: wiring map

<!-- clubhouse:release-audit:start -->
## Current ownership audit — 2026-10-06

Root: `src/clubhouse/screens/auth`. The AST inventory found 16 source files, 0
overlay/control sites and 11 motion nodes. Sign-in course scene, welcome,
onboarding and dashboard handoff.

Exact call sites, direct package imports, responsive styles and mapped tests
are in the [all-page audit](../../ALL_PAGE_AUDIT.md#p015-auth). Shared
Modal/Menu/PhoneScreen owners and shell behavior are audited once there;
counts include wrappers rather than unique popups.
<!-- clubhouse:release-audit:end -->

## Entry point

```text
Routes:                  /golf/login, /golf/welcome
Pages:                   src/app/golf/(auth)/login/page.tsx and welcome/page.tsx (today's pages, untouched)
Flag choice:             src/app/golf/(auth)/login/layout.tsx and welcome/layout.tsx:
                         isClubhouseFrontDoor() (golf_clubhouse_front_door) ? Clubhouse route : children.
                         The layout chooses which page is drawn and gates nothing else.
Clubhouse route adapter: src/clubhouse/routes/auth.tsx
                         ClubhouseSignInRoute() -> <SignIn/> (the form is in the server HTML; the URL is read in the
                         browser, so nothing waits on Suspense)
                         ClubhouseWelcomeRoute() -> <WelcomeStage><Suspense><WelcomeLoader/></Suspense></WelcomeStage>
                         (a session the auth server has ruled invalid -> redirect('/golf/login'), CH-15903)
Server loader:           src/clubhouse/data/welcome.ts loadWelcome (each read that fails logs through
                         chLogServer('auth', 'welcome.<read>', …), CH-15908), with welcome-shape.ts
Screens:                 src/clubhouse/screens/auth/ SignIn, SignInForm, AuthNotice, AuthFrame, Welcome, WelcomeStage,
                         SceneMount, GolfScene, SceneLayers
Skeletons:               none. The form is in the server HTML and the welcome's frame and course draw at once (CH-15401)
Preview:                 /clubhouse-preview/auth (?screen=signin|welcome, &state=, &fail=, &hour=)
```

## End-to-end graph

```text
Sign in
UI (SignInForm: Email, Password, the eye, Forgot password, Sign in)
↓
Action: handleSubmit: empty -> CH-15101 (nothing sent); otherwise loginAction(email, password, ref)
        (a stale bundle reloads once per tab first, CH-15906)
↓
Server action: src/app/golf/actions/auth.ts loginAction (rate limit, Supabase Auth, the idle marker reset in the
               response that sets the cookies, recordLoginOutcome on every branch); this page did not change it
↓
Data: users, golf_coaches, golf_players, golf_team_coach_staff (the destination)
↓
Destination: resolveSignInHref in src/lib/auth/golf-sign-in-logic.ts, shared with the current form
  safe returnTo for someone onboarded -> /golf/welcome?next=<returnTo>
  no profile yet -> onboarding, an invite keeping its joinCode; an unsafe returnTo is dropped
  otherwise the server's redirectTo through the welcome
↓
Hand-off: AuthFrame data-phase "opening" (720ms), then router.push(href)

Welcome
WelcomeStage (frame and course, at once) -> WelcomeLoader -> loadWelcome
↓
Data: auth session (getUserResilient), golf_coaches.full_name, golf_players.first_name, users.role and users.last_seen,
      notifications and golf_calendar_notifications (through getUnifiedNotifications, limit 20)
↓
Shaping: welcome-shape.ts resolveWelcomeName, pickWelcomeItems (newest three unread), shapeWelcomeNews,
         welcomeDestination(next, isAdmin), formatLastHere
↓
UI (Welcome): live region, greeting, card (items, or one of three empty states, or "Updates didn't load"), Continue
↓
Continue (or Return): haptic, fold or fade, router.push(welcomeDestination) after HANDOFF_MS

Contract outcomes: CONTRACT.md (Bridge IDs 15ccii, catalog CH-15xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/auth.test.tsx, auth-logic.test.ts, auth-server.test.tsx, auth-scene.test.tsx;
       src/components/auth/golf-sign-in-form.test.tsx (the current form, unchanged, 7 cases)
```

## Actions

Each action's record is in `config/clubhouse/pages/P015-auth.json` (`actions`), and the whole list is readable in
`docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. None of the three is optimistic: a sign-in waits for the server.
Sign-in telemetry is the server's (`recordLoginOutcome`), so this page records no analytics of its own.

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P015-SIGN-IN | Sign in | `handleSubmit` | `loginAction` in `src/app/golf/actions/auth.ts` | users, golf_coaches, golf_players, golf_team_coach_staff | empty 150501 · in flight 150301 · credentials 150601 · unverified 150602 · rate limit 150603 · stale bundle 150604 · unexpected 150605 · server's words 150606 · network 150701 · where it goes 150801 · invite and ref kept 151201 · reload once 151401 · read out 151802 · tap 151701 · lands 151702 |
| ACT-P015-WELCOME | (opening /golf/welcome) | `loadWelcome` | `src/clubhouse/data/welcome.ts#loadWelcome` | users, golf_coaches, golf_players, notifications, golf_calendar_notifications | loading 150201 · caught up 150401 · first visit 150402 · no name 150403 · notifications failed 150607 · invalid session 150802 · announced 151803 · logged 152301 |
| ACT-P015-CONTINUE | Continue | `proceed` | `welcomeDestination` in `welcome-shape.ts` | none | hand-off 151604 · reduced motion 151605 · tap 151705 · Return 152001 |

## Flag

```text
Flag:        golf_clubhouse_front_door (config/feature-flags.yml, generated to src/lib/flags/registry.generated.ts)
Kind:        release
Production:  false (off until the owner says so)    Preview: true    Development: true
Read by:     isClubhouseFrontDoor() in src/clubhouse/gate.ts, from the two layouts only
Rollback:    turn the flag off: today's pages render again, with no data to undo (no migration)
```

## Shared code with the current pages

`src/lib/auth/golf-sign-in-logic.ts` (messages, notices, stale-bundle guard, `extractJoinCode`, `needsOnboardingFor`,
`resolveSignInHref`) is imported by both `src/components/auth/golf-sign-in-form.tsx` and `SignInForm`. A change to a
message or the destination rule reaches both, and `auth-logic.test.ts` holds the rule.


## Sign up and onboarding (phase 2)

```text
Routes:                  /golf/signup (intro, code, name, class year, account; request access)
                         /golf/player (after the account: your game, photo, done)
Flag choice:             src/app/golf/(auth)/signup/layout.tsx and (onboarding)/player/layout.tsx:
                         isClubhouseFrontDoor() ? Clubhouse route : children (today's pages untouched)
Clubhouse route adapter: src/clubhouse/routes/onboard.tsx
                         ClubhouseSignupRoute() -> <Onboard start="intro"/>
                         ClubhousePlayerOnboardRoute() -> loadPlayerOnboard(): signed out -> /golf/login; a coach or an
                         onboarded player -> /golf/dashboard; else <Onboard start="game" seed=…/>
Server calls (writes.ts, today's actions, unchanged):
                         Code        validateAccessCode(code)       roster -> player path; staff -> assistant path;
                                                                     anything else (the global code included) -> no match
                         Account     signupAction(email, pw, 'player' | 'coach', first, last)
                                                                     the team comes from the gate cookie, never the form;
                                                                     staff access only when the server says /golf/dashboard
                         Photo       Storage avatars/<uid>/avatar-<ts>.<ext> (JPEG, PNG, GIF, WebP, 2 MB)
                         Finish      completePlayerOnboarding({first, last, gradYear, handicap, hometown, state, avatarUrl},
                                                               joinCode from ?joinCode=) -> joinedTeam drives Done
                         Request     submitDemoRequest(email, {name, school, message, source:'signup', interestType})
Draft:                   sessionStorage ch.onboard.v1 (never the password), carried across the one route change,
                         cleared when the member card is issued
Hand-off:                src/clubhouse/lib/handoff.ts: the fold's last frame is held over the route change and lifted
                         by ClubhouseFrame when the dashboard has mounted (also used by the welcome)
Preview:                 /clubhouse-preview/onboard (every server call faked; there is one database, production)
```

## The front door's other ways in (2026-10-19)

```text
Routes:     /golf/reset-password, /golf/join, /golf/join/[code], /golf/staff/join/[token], /golf/coach, /golf/coach/pending, /golf/demo
Manifest:   config/clubhouse/pages/P015-auth.json lists /golf/reset-password, /golf/coach, /golf/coach/pending and /golf/demo; /golf/join,
            /golf/join/[code] and /golf/staff/join/[token] are not listed because the manifest check only resolves routes under
            the (auth) and (onboarding) groups, and these three sit directly under src/app/golf.
Flag:       isClubhouseFrontDoor() (golf_clubhouse_front_door), off in production. It chooses what is drawn and nothing else.
Switches:   a route with nothing under it replaces `children` in its layout:
              (auth)/reset-password/layout.tsx -> ClubhouseResetPasswordRoute
              (auth)/demo/layout.tsx           -> ClubhouseDemoRoute
            a client page with routes under it gets the flag from its layout (FrontDoorProvider, routes/front-door.tsx)
            and draws its own screen: join/layout.tsx + join/page.tsx (JoinCode); (onboarding)/coach/layout.tsx +
            coach/page.tsx (CoachOnboard). The layout cannot replace `children` there: /golf/join/[code] and
            /golf/coach/pending are children of those segments.
            an async page keeps every read, redirect and fail-closed throw and swaps only what it returns:
              join/[code]/page.tsx -> ClubhouseJoinTeamRoute / ClubhouseJoinInvalidRoute
              staff/join/[token]/page.tsx -> ClubhouseStaffInviteRoute
              (onboarding)/coach/pending/page.tsx -> ClubhouseCoachPendingRoute
            their loading.tsx files draw GateLoading in the sign-in room when the flag is on.
Routes:     src/clubhouse/routes/auth.tsx (the adapters), routes/front-door.tsx (the flag for client pages)
Screens:    screens/auth/ GateFrame (the sign-in room for these screens), ResetPassword, JoinCode (CodeField), JoinTeam
            (JoinInvalid), StaffInvite, CoachPending, DemoEntry, GateLoading; screens/onboard/ CoachSteps (CProgram,
            CProfile, CDone), CoachOnboard, coach-guard, steps-map
Preview:    /clubhouse-preview/auth ?screen=reset|join|joinconfirm|staff|pending|demo (&state=, &sim=, &fail=, &previous=1),
            /clubhouse-preview/onboard ?step=cprogram|cprofile|cdone (&who=filled|nocode, &sim=)
```

```text
Reset password
UI (ResetPassword): checking -> form | expired -> sent; form -> saved
Calls (reset-writes.ts, today's page's): supabase.auth.verifyOtp({ type: 'recovery', token_hash }) once, even when someone
  is signed in; auth.updateUser({ password }); auth.signOut({ scope: 'others' }); requestPasswordResetAction(email)
Rules: reset-state.ts (describeResetFailure is today's reset-errors.ts; auth-reset.test holds them together)
Destination: Continue -> /golf/dashboard

Join a team
/golf/join: JoinCode -> router.push(/golf/join/<code>)             (today's page does the same)
/golf/join/[code] (page, unchanged reads): no user -> /golf/signup?returnTo=; coach -> resolveGolfCoachEntry path; RPC
  golf_team_by_join_code; no player or not onboarded -> /golf/player?joinCode=; no team -> JoinInvalid; else JoinTeam
JoinTeam: processGolfTeamInvitation(code, playerId) -> success | alreadyMember -> /golf/dashboard; "Not you?" -> chEndSession
  then /golf/login?returnTo=/golf/join/<code>

Staff invitation
page: previewStaffInvite(token) -> StaffInvite
StaffInvite: browser session (signed in: redeemStaffInvite(token)); signed out: signupWithStaffInviteAction(token, email,
  password, name) then redeemStaffInvite(token, name) -> router.refresh(), /golf/dashboard

New coach
CoachOnboard -> coach-guard (today's checks: getUser with five tries, getGolfCoachEntry, golf_coaches and golf_players rows)
  -> Onboard start=cprogram -> CProgram -> CProfile -> completeCoachOnboarding(...) -> CDone (code) -> /golf/dashboard/roster | /golf/dashboard
  draft: sessionStorage ch.onboard.coach.v1 (never sign up's ch.onboard.v1)

Waiting for approval
page (unchanged reads: auth, golf_coaches, golf_team_coach_staff -> redirect when approved, organizations) -> CoachPending
CoachPending: router.refresh() (the page's read again) on Check again, once a minute, and when the tab returns; chSignOut

Demo
DemoEntry: probeSignedIn(browser client) -> enterDemo({ name, email, school, destination? }) (redirects on success)
  ?ref= fills the email, ?destination=coachhelm lands on CoachHelm, ?message=demo_session_expired explains itself
```

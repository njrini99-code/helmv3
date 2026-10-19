# P015 — Auth: verification

<!-- clubhouse:release-audit:start -->
## Current release evidence — 2026-10-06

Sign-in course scene, welcome, onboarding and dashboard handoff.

Check shortest phone heights, credential zoom/autocomplete, reduced-motion
camera and no blank handoff frames.

Fresh WebKit 26.6: `/clubhouse-preview/auth` at
375, 430 and 1280px; zero Axe A/AA violations and no horizontal document
overflow in these three fixture renders. The 430px full-page screenshot
was inspected and recorded below. This does not exercise every popup.
Clubhouse runtime suites: 117 files / 3,092 tests pass on this branch.
External action suites listed in WIRING are outside that count.

Additional WebKit base check: 320px also fits without horizontal overflow
and reports zero Axe violations. All 12 onboarding steps also pass
at 375/430px (667px height); credentials and writes were not submitted.

Current browser/test results: [all-page
audit](../../ALL_PAGE_AUDIT.md#p015-auth). Current status remains partial.
Physical Safari/iPhone, VoiceOver and durable authenticated writes remain
separate acceptance checks. Earlier verification status and gap sections below
are historical observations; use the current audit for release scope.
<!-- clubhouse:release-audit:end -->

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate
checklist is `docs/clubhouse/screens/auth.md`.

## Historical verification status

```text
Status:     partial
Commit/PR:  codex/clubhouse-design-fidelity (repair pass)
Date:       2026-10-01
```

October 1 WebKit repair checks: Sign in fits 375x568, 390x664 and 430x900
without document overflow; the responsive sheet leaves the submit button
visible. JavaScript-disabled rendering shows the actual course and form. The
preview Sign in flow opens onto the hole, shows the landing ball during the
welcome, then reaches player Home. Reduced-motion emulation produces a resting
camera without overflow. These are preview checks, not a real-account
authentication test.

## Automated tests

| Test | Result |
| --- | --- |
| `auth.test.tsx`, `auth-logic.test.ts`, `auth-server.test.tsx`, `auth-scene.test.tsx` (sign in and the welcome) | pass |
| `auth-reset.test.tsx` (2026-10-19: the new-password page: the link verified once, the rules and refusals, CH-15030 to CH-15133, CH-15430, CH-15431, CH-15930 to CH-15932; `describeResetFailure` and the Supabase calls held to today's page) | pass (14) |
| `auth-join.test.tsx` (2026-10-19: the code field's typing, paste, Backspace and growth; `/golf/join`, the confirm, already-a-member, another team, the wrong account and an invalid code, CH-15032, CH-15033, CH-15140, CH-15141, CH-15432, CH-15436, CH-15933 to CH-15939) | pass (15) |
| `auth-staff.test.tsx` (2026-10-19: an invalid invitation, accept, create, the wrong account, an account made without its staff row; CH-15034, CH-15142, CH-15433, CH-15940 to CH-15946) | pass (11) |
| `auth-demo-pending.test.tsx` (2026-10-19: the demo's checks, ref, destination and refusals, and waiting for approval: Check again, the minute's look, sign out; CH-15036, CH-15143, CH-15435, CH-15960 to CH-15972) | pass (13) |
| `onboard-coach.test.tsx` (2026-10-19: the coach path, its draft key, the program's questions, the action's fields, the code, the guard; CH-15035, CH-15143, CH-15950 to CH-15953) | pass (18) |
| `front-door-routes.test.tsx` (2026-10-19: the layouts and pages that choose Fairway or Clubhouse; flag off is today's page, flag on is Clubhouse's, and a client page's children are never replaced) | pass (7) |
| `auth-credentials.test.ts` (Q-98: the server's wrong-password text reads as the design's, attempts kept) | pass |
| `auth-forgot.test.tsx` (2026-10-07: the reset form and check your email in the panel, CH-15020 to CH-15922, and a guard that today's reset page and the panel keep the same rules and words) | pass (8) |
| `auth.test.tsx` › the sign-in micro-motion (2026-10-07: CH-15607 to CH-15611, including the glide's WebKit offsetParent case) | pass (6) |
| `src/app/golf/(auth)/forgot-password/page.test.tsx` (today's reset page, unchanged) | pass |
| `src/app/golf/(auth)/forgot-password/layout.test.tsx` (2026-10-08: flag on or off, signed in or out, and the auth server down with and without a cookie session; only flag on and signed out goes to `?view=forgot`, a degraded session counts as signed in) | pass (6) |
| `onboard.test.tsx` (32 cases: codes, the staff path, the account, after the account, request access, arriving, and since 2026-10-07 the motion and feedback, CH-15620 to CH-15624) and `onboard-logic.test.ts` (17, with moving on, CH-15620) | pass |
| `handoff.test.tsx` (the curtain over the route change) | pass |
| `src/components/auth/golf-sign-in-form.test.tsx` and `src/test/auth` (today's form unchanged) | pass |

## Looked at

- 2026-10-19, headless WebKit at 390x844 (touch) and 1280x900, light and dark, reduced motion,
  `/clubhouse-preview/auth` (`screen=reset|join|joinconfirm|staff|pending|demo`) and `/clubhouse-preview/onboard`
  (`step=cprogram|cprofile|cdone`): every state the new screens draw, looked at as contact sheets and then opened where
  anything looked off (Screenshots, below, files the evidence set).
  - The new-password page in every stage (checking, the form, the other-account line, a field refusal, a mismatch, a
    banner, expired, sent, saved); the team code empty, partly and fully typed, ten characters and too short; the confirm,
    long names, already on this team, another team, a refused join and a code that names no team; the staff invitation
    signed in, signed out, with a field problem, the wrong account, an account made without its staff row, expired, not
    valid, a program admin's and joined; waiting for approval (waiting, checked, no program name, a failed sign out); the
    demo (checking, form, invite address, timed out, a problem, refused, already signed in); the new coach's questions
    empty and filled, the profile, and the code with and without one.
  - In WebKit with motion on, scripted: the reset flow end to end against fakes (check, type, rules 4 of 4, Save, "Password
    updated"); the team code typed, a link-like paste cleaned to the code, Backspace, Enter to the confirm, Join to "You're
    on Varsity Golf". No page error or console error. A first run typed into the code before the page was listening: the
    text sat in the DOM, Enter submitted the page natively and the boxes stayed empty. Fixed the way sign in's is (#1245):
    what is typed is taken up at mount and the key waits for it.
  - The real routes on the dev server with the flag on (headless WebKit, 390): `/golf/reset-password?token_hash=bogus`
    lands on "This link has expired" (the check ran against the local auth server); `/golf/demo`, `/golf/join` and
    `/golf/staff/join/not-a-token` draw their Clubhouse screens; `/golf/coach` signed out goes to sign in;
    `/golf/join/ABC12345` signed out goes to `/golf/signup?returnTo=/golf/join/ABC12345`, which opens "You've been
    invited to a team" with the code carried.
  - Not done: a physical iPhone (keyboard, safe areas, haptics), Safari, VoiceOver, a real reset email, a real team, a real
    staff invitation or a real coach sign-up (there is one database, and it is production). The dark theme on the real
    routes: `ThemeScript` only boots the theme on a short list of paths (login, forgot and reset password, welcome), so
    `/golf/join`, `/golf/staff/join`, `/golf/coach` and `/golf/demo` follow the device's theme only after the app applies it.

- 2026-10-07, WebKit at 1440x900 and 390x844 (touch), preview: every sign-in state
  and welcome state before and after the polish pass.
  - The reset form walked end to end: sign in → reset → a refusal → sending →
    check your email → browser Back → Forward → "Remember it? Sign in".
  - URL, focus and the live heading were right at each step, with no page errors.
    A flip back within 60ms re-enters the same view.
  - rAF frame samples for the key, the refusal glide and shake, the eye and the
    view slide, with reduced motion and Animations off landing in one frame.
  - The flag across the route change (3 bare frames before, none after).
  - The Return hint's contrast measured on the fairway.
  - Chromium Tab order and focus rings through the panel.
  - The real `/golf/login` (the flag is on in development), history only, with
    every POST blocked so no reset email could go.
    - Forgot → Back → Forward → "Remember it? Sign in" stayed in one document
      with no network request: no reload and no server refetch.
    - A load straight onto `?view=forgot` opens the form.
  - Not done: a real account round trip (no reset email was sent) and a physical
    iPhone.

- 2026-10-07, sign up's finishing pass, WebKit at 1440x900 and 390x844 (touch),
  `/clubhouse-preview/onboard`:
  - Every step and its field and error states, before and after (Screenshots,
    below); the tray also at 1280, 1100 and 1024 wide.
  - The handovers forward and Back, the rail's thumb, the card's ink and the
    issue, as 30fps video and rAF samples, desktop and phone.
  - Each step change has one long frame (about 80 to 110ms) with or without the
    pass, and none with the course hidden. Its cause is open (CHANGELOG,
    2026-10-07).
  - Not done: a physical iPhone, Safari, VoiceOver.
- Every sign-up step at 1440 and 390 wide in `/clubhouse-preview/onboard`,
  against the design's screenshots.
- The course at 6.4, 12.5, 18.6 and 22 o'clock (sunrise, midday, golden hour,
  night with the moon and stars).
- Sign in to the welcome, and the welcome to the dashboard, recorded as video
  and read at 10 and 30 frames a second
  (`/clubhouse-preview/auth?go=1`). Two defects found and fixed: the welcome's
  course faded in again at the route
  change (a blink), and the fold landed 8px off the dashboard's canvas with a
  flat green where the sidebar's gradient
  would appear; and the pause between the fold and the dashboard showed an empty
  page, now held by the curtain and
  lifted when the dashboard is drawn.

- 2026-10-08, WebKit with isMobile and touch at 375, 390 and 430x844,
  `/clubhouse-preview/auth?screen=welcome`: every greeting the welcome can
  show (morning, afternoon and evening; coach, player, caught up, first visit,
  failed and no name) holds one line inside its box with no horizontal scroll,
  54 of 54. Not done: a physical iPhone, Safari.
  - A long surname is a separate, earlier case. "Coach Christopherson."
    wraps cleanly. A single word wider than the line, such as
    "Vanderwesthuizen.", is clipped at every width, as it was before this
    change.
- 2026-10-08, WebKit, signed out, dev server with the flag on:
  `/golf/forgot-password` ends on `/golf/login?view=forgot` with the reset form
  showing. The layout's redirect streams behind `golf/loading.tsx`, so it
  answers 200 with a client redirect and a meta refresh, not a 307.

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never
committed) and travel in the PR description; this table is the committed record
of them. One row per file; the label is the file's basename, named by `npm run
clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is
before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |
| `P015__signin__none__390x664__ready__before__cbc1c0d.png` | before | `cbc1c0d` | Before: fixed352px artwork leaves only312px for the sign-in form. |
| `P015__signin__none__390x664__ready__after__cbc1c0d.png` | after | `cbc1c0d` | After: responsive art, readable form and hole-centred crop. |
| `P015__welcome__player__390x664__mid-animation__after__cbc1c0d.png` | after | `cbc1c0d` | After:1.6s into welcome, the ball lands at the visible hole. |
| `P015__signin__none__390x664__javascript-disabled__evidence__cbc1c0d.png` | evidence | `cbc1c0d` | Server paint: form and actual course still with JavaScript disabled. |
| `P015__release-audit__none__430x844__ready__evidence__8ee4060.png` | evidence | 8ee4060 | release-audit (none), 430x844px, ready |
| `P015__premium-audit__none__1280__case-025-webkit-reduce__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (none), 1280px, case-025-webkit-reduce; /clubhouse-preview/auth; synthetic preview |
| `P015__premium-audit__none__1280__case-165-chromium-normal__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (none), 1280px, case-165-chromium-normal; /clubhouse-preview/auth; synthetic preview |
| `P015__premium-audit__none__390__case-025-webkit-reduce__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (none), 390px, case-025-webkit-reduce; /clubhouse-preview/auth; synthetic preview |
| `P015__premium-audit__none__390__case-165-chromium-normal__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (none), 390px, case-165-chromium-normal; /clubhouse-preview/auth; synthetic preview |
| `P015__signin__none__1440x900__key-off__before__e549642.png` | before | `e549642` | Before: Sign in off (password empty) is the shared 42% fade, a washed-out grey-green; the subtitle breaks "sign-" / "in." |
| `P015__signin__none__1440x900__key-off__after__5a34505.png` | after | `5a34505` | After: the unlit key pressed into the paper, its word engraved (CH-15607); one subtitle sentence a line, 10px under the heading again |
| `P015__signin__none__1440x900__key-in-flight__before__e549642.png` | before | `e549642` | Before: "Signing in…" drawn with the disabled fade, so the working key looked unavailable |
| `P015__signin__none__1440x900__key-in-flight__after__5a34505.png` | after | `5a34505` | After: in flight the key stays the lit green with its spinner (CH-15402, CH-15607) |
| `P015__signin__none__1440x900__retry-in-flight__before__e549642.png` | before | `e549642` | Before: a retry cleared the refusal; the button jumped 38px up under the pointer |
| `P015__signin__none__1440x900__retry-in-flight__after__5a34505.png` | after | `5a34505` | After: the last refusal stays at half strength while the retry is in flight; the button holds its place (CH-15608) |
| `P015__signin__none__1440x900__refused-credentials__before__e549642.png` | before | `e549642` | Before: a credentials refusal, both fields marked, the key faded |
| `P015__signin__none__1440x900__refused-credentials__after__5a34505.png` | after | `5a34505` | After: the same refusal with the unlit key; the glide and shake are motion (frame samples in CHANGELOG) |
| `P015__signin__none__1440x900__url-notice__before__e549642.png` | before | `e549642` | Before: the password-reset notice hugs the subtitle with a 48px gap under it |
| `P015__signin__none__1440x900__url-notice__after__5a34505.png` | after | `5a34505` | After: the notice sits with 24px above and below |
| `P015__welcome__coach__1440x900__return-hint__before__e549642.png` | before | `e549642` | Before: "or press Return" in secondary grey on the fairway (3.65 to 4.03:1 measured) |
| `P015__welcome__coach__1440x900__return-hint__after__5a34505.png` | after | `5a34505` | After: the hint in ink (6.38 to 7.05:1 measured) |
| `P015__signin__none__390x844__key-off__before__e549642.png` | before | `e549642` | Before: the phone sheet's faded Sign in key |
| `P015__signin__none__390x844__key-off__after__5a34505.png` | after | `5a34505` | After: the phone sheet's unlit key (CH-15607) |
| `P015__signin__none__390x844__retry-in-flight__before__e549642.png` | before | `e549642` | Before: a phone retry cleared the refusal; the button jumped 75px up |
| `P015__signin__none__390x844__retry-in-flight__after__5a34505.png` | after | `5a34505` | After: the refusal steps back and the button holds its place (CH-15608) |
| `P015__signin__none__390x844__refused-empty__before__e549642.png` | before | `e549642` | Before: the preview drew the empty-email refusal with the email filled in |
| `P015__signin__none__390x844__refused-empty__after__5a34505.png` | after | `5a34505` | After: the empty-email refusal over an empty Email row |
| `P015__welcome__coach__390x844__afternoon-greeting__before__e549642.png` | before | `e549642` | Before: "Good afternoon," broke over two lines at 50px, a three-line greeting |
| `P015__welcome__coach__390x844__afternoon-greeting__after__5a34505.png` | after | `5a34505` | After (superseded 2026-10-08): 46.8px on a 390px phone, the largest size one line allowed at width 96; now 50px at width 94 (rows below) |
| `P015__welcome__coach__375x844__afternoon-greeting__before__51c58e8.png` | before | `51c58e8` | Before: the 375px greeting at 45px (width 96) |
| `P015__welcome__coach__390x844__afternoon-greeting__before__51c58e8.png` | before | `51c58e8` | Before: the 390px greeting at 46.8px against the board's 50px |
| `P015__welcome__coach__430x844__afternoon-greeting__before__51c58e8.png` | before | `51c58e8` | Before: the 430px greeting at 50px (width 96) |
| `P015__welcome__coach__375x844__afternoon-greeting__after__51c58e8.png` | after | `51c58e8` | After: 48.1px at width 94, one line (328px of 331px) |
| `P015__welcome__coach__390x844__afternoon-greeting__after__51c58e8.png` | after | `51c58e8` | After: the board's 50px at width 94, one line (341px of 346px) |
| `P015__welcome__coach__430x844__afternoon-greeting__after__51c58e8.png` | after | `51c58e8` | After: 50px at width 94, one line |
| `P015__reset__none__390x844__forgot-password-redirect__after__51c58e8.png` | after | `51c58e8` | After: a signed-out visit to `/golf/forgot-password` lands on the panel's reset form (`/golf/login?view=forgot`, CH-15920) |
| `P015__reset__none__1440x900__ready__before__5a34505.png` | before | `5a34505` | Before: "Forgot password?" left the Clubhouse sign-in for today's reset page, another design (the seam) |
| `P015__reset__none__390x844__ready__before__5a34505.png` | before | `5a34505` | Before: the same seam on a phone |
| `P015__reset__none__1440x900__ready__after__5a34505.png` | after | `5a34505` | After: the reset form in the panel, the email carried and focused, course and lockup still (CH-15920; up for owner review) |
| `P015__reset__none__1440x900__refused-invalid__after__5a34505.png` | after | `5a34505` | After: a malformed address refused before sending, the field marked (CH-15121) |
| `P015__reset__none__1440x900__sending__after__5a34505.png` | after | `5a34505` | After: Send in flight, the lit key with "Sending reset link…" (CH-15420) |
| `P015__reset__none__1440x900__check-email__after__5a34505.png` | after | `5a34505` | After: check your email with the address sent to, Back to sign in as the one action (CH-15921) |
| `P015__reset__none__390x844__ready__after__5a34505.png` | after | `5a34505` | After: the reset form on the phone sheet (CH-15920) |
| `P015__reset__none__390x844__refused-invalid__after__5a34505.png` | after | `5a34505` | After: the phone's refused address (CH-15121) |
| `P015__reset__none__390x844__check-email__after__5a34505.png` | after | `5a34505` | After: check your email on the phone (CH-15921) |
| `P015__signup__none__1440x900__intro__before__e549642.png` | before | `e549642` | Before: the member card floats in a full-height green tray, most of it empty |
| `P015__signup__none__1440x900__intro__after__e107280.png` | after | `e107280` | After: the tray hugs the card; the two choices sit on the raised green's depth |
| `P015__signup__none__1440__choice-hover__after__e107280.png` | after | `e107280` | After: the team-code choice hovered, lifted 2px onto the primary hover's depth (CH-15624) |
| `P015__signup__none__1440x900__name-typed__before__83d5721.png` | before | `83d5721` | Before: the card's answers at 11.5px in light ink beside a grey coin |
| `P015__signup__none__1440x900__name-typed__after__e107280.png` | after | `e107280` | After: the answers at the board's 15px in green ink, the monogram in green ink on the card's stock (CH-15621) |
| `P015__signup__none__1440x900__account-exists__before__83d5721.png` | before | `83d5721` | Before: the refused email marked red while the cursor stays in the password under its green ring |
| `P015__signup__none__1440x900__account-exists__after__e107280.png` | after | `e107280` | After: the refused email keeps its red edge with a red halo and takes the cursor (CH-15624) |
| `P015__signup__none__1440x900__done__before__e549642.png` | before | `e549642` | Before: the issued card and its seal high in a full-height green tray |
| `P015__signup__none__1440x900__done__after__e107280.png` | after | `e107280` | After: the tray hugs the issued card and its seal; the issue itself is motion (CH-15623) |
| `P015__signup__none__1100x760__done__after__e107280.png` | after | `e107280` | After: at 1100 wide the card scales down so the seal stays inside the tray |
| `P015__signup__none__1440x900__sent__before__fbdd6ee.png` | before | `fbdd6ee` | Before: a request's card reads "Issued today" and cuts "Oakmont Universi" mid-word |
| `P015__signup__none__1440x900__sent__after__e107280.png` | after | `e107280` | After: "Received today", and a long value ends in an ellipsis (CH-15621, CH-15623) |
| `P015__signup__none__390x844__account__before__fbdd6ee.png` | before | `fbdd6ee` | Before: the phone's "3 of 5" alone in its pill |
| `P015__signup__none__390x844__account__after__e107280.png` | after | `e107280` | After: "3 of 5" over a hairline filled to the same point (CH-15622) |
| `P015__signup__none__390x844__done-joinfail__before__fbdd6ee.png` | before | `fbdd6ee` | Before: "Enter a team code" in the link's green on the green key, unreadable |
| `P015__signup__none__390x844__done-joinfail__after__e107280.png` | after | `e107280` | After: the key's word in its own ivory |
| `P015__coach-onboarding__none__1280x900__done__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 1280x900px, done |
| `P015__coach-onboarding__none__1280x900__done-dark__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 1280x900px, done-dark |
| `P015__coach-onboarding__none__1280x900__profile__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 1280x900px, profile |
| `P015__coach-onboarding__none__1280x900__program__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 1280x900px, program |
| `P015__coach-onboarding__none__1280x900__program-dark__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 1280x900px, program-dark |
| `P015__coach-onboarding__none__390x844__done__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 390x844px, done |
| `P015__coach-onboarding__none__390x844__done-dark__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 390x844px, done-dark |
| `P015__coach-onboarding__none__390x844__profile__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 390x844px, profile |
| `P015__coach-onboarding__none__390x844__program__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 390x844px, program |
| `P015__coach-onboarding__none__390x844__program-dark__after__667ce28.png` | after | 667ce28 | coach-onboarding (none), 390x844px, program-dark |
| `P015__coach-pending__none__1280x900__checked__after__667ce28.png` | after | 667ce28 | coach-pending (none), 1280x900px, checked |
| `P015__coach-pending__none__1280x900__waiting__after__667ce28.png` | after | 667ce28 | coach-pending (none), 1280x900px, waiting |
| `P015__coach-pending__none__1280x900__waiting-dark__after__667ce28.png` | after | 667ce28 | coach-pending (none), 1280x900px, waiting-dark |
| `P015__coach-pending__none__390x844__checked__after__667ce28.png` | after | 667ce28 | coach-pending (none), 390x844px, checked |
| `P015__coach-pending__none__390x844__waiting__after__667ce28.png` | after | 667ce28 | coach-pending (none), 390x844px, waiting |
| `P015__coach-pending__none__390x844__waiting-dark__after__667ce28.png` | after | 667ce28 | coach-pending (none), 390x844px, waiting-dark |
| `P015__demo-entry__none__1280x900__form__after__667ce28.png` | after | 667ce28 | demo-entry (none), 1280x900px, form |
| `P015__demo-entry__none__1280x900__form-dark__after__667ce28.png` | after | 667ce28 | demo-entry (none), 1280x900px, form-dark |
| `P015__demo-entry__none__1280x900__problem__after__667ce28.png` | after | 667ce28 | demo-entry (none), 1280x900px, problem |
| `P015__demo-entry__none__390x844__form__after__667ce28.png` | after | 667ce28 | demo-entry (none), 390x844px, form |
| `P015__demo-entry__none__390x844__form-dark__after__667ce28.png` | after | 667ce28 | demo-entry (none), 390x844px, form-dark |
| `P015__demo-entry__none__390x844__problem__after__667ce28.png` | after | 667ce28 | demo-entry (none), 390x844px, problem |
| `P015__join-code__none__1280x900__empty__after__667ce28.png` | after | 667ce28 | join-code (none), 1280x900px, empty |
| `P015__join-code__none__1280x900__filled__after__667ce28.png` | after | 667ce28 | join-code (none), 1280x900px, filled |
| `P015__join-code__none__1280x900__filled-dark__after__667ce28.png` | after | 667ce28 | join-code (none), 1280x900px, filled-dark |
| `P015__join-code__none__1280x900__too-short__after__667ce28.png` | after | 667ce28 | join-code (none), 1280x900px, too-short |
| `P015__join-code__none__390x844__empty__after__667ce28.png` | after | 667ce28 | join-code (none), 390x844px, empty |
| `P015__join-code__none__390x844__filled__after__667ce28.png` | after | 667ce28 | join-code (none), 390x844px, filled |
| `P015__join-code__none__390x844__filled-dark__after__667ce28.png` | after | 667ce28 | join-code (none), 390x844px, filled-dark |
| `P015__join-code__none__390x844__too-short__after__667ce28.png` | after | 667ce28 | join-code (none), 390x844px, too-short |
| `P015__join-confirm__none__1280x900__another-team__after__667ce28.png` | after | 667ce28 | join-confirm (none), 1280x900px, another-team |
| `P015__join-confirm__none__1280x900__confirm__after__667ce28.png` | after | 667ce28 | join-confirm (none), 1280x900px, confirm |
| `P015__join-confirm__none__1280x900__confirm-dark__after__667ce28.png` | after | 667ce28 | join-confirm (none), 1280x900px, confirm-dark |
| `P015__join-confirm__none__1280x900__invalid-code__after__667ce28.png` | after | 667ce28 | join-confirm (none), 1280x900px, invalid-code |
| `P015__join-confirm__none__390x844__another-team__after__667ce28.png` | after | 667ce28 | join-confirm (none), 390x844px, another-team |
| `P015__join-confirm__none__390x844__confirm__after__667ce28.png` | after | 667ce28 | join-confirm (none), 390x844px, confirm |
| `P015__join-confirm__none__390x844__confirm-dark__after__667ce28.png` | after | 667ce28 | join-confirm (none), 390x844px, confirm-dark |
| `P015__join-confirm__none__390x844__invalid-code__after__667ce28.png` | after | 667ce28 | join-confirm (none), 390x844px, invalid-code |
| `P015__reset-password__none__1280x900__expired__after__667ce28.png` | after | 667ce28 | reset-password (none), 1280x900px, expired |
| `P015__reset-password__none__1280x900__form__after__667ce28.png` | after | 667ce28 | reset-password (none), 1280x900px, form |
| `P015__reset-password__none__1280x900__form-dark__after__667ce28.png` | after | 667ce28 | reset-password (none), 1280x900px, form-dark |
| `P015__reset-password__none__1280x900__form-other-account__after__667ce28.png` | after | 667ce28 | reset-password (none), 1280x900px, form-other-account |
| `P015__reset-password__none__1280x900__form-refused__after__667ce28.png` | after | 667ce28 | reset-password (none), 1280x900px, form-refused |
| `P015__reset-password__none__1280x900__saved__after__667ce28.png` | after | 667ce28 | reset-password (none), 1280x900px, saved |
| `P015__reset-password__none__390x844__expired__after__667ce28.png` | after | 667ce28 | reset-password (none), 390x844px, expired |
| `P015__reset-password__none__390x844__form__after__667ce28.png` | after | 667ce28 | reset-password (none), 390x844px, form |
| `P015__reset-password__none__390x844__form-dark__after__667ce28.png` | after | 667ce28 | reset-password (none), 390x844px, form-dark |
| `P015__reset-password__none__390x844__form-other-account__after__667ce28.png` | after | 667ce28 | reset-password (none), 390x844px, form-other-account |
| `P015__reset-password__none__390x844__form-refused__after__667ce28.png` | after | 667ce28 | reset-password (none), 390x844px, form-refused |
| `P015__reset-password__none__390x844__saved__after__667ce28.png` | after | 667ce28 | reset-password (none), 390x844px, saved |
| `P015__staff-invite__none__1280x900__accept__after__667ce28.png` | after | 667ce28 | staff-invite (none), 1280x900px, accept |
| `P015__staff-invite__none__1280x900__create__after__667ce28.png` | after | 667ce28 | staff-invite (none), 1280x900px, create |
| `P015__staff-invite__none__1280x900__create-dark__after__667ce28.png` | after | 667ce28 | staff-invite (none), 1280x900px, create-dark |
| `P015__staff-invite__none__1280x900__invalid__after__667ce28.png` | after | 667ce28 | staff-invite (none), 1280x900px, invalid |
| `P015__staff-invite__none__1280x900__wrong-account__after__667ce28.png` | after | 667ce28 | staff-invite (none), 1280x900px, wrong-account |
| `P015__staff-invite__none__390x844__accept__after__667ce28.png` | after | 667ce28 | staff-invite (none), 390x844px, accept |
| `P015__staff-invite__none__390x844__create__after__667ce28.png` | after | 667ce28 | staff-invite (none), 390x844px, create |
| `P015__staff-invite__none__390x844__create-dark__after__667ce28.png` | after | 667ce28 | staff-invite (none), 390x844px, create-dark |
| `P015__staff-invite__none__390x844__invalid__after__667ce28.png` | after | 667ce28 | staff-invite (none), 390x844px, invalid |
| `P015__staff-invite__none__390x844__wrong-account__after__667ce28.png` | after | 667ce28 | staff-invite (none), 390x844px, wrong-account |

## Historical verification gaps

- The real sign in, sign up and onboarding against a real account: not run (one
  database, production).
- The phone hand-off on an iPhone (the owner's device pass).
- The member card flying into the sidebar (the design's step 5) is not built:
  the card fades with the pane.
- Reduced motion recorded on video: not yet (the tests cover the one-millisecond
  paths).
- `npm run build`: exit 0 in this repair pass; compilation, TypeScript and
  static-page generation completed, with the route table emitted.

## 2026-10-02 — Plugin interaction and accessibility verification

Auth/credentials/scene suites: 64 tests pass. The repeated-submit regression
first reproduced two requests and now verifies one request, plus retry after
refusal. WebKit Sign in at the phone viewport reports no Axe violations for
WCAG 2/2.1/2.2 A/AA tags, no document overflow, 16px credential fields and the
existing username/current-password autocomplete. Tab traverses both fields.
Reduced-motion welcome reports the camera at rest with an identity transform.
These are local previews, not real credentials or physical Safari timing.

## October 2 readability follow-up

Fresh WebKit screenshots cover sunrise at 375, 390 and 430px, and noon, sunset
and night at 390px. The heading has no blur and the document has no horizontal
overflow. The updated veil and floating updates card were visually inspected.
The focused auth suites passed 90 tests. These are local browser checks;
physical iPhone Safari and real account authentication remain separate checks.

## Premium audit matrix — 2026-10-06

30 synthetic captures are recorded for this page family. The table above
keeps representative viewport/browser evidence; the complete state/opener
ledger and review limitations are in the
[premium audit](../../PREMIUM_AUDIT.md) and its machine evidence file.
Captured states are not all visually approved.

# P015 — Auth: page contract

Every behaviour the auth screens promise, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 15, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/auth.md`).
Every contract on this page has a catalog code. The category map routes the page's rows to their
categories (`config/clubhouse/category-map.json`). `clubhouse:check` holds this file to the registry.

Two screens on two routes, drawn for a visitor with no role behind the flag `golf_clubhouse_front_door`
(off in production): sign in (`/golf/login`), then the welcome (`/golf/welcome`). Sign up and onboarding are
the next phase and join this contract when they are built. The auth screens sit outside the dashboard frame,
so the shell's contracts (P001) do not apply and none are inherited.

## 01 — Default / core UI

Status: N/A — the default state is the design itself (DESIGN.md), checked against the owner boards. Every state it draws beyond that is numbered in 02 to 23.

## 02 — Initial loading / skeleton

Status: DEFINED

The welcome draws its frame and the painted course at once and streams the greeting in over it, so the step from sign in is never an empty page and the course never restarts (CH-15401). The form has no loading state of its own: it is in the server HTML, before any script runs.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 150201 | CH-15401 | `THE_WELCOME_IS_READING_WHO_YOU_ARE` | The welcome is reading who you are and what is new |

## 03 — Background loading / refresh

Status: DEFINED

A sign-in in flight: the button says "Signing in…", is off and is `aria-busy`, and stays so while the page navigates away (CH-15402).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 150301 | CH-15402 | `A_SIGN_IN_IS_IN_FLIGHT` | A sign-in is in flight (and stays so while it navigates away) |

## 04 — Empty

Status: DEFINED

The welcome card has three empty states, each true to what was read: nothing new since the last visit (CH-15301), a first visit (CH-15302), and a name that could not be read, where the greeting stands alone (CH-15303).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 150401 | CH-15301 | `THERE_IS_AN_EARLIER_VISIT_AND_NOTHING` | There is an earlier visit and nothing new since |
| 150402 | CH-15302 | `NO_EARLIER_VISIT_ON_RECORD` | No earlier visit on record |
| 150403 | CH-15303 | `THE_NAME_COULD_NOT_BE_READ_OR` | The name could not be read, or sanitises to nothing |

## 05 — Validation

Status: DEFINED

A sign-in submitted with an empty email or password is refused before anything is sent (CH-15101). The button is off until both are filled, so this is the belt and braces for a pre-hydration submit.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 150501 | CH-15101 | `SUBMITTED_WITH_AN_EMPTY_EMAIL_OR_PASSWORD` | Submitted with an empty email or password (the button is off until both are filled, so this is the belt and braces for a pre-hydration submit) |
| 150502 | CH-15110 | `SIGN_UP_THE_TEAM_CODE_MATCHES_NO` | Sign up: the team code matches no team (or the gate is throttled, which the server reports the same way on purpose, Q-99) |

## 06 — Server / system error

Status: DEFINED

Each refusal has its own words (the current form's `getErrorMessage`, unchanged), tone, haptic and number: the credentials (CH-15001), an unconfirmed email (CH-15002), too many attempts (CH-15003), a stale bundle after its one reload (CH-15005), anything unexpected (CH-15006) and the server's own words such as a lockout (CH-15007). The welcome's notifications read failing is CH-15201.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 150601 | CH-15001 | `THE_SERVER_REFUSES_THE_CREDENTIALS` | The server refuses the credentials ("Invalid login credentials") |
| 150602 | CH-15002 | `THE_EMAIL_IS_NOT_CONFIRMED` | The email is not confirmed |
| 150603 | CH-15003 | `TOO_MANY_SIGN_IN_ATTEMPTS` | Too many sign-in attempts |
| 150604 | CH-15005 | `THE_APP_UPDATED_IN_THE_BACKGROUND_AND` | The app updated in the background and the tab held an old bundle, after the one reload (CH-15906) |
| 150605 | CH-15006 | `ANYTHING_ELSE_THROWS` | Anything else throws |
| 150606 | CH-15007 | `THE_SERVER_ANSWERS_WITH_ANY_OTHER_SENTENCE` | The server answers with any other sentence of its own, such as a lockout ("Too many login attempts. Please try again in 14 minutes.") |
| 150607 | CH-15010 | `SIGN_UP_THE_TEAM_CODE_CANNOT_BE` | Sign up: the team code cannot be checked (the request never reached the server) |
| 150608 | CH-15011 | `SIGN_UP_THE_EMAIL_ALREADY_HAS_AN` | Sign up: the email already has an account |
| 150609 | CH-15012 | `SIGN_UP_THE_ACCOUNT_COULD_NOT_BE` | Sign up: the account could not be made for any other reason (the server's rate limit, a breached password, the gate expired) |
| 150610 | CH-15013 | `ONBOARDING_THE_PHOTO_DID_NOT_UPLOAD_OR` | Onboarding: the photo did not upload, or the profile did not save |
| 150611 | CH-15014 | `REQUEST_ACCESS_COULD_NOT_BE_SENT` | Request access could not be sent |
| 150612 | CH-15201 | `THE_WELCOMES_NOTIFICATIONS_READ_FAILS` | The welcome's notifications read fails |

## 07 — Network / offline

Status: DEFINED

A sign-in that cannot reach the server says so (CH-15004).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 150701 | CH-15004 | `THE_SERVER_CANNOT_BE_REACHED` | The server cannot be reached |

## 08 — Permission / authorization

Status: DEFINED

Where a sign-in goes depends on who the person is and is decided once, for this form and the current one (CH-15902). A session the auth server has ruled invalid is sent back to sign in before the welcome draws anything, and a slow or unreachable auth server never does that (CH-15903). The flag `golf_clubhouse_front_door` chooses the page that is drawn and gates nothing else: both pages call the same `loginAction`.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 150801 | CH-15902 | `WHERE_A_SIGN_IN_GOES` | Where a sign-in goes |
| 150802 | CH-15903 | `THE_WELCOME_IS_OPENED_WITH_A_SESSION` | The welcome is opened with a session the auth server has ruled invalid |

## 09 — Success

Status: DEFINED

The notices `/golf/login?message=` names: password reset, account created, signed out, session expired (CH-15904). A sign-in that lands has no message: the page leaves (its feel is CH-15702, the hand-off CH-15604).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 150901 | CH-15904 | `GOLF_LOGIN_MESSAGE_NAMES_A_NOTICE` | `/golf/login?message=` names a notice |

## 10 — Warning

Status: N/A — the warning-toned notices (an unconfirmed email, a rate limit) are refusals and are numbered as server errors in 06.

## 11 — Destructive

Status: N/A — nothing on these screens deletes or discards anything.

## 12 — State preservation

Status: DEFINED

The invite returnTo and the demo ref survive the round trip through sign in, and are cleared once used (CH-15901).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 151201 | CH-15901 | `THE_PERSON_CAME_FROM_AN_INVITE_LINK` | The person came from an invite link or a demo link |

## 13 — Optimistic UI

Status: N/A — no optimistic updates: a sign-in is asked of the server and waits.

## 14 — Retry / recovery

Status: DEFINED

A stale bundle reloads the page once per tab, silently, then says so if it happens again, so a broken deploy cannot loop the screen (CH-15906).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 151401 | CH-15906 | `THE_APP_UPDATED_BETWEEN_LOAD_AND_SIGN` | The app updated between load and sign in (a stale bundle: a server action answers with something Next cannot parse) |

## 15 — Data freshness / sync

Status: N/A — the welcome's card is read once per visit on the server; nothing syncs or refreshes while it is open.

## 16 — Micro animation

Status: DEFINED

The design's own choreography (a scoped exception to D-64, DESIGN.md): the form leaving and the course taking the frame (CH-15601), the greeting and the card (CH-15602), the camera push and the ball (CH-15603), the hand-off fold (CH-15604), reduced motion (CH-15605) and the loops pausing when the tab is hidden (CH-15606).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 151601 | CH-15601 | `FIRST_PAINT_THEN_A_SIGN_IN_LANDING` | First paint, then a sign-in landing |
| 151602 | CH-15602 | `THE_WELCOME_DRAWS` | The welcome draws |
| 151603 | CH-15603 | `THE_WELCOMES_SCENE_PLAYS` | The welcome's scene plays |
| 151604 | CH-15604 | `CONTINUE_IS_PRESSED` | Continue is pressed (or Return) |
| 151605 | CH-15605 | `REDUCED_MOTION_OR_SETTINGS_PREFERENCES_ANIMATIONS_OFF` | Reduced motion, or Settings > Preferences > Animations off |
| 151606 | CH-15606 | `THE_TAB_IS_HIDDEN` | The tab is hidden |

## 17 — Haptic

Status: DEFINED

The README's haptic table, through `haptics.ts`: sign in tapped (CH-15701), a sign-in landing (CH-15702), warnings (CH-15703), errors (CH-15704) and Continue (CH-15705).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 151701 | CH-15701 | `SIGN_IN_IS_TAPPED` | Sign in is tapped |
| 151702 | CH-15702 | `A_SIGN_IN_LANDS` | A sign-in lands |
| 151703 | CH-15703 | `A_WARNING_TONED_REFUSAL` | A warning-toned refusal (an empty field, an unverified email, a rate limit) |
| 151704 | CH-15704 | `A_DANGER_TONED_REFUSAL` | A danger-toned refusal (the credentials, the network, a stale bundle, anything unexpected) |
| 151705 | CH-15705 | `CONTINUE_ON_THE_WELCOME` | Continue on the welcome |

## 18 — Accessibility

Status: DEFINED

A skip link (CH-15801), refusals announced with focus on the first invalid field (CH-15802), the welcome announced once (CH-15803), the decorative course hidden from assistive technology (CH-15804) and named, pressed, 44px controls (CH-15805).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 151801 | CH-15801 | `A_SKIP_LINK_IS_THE_FIRST_TAB` | A skip link is the first Tab stop and lands on the form |
| 151802 | CH-15802 | `A_REFUSED_SIGN_IN_IS_READ_OUT` | A refused sign-in is read out as it appears (`role="alert"` for danger and warning) and focus moves to the first invalid field; both fields name the notice in `aria-describedby` |
| 151803 | CH-15803 | `THE_WELCOME_ANNOUNCES_ITS_SENTENCE_ONCE_WHEN` | The welcome announces its sentence once, when it is final ("Good morning, Coach Reyes."): `role="status"`, `aria-live="polite"`, atomic; the `h1` holds the same words |
| 151804 | CH-15804 | `THE_PAINTED_COURSE_THE_TAGLINE_AND_THE` | The painted course, the tagline and the marks over it are decorative and hidden from assistive technology |
| 151805 | CH-15805 | `THE_PASSWORD_EYE_IS_A_NAMED_PRESSED` | The password eye is a named, pressed-state button with a hit area past 44px; every other control is at least 44px on the phone |

## 19 — Responsive layout

Status: DEFINED

The phone layout at 820px and below, in the same stylesheet and markup as desktop (CH-15909); the App Store build hides the Home link and Create an account (CH-15905).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 151901 | CH-15905 | `THE_APP_STORE_BUILD` | The App Store build |
| 151902 | CH-15909 | `THE_WINDOW_IS_820PX_WIDE_OR_LESS` | The window is 820px wide or less (a phone) |

## 20 — Keyboard / input

Status: DEFINED

Enter moves from Email to Password and signs in from Password, Return continues on the welcome, and a focused field scrolls the button above the keyboard (CH-15910).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 152001 | CH-15910 | `THE_KEYBOARD` | The keyboard |

## 21 — Performance

Status: DEFINED

The form is in the server HTML, the course and the animation features load after first paint, and every moving thing is on a layer of its own (CH-15907).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 152101 | CH-15907 | `EITHER_SCREEN_LOADS_ON_A_SLOW_PHONE` | Either screen loads, on a slow phone or a fast desktop |

## 22 — Analytics

Status: N/A — no analytics events. Sign-in telemetry is the server's (`recordLoginOutcome`, unchanged).

## 23 — Logging / observability

Status: DEFINED

A failed welcome read is logged with `chLogServer('auth', 'welcome.<read>')`, and a crash in the course is reported with `chReport` (surface `auth.scene`) while the form carries on (CH-15908).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 152301 | CH-15908 | `A_READ_FAILS_OR_THE_COURSE_CRASHES` | A read fails, or the course crashes |

## 24 — CI / automated test

Status: N/A — no numbered CI contract beyond the catalog: every state above is forced by a named test in `auth.test.tsx`, `auth-logic.test.ts`, `auth-server.test.tsx` and `auth-scene.test.tsx`.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (sign in, continue) are defined when the Bridge is.

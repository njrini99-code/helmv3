# Auth catalog (15xxx)

Routes: `/golf/login` (sign in), `/golf/welcome` (the greeting after it), `/golf/signup` (the code, and the questions before the account) and `/golf/player` (a new player's questions after it). Sign up follows Q-96: a roster code signs up a player, a staff code an assistant coach (instantly, no role picker), there is no head-coach path, and Request access reaches the owner's inbound list. It changes presentation only: the same `validateAccessCode`, `signupAction`, `completePlayerOnboarding` and `submitDemoRequest`, with the rules in `docs/clubhouse/drafts/auth-onboarding-ground-truth.md`. They are drawn for a visitor with no role, so they sit outside the dashboard frame and outside `isClubhouseFor`: the owner's design (`design/handoff/auth/`, approved with Q-96) is drawn behind its own flag, `golf_clubhouse_front_door`, which is off in production until the owner says so. With it off, the current pages render exactly as before. The flag chooses the page that is drawn and nothing else: both call the same server action (`loginAction`, which resets the shared idle marker in the response that sets the session cookies) and follow the same redirects.

The screens: the painted clubhouse hole (a seeded SVG course whose sky follows the viewer's own clock), the form on an ivory panel (a sheet on the phone), and then the welcome: the course fills the frame, the camera pushes to the pin, a ball lands, the greeting focuses in and a card says what has happened since the last visit. There is no auto-advance: the welcome waits for Continue (or Return), then folds the course into the app canvas and hands over.

Where things live:
- Code: `src/clubhouse/screens/auth/` (`SignIn`, `SignInForm`, `Welcome`, `WelcomeStage`, `AuthFrame`, `AuthNotice`, `SceneMount`, `GolfScene`, `SceneLayers`, `scene-sky`, `scene-geometry`, `scene-ball`, `sign-in-state`, `auth-motion`, `use-hour`, `use-query-param`)
- Shared rules: `src/lib/auth/golf-sign-in-logic.ts` (the six messages, the destination, the stale-bundle guard), used by the current form and this one so they cannot drift
- Loader: `src/clubhouse/data/welcome.ts` (`loadWelcome`), with the pure rules in `welcome-shape.ts` (who is greeted, what the card lists, the last-visit wording)
- Routes: `src/clubhouse/routes/auth.tsx`, chosen by `src/app/golf/(auth)/login/layout.tsx` and `welcome/layout.tsx` through `isClubhouseFrontDoor`
- Tests: `src/clubhouse/__tests__/auth.test.tsx`, `auth-logic.test.ts`, `auth-server.test.tsx`, `auth-scene.test.tsx`
- Sign up: `src/clubhouse/screens/onboard/` (`Onboard`, `Steps`, `MemberCard`, `flow`, `logic`, `writes`, `writes-context`), `src/clubhouse/data/onboard.ts`, `src/clubhouse/routes/onboard.tsx`, chosen by `signup/layout.tsx` and `(onboarding)/player/layout.tsx`; tests `onboard.test.tsx`, `onboard-logic.test.ts`
- The hand-off curtain: `src/clubhouse/lib/handoff.ts` (the fold's last frame held over the route change, lifted by `ClubhouseFrame`); test `handoff.test.tsx`
- Sign-up preview: `/clubhouse-preview/onboard` (`?step=`, `&who=`, `&sim=`, `&hour=`)
- Preview: `/clubhouse-preview/auth` (`?screen=signin|welcome`; sign in `&state=coach|player&fail=empty|creds|unverified|rate|network|stale`; welcome `&state=coach|player|caughtup|first|failed|noname`; `&hour=8.5` picks the time of day)

The time of day is read from the viewer's clock after hydration (the server draws a neutral sky and reserved lines, so nothing mismatches), every 30 seconds and when the tab comes back, in the viewer's own timezone. The greeting word follows the hour: morning 4:30 to 12, afternoon 12 to 17, evening otherwise.

"Since you last signed in" lists the newest three unread items of the notifications feed (`getUnifiedNotifications`), with when the person was last here (`users.last_seen`, which the dashboard heartbeat writes, read before any heartbeat can overwrite it). It is last activity, not literally the last sign-in: Supabase's own `last_sign_in_at` has already been replaced by the sign-in that just happened.

## 150xx Error toasts

These are notices under the form, not toasts: a sign-in that is refused is about the form, and it stays put until the next attempt. The words are the current form's `getErrorMessage`, unchanged.

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-15001 | The server refuses the credentials ("Invalid login credentials") | "Incorrect email or password. Please check your credentials and try again." in a danger notice (`role="alert"`). Both fields are marked invalid and focus goes to Email. Felt: error (CH-15704) | `failureFor`, `invalidFieldFor` | auth.test › CH-15001; auth-logic.test › CH-15001 |
| CH-15002 | The email is not confirmed | "Please verify your email address before signing in. Check your inbox for the confirmation link." in a warning notice. No field is marked. Felt: warning (CH-15703) | `failureFor` | auth.test › CH-15002 |
| CH-15003 | Too many sign-in attempts | "Too many sign-in attempts. Please wait a moment and try again." in a warning notice. Felt: warning (CH-15703) | `failureFor` | auth.test › CH-15003 |
| CH-15004 | The server cannot be reached | "Unable to reach the server. Please check your internet connection and try again." in a danger notice. Felt: error (CH-15704) | `failureFor` | auth.test › CH-15004 |
| CH-15005 | The app updated in the background and the tab held an old bundle, after the one reload (CH-15906) | "The app updated in the background. Please try signing in once more." in an info notice (`role="status"`: nothing is wrong with the account). Felt: error | `failureFor`, `isStaleBundleError` | auth.test › CH-15906 (and CH-15005) |
| CH-15006 | Anything else throws | "An unexpected error occurred. Please try again." in a danger notice, reported with `logError` (high). Felt: error | `failureFor` | auth.test › CH-15006 |
| CH-15007 | The server answers with any other sentence of its own, such as a lockout ("Too many login attempts. Please try again in 14 minutes.") | Those words, in a danger notice. No field is marked. Felt: error. The sign-in action's own wrong-password text ("Invalid email or password (2 attempts remaining)") is not this: it reads as CH-15001, with the attempts left kept as a second line (`failureForServer`, Q-98); today's form still shows it raw | `failureForServer`, `failureFor` | auth.test › CH-15001 (Q-98), CH-15007; auth-credentials.test |
| CH-15010 | Sign up: the team code cannot be checked (the request never reached the server) | "We couldn't check your code" under the slots, and a warning notice "Unable to reach the server. Please check your internet connection and try again." with Try again, which checks the same code. Felt: error | `checkCode` (`kind: 'net'`), `Code` | onboard.test › CH-15010 |
| CH-15011 | Sign up: the email already has an account | "An account with this email already exists. Please sign in instead, or use a different email." on the Email field, and a danger notice "This email already has a GolfHelm account." with Go to sign in (keeping the invite's returnTo). Felt: error | `accountErrorFor`, `Account` | onboard.test › CH-15011 |
| CH-15012 | Sign up: the account could not be made for any other reason (the server's rate limit, a breached password, the gate expired) | The server's own sentence as it arrives (a breached password on the Password field), otherwise in a danger notice. Nothing typed is lost. Felt: error | `accountErrorFor`, `Account` | onboard.test › CH-15012 |
| CH-15013 | Onboarding: the photo did not upload, or the profile did not save | "That photo didn't upload. Try again, or skip it for now." / "Unable to reach the server…" in a danger notice; Finish setup stays available. Felt: error | `uploadPhoto`, `finishPlayer`, `Photo` | onboard.test › CH-15013 |
| CH-15014 | Request access could not be sent | "Unable to reach the server. Your details are still here. Check your connection and try again." in a danger notice; every field keeps what was typed. Felt: error | `sendRequest`, `RDetails` | onboard.test › request access |

## 151xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-15101 | Submitted with an empty email or password (the button is off until both are filled, so this is the belt and braces for a pre-hydration submit) | "Enter your email and password to sign in." in a danger notice, the empty field marked and focused. Nothing is sent: an empty pair would record a failed attempt against a blank identity. Felt: warning (CH-15703) | `handleSubmit` in `SignInForm` | auth.test › CH-15101 |
| CH-15110 | Sign up: the team code matches no team (or the gate is throttled, which the server reports the same way on purpose, Q-99) | The slots shake and turn red, "That code didn't match a team" under them, and a danger notice "Check the code with your coach and try again. Assistant coaches use the staff code from their head coach." Felt: error. A code of 8 checks itself after a pause; any other length (production has 6 and 9) is checked on Continue | `checkCode`, `codeAutoChecks`, `Code` | onboard.test › CH-15110 |

## 152xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-15201 | The welcome's notifications read fails | In the card, under "Since you last signed in": "Updates didn’t load" + "They’ll be waiting in your notifications." It never reads "You’re all caught up" for something it could not check, and Continue is there whatever the reads did. Not on the boards: added so the card stays true | `NewsEmpty` in `Welcome`; `loadWelcome` logs `chLogServer('auth', 'welcome.notifications', …)` | auth.test › CH-15201; auth-server.test › CH-15201 |

## 153xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-15301 | There is an earlier visit and nothing new since | "You’re all caught up" + "Nothing new since your last visit." under "Since you last signed in" and when that was | `NewsEmpty` | auth.test › CH-15301 |
| CH-15302 | No earlier visit on record | The header reads "Your first time in" with no time; "Your team’s updates will show up here" + "Messages, posted rounds and RSVPs since your last visit." | `NewsEmpty` | auth.test › CH-15302 |
| CH-15303 | The name could not be read, or sanitises to nothing | The greeting stands alone ("Good evening.", no second line). Never "Coach Coach" or a bare "Coach" | `resolveWelcomeName`; the `h1` carries the number | auth.test › CH-15303; auth-logic.test › CH-15303 |

## 154xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-15401 | The welcome is reading who you are and what is new | The frame and the course already up and moving, with no text yet: the step from sign in is never an empty page, and the course does not restart when the greeting streams in | `WelcomeStage`, with the greeting in a Suspense boundary | auth.test › CH-15401 |
| CH-15402 | A sign-in is in flight (and stays so while it navigates away) | The button reads "Signing in…" with a spinner, `aria-busy`, and is off | `SignInForm` | auth.test › CH-15402 |

## 156xx Motion

The design's own easings, durations and delays apply on these screens only (a scoped exception to D-64, recorded in `pages/P015-auth/DESIGN.md`). They are tokens in `styles/auth-tokens.css` and variants in `screens/auth/auth-motion.ts`. Nothing else in Clubhouse changes.

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-15601 | First paint, then a sign-in landing | The form is in the server HTML and the course is not (a neutral gradient stands in, and nothing hydrates differently). The course loads after first paint from the viewer's clock. When a sign-in lands the form slides away, the course takes the whole frame and the veil and tagline fade (720ms), then the welcome route draws itself over the same frame | `SceneMount` (`next/dynamic`, client only), `AuthFrame` `data-phase`, `OPENING_MS` | auth.test › CH-15601 |
| CH-15602 | The welcome draws | From mount: the scrim fades (1.4s at 0.2s), the mark (0.7s at 0.3s), the date rises (0.5s), "Good morning," focuses in out of a blur (1s at 0.64s), the name rises out of its clipped line (1.1s at 1.05s), the card arrives (0.9s at 2.25s) and each item rises 140ms after the one before from 2.55s. The word follows the viewer's hour (morning 4:30 to 12, afternoon 12 to 17, evening otherwise); after dark the type flips to ivory | `auth-motion.ts` variants (`m`, `LazyMotion`), `greetingWord`, `isDarkSky` | auth.test › CH-15602; auth-logic.test › CH-15602 |
| CH-15603 | The welcome's scene plays | The camera pushes toward the pin (scale 1.34, 5.2s; 1.2 on a short window; the phone slides 180 units and scales 1.06 to centre the clubhouse). The foreground pine and bough move out of frame. A ball flies in on a curve (1.65s), hops once and rolls to the cup. The camera is a CSS transform on one wrapper and the ball is a motion value written to two attributes: nothing re-renders | `GolfScene`, `ballAt` | auth.test › CH-15603; auth-logic.test › CH-15603 |
| CH-15604 | Continue is pressed (or Return) | The text slides left and fades (420ms), the course clips to the app canvas (240px from the left, 880ms), the ivory paper fades in over it and the camera pushes to 1.5, then the destination is asked for (1s). Only when the destination is a dashboard page and Clubhouse; otherwise the welcome just leaves (520ms). On the phone the screen fades to ivory. Idempotent: a second tap, or Return on the focused button, starts nothing | `Welcome.proceed`, `WelcomeStage`, `HANDOFF_MS` | auth.test › CH-15604 |
| CH-15605 | Reduced motion, or Settings > Preferences > Animations off | Every transition is 1ms, every loop is paused (the flag holds still, the clouds stop), the camera stops short (1.2), the ball is already on the green, the welcome lands at once and the hand-off is a quick fade (240ms) | `useChReducedMotion`, `auth-tokens.css`, `GolfScene` | auth.test › CH-15605; auth-logic.test › CH-15605 |
| CH-15606 | The tab is hidden | Every loop holds still (CSS animations and the flag's SMIL) and starts again when it is back | `GolfScene` `visibilitychange` | auth.test › CH-15606 |

## 157xx Haptics

Only through `src/clubhouse/lib/haptics.ts`. On the web they do nothing.

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-15701 | Sign in is tapped | Light (`press`) | `SignInForm` | auth.test › CH-15701 |
| CH-15702 | A sign-in lands | Success | `SignInForm` | auth.test › CH-15702 |
| CH-15703 | A warning-toned refusal (an empty field, an unverified email, a rate limit) | Warning | `failureFor` | auth.test › CH-15703 |
| CH-15704 | A danger-toned refusal (the credentials, the network, a stale bundle, anything unexpected) | Error | `failureFor` | auth.test › CH-15704 |
| CH-15705 | Continue on the welcome | Medium (`commit`) | `Welcome.proceed` | auth.test › CH-15705 |

## 158xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-15801 | A skip link is the first Tab stop and lands on the form | `ch-au-skip` | auth.test › CH-15801 |
| CH-15802 | A refused sign-in is read out as it appears (`role="alert"` for danger and warning) and focus moves to the first invalid field; both fields name the notice in `aria-describedby` | `AuthNotice`, `SignInForm` | auth.test › CH-15802 |
| CH-15803 | The welcome announces its sentence once, when it is final ("Good morning, Coach Reyes."): `role="status"`, `aria-live="polite"`, atomic; the `h1` holds the same words | `Welcome` | auth.test › CH-15803 |
| CH-15804 | The painted course, the tagline and the marks over it are decorative and hidden from assistive technology | `aria-hidden` on `.ch-au-photo` | auth.test › CH-15804 |
| CH-15805 | The password eye is a named, pressed-state button with a hit area past 44px; every other control is at least 44px on the phone | `ch-au-eye`, `auth.css` | auth.test › CH-15805; a11y scan |

## 159xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-15901 | The person came from an invite link or a demo link | The returnTo and the demo ref are kept through the round trip (`sessionStorage`), the ref is handed to the server, the "Create an account" link carries the returnTo, and both are cleared once used | `SignInForm` | auth.test › CH-15901 |
| CH-15902 | Where a sign-in goes | Where it goes is decided once, for both forms: a safe returnTo through the welcome for someone onboarded; onboarding with `?joinCode=` for someone with no profile yet (an invite keeps its code); otherwise the server's destination; an unsafe returnTo is dropped (open redirect); onboarding skips the welcome (no name to greet) | `resolveSignInHref` in `golf-sign-in-logic` | auth.test › CH-15902; auth-logic.test › CH-15902 |
| CH-15903 | The welcome is opened with a session the auth server has ruled invalid | Back to `/golf/login` before anything is drawn. A slow or unreachable auth server never does this (it falls back to the local session), and a session read that throws greets by the time of day and says the updates did not load | `loadWelcome`, `WelcomeLoader` | auth-server.test › CH-15903 |
| CH-15904 | `/golf/login?message=` names a notice | "Session expired. Please sign in again." / "Password reset successfully. Please sign in with your new password." / "Account created successfully. Please sign in." / "You have been signed out." in a positive notice (`role="status"`) | `SIGN_IN_NOTICES` | auth.test › CH-15904 |
| CH-15905 | The App Store build | No "Home" back link (the proxy sends "/" straight back to sign in) and no "Create an account" (Guideline 3.1.1) | `isNativeApp` | auth.test › CH-15905 |
| CH-15906 | The app updated between load and sign in (a stale bundle: a server action answers with something Next cannot parse) | The page reloads once per tab, silently, then CH-15005 if it happens again: a broken deploy cannot loop the screen | `hasReloadedForStaleBundle`, `markReloadedForStaleBundle` | auth.test › CH-15906 |
| CH-15907 | Either screen loads, on a slow phone or a fast desktop | The form is in the server HTML and is usable before the course exists. The course (and the animation features) load in their own chunks after first paint, the server draws a flat sky in their place, and every moving thing is on its own layer (the flag, the water, the oaks, the clouds, the birds, the stars), so the landscape is painted once and a loop never repaints it. The camera is one transform and `will-change` is set only while it moves | `next/dynamic` (`ssr: false`), `SceneLayers`, `GolfScene` | auth.test › CH-15907 |
| CH-15908 | A read fails, or the course crashes | A failed read on the welcome is logged (`chLogServer('auth', 'welcome.<read>')`); a crash in the course leaves the flat sky and the form untouched and is reported (`chReport`, surface `auth.scene`, low) | `loadWelcome`, `SceneBoundary` | auth-server.test › CH-15908; auth-scene.test › CH-15908 |
| CH-15909 | The window is 820px wide or less (a phone) | The course on top (392px) and the form on a sheet from 352px, grouped rows, the forgot link under the button, the welcome full screen with the clubhouse centred and the list stacked. One structure with the desktop's, switched in CSS at the same width as `useChPhone`, so nothing is chosen by sniffing the device and the server HTML fits both | `@media (max-width: 820px)` in `auth.css` | auth.test › CH-15909 |
| CH-15910 | The keyboard | Enter in Email moves to Password (the keyboard's "next" key); Enter in Password signs in; Return on the welcome continues (CH-15604); focusing a field scrolls the button into view above the keyboard after the keyboard has come up | `SignInForm` (`onKeyDown`, `revealSubmit`), `Welcome` | auth.test › CH-15910 |

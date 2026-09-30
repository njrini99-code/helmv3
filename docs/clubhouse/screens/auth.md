# Auth checklist

Reference: `design/handoff/auth/` (the owner's handoff: `README.md`, `Sign in.html`, `Sign in - Mobile.html`, `Sign in - Times of day.html`, `Sign up.html`, `Sign up - Mobile.html`, `src/`, `screenshots/`; owner decisions Q-96); spec `docs/clubhouse/phone/auth.md`
Routes: `/golf/login` and `/golf/welcome` (built), `/golf/signup` and onboarding (phase 2, not built)   Surface tag: `auth` (Sentry `surface=auth.<section>`)
Flag: `golf_clubhouse_front_door` (off in production). Page: P015, `pages/P015-auth/`.

## spec
- [x] Desktop reference files and screenshots are named above
- [x] Every figure on the screen is mapped to a table and column, or logged as a gap (`pages/P015-auth/DESIGN.md` "Data assumptions": the name is `golf_coaches.full_name` or `golf_players.first_name`, the card is the notifications feed, the last visit is `users.last_seen`; "last signed in" is last activity, logged as a decision to confirm)
- [x] Every control is mapped to an existing server action: Sign in is `loginAction`, the card is `getUnifiedNotifications`, everything else is a link or a route change (`pages/P015-auth/WIRING.md`). No migration
- [x] Differences between the README and the screenshots are resolved as decisions: the design's "both fields red" credentials state is what the current form shows only for Supabase's own text (the server says "Invalid email or password (N attempts remaining)"), kept as it is and logged for the owner; the welcome's date and last-visit time follow the viewer's locale; the dashboard-side reveal and the card flying into the sidebar are not built (`DESIGN.md` "Not built")

## desktop
- [ ] Matches the reference at 924px and at 1280px or wider (spacing, type, radius, depth)
- [x] Only Clubhouse tokens and classes are used (`.ch-au-*` over `--ch-*`, the motion in `auth-tokens.css`), and `clubhouse:check` is clean for this page's sources
- [x] N/A: no figures. The card's text is the notification's own words
- [x] Red appears only for a refused sign-in (danger notice, invalid field); the welcome and the course use green and the design's ivory and brass
- [ ] Copy is in sentence case, in the head-pro voice, and actions are a verb plus an object
- [x] Controls that point at an unbuilt screen are hidden: "Create an account" links to the current `/golf/signup` until phase 2
- [ ] A narrow canvas reflows without horizontal page scroll

## wired
- [x] Everything the welcome needs is read server-side in one pass (`loadWelcome`), so the greeting's data is on first paint; the clock-derived parts land after hydration, by design
- [x] Reads go through the RLS-scoped client, with no service role
- [x] Every Supabase call reads `error` and logs it (`chLogServer('auth', 'welcome.<read>')`); a failed read is never shown as an empty one
- [x] Null, zero and "first time" render differently (CH-15301, CH-15302, CH-15201)
- [x] Times are resolved in the viewer's timezone on the client after hydration, with no hydration mismatch (`useLocalHour`, `useLocalDateLabel`, `useLastHereLabel`)
- [x] Unit tests cover the derivations (`auth-logic.test`, `auth-server.test`)

## states
- [x] Loading: the frame and the course while the welcome reads (CH-15401); the button says it is signing in (CH-15402)
- [x] Empty: caught up, first visit, and no name (CH-15301 to CH-15303)
- [x] Partial failure: the card says when the updates did not load (CH-15201); the greeting and Continue still work
- [ ] Crash containment: the course is behind a boundary that leaves the form alone; the form itself is not wrapped
- [ ] Route error: the Clubhouse error view
- [ ] Not found and no access: plain words and a way back
- [x] Offline or slow network: a sign-in that cannot reach the server says so (CH-15004)
- [x] User errors: every refusal has its own words, tone, haptic and number (CH-15001 to CH-15007)
- [x] Forms: inline field marks, focus moves to the first invalid field, double submit is prevented (CH-15101, CH-15402)
- [x] N/A: no destructive actions
- [x] N/A: no optimistic updates

## error-tracking
- [ ] Server read failures are logged with `chLogServer('auth', '<read>')`
- [ ] Client crashes are reported with `chReport`, tagged `ui=clubhouse` and `surface=auth.<section>`
- [ ] Key intents leave a `chTrail` breadcrumb
- [ ] No `catch` swallows an error without reporting or handling it on screen
- [ ] Every failure path was forced once locally and seen in the console or Sentry

## phone-spec
- [x] `docs/clubhouse/phone/auth.md` names the owner's mobile boards in `design/handoff/auth/` and maps each screen to components
- [x] It says `Status: approved`

## phone
- [ ] Built at 390px and 430px, respecting the safe areas
- [ ] Touch targets are at least 44px, and hover-only affordances have a tap equivalent
- [x] N/A: no sheets or popovers (the form sits on the design's own sheet, which does not drag)
- [x] N/A: no bottom tab bar on these screens
- [ ] Checked on a real iPhone through `npm run ios:dev` (docs/clubhouse/MOBILE.md): keyboard, haptics felt

## motion
- [ ] Transitions use the design's own tokens (`auth-tokens.css`), a scoped exception to D-64 that applies to these screens only (`DESIGN.md`)
- [ ] Press: every tappable shrinks about 6px and springs back (`useChPress`, mounted by `AuthFrame`)
- [ ] The welcome's choreography matches the design's timings (CH-15602)
- [ ] Reduced motion and Animations off: every transition 1ms, loops paused, ball on the green, hand-off a fade (CH-15605)
- [ ] Haptics follow the README table (CH-15701 to CH-15705)
- [ ] Checked for jank on a real iPhone: the course is layered so nothing repaints on a loop; `will-change` only while the camera moves

## accessibility
- [ ] Full keyboard path, with visible focus and no traps
- [ ] Landmarks, headings in order, and labels on icon buttons
- [ ] Status changes are announced (aria-live) and errors use role=alert
- [ ] Text contrast meets WCAG AA on every surface (`npm run clubhouse:a11y` on `/clubhouse-preview/auth`)

## performance
- [ ] No request waterfall on the server, with independent reads in parallel
- [ ] Client JS is limited to the interactive islands, the course and the animation features load lazily, and the form is in the server HTML
- [ ] No layout shift after first paint

## verified
- [ ] typecheck, lint, `clubhouse:check` and the screen's tests are green, with exit codes recorded in the log
- [ ] Browser pass on desktop and phone with a real account, logged in PROGRESS.md
- [ ] Owner review of the built screens

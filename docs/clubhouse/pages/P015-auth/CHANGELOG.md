# P015 — Auth: changelog

## 2026-10-17 — Polish: Create an account reaches 44px

```text
Design package: none (polish review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- "Create an account" under the sign-in form was a 17px line of text to tap;
  its hit area now reaches 44px tall without moving it. On the phone the legal
  links under it keep their own 44px on top where the two meet (`auth.css`).

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `clubhouse:css`, `typecheck:fast` and eslint. The WebKit pass is the
  coordinator's.

## 2026-10-17 — Sign in drops its subtitle

Owner: "get rid of the words under sign in". The heading now stands alone
over the fields ("Coaches and players use the same sign-in. We'll open the
right clubhouse for you." is gone, and its phone-only `.ch-au-sub__more` rule
with it). Then "fix the spacing with logo and sign in text": the heading sat
flush under the lockup (base.css zeroes `.ch-root h1`, which had quietly taken
its 36px), so on desktop it now has 28px under the logo, written under `.ch-au`
like the paragraph spacing. The reset and check-your-email headings share it.

## 2026-10-16 — The welcome reads the dashboard in full before Continue

Owner: "look through the login and animation mechanics and fix it". The
welcome prefetched the dashboard with the default kind, which for a dynamic
page stops at its loading boundary, so the dashboard was only asked for when
the fold had landed and the empty frame waited a server render (measured in dev
Chrome: fold done at 1.0s, frame empty until 1.7s warm and over 2s cold). It now
prefetches in full (`PrefetchKind.FULL`, as the shell's tab prefetch does)
while the greeting plays. Next does not prefetch on the dev server, so the gain
shows in production only; not measured there (no build, owner's call).

## 2026-10-16 — Sign in starts moving sooner

Owner: "right after you click sign in, the animation still stalls for a second".
Nothing moves until the sign-in answers, and the answer waited on seven network
round trips one after another. The server's sign-in (`loginAction`,
`src/app/golf/actions/auth.ts`) now sends the lockout check and the email's rate
limit together (two round trips before the sign-in, not three; refusals keep
their order; the IP's limit is still counted only once both pass, so on a shared
network one person retrying a locked account does not use up everyone else's
allowance, as review pointed out), and after a successful sign-in reads the role
and both profiles together with the failed-attempts reset (one round trip, not
two plus a serial reset). On the client the form starts leaving the moment the
sign-in lands; the 100ms cookie beat now sits inside the opening's own 430ms
wait instead of before it. Auth tests pass; not measured end to end here
(signing in sends real credentials to production, so it was left to the owner).

## 2026-10-16 — Continue hands the wordmark's write to the sidebar

The welcome's own wordmark is back to its original sans lockup; the script
"Golfhelm" moved to the sidebar's brand (P001), which Continue now asks to
write itself in once the dashboard is drawn (`markBrandWrite`).

## 2026-10-16 — The welcome tried "Golfhelm" in script, then handed it to the sidebar

Owner, 2026-10-16, after sign in: "a cursive thing of script". The Welcome's
mark was first drawn as "Golfhelm" in Great Vibes written on by a mask wipe,
with the wheel turning into place. That version is superseded: the Welcome is
back to its sans lockup and the script wordmark lives in the sidebar's brand
(entry above, and P001). What stays from the first attempt is the script font's
mechanism (`lib/fonts.ts`, `--ch-font-script`, now Norican and preloaded) and
the shared test setup mocking it (`src/test/setup.tsx`). The script face is an
owner-requested exception to the doctrine of Instrument Sans for display, body
and data (`.claude/rules/clubhouse.md`), for the wordmark only.

## 2026-10-16 — Keychain AutoFill keeps the dark field; the sign-in scrolls smoothly

- **AutoFill in dark mode** (`auth.css`, `.ch-au-input`): WebKit paints an
  autofilled input a light fill with dark ink (a user-agent style), a white bar
  inside the dark field. An inset shadow of the field's own surface now covers
  the fill, the ink is ours again, and the fill's colour change is held off
  where the shadow cannot reach. Not captured: AutoFill cannot be driven in a
  headless browser, so this is untested against a real Keychain fill.
- **Smooth wheel** (`AuthFrame` mounts `useSmoothWheelEverywhere`): the sign-in
  screens scrolled in raw steps. Shared detail: docs/clubhouse/CHANGELOG.md.

## 2026-10-16 — Typing, opening and signing in move once, without waiting

Owner, on the phone: "a slight delay with the animation right when you enter
password", "the transition to the log in page isn't great", and after Sign in.
Measured in Playwright WebKit (not Safari) at phone size on a local production
build, 700ms added to each request; the iOS keyboard itself is not in that
browser, so how the sheet keeps pace with it is not verified on a device.

- **The sheet rises with the keyboard** (SignIn `useKeyboardLift`): it no
  longer holds its first frame two frames on the way up, and a touch phone no
  longer scrolls Sign in into view 320ms after Email takes focus (the sheet
  already puts it above the keyboard; the scroll was a second move). Down still
  holds its first frame.
- **Sign in moves the sheet once**: the tap blurs the field and the keyboard
  goes, but the sheet stays where it is while the attempt runs. It used to drop
  with the keyboard, wait on the server, then leave: three moves. A refusal puts
  the cursor back in a field with the sheet still up.
- **The welcome is asked for 430ms into the opening** (`OPENING_PUSH_MS`), when
  the sheet is about 95% off the screen, not at its end: it came a full round
  trip after the sheet had gone, over an empty course.
- **Log in from the home page** (shared landing header, not Clubhouse): the
  sign-in is prefetched as the page loads. The tap waited 0.9s on the menu's
  Log in (two round trips and the sign-in's code); now 0.09 to 0.10s.

## 2026-10-14 — Sheet up: the wordmark reads over the pines

Found in Playwright WebKit on the preview (phone, keyboard lift): with the sheet
up, the strip of course left above it is pine, and the wordmark kept its
daylight inks, near-black "Golf" and green "Helm" on dark green. The line over
the course also rode up with the closing window and crossed the wordmark while
it faded.

- **The wordmark takes the dark-sky inks with the sheet up** (ivory and mint,
  as at dusk), and **the line leaves in the first third of the rise**
  (auth.css). Test: auth-kb-mark.test.ts.

## 2026-10-14 — Log in from the home page: no dashboard skeleton, no sunny course at night

Owner: "Hitting login on home page hot loads the day scene then switches to
whatever time it actually is. And just clicking login is kinda rough itself."
Traced on the main preview in WebKit at phone size, night time zone: the tap
painted the dashboard skeleton for about 0.4s, then the sign in; a direct load
opened on the daytime still and the night course faded over it.

- **No dashboard skeleton on the way in** (`ClubhouseSignInRoute`): the route
  awaited the phone hint (a cookie and headers), which made /golf/login
  dynamic, so a tap on Log in painted the nearest loading boundary,
  golf/loading.tsx's dashboard skeleton. The route now reads nothing from the
  request (the course's crop, the hint's only reader here, draws after
  hydration). Test: auth-server.test.tsx "the sign in route reads nothing from
  the request".
- **The still takes the hour's light** (SceneMount `posterWash`): the still is a
  daytime photo; until the course's chunk draws, a wash of the hour's sky lies
  over it (clear by day), so the course that fades in is the same time of day.
  A client navigation knows the hour on its first frame; a cold load learns it
  at hydration and the wash eases in. Test: auth-scene.test.tsx.

## 2026-10-14 — The sheet rises on focus, so a tap on Password lands

Owner, signing in on the iPhone Simulator: "I couldn't click password, it just
pulled up."

- **The keyboard lift waits for focus** (SignIn `useKeyboardLift`): the sheet
  rose on the finger's touch, and iOS focuses the field under the finger as it
  lifts, so the rising sheet carried Password out from under the tap and nothing
  took focus. It now rises on `focusin`; moving from Email to Password still
  keeps it up. Test: auth.test.tsx "phone keyboard lift".

## 2026-10-13 — Sign in on the phone: standard fields, a plain notice, the sheet over the keyboard

Owner: the phone sign-in had "weird rings", and the focus, sheet and keyboard
did not line up.

- **The fields are the standard sign-in anatomy** (owner: the box and its text
  "didn't seem even"): each field is its own rounded box under its label, as
  wide as Sign in and on its 13px radius and 52px height, the label, the boxes,
  the notice icon and the heading on the sheet's 20px edge, the text inset 14px
  in both boxes and centred in them, the eye centred on its row. Focus and a
  refusal ring that one box (green while typing, red on a refusal), on both
  themes. Replaces the grouped iOS-style box, whose square per-row rings sat
  inside its rounded corners.
- **Notices are flush** (icon and words, no box, no ring), as refusals already
  were; "Session expired" and "Signed out" are information (the info icon), not
  a green success check. "Account created" and "Password reset" stay positive.
- **The keyboard:** on a touch phone, the finger landing on a field raises the
  sheet to just under the status bar (420ms, the auth ease), so the fields and
  Sign in sit above the keyboard and iOS never pans the page under the sheet; it
  settles back when the keyboard goes. The course's window closes with it and
  its line fades. Reduced motion moves it at once.

## 2026-10-10 — corner radii on the token scale

- Part of the app-wide premium polish (`docs/clubhouse/CHANGELOG.md`,
  2026-10-10): the `9px` and `11px` corner literals in
  `styles/auth.css` (the welcome's row icon well) and `styles/onboard.css` (the
  stage's inner frame, the back link, the
  phone code slots) are `--ch-radius-md` (10px). A one-pixel change in corner
  rounding; no layout, copy or behaviour changed.

## 2026-10-08 — the phone hand-off follows the design reference

- Owner: "it was supposed to fold into the dashboard, check the design ref". The
  phone used to fade the course to a flat ivory page, then the dashboard's green
  bar appeared on top of it. It now plays the reference's phone hand-off
  (design/handoff/auth/src/login.css, `.ml-hero` and `.ml-rise`):
  - the welcome lifts away;
  - the frame's green fades up over the course and collapses to the dashboard's
    bar (status bar plus 50px);
  - the parchment sheet rises from the foot to meet it, with the sheet's 16px
    top corners, 820ms after a 200ms beat (the `--ch-au-t-rise` and
    `--ch-au-t-hero` tokens, which were defined but never used);
  - the curtain (`lib/handoff.ts`) holds that same bar and sheet over the route
    change;
  - the dashboard fades in over 380ms, and its content rises 10px into place,
    55ms apart (gh-core's `GH.reveal`), on this hand-off only.
- Reduced motion and Animations off skip all of it, as before. WebKit 390 × 844,
  player, recorded frame by frame.

## 2026-10-08 — premium pass: findings D6, D11

- D6: the welcome card holds its news as rows between hairlines, not bordered,
  shadowed cards inside a card. A vertical hairline parts them side by side on a
  wide screen, a horizontal one when stacked. Empty and failed states are a
  flush notice.
- D11: the preview's round reads "74 · +2 · Pine Needles", as Home's latest
  rounds do. The live welcome carries no score.
- D10 (owner, 2026-10-08): the phone's sign-in fields keep a visible label,
  small and quiet at the top of each row of the grouped sheet; the focus and
  error rings take the whole row. The email placeholder is `you@school.edu` on
  sign in and Forgot password, and the password field has none, since its label
  names it.

## 2026-10-08 — premium pass: Continue keeps honest time, and findings (P015-B3, D4, D5, D7)

- B3: on the phone, where the welcome goes on by itself, a 1px gilt hairline
  draws across under Continue over the time left (transform only; held still
  under reduced motion), so the page says it will continue and a tap just goes
  now.
- D4: the welcome's date uses Home's style (en-GB, "Tuesday 14 October") in the
  viewer's own zone, not the browser's locale.
- D5: the member seal reads "Member since 2026", in order.
- D7: the password meter's empty steps are a visible track
  (`--ch-border-strong`).
- Not changed: D8 (the onboarding felt tray inside the paper pane) is an
  approved material; dropping it is left to the owner.

## 2026-10-08 — premium pass: solar sky, paper in the room, one refusal anatomy, Sign in always there (P015-A1 to A3, D2, D3)

- A1: the painted course's sky follows the sun, not the clock (`solarSkyHour` in
  `scene-sky.ts`, `useSkyHour` in `use-hour.ts`): the sun's altitude where the
  viewer is (their time zone's point from the global light's `lightPlace`,
  `lib/sun.ts`; no location prompt, no team before sign-in) picks the keyframe
  hour that shows it, so a December 5:30 pm is dusk and a June 7 pm is still
  bright. The sky, the type over it (sign in, welcome, onboarding) and the scene
  read it; the greetings stay on the clock. A preview's fixed `hour` still pins
  the sky.
- A2: the sign-in sheet sits in the room: a fine fibre tile (a drawn image, not
  a live filter) and a wash of the light outside, at most 6% (`paperTint`): none
  by day, the sky's own ambient at twilight, a warm lamp at night. More contrast
  drops both. Not built: dithered sky gradients.
- A3 (D3): a refusal is the shared flush notice (its icon carries the tone, the
  words the ink; no fill, no ring), and a ring marks only the field the refusal
  names (an empty field). Wrong credentials name neither field, so neither is
  ringed; both stay `aria-invalid` and described by the notice.
- D2 (B1): Sign in is enabled as soon as the page is live and checks the fields
  when pressed (CH-15101); nothing is sent until both are filled.

## 2026-10-08 — premium pass: opaque onboarding paper (D1)

The onboarding reading surface (`.ch-ox-stage`) is opaque paper on desktop and
phone, light and dark: the course no longer shows through the fields and
password rules, and the backdrop blur is gone. Glass stays on the step pill and
the mark only.

## 2026-10-08 — dark: Clubhouse at night

Sign in, welcome, sign up and onboarding follow GolfHelm's dark theme
("Clubhouse at night"). The painted course keeps its own clock (veil, say line,
the phone's mark and the welcome's keyboard hint follow the hour); the panel,
the phone sheet and the welcome's reading scrim are night paper; the lockup ink,
link hover, focus and refusal halos, notices and the unlit Sign in key are
redrawn for the dark ground; the welcome's name line, which had no colour of its
own, takes the primary ink. Sign up's stationery pane, lockup, rail and Sign in
pills become dark glass and its literal inks the ramp's own; the felt tray, the
green choices, the crest, the member card and the seal stay card stock and felt.
Sign up keeps dark only when reached from a dark sign in: ThemeScript does not
run on `/golf/signup`, so a hard load there is light. Light mode is unchanged.

## 2026-10-08 — Forgot password lands in the panel; the phone greeting at 50px

```text
Design package: design/handoff/auth (approved with Q-96); no new board
PR/commit:      agent/clubhouse-frame-hero (uncommitted at writing)
Contract IDs:   CH-15920 (extended); no new codes
Actions:        none (the same requestPasswordResetAction)
Data impact:    none
Held items:     none
```

- With the flag on, a signed-out visit to `/golf/forgot-password` is sent to
  `/golf/login?view=forgot`, the panel's reset form (owner's choice). The
  check is the page's layout, on the server. A signed-in visitor keeps today's
  page, and with the flag off nothing changes. Neither page reads an email from
  the URL, so none is carried. Without JavaScript the panel still draws sign in
  (the view is read after hydration); neither reset form can send without
  JavaScript, today's included.
- The phone greeting is the board's 50px on a 390px phone (it was 46.8px). It
  scales down below 390 (48.1px at 375). One width step narrower (94, from 96)
  keeps "Good afternoon," on one line at the relaxed tracking. It measures
  341px of 346px at 390 and 328px of 331px at 375 in WebKit.

## 2026-10-07 — Sign up finished: handovers, the member card, progress and the issue

```text
Design package: design/handoff/auth (approved with Q-96); no new board
PR/commit:      agent/clubhouse-frame-hero, e1072802a (the follow-up below uncommitted at writing)
Contract IDs:   CH-15620 to CH-15624 (new, motion and feedback)
Actions:        none (the same validateAccessCode, signupAction, completePlayerOnboarding, submitDemoRequest)
Data impact:    none
Held items:     none
```

### Changed

- A question hands over to the next instead of cutting (CH-15620):
  - The leaving one fades the way the flow goes (up on Continue, down on Back)
    over the quick beat. It is held where it stood, out of the accessibility
    tree and the tab order.
  - The next rises 16px on the design's step curve, 60ms later. It no longer
    blurs in (the welcome's October 2 rule for text).
  - A long form scrolled down hands over at the top.
- Fixed: a double tap on a class year skipped the account question. A double tap
  on a request choice showed "We've got it" with nothing sent. A choice's timer
  firing after Back moved the flow on again. A move is now asked by the question
  on screen and is ignored once that question is gone. Back waits (held, in
  place) while the account, the profile or a request is being written, so what
  it makes lands where it belongs (CH-15620).
- The member card fills in without flickering (CH-15621):
  - A value's first appearance is still the design's brass flash. Later changes
    (each letter, each handicap step) turn it brass again where it stands, and
    it dries to ink once the answer rests. Each keystroke and slider step used
    to restart it from invisible.
  - The coin is green ink on the card's stock (the app's coin tones changed
    colour with each letter typed). It settles in as it goes from the silhouette
    to the monogram to the photo.
  - The values are drawn at the design's 15px again: a label selector had
    caught them at 11.5px. A long one ends in an ellipsis instead of a cut.
- The felt tray fits the card and its caption instead of running the pane's
  full height, with the light where the card rests. The card sits on the
  Frame's gilt edge. At narrower windows the card and its seal stay inside the
  tray.
- Progress moves (CH-15622): the rail's felt thumb slides to the current
  section and takes its width, and the labels turn ivory exactly under it. The
  phone's "2 of 5" sits over a hairline that fills.
- The issue is one reveal, on done and staff done only (CH-15623). It used to
  play on the intro, a sent request and a failed join as well.
  - Desktop: the card already on the tray lifts and is laid back, then the seal
    presses in.
  - Phone: the card arrives on the design's issue.
  - A request says "Received today", not "Issued today".
- Answers respond (CH-15624):
  - Green choices lift onto the primary hover and set down when pressed; year
    tiles sink when pressed; fields darken on hover.
  - A refused field keeps a red halo, takes the cursor and fades its error in.
  - A password rule met ticks in.
  - Done's next steps are whole-row targets with hover and press.
- Question headings take the owner's relaxed tracking (-0.026em) at 44px, so
  the longest still fits one line. The subtitle sits 2px further down.
- A Button drawn as a link keeps its ink: onboard.css's own link colour no
  longer reaches `.ch-btn`. The same fix in auth.css is the sign-in worker's.

### Why

The owner's finish pass: "Get sign in, onboarding, and all animations done."
Questions cut from one to the next, the card blinked on every keystroke, the
tray read as unfinished, and two double-tap paths skipped a step.

### Verification

- onboard.test (32) and onboard-logic.test (17) pass. 13 new tests name
  CH-15620 to CH-15624: the double taps, Back before a choice lands, Back held
  while the account is made, reduced motion and the card's ink.
- WebKit, every step plus the field and error states, before and after, at
  1440x900 and 390x844 (touch); the tray also at 1280, 1100 and 1024.
- rAF samples and 30fps video of the turn, the thumb, the card's ink and the
  issue (desktop and phone). Under reduced motion each lands in one frame.
- Each step change has one long frame (about 80 to 110ms) in headless WebKit,
  with or without this change. Hiding the course removes it (30ms), so it is the
  course behind the frosted pane, not the handover.
- Not run: physical iPhone and Safari, VoiceOver.

### Follow-up the same day

- CONTRACT's intro, DESIGN's boards and "Not built", and PAGE.md no longer
  call sign up and onboarding the next phase. "Not built" now lists what Q-96
  dropped.
- The manifest owns sign up and onboarding (`implementation.also`: the onboard
  screens, loader, route, `onboard.css` and `onboard-tokens.css`, with the
  onboard tests), so the changelog gate asks this log for them. Before,
  `onboard.css` was gated as a shared piece and the screens were gated nowhere.
- VERIFY: 16 screenshot rows (sign up, before and after), the tests row and a
  Looked at entry.
- The long frame on a step change, for a device check (no CSS shipped). Frame
  samples could not be taken today: the machine's load was 70 to 240 and the
  dev server took 72s per page.
  - Hypothesis: every step re-zooms the course camera (`zoomOf` differs per
    step). `GolfScene` promotes the camera only while it moves (`data-moving`
    sets `will-change` on `transitionrun` and clears it on `transitionend`), so
    each step builds a viewport-sized layer under the frosted pane, whose
    backdrop is blurred again, and tears it down 1.8s later. The pane's blur
    over a still course is the other suspect.
  - Candidate, one line in `onboard.css`: `.ch-ox-land .ch-au-cam { will-change:
    transform; }`, which keeps the camera on its own layer for all of sign up.
    The look is unchanged. The cost is a permanent full-screen layer, about
    12MB on a 390pt iPhone at 3x (1170 by 2532 pixels), more if WebKit draws
    it at the zoomed scale.
  - Check on a device: sample a step change with and without the rule, and with
    the pane's `backdrop-filter` off. Keep the rule only if it removes the long
    frame.

## 2026-10-07 — Reset password in the sign-in panel (up for owner review)

```text
Design package: none: owner decision (2026-10-07) via the team lead; no board, up for owner review
PR/commit:      agent/clubhouse-frame-hero (uncommitted at writing)
Contract IDs:   CH-15020, CH-15021, CH-15120, CH-15121, CH-15420, CH-15612, CH-15720, CH-15721, CH-15820,
                CH-15920 to CH-15922 (new); CH-15609, CH-15703, CH-15704 widened to the reset form
Actions:        requestPasswordResetAction (today's, unchanged)
Data impact:    none
Held items:     /golf/reset-password (the email's link) is still today's page
```

### Changed (reset password)

- "Forgot password?" opens a reset form in the panel instead of leaving the
  Clubhouse sign-in for today's page (CH-15920). The course, the lockup and the
  panel's chrome stay put; the view slides 12px the way the person is going and
  crossfades, and the desktop stage glides to its new centre (CH-15612).
- The reset form is today's page, redrawn:
  - The same `requestPasswordResetAction`, which answers alike whether or not
    the address has an account.
  - The same trim-and-lowercase, the same refusals for a missing or malformed
    address (CH-15120, CH-15121), cleared by editing.
  - The same words.
  - Send in flight is the lit key with "Sending reset link…" (CH-15420).
  - A failed request says so, and one that throws is logged (CH-15020,
    CH-15021).
- Check your email shows the address the link went to, with Back to sign in as
  the one action (CH-15921). The address travels between the views.
- The URL keeps `?view=forgot`, so the browser's Back returns to sign in and a
  reload opens the form. The links keep today's page as their href, for a new
  tab or no JavaScript (CH-15922).
- Focus moves with the view: the reset form's Email, or the new heading. The
  leaving view is hidden from assistive technology at once (CH-15820). Haptics:
  light on Send, success when asked for (CH-15720, CH-15721).
- The panel's paragraph spacing is the board's again. base.css's `.ch-root p {
  margin: 0 }` had taken the 10px (6px on a phone) from between the heading and
  the subtitle.
- Registry: CH-15420, CH-15920, CH-15921 and CH-15922 were first minted in the
  default categories (02 and 07) before their overrides existed. With the lead's
  approval they now map to 03, 12, 09 and 12 (`category-map.json`). The four
  first IDs are tombstoned and replaced: 150202 → 150302, 150702 → 151202,
  150703 → 150902, 150704 → 151203.
- The panel's text-link colour no longer reaches link keys
  (`.ch-au a:where(:not(.ch-btn))`). It had drawn sign up's "Enter a team code"
  and "Go to sign in" green on green.

### Why (reset password)

The Clubhouse sign-in sent "Forgot password?" to today's page, a different
design with a different frame: the one seam left in the front door. The owner
chose to bring it into the panel; the reset link's own page stays today's
because it builds the recovery session.

### Verification (reset password)

- WebKit at 1440x900 and 390x844 (touch): sign in → reset → a refusal → sending
  → check your email → browser Back → Forward → "Remember it? Sign in".
  - URL, focus and live heading were right at each step.
  - No page errors.
- A flip back within 60ms re-enters the same copy, with the address carried and
  focus on the heading.
- rAF samples of the view change:
  - Outgoing view: to 0 and −12px in about 180ms.
  - Incoming view: from 12px to rest in about 260ms.
  - Desktop stage: 190 to 219px, continuous.
  - Under reduced motion: one frame.
- auth-forgot.test: 8 tests, including a guard that today's page and the panel
  keep the same rules and words.

## 2026-10-07 — Sign in finished: the key, refusals and the form's motion

```text
Design package: design/handoff/auth (approved); no new board
PR/commit:      agent/clubhouse-frame-hero (uncommitted at writing)
Contract IDs:   CH-15607 to CH-15611 (new, motion); CH-15402, CH-15606 and the 150xx notes reworded
Actions:        none
Data impact:    none
Held items:     forgot and reset password are still today's pages (not Clubhouse); reported to the lead
```

### Changed (sign in)

- The Sign in key, when off because a field is empty, is an unlit key pressed
  into the paper (the soft well, its word engraved) instead of the shared 42%
  fade, which read as a washed-out grey-green. Filling both fields lights it
  over the quick beat. In flight it stays the lit green (it had faded with the
  disabled look), and "Sign in" crossfades to "Signing in…" in the same cell
  (CH-15607).
- A refusal keeps its place while the next attempt is in flight, at half
  strength, and the answer replaces it. Before, Sign in cleared it, so the
  button jumped up under the pointer (38px desktop, 75px phone) and back down on
  the next refusal. Where a refusal does move things, they glide there on
  transform only (CH-15608).
- A refusal about the fields shakes them once, the sign-up code's shake
  (CH-15609). The password eye crossfades between its glyphs (CH-15610). The
  Home link has a pressed tint and its chevron leans back on hover (CH-15611).
  Text links take a rounded focus ring.
- Copy and spacing:
  - The desktop subtitle no longer breaks "sign-" / "in.": one sentence a line.
  - A URL notice ("Password reset successfully…") sits with even space above and
    below.
  - "Good afternoon," holds one line on a phone (the greeting scales between
    40px and 50px).
  - The welcome's "or press Return" is ink, not secondary grey, over the
    fairway.
  - The legal links end on the footer hairline.
  - The phone's invalid group ring uses the danger token.
- The waving flags carry their resting shape, so the welcome's course no longer
  shows a bare pole for about 120ms as it takes over from sign in's (CH-15606).
- Preview: `&pending=1` holds Sign in in flight; `fail=empty` leaves the email
  empty.

### Why (sign in)

Owner direction (2026-10-07): production-ready, premium, all animations done.
The team lead's pass on sign in named the disabled key, the motion between
states and the rough edges.

### Verification (sign in)

- WebKit captures at 1440x900 and 390x844 (touch), before and after; see VERIFY.
- rAF frame sampling in WebKit:
  - Key lighting: 128ms.
  - Label crossfade: 187ms, with the key width constant at 360px.
  - Refusal glide: button 593 to 631px and form 192 to 155px, continuous; phone
    571 to 646px.
  - Shake: ±5px, 380ms, and it restarts on a second refusal.
  - Eye crossfade: 136ms.
- Under `reducedMotion: 'reduce'` and with Animations off, every one of these
  lands in a single frame.
- Flag pixels across the sign in → welcome route change: 3 bare frames before,
  none after.
- Return hint contrast on the fairway: 3.65–4.03 before, 6.38–7.05 after.
- Auth suites pass, with 6 new tests that carry the codes.

## 2026-10-06 — Display type relaxed

The owner found the display type too compact. Display headings on this page
widen (width axis 88 → 96) and the tightest tracking eases to -0.026em, as on
every Clubhouse page. Layout and content are unchanged.

<!-- clubhouse:release-audit:start -->

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 3 mapped
actions and 0 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p015-auth). Approved handoffs and contract IDs
are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first.

## 2026-10-06 — Motion import path moves to `motion/react`

```text
PR/commit:      #2153 (agent/deps-ui-upgrade)
Design package: none; no visual or behavior change
Contract IDs:   none
Data impact:    none
Held items:     none
```

Dependency upgrade only. `framer-motion` 13 is replaced by the `motion` 14
package, so this page's animation imports change from `framer-motion` to
`motion/react`. The animation API, durations, curves and reduced-motion gating
are unchanged; Motion 14 only removed internal compatibility APIs this tree
never used.

## 2026-10-02 — Clear welcome text over the hole

The owner’s Safari screenshot showed tree silhouettes competing with the
greeting. A stronger reading veil protects the heading and date; greeting blur
and glow are removed. The updates card uses an opaque floating surface and
translation without scale or backdrop blur. Credential behavior is unchanged.

## 2026-10-02 — A repeated submit sends one sign-in

Frontend Design Premium's interaction pass reproduced two requests from form
submissions dispatched before the busy button committed. Sign-in now sets a
synchronous gate before sending credentials. A failed attempt releases it for
Retry; a successful handoff keeps the existing pending state. CH-15402 remains
the contract. Auth, credentials and scene suites pass: 64 tests. The new
regression failed before the guard and passes after it.

## 2026-10-01 — Safari sign-in loads coherently and animates the hole

Branch: `codex/clubhouse-design-fidelity`. The current owner feedback asks for
the golf hole after Sign in. The phone crop and camera pivot now frame the pin,
cup and ball landing instead of locking onto the clubhouse. Its 2.6s gentle push
completes before automatic navigation. Reduced motion keeps the camera at rest.

Sign-in's fixed 352px art reservation now scales down with the small viewport;
the same scrollable sheet holds the form. The compact brand starts below the
actual safe area. A 213KB still of the existing course artwork ships with server
HTML and remains behind the independently loaded animation, so a slow or failed
chunk leaves an actual hole instead of the placeholder gradient. It is an
application artwork asset, not a verification screenshot. The poster uses the
same wide/tall SVG crop as the animation. Credential/session/invite behavior is
unchanged.

Verified local WebKit: form and course with JavaScript disabled; 375x568,
390x664 and 430x900 with the submit button inside the viewport; the full preview
Sign in → welcome with visible hole/ball → player Home sequence. Auth tests
cover server artwork, scene failure isolation, camera framing and existing
credential behavior. Physical Safari performance and a real account round-trip
remain unverified.

## 2026-10-01 — Phone: the welcome carries on by itself (Q-137)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (owner answer, iPhone brief)
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

- Below 820px the welcome proceeds 3.6s after it arms, once the greeting and
  the card have landed (`WELCOME_PHONE_AUTO_MS`). The fold into the dashboard
  still plays. Continue still goes sooner. The "or press Return" hint is not
  drawn on a phone. The desktop still waits for Continue.

## 2026-09-30 — Sign up and onboarding, and a smooth hand-off

```text
Design package: design/handoff/auth (owner, Q-96)
PR/commit:      agent/clubhouse (draft PR #2102)
Contract IDs:   CH-15010 to CH-15014, CH-15110 (sign up)
Data impact:    none (today's actions; demo_requests gains the 'signup' source and interest types its CHECK allows)
```

| Issue | Fix | Checked |
| --- | --- | --- |
| Sign up and onboarding existed only in today's style | The design's intro, code, name, class year, account, your game, photo and done, the staff path and Request access, over the same server actions (Q-96: no role picker, no head-coach path) | onboard.test, screenshots at 1440 and 390 |
| The class year chosen at sign-up was never saved | It is sent with the rest of the profile at the end | onboard.test (finish sends gradYear) |
| A 2032 tile would put a player under 13 | Tiles are the six classes still to graduate, less any year under 13; the guardian line stays | onboard-logic.test |
| The design's password rules were looser than the server's | The rules drawn are the server's own | onboard.test, onboard-logic.test |
| The design took HEIC and 10 MB photos the bucket refuses | JPEG, PNG, GIF and WebP up to 2 MB, refused before upload | onboard.test |
| "Good evening" was hard to read over the sky | A stronger scrim, a darker green line with a soft halo by day, a brighter gold with a dark halo at night | looked at |
| The wrong-password text arrived raw with no field marked | Reads as the design's, both fields marked, the attempts left kept (Q-98, Clubhouse only) | auth.test, auth-credentials.test |
| The welcome to the dashboard showed an empty page and then snapped | The fold's last frame is held over the route change and fades away once the dashboard is drawn | handoff.test, video |
| The welcome's course blinked at the route change from sign in | It no longer fades in again when sign in already drew it | video |
| The fold landed 8px off the dashboard's canvas | It lands on the sidebar's edge, on the sidebar's own green | video |

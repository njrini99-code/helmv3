# P015 — Auth: design handoff

## Package

```text
Source:   the owner's Claude Design bundle, design/handoff/auth/ (README.md, the boards, src/*.jsx and *.css, screenshots)
Boards:   Sign in.html, Sign in - Times of day.html, Sign in - Mobile.html (built);
          Sign up.html, Sign up - Mobile.html (phase 2, not built)
Date:     2026-09-30
Status:   approved for sign in and the welcome. Sign up and onboarding follow the same package, changed by Q-96
```

## Design objective

A calm, unhurried front door that feels like arriving at the course: a painted clubhouse hole whose sky is the viewer's
own hour, a quiet ivory form, and a welcome that greets the person by name before it gets out of the way.

## Problems being solved

The current sign-in is a generic form on a stock photo. It does not say whose product this is, it shows the raw
server text for a wrong password, and after signing in the person lands on a dashboard with no sense of what changed.

## User goal

Sign in without thinking, and arrive knowing what is waiting.

## Visual hierarchy

Sign in: the course, then the ivory panel, then the two fields and the button; the tagline and the mark are quiet.
Welcome: the greeting, then the name, then the card with what is new, then Continue. After dark the type is ivory.

## Components

### Reused Clubhouse primitives

`Button`, `Icon`, `useChPress`, `useChReducedMotion`, `useChPhone`, `haptic` (`lib/haptics.ts`), `chReport`, `CH_DUR`,
`clubhouseFontVariables`, and the `tokens.css`, `base.css` and `ui.css` the rest of Clubhouse uses.

### New Clubhouse components

`SignIn`, `SignInForm` (the same behaviour as the current form), `AuthNotice`,
`AuthFrame` (the page frame, the motion features and the phase), `Welcome`,
`WelcomeStage` (the course that stays put while the greeting streams in),
`SceneMount` (server-rendered course poster with a `next/dynamic` animated
overlay), `GolfScene` and `SceneLayers` (the painted course in layers: sky,
stars, clouds, birds, land, effects, foreground), and the pure modules
`scene-sky` (ten sky keyframes and `skyAt(hour)`), `scene-geometry` (the seeded
course), `scene-ball` (the flight), `sign-in-state` (each refusal's tone,
haptic, field and number), `auth-motion` (the welcome's variants), `use-hour`
(the viewer's clock, one shared store) and `use-query-param`. Data:
`data/welcome.ts` (server only) with `data/welcome-shape.ts` (pure).

### Modified components

`src/components/auth/golf-sign-in-form.tsx` (the current form) now imports its messages, stale-bundle guard and
destination rule from `src/lib/auth/golf-sign-in-logic.ts`, which this page shares. Its behaviour and its test are
unchanged. `src/clubhouse/gate.ts` gains `isClubhouseFrontDoor()`.

## Actions affected

The list is `config/clubhouse/pages/P015-auth.json` `actions`, and the graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md): 11 of them N/A here with a reason.

## Motion intent

This page takes its motion from the design's own README, not from v2's UI scale, and that is a scoped exception to D-64.
The reason is that the welcome is a cinematic moment and not interface: a 1.1s rise of a name out of a clipped line, a 5.2s
camera push, a 1.65s ball flight and a clipped-fold hand-off would all be wrong at 110 to 520ms. The exception is limited to
`src/clubhouse/screens/auth`, `styles/auth.css` and `styles/auth-tokens.css`. Nothing else in Clubhouse changes.

What is on the design's clock, and where it lives:

| Piece | Timing | Where |
| --- | --- | --- |
| Welcome's pieces | scrim 1.4s at 0.2s, mark 0.7s at 0.3s, date 0.5s, "Good morning," 1s at 0.64s with opacity and a 16px rise, the name 1.1s at 1.05s, the card 0.9s at 2.25s, each item 140ms after the one before from 2.55s | `auth-motion.ts` variants |
| Camera and ball | desktop push to 1.34 over 5.2s; phone push to 1.18 over 2.6s toward the hole; ball flight 1.65s, one hop, a roll to the cup | `auth-tokens.css`, `GolfScene`, `scene-ball` |
| Sign-in to welcome | form leaves, the course takes the frame, the veil and tagline fade, 720ms | `AuthFrame`, `OPENING_MS` |
| Hand-off | text slides left and fades 420ms, the course clips to the app canvas over 880ms, paper fades in, the destination is asked for at 1s; 520ms when there is nothing to fold into; a fade to ivory on the phone | `Welcome`, `HANDOFF_MS`, `auth.css` |
| Loops | flag wave, water shimmer, oaks, clouds, birds, stars | `auth-tokens.css`, `auth.css` |

How it stays inside the rest of the doctrine:

- Only transform and opacity are animated; the greeting never blurs. The camera is a CSS transform on one
  wrapper, `will-change` is set only while it moves, and the ball is a motion value written straight to two attributes, so
  nothing re-renders while it flies.
- Nothing uses `staggerChildren`: every piece carries its own delay, and an item's delay is its index times a step.
- Variants are defined outside components (`custom` carries `{ reduced, index }`), and the animation features load in their
  own chunk with `LazyMotion` and `m`.
- Reduced motion, and Animations off in Settings, make every transition 1ms, pause every loop, stop the camera short, put the
  ball on the green and turn the hand-off into a quick fade (CH-15605). The phone camera stays at its resting scale.
- Loops pause when the tab is hidden (CH-15606).

## Haptic intent

The README's table, through `haptics.ts`: light when Sign in is tapped, success when it lands, warning for an empty field, an
unverified email and a rate limit, error for refused credentials, an unreachable server, a stale bundle and anything
unexpected, and medium for Continue. Every other tap is silent. On the web none of it does anything.

## Responsive intent

One structure with the desktop's, switched in CSS at 820px (the same width as
`useChPhone`), so the server HTML fits both and nothing is chosen by sniffing a
device. On the phone: the course on top and the form on a sheet from
`clamp(200px, 42svh, 352px)`, grouped rows, the Forgot link under the button,
every control at least 44px, and the welcome full screen with the hole centred
and the list stacked. The keyboard scrolls the button above itself. The October
1 owner review explicitly calls for the hole after Sign in. The course poster
uses the same wide and tall viewboxes as the animated scene so initial rendering
and animation loading preserve that framing.

## Accessibility intent

A skip link is the first tab stop. A refused sign-in is read out as it appears and focus moves to the first invalid field. The
welcome announces its sentence once when it is final. The painted course is hidden from assistive technology. The password eye is
a named, pressed-state button. Text over the course holds contrast by day and flips to ivory after dark (`data-dark`).

## Data assumptions

- **Who is greeted.** A coach is "Coach" and their last name (`golf_coaches.full_name`; never "Coach Coach", never a bare
  "Coach"); a player is their first name (`golf_players.first_name`); otherwise the account's name; if nothing can be read the
  greeting stands alone (CH-15303).
- **The card.** The newest three unread items of `getUnifiedNotifications` (each has an icon by kind and a time). When there are
  none, the card says so truthfully; when the read failed it says "Updates didn't load" and never "You're all caught up"
  (CH-15201).
- **"Since you last signed in".** It reads `users.last_seen`, which the dashboard heartbeat writes and which is read before any
  heartbeat can overwrite it. It is last activity, not literally the last sign-in: Supabase's own `last_sign_in_at` has already
  been replaced by the sign-in that just happened. A person with no `last_seen` gets "Your first time in".
- **Time of day.** The viewer's own clock, read after hydration, re-read every 30 seconds and when the tab comes back. The
  server draws a neutral sky, so nothing mismatches on hydration. Morning is 4:30 to 12, afternoon 12 to 17, evening otherwise.

## Decisions

- **Flag, not a rewrite.** The current pages stay exactly as they are; `golf_clubhouse_front_door` chooses which one a visitor
  gets, in `login/layout.tsx` and `welcome/layout.tsx`. It was first called `golf_clubhouse_auth`; the flag registry refuses any
  flag whose name or purpose contains "auth", "login", "session" and so on, because a flag must never be able to gate access. The
  flag gates the page that is drawn and never whether someone can sign in.
- **One rulebook.** The messages, the stale-bundle guard and the destination rule live in `golf-sign-in-logic.ts`, used by both
  forms, so the two cannot drift.
- **Onboarding skips the welcome.** An account with no profile has no name to greet, so a sign-in that routes to onboarding goes
  there directly (an invite keeps its `joinCode`).
- **Phone welcome advances after its choreography.** Desktop waits for Continue or Return.
- **Scoped D-64 exception**, as above.

## Not built

- The dashboard-side reveal after the hand-off (the README's dashboard lifting in behind the fold). The welcome folds the course
  into the app canvas and then asks for the destination; the dashboard draws itself as it does for any visit.
- The card flying into the sidebar on the hand-off.
- The phone's sheet-rise hand-off (the phone fades to ivory instead).
- Sign up and onboarding (phase 2).

## Open owner questions

- **Wrong password.** The design's "Incorrect email or password. Please check your credentials and try again." with both fields
  marked is built for the text the current form maps to that message. When the server answers with its own words (for example
  "Invalid email or password (2 attempts remaining)"), those words are shown and no field is marked, as today (CH-15007). Should
  the attempts-remaining text also mark both fields?
- **"Updates didn't load".** This row is not on the boards (CH-15201). It keeps the card honest when the notifications read fails.
- **The last-visit label.** `users.last_seen` is last activity, so "Since you last signed in" can be a little later than the real
  last sign-in.
- **Date format.** The welcome's date uses the viewer's locale.

## October 2 readability correction

The welcome protects its heading and date with a wider, nearly opaque reading
veil. The hole remains visible below the greeting. Text has no glow or animated
blur, and the updates card uses an opaque floating surface without backdrop
blur. The card enters by opacity and translation rather than scale.

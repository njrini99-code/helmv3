# P001 — Shell: changelog

## 2026-10-08 — The phone dock and Resume round (P001-C1)

Approved by the owner on 2026-10-08.

- **The dock (CH-1820).** A band just above the phone tab bar, in the thumb's
  reach. A page lowers its primary controls into it with
  `<ThumbDock label>` (a window switch, a search); on desktop `ThumbDock`
  renders nothing and the page keeps them in place. The dock hides with the tab
  bar (a pushed screen, a full-page form) and while a field has focus, and the
  canvas grows by its height (`--ch-dock-h`, `.ch-dock-spacer`).
- **Resume round (CH-1821, CH-1822).** While the player has a round in progress
  (touched in the last 12 hours), a parchment accessory rides on the tab bar:
  "Round in progress, Oakmont CC · Hole 7". One tap opens the shot screen. It is
  never shown on the round's own screens. On desktop the sidebar's card slot
  resumes the round in place of the next event. The shell reads it with the
  next event (`loadClubhouseShell(teamId, playerId)`, the player's own
  `golf_rounds` row, RLS-scoped) and hides it if the read fails.
- Preview: `&round=1` on any screen.

## 2026-10-08 — A quieter selected row (P001-A2)

Approved by the owner on 2026-10-08.

- **The sidebar's selected row is a well, not a plate.** The bright ivory plate
  was the loudest object on the desktop and drew the eye from the page title.
  The selected row is now pressed into the frame instead: the frame's green a
  step darker, one champagne hairline (3:1 against the rows around it), ivory
  text and a champagne glyph (`--ch-nav-well-bg`, `--ch-nav-well-shadow`). The
  gliding plate (CH-1613) draws the same well. At night the well is cut from the
  night frame, so dark mode needs no rule of its own.

## 2026-10-08 — The global light (P001-A1, D3-1)

Approved by the owner on 2026-10-08 ("the ambient light has really transformed
the app").

- **One sun for the whole Clubhouse.** The shell computes the sun's altitude and
  azimuth locally (`lib/sun.ts`, NOAA's low-precision formula; no network) for
  the team's course location, or for the team's time zone until the course is
  set (`lib/light.ts` `ZONE_POINTS`, else the zone's offset meridian). It turns
  them into seven unitless numbers (`--ch-sun-x`, `-y`, `-dir`, `-intensity`,
  `-warmth`, `-night`, `-drift`), and `LightProvider` (`shell/light.tsx`) writes
  them on `<html>` every five minutes and when the tab comes back. Portaled
  sheets and menus share the frame's sun this way. The server and first paint
  draw noon, the CSS fallbacks.
- **What it lights.** tokens.css derives the rest per theme:
  - a sky across the green frame and the sidebar field (`--ch-light-sky`), the
    phone chassis bar (`--ch-light-bar`) and the parchment's top
    (`--ch-light-canvas`);
  - the paper's temperature, warm toward golden hour and cool at night
    (`--ch-light-paper`);
  - a 1px rim on the sun-facing top and side of cards, sheets, keys and the tab
    bar (`--ch-light-rim`, `--ch-light-rim-x` inside the elevation tokens);
  - contact shadows that lean up to 6px away from the light
    (`--ch-light-drift*`).

  Morning light comes from the left and evening light from the right, as in the
  sign-in sky. The dark theme keeps its own faint, cool moonlight and no paper
  tint. Nothing is drawn over data, and nothing animates: the values change in
  place.
- **For TS consumers,** `useClubhouseLight()` returns the same numbers. The dev
  preview holds the light with `?at=HH:MM` in the fixture team's zone.
- **Not yet.** The course location needs a column on `golf_team_settings`
  (proposed to the lead). Until then every team's sun is its time zone's.

## 2026-10-08 — The page under a screen, a skeleton's reveal, pull to refresh

Approved by the owner on 2026-10-08.

- **The page under a pushed screen (CH-1618).** As a phone screen slides in,
  the page it covers (the top bar, the tab bar and the page) draws back about a
  quarter of the width and dims under a light warm scrim, on the screen's own
  smooth spring, and comes back with it over the base ease-out as it pops. The
  scrim's animation drives the page frame by frame, so the two edges never part,
  and a pop that cuts a push short reverses both from where they are. A screen
  with another pushed over it does the same. A Back that iOS animated itself
  puts the page back at once (CH-1908). Reduced motion and Animations off keep
  the page still. The screens are fixed inside the page, and a transform on any
  of their ancestors would pin them to it, so those wrappers stay put and their
  other children move (`PhoneUnderlay`, `usePhonePushed`).
- **The top bar under a sheet or a screen.** On a phone page scrolled down,
  opening a sheet or pushing a screen took the green top bar off the screen
  until it closed: the scroll lock made the body a scroller, and the sticky bar
  stuck to it, a scroll's height above the view. The lock now clips the body
  instead, and leaves the phone's canvas alone (lib/overlay-scroll.ts).
- **A page over its skeleton (CH-1619).** A page that arrives in place of its
  route skeleton after a navigation fades in over the press beat, opacity only.
  The fade waits for the page's first paint. Never on the first paint of a
  server-rendered page, never again on a refresh, and not with reduced motion or
  Animations off (`RouteFrame`).
- **Pull to refresh in the iPhone app (CH-1909, CH-1622, CH-1709).** At the top
  of a phone page a downward pull brings the parchment sheet down off the green
  chassis with UIKit's rubber band, the spinner's spokes coming in as it goes.
  Past 64px the medium tap fires once and the page reads again; let go, the
  sheet rests at the spinner and springs home when the read has landed. There is
  no native refresh plugin in the app, so the page draws its own; mobile Safari
  keeps its own pull (`PullToRefresh`).

Checked in WebKit at 390 (touch), sampled each frame:

- **Push.** The page lands at −94px (24% of 390). On every sampled frame it sits
  within a pixel of 0.24 times the screen's travel, with the scrim on the same
  curve (screen at 170px, page at −53px, scrim 0.564).
- **Pop.** The page returns on the screen's ease-out. Popped mid-push at about
  160ms, both reverse from where they are (screen at 129px, page at −63px).
- **A Back iOS animated.** The screen is gone, the page at 0 and the scrim at 0
  in the same frame.
- **Nested.** Details over a thread: the thread draws back to −94px and its veil
  reaches 1.0 in step.
- **Scrolled 300px.** The top bar stays at the top through push and pop; before,
  it sat at −300px.
- **Reduced motion and Animations off.** The page holds at 0 and the screen is
  in place on the first frame.
- **A page over its skeleton.** Roster's page was at opacity 0 on its first
  frame, 0.86 35ms later and 1 by 100ms. With reduced motion, and on a first
  paint, there was no fade.
- **Pull to refresh.** Simulated touches with the app's body class. A 220px pull
  followed the finger with resistance to 108px, turned the spinner at 64px, sent
  one refresh, held at 52px and sprang home once the read landed. A pull short
  of the trigger, a first move upward and Safari did nothing.

## 2026-10-08 — The offline refusal writes "you’re offline"

The shared action hook's offline toast (CH-1903, `lib/use-action.ts`) ends
"…: you’re offline" with the typographic apostrophe, as Settings, Messages and
Calendar already wrote theirs; every page whose saves go through `useAction`
reads it so. The words before it are the page's own; copy-apostrophes.test
holds Calendar, Team Hub, Messages, Settings, Home, Stats, Roster and
Recruiting to the curly marks.

## 2026-10-08 — The preview hands the frame its query

The dev preview (`src/app/clubhouse-preview/[screen]/page.tsx`) passes its own
query to `ClubhouseFrame` as `search`, as the live shell passes the address's,
so `&section=` and a coach's `&player=` decide the preview's phone bar too
(CH-1402). Checked in WebKit at 390 (touch), loading to loaded: Settings with
`&section=team` and `&section=account` loads and lands under "‹ Settings" (0px);
an unknown section and the bare page under "‹ More" (0px); a coach's player with
`&player=p1` under "‹ Team" and "Player stats" (0px), the page adding Share. The
preview's player screen without `&player=` is still the team's address, so it
loads under the Stats tab root's bar, as the live address would.

## 2026-10-08 — The hero bell shows keyboard focus

On Home's green bar the bell showed no focus at all (CH-1806): the keys' green
focus shadow lost to the disc's own ring, and its green would have vanished on
the hero anyway. It now takes a champagne outline 2px off the disc, with no
shadow; at rest it is unchanged. Checked in WebKit at 390: reached with
Option-Tab, it matches `:focus-visible` with a 2px `#dccda6` outline at offset 0
and only its own inset ring for a shadow; the bar at rest is pixel-identical.

## 2026-10-08 — The pushed bar for forms, Settings sections and a coach's player

- **Forms (CH-1402).** The coach's qualifier forms (new and edit) load under
  their own bar: the plain Cancel and the form's title, where the form puts
  them, with the tab bar already hidden; the form adds Create or Save. They
  loaded under the tab root's title and bell with the tab bar showing, then
  changed both. A player's new round and the round itself keep their own chrome
  (the band's Back and the plain bar, P011 111903), and now hide the tab bar
  from their first frame too (`phoneFullScreen`), so it no longer shows while
  they load and leaves as they arrive.
- **The query (CH-1402).** `ClubhouseShell` hands the address's query to the
  frame (`useSearchParams`; the dashboard renders per request, so the server
  reads it too). A Settings section named in the address (`?section=`, or the
  old `/settings/notifications` and `/settings/coaching-intelligence`) loads
  under "‹ Settings", as SettingsPhone pushes it; a coach's player on Stats
  (`?player=`) under "‹ Team" and "Player stats". Both used to load under the
  list's or the team's bar and swap the back link when the page arrived.
- Manage selections' bar is the coach's only: a player there meets the
  coach-only notice, under the plain bar.

Checked in WebKit at 390 (touch): the new and edited qualifier, loading to
loaded, Cancel and the title moved 0px with the tab bar hidden in both (before:
the tab root's title and bell, the tab bar showing); Manage selections and the
earlier routes unchanged. The Settings-section and player bars are checked in
`shell.test` only: the preview hands the frame no query yet.

## 2026-10-08 — A pushed page's bar from its first frame, 44 by 44 keys, and choices that answer a press

- **The pushed bar while a page loads (CH-1402).** On the phone a page opened
  from More (a coach's Roster, Recruiting, Qualifiers, Team Hub and Messages; a
  player's Calendar, Roster, My stats, Qualifiers, My qualifiers and Classes;
  Settings for both) and a page below another (a qualifier, its selections, a
  round, recovery) loaded under the tab root's bar, the title at the left and
  the bell, then jumped to "‹ More" and a centred title when the page arrived:
  the largest shift left on the phone. The shell now draws that bar from the
  address (`phonePushedTop` in `shell/nav.ts`, `PushedTopStandIn` in
  `shell/phone-chrome.tsx`), in the loading state and in the server's first
  paint. The page's own bar replaces it where it stood and adds its action; Back
  works while the page loads. The stand-in's title is plain text, so the heading
  stays the page's. `PhoneTop` and the chrome hooks (`usePhoneImmersive`,
  `usePhoneHero`, `usePhoneTabsHidden`) now take hold in a layout effect, in the
  commit that mounts them, so the bars never show a frame of the last page's
  state. The bar title's tracking is its own (`.ch-pbar__title`), no longer the
  app's global h1 rule, so plain text and the h1 match to the pixel. If Home's
  skeleton holds the green hero for a moment on a cold load of a pushed address,
  the team gives way to the address's back link and title.
- **44 by 44 (CH-1815).** A pushed screen's bar drew a hairline inside its 50px,
  so its row was 43px and its 44px back link and text action stood half a pixel
  out of it; it has no hairline now, as the shell bar. The hero bell's 40px disc
  sits in a 44px key (a clear 2px border), where it was drawn. A sheet's Close,
  with a title alone, was clipped to 44 by 43 by its scrolling header; its reach
  now leans up into the header's padding. The search field carries its own reach
  (Clubhouse changelog).
- **A press on a choice (CH-1617).** A segmented option or a pill that isn't on
  takes the press tint over the press beat, after the 50ms delay; the kit's
  feature card answers with a shade instead of a 0.985 scale.

Checked in WebKit at 390 (touch), machine load 9 to 14:

- Loading to loaded, back link and title (the text's own box): 0px on all 11
  pushed routes in the preview (Roster for both roles, Recruiting, Qualifiers
  for both, My qualifiers, Settings, Team Hub, Messages, Classes, a round).
  Measured before on four of them (Roster, Recruiting, Qualifiers, Settings):
  loading drew the tab root's title and bell. Sampled every frame from first
  paint through hydration (Roster loaded and loading, Settings, Recruiting, a
  round, Team Hub, Classes): the pushed bar with one back link in every frame,
  never the tab root's. Tab roots are unchanged (the coach's Calendar still
  trades the bell for its New event key on load).
- Keys: a pushed screen's back link and Edit 44 by 44 at y 0 (were 44 at y -0.5,
  hit 43.5); a thread's bare back 44; the hero bell 44 by 44 at 340,0 (was 40 by
  40), pixel-identical at rest; a title-only sheet's Close hit 44 by 44 (was 44
  by 43); the search field hit 44 tall from a 36px drawn field (3px outside
  lands on it, 5px outside on the page), its input 16px, its clear key clearing,
  in the page (Rounds, Recruiting) and in a sheet (the course picker).
- A held segment tints to `--ch-ledger-row-press` after the delay, scale none,
  and the chip moves on release.
- The preview's qualifier screens use `/golf/dashboard/qualifiers` for every
  state, so their `?state=loading` shows the list's bar; the real addresses draw
  the qualifier's.

## 2026-10-08 — The bell, Not rebuilt and the way back, in the shared states

The bell's empty (CH-1302, CH-1303) is the shared section empty and its failed
list (CH-1201) the notice, both at the rows' inset; while the list hasn't
loaded, the panel's head drops its unread count and Mark all read. Not rebuilt
(CH-1301) is the page empty's anatomy, not a card. The route error's way back
honours the route's `homePath` and names it (CH-1206). The on-green notice inks
are tokens (`--ch-notice-on-green-ink`, `--ch-notice-on-green-body`).

CH-1210 also holds on the phone in development: a section that crashes in the
commit that mounts it (the phone tree mounts after hydration) tells its group
again when StrictMode, or React's `<Activity>`, detaches and reattaches it
(`componentDidMount`). Found by phone-a on stats__crash at 390.

## 2026-10-08 — Springs in the shell, and a tab that answers a second tap

More and the bell now rise on the smooth spring (base, no bounce) and leave on
it. Swiped shut, they leave at the speed they were thrown (CH-1602, CH-1612,
CH-1611). A pushed phone screen slides in on the same spring and leaves over the
base ease-out, so the page beneath is free again at once (CH-1610). The sidebar
plate also glides on it, and a second row tapped mid-glide sends it on from
where it is, at its speed. Toward a row too near to stop at from that speed, it
starts slower instead, so it never passes the row (CH-1613). A sheet thrown back
up carries on a little past its open position over its own floor, and a finger
can catch it on the way (CH-1611).

Tapping the tab that is already open now does what a UIKit tab bar does, without
a tick. A pushed screen or section pops back to the tab's root, and at the root
the page scrolls to the top (CH-1907). When iOS has already animated a Back with
its edge swipe (`hasUAVisualTransition`), the Back shows once: the pushed screen
leaves at once and the page crossfade does not run (CH-1908). The More sheet's
rows tint after a 50ms beat, so a drag or a scroll never flashes them (CH-1606).
The springs are a D-64 extension: a lead decision under the owner's full-auto
brief, which the owner confirmed on 2026-10-08.

Machine load ran from 70 to 290 for most of the work, so the springs are checked
first by their curves, not by frame timing. Each check is one of two kinds:
framer's own spring generator sampled at fixed times, or a WebKit animation read
through `getAnimations()` and seeked while paused. All run against a harness of
the real components (390px, touch).

- framer's generator, given the stiffness and damping `chSpring` passes, draws
  the same curve as the duration-and-bounce form from rest (largest difference
  0px). Smooth is at 59.8% at 100ms and 96.7% at 260ms, within 0.5px of 100 at
  369ms, and never past its mark. Settle passes it by 0.13%.
- Handed 2000px/s, that form starts at 2000px/s, where the duration-and-bounce
  form starts at 0. Retargeted at 80ms, it carries on at 648px/s; the other
  drops to 0.
- The `Modal` sheet rises on a 462ms CSS animation whose `linear()` easing holds
  the token's 30 values. Seeked, it is within 0.001 of the spring at every
  sampled time.
- Thrown at 1.5px/ms, the `Modal` exit starts 24px on, one frame at the throw
  speed. It runs at 1.74, then 1.97px/ms (8ms seeks) and ends off screen at
  367ms.
- Let go 40px down while moving up at 1.5px/ms, More springs back over 288ms. It
  passes its open position by 3.96px at 112ms, over a seamless floor. A finger
  landing there holds it at -3.96px.
- The sidebar plate glides 200px in 408ms over 27 keyframes, never past its row.
  Sent on at about 100ms, its new glide starts within 1.4px of where it was, and
  it passes no row by more than half a pixel.
- Pulled up 160px, the sheet gives 47px over its floor.
- A Back flagged `hasUAVisualTransition` removes the pushed screen on the first
  frame.
- With reduced motion, the `Modal` fades in 1ms and the plate jumps with no animation.
- Frame-sampled once load fell to 14 to 18 (headless WebKit draws about every 10ms):
  - More rises within half a pixel at 474ms and closes by the scrim in 446ms.
  - Thrown at 2.4px/ms, More runs 3.8 to 4.3px/ms and is gone at 431ms; the old
    fixed ease-out started near 10px/ms. Its first frame runs faster (6.7px/ms),
    because the 16ms lead is sized for the 60Hz frame of WKWebView and Safari.
  - The band springs back in 330ms. The plate is within half a pixel at 403ms,
    and a second tap never drops its speed.
  - A pushed screen is within half a pixel at 463ms. The pill passes its mark by
    0.22px of 147px; nothing else passes.

## 2026-10-08 — The shared states, drawn as the Ledger draws

`shell.css` now draws the shared states as flush Ledger pieces (see the
Clubhouse changelog):

- The section empty is a left-aligned line.
- The page empty keeps measured air under the framed head.
- The notice drops the pink box and draws nothing of its own: no fill, ring or
  stripe, its icon on the heading's edge, between the section's own rules (the
  2px danger stripe was dropped the same day; side stripes are avoided). In the
  bell it takes the rows' 10px inset.
- The route error is the page empty in a brick danger tone, with no card.
- On desktop Ledger pages, a skeleton block is a rule with two lines of type.
- The kit's PageIntro eyebrow is 12px (`ui.css`), the F09 phone text floor.

New: CH-1209, one notice with one Try again when several parts of a page fail;
CH-1210, the same for sections that crash together (`SectionGroup`,
`SectionGroupNotice`); CH-1211, the danger page for a page whose one read
failed (`EmptyState size="page" tone="danger"`).

## 2026-10-08 — The tab bar in Safari is one toolbar with Safari's

Opened in mobile Safari rather than the app, the phone tab bar used to float as
a pill above Safari's own floating controls: two pills stacked, with the page
showing between them. The owner chose to merge them. Outside the app
(`body:not(.capacitor)`), the bar is now a full-width shelf on the bottom edge,
square to the screen with one hairline on top, and Safari tints its controls'
strip from it. The app keeps the floating pill. Owner check on an iPhone is
pending.

## 2026-10-07 — The sidebar plate glides

The selected row's ivory plate is now one object that travels (CH-1613,
`shell/NavPlate.tsx`). On the first frame of a tap (`LinkPending`) it glides
to the new row at the base duration, and the rows' ink follows at the same
pace, instead of one row switching off and another on. It lands without
travelling on first paint and on resize, and jumps with reduced motion or
Animations off. Until it has measured, and wherever script never runs, each
row still draws its own plate. Measured in WebKit: Home to Stats, 0 to 267px in
about 210ms on the ease-out.

## 2026-10-07 — Framed workspace, replacing the ivory sidebar and canopy

The sidebar and frame are the frame green again, with the brand in its own
panel and an ivory plate for the selected row. The desktop canvas is the
parchment workspace with a left-edge green bleed and a top-left mist. The
canopy's green field and scroll-settling top bar are removed; the top bar is a
parchment glass. `main[data-canopy]` now means the framed page head (see the
Clubhouse changelog).

## 2026-10-07 — Canopy top bar at rest

On canopy pages the top bar's resting state is clear over the green with ivory
ink, and scrolling settles it into the ivory glass. A page too short to scroll
(the timeline is inactive) keeps the clear bar instead of a tinted glass. Where
scroll-driven animations are unsupported, the bar is the solid field green.

## 2026-10-07 — Ivory sidebar and canopy

The sidebar and frame are ivory, the selected row is a green key, the brand uses
the green mark with a serif wordmark, and the next-event card is a light sheet.
The shared canopy (`main[data-canopy]`) and its scroll-settling top bar live in
shell.css.

## 2026-10-06 — Smooth scroll and materials

The phone tab bar floats as a glass capsule above the safe area, and the canvas
reserves its height. Desktop wheel scrolling eases through the canvas scroller
(shared smooth scroll); route changes and Back restoration land instantly.
Sidebar brand, nav item and next-event radii are on the scale.

## 2026-10-06 — Popup geometry and focus styling

Native-dialog menus use their dialog's top layer and reserve keyboard space.
Tall menus and desktop team listboxes scroll within their available height.
Reading-destination headings retain accessible focus without a control outline;
shared buttons retain their existing rounded focus ring without a second box.
Settings form/list sheets initially focus their labelled heading. Source,
regression and local browser evidence is in [POPUP_AUDIT](../../POPUP_AUDIT.md).

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

Shared Menu, TeamSwitch, OfflineBanner and Toast now use zero-duration
transitions when motion is disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 8 mapped
actions and 6 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p001-shell). Approved handoffs and contract IDs
are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

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

## 2026-10-02 — Slow feedback follows its request

```text
PR/commit:      codex/clubhouse-design-fidelity (PR #2121)
Design package: existing toast material, durations and action behavior
Contract IDs:   CH-1902, CH-4902, CH-5902
Data impact:    none; dismissing feedback does not cancel a write
Held items:     physical iPhone Safari acceptance
```

The shared toast lifetime and delayed-feedback helper remove obsolete progress
notices when a request completes, is replaced or loses its mounted owner.
Stats period changes, shared actions, Messages and manual Settings saves use
the same lifecycle. Old cleanup cannot remove newer feedback. Confirmation
and error durations, Retry, pending-write and unknown-outcome guards remain
unchanged. Final regression evidence is recorded in VERIFY.md.

## 2026-10-02 — Native custom overlays share one lifecycle

```text
PR/commit:      codex/clubhouse-design-fidelity (PR #2121)
Design package: approved boards; bars and dismissal policy unchanged
Contract IDs:   CH-1610, CH-1611, CH-1802
Data impact:    none; client dialog/scroll/focus/gesture lifecycle only
Held items:     physical iPhone keyboard and gesture validation
```

Shared Modal and custom native sheets/drawers now retain the last open content
and ref-counted page lock until transform/opacity exit completes. Reopen cancels
stale completions; unmount closes while the lock remains held. Opener focus uses
preventScroll. Custom bars and dismissal guards keep their existing semantics.

Targeted checks: 351 tests pass across the final focused runs; scoped ESLint and
diff check exit 0. Runtime evidence is recorded in this page's VERIFY entry.

## 2026-10-02 — Stable sheet and pushed-screen lifecycle

```text
Design package: existing owner phone sheets and right-side pushed screens
PR/commit:      codex/clubhouse-design-fidelity (working tree after 72fa726)
Contract IDs:   CH-1610, CH-1611, CH-1802, CH-1809; strengthened existing behavior
Actions:        existing open, close, drag and Back only
Data impact:    no API, schema or customer writes
Held items:     physical iPhone gesture/frame pacing and native keyboard validation
```

A shared reference-counted lock freezes the page at its existing visual position
until every nested or exiting overlay leaves. Closing More or a dialog restores
its original page scroll; navigating to another route keeps the new route at the
top. Pushed screens hold the same lock through their Framer exit and restore
focus
without scrolling. Phone More and Bell focus also avoids moving the page.

Native dialogs retain their content through a 260ms transform/opacity exit;
rapid reopening cancels the old exit instead of closing the new sheet. Nested
dialogs have distinct accessible title IDs. Sheet drags belong to one primary
pointer, ignore another finger, and cancel cleanly. Reduced-motion pushed
screens, More and Bell settle immediately. No arbitrary transition delay added.

Broader CI found four page test files without the existing jsdom dialog
polyfill. They now import the same modal API support as other Clubhouse suites;
assertions and runtime code remain unchanged.

## 2026-10-02 — Shared scrollbar ownership and design context

The Frontend Design Premium review now points to the existing page handoffs via
root DESIGN.md and the Clubhouse UI ownership index. Runtime tokens remain the
source of CSS. A scoped scrollbar baseline provides both standard and WebKit
styling, using existing ink/radius tokens. Page-specific hidden horizontal
strips retain their geometry. Forced colors restore browser defaults.

WebKit computed styles verify thin themed scrollbars and native scrolling;
forced colors verify automatic color/width. The body outside Clubhouse stays
at browser defaults. No navigation or page hierarchy changes.

## 2026-10-01 — Safari header, surface depth and crossfade

Branch: `codex/clubhouse-design-fidelity`. The supplied mobile photo showed the
wide wordmark compressed into 22px. Home now uses the existing compact GolfHelm
mark in the board's ivory medallion, with readable team text. The solid hero bar
no longer applies backdrop blur. Shared cards and wells recover the handoff's
graded surface and highlight; Messages has its own raised bubble treatment. The
named page crossfade uses simultaneous 180ms opacity animation and selectors
supported without transition classes. Browser edges now read the actual page
tokens, create a missing theme-color tag and restore it on unmount or resize. No
navigation destinations or access controls change.

## 2026-10-01 — Kept screen state never disagrees with hydration

`useChSessionState` (`src/clubhouse/lib/session-state.ts`) draws the default
while React hydrates server markup and the kept value in the render straight
after. A part of a hard load that streams in after the app is marked running
(a route's Suspense) used to read the kept filter or search during hydration
and disagree with the server's markup (Qualifiers review S1; Roster, Calendar
and the Rounds library share the hook). Test: `session-state.test.tsx`
(hydrateRoot over server markup, mutation-checked).

## 2026-10-01 — High-fidelity audit: no staggered reveal, honest press, flat cards, phone type

Owner answers on the high-fidelity audit (PROGRESS Q-139).

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (owner decisions on the audit)
Contract IDs:   none new (CH-1601, CH-1606 behaviour changed)
Actions:        none
Data impact:    none
Held items:     none
```

- **Reveals (audit F01).** The staggered first-paint reveal is gone; a page is
  shown as soon as it is ready and the crossfade is its only entrance. The
  RouteFrame guard that stopped the reveal replaying is gone with it. An
  empty page fades in once instead of in steps.
- **Press (audit F02).** Only `.ch-btn` (and `data-ch-press`) up to 240px
  wide compress; rows, links, tabs and cards do not. A release springs back
  from where the press got to, and a second press lets the first go.
- **Materials (audit F04).** Cards (`--ch-sheet-*`) are flat ivory with a
  hairline and one light lift; content wells are a flat tint. Glass stays on
  the top bar and tab bar (20px, was 34px) with an opaque fallback when
  backdrop-filter is missing or the OS asks for less transparency.
  Popovers are opaque. Controls keep their tactile wells and raised pills.
- **Phone type (audit F09).** Below 820px the type tokens are 16px reading,
  14px secondary, 13-14px labels and 13px captions; tab labels 11.5px (were
  10.5px). Literal sizes in page CSS move to the tokens page by page.
- Not verified on a device; jsdom and the CSS checks only.

## 2026-10-01 — A team switch never shows the old team under the new name

PAGE_PERFORMANCE.md rules 4 and 8.

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none
Contract IDs:   none new (CH-1003, CH-1813, CH-1814 unchanged)
Actions:        setActiveTeam (unchanged)
Data impact:    none
Held items:     none
```

- **Switching mark.** The new team's name still shows on the tap. Until the
  new team's page commits, the old page fades out and takes no taps:
  `.ch-root[data-ch-switching]`, with `#ch-content` aria-busy. The refresh
  runs in a transition, so the mark lifts in the commit that draws the new
  page. A refused or failed switch lifts it too.
- **Toasts are team-scoped.** `ToastProvider scope` is the team. A switch
  clears the stack, so an old team's Undo or Retry cannot act from the new
  team's page.
- **Failed team read.** A coach whose team could not be read gets the route
  error with a retry. It never shows "not on a team yet" and never the default
  team (`resolveCoachActiveTeam`).

## 2026-10-01 — Page changes crossfade; a nav tap shows at once

Owner, 2026-10-01: "Everything page transition and load needs to be extremely
smooth and accurate" (crossfade chosen over a slide or none).

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (Next.js 16 view-transitions guide, `useLinkStatus`)
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

- **Crossfade.** `RouteFrame` wraps the page in React's `<ViewTransition>`,
  keyed by route: the old page fades out in 120ms and the new one fades in
  over 200ms a beat later, in opacity only. The shell (sidebar, top bar, tab
  bar) is anchored and never fades; taps pass through while it runs. Reduced
  motion and Settings › Animations off swap at once. Tokens on `<html>`
  (`--ch-dur-vt-*`), every rule scoped to a Clubhouse document.
- **Pending.** `LinkPending` inside each sidebar and tab-bar link: the tapped
  item takes the selected look on the first frame and the old one lets go, and
  a hairline sweeps across the top only if the page takes longer than
  `--ch-dur-press`. "Loading" is announced once.
- **Checked.** Five sidebar navigations on a local stack: each ran one view
  transition with only the page named (`ch-page`), layout shift 0. Clubhouse
  suites 2667/2667; `clubhouse:check` clean.

## 2026-10-01 — The team switcher: a head coach on two or more teams switches teams (owner, Q-130)

```text
PR/commit:      agent/swap-audit: 67f40c962, a928a9416
Design package: design/handoff/ (v2): sidebar.css and the boards' team chip (the team under GolfHelm with
                chevrons-up-down), m-ch.jsx MoreM (the me card's chevrons-up-down); the popover is the design
                system's PopoverPanel
Contract IDs:   10103, 10405, 10611, 10803, 11707, 11813, 11814 (catalog CH-1003, CH-1305, CH-1707, CH-1813, CH-1814)
Actions:        ACT-P001-SWITCH-TEAM
Data impact:    none new. Reads the staff rows and teams the layout already reads (`userData.coachTeams`,
                `canSwitchTeams`); `setActiveTeam` (existing, shared with Fairway) writes the `golf_active_team` cookie.
Held items:     none
```

- **Issue.** A head coach staffed on two teams (men's and women's) could not
  switch teams in Clubhouse, as Fairway lets them. The boards draw a team chip
  with chevrons that did nothing, and the switcher had been a recorded non-goal.
- **Fix.** For a head coach on two or more teams (`canSwitchTeams`, the gate
  `setActiveTeam` enforces, so an assistant is never offered a switch the server
  refuses) the sidebar's brand block is a menu button that opens a listbox of
  the
  teams (arrows, Home, End, Enter, Esc, focus back), and the phone More sheet
  lists the teams under who they are. A pick calls `setActiveTeam`, shows the
  new
  team at once, refreshes every screen, and the route remounts for the new team
  (`RouteFrame` is keyed by pathname and team). A refusal or a network failure
  is
  a toast (CH-1003) with the reason, no Retry when trying again cannot help, and
  the team goes back. A coach on one team, an assistant and a player keep the
  plain
  label (CH-1305). The More sheet scrolls on a short screen, for every role.
- **Checked.** `team-switch.test.tsx` 16/16 (removing the `canSwitchTeams` gate
  fails 2); the Clubhouse suite 2515/2515; `clubhouse:check` clean; a browser
  pass
  at 1280 and 390 (the popover, the sheet, a refused switch). Not exercised: a
  switch that lands (the preview has no session), and a device pass of the
  sheet.
- **Open.** With `HELM_CLUBHOUSE_TEAMS` set, a head coach who switches to a team
  that is not listed gets Fairway for it.

## 2026-10-01 — Team allowlist for the first activation; the remaining old addresses open Clubhouse screens; a failed sync reports; server events carry the UI tag (swap audit §14, §18, Q-131)

```text
PR/commit:      agent/swap-audit (#2111): a49a75f6a, 6daf50afc, 5c4a9c33a, 8a1dd47f8, a99fa9638
Design package: none (no visual change)
Contract IDs:   none new
Actions:        none
Data impact:    none (reads only). New server env HELM_CLUBHOUSE_TEAMS (unset = every team).
Held items:     none
```

- **Gate.** `isClubhouseFor` is async. With `HELM_CLUBHOUSE_TEAMS` set, only
  the signed-in user's active team gets Clubhouse, and a failed team read
  falls back to Fairway; unset, the flag alone decides (Q-131). Every call
  site awaits it.
- **Old addresses.** Player pages, game, print and genome open the Stats
  profile; genome compare and a coach's `/rounds` open Team stats; `/team`
  opens Settings (Team or Golf); `/courses` and `/whats-new` open Home;
  `/intelligence` opens CoachHelm; the old qualifying workspace opens that
  qualifier's selection; a player's CoachHelm chat opens CoachHelm.
- **Push.** A tapped notification's absolute URL is reduced to a same-origin
  path before the guard, so taps open their screen (both UIs, §14 D5).
- **Observability.** `OfflineSync` reports every failed item to Sentry (high
  once retries end); `chLogServer` events carry `ui` and `surface` tags.
- **Checked.** `gate.test.ts`, `gate-allowlist.test.ts` 5/5; `alias.test.ts`
  8/8; `offline-sync.test.tsx` 4/4; `safe-redirect.test.ts` 11/11.

## 2026-09-30 — The shell starts the offline sync engine (swap audit F-14)

```text
PR/commit:      agent/clubhouse (release train #2110)
Design package: none (swap audit fix, no visual change)
Contract IDs:   none (no UI)
Actions:        none
Data impact:    `shell/OfflineSync.tsx` (new, no UI) is mounted in `ClubhouseShell`; it initializes `getSyncEngine()` and feeds `useOfflineSyncStore`, as the Fairway shell's `OfflineProvider` does. No schema change.
Held items:     none
```

- **Issue.** Only the Fairway shell started the sync engine. Under Clubhouse, a
  round, hole or shot queued offline synced only while a round screen was open:
  no interval, no sync after a reload, and service-worker sync requests went
  unanswered.
- **Fix.** `OfflineSync` starts the engine for the session, mirrors its state
  into the offline store (which drives the offline banner and round screens),
  answers `sw-sync-requested`, and stops auto-sync on unmount.
- **Checked.** `offline-sync.test.tsx` 3/3; shell 49/49.

## 2026-09-30 — Phone sheets and the keyboard; Phone tap targets reach 44 x 44; Quick second taps; Native-feel and phone-width scans; Old addresses open the rebuilt screens; The bell on phone tab roots (Clickables gap 1); Team Hub count for players (Clickables gap 3); The gear opens the page's own settings (Clickables gap 20)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Phone sheets and the keyboard

- **Issue.** On the phone the keyboard covered the lower fields and the Save
  button of every bottom sheet with a text field (New event, Plan a trip, New
  announcement, notes, Add a course). The app never resizes for the keyboard,
  and only Messages and the Settings sheets lifted themselves.
- **Fix.** Every sheet (`.ch-modal`) now sits on top of the keyboard while it is
  open, shrinks to the space above it and scrolls its body, so the focused field
  and the footer stay visible (`controls.css`, `--keyboard-height`).
- **Checked.** Not yet seen on an iPhone; the keyboard only exists in the native
  shell.

### Phone tap targets reach 44 x 44

- **Issue.** The native-feel scan found controls under Apple's 44pt minimum on
  the phone: segmented controls drawn at 26px, small buttons at 30px, pills at
  36px, 40px icon buttons and short text links (Team stats, Add, Message).
- **Fix.** On the phone each of these controls gets an invisible hit area that
  reaches 44 x 44 around it, without changing how it is drawn (`controls.css`,
  zero specificity so a page's own hit area wins).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px.

### Quick second taps

- **Issue.** A fast second tap on a control (a score stepper, a toggle) could be
  read by iOS as a double-tap zoom.
- **Fix.** Buttons, links, tabs, switches, labels and selects use `touch-action:
  manipulation` and no long-press link preview; pinch zoom still works
  everywhere (`base.css`).
- **Checked.** Code change; not yet seen on an iPhone.

### Native-feel and phone-width scans

- **Issue.** The accessibility scan ran only at 1280 and 390px, never checked
  sideways scrolling, and stopped the whole run when one tap failed.
- **Fix.** New `scripts/clubhouse/native.mjs` (tap targets under 44, text fields
  under 16px that iOS zooms into, sideways scroll, at 390 and 430px); `a11y.mjs`
  takes `CH_WIDTHS`, fails a phone page that scrolls sideways, and reports a
  failed tap instead of crashing.
- **Checked.** First run: no sideways scroll and no zoom-on-focus field on any
  screen.

### Old addresses open the rebuilt screens

- **Issue.** With Clubhouse on, notifications and bookmarks to /tasks,
  /announcements, /documents, /travel, /roster/[id] and /rounds/[id]/review
  opened Fairway pages inside Clubhouse.
- **Fix.** Each route's layout sends the viewer to the rebuilt screen (Team Hub
  tabs, the player's Stats profile, /rounds/[id]) through `routes/alias.ts`,
  only when that screen is rebuilt for their role; flag off, nothing changes.
- **Checked.** alias 4/4, the mutation caught. Not run: a signed-in browser
  check.

### The bell on phone tab roots (Clickables gap 1)

- **Issue.** Tab roots that draw their own title (CoachHelm, the player's Rounds
  and Team Hub) hid the bell, so a player had no bell on three of four tabs.
- **Fix.** `PhoneTop start` with no action puts the top bar in a `start` mode:
  the page title and the bell.
- **Checked.** shell.test 47/47, 4 of 4 mutations caught; seen at 390.

### Team Hub count for players (Clickables gap 3)

- **Issue.** A player's Team Hub item had no count.
- **Fix.** The sidebar and phone tab carry the current app's Team Hub count
  (unread announcements, tasks and trips), nothing when there are none.
- **Checked.** shell.test 48/48, 3 of 3 mutations caught.

### The gear opens the page's own settings (Clickables gap 20)

- **Issue.** The coach's top-bar gear on CoachHelm and Team Hub opened the
  Settings home.
- **Fix.** There it reads CoachHelm settings or Team Hub settings and opens that
  section (?section=coachhelm, ?section=team); elsewhere and for players it
  stays Settings.
- **Checked.** shell 49/49, 2 of 2 mutations caught.

## 2026-09-30 — V2 page docs; every hand contract proven by a test

```text
Contract IDs:   10102, 10301, 10801, 10802, 10901, 11301, 11401, 11402, 11901, 12301, 12401 (new, no catalog code)
Actions:        7 (ACT-P001-*)
Data impact:    none
```

### Changed

- The six page docs, the manifest's actions, and 11 behaviour contracts, each
  named by a test.
- New tests: 10102 with 10802 (the frame, and the notice for a role's unbuilt
  route), 10301 (the bell
  re-reads on open), 11301 (Mark all read rolls back), 10901 (success toast and
  haptic; a switch shows
  no toast), 11402 (toast Retry), 11401 (route Try again), 12301 (failures
  reported), and
  `gate.test.ts` for 10801.
- `useAction`'s doc comment said a success fires the commit haptic; it fires
  success (D-70). Fixed.

### Verification

- `npx vitest run src/clubhouse/__tests__/shell.test.tsx
  src/clubhouse/__tests__/gate.test.ts`: 42/42.
  11301 and 10102/10802 fail with their code broken (checked, restored).

## 2026-09-29 — v2 foundation

- v2 motion (D-64), haptics (D-70), the page empty state (D-71) and navigation
  (D-66) for every page.

## 2026-09-30 — toasts inside an open dialog

- CH-1812: a toast raised while a dialog or sheet is open renders inside it, so
  it is seen, announced and its Retry can be tapped. A modal dialog makes the
  rest of the page inert and the top layer paints over it; checked in headless
  Chromium and WebKit (a top-layer popover outside the dialog is inert too, so
  it is not a fix). Found by the Calendar contract pass; it had disabled every
  in-dialog Retry on every page.
- The More sheet follows v2 `MoreM`; sign-out is shared with Settings (CH-1002).

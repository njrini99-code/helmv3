# Phone design: Shell gestures (edge swipe back, pushes that keep the dock, no late bars, idle prefetch)

Status: draft, 2026-10-19 (lane L10 of the complete-and-elevate plan). **No owner board exists** for any of this: the
owner's phone shell boards (`m-shell.jsx`) draw pushed screens but not the drag that pops them. It is built from what
iOS does, from `foundation.md` (pushed screens, CH-1610, CH-1618, CH-1908) and from `section-strip.md`. The pieces are
visible only on an iPhone-width viewport; desktop never pushes a screen.

Code: `shell/edge-swipe.ts` (the rules), `shell/use-edge-swipe.ts` (the binding), `shell/PhoneScreen.tsx`,
`shell/phone-chrome.tsx`, `shell/use-prefetch-tabs.ts`, and the "L10 phone shell" block at the foot of `styles/shell.css`.

## 1. Edge swipe back

A pushed phone screen (`PhoneScreen`: a roster profile, details, a thread, a prospect) can be dragged back with a finger
that starts at the left edge, the way every iOS push can.

- **Start.** A single finger that lands within 20px of the left edge of the screen. Eight pixels of travel decide what the
  touch is: mostly rightward is the swipe, anything else (a first travel that is vertical, or leftward) is the page's, and
  the page scrolls for the rest of that touch. Vertical scroll always wins when the touch starts vertical; a swipe that
  has been claimed stops the page from scrolling with it.
- **While dragging.** The screen follows the finger one to one (CSS `translate`, which composes with the transform its push
  and pop use, so nothing fights). The page beneath draws back with it by the same parallax the pop uses (`CH_UNDERLAY_SHIFT`,
  24% of the width: a quarter, not a third) and returns to rest as the screen reaches the right edge. With a second pushed
  screen beneath (a thread under its details) that screen moves instead of the page. The scrim stays at its resting dim.
- **Commit mark.** 35% of the width. The selection haptic (`haptic('select')`) ticks as the finger crosses it, and again
  when it crosses back. Nothing else is felt: the sheet-settling `commit` haptic is for sheets (D-70).
- **Release.** Past the mark, or flicked right faster than 0.5 px/ms after at least 10px of travel, pops the screen: the
  screen's own Back runs and the screen leaves on the smooth spring from where it is, starting at the finger's speed
  (the page beneath returns on the same spring, so the two edges stay together). A flick back to the left faster than
  0.5 px/ms cancels even past the mark. Anything else springs back on the smooth spring, from where it is and at the speed
  it was moving, and the page returns to drawn back. A finger that stopped before it lifted is not a flick.
- **Its Back.** The swipe pops by pressing the screen's own chevron Back (`.ch-pbar__back`), so every screen's own close
  path (history entries, stacks, drafts) runs as if tapped. A screen with no chevron Back (a form's text "Cancel") has no
  swipe: a stray swipe must not abandon a form. A Back that refuses (an unsaved-changes prompt) brings the screen home
  again two frames later.
- **Not while.** The screen's entry spring is still settling (480ms), the screen is leaving, a sheet or dialog is open
  (`[role=dialog|alertdialog][data-state=open]`, `dialog[open]`, `[data-vaul-drawer][data-state=open]`, an open popover:
  the list the native shell reports as `overlayOpen`), or the address is a round-tracking route (`/golf/dashboard/rounds/new`,
  `/golf/dashboard/rounds/continue`: the native shell's `isTrackingRoute`).
- **Reduced motion and Animations off.** The touch is read the same way, but nothing follows the finger: a release past the
  mark (or a flick) pops the screen at once, anything else does nothing. The haptic still ticks.
- **The system takes the touch.** iOS's own edge swipe in Safari cancels the page's touch (`touchcancel`): every part goes
  back where it was at once, and the existing `hasUAVisualTransition` handling (`lib/ua-pop.ts`) lets the pop that follows
  leave without a second animation.

### Who runs it: the capability check

| Where | Web gesture |
| --- | --- |
| Mobile Safari, and a home-screen web app | runs (Safari's own swipe cancels the touch when it wins, above) |
| The iOS app, no `helmNav` bridge (an older shell) | off: WKWebView's own back gesture is on and plays the pop itself |
| The iOS app, bridge present, `window.__helmNativeSwipe` not `false` | off: the native gesture is on |
| The iOS app, bridge present, `window.__helmNativeSwipe === false` | runs |

It is read each time a finger lands, because the shell changes it while the page is open.

**Needs the native shell (Swift, not done here).** `GolfBridgeViewController.applySwipeBack()` sets
`webView.allowsBackForwardNavigationGestures`. It must also tell the page: set `window.__helmNativeSwipe` to
`allowsBackForwardNavigationGestures` whenever it applies it (`evaluateJavaScript`), and install the current value as a
`WKUserScript` at document start so a new page begins right. Until then the app keeps its native swipe and the web gesture
stays off there, exactly as before. A case the native swipe is off for today (a round, a sheet) leaves the page with
neither gesture, which is what those cases want.

## 2. A push keeps the dock unless it is immersive (NATIVE_FEEL P2-3)

`NATIVE_FEEL_PERF_AUDIT_2026-10-08` P2-3: iOS keeps its tab bar on a push that is not fully immersive. The tab bar this
described was replaced by the section strip (`section-strip.md`: "nothing at the bottom of the screen"); what remains at
the bottom is the dock, and the one part of it that belongs to the whole app rather than to a page is the **Resume round
accessory**.

- A `PhoneScreen` is **not immersive by default**. It covers the page as before (the shell's top bar and strip are inert
  under it, pull to refresh is off), but the dock's Resume round accessory stays up over it and the screen stops above it
  (`--ch-pscreen-dock`, measured from the accessory, 0 when there is none). The page's own thumb controls (`ThumbDock`)
  belong to the page under the screen, so they step aside while it is up.
- **Immersive is an opt-in**: a screen with a composer or fields at its foot (`keyboardAware`, which implies it), or one that
  passes `immersive`. The round itself (`usePhoneImmersive` in the tracking and setup screens) and full-page forms
  (`usePhoneTabsHidden`) are unchanged. An immersive screen over a plain one hides the dock.
- Which screens that changes: the Roster profile, Recruiting prospect, CoachHelm deep dive, Messages details and
  announcement now keep the dock. Messages' thread, New message and New announcement (composers) still hide it. No call
  site changes.

## 3. No bar arrives late

The shell draws a pushed page's bar from the address while the page loads (`PushedTopStandIn`, CH-1402): back and title.
It now also draws the page's action where that action is always there, as a picture of the key (hidden from assistive tech,
not pressable): Share on a coach's Player stats, the Qualifier actions key on a coach's qualifier. The bar the page then
brings has the same key in the same place, so nothing appears late. A form's submit is deliberately not drawn (it joins with
the form; there is nothing to submit before it exists), and an action that depends on data (Roster's Invite players, which
is absent on an empty roster) is left to the page.

Section roots with an action (Messages' New message, Calendar's New event, Roster's Invite players, Recruiting's Add
prospect) draw the shell's own root bar (title and bell) until their `PhoneTop` mounts; closing that gap is a change to the
shell's `TopBar`, listed as open below.

## 4. The first visit to a section shows the page, not a skeleton

`usePrefetchTabs` fetched the tabs whole and the last two sections visited. It now also sweeps the other sections the role
can reach (the strip's, in its order), after the tabs and when the thread is idle: **two at a time**, a 1.5 second rest
between batches, whole pages (`PrefetchKind.FULL`) like the tabs, and the same guards (Data Saver or offline asks for nothing
and stops a sweep under way). A section is not asked for again inside two minutes whatever a refresh dropped, so a refresh
(every tab revisit after 30s) does not re-render every section. Next prefetches only in production builds, so this shows in
a production build.

## Open

- Native: `window.__helmNativeSwipe` (above).
- `shell/TopBar.tsx` and `shell/nav.ts`: a root-action stand-in for section roots (section 3), and `ChPhonePushedTop.action`
  to replace the title match in `standInAction`.
- Physical iPhone check: the swipe against Safari's own, haptics, VoiceOver after a swipe pop.

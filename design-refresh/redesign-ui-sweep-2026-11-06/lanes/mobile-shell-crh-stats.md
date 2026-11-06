# Mobile audit: Shell, Classes/Roster/Home, Stats

Repo `/home/claude/njrini99-code/helmv3` at main `062f8a2`. Read-only code audit. No browser was used, so every measurement is derived from the CSS and TSX quoted here. Phone layout means ≤820px (`CH_PHONE_QUERY`, `src/clubhouse/lib/use-phone.ts`). Standalone means a home-screen web app with `apple-mobile-web-app-status-bar-style: black-translucent`. Findings already in `lanes/*.md` are not repeated. A finding marked "extends" adds a new concrete problem.

Note: the phone top bar is green in both themes. `shell.css:2441-2525` sets `--ch-phone-bar-bg: var(--ch-frame)`, which overrides the ivory value at `tokens.css:1258`. So `black-translucent` (white status glyphs) is correct and is not a finding.

---

### MOB-SHELL-1 Modal and FormSheet keyboard rules never run in Safari, so Save sits under the keyboard
- Severity: P1
- Where: any phone modal or FormSheet with a text field (ClassForm, GoalSheet, StatsFilter, roster edit sheets); all widths; any Text Size; light and dark; keyboard up
- File: `src/clubhouse/styles/controls.css:617-625` (`body.keyboard-open .ch-modal`), `controls.css:1554-1583` (FormSheet `--keyboard-height` rules), fed by `src/components/providers/CapacitorProvider.tsx:204-228`
- What's wrong: this extends ASK-2. ASK-2 found that the web fallback `innerHeight - vv.height - vv.offsetTop` reads 0 on Safari 26. A second consequence is new here: every CSS rule keyed on `body.keyboard-open` or `--keyboard-height` is dead in Safari and in standalone mode. Only `PhoneScreen keyboardAware` (`useSafariKeyboardFit`) adapts. The phone modal is a 92dvh bottom sheet (`controls.css:526-560`), so its footer Save sits about 300-340px under the keyboard on a 390×844 phone. The person must dismiss the keyboard to reach Save. ClassForm also has a hidden submit (`ClassForm.tsx:167-168`), so Return saves silently instead.
- Should be: the brief's Apple bar, where a sheet's primary action stays visible above the keyboard (iOS form sheets).
- Fix: move the sheet onto the existing `useSafariKeyboardFit` (`src/clubhouse/shell/PhoneScreen.tsx`). Either export it and call it from `ui/Modal` and `ui/FormSheet` when phone, or have it set `--keyboard-height` and `body.keyboard-open` from `visualViewport` (`innerHeight - vv.height`, ignoring `offsetTop`) so the existing CSS starts working.
- Confidence: high

### MOB-SHELL-2 The new-version bar on phone sits under the home indicator and covers the Resume pill and composers
- Severity: P1
- Where: any phone page after a deploy; all widths; any Text Size; light and dark; keyboard down (and up: it then sits under the keyboard)
- File: `src/components/providers/StaleDeploymentRecoveryScript.tsx:48` (inline style string)
- What's wrong: this extends QA-11, which covered this banner on desktop only. The inline style is `position:fixed;bottom:0;left:0;right:0;z-index:9999;padding:12px 16px;font-size:14px`. On phone:
  - (a) There is no `env(safe-area-inset-bottom)`, so the 34px home indicator area overlaps the button in standalone and on Face ID phones.
  - (b) z-index 9999 puts it over the PhoneDock Resume round pill (`.ch-dock`, `shell.css:2778-2790`) and over the chat or note composers.
  - (c) The Reload button has 8px padding with 14px text, so it is about 33px tall, under 44pt.
  - (d) The raw 14px ignores iPhone Text Size.
  - (e) There is no dismiss, so a coach mid-round cannot get the Resume pill back without reloading.
- Should be: 44pt targets; text follows Text Size; respect safe areas.
- Fix: inside `[data-ui='clubhouse']`, render the notice through the shell (an `.ch-offline`-style bar under the PhoneBar, or a toast above `--ch-dock-h`) instead of the inline fixed bar. At minimum add `padding-bottom: calc(12px + env(safe-area-inset-bottom))`, a `min-height: 44px` button, `font-size: 0.875rem`, and a dismiss X.
- Confidence: high

### MOB-SHELL-3 The PhoneBar back label is never shortened and runs into the centred title
- Severity: P1
- Where: any pushed PhoneScreen (Roster > player, Classes > class, Stats drill-downs); 320 at default Text Size; 375-390 from XL; light and dark
- File: `src/clubhouse/ui/PhoneBar.tsx` (back renders the full `backLabel`), `src/clubhouse/styles/shell.css:1447` (`.ch-pbar__back`), `shell.css:1479` (`.ch-pbar__title` absolute, centred, `max-width:52%`)
- What's wrong: the title is centred over the whole bar, so its left edge sits at (100% − 52%)/2 = 24% of the width. At 320 that is about 77px. The back control starts at 16px padding plus a chevron, so a "Roster" label ends at about 86px. That is a 9px overlap with the title's text box. At 375 and 390 the same happens from XL Text Size, once a "Classes" or "Statistics" label passes about 90px. There is no truncation, so the two strings draw over each other. They are not clipped.
- Should be: UINavigationBar behaviour, where the back title shortens to "Back", then to the chevron alone, when the title needs the room.
- Fix: give `.ch-pbar__back` a `max-width: calc(24% - 16px)` with `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. Also measure the label with ResizeObserver in `PhoneBar.tsx` and fall back to "Back", then to the chevron with `aria-label`, when it would cross the title box.
- Confidence: high

### MOB-SHELL-4 Toasts land on top of the Resume round pill
- Severity: P1
- Where: any phone page with an in-progress round (dock visible) after a save or delete toast; all widths; light and dark
- File: `src/clubhouse/styles/shell.css:1295-1299` (`.ch-toasts{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom))}`), dock at `shell.css:2778-2790`
- What's wrong: the toast stack's bottom edge is 12 + 34 = 46px from the screen bottom on Face ID phones. The dock spans about 34-82px. The toast z-index is 100, above the dock, so every toast sits over Resume for its lifetime. A tap meant for Resume hits the toast or is swallowed. The `--ch-dock-h` spacer exists (it is used by the dock-spacer in `ClubhouseFrame.tsx`) but toasts ignore it.
- Should be: overlays never cover a primary control; 44pt targets stay reachable.
- Fix: `.ch-root[data-phone] .ch-toasts{bottom:calc(12px + var(--ch-dock-h, 0px) + env(safe-area-inset-bottom))}`, and set edges to `var(--ch-page-x-phone)` (see MOB-SHELL-15).
- Confidence: high

### MOB-SHELL-5 The offline banner sticks at the desktop top-bar height, under or below the phone bar
- Severity: P1
- Where: any phone page while offline; all widths; standalone and Safari; light and dark
- File: `src/clubhouse/styles/shell.css:1842-1856` (`.ch-offline{position:sticky;top:var(--ch-topbar-h)}`), `tokens.css:441` (`--ch-phone-topbar-h:50px`)
- What's wrong: `--ch-topbar-h` is the 56px desktop token, with no phone override. The phone bar is 50px plus `env(safe-area-inset-top)` (`.ch-pbar`, `shell.css:1438`):
  - In standalone on a Dynamic Island phone, that is about 109px. The banner sticks at 56px, so it is hidden under the green bar while scrolling and the person never sees that they are offline.
  - In a Safari tab (top inset 0), the bar is 50px and the banner sticks 6px below it, leaving a gap that content scrolls through.
- Should be: offline state always visible; respect safe areas.
- Fix: `.ch-root[data-phone] .ch-offline{top:calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top))}`. Better still, render it inside the sticky bar container so it rides with the bar.
- Confidence: high

### MOB-SHELL-6 Text Size jumps after hydration because the type scale is not set before paint
- Severity: P1
- Where: every page on first load or reload, any Text Size above Large; all widths; light and dark
- File: `src/clubhouse/lib/dynamic-type.ts` (`useLayoutEffect(..., [])`), `src/clubhouse/shell/ClubhouseFrame.tsx:250` (`useChDynamicType()`), `src/components/golf/theme/ThemeScript.tsx` (BOOT sets only `--fw-type-scale`)
- What's wrong: `--ch-type-scale` is written only after React hydrates. Server HTML and the first paint use scale 1. At XXL (21/17 = 1.235) every rem-scaled line then grows by about 24% after hydration. Lists reflow, scroll position shifts, and in standalone this is visible on every cold launch. The BOOT script already reads `-apple-system-body` for `--fw-type-scale`, but the Clubhouse tree ignores that variable.
- Should be: text follows iPhone Text Size from the first frame (owner rule).
- Fix: in `ThemeScript.tsx` BOOT, also set `--ch-type-scale` on `<html>`, using the same 23/17 cap as `dynamic-type.ts`. Keep the hook for later changes (see MOB-SHELL-11).
- Confidence: high

### MOB-SHELL-7 Overscroll and status-area colour differ from the green bar and the page
- Severity: P1
- Where: every phone page; top rubber band and bottom overscroll; Safari (status tint on ≤18) and standalone; light (and dark, with dark tokens)
- File: `src/clubhouse/shell/ClubhouseFrame.tsx:307-353` (`usePhoneEdges`, :329 `html.style.backgroundColor = hero ? green : page`, :331 theme-color), `src/clubhouse/styles/shell.css:2441-2525` (green bar), `tokens.css` (`--ch-bg-page #ede9df` phone, `--ch-workspace #f5f0e4`, `--ch-grouped-bg #f2f0e9`)
- What's wrong: the edges are painted `--ch-bg-page` (#ede9df ivory), while the bar is `--ch-frame` (#0a331f green):
  - Pulling down shows an ivory strip above the green bar, which reads as a web page, not an app.
  - Safari ≤18 tints the status area ivory above a green bar.
  - At the bottom, the overscroll is #ede9df under a page that is #f5f0e4 (app canvas) or #f2f0e9 (CRH pages), so a visible seam appears on every bounce.
- Should be: the Apple bar from the brief, where the chrome colour is continuous with the bar and the page.
- Fix: in `usePhoneEdges`, set theme-color to `--ch-frame`. Give `.ch-topbar` and `.ch-pbar` a green upward extension (`box-shadow: 0 -100vh 0 100vh var(--ch-frame)` or a `::before` of `height:100vh; bottom:100%`). Set the html background to the canvas colour actually under the page (`--ch-workspace` or `--ch-grouped-bg` per route).
- Confidence: high

### MOB-SHELL-8 Landscape phones get the desktop sidebar shell
- Severity: P1
- Where: any page at 844, 852 or 932 wide (iPhone 13-16 and Pro Max landscape); any Text Size; light and dark
- File: `src/clubhouse/lib/use-phone.ts` (`CH_PHONE_QUERY='(max-width: 820px)'`), `src/clubhouse/styles/shell.css:3-11` (`.ch-app` desktop grid; the comment at :6-8 says this is intentional)
- What's wrong: turning the phone to landscape crosses 820px. The layout switches to the sidebar plus an inner `.ch-canvas` scroller with about 300px of usable height (390 minus the Safari bars). The phone tree unmounts, so pushed PhoneScreens, sheet state and scroll position are lost on rotate. Inner-scroller momentum and status-bar tap-to-top stop working. The manifest asks for `portrait-primary`, but iOS ignores that for web apps.
- Should be: the Apple bar, where rotation keeps the same app and state.
- Fix: make the phone query `(max-width: 820px), (max-height: 500px) and (pointer: coarse)` so landscape phones stay in the phone tree with landscape safe-area padding. **Decision for owner** (see summary).
- Confidence: high on behaviour; the decision is the owner's

### MOB-SHELL-9 The home-screen icon renders on black because it is a transparent 512px logo
- Severity: P1
- Where: Add to Home Screen, the iOS home screen and the app switcher
- File: `src/app/layout.tsx:64` (`icons.apple: '/Helm-Logo-New-Main.png'`), `public/manifest.json` (icons)
- What's wrong: the apple-touch-icon is a 512px RGBA PNG, about 75% transparent. iOS fills transparency with black, so the icon is a small mark on a black tile. It is the Helm mark rather than the GolfHelm app mark, and there is no 180×180 asset. The manifest icons are about 76% transparent too.
- Should be: a full-bleed, opaque 180×180 apple-touch-icon (Apple HIG app icons).
- Fix: add `public/apple-touch-icon.png` (180×180, opaque, the brand green or ivory filling the square, the mark inset about 20%) and point `icons.apple` at it. Add opaque `purpose: "any"` and `"maskable"` icons to the manifest.
- Confidence: high

### MOB-SHELL-10 The Resume pill's Discard X is a 36px target 4px from Resume
- Severity: P1
- Where: the PhoneDock with a round in progress; all widths; light and dark
- File: `src/clubhouse/styles/shell.css:2845-2850` (`.ch-resume__x` 36×36), `.ch-resume` gap 4px; `src/clubhouse/shell/Dock.tsx`
- What's wrong: Discard is destructive. It is 36pt, under 44pt, and sits 4px from the Resume link, so a thumb aimed at Resume's right edge can hit Discard.
- Should be: 44pt targets (owner rule), with destructive controls separated from the primary action.
- Fix: make `.ch-resume__x` 44×44, or keep the 36px circle with a `::after{inset:-4px}` hit area. Raise the gap to 8px. Confirm Discard with an action sheet if it does not already confirm.
- Confidence: high

### MOB-CRH-1 The roster player profile note box is in a screen that ignores the keyboard
- Severity: P1
- Where: Roster > player profile (coach), coach note at the bottom; all widths; keyboard up
- File: `src/clubhouse/screens/roster/RosterPhoneCrh.tsx:274-296` (`PhoneScreen` without `keyboardAware`), `RosterProfileCrh.tsx:178` (`<CoachNote>`), `RosterPeek.tsx:452` (textarea)
- What's wrong: the textarea is the last thing on a long scroll. Without `keyboardAware`, focusing it leaves the caret under the keyboard. In Safari 26 the scroller does not shrink, so the save action and the text being typed are hidden (see MOB-SHELL-1).
- Should be: a field being edited stays visible above the keyboard.
- Fix: pass `keyboardAware` to that `PhoneScreen`, and `scrollIntoView({block:'nearest'})` the note on focus.
- Confidence: high

### MOB-CRH-2 Home first-run quick-add chips are 32px with 6px gaps
- Severity: P1
- Where: Home empty state (coach and player, first run); all widths; light and dark
- File: `src/clubhouse/styles/home.css:1143-1162` (`.ch-hm-none__q` gap 6px, `.ch-hm-none__chip` height 32px)
- What's wrong: these are the first controls a new user taps. They are 32pt tall and 6px apart, and they are missing from the `::after` hit-area list that other small chips use.
- Should be: 44pt targets (owner rule).
- Fix: add `.ch-hm-none__chip` to the existing `::after{inset:-6px 0}` reach list, or set `min-height:44px`, and raise the gap to 8px.
- Confidence: high

### MOB-STATS-1 The goal sheet's number pad has no minus key, so negative strokes-gained targets cannot be typed
- Severity: P1
- Where: Stats > Set goal (coach and player); default metric `sg_putting`; keyboard up
- File: `src/clubhouse/screens/stats/GoalSheet.tsx:188-200` (`type="number" inputMode="decimal"`)
- What's wrong: the iOS decimal pad has digits and a decimal point, but no minus key and no Return key. Strokes-gained targets are often negative (for example −0.5 putting), so they cannot be entered. With no Return key and the dead keyboard CSS (MOB-SHELL-1), the person cannot dismiss the pad to reach Save without tapping outside.
- Should be: every value the field accepts can be typed on the iPhone keyboard.
- Fix: for signed metrics use `type="text" inputMode="text" pattern="-?[0-9]*[.,]?[0-9]*"`, or add a ± toggle segment beside the field (an existing `ui/` Segmented). Add `enterKeyHint="done"`.
- Confidence: high

---

### MOB-STATS-2 The big-text layout misses XXL, so the window switch overflows under the filter at 320
- Severity: P2
- Where: Stats (player), 320 wide at XXL; light and dark
- File: `src/clubhouse/screens/stats/StatsPlayerPhoneShs.tsx:89-99` (`useBigText` `>= 1.24`), control row :222-229, `stats-redesign.css:49-58`
- What's wrong: XXL is 21/17 = 1.235, below the 1.24 threshold, so the stacked layout does not engage. The five-column grid (`1fr 1fr 1fr 1.3fr 1.6fr`) beside the filter button overflows at 320, and the last segment runs under the filter.
- Should be: text follows Text Size without clipping.
- Fix: set the threshold to `>= 1.2`, or switch on measured overflow (ResizeObserver) rather than on the scale.
- Confidence: medium

### MOB-STATS-3 The window switch fades its last segment even when that segment is selected
- Severity: P2
- Where: Stats window switch with Custom selected, or the big-text layout; all widths; light and dark
- File: `src/clubhouse/styles/stats-redesign.css:59-65` (`.is-custom` mask `linear-gradient(90deg,#000 85%,transparent)`), :216-222 (`.is-big`, same mask)
- What's wrong: the scroll-hint mask is always on, even when nothing scrolls. The last 15% of the control, which is the selected "Custom" segment, is faded toward transparent, so the selected state reads as disabled. In dark mode the label drops below 4.5:1 at its right end.
- Should be: contrast ≥4.5:1 for text; the selected state is clear.
- Fix: apply the mask only while `scrollLeft + clientWidth < scrollWidth`, toggled by a class from a scroll listener, the same as other strips in `ui/`.
- Confidence: medium

### MOB-STATS-4 Starting a scroll on the scoring chart flashes a readout and fires a haptic
- Severity: P2
- Where: Stats scoring chart (coach and player); all widths
- File: `src/clubhouse/screens/stats/ScoringFeatureChart.tsx:153-167` (pointerdown captures, picks and calls `hapticScrub('start')`), `stats.css` `.ch-shs-chart{touch-action:pan-y}` (`stats-redesign.css:321-325`)
- What's wrong: a vertical page scroll that starts on the chart picks a point and buzzes before the browser sends `pointercancel`. Every scroll past the chart flickers a value and vibrates.
- Should be: iOS chart scrubbing (Stocks, Health), which engages only after a long press or a horizontal move.
- Fix: do not pick a point or fire the haptic on pointerdown. Start the scrub after more than 8px of horizontal movement or a 250ms hold, and ignore it if `pointercancel` arrives first.
- Confidence: medium

### MOB-STATS-5 The leg-bars "open" link keeps its hover underline after a tap
- Severity: P2
- Where: Stats leg bars (coach and player); all widths
- File: `src/clubhouse/styles/stats.css:7642` (`.ch-lb__open:hover`), used in `LegBars.tsx:114`
- What's wrong: the hover rule is not guarded, so iOS keeps the underline on the last tapped link until the next tap elsewhere.
- Should be: no sticky hover on touch.
- Fix: wrap the rule in `@media (hover:hover)`.
- Confidence: high

### MOB-SHELL-11 Smaller Text Sizes are ignored and Text Size is never re-read
- Severity: P2
- Where: every page at xSmall, Small or Medium; also after changing Text Size with the app open
- File: `src/clubhouse/lib/dynamic-type.ts` (`if (... size <= DEFAULT_BODY_PX) return null;`, `useLayoutEffect(..., [])`)
- What's wrong: sizes at or below 17px return null, so someone who chose Small (15px) still gets 17px text. The hook runs once with no listener. Changing Text Size in Control Centre and returning to the standalone app keeps the old scale until a reload.
- Should be: text follows iPhone Text Size (owner rule), in both directions.
- Fix: allow scales below 1, with a floor such as 14/17. Re-run on `visibilitychange` (to visible) and on `resize`, which iOS fires when Text Size changes.
- Confidence: medium

### MOB-SHELL-12 Bar side padding stays at 16px when the page edge is 20px (≥414)
- Severity: P2
- Where: Plus and Pro Max widths (414, 428, 430, 440) on top-level pages
- File: `src/clubhouse/styles/shell.css:1242` (`[data-phone='page']`), `:1258` (`[data-phone='start']`, forced `padding-left:16px`), `:1438` (`.ch-pbar` padding `... 8px 6px 16px`); `tokens.css:1444-1447` (page edge 20px at ≥414)
- What's wrong: the bar title or back button sits at 16px while the content below starts at 20px, a 4px misalignment on every large phone.
- Should be: phone page edge 16px, 20px at ≥414 (owner rule).
- Fix: replace the literal 16px with `var(--ch-page-x-phone)` in all three rules.
- Confidence: high

### MOB-SHELL-13 The route loading bar draws under the status bar in standalone
- Severity: P2
- Where: route changes in standalone mode
- File: `src/clubhouse/styles/shell.css:2069-2073` (`.ch-lp__bar{position:fixed;inset:0 0 auto 0;height:2px}`)
- What's wrong: with `black-translucent`, y=0 is behind the Dynamic Island or notch, so the 2px progress bar is mostly hidden behind the clock and island.
- Should be: respect safe areas.
- Fix: `top: env(safe-area-inset-top)`, or move the bar to the bottom edge of the PhoneBar.
- Confidence: high

### MOB-SHELL-14 The bell count badge has an ivory ring on the green bar and fixed 11px text
- Severity: P2
- Where: PhoneBar bell with unread items; light and dark
- File: `src/clubhouse/styles/shell.css:1618-1630` (`.ch-bell__count` `box-shadow:0 0 0 2px var(--ch-bg-page)`, `font:600 11px/1`)
- What's wrong: the cut-out ring was made for an ivory bar. On the green bar it draws an ivory halo around the badge. The 11px font does not follow Text Size.
- Should be: text follows Text Size.
- Fix: ring colour `var(--ch-phone-bar-bg)` on phone; font `600 calc(11 * var(--ch-type-k))/1`, or the existing caption token.
- Confidence: high

### MOB-SHELL-15 The dock and toasts use 12px side edges
- Severity: P2
- Where: phone pages with the dock or a toast; all widths
- File: `src/clubhouse/styles/shell.css:2778-2790` (`.ch-dock{left:12px;right:12px}`), `:1295-1299` (`.ch-toasts`)
- What's wrong: both floating surfaces sit 12px from the screen edge, while content sits at 16 or 20px. The Resume pill is visibly wider than every card above it.
- Should be: phone page edge 16px, 20px at ≥414.
- Fix: `left/right: var(--ch-page-x-phone)`.
- Confidence: high

### MOB-SHELL-16 Bell stack pills and drag handle are small, with 2px between hit areas
- Severity: P2
- Where: bell stack (notification drop) on phone
- File: `src/clubhouse/styles/shell.css:3512-3600` (`.ch-bst-pill` 28px tall; `--x` 28px wide with `::before inset:-8px -2px`; tools gap 6px; `.ch-bst__drag` 56×24)
- What's wrong: the pill dismiss X has a hit area of about 32×44, and adjacent pills' hit areas are only 2px apart. The drag handle's target is 24px tall.
- Should be: 44pt targets.
- Fix: make the X `::before` inset `-8px` on all sides with a tools gap of 8px or more. Give `.ch-bst__drag` a 44px-tall hit area (`::before inset:-10px 0`).
- Confidence: medium

### MOB-SHELL-17 There is no pull to refresh in the home-screen web app
- Severity: P2
- Where: standalone mode, all list pages
- File: `src/clubhouse/shell/PullToRefresh.tsx` (gated on `inIOSApp`)
- What's wrong: Safari tabs have the toolbar reload. Standalone has none, and pull to refresh runs only in the Capacitor app. A home-screen user cannot refresh Home, Roster or Stats without closing the app.
- Should be: the Apple bar, where list screens refresh by pulling.
- Fix: enable `PullToRefresh` when `matchMedia('(display-mode: standalone)').matches || navigator.standalone`.
- Confidence: high

### MOB-SHELL-18 iOS scroll indicators are hidden in every scroller
- Severity: P2
- Where: all inner scrollers (sheets, section strip, tables, the landscape canvas)
- File: `src/clubhouse/styles/base.css` (`scrollbar-width:none` and `::-webkit-scrollbar{display:none}` for all elements)
- What's wrong: on iOS this also removes the thin overlay indicator that tells the person a sheet or list scrolls and how far.
- Should be: native scroll affordance.
- Fix: limit the hiding to horizontal chip strips (`.ch-strip`, segmented rows). Leave vertical scrollers alone.
- Confidence: medium

### MOB-SHELL-19 No launch image, and the manifest colours belong to another palette
- Severity: P2
- Where: cold launch from the home screen
- File: `src/app/layout.tsx:67-70` (`appleWebApp` without `startupImage`), `public/manifest.json` (`theme_color #16A34A`, `background_color #FFFEFA`), `ThemeScript.tsx` (pre-paint theme-color `#f2e6d2` light)
- What's wrong: launch shows a white screen, then BOOT's #f2e6d2, then `usePhoneEdges`' #ede9df, then the green bar. That is four colours in the first second. The manifest's bright #16A34A is not a Clubhouse token.
- Should be: one continuous launch colour (Apple launch screen guidance).
- Fix: set the manifest `theme_color` to `--ch-frame` (#0a331f) and `background_color` to the canvas. Set BOOT theme-color to the frame. Add `startupImage` entries, or at least a matching `background_color`.
- Confidence: medium

### MOB-SHELL-20 The refresh-flag and hero edge colours differ from the surfaces they extend
- Severity: P2
- Where: CRH pages with the refresh flag on; Home hero top
- File: `src/clubhouse/styles/shell.css:4360-4365` (phone page background `--ch-grouped-bg`), `:4387-4400` (CRH hero bar `--ch-frame`); `ClubhouseFrame.tsx:329-331` (edges `--ch-bg-page`, hero `--ch-green-800`)
- What's wrong: on the hero, the edge is #0b3a25 while the bar is #0a331f, a visible step in the overscroll. On flagged pages, the bottom bounce is #ede9df under #f2f0e9. This is a narrower case of MOB-SHELL-7.
- Should be: chrome continuous with the surface.
- Fix: make `usePhoneEdges` read one token per state (`--ch-frame` for the hero, the route's page background otherwise) instead of hard-coding `--ch-green-800` and `--ch-bg-page`.
- Confidence: medium

### MOB-SHELL-21 The pushed-screen scroll lock can make Safari's toolbar jump
- Severity: P2
- Where: Safari tab (not standalone) when a PhoneScreen pushes after scrolling
- File: `src/clubhouse/shell/PhoneScreen.tsx` (`useOverlayScrollLock`, body `position:fixed`)
- What's wrong: fixing the body while Safari's compact toolbar is collapsed makes Safari expand the toolbar and resize the viewport during the push animation, so the pushed screen's bottom jumps by about 50px.
- Should be: smooth, stable push transitions.
- Fix: lock with `overflow:hidden` on the scroller plus `overscroll-behavior:contain` on the pushed screen, rather than body `position:fixed`.
- Confidence: low

### MOB-SHELL-22 The search field autocorrects and capitalises names
- Severity: P2
- Where: Roster and TeamRoster search; keyboard up
- File: `src/clubhouse/ui/SearchField.tsx` (no `autoCorrect`, `autoCapitalize` or `spellCheck`), used in `roster/Roster.tsx:692` and `TeamRoster.tsx:132`
- What's wrong: iOS capitalises the first letter and autocorrects surnames ("Nguyen" becomes "Nguyen's", "Ko" becomes "Ok"), which breaks the filter.
- Should be: iOS search fields do not autocorrect.
- Fix: `autoCorrect="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search"` on the input in `SearchField.tsx`.
- Confidence: high

### MOB-CRH-3 The roster sheet scroller uses a fixed 20px edge on small phones
- Severity: P2
- Where: roster profile sheet; widths below 414
- File: `src/clubhouse/styles/roster.css:1404-1410` (`.ch-rsm-scroll{padding:24px 20px}`)
- What's wrong: the edge is 20px at 320-390, where the rule is 16px, so it misaligns with the bar and the page edge.
- Should be: 16px, or 20px at ≥414.
- Fix: `padding: 24px var(--ch-page-x-phone)`.
- Confidence: high

### MOB-CRH-4 The Classes sticky day header is the wrong colour and not full width
- Severity: P2
- Where: Classes (phone, CRH flag on), while scrolling
- File: `src/clubhouse/styles/classes.css:2149-2157` (`.ch-cl.is-phone .ch-cl-tthead` sticky, `background:var(--ch-workspace)`), `:2733-2736` (CRH page `--ch-grouped-bg` with a page-x padded container)
- What's wrong: the sticky band is #f5f0e4 on a #f2f0e9 page and stops at the padding, so rows scroll visibly past its left and right edges while it is pinned.
- Should be: an iOS section header, the page colour (or material) across the full width.
- Fix: set the background to `var(--ch-grouped-bg)` on the CRH page, with `margin-inline: calc(-1 * var(--ch-page-x-phone)); padding-inline: var(--ch-page-x-phone)`.
- Confidence: medium

### MOB-CRH-5 The Home team scoring figure is a fixed 44px
- Severity: P2
- Where: Home team form card (coach); any Text Size
- File: `src/clubhouse/styles/home.css:1414` (`.ch-hm-form__top b{font:500 44px/0.9}`)
- What's wrong: this is raw px, so the main number on Home stays the same size at every Text Size while the text around it scales. At XXXL the label is larger than the figure's visual weight suggests.
- Should be: text follows Text Size.
- Fix: `font: 500 calc(44 * var(--ch-type-k))/0.9`, capped with `min()` if needed.
- Confidence: high

### MOB-CRH-6 The Home score row is fixed at 46px and clips at XXXL
- Severity: P2
- Where: Home score rows; XXXL
- File: `src/clubhouse/styles/home.css:1593-1600` (`.ch-hm-score{height:46px}`)
- What's wrong: at XXXL (23/17) the two-line content needs about 50px, so descenders clip.
- Should be: text follows Text Size without clipping.
- Fix: `min-height: 46px; height: auto`.
- Confidence: medium

### MOB-CRH-7 Home's clash warning explains itself only on hover
- Severity: P2
- Where: Player Home and coach Home (flag off), Today list, overlapping events
- File: `src/clubhouse/screens/home/HomePhone.tsx:318-320` (triangle with `title="Overlaps another event"` plus sr-only text)
- What's wrong: on touch there is no hover, so a sighted user sees an unexplained triangle.
- Should be: state is visible without hover.
- Fix: show a short visible label ("Clash") next to the icon, as the CRH coach Home already does, or make the icon open a popover on tap.
- Confidence: high

### MOB-CRH-8 Return in ClassForm saves the whole form instead of moving to the next field
- Severity: P2
- Where: Classes > New/Edit class; keyboard up
- File: `src/clubhouse/screens/classes/ClassForm.tsx:167-168` (hidden submit); text inputs without `enterKeyHint`
- What's wrong: the iOS keyboard shows "return", and pressing it in the first field submits a half-filled class.
- Should be: iOS forms move to the next field with Next and finish with Done.
- Fix: add `enterKeyHint="next"` and an Enter handler that focuses the next field on all inputs except the last, which gets `enterKeyHint="done"`.
- Confidence: high

### MOB-CRH-9 Short CRH pages show a two-tone band below the content
- Severity: P2
- Where: CRH pages (Classes, Roster, Home) with little content
- File: `src/clubhouse/styles/home.css:4515` and `classes.css:2733` (page `--ch-grouped-bg`), app background `--ch-workspace` (`shell.css` phone `.ch-app` and `.ch-canvas`)
- What's wrong: the page container ends where the content ends, so below it the #f5f0e4 app background shows under a #f2f0e9 page, a faint horizontal seam.
- Should be: one continuous surface.
- Fix: give the CRH page container `min-height: 100%`, or set `.ch-canvas` to `--ch-grouped-bg` when the CRH flag is on.
- Confidence: medium

---

## Summary
1. 36 findings: P0 0, P1 13, P2 23 (SHELL 22, CRH 9, STATS 5).
2. The worst problems are shell-wide: Safari keyboard CSS that never runs, the new-version bar under the home indicator, back-label and title collisions, toasts over Resume, and the offline banner hidden under the bar.
3. Owner decisions: keep landscape phones in the phone tree (MOB-SHELL-8); set `--ch-type-scale` in the BOOT script (MOB-SHELL-6); make theme-color and edges the frame green (MOB-SHELL-7 and 20).
4. CRH and Stats problems are mostly targets, keyboards and Text Size: 32px chips, a note box hidden by the keyboard, no minus key for strokes-gained goals, and an XXL threshold miss.
5. The status bar style `black-translucent` is correct because the phone bar is green; no change is needed there.

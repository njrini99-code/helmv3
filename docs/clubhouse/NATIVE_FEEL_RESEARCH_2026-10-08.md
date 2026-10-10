# Native-feel research: making the Clubhouse iPhone app stop feeling like a website

Date: 2026-10-08. Scope: GolfHelm Clubhouse on iPhone (Next.js App Router in a
Capacitor 8 WKWebView shell, iOS 26). Companion to the measured audit
`docs/clubhouse/NATIVE_FEEL_PERF_AUDIT_2026-10-08.md`.

What we measured: tab switches take 0.7-1.35 s and show full-page skeletons. A
crossfade fades the tab bar along with the page. Drill-ins crossfade instead of
pushing. The WKWebView back-swipe is a whole-page history snapshot. The page
header stacks a bar title, a tracked eyebrow, a large title and a double rule.

Sourcing note: every URL in this doc was link-checked on 2026-10-08 (HTTP 200,
except ionicframework.com, which returns 403 to scripted clients but loads in
a browser). Evidence for each claim falls into three tiers:

- **Read or searched in this pass:** Capacitor config, the WebKit tap-delay and
  `isInspectable` posts, the Hotwire Native docs and 37signals posts, Ionic
  React navigation, the Next.js prefetching and `staleTimes` docs, the Chrome
  View Transitions doc, the Capgo native-navigation plugin, the Apple forum
  and WebKit bug threads, the 120 Hz flag write-ups, and the NN/g
  response-time, skeleton and mobile-tables summaries.
- **Link-checked only, cited from established knowledge of the page:** the
  web.dev, MDN, react.dev, the other NN/g articles, the WebKit 3709 and 16301
  posts, and the Chrome overscroll post.
- **(HIG, verify wording):** Apple's HIG, WWDC and documentation pages render
  with JavaScript, so their body text could not be fetched. Those claims are
  standard HIG guidance. Quote the live page before putting any of them in a
  contract.

Repo fact that matters for section B: `capacitor.config.ts` sets
`server.url: devServer ?? PRODUCTION_URL`, so the production app loads the
remote site. Capacitor's own config docs say `server.url` "is not intended for
use in production" (<https://capacitorjs.com/docs/config>).
`ios/App/App/GolfBridgeViewController.swift:60` enables
`allowsBackForwardNavigationGestures`, and that setting is the source of the
whole-page snapshot back-swipe.

---

## A. What makes an iPhone app feel native (measurable)

### A1. Response and frame budgets

- **Perception limits.** About 0.1 s feels instantaneous, about 1 s keeps the
  user's flow of thought, and about 10 s is the limit of attention
  (<https://www.nngroup.com/articles/response-times-3-important-limits/>). Our
  0.7-1.35 s tab switch sits in the "noticeable delay" band. Native tab
  switches land in the first band.
- **Frame deadline.** iPhone renders a new frame every 16.67 ms at 60 Hz, and
  ProMotion devices run at 120 Hz (8.33 ms). A *hitch* is any frame that
  appears later than expected
  (<https://developer.apple.com/videos/play/tech-talks/10855/>).
  Apple measures hitch time ratio in ms of hitch per second. The tech talk
  gives roughly <5 ms/s as good and >10 ms/s as critical (verify against the
  transcript).
- **Hangs.** Apple's tooling treats a main-thread stall of about 250 ms or more
  as a user-visible hang
  (<https://developer.apple.com/documentation/xcode/improving-app-responsiveness>,
  verify wording).
- **Web budget (RAIL).** Respond to input within 100 ms, produce animation
  frames in ≤10 ms of script work, and use idle time in ≤50 ms chunks
  (<https://web.dev/articles/rail>).
- **120 Hz in WebKit.** By default, Safari/WebKit caps most page rendering
  updates near 60 fps on ProMotion through a "Prefer Page Rendering Updates
  near 60fps" feature flag. Native scrolling is reported to run at the full
  rate anyway, but rAF/CSS animations can be capped
  (<https://www.igeeksblog.com/this-hidden-safari-setting-unlocks-120hz-scrolling/>,
  <https://www.iphoned.nl/tips/safari-functie-verversingssnelheid/>). Practical
  consequence: web-driven transitions look visibly less fluid than native
  UIKit ones on a 120 Hz phone. The next fix is to move push/pop and the tab
  bar into native code.

### A2. Navigation model

- **Persistent tab bar.** The tab bar switches between top-level sections and
  stays visible within a tab. Each tab keeps its own navigation state. Use 3-5
  tabs on iPhone and put the rest under More. Tabs never perform actions
  (<https://developer.apple.com/design/human-interface-guidelines/tab-bars>,
  HIG, verify wording). **A tab bar that fades out during a route change
  breaks this contract.**
- **iOS 26 Liquid Glass.** Tab bars and toolbars move into a floating Liquid
  Glass layer above content. The iPhone tab bar can minimize on scroll
  (`tabBarMinimizeBehavior`) and expand again on reverse scroll, and an
  accessory view can sit above it
  (<https://developer.apple.com/videos/play/wwdc2025/284/>,
  <https://developer.apple.com/videos/play/wwdc2025/219/>,
  <https://developer.apple.com/videos/play/wwdc2025/356/>). Glass belongs to the
  navigation and control layer, not to content cards. Never stack glass on
  glass, and never give bars a custom opaque background that defeats the
  material
  (<https://developer.apple.com/design/human-interface-guidelines/materials>,
  HIG, verify wording).
- **Push/pop.** Drill-in pushes from the right. The outgoing view slides about
  1/3 to the left under a dimming scrim (parallax). Back is an *interactive*
  left-edge pan that tracks the finger, then commits or cancels based on
  position and velocity
  (<https://developer.apple.com/documentation/uikit/uinavigationcontroller>,
  <https://ionicframework.com/docs/developing/config>, where `swipeBackEnabled`
  is Ionic's web reimplementation of this gesture). A crossfade for drill-in
  is a website idiom.
- **Sheets with detents.** Use sheets for scoped tasks: medium/large detents, a
  grabber, swipe-down to dismiss, and the parent stays visible behind them
  (<https://developer.apple.com/design/human-interface-guidelines/sheets>, HIG,
  verify wording).
- **Large titles.** The large title sits in the navigation bar and collapses
  into the inline bar title as content scrolls. There is one title, never a
  title plus eyebrow plus large title
  (<https://developer.apple.com/design/human-interface-guidelines/navigation-bars>,
  HIG, verify wording). Our four-layer header is the single most "website"
  visual tell.

### A3. Scroll, touch and feedback

- **Scroll physics.** Native rubber-band and momentum come free only when the
  scrolling element is the document or a plain `overflow: auto` element.
  JS-driven scroll or `position: fixed` body hacks lose them
  (<https://developer.chrome.com/blog/overscroll-behavior>). Tapping the status
  bar scrolls the primary scroll view to the top. Re-tapping the active tab
  pops to the root and then scrolls to the top (HIG tab bars above).
- **No tap delay, highlight on touch-down.** WebKit removed the ~350 ms
  double-tap wait on pages with a `width=device-width` viewport.
  `touch-action: manipulation` does the same per element
  (<https://webkit.org/blog/5610/more-responsive-tapping-on-iOS/>). Native
  controls highlight on touch-down, not on click. `:active` needs a
  `touchstart` listener (or any touch listener) to apply on iOS
  (<https://developer.mozilla.org/en-US/docs/Web/CSS/:active>).
- **Haptics.** Use them sparingly and with meaning. Use selection for pickers
  and segmented changes, impact for snapping or drops, and notification
  (success/warning/error) for outcomes. Never use them on every tap
  (<https://developer.apple.com/design/human-interface-guidelines/playing-haptics>,
  HIG, verify wording; Capacitor bridge:
  <https://capacitorjs.com/docs/apis/haptics>).
- **Long-press.** Context menus with a preview replace hover menus and
  right-click
  (<https://developer.apple.com/design/human-interface-guidelines/context-menus>,
  HIG, verify wording). In a WKWebView, the *system* link preview and text
  callout fire instead unless you disable them (`ios.allowsLinkPreview`:
  <https://capacitorjs.com/docs/config>; `-webkit-touch-callout`:
  <https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout>).
- **Pull-to-refresh.** Use it only on lists that can change. It is native
  `UIRefreshControl` behavior
  (<https://developer.apple.com/documentation/uikit/uirefreshcontrol>;
  HIG covers it under
  <https://developer.apple.com/design/human-interface-guidelines/progress-indicators>,
  verify wording). Hotwire Native enables it per path by default on iOS
  (<https://native.hotwired.dev/reference/path-configuration>).

### A4. Type, layout, accessibility

- **Targets.** Make hit targets at least 44×44 pt
  (<https://developer.apple.com/design/human-interface-guidelines/accessibility>,
  HIG, verify wording).
- **Safe areas.** Keep content clear of the Dynamic Island and the home
  indicator, and let only backgrounds bleed under them
  (<https://developer.apple.com/design/human-interface-guidelines/layout>, HIG;
  web: `env(safe-area-inset-*)` with `viewport-fit=cover`,
  <https://developer.mozilla.org/en-US/docs/Web/CSS/env>).
- **Dynamic Type.** System text styles scale with the user's setting. The
  default iPhone body size is 17 pt
  (<https://developer.apple.com/design/human-interface-guidelines/typography>,
  HIG, verify wording). In WebKit, `font: -apple-system-body` (and the
  `-apple-system-headline` family) follows Dynamic Type
  (<https://webkit.org/blog/3709/using-the-system-font-in-web-content/>).
- **System font.** SF Pro (`-apple-system` / `system-ui`) gets optical sizing
  and tracking for free
  (<https://webkit.org/blog/3709/using-the-system-font-in-web-content/>).
  A brand display face is fine for large titles, but body text and data in SF
  read as native.
- **Keyboard.** The correct `type`/`inputmode`/`enterkeyhint` gives the right
  keyboard and return key. `autocomplete` enables AutoFill
  (<https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/inputmode>,
  <https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete>).
  Inputs with font-size below 16 px trigger iOS auto-zoom on focus. This is
  long-standing WebKit behavior, but no primary source was found in this pass,
  so verify it on device. Capacitor's Keyboard plugin controls resize mode and
  the accessory
  bar (<https://capacitorjs.com/docs/apis/keyboard>).
- **State preservation.** Switching tabs and coming back restores the exact
  scroll position, open segment and draft input (HIG tab bars, above; Ionic
  keeps each tab as its own stack and keeps "the state of the previous page
  intact", <https://ionicframework.com/docs/react/navigation>).

---

## B. Hybrid / web-in-native specifics

### B1. What separates good hybrids from "a website in a frame"

1. **Native chrome, web content.** Hotwire Native, the framework behind
   37signals' HEY and Basecamp apps, gives the native side "tab bars,
   navigation bars, transitions, and gestures" and lets web render the
   content. Each visit becomes a real `UINavigationController` push
   (<https://native.hotwired.dev/overview/basic-navigation>,
   <https://dev.37signals.com/announcing-hotwire-native/>). Hotwire Native 1.2
   added a native `HotwireTabBarController`
   (<https://dev.37signals.com/announcing-hotwire-native-v1-2/>). Routing is
   per path: push, modal, replace, and pull-to-refresh
   (<https://native.hotwired.dev/reference/path-configuration>). High-traffic
   home screens can be upgraded to native one at a time
   (<https://masilotti.com/when-to-upgrade-turbo-native-screens/>).
2. **Web-stack equivalent.** Ionic's `IonRouterOutlet` keeps previous pages
   mounted and gives each tab its own stack. Its iOS page transition is the
   native parallax push with an interactive swipe-back gesture
   (<https://ionicframework.com/docs/react/navigation>,
   <https://ionicframework.com/docs/api/router-outlet>,
   <https://ionicframework.com/docs/developing/config>).
3. **Capacitor native bars.** `@capgo/native-navigation` renders real
   `UITabBar`/`UINavigationBar` over one full-screen Capacitor WebView, uses
   iOS 26 Liquid Glass automatically, and reports safe-area changes to JS
   (<https://capgo.app/docs/plugins/native-navigation/>). Known iOS 26 pitfall:
   with a hidden-on-push tab bar, the bar can reappear during swipe-back
   (<https://developer.apple.com/forums/thread/805740>).
4. **Bundled shell, not a remote URL.** Capacitor flags `server.url` as not
   for production (<https://capacitorjs.com/docs/config>). A remote URL means
   every cold start and every uncached route waits on the network. Store
   review also expects code to run from the bundle
   (<https://forum.ionicframework.com/t/capacitor-server-url/240196>). The
   minimum version of this is a bundled app shell with `server.errorPath` for
   the offline page (<https://capacitorjs.com/docs/config>). Changing this is a
   product and architecture decision, so it goes to the owner.
5. **The WKWebView back gesture is not a navigation stack.**
   `allowsBackForwardNavigationGestures` swipes between *history snapshots*
   of the whole web view, tab bar included. It has known misfires: it jumps
   to the first page on iOS 17.5.1+
   (<https://developer.apple.com/forums/thread/766975>),
   it conflicts with in-page horizontal swipes
   (<https://bugs.webkit.org/show_bug.cgi?id=149015>),
   and Stage Manager takes the edge
   (<https://bugs.webkit.org/show_bug.cgi?id=247084>).
   Native-feel apps either own the stack natively (Hotwire) or reimplement the
   pan in-page (Ionic) and turn the WKWebView gesture off.

### B2. Instant navigation

- **Keep-alive stacks.** Never unmount a visited tab. Hide it and keep its
  DOM, its scroll position and its data (Ionic model, above).
- **Prefetch.** Next.js prefetches `<Link>` in production. For dynamic routes
  it prefetches only down to the nearest `loading.js`, and skips the prefetch
  entirely when no `loading.js` exists. The client Router Cache `staleTimes`
  dynamic default became 0 s in v15
  (<https://nextjs.org/docs/app/guides/prefetching>,
  <https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes>).
  So a revisited dynamic tab refetches and re-skeletons unless `staleTimes`
  or client caching is set.
- **Skeleton thresholds.** Under about 1 s, skeletons and spinners mostly add
  flicker. Show nothing, or keep the old screen, then show a skeleton only if
  the wait passes a threshold (commonly 300-500 ms)
  (<https://www.nngroup.com/articles/skeleton-screens/>,
  <https://www.nngroup.com/articles/response-times-3-important-limits/>).
  React's `useTransition` and `startTransition` keep the old UI on screen
  while the next one renders
  (<https://react.dev/reference/react/useTransition>).
- **Optimistic UI.** Apply the mutation locally and reconcile later
  (<https://react.dev/reference/react/useOptimistic>).
- **View Transitions.** Same-document transitions are in Safari 18.0 and
  cross-document transitions in 18.2. They give push/pop-style animations and
  shared elements, and work on iOS 26 WebKit
  (<https://developer.chrome.com/docs/web-platform/view-transitions>,
  <https://webkit.org/blog/16301/webkit-features-in-safari-18-0/>). They are
  *not interactive*: you cannot scrub one with a finger, so an edge-swipe
  still needs a gesture-driven transform.

### B3. CSS and engine rules

| Rule | Why | Source |
| --- | --- | --- |
| `touch-action: manipulation` on controls | no double-tap wait | <https://webkit.org/blog/5610/more-responsive-tapping-on-iOS/> |
| `-webkit-tap-highlight-color: transparent` plus your own `:active` | removes the grey web flash | <https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-tap-highlight-color> |
| `-webkit-touch-callout: none` and `user-select: none` on chrome only (bars, buttons, tabs), never on content or inputs | no "website" callouts on chrome | <https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout>, <https://developer.mozilla.org/en-US/docs/Web/CSS/user-select> |
| `overscroll-behavior: contain` on inner scrollers and sheets | no scroll chaining into the page behind | <https://developer.chrome.com/blog/overscroll-behavior> |
| Animate only `transform` and `opacity` | compositor-only work, no layout or paint per frame | <https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count> |
| Batch reads before writes, never read layout inside a loop of writes | avoids forced synchronous layout (thrash) | <https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing> |
| `content-visibility: auto` on long off-screen lists | skips rendering work | <https://web.dev/articles/content-visibility> |
| Match WKWebView `backgroundColor`/`isOpaque` to the app background | no white flash on launch or overscroll | <https://capacitorjs.com/docs/config>, <https://developer.apple.com/documentation/webkit/wkwebview> |
| Keep `user-scalable` enabled | accessibility; pinch zoom is not the tap-delay problem | <https://webkit.org/blog/5610/more-responsive-tapping-on-iOS/> |

### B4. Profiling

- Set `webView.isInspectable = true` (iOS 16.4+), or Capacitor's
  `ios.webContentsDebuggingEnabled`, then attach Safari Web Inspector's
  Timelines (Layout & Rendering, JavaScript, Frames)
  (<https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/>,
  <https://capacitorjs.com/docs/config>).
- Use Instruments' Animation Hitches and Hangs templates for the native shell
  (<https://developer.apple.com/videos/play/tech-talks/10855/>).

---

## C. Desktop → mobile adaptation

- **Don't shrink desktop.** Redesign per device. Give each phone screen one
  primary task and use progressive disclosure for the rest
  (<https://www.nngroup.com/articles/progressive-disclosure/>,
  <https://www.nngroup.com/articles/mobile-ux/>).
- **Thumb zone and bottom navigation.** Put frequent actions and navigation in
  the bottom third, within reach of a one-handed thumb. A bottom tab bar suits
  a small set of top-level sections
  (<https://www.nngroup.com/articles/mobile-navigation-patterns/>; the
  thumb-zone
  framing is common practitioner guidance, not a cited study).
- **Sidebar → tab bar + More.** Use 3-5 top-level destinations. Secondary
  sections go under More or a profile/settings list (HIG tab bars).
- **Tables → lists.** Lock headers, let the user choose the subset of columns,
  and on a phone fit only about 2 columns of wordy data. Otherwise use stacked
  rows, or a sticky first column with horizontal scroll
  (<https://www.nngroup.com/articles/mobile-tables/>,
  <https://www.nngroup.com/videos/big-tables-small-screens/>). For stats: lead
  with one hero number and its delta, and put the rest in a drill-in.
- **Modals → sheets.** Centered desktop dialogs become bottom sheets with
  detents. Full-screen covers are for immersive tasks only (HIG sheets).
- **Hover → long-press / tap.** Hover reveals nothing on touch. Gate hover
  styles behind `@media (hover: hover)`, and move hover menus to a context
  menu or a visible control
  (<https://developer.mozilla.org/en-US/docs/Web/CSS/@media/hover>).
- **Filters → sheet or segmented control.** Use a segmented control for 2-5
  mutually exclusive views and a filter sheet for many facets
  (<https://developer.apple.com/design/human-interface-guidelines/segmented-controls>,
  HIG, verify wording).
- **Forms.** Use the correct input types, `autocomplete`, and labels above
  fields. Keep the focused field visible above the keyboard, with one primary
  button reachable (<https://www.nngroup.com/articles/mobile-input-checklist/>,
  <https://capacitorjs.com/docs/apis/keyboard>).
- **Type scale.** On a phone, use a 34 pt large title, 17 pt body and a 13 pt
  footnote floor, with numbers in tabular figures
  (`font-variant-numeric: tabular-nums`)
  (<https://developer.apple.com/design/human-interface-guidelines/typography>,
  <https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric>).
- **Density.** Phone density comes from fewer elements, not smaller ones.
  Content has to earn its place in the first viewport
  (<https://www.nngroup.com/articles/mobile-ux/>).
- **Empty states.** Say what goes here, why it's empty, and the one action
  that fills it
  (<https://www.nngroup.com/articles/empty-state-interface-design/>).

---

## Conflicts with current Clubhouse doctrine (owner decisions)

Parts of this report argue against rules recorded in
`.claude/rules/clubhouse.md`. Those rules are owner decisions. Treat the
research as input for the owner, not as license to change them.

- **Font.** Doctrine sets Instrument Sans for display, body and data. This
  report (A4) suggests SF for body and data to read as native.
- **Route crossfade.** Doctrine makes `shell/RouteFrame.tsx` and
  `styles/shell.css` the owners of the whole-page crossfade. This report (A2,
  D1, D5) says drill-ins should push, the tab bar should never fade, and tab
  switches should be instant.
- **Haptics.** D-70 puts a light haptic on primary buttons. Checklist item 19
  says no haptics on ordinary navigation taps. Primary buttons are not
  navigation taps, so these are compatible if item 19 is read narrowly.
- **Bundled shell.** Moving off the production `server.url` (item 10) is an
  architecture, release and store decision.

---

## D. Ranked checklist (pass/fail in the iOS simulator)

Method: run iPhone 17 Pro on iOS 26. Record with
`xcrun simctl io booted recordVideo` and step through frames (60 fps
recording). Attach Web Inspector Timelines for the JS and layout numbers.

### P0: the "website" tells

1. **Tab bar never fades or moves on tab switch or drill-in.** Test: record a
   tab switch and a drill-in. Pass if the tab bar pixels are identical in
   every frame.
2. **Revisiting a tab shows ≤1 frame of skeleton.** Test: open tab A, go to
   B, return to A. Pass if A's content is in the first frame after the tap
   (≤16 ms) and no skeleton frame appears.
3. **First-visit tab switch: feedback ≤100 ms, content ≤500 ms on a warm
   network, and no skeleton before 300 ms.** Test: frame-step from the tap.
   The tab highlight must appear by frame 6. A skeleton may appear only after
   frame 18, and only if content is not ready.
4. **Tab state is preserved.** Test: scroll tab A halfway, pick a segment,
   switch away and back. Pass if scroll offset and segment are unchanged.
5. **Drill-in is a push.** Test: tap a list row. Pass if the new view enters
   from the right edge and the old view shifts left with a dim, with no
   opacity crossfade, in about 350-500 ms.
6. **Edge-swipe back is interactive and scoped to the content.** Test: drag
   from the left edge to 30% and release. Pass if the page tracks the finger
   1:1, the previous page is visible underneath (parallax), the swipe cancels
   back, and the tab bar stays fixed. Drag to 60% and release: pass if it
   completes. A fast flick at 20% also completes.
7. **One title per screen.** Test: screenshot each root screen. Pass if it has
   one large title (or one inline title) and no eyebrow plus duplicate title
   plus double rule. On scroll, the large title collapses into the bar title.
8. **Press feedback on touch-down, no grey highlight.** Test: press and hold a
   row or button. Pass if the pressed state shows within 1-2 frames of the
   touch, before release, with no grey `tap-highlight` and no callout after
   0.5 s.
9. **No dropped frames in push, pop or scroll.** Test: Web Inspector Frames
   timeline during push/pop. Pass if no frame exceeds 16.7 ms of main-thread
   work and the animations touch only `transform` and `opacity` (no
   Layout/Paint records during the animation).
10. **The app cold-starts into an app, not a page load.** Test: kill the app,
    relaunch it in airplane mode. Pass if the shell and tab bar render from
    the bundle and show cached data or a designed offline state. Fail on a
    white screen, the WebKit error page or a spinner-only view. (Today this
    fails by construction because of `server.url`, so the fix goes to the
    owner.)

### P1: native polish

 1. **Re-tapping the active tab pops to root, then scrolls to top.** Pass if
    one re-tap pops a pushed view and a second re-tap scrolls to the top
    with animation.
 2. **Sheets have detents.** Test: open a filter or new-item sheet. Pass if
    it shows a grabber, a medium detent, a swipe-down dismiss that tracks the
    finger, and inner scroll that does not chain to the page behind.
 3. **Liquid Glass bars.** Pass if the tab bar is a floating glass capsule
    with content visibly refracting under it, no opaque fill, and (optional)
    it minimizes on scroll down and restores on scroll up.
 4. **Rubber-band and momentum on every scroller.** Test: flick each list and
    overscroll its top and bottom. Pass if it decelerates naturally and
    bounces, with no hard stop and no body scroll behind it.
 5. **Targets ≥44 pt.** Test: Accessibility Inspector, or a JS sweep of
    `getBoundingClientRect` on interactive elements. Pass if 0 elements are
    under 44×44 CSS px, including padding.
 6. **Dynamic Type.** Test: Settings, then Accessibility, then Larger Text at
    AX3. Pass if body text grows, nothing truncates mid-number, and the
    layout reflows.
 7. **Keyboard.** Test: focus each form field. Pass if the right keyboard
    (numeric for scores) appears, there is no zoom on focus (fields ≥16 px),
    the field and primary button stay visible, and Return advances to the
    next field.
 8. **Long-press.** Test: long-press a player or round row. Pass if an app
    context menu appears (or nothing does), but never the system link preview
    or a text-selection callout.
 9. **Haptics are purposeful.** Test: review a usage list. Pass if haptics
    fire for selection changes and success or error outcomes, and on none of
    the ordinary navigation taps.

### P2: refinement

 1. **Pull-to-refresh only on live lists**, with a native-feeling spinner and
    a haptic tick at the threshold.
 2. **Status-bar tap scrolls the active scroller to the top.** This works
    only if the document is the scroller. Test by tapping the clock.
 3. **Safe areas.** Test: landscape and portrait on a Dynamic Island device.
    Pass if no content sits under the island or the home indicator and only
    backgrounds bleed.
 4. **No white flash.** Test: launch in dark mode and overscroll. Pass if the
    WKWebView background matches the app background.
 5. **Tables become lists.** Test: open every stats or roster table at 393 pt
    wide. Pass if there is no horizontal page scroll and a table that keeps
    columns has a sticky first column with ≤3 visible columns.
 6. **Hover-only affordances are gone.** Test: grep for `:hover`-gated
    reveals. Pass if every one has a touch path.
 7. **Optimistic mutations.** Test: toggle or submit on a throttled network
    (Network Link Conditioner, 3G). Pass if the UI updates immediately and
    rolls back visibly on error.
 8. **Tabular numbers.** Pass if stat columns don't jitter when values
    update.

# Clubhouse at iPhone width: DevTools findings (live site, read only)

helmsportslabs.com, signed in as Nick (coach, demo team). Sunday 15 Nov 2026.
- Production served `db3a99ee1`, verified in the served bundle by `npm run release:status`.
- `main` has since moved two commits ahead (#2531, #2532), and neither is deployed.
- Line numbers below are from the checkout on `claude/project-thread-u8yw0k`, whose `src/` matches what production serves apart from two deleted
  `overflow: visible` lines.

## How this was measured (read this first)

- **Browser.** The owner's everyday Chrome 157, Default profile, attached over the DevTools protocol (`chrome://inspect` remote debugging). The audit
  ran in one new tab and closed it at the end. No other tab was touched.
- **Emulation.** iPhone 15 Pro: 393×852, DPR 3, mobile, touch on, Safari 26 user agent, light mode.
  - The emulation was re-checked on every screen and after every screenshot, and held on all of them (`walk.json`, `emulation.ok`).
  - An earlier pass was thrown away: Playwright's own full-page screenshot reset the emulation, so screens came out 393×852 at 1x, 400×815, then
    113×807.
- **Tier.** Every number here is **C (Chromium)**.
  - It is not real Safari and not a real iPhone (`.claude/rules/browsers.md`).
  - Chromium resolves `env(safe-area-inset-*)` to 0 and has no iOS keyboard.
  - Frame numbers are from a Mac display refreshing at about 100 Hz (10 ms budget). No D-tier (iPhone) run was possible: no phone was cabled.
- **Extensions in this profile, next to every trace below.** ChatGPT, Chrome Remote Desktop, Chrome Web Store Payments, Claude and DeepWiki to Markdown,
  all enabled. Only **Claude** injects a content script on every site, so it is the one that can add main-thread time to Helm's traces.
- **Instruments.**
  - Per screen: the repo probe `scripts/clubhouse/audit/probe.js`, plus painted contrast at the `contrast.mjs` floors, chart marks at 3:1, and tap
    targets including `::before`/`::after` reach.
  - axe 4.14 plus IBM Equal Access 4.0.35 (installed outside the repo).
  - Resource Timing for the network checks.
  - Per flow: a Chrome trace (frames drawn and dropped, `RunTask` long tasks), plus an in-page recorder (rAF frame times, Long Animation Frames with
    script attribution, `getAnimations()` durations and easing).
  - Overlays were opened with a keyboard activation (focus, then Enter) and closed with Escape. Nothing was saved, sent or edited.
- **Raw data.** `.helm/audit-runs/prod-audit-2026-11-15/phone-393/` (gitignored) holds `data/`, `shots/` (`c*.png` screens, `f*__*.jpg` flows,
  `se-*.png` SE), `traces/` (`f*.json`), `frames/`, `walk.json`, `a11y.json`, `net.json`, `small.json` and `extensions.json`.
- **Covered.**
  - 28 coach screens: Home, Calendar, Stats, Team stats, Practice and its Drills, Templates, Groups and Format pages, a drill, Messages (list), Team
    Hub, Roster, Rounds, New round, Qualifiers, a qualifier, its selection page, New qualifier, Tournaments, Tournament history, Recruiting, Settings,
    Notifications, Coaching intelligence, Ask, What's new and Live.
  - 21 traced flows.
  - The 3 worst flows again at 4x CPU throttling.
  - 5 screens at 375×667.

### Not opened, and why

- **Write when opened** (owner: read only; `docs/clubhouse/audit/WRITES-ON-OPEN.md`):
  - the CoachHelm board and its player views (insight-exposure rows; `routes/coachhelm.tsx:85`, `:266-281`);
  - round review (a paid Claude call plus writes);
  - message threads (they mark read);
  - Continue round (it saves on tab switch);
  - `/roster/[id]` and `/players/*`, which redirect into the CoachHelm views.
- **No link on this account:** a Stats player profile, a tournament detail and a practice plan.
- **Player screens:** none can be reached from a coach session. The role comes only from profiles (`src/lib/auth/golf-dashboard-role.ts`), and
  `/clubhouse-preview/*` calls `notFound()` in production.
- **Toasts:** they appear only after a save or a send, so none can be opened read-only. Their motion is `ui/Toast.tsx:358-394`.
- **Lighthouse:** not run. It needs a Chrome with an HTTP debugging port, and Chrome's new remote-debugging switch doesn't serve one.

---

## Findings, worst first

### 1. Leaving Rounds freezes the screen for 1.1 s, and for 4.4 s at 4x CPU

- **Evidence**
  - Strip tap Rounds → Team Hub (`traces/f05-…`):
    - one 1,130 ms long task; total blocking time 1,151 ms;
    - one 1,146 ms Long Animation Frame;
    - the page recorder logged 130 dropped frames and one 1,159 ms frame.
  - At 4x CPU (`f05…__cpu4`): a 4,443 ms long task, total blocking time 4,592 ms, a 4,561 ms frame and 517 dropped frames.
  - Two control runs show it is the leaving, not the destination:

    | Strip tap | Longest task | Dropped frames |
    | --- | --- | --- |
    | Rounds → Home (`f23`) | **1,124 ms** | 117 (rAF) |
    | Home → Team Hub (`f22`) | 189 ms | 24 (trace), a normal section switch |

  - The Long Animation Frame attribution names `update` in chunk `41jjj9oqv606g.js`. That is React DOM's
    `document.startViewTransition({ update: … })`, where React commits the route.
  - Extensions: the 5 listed in the method section.
- **Cause**
  - Rounds mounts the whole season at once: 124 rows, 2,958 DOM nodes, an 11,504 px page and a 457 KB HTML document. Other screens' HTML is
    160–348 KB.
  - The rows come from `src/clubhouse/screens/rounds/TeamRounds.tsx:229-247` and `:399-404`, which map every month group and every row.
  - `rounds.css:5245` (`content-visibility: auto`) saves paint, but not DOM, hydration or unmount.
  - Leaving the page tears that tree down in one synchronous route commit. Because every route is wrapped in `<ViewTransition key={routeKey}>`
    (`src/clubhouse/shell/RouteFrame.tsx:231`), that commit runs inside the view transition's `update` callback, with the old screen held frozen.
- **Fix**
  - Render the current and previous month, and load older months on demand ("Show earlier", or as you scroll).
  - Keep search and the player filter server-side, so the first payload and the later unmount are one or two months of rows.
  - Gate on a trace: no strip tap over 50 ms at 4x CPU.
  - Screenshot: `shots/c09-rounds.png`.

### 2. Every section-strip tap blocks for 120–190 ms

- **Evidence**

  | Strip tap (`traces/f02`, `f03`, `f04`, `f06`, `f22`) | Long task | Dropped frames (trace) |
  | --- | --- | --- |
  | Home → Calendar | 190 ms | 23 |
  | Calendar → Stats | 146 ms | 18 |
  | Stats → Rounds | 124 ms | 23 |
  | Team Hub → Home | 169 ms | 22 |
  | Home → Team Hub | 189 ms | 24 |

  - Each has a Long Animation Frame in React's view-transition `update`.
  - Opening and closing the strip alone (`f01`) is clean: 0 dropped frames, no long task, a 462 ms spring.
  - Screenshots: `shots/f0*-strip-*__after.jpg`.
- **Cause**
  - Each switch mounts the whole incoming screen in one synchronous route commit, which runs inside the view transition's `update` callback.
  - Doctrine says a section switch swaps at once (`lib/nav-motion.ts` marks it `data-ch-tab` and `shell.css` drops its keyframes). The switch still
    goes through `<ViewTransition>` (`RouteFrame.tsx:231`).
- **Fix**
  - Make the commit small first: let the incoming route suspend to its `loading.tsx` skeleton, then stream its sections in after the switch.
  - Mount less on first paint, for example below-the-fold cards on demand.
  - Then test, without assuming the result, whether leaving `<ViewTransition>` out for `data-ch-tab` switches removes anything beyond the commit
    itself. Settings › Animations off already renders that path (`mode === 'off'`), so it is a ready A/B for the owner to switch and re-trace.

### 3. Home's "Add event" and event-type chips run a full route change before the sheet opens

- **Evidence**
  - "Add event" (`f18`): 43 dropped frames (trace), two long tasks with a 196 ms maximum, total blocking time 278 ms, 55 ms of layout, and 57
    animations starting together (skeleton shimmer, the load bar, the page fade, the sheet).
  - The "Practice" chip (`f21`): 34 dropped frames and a 177 ms long task.
  - At 4x CPU (`f18…__cpu4`): a 766 ms long task, total blocking time 1,446 ms and 178 dropped frames.
  - Calendar's own "New event" opens the same sheet in place with 1 dropped frame and one 88 ms long task (`f15`).
  - Screenshot: `shots/f18-home-add-event__open.jpg`.
- **Cause**
  - `src/clubhouse/screens/home/HomePhone.tsx:51`: `newEventHref` sends the coach to `/calendar?new=1&type=…`.
  - The chips (`:234`) and Add event (`:240`) are links, so they pay for a route commit and the Calendar skeleton hold, then open the sheet.
- **Fix**
  - Open the new-event sheet in place on Home (the Calendar sheet component, presented from Home).
  - Navigate only after a save, if at all.

### 4. Opening a drill or a qualifier blocks the screen

- **Evidence**
  - Drill (`f20`): a 336 ms long task, total blocking time 400 ms, 58 dropped frames against 59 drawn, and 129 ms of layout (one 111 ms layout).
  - Drill at 4x CPU: a 1,308 ms long task, total blocking time 2,179 ms and 603 ms of layout.
  - Qualifier (`f19`): long tasks of 136 ms and 160 ms, 34 dropped frames.
  - Both Long Animation Frames are in the view-transition `update` commit.
  - Screenshot: `shots/f20-drill-detail-and-back__detail.jpg`.
- **Cause:** the detail page's whole first render and layout commit synchronously in the route change (`RouteFrame.tsx:231`).
- **Fix**
  - Push the detail with its header and skeleton first, and stream the body after the push settles (`shell/PhoneScreen.tsx`).
  - Profile the drill page's 111 ms layout.

### 5. The Oct 21 ivory light is gone, and most screens read near-white

- **Evidence**
  - Every screen paints a flat `#f2f0e9` page: `html`, `body` and `main` have no `background-image`.
  - Near-white pixels (luminance at least 0.9, low chroma) cover a large share of these screens:

    | Screen | Near-white share |
    | --- | --- |
    | Drills | 73% |
    | Team Hub | 63% |
    | Templates | 61% |
    | What's new | 59% |
    | Roster | 56% |
    | Tournaments | 54% |
    | Practice | 51% |
    | Home | 50% |

  - Calendar, Settings, Qualifier pages and Recruiting are mostly the page colour itself.
  - Screenshots: `shots/c20-practice-drills.png`, `c07-team-hub.png`, `c01-home.png`.
- **Cause**
  - On Oct 21 (`4ec322021f`) the phone rule painted `var(--ch-light-canvas), var(--ch-light-paper), var(--ch-workspace)`: a radial `#fff6e0` at 14%
    fading over 420 px on `#f5f0e4`.
  - Commit `1b74f7e856` (#2497, 11 Nov) changed it to `var(--ch-grouped-bg)`. The current rule is `src/clubhouse/styles/shell.css:2395-2398`.
  - `--ch-light-canvas` is still defined (`tokens.css:557`) but nothing uses it.
  - The near-white is mostly the cards: `--ch-card-bg #fffefb` (`tokens.css:716`) and `--ch-bg-surface #fcfaf5` (`tokens.css:173`).
- **Fix**
  - Restore the stack on the phone `.ch-app, .ch-canvas` rule.
  - Warm the card token toward ivory as well (for example about `#fbf7ee`). The gradient shows only in the gaps, so on a 63–73% card screen it
    won't change how the screen reads.
  - Change `src/clubhouse/styles/__tests__/page-colour.test.ts` and DESIGN_LANGUAGE law 2 (`tokens.css:93-95`) in the same change, because they lock
    the flat page.

### 6. Ask scrolls 20 px under its fixed-height chat at every size

- **Evidence**
  - The document is 872 px tall in an 852 px viewport, 687 in 667 at iPhone SE, and 536 in 516 with the keyboard-height viewport.
  - On iOS that lets the page rubber-band and drag the composer.
  - Screenshots: `shots/c14-ask.png`, `se-ask.png`, `ask-keyboard-approx.png`.
- **Cause**
  - `.ch-ask` is `100dvh` minus the bars (`coachhelm-ask.css:967`), but the phone canvas still adds `padding-bottom: calc(env(safe-area-inset-bottom)
    + 20px)` (`shell.css:1214`).
- **Fix**
  - Drop the canvas bottom padding on the Ask route, for example `.ch-canvas:has(> * .ch-ask) { padding-bottom: 0 }` or a route class, or subtract it
    in the `.ch-ask` height.
  - Then check it on the Simulator (S tier).

### 7. Team Hub's "Tasks (5 late)" tab is cut off at the right edge

- **Evidence**
  - The tab row is 456 px wide in 393 px.
  - "Tasks" starts at x=378 and its late badge "5" is at x=427, off screen.
  - The row's scrollbar is hidden, so nothing shows that there is more.
  - Data: `data/c07-team-hub.json` (`hScrollers`).
- **Cause**
  - `src/clubhouse/styles/hub.css:39-48`: `overflow-x: auto`, `scrollbar-width: none`, no edge cue.
- **Fix**
  - Fit the five tabs at 375: shorter labels, or move the counts inside the label.
  - Or add a right-edge fade mask and scroll the active or late tab into view on load.

### 8. Duplicate ids on Team Hub break `aria-controls`

- **Evidence**
  - IBM `aria_id_unique`: 8 on Team Hub, 16 across 4 screens (Team Hub, Recruiting, Ask, Templates).
  - Example: `ch-hw-owe-8e382583-…`.
- **Cause**
  - `src/clubhouse/screens/hub/widgets.tsx:523` (the phone list) and `:591` (the desk table) both render `id={`ch-hw-owe-${r.id}`}` in the same DOM.
  - `aria-controls` at `:513` and `:569` points at whichever comes first.
- **Fix**
  - Give each variant its own prefix (`ch-hw-owe-l-…` and `ch-hw-owe-t-…`), or mount only the variant for the current layout.
  - Recruiting, Ask and Templates need the same check.

### 9. Visible label and accessible name disagree, which breaks Voice Control

- **Evidence**
  - axe `label-content-name-mismatch` (serious): 18 nodes on Roster, What's new, New qualifier and a qualifier.
  - IBM `label_name_visible`: 19 on 6 screens.
- **Cause**
  - Example: `src/clubhouse/screens/roster/RosterLeaders.tsx:38`, where `aria-label={`${k.label}, ${p.name}, ${figure}. Open profile`}` doesn't start
    with the visible text.
- **Fix**
  - Start each `aria-label` with the visible words, or drop it and use `aria-describedby` for the extra context.

### 10. Calendar sometimes opens on last week

- **Evidence**
  - 1 of about 5 cold loads showed "Sat 14 November" and the week of the 8th to the 14th, with today (Sun 15) parked off screen at x=392.
  - The other loads centred today by 1.4 s.
  - Low confidence: it is intermittent.
- **Cause (inferred)**
  - `src/clubhouse/ui/ScrollPager.tsx:42-45` centres once, in a layout effect (`el.scrollLeft = el.clientWidth`).
  - If the pager has zero width at that moment (mid route crossfade), it stays on page 0 until the week changes.
- **Fix**
  - Also centre on the first non-zero width, using the `ResizeObserver` the component already sets up, unless the user has scrolled.

### 11. Heavy, slow first loads

- **Evidence**
  - Calendar ran 108 script files, 6.2 MB of uncompressed JavaScript. All of it came from cache, so the download size wasn't measured; parse and
    compile is the phone cost.
  - Each cold screen load makes 153–182 requests.
  - The slowest first bytes and largest paints:

    | Screen | Time to first byte | Largest paint |
    | --- | --- | --- |
    | Qualifiers | 1,088 ms | 1.7 s |
    | Team stats | 935 ms | 2.2 s |
    | Tournaments | 676 ms | 1.6 s |
    | Calendar | 656 ms | 2.1 s |

    All on a fast Mac connection.
  - A 512 KB chunk (`3opf6pwcxh2pi.js`) loads on What's new, Live and New round.
- **Cause**
  - The route bundles plus the prefetch sweep (`shell/use-prefetch-tabs.ts:50-55`).
  - The server time is in the loaders.
- **Fix**
  - Run `next build` bundle analysis on the 108-chunk graph.
  - Lazy-load `3opf6pwcxh2pi.js`'s owner.
  - Profile the Qualifiers and Team stats loaders (`helm-sentry` traces or server timing).

### 12. Each screen fetches its own URL twice, and Sentry is being rate-limited

- **Evidence**
  - Resource Timing shows a second request for the current page's own URL on all 28 screens.
  - The `/monitoring` Sentry tunnel posts 2–3 times per load.
  - One tunnel post returned **429** (Drills), so error telemetry is being dropped.
  - Data: `net.json`.
- **Cause (inferred)**
  - The tab prefetch (`use-prefetch-tabs.ts`) includes the active route.
  - The Sentry tunnel rate limit is exceeded.
- **Fix**
  - Skip prefetching the current route.
  - Check the Sentry tunnel quota and sample rate.

### 13. Practice's week strip can't be reached by keyboard

- **Evidence:** axe `scrollable-region-focusable` (serious) on `.ch-prc-week`.
- **Cause:** `src/clubhouse/screens/practice/PracticeHome.tsx:54`, a `role="list"` scroller with no `tabIndex`.
- **Fix:** `tabIndex={0}` on the scroller, or arrow-key paging like `ui/WeekStrip.tsx`.

### 14. "Good afternoon" at 11:10 AM

- **Evidence:** Home greeted "Good afternoon, Nick" at 11:10 Eastern.
- **Cause**
  - Not a time-zone bug: `src/lib/utils/time-of-day.ts:17-18` starts "afternoon" at 11:00 (#950).
  - Welcome (`screens/auth/scene-sky.ts:96`) and CoachHelm chat Home (`screens/coachhelm/chat/Home.tsx:31`) switch at 12:00.
- **Fix:** one shared helper with a noon boundary.

### 15. Motion details (low)

- **The strip plate and the segmented pill animate `width`.**
  - 417 ms each, with 12–17 ms of layout per switch (`lib/slide-plate.ts:81-86`; an owner choice on 7 Nov, because scale squashed the corners).
  - A `clip-path: inset()` glide would keep the corners without layout.
- **The CoachHelm ball's ripple is an infinite 5.6 s loop on every screen.**
  - `styles/coachhelm-ball.css:164-168`.
  - It isn't one of the pinned loops (shimmer 1.9 s, live pulse 2.8 s, sweep 900 ms).
- **The bell's veil fades for 662 ms on open** (`shell.css:3557-3562`), longer than the 520 ms reveal beat.
- **Stats' Filter sheet** costs a 74 ms long task on open. **Calendar's Day/Month switch** drops 11 frames.

### 16. Accessibility notes (low)

- IBM `aria_content_in_landmark` on all 28 screens: the same shell element sits outside a landmark.
- IBM `aria_descendant_valid`: 16 on Team Hub, Roster and a qualifier, where a `role=button` contains `role=img`.
- IBM `label_content_exists`: on the search fields' `<label>` (`ui/SearchField.tsx:26`).
- "Weekly team email" is drawn at 50% opacity (2.66:1). The switch is disabled while email is paused (`screens/settings/Notifications.tsx:186`), so
  WCAG exempts it.

---

## Overlay and navigation table (C tier; extensions as listed above)

The duration and easing columns are the open and close animations from `getAnimations()`. "Spring" is the CSS `linear()` spring from `CH_SPRINGS`.

| Flow | Trace dropped / drawn | Longest task | rAF dropped | Open → close | Easing | Closes on Escape |
| --- | --- | --- | --- | --- | --- | --- |
| Section strip open, close | 0 / 100 | 10 ms | 0 | 462 → 462 ms | spring | yes |
| Account sheet | 5 / 146 | 36 ms | 3 | 500 → 408 ms | spring, out | yes |
| Bell | 1 / 123 | 16 ms | 0 | 662 (veil) → 500 ms | spring | yes |
| CoachHelm quick chat | 6 / 121 | 45 ms | 3 | spring → 260 ms | out, sheet `(.32,.72,0,1)` | yes |
| Stats Filter sheet | 7 / 100 | 74 ms | 6 | 462 → 446 ms | spring | yes |
| Recruiting sort menu | 1 / 44 | 13 ms | 0 | 180 → 180 ms | `cubic-bezier(.22,1,.36,1)` | yes |
| Ask attach menu | 2 / 223 | 17 ms | 1 | 180 ms | out | yes |
| Template row menu | 1 / 45 | 13 ms | 1 | 180 → 180 ms | out | yes |
| New qualifier date picker | 4 / 95 | 52 ms | 3 | 462 → 417 ms | spring | yes |
| Calendar New event sheet | 1 / 100 | 88 ms | 8 | 462 → 446 ms | spring | yes |
| Calendar More sheet | 5 / 111 | 34 ms | 2 | 462 → 367 ms | spring | yes |
| Calendar Day ↔ Month | 11 / 86 | 46 ms | 9 | 417 ms (pill) | spring | n/a |
| Settings › Preferences sheet | 5 / 30 | 44 ms | 3 | sheet | spring | yes |
| New qualifier End date picker | 5 / 95 | 52 ms | 4 | 462 ms | spring | yes |
| Strip: Home → Calendar | 23 / 80 | **190 ms** | 22 | page swap | n/a | n/a |
| Strip: Calendar → Stats | 18 / 92 | **146 ms** | 17 | page swap | n/a | n/a |
| Strip: Stats → Rounds | 23 / 106 | **124 ms** | 19 | page swap | n/a | n/a |
| Strip: Rounds → Team Hub | 21 / 136 (rAF max 1,159 ms) | **1,130 ms** | 130 | page swap | n/a | n/a |
| Strip: Team Hub → Home | 22 / 107 | **169 ms** | 20 | page swap | n/a | n/a |
| Strip: Home → Team Hub (control) | 24 / 82 | **189 ms** | 21 | page swap | n/a | n/a |
| Strip: Rounds → Home (control) | 9 / 108 (rAF max 1,150 ms) | **1,124 ms** | 117 | page swap | n/a | n/a |
| Home → Add event | 43 / 108 | **196 ms** | 38 | route, then sheet | n/a | n/a |
| Home → Practice chip | 34 / 123 | **177 ms** | 31 | route, then sheet | n/a | n/a |
| Drills → a drill | 58 / 59 | **336 ms** | 54 | route push | n/a | n/a |
| Qualifiers → a qualifier | 34 / 76 | **160 ms** | 30 | route push | n/a | n/a |
| **4x CPU:** Rounds → Team Hub | 76 / 78 | **4,443 ms** | 517 | | | |
| **4x CPU:** Home → Add event | 178 / 149 | **766 ms** | 185 | | | |
| **4x CPU:** Drills → a drill | 120 / 57 | **1,308 ms** | 251 | | | |

### Overlays not opened, and why

- **Long-press peeks and context menus** (`ui/PlayerPeek.tsx`, hold 450 ms; `ui/ContextMenu.tsx` `MenuSheet`, hold 500 ms): they need a press and
  hold, which a keyboard activation can't do.
- **Toasts**: they appear only after a save, a send or a failure (`ui/Toast.tsx:154`).
- **The Messages "Announcements" disclosure**: it could open the thread and mark it read (WRITES-ON-OPEN row 4).
- **Native `<select>` pickers** (Rounds "Show rounds for"): the system picker is drawn by the browser, not Clubhouse, and Chromium's isn't iOS's.
- **Team Hub ledger row disclosures**: the safety filter refused them because their labels contain "post". They are in-place expanders, not overlays.
- **Overlays inside screens not opened for writes** (the CoachHelm board and player views, round review): see "Not opened, and why".
- **Bell item swipes and the "×" on a stack**: they mark notifications read (`shell/Bell.tsx:393-403`).
- **Command palette and keyboard shortcuts**: desk only.
- **Team switch**: this coach has one team.
- **Sign out, Report a problem**: actions, not overlays to inspect.

---

## Passed (C tier)

- **Section strip kept, no bottom tab bar.**
  - The strip opens from the section name (`.ch-sw`, `shell/SectionStrip.tsx`). Its pills are 40 px drawn with a 44 px reach (`shell.css:3449-3474`).
  - `--ch-tabbar-h: 0` (`tokens.css:514`), guarded by `shell-reach-css.test.ts:112-120`. No fixed bottom bar was found on any of the 28 screens.
- **Text contrast:** nothing under its floor on 28 screens. Calendar's today cell, flagged by both engines, is ivory on a green plate drawn by a sibling
  element, which is a false positive (`crops/c02-today-vp.png`).
- **Chart marks:** none under 3:1, excluding decorative fills and gridlines. The Stats scoring-mix "par" segment (`#d9d2c3`, about 1.49:1 by
  calculation, `stats-redesign.css:2420`) wasn't on screen without a player profile.
- **Tap targets:** none under 44 pt. The search fields reach 44 through `controls.css:169` (CH-1815).
- **Overflow and clipping:** no sideways scroll or clipped text at 393×852 or 375×667, apart from the Team Hub tabs (finding 7).
- **Inputs:** all 16 px, so iOS won't zoom on focus.
- **Overlays:** every one closed on Escape. Focus return wasn't measured.
- **Safe areas (CSS only):** the top bar carries `env(safe-area-inset-top)` on every screen. Viewport meta has `viewport-fit=cover`.

## Not verified (needs S or D)

- **Real safe areas and the iOS keyboard on Ask.**
  - The Chromium stand-in shrinks the visible area to 516 px. With it, the composer stayed visible (textarea 456–500, Send 44×44 ending at 500).
  - The Safari path (`useSafariKeyboardFit`, `shell/PhoneScreen.tsx:189-224`) and the iOS keyboard itself need the Simulator or the iPhone, signed in
    by hand.
  - There is no `interactive-widget` meta.
  - Possible bottom-edge gaps from the stylesheet read: `.ch-set-savebar` (`settings.css:143`) and `.ch-rt-bar` (`rounds-track.css:1340`).
- **Smoothness on a phone.** The frame numbers above are Chromium on a Mac. Claims about the iPhone need D-tier evidence (`scripts/phone/`).

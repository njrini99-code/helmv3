# Shell catalog (1xxx)

The frame around every page: sidebar, top bar, bell, offline banner, full-page
errors, and the behaviour every page shares. Code `src/clubhouse/shell/`,
`src/clubhouse/ui/`, `src/clubhouse/lib/`. Tests `src/clubhouse/__tests__/shell.test.tsx`.

The shell's rows apply on every page: a page's own catalog only lists what is
specific to it. The accessibility scan (`npm run clubhouse:a11y`, axe-core,
WCAG 2.2 AA at 1280px and 390px) covers the bell panel and the phone More
sheet open. The phone chrome (the tab bar, the top bar's variants, pushed
screens) follows the owner's design (`docs/clubhouse/phone/foundation.md`,
D-40 to D-43).

## 10xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1001 | "Mark all read" in the bell fails | "Couldn't mark your notifications read", Retry; the unread dots come back. On success: "All notifications marked read" | `useAction('shell.markAllRead')` in `Bell` | shell.test › CH-1001 |

## 12xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1201 | The bell's list doesn't load | "Notifications didn't load." + "Try again; the error has been reported." inside the panel | `InlineNotice` in `Bell` | shell.test › CH-1201 |
| CH-1202 | The page was built for an older version | "A newer version of GolfHelm is ready." Reload | `RouteErrorView kind=chunk` | shell.test › CH-1202 |
| CH-1203 | GolfHelm updated while the page was open | "This page is out of date." Reload | `kind=stale-action` | shell.test › CH-1203 |
| CH-1204 | The server is busy | "GolfHelm is slow to respond." Try again | `kind=transient` | shell.test › CH-1204 |
| CH-1205 | The connection dropped mid-load | "This page didn't finish loading." Try again | `kind=load` | shell.test › CH-1205 |
| CH-1206 | Anything else crashed the page | "Something went wrong on this page." + reported automatically, Try again, Back to Home | `kind=unknown` | shell.test › CH-1206 |
| CH-1207 | The sidebar's next event doesn't load | The next-event card is left out (never a wrong or empty card); the failure is logged as `clubhouse.shell.nextEvent` | `loadClubhouseShell` | shell.test › CH-1207 |
| CH-1208 | The Roster badge's join requests don't load | The badge is left out rather than showing 0; logged as `clubhouse.shell.joinRequests` | `loadClubhouseShell` | shell.test › CH-1208 |

## 13xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1301 | A page that hasn't been rebuilt in Clubhouse | "Rounds hasn't been rebuilt yet." with a way back | `NotRebuilt` | shell.test › CH-1301 |
| CH-1302 | The bell has nothing | "You're all caught up." + what shows up here | `Bell` | shell.test › CH-1302 |
| CH-1303 | The bell's filter has nothing | "Nothing of this kind." + Show all | `Bell` | shell.test › CH-1303 |
| CH-1304 | Nothing is scheduled | No next-event card in the sidebar; with an event it shows "2 of 3 confirmed" and a bar | `Sidebar`, `NextEventCard` | shell.test › CH-1304 |

## 14xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1401 | The bell is loading its list | Four skeleton rows; a warm list stays on screen while it refreshes | `Bell` | shell.test › CH-1401 |

## 16xx Motion (90, 150, 220, 360ms, one ease; instant when Animations is off or the OS asks for reduced motion)

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1601 | Moving to another page | The page fades in with a 6px settle (220ms); nothing on first load | `RouteFrame`, `CH_ROUTE` | preview |
| CH-1602 | Opening More on a phone | The sheet slides up (360ms) over a fading scrim (220ms); dragging it down closes it (CH-1611) | `TabBar`, `chTween('slow')` | preview |
| CH-1603 | Opening the bell or any menu | It scales out of its button (150ms) | `CH_POP` | preview |
| CH-1604 | A toast arrives or leaves | Slides up 10px and fades (220ms); the stack reflows | `ToastProvider` | preview |
| CH-1605 | Going offline or back online | The banner fades in and out (220ms) | `OfflineBanner` | preview |
| CH-1606 | Pressing any button, row or tab | It presses in to 98.5% | `--ch-press-scale` | preview |
| CH-1607 | The first Tab on a page | Skip to content slides into view (150ms) | `.ch-skip` | preview |
| CH-1608 | Animations off in Settings, or the OS asks for reduced motion | Every Clubhouse transition is instant | `data-motion="off"`, `useChReducedMotion` | settings.test › CH-8608 |
| CH-1609 | A page or section is loading | Skeletons shimmer left to right (1.4s loop); they hold still when Animations is off or motion is reduced | `.ch-skel` | preview |
| CH-1610 | A phone screen is pushed (a thread, details, a new message) or popped | It slides in from the right, and back out, in 220ms; a fade when motion is reduced | `PhoneScreen`, `chTween('base')` | preview |
| CH-1611 | Someone drags a phone sheet (More, or any `Modal`) down by its grab or header | It follows the finger; past 80px or on a quick flick it closes with the press haptic, otherwise it springs back (360ms). With reduced motion there is no drag: the sheet fades, and Close, the scrim and Esc close it. The Close button inside stays a button | `useSheetDrag` in `TabBar` and `Modal` | shell.test › CH-1611 |

## 17xx Haptics (iOS app only; off when Haptics is off in Settings)

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-1701 | Changing tabs (not tapping the tab they're on) | A selection tick | `haptic('select')` in `TabBar` | shell.test › CH-1701 |
| CH-1702 | Any save or send lands | A medium tap | `useAction` → `haptic('commit')` | shell.test › CH-1702 |
| CH-1703 | Any save or send fails | The OS error pattern | `useAction` → `haptic('error')` | shell.test › CH-1703 |
| CH-1704 | Opening More; swiping the sheet away | A tick; a light tap | `TabBar` | preview |
| CH-1705 | Opening the bell, a notification, or a menu item | A selection tick | `Bell`, `Menu` | preview |
| CH-1706 | The connection drops | The OS warning pattern | `OfflineBanner` | shell.test › CH-1901 |

## 18xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-1801 | The first Tab on any page offers "Skip to content", which jumps past the navigation to the page | `.ch-skip` → `#ch-content` (`tabIndex=-1`) | shell.test › CH-1801 |
| CH-1802 | The phone More sheet is modal: focus moves in, Tab stays inside, Esc closes it and focus returns to More | `TabBar` | shell.test › CH-1802 |
| CH-1803 | The current page is marked in the sidebar and tab bar; the sidebar and its navigation are named landmarks; breadcrumbs mark the current page | `aria-current="page"`, `aria-label` | shell.test › CH-1803 |
| CH-1804 | Toasts are announced: confirmations politely, errors right away | `aria-live="polite"`, `role="alert"` on errors | shell.test › CH-1804 |
| CH-1805 | The bell panel is a dialog: it takes focus on open, Esc closes it, and the filter menu works by keyboard | `Bell`, `Menu` (arrow keys, Home, End, Esc) | preview |
| CH-1806 | Every control shows a focus ring on keyboard focus; text fields show their own green or ink ring instead, never two | `base.css` `:focus-visible` | preview |
| CH-1807 | No axe violations (WCAG 2.2 AA, contrast included) with the bell open and the More sheet open | `npm run clubhouse:a11y` | a11y scan |
| CH-1808 | The phone tab bar lists the role's tabs (coach: Home, Helm, Rounds, Stats, More; player: Home, Calendar, Messages, My stats, More; D-40), and when Messages is under More, More is named with its unread count ("More, 3 unread messages") | `TabBar`, `phoneTabsFor` | shell.test › CH-1808 |
| CH-1809 | A pushed phone screen is named by its title, and focus moves to that title; while it is up, the shell's top bar and tab bar are inert, so VoiceOver can't wander behind it | `PhoneScreen`, `usePhoneImmersive` | shell.test › CH-1809 |
| CH-1810 | On the phone the top bar names the page; a page with its own top (`PhoneTop`) gets a back link named for where it goes ("Back to More") in place of the bell | `TopBar`, `PhoneTop` | shell.test › CH-1810 |

## 19xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1901 | The device goes offline | A banner under the top bar: "You're offline. You can keep reading; changes will wait until you reconnect." It leaves when the connection returns | `OfflineBanner`, `online`/`offline` events, warning haptic | shell.test › CH-1901 |
| CH-1902 | A save takes longer than 5 seconds (forms, switches and CoachHelm settings) | "Still saving…" + "This is taking longer than usual. Keep this page open." (once per save) | `useAction`, `useInstantSave`, the CoachHelm queue; `CH_SLOW_SAVE_AFTER` | shell.test › CH-1902 |
| CH-1903 | Someone saves while offline | "Couldn't save your profile: you're offline" (the action named) + "Reconnect, then try again. Nothing was changed." Nothing is sent and switches don't flip | `useAction`, `useInstantSave`, CoachHelm queue | shell.test › CH-1903 |
| CH-1904 | Moving to another page | The new page opens at the top, never halfway down | `RouteFrame` resets the canvas scroll | preview |
| CH-1905 | Someone presses Try again on a notice while offline | The notice adds "You're offline. Reconnect, then try again." (warning haptic) and nothing is retried; the line leaves when the connection returns | `InlineNotice` | shell.test › CH-1905 |
| CH-1906 | On the phone, the edge swipe or the browser's back while a screen is pushed | The top screen pops, as the back link would; the page stays put | `usePhoneStackHistory` | shell.test › CH-1906 |
| CH-1951 | Someone clicks the same thing over and over (rage click) | Nothing on screen | Sentry Replay in production. Partial: only 10% of sessions are recorded, plus every session that has an error, so most rage clicks are not seen. No Clubhouse-side detector yet | existing |
| CH-1952 | A click that does nothing (dead click) | Nothing on screen | Sentry Replay, same 10% plus error sessions | existing |
| CH-1953 | A slow response to a click (slow click) | Nothing on screen | Sentry Replay, same 10% plus error sessions | existing |
| CH-1954 | The page is slow to respond or shifts after loading (INP, CLS, LCP) | Nothing on screen | Sentry browser tracing, 20% of sessions | existing |

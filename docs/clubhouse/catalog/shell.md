# Shell catalog (1xxx)

The frame around every page: sidebar, top bar, bell, offline banner, full-page
errors, and the behaviour every page shares. Code `src/clubhouse/shell/`,
`src/clubhouse/ui/`, `src/clubhouse/lib/`. Tests `src/clubhouse/__tests__/shell.test.tsx`.

Status: the rows below are the ones Settings relies on and the bell. The rest
of the shell (sidebar, tab bar, top bar) is catalogued in the shell pass.

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

## 13xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1301 | A page that hasn't been rebuilt in Clubhouse | "Rounds hasn't been rebuilt yet." with a way back | `NotRebuilt` | shell.test › CH-1301 |
| CH-1302 | The bell has nothing | "You're all caught up." + what shows up here | `Bell` | shell.test › CH-1302 |
| CH-1303 | The bell's filter has nothing | "Nothing of this kind." + Show all | `Bell` | shell.test › CH-1303 |

## 14xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1401 | The bell is loading its list | Four skeleton rows; a warm list stays on screen while it refreshes | `Bell` | shell.test › CH-1401 |

## 19xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-1901 | The device goes offline | A banner under the top bar: "You're offline. You can keep reading; changes will wait until you reconnect." It leaves when the connection returns | `OfflineBanner`, `online`/`offline` events, warning haptic | shell.test › CH-1901 |
| CH-1902 | A save takes longer than 5 seconds | "Still saving…" + "This is taking longer than usual. Keep this page open." (once per save) | `useAction`, `CH_SLOW_SAVE_AFTER` | shell.test › CH-1902 |
| CH-1903 | Someone saves while offline | "Couldn't save your profile: you're offline" (the action named) + "Reconnect, then try again. Nothing was changed." Nothing is sent and switches don't flip | `useAction`, `useInstantSave`, CoachHelm queue | shell.test › CH-1903 |
| CH-1951 | Someone clicks the same thing over and over (rage click) | Nothing on screen; recorded with a session replay | Sentry Replay (production), masked text and inputs | existing |
| CH-1952 | A click that does nothing (dead click) | Nothing on screen; recorded with a replay | Sentry Replay | existing |
| CH-1953 | A slow response to a click (slow click) | Nothing on screen; recorded with a replay | Sentry Replay | existing |
| CH-1954 | The page is slow to respond or shifts after loading (INP, CLS, LCP) | Nothing on screen; measured per page | Sentry browser tracing (web vitals) | existing |

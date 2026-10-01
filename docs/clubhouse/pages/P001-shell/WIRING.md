# P001 — Shell: wiring map

## Entry point

```text
Route:                   every /golf/dashboard route
Layout:                  src/app/golf/(dashboard)/layout.tsx: session, role and team; when isClubhouseFor(role),
                         loadClubhouseShell(teamId) and <ClubhouseShell>, else the existing shell (10801)
Gate:                    src/clubhouse/gate.ts isClubhouseFor (coach or player, golf_clubhouse_ui on)
Providers:               src/clubhouse/shell/ClubhouseShell.tsx (golf user, badges, session activity, swipe-back guard)
Frame:                   src/clubhouse/shell/ClubhouseFrame.tsx (Sidebar, TopBar, OfflineBanner, RouteFrame, TabBar;
                         NotRebuilt when isRebuilt(pathname, role) is false, 10401, 10802)
Server loader:           src/clubhouse/data/shell.ts loadClubhouseShell (next event, join requests, timezone in parallel,
                         then the event's attendance; each failed read logs through chLogServer('shell', …) and hides its UI)
Route errors:            src/components/errors/RouteErrorBoundary.tsx → RouteErrorView inside Clubhouse (10603 to 10607)
```

## End-to-end graph

```text
UI (Sidebar, TopBar, Bell, TabBar and More, OfflineBanner, RouteErrorView, NotRebuilt)
↓
Action (Bell's markAll through useAction; openItem; navigation links)
↓
Client controller: useAction (offline refusal 10703, slow notice 10702, success 10901, error toast with Retry 11402,
                   chReport 12301, haptics)
↓
Server actions: src/app/golf/actions/unified-notifications.ts
↓
Data: the unified notifications feed; golf_events, golf_event_attendance, golf_team_join_requests, golf_team_settings
↓
Contract outcomes: CONTRACT.md (Bridge IDs 1ccii, catalog CH-1xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/shell.test.tsx, gate.test.ts, native.test.tsx, motion.test.tsx
```

## Actions

Each action's record is in `config/clubhouse/pages/P001-shell.json` (`actions`); the whole list is
in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`.

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P001-OPEN-BELL | The bell | `setOpen` → load effect | `getUnifiedNotifications` | notifications feed | loading 10201 · refresh 10301 · empty 10402 · failed 10602 |
| ACT-P001-FILTER-BELL | The bell's filter menu | `setFilter` | — | — | nothing of this kind 10403 |
| ACT-P001-OPEN-NOTIFICATION | A notification row | `openItem` | `markNotificationRead` (failure reported at low severity) | notifications feed | optimistic 11301 |
| ACT-P001-MARK-ALL-READ | Mark all read | `markAll.run` (useAction `shell.markAllRead`) | `markAllNotificationsRead` | notifications feed | lands 10901 · fails 10601 · optimistic 11301 · Retry 11402 · offline 10703 |
| ACT-P001-NAVIGATE | Sidebar, tab bar, More | `next/link` | — | — | frame 10102 · top 10101 · not rebuilt 10401 · role 10802 |
| ACT-P001-OPEN-MORE | More (phone) | `setMoreOpen` | — | — | phone chrome 11901 · modal 11802 |
| ACT-P001-ROUTE-RETRY | Try again or Reload on a crashed page | `onRetry` | `RouteErrorBoundary` `handleRetry` | — | 11401 · 10603 to 10607 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `shell/ClubhouseFrame.tsx` | The frame; skip link; motion-off marker | 10102, 11801, 11608 |
| `shell/Sidebar.tsx`, `NextEventCard.tsx` | Navigation by v2 section, badges, next event | 10802, 10404, 10608, 10609, 11803 |
| `shell/TopBar.tsx`, `crumbs.tsx` | Breadcrumb, bell, settings (a coach on CoachHelm or Team Hub gets that page's section: `settings?section=coachhelm` or `team`); the phone title or a page's back link | 11810 |
| `shell/Bell.tsx` | The bell: popover, phone sheet, filter, mark all read | 10201, 10301, 10402, 10403, 10601, 10602, 11301, 11805, 11811, 11612 |
| `shell/TabBar.tsx` | Phone tabs and the More sheet | 11808, 11802, 11602, 11901, 11701, 11704 |
| `shell/OfflineBanner.tsx` | The offline banner | 10701, 11605, 11706 |
| `shell/RouteFrame.tsx` | The route reveal and the press | 10101, 11601, 11606 |
| `shell/NotRebuilt.tsx` | A route not rebuilt for the role | 10401 |
| `shell/PhoneScreen.tsx`, `phone-chrome.tsx` | Pushed screens, the page top, the phone back | 11610, 11809, 12001 |
| `ui/Toast.tsx`, `ui/Notices.tsx` | Toasts, inline notices, route error views | 11804, 10704, 10603 to 10607, 11401 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`) | Clubhouse | every page's writes |
| `src/clubhouse/lib/track.ts`, `track-server.ts` | Clubhouse | everything |
| `src/clubhouse/lib/press.ts`, `motion.ts`, `reduced-motion.ts`, `sheet-drag.ts`, `haptics.ts`, `use-phone.ts` | Clubhouse | the frame and pages |
| `src/contexts/notification-badge-context` (`useNotificationBadges`) | shared, not UI | Bell, Sidebar, TabBar |
| `src/hooks/golf/use-appearance-preferences` | shared, not UI | ClubhouseFrame (Animations off) |

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| getUnifiedNotifications | actions/unified-notifications.ts | Existing | the bell's list |
| markNotificationRead, markAllNotificationsRead | actions/unified-notifications.ts | Existing | read state |
| loadClubhouseShell | src/clubhouse/data/shell.ts | Existing (Clubhouse) | next event and the Roster badge |

## Data resources

### DATA-SHELL

```text
Tables:   golf_events, golf_event_attendance, golf_team_join_requests, golf_team_settings
RPCs:     none
Storage:  none
Realtime: none in the frame (the badge context keeps its own counts)
Cache:    none; read with each page load
RLS:      team-scoped reads through the server client
Read path:  loadClubhouseShell (server, one pass, never throws for a partial read)
Write path: none
```

### DATA-NOTIFICATIONS

```text
Read path:  getUnifiedNotifications (on every bell open)
Write path: markNotificationRead, markAllNotificationsRead
```

## Held dependencies

None.

## Impact notes

- `useAction` is every page's write path. A change to its copy, haptics or reporting changes every
  page; the shell tests (10901, 11402, 12301, 10702, 10703) guard it.
- `RouteErrorBoundary` is shared with Fairway. Only its view is Clubhouse's.
- `nav.ts`'s `CH_REBUILT_ROUTES` decides what each role reaches; `clubhouse:check` keeps it and
  `SCREENS.md` in step.

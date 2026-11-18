# P001 — Shell: wiring map

<!-- clubhouse:release-audit:start -->
## Current ownership audit — 2026-10-06

Root: `src/clubhouse/shell`. The AST inventory found 21 source files, 6
overlay/control sites and 13 motion nodes. Navigation crossfade, Back/Forward
scroll restoration, Bell, More and team switch.

Exact call sites, direct package imports, responsive styles and mapped tests
are in the [all-page audit](../../ALL_PAGE_AUDIT.md#p001-shell). Shared
Modal/Menu/PhoneScreen owners and shell behavior are audited once there;
counts include wrappers rather than unique popups.
<!-- clubhouse:release-audit:end -->

## Entry point

```text
Route:                   every /golf/dashboard route
Layout:                  src/app/golf/(dashboard)/layout.tsx: session, role and
                         team; always tagClubhouseRequest(), then
                         loadClubhouseShell(teamId, playerId, coachId) and
                         <ClubhouseShell> (the Fairway shell, golf_clubhouse_ui
                         and HELM_CLUBHOUSE_TEAMS were removed on 2026-11-14,
                         #2527; 10801)
Gate:                    src/clubhouse/gate.ts isClubhouseFor (a role check: a
                         coach or a player; a yes also tags the request's
                         server events ui=clubhouse). Tournaments adds its own
                         golf_tournaments_v1 (isTournamentsFor,
                         tournamentsNavEnabled)
Providers:               src/clubhouse/shell/ClubhouseShell.tsx (golf user,
                         badges, session activity, swipe-back guard)
Frame:                   src/clubhouse/shell/ClubhouseFrame.tsx (Sidebar,
                         TopBar, OfflineBanner, RouteFrame; on the phone
                         SectionStrip, AccountSheet and PhoneDock; the command
                         palette (CommandLayer) and Quick chat
                         (QuickChatProvider); NotRebuilt when isRebuilt(pathname,
                         role) is false, 10401, 10802, with AliasWait while an
                         old address redirects and PlayersOnlyRounds for a
                         coach on a player's round flow; the team switch offered
                         to Sidebar and AccountSheet from teamSwitchFor(userData),
                         10803; RouteFrame keyed by pathname and team, 10103)
Server loader:           src/clubhouse/data/shell.ts loadClubhouseShell (in
                         parallel: join requests, timezone, a player's fresh
                         round in progress with its holes, a coach's CoachHelm
                         gate for the Ask key, the course location, a coach's
                         own staff role and overdue tasks; a failed round or
                         role read comes back as `unknown` and the client keeps
                         what it last knew (shell/shell-memory.ts); each failed
                         read logs through chLogServer('shell', …)). The
                         sidebar's next-event read was removed on 2026-11-07.
                         The palette's people and events are read when the
                         palette needs them (data/palette-people.ts, decision 16)
Route errors:            each segment's error.tsx →
                         src/components/errors/RouteErrorBoundary.tsx →
                         RouteErrorView inside Clubhouse
                         (shell/ClubhouseRouteError.tsx; 10603 to 10607)
```

## End-to-end graph

```text
UI (Sidebar, TopBar, Bell, SectionStrip and AccountSheet, PhoneDock, TeamSwitch, command palette, Quick chat, OfflineBanner, RouteErrorView, NotRebuilt)
↓
Action (Bell's markAll through useAction; openItem; navigation links; useTeamSwitch's pick through useAction)
↓
Client controller: useAction (offline refusal 10703, slow notice 10702, success
                   10901, error toast with Retry 11402, chReport 12301, haptics)
↓
Server actions: src/app/golf/actions/unified-notifications.ts;
                src/app/golf/actions/team-switcher.ts (setActiveTeam)
↓
Data: the unified notifications feed; golf_team_join_requests,
      golf_team_settings, golf_rounds and golf_holes (a player's round in
      progress), golf_tasks (a coach's overdue badge); golf_team_coach_staff
      and golf_teams (the switch's gate and list, and a coach's own role), the
      golf_active_team cookie
↓
Contract outcomes: CONTRACT.md (Bridge IDs 1ccii, catalog CH-1xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/shell.test.tsx, team-switch.test.tsx,
       gate.test.ts, gate-sentry-tag.test.ts, shell-dock.test.tsx,
       native.test.tsx, motion.test.tsx, src/clubhouse/shell/__tests__/
```

## Actions

Each action's record is in `config/clubhouse/pages/P001-shell.json` (`actions`);
the whole list is in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`.

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P001-OPEN-BELL | The bell | `setOpen` → load effect | `getUnifiedNotifications` | notifications feed | loading 10201 · refresh 10301 · empty 10402 · failed 10602 |
| ACT-P001-FILTER-BELL | The bell's filter menu | `setFilter` | — | — | nothing of this kind 10403 |
| ACT-P001-OPEN-NOTIFICATION | A notification row | `openItem` (`armRelink`, then `router.push(action_url)`; another team's item switches team first with `setActiveTeam`, 2026-11-13) | `markNotificationRead` (failure reported at low severity) | notifications feed | optimistic 11301 |
| ACT-P001-MARK-ALL-READ | Mark all read | `markAll.run` (useAction `shell.markAllRead`) | `markAllNotificationsRead` | notifications feed | lands 10901 · fails 10601 · optimistic 11301 · Retry 11402 · offline 10703 |
| ACT-P001-SWITCH-TEAM | The sidebar's team line (desktop); the Team list in the account sheet (phone) | `useTeamSwitch.pick` (useAction `shell.switchTeam`; the refresh and the sheet close are inside the action, so Retry finishes the job) | `setActiveTeam` | golf_team_coach_staff, golf_teams, the golf_active_team cookie | reads again 10103 · gate 10803 · plain label 10405 · fails 10611 · tick 11707 · menu 11813 · phone 11814 |
| ACT-P001-NAVIGATE | Sidebar (desktop), the section strip (phone) | `next/link` | — | — | frame 10102 · top 10101 · not rebuilt 10401 · role 10802 |
| ACT-P001-OPEN-MORE | The section strip's account pill (phone; the account sheet replaced More) | `setAccountOpen` | — | — | phone chrome 11901 · modal 11802 |
| ACT-P001-ROUTE-RETRY | Try again or Reload on a crashed page | `onRetry` | `RouteErrorBoundary` `handleRetry` | — | 11401 · 10603 to 10607 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `shell/ClubhouseFrame.tsx` | The frame; skip link; motion-off marker | 10102, 11801, 11608 |
| `shell/Sidebar.tsx` | Navigation by v2 section, badges, a player's Resume card (`ResumeRoundCard`); the brand block (a plain team label, or the switcher's button). The next-event card was removed on 2026-11-07 | 10802, 10404, 10405, 10608, 10609, 11803 |
| `shell/TeamSwitch.tsx`, `shell/team-switch.ts` | The team switcher: `TeamSwitch` (the sidebar's menu button and listbox), `MoreTeamSwitch` (the account sheet's Team list), `teamSwitchFor` (the gate and the names) and `useTeamSwitch` (the action, the optimistic team, the refresh) | 10103, 10611, 10803, 11707, 11813, 11814 |
| `shell/TopBar.tsx`, `shell/crumbs.tsx` | Breadcrumb, bell, settings (a coach on CoachHelm or Team Hub gets that page's section: `settings?section=coachhelm` or `team`); the phone title or a page's back link | 11810 |
| `shell/Bell.tsx` | The bell: popover, phone sheet, filter, mark all read | 10201, 10301, 10402, 10403, 10601, 10602, 11301, 11805, 11811, 11612 |
| `shell/SectionStrip.tsx`, `shell/section-switch.tsx` | The phone's section strip, which replaced the tab bar on 2026-10-13 (`phone/section-strip.md`): every section as a pill under the top bar, then the account pill | 11808, 11602, 11901, 11701, 11704 |
| `shell/AccountSheet.tsx` | The phone's account sheet (was the More sheet): who you are, the team switch for a head coach on two or more teams, Help, Sign out; scrolls on a short screen | 11802, 11814 |
| `shell/Dock.tsx` | The phone's dock (`PhoneDock`, `ThumbDock`), and the Resume round accessory with its discard (CH-1823, CH-1824) | — |
| `shell/command/` | The command palette and the top bar's search pill (`CommandLayer`, `Palette`, `SearchPill`), and keyboard shortcuts | — |
| `shell/quick-chat/` | Quick chat: a coach's CoachHelm Ask popover from the bar | — |
| `shell/PushAsk.tsx`, `shell/OfflineSync.tsx` | The push-permission ask; the service worker's Background Sync pass (taken over from Fairway, 2026-11-14) | — |
| `shell/OfflineBanner.tsx` | The offline banner | 10701, 11605, 11706 |
| `shell/RouteFrame.tsx` | The route crossfade and the press; keyed by pathname and team, so a new team remounts the page | 10101, 10103, 11601, 11606 |
| `shell/NotRebuilt.tsx` | A route not rebuilt for the role | 10401 |
| `shell/PhoneScreen.tsx`, `shell/phone-chrome.tsx`, `ui/PhoneBar.tsx` | Pushed screens, the page top, the phone back | 11610, 11809, 12001 |
| `ui/Toast.tsx`, `ui/Notices.tsx` | Toasts, inline notices, route error views | 11804, 10704, 10603 to 10607, 11401 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/clubhouse/lib/use-action.ts` (`useAction`) | Clubhouse | every page's writes |
| `src/clubhouse/lib/track.ts`, `lib/track-server.ts` | Clubhouse | everything |
| `src/clubhouse/lib/press.ts`, `lib/motion.ts`, `lib/reduced-motion.ts`, `lib/sheet-drag.ts`, `lib/haptics.ts`, `lib/use-phone.ts` | Clubhouse | the frame and pages |
| `src/contexts/notification-badge-context` (`useNotificationBadges`) | shared, not UI | Bell, Sidebar, the section switch |
| `src/hooks/golf/use-appearance-preferences` | shared, not UI | ClubhouseFrame (Animations off) |

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| getUnifiedNotifications | actions/unified-notifications.ts | Existing | the bell's list |
| markNotificationRead, markAllNotificationsRead | actions/unified-notifications.ts | Existing | read state |
| loadClubhouseShell | src/clubhouse/data/shell.ts | Existing (Clubhouse) | the Roster badge, a player's round in progress, a coach's role, Ask gate and overdue-task count, timezone and course location |
| getPalettePeople, getPaletteEvents | src/clubhouse/data/palette-people.ts | Existing (Clubhouse) | the palette's player names and ids (decision 16), and the team's tournaments and qualifiers |
| setActiveTeam | actions/team-switcher.ts | Existing | the switch: head coach on more than one team only, the team must be one the coach is staffed on; writes the `golf_active_team` cookie and revalidates `/golf/dashboard` |

## Data resources

### DATA-SHELL

```text
Tables:   golf_team_join_requests, golf_team_settings, golf_rounds with
          golf_holes (a player), golf_team_coach_staff and golf_tasks (a
          coach); for the palette, on demand, golf_tournaments, golf_qualifiers
          and, for a coach only, golf_team_members with
          golf_players (id, first_name, last_name), sent to the client as { id,
          name } and held in memory by shell/command/people.ts, cleared on a
          team or person change (decision 16)
RPCs:     none
Storage:  none
Realtime: none in the frame (the badge context keeps its own counts)
Cache:    none; read with each page load
RLS:      team-scoped reads through the server client
Read path:  loadClubhouseShell (server, one pass, never throws for a partial
            read)
Write path: none
```

### DATA-NOTIFICATIONS

```text
Read path:  getUnifiedNotifications (on every bell open)
Write path: markNotificationRead, markAllNotificationsRead
```

### DATA-TEAM-SWITCH

```text
Tables:   golf_team_coach_staff (the coach's staff rows and roles), golf_teams
          (id, name, gender)
RPCs:     none
Storage:  none (an httpOnly cookie, golf_active_team, 90 days)
Realtime: none
Cache:    revalidatePath('/golf/dashboard', 'layout') in the action, then
          router.refresh() from the client
RLS:      the RLS-scoped server client
Read path:  the layout's getCoachTeamSwitchContext (teams and canSwitch, passed
            down as userData.coachTeams and canSwitchTeams)
Write path: setActiveTeam (checks canSwitch and that the team is staffed, then
            sets the cookie); every page's team comes from
            resolveCoachActiveTeamIdForRequest, which validates the cookie
            against the staff rows
```

## Notification links (checked 2026-10-17)

Every `action_url` shape in production (`notifications`,
`golf_calendar_notifications`; read-only aggregate) and every writer that sets
one, followed for each role that receives it, lands on a rebuilt screen or an
alias that moves it to one, and the query naming the item is read there
(`__tests__/wiring-p001-notification-links.test.ts`):

| Address | Receives | Lands on |
| --- | --- | --- |
| `/calendar?event=<id>` (invitations, reminders, updates, cancellations, RSVPs) | coach, player | Calendar, opened on that event's day |
| `/messages?conversation=<id>` (message fan-out, stored in `golf_calendar_notifications`) | coach, player | Messages, that thread |
| `/announcements` | coach, player | Team Hub, Announcements tab |
| `/tasks?task=<id>` | coach, player | Team Hub (coach: Tasks tab), that task |
| `/roster`, `/roster?tab=requests` | coach | Roster; for `?tab=requests` desktop focuses the requests card at the top (`Roster`), and the phone opens the requests sheet once (`RosterPhone`); P003 |
| `/team` (older rows) | coach | Settings, Team |
| `/settings`, `/settings?section=notifications` | coach, player | Settings |
| `/coachhelm`, `/coachhelm?view=development`, `/my-development` (next.config) | coach, player | CoachHelm; a player's Development opens Stats' Development tab |
| `/rounds/<id>/review` | player | the round, `/rounds/<id>` |
| `/qualifiers/<id>` | coach, player | the qualifier |
| `/golf/dashboard` | coach, player | Home |

The calendar table's `notification_type` carries dedupe keys
(`event_updated:<start>|<end>`, `rsvp_response:<id>`); the bell never reads the
type for that table, so they render as events. A message row from that table is
filed under Events, not Messages, by the shared model
(`categorizeCalendarNotificationRow`): raised, not changed here.

A link to the screen already open (the bell's `?conversation=` while Messages is
up) armed `shell/relink.ts` first: the frame (`useRelinkEpoch`, in RouteFrame's
key) mounts the screen again once that address arrives, as Messages and Calendar
read their item only on mount. Universal links (`DeepLinks`) arm it the same
way, and a tapped push is armed from `helm:push-navigate`, which
CapacitorProvider pushes.

## Held dependencies

None.

## Impact notes

- `useAction` is every page's write path. A change to its copy, haptics or
  reporting changes every page; the shell tests (10901, 11402, 12301,
  10702, 10703) guard it.
- `RouteErrorBoundary` lives outside `src/clubhouse` (`src/components/errors`).
  Only its view is Clubhouse's.
- `setActiveTeam` is also the bell's switch for another team's item. Its
  refusals (`unauthenticated`, `switching-not-permitted`, `unauthorized`) are
  mapped to a sentence in `team-switch.ts`; a new reason shows the default hint
  until it is mapped.
- The `HELM_CLUBHOUSE_TEAMS` allowlist (Q-131) was removed with Fairway on
  2026-11-14: every team gets Clubhouse.
- The account sheet's `max-height` and scroll (`styles/shell.css`) apply to
  every role's sheet.
- `shell/nav.ts`'s `CH_REBUILT_ROUTES` (with `CH_REBUILT_PATTERNS` and
  `CH_REBUILT_CHILDREN`) decides what each role reaches; `clubhouse:check` keeps
  it and `SCREENS.md` in step.

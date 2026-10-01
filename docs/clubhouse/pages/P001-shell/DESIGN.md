# P001 — Shell: design handoff

## Package

```text
Source:   the owner's Claude Design bundles, in design/handoff/ (VERSIONS.md)
Version:  v2 (2026-09-29): gh-nav.js (navigation per role), gh-states.jsx and gh-polish.css
          (loading, empty, motion), gh-core.js (press, haptics), sidebar.css, depth.css
          v1: m-shell.jsx, m.css, mobile/m-shell.jsx (the approved phone shell)
Date:     2026-09-29
Status:   approved
```

## Design objective

A green frame with an inset ivory canvas and a quiet sidebar on wide screens,
and a full-bleed canvas with an ivory glass tab bar on phones. The frame carries
navigation and status and stays out of the page's way.

## Problems being solved

The old app layered new styles on Fairway, and the owner rejected the result.
Clubhouse is a fresh tree, so the frame has to supply everything the old shell
did: navigation, notifications, offline and error handling, toasts, motion and
haptics. It never nests a Fairway component.

## User goal

Get anywhere in two taps, and trust what the app says about the outcome of every
action.

## Visual hierarchy

Canvas first. Then the sidebar (the brand, the navigation in its v2 sections,
the next-event card), then the top bar (breadcrumb, bell, settings). On the
phone: the page, the top bar (the title and the bell, or a page's own back
link), then the tab bar.

## Components

### Reused Clubhouse primitives

`Button`, `IconButton`, `Icon`, `Menu`, `Toast`, `InlineNotice`,
`RouteErrorView`, `Modal` (a sheet on the phone), `PhoneBar`, `useSheetDrag`,
`useChPress`, `useChReducedMotion`.

### New Clubhouse components

`ClubhouseShell` (the providers), `ClubhouseFrame` (the UI), `Sidebar`,
`TopBar`, `Bell`, `TabBar` with the More sheet, `OfflineBanner`, `RouteFrame`
(the reveal and the press), `NotRebuilt`, `NextEventCard`, `PhoneScreen` and
`phone-chrome` (pushed screens, the page top), `crumbs`, `ClubhouseSwitch`,
`TeamSwitch` (the team switcher: `BrandTeamSwitch` in the sidebar,
`MoreTeamSwitch` in the More sheet) with `team-switch` (the gate and the
action).

### Modified Clubhouse components

The v2 foundation changes (2026-09-29): motion (D-64), haptics (D-70), page
empty state (D-71) and navigation (D-66).

## Actions affected

Listed in `config/clubhouse/pages/P001-shell.json` `actions`; the graph is
WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md). 05, 10, 11, 12 and 15 are N/A for the frame, with reasons.

## Motion intent

v2 (D-64): press 110ms (about 6px), quick 180ms, base 260ms, release 280ms,
reveal 520ms with a 55ms step on first paint only. The ease-out, in-out and
spring curves. The skeleton appears after 150ms, with a 1.9s shimmer. Reduced
motion, or Animations off in Settings, turns all of it off.

## Haptic intent

v2 (D-70): selection for a tab change, a menu pick, or opening the bell or a
notification; success when a save lands; error on failure; warning when the
connection drops; medium only when a sheet settles. Every other tap is silent.

## Desktop

Sidebar and canvas. The top bar is sticky glass over the canvas. The bell is a
popover under its button.

## Phone

Approved spec `docs/clubhouse/phone/foundation.md`: the tab bar (coach Home,
CoachHelm, Calendar, Stats; player Home, CoachHelm, Rounds, Team Hub; then
More), the More sheet, the top bar's root and pushed variants, the bell as a
modal sheet, and pushed screens with the edge swipe.

## Accessibility

Skip to content on the first Tab, named landmarks, the current page marked,
announced toasts (errors at once), dialogs that take and return focus, focus
rings, and axe clean at 1280 and 390.

## Data assumptions

Only data the app has. The v2 top bar's search field is not rendered, because no
search source exists (PROGRESS data gaps). There is no dead control.

## Existing backend capabilities used

`getUnifiedNotifications`, `markNotificationRead`, `markAllNotificationsRead`
(`src/app/golf/actions/unified-notifications.ts`); the badge context
(`useNotificationBadges`); the shell loader's three reads. WIRING.md maps each.

## HELD requirements

### New features

None.

### New data/schema

None.

### Owner decisions

D-25 (the animation chunk after first paint), D-40 and D-41 (the phone shell),
D-42 (red means destructive), D-64 (motion), D-66 (navigation), D-70 (haptics),
D-71 (page empty state).

## Explicit non-goals

Top-bar search (no source yet), and any Fairway page inside the Clubhouse frame
(a page not rebuilt shows the notice instead). The team switcher was a non-goal
until the owner asked for it (2026-10-01, Q-130): a head coach on two or more
teams switches from the sidebar's team line and the phone More sheet (CH-1813,
CH-1814); the Home hero bar's team chip stays a label.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the frame (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI only: the golf user, badge and session-activity providers, the iOS swipe-back guard, RouteErrorBoundary's classification
```

# P001 — Shell: design handoff

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

Shared Menu, TeamSwitch, OfflineBanner and Toast now use zero-duration
transitions when motion is disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## Current implementation audit — 2026-10-06

Nested overlays must retain scroll and restore focus; check keyboard dismissal
and VoiceOver isolation.

The approved boards and phone specification remain the design authority.
[all-page audit](../../ALL_PAGE_AUDIT.md#p001-shell) records current
implementation owners; source token durations do not certify smoothness,
visual fidelity or device behavior.
<!-- clubhouse:release-audit:end -->

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
(the navigation crossfade and the press), `NotRebuilt`, `NextEventCard`, `PhoneScreen` and
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
the historical reveal token is 520ms. The first-paint stagger was retired
on October 1 (F01); RouteFrame now crossfades navigation only. The skeleton
appears after 150ms, with a 1.9s shimmer. Reduced motion or Animations off
removes the route transition and press. Some Framer fades still retain their
duration: this CH-1608 mismatch is SM-03 in SMOOTHNESS_AUDIT.md.

## Haptic intent

v2 (D-70): selection for a tab change, a menu pick, or opening the bell or a
notification; success when a save lands; error on failure; warning when the
connection drops; medium only when a sheet settles. Every other tap is silent.

## Desktop

Sidebar and canvas. The top bar is sticky glass over the canvas. The bell is a
popover under its button.

The team switcher (owner, 2026-10-01, Q-130): the board's team chip (the team
under GolfHelm, with up-down chevrons) is the whole brand block as a button for
a head coach on two or more teams. It opens an ivory popover under the block
with a "Switch team" label and a listbox: each team a row with a coin and the
current one bold, ticked and `aria-selected`. For everyone else the team stays
a plain label.

## Phone

Approved spec `docs/clubhouse/phone/foundation.md`: the tab bar (coach Home,
CoachHelm, Calendar, Stats; player Home, CoachHelm, Rounds, Team Hub; then
More), the More sheet, the top bar's root and pushed variants, the bell as a
modal sheet, and pushed screens with the edge swipe.

For a head coach on two or more teams the More sheet lists the teams under who
they are, as a captioned "Team" list in the sheet's own rows: the current team
is ticked, and a switch closes the sheet on the new team. The sheet scrolls on
a short screen, for every role. The Home hero bar's team stays a label.

## Shared states (2026-10-08)

The states audit (2026-10-07) found three empty-state anatomies, a pink boxed
notice inside the flush Ledger, a route error in a white card and skeletons
drawn as filled cards. The shared layer (`ui/States.tsx`, `ui/Notices.tsx`,
`ui/RefreshNotice.tsx`, `ui/Retry.tsx`, `ui/SectionBoundary.tsx` and their
blocks in `styles/shell.css`) now draws one family:

- **Section empty** (`EmptyState`): a flush line on the Ledger, left-aligned to
  the section's edge. An optional 16px glyph in the forest ink, the title, one
  sentence, and the action under them; no well and no centring.
- **Page empty** (`EmptyState size="page"`): the medallion anatomy. In the
  Ledger it sits under the framed head with 72px above and 88px below, never a
  viewport's height, so its action stays above the fold. Its title is the
  ledger ink on every screen.
- **Notice** (`InlineNotice`, `RefreshNotice`): flush, sitting between the
  section's own engraved rules with no fill, no ring and no stripe, its icon on
  the heading's edge. The icon and title are in the danger ink and the body in
  the secondary ink. Try again sits beside the words in a full-width notice, and
  under them in anything narrower than 640px (a container query: a rail, a half
  column) and on the phone, so notices side by side read alike. The inks and
  fill are local properties (`--ch-notice-ink`, `--ch-notice-body`,
  `--ch-notice-fill`), so a notice on a dark or floating surface is restyled in
  one rule; `--ch-notice-rule` stays declared as a hook but is no longer drawn.
  On the green (the FeatureCard, a board card) a context sets the notice's inks
  from two tokens, `--ch-notice-on-green-ink` and `--ch-notice-on-green-body`,
  rather than copying the colours.
- **Several failed parts** (`PageNotice`, `PageRefreshNotice`, CH-1209): told
  once under the page head with one Try again; each failed part keeps its
  heading and a covered notice (its title alone). These are the reads the
  server render knows failed.
- **Several crashed sections** (`SectionGroup`, `SectionGroupNotice`,
  CH-1210): the same telling for sections that crash in the browser. Each
  failing `SectionBoundary` inside a group registers itself; at two or more,
  the group's notice under the page head names them in reading order, its one
  Try again tries them all again, and each crashed section keeps its title
  alone. Browser-only, so the server HTML and hydration are unchanged. Without
  a group, or without its notice on the page, every crash keeps its own notice.
- **Route error** (`RouteErrorView`): the page empty in the danger tone (a brick
  medallion), Try again first, the way back beside it, and the reference as a
  caption. No card. The way back goes where the route's error boundary says
  (`homePath`) and is named for it: Back to Home, or a sub-screen's own section
  (Back to Rounds, with a back chevron in place of the house).
- **Not rebuilt** (`NotRebuilt`, CH-1301): the same anatomy with the forest
  medallion (an hourglass) and Back to Home as its one action, not a card.
- **The bell's own states**: its empty (CH-1302, CH-1303) is the section empty
  and its failed list (CH-1201) the notice, both at the rows' inset. While the
  list hasn't loaded, the panel's head drops the unread count and Mark all read;
  the bell keeps its count.
- **A page whose one read failed** (`EmptyState size="page" tone="danger"`,
  CH-1211): the route error's anatomy under the page's own head, as an alert,
  with Try again first (it re-runs the page through `useRefresh`) and the
  offline line (CH-1905) above the actions when there is no connection. It is
  the same anatomy as the route error, not a fourth one.
- **Skeletons**: a shade deeper on the parchment; on desktop Ledger pages a block
  placeholder is a rule with two lines of type, never a filled card. Pages build
  theirs from `Skeleton`, `SkelLine`, `SkelRows` and `SkelRule`.
- **Titles** never end in a full stop (`stateTitle`).

### Decisions from the states audit

Each is a lead decision under the owner's full-auto brief; owner to confirm.

1. Notices drop the pink box in the Ledger. They become the flush notice above;
   the semantic colour stays in the icon and the title. Revised the same day:
   the 2px danger stripe at the notice's left is dropped too, because our
   design guidance avoids side stripes. The notice sits between the section's
   engraved rules with no fill, no ring and no stripe of its own.
2. A failed read keeps the page head and its primary action.
3. Phone titles are the 600 sans in the ledger ink; the serif is retired.
4. The route error keeps the reference id, as a quiet caption ("Reference …" in
   the tertiary ink), never in a card.
5. The kit's PageIntro eyebrow (`.ch-intro__eyebrow`, `styles/ui.css`) is 12px,
   not 11px, to meet the F09 phone text floor: PageIntro opens a page on the
   phone (Calendar today).
6. Crashes that happen together are told together (CH-1210), as failed reads
   are (CH-1209); a page whose one read failed gets the danger page (CH-1211)
   rather than a notice over an empty body.

## Accessibility

Skip to content on the first Tab, named landmarks, the current page marked,
announced toasts (errors at once), dialogs that take and return focus, focus
rings, and axe clean at 1280 and 390. The switcher is a menu button with a
listbox (arrows, Home, End, Enter, Esc, focus back on the button, 11813); on the
phone its rows are buttons marked `aria-current` (11814).

## Data assumptions

Only data the app has. The v2 top bar's search field is not rendered, because no
search source exists (PROGRESS data gaps). There is no dead control.

## Existing backend capabilities used

`getUnifiedNotifications`, `markNotificationRead`, `markAllNotificationsRead`
(`src/app/golf/actions/unified-notifications.ts`); `setActiveTeam`
(`src/app/golf/actions/team-switcher.ts`, shared with Fairway); the badge context
(`useNotificationBadges`); the shell loader's three reads. WIRING.md maps each.

## HELD requirements

### New features

None.

### New data/schema

None.

### Owner decisions

Q-130 (2026-10-01: the team switcher), D-25 (the animation chunk after first paint), D-40 and D-41 (the phone shell),
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

# P010 — Team Hub: design handoff

## Package

```text
Source:   the owner's Claude Design bundle, in design/handoff/ (VERSIONS.md)
Version:  v2 (received 2026-09-29): Coach - Team Hub.html, Player - Team Hub.html,
          Coach and Player - Team Hub - Mobile.html, hub.jsx, hub.css, hub-data.js
Date:     2026-09-29
Status:   approved (the owner's v2 boards are the spec, D-22; docs/clubhouse/phone/team-hub.md maps each
          piece to its data and names every gap)
```

## Design objective

One calm page where a team's word and paperwork live, drawn once for both roles: the same header, tabs
and cards, with a coach's controls and read receipts on one side and a player's replies on the other.
A trip is a boarding pass; announcements, tasks and files are lists a person can act on in place.

## Problems being solved

Team news scattered across texts, email and PDFs; coaches who cannot tell who has read a post or
replied; players who miss an RSVP or a waiver.

## User goal

Coach: post, plan, assign and share, then watch the replies come in. Player: see what is asked and
answer it without leaving the page.

## Visual hierarchy

Header (role, title, team and season, the coach's one primary action), the tab strip, then the panel.
Home is two columns on a wide canvas (RSVPs, the newest post and the next trip; Updates and a
player's tasks) and one below a 900px container; below 640px the RSVP rows stack their buttons. On the
phone the title moves to the top bar, the tabs are a strip under it and the cards stack.

## Components

### Reused Clubhouse primitives

`Avatar`, `Button`, `Icon`, `Menu`, `Modal` (a bottom sheet on the phone), `EmptyState` (page and
compact, D-71), `RefreshNotice` and `InlineNotice`, `SectionBoundary`, `Skeleton`, `Switch`, `PhoneTop`,
`useChPhone`, `useAction`.

### New Clubhouse components

`TeamHub` (the container: tabs, the optimistic state and the writes), the cards in `parts.tsx`
(`Rsvps`, `Announcement`, `TripPass`, `Updates`, `Tasks`, `Documents`, `NewAnnouncementLine`), the forms
in `sheets.tsx` (`ComposeSheet`, `TripSheet`, `AssignSheet`, `ConfirmDelete`), `HubSkeleton`, and
`LIVE_HUB_WRITES` in `writes.ts` (the one place the server actions are named).

### Modified Clubhouse components

None for this page beyond the foundation's v2 changes (motion, haptics, page empty state).

## Actions affected

All of them: the list is `config/clubhouse/pages/P010-hub.json` `actions`, and the graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

None of its own: the sections rise once at first paint (`.ch-reveal`), and presses, sheets, toasts and
the skeleton fade are the shell's (D-64). Nothing counts up.

## Haptic intent

v2 grammar (D-70): a tick for a tab, a reply, an audience or transport choice and a player chip; light
for the Write an announcement line; success when a change lands; a warning before Delete and on a form
sent with a mistake; error on failure.

## Desktop

The frame is `.ch-hb` (a container named `chhb`, at most 1200px), so the layout follows the canvas, not
the window: two columns above 900px, one below, RSVP rows stacked below 640px.

## Phone

Approved spec `docs/clubhouse/phone/team-hub.md`: a player reaches Team Hub from the tab bar and a
coach from More (a "‹ More" top bar); the tabs are a strip under the top bar; compose, trip and task
forms and the Delete question are bottom sheets.

## Accessibility

A real tablist with each tab controlling its panel; a reply is a radio group named for its event; a
task's box names the task; cards are sections named by their headings; failed-read notices are alerts;
sheets are native dialogs that trap focus and close on Esc.

## Data assumptions

Only data the app has. Not shown because no source exists (Q-70, Q-71): Pin to the top (no pinned
column), Schedule (`createEnrichedAnnouncement` takes no publish time), the push line (said only when
the post's `send_push` came back true, never as a promise), trip photos (the owner rejected imagery),
the class clash check in the trip builder, a folder picker for uploads (they go to Team), and the
Mandatory tag (`golf_events` has no such column; `get_player_hub_events` returns it as false). A
player's trip says whether they are traveling only when the aggregate returns the trip's event.

## Existing backend capabilities used

`getPlayerHubSummaryData`, `getPlayerHubAnnouncements`, `getAnnouncementsWithMeta`, `getDocuments`,
`getUnifiedNotifications` (reads), and `respondToEvent`, `acknowledgeAnnouncement`, `completeTask`,
`getPreviewUrl`, `createEnrichedAnnouncement`, `updateAnnouncement`, `deleteAnnouncement`, `createTask`, `deleteTask`,
`createGolfTravelItinerary`, `uploadGolfDocument`, `createGolfDocument`, `deleteGolfDocument`
(writes). WIRING.md maps each.

## HELD requirements

### New features

None built as held.

### New data/schema

Pin to the top needs a pinned column on `golf_announcements`; Schedule needs `createEnrichedAnnouncement`
to take `publish_at` (the column exists); Mandatory needs a column on `golf_events` or a rule the owner
picks (for example treating `requires_rsvp` as mandatory). None is written.

### Owner decisions

D-22 (phone), D-64 (motion), D-66 (navigation), D-67 (build order), D-70 (haptics), D-71 (page empty
state); Q-70 and Q-71 are open, and the page is built on their recommendations.

## Explicit non-goals

Pin to the top, Schedule, a push promise, trip photos, the class clash check, a folder picker, and room
and flight editors (they are shown as text when present). Also not built, though the design's data
table lists `updateGolfTravelItinerary`: editing a trip after it is posted. Editing a post is built
(Clickables gap 11): Edit announcement in a post's More menu changes its headline, message and
acknowledgement only, because `updateAnnouncement` takes no audience and no attachments.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the server actions and loaders)
```

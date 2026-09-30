# P007 — Messages: design handoff

## Package

```text
Source:   the owner's Claude Design bundles, in design/handoff/ (VERSIONS.md)
Version:  v2 (2026-09-29): Coach - Messages.html, Coach - Messages - Mobile.html
          v1: Messages.html, messages.jsx, msg.css, msg-data.js, screenshots messages-01..04;
          mobile/Messages Mobile.html, m-msg.jsx (the approved phone spec)
Date:     2026-09-29
Status:   approved ("recreate it from the prototype; the owner approved it as is", v2 README)
```

## Design objective

A calm team inbox on the depth vocabulary: the rail in a well, the thread on a lit sheet, one clear
composer. Announcements sit with the conversations rather than in a separate tool.

## Problems being solved

Coaches juggling texts, group chats and email; announcements nobody confirms reading; players who
can't tell whether their coach saw a message.

## User goal

Send, answer and confirm without leaving one screen.

## Visual hierarchy

Rail (conversations and announcements), thread, details. On the phone: Inbox, then a pushed Thread,
then pushed Details (D-41 to D-49 decide the phone's gaps).

## Components

### Reused Clubhouse primitives

`Avatar`, `Button`, `IconButton`, `Modal` (a sheet on the phone), `Menu`, `Toast`, `InlineNotice`,
`EmptyState` (section and page, D-71), `SectionBoundary`, `Skeleton`, `SearchField`, `Switch`,
`PhoneTop`, `PhoneScreen`, `useSheetDrag`, `useChPhone`, `useChPress`.

### New Clubhouse components

`Messages` (the live container), `MessagesView` and `MessagesDesktop`, `MessagesPhone` (the phone
stack), `Composer`, `Msg` (a bubble with its failed and unconfirmed states), the announcement pane
and composer (`announcements.tsx`), `MessagesSkeleton`, `MessagesNoTeam`.

### Modified Clubhouse components

None for this page beyond the foundation's v2 changes (motion, haptics, page empty state).

## Actions affected

All of them: the list is `config/clubhouse/pages/P007-messages.json` `actions`, and the graph is
WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

Messages appear in place with no count-up or stagger (CH-7601); details and the reaction bar open
from their button (CH-7603); the phone's long-press sheet rises (CH-7604). Everything uses the v2
tokens (D-64).

## Haptic intent

v2 grammar (D-70): selection for picking a reaction, a filter or a conversation; success when a send
or a change lands; the light tap only as the long-press sheet opens; error on failure.

## Desktop

Rail, thread and optional details side by side on a wide canvas. Below a 1100px canvas the details
float over the thread; below 720px it is rail or thread, one at a time (container queries in
`messages.css`). The composer says "Enter to send · Shift + Enter for a new line".

## Phone

Approved spec `docs/clubhouse/phone/messages.md`: Inbox with announcements above today, a pushed
Thread, pushed Details (members, mute, files), New message with group naming (D-45), the long-press
sheet for a message's actions, and a Message actions button for VoiceOver and keyboards (CH-7804).

## Accessibility

Named rows and bubbles, live announcements of send failures, the long press reachable without a
long press, dialogs that trap focus and close on Esc.

## Data assumptions

Only data the app has. Not shown because no source exists: the event card in a thread, pinned
messages, "only coaches can post", delete conversation, per-thread search, calls (D-48, D-49).

## Existing backend capabilities used

`useGolfConversations`, `useGolfMessages`, `useMessageReactions`, `useMessageAttachments` (realtime
hooks), and the server actions in `src/app/golf/actions/messages.ts`, `message-mute.ts`,
`announcements.ts`, `communication.ts` and `message-attachments.ts`. WIRING.md maps each.

## HELD requirements

### New features

`getGolfConversationFiles` (the phone's Files panel): built, and HELD behind `isClubhouseFor`
(`docs/clubhouse/held/features/conversation-files.md`, D-61).

### New data/schema

The attachment hardening migration (anon grants, deleted-message SELECT): not written, queued after
Clubhouse (`docs/clubhouse/held/data/message-attachments-hardening.md`).

### Owner decisions

D-13 (realtime hooks kept), D-16 and D-44 (announcements inside Messages, on the phone too), D-40 to D-49 (phone), D-66
(Messages under More on the phone), D-70 (haptics), D-71 (page empty state).

## Explicit non-goals

Delete conversation, pinned messages, coach-only posting, calls, per-thread search, a rename action,
timed mutes on the phone (desktop keeps them).

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the realtime hooks and server actions)
```

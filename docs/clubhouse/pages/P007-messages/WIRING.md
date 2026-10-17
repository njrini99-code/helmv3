# P007 — Messages: wiring map

<!-- clubhouse:release-audit:start -->
## Current ownership audit — 2026-10-06

Root: `src/clubhouse/screens/messages`. The AST inventory found 12 source
files, 24 overlay/control sites and 1 motion nodes. Conversation rail, phone
thread, growing composer, reply and group dialogs.

Exact call sites, direct package imports, responsive styles and mapped tests
are in the [all-page audit](../../ALL_PAGE_AUDIT.md#p007-messages). Shared
Modal/Menu/PhoneScreen owners and shell behavior are audited once there;
counts include wrappers rather than unique popups.
<!-- clubhouse:release-audit:end -->

## Entry point

```text
Route:                   /golf/dashboard/messages
Page:                    src/app/golf/(dashboard)/dashboard/messages/page.tsx (isClubhouseFor -> Clubhouse, else Fairway)
Clubhouse route adapter: src/clubhouse/routes/messages.tsx (session, team; no team -> MessagesNoTeam, CH-7308)
Server loader:           src/clubhouse/data/messages.ts loadMessagesDirectory (team, settings, members, coaches in one pass;
                         each failed read logs through chLogServer('messages', …) and never throws)
Screen:                  src/clubhouse/screens/messages/Messages.tsx (live container) -> MessagesView.tsx
                         -> MessagesDesktop | MessagesPhone (useChPhone, 820px)
Skeleton:                src/clubhouse/screens/messages/MessagesSkeleton.tsx (CH-7401)
```

## End-to-end graph

```text
UI (MessagesDesktop / MessagesPhone, Composer, Bubble, Details, NewMessage, announcements)
↓
Action (the ChMessagesApi object built in Messages.tsx: send, sendFiles, edit, remove, react, …)
↓
Client controller: attempt() (offline refusal CH-1903, slow notice CH-1902, chReport + error toast + haptic)
                   and the realtime hooks (useGolfConversations, useGolfMessages, useMessageReactions, useMessageAttachments)
↓
Server actions: src/app/golf/actions/messages.ts, message-mute.ts, message-attachments.ts, announcements.ts, communication.ts
↓
Data: golf_conversations, golf_conversation_participants, golf_messages, golf_message_reactions,
      golf_message_attachments (+ storage golf-attachments), golf_announcements, golf_announcement_acknowledgements,
      golf_task_assignments
↓
Realtime: golf-conversation:<id> (messages INSERT/UPDATE), golf-conversations:<userId> (the rail), golf-reactions:<id>
↓
Contract outcomes: CONTRACT.md (Bridge IDs 7ccii, catalog CH-7xxx)
↓
Bridge: recorded, not wired (D-68)
↓
Tests: src/clubhouse/__tests__/messages.test.tsx (63 cases), message-attachments-conversation-files.test.ts
```

## Actions

Each action's record is in `config/clubhouse/pages/P007-messages.json` (`actions`), and the whole list is
readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is refused before
anything is sent (the shell's 10703, CH-1903).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P007-SEND-MESSAGE | Composer send, Enter | `api.send` | `useGolfMessages.sendMessage` → `sendGolfMessage` (optimistic id) | golf_messages | lands 70901 · refused 70603 · unconfirmed 70701 · draft kept 71201 · optimistic 71301 |
| ACT-P007-SEND-ATTACHMENT | Composer attach + send; phone New message attach (its files go to the thread's composer, which sends them once the thread opens) | `api.sendFiles` | `useMessageAttachments.sendMessageWithAttachments` → `sendGolfMessageWithAttachments` | golf_messages, golf_message_attachments, storage | invalid file 70501 · lands 70901 · fails 70604 |
| ACT-P007-RETRY-SEND | Retry under a refused bubble | `api.retry` | `useGolfMessages.retryMessage` (same id) | golf_messages | 71401 · still refused 70613 |
| ACT-P007-EDIT-MESSAGE | Edit (own message) | `api.edit` | `updateGolfMessage` | golf_messages | 70902 · 70605 |
| ACT-P007-DELETE-MESSAGE | Delete (own message) | `api.remove` | `deleteGolfMessage` | golf_messages | confirm 71101 · 70902 · 70606 |
| ACT-P007-REACT | Reaction bar | `api.react` | `useMessageReactions.setReaction` (direct insert/delete under RLS) | golf_message_reactions | 70607 |
| ACT-P007-COPY-MESSAGE | Copy (phone long-press sheet) | `copy` | clipboard | — | 70615 |
| ACT-P007-START-DIRECT | New message → a person | `api.startDirect` | `createGolfConversation` (reuses an existing direct thread) | golf_conversations, participants | 70601 · not on team 70801 |
| ACT-P007-CREATE-GROUP | New message → a group | `api.createGroup` | `createGolfTeamBroadcast` with the chosen players (at least one: with none it adds the whole team, `groupLacksPlayer`), then `addGolfGroupMember` for chosen coaches (D-45) | golf_conversations, participants | name and members 70502–70505 · 70902 · 70602 · coach not added 71001 |
| ACT-P007-REMOVE-MEMBER | Details › a member's Remove (the group's creator, never their own row; desktop and phone) | `api.removeMember` (after `RemoveMemberModal`) | `removeGolfGroupMember(conversationId, userId)`, then the rail and the members read again | participants | confirm 71104 · optimistic 71301 · 70902 · failed 70636 |
| ACT-P007-ADD-MEMBER | Details › Add (the group's creator) | `api.addMember` | `addGolfGroupMember` | participants | 70902 · 70614 · nobody left 70407 |
| ACT-P007-LEAVE-GROUP | Details › Leave group | `api.leave` | `leaveGolfGroup` | participants | confirm 71102 · 70902 · 70608 |
| ACT-P007-MUTE | Details › Mute | `api.setMute` | `setGolfConversationMute` | participants | 70902 · 70609 · setting didn't load 70624 |
| ACT-P007-SEARCH | Rail search; a hit opens its thread at the message (`api.openHit` → `useFocusMessage`, the end-anchor paused, the message ringed for `FOUND_FOR_MS`) | `api.searchMessages` | `searchGolfMessages` | golf_messages | running 70204 · no hits 70403 · failed 70619 |
| ACT-P007-OPEN-FILE | A file in a bubble or Files | `open` | `getGolfMessageAttachments` (signed URL per message) | golf_message_attachments, storage | 70616 |
| ACT-P007-OPEN-ANNOUNCEMENT-FILE | A file under an announcement | `openDoc` (`announcements.tsx`) → `api.openAnnouncementDocument` | `getPreviewUrl` (signed URL per tap; never the stored `file_url`) | golf_documents, storage documents | 70616 |
| ACT-P007-LIST-FILES | Details › Files (phone and desktop) | `api.files` (`useConversationFiles`) | `getGolfConversationFiles` (HELD, D-61) | golf_message_attachments, golf_messages | loading 70209 · none 70406 · failed 70630 · held gate 72302 |
| ACT-P007-SCHEDULE | Schedule (coach; the desktop thread header, the phone Details tile) | a link to `/golf/dashboard/calendar?new=1`, plus `&with=<golf_players.id>` on a direct thread with a player (desktop and phone; D-47, D-52) | none (Calendar opens its editor) | none | Calendar 60103 |
| ACT-P007-ACKNOWLEDGE | Got it on an announcement (player) | `api.acknowledge` | `acknowledgeAnnouncement` | golf_announcement_acknowledgements | 70902 · 70610 |
| ACT-P007-COMPLETE-TASK | Mark done on an announcement task (player) | `api.completeTask` | `completeAnnouncementTask` | golf_task_assignments | 70902 · 70611 |
| ACT-P007-POST-ANNOUNCEMENT | New message → Announcement (coach) | `api.createAnnouncement` | `createEnrichedAnnouncement` | golf_announcements | fields 70505 · 70902 · 70612 |

## Production parity (2026-10-17)

Each control against Fairway's call for the same write (`src/components/fairway/pages/messages/**`,
`FairwayPlayerAnnouncementCard`) and the server action's guard. Fixed: a coach's group needs a player (a broadcast
with none adds the whole team; `groupLacksPlayer`); an announcement's file opens through `getPreviewUrl`
(`api.openAnnouncementDocument`), never the stored `file_url`; a deep link that arrives while the page is open is
taken (keyed on the address, `linkKey` in `Messages.tsx`), and a `?conversation=` thread missing from the list is
refetched once before it opens; message fields cap at 5,000 (`MESSAGE_MAX`).

Differences kept:

| Where | Production (Fairway) | Clubhouse | Why |
| --- | --- | --- | --- |
| New message, who can be picked | Coach: the team's players only. Player: the program's coaches and teammates | Both roles: the program's coaches and the team's players | D-45 (coaches join a coach's group); same audience `createGolfConversation` validates |
| Roster rows read | every `golf_team_members` row | `status = 'active'` only (4 inactive rows in production) | an inactive member is off the team everywhere else in Clubhouse |
| `?conversation=` to a thread the viewer isn't in | silently falls through to the newest thread | says so (CH-7015) | tells the viewer why nothing opened |
| Creator leaving their group | Leave group shown to everyone | hidden for the creator | D-47 |
| Schedule (coach) | none in Messages | desktop header and phone tile invite a direct thread's player (`&with=`) | D-47, D-52 |

Built to match production the same day: the creator removes members (`removeGolfGroupMember`, after CH-7504), a
search hit goes to its message (`use-focus-message.ts`, with `useThreadAnchor` paused), and the phone's Schedule tile
invites the direct thread's player.

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/messages/Messages.tsx` | The live container: hooks, `attempt`, the api object, deep links, auto-open | 70101, 70102, every toast |
| `screens/messages/MessagesView.tsx` | `MessagesDesktop`, `Rail`, `ConvRow`, `Thread` (header Schedule), `Bubble`, `Composer` (with `AttachButton`, `AttachChips`), `Details` (`FilesSection`), `MuteControl`, `NewMessage`, the modals | 702xx, 704xx, 705xx, 706xx, 71xxx, 70209, 70406, 70616, 70630 |
| `screens/messages/MessagesPhone.tsx` | The phone stack: Inbox, `PhoneThread`, Details, `FilesPanel`, New message (its attach hands files to the thread's composer) | 71901, 70209, 70406, 70615, 70616, 70630 |
| `screens/messages/files.ts` | `useConversationFiles` (the files read, Try again, open) and `fileMeta`, shared by `FilesPanel` and `FilesSection` | 70209, 70406, 70616, 70630 |
| `screens/messages/announcements.tsx` | The announcement pane and composer | 70206, 70505, 70610 to 70612, 70622, 70623 |
| `screens/messages/MessagesSkeleton.tsx` | Route skeleton | 70201 |
| `screens/messages/MessagesNoTeam.tsx` | No team | 70408 |

## Hooks

| Path | Type | Used by |
| --- | --- | --- |
| `src/hooks/golf/use-golf-messages.ts` (`useGolfConversations`, `useGolfMessages`) | shared realtime, not UI | Messages.tsx |
| `src/hooks/golf/use-message-reactions.ts` | shared realtime | Messages.tsx |
| `src/hooks/golf/use-message-attachments.ts` | shared upload | Messages.tsx |
| `src/clubhouse/lib/use-phone.ts` (`useChPhone`) | Clubhouse | MessagesView |
| `src/clubhouse/lib/sheet-drag.ts`, `press.ts`, `haptics.ts`, `track.ts`, `use-action.ts` | Clubhouse | throughout |

## Services / server actions

| Name | Path | Existing/New/Held | Purpose |
| --- | --- | --- | --- |
| sendGolfMessage, updateGolfMessage, deleteGolfMessage, markGolfMessagesAsRead | actions/messages.ts | Existing | the thread |
| createGolfConversation, createGolfTeamBroadcast | actions/messages.ts | Existing | new threads and groups |
| addGolfGroupMember, getGolfGroupAddCandidates, removeGolfGroupMember, leaveGolfGroup | actions/messages.ts | Existing (D-47) | group membership |
| searchGolfMessages | actions/messages.ts | Existing | team-wide search |
| getGolfConversationParticipantIdentities | actions/messages.ts | Existing | Details › members |
| getGolfConversationMute, setGolfConversationMute | actions/message-mute.ts | Existing | mute |
| sendGolfMessageWithAttachments, getGolfMessageAttachments | actions/message-attachments.ts | Existing | files |
| getGolfConversationFiles | actions/message-attachments.ts | **Held** (D-61) | Details' Files (phone and desktop) |
| getAnnouncementsWithMeta, getAnnouncementDetail, createEnrichedAnnouncement, completeAnnouncementTask | actions/announcements.ts | Existing (D-16, D-44) | announcements |
| acknowledgeAnnouncement | actions/communication.ts | Existing | Got it |

## Data resources

### DATA-MESSAGES

```text
Tables:   golf_conversations, golf_conversation_participants, golf_messages, golf_message_reactions,
          golf_message_attachments
RPCs:     none from this page
Storage:  golf-attachments (private), signed per message
Realtime: golf-conversation:<id>, golf-conversations:<userId>, golf-reactions:<id>
Cache:    none; realtime keeps the page current
RLS:      participants only; the server actions check first and RLS is the second gate
Read path:  the hooks (client, RLS-scoped) and the directory loader (server)
Write path: the server actions above; reactions write directly under RLS
```

### DATA-ANNOUNCEMENTS

```text
Tables:   golf_announcements, golf_announcement_acknowledgements, golf_task_assignments
Read path:  getAnnouncementsWithMeta, getAnnouncementDetail
Write path: createEnrichedAnnouncement (coach), acknowledgeAnnouncement and completeAnnouncementTask (player)
```

## Held dependencies

- `docs/clubhouse/held/features/conversation-files.md` (built, held behind the Clubhouse gate)
- `docs/clubhouse/held/data/message-attachments-hardening.md` (applied 2026-10-03, `20261001130000`; HELD.md)

## Impact notes

- The realtime hooks and message actions are shared with Fairway's Messages. A change there changes
  both UIs; D-13 keeps them untouched from Clubhouse.
- `sendGolfMessage` takes the client's optimistic id, so the retry path depends on it never changing.
- The directory loader feeds names and roles for every bubble; a failed members read shows CH-7204
  rather than blank names.

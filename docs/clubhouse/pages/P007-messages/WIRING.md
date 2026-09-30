# P007 — Messages: wiring map

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
Tests: src/clubhouse/__tests__/messages.test.tsx (48 cases), message-attachments-conversation-files.test.ts
```

## Actions

Each action's record is in `config/clubhouse/pages/P007-messages.json` (`actions`), and the whole list is
readable in `docs/clubhouse/generated/CLUBHOUSE_ACTION_MAP.md`. Offline, every write is refused before
anything is sent (the shell's 10703, CH-1903).

| Action | Control | Handler | Service | Data | Contracts |
| --- | --- | --- | --- | --- | --- |
| ACT-P007-SEND-MESSAGE | Composer send, Enter | `api.send` | `useGolfMessages.sendMessage` → `sendGolfMessage` (optimistic id) | golf_messages | lands 70901 · refused 70603 · unconfirmed 70701 · draft kept 71201 · optimistic 71301 |
| ACT-P007-SEND-ATTACHMENT | Composer attach + send | `api.sendFiles` | `useMessageAttachments.sendMessageWithAttachments` → `sendGolfMessageWithAttachments` | golf_messages, golf_message_attachments, storage | invalid file 70501 · lands 70901 · fails 70604 |
| ACT-P007-RETRY-SEND | Retry under a refused bubble | `api.retry` | `useGolfMessages.retryMessage` (same id) | golf_messages | 71401 · still refused 70613 |
| ACT-P007-EDIT-MESSAGE | Edit (own message) | `api.edit` | `updateGolfMessage` | golf_messages | 70902 · 70605 |
| ACT-P007-DELETE-MESSAGE | Delete (own message) | `api.remove` | `deleteGolfMessage` | golf_messages | confirm 71101 · 70902 · 70606 |
| ACT-P007-REACT | Reaction bar | `api.react` | `useMessageReactions.setReaction` (direct insert/delete under RLS) | golf_message_reactions | 70607 |
| ACT-P007-COPY-MESSAGE | Copy (phone long-press sheet) | `copy` | clipboard | — | 70615 |
| ACT-P007-START-DIRECT | New message → a person | `api.startDirect` | `createGolfConversation` (reuses an existing direct thread) | golf_conversations, participants | 70601 · not on team 70801 |
| ACT-P007-CREATE-GROUP | New message → a group | `api.createGroup` | `createGolfTeamBroadcast`, then `addGolfGroupMember` for chosen coaches (D-45) | golf_conversations, participants | name and members 70502–70504 · 70902 · 70602 · coach not added 71001 |
| ACT-P007-ADD-MEMBER | Details › Add (the group's creator) | `api.addMember` | `addGolfGroupMember` | participants | 70902 · 70614 · nobody left 70407 |
| ACT-P007-LEAVE-GROUP | Details › Leave group | `api.leave` | `leaveGolfGroup` | participants | confirm 71102 · 70902 · 70608 |
| ACT-P007-MUTE | Details › Mute | `api.setMute` | `setGolfConversationMute` | participants | 70902 · 70609 · setting didn't load 70624 |
| ACT-P007-SEARCH | Rail search | `api.searchMessages` | `searchGolfMessages` | golf_messages | running 70204 · no hits 70403 · failed 70619 |
| ACT-P007-OPEN-FILE | A file in a bubble or Files | `open` | `getGolfMessageAttachments` (signed URL per message) | golf_message_attachments, storage | 70616 |
| ACT-P007-LIST-FILES | Phone Details › Files | `api.files` | `getGolfConversationFiles` (HELD, D-61) | golf_message_attachments, golf_messages | loading 70209 · none 70406 · failed 70630 · held gate 72302 |
| ACT-P007-ACKNOWLEDGE | Got it on an announcement (player) | `api.acknowledge` | `acknowledgeAnnouncement` | golf_announcement_acknowledgements | 70902 · 70610 |
| ACT-P007-COMPLETE-TASK | Mark done on an announcement task (player) | `api.completeTask` | `completeAnnouncementTask` | golf_task_assignments | 70902 · 70611 |
| ACT-P007-POST-ANNOUNCEMENT | New message → Announcement (coach) | `api.createAnnouncement` | `createEnrichedAnnouncement` | golf_announcements | fields 70505 · 70902 · 70612 |

## Components

| Path | Purpose | States |
| --- | --- | --- |
| `screens/messages/Messages.tsx` | The live container: hooks, `attempt`, the api object, deep links, auto-open | 70101, 70102, every toast |
| `screens/messages/MessagesView.tsx` | `MessagesDesktop`, `Rail`, `ConvRow`, `Thread`, `Bubble`, `Composer`, `Details`, `MuteControl`, `NewMessage`, the modals | 702xx, 704xx, 705xx, 706xx, 71xxx |
| `screens/messages/MessagesPhone.tsx` | The phone stack: Inbox, `PhoneThread`, Details, `FilesPanel`, New message | 71901, 70209, 70406, 70615, 70616, 70630 |
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
| addGolfGroupMember, getGolfGroupAddCandidates, leaveGolfGroup | actions/messages.ts | Existing (D-47) | group membership |
| searchGolfMessages | actions/messages.ts | Existing | team-wide search |
| getGolfConversationParticipantIdentities | actions/messages.ts | Existing | Details › members |
| getGolfConversationMute, setGolfConversationMute | actions/message-mute.ts | Existing | mute |
| sendGolfMessageWithAttachments, getGolfMessageAttachments | actions/message-attachments.ts | Existing | files |
| getGolfConversationFiles | actions/message-attachments.ts | **Held** (D-61) | the phone's Files panel |
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
- `docs/clubhouse/held/data/message-attachments-hardening.md` (SQL not written; after Clubhouse)

## Impact notes

- The realtime hooks and message actions are shared with Fairway's Messages. A change there changes
  both UIs; D-13 keeps them untouched from Clubhouse.
- `sendGolfMessage` takes the client's optimistic id, so the retry path depends on it never changing.
- The directory loader feeds names and roles for every bubble; a failed members read shows CH-7204
  rather than blank names.

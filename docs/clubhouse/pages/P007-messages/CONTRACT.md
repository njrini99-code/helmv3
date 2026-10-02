# P007 — Messages: page contract

Every behaviour Messages promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 7, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/messages.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

## 01 — Default / core UI

Status: DEFINED

The page opens on the rail and, on desktop, the newest thread beside it without marking it read (so an unread count never clears by itself). Deep links open or start a thread.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70101 | — | `MESSAGES_READY` | Messages is open: the conversation rail, and on desktop the newest thread beside it, opened without marking it read; on the phone the inbox. |
| 70102 | — | `DEEP_LINK_OPENS_CONVERSATION` | A link with ?conversation=<id> opens that thread, and ?player=<golf_players.id> opens or starts the direct thread with that player; the address is then cleaned. |

## 02 — Initial loading / skeleton

Status: DEFINED

Route skeleton (70201) in Messages' own shape, plus a skeleton for every section that loads on its own. v2 timing: nothing for 150ms, then a fade (the shell's 11609).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70201 | CH-7401 | `MESSAGES_IS_LOADING` | Messages is loading |
| 70202 | CH-7402 | `CONVERSATIONS_ARE_LOADING` | Conversations are loading |
| 70203 | CH-7403 | `A_THREAD_IS_LOADING` | A thread is loading |
| 70204 | CH-7404 | `MESSAGE_SEARCH_IS_RUNNING` | Message search is running |
| 70205 | CH-7405 | `MEMBERS_ARE_LOADING` | Members are loading |
| 70206 | CH-7406 | `AN_ANNOUNCEMENTS_DETAILS_ARE_LOADING` | An announcement's details are loading |
| 70207 | CH-7407 | `THE_MUTE_SETTING_IS_LOADING` | The mute setting is loading |
| 70208 | CH-7408 | `A_MESSAGES_ATTACHMENTS_ARE_LOADING` | A message's attachments are loading |
| 70209 | CH-7409 | `THE_SHARED_FILES_ARE_LOADING` | The shared files are loading (Details) |
| 70210 | CH-7410 | `THE_ADD_SHEETS_LIST_IS_LOADING` | The Add sheet's list is loading |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: DEFINED

Realtime keeps the thread and the rail current without a reload (70301). There is no pull to refresh; the list is realtime (D-43, Q-47).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70301 | — | `REALTIME_UPDATES_ARRIVE` | New messages, edits, deletes and reactions arrive over realtime while the page is open, without a reload; the rail refreshes its last message and unread counts the same way. |

## 04 — Empty

Status: DEFINED

First-run (70401, no conversations) and filtered (70402 to 70404) are distinct, and a failed read is never shown as empty. No team is the v2 page empty state (70408). Open: v2 draws the no-conversations state as a whole-page empty (D-71); the rail version stays until this page's v2 pass.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70401 | CH-7301 | `NO_CONVERSATIONS_YET` | No conversations yet |
| 70402 | CH-7302 | `A_RAIL_SEARCH_OR_THE_UNREAD_FILTER` | A rail search or the Unread filter has nothing |
| 70403 | CH-7303 | `NO_MESSAGE_MENTIONS_THE_SEARCH` | No message mentions the search |
| 70404 | CH-7304 | `A_THREAD_WITH_NO_MESSAGES` | A thread with no messages |
| 70405 | CH-7305 | `NOTHING_OPEN` | Nothing open |
| 70406 | CH-7306 | `NOTHING_HAS_BEEN_SHARED_IN_THE_CONVERSATION` | Nothing has been shared in the conversation (Details) |
| 70407 | CH-7307 | `EVERYONE_ON_THE_TEAM_IS_ALREADY_IN` | Everyone on the team is already in the group (Add) |
| 70408 | CH-7308 | `SIGNED_IN_WITH_NO_TEAM` | Signed in with no team (coach or player) |
| 70409 | CH-7309 | `NOTHING_AT_ALL_YET_NO_CONVERSATION_AND` | Nothing at all yet: no conversation and no announcement (D-71) |

## 05 — Validation

Status: DEFINED

Checked before anything is sent: attachments (70501), group name and members (70502 to 70504), announcement fields (70505).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70501 | CH-7101 | `A_FILE_OF_THE_WRONG_TYPE_OR` | A file of the wrong type or size |
| 70502 | CH-7102 | `AN_ANNOUNCEMENT_WITH_NO_TITLE` | An announcement with no title |
| 70503 | CH-7103 | `AN_ANNOUNCEMENT_WITH_NO_BODY` | An announcement with no body |
| 70504 | CH-7104 | `A_GROUP_WITH_NO_NAME` | A group with no name |
| 70505 | CH-7105 | `NOBODY_CHOSEN` | Nobody chosen |

## 06 — Server / system error

Status: DEFINED

Every change has its own toast (70601 to 70616) naming what failed and what to do; every section that fails to load has its own notice with Try again (70617 to 70631). A crash stays in its section (SectionBoundary).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70601 | CH-7002 | `STARTING_A_DIRECT_THREAD_FAILS` | Starting a direct thread fails |
| 70602 | CH-7003 | `CREATING_A_GROUP_FAILS` | Creating a group fails |
| 70603 | CH-7004 | `SENDING_A_MESSAGE_THROWS` | Sending a message throws |
| 70604 | CH-7006 | `SENDING_ATTACHMENTS_FAILS` | Sending attachments fails |
| 70605 | CH-7007 | `EDITING_A_MESSAGE_FAILS` | Editing a message fails |
| 70606 | CH-7008 | `DELETING_A_MESSAGE_FAILS` | Deleting a message fails |
| 70607 | CH-7009 | `A_REACTION_DOESNT_SAVE` | A reaction doesn't save |
| 70608 | CH-7010 | `LEAVING_A_GROUP_FAILS` | Leaving a group fails |
| 70609 | CH-7011 | `MUTING_OR_UNMUTING_FAILS` | Muting or unmuting fails |
| 70610 | CH-7012 | `ACKNOWLEDGING_AN_ANNOUNCEMENT_FAILS` | Acknowledging an announcement fails |
| 70611 | CH-7013 | `MARKING_AN_ANNOUNCEMENT_TASK_DONE_FAILS` | Marking an announcement task done fails |
| 70612 | CH-7014 | `POSTING_AN_ANNOUNCEMENT_FAILS` | Posting an announcement fails |
| 70613 | CH-7016 | `A_MESSAGE_IS_REFUSED` | A message is refused |
| 70614 | CH-7018 | `ADDING_SOMEONE_TO_A_GROUP_FAILS` | Adding someone to a group fails (the group's creator, desktop or phone Details › Add) |
| 70615 | CH-7020 | `COPYING_A_MESSAGE_FAILS` | Copying a message fails (phone, from the long-press sheet) |
| 70616 | CH-7021 | `A_SHARED_FILE_WONT_OPEN` | A shared file won't open (Details › Files) |
| 70617 | CH-7201 | `CONVERSATIONS_DONT_LOAD` | Conversations don't load |
| 70618 | CH-7202 | `A_CONVERSATIONS_MESSAGES_DONT_LOAD` | A conversation's messages don't load |
| 70619 | CH-7203 | `MESSAGE_SEARCH_DOESNT_LOAD` | Message search doesn't load |
| 70620 | CH-7204 | `GROUP_MEMBERS_DONT_LOAD` | Group members don't load |
| 70621 | CH-7205 | `THE_TEAM_LIST_DOESNT_LOAD` | The team list doesn't load (New message) |
| 70622 | CH-7206 | `ANNOUNCEMENTS_DONT_LOAD` | Announcements don't load |
| 70623 | CH-7207 | `AN_ANNOUNCEMENTS_REPLIES_TASKS_AND_FILES_DONT` | An announcement's replies, tasks and files don't load |
| 70624 | CH-7208 | `THE_MUTE_SETTING_DOESNT_LOAD` | The mute setting doesn't load |
| 70625 | CH-7209 | `A_MESSAGES_ATTACHMENTS_DONT_LOAD` | A message's attachments don't load |
| 70626 | CH-7210 | `THE_CONVERSATION_LIST_CRASHES` | The conversation list crashes |
| 70627 | CH-7211 | `AN_ANNOUNCEMENT_CRASHES` | An announcement crashes |
| 70628 | CH-7212 | `THE_THREAD_CRASHES` | The thread crashes |
| 70629 | CH-7213 | `DETAILS_CRASH` | Details crash |
| 70630 | CH-7214 | `THE_SHARED_FILES_DONT_LOAD` | The shared files don't load (Details) |
| 70631 | CH-7215 | `THE_ADD_SHEETS_TEAM_LIST_DOESNT_LOAD` | The Add sheet's team list doesn't load |
| 70632 | CH-7216 | `A_CONVERSATIONS_MESSAGES_DONT_REFRESH_WHILE_AN` | A conversation's messages don't refresh while an earlier copy is shown |

## 07 — Network / offline

Status: DEFINED

A send whose confirmation is lost (70701) is told apart from a refusal. Offline and slow saves are the shell's: nothing is sent offline (10703), a save over 5 seconds says so (10702), the banner (10701), Try again while offline (10704).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70701 | CH-7005 | `THE_NETWORK_DROPS_MID_SEND` | The network drops mid-send |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

A link to a player who isn't on the team (70801), and an open conversation that is no longer the viewer's (70802). Who may message whom is decided by the server actions and RLS, never by this screen.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70801 | CH-7001 | `A_LINK_OPENS_A_PLAYER_WHO_ISNT` | A link opens a player (`?player=`) or a person (`?user=`, a player's Message coach) who isn't on the team |
| 70802 | CH-7015 | `AN_OPEN_CONVERSATION_DISAPPEARS` | An open conversation disappears (left, or another team's) |

## 09 — Success

Status: DEFINED

A sent message takes its place without a toast (70901); every other change that lands names itself in a toast (70902). The success haptic fires for both (D-70).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 70901 | — | `MESSAGE_SEND_LANDED` | A message sends: it takes its place in the thread with no toast, and the success haptic fires. |
| 70902 | — | `CHANGE_LANDED` | A change lands (edited, deleted, group created, member added, left, muted, acknowledged, task done, announcement posted): a toast names what landed, with the success haptic. |

## 10 — Warning

Status: DEFINED

A group created without one of the chosen coaches (71001): the group stands, and the coach is told how to finish.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71001 | CH-7019 | `A_COACHS_NEW_GROUP_IS_CREATED_BUT` | A coach's new group is created, but a coach picked for it couldn't be added (D-45) |

## 11 — Destructive

Status: DEFINED

Delete a message and Leave a group ask first (71101, 71102) and fire the warning haptic. Delete conversation is hidden: no policy defines it (D-48).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71101 | CH-7501 | `DELETE_A_MESSAGE` | Delete a message |
| 71102 | CH-7502 | `LEAVE_A_GROUP` | Leave a group |

## 12 — State preservation

Status: DEFINED

A failed send puts the text and files back (71201). An unsent draft is kept per conversation, so switching threads and back finds it where it was (71202; fixed 2026-09-30, it used to be lost).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71201 | — | `DRAFT_KEPT_ON_FAILURE` | A send that fails puts the text and files back in the composer; nothing the person wrote is lost. |
| 71202 | — | `DRAFT_KEPT_ACROSS_THREADS` | An unsent draft is kept per conversation: switching to another thread and back finds it where it was; a send that lands clears it. |

## 13 — Optimistic UI

Status: DEFINED

Sends are optimistic and reconciled in place by id; a refused one stays marked Not sent (71301). Reactions are not optimistic: a tap waits for the write, and a failure toasts (70607).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71301 | — | `OPTIMISTIC_SEND` | A sent message appears at once under its final id and is reconciled in place when the server echoes it; a refused send stays in the thread marked Not sent (CH-7016), never silently removed. |

## 14 — Retry / recovery

Status: DEFINED

Retry on a refused message re-sends under the same id (71401); Try again on a section re-reads only that section (71402).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71401 | — | `RETRY_FAILED_SEND` | Retry re-sends a refused message under the same id, so pressing it twice can never post twice; Discard removes it. |
| 71402 | — | `TRY_AGAIN_SECTION_READ` | Try again on a section that did not load re-reads only that section (conversations, a thread, members, files, announcements) and keeps the rest of the page as it was. |

## 15 — Data freshness / sync

Status: DEFINED

A send the client can't confirm says to check the thread before sending again (71501), so nobody double-posts.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71501 | CH-7017 | `A_MESSAGES_SEND_CANT_BE_CONFIRMED` | A message's send can't be confirmed |

## 16 — Micro animation

Status: DEFINED

Messages' own motion (71601 to 71604), and the shell's: v2 press, reveal, sheets and pushes (11601 to 11612, D-64).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71601 | CH-7601 | `A_MESSAGE_ARRIVES_OR_IS_SENT` | A message arrives or is sent |
| 71602 | CH-7602 | `SOMEONE_IS_TYPING` | Someone is typing |
| 71603 | CH-7603 | `OPENING_DETAILS_OR_A_REACTION_BAR` | Opening details or a reaction bar |
| 71604 | CH-7604 | `A_LONG_PRESS_ON_A_MESSAGE` | A long press on a message (phone) |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

Messages' own haptics (71701 to 71704) on the v2 grammar (D-70), with the shell's (11701 to 11706).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71701 | CH-7701 | `A_CHANGE_FAILS` | A change fails |
| 71702 | CH-7702 | `A_CHANGE_LANDS` | A change lands (edited, deleted, muted, group created; acknowledging uses the success pattern) |
| 71703 | CH-7703 | `PICKING_A_REACTION_A_FILTER_OR_A` | Picking a reaction, a filter or a conversation |
| 71704 | CH-7704 | `A_LONG_PRESS_ON_A_MESSAGE_2` | A long press on a message (phone) |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706, 11707 CH-1707.

## 18 — Accessibility

Status: DEFINED

Messages' own (71801 to 71804): named rows and bubbles, the long press reachable by keyboard and VoiceOver. The shell's skip link, landmarks and dialog behaviour (11801 to 11811). Axe runs at 1280 and 390 (`clubhouse:a11y`).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71801 | CH-7801 | `THE_COMPOSER_IS_NAMED_FOR_THE_CONVERSATION` | The composer is named for the conversation ("Message Varsity team"); a message that didn't send is an alert |
| 71802 | CH-7802 | `SEARCH_RESULTS_ARE_ANNOUNCED_AS_THEY_ARRIVE` | Search results are announced as they arrive; Enter sends, Shift+Enter adds a line |
| 71803 | CH-7803 | `NO_AXE_VIOLATIONS_IN_ANY_PREVIEW_STATE` | No axe violations in any preview state, 1280px and 390px |
| 71804 | CH-7804 | `PHONE_A_MESSAGES_ACTIONS_HAVE_A_PATH` | Phone: a message's actions have a path besides the long press (a "Message actions" button VoiceOver and keyboards reach, or a right click); each pushed screen is named by its title, and its back link names where it goes ("Back to Messages", "Back to Chat") |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813, 11814 CH-1814.

## 19 — Responsive layout

Status: DEFINED

The phone stack at 820px and below (71901); the phone spec is `docs/clubhouse/phone/messages.md` (approved).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 71901 | — | `PHONE_STACK` | At 820px and below Messages is the phone stack: Inbox, Thread, Details and New message push and pop as screens, never a shrunken desktop. |

## 20 — Keyboard / input

Status: DEFINED

Enter sends, Shift+Enter adds a line, an IME keeps its Enter (72001). The shell's edge swipe and browser back pop a pushed screen (12001).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 72001 | — | `ENTER_TO_SEND` | In the composer Enter sends, Shift+Enter adds a line, and Enter while an IME is composing is left to the IME. |

From the shell (P001): 12001 CH-1906.

## 21 — Performance

Status: DEFINED

One fetch and one subscription per open thread; a one-pass loader (72101). Web vitals are the shell's (12101).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 72101 | — | `ONE_LOAD_PER_THREAD` | Opening a thread fetches it and subscribes to it exactly once; the server loader reads the directory in one pass and never throws for a partial read. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page (12201 to 12203). Messages adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failures reported, server reads logged, intents breadcrumbed (72301); the held files action refuses when Clubhouse is off (72302).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 72301 | — | `FAILURES_REPORTED` | Every client failure is reported through chReport with surface messages.<action>; server reads log through chLogServer("messages", ...); each intent leaves a chTrail breadcrumb. |
| 72302 | — | `HELD_ACTION_REFUSES_OFF` | The held conversation-files action refuses before any read unless the Clubhouse UI is on for the caller (D-61). |

## 24 — CI / automated test

Status: DEFINED

Every catalog code is forced by a named test (72401); `clubhouse:check` fails a catalog row of kinds 0 to 5 that no test names.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 72401 | — | `TESTS_NAME_CONTRACTS` | src/clubhouse/__tests__/messages.test.tsx names every catalog code it forces, and the conversation-files action has its own test file. |

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (focus the composer, open New message, retry the last send) are defined when the Bridge is.

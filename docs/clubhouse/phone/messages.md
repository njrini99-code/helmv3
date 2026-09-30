# Phone design: Messages (coach and player)

Status: approved (owner design, design/handoff/mobile/Messages Mobile.html, m-msg.jsx, m-shell.jsx, m.css)

The owner's brief: "this is messages mobile for the both player and coach to match desktop". The
design is six boards from the design project (commit 1fd55a79c; `m.css` refreshed in ccbd33465):
Inbox, New message, Team chat, Group details, 1:1 thread, and Chat details. The shell they sit in
is `foundation.md`.

The phone uses the same container, hooks, actions and catalog as desktop (`MOBILE.md`, D-13):

- `Messages.tsx` builds `ChMessagesApi` from `useGolfConversations`, `useGolfMessages`,
  `useMessageReactions` and `useMessageAttachments`, and from the server actions it already calls.
- Below 820px, `useChPhone()` renders a phone stack in place of `MessagesView`. The data layer doesn't
  change.
- Every CH-7xxx number keeps its meaning.

Anything the design shows without a backend is listed under "Gaps". The owner answered every question
on 2026-09-29 (Q-48 to Q-64, decided as D-44 to D-49; the shell's are D-40 to D-43), and each row names
the decision it follows.

## Build status (2026-09-29)

Built on `agent/clubhouse-messages-mobile` as `MessagesPhone.tsx`, on the same container, hooks and
actions: the Inbox, Thread, Details, New message and the announcement screens, for coach and player, with
one new read action, `getGolfConversationFiles` (D-48). Checked at 390px and 430px next to the design's
boards (captures below); checklist `screens/messages.md`, phone section.

Open, with who owns each:

- The check on a real iPhone through `npm run ios:dev`: the owner.
- The e2e run (`npm run test:e2e -- e2e/messages.spec.ts`), the full build and the full test suite: the
  merge pass.
- Reduced motion with the OS setting on, and a full keyboard walk, in a browser: the next agent slot.
- Owner review of the built screens: the owner.

## Screens and navigation

    More tab ─ Inbox ─┬─ Thread ─ Details
                      └─ New message ─ Thread (after the first send)

- Each screen pushes with a 260ms slide, and back pops it.
- The tab bar shows on the Inbox only.
- Opening a thread calls `api.select(id)`, and going back calls `api.select(null)`. Desktop opens a
  thread automatically only at 821px and wider (`Messages.tsx`), so a phone starts on the Inbox.

New phone components go in `src/clubhouse/screens/messages/`, beside the desktop ones:

- `MessagesPhone`, the stack
- `PhoneInbox`, `PhoneNewMessage`, `PhoneThread` and `PhoneDetails`

They reuse:

- from `MessagesView.tsx`: `Bubble`'s parts, `Attachments`, `Composer` and `MessageHits`. These are
  module-private today, and exporting them changes no behaviour.
- from `announcements.tsx`: `AnnouncementsSection` and `AnnouncementPane`, which D-44 keeps
- from `model.ts`: `filterConvs`, `sectionOf`, `railTime`, `threadItems`, `clock`, `dayLabel` and
  `firstName`
- from `ui/`: `Avatar`, `Icon`, `SearchField`, `Switch`, `InlineNotice`, `EmptyState`, `Skeleton`,
  `SectionBoundary`, and `Modal` shown as a sheet

## 1. Inbox (board 1; captures 01 to 04)

| Element (design) | Component | Data or action |
| --- | --- | --- |
| Top bar: "‹ More", "Messages", compose icon | The foundation's pushed top bar. Compose opens New message | Desktop's `onNew` |
| Search, "Search messages" (a static field in the prototype) | `SearchField` | `filterConvs` on title and last text, then `MessageHits` → `searchGolfMessages(q, teamId)` from 2 characters (CH-7203, CH-7303, CH-7404) |
| Chips: All, "Unread · 4", Groups | A new phone chip row. Desktop uses `Segmented` | `filterConvs` filter. The design's 4 is the unread messages added up (3 + 1); desktop counts conversations (2). The chip counts conversations (D-46) |
| Sections: Today, This week, Earlier | `PhoneInbox` | `sectionOf(lastAt, now, timeZone)` |
| Row: a 44px avatar, or a green group mark with an ivory icon | `Avatar`, group mark. Every avatar in the inbox, the thread and Details is the phone's one neutral coin, #E9E3D3 with #5A4E36 initials (`m.css`, ccbd33465; `foundation.md`; D-43) | `ChConv.group`. The design gives the travel group a bus icon; nothing stores a group type, so every group uses the people mark (D-49) |
| Row: title (600 when unread), time (green 600 when unread), a two-line preview with "Sender:" | `PhoneInbox` | `title`, `railTime(lastAt)` in `ch-num`, `lastText`, `lastSenderId` → "You" or a first name. The prefix follows desktop: groups, or your own last message. The design is inconsistent here: it prefixes "Dan:" but not Jonah |
| Row: unread count, a 20px green-600 pill | `PhoneInbox` | `ChConv.unread` from `useGolfConversations` |
| Tap a row | Pushes the thread, with a `select` haptic (CH-7703) | `api.select(id)` |
| Tab bar with More active and a badge on More | Foundation | The notification badge bundle (`badges.messages`) rolls up into More (D-40) |
| Not drawn: the announcements section above Today (desktop, D-16) | `AnnouncementsSection` | `getAnnouncementsWithMeta` (D-44) |
| Not drawn: pull to refresh | — | Waits (D-43). Realtime already keeps the list current |

States keep their numbers:

- CH-7201: conversations didn't load
- CH-7402: loading rows
- CH-7301: first run, with New message
- CH-7302: nothing matches the search or filter
- CH-7210: the list crashed

The old draft's swipe to mark as unread has no backend, and the design doesn't draw it.

## 2. New message (board 2; captures 05 to 10)

A pushed full screen with no tab bar. Desktop uses a modal instead.

| Element (design) | Component | Data or action |
| --- | --- | --- |
| "Cancel", "New message", then "Next" (one person) or "Create group" (two or more), inert with nobody chosen | Pushed top bar with a text action | Next: `api.startDirect(userId)` → `createGolfConversation`. Create group: `api.createGroup` → `createGolfTeamBroadcast` (D-45) |
| To field: first-name tokens with ×, and "Name or group" | `PhoneNewMessage` | `api.directory` (`loadMessagesDirectory`: the program's coaches, then the team's players) |
| Quick groups: Whole team "6 players · 2 coaches", Pinehurst travel squad, Seniors. Hidden while typing | `PhoneNewMessage` | Whole team: a broadcast to every player. Seniors: players whose `graduation_year` makes them seniors (`classYearLabel`). Travel squad: no source (D-45) |
| People: 40px avatar, name, role, 22px check circle | `PhoneNewMessage` | `ChPerson.name` and `subtitle` (coach title, or class label) |
| "Results" while typing | `PhoneNewMessage` | Name filter over the directory, as on desktop |
| Hint: "Messages to 2 people start a new group. You can name it after sending." | `PhoneNewMessage` | No rename action exists, so a coach names the group before it is created, and the hint says so (D-45) |
| Composer: "Message Jonah", "Message 2 people", "Choose who to message" | `Composer` | The first message goes after the conversation exists: `startDirect` or `createGroup`, then `api.send` (or `sendFiles`) on the new id. If the conversation is created but the message fails, the draft stays in the thread's composer (a phone-only state; its number is given at build) |

- Desktop's Direct / Group / Announcement choice isn't drawn. A coach's New message keeps an
  Announcement choice (D-44).
- Desktop requires a group name up front (CH-7104), and so does the phone (D-45).

States keep their numbers:

- CH-7205: the team list didn't load
- CH-7105: nobody chosen
- CH-7104: group name (D-45)
- CH-7002 and CH-7003: the toasts

The no-match line stays as on desktop.

## 3. Thread (boards 3 and 5; captures 11, 15, 16, 19 and 22)

| Element (design) | Component | Data or action |
| --- | --- | --- |
| Header: a chevron, a 30px avatar or group mark, the title, and the subline ("8 members", or a class line). The block and the info button open Details | Conversation top bar | `memberCount`, `subtitle`. Desktop's subline adds the first three first names, and its coach calendar shortcut moves to Details › Schedule (D-47) |
| Day separator ("Yesterday", "Today") | `PhoneThread` | `threadItems` → `dayLabel` |
| Bubbles, up to 78% wide. Yours: `--ch-green-700` with `--ch-ivory-100` text. Theirs: surface with a hairline. Radius 18 | `Bubble` markup, laid out for phone | `ChMsg` from `useGolfMessages` |
| Group: the first name above a run, and a 28px avatar on the run's first bubble | `Bubble` | `personOf(senderId)`. Desktop puts the avatar on a run's last bubble |
| Time under the last bubble of a run | `Bubble` | `clock(at)`, with " · Edited" and " · Seen" as on desktop |
| Reaction chips (icon and count) | `Bubble` | `api.reactions` (`useMessageReactions`), the six stored reactions (D-14). The design's check reaction isn't one of them (D-49) |
| File card: name and "PDF · 48 KB" | `Attachments` | `getGolfMessageAttachments` (CH-7209, CH-7408) |
| Event card: "1:1 with Jonah · Today · 4:45 – 5:30 PM · Range bay 4" | — | Hidden. `golf_messages.kind` allows `event`, but all 215 production messages are `text` and nothing writes the other kinds (D-49) |
| Composer: "+" (44px), a rounded field, and a 34px send button (off: `--ch-ivory-300`; green-600 once there's a draft, capture 15) | `Composer`, without its desktop hint line | `api.send` or `api.sendFiles`. The file input offers the iOS picker (photos, camera, files). Covers CH-7004, 7005, 7006, 7101, 7016 and 7017 |

Not drawn, so these follow desktop, laid out for the phone:

- Typing (CH-7602).
- A failed send with Retry and Discard (CH-7016, CH-7017).
- "Message deleted".
- Enter sends (CH-7802).
- Reactions, Edit and Delete. Desktop shows them on hover; on the phone a long press on a bubble
  opens an action sheet with them (a `press` haptic, a phone-only state numbered at build). The Edit
  modal and the delete confirm (CH-7501) become sheets.
- The keyboard: the composer lifts by `--keyboard-height` (`data-fw-keyboard-aware`), and the thread
  stays pinned to the bottom when it already was (CH-7601).

States keep their numbers:

- CH-7202: didn't load
- CH-7403: loading
- CH-7304: no messages yet
- CH-7212: crash
- CH-7015: the conversation went away

## 4. Details (boards 4 and 6; captures 12 to 14, 17, 18, 20 and 21)

A pushed screen: "‹ Chat", "Details", and Edit on groups.

| Element (design) | Component | Data or action |
| --- | --- | --- |
| Hero: a 72px group mark or avatar, the title, and "8 members · created by you" or a class line | `PhoneDetails` | `memberCount`. "Created by you" when `creatorId` is the viewer; otherwise the creator's name from the directory. Direct: `subtitle` |
| Tile: Call | — | Hidden (D-48) |
| Tile: Schedule | Link | Coach only: `/golf/dashboard/calendar?new=1`, the editor Home already opens. No way to prefill invitees exists (D-47) |
| Tile: Mute / Muted | `PhoneDetails` | `setGolfConversationMute(id, muted, hours)`, read with `getGolfConversationMute` (CH-7011, CH-7208, CH-7407) (D-47) |
| Tile: Search | — | Hidden. `searchGolfMessages` can't be narrowed to one conversation (D-48) |
| Pinned | — | Hidden (D-48) |
| Members, with Add (groups) | `PhoneDetails` | `api.members` → `getGolfConversationParticipantIdentities` (CH-7204, CH-7405). Add: `getGolfGroupAddCandidates` and `addGolfGroupMember`, for the group's creator only (D-47) |
| Member row: avatar, name "(you)", role · Admin | `PhoneDetails` | `ChMember.subtitle`. "Admin" marks the creator only, as on desktop. The design also marks the assistant coach (D-49) |
| Member row: message icon | `PhoneDetails` | `api.startDirect(userId)`. As drawn, it isn't on your own row. It is drawn on the other person in a direct thread too, where it can only lead back to this conversation (D-49) |
| People (direct): you and them | `PhoneDetails` | The viewer, and `memberIds[0]` from the directory |
| Files: a count, and a list or "No files shared yet." | `PhoneDetails` | A new read-only action for the conversation's files, RLS-scoped, which checks that the caller is a participant (D-48) |
| Switch: Mute notifications | `Switch` | The same call as the Mute tile (D-47) |
| Switch: Only coaches can post | — | Hidden (D-48) |
| Leave group (groups) | Row, in `--ch-danger-600` | `api.leave` → `leaveGolfGroup` (CH-7502, CH-7010). Desktop hides it from the creator; the design shows it on "created by you" (D-47) |
| Delete conversation (direct) | — | Hidden (D-48) |
| Edit (groups) | — | Hidden (D-48) |
| Not drawn: View stats (a coach, in a player's direct details) | Row | `rebuiltHref('/golf/dashboard/stats')?player=` (D-49) |

States: CH-7213 when Details crashes.

## Coach and player

Every board shows a head coach. The player's view below comes from D-15 and the current code.

| Capability | Coach | Player | Decided by |
| --- | --- | --- | --- |
| Inbox, search, filters, mute, reactions, editing and deleting your own messages | Yes | Yes | The existing hooks and actions |
| Start a direct thread | With players and the program's coaches | With their coaches and teammates | The loader's directory; `createGolfConversation` checks the audience |
| Quick groups, pick several people, Create group | Yes | No: one person at a time, no quick groups | D-15. `createGolfTeamBroadcast` accepts coaches only |
| Post an announcement | Yes (D-44) | No. They acknowledge announcements and mark tasks done | D-16 |
| Schedule | Yes | No | The Calendar editor is coach-only (`?new=1` opens it for coaches) |
| Add member | The group's creator | No: players can't create team groups | `loadGolfGroupIOwn` in `addGolfGroupMember` |
| Leave group | If they didn't create it | Yes | The desktop rule (D-47) |
| View stats | A player's direct details | No | Desktop |
| Message a member from Details | Yes | Teammates and coaches | `startDirect` |

## Gaps: what each needs

| Design shows | What exists | What it needs | Until then |
| --- | --- | --- | --- |
| Call | `phone` on `golf_players` and `golf_coaches`. Not loaded, and minors' PII | A loader field, and a PII review | Hidden (D-48) |
| Schedule with the people in the chat | `calendar?new=1` opens an empty editor | Invitee prefill: a Calendar change, no migration | Link without invitees, coach only (D-47) |
| Search inside a thread | `searchGolfMessages(q, teamId)`, capped at 50 results team-wide | A conversation parameter on the action. No migration. Filtering the 50 on the client would drop matches | Hidden (D-48) |
| Pinned | `golf_messages.pinned_at` and `pinned_by` exist, with 0 pinned rows. The update policy is sender-only | A pin action. A migration for coaches to pin other people's messages | Hidden (D-48) |
| Files list | 13 attachments in production, readable one message at a time (`getGolfMessageAttachments`) | A read action for a conversation's files. RLS already allows it; no migration | Built with the phone (D-48), HELD: answers only where Clubhouse is on (D-61, `held/features/conversation-files.md`) |
| Only coaches can post | Nothing | A column on `golf_conversations` and a change to the `golf_messages` insert policy: a migration, written and never applied by an agent | Hidden (D-48) |
| Edit group | `golf_conversations_update_v2` lets any participant update the row. No action exists | A drawing of what Edit covers, and a rename action limited to the creator | Hidden (D-48) |
| Name a group after sending | Broadcasts need a title, and are de-duplicated by it | The same rename action | Named first (CH-7104, D-45) |
| An assistant coach in a new group; "2 coaches" on Whole team | `createGolfTeamBroadcast` adds players only; `addGolfGroupMember` can add a coach afterwards | Two calls in one flow, with a failure state for the second | Built with the phone: coaches are added after the group is created (D-45). EXISTING under D-61: both actions predate Clubhouse and are unchanged |
| Travel squad | No membership source (the itineraries hold `room_assignments` JSON; events hold invitees) | A source | Hidden (D-45) |
| Delete conversation | No delete policy on `golf_conversations` | Defined semantics, and an action | Hidden (D-48) |
| Event card in a thread | `kind = 'event'` allowed, with 0 rows and no writer | A writer (Calendar to Messages) and rendering in the hook | Hidden (D-49) |
| Group icon by type (bus) | No group type | A column | People mark (D-49) |
| Check reaction | Six stored reactions (D-14) | A new stored value | Not offered (D-49) |
| "Admin" on the assistant coach | Only the creator can manage members | — | Creator only (D-49) |

## Phone-only states (numbered at build)

Each has a catalog row and a test (`catalog/messages.md`):

- the long-press action sheet: CH-7604, with its haptic CH-7704 and a path besides the long press, CH-7804
- push and pop: the shell's CH-1610 and CH-1906
- "conversation created, first message not sent" from New message: the draft stays in the thread's
  composer, CH-7004
- copying a message, shared files and adding members: CH-7018 to CH-7021, CH-7214, CH-7215, CH-7306,
  CH-7307, CH-7409 and CH-7410
- (pull to refresh waits for a design, D-43)

## Before the build: 390px on 2026-09-29 (captures `messages-preview-*`)

The preview reflowed the desktop layout:

- a breadcrumb bar with the bell and Settings
- the green tab bar with a Messages tab
- the Announcements section
- a thread whose hover tools are always visible and that keeps the desktop hint line
- Details as a side panel that covers most of the thread
- New message as a bottom sheet with Direct / Group / Announcement

The phone build replaced all of this with the stack above.

## Captures

Not committed. They are saved in the session scratchpad under `messages-mobile/`: every design board
at 390 × 844 @2x, and our preview at 390 × 844 for coach and player.

| File | Shows |
| --- | --- |
| `messages-00-all-boards.png` | The six boards as drawn, at 402 × 874 |
| `messages-01` to `04` | Inbox: All; scrolled to Earlier; Unread chip; Groups chip |
| `messages-05` to `10` | New message: Jonah picked; scrolled; two people ("Create group"); two people with the hint; typing "so" (Results); nobody picked (Next off) |
| `messages-11` | Team chat |
| `messages-12` to `14` | Group details: top; scrolled (Files, the switches, Leave group); muted |
| `messages-15`, `16` | 1:1 thread with the draft "5 works. Bay 4." (send on); with an empty composer |
| `messages-17`, `18` | Chat details: top; scrolled (Files, Mute, Delete conversation) |
| `messages-19` to `21` | Pinehurst travel: a thread with a file and two reactions; its details, top and scrolled |
| `messages-22` | A direct thread with the assistant coach |
| `messages-90-derived-inbox-without-safari.png` | Not in the design: the Inbox with Safari removed and the tab bar padded 34px for the home indicator (D-43) |
| `messages-preview-{coach,player}-*` | Our preview before the build: the list, threads, details, New message, the More sheet, and an announcement |
| `built/built-{390,430}-*` | The built phone screens, named after the board captures they match (`01-inbox` to `40-announcement`) |

No board has an open sheet, a keyboard, or an empty, loading or failed state. Those follow the
catalog, laid out for the phone.

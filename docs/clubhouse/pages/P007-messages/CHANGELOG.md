# P007 — Messages: changelog

## 2026-10-20 — The held-column probe runs once per server instance

```text
Design package: none
PR/commit:      claude/clubhouse-readiness (replayed from draft PR #2207)
Contract IDs:   none changed
Actions:        canHideGolfConversations, hideGolfConversation
                (src/app/golf/actions/conversation-hide.ts)
Data impact:    none (one fewer failing read per load while the column
                is missing)
Held items:     20261008160000_golf_conversation_hidden_at.sql (still held)
```

### Changed

- No visible change (Q8). While migration 20261008160000 is held, every
  Messages load ran `canHideGolfConversations`' read of the missing `hidden_at`
  column, which failed each time (42703; Sentry JAVASCRIPT-NEXTJS-1A0, ignored
  but still sent). A server instance now remembers the missing column for five
  minutes and answers false without the read; a hide that meets the missing
  column records it too. Only that answer is kept: any other failure, a
  signed-out caller and every yes are asked again.

### Why

- After the migration is applied, Delete conversation appears within five
  minutes, on the first probe past the expiry.

### Verification

- `src/test/actions/hide-golf-conversation.test.ts`: the new cases fail against
  the uncached probe and pass with the cache.

## 2026-10-19 — Type, shape and touch in the page stylesheet

```text
Design package: none (complete-and-elevate plan, lane W4b: type, shape and touch in the page stylesheets)
PR/commit:      lane W4b commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (messages.css)

- Radii on the 5, 7, 10, 14, 20 scale (pills, circles and bars that are half their height stay).

### Why

- Pixel font sizes did not follow Dynamic Type, radii were off the 5/7/10/14/20 scale, some phone controls were under 44px, some clickable things did not answer a pointer, and the font shorthand had dropped tabular figures from figures that sit in columns.

### Verification

- WebKit (headless) at 390 and 1280, light and dark: Rounds, a round, sign-up, sign-in, Home, a CoachHelm thread and Team Hub looked at after the change; the phone with `--ch-type-scale: 1.4` scales text with no sideways overflow (scrollWidth equals clientWidth). Touch reach was measured with `elementFromPoint` 21px beyond each short control; hover was measured by comparing computed styles under the pointer; figures were measured by computed `font-variant-numeric`. `npm run clubhouse:css`: its two findings are existing shadows in `auth.css` (lines 1809 and 1872).

## 2026-10-19 — In-flight actions are busy; icon buttons have tooltips

```text
Design package: none (complete-and-elevate plan, lane W4a: controls behave one way everywhere)
PR/commit:      lane W4a commits on agent/clubhouse-complete
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Save an edit, Delete message, Leave, Delete conversation, Remove member, Unmute and Post are busy while they run instead of disabled. The three mute durations stay disabled while one runs (the screen does not know which was pressed).
- Every icon-only button (New message, React, Reply, More message actions, Schedule, Details, Send, attachment and member removes) shows its name on hover and focus. The native title on New message and Schedule is gone so the tip is not drawn twice.

### Why

- The same control behaved differently from page to page: a save greyed its button out at 42%, five places drew their own spinner, icon-only buttons had no words on desktop and a scroller gave no sign there was more. They now come from the shared owners (`Button` busy, `Spinner`, `Tooltip`, `use-hscroll`).

### Verification

- Targeted tests for this page and `ui/__tests__/controls-consistency.test.tsx`; the busy ring was captured at 390 and 1280, light and dark, on `/clubhouse-preview/classes` (the same Button owner draws it here); tooltips and edge fades on the messages, roster and CoachHelm previews. Pages other than the one captured were checked in source only.

## 2026-10-19 — Failed thread turns the composer off; empty lists are told apart; urgent reads the same everywhere

```text
Design package: none (complete-and-elevate plan, lane L3: empty, first-run and failure states)
PR/commit:      lane L3 commits on agent/clubhouse-complete
Contract IDs:   CH-7202, CH-7302, CH-7303, CH-7304, CH-7308, CH-7309
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A conversation that did not load (CH-7202) now switches its composer off and says why (a read-only box, Send and Attach disabled, one line under it) on desktop and phone. A thread that only failed to refresh keeps its composer.
- The list's empty (CH-7302) is told by why: a name search that matches nothing offers Clear search, Unread with nothing unread offers Show all, Groups with no group only says so. "No messages mention" (CH-7303) and "No messages yet" (CH-7304) use the shared state; `.ch-ms-empty` is gone.
- First-run (CH-7309) and no-team (CH-7308) draw portrait rows under the sentence.
- Urgent announcements: one mark (the amber alert triangle, as the letter's head had) on the rail row, the fold and the thread header, and the word Urgent on the row.
- The phone's conversation dates no longer carry 0.12em tracking.

### Why

- Every empty page was one template: a green tile, a headline, a sentence and a button in blank space. The waiting form draws the shape of what will fill the space (rules, rings, a baseline; no bars, no fake text) under one sentence that names what fills it and who does it, and a filter that hides everything is told apart from a first run, a lock and a failed read.

### Verification

- `messages.test.tsx` (CH-7202 composer, the urgent row, the rail empties) and `states.test.tsx`; captured at 390 and 1280, light and dark, before and after, on `/clubhouse-preview/messages?state=empty` and `thread-failed` (the thread opens on desktop only, so the composer-off state was captured on desktop; the phone path has no capture or test); a search miss was captured after only (phone light, desktop light).

## 2026-10-19 — Right-click on a conversation

```text
Design package: none (complete-and-elevate plan, lane L1, desktop command layer)
PR/commit:      uncommitted (agent/clubhouse-complete)
Contract IDs:   none
Actions:        none
Data impact:    none (no new read: the palette lists what the page already loaded)
Held items:     none
```

### Changed

- Right-click (or Shift F10) on a conversation in the list offers Open conversation, the row's one action. Mute, Leave and Delete
  work on the open conversation only, so they are not offered on a row that may not be it. Desktop only; the phone inbox is
  unchanged.

### Why

- The same gesture works on every list a coach lives in.

### Verification

- `screens/messages/__tests__/conv-context-menu.test.tsx`.

## 2026-10-18 — Wave 8: premium details

```text
Design package: none (wave-7 premium review, items 15, 18, 19, 21)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   CH-7606 (wording: the chosen chip takes the green fill)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-7 premium)

- Phone inbox filters take the Qualifiers chips: a surface pill with a
  hairline, the chosen one the green fill (it still fades in over the quick
  beat, CH-7606), and Unread's count as its own figure ("Unread 2").
- Phone inbox search is the kit's field, as Qualifiers draws it (36px drawn,
  44px reach); the tinted skin and its 2px inset fill are gone.
- The phone skeleton draws the 36px field and 36px chips, so nothing shifts
  when the inbox arrives.
- A bubble's name and time start (or end) on its text's 14px inset (were 12px
  and 6px), desktop and phone.
- A thread scrolled off its top fades into the header over 16px instead of
  being cut off (`use-thread-anchor` toggles `.is-scrolled`).

## 2026-10-18 — Wave 7: player Messages preview

```text
Design package: none (wave-7 player journey review)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, preview)

- `messages-player` shows Jonah's own inbox: the team and travel threads,
  his 1:1 with Maya and a note from Dan, never Maya's threads with other
  players.

## 2026-10-18 — Wave 5: Messages feedback fixes

```text
Design package: none (wave-5 feedback review, items 1-2, 4-14, 17-22)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, wave-5 feedback)

- Toasts sit above the composer, however tall it grows: `composer-inset.ts`
  hands its measured height to `.ch-toasts` (desktop and phone).
- "Mute a week" reads "Muted until Oct 25 · 2:40 PM" (`untilLabel`: today,
  tomorrow, a weekday within the week, then a date).
- Phone Details: the Mute tile opens desktop's three choices in a sheet;
  Muted turns notifications back on. The duplicate switch is gone (owner
  decision); the panel says until when.
- Phone New message: the first message grows as the thread's does, Return
  adds a line, and it (and a New announcement) survives Cancel until a
  conversation or a post takes it. Desktop's announcement draft does too.
  Busy labels: "Starting…" (Next and Create group, as desktop) and
  "Posting…".
- Surprised is an open-mouthed face, not Lucide's frown.
- More than ten files: ten are kept and CH-7106 says so; a long file name
  ends in an ellipsis on its chip.
- Desktop: Edit only on a message with text; Save waits for a change, with
  focus in the box; Delete quotes the message (three lines); a Reply tool
  quotes the message on the composer and sends with it.
- Search hits open at their match, marked; the empty line says "No
  conversation names match." Groups with none says "No group conversations
  yet."
- Web links in a message are links (http and https only, React nodes; the
  iOS app opens them in the in-app browser).
- Scrolled up, "Jump to latest"; a thread opened with something unread marks
  it with a "New" divider. The phone's actions sheet says whose message.
- "N left" within 300 characters of the 5000 limit.
- Safe choices name what stays: "Keep conversation", "Keep Eli".
- Deleting a conversation that fails is CH-7025 (it shared mute's CH-7011).
- Mute and unmute toasts replace each other (`replace: 'mute'`, CH-1910):
  a quick mute, unmute, mute leaves only the last.

### Verification (2026-10-18, wave-5 feedback)

- `messages.test.tsx` › Messages · wave 5 feedback (16 tests),
  `screens/messages/__tests__/model.test.ts`, `thread-anchor.test.tsx`;
  the existing Messages suites pass with the CH-7025 and CH-7302 strings.
- WebKit (Playwright, dev preview): 1280 toast bottom 670 over the composer
  top 683; 390 toast bottom 512 over the composer top 524 with a five-line
  draft; mute a week, links, Reply, Edit, Delete quote, Jump to latest,
  attach limit, search mark, phone mute sheet and New message draft as
  described. The preview clears unread on tap, so its phone thread shows no
  "New" divider; the live container clears it after the open.

## 2026-10-18 — Wave 4: Dynamic Type for the phone's text

```text
Design package: none (wave-4 Dynamic Type brief)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, Dynamic Type)

- `messages.css`: the phone's text (rows, bubbles, thread head, composer,
  details, recipients, announcement, reactions, quotes) is set in
  `calc(N * var(--ch-type-k))`, so it follows the iPhone's Text Size up to
  XXL. The phone text floor follows from 12px up. At the default size every
  value is the same pixel. Fixed `line-height` px on the To row and the "new
  below" pill stay: the text still fits their height at XXL.

### Verification (2026-10-18, Dynamic Type)

- WebKit 390 (Playwright, dev preview, `--ch-type-scale` 1.353): unscaled
  text 46 to 8 on `messages` and 46 to 7 on `messages-player`; the rest are
  the shell's tab label and `ui.css` avatars. Thread, details and new
  message: 71 to 13, 98 to 22, 69 to 18. Scale-1 screenshots are pixel
  identical to before on every state; no horizontal overflow at XXL.

## 2026-10-18 — Wave 3: the empty page's head on the shared line

```text
Design package: none (wave-3 design review, items 5)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, page-head line)

- Desktop: the whole-page empties (CH-7309 nothing yet, CH-7308 no team) take
  the shared page gutter and head top (`--ch-page-gutter`, `--ch-page-head-top`,
  tokens.css); the head has no eyebrow, so the top adds its 24px. The title is
  at x 284, y 156 at 1280, where every tab's is. The live two-pane page is
  unchanged.

### Verification (2026-10-18, page-head line)

- WebKit (Playwright, dev preview, `?state=empty`, 1280 and 1440, light and
  dark): the title at x 284, y 156.
- `clubhouse:check`, `typecheck:fast` and eslint pass. `clubhouse:css` exits 1
  on five `shell.css` findings (lines 3743 to 3822) from earlier work, none in
  this change.

## 2026-10-18 — Polish: a way out of no team; messages are safe

```text
Design package: none (wave-2 states review rows; no new pattern)
PR/commit:      uncommitted (polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed (2026-10-18, states review)

- No team (CH-7308): the page empty offers "Open team settings"; a coach goes
  to Team, a player to Golf profile (CH-8302). The route passes the role.
- The files notice (CH-7214) says "Your messages are safe.", as the others
  do, where it said "are fine".

### Verification (2026-10-18, states review)

- `npm run test:file` on the page's tests, `clubhouse:check`,
  `typecheck:fast` and eslint pass. `clubhouse:css` exits 1 on five
  `shell.css` findings from commit 3730926bb, none in this change.

## 2026-10-17 — Polish: tabular figures in rows

```text
Design package: none (polish review row 18; no new pattern)
PR/commit:      uncommitted (Clubhouse polish review, agent/fairway-fixes-polish)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Tabular figures come back on 14 rules in `messages.css` whose `font` shorthand
  reset `.ch-num` (unread counts, times, reaction counts).

### Verification

- `npm run test:file` on the page's tests, `clubhouse:check` and
  `typecheck:fast` pass. The WebKit pass is the coordinator's.

## 2026-10-17 — Remove a member, search goes to its message, the phone's Schedule invites

Three gaps against Fairway's Messages, built on the same actions:

- **The group's creator removes members.** Desktop Details has a Remove beside
  each member and the phone a remove icon on the member's row, for the creator
  only and never on their own row (theirs is Leave group, which D-47 keeps from
  the creator). It asks first (CH-7504, "Remove Eli from Varsity team?"; Remove
  carries the warning haptic, D-70), then calls
  `removeGolfGroupMember(conversationId, userId)` as Fairway does. The row
  leaves at once; a refusal puts it back and says so (CH-7024, "Couldn’t remove
  Eli", with the server's reason where it is a readable one). Landed: the
  success haptic, "Removed Eli from Varsity team", and the rail and the members
  read again (the list stays on screen while it does) (`RemoveMemberModal`,
  `api.removeMember`).
- **A search hit goes to its message.** Opening a hit opens its thread and
  scrolls the matched message to the middle of the view (at once with reduced
  motion), then rings it in green for 2.4 s (`FOUND_FOR_MS`; the ring fades on
  `--ch-dur-base`). While it does, the end-anchor is paused (`useThreadAnchor`
  `paused`): its 700 ms settle hold stops, and neither the messages loading
  under the jump nor a resize pull the thread to its end. A hit outside the
  loaded history gives the thread back its end (`use-focus-message.ts`).
- **The phone's Schedule invites the direct thread's player**
  (`&with=<golf_players.id>`), as the desktop header does; a group or a coach's
  thread invites nobody (D-52).

Tests: `__tests__/wiring-p007-messages.test.tsx`. Source and jsdom only; not
checked in a browser, and the scroll itself is not measured (jsdom has no
layout).

## 2026-10-17 — Every control checked against the write Fairway makes for it

Wiring audit: every Messages control (CLICKABLES, the P007 manifest's 19
actions, and a grep of the screens) traced to its server action, compared with
Fairway's call (`FairwayMessages`, `FairwayTeamBroadcastSheet`,
`FairwayNewMessageSheet`, `MessageComposer`, `FairwayPlayerAnnouncementCard`)
and the action's own guard. Four differences fixed:

- **A coach's group of coaches alone reached the whole team.** A coach's group
  is `createGolfTeamBroadcast`, and a broadcast given no players adds every
  player on the team; the coaches picked join after (D-45). Picking only coaches
  (desktop Group, or two coaches on the phone) therefore created a whole-team
  chat. New message now asks for at least one player first, as Fairway's group
  sheet does (CH-7105, "Choose at least one player. Coaches join the group once
  it exists."), and `createGroup` refuses such a call itself
  (`groupLacksPlayer`, `model.ts`).
- **An announcement's file never opened.** Its Files rows linked the stored
  `file_url`, which points at the private documents bucket (Fairway #1259: a
  dead `/object/public/` link). A file now opens through a signed link asked for
  at the tap (`getPreviewUrl`, `api.openAnnouncementDocument`), as Fairway's
  announcement card and the Team Hub open one: the tab opens inside the tap
  (Safari) and the link fills it; a link that can't be had closes it and says so
  (CH-7021, "That file has no stored copy to open." for a document with no
  stored file).
- **A deep link arriving while Messages was open was dropped.** `?conversation=`
  (a bell notification tapped on this page, which keeps it mounted), `?player=`,
  `?user=` and `?prefill=` were taken once per mount. Each new address is now
  taken. A thread the list doesn't hold yet is looked for once more (the rail's
  refetch) before it opens; one still missing says so (CH-7015), as before.
- **Message fields stop at the server's limit.** The composer, Edit and the
  phone's first message take at most 5,000 characters (`MESSAGE_MAX`,
  sendMessageSchema's `content.max(5000)`), as Fairway's field does; past it a
  send was refused and its Retry could never land.

Checked and matching production: send, retry, attachments, edit, delete,
reactions, mute, search, leave, Add (the group's creator; the server's
`loadGolfGroupIOwn` rule), delete conversation, acknowledge, task done, posting
an announcement (the coach's active team, cookie-resolved in both), the realtime
channels (shared hooks, unchanged), and the Schedule and View stats targets
(rebuilt for a coach). Differences kept, with reasons, are in WIRING.md
"Production parity (2026-10-17)". Tests:
`__tests__/wiring-p007-messages.test.tsx`. Source and jsdom only; not checked in
a browser.

## 2026-10-16 — Conversations first, announcements folded under them

Owner, 2026-10-16: messages first. The inbox lists conversations, then the
team's announcements as one raised row: how many there are, the newest title,
and how many wait on your acknowledgement. The row opens in place to the newest
three with a link to the earlier ones; a search or an open announcement unfolds
it. On the desktop rail and the phone's Inbox alike (`announcements.tsx`,
`MessagesView`, `MessagesPhone`, `messages.css`). The tests open the fold before
an announcement. Checked in Chrome at desktop width, open and closed; not
checked at phone width.

## 2026-10-16 — The filter chips use the shared green chip

All, Unread and Groups take the lit green chip every switcher draws
(`messages.css`); the page's own rule is removed. Shared detail:
docs/clubhouse/CHANGELOG.md.
## 2026-10-16 — Failed server reads are logged; Delete is not lost to them

From the code review of PR #2195. The route swallowed a failure of the
conversation-hide check and of the announcements read. Both are now logged
(`chLogServer`, `clubhouse.messages.canHide` and `.announcements`). A failed
hide check is left out instead of read as "no", so the inbox asks for it
itself once it lands and Delete conversation still shows where the database
has the per-person hide.

## 2026-10-14 — A dropped send tells one story; the reaction bar and New message work from the keyboard

Runtime audit (Playwright WebKit, local stack), both roles.

- **A-06** A send that died on the wire in Safari showed a "Couldn’t confirm
  this sent" bubble under a "Couldn’t send the message · Load failed." toast.
  The toast now classifies with the same test as the bubble
  (`isTransientNetworkErrorMessage`, which knows WebKit's "Load failed"), so it
  reads "Couldn’t confirm this message sent" with the check-then-Retry hint
  (CH-7005), and `friendlyReason` no longer passes a browser's own network,
  abort or timeout text through as copy (shared: docs/clubhouse/CHANGELOG.md).
  An attachment send that throws while its earlier attempt is unconfirmed now
  toasts CH-7023, as the composer shows, not CH-7006 "Try again".
- **A-07** The bubble reads "Couldn’t confirm this message sent. Check before
  sending again." (CH-7017).
- **A-26** Desktop React: the reaction bar rises from the bubble (quick; a fade
  with reduced motion), takes focus on its first reaction, ← → Home End move
  along it, and Esc or a pick returns focus to React (CH-7603, CH-7802). The
  "More message actions" menu already returns focus to its trigger on Esc
  (now tested). The audit's `<body>` came from the twelve Tabs it pressed
  before Esc: the shared Menu closes on Tab (by design), but it is portaled to
  the end of `.ch-root`, so that Tab drops focus on `<body>` (reproduced in
  jsdom). A shared `ui/Menu.tsx` defect, likely A-27 too, left for its own
  change.
- **A-28** Phone New message: a hardware keyboard's Esc is Cancel, and focus
  returns to New message (CH-7804; the PhoneScreen part is shared). The screen
  already slid in and focused its title; the audit sampled the People list's
  own vertical motion, which a horizontal push does not change.
- Tests: messages-audit "runtime audit 2026-10-14", friendly-reason.test.
  No screenshots: no dev server was run for this change.

## 2026-10-14 — The inbox no longer queues two server actions before its list

Simulator audit (each request held 0.8s to expose the order): opening Messages
ran canHideGolfConversations, getAnnouncementsWithMeta and the rail's
active-team read as server actions one after another (Next runs server actions
one at a time), and the inbox kept its skeleton until the announcements
answered, then the conversation chain ran.

- **Read with the page** (routes/messages.tsx): whether a conversation can be
  deleted and the announcements over the list are read on the server beside the
  directory, in parallel, and passed in; the client reads them only when the
  route couldn't (`announcements: null`) or in the preview. Two serialized round
  trips gone before the list can show. Mapping shared as `toChAnnouncement`
  (model.ts). Test: messages-audit "read with the page".
- Still open (shared hook, Fairway uses it too): the conversation rail itself is
  a chain of five dependent reads (RPC, team chats, members, last message and
  unread, names); recorded in the audit for an owner decision.

## 2026-10-13 — The first visit paints the list at once

The shell fills the inbox's session cache once idle (shell/use-warm-inbox.ts),
so opening Messages shows the list immediately instead of a second skeleton
while the browser loads it; the list still refreshes silently. Shared change:
docs/clubhouse/CHANGELOG.md.

## 2026-10-12 — A section root on the phone (no "‹ More")

The phone shell's section strip replaced the tab bar and the More sheet
(docs/clubhouse/phone/section-strip.md). Messages's phone top bar no longer
draws a "‹ More" back link: its title is a start title (`PhoneTop start`),
which the shell turns into the section switcher. The page's action, where it
has one, is unchanged. Shared change: docs/clubhouse/CHANGELOG.md.

## 2026-10-12 — conversation files follow the dashboard role

`getGolfConversationFiles` (HELD) asks the gate with the dashboard layout's
role, not `session.role`, so a user with a coach row on the player dashboard
gets the files Clubhouse Messages shows them under a team allowlist. Membership
still decides who reads what.

## 2026-10-12 — attachment retry stays Clubhouse-only

No visible change. Messages now asks the shared attachment hook for the
recoverable mode (`useMessageAttachments({ recoverable: true })`), which keeps
an unconfirmed send in sessionStorage so this screen can offer "retry this same
send". The hook's default no longer stores that marker, because Fairway has no
retry and a stored marker blocked every later attachment send in the thread.

## 2026-10-08 — a flatter conversation list, a green filter, and Delete conversation

Owner review:

- The conversation list stays a flat list (owner: "too card heavy"): thin
  dividers inset to the text, the open conversation the one filled green row in
  ivory ink (the old left stripe is gone), groups a solid green disc, avatars
  44px, and a long name wraps to a second line rather than being cut mid-word.
  `messages.css`.
- All, Unread and Groups: the chosen chip is green with ivory ink, not ivory on
  ivory.
- **Delete conversation** (CH-7503): a danger button in the conversation's
  details (desktop panel and phone sheet) opens a confirm, then hides the
  conversation from your own inbox (`hideGolfConversation`,
  `app/golf/actions/conversation-hide.ts`). The other people keep their copy,
  the
  messages are untouched, a team channel can't be deleted, and a message that
  arrives after the hide brings the conversation back. It needs the held
  migration `20261008160000_golf_conversation_hidden_at.sql` (a nullable
  `golf_conversation_participants.hidden_at` and the inbox function skipping a
  hidden conversation); until that is applied the button is not offered
  (`canHideGolfConversations` probes the column) and the action answers "not
  available yet". Fairway's inbox ignores `hidden_at` for now.
- A photo in a thread shows inline (a fixed 4:3 frame, cropped, so a late image
  never moves the messages around it; a click opens the full file, and one that
  won't load falls back to the file chip). Videos and documents stay chips.
- A reaction chip is the opposite colour of its message (ivory under a green
  bubble, green under an ivory one; yours is ringed in champagne), and a click
  opens who reacted: a green head naming the reaction and the count, a row per
  person, and one action to add or take back your own (`ReactionChip`;
  `ChReaction.userIds`). The glyphs are outline only, heavier (2.3), in pure
  ivory
  on green and deep green on ivory; the picker's chosen reaction is a green
  disc.
- The composer is a taller, rounder bar (56px, 28px radius) that takes a green
  focus glow; Attach is a green-wash disc, and Send a green disc that is a pale
  tint when empty and full green when there is something to send
  (`.ch-ms-comp__field`, `.ch-ms-send.is-ready`). Not yet signed off by the
  owner.
- The thread and the conversation list ease like the page does
  (`usePanelSmoothScroll`; the thread glides 1.2s). Desktop wheel only: a
  trackpad and the phone scroll natively.

## 2026-10-08 — the player peek (P003-C1)

The shared PlayerPeek: for the coach, a player's avatar and name in a thread
peek at the player, from the team directory Messages already holds. The bubble
keeps its own hold for message actions; coaches and people off the roster don't
peek. No new reads.

## 2026-10-08 — premium pass: a stale chunk reloads once, in Clubhouse's voice (D3)

`ClubhouseRouteError` (`shell/ClubhouseRouteError.tsx`) is a route `error.tsx`
body for Clubhouse screens, inside the shell or above it. On a ChunkLoadError
("Loading chunk …", stale assets after a deploy), the shared RouteErrorBoundary
asks the one recovery coordinator (`lib/recovery/client`) for a reload. The
coordinator reloads once, under the session's attempt budget and latch, and
never over unsaved work; there is no second sessionStorage flag, because the
coordinator's own doc forbids any other `location.reload()`. Any other error
shows Clubhouse's route error (CH-1206). Above the shell it brings its own
`.ch-root`, fonts and tokens. `/clubhouse-preview` now uses it, where the
audit's crash fell through to the app's generic Helm page. The live Messages
route already reached the same view through the shell.

## 2026-10-08 — premium pass: findings D1, D2, D4

- D1: a thread is held at its newest message while it settles
  (`useThreadAnchor`, 700 ms). A push during hydration that resets the scroll
  under it no longer leaves it at the oldest message. The hold stops the moment
  the reader scrolls, touches or types.
- D2: a message that didn't send keeps full-ink text, on a muted fill inside a
  dashed edge, beside "Not sent · Retry". It is no longer faded to about 2.8:1,
  so it can be read before you retry it.
- D4: the preview opens the team thread only on desktop, after hydration, as the
  live screen does. The phone preview stays on the inbox. The live loader
  already auto-opens only at 821px and wider.

## 2026-10-08 — premium pass: announcements as letterhead (P007-A1)

An announcement reads as a signed team letter. The letterhead is one engraved
line, the team and the full date ("Varsity · Wednesday 14 October"), with the
asks in words at its end ("Urgent · please acknowledge") instead of two chips;
then the 28px title, the body in full ink at a reading measure, and the posting
coach's name and title over a 1px gilt rule. Tasks, files and receipts follow as
before. On desktop the sheet takes the room's light as paper
(`--ch-light-paper`, never on the words); on the phone it stays flush. No
monogram or crest (owner: crests are declined, D3-2). The loader adds `signers`
(the program's coaches by golf_coaches.id) and the announcement carries
`authorId` (`created_by`); an unknown author shows no signature.

## 2026-10-08 — premium pass: prefilled messages (D2-7)

Actions that reach players open Messages prefilled and never send:
`messagesPrefillHref({ players, draft, title })` (`screens/messages/prefill.ts`)
links to `?prefill=<key>`: the key is an opaque hash, and the people, the draft
and the group name stay in this tab's sessionStorage under it, never in the URL
(query strings land in logs and history, and a draft can name a minor's health
or schoolwork). Messages takes the entry once and deletes it (`takePrefill`); a
cold link, a new tab or a used key opens Messages with nothing prefilled.
Players not on the team are left out and reported (CH-7001); the rest stay
chosen. One player with a thread opens it with the draft in its composer (an
unsent draft of the coach's own wins); otherwise New message opens with the
people chosen (a coach's two or more as a group named `title`) and the draft
quoted. Nothing is created until the coach presses on, and the draft lands in
the new thread's composer, where the coach presses Send. A player's prefill
keeps one person (D-15). When nobody in it is on the team, CH-7001 says so.

## 2026-10-08 — dark: Clubhouse at night

Messages follows GolfHelm's dark theme ("Clubhouse at night"). Sent bubbles keep
the green gradient with ivory type (not white); row hover and press, tool hovers
and the reaction hover become ivory washes; the selected thread's rail, the To
chips and the announcement acknowledgement take the light text green;
announcement marks, the phone's group marks and Jump to latest keep their filled
green with ivory type; the phone's idle Send glyph reads on its grey plate.
Light mode is unchanged.

## 2026-10-08 — phone: Mobile clubhouse pass

Phone Messages now follows the owner's "Coach - Home - Mobile v2" board (round
3: fewer containers), carried from Home to every phone screen:

- the inbox sits on the parchment at the board's margins: Search, then the
  filters as engraved rings, the chosen one in the green tint (the tint and ink
  cross over on the quick beat and the list settles in under it, CH-7606), then
  Announcements under an engraved double rule in the bold 19px sans;
- conversations are rows on seams inset to the text, with the Ledger's press
  tint (never a scale); their dates (Today, This week, Earlier) are the ledger's
  engraved date line, not section titles, so they read as entries in one list;
- a pushed thread's name reads in the bar's ivory on the green chassis, and its
  keyboard focus ring is gilt instead of a dark green box;
- Details, New message and New announcement lose their white panels: sections
  open under the double rule, rows sit on seams, and the profile name is the
  large heavy sans in forest ink;
- a pushed announcement is the page itself: its title in the 31px heavy sans,
  with Tasks, Files and who has read it as sections; the acknowledgement keeps
  its green well;
- the route skeleton and the inbox's loading draw the inbox's own shape
  (Search, the filters, a section and its rows), so nothing moves when it lands.

## 2026-10-08 — Heads, notices and copy (states audit)

- The first-run and no-team pages open under the page's framed head (Messages
  and one line) on desktop instead of a bare canvas; the empty keeps the one
  action (CH-7309, CH-7308).
- The rail's title is the heavy sans in forest ink; it had kept the old display
  serif's loose tracking.
- A rail that didn't load gives its notice the rail's full width (CH-7201).
- With no conversation open, the desktop's thread pane holds its empty (CH-7305)
  in the middle of the pane, as it already stood top to bottom, instead of
  against the rail's rule.
- The typing dots no longer show under a conversation that didn't load or is
  still loading (CH-7602).
- Notice and empty titles lose their trailing period and take curly apostrophes
  ("Conversations didn’t load", "You aren’t on a team yet"), and so does every
  other line the page writes, its toasts included; words a server sends are
  shown as sent (b8, held by `copy-apostrophes.test.ts`).

## 2026-10-07 — Another conversation settles in

On desktop, opening another conversation or announcement settles it in with a
6px rise (base) while the last fades out (quick), hidden from assistive tech;
each keeps its own scroll and a thread still opens at its end (CH-7605). The
first one a visit opens appears at once. Instant with reduced motion. New test:
messages.test › CH-7605.

## 2026-10-07 — One continuous conversation rail

The inbox rail is no longer three boxed cards (Announcements, Today, This week).
The rows sit directly on the rail as rounded targets, the way a mail sidebar
works:

- a soft tint on hover and on press;
- the open conversation is a raised ivory key ruled in the field green at its
  left;
- fine seams separate conversations, inset to the text, and hide next to a
  hovered or selected row.

The Messages title is set in the display serif.

## 2026-10-06 — Display type relaxed

The owner found the display type too compact. Display headings on this page
widen (width axis 88 → 96) and the tightest tracking eases to -0.026em, as on
every Clubhouse page. Layout and content are unchanged.

## 2026-10-06 — Premium interaction corrections

```text
PR/commit:      #2155, codex/clubhouse-smoothness-audit
Design package: existing Clubhouse focus and motion owners
Contract IDs:   existing keyboard and reduced-motion behavior
Data impact:    none
Held items:     physical iPhone and complete manual release acceptance
```

Keyboard-only Message actions reveal visibly on focus without covering the
message. Quoted-message scrolling observes OS reduced motion and the live
Clubhouse Animations preference; disabled animation means an immediate jump.

See [premium audit](../../PREMIUM_AUDIT.md) for focused evidence and limits.

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 18 mapped
actions and 24 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p007-messages). Approved handoffs and contract
IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-06 — Motion import path moves to `motion/react`

```text
PR/commit:      #2153 (agent/deps-ui-upgrade)
Design package: none; no visual or behavior change
Contract IDs:   none
Data impact:    none
Held items:     none
```

Dependency upgrade only. `framer-motion` 13 is replaced by the `motion` 14
package, so this page's animation imports change from `framer-motion` to
`motion/react`. The animation API, durations, curves and reduced-motion gating
are unchanged; Motion 14 only removed internal compatibility APIs this tree
never used.

## 2026-10-02 — End obsolete slow-save feedback

Messages now ties its CH-1902 notice to the attempt it describes. The notice
and pending timer end on settlement, screen unmount, or team-scope change.
Old callbacks cannot revive it after A → B → A navigation, and old cleanup
preserves new feedback. This affects feedback only: send/retry, busy guards,
refusal and unknown attachment outcomes remain unchanged. The 5-second
threshold and default 4-second confirmations / 8-second errors are unchanged.
The focused Messages regression confirms that a settled mute failure removes
the slow notice while its error remains visible. The shared verification set
has 21 unique passing cases: 11 Toast and 10 page/action cases. No later
optimized-build or browser result is claimed by this entry.

## 2026-10-02 — Owner correction: softer reply and message surfaces

Removed the green stripe from quoted replies in both composer and history.
The author and snippet establish hierarchy on a softly floating ivory face.
Attachment cards, file chips and reaction badges consume canonical elevation
instead of adding their own decorative outlines. Composer recovery notices
retain their status tone and actions with a softer floating edge. Existing
reply, send, multiline, scroll and recovery behavior stays intact.
The selected inbox conversation keeps its tint and stronger title while
dropping the same green edge stripe.

## 2026-10-02 — Visual repair: six-line phone editor

The phone writing pill now includes its padding and borders when sizing, with
a 144px mobile cap so six 20px lines fit completely. Desktop keeps its 132px
cap. Longer drafts still scroll within the field and retain the visible caret.
Settled WebKit checks at 375, 390 and 430px in a 480px viewport kept the editor
and Send inside the available screen. The focused sizing regression passed.

## 2026-10-02 — Release repair: composer resize and attachment outcome recovery

The WebKit phone thread reproduced a 180px bottom gap after selecting a quote
and
writing six lines: the last bubble remained behind the expanded composer. The
thread anchor now observes viewport/content size and preserves the prior reading
intent even when Safari emits a resize scroll before the observer. Newest
readers
stay at the end; older readers keep their position. Before/after captures record
the exact gap; simulated keyboard opening/closing also held the end.

Attachment text can be delivered even when the metadata batch fails. The UI now
separates complete, partial, refused and unknown outcomes. Partial recovery
keeps
only unsaved files and original reply target, so retry does not duplicate
delivered
text. Recovery filename chips now wrap unbroken names within the phone viewport.
Unknown recovery freezes the original payload, uses the hook's same-attempt
retry, and preserves later pending-request edits separately. The hook stores the
exact uploaded request under the authenticated user and conversation before the
server call. After a page reload, the composer shows the stored caption,
filenames
and reply target; Retry uses those original IDs and paths without uploading or
plain-text sending again. The later ordinary draft remains durable even while a
recovery Retry is pending. A refused recovered attachment displays filenames to
choose again, since a reload cannot restore local File bytes. CH-7217 gates
normal
Send when the pending-request check cannot be completed. CH-7022/7023 preserve
existing shared-file-open CH-7021. Local authenticated WebKit recovery verified
lost responses after commit, reload, and stable message/attachment counts.

## 2026-10-02 — Phone messaging follows the owner's Apple Messages benchmark

Branch: `codex/clubhouse-design-fidelity`. Shiro fix review and Frontend Design
Premium interaction review found identical rounded phone bubbles, a redundant
avatar rail in direct chats, and Return sending immediately. Restored run
geometry
and terminal tails, expanded the usable bubble column to 82%, retained existing
green/ivory depth, and made phone Return multiline with explicit Send. Desktop
keyboard behavior is preserved.

Long press keeps selected text and actual time in the existing action sheet.
Reply and swipe right select a real parent; swipe left reveals actual message
time.
Quotes show loaded author/text or attachment labels, truthful
deleted/unavailable
states, and scroll only to loaded parents. Parent jumps honor reduced motion
with
an instant scroll; the focused timestamp/quote test verifies both motion
settings.
Sending forwards the existing reply
ID
through text and attachment hooks. Pending sends synchronously lock reply
changes;
text failures retain the target in their bubble and attachment refusals restore
text/files/target. Leaving a phone thread clears reply intent while retaining
text.
The pending long-press timer is cancelled on unmount.

Verification: final Messages suite 74/74 and audit suite 8/8 (82 total), capped
at
one worker, 11.61 seconds. Scoped ESLint and diff checks pass. WebKit at 375,
390 and
430 has no horizontal overflow; 390 pointer long press, rightward Reply gesture,
Return/newline and selected-message context were exercised. Thread Axe scan
reports
zero WCAG 2 A/AA and 2.1 AA violations. Four captures are local and recorded
under
`P007-messages/2026-10-02`; Next's development indicator overlaps Attach in
captures
and is development-only. Physical iPhone Safari remains an owner verification
gap.

## 2026-10-01 — The intended depth in message bubbles

Branch: `codex/clubhouse-design-fidelity`. Owner requested more depth in bubbles
and cards. Incoming bubbles now use a graded warm ivory sheet, with upper light,
lower edge and two grounded shadows. Sent bubbles use a graded Augusta green
face and their own highlight/contact shadow. The same tokens apply to desktop
and phone; phone body text retains its 17px reading size. No sending, delivery,
unread, attachments or identity behavior changes. Before/after WebKit thread
captures are in the local screenshot gallery.

## 2026-10-01 — Aesthetic audit: unread rows read as unread, placeholders and initials hold their floors

```text
PR/commit:      agent/swap-audit (#2111): ba75b0a24 (list), f724065db (thread)
Design package: none (owner's aesthetic audit guide, 2026-10-01)
Contract IDs:   none new
Actions:        none
Data impact:    none; visual only
Held items:     none
```

- **Issue.** (1) On the phone the ink ramp had no step: tertiary text was raised
  to hold 4.5:1 on the darker page and sat 1.1 contrast points under secondary
  (7.4 against 6.3 on a card), so a preview, a time and a caption read as one
  gray. (2) An unread row differed from a read one by a name at 600 against 500
  and a preview 1.1 points darker. (3) The search placeholder measured 2.8:1 on
  the phone page. (4) A thread's 30px coin drew its initials at 10.2px, under
  the phone's 12px floor (Q-141).
- **Fix.** `tokens.css` (phone block): `--ch-ink-600` is `#46433d`, 9.3 against
  6.3. `messages.css`: an unread row's name is 700 and its preview
  `--ch-ink-700` (11.1:1; a read preview stays tertiary, 6.3:1). `controls.css`:
  search, input and textarea placeholders use `--ch-text-tertiary` (5.5:1 on the
  page). `ui.css`: on the phone an avatar's initials are the larger of 34% of
  the coin and the smaller of 12px and 42% of it. The last three are shared, so
  every phone page takes them (recaptured before each later family).
- **Not done, on purpose.** The selected state of the phone filter chips (the
  board's raised white) and the solid green disc a group draws (the board's
  `.m-grp`) are owner calls: Q-148 and Q-149.
- **Contrast pass (`d4367ee`).** The desktop rail's All, Unread and Groups
  switch was 4.1:1 on the well (shared `.ch-seg__b`, secondary ink now).
- **Verification.** Before and after at 375, 390, 430 and 1440 on the Messages
  preview fixture; the labels are in VERIFY.md "Screenshots".
  `messages.test.tsx` 66 of 66. No overflow, clipping or off-screen element at
  any width; no touch target under 44px by hit test. Not tested: a real iPhone,
  the keyboard-open state, the installed app.

## 2026-10-01 — Page pass: stale threads said, failed text in its bubble

PAGE_PERFORMANCE.md rules 4 and 11.

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none
Contract IDs:   CH-7216 (new)
Actions:        none
Data impact:    none
Held items:     none
```

- **Out of date, said so.** When a thread's read fails but an earlier copy is
  on screen, the messages stay and a notice above them says they may be out
  of date, with Try again. Before, a failed refresh was silent. CH-7202 still
  covers a thread with nothing to show.
- **Send, audited.** The send is already honest. It uses a client id threaded
  to the server (a retry after a commit is not a duplicate), keeps the failed
  bubble with Retry and Discard, and says "couldn't confirm" apart from "not
  sent".
- **A failed text lives in its bubble only (owner, 2026-10-01: "Bubble
  only").** The composer no longer puts a failed text back in the box. Doing
  so made a second Send under a new id easy, where the bubble's Retry reuses
  the id and is duplicate-safe. A failed attachment send has no bubble, so
  its text and files still go back in the box (MSG-26). CH-7004 and CH-7005
  now point to the thread.

## 2026-10-01 — An unsent draft survives a reload (swap audit F-12)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (no visual change)
Contract IDs:   71202 widened: a draft survives a thread switch and a reload
Actions:        none
Data impact:    none; drafts are kept in sessionStorage per signed-in user (cleared when the tab closes)
Held items:     none
```

- **Issue.** Drafts lived in a component Map: kept across thread switches,
  lost on a reload.
- **Fix.** `DraftStore` writes through to sessionStorage keyed by the user, so
  a reload keeps the draft while another account on the device, or a closed
  tab, does not. Refused or malformed storage falls back to memory.
- **Checked.** `messages-drafts.test.ts` 3/3; `messages.test.tsx` and
  `messages-mobile.test.tsx` green.

## 2026-09-30 — Mute is observed like every other messaging action (swap audit F-17)

```text
PR/commit:      agent/clubhouse (release train #2110)
Design package: none (swap audit fix, no visual change)
Contract IDs:   none
Actions:        `getGolfConversationMute`, `setGolfConversationMute` wrapped with `withAdminObserved`
Data impact:    Registered under the `messaging` feature in `lib/admin/feature-registry.ts`. No behaviour or schema change.
Held items:     none
```

- **Issue.** The mute actions were the only golf message actions not wrapped for
  the admin coverage contract (the tripwire failed in `test:all`).
- **Fix.** Both are wrapped and registered; their signatures and results are
  unchanged.
- **Checked.** `src/lib/admin/__tests__` 773/773.

## 2026-09-30 — Right click opens reactions (Clickables gap 23)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Right click opens reactions (Clickables gap 23)

- **Issue.** On desktop a right click on a message did nothing.
- **Fix.** It opens the message's reaction bar, as the React button does; the
  phone keeps its long press.
- **Checked.** messages 64/64, the mutation caught.

## 2026-09-30 — Clickables 10, 13, 14: Schedule invite, desktop Files, attach in New message

```text
Contract IDs:   none new (70209, 70406, 70616, 70630 now also draw on desktop Details; 70501 and 70604 also reach a first message)
Actions:        ACT-P007-SCHEDULE (new); ACT-P007-LIST-FILES and ACT-P007-SEND-ATTACHMENT widened
Data impact:    none
```

### Changed

- The desktop thread header's calendar icon is Schedule (label and tooltip) and
  opens Calendar's New event
  (`?new=1`); a direct thread with a player adds `&with=<golf_players.id>`
  (D-52), a group or a coach
  thread does not. The phone tile is unchanged (`?new=1`, no invite).
- Desktop Details lists the shared files, as the phone does: one shared read and
  open
  (`screens/messages/files.ts`), the same loading, none-yet, didn't-load and
  won't-open states.
- New message on the phone has the thread composer's Attach (+). Its files go to
  the thread with the
  first message and are sent there through `api.sendFiles`, so the 10-file cap,
  the type and size check
  (CH-7101) and the failure (CH-7006) are the thread's. A refused file is
  reported once the thread has
  opened and stays in its box.

### Verification

- `npx vitest run src/clubhouse/__tests__/messages.test.tsx` 63/63 (55 before);
  each new test fails with its
  fix removed (8 mutations).

## 2026-09-30 — Every contract proven by a test; drafts kept per thread

```text
Contract IDs:   71202 (new: DRAFT_KEPT_ACROSS_THREADS); tests attached to all 16 hand contracts
Data impact:    none
```

### Changed (2026-09-30)

- Drafts are kept per conversation by the container; switching threads no longer
  loses them.
- Each hand contract names a test that names its Bridge ID; five new tests
  (70101, 70102, 70901 with
  72001, 71202, 72301).
- CONTRACT.md tables are generated by `registry.mjs sync`; the notes are kept.

### Verification (2026-09-30)

- `npx vitest run src/clubhouse` 382/382; the 71202 test fails with the fix
  removed.

## 2026-09-29 — V2 page docs (gold standard)

```text
Design package: design/handoff/ v2 (Coach - Messages.html, Coach - Messages - Mobile.html)
PR/commit:      agent/clubhouse (this commit)
Contract IDs:   70101 to 72401 (88 on this page: 73 from the catalog, 15 new behaviour contracts without a code)
Actions:        18 (ACT-P007-*)
Data impact:    none
Held items:     conversation-files (feature), message-attachments-hardening (data)
```

### Changed (2026-09-29)

- The six page docs, the manifest's actions, and the 15 behaviour contracts
  (core view, deep links,
  realtime, success, draft kept, optimistic send, retry, section Try again,
  phone stack, Enter to send,
  one load per thread, failures reported, the held gate, the tests).

### Why

- D-62: Messages is the gold standard the other pages copy. D-69: every category
  answered.

### Verification (2026-09-29)

- `clubhouse:check` clean with the contract check on; `npx vitest run
  src/clubhouse` 377/377.

## 2026-09-29 — v2 foundation carried onto Messages

```text
Contract IDs: 70408 (new: no team, CH-7308)
```

### Changed (2026-09-29, 2)

- v2 motion (D-64), v2 haptics (D-70): sends and changes that land fire success;
  Retry and Add are
  silent. The no-team state is the v2 page empty state (D-71). Messages moved
  under More on the
  phone for both roles (D-66).

## 2026-09-29 — Phone build and merge

- The phone stack (Inbox, Thread, Details, New message, announcements) on the
  approved spec, D-40 to
  D-49; `getGolfConversationFiles`, held (D-48, D-61).

## 2026-09-29 — Desktop build

- Desktop Messages on the live realtime hooks (D-13) with announcements inside
  (D-16), and the full
  state catalog (CH-70xx to CH-78xx).

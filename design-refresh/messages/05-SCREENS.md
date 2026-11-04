# Messages: screen inventory

> Wiring, 4 Nov 2026: rows fixed in place are marked "(fixed 4 Nov wiring: ...)"; wiring tables in 06-SCREEN-SPECS.md, checks in 08-ACCEPTANCE.md.
> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 19 IDs with state matrices, a ChPrefill field table, a keyboard table, an arrivals table and 4 defaults; 8 rows fixed in place).

This file lists every screen, sub page, sheet, menu, overlay and inline state of the Messages lane (BUILD_BRIEF PR 11), with a state matrix for each. 06 gives the measured specs, 07 the motion rows, 08 the pass or fail criteria. Where this file and `04-FIDELITY-SPEC.md` differ, this file wins (BUILD_CONTRACT_STANDARD); each difference is listed in "Corrections" at the end.

## How to read this file

- Design page: https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev (version 12). Local copy: `redesign/clubhouse-messages.html`. In the tables, `…#x` is short for the artifact URL with that hash, and the same hash works on the local file.
- Hash grammar (the page's `applyHash`): `#<route>-<phone|desk>-<light|dark>[-reduce][-xxl][-w430][-w1280][-shot]`. `xxl` is the largest Text Size Clubhouse follows (23/17 = 1.353). `w430` is the 430 phone. `w1280` needs `shot` and frames the desktop at 1280 by 800. `shot` frames the device alone at the app's size (390 by 844, 430 by 932, 1440 by 900) with no safe areas.
- Capture state id: `<route>-<phone|desk>[-w430|-xxl|-w1280]`. Theme is a separate axis: `capture.mjs` shoots every state in light and dark, and design shots always add `reduce` and `shot`. Every route has five states: `-phone` (390), `-phone-w430`, `-phone-xxl`, `-desk` (1440), `-desk-w1280`. `times` is phone only.
- Capture command: `node capture/capture.mjs --id <ID> --state <state>`, for example `node capture/capture.mjs --id S-MSG.thread --state failed-phone-w430`. Output: `screenshots/<ID>__<state>__{design,app}__{light,dark}.png`. `--motion <M-ID>` records a 07 row.
- App route: the preview `/clubhouse-preview/messages?state=design&view=<route>` (PR 11a adds the fixture, marked `data-ch-preview-view`; motion uses `&play=<demo>`, marked `data-ch-preview-play`). Until 11a lands, the app side reaches only `inbox` and `thread`. The real app route for every row is `/golf/dashboard/messages` (01-BRIEF, 02-PLAN §8), coach and player. The sources name no per-conversation URL: the open conversation, details and New message are view state on that route. Component names come from 02-PLAN and 04 §5. Today's preview states that already exist (04 §12): `empty`, `rail`, `announcement`, `loading`, `failed`, `thread-failed`, `files-failed`, `add-failed`, `ann-failed`.
- Roles: the page is always drawn from a coach's seat (viewer Nick Rini, Head Coach). Messages serves coaches and players (01-BRIEF). Where a role sees something different, the Roles column says so and names its source. Players never see teammates' figures (SHARED-11); Messages draws no stat figures.
- SHARED-n criteria (`ACCEPTANCE-SHARED.md`) are referenced by number, never repeated: SHARED-1 green bar, 2 flat page, 3 no accent left borders, 4 contrast, 5 XXL unclipped, 6 Reduce Motion, 7 phone edge 16/20, 8 draft PRs behind a flag, 9 no deploy, flag flip or migration, 10 shot tracking unchanged, 11 players never see teammates' figures, 12 side by side.
- Shared values from the design lead (3 Nov), which beat every lane file, the page and 04 included:
  - Reduce Motion: the build crossfade is `CH_FADE_MS` (180 ms, opacity only, linear). The page draws 120 ms; that is the page's drawing, not the build value.
  - Push: the page behind moves 24% and dims to `brightness(0.9)`. The page draws −30% and a 0.1 black dim.
  - Contrast: 4.9:1 target, 4.5:1 floor for text; 3:1 for marks (typing dots, unread dot, icons).
- Every name, time and count on the page is fixture data from the page's `INIT`: 11 people, 7 conversations, three pinned (Team, Eli, Dana), 3 unread (Team, Qualifier group, Sam).

## Inventory

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-MSG` | screen | Phone: green bar switcher "Messages ⌄" → Messages. Desktop: Messages in the sidebar (count 3). Routes `inbox`, `longinbox`, `loading`, `rowtyping` | https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#inbox-phone-light; `redesign/clubhouse-messages.html#inbox-phone-light` | `?state=design&view=inbox` (also `longinbox`, `loading`, `rowtyping`); today's `?state=loading`; real `/golf/dashboard/messages`: `PhoneInbox` (MessagesPhone 246), `Rail` (MessagesView 649), `ConvRow` (431) | both; same list. Pins are private to each person (PIN-SYNC §1) | 11b (list, pins on the device, typing on rows and pins); 11h (pins on every device) |
| `S-MSG.unread` | inline state | Tap Unread in the segmented filter | …#unread-phone-light; local `#unread-phone-light` | `?state=design&view=unread`; real: same `PhoneInbox`, `Rail`, `ui/Segmented.tsx` | both | 11b |
| `S-MSG.row-menu` | menu | Long-press a row (phone) or right-click it (desktop). The page anchors it to Maya's row. `pinlimit`: the same menu with three pins held | …#rowmenu-phone-light, …#pinlimit-phone-light; local same | `?state=design&view=rowmenu`, `view=pinlimit`; real: row menu in `ConvRow` (MessagesView 448 to 456) | both; each person's own pins | 11b (Pin in the menu); 11h (limit from the account, D7) |
| `S-MSG.new` | push (phone); pane (desktop) | Tap New (compose key) beside Search (phone) or beside the "Messages" title on the rail (desktop) | …#new-phone-light; local same | `?state=design&view=new`; real: `PhoneNewMessage` (MessagesPhone 944), `NewMessage` (MessagesView 2831) | both; suggestions from the directory (03) | 11f |
| `S-MSG.empty` | inline state (first run) | Messages with no conversations | …#empty-phone-light; local same | `?state=design&view=empty`; today's `?state=empty`; real: `MessagesFirstRun`, `RailEmpty` | both | 11f |
| `S-MSG.fresh` | inline state (empty thread) | New message → pick a person with no conversation yet (Jack) | …#fresh-phone-light; local same | `?state=design&view=fresh`; real: empty `Thread` / `PhoneThread` | both; the page's starters are written for a coach (open line) (fixed 4 Nov: settled by S6, three player starters) | 11f |
| `S-MSG.thread` | push (phone); pane (desktop) | Tap a row or pin (phone push); click a row (desktop). Routes `thread`, `failed`, `long` | …#thread-phone-light, …#failed-phone-light, …#long-phone-light; local same | `?state=design&view=thread` (`failed`, `long`); today's `?state=thread-failed`; real: `PhoneThread` (MessagesPhone 372), `Thread` (MessagesView 1970), `Bubble` (1049) | both | 11c (bubbles, desktop hover bar in 11e) |
| `S-MSG.composer` | inline state (component) | Bottom of every conversation | …#thread-phone-light; local same | `?state=design&view=thread`; real: `Composer` (MessagesView 1618), `ComposerPlus` (1556), `AttachChips` (1482) | both | 11d |
| `S-MSG.team` | inline state (group thread) | Tap the Team pin or the "Demo University Golf" row | …#team-phone-light; local same | `?state=design&view=team`; real: `Thread` in a group | both; the Seen by pill shows under your own latest message only | 11c (runs, names, faces); 11e (poll card, Seen by pill) |
| `S-MSG.typing` | inline state | Open a conversation while the other person types (`typing`); in a group, the typer is named (`grouptyping`) | …#typing-phone-light, …#grouptyping-phone-light; local same | `?state=design&view=typing` (`grouptyping`); real: `ThreadBelow` typing (`.ch-ms-typing`) | both | 11c (bubble); 11b §3.8 (the typer's id in the hook) |
| `S-MSG.times` | inline state (phone gesture) | Drag the thread left | …#times-phone-light; local same | `?state=design&view=times`; real: `use-thread-drag-times.ts` (new) | both | 11c |
| `S-MSG.date-pill` | inline state (floating glass pill) | Scroll the thread | …#datepill-phone-light; local same | `?state=design&view=datepill`; real: the pill in `Thread` fed by the anchor's observer (02 §4.2) | both | 11c |
| `S-MSG.jump` | inline state (control) | Scroll up more than 0.9 of a screen from the latest message | …#jump-phone-light; local same | `?state=design&view=jump`; real: `ThreadBelow` (MessagesView 1953) | both | 11c |
| `S-MSG.toast` | toast | Hold a message → Copy | …#toast-phone-light; local same | `?state=design&view=toast`; real: no component named in 02-PLAN (open line) (fixed 4 Nov: settled by S5, restyle today's `ui/Toast.tsx`) | both | 11e (Copy is a lift menu row) |
| `S-MSG.attach` | menu | Tap + in the composer | …#attach-phone-light; local same | `?state=design&view=attach`; real: `ComposerPlus` (MessagesView 1556) | both | 11d |
| `S-MSG.file` | inline state | + → File | …#file-phone-light; local same | `?state=design&view=file`; real: `AttachChips` (1482) | both | 11d (chip); 11c (file bubble once sent) |
| `S-MSG.reply` | inline state (chip above the field) | Hold a message → Reply, or swipe a bubble right (phone, today's) | …#reply-phone-light; local same | `?state=design&view=reply`; real: the chip row over `Composer`; `ReplyQuote` (1425) once sent | both | 11d (chip rise, as the file chip); 11e (Reply in the lift) |
| `S-MSG.edit` | inline state (chip above the field) | Hold your own message → Edit | …#edit-phone-light; local same | `?state=design&view=edit`; real: as `S-MSG.reply` | both; only your own messages | 11d; 11e |
| `S-MSG.poll-composer` | sheet, hugs content, max 78% / 82% (04 §3) | + → Poll | …#pollnew-phone-light; local same | `?state=design&view=pollnew`; real: today's `PollSheet` (polls.tsx 615) | both; today's rules for who can post a poll | 11d (entry from +); 11e (polls.tsx restyle) |
| `S-MSG.hold` | modal (lift over a blurred thread) | Press and hold a bubble 450 ms; Enter or Space on a focused bubble; right-click (desktop); "More" on the desktop hover bar | …#hold-phone-light; local same | `?state=design&view=hold`; real: `MessageLift.tsx` (new, keeps `code="CH-7604"`) | both; menu rows depend on whose message it is | 11e |
| `S-MSG.holdseen` | modal | Hold your own message in a group | …#holdseen-phone-light; local same | `?state=design&view=holdseen`; real: `MessageLift.tsx` with `SeenSheetRow` | both: your own message in a group (page code, 02 §6.1). The page's caption says "Coaches get Seen by". Open line (fixed 4 Nov: settled by S1, anyone on their own group message) | 11e |
| `S-MSG.react` | inline state | Tap a reaction in the bar, double-tap a bubble (Like), or the desktop hover bar | …#react-phone-light; local same | `?state=design&view=react`; real: `ReactionChip` (775), `REACTIONS` (154) | both | 11e |
| `S-MSG.seen` | sheet, hugs content, max 78% / 82% (phone); centred card 400 wide (desktop) | Tap the Seen by pill, or the Seen by row in the hold menu | …#seen-phone-light; local same | `?state=design&view=seen`; real: `seen-by.tsx` sheet (264), popover (280) | both, as `S-MSG.holdseen` | 11e |
| `S-MSG.poll` | inline state (card) | A poll message in a group thread | …#poll-phone-light; local same | `?state=design&view=poll`; real: `PollCard` (polls.tsx 209) | both; anyone can vote | 11e |
| `S-MSG.votes` | sheet, hugs content, max 78% / 82% (phone); centred card 400 wide (desktop) | Tap "See votes" in the poll footer | …#votes-phone-light; local same | `?state=design&view=votes`; real: `PollVotesModal` (polls.tsx 441) | both; "Hasn’t voted" lists players only (page code); who can remind: today's rule | 11e |
| `S-MSG.details` | push (phone); 300 column (desktop) | Tap the bar's face, name or info key (phone push). Desktop: the name or the Details key toggles the column | …#details-phone-light; local same | `?state=design&view=details`; real: `PhoneDetails` (MessagesPhone 685), `Details` (MessagesView 2549) | both. Class status card: coach only, flag on (03). Profile: direct with a player | 11f |
| `S-MSG.groupdetails` | push (phone); 300 column (desktop) | As `S-MSG.details`, in a group | …#groupdetails-phone-light; local same | `?state=design&view=groupdetails`; real: as `S-MSG.details` | both. Add: group creator; Leave: group, not creator (02 §7.1) | 11f |
| `S-MSG.mute` | menu | Details → Mute quick action | …#mute-phone-light; local same | `?state=design&view=mute`; real: `MuteControl` (MessagesView 2759), `RowMuteModal` (500) | both; mute is per person | 11f |

Every route also has its dark, XXL, 430, 1440 and 1280 links by changing the hash (above). 11g writes the motion tests and clips for every row; 11a adds the fixture that reaches every route.

### Not drawn

The page doesn't draw these. Build rule for each: restyle today's component with the same tokens (card, well, pill, sheet styles from 06), no new look.

| Item | Where it shows | Today's piece and its rule |
|---|---|---|
| Row swipe actions | `S-MSG`, phone rows | Today's: mark read or unread, delete (owner decision 14). Kept unchanged |
| In-conversation search | Details → Search; desktop bar Search key | Today's `searchMessages` scoped to the conversation, `MessageHits` (03 Details) |
| Who-reacted list | Tap a reaction badge | Today's who-reacted card (MessagesView 829; 02 §6.2) |
| Delete and leave confirm | Hold → Delete; Details → Leave | Today's edit, delete and leave modals (04 §5) |
| Add and remove member | Group details → Add; member rows | Today's flows; preview `?state=add-failed` exists |
| No-team state | Messages with no team | `MessagesNoTeam.tsx`, behaviour kept (02 §1) |
| Pin toasts | A pin the server refuses (11h) | `S-MSG.toast` styling. Copy from PIN-SYNC §5 only: "You already have 3 pinned." (limit reached on another device) and "You're not in this conversation anymore." (the row drops). Offline pins queue and send on reconnect, with no toast |
| Pending (sending) bubble | Your message before the server answers | Today's pending state (MessagesView 597 to 617); no receipt while pending (P-1) |
| Offline or stale banner | Any screen with the network gone | Today's handling, restyled |
| Notify anyway | Composer cluster | `NotifyAnyway.tsx`, MessagesView 921, messages.css 3359 |
| Class line | Composer, group and thread | `GroupClassLine.tsx`, `ThreadClass*.tsx`, messages.css 3404 |
| Inbox and thread loading in the app | First paint | Inbox: the skeleton as drawn (`#loading`). Thread: keeps today's thread loading state, restyled (`MessagesSkeleton.tsx` behaviour kept, 02 §1) |
| Announcements | Inbox, folded under the conversations | Today's `announcements.tsx`, kept and restyled (02 §3.1). The Announcement row in the + menu is not built (Nick, 31 Oct) |
| Edit and delete outcomes | After Edit or Delete | Today's "Edited" mark and deleted line, restyled as a bubble with secondary text (03) |
| Search hits ring | A bubble opened from search | Today's ring (MessagesView 618) |

Not built at all: the Announcement row and the Camera row in the + menu (Nick, 31 Oct), the Dictate key (04 §8), drag to reorder pins (D8), a captain chip (no field, 03 gap 6).

## State matrices

Every matrix has the same 14 rows. "Drawn" names the anchor; "not drawn" gives the build rule. Anchors are shown in light; every one also exists in dark. Reduce Motion rows: the design still is `-reduce`; the build crossfade is `CH_FADE_MS` 180 ms, opacity only, linear (the page draws 120 ms).

### S-MSG

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#inbox-phone-light` | `inbox-phone` | Phone: today's green bar with "Messages ⌄" and the bell (badge 2), no large title (SHARED-1). Context "3 unread · Demo University Golf", Search well and New key (40), segmented All / Unread / Groups, Pinned card (Team, Eli, Dana; bubblets "Asking the real…" and "I can drive the…"), Recent card titled "Recent 4" (Qualifier group, Maya, Sam, Owen). Sam carries the mute glyph. |
| loading | Drawn `#loading-phone-light` | `loading-phone` | Context reads "Loading conversations". Search and segmented stay. The Pinned card goes; one card with a 64 wide title bar and five skeleton rows (44 face, two lines). Same card and row heights, so nothing moves when rows land. Pulse `skp` 1.4 s, off under Reduce Motion (M-MSG-31). |
| empty | Not this ID | see `S-MSG.empty` | No conversations shows the first run, not an empty list. A filter with nothing in it: see `S-MSG.unread`. |
| error/failed | Not drawn | add (today's `?state=failed`) | Today's inbox error, restyled. Pins that fail keep the copy in "Not drawn". |
| long text | Drawn `#longinbox-phone-light` | `longinbox-phone` | "Qualifier group · Lonnie Poole travel squad" and "Maya Ortiz-Castellanos". Names wrap; previews keep two lines then ellipsis (03: two lines). The time keeps its column. |
| lots of items | Not drawn (7 conversations) | add | Rows stay virtualised (messages.css 3343, kept). Pinned stays at 3 faces (D1). No inner scroll in the card; the page scrolls. |
| one item | Not drawn | add | One row: "Recent 1". With no pins the Pinned card is not drawn (02 §3.1). |
| offline or stale | Not drawn | add | Today's handling, restyled. A pin made offline shows at once and is sent on reconnect (PIN-SYNC §1). |
| XXL Text Size | Drawn `#inbox-phone-light-xxl` | `inbox-phone-xxl` | Every size × 1.353. Rows grow; faces stay 44 and 62. Nothing clips (SHARED-5). |
| dark | Drawn `#inbox-phone-dark` | `inbox-phone` (dark) | Page #0E120F, cards #191E1A; the green bar keeps its green (SHARED-1). |
| Reduce Motion | Drawn `#inbox-phone-light-reduce` | `inbox-phone` | Still frame. Build: segmented thumb jumps, rows crossfade `CH_FADE_MS` 180 ms; typing dots static at full opacity. |
| phone 390 | Drawn | `inbox-phone` | 16 edge; context line 358 wide. Typing: `rowtyping-phone` (dots in Eli's pin bubblet and in the Qualifier group row; groups show dots only on the row, no name). |
| large phone 430 | Drawn `#inbox-phone-light-w430` | `inbox-phone-w430` | 20 edge (SHARED-7). Pinned card still holds 3 faces. |
| desktop 1280 and 1440 | Drawn `#inbox-desk-light`, `#inbox-desk-light-shot-w1280` | `inbox-desk`, `inbox-desk-w1280` | Rail 320: "Messages" 26/600 with the New key, context "3 unread · 7 conversations", Search, segmented, then flat sections "Pinned" (Team, Eli, Dana) and "Recent" (4 rows), rows inset 8, radius 12, the selected row (Eli) washed. Eli's thread open on the right. No cards on the rail. Loading on desktop: `loading-desk` (rail skeleton, thread stays). |

### S-MSG.unread

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#unread-phone-light` | `unread-phone` | Thumb on Unread. Phone: the card titled "Unread 2" with Qualifier group and Sam Carter; the Team channel (unread, pinned) stays in the Pinned card. |
| loading | n/a | n/a | Filtering never loads; the list is in hand. |
| empty | Not drawn | add | Card title "Nothing here" with "No unread conversations right now." (the page's own copy in `inboxPage`; Groups: "No groups right now."). |
| error/failed | n/a | n/a | As `S-MSG`. |
| long text | Not drawn | add | As `S-MSG` long text. |
| lots of items | Not drawn | add | All unread rows; count in the title. |
| one item | Not drawn | add | "Unread 1". |
| offline or stale | n/a | n/a | As `S-MSG`. |
| XXL Text Size | Drawn `#unread-phone-light-xxl` | `unread-phone-xxl` | Segment labels scale; thumb width stays (100% − 6) / 3. |
| dark | Drawn `#unread-phone-dark` | `unread-phone` (dark) | |
| Reduce Motion | Drawn `#unread-phone-light-reduce` | `unread-phone` | Thumb jumps (no 360 ms slide); rows crossfade `CH_FADE_MS` 180 ms. |
| phone 390 | Drawn | `unread-phone` | Unread counts `c.unread > 0 || c.markedUnread` (03). |
| large phone 430 | Drawn `#unread-phone-light-w430` | `unread-phone-w430` | 20 edge. |
| desktop 1280 and 1440 | Drawn `#unread-desk-light` | `unread-desk`, `unread-desk-w1280` | Rail sections stay "Pinned" (Team) and "Recent" (Qualifier group, Sam Carter): three rows. |

### S-MSG.row-menu

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#rowmenu-phone-light` | `rowmenu-phone` | Glass menu under Maya's row: Open conversation, Pin, Mark as unread, Mute…, Delete conversation. The route unpins Dana first, so the card reads "Recent 5" and two pins show. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Pin fails: copy in "Not drawn" (pin failed toast); the row returns to unpinned. |
| long text | Not drawn | add | Items are fixed copy; the menu's aria-label names the conversation ("Actions for …"). |
| lots of items | n/a | n/a | Fixed five rows. |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | Pin offline: applied at once, sent on reconnect; over the limit it comes back off with "You already have 3 pinned." (PIN-SYNC §1). |
| XXL Text Size | Drawn `#rowmenu-phone-light-xxl` | `rowmenu-phone-xxl` | Items grow past 42; the menu opens upward when it would pass the bottom (page `popMenu`). |
| dark | Drawn `#rowmenu-phone-dark` | `rowmenu-phone` (dark) | Delete conversation in `--a-danger` #F28B7D (7.03); light #B3261E (6.26), as Delete in the hold menu (v13). |
| Reduce Motion | Drawn `#rowmenu-phone-light-reduce` | `rowmenu-phone` | Menu appears with a `CH_FADE_MS` 180 ms crossfade, no scale. |
| phone 390 | Drawn; `#pinlimit-phone-light` | `rowmenu-phone`, `pinlimit-phone` | `pinlimit`: three pinned, Pin dimmed (`aria-disabled`) with "Pin up to 3" at the right; nothing unpins by itself (D7). The card reads "Recent 4". |
| large phone 430 | Drawn `#rowmenu-phone-light-w430` | `rowmenu-phone-w430`, `pinlimit-phone-w430` | 20 edge. |
| desktop 1280 and 1440 | Drawn `#rowmenu-desk-light` | `rowmenu-desk`, `rowmenu-desk-w1280`; `pinlimit-desk` | Right-click a rail row; same five items. |

### S-MSG.new

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#new-phone-light` | `new-phone` | Bar "New message" with Cancel at the left (phone). A card with "To:" and a blinking caret; the field is empty in the still. A card "Suggested" / "Players you haven’t messaged": Jack Liu, Cole Mercer, Ryan Shaw, Ben Hale, Luca Ferri. The token is a moment of motion (M-MSG-22), not this still. |
| loading | Not drawn | add | Opens on the loaded directory; no spinner. |
| empty | Not drawn | add | No suggestions: the Suggested card is not drawn; the To field stays. |
| error/failed | Not drawn | add | Today's error, restyled. |
| long text | Not drawn | add | Long names wrap in the row; the role line stays one line. |
| lots of items | Not drawn | add | Today's order (coaches first, then players by name, 03). |
| one item | Not drawn | add | One suggestion row. |
| offline or stale | Not drawn | add | Today's handling, restyled. |
| XXL Text Size | Drawn `#new-phone-light-xxl` | `new-phone-xxl` | Rows grow; faces stay 32. |
| dark | Drawn `#new-phone-dark` | `new-phone` (dark) | |
| Reduce Motion | Drawn `#new-phone-light-reduce` | `new-phone` | Token appears with a `CH_FADE_MS` 180 ms crossfade; caret blink stays (status, M-MSG-32). |
| phone 390 | Drawn | `new-phone` | 16 edge. |
| large phone 430 | Drawn `#new-phone-light-w430` | `new-phone-w430` | 20 edge. |
| desktop 1280 and 1440 | Drawn `#new-desk-light` | `new-desk`, `new-desk-w1280` | In the thread pane: "New message" at the left of the bar, Cancel at the right; the rail stays. |

### S-MSG.empty

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#empty-phone-light` | `empty-phone` | Green bar, then one card: illustration, "No conversations yet", "Message a player, a coach or the whole team. Everything stays inside Demo University Golf.", "Start a conversation" (primary), "Message the team" (ghost). Still: nothing loops. (The "CH-7301" label drawn before v14 was a design annotation and is gone.) |
| loading | n/a | n/a | Shown only once conversations load as none (`convs.length === 0` and not loading, 03). |
| empty | Drawn | `empty-phone` | This is the empty state. |
| error/failed | n/a | n/a | Never shown when the read failed. |
| long text | Not drawn | add | A long team name wraps in the body. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#empty-phone-light-xxl` | `empty-phone-xxl` | Text grows; the illustration doesn't. |
| dark | Drawn `#empty-phone-dark` | `empty-phone` (dark) | |
| Reduce Motion | Drawn `#empty-phone-light-reduce` | `empty-phone` | No change at rest. |
| phone 390 | Drawn | `empty-phone` | Team name from `teamName` (03). |
| large phone 430 | Drawn `#empty-phone-light-w430` | `empty-phone-w430` | 20 edge. |
| desktop 1280 and 1440 | Drawn `#empty-desk-light` | `empty-desk`, `empty-desk-w1280` | Rail: "Messages" with New, "No conversations yet", Search (no segmented). Pane: the same card. |

### S-MSG.fresh

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#fresh-phone-light` | `fresh-phone` | Bar "Jack" / "Freshman". Hello card: 72 face, "Jack Liu", "Freshman · No messages yet", three starters: "Can you send me your card from today?", "Nice round. What clicked?", "Can we meet before practice Monday?". Composer empty. |
| loading | n/a | n/a | |
| empty | Drawn | `fresh-phone` | This is the empty thread. |
| error/failed | Not drawn | add | First send fails: as `S-MSG.thread` failed. |
| long text | Not drawn | add | Long name wraps in the hello card. |
| lots of items | n/a | n/a | Always three starters. |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#fresh-phone-light-xxl` | `fresh-phone-xxl` | Starters wrap; hit areas reach 44 (06). |
| dark | Drawn `#fresh-phone-dark` | `fresh-phone` (dark) | |
| Reduce Motion | Drawn `#fresh-phone-light-reduce` | `fresh-phone` | Starters fill the field at once; no motion. |
| phone 390 | Drawn | `fresh-phone` | A starter fills the field and never sends (03). |
| large phone 430 | Drawn `#fresh-phone-light-w430` | `fresh-phone-w430` | 20 edge. |
| desktop 1280 and 1440 | Drawn `#fresh-desk-light` | `fresh-desk`, `fresh-desk-w1280` | Same card in the thread pane. |

### S-MSG.thread

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#thread-phone-light` | `thread-phone` | Today's PhoneBar (back, face, "Eli", "Junior", info). Day pills "Thursday 5:48 PM" and "Today 8:09 AM". Runs with tails on the last bubble, a photo, Like on e3, Love on e8, "Seen 8:15 AM" under your last message. |
| loading | Not drawn | add (today's) | Thread loading keeps today's state, restyled. |
| empty | Not this ID | see `S-MSG.fresh` | |
| error/failed | Drawn `#failed-phone-light` | `failed-phone` | Your e10 "Can you bring the scorecard to lift?" with "Not delivered · Try again" under it; tap retries. (fixed 4 Nov: the build line is today's "Not sent" with its retry, S2; the page's words are the drawing only.) Thread load failure: today's `?state=thread-failed`. |
| long text | Drawn `#long-phone-light` | `long-phone` | "Eli Brandt-Vanderhoeven", "Junior · Transfer from Wake Forest", and a long message ending in a long unbroken link. The bubble wraps the link inside 76% (06); the phone bar shows the short name. |
| lots of items | Not drawn | add | Today's thread paging and end anchor (`use-thread-anchor.ts`, kept). |
| one item | Not drawn | add | One bubble with its tail and receipt. |
| offline or stale | Not drawn | add | Pending bubble per "Not drawn". |
| XXL Text Size | Drawn `#thread-phone-light-xxl` | `thread-phone-xxl` | Bubble text and padding × 1.353; max width stays 76%. |
| dark | Drawn `#thread-phone-dark` | `thread-phone` (dark) | Theirs #232925, yours #1F6B45 with #F4EEDD text (5.58:1, the lowest text pair on the page, over the 4.9 target). |
| Reduce Motion | Drawn `#thread-phone-light-reduce` | `thread-phone` | Push becomes a `CH_FADE_MS` 180 ms crossfade. |
| phone 390 | Drawn | `thread-phone`, `failed-phone`, `long-phone` | Thread side padding 12 + the 30 face slot (04 §3). |
| large phone 430 | Drawn `#thread-phone-light-w430` | `thread-phone-w430` | Thread side padding 16 (12 at 390) plus the 30 face slot, composer 14 (10 at 390): the same visual edge as the 20 page edge (v13). |
| desktop 1280 and 1440 | Drawn `#thread-desk-light` | `thread-desk`, `thread-desk-w1280` | Glass bar: face 36, "Eli Brandt", "Junior", then Search and Details keys at the right (scoped bar styles, page bug 1). Column max 760, side padding 28. Hover bar on each bubble (M-MSG-29). |

### S-MSG.composer

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#thread-phone-light` | `thread-phone` | One glass pill: + (36), field "Message Eli", no key on the right while empty. |
| loading | n/a | n/a | |
| empty | Drawn | `thread-phone` | Empty field: no send key (the Dictate key is not built). |
| error/failed | Not drawn | add | Send fails: the bubble shows the failed line (`S-MSG.thread`); the composer clears as today. |
| long text | Not drawn | add | Grows a line at a time to six lines (132), then scrolls. Height steps, not animated. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | Today's drafts keep the text. |
| XXL Text Size | Drawn `#thread-phone-light-xxl` | `thread-phone-xxl` | Field text × 1.353; the six-line cap is six lines. |
| dark | Drawn `#thread-phone-dark` | `thread-phone` (dark) | |
| Reduce Motion | Drawn | `thread-phone` | Send key swaps with a `CH_FADE_MS` 180 ms crossfade. |
| phone 390 | Drawn | `thread-phone` | Outer padding 8 × 10 plus `max(8px, env(safe-area-inset-bottom) − 4px)` (04 §4). |
| large phone 430 | Drawn `#thread-phone-light-w430` | `thread-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#thread-desk-light` | `thread-desk`, `thread-desk-w1280` | Max 760, padding 10 × 28 × 18. Enter sends, Shift+Enter adds a line (CH-7802 hint). |

### S-MSG.team

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#team-phone-light` | `team-phone` | Bar "Demo University Golf" / "11 members". Names inside the first bubble of a run, a 30 face beside the last, the poll (t2), "Seen by 8 of 10" pill with five 16 faces under t6. |
| loading | Not drawn | add | As `S-MSG.thread`. |
| empty | Not drawn | add | As `S-MSG.fresh`, with the group coin. |
| error/failed | Not drawn | add | As `S-MSG.thread` failed. |
| long text | Not drawn | add | Long first names wrap inside the bubble's name line. |
| lots of items | Not drawn | add | Seen by shows five faces at most; the count carries the rest. |
| one item | Not drawn | add | Pill "Seen by everyone" when all have read (page `seenHTML`); "Delivered" when none have. |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#team-phone-light-xxl` | `team-phone-xxl` | Faces stay 30 and 16. |
| dark | Drawn `#team-phone-dark` | `team-phone` (dark) | |
| Reduce Motion | Drawn `#team-phone-light-reduce` | `team-phone` | New Seen faces appear with a `CH_FADE_MS` 180 ms crossfade. |
| phone 390 | Drawn | `team-phone` | Coins under 20 draw colour only, no initials (04 §8). |
| large phone 430 | Drawn `#team-phone-light-w430` | `team-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#team-desk-light` | `team-desk`, `team-desk-w1280` | |

### S-MSG.typing

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#typing-phone-light` | `typing-phone` | Eli's typing bubble (three dots, tail) under the last message. Hides 5 s after the last event (03). |
| loading | n/a | n/a | |
| empty | Not drawn | add | Typing in an empty thread: the bubble under the hello card (page `threadHTML`). |
| error/failed | n/a | n/a | No typing event: no bubble. |
| long text | Not drawn | add | A long first name inside the group typing bubble stays one line and ends in an ellipsis past 160 wide. |
| lots of items | Not drawn | add | Several typers in a group: one typing bubble per typer, each with its name inside (SETTLED-4NOV.md, 6). Row and pin previews use the default below. |
| one item | Drawn | `typing-phone` | |
| offline or stale | Not drawn | add | No events: the bubble hides after 5 s. |
| XXL Text Size | Drawn `#typing-phone-light-xxl` | `typing-phone-xxl` | |
| dark | Drawn `#typing-phone-dark` | `typing-phone` (dark) | Dots `--a-dot` #827D71 on #232925, 3.62 (mark, 3:1). |
| Reduce Motion | Drawn `#typing-phone-light-reduce` | `typing-phone` | Dots static at full opacity (v12). Bubble appears with a `CH_FADE_MS` 180 ms crossfade. |
| phone 390 | Drawn; `#grouptyping-phone-light` | `typing-phone`, `grouptyping-phone` | Group: Maya's face beside the bubble and "Maya" inside it above the dots, like a first bubble; nothing under it on the page (SHARED-2, v13). Light dots `--a-dot` #7A766C: 4.49 on the bubble, 3.97 on the page. |
| large phone 430 | Drawn `#typing-phone-light-w430` | `typing-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#typing-desk-light` | `typing-desk`, `typing-desk-w1280`, `grouptyping-desk` | |

### S-MSG.times

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#times-phone-light` | `times-phone` | The thread dragged left 58 with every time showing at the right in ink-3, tabular. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | n/a | n/a | |
| long text | n/a | n/a | Times are fixed format. |
| lots of items | n/a | n/a | Every message carries its time. |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#times-phone-light-xxl` | `times-phone-xxl` | Times scale; the drag stays capped at 58. Nothing clips. |
| dark | Drawn `#times-phone-dark` | `times-phone` (dark) | Times 7.80:1. |
| Reduce Motion | Drawn `#times-phone-light-reduce` | `times-phone` | Follows the finger; returns at once on release. |
| phone 390 | Drawn | `times-phone` | Follows at 60%; axis lock at 10 (build; the page uses 8). The 24 edge stays for the back swipe. |
| large phone 430 | Drawn `#times-phone-light-w430` | `times-phone-w430` | |
| desktop 1280 and 1440 | n/a (phone only) | none | Desktop shows the time on hover (150 ms, M-MSG-29). |

### S-MSG.date-pill

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#datepill-phone-light` | `datepill-phone` | Team thread scrolled to 55% of its height; glass pill "Thursday" floats under the bar (top 128 drawn, `bar + lip + 8`), standing in for the day marker that has passed under the bar. |
| loading | n/a | n/a | |
| empty | n/a | n/a | No messages, no pill. |
| error/failed | n/a | n/a | |
| long text | n/a | n/a | Day labels are short ("Oct 8" at most, 03). |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | One day: the pill still shows while scrolling. |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#datepill-phone-light-xxl` | `datepill-phone-xxl` | |
| dark | Drawn `#datepill-phone-dark` | `datepill-phone` (dark) | |
| Reduce Motion | Drawn `#datepill-phone-light-reduce` | `datepill-phone` | Same 180 in, 250 out opacity (opacity only already). |
| phone 390 | Drawn | `datepill-phone` | Shown while scrolling; out 1 s after scrolling stops. |
| large phone 430 | Drawn `#datepill-phone-light-w430` | `datepill-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#datepill-desk-light` | `datepill-desk`, `datepill-desk-w1280` | Top 76 under the glass bar. |

### S-MSG.jump

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#jump-phone-light` | `jump-phone` | Team thread at the top; the glass jump key with a count badge of 2, right 14, 12 above the composer. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | n/a | n/a | |
| long text | n/a | n/a | |
| lots of items | Not drawn | add | Count keeps counting arrivals while away (today's `unseen`). |
| one item | Not drawn | add | Count 1. No count while nothing new: the key alone. |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#jump-phone-light-xxl` | `jump-phone-xxl` | Badge number scales; the key stays 40 drawn, 44 hit (06). |
| dark | Drawn `#jump-phone-dark` | `jump-phone` (dark) | |
| Reduce Motion | Drawn `#jump-phone-light-reduce` | `jump-phone` | Key appears with a `CH_FADE_MS` 180 ms crossfade; the glide down is instant. |
| phone 390 | Drawn | `jump-phone` | Shows past 0.9 of a screen from the bottom. The still frame holds the key on (page bug 5 fixed). |
| large phone 430 | Drawn `#jump-phone-light-w430` | `jump-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#jump-desk-light` | `jump-desk`, `jump-desk-w1280` | Glide goes through Lenis. |

### S-MSG.toast

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#toast-phone-light` | `toast-phone` | Glass pill "Copied" centred near the top (drawn 62, `env(safe-area-inset-top) + 8`). Auto-fades at 1700 ms. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Pin failed copy (see Not drawn). |
| long text | Not drawn | add | The page's longest toast is "Reminder drafted. It sends only when you tap Send"; wraps to 2 lines inside the edge. |
| lots of items | Not drawn | add | A new toast replaces the old (old fades 120 ms on the page). |
| one item | Drawn | `toast-phone` | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#toast-phone-light-xxl` | `toast-phone-xxl` | |
| dark | Drawn `#toast-phone-dark` | `toast-phone` (dark) | |
| Reduce Motion | Drawn `#toast-phone-light-reduce` | `toast-phone` | Appears and leaves with a `CH_FADE_MS` 180 ms crossfade, no travel. |
| phone 390 | Drawn | `toast-phone` | `role="status"`. |
| large phone 430 | Drawn `#toast-phone-light-w430` | `toast-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#toast-desk-light` | `toast-desk`, `toast-desk-w1280` | Top 18 in the workspace. |

### S-MSG.attach

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#attach-phone-light` | `attach-phone` | + turned to ×; glass menu 240 wide: Photos, File, Poll, each with a 32 icon tile. No Camera, no Announcement (Nick, 31 Oct). |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Today's file errors, restyled. |
| long text | n/a | n/a | Fixed copy. |
| lots of items | n/a | n/a | Always three items. |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#attach-phone-light-xxl` | `attach-phone-xxl` | Items grow past 46. |
| dark | Drawn `#attach-phone-dark` | `attach-phone` (dark) | |
| Reduce Motion | Drawn `#attach-phone-light-reduce` | `attach-phone` | + swaps to ×; menu crossfades `CH_FADE_MS` 180 ms. |
| phone 390 | Drawn | `attach-phone` | Bottom drawn 92 (`composer top + 8`). Photos takes `accept="image/*"`. |
| large phone 430 | Drawn `#attach-phone-light-w430` | `attach-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#attach-desk-light` | `attach-desk`, `attach-desk-w1280` | Left edge set to the + key. |

### S-MSG.file

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#file-phone-light` | `file-phone` | Chip above the field: "PDF" tile, "Lineup · Saturday.pdf", close key. Send key showing. |
| loading | Not drawn | add | Today's upload progress, restyled. |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Today's `files.ts` errors. |
| long text | Not drawn | add | Long file names truncate in the chip. |
| lots of items | Not drawn | add | Today's chips, one row each. |
| one item | Drawn | `file-phone` | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#file-phone-light-xxl` | `file-phone-xxl` | Close key keeps a 44 hit (drawn 26, 06). |
| dark | Drawn `#file-phone-dark` | `file-phone` (dark) | |
| Reduce Motion | Drawn `#file-phone-light-reduce` | `file-phone` | Chip appears with a `CH_FADE_MS` 180 ms crossfade. |
| phone 390 | Drawn | `file-phone` | Once sent: the file bubble shows type and size; video shows size, not length (03 gap 5). The 9.5 type letters become an icon (04 §8). |
| large phone 430 | Drawn `#file-phone-light-w430` | `file-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#file-desk-light` | `file-desk`, `file-desk-w1280` | |

### S-MSG.reply

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#reply-phone-light` | `reply-phone` | The reply chip above the field: reply glyph, "Replying to Eli", close key. Not an arrival. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | n/a | n/a | |
| long text | Not drawn | add | The chip names the person only; once sent, `ReplyQuote` shows the name and first line. |
| lots of items | n/a | n/a | One chip at a time. |
| one item | Drawn | `reply-phone` | Replying to your own: "Replying to yourself". |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#reply-phone-light-xxl` | `reply-phone-xxl` | |
| dark | Drawn `#reply-phone-dark` | `reply-phone` (dark) | |
| Reduce Motion | Drawn `#reply-phone-light-reduce` | `reply-phone` | Chip appears with a `CH_FADE_MS` 180 ms crossfade. |
| phone 390 | Drawn | `reply-phone` | Swipe right on a bubble also opens it (today's). |
| large phone 430 | Drawn `#reply-phone-light-w430` | `reply-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#reply-desk-light` | `reply-desk`, `reply-desk-w1280` | Also from the hover bar's Reply. |

### S-MSG.edit

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#edit-phone-light` | `edit-phone` | Chip "Editing message" with a pencil and close key; field filled with e9 "Send me the card when you get a sec"; send key showing. |
| loading | n/a | n/a | |
| empty | Not drawn | add | Field cleared while editing: no send key. |
| error/failed | Not drawn | add | Today's edit error, restyled. |
| long text | Not drawn | add | Field grows to six lines, then scrolls. |
| lots of items | n/a | n/a | |
| one item | Drawn | `edit-phone` | Once saved: "Edited" after the text. |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#edit-phone-light-xxl` | `edit-phone-xxl` | |
| dark | Drawn `#edit-phone-dark` | `edit-phone` (dark) | |
| Reduce Motion | Drawn `#edit-phone-light-reduce` | `edit-phone` | As `S-MSG.reply`. |
| phone 390 | Drawn | `edit-phone` | Only your own text messages. |
| large phone 430 | Drawn `#edit-phone-light-w430` | `edit-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#edit-desk-light` | `edit-desk`, `edit-desk-w1280` | |

### S-MSG.poll-composer

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#pollnew-phone-light` | `pollnew-phone` | Sheet over the team thread: Cancel, "New poll", Send. Question "Team dinner after the qualifier?", Choice 1 "Wednesday 7 PM", Choice 2 "Thursday 6:30 PM", Choice 3 "Add a choice"; card with "Allow multiple answers" switch and "Closes" "Sunday 8 PM". |
| loading | n/a | n/a | |
| empty | Not drawn | add | Today's `PollSheet` rules for empty fields. |
| error/failed | Not drawn | add | Today's `PollSheet` error lines. |
| long text | Not drawn | add | Fields wrap or scroll as today. |
| lots of items | Not drawn | add | Today's choice limit; the sheet scrolls inside its cap. |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#pollnew-phone-light-xxl` | `pollnew-phone-xxl` | Sheet scrolls inside its cap. |
| dark | Drawn `#pollnew-phone-dark` | `pollnew-phone` (dark) | |
| Reduce Motion | Drawn `#pollnew-phone-light-reduce` | `pollnew-phone` | Sheet fades `CH_FADE_MS` 180 ms; no drag motion. |
| phone 390 | Drawn | `pollnew-phone` | Grabber 36 × 5, top radius 20. |
| large phone 430 | Drawn `#pollnew-phone-light-w430` | `pollnew-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#pollnew-desk-light` | `pollnew-desk`, `pollnew-desk-w1280` | Centred card 400 wide. |

### S-MSG.hold

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#hold-phone-light` | `hold-phone` | e6 (Eli's) lifted over the blurred thread; reaction bar above with six keys (Like, Love, Laugh, Celebrate, Surprised, Thanks); menu below: Reply, Copy. Their message: no Edit, no Delete. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | n/a | n/a | |
| long text | Not drawn | add | A tall bubble moves up so the menu fits; if it can't, it stays below the top safe area (page `openHold`). |
| lots of items | Not drawn | add | Your own message adds Edit and Delete; a poll adds today's poll rows (See votes, Remind, Close poll, Share result, 02 §6.1). |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#hold-phone-light-xxl` | `hold-phone-xxl` | Menu rows grow past 42. |
| dark | Drawn `#hold-phone-dark` | `hold-phone` (dark) | Scrim rgb(0 0 0/.45). |
| Reduce Motion | Drawn `#hold-phone-light-reduce` | `hold-phone` | Appears in place; bar, menu and scrim crossfade `CH_FADE_MS` 180 ms. |
| phone 390 | Drawn | `hold-phone` | Opens at 450 ms; build slop 10 (page 8: see Corrections). Medium impact haptic at 450 ms through `haptic(...)`. (fixed 4 Nov: the haptic is `haptic('press')`, light, ruling 22; medium stays reserved.) |
| large phone 430 | Drawn `#hold-phone-light-w430` | `hold-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#hold-desk-light` | `hold-desk`, `hold-desk-w1280` | Same lift from right-click or the hover bar's More. |

### S-MSG.holdseen

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#holdseen-phone-light` | `holdseen-phone` | t6 (yours, team) held: Reply, Copy, Edit, a rule, the Seen by row with six 20 faces and "8 of 10 · 2 not yet", a rule, Delete. |
| loading | n/a | n/a | |
| empty | Not drawn | add | Nobody has read it: the row reads "0 of 10" with no faces. |
| error/failed | n/a | n/a | |
| long text | n/a | n/a | |
| lots of items | Not drawn | add | Six faces at most; the count carries the rest. |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#holdseen-phone-light-xxl` | `holdseen-phone-xxl` | |
| dark | Drawn `#holdseen-phone-dark` | `holdseen-phone` (dark) | |
| Reduce Motion | Drawn `#holdseen-phone-light-reduce` | `holdseen-phone` | As `S-MSG.hold`. |
| phone 390 | Drawn | `holdseen-phone` | The row opens `S-MSG.seen`. Shown for your own message in a group (page code); coach-only or not is an open line. (fixed 4 Nov: settled by S1, not coach only.) |
| large phone 430 | Drawn `#holdseen-phone-light-w430` | `holdseen-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#holdseen-desk-light` | `holdseen-desk`, `holdseen-desk-w1280` | |

### S-MSG.react

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#react-phone-light` | `react-phone` | Love badge on e6's top outer corner; your own carries the champagne ring (`--a-ring` #8C703A light, #C9AD74 dark) on a 4 px page-colour halo, so it reads 4.10 on paper and on your green bubble alike. Green on a paper bubble, ivory on yours. |
| loading | n/a | n/a | |
| empty | n/a | n/a | No reactions: no badge. |
| error/failed | Not drawn | add | Today's reaction error, restyled. |
| long text | n/a | n/a | |
| lots of items | Not drawn | add | One badge per key, 3 apart; number only above one. |
| one item | Drawn | `react-phone` | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#react-phone-light-xxl` | `react-phone-xxl` | |
| dark | Drawn `#react-phone-dark` | `react-phone` (dark) | |
| Reduce Motion | Drawn `#react-phone-light-reduce` | `react-phone` | Badge appears with a `CH_FADE_MS` 180 ms crossfade. Count changes at once. |
| phone 390 | Drawn | `react-phone` | Tap a badge: today's who-reacted card (Not drawn). |
| large phone 430 | Drawn `#react-phone-light-w430` | `react-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#react-desk-light` | `react-desk`, `react-desk-w1280` | Badge text 11.5 on desktop. |

### S-MSG.seen

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#seen-phone-light` | `seen-phone` | Sheet "Seen by", "5 of 10 · " and t6's text cut at 46 characters. Seen 5 with times (Maya 7:06 AM, Owen 7:08 AM, Eli 7:09 AM, Luca 7:12 AM, Sam 7:21 AM); Not seen yet 5, each "Hasn’t opened this chat". |
| loading | n/a | n/a | Opens on loaded receipts. |
| empty | Not drawn | add | Nobody read it: only the Not seen yet group. |
| error/failed | Not drawn | add | Today's `seen-by.tsx` handling. |
| long text | Not drawn | add | Subtitle cuts the message at 46 characters with an ellipsis (page). |
| lots of items | Not drawn | add | Sheet scrolls inside its cap. |
| one item | Not drawn | add | Everyone read it: only the Seen group. |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#seen-phone-light-xxl` | `seen-phone-xxl` | Sheet header buttons keep a 44 hit (06). |
| dark | Drawn `#seen-phone-dark` | `seen-phone` (dark) | |
| Reduce Motion | Drawn `#seen-phone-light-reduce` | `seen-phone` | Sheet fades `CH_FADE_MS` 180 ms. |
| phone 390 | Drawn | `seen-phone` | "Last opened …" where known (03). |
| large phone 430 | Drawn `#seen-phone-light-w430` | `seen-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#seen-desk-light` | `seen-desk`, `seen-desk-w1280` | The page draws a centred card 400 wide; 02-PLAN §6.3 keeps today's desktop popover (`seen-by.tsx` 280). Open line. (fixed 4 Nov: settled by S8, the page's centred card from today's popover body.) |

### S-MSG.poll

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#poll-phone-light` | `poll-phone` | Team poll centred: "Poll · Choose one", "Practice round at Lonnie Poole: which day?", Tue 7:30 AM 4 with "Most votes", Wed 3:15 PM 2, Thu 7:30 AM 1, up to three 18 voter faces each, footer "7 votes · Closes Sunday 8 PM" and "See votes". |
| loading | n/a | n/a | |
| empty | Not drawn | add | No votes: counts 0, no chip, footer "0 votes". |
| error/failed | Not drawn | add | Today's lines: "Voting has ended.", "This poll was deleted.", "Your vote wasn’t saved. Try again." (03). |
| long text | Not drawn | add | Question and choices wrap. |
| lots of items | Not drawn | add | Today's choice count; faces cap at three. |
| one item | Not drawn | add | "1 vote". A tie: no chip. |
| offline or stale | Not drawn | add | Closed: "Closed" in the footer. |
| XXL Text Size | Drawn `#poll-phone-light-xxl` | `poll-phone-xxl` | |
| dark | Drawn `#poll-phone-dark` | `poll-phone` (dark) | |
| Reduce Motion | Drawn `#poll-phone-light-reduce` | `poll-phone` | Check appears; bars set at once. |
| phone 390 | Drawn | `poll-phone` | Multi polls: "Choose any". |
| large phone 430 | Drawn `#poll-phone-light-w430` | `poll-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#poll-desk-light` | `poll-desk`, `poll-desk-w1280` | No hover bar on a poll. |

### S-MSG.votes

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#votes-phone-light` | `votes-phone` | Sheet "Votes" with the question. Groups: Tue 7:30 AM "4 · 57%", Wed 3:15 PM "2 · 29%", Thu 7:30 AM "1 · 14%", a bar under each heading; then "Hasn’t voted" 2 (Cole, Ryan) and "Draft a reminder". |
| loading | n/a | n/a | |
| empty | Not drawn | add | A choice with no votes: "No votes yet" (page). |
| error/failed | Not drawn | add | As `S-MSG.poll`. |
| long text | Not drawn | add | Choice headings wrap. |
| lots of items | Not drawn | add | Sheet scrolls inside its cap. |
| one item | Not drawn | add | Everyone voted: no "Hasn’t voted" group. |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#votes-phone-light-xxl` | `votes-phone-xxl` | |
| dark | Drawn `#votes-phone-dark` | `votes-phone` (dark) | |
| Reduce Motion | Drawn `#votes-phone-light-reduce` | `votes-phone` | Sheet fades `CH_FADE_MS` 180 ms; drag closes at once. |
| phone 390 | Drawn | `votes-phone` | "Draft a reminder" fills the field and never sends. "Hasn’t voted" leaves coaches out (page). |
| large phone 430 | Drawn `#votes-phone-light-w430` | `votes-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#votes-desk-light` | `votes-desk`, `votes-desk-w1280` | Centred card 400 wide. |

### S-MSG.details

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#details-phone-light` | `details-phone` | Bar "Details" with Back. 84 face, "Eli Brandt", "Junior · Demo University Golf". Quick actions Mute, Search, Files, Profile. Cards: Class status ("No classes today. Next: Monday 9:05 AM, Statistics"), Photos and files (six tiles, "See all", two PDF rows). |
| loading | Not drawn | add | Opens on the conversation in hand; files load as today. |
| empty | Not drawn | add | No files: today's empty files line in the card. |
| error/failed | Not drawn | add (today's `?state=files-failed`) | Files card notice, restyled. |
| long text | Not drawn | add | Long name wraps under the face (see `long` route for the name). |
| lots of items | Not drawn | add | Six tiles, then "See all". |
| one item | Not drawn | add | One tile or row. |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#details-phone-light-xxl` | `details-phone-xxl` | Quick action labels wrap, never clip. |
| dark | Drawn `#details-phone-dark` | `details-phone` (dark) | |
| Reduce Motion | Drawn `#details-phone-light-reduce` | `details-phone` | Push becomes a `CH_FADE_MS` 180 ms crossfade. |
| phone 390 | Drawn | `details-phone` | Class status only for a coach with the flag on; absent otherwise (03). Muted: line adds " · Muted", action reads "Muted". |
| large phone 430 | Drawn `#details-phone-light-w430` | `details-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#details-desk-light` | `details-desk`, `details-desk-w1280` | 300 column beside the thread, 64 face, close key; the thread stays on its latest message. |

### S-MSG.groupdetails

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#groupdetails-phone-light` | `groupdetails-phone` | "Demo University Golf", "Team channel · 11 members". Quick actions Mute, Search, Files, Add. Members 11: first six with Coach chips on Nick (as "You") and Dana, then "Show all 11". Photos and files. |
| loading | Not drawn | add | As `S-MSG.details`. |
| empty | n/a | n/a | A group always has members. |
| error/failed | Not drawn | add (today's `?state=add-failed`) | Add member failure, restyled. |
| long text | Not drawn | add | Long member names wrap. |
| lots of items | Drawn (11 members) | `groupdetails-phone` | Six shown, then the button. |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#groupdetails-phone-light-xxl` | `groupdetails-phone-xxl` | |
| dark | Drawn `#groupdetails-phone-dark` | `groupdetails-phone` (dark) | Coach chip 6.70:1. |
| Reduce Motion | Drawn `#groupdetails-phone-light-reduce` | `groupdetails-phone` | As `S-MSG.details`. |
| phone 390 | Drawn | `groupdetails-phone` | Fourth action: Add for the group creator, Leave for others (02 §7.1). No captain chip. |
| large phone 430 | Drawn `#groupdetails-phone-light-w430` | `groupdetails-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#groupdetails-desk-light` | `groupdetails-desk`, `groupdetails-desk-w1280` | In the 300 column. |

### S-MSG.mute

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Drawn `#mute-phone-light` | `mute-phone` | Team details with the glass menu under the Mute action. Page copy: For 8 hours, For a week, Until I turn it on. Build copy: today's Mute 8 hours, Mute a week, Until I turn it on (04 §8). |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Today's `message-mute.ts` error, restyled. |
| long text | n/a | n/a | Fixed copy. |
| lots of items | n/a | n/a | Three items. |
| one item | Not drawn | add | Already muted: the action unmutes at once (toast "Unmuted" on the page; today's behaviour). |
| offline or stale | n/a | n/a | |
| XXL Text Size | Drawn `#mute-phone-light-xxl` | `mute-phone-xxl` | |
| dark | Drawn `#mute-phone-dark` | `mute-phone` (dark) | |
| Reduce Motion | Drawn `#mute-phone-light-reduce` | `mute-phone` | Menu crossfades `CH_FADE_MS` 180 ms. |
| phone 390 | Drawn | `mute-phone` | After a pick the row shows the mute glyph (11b §3.6). |
| large phone 430 | Drawn `#mute-phone-light-w430` | `mute-phone-w430` | |
| desktop 1280 and 1440 | Drawn `#mute-desk-light` | `mute-desk`, `mute-desk-w1280` | From the column's Mute action. |

## Where each ID continues

06 has one section per ID with its measured redline. 08 has the per-ID criteria. 07 rows by M-ID:

| ID | 07 motion | Notes |
|---|---|---|
| `S-MSG` | M-MSG-01, 02 (push from a row or pin), 26, 27, 30, 31 | Push: page behind moves 24%, `brightness(0.9)` |
| `S-MSG.unread` | M-MSG-03 | |
| `S-MSG.row-menu` | M-MSG-26, 27 | |
| `S-MSG.new` | M-MSG-22, 32 | |
| `S-MSG.empty` | none (still) | M-MSG-22 starts from it |
| `S-MSG.fresh` | M-MSG-23 | |
| `S-MSG.thread` | M-MSG-01, 02, 04, 07, 09, 29 | Cases 1, 2, 7, 11 |
| `S-MSG.composer` | M-MSG-06, 07, 18, 19, 32 | |
| `S-MSG.team` | M-MSG-04, 12, 15, 17 | |
| `S-MSG.typing` | M-MSG-08, 30 | Case 2 |
| `S-MSG.times` | M-MSG-05 | |
| `S-MSG.date-pill` | M-MSG-04 | |
| `S-MSG.jump` | M-MSG-24, 33 | Case 9 |
| `S-MSG.toast` | M-MSG-25 | |
| `S-MSG.attach` | M-MSG-18 | Case 6 |
| `S-MSG.file` | M-MSG-19 | |
| `S-MSG.reply` | M-MSG-28 | The arrival out of the typing bubble is M-MSG-08 |
| `S-MSG.edit` | M-MSG-28 (same chip rise) | |
| `S-MSG.poll-composer` | M-MSG-16 | |
| `S-MSG.hold` | M-MSG-10, 11, 14 | Cases 3, 4 |
| `S-MSG.holdseen` | M-MSG-10, 11, 12 | |
| `S-MSG.react` | M-MSG-13, 14 | |
| `S-MSG.seen` | M-MSG-16, 17 | |
| `S-MSG.poll` | M-MSG-15 | Case 8 |
| `S-MSG.votes` | M-MSG-16 | Case 5 |
| `S-MSG.details` | M-MSG-20 | Case 10 (desktop) |
| `S-MSG.groupdetails` | M-MSG-20 | |
| `S-MSG.mute` | M-MSG-21 | |

## Page bugs fixed in v12

Each is fixed on the page. They stay listed because the build can make the same mistake.

1. Desktop conversation bar: the page's `.top` rule collided with `header.glass.top` (Search and Details beside the name, bar 84 tall, New message title 1.1:1). Build: scope bar styles.
2. Pin face initials inherited the 13 label style (2.75:1). Now 600 at 0.38 × face, #FDFCF8.
3. The third pin's bubblet overflowed the card. Now right-anchored on the last pin.
4. The local copy rendered in quirks mode with no `[hidden]` reset, so hidden items showed.
5. The jump still frame never showed (a layout pass and `fonts.ready` re-pinned the thread to the bottom).
6. The date pill frame doubled the day marker. Now mid-thread.

## Corrections to 04 and the earlier acceptance draft

Where these files say otherwise, the page and this file win.

- Phone has no large title. The green bar with "Messages ⌄" is on top (SHARED-1). 04 §5 `inbox` says "Large title": wrong on the phone, right on the desktop rail (26/600). The same applies to 01-BRIEF §1 and 02-PLAN §3.1 "Large title 'Messages' and its context line under the bar".
- Hold slop: the page cancels past 8 px; 04 §6 already rules the build keeps today's 10 px. Not an error.
- `reply` is the reply chip above the field. 04 §5 calls it "Eli's reply just landed out of the typing bubble"; that arrival is M-MSG-08.
- The row menu and the poll composer are drawn (`rowmenu`, `pinlimit`, `pollnew`), not "not drawn".
- Pin sync is planned: PR 11h, defaults D1 to D9 in PIN-SYNC.md, checked on a scratch database. Not "on the device until Nick decides" (01-BRIEF Rules, Data).
- 34 routes, not 22 (01-BRIEF Done when, 02-PLAN §0 and §2.3).
- Reduce Motion typing dots: static at full opacity (v12), not the 0.45 to 0.85 pulse in 04 §7. The skeleton pulse is off.
- Design lead, 3 Nov: the Reduce Motion build crossfade is `CH_FADE_MS` 180 ms, opacity only, linear. 04 §7, 02-PLAN §5.2 and the page say 120 ms; 120 is the page's drawing.
- Design lead, 3 Nov: on push the page behind moves 24% and dims to `brightness(0.9)`. 04 §7 and the page say −30% and a 0.1 black dim.
- Design lead, 3 Nov: contrast is a 4.9:1 target with a 4.5:1 floor, 3:1 for marks. 04 §2 and 01-BRIEF say 4.5:1. Every text pair on the page measures at least 4.9 (lowest 5.58, your bubble text in dark); 06 holds each pair to the target.
- The row menu has five items: Open conversation, Pin, Mark as unread, Mute…, Delete conversation (page `rowMenu`).
- `unread` on the phone shows two rows in the card ("Unread 2": Qualifier group, Sam Carter); the Team channel stays in the Pinned card. 04 §5 says three rows, which is the desktop rail count.
- `new` shows an empty To field with a caret, not a token. The token is motion (M-MSG-22). 04 §5 says "To field with a token".
- Phone context line is "3 unread · Demo University Golf", not "3 unread · Team channel active 7:31 AM" (01-BRIEF §1).

## Settled as defaults Nick can flip

Nick, 31 Oct: "Handle any other questions they have". Each of these is settled the way that keeps today's behaviour or follows the approved page, and each can be flipped in one line.

| Question | Default | Flip |
|---|---|---|
| Seen by in the hold menu and pill: coach only? | No. Today's rule: anyone sees Seen by on their own message in a group (02-PLAN §6.1, 03). The page caption "Coaches get Seen by" was wrong and is fixed on the page. Seen by shows read times only, no figures (SHARED-11 holds) | Coaches only |
| Failed bubble copy | Today's words: the "Not sent" line with its retry (02-PLAN §5.3, 03), drawn in the page's failed style | The page's "Not delivered · Try again" |
| Members button | Today's "See all" (03), in the page's style | The page's "Show all 11" |
| Desktop hover bar keys | The page: Like, Love, Laugh, Reply, More (measured 144 wide). 02-PLAN §6.1 and 04 §6 leave out Laugh; the page wins | Like, Love, Reply, More |
| Toasts | One toast, the page's (`S-MSG.toast`), restyling today's toast. 11e ships "Copied" and "Deleted for everyone"; 11f ships "Muted for 8 hours" style lines and "Unmuted" using today's mute labels; 11h ships the two pin lines from PIN-SYNC §5 | none |
| Starters for a player | A player sees three starters written for a player: "Can we find time to talk this week?", "Here's my round from today", "Quick question about practice". They fill the field and never send, like the coach's | No starters for players |
| Several people typing in a group | In the thread: one typing bubble per typer, each with its name inside. In the inbox row and pin preview: two give "Maya and Owen are typing", three or more "Several people are typing" | Name the latest typer only |
| Seen by on desktop | The page's centred card (400 wide, scale in), built by restyling today's popover body (`SeenByBody`); the popover anchor goes | Keep today's popover anchored to the pill |
| Per-conversation URL | None. View state on `/golf/dashboard/messages`, as today | Add `?c=<id>` deep links (a separate PR) (fixed 4 Nov: today's app already reads `?conversation=<id>`, the push link; the flip is to write that same param when a conversation opens) |
| Profile quick action in details | Shown to a coach viewing a player only (SETTLED-4NOV.md 20) | None: showing it to a player would link to a teammate's stats (SHARED-11) |
| Pin error copy | PIN-SYNC §5 only: "You already have 3 pinned." and "You're not in this conversation anymore." No other pin toast | none |

## Page changes since v12

The design page is v15 (same link). v13 to v15 changed what 05 points at; every row above already reads the new frames. In short: the 430 frames draw a 20 edge; typing dots, the champagne rings and the switch off track all pass 3:1; the jump badge and group face initials are 12; a group typing bubble carries the typer's name inside; Delete conversation is red; times stay one line at XXL; sheet close keys never squeeze; the CH-7301 annotation is gone; at 430 the hidden time column no longer peeks (v15). The full list with numbers is `SETTLED-4NOV.md` in this folder; 06, 07 and 08 cite it by number.

## Open lines

None. Every question above is settled as a default Nick can flip.


## Completeness pass, 4 Nov 2026

Added by the completeness pass (AGENT_BRIEF, 4 Nov). Additive: nothing above changes except the rows marked `(fixed 4 Nov: ...)`, listed at the end of this section. None of the IDs below is drawn on the design page. Each one either keeps today's surface, restyled with the tokens this lane already uses (06 gives the element rules), or is a state the page never showed. 06, 07 and 08 carry the matching rows under the same heading; the 08 criteria are `MSG-CP-<n>`. The settled calls are not reopened: no Camera row, the + menu is Photos, File and Poll, no Announcement row in the + menu, typing is tracked, the three springs over the 0.1 bounce cap stay, pin sync is 11h held, first sync copies device pins up to the cap, no pin reorder UI, new pins go at the end.

### The lane flag (missing until now)

No lane file named a flag for Messages, and 02-PLAN restyles in place and deletes old rules, so with nothing switched on the app would not render as main (SHARED-8). This pass names one. It needs a line in BUILD_BRIEF and START_HERE (lane report, "Needs a shared-file change").

- `golf_messages_redesign_v1` in `config/feature-flags.yml`, the shape of `golf_clubhouse_ui` (`:862-889`), default off in every environment, `expires_at` null, `cleanup_plan` written as a removal plan. Read on the server with `isFlagEnabled` (`src/lib/flags/is-enabled.ts:78`) in `src/clubhouse/routes/messages.tsx` (21-44) and passed to `Messages` as `redesign: boolean`. (fixed 4 Nov wiring: 22-49 on 03d9087; carried on `ChMessagesData` and `ChMessagesApi`, 06 Wiring W8.)
- Off: today's Messages exactly, pixel for pixel and string for string. On: everything in this lane. `golf_clubhouse_ui` still gates Clubhouse as today, so v2 shows only where both are on.
- How the build keeps "off" identical: every new rule sits under `[data-ch-ms-v2]`, an attribute set on the Messages root only when the flag is on. New components and new listeners (the row typing listener, the row mute read, the hold lift, the poll sheet, the details push, `badges.refetch()` after read) mount or run only when it is on. The typing expiry is 5s with the flag on and today's 3s with it off.
- The delete steps in 02-PLAN (§3.5, §4.5, §5.4, §6.5 and the gradient token in 11c) wait for a cleanup PR that lands after the flag is on in production (02-PLAN, completeness pass).
- PR 11h reads the same flag: off, device pins only and no probe of the pins table.
- The design fixture (`?state=design&view=<route>`) renders v2 whatever the flag says, as the preview does for every lane.

### Inventory (added)

| ID | Kind | How you get there | Design link | App route | Roles | PR |
|---|---|---|---|---|---|---|
| `S-MSG.pending` | inline state (bubble) | Send; the bubble waits for the server, or the send fails | Not drawn | `?state=design&view=pending` (add, 11a fixture); real `Bubble` pending and failed (MessagesView 597-617, 3237) | both | 11c look, 11d behaviour |
| `S-MSG.offline` | banner and composer state | The device loses its connection with Messages open, or opens Messages offline | Not drawn | `view=offline` (add); real shell `OfflineBanner.tsx`, `useAction` offline refusal CH-1903 | both | 11d |
| `S-MSG.upload` | inline state (chip and bubble) | Pick a photo or file in + and send it | Not drawn | `view=upload` (add); real `AttachChips` (1482), the pending attachment send in sessionStorage | both | 11d |
| `S-MSG.edited` | inline state (bubble) | The sender edits a message (the edit chip, M-MSG-28) | Not drawn | `view=edited` (add); real `Bubble` edited | both | 11c |
| `S-MSG.deleted` | inline state (bubble) | The sender deletes for everyone, here or on another device | Not drawn | `view=deleted` (add); real `Bubble` deleted | both | 11c |
| `S-MSG.divider` | inline state (thread) | Open a conversation that has unread messages | Not drawn | `view=divider` (add) | both | 11c |
| `S-MSG.older` | inline state (thread) | Scroll to the top of a long thread | Not drawn | `view=older` (add); real paging and end anchor `use-thread-anchor.ts` | both | 11c |
| `S-MSG.search` | sub page (phone), rail state (desktop), in-thread bar | Inbox search field; Search quick action in details or the desktop bar's Search key | Not drawn | `view=search`, `view=search-empty` (add); real today's search and `openHit` (Messages.tsx 901-904) | both | 11b inbox, 11f in conversation |
| `S-MSG.who-reacted` | sheet (phone), popover (desktop) | Tap a reaction badge | Not drawn | `view=who-reacted` (add); real today's who-reacted list (messages.css 766-920) | both | 11e |
| `S-MSG.confirm` | modal | Delete message, Leave group, Delete conversation, Remove member, row Mute on desktop | Not drawn | today's modals CH-7501 to CH-7504, CH-7607 (MessagesView 1844-2063) | as today | 11e (delete), 11f (the rest) |
| `S-MSG.add` | sheet | Group details, Add | Not drawn | today's Add to group; `?state=add-failed` | as today | 11f |
| `S-MSG.removed` | inline state (thread and inbox) | You leave a group, or a coach removes you, with the thread open or later | Not drawn | `view=removed` (add) | both | 11c, 11f |
| `S-MSG.deeplink` | route state | Push tap, bell row or link with `?conversation=`, `?player=`, `?user=`, `?compose=` | Not drawn | real `/golf/dashboard/messages?conversation=<id>` (`golf-message-fanout.ts:135`; tap path `push-registration.ts:296`) | both | 11c phone, 11b desktop |
| `S-MSG.narrow` | layout state | Desktop window 720 to 1099 wide, under 720, or resized across either line | Not drawn | any route at those widths | both | 11b, 11f |
| `S-MSG.announcements` | inbox row and list | Top of the inbox: today's folded "Announcements n" row | Not drawn | today's `announcements.tsx` 22-109; `?state=announcement` | both; the coach row shows acknowledgement counts | 11b |
| `S-MSG.announcement` | pushed page (phone), pane (desktop) | Tap an announcement | Not drawn | today's detail `announcements.tsx` 121-240; `?state=ann-failed` | both; Acknowledge and tasks for a player, "5 of 6 acknowledged" for the coach | 11b |
| `S-MSG.new-announcement` | sheet | Coach: today's New announcement entry (never the + menu) | Not drawn | today's | coach only; absent from the player DOM | 11f |
| `S-MSG.prefill` | inline state (composer) | Arrive with `?prefill=<key>` from Ask, a Day card, Quick chat or Read | Not drawn | `?prefill=<key>` (`prefill.ts:18,56,66-70`) | coach (every sender of a prefill is a coach surface) | 11d |
| `S-MSG.noteam` | screen state | No active team (`MessagesNoTeam`, routes/messages.tsx) | Not drawn | today's | both | 11b |

### S-MSG.pending

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `pending-phone` (app only, add) | Your bubble at full opacity in its sent place from frame one (M-MSG-07a). The receipt slot stays empty for the first 1000ms, so a quick send never flashes a label; after that it reads "Sending…" 13/400 `--ch-text-tertiary`. |
| loading | n/a | n/a | The pending bubble is itself the waiting state. |
| empty | n/a | n/a | An empty field can't send (M-MSG-06b). |
| error/failed | Drawn as `failed` | `failed-phone` | Today's "Not sent" line with its retry, in the page's failed pill (S2). Retry reuses the client id (a 23505 on retry counts as sent). On success the bubble keeps its place; if the server's time puts it below later messages, it glides there on `smooth` (07 CP row). |
| long text | Not drawn | add | A long pending message wraps like any bubble; the label never truncates the bubble. |
| lots of items | Not drawn | add | Several pending at once: each has its own label; they keep send order. Failed ones stay where they were sent; later sends land below them. |
| one item | Not drawn | add | As default. |
| offline or stale | Not drawn | see `S-MSG.offline` | Sent offline: fails at once, "Not sent" with retry. |
| XXL Text Size | Not drawn | `pending-phone-xxl` (add) | The label and the pill grow; the pill wraps to two lines before it clips. |
| dark | Not drawn | `pending-phone` (dark) | Tertiary #ADA697 on #0E120F, 7.80. |
| Reduce Motion | Not drawn | add | The bubble appears with the RM fade; the label swap is a 180ms crossfade. |
| phone 390 | Not drawn | add | Hold on a failed bubble: Retry, Copy, Delete. Delete here removes it from this device only and needs no confirm (it never reached anyone). |
| large phone 430 | Not drawn | add | 20 edge. |
| desktop 1280 and 1440 | Not drawn | add | Same label and pill; the hover bar on a failed bubble shows Retry in place of Reply. |

### S-MSG.offline

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `offline-phone` (add) | Today's shell `OfflineBanner` shows under the green bar; the bar itself never moves (SHARED-1). The inbox and the open thread keep what is cached (`helm.golf.cache.v1:`). The composer stays usable, so a reply can be written. |
| loading | Not drawn | add | Opened offline with nothing cached: today's skeleton, then today's offline empty copy; no endless pulse (the skeleton stops after one 1200ms cycle and holds still). |
| empty | Not drawn | add | As loading. |
| error/failed | Not drawn | add | Each action that needs the server shows today's CH-1903 refusal: send (bubble fails, "Not sent"), vote (rolls back), pin, mute, leave, delete. |
| long text | n/a | n/a | |
| lots of items | Not drawn | add | Several sends offline: each fails on its own; nothing sends by itself on reconnect (today's rule; flip in Defaults below). |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | Back online: the banner goes, conversations and the open thread refetch, missed messages land in place at frame one with one make-room glide on `reveal` (07 CP row), the badge refetches. A failed bubble keeps its retry. |
| XXL Text Size | Not drawn | add | Banner text grows and wraps; the thread top inset grows with it. |
| dark | Not drawn | add | Today's banner tokens. |
| Reduce Motion | Not drawn | add | Banner in and out is the RM fade. |
| phone 390 | Not drawn | add | Pull to refresh on the inbox while offline: today's spring back, no error toast beyond the banner. |
| large phone 430 | Not drawn | add | 20 edge. |
| desktop 1280 and 1440 | Not drawn | add | Same rules; the banner spans the canvas, not the rail alone. |

### S-MSG.upload

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `upload-phone` (add) | A picked photo shows as a chip in the composer (S-MSG.file). On Send the bubble rises at once with the local preview (object URL) at its final size; a 32 glass circle with a 20 spinner sits at its centre until the upload and the send both finish. A file bubble shows its row with the spinner in the icon slot. Receipt slot: "Sending…" after 1000ms as `S-MSG.pending`. No percentage: today's upload gives no progress events, so the spinner is indeterminate. (fixed 4 Nov wiring: progress events exist, the `onProgress` option of `sendMessageWithAttachments` (`use-message-attachments.ts:78`); the spinner stays indeterminate as drawn and reads none.) |
| loading | Not drawn | add | As default. |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Upload or send fails: today's compensating delete runs; the bubble keeps its preview with today's "Not sent" pill; retry re-uploads from the file still held in memory. After a reload the file is gone: today's "choose again" (`pending-attachment-send`), and the pill's action opens the picker. |
| long text | Not drawn | add | A long file name truncates in the middle, keeping the extension. |
| lots of items | Not drawn | add | Several files send as separate bubbles 8px apart (M-MSG-07a); each has its own spinner and can fail alone. |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | Send offline: fails before upload; the chip stays in the composer with its file, not lost. |
| XXL Text Size | Not drawn | add | The spinner circle stays 32; the file row grows. |
| dark | Not drawn | add | Glass circle `--ch-glass-strong` #191E1A, spinner `--ch-accent` #7CC79B (8.45, a mark over 3:1). |
| Reduce Motion | Not drawn | add | The spinner ring is held still at opacity 1, no rotation (M-MSG-CP-04). |
| phone 390 | Not drawn | add | Too large or a type today refuses: no chip is added and today's toast copy shows (checked against source, ruling 19). |
| large phone 430 | Not drawn | add | 20 edge. |
| desktop 1280 and 1440 | Not drawn | add | Drag and drop onto the thread keeps today's behaviour, if any, and adds none. |

Opening an attachment: the app re-signs a URL older than 50 minutes on tap (signed URLs live 3600s, bug M4), and a failed signing shows "Couldn't open this file. Try again." in the one toast style.

### S-MSG.edited

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `edited-phone` (add) | Today's edited mark, restyled: "Edited" 13/400 in the bubble's own ink at full strength, inside the bubble after the text on the last line (wraps under it when the line is full). Never dimmed: the lowest pair is 5.58 (ivory on dark sent green). |
| loading | n/a | n/a | |
| empty | n/a | n/a | Editing to empty is refused (Send dim, M-MSG-06b). |
| error/failed | Not drawn | add | Edit fails: the bubble puts back the old text with the M-MSG-28 chip still open and the field holding the new text; today's toast. |
| long text | Not drawn | add | The bubble resizes on `smooth` from its old size; the thread below glides additively. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | CH-1903; the edit chip stays open. |
| XXL Text Size | Not drawn | add | Mark scales with the text. |
| dark | Not drawn | add | Theirs #D0C9B8 on #232925 (8.99); yours #F4EEDD on #1F6B45 (5.58). |
| Reduce Motion | Not drawn | add | The text swap is a 180ms crossfade; the size change is immediate. |
| phone 390 | Not drawn | add | A realtime edit from the other side swaps in place, same rules, without moving the reader's scroll. |
| large phone 430 | Not drawn | add | 20 edge. |
| desktop 1280 and 1440 | Not drawn | add | v2 uses the edit chip on desktop too; today's desktop Edit modal (MessagesView 2249) is not mounted with the flag on. |

### S-MSG.deleted

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `deleted-phone` (add) | Today's deleted placeholder copy, restyled: same side as before, fill `--ch-bubble-theirs-bg` on both sides, text 15/400 `--ch-text-secondary` (9.77 light, 8.99 dark). No reactions, no receipt, no hold menu, no hover bar. (fixed 4 Nov wiring: today's data never carries a deleted message into the thread. The read skips them (`.eq('is_deleted', false)`, `use-golf-messages.ts:763, 772`), a realtime UPDATE with `is_deleted` removes the row (`applyRealtimeMessageUpdate`, 284-287) and the sender's own delete removes it at once (`removeMessage`, 1273-1276). So a deleted message closes in place on every screen (M-MSG-27, today's B7 at MessagesView 2169), and this placeholder style is used only by the reply quote whose parent was deleted ("Message deleted", MessagesView 1439) and by the preview fixture. Showing a placeholder in the thread would need the read changed in the protected hook: not built.) |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | Delete fails: the bubble comes back from the M-MSG-27 fade on `smooth`; today's toast. |
| long text | n/a | n/a | The placeholder is one line. |
| lots of items | Not drawn | add | Runs of placeholders keep their tails and grouping. |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | CH-1903; nothing changes. |
| XXL Text Size | Not drawn | add | Grows. |
| dark | Not drawn | add | As default. |
| Reduce Motion | Not drawn | add | As M-MSG-27 under RM. |
| phone 390 | Not drawn | add | Deleted while the other person holds it: their lift closes as M-MSG-11 and the bubble becomes the placeholder. Deleted while its reply chip is open: the chip's quote reads the placeholder copy; the reply still sends. |
| large phone 430 | Not drawn | add | 20 edge. |
| desktop 1280 and 1440 | Not drawn | add | Same. |

### S-MSG.divider

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `divider-phone` (add) | Today's unread divider and copy ("New"), restyled in the day pill's box (06 CP), label `--ch-accent` 13/600 on the page (7.21 light, 9.44 dark), with a 1px `--ch-accent` line either side (a mark, over 3:1). It sits above the first unread message. The thread opens with the divider 120pt below the bar, not at the bottom, when more than one screen is unread; otherwise at the bottom as today. |
| loading | n/a | n/a | |
| empty | n/a | n/a | No unread, no divider. |
| error/failed | n/a | n/a | |
| long text | n/a | n/a | |
| lots of items | Not drawn | add | Over one screen unread: as default; the jump key shows at once. |
| one item | Not drawn | add | One unread: the divider sits above it at the bottom. |
| offline or stale | n/a | n/a | |
| XXL Text Size | Not drawn | add | Pill grows. |
| dark | Not drawn | add | As default. |
| Reduce Motion | Not drawn | add | Fade out under RM. |
| phone 390 | Not drawn | add | It stays while the thread is open and goes when the reader leaves and comes back; your own send fades it out over 180ms. New messages that arrive while the thread is open add no divider. |
| large phone 430 | Not drawn | add | 20 edge. |
| desktop 1280 and 1440 | Not drawn | add | Same; centred in the 760 column. |

### S-MSG.older

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `older-phone` (add) | Today's paging and end anchor (`use-thread-anchor.ts`). Older messages load when the reader comes within one screen of the top. They are added above with the scroll anchored, so the message under the reader's eye does not move by a pixel and nothing animates. (fixed 4 Nov wiring: today has no paging. The thread reads the newest 200 messages once (`use-golf-messages.ts:739-775`, `.limit(200)`) and `use-thread-anchor.ts` only keeps the end anchor. Build call: no older load in this lane. Under 200 loaded, the top of the thread is the start of the conversation (the empty row below); at 200, the top shows the earliest loaded message's day pill and nothing else. The loading row, the failed pill and the offline row below are not built. Flip in one line, a product call in the lane report: a `loadOlder()` in the hook as a third additive commit.) |
| loading | Not drawn | add | One skeleton bubble row at the top (the M-MSG-31 pulse); the jump key and date pill keep working. (fixed 4 Nov wiring: not built, see default) |
| empty | Not drawn | add | Start of the conversation: today's start marker, restyled as a day pill. |
| error/failed | Not drawn | add | A pill at the top, "Couldn't load earlier messages", with Try again (44 tall); a tap retries. (fixed 4 Nov wiring: not built, see default) |
| long text | n/a | n/a | |
| lots of items | Not drawn | add | Thousands of messages: rows off screen stay mounted only within today's window; the jump key glides to the latest (M-MSG-24c) and, if the latest page isn't mounted, swaps to it at the bottom in one frame with no glide. |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | No load offline; the top shows the error pill. (fixed 4 Nov wiring: not built, see default) |
| XXL Text Size | Not drawn | add | The anchor still holds. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | Same (no motion). |
| phone 390 | Not drawn | add | Scroll restore: back to the inbox and into the same thread in the session puts the reader where they left it, unless new messages arrived while they were away, which opens at the divider. Opening from a push opens at the latest. |
| large phone 430 | Not drawn | add | |
| desktop 1280 and 1440 | Not drawn | add | Lenis stays (02-PLAN §1); anchoring works with the Lenis scroll, not against it. Switching conversations in the rail restores each one's place in the session. |

### S-MSG.search

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `search-phone` (add) | Inbox: the search field (06 `.srow`) filters names at once and searches messages after today's debounce; hits show as today's rows, restyled as inbox rows with the match in 600. In a conversation: today's in-conversation search, the hit ring on the bubble (kept, 618). Hits only from conversations the viewer can see: a hidden conversation's hits are dropped (fixes bug M1). |
| loading | Not drawn | add | Message results: one skeleton row under the name matches. |
| empty | Not drawn | `search-empty-phone` (add) | A card "No results" 17/600 with "Try another name or word." 15/400 secondary under it, centred in the list area. Name matches with no message matches show the names alone. |
| error/failed | Not drawn | add | Today's toast; the name matches stay. |
| long text | Not drawn | add | Long query: the field scrolls its text; snippets truncate around the match. |
| lots of items | Not drawn | add | Today's result cap; no infinite list. |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | Names still filter from the cache; message search shows the offline line. |
| XXL Text Size | Not drawn | add | Rows grow. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | Results swap with the RM fade. |
| phone 390 | Not drawn | add | Esc or Cancel clears and leaves search; the inbox scroll comes back where it was. A hit opens the thread at that message with the hit ring. |
| large phone 430 | Not drawn | add | 20 edge. |
| desktop 1280 and 1440 | Not drawn | add | The rail search; the bar's Search key opens in-conversation search; Esc closes it and returns focus to the key. The browser's own find is left alone. |

### S-MSG.who-reacted

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `who-reacted-phone` (add) | Today's list, in the votes sheet's box (S-MSG.votes) on phone and today's popover body on desktop: face 32, name, the reaction. Your own row first, "You". |
| loading | n/a | n/a | In hand from the message. |
| empty | n/a | n/a | The last reaction removed while open: the sheet closes as M-MSG-16c. |
| error/failed | n/a | n/a | |
| long text | Not drawn | add | Names truncate at one line. |
| lots of items | Not drawn | add | Scrolls inside the sheet. |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Not drawn | add | Rows grow; the sheet stays under 90% height. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | M-MSG-16 RM. |
| phone 390 | Not drawn | add | A removed member reads as today's name fallback with a neutral face. |
| large phone 430 | Not drawn | add | |
| desktop 1280 and 1440 | Not drawn | add | Popover anchored to the badge. |

### S-MSG.confirm

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `confirm-phone` (add) | Today's modals and copy (CH-7501 Delete message, CH-7502 Leave group, CH-7503 Delete conversation, CH-7504 Remove member, CH-7607 Mute), restyled as a glass card 300 wide, radius 20, title 17/600, body 15/400 secondary, two 44 buttons: the safe one first in reading order, the destructive one in `--ch-flag`. |
| loading | Not drawn | add | After the confirm press: the button shows a 16 spinner and both disable until the server answers (double-submit). |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | The modal stays open, the buttons come back, today's toast. |
| long text | Not drawn | add | A long group or person name wraps in the body. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | CH-1903 on press; the modal stays. |
| XXL Text Size | Not drawn | add | Buttons stack one per row when their labels don't fit side by side. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | RM fade. |
| phone 390 | Not drawn | add | The team channel never offers Delete (it is refused today; bug L2): the row menu and details leave it out. |
| large phone 430 | Not drawn | add | |
| desktop 1280 and 1440 | Not drawn | add | Esc is the safe button; Enter is not bound to the destructive button. Focus starts on the safe button and returns to the opener on close. |

### S-MSG.add

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `add-phone` (add) | Today's Add to group, in the sheet box (S-MSG.votes); the people list is the New message suggestions' rows. |
| loading | Not drawn | add | Today's. |
| empty | Not drawn | add | Everyone is already in: today's copy. |
| error/failed | Drawn by today's fixture | `add-failed` | Today's, restyled. |
| long text | Not drawn | add | Truncate names. |
| lots of items | Not drawn | add | Scrolls in the sheet. |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | CH-1903. |
| XXL Text Size | Not drawn | add | Rows grow. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | RM fade. |
| phone 390 | Not drawn | add | Add is disabled while the request runs (double-submit). Dismissing with people picked asks nothing: the pick is cheap to redo. |
| large phone 430 | Not drawn | add | |
| desktop 1280 and 1440 | Not drawn | add | Today's. |

### S-MSG.removed

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `removed-phone` (add) | You left or were removed with the thread open: the composer is replaced by a well pill 44 tall, "You're not in this conversation anymore." 15/400 `--ch-text-secondary` (8.96 light, 10.87 dark), the copy PIN-SYNC §5 already uses. Messages already loaded stay readable; nothing new arrives; hold menus offer Copy only. (wiring 4 Nov: today, when the open conversation leaves `convs`, `MessagesScreen.tsx:22-31` toasts CH-7015 and closes it. With the flag on, a conversation that was in `convs` earlier in this visit enters this state instead; an id never seen keeps CH-7015. It is learned on the next list read: the list channel does not get a participant DELETE (Supabase does not deliver filtered DELETE events), so the next read comes from any change to the viewer's own rows, a `golf_conversations` update, a reload, or the first refused send, whose "Not a participant in this conversation" (`src/app/actions/messages.ts:146`) calls `refetchConvs()`.) |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | n/a | n/a | |
| long text | n/a | n/a | |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | Learned on reconnect: same state. |
| XXL Text Size | Not drawn | add | The pill wraps. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | Composer to pill is a 180ms crossfade. |
| phone 390 | Not drawn | add | In the inbox the row fades out over 180ms and the rows below close the gap on `smooth` (07 CP row). Leaving yourself through CH-7502 pops back to the inbox first, then the row leaves. |
| large phone 430 | Not drawn | add | |
| desktop 1280 and 1440 | Not drawn | add | The pane keeps the thread with the pill until the reader picks another conversation. |

A teammate who was removed from the team, or from the group: their old messages stay, with today's name fallback (`?? 'Player'`, data/messages.ts 91) (fixed 4 Nov wiring: the sender fallback is "Member", `MessagesView.tsx:781, 1428`, `MessagesPhone.tsx:573`; `'Player'` at data/messages.ts 91 is the subtitle) and a neutral face (initial-less coin in `--ch-well-bg-flat`), no link to a profile, and they leave the members list and Seen by counts.

### S-MSG.deeplink

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | add (e2e) | Warm app, phone: a push tap opens the thread pushed over the inbox as one stack (inbox under it), replacing whatever thread was open, with no push animation if Messages was not on screen. Back goes to the inbox. |
| loading | Not drawn | add | Cold start: the inbox mounts under the thread; the thread shows the thread loading state directly, already pushed, with no slide. |
| empty | n/a | n/a | |
| error/failed | Not drawn | add | The conversation is gone or you are no longer in it: today's CH-7015 toast ("You may have left it, or it belongs to another team") and the inbox. On desktop the newest-thread fallback then runs, so the pane is never empty (fixes bug L3, Messages.tsx 181). |
| long text | n/a | n/a | |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | Cold start offline: the cached thread, if any, with the offline banner; otherwise the error path. |
| XXL Text Size | n/a | n/a | |
| dark | n/a | n/a | |
| Reduce Motion | n/a | n/a | No motion in a deep link either way. |
| phone 390 | Not drawn | add | Another team's conversation: today's team switch rules; if the viewer isn't in that team, CH-7015. A deep link while a composer has a draft keeps the draft for its own conversation (`ch.msg.drafts.<userId>`). |
| large phone 430 | n/a | n/a | |
| desktop 1280 and 1440 | Not drawn | add | Selects the conversation in the rail and scrolls the rail to show it. |

The URL rule stays S9: inbound params keep today's handling in `Messages.tsx` (132-143) (fixed 4 Nov wiring: 173-238 on 03d9087), and opening, switching or closing a conversation inside the app writes nothing new to the URL.

### S-MSG.narrow

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | `inbox-desk-w1024` (add) | Canvas 1100 and up (`@container`): rail 320, thread, details 300 as drawn. 720 to 1099: rail and thread; details floats over the thread from the right as a 300 panel with the 20b motion, a scrim-free click outside closes it (04 §8, today's behaviour). Under 720: the rail or the thread, one at a time, with the phone push. |
| loading | n/a | n/a | |
| empty | n/a | n/a | |
| error/failed | n/a | n/a | |
| long text | Not drawn | add | Rail names truncate first; the thread column shrinks before the rail. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | |
| XXL Text Size | Not drawn | add | At XXL the 1100 line moves to 1280, so details floats rather than squeezing the thread. |
| dark | n/a | n/a | |
| Reduce Motion | Not drawn | add | Layout changes on resize are never animated. |
| phone 390 | n/a | n/a | |
| large phone 430 | n/a | n/a | |
| desktop 1280 and 1440 | Not drawn | add | Resizing across a line keeps the open conversation, the draft, the scroll place and the details open state. |

### S-MSG.announcements and S-MSG.announcement

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | today's `announcement` fixture | The folded row keeps today's place at the top of the inbox and its copy, restyled as an inbox row in its own card: a 44 megaphone tile in `--ch-well-bg-flat`, "Announcements" 17/600, the newest title 15/400 secondary, count on the right. Tapping it opens today's list; tapping an announcement opens today's letter detail (Back, documents, Acknowledge, tasks, no reply), pushed on phone (M-MSG-01 motion), in the thread pane on desktop. |
| loading | Not drawn | add | Read with the page (`getAnnouncementsWithMeta`), so there is no separate loading state. |
| empty | Not drawn | add | No announcements: the row is absent. |
| error/failed | Drawn by today's fixture | `ann-failed` | Today's. |
| long text | Not drawn | add | Titles wrap to two lines in the detail, one in the row. |
| lots of items | Not drawn | add | Today's list. |
| one item | Not drawn | add | "Announcements 1". |
| offline or stale | Not drawn | add | Cached with the page; Acknowledge offline is CH-1903. |
| XXL Text Size | Not drawn | add | Rows grow. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | Push becomes the RM crossfade. |
| phone 390 | Not drawn | add | Urgent ones (`high` and `urgent`, shown as "Urgent", model.ts 290) carry a chip: `--ch-flag` 12/600 on a 10% tint (5.49 light, 5.59 dark). No accent left border. |
| large phone 430 | Not drawn | add | 20 edge. |
| desktop 1280 and 1440 | Not drawn | add | In the rail the row is the first item, above Pinned. |

An announcement never shows as a chat bubble, an Ask-posted one included (arrivals table below). There is no Announcement row in the + menu (MSG-KEPT-02).

### S-MSG.new-announcement

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | add | Coach only: today's New announcement entry and form, restyled in the poll composer's sheet box (S-MSG.poll-composer). Absent from the player DOM. |
| loading | Not drawn | add | Post disables with a spinner until the server answers. |
| empty | Not drawn | add | Post dims until a title is typed. |
| error/failed | Not drawn | add | The sheet stays with its content; today's toast. |
| long text | Not drawn | add | The body grows to the sheet's height, then scrolls. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | Not drawn | add | CH-1903. |
| XXL Text Size | Not drawn | add | Fields grow. |
| dark | Not drawn | add | |
| Reduce Motion | Not drawn | add | M-MSG-16 RM. |
| phone 390 | Not drawn | add | Closing with typed content asks "Discard this announcement?" (Discard, Keep editing). |
| large phone 430 | Not drawn | add | |
| desktop 1280 and 1440 | Not drawn | add | Centred card as the poll composer on desktop. |

### S-MSG.prefill

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | add (e2e) | The conversation opens with the draft text in the field, the caret at its end, the field grown to fit (up to its cap) and nothing sent. The URL is then replaced with the bare path (today). |
| loading | n/a | n/a | |
| empty | Not drawn | add | Key not found in sessionStorage (`ch.messages.prefill.<key>`): the conversation opens with an empty field, no toast. |
| error/failed | Not drawn | add | Today's CH-7001 to CH-7008 handling for players with no account or no conversation. |
| long text | Not drawn | add | Long drafts hit the field cap and scroll inside. |
| lots of items | n/a | n/a | |
| one item | n/a | n/a | |
| offline or stale | n/a | n/a | Works offline (local only). |
| XXL Text Size | Not drawn | add | Field cap holds. |
| dark | n/a | n/a | |
| Reduce Motion | n/a | n/a | No motion. |
| phone 390 | Not drawn | add | An unsent draft of the coach's own already in that conversation wins, as today (Messages.tsx 207-208), and v2 shows one toast in the one style: "You already had a draft here." The prefill key follows today's `takePrefill` (read once). Board images (AK11c `attachment {kind:'board'}`) arrive as a photo chip; a poll prefill opens the poll composer filled, not sent. Every field's rule is in the table under this matrix. |
| large phone 430 | n/a | n/a | |
| desktop 1280 and 1440 | Not drawn | add | Same. |

#### How the composer reads each `ChPrefill` field (Ask AK11c hand-off)

The shape is Ask's (ask/02-PLAN §14.3 and its completeness CP-K): `ChPrefill` keeps `players`, `draft`, `title` and gains `conversationId?`, `poll? {question, options[], closes?}` and `attachment? {kind: 'board', pngKey}`, in sessionStorage only, read once through today's `takePrefill`, which validates the new fields. Ask's f_board opens a player's thread with the board attached; f_poll opens the team chat with the poll draft. Nothing is ever sent or posted until the coach presses Send in the composer or Send in the poll composer. These rules hold the same with the Messages flag off: AK11c builds them in today's composer (ask/02-PLAN §1 exception), and v2 must read the fields identically.

| Field | Composer reads it as | Lands where | When it can't |
|---|---|---|---|
| `conversationId` | the destination; it wins over `players` | that conversation, opened as a deep link (S-MSG.deeplink: in place at frame one, no slide; the inbox mounted under it on phone; selected in the rail on desktop). A conversation the viewer hid comes back, as opening one does today | Deleted, or the viewer is no longer a member: if `players` holds exactly one player, the DM with that player opens or starts instead (today's `?player=` path; the same person, so no toast) and the rest of the prefill lands there. Otherwise nothing opens and nothing is kept: today's CH-7015 toast over the inbox, and the prefill key is removed. Never redirected to a different group or the team channel. Another team's conversation: today's team rules, else CH-7015. |
| `players` (no `conversationId`) | today's | today's: one player opens or starts the DM; several open New message with them as recipients | today's CH-7001 to CH-7008 handling |
| `draft` | text in the field, caret at its end, field grown to its cap, focus in the field on desktop (on phone the keyboard stays down until a tap) | the destination | The coach's own unsent draft there wins (today, Messages.tsx 207-208): the prefill's text is dropped and "You already had a draft here." shows; the poll and the attachment below still land, since they replace nothing. |
| `title` | today's | today's | today's |
| `returnTo: 'ask'` (added 4 Nov wiring, from ask/02-PLAN AK11c and COMPLETENESS handoffs) | honoured once: the Messages back key on the arrived thread calls `router.back()` (Ask is the previous history entry), then the field is cleared so a second Back goes to the inbox | Ask's conversation | Any other value, or no history entry to go back to: today's back key to the inbox |
| `attachment {kind: 'board', pngKey}` | a photo chip in the composer (S-MSG.file chip with the board's thumbnail), named "Board.png", removable with its ×; sent on Send through the normal upload path (S-MSG.upload) with the draft text 8px under it (M-MSG-07a) | the destination | Blob not found in this tab's storage (another tab, a reload that cleared it): no chip, the text still lands, and "The board picture wasn't found. Make it again in Ask." shows. Over today's size limit: today's too-large path (no chip, today's copy). A `kind` other than `board`: ignored. An existing chip in the composer stays; the board is added after it. |
| `poll {question, options[], closes?}` | the poll composer (S-MSG.poll-composer) opens by itself once the thread is in place, filled: question, options in their order, Allow multiple left at its default, closes set when it is a future time today's control can show, else left at its default | the destination (Ask sends the team chat) | `takePrefill` rejects it (empty question, fewer than 2 options, more than today's cap): the thread opens with the text only and "Couldn't open the poll draft. Nothing was posted." shows. Closing the filled sheet asks "Discard this poll?" (MSG-CP-18): Discard drops it, Keep editing returns. The held `20261028140800` migration keeps Ask's poll flow off until applied, so this path is unreachable before then. |

Reload and repeat: `takePrefill` consumes the key on read (today). A reload before Send keeps the text (drafts store `ch.msg.drafts.<userId>`) and loses the board chip and the poll sheet; Ask's receipt Open writes a fresh prefill each time it is tapped (Ask lane). Back: the Messages back key goes to the inbox, as for every deep link; browser back (and desktop history back) returns to Ask, where the receipt reads "Nothing is sent until you tap Send". Ask's CP-K says the back key returns to Ask; that needs an origin field in `ChPrefill` (for example `returnTo: 'ask'`) that AK11c doesn't add, so it is listed as a contradiction in the lane report. (fixed 4 Nov wiring: AK11c now adds `returnTo?: 'ask'` (ask/02-PLAN, AK11c prefill origin); the row above reads it. Two AK11c changes the composer depends on: `takePrefill` returns null when `players` is empty (`prefill.ts:79`), so it must accept an entry with a `conversationId` and no players; and `keyOf` hashes only players, draft and title (`prefill.ts:33`), so two prefills that differ only in poll or board share a key unless the new fields are hashed too. The poll composer has no seed today (`PollSheet`, polls.tsx 615, takes `api, conv, open, onClose`): AK11c adds `seed?: PollDraft`.)


### S-MSG.noteam

| State | Drawn? (anchor) | Capture state id | Rule |
|---|---|---|---|
| default | Not drawn | add | Today's `MessagesNoTeam` (coach and player copy), restyled as the empty inbox card (S-MSG.empty). The green bar stays. |
| loading to desktop 1280 and 1440 | n/a or Not drawn | add | No other states: one card, centred, XXL grows, dark tokens, no motion. |

### Keyboard (all IDs, desktop and a phone with a hardware keyboard)

| Key | Where | Does |
|---|---|---|
| Enter | composer | Sends (M-MSG-07a). Never while an IME is composing (`isComposing`), and never with an empty field. |
| Shift+Enter | composer | New line. |
| Esc | anywhere in Messages | Closes the top layer only, in this order: lift, sheet or modal, menus (row menu, attach), reply or edit chip (Esc on the edit chip puts back the draft you had before editing), New message when its field is empty, desktop details. Never clears typed text. Focus returns to what opened the layer. |
| ⌘K, G then M | app | Today's palette and jump (classes-roster lane); unchanged. |

### Arrivals from other lanes (receiving end)

| From | Trigger | What Messages shows | Other lane's flag off |
|---|---|---|---|
| Ask announcement (`coachhelm_ask_v2`, `create_announcement`) | Coach confirms; the 8s Undo closes; players are told | Nothing during the 8s. After it: a new announcement at the top of Announcements, the same look as any coach announcement (no "from Ask" mark), urgency chip if set; players get the bell, the push and the email (email only while `HELM_CUSTOMER_EMAIL_ENABLED`), never a chat bubble. Ask's "Open" lands on that announcement's detail through `?announcement=<id>`, which 11f adds (fixed 4 Nov: settled as a default); before 11f lands it opens the inbox with Announcements open. An unknown id: the inbox and "That announcement isn't available." | Nothing arrives; Messages is today's. |
| Practice plan published (`golf_practice_plans`, `coachhelm_practice_plans_v1`) | Coach publishes; push and bell after Undo | Lands in the bell, not Messages (`event_reminder`, `data.kind='practice_plan'`). Only if the coach turned on the team chat switch: a plain text message from the coach in the team channel, drawn as any coach bubble; its link is same-origin and routes in place. No `kind 'practice'` card is built in this lane. | Nothing in Messages. |
| Quick chat "Send to N players" (`coachhelm_quick_chat_v1`) | 8s server hold (HM1), then `sendGolfMessage` | Nothing during the hold. Then your own message arrives as a realtime row, in place at frame one, the thread making room on `reveal`; the inbox rows move to the top on `smooth`. "Open" (S-OPEN) commits the hold and lands on `?conversation=<id>`. | Nothing arrives. |
| Ask or Read "Message this player", Day card Nudge | `?player=` or `?prefill=<key>` | `S-MSG.prefill` rules and its field table: `conversationId` lands in the named thread (fallback to the DM, or CH-7015), the board as a photo chip, the poll as the filled poll composer, nothing sent. The back key goes to the inbox; browser back returns to Ask. | The prefill path lives in today's `Messages.tsx` and AK11c builds the new fields there, so it works with the Messages flag on or off. |
| Roster profile "Message" | `?player=<id>`, nothing prefilled | Opens or starts the DM with an empty field and the caret in it (phone keyboard stays down until a tap). Back goes to the inbox, not the roster; the system back gesture or browser back returns to the roster. | Today's behaviour. |
| Home "Message coach", "Message team" | `?user=`, `?conversation=` | As `S-MSG.deeplink`. | Today's. |

### Defaults added by this pass (flip in one line)

| Question | Default | Flip |
|---|---|---|
| Offline sends | Today's: fail at once with "Not sent" and retry; nothing sends by itself | Queue text sends while offline and send them in order on reconnect |
| Delete a failed message | From this device only, no confirm | Keep failed messages until retried |
| Unread divider position on open | 120pt under the bar when more than one screen is unread | Always at the bottom |
| Prefill against your own draft | Your draft wins (today) with "You already had a draft here." | Prefill replaces the draft |

### Fixed in place on 4 Nov (log)

- `S-MSG.hold` phone 390: the haptic is `haptic('press')` (light), ruling 22, not medium.
- Inventory `S-MSG.fresh`, `S-MSG.toast`, `S-MSG.holdseen`; `S-MSG.holdseen` phone 390; `S-MSG.seen` desktop: the "open line" notes are settled by S6, S5, S1, S1 and S8.
- `S-MSG.thread` error/failed: the build line is today's "Not sent" (S2); the page draws "Not delivered · Try again".
- Settled as defaults, "Per-conversation URL": the flip was "Add `?c=<id>`"; today's app already reads `?conversation=<id>`, so the flip is "write `?conversation=<id>` when a conversation opens".

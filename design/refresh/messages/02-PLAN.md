# Messages: file-by-file build plan (BUILD_BRIEF PR 11)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds the lane flag in 11a, a 7-row per-PR table and two risks; the delete steps move to a cleanup PR).
> Wiring, 4 Nov 2026: rows fixed in place are marked "(fixed 4 Nov wiring: ...)"; the wiring tables are in 06-SCREEN-SPECS.md and the checks in 08-ACCEPTANCE.md under that name.

Values (sizes, colours, shadows, springs, states) come from `04-FIDELITY-SPEC.md` and `redesign/redesign.css`. This file says where they go. Where the two seem to disagree on a value, the spec wins; on a file, a component or a line, this file wins.

Repo `njrini99-code/helmv3`, checked at `main` 75b4956 (Oct 31). Paths are under `src/clubhouse/` unless they start with `src/`, `e2e/` or `.github/`. Line numbers are at 75b4956: find code by name first, because lines drift.

Builds on BUILD_BRIEF PR 1 (tokens, `--ch-dur-crossfade-rm`) and PR 7 (`Avatar year`, `lib/class-year.ts`). If either hasn't landed, 11a carries the parts Messages needs, exactly as `classes-roster-home/02-PLAN.md` §2.1–2.3 writes them, so the two never diverge.

Prep only: PRs and a preview. No deploy, no migration, no flag flip.

---

## 0. PR order

Seven small PRs, and an eighth (11h) that waits on a held migration, each green and shippable on its own, each shot against the design before it's called done (spec section 11).

| PR | Contents | Depends on | States it must match |
|---|---|---|---|
| 11a Foundations | tokens, the three new springs, the design fixture, `gradYear` on `ChPerson` | PR 1, PR 7 | none drawn; the fixture reaches all 22 |
| 11b Inbox | large title and context line, search row, segmented filter, Pinned card (`pinned.ts`), Recent card, desktop rail 320, row mute glyph, typing on rows and pins | 11a | `inbox`, `unread` |
| 11c Thread and bubbles | bubble shape and fills, runs, names inside, faces, day pills, date pill, drag for times, photos, files, reply quote, typing bubble, jump key | 11a | `thread`, `team`, `typing`, `times`, `file`, `reply`, `jump` |
| 11d Composer and send | glass composer, send key, growth, + menu, file chip, sent bubble rise, thread makes room, receipts | 11c | `attach`, `file` (composer half) |
| 11e Hold, reactions, Seen by, polls | press and lift, reaction bar, menu, badges, double-tap Like, Seen by pill and sheet, poll card, See votes | 11c | `hold`, `holdseen`, `react`, `seen`, `poll`, `votes` |
| 11f Details, mute, empty, new | phone push and desktop column, header, quick actions, cards, mute menu, first run, New message token, hello card and starters | 11b, 11c | `details`, `groupdetails`, `mute`, `empty`, `new`, `fresh` |
| 11g Motion tests | the 11 interrupt cases and the Reduce Motion run as Playwright tests on the fixture; clips | 11b–11f | all motion rows (07-MOTION) |
| 11h Pin sync (held) | `golf_conversation_pins` draft migration and its HELD.md row, `use-conversation-pins.ts` (account pins, falls back to `pinned.ts` while the table is missing), private `golf-pins:<user>` channel, pgTAP and hook tests (`pin-sync/PIN-SYNC.md`) | 11b; the owner applying the migration after the first deploy | `inbox`, `unread`, `pinlimit` (no new look; same Pinned card) |

11g's tests can be written alongside each PR and land with it; 11g is where the full set is checked together and the clips go into the PR.

Every PR must:
- run `npm run clubhouse:catalog` (CI runs `-- --check` in `.github/workflows/clubhouse-quality.yml`) and `npm run clubhouse:css`
- pass `npm run typecheck`, `npm run lint`, `npm run test` and `playwright.clubhouse.config.ts`
- attach `capture.mjs app` shots of its states beside `capture.mjs design`, with each difference listed as matches, fixed, or can't-match with the reason (spec section 8). An unexplained difference means the PR isn't done.

---

## 1. Files that must NOT change

| File | Why |
|---|---|
| `shell/TopBar.tsx`, `shell/phone-chrome.tsx` (`PhoneTop`, `usePhoneHero`), `shell/ClubhouseFrame.tsx`, `shell.css` bar rules and the lip | The top bar stays exactly as today (Nick, 31 Oct). |
| `ui/PhoneBar.tsx` | The conversation bar row (back, face, name, role, info) is today's. Messages styles only its own children. |
| `screens/messages/model.ts` | Shapes stay. One additive field only: `gradYear` on `ChPerson` (§2.4). |
| `src/hooks/golf/use-golf-messages.ts` | Realtime, sends, retries, pending and failed, receipts, typing broadcasts. Two additive changes only, each in its own commit: the row mute read (§3.6) and the typer's id with a 5 s clear (§3.8). |
| `src/hooks/golf/use-message-responses.ts` | Votes. |
| `src/app/golf/actions/message-mute.ts` | Mute rules and lengths. |
| `data/messages.ts` | Directory. One additive field only (`gradYear`, §2.4). |
| `screens/messages/drafts.ts`, `prefill.ts`, `marked-unread.ts`, `notify-anyway.ts`, `class-thread.ts`, `group-class.ts`, `files.ts`, `use-focus-message.ts` | Behaviour. |
| `screens/messages/use-thread-anchor.ts` | The end anchor. New motion wraps it; it is not rewritten. |
| `screens/messages/composer-inset.ts` | Sets `--ch-ms-comp-h`; the new composer keeps feeding it. |
| `lib/haptics.ts` | Haptics go through `haptic('press' \| 'select' \| …)`; nothing new. |
| Lenis (`usePanelSmoothScroll`, messages.css 438) | "I like the smooth scroll." Spring scrolls go through Lenis, never around it. |
| Routes `src/app/golf/(dashboard)/dashboard/messages/…` | Gating only. |
| `announcements.tsx`, `NotifyAnyway.tsx`, `GroupClassLine.tsx`, `ThreadClass*.tsx`, `MessagesNoTeam.tsx`, `MessagesSkeleton.tsx` behaviour | Kept and restyled with the same tokens (spec section 5, last paragraph). Markup changes only where a class name must change. |

---

## 2. 11a Foundations

### 2.1 Tokens: `styles/tokens.css`

Today: radius-tail 517; bubble tokens 650–655 (light), 1006–1007 (dark); motion tokens 738–757; Reduce Motion `--ch-ease-spring-smooth` at 1085.

Add, light block after 655 and dark after 1007 (values in spec section 2):
- `--ch-bubble-theirs-bg` `#FFFEFB` / `#232925`
- `--ch-bubble-mine-fill` `#155A39` / `#1F6B45`
- `--ch-bubble-radius: 19px`, `--ch-bubble-join: 6px` (radius-tail stays for other users of it; grep before changing it)
- `--ch-poll-bar`, `--ch-poll-bar-on`
- the bubble shadows from spec section 2's shadow table as filters, so the drawn tail casts with the body: `--ch-bubble-theirs-shadow` (`--a-shadow-recv`) and `--ch-bubble-mine-shadow` (`--a-shadow-sent`; its lit edge stays a 1 px inset box-shadow). In Messages they replace `--ch-elevation-bubble` and `--ch-elevation-bubble-mine`, which stay for any other user (grep first)
- `--ch-shadow-float` (`--a-shadow-float`) and `--ch-well-shadow` if PR 1 hasn't added them
- glass: DESIGN_LANGUAGE section 4's glass for the desktop bar, glass-strong for the composer, menus, reaction bar, attach, jump and date pill (spec section 2, `--a-glass`, `--a-glass-strong`, `--a-glass-rule`); add them only if PR 1 hasn't
- motion tokens after 757: `--ch-ease-spring-send`, `--ch-ease-spring-pop`, `--ch-ease-spring-lift` as `linear()` strings generated by `chSpringCurve(kind).linear` (write a one-off script; paste the output; a test checks they match, §2.2)

Leave `--ch-bubble-mine-bg` (the gradient) in place until 11c removes its last user, then delete it in 11c.

Tests: `__tests__/contrast-tokens.test.ts` gets every pair in spec section 2's contrast table, light and dark (text 4.5, marks 3.0). Marks use the v13 values: typing dots `--a-dot` #7A766C light (3.97 page, 4.49 paper, 4.08 selected wash) and #827D71 dark (3.55 to 4.60); the own-reaction ring `--ch-ring-own` #8C703A light (4.10 on the page, on its page halo) and #C9AD74 dark; the switch off ring `--ch-switch-off-ring` #8F8B81 light (3.37 on the card), #827D71 dark (4.12). See `SETTLED-4NOV.md` 2, 3 and 11.

### 2.2 Springs: `lib/motion.ts`

Add to `CH_SPRINGS`:
```ts
send: { visualDuration: 0.42, bounce: 0.12 },
pop:  { visualDuration: 0.25, bounce: 0.35 },
lift: { visualDuration: 0.28, bounce: 0.15 },
```
`chSpring('send')` and the rest then work with no other change; `ChSpringKind` widens itself.

Rewrite the comment above `CH_SPRINGS`: the D-64 three keep the base or reveal duration and a bounce of 0 to 0.1; `send`, `pop` and `lift` are Messages-only (a sent bubble arriving, a badge or key popping, a held bubble lifting) and pass the cap with the owner's sign-off, 31 Oct 2026 ("yeah as long as it's smooth").

Breaking test to change: `__tests__/motion-physics.test.tsx` 48–60 asserts every `CH_SPRINGS` entry has the base or reveal duration and a bounce ≤ 0.1. Change the loop to the D-64 three by name (`['smooth','settle','reveal']`), and add a second `it` that pins the three Messages springs to the values above, their stiffness and damping (155 · 21.9, 439 · 27.2, 350 · 31.8 to one decimal) and their peaks (1.003, 1.068, 1.006 within 0.001, via `chSpringAt`; the app's pop peaks at 1.06808, so 1.067 would fail). `slide-plate.ts` takes `ChSpringKind` and is unaffected.

Add a test that the three `--ch-ease-spring-*` tokens equal `chSpringCurve(kind).linear`.

### 2.3 Design fixture: `preview/PreviewMessages.tsx` and the preview page

`src/app/clubhouse-preview/[screen]/page.tsx` already reads `view` from `searchParams` (216, 220). Pass it to `PreviewMessages` at 478 and 519: `<PreviewMessages state={state} view={view} />`.

In `PreviewMessages` (182):
- `state === 'design'` swaps the cast for the page's `INIT` (prototype.js 194): the same people, conversations, messages, reactions, poll and files, with the times fixed to the page's clock. Put the cast in a new `preview/messages-design-cast.ts` so the existing fixture is untouched.
- Mark the root `data-ch-preview-view={view}`.
- Open the named state after mount (spec section 12): open the conversation; for `hold`, `holdseen`, `votes`, `seen`, `attach`, `mute` open the overlay; for `times` set the drag offset to 58; for `jump` scroll a screen up and set two unseen; for `typing` set `typing: true`; for `unread` set the filter.
- Expose a test hook on `window.__chMsgFixture` in the preview only (never in the app bundle): `send(text)`, `incoming(text)`, `typing(on)` so 11g's Playwright tests can drive arrivals without a database.

Test: a unit test renders each of the 22 views and finds the marker and the state's key element.

### 2.4 `gradYear` on `ChPerson`

- `model.ts` 12: add `gradYear: number | null`.
- `data/messages.ts` `loadMessagesDirectory`: set it from `p.graduation_year` (already read through `readGolfPlayerProfiles`); coaches `null`.
- Faces: `Avatar year={classYearKey(person.subtitle)}` where PR 7 has landed, opt-in at each Messages call site (§3, §4). Coaches and unknown years keep today's coin.
- Update fixtures that build `ChPerson` (`PreviewMessages`, `__tests__/messages*.test.tsx`) with `gradYear`.

---

## 3. 11b Inbox

### 3.1 `screens/messages/MessagesPhone.tsx` `PhoneInbox` (246)

Keep: the green `TopBar` and its "Messages ⌄" and bell, the lip, row swipes, the row context menu, marked-unread, search hits (`MessageHits`), announcements folded under the conversations (messages.css 3249), virtualised rows (3343).

Change:
- Large title "Messages" and its context line under the bar (spec section 3 type table; text in data checks), with `ui/LargeTitle.tsx` and `shell/large-title.tsx` as the other screens use them (PR 3).
- One row: the search well and a New message key.
- Filter: `ui/Segmented.tsx` unchanged; only its screen-level overrides in messages.css go (56–62).
- Pinned card (only when one or more are pinned): up to three 62 px faces, label under, bubblet or typing dots (§3.8).
- Recent card: one card style (DESIGN_LANGUAGE), title "Recent N" inside, rows from `ConvRow`.

### 3.2 `screens/messages/MessagesView.tsx` `ConvRow` (431), `ConvRowButton` (565)

- Avatar 44 on the phone (already 44 in the phone block at 272), 40 on the desktop rail, rows about 72 px, two-line preview, unread dot before the name, mute glyph after the time.
- `convAvatarId` (321) unchanged; pass `year` to `Avatar` for direct threads with a player.
- Row menu (448–456): add Pin / Unpin after Mark as read/unread; disabled with "Pin up to 3" when three are pinned.

### 3.3 Pins (new): `screens/messages/pinned.ts`

Mirror `marked-unread.ts` (40 lines): key `ch:msg:pinned:<viewer>:<team>`, an ordered list of conversation ids, max 3, `try/catch` on every storage call, a `usePinned()` hook that drops ids no longer in `convs`. Test: `__tests__/pinned.test.tsx` beside `marked-unread.test.tsx`.

### 3.4 Desktop `Rail` (649)

- Width 340 → 320: messages.css 6 and 28 (`grid-template-columns`), and the narrow container block at 1309–1330.
- Sections "Pinned" and "Recent" as 13 / 600 secondary labels; rows inset 8, radius 12; selected row washed (spec section 9). Flat and continuous: no cards on the rail.

### 3.5 `styles/messages.css` Rail (35–365)

Restyle in place. Delete the screen-level segmented overrides (56–62) and the old title rule (63–82) once the large title replaces it. Keep the separator rules (119–132), pressed states (148, 293) and focus (156) with new values.

### 3.6 Row mute glyph

Rows don't carry mute today (it's read per conversation in `message-mute.ts` 28). Add, in `use-golf-messages.ts` beside the conversations read (around 1520), one read of the viewer's own participant rows: `select('conversation_id, notification_level, muted_until').eq('user_id', viewer)`, mapped with `isConversationMuted` (`src/lib/notifications/golf-message-fanout.ts` 250) into `ChConv.muted?: boolean`. No migration. Refresh it after `muteConversation` succeeds. Own commit, so it can be dropped without touching the rest: without it, rows draw no glyph. (fixed 4 Nov wiring: no new query is needed. `loadGolfConversationRail` already reads every one of the viewer's own participant rows at `use-golf-messages.ts:1519-1533` (`select('hidden_at, conversation:golf_conversations!inner(...)').eq('user_id', userId)`); add `conversation_id, notification_level, muted_until` to that select, build a `Map<conversationId, muted>` with `isConversationMuted` (`golf-message-fanout.ts:250`) and set `muted` on each `GolfConversationWithMeta`, then on `ChConv` in `Messages.tsx` `loadedConvs` (113-136). The refresh after `muteConversation` is free: the list channel `golf-conversations:<user>` (`use-golf-messages.ts:2177-2205`) refetches on any change to the viewer's own participant row, on every device. R6's extra read goes away.)

### 3.7 Inbox tests

- `__tests__/conv-row-seams.test.tsx`, `conv-context-menu.test.tsx`, `marked-unread.test.tsx`: keep green; add Pin to the menu test.
- `__tests__/messages.test.tsx`: the large title, context line counts, Pinned card hidden with no pins.

### 3.8 Typing on rows and pins (Nick, 31 Oct: "typing should be tracked")

The data is already sent: every composer broadcasts `typing` with `{ userId, isTyping }` on `golf-conversation:<id>` (`use-golf-messages.ts` 1051–1064, throttled to 500 ms), and only the open thread listens (997–1012). No migration.

- New `screens/messages/use-typing-by-conversation.ts`: for each conversation on screen (the pins and the visible rows; the virtualised list knows which), join `golf-conversation:<id>` and listen for `typing` only. Keep `Map<conversationId, Map<userId, expiresAt>>`, ignore the viewer's own id, expire each entry 5 s after its last event, and clear a conversation's entries when a message arrives there (the inbox's own refresh already sees it). Return `typingByConv: Map<string, string[]>` (who is typing).
- Skip the open conversation: its thread hook already holds that channel, and joining the same topic twice from one client breaks the first subscription. On the phone the inbox stays mounted under a pushed thread, so read the open id from the view state.
- Cap at 30 channels; rows beyond it show their preview. Leave channels as rows scroll out of view, and all of them on unmount.
- (fixed 4 Nov wiring: keep the typers as a set, `typingUserIds: string[]`, each entry expiring on its own, because 05's settled default draws one typing bubble per typer; `isOtherTyping` stays as `typingUserIds.length > 0`. The expiry is a new option `typingExpiryMs` on `UseGolfMessagesOptions` (`use-golf-messages.ts:492`), default 3000 (today, line 1012); `Messages.tsx` passes 5000 only when `redesign` is on, so flag off keeps 3 s.)
- In the hook, additive: keep the typer's id (`typingUserId`) beside `isOtherTyping` for the typer's name inside the group typing bubble (v13: the name sits inside the bubble above the dots, like a first bubble's name; no caption on the page, SHARED-2), and change the clear from 3 s to 5 s (the design's).
- Rows: the preview swaps to three dots (spec section 7, "Typing in a row or pin"); pins show the dots in the bubblet. Groups show dots only, no name, on the row.
- Tests: `__tests__/typing-by-conversation.test.tsx` with a fake channel: own id ignored, 5 s expiry, open conversation skipped, cap respected, cleanup on unmount.

---

## 4. 11c Thread and bubbles

### 4.1 `Bubble` (MessagesView 1049)

Keep: `useLongPress` (999) with 450 ms and 10 px slop, swipe right to reply (1084), failed and pending states (597–617, 3237), search-hit ring (618), edited and deleted, links (`MessageText` 1397), `ReplyQuote` (1425), Notify anyway (921), keyboard-only actions line (547).

Change:
- Shape: radius 19, joins 6 px on the side facing the run, a drawn tail on the last bubble of a run: the page's SVG, `viewBox="0 0 18 20"`, path `M0 0h12c0 9 1.6 14.5 6 20-5.2.3-9.8-.9-13.4-3.6L0 20z`, `aria-hidden`, 18 × 20 at the bottom corner, −5 px outside the bubble, filled with the bubble's colour and mirrored for theirs (`redesign.css` `.tail`). Spacing 2 px inside a run, 10 px before one.
- Fills: theirs `--ch-bubble-theirs-bg` with `filter: var(--ch-bubble-theirs-shadow)`; yours `--ch-bubble-mine-fill` with the lit top edge and `filter: var(--ch-bubble-mine-shadow)`. Remove the gradient.
- Groups: the sender's name inside the first bubble of a run, the face (30 slot) beside the last; both from today's run grouping in `Thread`.
- Swipe left on one bubble (1085, `setShowTime`) is replaced by the whole-thread drag (§4.3). Keep the `showTime` path for keyboard focus only.
- Times under every run go; the receipt line stays under your latest message only (1364–1372 logic kept).
- Faces: `Avatar year` opt-in (§2.4).

### 4.2 `Thread` (1970) and `PhoneThread` (MessagesPhone 372)

- Day labels in paper pills (`.ch-ms-day`, messages.css 494–505).
- Floating date pill: shown while scrolling, the day of the topmost visible message, 180 ms in, 250 ms out after 1 s still (spec section 7). Read the topmost message with the existing anchor's observer in `use-thread-anchor.ts`'s caller, not a new scroll listener per bubble.
- Desktop bar hairline: opacity on content under the bar, 200 ms.
- Photos keep `ImageAttachment` (891) with its fixed 4:3 frame (451); files become the file bubble (icon tile, name, "PDF · 212 KB"; video shows size, data gap 5).
- Typing bubble (`.ch-ms-typing`, 947–970): three dots in a bubble with a tail, grows from its tail corner on `pop`; hides 5 s after the last event (today's timer).
- Reply opens from typing: when a message arrives while the typing bubble shows, the new bubble grows from the typing bubble's corner at its size (`reveal`), and the typing bubble goes in the same frame. Key both by id so framer carries them (spec "Carry").
- Jump key: `ThreadBelow` (1953) becomes a 44 px glass circle with the count badge; replaces the pills at 2742–2767. "New" divider (2768) stays.

### 4.3 Drag for times (phone)

New hook `screens/messages/use-thread-drag-times.ts`: horizontal pan on the thread's scroller, follows at 60% up to 58 px, `settle` back on release, starts from the live x when grabbed again. Vertical wins over horizontal after 10 px (the native scroll keeps it). The edge 24 px stays for the back swipe (`useLongPress` 1034 uses the same 24). Times sit right of each bubble at opacity tied to the offset. Under Reduce Motion it follows the finger and returns at once.

### 4.4 Arrivals and the thread making room (B7)

The arriving row has full height at frame one; everything above moves by transform only. Implement as one framer motion value `y` on the message list's wrapper: on an arrival, add the new row's height to `y` and animate it back to 0 on `send`. Two arrivals add (spec "Additive"). The bottom target is `msgs.offsetTop + msgs.offsetHeight − clientHeight` re-read each frame (spec scroll rules; never `scrollHeight`, which the transform inflates).

### 4.5 `styles/messages.css` Thread (383–986)

Restyle in place. Delete: the gradient bubble rule, the under-bubble time rules (534–546) for non-latest runs, the jump pills (2742–2767) once replaced. Keep: the Lenis block (438), the composer measure (481–533), the photo frame (451), the fade into the header (474).

### 4.6 Thread tests

- `__tests__/messages.test.tsx`, `messages-audit.test.tsx`, `wiring-p007-messages.test.tsx`, `class-awareness-messages.test.tsx`: keep green; update selectors only where a class name changed.
- New: run grouping puts the name in the first bubble and the face beside the last; the tail is on the last bubble only; no time line under a non-latest run.

---

## 5. 11d Composer and send

### 5.1 `Composer` (MessagesView 1618), `ComposerPlus` (1556), `AttachChips` (1482), `useAutosize` (1588)

Keep: drafts, prefill, Notify anyway cluster (3359), class line (3404), `CharsLeft` (1606), desktop Enter sends and Shift+Enter adds a line with today's hint (CH-7802), phone Return adds a line, `composer-inset.ts` feeding `--ch-ms-comp-h`.

Change:
- One glass pill: +, the field, the send key. The send key springs in on the first character (`pop`, scale 0.4 → 1) and out when the field empties. The page's Dictate key (a mic shown while the field is empty, which only says dictation uses the keyboard's mic) is not built: an empty field shows no key on the right (spec section 8).
- Growth: a line at a time to six lines (132 px), then scrolls. Height steps; not animated.
- + menu: today's actions in the new glass menu (spec section 8): Photos (`accept="image/*"`), File, Poll (opens today's `PollSheet`, polls.tsx 615). + turns to × (rotate 45°, `--ch-ease-spring` 300). The menu scales 0.4 → 1 from the + on `lift`; closing then reopening reverses the closing menu (`is-closing`).
- File chip rises 12 px above the field (`smooth`).
- Safe area: composer bottom `max(8px, env(safe-area-inset-bottom) − 4px)` (spec section 4).

### 5.2 Sent bubble rises

On send, move the real bubble: render it in its row at once, then animate it with a transform from the field text's rect to its slot on `send` (scale 0.96 → 1), as the page does. Do not use an overlay copy: hiding the real bubble until a copy lands reads as a blink in motion-check cases 1, 2 and 11 (`SETTLED-4NOV.md` 23). A second send 140 ms later starts its own; both land in order. The thread makes room on the same spring (§4.4). Under Reduce Motion the bubble fades in place over `CH_FADE_MS` 180, linear. Reference: prototype.js `send` (661).

### 5.3 Receipts

Delivered → Seen crossfade 180 ms (`receiptsAfterSend`, prototype.js 698). Pending shows nothing (P-1); failed keeps today's Not sent line.

### 5.4 `styles/messages.css` Composer (987–1120, 1350, 2110)

One composer block. Delete the older of the two `.ch-ms-comp` blocks (988) after moving anything still used into the 1067 block, then restyle that block.

### 5.5 Composer tests

`__tests__/messages-drafts.test.ts` stays green. New: send key hidden with an empty field and shown with text; six-line cap; the + menu lists exactly Photos, File, Poll; Enter sends on desktop and not on the phone.

---

## 6. 11e Hold, reactions, Seen by, polls

### 6.1 Press and lift

`useLongPress` (MessagesView 999) gains a press state: on pointer down the bubble sinks to 0.97 over 110 ms; moving past the slop or releasing before 450 ms lets it go over 280 ms. At 450 ms: `haptic('press')` (today's), then the lift.

The lift replaces the phone's `Modal` "Message" sheet (MessagesPhone 567, CH-7604) and desktop's reaction picker. New component `screens/messages/MessageLift.tsx`:
- A portal with a blurred scrim, the held bubble's copy at its rect, lifted (moved up if the menu needs room) on `lift`.
- Reaction bar above (scale from the bubble's top corner on `pop`), menu below (scale 0.8 → 1 from the bubble's bottom edge on `lift`).
- Menu rows exactly today's (MessagesPhone 600–611, MessagesView 1123–1135): poll rows (`PollSheetRows`: See votes, Remind, Close poll, Share result), Reply, Seen by (your messages in groups, `SeenSheetRow`), Copy, Edit, Delete. Same disabled rules.
- Dismiss: tap the scrim, pick, Esc; the bubble settles back on `settle`, bar and menu shrink toward it. Reopening mid-dismiss reverses the closing copy (`HOLD_OUT`, prototype.js `finishHoldOut` 799), never a second copy.
- Focus: trap in the menu, return to the bubble on close. Enter or Space on a focused bubble opens it; right-click on desktop opens it.
- The `code="CH-7604"` stays on the new root so catalog and audits still find it.

Desktop hover bar (MessagesView 1258, `.ch-ms-tool`): Like, Love, Reply, more, beside the bubble; 160 ms opacity, 220 ms from translateY(4) scale(0.96). More opens the lift.

### 6.2 Reactions: `ReactionChip` (775) and `REACTIONS` (154)

- Corner badges: green on paper bubbles, ivory on yours, your own with the champagne ring (messages.css 766–828 already holds the colour rule; move it onto the badge). Number only above one. Pop from the bubble corner on `pop`; toggling again retargets.
- Tap a badge: today's who-reacted card (829).
- Double-tap a bubble toggles Like: in `useLongPress`, two pointer-ups within 300 ms and 10 px, cancelling the hold timer.

### 6.3 Seen by: `seen-by.tsx`

Keep `useSeenBy` (29), `SeenByBody` (121), `listTitle` (111), the phone sheet (264) and desktop popover (280). `SeenByReceipt` (46) becomes the paper pill with up to five 16 px coins (overlap −4, ring 1.5) (colour only, no initials: spec section 8) and its label; new faces pop in. Sheet open and close as See votes (§6.4).

### 6.4 Polls: `polls.tsx`

Keep: `usePollClock`, `endsLabel`, `PollThreadContext`, `ClosePollModal`, `PollButton`, `PollSheet` (the composer), every error line, the M3 rule that only a tap plays the check (3712).
- `PollCard` (209): sentence-case header, each choice a well with a `scaleX` bar (`--ch-poll-bar`, `--ch-poll-bar-on`), count, up to three 18 px voter coins (overlap −5), "Most votes" chip (one choice strictly ahead). Ring fills and check draws on vote (`pop`; check 260 ms stroke). Every bar glides on `smooth` from live; counts change at once.
- `PollVotesModal` (441): phone sheet / desktop centred card, grouped by choice with a bar under each heading. Sheet y on `smooth`; down 280 ms `--ch-ease`; close mid-rise reverses; reopen mid-close reverses (`SHEET_OUT`). The grabber drag keeps `chThrownExit`.
- Multi-answer: check how `choice` stores several answers before drawing faces per choice (data checks, polls).

### 6.5 CSS

messages.css 766–920 (reactions, who reacted), 2844–3036 (Seen by), 3440–4067 (polls): restyle in place. Delete the phone `Modal` message-sheet rules that only the old CH-7604 sheet used, once nothing references them (grep `ch-msp-acts`, messages.css 2200–2214 and 3104–3110).

### 6.6 Tests

`__tests__/messages-polls.test.tsx`, `messages-polls-css.test.ts`, `messages-seen-by.test.tsx`, `e2e/clubhouse-polls.spec.ts`: keep green; update class names only. New: the lift lists the same rows as today's sheet for a poll, a group message of yours and theirs; Esc closes and returns focus; double-tap toggles Like once.

---

## 7. 11f Details, mute, empty, new

### 7.1 Details

- Phone `PhoneDetails` (MessagesPhone 685): pushed page on `smooth`. Header: 84 px face (64 on desktop), name, role or "Group · 6 members". Four quick actions: Search, Mute, Files, then Add (group creator) or Profile (direct with a player) or Leave (group, not creator), from today's actions. Cards: Members (first six, "See all"), Class status (coach, flag on), Shared files and media (`FilesPanel` 908), Mute.
- Desktop `Details` (MessagesView 2549): the 300 px column. Its open and close is the one layout animation (spec section 8): `grid-template-columns` on messages.css 28 as a CSS transition, 462 ms `--ch-ease-spring-smooth`, with the thread pinned to its latest message each frame (`requestAnimationFrame` calling the anchor's scroll-to-end while the transition runs). Close mid-open turns around from where it is (a CSS transition does this by itself). A grid track list only transitions between lists of the same length, so the closed state at messages.css 6 becomes `320px minmax(0, 1fr) 0px` and the open state at 28 `320px minmax(0, 1fr) 300px` (the page does the same, `redesign.css` 606–607); the details panel keeps a fixed 300 px inner width so its content never reflows while the track opens. Narrow canvas keeps today's float (1309–1330).
- `PersonRow` (MessagesPhone 878): Coach chip when `role = 'coach'`; no captain chip (data gap 6).

### 7.2 Mute: `MuteControl` (MessagesView 2759), `RowMuteModal` (500), MessagesPhone 860–870

The Mute action opens a glass menu on `lift` with today's labels: Mute 8 hours, Mute a week, Until I turn it on (or Unmute). `muteLabel` (2756) unchanged. Mute switch on the card: 320 ms `--ch-ease-spring`.

### 7.3 Empty and new

- `MessagesFirstRun` (34 lines) and `RailEmpty`: the first run inside a card with the illustration (inline SVG from the page) and New message. Still, nothing loops.
- `PhoneNewMessage` (MessagesPhone 944), `NewMessage` (MessagesView 2831): a picked name becomes a green token (scale 0.8 → 1 on `pop`), then the conversation opens. Suggestions in today's order.
- Fresh conversation: hello card (face, name, role) with three starters that fill the field and never send.

### 7.4 CSS and tests

messages.css Details (1121–1237), New (1238–1308), Mute and search (1525–…). Tests: details quick actions per conversation kind; starters fill without sending; first run shows with no conversations.

---

## 8. 11g Motion tests

New `e2e/clubhouse-messages-motion.spec.ts`, run by `playwright.clubhouse.config.ts` on `/clubhouse-preview/messages?state=design&view=thread` at 390 × 844 (phone cases) and 1440 × 900 (desktop details):

- A sampler injected with `page.addInitScript` that records, per animation frame, each tracked element's `getBoundingClientRect()` and computed opacity, keyed by a `data-mc` attribute the fixture sets on the bubble overlay, the held copy, the sheet, the attach menu, the thread wrapper and the details column.
- The judge from prototype.js `MC.judge` (1768), ported as-is: a jump is a frame moving over 10 px and over three times its neighbours' speed; a gap is an element vanishing and returning; a blink is an opacity change over 0.45 in one frame; under Reduce Motion a glide is any two frames in a row that move.
- The 11 cases from spec section 11, driven through `window.__chMsgFixture` and real pointer events.
- `test.use({ reducedMotion: 'reduce' })` for the last case.

Also add `/golf/dashboard/messages` to `ROUTES` in `e2e/golf-motion-stillness.spec.ts` (14–20), so its numbers are final on mount.

Clips: `capture.mjs clips` for the design; `recordVideo` in the same spec for the app at 390. Both into the PR.

---

## 9. Risks

| Risk | What to do |
|---|---|
| R1 Springs past the cap | `send`, `pop`, `lift` exceed D-64's 0.1 bounce. Nick signed them off on 31 Oct "as long as it's smooth": the test change in §2.2 names them, the comment records it, and 11g's motion check is the proof. |
| R2 Framer and live-start | Retarget the same `animate` on the same node; never remount to restart. Key bubbles by message id. A remount mid-send is the most likely jump; 11g's first two cases catch it. |
| R3 Lenis and spring scroll | The jump glide and the "make room" bottom go through Lenis on desktop (`scrollTo(…, { immediate: true })` per frame). A direct `scrollTop` write fights Lenis and stutters. |
| R4 `scrollHeight` inflated by transforms | Use the `maxTop` rule everywhere a bottom is computed, including `use-thread-anchor.ts`'s callers. |
| R5 The lift replaces CH-7604 | Audits and the catalog reference CH-7604; keep the code on the new root. Every row of the old sheet must exist in the menu (§6.1 test). |
| R6 Row mute read | An extra read per inbox load. It is the viewer's own rows only, one query. If review objects, drop that commit; rows draw no glyph. |
| R7 Pins are per device until 11h | 11b says so in its PR. Nick approved sync (31 Oct); 11h does it once the owner applies the held migration. Until then nothing waits on it. |
| R11 Typing channels | One realtime channel per conversation on screen. Keep the 30 cap and leave channels off screen; never join the open thread's channel a second time (§3.8). |
| R8 Contrast in dark | Your bubble 5.58 and drag times 7.80 pass; typing dots 3.62 pass only as marks. Don't put text in the dot colour. |
| R9 Phone text floor 12 px | Coins under 20 px draw colour only. The floor block (messages.css 3037) stays and covers new text. |
| R10 Other screens using Messages pieces | `MessageHits`, `Attachments`, `ReplyQuote`, `AttachButton` are exported. Grep for imports outside `screens/messages` before changing their markup. |

---

## 10. Acceptance per PR

Each PR, before review:
1. Its states (table in §0) shot with `capture.mjs app` beside `capture.mjs design`, light and dark, at 390, 430, 390 XXL and desktop 1440. Every difference listed.
2. Its motion rows (spec section 7) recorded at 390, normal and Reduce Motion, beside the design's clip.
3. Its mechanics rows (spec section 6) walked by hand, Back included.
4. Its cases from the 11 passing (11g holds the full set).
5. Typecheck, lint, unit, `clubhouse:css`, `clubhouse:catalog -- --check`, the clubhouse Playwright config.
6. Nothing deployed, migrated or flag-flipped.

## Completeness pass, 4 Nov 2026

Where the completeness additions in 05 to 08 go. Additive; the sections above stand, except that their delete steps now wait (first bullet).

### The flag, in 11a

- `config/feature-flags.yml`: add `golf_messages_redesign_v1` in the shape of `golf_clubhouse_ui` (`:862-889`), default false everywhere, `expires_at` null, `cleanup_plan` as a removal plan; `npm run flags:generate` for `src/lib/flags/registry.generated.ts`.
- `src/clubhouse/routes/messages.tsx` (21-44): `isFlagEnabled('golf_messages_redesign_v1')` alongside the existing `Promise.all`, passed to `Messages` as `redesign`. (fixed 4 Nov wiring: the function is 22-49 on 03d9087 and `isFlagEnabled` is synchronous (`src/lib/flags/is-enabled.ts:78`), so it is read before the `Promise.all`, not in it. Carry it as `redesign?: boolean` on `ChMessagesData` (`data/messages.ts:9-36`), spread in at line 49 like `canHide`, and on `ChMessagesApi` as `redesign: boolean`.)
- `Messages.tsx` sets `data-ch-ms-v2` on the root when `redesign` is true and passes it down; `MessagesPhone`, `MessagesView` and `MessagesDesktop` branch on it at the component level (new component on, today's off). The preview fixture forces it on.
- Every new rule in `styles/messages.css` and the new tokens are scoped under `[data-ch-ms-v2]`; the new tokens may also live at `:root` only if nothing in main reads them.
- The delete steps in §3.5, §4.5, §5.4, §6.5 and the gradient token step (§2.1 note) move to a cleanup PR after the flag is on in production, outside 11a to 11h.

### Per PR additions

| PR | Files | What |
|---|---|---|
| 11b | `MessagesView.tsx` `Rail`, `MessagesPhone.tsx` `PhoneInbox`, `announcements.tsx` | row leave and row bump FLIPs (M-MSG-CP-11, 12), announcements row restyle, search empty card, hidden conversations dropped from hits (filter by `hidden_at` in `searchGolfMessages`, `actions/messages.ts:1412-1440`, or client side if the action is out of scope) (fixed 4 Nov wiring: client side, in `Messages.tsx` `searchMessages` (532-553): keep only hits whose `conversationId` is in `convs`; the list RPC already leaves out a hidden conversation until a newer message brings it back, so the hits and the inbox agree, and Fairway's caller of the shared action is untouched), desktop newest-thread fallback after a failed deep link (`Messages.tsx:158-164,181`) (fixed 4 Nov wiring: 161-168 and 185 on 03d9087; `paramsDone` is set only on the first read and only when no param was given, so after a deep link it never turns true; set it true when `select(null)` runs), `badges.refetch()` after markRead and after delete (wiring 4 Nov: `useNotificationBadges()` from `src/contexts/notification-badge-context.tsx`, whose `refetch` is `fetchCounts` (294)), narrow layout lines at 720, 1100 and 1280 at XXL |
| 11c | `Bubble`, `Thread`, `PhoneThread`, `use-thread-anchor.ts` (kept) | pending label after 1000ms, failed reorder, edited mark, deleted placeholder, unread divider, older loading row and failed pill, removed pill, deep link with no slide, `role="log"` |
| 11d | `Composer`, `AttachChips`, `Messages.tsx` prefill | upload disc and spinner, attachment re-sign after 50 minutes, offline send fails at once, double-submit guard, IME guard, Esc order, field cap min(6 lines, 30% of the visual viewport), prefill against own draft toast, board chip and poll prefill |
| 11e | `polls.tsx`, reactions | discard confirm, vote rollback, closed poll, who-reacted sheet restyle, typing expiry 5s with the flag on |
| 11f | details, confirms, Add, New announcement | confirm restyle and focus rules, Leave then row leave, team channel without Delete, New announcement restyle and discard confirm |
| 11g | `messages-motion.spec.ts` | the nine interrupt cases in 07 completeness |
| 11h | `use-conversation-pins.ts` | the import and conflict rules in PIN-SYNC completeness; reads the Messages flag |

Risks added: scoping every new rule under one attribute adds specificity; the lint test (MSG-CP-03) and the flag-off screenshot run (MSG-CP-02) catch a leak. `searchGolfMessages` is a server action: if changing it is out of the lane's scope, filter hidden conversations on the client and say so in the PR body.

### Added by the lead (4 Nov)
- **11f: `?announcement=<id>`.** `routes/messages.tsx` reads `announcement` like it reads `conversation` today (fixed 4 Nov wiring: `conversation` is read on the client, in `Messages.tsx`'s deep link effect (`linkKey` 173, effect 174-238); add `'announcement'` to `linkKey` and a branch there that waits for `annLoaded`, looks the id up in `anns` (already the active team's, recipient-scoped by `getAnnouncementsWithMeta`), calls `api.selectAnn(id)` when found and toasts otherwise, then `router.replace` to the bare path as the other params do): it opens the inbox with that announcement's detail pushed (phone) or in the pane (desktop), at rest with no slide, and Back returns to the Announcements list. An id that doesn't exist, was deleted, or belongs to another team opens the inbox with "That announcement isn't available." Behind `golf_messages_redesign_v1`; with it off the param is ignored, as today.
- **Offline sends.** Today's rule stays: a send while offline fails at once and shows "Not sent" with tap to retry. No automatic queue is added.


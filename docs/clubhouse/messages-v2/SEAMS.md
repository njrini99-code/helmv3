# Messages v2 seams (B0 result)

B0 is a behaviour-free refactor: the monoliths are cut into per-package files,
the api literal is split, and the shared foundation (motion module, tokens,
spring) is in. Every path below is under `src/clubhouse/screens/messages/`
unless it starts with `src/`. Rule for A, B, C, D: edit only your files; for a
shared file, ask its owner. `MessagesView.tsx` keeps a small compatibility
barrel (types, `ConvRow`, `Attachments`, `Composer`, `useAutosize`) for tests
and older imports; no file in a package folder may import `MessagesView` (cycle
gate).

## File ownership

### Package A: inbox

`inbox/ConvRow.tsx` (ConvRow, RowMuteModal), `inbox/ConvRowButton.tsx`,
`inbox/TypingMini.tsx` (TypingMini, typersLine), `inbox/PinnedAndRecent.tsx`,
`inbox/Rail.tsx` (Rail, RAIL_KEYS, inboxContextDesktop),
`inbox/PhoneInboxV2.tsx`, `inbox/model.ts` (railTime, isUnread, filterConvs,
pinnedThreads, ChConvFilter; re-exported by `model.ts`), `api/use-inbox-api.ts`,
`pinned.ts`, `use-conversation-pins.ts`, `marked-unread.ts`,
`use-typing-by-conversation.ts`, `use-row-mutes.ts`, `message-hits.tsx`,
`RailEmpty.tsx`, `MessagesSkeleton.tsx`, `announcements.tsx`.

### Package B: thread, composer, foundation

`thread/Bubble.tsx` (shell), `thread/BubbleBody.tsx`,
`thread/BubbleReceipt.tsx`, `thread/BubbleHoverBar.tsx`,
`thread/MessageText.tsx` (MessageText, ReplyQuote), `thread/Composer.tsx`,
`thread/composer-parts.tsx` (attachments helpers, useAutosize, CharsLeft),
`thread/NewDivider.tsx`, `thread/Thread.tsx`, `thread/PhoneThread.tsx`,
`thread/ThreadScroller.tsx` (the scroll column both threads render; add the
layered-thread restructure here), `thread/model.ts` (threadItems, firstUnreadId,
ChThreadItem), `model-time.ts` (clock, dayLabel, untilLabel, sectionOf),
`thread-v2.tsx`, `use-thread-anchor.ts`, `use-thread-drag-times.ts`,
`composer-inset.ts`, `drafts.ts`, `NotifyAnyway.tsx`, `model.ts` (shared types
and the facade), `Messages.tsx` (container: state, `attempt`, `fail`,
composition only), `api/use-thread-api.ts`, `api/ctx.ts`, `api/types.ts`,
`motion/messages-motion.ts`, `shared/conv-ui.tsx` (convAvatarId, convYear,
SenderPeek, GroupMark), `src/clubhouse/lib/motion.ts`,
`src/clubhouse/styles/tokens.css`.

### Package C: overlays

`overlays/bubble-actions.tsx` (useLongPress, ReactionChip, popBadge,
`useBubbleActions`, BubbleReactBar, BubbleReactions, BubbleHoldLift),
`overlays/reactions.ts` (REACTIONS, REACTION_ICON),
`overlays/message-modals.tsx` (EditMessageModal, DeleteMessageModal),
`overlays/sheet-rows.tsx` (phone sheet rows), `hold-lift.tsx`, `seen-by.tsx`,
`ComposerPlusV2.tsx`, `api/use-overlay-api.ts` (edit, remove, reactions, react,
receipts; also `EMOJI_BY_KEY`, `KEY_BY_EMOJI`).

### Package D: polls, details, layout

`details/Details.tsx` (Details, MuteControl), `details/mute-label.ts`,
`details/NewMessage.tsx`, `details/group-modals.tsx`,
`details/PhoneDetails.tsx`, `details/PhoneNewMessage.tsx`,
`details/PhoneAnnouncementForm.tsx`, `details/phone-types.ts`,
`thread/Attachments.tsx` (photo and file content), `polls.tsx`,
`details-v2.tsx`, `files.ts`, `class-thread.ts`, `group-class.ts`,
`GroupClassLine.tsx`, `ThreadClassSection.tsx`, `ThreadClassSub.tsx`,
`HelloCard.tsx`, `MessagesFirstRun.tsx`, `MessagesNoTeam.tsx`,
`NewMessagePane.tsx`, `prefill.ts`, `MessagesScreen.tsx`, `MessagesView.tsx`
(MessagesDesktop shell + barrel), `MessagesPhone.tsx` (stack controller),
`api/use-details-api.ts`.

### The api composition

`Messages.tsx` builds one `MessagesApiCtx` (`api/ctx.ts`) and spreads
`useInboxApi`, `useThreadApi`, `useOverlayApi`, `useDetailsApi` into the one
`ChMessagesApi` object. Each slice returns `Pick<ChMessagesApi, ...keys>`, so a
key lives in exactly one file. Add a key to your slice and to `ChMessagesApi`
(`api/types.ts`, additive); never reorder or edit another slice. A slice that
needs new container state asks B to add a `MessagesApiCtx` field (one line in
`ctx.ts`, one in `Messages.tsx`). Slice assignment: inbox = pins, typingByConv,
convs*, select, search/openHit/focus*, muteOf, muteConversation, setRead,
announcements*; thread = drafts, attachmentRecovery, classDay, msgs*, typing*,
send, sendFiles, retry, discard, pending-attachment recovery; overlay = edit,
remove, reactions, react, receipts; details = attachments, polls, members*,
leave, deleteConversation, addCandidates, addMember, removeMember, files,
directory*, startDirect, createGroup, prefill, clearPrefill, mute*, setMute.
Container-owned keys (viewer, signers, timeZone, clock, now, teamName,
leaveToAsk) stay in `Messages.tsx`.

## Contracts set in B0

- `data-ch-bubble=""` is on every message-shell root: the text bubble
  (`BubbleBody`), the photo button and file anchors (`thread/Attachments.tsx`)
  and the poll card root (`polls.tsx`). `hold-lift.tsx` still finds its source
  with `.ch-ms-bub, .ch-ms-img` today; C switches it to the attribute.
- `Bubble` = shell (`PresenceRow`, avatar, stack) + `BubbleBody` +
  `BubbleHoverBar` + `BubbleReactBar` + `BubbleReactions` + `BubbleReceipt` +
  `BubbleHoldLift`. C's behaviour is `useBubbleActions` (hooks run in the old
  order, once, before the deleted early return).
- `ThreadScroller` takes `renderBubble` and `renderTyping`, so both threads
  share the loading, error, empty, day-marker and bubble list.
- Dead legacy `ComposerPlus` was removed (no callers). Left in place on purpose:
  the `<EditMessageModal message={null}>` renders and the phone `<Modal
  open={false}>` in `PhoneThread` (removal changes CH-code references; B removes
  them with the thread rewrite once the Modal is shown to render nothing when
  closed).

## Shared foundation (owner B; nobody else edits)

- **Springs.** `CH_SPRINGS.launch` (0.5 s visual, bounce 0.2; 812 ms by
  `chSpringCurve`, stiffness 110, damping 16.8) is new, with
  `motion-physics.test.tsx` updated on purpose (named exception beside send,
  pop, lift; Q-04, owner to confirm the 0.2). `--ch-ease-spring-launch` and
  `--ch-dur-spring-launch` are in `tokens.css` and pinned by that test. `send`,
  `pop`, `lift`, `smooth`, `settle`, `reveal` already matched the artifact.
- **Durations.** `CH_MS` in `lib/motion.ts` names 150 / 160 / 200 / 220 / 260 /
  480 / 520 ms (`fill`, `fillInk`, `arrow`, `field`, `receipt`, `keyboard`,
  `reveal`); `CH_KEYBOARD_EASE` is `cubic-bezier(0.32, 0.72, 0, 1)`. TSX never
  carries a literal `duration:` or timer length; CSS uses tokens
  (`--ch-dur-keyboard` 480 ms on `--ch-ease-sheet`).
- **Motion module** `motion/messages-motion.ts`: `CH_SPRINGS`, `chSpringCurve`,
  `FADE_MS` (= `CH_FADE_MS`, Q-05), `KEYBOARD_MS`, `KEYBOARD_EASE`,
  `PRESS_SCALE`, `PRESS_MS`, `MS_BEATS` (= `CH_MS`), `sheetCloseCurve` (280 ms
  house ease), `msAnimate(node, keyframes, spring | null, { live, composite,
  reduced, rd, delay, fill, timing })` (the artifact's `anim()` as WAAPI; Reduce
  Motion crossfades an opacity motion for `FADE_MS` linear, `rd: null` or no
  opacity plays nothing), `carryRunning(root, selector)` / `resume(root,
  carried)` (MOT-X-13), `springScroll(node, to | 'end', kind, reduced)`
  (MOT-JMP-3; stops on wheel, touch, pointer-down; returns the cancel).
- **Tokens added** (`tokens.css`; light and dark where they differ):
  `--ch-scrim-msg`, `--ch-card-shadow-flat`, `--ch-bubble-mine-ink`,
  `--ch-glass-blur-msg` 24 px, `--ch-glass-saturate-msg` 170%,
  `--ch-scrim-blur-msg` 14 px, `--ch-scrim-saturate-msg` 120%,
  `--ch-dur-keyboard`, `--ch-ease-spring-launch`, `--ch-dur-spring-launch`.
  Usage: `backdrop-filter: blur(var(--ch-glass-blur-msg, var(--ch-glass-blur)))
  saturate(var(--ch-glass-saturate-msg, var(--ch-glass-saturate)))` so the
  elevation test still sees `var(--ch-glass-blur)`. The Reduce Transparency and
  Increase Contrast blocks now also set `--ch-glass`, `--ch-glass-strong` opaque
  and zero the two new blurs (an accessibility change for any page reading
  `--ch-glass`/`--ch-glass-strong`, e.g. CoachHelm Ask, under those OS settings
  only).
- **`--a-*` to Clubhouse tokens** (nothing re-added; see SPEC.md Tokens table):
  page `--ch-grouped-bg`; page-2 `--ch-well-bg-flat`; recv
  `--ch-bubble-theirs-bg`; recv-ink `--ch-text-primary`; sent
  `--ch-bubble-mine-fill`; sent-ink `--ch-bubble-mine-ink` (new); surface
  `--ch-card-bg`; glass `--ch-glass`; glass-strong `--ch-glass-strong`; ink-2
  `--ch-text-tertiary` (name trap); ink-3 `--ch-crh-ink4`; accent-text
  `--ch-accent-ink`; danger `--ch-flag`; dot `--ch-typing-dot`; ring
  `--ch-ring-own`; sw-off `--ch-switch-off-ring`; scrim `--ch-scrim-msg` (new);
  card-shadow `--ch-card-shadow-flat` (new); float `--ch-shadow-float`; bubble
  shadows `--ch-bubble-theirs-shadow` / `--ch-bubble-mine-shadow`; attach tiles
  `--ch-attach-*`.

## Not split in B0: the stylesheet

`styles/messages.css` (5,958 lines) is still one file, owner B. Its rules
interleave packages (legacy and v2 generations coexist), many shared tests key
per-file baselines and read the file by name (`hairlines`, `elevation-tokens`,
`radius-steps`, `spacing-scale`, `chips-tabs`, `selected-state`,
`look-feel-pass-css`, `legacy-type-roles`, `tabular-nums`, `messages-polls-css`,
`long-lists-css`, `page-spacing`, `thread-v2-traps`, `composer-v2`,
`conv-row-seams`), and splitting without proof the cascade is unchanged risks a
visual change. Recommended method for whoever does it (first commit of B's main
package, or a follow-up seam PR): cut at root-level postcss nodes into
contiguous runs in original order (`messages.css` head, then
`messages-inbox.css`, `-thread.css`, `-overlays.css`, `-details.css`), import
all five consecutively at the three sites (`routes/messages.tsx`,
`MessagesSkeleton.tsx`, `app/clubhouse-preview/[screen]/page.tsx`), prove the
concatenation equals the original byte for byte, treat `messages*.css` as one
owner family in `scripts/clubhouse/css-owners.mjs`, mirror the `basename ===
'messages.css'` case in `scripts/clubhouse/radius-steps.mjs`, re-key the
per-file test baselines with identical totals, and run `npm run clubhouse:css --
--ratchet`. Until then each package adds new rules in a new `messages-<pkg>.css`
imported after `messages.css` and deletes legacy rules it replaces from
`messages.css` in the same PR.

# Messages v2 build plan: four implementers and one migration package

Inputs: [SPEC.md](SPEC.md) (108 MSG items), [MOTION.md](MOTION.md) (81 MOT items, 11 MC acceptance cases), [GAP.md](GAP.md) (verdict per item, code maps with line ranges, risks), [DATA.md](DATA.md) (schema, privacy, migrations M1-M8), [QUESTIONS.md](QUESTIONS.md) (defaults used when the owner has not answered). This plan assigns every item to exactly one package, gives each package disjoint files, and names one owner for every shared file.

## Why a seam wave comes first

The split A / B / C / D is only disjoint if the monoliths are cut first. Today:

- `MessagesView.tsx` (3,389 lines) holds the rail and rows (A, MV:342-737), reaction chips and long-press (C), `Bubble` (MV:1110-1534: B row + C hold/hover/reactions + D poll/attachments), the composer (B, 1777-2130), the desktop `Thread` (B, 2152-2446), modals (C/D), `Details`/`MuteControl`/`NewMessage` (D) and `MessagesDesktop` (D).
- `MessagesPhone.tsx` (1,270) holds the stack controller (D), `PhoneInboxV2` (A), `PhoneThread` (B + C), sheet rows (C/D), `PhoneDetails` and `PhoneNewMessage` (D).
- `Messages.tsx` (1,094) is one component whose single `api` literal serves all four.
- `styles/messages.css` (5,958 lines) is one sheet; `scripts/clubhouse/css-owners.mjs` only lets that one file own `.ch-ms*`/`.ch-msv*`/`.ch-msp*` classes.
- The thread is flex rows (bar, scroller, composer); the spec needs a full-page scroller with glass overlays (GAP Part B risk 1).

So the first deliverable is a behaviour-free seam PR, **B0**, owned by package B. It is a pure move plus the foundation (tokens, motion module, CSS split). A, C and D can start on whole-file work while it is in review (their primary files are not touched by B0); anything that edits a monolith waits for B0 to merge. If B0 is rejected, the fallback is to serialize: A, then D, then C, then B, each rebasing on the last (about 3x the calendar time).

### B0 contents (mechanical moves plus foundation tokens and motion module; no UI behaviour change)

1. Extract from `MessagesView.tsx` / `MessagesPhone.tsx` into new files, no logic change: `inbox/` (`ConvRow`, `ConvRowButton`, `TypingMini`, `Rail`, `PinnedAndRecent`, `PhoneInboxV2`), `thread/` (`Bubble` split into `BubbleBody`, `BubbleReceipt`, `BubbleHoverBar`; `Composer`; `Thread`; `PhoneThread`; a shared `ThreadScroller` used by both threads), `overlays/bubble-actions.tsx` (C's half of `Bubble`: `useLongPress`, lift wiring, double-tap, menu rows, `ReactionChip`), `details/` (`Details`, `MuteControl`, `NewMessage`, group admin modals, `MessagesDesktop`, `PhoneDetails`, `PhoneNewMessage`, `PhoneAnnouncementForm`). `MessagesView.tsx` and `MessagesPhone.tsx` shrink to composition shells (owner D). `check:cycles` must stay green (`MessagesScreen.tsx` exists to avoid a cycle; no new file may import `MessagesView` values).
2. Split `Messages.tsx`'s `api` literal into per-domain hook files (`api/use-inbox-api.ts` A, `api/use-thread-api.ts` B, `api/use-overlay-api.ts` C, `api/use-details-api.ts` D), composed by `Messages.tsx` (owner B). `ChMessagesApi` stays one interface; later additions are additive and live next to the domain hook.
3. Split `messages.css` by line range (GAP Part G CSS inventory) into `messages.css` (legacy and shared, shrinking), `messages-inbox.css` (A), `messages-thread.css` (B), `messages-overlays.css` (C), `messages-details.css` (D); update `css-owners.mjs`, imports and the `config/clubhouse/css-ratchet.json` baseline in the same PR. After B0 each package deletes the legacy rules it replaces in the same PR that restyles them (never add a third generation).
4. Foundation (the only package-wide edits to shared files, so nobody else touches them). Most SPEC tokens already exist (GAP Part G token table: bubble fill / theirs, typing dot, own-reaction ring, switch ring, attach tiles, glass, float and bubble shadows), so DO NOT re-add them. Add only the real gaps: `--ch-scrim-msg` (+ 14 px blur, saturate 120%), `--ch-card-shadow-flat`, Messages-scoped glass blur 24 / saturate 170% (appended to `var(--ch-glass-blur)`, which the elevation test requires), `--ch-dur-keyboard` 480 ms + its curve (reuse `--ch-ease-sheet`), `--ch-ease-spring-launch` / `--ch-dur-spring-launch`, optional `--ch-bubble-mine-ink`, and `--ch-glass` / `--ch-glass-strong` in the Reduce Transparency and Increase Contrast blocks; `launch` in `CH_SPRINGS` (`lib/motion.ts`) with `motion-physics.test.tsx` updated on purpose (Q-04); named duration constants in `lib/motion.ts` for 120 / 150 / 160 / 200 / 220 / 260 / 480 / 520 ms so TSX literals pass `clubhouse:check`; the shared Messages motion module (below).
(The layered-thread restructure is NOT part of B0: it changes behaviour, so it is the first commit of B's main package, after B0 merges, and A / C / D do not wait for it.)

### The shared motion module (owner B, consumed by A, C, D)

New file `src/clubhouse/screens/messages/motion/messages-motion.ts` (+ tests), the one place springs and motion helpers live:

- Re-exports `CH_SPRINGS` kinds (`smooth settle reveal send launch pop lift`), their `chSpringCurve(kind)` sampled curves and settle times (smooth 462; app values from `chSpringCurve`, not the artifact's solver).
- `msAnimate(node, keyframes, spring, { live, composite, reduced, rd })`: the artifact's `anim()` as WAAPI: `live` reads the node's current transform/opacity and starts from there (interrupts never jump), `composite: 'add'` stacks glides, Reduce Motion becomes a crossfade of the shared length (`CH_FADE_MS`, Q-05) or nothing when `rd: null`.
- `carryRunning(root, selectors)` / `resume(...)`: MOT-X-13, continue moving nodes across a re-render.
- `springScroll(node, to, kind)`: MOT-JMP-3 glide that stops on wheel / touch / pointerdown and reads the layout bottom, not `scrollHeight`.
- `sheetCloseCurve`, `KEYBOARD_EASE`, `KEYBOARD_MS`, `FADE_MS`, `PRESS_*` constants.
Rule for A, C, D: import motion from this module only; no literal `duration:` / `cubic-bezier(` anywhere (the gate rejects them). Until B0 lands, code against these names; the API is frozen in B0's description.

### Cross-package contracts (set in B0)

- `data-ch-bubble` attribute on every message-shell root (text bubble, photo, file, poll). `HoldLift` finds its source with it, reaction badges anchor to it, the focus ring styles it. Today `hold-lift.tsx:47-55` only finds `.ch-ms-bub, .ch-ms-img`, so polls and file-only messages open nothing.
- `overlays/`: C exports `GlassMenu` (popover variant of `Menu`/`ContextMenu`, 236 wide, `aria-disabled` items, caption line) and `MsSheet` (the Messages sheet variant: grabber, one-third close threshold, rubber band, blurred scrim). A and D consume them. Until C merges they use today's primitives.
- `api` additions: only in your own domain hook; never reorder or edit another domain's block.
- New `'use server'` actions go in a NEW file per package (only async function exports; never `export type {...}` or a type in an export specifier list; GAP Part G has the trap). Do not edit `src/app/actions/messages.ts` or `src/app/golf/actions/messages.ts` except package B for send / read, and run `npm run build` whenever any `'use server'` surface changed.

## Work packages

Each package: one branch (`agent/ch-msg-<pkg>`), one draft PR (owner preference: few larger PRs), targeted checks while iterating, the full set once at the end. Common checks: `npm run check:changed`, `npm run clubhouse:check`, `npm run clubhouse:css` (CSS ratchets run both ways: deleting legacy rules requires `npm run clubhouse:css -- --ratchet` and committing the lowered JSON), `npm run clubhouse:catalog -- --check` (regenerate `preview/component-catalog.json`, never hand-edit), unit tests next to the code in `screens/messages/__tests__/`, `e2e/messages.spec.ts`, and a docs fragment `docs/clubhouse/pages/P007-messages/changes/<date>-<slug>.md` per package (a shared-file change also needs `docs/clubhouse/changes/<date>-<slug>.md`).

### Package A: inbox, pins, search, rail

- **Owns IDs.** MSG-006, 007 (verify the unchanged phone bar and desktop shell), 101-116, 121-126. MOT-LIST-1..5, MOT-X-2, X-8, X-15, X-17. Case MC-07.
- **Files it may touch.** `inbox/**` (from B0), `pinned.ts`, `use-conversation-pins.ts`, `marked-unread.ts`, `use-typing-by-conversation.ts`, `use-row-mutes.ts`, `message-hits.tsx`, `RailEmpty.tsx`, `MessagesSkeleton.tsx` (and its two mounts: route `loading.tsx`, preview page), `announcements.tsx` (restyle, Q-37), the inbox half of `model.ts` (moved to `inbox/model.ts` in B0: `railTime`, `isUnread`, `filterConvs`, `pinnedThreads`), `api/use-inbox-api.ts`, `messages-inbox.css`, `ui/Segmented.tsx` + `lib/slide-plate.ts` and `ui/SearchField.tsx` (add Messages-scoped variants or optional props only; 56 and 16 importers), `src/clubhouse/preview/PreviewMessages.tsx` inbox states. Tests: `conv-context-menu`, `conv-row-seams` (replace selectors, do not delete), `pinned*`, `use-conversation-pins`, `marked-unread`, `typing-by-conversation`, `large-title-skeletons.test.tsx` (remove Messages from `ROOTS` with a comment), `empty-honest.test.ts` counts may only fall.
- **Delivers.** Phone inbox with no context line, Pinned card with bubblets and typing, Recent card, Segmented well, 40 px search well, 44 px faces, hairline seam from x = 16; desktop rail with Pinned / Recent labels and context line; skeleton that matches loaded heights; row menu with Pin / Unpin and dimmed "Pin up to 3" (count the channel in `atLimit`, Q-11); pin tile long-press menu (Q-39); fix the pins probe so a missing table makes one request per window not per focus (GAP Part A risk 1b); Mark as unread, mute glyph, typing dots.
- **Shared files it needs but does not own.** Push underlay constant `CH_UNDERLAY_SHIFT` (`shell/phone-chrome.tsx`): leave at 24% unless Q-26 is answered. `GlassMenu` from C.
- **Depends on.** B0. M5 (pins promotion) for server-side pins; until applied the device fallback keeps working and must keep working. M7 (search RPC) is optional.

### Package B: thread, bubbles, composer, send motion, typing, date pill, jump key, foundation

- **Owns IDs.** MSG-001-005, 009, 010, 201-213, 216-219, 222, 223, 301-311, 901-905 (MSG-902 avatars: Q-30 default keeps the neutral coin, so B only verifies sizes). MOT-SPR-1..7, MOT-R-1..6, MOT-KB-1 (MOT-KB-2 is device simulation, not built), MOT-THR-1..4, MOT-SEND-1..12, MOT-JMP-1..3, MOT-X-1, X-9, X-11, X-13. Cases MC-01, 02, 09, 11 plus a Messages motion sampler (below).
- **Files it may touch.** B0 (everything above), `thread/**`, `thread-v2.tsx`, `use-thread-anchor.ts`, `use-thread-drag-times.ts`, `composer-inset.ts`, `drafts.ts`, `NotifyAnyway.tsx`, `model.ts` (thread half: `threadItems`, `dayLabel`, `ChMsg`; runs must ignore the 5-minute gap and exclude polls), `Messages.tsx` (container; after B0 only composition), `api/use-thread-api.ts`, `src/hooks/golf/use-golf-messages.ts` (send, retry, typing, read marks; `use-golf-messages.*.test.ts` must stay green), `src/app/actions/messages.ts` and `src/app/golf/actions/messages.ts` (send / read only), `messages-thread.css`, `messages.css` (legacy remainder), `lib/motion.ts`, `motion/messages-motion.ts`, `styles/tokens.css`, `styles/base.css`, `styles/shell.css`, `styles/ui.css`, `styles/controls.css` (foundation edits only), `ui/PhoneBar.tsx` (centred conversation bar), `shell/PhoneScreen.tsx` and `src/components/providers/CapacitorProvider.tsx` (keyboard ride), `scripts/clubhouse/css-owners.mjs`, `e2e/clubhouse-messages-motion.spec.ts`, `docs/clubhouse/messages-v2` upkeep.
- **Delivers.** Layered phone thread; centred conversation bar; bubble geometry (radius 19, 6 px joins, 2 / 10 spacing, tail on last, flat green mine, `--ch-bubble-theirs-bg`); names inside first bubble and faces beside last; plain day marker; linked date pill (PILL_GAP 20); jump key (glass circle, count, 0.9 threshold); typing bubble (DM and named in groups); failed send "Not delivered · Try again" (Q-03); composer pill with the send key only with text; chips; keyboard ride on 480 ms; "words become the bubble" + `launch` flight with a fallback hook that moves the real bubble if MC-01 / 02 / 11 fail (Q-19); parallel sends (Q-33); desktop gets the same send / incoming / scroll hooks as phone (GAP Part B risk 11); the Messages motion sampler (a headed 60 Hz Playwright spec that implements the artifact's judge: teleport, flicker, Reduce Motion glides) for MC-01..11 (other packages add their cases to it).
- **Shared files it owns for everyone.** tokens, motion, CSS owners, PhoneBar, `Messages.tsx`, send / read server actions, the sampler.
- **Depends on.** Nothing for B0. M4 (private typing topic) is coordinated with its client change here.
- **Do not.** Touch `hold-lift.tsx`, `seen-by.tsx`, `ComposerPlusV2.tsx` (C), `polls.tsx`, `details-v2.tsx` (D). Remove dead code listed in GAP (legacy `ComposerPlus`, `EditMessageModal` with `message={null}`, phone `Modal open={false}`) in B0 after confirming no callers.

### Package C: overlays

- **Owns IDs.** MSG-008, 214, 215, 224, 312, 313, 401-410. MOT-HOLD-1..6, MOT-RX-1..3, MOT-TEAM-1..3, MOT-ATT-1..3, MOT-X-3, X-4, X-5, X-6, X-10, X-14. Cases MC-03, 04, 05 (sheet), 06.
- **Files it may touch.** `hold-lift.tsx`, `seen-by.tsx` (receipt pill and Seen-by faces and sheet), `ComposerPlusV2.tsx`, `overlays/**` (`bubble-actions.tsx`, `GlassMenu`, `MsSheet`, reaction chip), `api/use-overlay-api.ts`, `messages-overlays.css`, `src/hooks/golf/use-message-reactions.ts` (shared with Fairway: do not change the emoji list or return shape; add the optimistic layer in the Messages container instead, GAP Part C risk 5), `ui/Toast.tsx` (pill branch only: 1.7 s, top 62 / 18 relative to the dialog host, new copy), `ui/Modal.tsx`, `lib/sheet-drag.ts`, `ui/Menu.tsx`, `ui/ContextMenu.tsx`, `lib/use-popover-fit.ts` (all as opt-in Messages variants; 87, 15, 29, 6 importers; keep `ui/__tests__` and `motion-physics`, `sheet-drag-reduced`, `scrim-follows-sheet`, `dialog-lifetime`, `popup-layout` green). Tests: `hold` cases in `messages.test.tsx` (the hover-bar `React like` query becomes `Like`, on purpose), `composer-v2` attach rows, `seen-pill`, `messages-seen-by`, `toast-timers` (add a 1.7 s pill case), the preview steps in `PreviewMessages.tsx:247-276`.
- **Delivers.** Bubbles focusable (`tabindex=0`, ring, Enter / Space, focus returns after the lift); hold works on polls, photos and files; lift overlay with 14 px blur + saturate 120 scrim; reaction bar (six keys, `on` state); menu with the Seen-by row (privacy gate kept: coach only, Q-15); reaction badges (colour rule per Q-01, ring 2 px on a 4 px halo, `title` tooltip, `RX` order, optimistic); double-tap Like; desktop hover bar moved outside the bubble (+/-64) with the labels "Like / Love / Laugh / Reply / More actions"; attach glass menu on WAAPI `lift` with live resume; sheet system and toast copy ("Copied", "Deleted for everyone", "Sending again", "Reminder drafted. It sends only when you tap Send"); delete keeps its confirm (Q-29).
- **Depends on.** B0 (the `Bubble` split and `data-ch-bubble`). Its `GlassMenu` and `MsSheet` are the first things to merge (A and D consume them).

### Package D: polls, files, photos, details, mute, empty states, desktop layout

- **Owns IDs.** MSG-220, 221, 501-507, 601-609, 701-704, 801-804. MOT-POLL-1..4, MOT-DET-1..3, MOT-EMP-1..3, MOT-X-7, X-12, X-16. Cases MC-08, MC-10, and MC-05's poll half.
- **Files it may touch.** `polls.tsx`, `details-v2.tsx`, `files.ts`, `class-thread.ts`, `group-class.ts`, `GroupClassLine.tsx`, `ThreadClassSection.tsx`, `ThreadClassSub.tsx`, `HelloCard.tsx`, `MessagesFirstRun.tsx`, `MessagesNoTeam.tsx`, `NewMessagePane.tsx`, `prefill.ts` (imported by six other pages: keep `messagesPrefillHref`), `MessagesScreen.tsx`, `MessagesPhone.tsx` and `MessagesView.tsx` (composition shells after B0: stack controller, `MessagesDesktop`, pane switch, details column), `details/**`, `thread/Attachments.tsx` (photo and file bubble shell and content), `api/use-details-api.ts`, `messages-details.css` (including the 3-pane grid and the container threshold, Q-32), `src/app/golf/actions/message-mute.ts`, `message-attachments.ts`, `message-polls.ts` (and a new `'use server'` file for any new action), `src/hooks/golf/use-message-responses.ts`, `src/lib/golf/message-polls.ts`, `memory/features/team-communications.md`, P007 CONTRACT / DESIGN / WIRING docs, `docs/clubhouse/GO-LIVE-RUNBOOK.md` stale flag line. Tests: `messages-polls`, `messages-polls-css` (keep the column-width and dark-theme pins), the Details / mute blocks of `messages.test.tsx`, `class-thread`, `class-awareness-messages`, `attachments-load`.
- **Delivers.** Poll card and voter faces (yours first, up to 3), "Most votes" on a sole leader, no level line, header "Poll · Choose one/any", footer "N votes · Closes ..." and "See votes"; New poll sheet; Votes sheet with "Hasn't voted" and "Draft a reminder" (coach only, Q-09); photo and file bubbles per MSG-220/221 (mine file bubble is green; reserve photo height from metadata, Q-41; batch signing for details tiles); Details page and desktop column (header block, four quick actions, Members, Class status for coach viewers, Photos and files); mute menu with one toast, inbox glyph refresh and in-session expiry; first-run card, New message page with tokens, fresh-thread starters; the three-pane desktop layout at 1280.
- **Depends on.** B0; C's `GlassMenu` / `MsSheet`; M6 (next class) for the full class-status line, M5 not needed.

### Package M: migrations (no app code)

Authors and tests SQL only; the Production rollout thread applies it (`npm run db:apply -- <file>` or the Supabase MCP) after the migration reviewer signs off. Do not apply anything from this package. Detail, SQL sketches and rollback for each file are in DATA.md section 5.

- **Files it may touch.** `supabase/migrations/**` (new files only), `supabase/migrations/HELD.md` rows, `supabase/tests/rls/**` (pgTAP), `src/lib/types/database.ts` (regenerate with `npm run db:types` after apply, never by hand), `docs/clubhouse/messages-v2/DATA.md`.
- **Order (security first, then features).**
  1. `20261107090000_golf_participants_column_grants` (M1): revoke UPDATE, grant the four state columns, identity-guard trigger, revoke anon.
  2. `20261107090100_golf_conversations_messages_column_grants` (M2): same for conversations and messages.
  3. `20261107090200_golf_conversation_list_rpc_privacy` (M3): blank `participant_names` (email leak), per-user `unread_count`; same signature.
  4. `20261107090300_golf_typing_private_topic` (M4): `golf-typing:<uuid>` private topic policies. Ships together with B's client switch; keep the old topic until Fairway moves too.
  5. `20261031150000_golf_conversation_pins` (M5): promote, no new SQL; write `supabase/tests/rls/golf_conversation_pins.sql` first; apply after M1. Update HELD.md. Then A's pins hook starts using the server list and runs its one-time import.
  6. `20261107090400_golf_player_next_class` (M6): coach-only definer RPC for the Details class line.
  7. `20261107090500_golf_search_messages` (M7, optional): invoker search RPC; reaction kind CHECK NOT VALID.
  8. M8 (private per-person state table) is decision-gated and not recommended now (DATA.md Q2).
- **Verification.** Reproduce the three RLS findings on the local Docker stack in a rolled-back transaction before fixing; `npm run test:rls`; `db-migration-reviewer` on every file; after apply, re-query `pg_policies` / `column_privileges` and confirm the app writes (hide, mute, read marks, polls, attachments) still work (DATA.md section 3 lists the write sites to grep, including RPC and `service_role` writers).
- **Depends on.** Nothing; M1-M4 are independent of the UI. M5 and M6 gate parts of A and D.

## Item ownership summary (every ID exactly once)

| Package | MSG | MOT | MC cases |
| --- | --- | --- | --- |
| A | 006, 007, 101-116, 121-126 (24) | LIST-1..5, X-2, X-8, X-15, X-17 (9) | 07 |
| B | 001-005, 009, 010, 201-213, 216-219, 222, 223, 301-311, 901-905 (42) | SPR-1..7, R-1..6, KB-1, KB-2, THR-1..4, SEND-1..12, JMP-1..3, X-1, X-9, X-11, X-13 (38) | 01, 02, 09, 11 |
| C | 008, 214, 215, 224, 312, 313, 401-410 (16) | HOLD-1..6, RX-1..3, TEAM-1..3, ATT-1..3, X-3, X-4, X-5, X-6, X-10, X-14 (21) | 03, 04, 05, 06 |
| D | 220, 221, 501-507, 601-609, 701-704, 801-804 (26) | POLL-1..4, DET-1..3, EMP-1..3, X-7, X-12, X-16 (13) | 08, 10 |
| M | none | none | pgTAP |

Check: MSG 24 + 42 + 16 + 26 = 108; MOT 9 + 38 + 21 + 13 = 81 (MOT-KB-2 is listed under B but is device simulation and is not built). GAP.md's totals are the reference.

## Files with one named owner (everyone else: request, do not edit)

| File or area | Owner | Others' route |
| --- | --- | --- |
| `styles/tokens.css`, `base.css`, `shell.css`, `ui.css`, `controls.css` | B (foundation, B0 only) | all needed tokens are in the SPEC table and land in B0 |
| `lib/motion.ts`, `motion/messages-motion.ts` | B | import only |
| `styles/messages.css` legacy remainder, `scripts/clubhouse/css-owners.mjs`, `config/clubhouse/css-ratchet.json` | B; ratchet JSON regenerated by whoever lands last (fixer) | delete your legacy rules in your PR, re-run `clubhouse:css -- --ratchet` |
| `messages-inbox.css` / `-thread.css` / `-overlays.css` / `-details.css` | A / B / C / D | |
| `Messages.tsx` | B | edit only your `api/use-*-api.ts` |
| `MessagesView.tsx`, `MessagesPhone.tsx`, `MessagesScreen.tsx` | D (composition shells) | export components with stable props |
| `ui/Toast.tsx`, `Modal.tsx`, `Menu.tsx`, `ContextMenu.tsx`, `lib/sheet-drag.ts`, `use-popover-fit.ts` | C | opt-in variants only |
| `ui/Segmented.tsx`, `SearchField.tsx` | A | |
| `ui/PhoneBar.tsx`, `shell/PhoneScreen.tsx`, `CapacitorProvider.tsx` | B | |
| `shell/phone-chrome.tsx` (`CH_UNDERLAY_SHIFT`) | nobody until Q-26 | |
| `src/app/actions/messages.ts`, `src/app/golf/actions/messages.ts` | B (send / read only) | new `'use server'` file per package |
| `use-golf-messages.ts` | B | |
| `use-message-reactions.ts` | C (shared with Fairway) | |
| `ui/Avatar.tsx` | nobody (Q-30) | |
| `preview/PreviewMessages.tsx`, `messages-design-cast.ts`, `component-catalog.json` | B for the file; each package adds its states in its own section; catalog regenerated, never hand-edited | |
| `src/clubhouse/__tests__/messages.test.tsx` (shared, very large) | no one rewrites it; each package edits only the assertions GAP lists for its slice and adds new tests under `screens/messages/__tests__/<pkg>-*.test.tsx` | |
| Catalog `docs/clubhouse/catalog/messages.md` and CH codes | the package that adds or retires the code; naming tests live in the flat `src/clubhouse/__tests__/` | |
| `src/lib/types/database.ts`, `supabase/**` | M | |
| `memory/features/team-communications.md`, P007 CONTRACT / DESIGN / WIRING | D at the end, from every package's docs fragment | |

## Order, merge train and acceptance

1. In parallel from day one: M (M1-M4 authored, reproduced, reviewed), B0 (seam PR), and the whole-file work of A / C / D.
2. Merge train (owner preference: one PR per package, batched): M1-M4 and M5 migrations (applied by rollout), B0, C's `overlays` primitives, then A and D, then B's remainder (thread restructure, send choreography), then an integration PR.
3. Integration: run the sampler on all 11 MC cases in a headed browser at 60 Hz or better (Safari/WebKit first per owner preference; Chromium only for CPU throttling or traces, and say so); test the keyboard ride on a device or the Simulator (`helm-safari-performance`, `scripts/phone/`); check every hash state from SPEC (`#inbox` ... `#fresh`) at phone 390 and 430, desktop 1280, light and dark, Reduce Motion, XXL; contrast table; `npm run build` for any `'use server'` change; `npm run test:e2e -- e2e/messages.spec.ts`; `npm run docs:check`; `release:status` before saying anything is live.
4. Done means: every MSG / MOT item in GAP.md is DONE, or CONFLICTS / PARTIAL with an owner answer in QUESTIONS.md, legacy CSS for replaced pieces deleted, dead code removed, ratchets lowered not raised, no test weakened (tests that pin an old requirement are changed on purpose and named in the PR).

## Top risks

1. RLS / grant holes (DATA.md section 3): likely cross-conversation read by re-pointing a participant row; email leak in the list RPC; public typing topic. Not exploited in the audit. Ship M1-M4 first and reproduce before fixing.
2. Merge hazards: `Bubble`, `Thread` / `PhoneThread`, `Messages.tsx` `api`, `messages.css`. The seam wave exists for this; skipping it makes four packages collide on the same 400-line functions.
3. Gates the design trips: literal durations and `cubic-bezier(` bans, `no-layout-motion` on the details column (Q-27), two-way CSS ratchets, `motion-physics.test.tsx` and the 0.1 bounce cap for `launch`.
4. Send choreography and keyboard: clone flight vs real bubble (Q-19), serialized sends (Q-33), layout-based native keyboard resize with a fixed 480 ms assumption, Safari `visualViewport` path; needs a device and a headed 60 Hz sampler.
5. Pins and desktop breakpoint: production has no `golf_conversation_pins` (device-only pins), the channel counting rule, and the 1101 px canvas threshold that makes the drawn 1280 desktop render the legacy panel.

# Messages: acceptance

> Wiring, 4 Nov 2026: see the section of that name at the end of this file (W-MSG-1 to W-MSG-21).

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 69 criteria, MSG-CP-01 to 69, with PR owners; 4 criteria fixed in place).

Design page: `redesign/clubhouse-messages.html` (page v12; published at https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev). Screen IDs and state matrices: `05-SCREENS.md`. Element specs and redlines: `06-SCREEN-SPECS.md`. Motion rows M-MSG-01 to 33: `07-MOTION.md`. Fields: `03-DATA-CHECKS.md`. File map: `02-PLAN.md`. Where this file and `04-FIDELITY-SPEC.md` disagree, this file wins and 04 gets a pointer (BUILD_CONTRACT_STANDARD).

This file replaces the earlier draft `redesign-package-src/acceptance/messages.md` (criteria 1 to 90, Parts 1 to 6). Its good criteria are kept; where one came from that draft its old number is in brackets, e.g. [d18]. It is corrected as follows: the phone inbox has no large title; the `reply` route is the reply chip above the field, not an arrival; the row menu and the poll composer are drawn (`rowmenu`, `pinlimit`, `pollnew`); there are 34 routes, not 22; pin sync is PR 11h with defaults D1 to D9, and the draft's pin criteria 81 to 90 (marked "plan pending") are replaced by MSG-PIN-01 to 10, which follow `pin-sync/PIN-SYNC.md`; Seen by is open to any sender, not coaches only; Reduce Motion typing dots are static at full opacity. It is written against design page v15 (v14 plus ruling 30, the hidden time column at 430) and the rulings of 4 Nov (`SETTLED-4NOV.md`, cited as "ruling N"), with measurements rerun on v14 (`meas/all.json`, `w430.json`, `xxl.json`, `w1280.json`, `hover.json`, `meas/auto06.md`). No criterion was renumbered; new criteria take the next free number in their group.

## How to use this file

Each criterion is one fact a reviewer marks **pass** or **fail**. "Check" says how: **S** a screenshot pair from `capture.mjs`, **D** a DOM, unit or e2e test, **C** a motion clip pair from `capture.mjs --motion`. Nothing here is a wish: if a criterion can't be marked from a screenshot, a test or a clip, it is wrong and gets fixed in this file.

Numbering: `MSG-<SUFFIX>-NN`, where the suffix comes from the screen ID (S-MSG is `LIST`, S-MSG.row-menu is `ROWMENU`, and so on; the list is in each heading). Cross-screen criteria are `MSG-ALL-NN`, motion and interrupts `MSG-MOT-NN`, roles and data `MSG-ROLE-NN`, surfaces kept but not drawn `MSG-KEPT-NN`, pin sync `MSG-PIN-NN`.

A capture state is `<route>-<phone|desk>[-w430|-xxl|-w1280]`; the theme is a separate part of the file name (`screenshots/<ID>__<state>__{design,app}__{light,dark}.png`). Sizes: `phone` 390 × 844, `phone-w430` 430 × 932, `phone-xxl` 390 at Text Size 23/17 (1.353), `desk` 1440 × 900, `desk-w1280` 1280 × 800. Every still is shot with Reduce Motion on so nothing is mid-move; Reduce Motion behaviour is proved by the `__reduce` clips. Numbers are CSS px at Text Size default and are read off the page's computed styles (`scratchpad/meas/auto06.md`, `all.json`, `w430.json`, `xxl.json`, `w1280.json`, `hover.json`).

## Shared criteria

SHARED-1 to SHARED-12 (`ACCEPTANCE-SHARED.md`) apply to every PR in this lane and are not restated. Lane notes on six of them:

- **SHARED-1.** The phone list has no large title. On top is today's green `TopBar` with the "Messages ⌄" switcher and the bell; a conversation uses today's `PhoneBar` row (back, face, name, role, info). The 26pt "Messages" title exists only in the desktop rail. 04 §5's "Large title" for `inbox` is right for desktop only.
- **SHARED-2.** On the phone three kinds of text sit straight on the page, all allowed: the context line, the times revealed by dragging (01-BRIEF), and the details header (name and line), which is the screen's large title and its context line (ruling 7). The group typing caption is gone: the typer's name sits inside the typing bubble (ruling 6, MSG-TYPING-02). The group coin's gradient is avatar art, not page chrome (ruling 13).
- **SHARED-4.** Text target 4.9:1, floor 4.5:1; marks 3:1. Every measured text pair on the page clears 4.9 in both themes (lowest: 5.58, ivory on the dark sent green). On v14 every mark clears 3:1 in both themes (rulings 2, 3, 11); MSG-ALL-07 lists the pairs.
- **SHARED-5.** The capture script sets `--ch-type-scale` 1.353 (`MAX_SCALE`, `lib/dynamic-type.ts`) and the page's XXL is the same 23/17, so XXL pairs compare like for like.
- **SHARED-6.** The design page draws its Reduce Motion fade as 120ms. The build uses `CH_FADE_MS` from `lib/motion.ts`: 180ms, opacity only, linear, pinned by `reduced-motion.test.tsx`. Every Reduce Motion check here uses 180ms, and the 120 to 180 difference in a `__reduce` clip pair is listed as "matches the shared value", not a failure.
- **SHARED-7.** v14's `-w430` frames draw a 20pt edge, as today's app does (`--ch-page-x-phone` is `--ch-space-5` at min-width 414px). Measured in `w430.json`: the context line, the segmented control and every card sit at x 20, 390 wide, at 430; at 390 they sit at x 16 (ruling 1). The 430 pair compares like for like; MSG-ALL-12 lists the values.

One mechanic, said once: the page cancels a hold when the finger moves more than 8px; 04 §6 rules that the build keeps today's 10px slop. That is not an error. Every criterion below uses 10px.

## Common states

Every screen ID is checked in these states unless its own section says otherwise.

| State | Capture state | Rule |
|---|---|---|
| default | `<route>-phone`, `<route>-desk` | As drawn, fixture `?state=design&view=<route>` |
| loading | `loading-phone`, `loading-desk` (S-MSG only) | Drawn for the inbox only. Elsewhere not drawn: today's skeleton or spinner, restyled with the same tokens, final shapes so nothing jumps |
| empty | `empty-*` (no conversations), `fresh-*` (no messages) | As S-MSG.empty and S-MSG.fresh |
| failed | `failed-*` (a bubble not delivered) | Drawn for the thread only. Elsewhere not drawn: today's failed fixtures (`failed`, `thread-failed`, `files-failed`, `add-failed`, `ann-failed`) restyled, today's copy |
| long text | `longinbox-*`, `long-*` | Longest names and a long message with a long link |
| XXL | `<route>-phone-xxl` | Nothing clips (SHARED-5); rows grow |
| dark | any state, dark theme | Dark tokens, 04 §2 |
| Reduce Motion | every still; `--motion <M-ID>` `__reduce` clips | 07's Reduce Motion column; SHARED-6 |
| phone 390 | `<route>-phone` | 16pt edge |
| large phone 430 | `<route>-phone-w430` | 20pt edge (SHARED-7 note above) |
| desktop 1440, 1280 | `<route>-desk`, `<route>-desk-w1280` | Rail 320, thread, details 300; `times` has no desktop state |

## Cross-screen

- MSG-ALL-01. `styles/tokens.css` holds the new tokens with these values, light / dark: `--ch-bubble-theirs-bg` #FFFEFB / #232925, `--ch-bubble-mine-fill` #155A39 / #1F6B45 (flat, no gradient), `--ch-bubble-radius` 19px, `--ch-bubble-join` 6px, `--ch-poll-bar` rgb(21 90 57/.1) / rgb(124 199 155/.12), `--ch-poll-bar-on` rgb(21 90 57/.2) / rgb(124 199 155/.24), the two bubble shadows as `filter` values, and `--ch-ease-spring-send`, `-pop`, `-lift` as `linear()` strings equal to `chSpringCurve(kind).linear`. [d1] Check: D.
- MSG-ALL-02. No element in Messages uses `--ch-bubble-mine-bg` (the gradient) after 11c, and no text sits on a gradient. (fixed 4 Nov: with the flag on; the token itself stays until the cleanup PR, because with the flag off main still uses it, MSG-CP-04.) Check: D (grep test).
- MSG-ALL-03. No text under 12px renders on the phone (the `messages.css` floor block stays and covers new text). Faces under 20px (Seen by 16, poll voters 18) draw colour only, no initials. File tiles are an `aria-hidden` icon; the subtitle carries the type. [d3] Check: D (computed `font-size` of every text node at 390), S.
- MSG-ALL-04. Faces use PR 7's class-year fills through `gradYear` on `ChPerson`; coaches and unknown years keep the neutral coin; no per-person hues; no Captain chip anywhere. Initials are 600 weight at 0.38 × face size in #FDFCF8 (light and dark), never under 12px: the 30 group face draws 12px initials, not 11.4 (ruling 5). [d4] Check: D (computed `font-size` on a 30 face is 12px), S `team-phone`.
- MSG-ALL-05. Glass (blur 24, saturate 170; attach 28) only on the desktop bar, composer, menus, reaction bar and attach menu; blur 16 to 18 on the jump key, date pill and toast; never on a bubble or a card. The hold scrim is `--a-scrim` under `blur(14px) saturate(120%)`, set once; only its opacity animates. [d5] Check: D (computed `backdrop-filter`), S.
- MSG-ALL-06. Focus rings are 2px, offset 2 (bubbles offset 3). The bubble focus ring is the deeper champagne, #8C703A light, #C9AD74 dark (ruling 3; MSG-ALL-07). Desktop Tab order: rail, thread, composer, details. [d6] Check: D.
- MSG-ALL-07. Every mark clears 3:1 in both themes (SHARED-4), at v14's measured values:
  - Typing dots (rows, pins and the thread bubble): #7A766C light, 3.97 on the page #F2F0E9, 4.49 on paper #FFFEFB, 4.08 on the selected-row wash #F4F3F0; #827D71 dark, 4.60 on the page, 4.12 on the rail #191E1A, 3.55 on the wash #262A26, 3.62 on the bubble #232925 (ruling 2). PR 11d adds `--ch-typing-dot`: #7A766C light, `var(--ch-ink-400)` (#827D71) dark; `--ch-ink-400` itself does not change, because the scrollbar and heat-map ring use it. No dot draws #8F8B81.
  - Champagne ring (bubble focus and your own reaction): `--ch-ring-own` #8C703A light, 4.10 on the page and 4.63 on paper; #C9AD74 dark, 8.73 on the page (ruling 3). Your own reaction's ring is always measured against the page, because it sits on the page-colour halo (MSG-REACT-04).
  - Switch off track ring: `--ch-switch-off-ring` #8F8B81 light, 3.37 on the card; #827D71 dark, 4.12 (ruling 11; MSG-MUTE-04).
  Check: D (`contrast-tokens.test.ts` holds each pair), `node meas/cc.mjs` for the page side.
- MSG-ALL-08. Every control drawn under 44pt reaches 44 × 44 with a transparent `::before` inset or a `min-height`, and its drawn shape does not change: New and compose 40, segmented 32 tall, composer + and send 36, field 36, reaction bar keys 40, menu items 42, sheet header buttons 33 to 40, starters 33, Seen by pill 22, failed pill 22, poll "See votes" 25, file chip close 26, desktop tools 40, ghost button 31, phone bar `.who` 41, jump key 40, details close 40. The one exception is the desktop hover bar's keys (27), pointer only, at least 24 (WCAG 2.5.8), every action also in the context menu and keyboard. Check: D (hit box of each at 390 and 1440).
- MSG-ALL-09. Every element the page hides is hidden in the app: an element with the `hidden` attribute computes `display: none`, and the document renders in standards mode. (Trap 4: the page's local copy rendered in quirks mode with no `[hidden]` reset, so hidden items showed.) Check: D (`document.compatMode === 'CSS1Compat'`; every `[hidden]` computes `none`).
- MSG-ALL-10. Contrast pairs are in `__tests__/contrast-tokens.test.ts`, light and dark, text at 4.9 target (4.5 floor), marks at 3.0. Check: D.
- MSG-ALL-11. There is no per-conversation URL. Opening, switching or closing a conversation, or opening details, leaves `location.href` at `/golf/dashboard/messages` unchanged; the open conversation is view state. Default S9. (fixed 4 Nov: inbound `conversation`, `player`, `user`, `compose` and `prefill` keep today's handling in `Messages.tsx`; this criterion is about in-app navigation, MSG-CP-46.) Check: D (e2e reads the URL before and after).
- MSG-ALL-12. Edges at 430 and up (ruling 1): page edge 20 for the inbox top, context line, search, segmented control, cards, section labels, details, sheets and the empty state (x 20 at 430 against x 16 at 390, `w430.json`); the root bar's switcher has padding-left 20; thread side padding 16 (12 at 390); composer edge 14 (10 at 390); attach menu left 16 (12 at 390); jump key right 18 (14 at 390). Check: S every `-w430` state, D (computed padding at 390 and 430).
- MSG-ALL-13. Today's strings are checked by a test against today's source, not retyped (ruling 19): the failed line "Not sent" and its retry (MSG-THREAD-14), the mute labels and mute toast lines (MSG-MUTE-01, 03) and the members row "See all" (MSG-GROUPDET-01). The test imports or reads the string from today's component and asserts the new markup renders the same text; it fails if either side changes alone. Check: D.

## Per screen

### S-MSG (inbox) · `LIST`

Routes `inbox`, `longinbox`, `loading`, `rowtyping`. Design `#inbox-phone-light-shot`.

Layout, phone
- MSG-LIST-01. Top to bottom: today's green bar ("Messages ⌄" switcher 17/600, bell 44 with its count badge), the 16pt lip, the context line, the search row, the segmented control, the Pinned card, the Recent card. No large title on the phone. Check: D (order), S `inbox-phone`.
- MSG-LIST-02. Context line 15/19.9 400, `--ch-text-secondary`, top at y 74 in the shot (bar 50 + lip 16 + 8), reads "{n} unread · {team name}" ("3 unread · Demo University Golf"); with no team name, the count alone. Contrast 8.64 / 11.45. Check: D, S.
- MSG-LIST-03. Search well 310 × 40 at 390, padding 0 11, radius 12, gap 8, text 16/400 secondary (8.96 / 10.87), icon 17. New key 40 round beside it, icon 19 accent (8.15 / 8.45); hit area 44 (MSG-ALL-08). Search top at y 104. [d8] Check: S.
- MSG-LIST-04. Segmented well 358 × 38, padding 3, radius 10, three segments All / Unread / Groups; thumb 117.3 × 32 radius 8 (width (100% − 6) / 3); labels 14/500, selected 600 primary (15.66 / 15.20). Top at y 166. Check: D (three buttons, `aria-pressed`), S.
- MSG-LIST-05. Pinned card renders only when at least one conversation is pinned: 358 wide, radius 16, title "Pinned" 17/22.1 600 −0.01em padding 14 16 10; up to three pins 110 × 103.6 (123.3 at 430) padding 10 4 9, radius 18, gap 7; face 62; label 13/500 one line with ellipsis (first name for a direct thread, title for a group). Card top at y 222. [d10] Check: D (absent with no pins), S.
- MSG-LIST-06. Pin initials are 23.5px 600 (0.38 × 62) in #FDFCF8 (6.10 on the demo coin), never the 13px label style. (Trap 2: the page's pin initials inherited the 13px label style at 2.75:1.) Check: D (computed size and weight), S.
- MSG-LIST-07. Pin bubblet 92 × 23, padding 4 8, radius 11, text 12/15 500 secondary (9.77 / 10.25), one line with ellipsis, shows `lastText` only for a direct thread whose last message is theirs. The third pin's bubblet is anchored to its right edge and stays inside the card: its right edge ≤ the card's right edge minus 8 at 390, 430 and XXL. (Trap 3: the third bubblet overflowed the card.) [d11] Check: D (bounding boxes), S.
- MSG-LIST-08. Recent card: title "Recent" with the count at the right 15/400 secondary (9.77 / 10.25). Rows padding 10 16, gap 12, face 44, 64 tall with a one-line preview and taller with two; hairline inset 16. Name 16/20.8 600 −0.01em, one line with ellipsis; time 13/400 tabular tertiary (6.61 / 6.99); preview 15/19.5 400, at most two lines then ellipsis, primary when unread, secondary otherwise. Card top at y 400 with three pins. [d12] Check: S.
- MSG-LIST-09. Unread dot before the name in `--ch-accent` (mark 8.15 / 8.45 on the card). Mute glyph 13 after the name, tertiary (6.61 / 6.99), only on a muted conversation. Check: D, S.

Layout, desktop
- MSG-LIST-10. Rail 320 wide on `--ch-grouped-bg` with a 0.5px right hairline: h3 "Messages" 26/31.2 600 −0.034em (15.10 / 16.01), the 40 New key beside it, context "{n} unread · {n} conversations" ("3 unread · 7 conversations") 15/400, search 287 × 40, segmented 287 × 38 (thumb 93.7). Flat and continuous: section labels "Pinned" and "Recent" 13/600 secondary (8.64 / 11.45), padding 0 18; rows 303 wide, inset 8, radius 12, padding 9 10, face 40; the selected row washed (#E7E5DF / #1C1F1B); no cards on the rail. Eli's thread open on the right. [d66] Check: D (computed `grid-template-columns` first track 320), S `inbox-desk`, `inbox-desk-w1280`.

States
| State | Capture | Criterion |
|---|---|---|
| loading | `loading-phone`, `loading-desk` | MSG-LIST-11. Phone: a card with a 64 × 11 title bar and rows of a 44 face, a 124.2 × 11 line and a 210.6 × 9 line, radius 6, fill #EBEAE7 / #2C312C. Desktop: 56 × 11 section bars, 40 faces, 106.3 and 180.2 lines, fill #DFDDD6 / #222622. All `aria-hidden` inside one `role="status"` labelled "Loading conversations". Skeleton heights match the loaded rows within 8pt. |
| long | `longinbox-*` | MSG-LIST-12. Names stay on one line with an ellipsis; previews wrap to two lines then ellipsis; times never move under the name. |
| typing in a row or pin | `rowtyping-*` | MSG-LIST-13. The row preview swaps to three 5px dots; a pin's bubblet becomes 37 × 23 with the dots. A group row with one typer shows dots only, no name. With two typers the preview reads "Maya and Owen are typing", with three or more "Several people are typing" (05's default, kept by ruling 6). Dots hide 5s after the last typing event and clear when a message arrives. [d13] |
| empty | `empty-*` | S-MSG.empty. |
| XXL | `inbox-phone-xxl` | MSG-LIST-14. Context line 20.3px wraps, never clips; rows grow (77.5 with one preview line, 103.9 with two); pins grow to 109.1; the search well and segmented keep 40 and 38 and their text never clips. |
| 430 | `inbox-phone-w430` | MSG-LIST-15. 20pt edge; pins widen to fill the card. |
| dark, desktop | as common | Common rules. |

Contrast: context line 8.64 / 11.45; search 8.96 / 10.87; card title 17.08 / 14.34; row name and unread preview 17.08 / 14.34; time 6.61 / 6.99 (desktop rail 5.85 / 7.80); bubblet 9.77 / 10.25; bar title on green 12.03 / 16.12; bell and chevron 8.88 / 11.52.

Roles and data
- MSG-LIST-16. Context count is conversations with `c.unread > 0 || c.markedUnread`; desktop adds `convs.length` (03 Inbox). Row time from `railTime`; preview from `lastText` with "You: " when the viewer sent it and the sender's first name in groups (today's rule). Check: D against the fixture.
- MSG-LIST-17. The mute glyph comes from the viewer's own `notification_level` and `muted_until` (one read of the viewer's own participant rows, its own commit, mapped with `isConversationMuted`) and refreshes after muting. [d14, d78] Check: D.
- MSG-LIST-18. Tap a row or pin: phone pushes the thread; desktop selects it. [d15] Check: D.

Motion: M-MSG-01, 02 (push from a row or pin), M-MSG-30 (typing dots in rows and pins, on CSS `ease` as drawn; the thread bubble's dots keep their own curve, ruling 26), M-MSG-31 (skeleton pulse `skp` 1.4s, opacity 1 ↔ 0.55; off under Reduce Motion).

### S-MSG.unread · `UNREAD`

Route `unread`.

- MSG-UNREAD-01. The thumb sits on Unread; the list shows three rows in the fixture; the card title reads "Unread" with its count. [d16] Check: S `unread-phone`, `unread-desk`.
- MSG-UNREAD-02. Rows that stay glide to their new y on `smooth`; rows that leave fade; the thumb slides 360ms `--ch-ease-spring`. A second tap mid-move retargets from where things are. Under Reduce Motion the thumb jumps and rows crossfade over `CH_FADE_MS`. [d9] Check: C `--motion M-MSG-03`.
- MSG-UNREAD-03. Unread is `isUnread(c)`; Groups is `c.group || c.channel` (03). Check: D.

States: no state of its own beyond the common rules; long, XXL, dark, 430, desktop as S-MSG.

Motion: M-MSG-03.

### S-MSG.row-menu · `ROWMENU`

Routes `rowmenu`, `pinlimit`. Drawn (correction to the earlier draft, which said not drawn).

- MSG-ROWMENU-01. Long-press a row (phone, 450ms, 10px slop) or right-click it (desktop) opens a glass menu 236 × 222, padding 6, radius 18, items 224 × 42, padding 8 12, radius 12, gap 10, text 15/18 500 primary (16.50 / 14.28). Rows as drawn, in the page's order: Open conversation, Pin (Unpin when pinned), Mark as unread (Mark as read when unread), Mute…, Delete conversation. Delete conversation is danger red, `--ch-flag` #B3261E / #F28B7D, 6.26 / 7.03, as Delete in the hold menu (ruling 8; `auto06.md` row menu). Every row of today's menu remains. Check: D (row labels and order), S `rowmenu-phone`, `rowmenu-desk`.
- MSG-ROWMENU-02. With three pinned, Pin is dimmed, `aria-disabled="true"`, and shows "Pin up to 3" under it in 12.5/16.2 500 tertiary (6.39 / 6.96); nothing unpins by itself (D7). [d17] Check: D, S `pinlimit-phone`.
- MSG-ROWMENU-03. Pins are per viewer and team, max 3, kept in `pinned.ts` (key `ch:msg:pinned:<viewer>:<team>`) until PR 11h; ids no longer in `convs` drop out; storage errors are swallowed. Check: D (`pinned.test.tsx`).
- MSG-ROWMENU-04. Delete conversation keeps today's confirm and behaviour; the row leaves with opacity 0 and scale 0.92 over 180ms (M-MSG-27). Check: D, C by hand.

States: XXL (items grow; the menu stays on screen), dark, 430, desktop as common; loading, empty and failed n/a (opened from loaded rows). No pin toast exists before PR 11h; 11h adds exactly the two lines in MSG-PIN-05.

Motion: M-MSG-26 (menu .8 → 1 on `lift`, closes 160ms fade), M-MSG-27 (delete row).

### S-MSG.new · `NEW`

Route `new`.

- MSG-NEW-01. Phone: green bar with "Cancel" in champagne 17/400 (8.85 / 9.87) at the left and "New message" 17/600 on-green (12.03 / 16.12) centred. A card with "To:" 16/500 secondary (9.77 / 10.25) and the field; a Suggested card, rows 52 tall, padding 7 16, gap 12, face 32, name 14.5/600 (17.08 / 14.34), line 13/500 (9.77 / 10.25). Check: S `new-phone`.
- MSG-NEW-02. Desktop: in the thread column, a glass bar with the title "New message" 15/600 primary (16.31 / 15.13) and a "Cancel" text button 17/500 accent (7.79 / 8.92); the To card 848 wide; Suggested card titled "Suggested" with "Players you haven't messaged" at the right. The title is one line in the bar, not 1.1:1 (Trap 1, MSG-THREAD-12). Check: D (title contrast), S `new-desk`, `new-desk-w1280`.
- MSG-NEW-03. Picking a name makes a green token (scale 0.8 → 1 on `pop`), then the conversation opens. Suggestions keep today's order (coaches first, then players by name); the page's five are placeholders. [d64] Check: D, C `--motion M-MSG-22`.
- MSG-NEW-04. The To field is a real input; its caret is the browser's. No drawn `.caret` element ships and M-MSG-32 has no motion row to build (the page draws one because its field is a mock; ruling 21). Check: D.

States: long (long names wrap to two lines in a suggestion row), XXL, dark, 430, desktop as common; loading, empty, failed n/a (directory already loaded).

Motion: M-MSG-22, M-MSG-32.

### S-MSG.empty · `EMPTY`

Route `empty`.

- MSG-EMPTY-01. First run: one still card 358 wide (desktop 360), padding 26 20 20, radius 16, gap 10, with the inline illustration; title "No conversations yet" 20/25 600 −0.015em; body 15/21.7 secondary (9.77 / 10.25); primary pill "Start a conversation" 44 tall, padding 0 18, 15/600 ivory on green (8.01 / 5.58), icon 18; ghost "Message the team" 14.5/600 accent (8.15 / 8.45), hit area 44. [d63] Check: S `empty-phone`, `empty-desk`.
- MSG-EMPTY-02. Shows only when `convs.length === 0` and not loading; "Demo University Golf" in the body comes from `teamName`. Nothing on the card loops or animates. Check: D.
- MSG-EMPTY-03. The card carries no "CH-7301" text: it was a design annotation (the component code), not app copy (ruling 12). Check: D (the card's text content has no "CH-7301").

States: XXL (body wraps; the card grows), dark, 430, desktop as common; loading is S-MSG's loading.

Motion: none on the card. Start a conversation opens S-MSG.new (M-MSG-22).

### S-MSG.fresh · `FRESH`

Route `fresh`.

- MSG-FRESH-01. Hello card 366 wide on phone (704 desktop), padding 22 16 18, radius 16, gap 8: face 72, name 19/22.8 700 −0.015em (17.08 / 14.34), line "{role} · No messages yet" 15/500 secondary. Three starters, pills padding 8 12, radius 999, text 14/16.8 500 primary on the well (15.66 / 15.20), hit area 44. For a coach viewer the starters are the page's three. [d65] Check: S `fresh-phone`, `fresh-desk`.
- MSG-FRESH-02. A starter fills the field and focuses it; it never sends. The send key then springs in (M-MSG-06). Check: D (no send call), C `--motion M-MSG-23`.
- MSG-FRESH-03. A player viewer sees exactly three starters, in this order: "Can we find time to talk this week?", "Here's my round from today", "Quick question about practice", in the same pills; none of the coach starters render for a player. They follow MSG-FRESH-02 (fill, never send). Default S6. Check: D as demo player (labels, order, no send call).

States: long (a starter wraps inside its pill), XXL, dark, 430, desktop as common.

Motion: M-MSG-23, M-MSG-06.

### S-MSG.thread · `THREAD`

Routes `thread`, `failed`, `long`. Design `#thread-phone-light-shot`.

Layout
- MSG-THREAD-01. Bubbles radius 19, joins 6 on the side facing the run, padding 7.5 13 (× Text Size), text 16/21.1 400 −0.005em on phone, 15/19.8 on desktop. Max width 278.2 at 390 (76% of the 366 thread), `min(520px, 72%)` on desktop inside a 760 column with side padding 28. [d18] Check: D (computed radii per run position), S.
- MSG-THREAD-02. Run spacing: 2 between bubbles of a run, 10 before a run, 16 above a bubble with reactions. Tail 18 × 20 SVG (`viewBox 0 0 18 20`, path `M0 0h12c0 9 1.6 14.5 6 20-5.2.3-9.8-.9-13.4-3.6L0 20z`), at the bottom outer corner, −5px outside, mirrored for theirs, on the last bubble of a run only. [d19, d20] Check: D, S.
- MSG-THREAD-03. Theirs: `--ch-bubble-theirs-bg` with the receive filter shadow (17.08 / 12.58). Yours: `--ch-bubble-mine-fill` with the lit top edge (inset 0 1px 0 rgb(255 255 255/.14)) and the green filter shadow (8.01 / 5.58). Check: D, S.
- MSG-THREAD-04. Day pill padding 4 11, radius 999, card shadow, 13/16.9 500 secondary (9.77 / 10.25) with the time in 400 ("Thursday 5:48 PM"), 18 above, 10 below. [d22] Check: S.
- MSG-THREAD-05. No time line under a non-latest run. Your latest message carries the receipt pill "Seen 8:15 AM" 94.8 × 22.3, padding 3 9, radius 999, 12.5/16.2 500 secondary (9.77 / 10.25). Check: D, S.
- MSG-THREAD-06. Photo bubble 242 × 176, padding 3, the image 236 × 170 radius 16, in today's fixed 4:3 frame (`ImageAttachment`). Check: S.
- MSG-THREAD-07. Phone bar (today's `PhoneBar`): back 44, `.who` 90.9 × 41 (hit 44), face 36, name 17/20.4 600 on-green (12.03 / 16.12), role 13/15.6 400 at 86% (8.88 / 11.52), info 44. Check: S, SHARED-1 bar diff.
- MSG-THREAD-08. Thread top padding in the shot is bar + lip + 12; thread bottom padding is the composer height + 16 (`--ch-ms-comp-h`). Check: D.
- MSG-THREAD-09. Direct thread fixture: two days, a photo, Like and Love badges, your last message with "Seen 8:15 AM". [d25] Check: S.
- MSG-THREAD-10. Swipe a bubble right replies (today's). Swipe left on one bubble no longer shows its time; the whole thread drags instead (S-MSG.times). [d26] Check: D.
- MSG-THREAD-11. Desktop bar: glass over the thread, `.who` with face 36, name 15/18 600 primary (16.31 / 15.13), role 12.5/15 500 tertiary (6.32 / 7.38), then Search and Details keys (40, hit 44) at the right. The hairline under it shows only with content under it (opacity, 200ms). [d24] Check: D, S `thread-desk`.
- MSG-THREAD-12. Trap 1: the conversation bar's styles are scoped to the Messages bar and do not touch the shell's glass canvas bar (`header.glass.top`). The bar is one row: name and role at the left, Search and Details at the right (never beside the name), and its height equals the design shot's within 2pt (the broken page drew it 84 tall). Check: D (computed styles of `header.glass.top` equal main's), S `thread-desk`, `new-desk`.
- MSG-THREAD-13. Desktop hover a bubble: its time fades in over 150ms; the hover bar 144 × 32.6, padding 3, radius 999 (Like, Love, Laugh, Reply, More, keys 26.9, icons 14.4 secondary 9.44 / 10.21) rises in 160ms opacity and 220ms transform from translateY(4) scale(0.96) on `--ch-ease`. More opens the lift. The five keys follow the page (default S4). [d67] Check: C by hand `--motion M-MSG-29` at 1280, S hover at 1280.

States
| State | Capture | Criterion |
|---|---|---|
| failed | `failed-phone`, `failed-desk` | MSG-THREAD-14. Under the failed bubble, today's words: the "Not sent" line with today's retry, word for word, drawn in the page's failed style: a paper pill, height 22.3, padding 3 9 3 4, radius 999, gap 5, alert icon 14, the line 12.5/500 in `--ch-flag` (6.48 / 7.06), the retry word 600 primary (17.08 / 14.34). Its width follows today's words, so the page's 169.5 is not a target. Tap runs today's retry; hit area 44. The bubble keeps its fill. The page's "Not delivered · Try again" does not render (default S2). Check: D (the strings equal today's), S (shape and colours). |
| pending | not drawn | MSG-THREAD-15. A sending bubble shows no receipt (P-1); today's pending state restyled. |
| long | `long-phone`, `long-desk` | MSG-THREAD-16. A long message wraps inside the 76% bubble; a long link breaks inside it and never widens the bubble or the page (`scrollWidth === clientWidth`). Long names in the bar end with an ellipsis. |
| loading | not drawn | Today's thread skeleton restyled. |
| XXL | `thread-phone-xxl` | MSG-THREAD-17. Text 21.6px; bubbles grow taller, never wider than 278.2; day pill 17.6px grows to 30.9 tall; nothing overlaps. |
| dark, 430, desktop | as common | Common rules. |

Data
- MSG-THREAD-18. Bar role from the directory (coach title or `classYearLabel(graduation_year)`); day labels from `dayLabel`; receipt "Delivered" or "Seen" plus the other member's `last_read_at` time; reply quote from `replyToId` (03 Conversation). Check: D.

Motion: M-MSG-01, 02, M-MSG-04 (desktop hairline), M-MSG-07 (thread makes room), M-MSG-08 (arrival), M-MSG-09 (receipt), M-MSG-29 (hover bar and time).

### S-MSG.composer · `COMP`

Route `thread` (the composer half).

- MSG-COMP-01. One glass pill: phone 370 × 46.1 at x 10, its bottom 8 above the screen's bottom in the shot (`max(8px, env(safe-area-inset-bottom) − 4px)`); desktop 760 wide. Padding 5, radius 24, gap 6; + key 36 on the well; field min 36, max 132 (six lines), padding 8 4 7; a 24px fade above it into the page. [d35] Check: D, S.
- MSG-COMP-02. Empty field: no key on the right (no Dictate mic). The first character springs the send key in (scale 0.4 → 1 on `pop`); clearing the field shrinks it out from where it is, then it is `hidden` and computes `display: none` (MSG-ALL-09). Send key 36, accent fill, icon 18 ivory (8.01 / 5.58). [d36] Check: D, C `--motion M-MSG-06`.
- MSG-COMP-03. Field height steps per line and is not animated; past six lines it scrolls. [d37] Check: D.
- MSG-COMP-04. Desktop: Enter sends, Shift+Enter adds a line, with today's hint line (CH-7802). Phone: Return adds a line; the send key sends. [d38] Check: D.
- MSG-COMP-05. Drafts, prefill, Notify anyway, the class line, `CharsLeft` and `composer-inset.ts` feeding `--ch-ms-comp-h` behave as today. Check: D (`messages-drafts.test.ts` green).

States: long (six lines then scroll), XXL (keys stay 36; the field grows with text), dark, 430, desktop as common.

Motion: M-MSG-06, M-MSG-07, M-MSG-09.

### S-MSG.team · `TEAM`

Route `team`.

- MSG-TEAM-01. Group runs: the sender's first name 13/16.9 600 secondary inside the first bubble of a run (9.77 / 8.99); the face 30 beside the last bubble of a run; no name above the bubble on the page. [d21] Check: D (name only in the first bubble, face only beside the last), S `team-phone`, `team-desk`.
- MSG-TEAM-02. Reaction badge with a count: 36.1 × 26, padding 0 6, radius 999, gap 3, count 12/600 tabular (desktop 11.5). Green badge with ivory text on a paper bubble (8.01 / 8.45 dark), ivory badge with accent on yours (8.15 / 8.45). Check: S.
- MSG-TEAM-03. Your own message carries the Seen by pill 169.1 × 22.3, padding 3 9 3 4, faces 16 (overlap −4, ring 1.5, colour only), "Seen by {n} of {m}" or "Seen by everyone", 12.5/500 secondary with the count 600 primary. It shows on your own messages in a group, whatever your role, and never on anyone else's; hit area 44; a tap opens Seen by (S-MSG.seen). See MSG-ROLE-02. Check: D as demo coach and as demo player, S.
- MSG-TEAM-04. Bar: group coin 36 with its icon; role line "{n} members". The poll card sits in the thread (S-MSG.poll). [d25] Check: S.

States: long, XXL, dark, 430, desktop as common.

Motion: M-MSG-17 (new faces pop into the pill), M-MSG-13.

### S-MSG.typing · `TYPING`

Routes `typing`, `grouptyping`.

- MSG-TYPING-01. Typing bubble 59 × 33, padding 13 15, radius 19 19 19 6, gap 4, paper fill, a tail; three dots 7 in #7A766C light, #827D71 dark (the page's `--a-dot`; marks 4.49 on the light bubble, 3.62 on the dark bubble; MSG-ALL-07; no text uses this colour). One-to-one typing is unchanged from v12. [d27] Check: S `typing-phone`, D (computed dot colour).
- MSG-TYPING-02. Group: the typer's first name sits inside the typing bubble above the dots, as a name does in a first bubble: 13/16.9 600 secondary (9.77 / 8.99), from `typingUserId` through the directory. The bubble with a name is 58.5 × 49.4, padding 7.5 13 12, gap 5, a column (`auto06.md`, `grouptyping`). No caption renders under the bubble: there is no "Maya is typing" text on the page. Several typers: one typing bubble per typer, each with its name inside. When the reply lands, the bubble opens into the message, which carries the same name in the same place, so the name does not move (ruling 6). [d28] Check: D (one, two and three typers: bubble count and names; no caption node), S `grouptyping-phone`, `grouptyping-desk`, C `--motion M-MSG-08`.
- MSG-TYPING-03. It hides 5s after the last typing event (the hook's clear moves from 3s to 5s). Check: D (fake timers).
- MSG-TYPING-04. The bubble grows from its tail corner (origin 0 100%, scale 0.5 → 1 on `pop`). Dots loop 1.2s `cubic-bezier(.45,0,.55,1)`, delays 0 / 160 / 320ms, translateY(−3) and opacity 0.4 → 1. Under Reduce Motion the dots are static at opacity 1 with no transform, and the bubble fades in over `CH_FADE_MS` (page v12; 04 §7's 0.45 ↔ 0.85 pulse is out of date). [d27 corrected] Check: C `--motion M-MSG-30`, `__reduce`; D (no running animation on the dots under reduce).
- MSG-TYPING-05. A message arriving while the typing bubble shows grows out of the typing bubble's corner at its size on `reveal` (mid keyframe at 0.35), and the typing bubble goes in the same frame; both keyed by id. [d29] Check: C `--motion M-MSG-08`.

States: XXL, dark, 430, desktop as common.

Motion: M-MSG-08, M-MSG-30.

### S-MSG.times · `TIMES` (phone only)

Route `times`.

- MSG-TIMES-01. Dragging the thread left follows at 60% of the finger, clamped at 58 × k px (k is the Text Size scale: 58 at default, 78.5 at XXL); the times 13/400 tabular tertiary on the page (5.85 / 7.80) show at the right of each bubble, with opacity tied to the offset. Check: S `times-phone`.
- MSG-TIMES-02. The axis locks at 8px of travel; vertical wins and the native scroll keeps it. The 24px left edge stays for the back swipe. Release springs back on `settle`, additive; a new drag starts from the live x. Under Reduce Motion it follows the finger and returns at once. [d30] Check: D, C `--motion M-MSG-05`.

- MSG-TIMES-03. The time column is 52 × k wide with no wrapping and sits at right −64 × k (70.4 wide at right −86.6 at XXL, k 1.353). At XXL "5:52 PM" renders on one line, 18 tall (ruling 9, `v13b-times-xxl.png`, `xxl.json`). Check: S `times-phone-xxl`, D (each time's height equals one line at XXL).

States: XXL (MSG-TIMES-03; none clips or wraps), dark, 430. No desktop state (desktop uses hover, MSG-THREAD-13).

Motion: M-MSG-05.

### S-MSG.date-pill · `DATEPILL`

Route `datepill` (new in v12).

- MSG-DATEPILL-01. While scrolling, a glass pill 77.1 × 24.9, padding 4 10, radius 999, 13/16.9 500 secondary (9.44 / 10.21) floats at bar + lip + 8 and names the day of the topmost visible message. Check: D, S `datepill-phone`, `datepill-desk`.
- MSG-DATEPILL-02. Trap 6: the floating pill never doubles an in-flow day pill. In the `datepill` state the frame is mid-thread with no in-flow day pill under the floating one, and in the app the floating pill and an in-flow day pill with the same day are never both visible within the top 60px of the thread. Check: D (bounding boxes during a scripted scroll), S.
- MSG-DATEPILL-03. It fades in over 180ms and out over 250ms, 1s after scrolling stops; scrolling again cancels the fade out. It reads the topmost message from the anchor's observer, not a scroll listener per bubble. Under Reduce Motion it shows and hides with opacity only, at once or over `CH_FADE_MS`. Check: C `--motion M-MSG-04`, D.

States: XXL (17.6px, the pill grows), dark, 430, desktop as common.

Motion: M-MSG-04.

### S-MSG.jump · `JUMP`

Route `jump`.

- MSG-JUMP-01. Jump key: a 40 glass circle, right 14 at 390, 12 above the composer (hit 44); arrow 19 primary (16.50 / 14.28); count badge 20 × 20, padding 0 5, radius 999, 12/20 700 ivory on green (8.01 / 5.58), as v14 draws it (ruling 4, `auto06.md` jump). At 430 the key sits at right 18 (MSG-ALL-12). [d33] Check: S `jump-phone`, `jump-desk`, D.
- MSG-JUMP-02. Trap 5: in the `jump` state the thread stays a screen up after `document.fonts.ready` and after layout: two animation frames after fonts load, the distance from the bottom is still more than 0.9 × `clientHeight`, the key is visible and the count reads 2. The end anchor never re-pins to the bottom while the reader is away from it. Check: D (Playwright on `?state=design&view=jump`), S.
- MSG-JUMP-03. The key shows when more than 0.9 × `clientHeight` from the bottom (scale 0.6 → 1 on `pop`) and hides with opacity over 160ms to scale 0.8. Arrivals while away pop the badge in and update its count (M-MSG-33). Tap glides to the latest on `reveal`; wheel, touchstart or pointerdown stops it; the target is re-read each frame; the bottom is `msgs.offsetTop + msgs.offsetHeight − clientHeight`, never `scrollHeight − clientHeight`. Desktop scrolls through Lenis. Under Reduce Motion it jumps. [d34] Check: C `--motion M-MSG-24`, `--motion M-MSG-33`, D.
- MSG-JUMP-04. The count is `ThreadBelow`'s `unseen` (today's); the "New" divider stays. Check: D.

States: XXL, dark, 430, desktop as common.

Motion: M-MSG-24, M-MSG-33.

### S-MSG.toast · `TOAST`

Route `toast` (new in v12).

- MSG-TOAST-01. There is one toast style, the page's: today's toast is restyled to it, and no second toast component exists. The "Copied" toast: glass pill 72.4 × 31, padding 9 14, radius 999, 13/600 primary (16.50 / 14.28), top `env(safe-area-inset-top) + 8`, `role="status"`. Check: S `toast-phone`, `toast-desk`, D.
- MSG-TOAST-02. It enters from translateY(−8) scale 0.96 → 1 on `pop`, fades out over 200ms at 1700ms; a replaced toast fades over 120ms. Under Reduce Motion it fades only. Check: C by hand `--motion M-MSG-25`, D (fake timers).
- MSG-TOAST-03. Toast lines, all in this one style, and no others in Messages: PR 11e "Copied" and "Deleted for everyone"; PR 11f the mute lines with today's labels, and "Unmuted"; PR 11h the two pin lines from PIN-SYNC §5, "You already have 3 pinned." and "You're not in this conversation anymore." No "Couldn't pin. Try again." or other pin toast exists. Default S5. (fixed 4 Nov: plus the three lines in MSG-CP-60; today's error toasts keep their copy and take this style.) Check: D (string list per PR; grep finds no other toast copy).

States: XXL (the pill grows; text one line), dark, 430, desktop as common.

Motion: M-MSG-25.

### S-MSG.attach · `ATTACH`

Route `attach`.

- MSG-ATTACH-01. Tapping + turns it to × (rotate 45°, 300ms `--ch-ease-spring`) and opens a glass menu 240 × 150, padding 6, radius 22, at composer top + 8. Items 228 × 46, padding 6 10, radius 15, gap 12, text 15/18 500 primary (16.50 / 14.28); icon tiles 32 radius 10 with icons 17 (the Photos tile #2F7D4C, icon 4.92 as a mark). [d42, d43] Check: S `attach-phone`, `attach-desk`.
- MSG-ATTACH-02. Rows are exactly Photos, File, Poll. No Announcement row and no Camera row (Nick, 31 Oct). Photos is the file input with `accept="image/*"`; File the same input; Poll opens the poll composer (S-MSG.poll-composer). [d44] Check: D.
- MSG-ATTACH-03. The menu scales 0.4 → 1 from the + (origin 18px 100%) on `lift`; it closes to scale 0.7 over 160ms; closing then reopening fast reverses the closing menu (`is-closing`), never a second menu. Under Reduce Motion: opacity over `CH_FADE_MS`, the icon swaps. Check: C `--motion M-MSG-18`, interrupt case 6.

States: XXL (items grow; menu stays on screen), dark, 430, desktop as common.

Motion: M-MSG-18.

### S-MSG.file · `FILE`

Route `file`.

- MSG-FILE-01. A picked file sits as a chip above the field: 204.5 × 44, padding 6 8 6 6, radius 12, gap 8, name 12.5/15 500 primary (17.08 / 14.34); type tile 28 × 32 radius 7 as an `aria-hidden` icon (the page's "PDF" letters are 8px and are not built); close 26 (hit 44). The send key shows. Check: S `file-phone`, `file-desk`, D.
- MSG-FILE-02. The chip rises 12px on `smooth` when picked. Under Reduce Motion it appears. [d32] Check: C `--motion M-MSG-19`.
- MSG-FILE-03. A file in the thread is an icon tile and a subtitle "{TYPE} · {size}" ("PDF · 212 KB"); video shows size, not length (03 gap 5). [d31] Check: D.

States: long (a long file name ends with an ellipsis inside the chip), XXL, dark, 430, desktop as common; failed is today's `files-failed` restyled.

Motion: M-MSG-19.

### S-MSG.reply · `REPLY`

Route `reply`: the reply chip above the field quoting e6. It is not an arrival; the arrival is M-MSG-08 (S-MSG.typing).

- MSG-REPLY-01. Choosing Reply (hold menu, hover bar or swipe right) puts a chip above the field in the file chip's box (44 tall, padding 6 8 6 6, radius 12), with the reply icon 18 primary (17.08 / 14.34), the sender's name and the first line of e6, and a close key (hit 44). The field keeps focus. Check: S `reply-phone`, `reply-desk`.
- MSG-REPLY-02. The chip rises translateY(12) → 0 on `smooth`. Under Reduce Motion it appears. It ships in PR 11d (ruling 21). Check: C by hand on route `reply` (M-MSG-28 is a by-hand row in `capture.mjs`, ruling 27).
- MSG-REPLY-03. Sending carries `replyToId`; the sent bubble shows today's `ReplyQuote`. Check: D.

States: long (the quoted line ends with an ellipsis), XXL, dark, 430, desktop as common.

Motion: M-MSG-28.

### S-MSG.edit · `EDIT`

Route `edit`.

- MSG-EDIT-01. Edit on e9 (hold menu, your own text message) puts an edit chip above the field in the reply chip's box, and fills the field with e9's text, focused, caret at the end. Sending saves the edit through today's edit path and the bubble shows "Edited". Check: S `edit-phone`, `edit-desk`, D.
- MSG-EDIT-02. The chip uses the reply chip's motion, M-MSG-28 (ruling 21); no M-ID of its own. Check: C by hand on route `edit`.

States: long (six lines then the field scrolls), XXL, dark, 430, desktop as common.

Motion: M-MSG-28.

### S-MSG.poll-composer · `POLLNEW`

Route `pollnew`. Drawn (correction to the earlier draft).

- MSG-POLLNEW-01. Phone: a sheet full width, 522.6 tall, top radius 20, grabber 36 × 5 radius 3; header Cancel 17/500 accent (8.15 / 8.45), "New poll" 17/700, Send 17/600 accent (header buttons 33, hit 44). Body: "Question" label 13/600 secondary over an input 44 tall, padding 10 12, radius 12, on the well; options; a card with "Allow multiple answers" and its switch 44 × 26, and "Closes" with "Sunday 8 PM" 16/500 secondary. Desktop: a centred card 400 wide, radius 20. Check: S `pollnew-phone`, `pollnew-desk`.
- MSG-POLLNEW-02. It is today's `PollSheet` (polls.tsx), restyled; its fields, limits and error lines are today's. Check: D (`messages-polls.test.tsx` green).

States: XXL (fields grow; the sheet scrolls), dark, 430, desktop as common.

Motion: M-MSG-16 (sheet open, close, drag).

### S-MSG.hold · `HOLD`

Route `hold`.

- MSG-HOLD-01. Press: the bubble scales to 0.97 over 110ms on pointer down; moving past 10px or letting go before 450ms releases it over 280ms `--ch-ease`. [d45] Check: D, C `--motion M-MSG-10`.
- MSG-HOLD-02. At 450ms with 10px slop: one `haptic('press')` call, the light one, never `commit` (ruling 22; today's helper: the native bridge if present, else none), then the lift. Enter or Space on a focused bubble and right-click on desktop open the same lift; double-click on desktop is Like. [d46] Check: D (spy on `haptic`, one call), C.
- MSG-HOLD-03. The lift: the held bubble's copy at its rect, lifted (translateY by the shift needed for the menu, scale 1.02) on `lift` over the scrim (opacity on `smooth`, blur set once). Reaction bar 260 × 50, padding 5, radius 999, gap 2, six keys 40 (hit 44), icons 22 accent (7.88 / 8.42), from the bubble's top corner (0.5 → 1 on `pop`). Menu 236 wide, padding 6, radius 18, items 224 × 42, text 15/500 (16.50 / 14.28), icons 19 secondary (9.44 / 10.21), from the bubble's bottom edge (0.8 → 1 on `lift`). [d47] Check: S `hold-phone`, `hold-desk`, C.
- MSG-HOLD-04. The menu lists exactly today's rows for the case (MessagesPhone 600 to 611, MessagesView 1123 to 1135): poll rows (See votes, Remind, Close poll, Share result, each with today's role and state rule), Reply, Seen by (MSG-ROLE-02), Copy, Edit (your text messages), Delete in `--ch-flag` (6.26 / 7.03). `code="CH-7604"` stays on the new root. [d48] Check: D (row lists for a poll, your group message, theirs).
- MSG-HOLD-05. Dismiss (scrim tap, pick, Esc): the bubble settles back on `settle`; bar and menu shrink toward it (scale 0.6 and 0.85, 160ms fade); the scrim fades over 280ms `--ch-ease`; focus returns to the bubble. Reopening mid-dismiss picks up the settling copy (`HOLD_OUT`), never a second copy. Under Reduce Motion everything appears in place and fades over `CH_FADE_MS`. [d49] Check: D (focus), C `--motion M-MSG-11`, interrupt cases 3 and 4.
- MSG-HOLD-06. Double-tap a bubble toggles Like once: two pointer-ups within 300ms and 10px cancel the hold timer. Check: D, C `--motion M-MSG-14`.
- MSG-HOLD-07. Focus is trapped in the menu while open. Check: D.

States: XXL (menu items grow; the lift moves up further so the menu stays on screen), dark, 430, desktop as common.

Motion: M-MSG-10, 11, 14.

### S-MSG.holdseen · `HOLDSEEN`

Route `holdseen`: t6, your message in the team thread, held.

- MSG-HOLDSEEN-01. When you hold your own message in a group, whatever your role, the menu holds the Seen by row: 224 × 83.6, padding 8 12, radius 12, gap 6: "Seen by" 15/500 with the eye icon 19, faces 20 (colour only), and "{n} of {m} · {k} not yet" 13/500 secondary (9.44 / 10.21). Edit and Delete follow. Check: S `holdseen-phone`, `holdseen-desk`, D.
- MSG-HOLDSEEN-02. The row is present for a player sender as for a coach, and absent from the DOM, not hidden, on anyone else's message and in a direct thread (MSG-ROLE-02). Check: D as demo player and as demo coach, own message and theirs.
- MSG-HOLDSEEN-03. Tapping the row opens the Seen by sheet (S-MSG.seen). Check: D.

States: XXL, dark, 430, desktop as common.

Motion: M-MSG-12.

### S-MSG.react · `REACT`

Route `react`: Love on e6.

- MSG-REACT-01. Badge 26 tall, min 26 wide, padding 0 6, radius 999, at the bubble's top outer corner (top −14; right −10 on theirs, left −10 on yours), 3 apart; icon 14; count 12/600 tabular on phone, 11.5 on desktop, shown only above one. Your own reaction: green fill with an ivory icon (8.01 / 5.58) and the champagne ring `--ch-ring-own` (MSG-ALL-07, MSG-REACT-04). [d50] Check: S `react-phone`, `react-desk`.
- MSG-REACT-02. The badge pops 0.4 → 1 from the corner on `pop`; the count changes at once (no count-up); toggling again retargets. Under Reduce Motion it appears. [d51] Check: C `--motion M-MSG-13`.
- MSG-REACT-03. Tapping a badge opens today's who-reacted card (restyled, not drawn). Reactions come from `reactions.get(messageId)`; `mine` gives the ring. Check: D.
- MSG-REACT-04. Your own reaction sits on a 4px page-colour halo (`box-shadow: 0 0 0 4px` the page colour, then the green hairline and shadow), on a paper bubble and on your green bubble alike, so its champagne ring is measured against the page: 4.10 light (#8C703A on #F2F0E9), 8.73 dark (#C9AD74). Other reactions keep their 2px page ring. PR 11d adds `--ch-ring-own` (ruling 3). Check: S `react-phone` light and dark, D (computed `box-shadow` on your own badge), contrast test.

States: XXL (badges grow; the 16 gap above a bubble with reactions grows with them), dark, 430, desktop as common.

Motion: M-MSG-13, 14.

### S-MSG.seen · `SEEN`

Route `seen`: the Seen by sheet on t6.

- MSG-SEEN-01. Phone sheet: title "Seen by" 17/700, sub "{n} of {m} · {first 46 characters of the message}" 15/500 secondary (9.77 / 10.25), close key 40 (hit 44). A group card "Seen" with its count, rows face 32, name, time 13/400 tertiary (6.61 / 6.99); then "Not seen yet" with "Hasn't opened this chat" on each row. Desktop: the page's centred card, 400 wide, radius 20, scaling in 0.94 → 1 as S-MSG.votes does, built by restyling today's popover body (the same rows and data, no second list component); it is not anchored to the pill (default S8). [d53] Check: S `seen-phone`, `seen-desk`, `seen-desk-w1280`, C `--motion M-MSG-16`.
- MSG-SEEN-02. Any sender opens it on their own group message, coach or player (today's rule). Each row shows a name and a read time and nothing more: no percentages, rates, scores or other figures. Check: D as demo player and as demo coach (rows hold name and time only).
- MSG-SEEN-03. Data from `ChReceipts.marks`: members whose `last_read_at ≥ message.at`, newest first (seen-by.tsx). Check: D.
- MSG-SEEN-04. The close key never squeezes: `flex: none`, drawn 40 × 40 at every width, in XXL and with the longest sub, with a 44 target from a transparent `::before` (ruling 10). Check: D (`getBoundingClientRect` 40 × 40 at 390 XXL with the long sub), S `seen-phone-xxl`.

States: long (a long sub wraps to two lines), XXL, dark, 430, desktop as common.

Motion: M-MSG-17, M-MSG-16 (sheet behaviour).

### S-MSG.poll · `POLL`

Route `poll`.

- MSG-POLL-01. Poll card (yours) 272 wide on phone, 330 on desktop, padding 14 14 12, radius 20 20 6. Header "Poll · Choose one" 13/600 secondary with icon 14; question 17/22.1 600 −0.01em; each choice a well, padding 8 10, radius 12, gap 10, at least 44 tall: a `scaleX` fill (`--ch-poll-bar`, `--ch-poll-bar-on` for your choice), a 20 check ring, label 14/500 primary (15.66 / 15.20), count 13/600 tabular secondary (8.96 / 10.87), up to three voter faces 18 (overlap −5, colour only). "Most votes" chip 12/600 accent on tint (6.40 / 7.17), padding 2 7, radius 7, on one choice strictly ahead, none on a tie. Footer "7 votes · Closes Sunday 8 PM" 13/500 (9.77 / 8.99) and "See votes" 12.5/600 accent (8.15 / 7.42), hit 44. Sentence case. [d54] Check: S `poll-phone`, `poll-desk`.
- MSG-POLL-02. Vote: the ring fills on `pop`; the check draws over 260ms `--ch-ease` (stroke-dashoffset 20 → 0); every bar glides `scaleX` to its share together on `smooth`; your face pops into the stack; counts change at once. A change 100ms later retargets every bar from where it is. Only a tap plays the check (M3). Under Reduce Motion the check appears and bars set at once. [d55] Check: C `--motion M-MSG-15`, interrupt case 8.
- MSG-POLL-03. Counts and faces from `useMessageResponses` rows; bar = count / total votes; you first when you voted, then the latest; "Closed" after `closedAt` or a past `closesAt`. Today's vote error lines stay. Multi-answer counting is checked against `use-message-responses.ts` before faces per choice ship (03 Polls). Check: D.

States: long (a two-line choice label grows the well to 52.4), XXL, dark, 430, desktop as common; failed vote is today's error line.

Motion: M-MSG-15.

### S-MSG.votes · `VOTES`

Route `votes`.

- MSG-VOTES-01. Phone sheet top radius 20, grabber 36 × 5, max height 78%; desktop centred card 400 wide, radius 20, max height 82%. Title "Votes" and the question; one group per choice with its count and percent and a 3px accent bar under the heading at its share; rows face 32, name, line; then "Hasn't voted" for players who haven't (coaches left out). [d56] Check: S `votes-phone`, `votes-desk`, `votes-desk-w1280`.
- MSG-VOTES-02. "Draft a reminder" (17/500 accent, hit 44) shows only for a coach; it prefills the field and never sends; a player's DOM has no reminder button (MSG-ROLE-03). Check: D as coach and as player.
- MSG-VOTES-03. Open: phone y 100% → 0 on `smooth`; desktop scale 0.94 → 1. Close 280ms `--ch-ease` to translateY(105%) (desktop scale 0.96). Close mid-rise reverses; reopen mid-close reverses (`SHEET_OUT`). Grabber drag follows, rubber-bands upward (−sqrt × 2.2), closes past a third of its height or on a flick over 0.5px/ms, otherwise settles back on `smooth`; a flick closes with `chThrownExit`, keeping the flick's speed, and a slow drag released past the line closes over 280ms on `--ch-ease` (ruling 24). Under Reduce Motion: no drag motion, it fades over `CH_FADE_MS` and closes at once. [d57] Check: C `--motion M-MSG-16`, interrupt case 5.
- MSG-VOTES-04. The close key never squeezes: `flex: none`, drawn 40 × 40 at every width, in XXL and with a long question, with a 44 target from a transparent `::before` (ruling 10). Check: D (`getBoundingClientRect` 40 × 40 at 390 XXL), S `votes-phone-xxl`.

States: long (long names wrap), XXL (the sheet scrolls), dark, 430, desktop as common.

Motion: M-MSG-16.

### S-MSG.details · `DETAILS`

Route `details`: Eli's details.

- MSG-DETAILS-01. Phone, pushed page: face 84; name 22/25.3 700 −0.02em (15.10 / 16.01); line "Junior · Demo University Golf" 15/400 secondary (8.64 / 11.45). Quick actions four across, each 83.5 × 59.6 at 390 (93.5 at 430), padding 10 2 9, radius 14, gap 8, icon 20 accent (8.15 / 8.45), label 13/500 secondary (9.77 / 10.25): Mute, Search, Files, Profile. Cards radius 16: Class status (a 9px accent dot and today's line), Photos and files (tiles 108.7 phone, 80 desktop, radius 10; file rows with 32 tint icon tiles, icon accent 6.96 / 6.68). [d58] Check: S `details-phone`.
- MSG-DETAILS-02. Desktop: the 300 column on `--a-surface` with a 0.5px left hairline, close key 40 (hit 44); face 64; name 18/700 (17.08 / 14.34); quick actions 62 × 59.6; cards 272 wide. The panel keeps a fixed 300 inner width so nothing reflows while the column opens. Check: S `details-desk`, `details-desk-w1280`, D.
- MSG-DETAILS-03. The column opens by `grid-template-columns` from `320px minmax(0, 1fr) 0px` to `320px minmax(0, 1fr) 300px` as a CSS transition, 462ms `--ch-ease-spring-smooth`, with the thread pinned to its latest message each frame; close mid-open turns around where it is. This is the one layout animation in Messages. Phone pushes on `smooth` (MSG-MOT-02). Under Reduce Motion it opens at once and the panel crossfades over `CH_FADE_MS`. Under 1100 canvas the details float over the thread; under 720, rail or thread (today's). [d61, d68] Check: C `--motion M-MSG-20` at 1440, interrupt case 10.
- MSG-DETAILS-04. Quick actions per kind and role: Profile only on a direct thread with a player and only for a coach viewer (MSG-ROLE-04); Class status only for a coach with the flag on, absent otherwise (MSG-ROLE-05). [d59] Check: D.

States: long (a long name wraps to two lines, never ellipsis), XXL (actions grow taller; labels never clip), dark, 430, desktop as common; failed is today's `files-failed` restyled.

Motion: M-MSG-20.

### S-MSG.groupdetails · `GROUPDET`

Route `groupdetails`.

- MSG-GROUPDET-01. Header: group coin 84 (64 desktop), title, "Group · {n} members" or "Team channel · {n} members". Members card titled "Members" with the count ("11") at the right; first six rows (face 32, name 14.5/600, line 13/400, right 13/400); "Coach" chip 12/600 accent on tint (6.96 / 6.68), padding 2 7, radius 7, where `role = 'coach'`; you as "You"; a row 44 tall, 15/500 accent (8.15 / 8.45), with today's words "See all"; the page's "Show all 11" does not render (default S3). No Captain chip. [d60] Check: S `groupdetails-phone`, `groupdetails-desk`.
- MSG-GROUPDET-02. Add shows only for the group creator; Leave only for a member who isn't the creator; their flows, confirms and errors are today's (`add-failed` restyled). Check: D.

States: long, XXL, dark, 430, desktop as common.

Motion: M-MSG-20.

### S-MSG.mute · `MUTE`

Route `mute`.

- MSG-MUTE-01. The Mute action opens a glass menu in the hold menu's box (236 wide, items 42, text 15/500, 16.50 / 14.28) on `lift`. Labels are today's: "Mute 8 hours", "Mute a week", "Until I turn it on" (or "Unmute"); the page's "For 8 hours" and "For a week" are listed as "can't match, 04 §8". [d62] Check: D (labels), S `mute-phone`, `mute-desk`.
- MSG-MUTE-02. The mute quick action pops 0.92 → 1; the switch on the card moves over 320ms `--ch-ease-spring`. `muteLabel` and `message-mute.ts` are unchanged; the row glyph refreshes after muting (MSG-LIST-17). Check: C `--motion M-MSG-21`, D.
- MSG-MUTE-03. Muting shows a toast whose line uses today's mute label for the length picked; unmuting shows "Unmuted". Both use the one toast style (MSG-TOAST-01, 03). Check: D.
- MSG-MUTE-04. The switch's off track carries a 1.5px inset ring `--ch-switch-off-ring`, #8F8B81 light (3.37 on the card), #827D71 dark (4.12); on stays green with no ring. PR 11f adds the token (ruling 11). Check: S `mute-phone` and `details-phone` light and dark, D (computed `box-shadow` off and on).

States: XXL, dark, 430, desktop as common.

Motion: M-MSG-21.

### Not drawn: build rules · `KEPT`

Not a screen ID. These keep today's behaviour and copy and take the card, well, pill and sheet tokens above: row swipe actions (mark read or unread, delete), in-conversation search, the who-reacted list, delete and leave confirms, add and remove member, the no-team state, (fixed 4 Nov: the pin-failed toast is removed here; S5 and MSG-PIN-05 allow only the two PIN-SYNC lines) the pending (sending) bubble, the offline or stale banner, Notify anyway, the class line, announcements, search hits, edit and delete modals.

- MSG-KEPT-01. Each renders with the new tokens and no new look, and today's preview fixtures for them (`loading`, `failed`, `thread-failed`, `files-failed`, `add-failed`, `announcement`, `ann-failed`, `rail`) still pass their tests. [d69] Check: D, S of today's fixtures.
- MSG-KEPT-02. No Announcement row is built anywhere in the + menu (Nick, 31 Oct). Check: D.

## Motion and interrupts (cross-screen)

- MSG-MOT-01. `CH_SPRINGS` keeps smooth (0.26 / 0, 406 · 40.3), settle (0.26 / 0.10, 406 · 36.2) and reveal (0.52 / 0, 101 · 20.1), and adds send (0.42 / 0.12, 155 · 21.9, peak 1.003), pop (0.25 / 0.35, 439 · 27.2, peak 1.068, the app's `chSpringCurve` giving 1.06808) and lift (0.28 / 0.15, 350 · 31.8, peak 1.006) (ruling 28). The settle times the build must hit are the app's `chSpringCurve` values: smooth 462, settle 417, reveal 921, send 700, pop 496, lift 471ms; the page's solver values (427, 941, 713, 540, 487) are a note only (ruling 29). The comment above `CH_SPRINGS` records Nick's 31 Oct sign-off ("yeah as long as it's smooth"). [d70] Check: D (`motion-physics.test.tsx`).
- MSG-MOT-02. Push (M-MSG-01): the thread page translateX 100% → 0; the page behind moves 24% (`CH_UNDERLAY_SHIFT` 0.24) and dims to `brightness(0.9)`, over 462ms on `--ch-ease-spring-smooth`; the tapped face flies to the bar on the same curve; messages fade and rise translateY(6) → 0 over 260ms. Back (M-MSG-02) is the same in reverse, and Back mid-push reverses from the live x (`is-leaving`). The page draws the underlay at −30% with a 0.1 black dim; that difference is listed as "matches the shared value". Under Reduce Motion: a `CH_FADE_MS` crossfade. [d71 corrected] Check: C `--motion M-MSG-01`, `M-MSG-02`, interrupt case 7.
- MSG-MOT-03. The top bar never moves; the lip stays put (SHARED-1). [d72] Check: C (bar band static in every clip).
- MSG-MOT-04. Sent bubble (M-MSG-07): the real bubble itself moves from the field text's rect to its slot, scale 0.96 → 1, opacity 0.85 → 1, on `send`, as the page does; no overlay copy exists, because a copy would blink in cases 1, 2 and 11 (ruling 23; 02-PLAN 5.2 corrected). A second send 140ms later moves its own bubble and both land in order. The thread makes room: the new row has full height at frame one; everything above glides up by its height on `send`, additive (two glides sum). Under Reduce Motion the bubble fades in place over `CH_FADE_MS` and the thread moves at once. [d39, d40] Check: D (during a send the message's id is on exactly one element, and no element is `visibility: hidden`), C `--motion M-MSG-07`, interrupt cases 1, 2, 11.
- MSG-MOT-05. Receipt (M-MSG-09): Delivered → Seen crossfades over 180ms; Seen faces pop. [d41] Check: C `--motion M-MSG-09`.
- MSG-MOT-06. Interrupt rules hold everywhere: live-start (retarget the same `animate` on the same node, never remount), additive thread glides, carry (bubbles keyed by message id; a re-render never restarts a running motion), hand-off (a closing overlay reopened reverses from where it is: `is-closing`, `HOLD_OUT`, `SHEET_OUT`, `is-leaving`). [d73] Check: interrupt cases.
- MSG-MOT-07. The 11 interrupt cases pass with the page's judge (`MC.judge`): a jump is a frame moving over 10px and over three times its neighbours' speed; no gaps (an element vanishing and returning); no opacity blink over 0.45 in one frame; under Reduce Motion no two consecutive frames move. A run counts only in a headed browser at 60 Hz or better: the page's check reads 11 of 11 clean there (v13 in Chrome 156 on the Mac, `screenshots/reference/motion-check-v13-chrome-11-of-11.png`), and the build's run must too. A headless run that drops frames (25 to 40ms frames, 120 to 250ms stalls, as in this container, failing 2 or 3 cases on v12 and v13 alike) is not a valid run, pass or fail. Cases: 1 send twice 140ms apart; 2 a reply lands while yours rises; 3 hold then let go mid-lift; 4 hold again while it settles; 5 votes sheet close mid-rise and reopen; 6 attach close and reopen fast; 7 Back mid-push; 8 vote then change 100ms later; 9 jump key away and back; 10 desktop details close mid-open and reopen; 11 Reduce Motion send and reply. [d75] Check: D (`e2e/clubhouse-messages-motion.spec.ts`, headed, 60 Hz or better), `capture.mjs motion` headed for the page's run, the result screenshot in the PR beside the v13 reference.
- MSG-MOT-08. Under Reduce Motion (Playwright `reducedMotion: 'reduce'` and Settings > Animations off) nothing travels, scales or rotates; each motion's reduced branch is an opacity change over `CH_FADE_MS` (180ms) or nothing; the typing dots and the skeleton pulse stop (dots static at opacity 1). [d74 corrected] Check: C `__reduce` for every M-ID, D.
- MSG-MOT-09. Never animated: count-ups, entrance staggers, re-render or data-refresh motion, field height, blur on scroll (blur set once on lift), the green bar. `/golf/dashboard/messages` is in `golf-motion-stillness.spec.ts` ROUTES, so numbers are final on mount. [d76] Check: D.
- MSG-MOT-10. Haptics: only the lift has one (MSG-HOLD-02). Every other motion row has none; no new haptic call is added. Check: D (spy).
- MSG-MOT-11. Every M-ID from M-MSG-01 to M-MSG-33 has a design clip and an app clip, normal and `__reduce`, in the PR that owns it, and they match within one frame at 60fps on duration, curve or spring, and what moves (SHARED-12), apart from the listed shared-value differences (push underlay, Reduce Motion fade length). Check: C.

## Roles and data (cross-screen)

The design page has one viewer, a coach (`ME = 'nick'`, Head Coach). Player views are not drawn; the rules below come from 03-DATA-CHECKS and the P-01 and P-02 plans that today's `seen-by.tsx` and `polls.tsx` were built from. Seen by keeps today's rule (settled default S1), not P-01's coach-only option.

- MSG-ROLE-01. Messages carries no player figures: no score, SG, average or goal of any player appears in any Messages screen, for any viewer (SHARED-11). Check: D as demo player (page and network responses hold no other player's figures).
- MSG-ROLE-02. Seen by keeps today's rule, not coaches only: anyone sees it on their own message in a group, as the pill, the hold menu's row and the list (sheet on phone, centred card on desktop). It shows read times only, never figures. It is absent from the DOM on other people's messages and in direct threads. Default S1. Check: D as demo player and as demo coach, own message and theirs.
- MSG-ROLE-03. Poll actions keep today's rules: Remind and "Draft a reminder" for a coach (`canRemind = viewerRole === 'coach'`); Close poll for the sender of an open poll; Share result for the sender or a coach on a final poll. Each is absent from the DOM where the rule says no. Check: D.
- MSG-ROLE-04. The Profile quick action, which links to a player's stats, renders only for a coach viewer on a direct thread with a player (ruling 20; a rule, not a flip: showing it to a player would put a link to a teammate's stats in front of them, which SHARED-11 forbids). A player on a direct thread with a teammate has no Profile action and no link to that teammate's stats in the DOM. Check: D as demo player.
- MSG-ROLE-05. Class status shows only for a coach with the class flag on; for anyone else the card is absent from the DOM. Check: D.
- MSG-ROLE-06. Pins, mute and typing are per viewer. The typing listener: one realtime channel per conversation on screen (pins and visible rows), capped at 30, never the open thread's channel a second time; ignores the viewer's own id; entries expire 5s after their last event; a conversation's entries clear when a message arrives; channels leave as rows scroll away and on unmount. No migration. [d77, d79] Check: D (`typing-by-conversation.test.tsx` with a fake channel).
- MSG-ROLE-07. Only one additive field (`gradYear` on `ChPerson`) and one select addition (the viewer's `notification_level`, `muted_until`) touch data; nothing new is collected; nothing reads a new table except PR 11h. [d80] Check: D (diff of `model.ts`, `data/messages.ts`, `use-golf-messages.ts`).

## Per PR

Every PR runs `npm run clubhouse:catalog` (CI `-- --check`), `npm run clubhouse:css`, `typecheck`, `lint`, `test` and `playwright.clubhouse.config.ts`, and passes SHARED-1 to SHARED-12. Capture commands assume one dev server (`npm run dev -- -p 3100`) and are run as `node capture/capture.mjs …` from `design-refresh/messages/` (or with that prefix from the repo root, as the README writes them).

### PR 11a. Foundations

- Screens: none drawn changes. MSG-ALL-01, MSG-ALL-04, MSG-ALL-09, MSG-ALL-10, MSG-MOT-01, MSG-ROLE-07 (the `gradYear` part).
- Motion: none of its own.
- Adds: tokens; the three springs and the `motion-physics.test.tsx` change (loop limited to `['smooth','settle','reveal']` plus an `it` pinning send, pop and lift to one decimal and peaks within 0.001 via `chSpringAt`); the token-equals-curve test; `contrast-tokens.test.ts` pairs; `gradYear` with fixtures updated; the design fixture `?state=design&view=<route>` for all 34 routes with `data-ch-preview-view`, `&play=<demo>` marked `data-ch-preview-play`, and `window.__chMsgFixture` (`send`, `incoming`, `typing`) in the preview only.
- Capture: `node capture/capture.mjs --id all --side app` (proves the fixture reaches every state).
- Exit test: a unit test renders each of the 34 views and finds its marker and key element; `capture.mjs --id all --side app` reports nothing "not reachable yet"; no screen changes visually (app shots equal main's).

### PR 11b. Inbox, with typing on rows and pins

- Screens: S-MSG (MSG-LIST-01 to 18), S-MSG.unread (all), S-MSG.row-menu (all); MSG-ROLE-06.
- Motion: M-MSG-01, 02, 03, 26, 27, 30 (rows and pins), 31.
- Adds: `pinned.test.tsx` (max 3, drops missing ids, storage errors swallowed); Pin in `conv-context-menu.test.tsx`; `messages.test.tsx` (no large title on phone, context line counts, Pinned card absent with no pins, desktop h3); `typing-by-conversation.test.tsx`; pin initials and bubblet bounds (traps 2 and 3); `conv-row-seams`, `marked-unread` green.
- Capture: `--id S-MSG`, `--id S-MSG.unread`, `--id S-MSG.row-menu`; `--motion M-MSG-01`, `M-MSG-02`, `M-MSG-03`; M-MSG-26, 27, 30, 31 by hand.
- Exit test: every state of the three IDs matches side by side within 2pt on the redline (light, dark, 390, 430, XXL, 1440, 1280); the PR body says pins are per device until 11h.

### PR 11c. Thread and bubbles

- Screens: S-MSG.thread (all), S-MSG.team (all), S-MSG.typing (all), S-MSG.times, S-MSG.date-pill, S-MSG.jump; the thread half of MSG-ROLE-01.
- Motion: M-MSG-04, 05, 08, 24, 30 (thread), 33; MSG-MOT-06 for arrivals.
- Adds: run grouping (name in the first bubble, face beside the last, tail on the last only, no time under a non-latest run); `typingUserId` and the 5s clear; the drag hook; trap tests 1, 5 and 6; `messages`, `messages-audit`, `wiring-p007-messages`, `class-awareness-messages` green with selectors updated only where a class changed.
- Capture: `--id S-MSG.thread`, `--id S-MSG.team`, `--id S-MSG.typing`, `--id S-MSG.times`, `--id S-MSG.date-pill`, `--id S-MSG.jump`; `--motion M-MSG-04`, `05`, `08`, `24`, `30`, `33`.
- Exit test: those six IDs match in every state; the arrival, typing, drag, date pill and jump clips match; interrupt cases 2 and 9 pass.

### PR 11d. Composer and send

- Screens: S-MSG.composer, S-MSG.attach, S-MSG.file, S-MSG.reply, S-MSG.edit, S-MSG.poll-composer. (Ruling 21 puts the reply chip in 11d. The arrival stays in 11c.)
- Motion: M-MSG-06, 07, 09, 18, 19, 28, 32; MSG-MOT-04, 05.
- Adds: send key hidden with an empty field and `display: none`, shown with text; six-line cap; + menu lists exactly Photos, File, Poll; Enter sends on desktop and not on phone; reply and edit chips; `messages-drafts.test.ts` green.
- Capture: `--id S-MSG.composer`, `--id S-MSG.attach`, `--id S-MSG.file`, `--id S-MSG.reply`, `--id S-MSG.edit`, `--id S-MSG.poll-composer`; `--motion M-MSG-06`, `07`, `09`, `18`, `19`; M-MSG-28 by hand on `reply` and `edit`. Adds `--ch-ring-own` (MSG-REACT-04).
- Exit test: those six IDs match; the send clip (rise, room, key pop, receipt) matches at 390; interrupt cases 1, 6 and 11 pass.

### PR 11e. Hold, reactions, Seen by, polls

- Screens: S-MSG.hold, S-MSG.holdseen, S-MSG.react, S-MSG.seen, S-MSG.poll, S-MSG.votes, S-MSG.toast; MSG-THREAD-13 (desktop hover bar); MSG-ROLE-02, MSG-ROLE-03.
- Motion: M-MSG-10 to 17, 25, 29; MSG-MOT-10.
- Adds: the lift lists the same rows as today's sheet for a poll, your group message and theirs; Esc closes and returns focus; double-tap toggles Like once; one `haptic('press')` at 450ms; player-session DOM tests for Seen by (present on your own group message) and Remind (absent); the Seen by centred card on desktop from today's popover body; the "Copied" and "Deleted for everyone" toasts; `messages-polls`, `messages-polls-css`, `messages-seen-by`, `e2e/clubhouse-polls.spec.ts` green.
- Capture: `--id S-MSG.hold`, `--id S-MSG.holdseen`, `--id S-MSG.react`, `--id S-MSG.seen`, `--id S-MSG.poll`, `--id S-MSG.votes`, `--id S-MSG.toast`; `--motion M-MSG-10` to `M-MSG-17`; M-MSG-25 and 29 by hand (29 at 1280).
- Exit test: those seven IDs match; the lift, dismiss, react, vote and sheet clips match; interrupt cases 3, 4, 5 and 8 pass.

### PR 11f. Details, mute, empty, new

- Screens: S-MSG.details, S-MSG.groupdetails, S-MSG.mute, S-MSG.empty, S-MSG.new, S-MSG.fresh; MSG-ROLE-04, MSG-ROLE-05.
- Motion: M-MSG-20 to 23.
- Adds: quick actions per kind and role (Add for the creator, Leave for a non-creator, Profile for a coach on a direct thread with a player, Class status for a flagged coach); starters fill without sending, with the three player starters for a player; first run shows with no conversations; today's mute labels; the mute toasts and "Unmuted"; "See all" on the members card; `--ch-switch-off-ring` (MSG-MUTE-04).
- Capture: `--id S-MSG.details`, `--id S-MSG.groupdetails`, `--id S-MSG.mute`, `--id S-MSG.empty`, `--id S-MSG.new`, `--id S-MSG.fresh`; `--motion M-MSG-20` to `M-MSG-23`.
- Exit test: those six IDs match; the desktop details clip opens and closes on 462ms with the thread held at its latest message; interrupt case 10 passes.

### PR 11g. Motion tests

- Screens: none new. Every motion criterion above and MSG-MOT-01 to 11.
- Motion: M-MSG-01 to 33, normal and `__reduce`.
- Adds: `e2e/clubhouse-messages-motion.spec.ts` at 390 × 844 and 1440 × 900 on `view=thread`: a per-frame sampler (`page.addInitScript`) of `getBoundingClientRect` and opacity on `data-mc` elements (the sent bubble, held copy, sheet, attach menu, thread wrapper, details column); the ported `MC.judge`; the 11 cases through `window.__chMsgFixture` and real pointer events, the last under `reducedMotion: 'reduce'`; `recordVideo` clips. `/golf/dashboard/messages` added to `golf-motion-stillness.spec.ts`.
- Capture: `node capture/capture.mjs --motion all`; `node capture/capture.mjs motion` (the page's 11 cases).
- Exit test: all 11 cases pass, 11 of 11, in a headed browser at 60 Hz or better (MSG-MOT-07), with the result screenshot in the PR beside `screenshots/reference/motion-check-v13-chrome-11-of-11.png`; for every M-ID the app clip sits beside the design clip in the PR, normal and Reduce Motion, and matches (MSG-MOT-11).

### PR 11h. Pin sync (held)

Source: `pin-sync/PIN-SYNC.md`. Draft PR only; the migration is held and applied by the owner after the first deploy, alone, after the rename migration (SHARED-8, SHARED-9). Nothing in 11a to 11g waits for it.

- Screens: S-MSG, S-MSG.unread, S-MSG.row-menu (`pinlimit`). No new look: the same Pinned card and row menu. The only new copy is the two pin toasts (MSG-PIN-05). These criteria replace the old draft's 81 to 90.
- MSG-PIN-01. The PR adds `supabase/migrations/20261031150000_golf_conversation_pins.sql` byte-identical to the package copy and the HELD.md row from PIN-SYNC §11 (status WRITTEN, HOLD, NOT APPLIED). No PR, script or agent runs `db:apply` or any migration. Check: D (file hash), PR body.
- MSG-PIN-02. The local check passes before the PR opens: on a throwaway Postgres 16, `01-stub.sql`, the migration, `02-seed.sql`, then `03-check.sql` (`pin-sync/local-check/`), every case passing as its README lists (limit at 3 with `pin_limit`, idempotent repeat, per-team scope, `not_a_member`, renumber, stale reorder `pins_changed`, hide, leave and delete unpin, broadcasts only to the owner's topic, `anon` refused, the two-device race ending at 3). Check: D (output pasted in the PR).
- MSG-PIN-03. `supabase/tests/rls/golf_conversation_pins.sql` (pgTAP, `npm run test:rls`) covers RLS on, one SELECT policy, no INSERT, UPDATE or DELETE grant, both functions executable by `authenticated` and not `anon`, `golf_pins_receive` with no INSERT policy, both triggers, and the behaviour cases of `03-check.sql`. Check: D.
- MSG-PIN-04. With the table missing, `use-conversation-pins.ts` falls back to `pinned.ts` on 42P01 or PGRST205, remembers "unavailable" for 5 minutes, and the inbox behaves exactly as 11b with no error, toast or console error. [d82] Check: D (`use-conversation-pins.test.tsx`), S against 11b.
- MSG-PIN-05. Pin and unpin are optimistic, then `golf_pin_conversation`; the returned list replaces the local one. `pin_limit` reverts and shows "You already have 3 pinned."; `not_a_member` shows "You're not in this conversation anymore." and drops the row (both lines word for word from PIN-SYNC §5, in the one toast style); any other failure reverts with no toast. Repeating a pin or unpin changes nothing and shows no error. [d86, d87] Check: D.
- MSG-PIN-06. The client joins `golf-pins:<uid>` with `config: { private: true }` after `setAuth()`, refetches on `pins` only when its `team_id` is the active team, refetches on focus and reconnect, and leaves on unmount. Check: D.
- MSG-PIN-07. After the owner applies, on staging, two browser contexts as the demo coach: a pin on one shows on the other within 2s without a reload, in the same order; unpin on the second drops it on the first, and the Pinned card is absent when it was the last; hiding a conversation drops it on both. [d83, d84, d85, d88] Check: Playwright on staging.
- MSG-PIN-08. Realtime precondition, a manual step in the PR body: a second client joining `golf-pins:<id>` without `private` receives nothing. A teammate's session selecting from the table gets none of your rows. [d89] Check: manual, recorded in the PR.
- MSG-PIN-09. Rollback (the migration header's block) returns the app to device pins with no change on screen. [d90] Check: D (probe fallback test).
- MSG-PIN-10. The defaults D1 to D9 below hold as written. Check: D (limit 3, per team, new pin at the end, unpin on leave and hide, one-time import behind `ch:msg:pins-imported:<viewer>:<team>`, Pin dimmed at the limit, reorder function shipped with no drag UI, team channel pinnable like any other).
- Capture: `--id S-MSG`, `--id S-MSG.unread`, `--id S-MSG.row-menu` before and after (no visual change).
- Exit test: MSG-PIN-01 to 06 and 09 pass in CI and locally; MSG-PIN-07 and 08 pass on staging after the owner applies; until then the PR stays a draft.

## Side by side

Screens. For each screen ID and each of its states:

```
node capture/capture.mjs --id <ID> --state <state>
```

for example `--id S-MSG.thread --state thread-phone-w430`. Without `--state` it shoots every state of that ID; `--id all` shoots everything. It draws the design page (`redesign/clubhouse-messages.html#<route>-<phone|desk>-<theme>-reduce-shot[-flag]`) and the app preview (`/clubhouse-preview/messages?state=design&view=<route>`, which needs PR 11a's fixture) at the same width, theme and Text Size, and writes `screenshots/<ID>__<state>__design__<theme>.png` and `…__app__<theme>.png`. Put the two images next to each other in the PR and check the screen's 06 redline numbers on both. A screen passes when every redline number is within 2pt and every other difference is listed as matches, fixed, or can't match with its reason. Until 11a lands, the app side reaches only `inbox` and `thread`; the rest print as not reachable yet.

Motion. For each M-ID:

```
node capture/capture.mjs --motion <M-ID>
```

It plays the design page's demo (its Replay button) and the same move in the app (`?state=design&view=thread&play=<demo>`, marked `[data-ch-preview-play]`), recorded with Playwright `recordVideo` at the device's own size, once normal and once with `reducedMotion: 'reduce'`, and writes `clips/<M-ID>__{design,app}[__reduce].webm`. Video needs Playwright's ffmpeg once on the Mac: `npx playwright install ffmpeg`. Rows with no demo (M-MSG-25, 26, 27, 28, 29, 31) are recorded by hand on their routes (`toast`, `rowmenu`, `reply` and `edit`, desktop hover at 1280, `loading`); M-MSG-32 has no row (the browser's caret). Put both clips in the PR and compare duration, curve or spring, origin and what moves, within one frame at 60fps.

Interrupts. `node capture/capture.mjs motion` runs the page's own 11 cases; the app's are 11g's spec. Both pass 11 of 11 in a headed browser at 60 Hz or better (MSG-MOT-07).

Rules: one Chromium (headless for stills, headed for the motion check) and one dev server at a time (SHARED-9); the script opens one page at a time and closes it.

Differences to list in every PR they touch, not failures: push underlay 24% and `brightness(0.9)` against the page's −30% and black dim (shared value); Reduce Motion fade 180ms against the page's 120 (SHARED-6); hold slop 10 against 8 (04 §6); mute labels (04 §8); file tiles as icons; Seen by and voter faces without initials; class-year fills against per-person hues; no drawn caret in the To field; today's "Not sent" line against "Not delivered · Try again" (S2); "See all" against "Show all 11" (S3); player starters and player Seen by, which the page does not draw (S6, S1).

## Decisions settled as defaults Nick can flip

| # | Default | If flipped |
|---|---|---|
| D1 | 3 pins per team | `golf_pin_limit()` returns the new number (positions allow up to 9); the phone card scrolls sideways past 4 |
| D2 | Pins are per team | Per account: one list everywhere |
| D3 | Pins are private, in their own table | No sensible flip: a pin on the participant row would show teammates |
| D4 | A new pin goes to the end of the list (as PIN-SYNC.md writes it; the design lead confirmed it) | Newest pinned first: insert at 0 and shift the rest |
| D5 | Leaving or hiding a conversation unpins it | Keep the pin and hide it until the conversation comes back |
| D6 | Device pins move to the account once, up to the limit | Start empty on every device |
| D7 | At the limit, Pin is dimmed with "Pin up to 3"; nothing unpins by itself | Pinning a fourth unpins the oldest |
| D8 | The reorder function ships; drag to reorder doesn't | Add drag on the Pinned card and the rail's Pinned section |
| D9 | The team channel can be pinned like any conversation | Team channel always first, outside the 3 |
| S1 | Seen by is not coach only: today's rule, anyone on their own message in a group sees the pill, the menu row and the list, with read times only and never figures | Coaches only |
| S2 | The failed bubble keeps today's "Not sent" line with retry, in the page's failed style | The page's "Not delivered · Try again" |
| S3 | The members card keeps today's "See all" | "Show all 11" |
| S4 | The desktop hover bar follows the page: Like, Love, Laugh, Reply, More, 144 wide | Drop Laugh |
| S5 | One toast style, the page's, restyling today's toast; lines: 11e "Copied", "Deleted for everyone"; 11f today's mute lines, "Unmuted"; 11h the two PIN-SYNC §5 pin lines; no other pin toast | None offered |
| S6 | A player sees three player starters ("Can we find time to talk this week?", "Here's my round from today", "Quick question about practice"); they fill and never send | No starters for players |
| S7 | Two typers read "Maya and Owen are typing"; three or more read "Several people are typing" | None offered |
| S8 | Seen by on desktop is the page's centred card, 400 wide, scale-in, from today's popover body | Keep the popover anchored to the pill |
| S9 | No per-conversation URL; the conversation is view state on `/golf/dashboard/messages` | None offered |
| S10 | The Profile quick action in details shows to a coach viewer only (ruling 20) | No flip: SHARED-11 |

Calls already made (Nick, 31 Oct), each one word to reverse: no Announcement row; no Camera row (the + menu is Photos, File, Poll); typing is tracked, with dots on rows and pins and groups naming the typer; `send`, `pop` and `lift` stay "as long as it's smooth", proved by the 11 cases; pins sync, as held PR 11h; the top bar stays exactly as today's.

## Settled 4 Nov

The open questions from the last version are answered by `SETTLED-4NOV.md`; the criteria above are written to the answers.

| Was open | Settled by | Now in |
|---|---|---|
| 430 drew a 16pt edge | Ruling 1: v14 draws 20, thread 16, composer 14, attach 16, jump 18 | SHARED-7, MSG-ALL-12 |
| Typing dots under 3:1 in light | Ruling 2: #7A766C light (3.97 / 4.49 / 4.08), #827D71 dark | MSG-ALL-07, MSG-TYPING-01 |
| Champagne focus and own-reaction rings under 3:1 | Ruling 3: `--ch-ring-own` #8C703A / #C9AD74 on a 4px page halo | MSG-ALL-06, MSG-ALL-07, MSG-REACT-04 |
| Jump badge 11px | Ruling 4: 12/20 700, 20 × 20 | MSG-JUMP-01 |
| Group face initials 11.4 | Ruling 5: 12px on the 30 face | MSG-ALL-04 |
| Group typing caption on the page | Ruling 6: name inside the bubble, no caption | MSG-TYPING-02, MSG-LIST-13 |
| Details header on the page | Ruling 7: allowed | SHARED-2 |
| Row menu Delete in ink; Pin before Mark as unread | Ruling 8: danger red; the page's order | MSG-ROWMENU-01 |
| XXL times | Ruling 9: column 52 × k, drag 58 × k, one line | MSG-TIMES-01, MSG-TIMES-03 |
| Sheet close keys | Ruling 10: `flex: none`, 40 drawn, 44 target | MSG-SEEN-04, MSG-VOTES-04 |
| Switch off track | Ruling 11: `--ch-switch-off-ring` | MSG-MUTE-04 |
| "CH-7301" on the empty card | Ruling 12: removed | MSG-EMPTY-01, MSG-EMPTY-03 |
| Group coin gradient; skeleton fill; attach tile colours; phone bar keys; hover keys at 27 | Rulings 13 to 17 | SHARED-2; build as ruled |
| Seen by count as a figure | Ruling 18: a count of readers, not a figure | MSG-ROLE-02, MSG-SEEN-02 |
| Exact words of "Not sent" and the mute lines | Ruling 19: a test against today's source strings | MSG-ALL-13 |
| Profile coach only | Ruling 20: coach only; not flip-able under SHARED-11 | MSG-ROLE-04, S10 |
| Reply chip PR, edit chip M-ID, M-MSG-32 | Ruling 21: 11d; M-MSG-28; the browser's caret | MSG-REPLY-02, MSG-EDIT-02, MSG-NEW-04 |
| Lift haptic | Ruling 22: `press` | MSG-HOLD-02 |
| Sent bubble copy | Ruling 23: move the real bubble | MSG-MOT-04 |
| Flicked sheet | Ruling 24: `chThrownExit`; slow drag 280ms `--ch-ease` | MSG-VOTES-03 |
| Reduce Motion fade | Ruling 25: linear, `CH_FADE_MS` 180, shared helper | SHARED-6, MSG-MOT-08 |
| Row and pin dots curve | Ruling 26: CSS `ease` as drawn | MSG-LIST-13 |
| M-MSG-28 capture | Ruling 27: by hand | Side by side |
| Pop peak and settle times | Rulings 28 and 29: 1.068; 462, 417, 921, 700, 496, 471 | MSG-MOT-01 |
| Motion check failing headless | Motion check note: 11 of 11 headed, 60 Hz or better | MSG-MOT-07, PR 11g |

## Completeness pass, 4 Nov 2026

Criteria for the IDs, rows and rules 05, 06 and 07 add under the same heading. Numbering `MSG-CP-<n>`. Check letters as above (S screenshot pair, D test, C clip); not-drawn states have no design shot, so S means the app shot against the 06 completeness rows, light and dark, at 390, 430, XXL and 1440. Each criterion names the PR that owns it (list at the end).

### The lane flag

- MSG-CP-01. `golf_messages_redesign_v1` exists in `config/feature-flags.yml` in the shape of `golf_clubhouse_ui`, default false in every environment, `expires_at` null, and `src/clubhouse/routes/messages.tsx` reads it with `isFlagEnabled` and passes `redesign` to `Messages`. Check: D (registry test; `npm run flags:generate` leaves no diff).
- MSG-CP-02. With the flag off, Messages renders exactly as main: the existing Clubhouse Messages Playwright screenshots match main's within the suite's threshold, the DOM has no `data-ch-ms-v2`, the row typing listener and row mute read never run, and today's typing expiry (3s) holds. Check: D, S (flag off, against main).
- MSG-CP-03. With the flag on, `[data-ch-ms-v2]` is on the Messages root and every new rule in `messages.css` is scoped under it (a lint test finds no unscoped new selector). Check: D.
- MSG-CP-04. No old rule or token that 02-PLAN marks for deletion is deleted in 11a to 11h; they go in a later cleanup PR. `--ch-bubble-mine-bg` still exists while the flag can be off. Check: D (grep).
- MSG-CP-05. PR 11h with the Messages flag off makes no request to `golf_conversation_pins` and uses `pinned.ts` only. Check: D (network spy).

### Send, retry, offline

- MSG-CP-06. A send that answers within 1000ms never shows "Sending…"; one that takes longer shows it in the receipt slot, 13/400 tertiary (5.85 light, 7.80 dark), fading in over 180ms (M-MSG-CP-01). Check: D (fake timers), S `pending-phone`.
- MSG-CP-07. A failed send shows today's "Not sent" line with its retry (S2); retry reuses the client id, and a 23505 answer counts as sent. Check: D.
- MSG-CP-08. A retried message that the server orders below later messages moves there on `smooth` (M-MSG-CP-03) with no jump, gap or blink under the page's judge. Check: C by hand, D.
- MSG-CP-09. The hold menu on a failed bubble offers Retry, Copy and Delete; Delete removes it from this device with no confirm and calls no server action. Check: D.
- MSG-CP-10. Offline, the shell's banner shows; the cached inbox and thread stay readable; the composer accepts typing; Send fails the bubble at once with "Not sent"; vote, pin, mute, leave and delete show today's CH-1903 refusal and change nothing. Check: D (Playwright offline).
- MSG-CP-11. Back online, conversations and the open thread refetch once, missed messages land in place at frame one with one make-room glide on `reveal` (M-MSG-CP-13), the nav badge refetches, and no failed message sends by itself. Check: D, C by hand.
- MSG-CP-12. Send, poll Send, confirm buttons, Add and Post are disabled from press until the server answers; pressing twice sends once. Enter held down in the composer sends once. Check: D.

### Attachments

- MSG-CP-13. A sent photo shows its local preview at final size from frame one with the 32 disc and spinner (M-MSG-CP-04) until done; a file shows the spinner in its icon slot; no percentage is shown. Check: S `upload-phone`, D.
- MSG-CP-14. A failed upload runs today's compensating delete and leaves the bubble with "Not sent"; retry re-uploads; after a reload the pill offers today's "choose again". Check: D.
- MSG-CP-15. A file over today's limit, or of a type today refuses, adds no chip and shows today's copy (tested against source). Check: D.
- MSG-CP-16. Tapping an attachment whose signed URL is over 50 minutes old re-signs it first; a failed signing shows "Couldn't open this file. Try again." in the one toast style and nothing opens. Check: D (fake clock).
- MSG-CP-17. Offline, a picked file stays in the composer after a failed send. Check: D.

### Polls

- MSG-CP-18. Closing the poll composer with any typed content (close key, scrim, Esc, drag past the line) shows "Discard this poll?" with Discard and Keep editing; Keep editing returns to the sheet with its content; an empty composer closes at once. Check: D, S `confirm-phone`.
- MSG-CP-19. A vote is optimistic and on failure rolls back from its live fill on `smooth` with today's CH-7026 copy; a closed poll's choices are disabled, read "Closed", and take no taps; a close failure keeps its confirm open (CH-7027); a send failure keeps the poll bubble with "Not sent" (CH-7028). Check: D.
- MSG-CP-20. One voter and many voters: results read the same counts in the bubble and in See votes; in a multi choice poll one person's several answers count once per choice, and the total keeps today's rule (tested against today's `polls.tsx` output). Check: D (fixture with one and with eleven voters).

### Edited, deleted, receipts

- MSG-CP-21. An edited message shows "Edited" 13/400 in the bubble's own ink at full strength (lowest 5.58), never dimmed. v2 on desktop uses the edit chip; today's Edit modal is not mounted with the flag on. Check: S `edited-phone`, D.
- MSG-CP-22. A deleted message shows today's placeholder in a neutral bubble on its own side (9.77 light, 8.99 dark) with no reactions, receipt, hold menu or hover bar; a delete arriving from elsewhere crossfades (M-MSG-CP-07), closing a hold on it first. Check: S `deleted-phone`, C by hand.
- MSG-CP-23. Read receipts and Seen by count only current members; a removed member drops out of "n of m". Check: D.

### Mute, leave, removal

- MSG-CP-24. Leaving a group (CH-7502) pops to the inbox, then the row fades and the rows below close up (M-MSG-CP-11). Check: C by hand, D.
- MSG-CP-25. Removed with the thread open: the composer becomes "You're not in this conversation anymore." (8.96 light, 10.87 dark), loaded messages stay, hold offers Copy only, and no new messages arrive. Check: S `removed-phone`, D.
- MSG-CP-26. A removed team member's old messages stay with the name fallback "Player" and a neutral face, with no profile link. Check: D.
- MSG-CP-27. The team channel never offers Delete in the row menu or details (bug L2). Check: D.
- MSG-CP-28. Muting keeps today's push and unread rules exactly (`message-mute.ts` unchanged); the row's mute glyph shows on the next frame (MSG-LIST-17); a mute that ends while the app is open drops the glyph on the next row read. Check: D.

### Long threads, divider, scroll

- MSG-CP-29. Older messages load within one screen of the top; the message under the reader's eye keeps its exact `top` (M-MSG-CP-09); a loading row shows meanwhile; a failure shows "Couldn't load earlier messages" with Try again (44 tall). Check: D, S `older-phone`.
- MSG-CP-30. The jump key reaches the latest message even when its page isn't mounted (swap at the bottom in one frame). Check: D.
- MSG-CP-31. The unread divider ("New", today's copy) sits above the first unread message, accent 13/600 (7.21 light, 9.44 dark); when more than one screen is unread the thread opens with it 120pt under the bar; your own send fades it (M-MSG-CP-08); messages arriving while open add no divider. Check: S `divider-phone`, D.
- MSG-CP-32. Scroll restore: leaving a thread and coming back in the session puts the reader where they were, unless new messages came, which opens at the divider; a push opens at the latest. The inbox keeps its scroll under the push and on Back. Check: D.
- MSG-CP-33. The thread has no pull to refresh; the inbox keeps today's. Check: D.

### Search

- MSG-CP-34. Search never returns a hit from a hidden conversation (bug M1). Check: D.
- MSG-CP-35. No results shows the card "No results" 17/600 with "Try another name or word." (17.08 and 9.77 light; 14.34 and 10.25 dark), announced once politely. Check: S `search-empty-phone`, D.
- MSG-CP-36. Esc or Cancel leaves search and restores the inbox scroll; a hit opens its thread at the message with today's hit ring. Check: D.

### Typing

- MSG-CP-37. With the flag on, a typing entry ends 5s after its last event, when a stop event arrives, or when that person's message arrives; the bubble leaves as 07 M-MSG-08a says, and the row and pin dots swap back to the preview in one frame. With the flag off, today's 3s. Check: D (fake timers).
- MSG-CP-38. A typer who leaves the conversation or the screen stops showing at once. The viewer's own typing never shows to themself on another device. Check: D.

### Pins (11h, held)

- MSG-CP-39. First sync on a device: the server list comes first; that device's pins are added after it, in order, skipping ones already pinned and ones the viewer is no longer in, until the cap; no toast is shown during it; the storage flag `ch:msg:pins-imported:<viewer>:<team>` is set only after the import finishes, so a failed import tries again next time. Check: D.
- MSG-CP-40. Two devices pin different conversations at the cap at the same moment: one wins under the lock; the other reverts its optimistic pin with "You already have 3 pinned."; both converge within 2s. Check: D (fake), staging after apply.
- MSG-CP-41. Until the held migration runs: each device keeps its own pins, nothing tells the viewer pins don't sync, and no request error reaches the console. After the owner applies, the next probe (within 5 minutes) switches to the server and runs the import once. Check: D.
- MSG-CP-42. When the server's list differs from the screen, pins move on `smooth` and an added one pops once (M-MSG-CP-18); the Pinned card never shows device pins then swaps them for server pins in one frame. Check: C by hand, D.
- MSG-CP-43. At the cap the row menu's Pin is disabled with "Pin up to 3" and reads "Pin, dimmed, Pin up to 3" to VoiceOver; new pins go at the end; there is no reorder control. Check: D.

### Deep links and layout

- MSG-CP-44. Cold start from a push: the thread is shown already pushed over the mounted inbox, with no slide; Back goes to the inbox. Warm: the thread replaces any open one. Check: D (e2e with `?conversation=<id>`).
- MSG-CP-45. A deep link to a deleted conversation, or one the viewer left or was removed from, shows today's CH-7015 toast and the inbox; on desktop the pane then shows the newest thread, never empty (bug L3). Check: D.
- MSG-CP-46. Inbound `conversation`, `player`, `user`, `compose` and `prefill` keep today's handling; in-app navigation writes nothing new to the URL (S9). Check: D.
- MSG-CP-47. Desktop 720 to 1099: rail and thread, details floats over the thread; under 720: rail or thread with the phone push; at XXL the 1100 line moves to 1280. Resizing across a line keeps the open conversation, draft, scroll place and details state. Check: S `inbox-desk-w1024`, D.
- MSG-CP-48. After markRead, Messages calls `badges.refetch()` (flag on), so the nav count drops on the next frame, not after the 45s poll (bug M3); deleting a conversation drops its unread from the badge (bug H1). Check: D.

### Keyboard and accessibility

- MSG-CP-49. Enter sends, Shift+Enter adds a line, Enter during IME composition never sends, Enter on an empty field does nothing. Check: D.
- MSG-CP-50. Esc closes only the top layer in the order 05 lists, never clears typed text, restores the pre-edit draft when it closes the edit chip, and returns focus to the opener. Check: D.
- MSG-CP-51. The thread is `role="log"`; others' arrivals are announced politely, your own sends are not; the VoiceOver labels in 06 completeness hold; every new control is 44pt or more. Check: D (axe and label assertions).
- MSG-CP-52. Composer with long text grows to min(6 lines, 30% of the visual viewport), then scrolls inside; at XXL on 390 with the keyboard up the latest message and the Send key stay visible and nothing clips. Check: S `composer-phone-xxl` with long text, D.

### Confirms, announcements, prefill, no team

- MSG-CP-53. Every confirm keeps today's copy, puts focus on the safe button, binds Esc to it, never binds Enter to the destructive button, and stacks its buttons at XXL when a label would wrap. Destructive text is `--ch-flag` (5.94 light, 7.48 dark). Check: S `confirm-phone`, D.
- MSG-CP-54. The Announcements row keeps today's place and copy as an inbox row in its own card (tile, title, newest line, count), with no accent left border; the Urgent chip reads 5.49 light, 5.59 dark; an announcement never renders as a chat bubble. Check: S (today's `announcement` fixture), D.
- MSG-CP-55. An announcement made through Ask appears only after Ask's 8s Undo closes, looks the same as any other, and carries no "from Ask" mark; if `?announcement=<id>` is added it opens that detail, and an unknown id shows "That announcement isn't available." over the inbox. Check: D.
- MSG-CP-56. New announcement is absent from the player DOM; closing it with typed content asks "Discard this announcement?". Check: D as demo player and coach.
- MSG-CP-57. A prefill opens the conversation with the text in the field, the caret at its end and nothing sent; the coach's own unsent draft there wins and shows "You already had a draft here."; a board image arrives as a photo chip; a poll prefill opens the poll composer filled. With the Messages flag off the prefill still works (today's path). Field by field: MSG-CP-61 to 69. Check: D.
- MSG-CP-58. Roster "Message" (`?player=`) opens or starts the DM with an empty field; Back goes to the inbox. Quick chat's message appears only after its hold, as your own message, and Open lands on that thread. A practice plan publish adds nothing to Messages unless the team chat switch was on, and then only a plain coach bubble. Check: D.
- MSG-CP-59. No team: today's `MessagesNoTeam` copy in the empty inbox card style; the green bar is unchanged. Check: S, D.

### Toast lines (fixed list)

- MSG-CP-60. The one toast style carries, beyond MSG-TOAST-03's list, exactly these new lines: "Couldn't open this file. Try again." (11d), "You already had a draft here." (11d), "That announcement isn't available." (11b, only if `?announcement=` lands), "The board picture wasn't found. Make it again in Ask." (11d), "Couldn't open the poll draft. Nothing was posted." (11d). Today's error toasts (CH-70xx, CH-1903, `friendlyReason`) keep their copy and take the style. Check: D (string list).

### Ask prefill fields (AK11c hand-off)

- MSG-CP-61. A prefill with `conversationId` lands in that conversation in place at frame one (no slide), with the inbox under it on phone and the row selected in the rail on desktop; `conversationId` wins over `players`. Check: D (e2e, both flag states).
- MSG-CP-62. When the named conversation is deleted or the viewer is no longer a member: with exactly one player in `players`, the DM with that player opens or starts and the prefill lands there with no toast; otherwise today's CH-7015 toast shows over the inbox, nothing opens, the prefill key is removed, and no other conversation receives it. Check: D (deleted conversation; removed participant; group with no players).
- MSG-CP-63. `draft` fills the field with the caret at its end and nothing sent; the coach's own unsent draft there wins and "You already had a draft here." shows, while the board and the poll still land. Check: D.
- MSG-CP-64. `attachment {kind:'board'}` shows as a photo chip named "Board.png" with its thumbnail and a 44pt ×; Send uploads it through the normal path with the text 8px under it; a missing blob adds no chip and shows "The board picture wasn't found. Make it again in Ask."; over today's limit uses today's too-large copy; another `kind` is ignored. Check: S (prefill fixture), D.
- MSG-CP-65. `poll` opens the poll composer by itself, filled in order, once the thread is in place (M-MSG-CP-21); nothing posts until the coach presses its Send, which calls `sendGolfPoll` once; a rejected poll opens the thread with text only and "Couldn't open the poll draft. Nothing was posted."; closing the filled sheet asks "Discard this poll?". Check: D, C by hand.
- MSG-CP-66. No prefill field ever sends or posts on its own, with the Messages flag on or off: a network spy sees no `sendGolfMessage`, `sendGolfPoll` or storage upload until the coach presses Send. Check: D.
- MSG-CP-67. The key is read once (`takePrefill`); a reload before Send keeps the text through the drafts store and drops the chip and the sheet. Check: D.
- MSG-CP-68. The Messages back key from a prefilled thread goes to the inbox; browser back returns to Ask. Check: D.
- MSG-CP-69. With the Messages flag off, the same fixture (conversationId, board, poll, gone conversation) gives the same destination, chip, filled poll and toasts in today's composer (AK11c), so the two flag states agree on behaviour. Check: D (the same e2e run with the flag off).

### PR owners

| PR | Criteria |
|---|---|
| 11a | MSG-CP-01 to 05 (flag and scoping), the fixture views 05 names |
| 11b | 27, 34 to 36, 45 (desktop pane), 47, 48, 54, 55, 59 |
| 11c | 06 to 09, 21 to 23, 26, 29 to 33, 44, 51 |
| 11d | 10 to 17, 49, 50, 52, 57, 58, 60, 61 to 68 (with AK11c, which builds the same reads in today's composer; 69 runs in both) |
| 11e | 18 to 20, 37, 38 |
| 11f | 24, 25, 28, 46, 53, 56 |
| 11g | the interrupt cases added in 07 completeness |
| 11h | 39 to 43 |

### Fixed in place on 4 Nov (log)

- MSG-ALL-02: "after 11c" read as deleting the gradient; with the flag the token stays until cleanup, so it reads "with the flag on".
- MSG-ALL-11: added that inbound params keep today's handling (MSG-CP-46).
- MSG-TOAST-03: added the completeness lines (MSG-CP-60) and today's error toasts.
- `KEPT` intro: the pin-failed toast "Couldn't pin. Try again." is removed; S5 and MSG-PIN-05 allow only the two PIN-SYNC lines.

### Added by the lead (4 Nov)
- MSG-CP-70. 11f: `?announcement=<id>` on a cold start opens that announcement's detail at rest (no slide), Back goes to the Announcements list, and an unknown, deleted or other-team id shows the inbox with "That announcement isn't available."; with the flag off the param is ignored.
- MSG-CP-71. Offline, Send fails at once with "Not sent" and tap to retry, as today; nothing is queued and nothing sends on reconnect without a tap.


## Wiring, 4 Nov 2026

Pass or fail, one per action or data group, against 06 "Wiring, 4 Nov 2026" (W1 to W8). Run on the PR named; unit tests mock the actions, the realtime checks use two signed-in browsers on a preview with the flag on.

- W-MSG-1. Flag (S-MSG, every ID). With `golf_messages_redesign_v1` off, `/golf/dashboard/messages` renders today's DOM and strings for coach and player, no `data-ch-ms-v2` attribute, no `golf-conversation:<id>` channel for any row that is not open, typing clears at 3 s, and `?announcement=` is ignored. With it on, the root carries `data-ch-ms-v2` and typing clears at 5 s. The preview renders v2 whatever the flag says. (11a)
- W-MSG-2. Rows (S-MSG, S-MSG.unread). Each row's name, time, preview, unread dot and mute glyph come from `useGolfConversations`; the glyph shows exactly when `isConversationMuted` is true for the viewer's own participant row, using the existing participant select (no extra request in the network log). Muting on device A shows the glyph on device B within 2 s without a reload. (11b)
- W-MSG-3. Typing on rows and pins (S-MSG). A broadcast from another member shows dots on that row and pin; the viewer's own broadcast never does; dots clear 5 s after the last event and at once when a message arrives; no more than 30 channels are joined; the open conversation's topic is joined once only, by the thread, and after opening a row whose topic the inbox held the thread still receives typing and new messages (supabase-js 2.117.2 client, fake socket). (11b)
- W-MSG-4. Mark read and badge (S-MSG.row-menu, S-MSG.thread). Opening a thread with unread messages, and Mark as read in the row menu, move the Messages badge within one request of the write finishing (`badges.refetch()`), not on the next 45 s poll. A hidden conversation never counts. (11b)
- W-MSG-5. Search (S-MSG.search). A hit from a conversation the viewer deleted (hidden, no newer message) is not shown; after a new message brings that conversation back, its hits show. Fewer than 2 characters makes no request. (11b)
- W-MSG-6. Send (S-MSG.composer, S-MSG.pending). Send calls `sendGolfMessage` once per press with a client id; a second press while sending does nothing; an IME composition Enter never sends; 5001 characters can't be typed; a 23505 on retry reads as sent; a refused send shows "Not sent" with retry; offline fails at once with CH-1903 and keeps the text. The other member sees the message by realtime without a reload, and their inbox row moves to the top. (11d)
- W-MSG-7. Attachments (S-MSG.upload, S-MSG.file). A refused type or size toasts CH-7101 before any upload; a send with files calls `sendMessageWithAttachments` once; a failed insert leaves no stored object (compensation); a video with `duration_seconds` shows its length and one without shows its size; opening an attachment fetched more than 50 minutes ago calls `getGolfMessageAttachments` again before opening. (11c, 11d)
- W-MSG-8. Edit and delete (S-MSG.edit, S-MSG.edited, S-MSG.deleted). Only your own messages offer Edit and Delete; a server refusal of either toasts CH-7007 or CH-7008 and the thread shows the server's state; a deleted message closes in place on both devices and never reappears on reload; a deleted reply parent reads "Message deleted". A poll delete on a database without `20261028140800` toasts CH-7008 and the card returns. (11c, 11e)
- W-MSG-9. Reactions (S-MSG.react, S-MSG.who-reacted). One write per tap to `golf_message_reactions`; a tap while one saves is dropped; a double-tap toggles Like once; a refusal toasts CH-7009; the other device shows the badge without a reload. (11e)
- W-MSG-10. Polls (S-MSG.poll, S-MSG.votes, S-MSG.poll-composer). Bars use `pollShare` (count over people who voted); "Most votes" shows only when `leaders.length === 1`; the footer counts people; a multi poll counts each person once per choice they picked; a vote shows at once and a refused vote restores your old row and shows CH-7030 or CH-7029; Close shows only to the sender; the composer refuses a question over 140, fewer than 2 or more than 6 choices, a choice over 60 and an end over 30 days, with today's copy; a sent poll lands once (no duplicate from realtime). (11e)
- W-MSG-11. Seen by (S-MSG.seen, S-MSG.holdseen). The pill shows only under your own latest message in a group, for coach and player; names and times come from the read map and seen times; a member reading the thread updates the pill on the sender's screen without a reload; a player's response holds read times only, no figures. (11e)
- W-MSG-12. Mute (S-MSG.mute, row Mute…). Each length writes `setGolfConversationMute` once; a muted member gets no push, email or bell row for a new message in that conversation (fan-out log), and unmuting restores them; the mute toast replaces itself. (11f)
- W-MSG-13. Members, leave, add, remove (S-MSG.groupdetails, S-MSG.add, S-MSG.confirm). Add and Remove show only to the group's creator; Leave only to a non-creator; Delete conversation is absent for the team channel; each write fires once while its confirm button shows a spinner; a refused Remove puts the row back; leaving closes the thread and drops the row. (11f)
- W-MSG-14. Removed (S-MSG.removed). Removing a player from a group while their thread is open: on the player's next list read (or their next send), the composer becomes "You're not in this conversation anymore.", loaded messages stay, hold offers Copy only; a deep link to a conversation never seen still gives CH-7015. (11c, 11f)
- W-MSG-15. Deep links (S-MSG.deeplink). Push and bell rows open `?conversation=<id>`; an unknown or left id gives CH-7015 and, on desktop, the newest thread opens beside the rail; `?player=` and `?user=` outside the team give CH-7001; the URL is replaced with the bare path after each. (11b, 11c)
- W-MSG-16. Prefill (S-MSG.prefill). Nothing is sent or uploaded before Send; the coach's own draft wins with "You already had a draft here."; a `conversationId` the viewer can see opens that thread, one they can't falls back to the one-player DM or CH-7015 and never another group; a missing board blob lands the text with its toast; a rejected poll lands the text with "Couldn't open the poll draft. Nothing was posted."; `returnTo: 'ask'` makes the back key return to Ask once. Same with the Messages flag off. (11d, with Ask AK11c)
- W-MSG-17. Announcements (S-MSG.announcements, S-MSG.announcement, S-MSG.new-announcement). New announcement is absent from a player's DOM and the action refuses a player; Acknowledge and task done write once and reread the list; `?announcement=<id>` opens an id in the viewer's list and shows "That announcement isn't available." for any other. (11b, 11f)
- W-MSG-18. Notifications (W7). A text, a file message and a poll each produce, for every unmuted other member, one bell row with `/golf/dashboard/messages?conversation=<id>`, a push only when that person's `push_messages` is on, an email only when `email_messages` is on; reactions, votes, edits, deletes, mute, pins and typing produce none. (11d, 11e)
- W-MSG-19. Privacy (every ID). No Messages response or DOM node carries a stat figure; a player's DOM has no Class status card, no Profile quick action on a teammate's thread and no New announcement entry, checked by DOM query, not by visibility. (11f)
- W-MSG-20. Pins sync (S-MSG.row-menu, 11h). With the flag off, no request to `golf_conversation_pins`; with the table missing, device pins only and no console error; with it applied, a pin on device A shows on B within 2 s and a fourth pin is refused with "You already have 3 pinned.". (11h)
- W-MSG-21. Shot tracking (every ID). The PR diff touches no shot tracking file, table or payload. (every PR)

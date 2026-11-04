# Fidelity spec: Messages

> **3 Nov:** 05-SCREENS.md, 06-SCREEN-SPECS.md, 07-MOTION.md and 08-ACCEPTANCE.md are the build contract (BUILD_CONTRACT_STANDARD.md). Where they and this file differ, they win. Section 10's line numbers are for prototype.js as of page v9.


The build copies the page; it does not interpret it. Every number here comes from `redesign/redesign.css` (part 2 wins over part 1 where both set a value) or `redesign/prototype.js`. Where the two disagree with this file, the page wins and this file has a bug: say so in the PR.

Sizes are CSS px at Text Size default. Every text size, and the bubble's padding, is multiplied by Text Size: the page writes `calc(Npx * var(--k))`; the app writes `calc(N * var(--ch-type-k))`, where `--ch-type-k` is `calc(var(--ch-type-scale, 1) * 1rem / 16)` (`lib/dynamic-type.ts`). Largest size: scale 23/17 = 1.353.

---

## 1. Capture links: open any state directly

```
redesign/clubhouse-messages.html#<state>-<phone|desk>-<light|dark>[-reduce][-xxl][-w430][-shot]
```

| Flag | Effect |
|---|---|
| `phone` / `desk` | 390 pt phone or the desktop frame |
| `light` / `dark` | theme |
| `reduce` | Reduce Motion on |
| `xxl` | Text Size scale 1.353 |
| `w430` | the 430 pt phone (20 px edge) |
| `shot` | device alone at the app's size (390×844, 430×932, 1440×900), no frame, no status bar, island or home indicator, no safe areas (section 4) |

`#motion-check` runs the 11 interrupt cases (section 11). The page also has a control bar: phone or desktop, light or dark, Text Size (default, larger, XXL), Reduce Motion.

---

## 2. Tokens: design name to app token

PR 1 adds the `--ch-*` semantic tokens (DESIGN_LANGUAGE.md section 3). Messages adds the three marked **new**. Light, then dark.

| Design | Light | Dark | App token | Notes |
|---|---|---|---|---|
| `--a-page` | `#F2F0E9` | `#0E120F` | `--ch-grouped-bg` | the one flat page under the thread, inbox and details |
| `--a-page-2` | `#F6F4EE` | `#141815` | `--ch-well-bg-flat` | wells: search, segmented, poll options, starters, form fields |
| `--a-surface`, `--a-elev` | `#FFFEFB` | `#191E1A` | `--ch-card-bg` | cards, pills, sheets, details column on desktop |
| `--a-recv` | `#FFFEFB` | `#232925` | **new** `--ch-bubble-theirs-bg` | dark card `#191E1A` sits too close to the page for a bubble; `#232925` is today's `--ch-bg-elevated` |
| `--a-recv-ink`, `--a-ink` | `#1C1B18` | `#F1ECDF` | `--ch-text-primary` | |
| `--a-ink-2` | `#46433D` | `#D0C9B8` | `--ch-text-secondary` | previews, meta, names in bubbles, pills |
| `--a-ink-3` | `#5F5C55` | `#ADA697` | `--ch-text-tertiary` | times only (row times, drag times) |
| `--a-sent-b`, `--a-accent` (fill) | `#155A39` | `#1F6B45` | **new** `--ch-bubble-mine-fill` | light = `--ch-green-600`, dark = `--ch-green-500`. Also the send key, selected chips, unread count, Muted action, Coach fill. Replaces the `--ch-bubble-mine-bg` gradient in Messages |
| `--a-sent-ink`, `--a-accent-ink` | `#FDFCF8` | `#F4EEDD` | `--ch-on-fill-25` / `--ch-text-on-accent` | 8.0:1 light, 5.6:1 dark |
| `--a-accent-text` | `#155A39` | `#7CC79B` | `--ch-accent` | links, actions, icons in the reaction bar |
| `--a-unread` | `#155A39` | `#7CC79B` | `--ch-accent` | unread dot (mark, 3:1) |
| `--a-tint`, `--a-chip-bg` | `rgb(21 90 57/.1)` | `rgb(124 199 155/.12)` | chip tint of `--ch-accent` | Coach chip, Most votes chip, To token |
| `--a-chip-ink` | `#155A39` | `#7CC79B` | `--ch-accent` | |
| `--a-bar` | `rgb(21 90 57/.1)` | `rgb(124 199 155/.12)` | **new** `--ch-poll-bar` | poll option bar |
| `--a-bar-on` | `rgb(21 90 57/.2)` | `rgb(124 199 155/.24)` | `--ch-poll-bar-on` (same PR) | your choice's bar |
| `--a-wash` | `rgb(28 27 24/.05)` | `rgb(241 236 223/.06)` | row press wash (DESIGN_LANGUAGE 8) | rows wash, never scale |
| `--a-hair` | `rgb(28 27 24/.1)` | `rgb(241 236 223/.1)` | `--ch-separator` | 0.5 px hairlines inset 16 |
| `--a-recv-ring` | `rgb(28 25 18/.07)` | `rgb(237 231 216/.07)` | `--ch-card-ring` | |
| `--a-glass` | `rgb(253 251 247/.78)` | `rgb(22 27 23/.74)` | glass (DESIGN_LANGUAGE 4) | desktop bar; blur 24 saturate 170 |
| `--a-glass-strong` | `rgb(253 251 247/.9)` | `rgb(27 32 28/.88)` | **glass-strong** (langmap) | composer, menus, reaction bar, attach, jump, date pill, toast |
| `--a-glass-rule` | `rgb(28 25 18/.1)` | `rgb(237 231 216/.1)` | glass hairline | |
| `--a-scrim` | `rgb(28 30 24/.22)` | `rgb(0 0 0/.45)` | hold scrim | under the 14 px blur |
| `--a-dot` | `#8F8B81` | `#827D71` | `--ch-ink-400` | typing dots (mark) |
| `--a-champ` | `#B09560` | `#C9AD74` | `--ch-champagne-500` | your own reaction ring, focus ring |
| `--a-champ-link` | `#DCCDA6` | `#CDBB8E` | today's PhoneBar back link | unchanged |
| `--a-danger` | `#B3261E` | `#F28B7D` | `--ch-flag` | Delete only (langmap: red stays "under par" in golf data) |
| `--a-frame` | `#0A331F` | `#08150E` | `--ch-frame` | the green bar, unchanged |
| `--a-on-green` | `#F4EEDD` | same | `--ch-on-green-ink` | bar title |

Shadows:

| Design | Value (light) | Dark | App |
|---|---|---|---|
| `--a-card-shadow` | `0 0 0 1px rgb(28 27 24/.07), 0 1px 2px rgb(28 25 18/.05), 0 8px 20px -12px rgb(28 25 18/.12)` | `0 0 0 1px rgb(255 255 255/.06), inset 0 1px 0 rgb(255 255 255/.04)` | `--ch-card-shadow` (PR 1) |
| `--a-shadow-recv` | `drop-shadow(0 0 .5px rgb(28 27 24/.24)) drop-shadow(0 1px 2px rgb(28 25 18/.05)) drop-shadow(0 6px 8px rgb(28 25 18/.06))` | `drop-shadow(0 .5px .5px rgb(0 0 0/.4)) drop-shadow(0 3px 6px rgb(0 0 0/.3))` | **filter**, not box-shadow, so it follows the drawn tail. Replaces `--ch-elevation-bubble` in Messages |
| `--a-shadow-sent` | `drop-shadow(0 1px 1px rgb(11 58 37/.22)) drop-shadow(0 6px 10px rgb(11 58 37/.2))` plus `inset 0 1px 0 rgb(255 255 255/.14)` box-shadow (the lit edge) | `drop-shadow(0 1px 1px rgb(0 0 0/.4)) drop-shadow(0 6px 10px rgb(0 0 0/.35))` | replaces `--ch-elevation-bubble-mine` |
| `--a-shadow-float` | `0 0 0 .5px rgb(28 25 18/.1), 0 8px 24px -6px rgb(28 25 18/.22), 0 2px 6px rgb(28 25 18/.08)` | `0 0 0 .5px rgb(237 231 216/.12), 0 8px 24px -6px rgb(0 0 0/.6), 0 2px 6px rgb(0 0 0/.4)` | menus, glass controls |
| `--a-well-shadow` | `inset 0 1px 2px rgb(28 25 18/.06)` | `inset 0 1px 2px rgb(0 0 0/.3)` | wells |

Contrast, computed by the page's own table (light / dark, layers blended as drawn). Every pair passes:

| Pair | Needs (target 4.9, floor 4.5; marks 3) | Light | Dark |
|---|---|---|---|
| Your bubble text | 4.5 | 8.01 | 5.58 |
| Their bubble text | 4.5 | 17.08 | 12.58 |
| Names in bubbles, previews, meta, day and Seen by pills | 4.5 | 9.77 | 10.25 |
| Times revealed on drag | 4.5 | 5.85 | 7.80 |
| Context line on the page | 4.5 | 8.64 | 11.45 |
| Bar title on the green bar | 4.5 | 12.03 | 16.12 |
| Champagne back link on the green bar | 4.5 | 8.85 | 9.87 |
| Desktop bar title on glass / over a green bubble | 4.5 | 16.37 / 11.66 | 15.09 / 11.98 |
| Field placeholder | 4.5 | 9.45 | 10.25 |
| Links and actions | 4.5 | 8.15 | 8.45 |
| Most votes and Coach chips | 4.5 | 6.98 | 6.70 |
| Poll text on your bar | 4.5 | 11.36 | 9.17 |
| Menu text over the blurred thread | 4.5 | 15.82 | 14.45 |
| Delete (hold menu and, from v13, Delete conversation in the row menu) | 4.5 | 6.26 | 7.03 |
| Reaction on a paper bubble (ivory on green) | 4.5 | 8.01 | 5.58 |
| Reaction on your bubble, unread dot (marks) | 3 | 8.15 | 8.45 |
| Typing dots (mark), v13 `--a-dot` #7A766C / #827D71 | 3 | 3.97 page, 4.49 paper, 4.08 wash | 3.55 wash, 3.62 bubble, 4.60 page |
| Own-reaction and focus ring (mark), v13 `--a-ring` #8C703A / #C9AD74, on a page halo | 3 | 4.10 | 8.73 |
| Switch off ring (mark), v14 #8F8B81 / #827D71 | 3 | 3.37 | 4.12 |
| Avatar initials on the lightest coin | 4.5 | 5.59 | 5.59 |
| Rejected: ivory on `#2A7D53` in dark | 4.5 | 4.36 | 4.36 |

Add each text pair to `__tests__/contrast-tokens.test.ts`. With PR 7's class-year fills, re-check initials on each `--ch-yr-*` (DESIGN_LANGUAGE lists ≥ 4.7).

---

## 3. Type, spacing, radii, glass

Font: Instrument Sans (today's). Every size × Text Size. Phone floor 12 px (Clubhouse audit F09): nothing smaller ships on the phone.

| Element | Size / weight / line | Colour | Phone | Desktop |
|---|---|---|---|---|
| Large title "Messages" | 34 / 600 / 1.2, −0.034em | primary | yes | 26 |
| Context line | 15 / 400 / 1.33 | secondary | yes | yes |
| Section switcher, bar title | 17 / 600 / 1.3, −0.01em | on-green | yes | |
| Conversation bar name / role | 17 / 600 / 1.2 · 13 / 400 / 1.2 | on-green · on-green 86% | yes | 15 / 600 · 12.5 / 500 on glass |
| Back link | 17 / 400, champagne link | | yes | |
| Card title | 17 / 600 / 1.3, −0.01em; count at right 15 / 400 secondary | primary | yes | yes |
| Row name | 16 / 600 / 1.3 | primary | yes | yes |
| Row preview (2 lines) | 15 / 400 / 1.3 | secondary; unread primary | yes | yes |
| Row time | 13 / 400 / 1.3, tabular | tertiary | yes | yes |
| Pin label · bubblet | 13 / 500 · 12 / 500 | primary · secondary | yes | |
| Search well | 16 / 400, height 40 | secondary | yes | rail |
| Segmented | 14 / 500, selected 600 | secondary, selected primary | yes | yes |
| Bubble text | 16 / 400 / 1.32, −0.005em | per side | yes | 15 |
| Sender name in bubble | 13 / 600 / 1.3, margin-bottom 1 | secondary | yes | yes |
| Day pill · date pill | 13 / 500 / 1.3 | secondary | yes | yes |
| Drag or hover times | 13 / 400, tabular | tertiary | yes | yes (hover) |
| Seen by pill | 12.5 / 500 / 1.3, count 600 primary | secondary | yes | yes |
| Reaction badge | 12 (phone), 11.5 (desktop) / 600, icon 14 | per rule | yes | yes |
| Poll header · question | 13 / 600 · 17 / 600 / 1.3 | secondary · primary | yes | yes |
| Poll option · count · chip · footer | 14 / 500 · 13 / 600 · 12 / 600 · 13 / 500 | | yes | yes |
| Composer field | 16 / 400 / 1.32 | primary; placeholder secondary | yes | yes |
| Menu item · attach item | 15 / 500 / 1.2 | primary; Delete flag | yes | yes |
| Sheet title · subtitle | 17 / 700 · 15 / 400 | primary · secondary | yes | yes |
| Details name · line | 22 / 700 / 1.15 · 15 / 400 | | yes | 18 |
| Quick action label | 13 / 500 | secondary, icon accent | yes | yes |
| List row name · sub · right | 14.5 / 600 · 13 / 400 · 13 / 400 | primary · secondary · tertiary | yes | yes |
| Empty card title · body | 20 / 600 · 15 / 400 / 1.45 | | yes | yes |
| Hello name · sub · starter | 19 / 700 · 15 · 14 | | yes | yes |

Spacing and sizes:

| Thing | Value |
|---|---|
| Phone edge | 16; 20 on 430 pt (thread side padding 12 + the 30 px face slot gives the same visual edge) |
| Bubble | radius 19; padding 7.5 × 13 (× Text Size); max width 76% phone, `min(520px, 72%)` desktop; thread column max 760 on desktop, side padding 28 |
| Run | 2 between bubbles of a run, 10 before a run, 16 above a bubble with reactions; join corners 6 (theirs left, yours right) |
| Tail | 18 × 20 SVG at the bubble's bottom outer corner, offset −5, path `M0 0h12c0 9 1.6 14.5 6 20-5.2.3-9.8-.9-13.4-3.6L0 20z`, mirrored for theirs; only on the last bubble of a run |
| Faces | thread 30 slot (face beside the last of a run in groups); rows 44 phone, 40 desktop; pins 62; details 84 phone, 64 desktop; members 32; Seen by 16 (overlap −4, ring 1.5); poll voters 18 (overlap −5); conversation bar 36 |
| Rows | padding 10 × 16, about 72 tall, hairline inset 16; desktop rows inset 8, radius 12, padding 9 × 10 |
| Day pill | padding 4 × 11, radius 999, card shadow, margin 18 above, 10 below |
| Reactions | badge 26 tall, min 26 wide, padding 0 6, radius 999, at the bubble's top outer corner: top −14, right −10 (theirs) or left −10 (yours), 3 apart |
| Composer | pill padding 5, radius 24, max 760; + and send keys 36; field min 36, max 132 (six lines), padding 8 × 4; outer padding 8 × 10 phone (+ safe area), 10 × 28 × 18 desktop; a 24 px fade above it into the page |
| Attach menu | 240 wide, padding 6, radius 22, items 46 tall, icon tiles 32 radius 10 |
| Hold | reaction bar padding 5, keys 40; menu 236 wide, padding 6, radius 18, items 42 tall |
| Sheet | phone full width, top radius 20, grabber 36 × 5; desktop 400 wide, radius 20, centred; max height 78% / 82% |
| Jump | 40 circle, right 14, 12 above the composer; count badge 19 |
| Cards | radius 16, card shadow, title padding 14 × 16 × 10 with a hairline under it inset 16 |
| Details | quick actions 4 across, gap 8, radius 14 |
| Desktop | rail 320, thread flexible, details 300 |

Glass: blur 24 saturate 170 on bars, composer, menus, the reaction bar and attach (28 on attach); blur 16–18 on the jump key, date pill and toast. The desktop bar's hairline shows only when content is under it (opacity, 200 ms). Never on bubbles or cards.

Hold scrim: `--a-scrim` with `backdrop-filter: blur(14px) saturate(120%)`. The blur is set once; only the scrim's opacity animates.

---

## 4. Safe areas

The page draws a 54 px status bar and a 34 px home indicator. The app gets them from `env()`. Shot mode removes them, so each shot value is the drawn value minus 54 at the top or 34 at the bottom.

| Thing | Drawn | App formula |
|---|---|---|
| Green bar | 54 + 50 row | `env(safe-area-inset-top)` + 50 (today's `PhoneTop`) |
| Sheet lip | 16 under the bar | unchanged |
| Inbox scroll top | 128 | bar + lip + 8 |
| Thread top padding | 132 | bar + lip + 12 |
| Date pill top | 128 | bar + lip + 8 |
| Composer bottom | 30 | `max(8px, env(safe-area-inset-bottom) - 4px)` |
| Thread bottom padding | 104 | composer height + 16; `composer-inset.ts` already measures the composer's border box into `--ch-ms-comp-h` |
| Jump key bottom | 100 | composer top + 12 |
| Attach menu bottom | 92 | composer top + 8 |
| Toast top | 62 | `env(safe-area-inset-top) + 8` |

---

## 5. Every state and sub page

The capture fixture (section 12) must reach each one. Data in each is the page's `INIT` (prototype.js line 194).

| State | Shows | Where in the app |
|---|---|---|
| `inbox` | Large title, context line, search and New, segmented All, Pinned card (Team, Eli, Dana), Recent card. Desktop: rail with Pinned and Recent sections, Eli's thread open | `PhoneInbox`, `Rail` |
| `unread` | The filter on Unread: the thumb moved, three rows, the card titled Unread with its count | same |
| `thread` | Eli: two days, a photo, Like and Love badges, your last message with "Seen 8:15 AM" | `PhoneThread`, `Thread` |
| `team` | Team channel: names inside first bubbles, faces beside the last, the poll, Seen by pill | same, group |
| `typing` | Eli's typing bubble under the last message | `ThreadBelow` typing |
| `times` | Phone only: the thread dragged left 58 px with every time showing | `useLongPress` swipe |
| `poll` | Team poll card centred: three choices, voter faces, Most votes chip, 7 votes | `PollCard` |
| `votes` | See votes sheet grouped by choice, bar under each group heading | `PollVotesModal` |
| `seen` | Seen by sheet on t6: Seen with times, then Not seen yet with "Hasn’t opened this chat" | `SeenBySheet` / `SeenByPopover` |
| `hold` | e6 lifted over the blurred thread, reaction bar above, menu below | Message sheet |
| `holdseen` | t6 held in the team thread: the menu with the Seen by row and its faces | same |
| `react` | Love on e6: the badge at the corner | `ReactionChip` |
| `attach` | + turned to ×, the menu open Photos, File, Poll (v9 of the page; no Camera, no Announcement, Nick 31 Oct) | `ComposerPlus` |
| `file` | A file chip above the field, send key showing | `AttachChips` |
| `reply` | Eli's reply just landed out of the typing bubble | arrivals |
| `jump` | Scrolled up a screen, the jump key with a count of 2 | `ThreadBelow` |
| `details` | Eli's details: header, four quick actions, Class status, Photos and files | `PhoneDetails`, `Details` |
| `groupdetails` | Team details: Members (6 of 11) with Coach chips, files | same, group |
| `mute` | The mute menu open from the Mute action | `MuteControl` |
| `empty` | First run card: illustration, title, body, Start a conversation | `MessagesFirstRun` |
| `new` | New message: To field with a token, suggestions | `PhoneNewMessage`, `NewMessage` |
| `fresh` | A new conversation with Jack: hello card with starters | empty thread |

Kept from today and restyled with the same tokens, though the page doesn't draw them: announcements, Notify anyway, the class line, failed and pending bubbles, search hits, edit and delete modals, leave, add and remove member, mute labels, the no-team state, skeletons. Each takes the card, well, pill and sheet styles above.

---

## 6. Mechanics

| Input | Where | Does |
|---|---|---|
| Tap a row or pin | inbox | push the conversation (phone); select it (desktop) |
| Row swipe | inbox, phone | today's: mark read or unread, delete (owner decision 14) |
| Tap segmented | inbox | filter; thumb slides |
| Tap New | inbox | push New message |
| Tap the conversation bar face or name | thread | push Details (phone); toggle the details column (desktop) |
| Back key, edge swipe | phone | pop |
| Drag the thread left | phone thread | follows at 60% to 58 px max, times show at the right; release springs back (settle) |
| Hover a row | desktop | the time fades in (150 ms); the hover bar (Like, Love, Reply, more) rises beside the bubble |
| Swipe a bubble right | phone | reply (today's, kept) |
| Press | bubble | sinks to 0.97 on pointer down (110 ms); moving past the slop or letting go before the hold releases it (280 ms) |
| Hold 450 ms, 10 px slop | bubble | lift, reaction bar, menu; `haptic('press')` (light), as the app's haptics map has it; medium (`commit`) stays reserved (`SETTLED-4NOV.md` 22). The page uses 8 px slop; the build keeps today's 10 |
| Enter or Space on a focused bubble | thread | opens the same lift (keyboard users) |
| Right-click | desktop bubble | same lift |
| Double-tap | bubble | toggle Like |
| Tap a reaction in the bar | hold | toggle it, dismiss |
| Tap a badge | bubble | who reacted (today's card) |
| Tap Seen by pill or the menu's Seen by row | your message, group | Seen by sheet |
| Tap a poll choice | poll | vote or change (multi toggles) |
| See votes | poll footer | votes sheet (phone) or centred card (desktop) |
| Sheet grabber drag | phone sheet | follows; rubber band upward; release past a third of its height or a flick over 0.5 px/ms closes, otherwise settles back |
| Tap scrim, Esc | any overlay | close |
| Type | composer | send key springs in with the first character; field grows to six lines |
| Enter / Shift+Enter | desktop composer | send / new line, with today's hint line (CH-7802); phone Return adds a line and the send key sends |
| + | composer | attach menu; + turns to × |
| Pick an attach item | menu | file chip rises above the field; Poll opens the poll composer sheet (today's `PollSheet`) |
| Jump key | thread | springs to the latest (reveal) |
| Mute action | details | menu: Mute 8 hours, Mute a week, Until I turn it on (today's labels) |
| Starter | fresh thread | fills the field, never sends |
| Keyboard | desktop | today's keyboard behaviour stays; Tab order rail, thread, composer, details; focus rings champagne 2 px, offset 2 (bubbles offset 3) |

---

## 7. Motion

### Springs

App: `lib/motion.ts` `CH_SPRINGS`, given as `{ visualDuration, bounce }` and run by `chSpring` as stiffness and damping (ω = 2π / (1.2 × vd), ζ = 1 − bounce), so a retarget keeps its velocity.

| Spring | vd / bounce | Stiffness · damping | Settles | Peak | SwiftUI | Status |
|---|---|---|---|---|---|---|
| smooth | 0.26 / 0 | 406 · 40.3 | 462 ms (the design language's `linear()` curve) | 1.000 | `.spring(duration: .31, bounce: 0)` | exists |
| settle | 0.26 / 0.10 | 406 · 36.2 | 427 ms | 1.001 | `.31, .1` | exists |
| reveal | 0.52 / 0 | 101 · 20.1 | 941 ms | 1.000 | `.62, 0` | exists |
| send | 0.42 / 0.12 | 155 · 21.9 | 713 ms | 1.003 | `.5, .12` | **add** |
| pop | 0.25 / 0.35 | 439 · 27.2 | 540 ms (app `chSpringCurve`: 496) | 1.067 (app: 1.068; tests pin 1.068) | `.3, .35` | **add** |
| lift | 0.28 / 0.15 | 350 · 31.8 | 487 ms | 1.006 | `.34, .15` | **add** |

`motion.ts` says bounce stays between 0 and 0.1. send, pop and lift pass that for chat-only moments (a badge arriving, a held bubble lifting). Nick signed them off on 31 Oct ("yeah as long as it's smooth"): record that in the comment, and hold them to the motion check (section 11), which is what "smooth" means here.

Fixed tweens: press 110 ms down to 0.97, 280 ms release, `--ch-ease`; sheet down 280 ms `--ch-ease`; receipt crossfade 180 ms; poll check draw 260 ms `--ch-ease` (stroke-dashoffset 20 → 0); title fade 180 ms; desktop hairline 200 ms; date pill 180 ms in, 250 ms out after 1 s still; hover time 150 ms; hover bar 160 ms opacity, 220 ms transform from translateY(4) scale(0.96); segmented thumb 360 ms `--ch-ease-spring`; mute switch 320 ms `--ch-ease-spring`; typing dots 1.2 s loop, `cubic-bezier(.45,0,.55,1)`, delays 0, 160, 320 ms, translateY(−3) and opacity 0.4 → 1.

### Reduce Motion

Nothing travels or scales. Anything that would move appears in place with a linear opacity fade of `CH_FADE_MS` (180 ms today, `lib/motion.ts`, pinned by `reduced-motion.test.tsx`; the shared value in START_HERE), or at once where the table says so. The design page draws 120 ms; the build uses the shared 180 and the table below gives 180. Typing dots hold still at full opacity (page v12), so the mark keeps 3:1 (v13 colours: 3.97 light on the page, 3.55 dark on the wash). In the app: `chSpring(kind, reduced)` returns duration 0, so give each motion a `CH_FADE_MS` (180 ms) linear opacity transition in its reduced branch (`--ch-dur-crossfade-rm` from PR 1). Settings > Animations off behaves the same.

### Every motion

Interrupt rules (the page's `anim()` options, section 10):
- **Live-start:** read the computed transform and opacity, cancel, start from there. In framer this is the default when you retarget an `animate` on the same element; never remount to restart.
- **Additive:** two thread glides sum (WAAPI `composite: 'add'`). In framer: animate a wrapper's `y` and keep the arrival's own offset on the inner element, or keep one motion value and add to its target.
- **Carry:** a re-render must not restart a running motion. Key bubbles by message id and keep the node.
- **Hand-off:** a closing overlay that is reopened reverses from where it is (`is-closing`, `HOLD_OUT`, `SHEET_OUT`, `is-leaving`), never a new copy over the old one.

| Motion | Trigger | What moves | Spring | Interrupt | Reduce Motion |
|---|---|---|---|---|---|
| Push into a conversation | tap row or pin | thread x 100% → 0; list x 0 → −24% (`CH_UNDERLAY_SHIFT` 0.24; PR 1 moves `--ch-vt-parallax` from −30% to −24%) and dims to brightness(0.9), 462 ms on `--ch-ease-spring-smooth` (the page draws −30% and a 0.1 black dim; the build uses the shared values); the tapped face flies to the bar on the same curve | smooth | Back mid-push reverses from the live x (`is-leaving`) | crossfade 180 |
| Back | back key, edge swipe | the same in reverse | smooth | push mid-pop reverses | crossfade 180 |
| Top bar | none | never moves; the lip stays put | none | | none |
| Filter | tap segmented | thumb x; rows that stay glide to new y; rows that leave fade | thumb 360 `--ch-ease-spring`; rows smooth | a second tap retargets from live | thumb jumps; rows crossfade 180 |
| Typing in a row or pin | typing event on that conversation (02-PLAN §3.8) | preview swaps to three dots; hides 5 s after the last event | 1.2 s loop | | dots pulse |
| Desktop bar hairline | content under the bar | hairline opacity | 200 ms | | same |
| Date pill | scroll | opacity in; out 1 s after scroll stops | 180 in, 250 out | scrolling again cancels the out | same |
| Drag for times | horizontal drag on phone | thread x at 60% of the finger, max 58 | settle on release | a new drag starts from the live x | follows the finger; returns at once |
| Arrivals | new message | the new row has full height at frame one; only transforms move (B7) | send | | 180 fade |
| Send key | first character / field empty | scale 0.4 → 1 and back; no key while the field is empty (page v9 matches) | pop | retarget from live | swaps |
| Field grows | new line | height steps, not animated | instant | | same |
| Sent bubble rises | send | the real bubble moves from the field text's rect to its slot, scale 0.96 → 1; no overlay copy (`SETTLED-4NOV.md` 23) | send | a second send 140 ms later starts its own; both land in order | fades in place 180 |
| Thread makes room | send, arrival | everything above glides up by the new row's height | send, additive | two glides sum; the bottom target is re-read each frame (`maxTop`, below) | moves at once |
| Delivered → Seen | receipt | crossfade | 180 ms | | 180 |
| Typing bubble | typing on | grows from its tail corner (origin 0 100%) | pop | | fades in |
| Reply opens from typing | message replaces typing | the message grows out of the typing bubble's corner at its size | reveal | a send while it opens: both run, additive | crossfade 180 |
| Press | pointer down | bubble scale 0.97 | 110 / 280 `--ch-ease` | | none |
| Lift | 450 ms hold | bubble lifts over the blur, moving up if the menu needs room; haptic | lift | release mid-lift reverses from live; hold again while settling picks up the settling copy (`HOLD_OUT`, `finishHoldOut`) | appears in place |
| Reaction bar | lift | scale from the bubble's top corner | pop | | fade 180 |
| Menu | lift | scale 0.8 → 1 from the bubble's bottom edge | lift | | fade 180 |
| Blur behind | lift | scrim opacity; blur set once | smooth | | scrim only |
| Dismiss | tap scrim, pick, Esc | bubble settles back; bar and menu shrink toward it | settle | reopen mid-dismiss reverses | fade 180 |
| Badge pops | react | scale 0.4 → 1 from the bubble corner | pop | toggling again retargets | appears |
| Count | react | number changes at once; no count-up | none | | same |
| Double-tap Like | double-tap | as Badge pops | pop | | appears |
| Vote | tap a choice | ring fills; check draws | pop; check 260 | change 100 ms later retargets every bar from live | check appears |
| Bars glide | vote, realtime vote | every bar `scaleX` to its share together; counts change at once | smooth | live retarget | at once |
| Your face joins | vote | your avatar pops into the choice's stack | pop | | appears |
| See votes | footer tap | phone: sheet y 100% → 0; desktop: scale 0.96 → 1 in place; down 280 `--ch-ease` | smooth | close mid-rise reverses; reopen mid-close reverses (`SHEET_OUT`) | fade 180 |
| Sheet drag | grabber | follows; rubber band up; release decides | smooth back; thrown exit keeps velocity (`chThrownExit`) | | no drag motion; closes at once |
| Seen by pill | read receipt | new faces pop into the stack | pop | | appears |
| Seen by sheet | pill or menu row | as See votes | smooth | as See votes | fade 180 |
| + to × | tap + | icon rotate 45° | pop (CSS `--ch-ease-spring` 300) | | swaps |
| Attach menu | tap + | scale 0.4 → 1 from the + (origin 18 px 100%) | lift | close then reopen fast reverses the closing menu (`is-closing`) | fade 180 |
| File chip | pick | rises 12 px above the field | smooth | | appears |
| Phone details | tap bar | push | smooth | as push | crossfade 180 |
| Desktop details | tap bar | the 300 px column opens (`grid-template-columns`, 462 ms `SMOOTH_LINEAR`); the thread narrows and stays on the latest message (`pinBottom`) | smooth | close mid-open turns around where it is | opens at once; panel crossfade 180 |
| Mute menu | Mute action | as Menu | lift | | fade 180 |
| First run | none | still card; nothing loops | none | | none |
| To field token | pick a person | scale 0.8 → 1, then the conversation opens | pop | | appears |
| Starters | tap | fills the field | none | | none |
| Jump appears | a screen above latest | scale 0.6 → 1 | pop | scrolling back hides it from live | fade 180 |
| New while away | arrival above | count badge appears and updates | pop | | appears |
| Glide down | jump key | scroll to latest on a spring | reveal | wheel, touchstart or pointerdown stops it; the target is re-read each frame | at once |

Scroll rules:
- The bottom is `msgs.offsetTop + msgs.offsetHeight − clientHeight`, never `scrollHeight − clientHeight`: glide transforms inflate `scrollHeight` (prototype.js line 593).
- Desktop scroll stays Lenis (wheel only). A spring scroll there goes through Lenis (`scrollTo` with immediate per frame, or `canvasScrollNow`), never around it.

---

## 8. Can't be built as drawn, and the fix

| Drawn | Why not | Build |
|---|---|---|
| Motion runs on WAAPI with sampled `linear()` springs | the app runs framer-motion | each row of section 7 maps to `chSpring(kind)`; sampled curves only where framer can't run (CSS transitions, exits) via `chSpringCurve` |
| Desktop details column animates `grid-template-columns` | a layout animation | kept: it is the one layout animation in Messages, because a column can't appear by transform without the thread snapping width. Run it as a CSS transition on `--ch-ease-spring-smooth` 462 ms, `pinBottom` on each frame |
| Faces in the page use per-person hues | the app has no per-person colour | PR 7's class-year fills (`Avatar year`), neutral coin for coaches and unknown years; needs `gradYear` on `ChPerson` (data checks) |
| Initials on 16 and 18 px faces (Seen by, poll voters) are 7–7.5 px | phone floor 12 px | those coins show colour only, no initials; the pill or row carries the names for screen readers |
| File type letters on the file tile (9.5 px) | phone floor | the tile is an icon (aria-hidden); the subtitle ("Video · 0:42") carries the type at 12+ |
| Pinned conversations | no pin in the data | 11b: device pins like `marked-unread.ts` (`pinned.ts`, max 3), pin and unpin from the row menu. 11h (held): the same list on every device (Nick, 31 Oct: "pins sync is a go"), `pin-sync/PIN-SYNC.md` |
| Typing names in a group (from v13 the name sits inside the typing bubble, no caption) and typing dots in rows and pins | `isOtherTyping` is one boolean for the open thread | **build it** (Nick, 31 Oct: "typing should be tracked"): the open thread's hook already receives `typing` broadcasts on `golf-conversation:<id>` with the typer's `userId` (`use-golf-messages.ts` 997–1012) and every composer already sends them (1051). No migration and no new data. A new listener joins the same channel for each conversation on screen and keeps who is typing where (02-PLAN §3.8); the open thread also keeps the typer's id for the group name. Hide 5 s after the last event, as drawn (today's hook clears at 3 s) |
| Captain chip in Members | no captain field | not drawn (none of the demo cast is captain); same call as Roster |
| Mute labels "For 8 hours", "For a week", "Until I turn it on" | today's labels differ | today's: Mute 8 hours, Mute a week, Until I turn it on |
| Swipe left on one bubble shows its time | replaced | the whole thread drags left for every time; swipe right to reply stays |
| Attach menu with Photos, Camera, File, Poll, Announcement | today's + menu has two actions, "Photo or file" and "Poll"; announcements are made elsewhere | ship today's actions in the new menu style: Photos and File (both the same file input, Photos with `accept="image/*"`, which offers the camera on iOS), and Poll. No Announcement row and no Camera row (Nick, 31 Oct: "no to announcement", "No don't add camera"); Photos offers the camera on iOS by itself. Page v9 draws the same three |
| Gradient sent bubble (`--ch-bubble-mine-bg`) | text can't sit on a gradient | flat `--ch-bubble-mine-fill` with the lit edge and green shadow; Nick approved the page with it |
| Reactions in the first versions sat on a paper badge on both sides | owner rule (8 Oct) | already fixed on the page: green on paper bubbles, ivory on yours, champagne ring on your own |
| Safe areas drawn as 54 / 34 | device-dependent | `env()` formulas in section 4 |
| Narrow desktop (canvas under 1100, `@container` in messages.css) | the page draws 1440 only | keep today's: details float over the thread; below 720, rail or thread |
| Dictate key (a mic while the field is empty), drawn up to v8 | it only points at the keyboard's own dictation; a key that does nothing isn't worth a slot | not built, and removed from the page in v9: an empty field shows no key on the right; the send key springs in with the first character |
| Haptics | web | `navigator.vibrate` is not on iOS Safari; the native shell's haptic bridge if present, else none |

---

## 9. Desktop layout

- The canvas sheet keeps today's glass top bar (breadcrumbs, search ⌘K, bell, settings) and the sidebar on the frame green.
- Columns: rail 320 (`--a-surface`, 0.5 px right hairline), thread, details 300 (`--a-surface`, 0.5 px left hairline). Today's rail is 340: change it to 320.
- The thread bar on desktop is glass over the thread: face 36, name 15 / 600, role 12.5, then Search and Details keys at the right. Its hairline shows only with content under it.
- The rail is flat and continuous (owner: "too card heavy"): section labels "Pinned" and "Recent" 13 / 600 secondary, rows inset 8 with radius 12, the selected row washed.

---

## 10. prototype.js index

Line numbers are `redesign/prototype.js`'s own.

| Line | What |
|---|---|
| 72 | `SMOOTH_LINEAR`, the 462 ms smooth curve |
| 73 | `SP`, the six springs; `solve` below converts vd / bounce exactly as `chSpring` |
| 121 | `liveFrame`: where a node is now, mid-animation |
| 140 | `anim(node, kf, spring, {live, composite, rd})`: the engine; `live` is the live-start rule, `rd` the Reduce Motion frames |
| 160, 165 | `snapCarry`, `playCarry`: running motions survive a re-render |
| 593 | `maxTop`: the true bottom (scroll rules) |
| 596 | `onScroll`: date pill, hairline, jump key |
| 619, 623 | `grow`, `syncSend`: field height and the send key |
| 661 | `send`: the real bubble moves from the field, thread makes room, receipt |
| 698 | `receiptsAfterSend`: Delivered → Seen |
| 719 | `incoming`: typing, then the reply out of it |
| 748 | `wireTimes`: drag for times |
| 776 | `wireHold`: press, 450 ms hold, slop, double-tap |
| 799 | `finishHoldOut`: hold again while settling |
| 806, 853 | `openHold`, `closeHold`: lift, bar, menu, dismiss |
| 892 | `react`: badges |
| 905 | `vote`: ring, check, bars, faces |
| 930, 957, 970 | `openSheet`, `closeSheet`, `wireSheetDrag` |
| 1067, 1078 | `openAttach`, `closeAttach` |
| 1101, 1126 | `push`, `pop` |
| 1165 | `setFilter` |
| 1188, 1194, 1203 | `pinBottom`, `openDetails`, `closeDetails` |
| 1251 | `springScroll`: the jump glide, stopped by wheel, touch or pointer |
| 1528 | `MOT`: the motion table the page shows |
| 1768, 1807, 1867 | `MC`, `MCASES`, `motionCheck`: the interrupt test |
| 1931 | `applyHash`: the state links |

---

## 11. Fidelity check: a PR is done only when it matches

1. **Shots.** `capture.mjs design` and `capture.mjs app` for every state in section 5, light and dark, at phone 390, phone 430, phone 390 XXL and desktop 1440. Then `compare`. Look at every pair at full size and list each difference in the PR: matches, fixed, or can't-match with the reason from section 8. An unexplained difference means the PR isn't done.
2. **Motion clips.** `capture.mjs clips` records the page's own demos at phone and desktop, normal and Reduce Motion. Record the same moves in the app at 390 wide (Playwright `recordVideo`) and put both in the PR. Check the curve, duration, origin and what moves against section 7.
3. **Interrupts.** The build passes the same 11 cases the page passes (`capture.mjs motion` shows the page's run). Write them as Playwright tests on the preview fixture, sampling each tracked element's `getBoundingClientRect` and opacity every frame, with the page's judge (`MC.judge`, line 1768): a jump is a frame moving over 10 px and over three times its neighbours' speed; also no gaps (the element vanishing and coming back) and no opacity blinks over 0.45. Under Reduce Motion, nothing may glide over two frames in a row.
   - Send twice, 140 ms apart
   - A reply lands while yours is still rising
   - Hold, then let go mid-lift
   - Hold again while it settles
   - Votes sheet: close mid-rise, reopen
   - Attach: close and reopen fast
   - Back pressed mid-push
   - Vote, then change it 100 ms later
   - Jump key: away and back quickly
   - Desktop details: close mid-open, reopen
   - Reduce Motion: send and a reply
4. **Mechanics.** Walk every row of section 6 in the app and confirm it does the same and lands in the same place, Back included.

---

## 12. The preview fixture the PR adds

`/clubhouse-preview/messages?state=design&view=<state>` renders the page's `INIT` cast and conversations (prototype.js line 194) through the real `MessagesPhone` / `MessagesDesktop`, opened at the named state, with the root marked `data-ch-preview-view="<state>"`. It reuses `PreviewMessages.tsx`'s existing `state` prop (today: `empty`, `rail`, `announcement`, `loading`, `failed`, `thread-failed`, `files-failed`, `add-failed`, `ann-failed`). For overlay states (`hold`, `votes`, `seen`, `attach`, `mute`) the fixture opens the overlay after mount; for `times` it sets the drag offset to 58 × the Text Size scale (78.5 at XXL, v14); for `jump` it scrolls a screen up and sets two unseen. Without the fixture, `capture.mjs app` shoots only `inbox` and `thread`. Since page v12 the fixture covers all 34 routes in `05-SCREENS.md` (the newer ones: `rowtyping`, `longinbox`, `loading`, `rowmenu`, `pinlimit`, `grouptyping`, `failed`, `long`, `datepill`, `toast`, `edit`, `pollnew`), and takes `&play=<demo>` to run the same scripted move as the page's Replay button for that demo, marked `data-ch-preview-play`, so `capture.mjs --motion <M-ID>` can record the app (07-MOTION.md).

---

## 13. Capture script

`messages/capture/capture.mjs` is the only capture script for Messages. It shoots the design page (`redesign/clubhouse-messages.html`) and the app state by state, compares them, records the clips and runs the motion check (README, Screenshots). The shared `package/capture-shots.mjs` is retired.

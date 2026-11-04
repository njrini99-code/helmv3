# 06 Screen specs: Messages

> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 43 element rows for the 19 new IDs, including the Ask board and poll prefill, and the VoiceOver order).

Element-level specs for every Messages screen and state, measured off the v14 design page. Read with 04-FIDELITY-SPEC (tokens, type, safe areas, desktop rules), 03-DATA-CHECKS (where each value comes from) and 07-MOTION (every movement). Shared rules are cited by number (SHARED-1 to SHARED-12) and rulings of 4 Nov by number from `SETTLED-4NOV.md` (1 to 30); neither is repeated. Page v15 changes one value only, the hidden time column at 430 (ruling 30), and that row is updated below.

## How to read the tables

- **Where the numbers come from.** Every box, type size, colour and contrast below was read from the v14 page (`redesign/clubhouse-messages.html`) in Chromium with `getBoundingClientRect` and `getComputedStyle`, on the `-shot` frames (device alone, no frame, no status bar or home indicator, no safe areas; 04 §4). Phone is 390 × 844 unless a table says 430; desktop is 1440 × 900 unless it says 1280. Frames are Reduce Motion still frames, so nothing is mid-move. Raw data: `meas/all.json` (390 and 1440), `meas/w430.json`, `meas/xxl.json`, `meas/w1280.json`, `meas/hover.json`. Four v14 values the JSONs do not hold were read the same way on the page and are named where used: the XXL time column (`#times-phone-light-shot-reduce-xxl`), the own-reaction ring and halo (`#react-*`), the bubble focus ring, and the switch off ring (`#pollnew-*`). Values are rounded to one decimal; nothing was estimated.
- **Columns.** Element is the page selector (`parent > child`); a bracketed prefix such as `(mine, joins above)` names which bubble in a run it is. Sample is the measured text, or the icon name with its size and stroke. Box is width × height, then padding, radius (`r`, corners clockwise from top left when they differ) and gap. Type is size/line-height weight, tracking, then how lines behave (`1 line, …` is one line with ellipsis; `2 lines, then …` is a clamp; `wraps` is free). Colour gives the page token, then the app token it maps to (04 §2), then "on" the background it was measured on. Light and Dark give the hex pair and the contrast in bold. Hit 44 gives the drawn hit box when it is not the element's own box, with ⚠ when it is under 44 (fixes in "Hit areas"). Data names the 03-DATA-CHECKS section and field that fills the element.
- **Dark rows** are paired to light rows by element order, so each dark cell is the same element. (auto06 paired some rows by selector and showed another element's dark value; for example the team reaction badge "2" is #F4EEDD on #1F6B45, 5.58, in dark.)
- **Contrast** is WCAG 2 relative luminance on the effective background: every translucent layer under the element (glass, tint, scrim, wash) is blended as drawn, and the result is the background named. Shared values from the design lead: text has a **4.9:1 target** and a **4.5:1 floor**; large text (24 pt, or 19 pt bold), icons and marks (focus rings and switch tracks included) need **3:1** (SHARED-4). Any pair under 4.9 goes in the PR with its fix or reason. Every text pair in this file meets 4.9 and every mark meets 3:1. Lowest text: **5.31** light, a row time (`--ch-text-tertiary` #5F5C55) on the selected desktop row's wash (#E7E5DF); **5.58** dark, ivory #F4EEDD on your bubble #1F6B45. Lowest marks are in "Marks".
- **Motion** is in 07-MOTION. Where a state below mentions Reduce Motion, the build crossfade is `CH_FADE_MS` (180 ms, opacity only, linear). A push moves the page behind by 24% and dims it to `brightness(0.9)`.
- **"Nothing new"** in a section means the state adds no new element; the section says what the state changes and points to the table that measured it.
- **Redline** at the end of each section lists 5 to 10 numbers to check on the side-by-side, within 2 pt (SHARED-12).
- **Links.** Each section header line gives the design link (`https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#<route>-phone-light`), the local file anchor, the app preview (`/clubhouse-preview/messages?state=design&view=<route>`) and the capture call (`--id <screen> --state <route>-phone`).

## Tokens

Page token to app token, with the value each resolves to. Translucent tokens are given as the measured composite over the surface named, since that is what the contrast was read on. The app keeps its own token; build against the app column.

| Page token | App token | Light | Dark | Notes |
|---|---|---|---|---|
| `--a-page` | `--ch-grouped-bg` | #F2F0E9 | #0E120F | the one flat page |
| `--a-page-2` | `--ch-well-bg-flat` | #F6F4EE | #141815 | wells: search, segmented, poll options, starters, fields |
| `--a-surface`, `--a-elev` | `--ch-card-bg` | #FFFEFB | #191E1A | cards, pills, sheets, desktop details column |
| `--a-recv` | `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 | their bubbles |
| `--a-ink`, `--a-recv-ink` | `--ch-text-primary` | #1C1B18 | #F1ECDF | |
| `--a-ink-2` | `--ch-text-secondary` | #46433D | #D0C9B8 | previews, meta, pills |
| `--a-ink-3` | `--ch-text-tertiary` | #5F5C55 | #ADA697 | times only |
| `--a-sent-b`, `--a-accent` (fill) | `--ch-bubble-mine-fill` (new) | #155A39 | #1F6B45 | your bubbles, Send, selected chips |
| `--a-sent-ink`, `--a-accent-ink` | `--ch-text-on-accent` | #FDFCF8 | #F4EEDD | text on the green fill |
| `--a-accent-text`, `--a-chip-ink` | `--ch-accent` | #155A39 | #7CC79B | links, actions, icons |
| `--a-unread` | `--ch-accent` | #155A39 | #7CC79B | unread dot (mark) |
| `--a-tint`, `--a-chip-bg` | chip tint of `--ch-accent` | #E8EEE8 over the card | #253229 over the card | 10% / 12% of the accent |
| `--a-bar` | `--ch-poll-bar` (new) | #E0E5DC over the well | #202D25 over the well | 10% / 12% |
| `--a-bar-on` | `--ch-poll-bar-on` (new) | #C9D5CA over the well | #2D4235 over the well | 20% / 24% |
| `--a-wash` | row press wash | #E7E5DF over the page, #F4F3F0 over the card | #1C1F1B over the page, #262A26 over the card | selected desktop row (over the page), pressed phone rows and pins (over the card) |
| `--a-hair` | `--ch-separator` | #E8E7E4 over the card | #2F332E over the card | 0.5 hairlines, inset 16 |
| `--a-glass` | glass | #FBF9F4 (measured composite) | #141915 | desktop thread bar |
| `--a-glass-strong` | glass-strong | #FCFAF6 to #FDFBF7 (measured composite) | #191E1A to #1B201C | composer, menus, reaction bar, attach, jump, date pill, toast |
| `--a-sk` | no token: `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` (SETTLED-4NOV 14) | #EBEAE7 on the card, #DFDDD6 on the desktop page | #2C312C on the card, #222622 on the page | skeleton bars and faces |
| `--a-dot` | `--ch-typing-dot` (new, PR 11d) | #7A766C | #827D71 (`var(--ch-ink-400)`) | typing dots (mark), SETTLED-4NOV 2. `--ch-ink-400` itself stays #8F8B81 (scrollbar, heat-map ring) |
| `--a-ring` | `--ch-ring-own` (new, PR 11d) | #8C703A | #C9AD74 | your own reaction ring and the bubble focus ring, on a 4 page-colour halo, SETTLED-4NOV 3 |
| `--a-champ` | `--ch-champagne-500` | #B09560 | #C9AD74 | left only in a-head base rules (poll header, focus outline) that d-extra overrides; nothing in Messages draws it now |
| `--a-sw-off` | `--ch-switch-off-ring` (new, PR 11f) | #8F8B81 | #827D71 | 1.5 inset ring on an off switch, SETTLED-4NOV 11 |
| `--a-champ-link` | PhoneBar back link (today's) | #DCCDA6 | #CDBB8E | Back and Cancel on the green bar |
| `--a-danger` | `--ch-flag` | #B3261E | #F28B7D | Delete, Not delivered |
| `--a-frame` | `--ch-frame` | #0A331F | #08150E | the green bar, unchanged |
| `--a-on-green` | `--ch-on-green-ink` | #F4EEDD | #F4EEDD | bar title, group coin glyph |
| `--a-on-green-soft` | `--ch-on-green-ink` at 86% | #D0D0BC (measured on the bar) | #D0CBBA | bar role line, switcher chevron |
| coin hue (per person) | class-year fill (PR 7) | #3A6580, #84495A, #7F612A, #2C706C, #56653A, #634C82, #1F6B45, #6E5232, #2B5F45 | same | ivory initials #FDFCF8, 5.61 to 7.24 |
| group coin | none: avatar art, allowed (SETTLED-4NOV 13) | gradient #1F6B45 to #0B3A25 | same | flag glyph `--ch-on-green-ink` |
| attach tile Photos | `--ch-attach-photos` (new, PR 11e) | #2F7D4C | #2F7D4C | ivory glyph #FDFCF8, 4.92 |
| attach tile File | `--ch-attach-file` (new, PR 11e) | #7F612A | #7F612A | ivory glyph 5.61 |
| attach tile Poll | `--ch-attach-poll` (new, PR 11e) | #155A39 | #155A39 | ivory glyph 8.01 (SETTLED-4NOV 15) |

## Shared: the green bars

The green bar and the desktop shell (`desk__nav`, `.team`, `.dtop`: sidebar, breadcrumbs, search ⌘K, bell, settings) are unchanged from today (SHARED-1) and are not specced here; tables below leave their rows out. The phone bars keep the look Nick approved. Their measured insets, for the side-by-side only (shot mode, no safe area, so the bar is 50 tall with a 16 lip under it):

| Bar | Element | x | Box | Notes |
|---|---|---|---|---|
| Root (inbox) | Section switcher "Messages ⌄" | 36 at 390, 40 at 430 | 98.8 × 44 | 17 / 600 `--ch-on-green-ink`; chevron 16 at x 119 (123 at 430), `--a-on-green-soft`; bar padding-left 20 at 430, as today's `--ch-page-x-phone` (SETTLED-4NOV 1) |
| Root (inbox) | Bell | 135 at 390, 139 at 430 | 44 × 44 | glyph 22 at x 146, `--a-on-green-soft`; count badge 20 × 20, 12 / 600; today's root bar (SHARED-1, SETTLED-4NOV 16) |
| Conversation | Back | 24 | 44 × 44 | glyph `back` 24 at x 34, `--a-on-green-soft` |
| Conversation | Face and name (`.who`, opens Details) | 70 | 90.9 × 41, padding 2 4 | face 36 at x 74; name at x 120, 17/20.4 600 `--ch-on-green-ink`; role 13/15.6 400 `--a-on-green-soft`; hit area to 44 (see Hit areas) |
| Conversation | Details key | 162.9 | 44 × 44 | stays after the name, as drawn (SETTLED-4NOV 16); same x at 430 |
| Pushed page (Details) | Back | 28 | 71 × 44 | glyph 24 at x 30, label "Back" 17/17 400 at x 53, `--a-champ-link` |
| Pushed page (New message) | Cancel | 28 | 70.3 × 44 | "Cancel" 17/17 400, `--a-champ-link` |
| Pushed page | Title | 99 (Details), 98 (New message) | 22.1 tall | 17/22.1 600 `--ch-on-green-ink` |

All bar keys measure top y 10 in the shot frame. The conversation bar keeps the same x at 430 (back 24, `.who` 70, Details 162.9). Where the `.top` rule in 04 puts keys at the edges, these measured positions win (SETTLED-4NOV 16).

## Corrections carried from NOTES

- No large title on phone. The 04 §5 "Large title" row is the desktop rail h3 only (26/31.2 600).
- Hold slop: the page cancels a hold past 8 px; 04 §6 already rules that the build keeps today's 10 px. Not an error.
- The `reply` route is the reply chip (04 §5 calls it an arrival); it is specced under S-MSG.reply.
- The row menu and the poll composer are drawn (`rowmenu`, `pinlimit`, `pollnew`).
- Reduce Motion: typing dots hold still at opacity 1, not the 0.45 to 0.85 pulse in 04 §7; the skeleton pulse is off.
- Group typing has no caption under the bubble; the name is inside it (SETTLED-4NOV 6).
- Desktop thread bar is 64 tall (d-extra v12 fix 1).

## Sizes: 430, XXL and desktop 1280

Each screen section ends with "Large phone 430, XXL, desktop 1280" from the JSONs. The rules across all of them:

- **Phone edge 16 at 390, 20 at 430** (SHARED-7, SETTLED-4NOV 1; w430.json). At 430 the inbox top, context line, search, segmented control, cards, section labels, details, sheet groups and the root bar's switcher move to x 20, so cards are 390 wide (358 at 390). The thread's side padding is 12 at 390 and 16 at 430; the composer's 10 and 14; the attach menu's left 12 and 16; the jump key's right 14 and 18. Sheet headers keep padding 18 at both widths, and the empty card reaches its 360 max at 430 (x 35).
- **XXL (xxl.json).** Text Size XXL is k = 23/17 = 1.353: the page writes `calc(Npx * var(--k))`, the app `calc(N * var(--ch-type-k))` (04, top). SHARED-5 rounds it to 1.36; the numbers here use 1.353. Every type size and line height scales by k and text boxes grow; faces, wells (40), segmented (38), keys and bubble radius do not. The time column is `52 × k` (70.3 measured, one line, 17.6 tall), sits at `right: -64 × k` and the drag is `58 × k` (78.5), SETTLED-4NOV 9. The Seen by and Votes close keys are `flex: none` and stay 40 × 40 at XXL (SETTLED-4NOV 10).
- **Desktop 1280 (w1280.json).** The workspace is 1040 wide (sidebar 232). The rail stays 320 and its rows are unchanged; the thread pane narrows to 720, so the composer is 664 (760 at 1440), the bar's `.who` is 610 (770 at 1440) and bubbles keep their widths. With Details open the details column is 300 and the thread column between rail and details is 420, so bubbles cap at 262.1. Sheets centre on the workspace: x 552 at 1280, x 632 at 1440.
- **12 px phone floor** (04 §3, audit F09): met everywhere on phone. The jump count is 12/20 700 (SETTLED-4NOV 4) and group face initials are 12 on the 30 face (SETTLED-4NOV 5; desktop keeps 11.4). 04 §8 rules the two remaining small cases: initials on 16 and 18 faces show colour only, and letters on the file tile are an icon.


## S-MSG: Inbox (list)

screen (list) · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#inbox-phone-light` and `#inbox-desk-light` · local `redesign/clubhouse-messages.html#inbox-phone-light` · app `/clubhouse-preview/messages?state=design&view=inbox` · capture `--id S-MSG --state inbox-phone`

Phone order, top to bottom: the green bar (unchanged, SHARED-1, not specced here; measured insets in "Shared: the green bars"), context line, search well and New key, segmented All / Unread / Groups, Pinned card (three 62 faces, label, latest-line bubblet), Recent card of rows. No large title on phone (the 04 §5 "Large title" is the desktop rail only). Desktop: the rail (320) with h3 "Messages" 26/600, context "3 unread · 7 conversations", search, segmented, flat "Pinned" and "Recent" sections of rows (no cards, 04 §9), and Eli's thread open in the pane, so the desktop table also carries the first thread elements (bubbles, day pill, bar, composer) at their desktop size.

### Phone, 390 × 844 (`#inbox-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.inbox__top > p.ctx` | “3 unread · Demo University Golf” | 358 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-page` → `--ch-grouped-bg` | #46433D on #F2F0E9 **8.64** | #D0C9B8 on #0E120F **11.45** |  | 03 Inbox: unread count (`isUnread`) · `teamName` |
| `.srow > div.search` | “Search” | 310 × 40, pad 0 11, r 12, gap 8 | 16/16 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-page-2` → `--ch-well-bg-flat` | #46433D on #F6F4EE **8.96** | #D0C9B8 on #141815 **10.87** |  |  |
| `.search > svg.ic` | `search` 17, stroke 1.8 | 17 × 17 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-page-2` → `--ch-well-bg-flat` | #46433D on #F6F4EE **8.96** | #D0C9B8 on #141815 **10.87** |  |  |
| `.srow > button.ibtn.newbtn` |  | 40 × 40, pad 1 6, r 50% |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A | 40×40 ⚠ |  |
| `.ibtn > svg.ic` | `compose` 19, stroke 1.8 | 19 × 19 |  | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `.inbox__top > div.segw` |  | 358 × 38, pad 3, r 10 |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 |  |  |
| `.segw > i.segw__thumb` |  | 117.3 × 32, r 8 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.segw > button` | “All” | 117.3 × 32, pad 1 6, r 8 | 14/14 600, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** | 117×32 ⚠ |  |
| `.scroll > div.lcard` |  | 358 × 165.7, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.lcard > div.lcard__h` | “Pinned” | 358 × 46.1, pad 14 16 10, gap 10 | 17/22.1 600, -0.01em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.pins > button.pin` |  | 110 × 103.6, pad 10 4 9, r 18, gap 7 |  |  |  |  | 110×104 |  |
| `.pin > span.av.grp` |  | 62 × 62, r 50% |  |  |  |  |  | 03 Inbox: `convAvatarId` (pins: 11b `pinned.ts`, 11h) |
| `.av > svg.ic` | `flag` 31, stroke 1.8 | 31 × 31 |  | `--a-on-green` → `--ch-on-green-ink` on group coin (gradient #1F6B45 → #0B3A25, literal; measured on the lighter stop) | #F4EEDD on #1F6B45 **5.58** | #F4EEDD on #1F6B45 **5.58** |  |  |
| `.pin > span` | “Team” | 33.6 × 15.6 | 13/15.6 500, 0; 1 line, … | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Inbox: first name (direct) or `c.title` (group) |
| `.pin > span.bubblet` | “Asking the real…” | 92 × 23, pad 4 8, r 11 | 12/15 500, 0; 1 line, … | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Inbox: `c.lastText` when the last sender is not the viewer |
| `.pin > span.av` | “EB” | 62 × 62, r 50% | 23.6/23.6 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #3A6580 **6.1** | #FDFCF8 on #3A6580 **6.1** |  | 03 Inbox: `convAvatarId` (pins: 11b `pinned.ts`, 11h) |
| `.scroll > div.lcard.list` |  | 358 × 302.1, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.lcard__h > small` | “4” | 9 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Inbox: rows in that card (filtered list) |
| `.lcard > button.cv.unread` |  | 358 × 64, pad 10 16, gap 12 |  |  |  |  | 358×64 | 03 Inbox: `isUnread(c)` (dot, bold preview) |
| `.cv > span.av.grp` |  | 44 × 44, r 50% |  |  |  |  |  | 03 Inbox: `convAvatarId(api, c)` |
| `.cv__b > span.cv__n` | “Qualifier group” | 202.9 × 20.8 | 16/20.8 600, -0.01em; 1 line, … | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Inbox: `c.title` |
| `.cv__b > span.cv__t` | “Yesterday” | 59.1 × 16.9 | 13/16.9 400, 0; wraps | `--a-ink-3` → `--ch-text-tertiary` on `--a-surface` → `--ch-card-bg` | #5F5C55 on #FFFEFB **6.61** | #ADA697 on #191E1A **6.99** |  | 03 Inbox: `railTime(c.lastAt, now, timeZone, clock)` |
| `.cv__b > span.cv__p` | “Dana: You, Eli and Owen” | 270 × 19.5 | 15/19.5 400, 0; 2 lines, then … | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Inbox: `c.lastText`, `lastSenderId`, `lastIsPoll`; 2 lines |
| `.lcard > button.cv` |  | 358 × 64, pad 10 16, gap 12 |  |  |  |  | 358×64 |  |
| `.cv > span.av` | “MO” | 44 × 44, r 50% | 16.7/16.7 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #84495A **6.64** | #FDFCF8 on #84495A **6.64** |  | 03 Inbox: `convAvatarId(api, c)` |
| `.cv__n > svg.ic.cv__mute` | `bellOff` 13, stroke 1.8 | 13 × 13 |  | `--a-ink-3` → `--ch-text-tertiary` on `--a-surface` → `--ch-card-bg` | #5F5C55 on #FFFEFB **6.61** | #ADA697 on #191E1A **6.99** |  | 03 Inbox: `notification_level`, `muted_until` (select addition) |

### Desktop, 1440 × 900 (`#inbox-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.inbox__head > h3.big` | “Messages” | 115.6 × 31.2 | 26/31.2 600, -0.034em; wraps | `--a-ink` → `--ch-text-primary` on `--a-page` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 **15.1** | #F1ECDF on #0E120F **16.01** |  |  |
| `.inbox__head > button.ibtn` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.inbox__top > p.ctx` | “3 unread · 7 conversations” | 287 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-page` → `--ch-grouped-bg` | #46433D on #F2F0E9 **8.64** | #D0C9B8 on #0E120F **11.45** |  | 03 Inbox: unread count (`isUnread`) · `convs.length` |
| `.inbox__top > div.search` | “Search” | 287 × 40, pad 0 11, r 12, gap 8 | 16/16 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-page-2` → `--ch-well-bg-flat` | #46433D on #F6F4EE **8.96** | #D0C9B8 on #141815 **10.87** |  |  |
| `.search > svg.ic` | `search` 17, stroke 1.8 | 17 × 17 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-page-2` → `--ch-well-bg-flat` | #46433D on #F6F4EE **8.96** | #D0C9B8 on #141815 **10.87** |  |  |
| `.inbox__top > div.segw` |  | 287 × 38, pad 3, r 10 |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 |  |  |
| `.segw > i.segw__thumb` |  | 93.7 × 32, r 8 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.segw > button` | “All” | 93.7 × 32, pad 1 6, r 8 | 14/14 600, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** | 94×32 ⚠ |  |
| `.list > p.sec` | “Pinned” | 319 × 15.6, pad 0 18 | 13/15.6 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-page` → `--ch-grouped-bg` | #46433D on #F2F0E9 **8.64** | #D0C9B8 on #0E120F **11.45** |  |  |
| `.list > button.cv.unread` |  | 303 × 61.3, pad 9 10, r 12, gap 12 |  |  |  |  | 303×61 | 03 Inbox: `isUnread(c)` (dot, bold preview) |
| `.cv > span.av.grp` |  | 40 × 40, r 50% |  |  |  |  |  | 03 Inbox: `convAvatarId(api, c)` |
| `.av > svg.ic` | `flag` 20, stroke 1.8 | 20 × 20 |  | `--a-on-green` → `--ch-on-green-ink` on group coin (gradient #1F6B45 → #0B3A25, literal; measured on the lighter stop) | #F4EEDD on #1F6B45 **5.58** | #F4EEDD on #1F6B45 **5.58** |  |  |
| `.cv__b > span.cv__n` | “Demo University Golf” | 177.7 × 20.8 | 16/20.8 600, -0.01em; 1 line, … | `--a-ink` → `--ch-text-primary` on `--a-page` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 **15.1** | #F1ECDF on #0E120F **16.01** |  | 03 Inbox: `c.title` |
| `.cv__b > span.cv__t` | “7:31 AM” | 45.3 × 16.9 | 13/16.9 400, 0; wraps | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Inbox: `railTime(c.lastAt, now, timeZone, clock)` |
| `.cv__b > span.cv__p` | “Jack: Asking the real questions” | 231 × 19.5 | 15/19.5 400, 0; 2 lines, then … | `--a-ink` → `--ch-text-primary` on `--a-page` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 **15.1** | #F1ECDF on #0E120F **16.01** |  | 03 Inbox: `c.lastText`, `lastSenderId`, `lastIsPoll`; 2 lines |
| `.list > button.cv` |  | 303 × 80.8, pad 9 10, r 12, gap 12 |  | fill `--a-wash` → row press wash | #E7E5DF | #1C1F1B | 303×81 |  |
| `.cv > span.av` | “EB” | 40 × 40, r 50% | 15.2/15.2 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #3A6580 **6.1** | #FDFCF8 on #3A6580 **6.1** |  | 03 Inbox: `convAvatarId(api, c)` |
| `.cv__n > svg.ic.cv__mute` | `bellOff` 13, stroke 1.8 | 13 × 13 |  | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Inbox: `notification_level`, `muted_until` (select addition) |
| `.day > span` | “Thursday” | 129.6 × 24.9, pad 4 11, r 999 | 13/16.9 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: `dayLabel(at, now, timeZone)` |
| `.day span > b` | “5:48 PM” | 48 × 16 | 13/16.9 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: `clock(at, …)` of the first message |
| `(theirs, first) .col > div.b` | “Coach, could we move my lesson to …” | 427.2 × 34.8, pad 7.5 13, r 19 | 15/19.8 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, first, joins below) .col > div.b` | “Friday at 3 works” | 139.1 × 34.8, pad 7.5 13, r 19 19 6 | 15/19.8 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, joins above, has reactions) .col > div.b` | “Bring the 52 and the 56. We’re doi…” | 372.7 × 34.8, pad 7.5 13, r 19 6 19 19 | 15/19.8 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, joins above, has reactions) .rx > span` |  | 26 × 26, pad 0 6, r 999, gap 3 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(mine, joins above, has reactions) .rx span > svg.ic` | `like` 14, stroke 2 | 14 × 14 |  | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `(theirs, first, joins below) .col > div.b` | “Played the back nine at Lonnie Poo…” | 362.4 × 34.8, pad 7.5 13, r 19 19 19 6 | 15/19.8 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, joins above, joins below) .col > div.b` | “Hit 7 of 9 greens. The wedge ladde…” | 366.3 × 34.8, pad 7.5 13, r 6 19 19 6 | 15/19.8 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, joins above) .col > div.b.photo` |  | 242 × 176, pad 3, r 6 19 19 |  | fill `--a-recv` → `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 |  | 03 Conversation: `attachments(messageId)`, `image/*` |
| `(theirs, joins above) .b > span.photo__img` |  | 236 × 170, r 16 |  |  |  |  |  | 03 Conversation: `attachments(messageId)`, `image/*` |
| `(mine, first, joins below, has reactions) .col > div.b` | “That’s the round we’ve been waitin…” | 287.5 × 34.8, pad 7.5 13, r 19 19 6 | 15/19.8 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, first, joins below, has reactions) .rx > span` |  | 26 × 26, pad 0 6, r 999, gap 3 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(mine, first, joins below, has reactions) .rx span > svg.ic` | `love` 14, stroke 2 | 14 × 14 |  | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `(mine, joins above) .col > div.b` | “Send me the card when you get a se…” | 276.9 × 34.8, pad 7.5 13, r 19 6 19 19 | 15/19.8 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, joins above) .col > span.seen.txt` | “Seen 8:15 AM” | 94.8 × 22.3, pad 3 9, r 999, gap 6 | 12.5/16.3 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: `ChMsg.seen` + other member's `last_read_at` |
| `.tbar > button.who` |  | 770 × 36, pad 0 4, gap 10 |  |  |  |  | 770×36 ⚠ |  |
| `.who > span.av` | “EB” | 36 × 36, r 50% | 13.7/13.7 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #3A6580 **6.1** | #FDFCF8 on #3A6580 **6.1** |  | 03 Conversation: `convAvatarId` |
| `.who span > b` | “Eli Brandt” | 68.4 × 18, gap 2 | 15/18 600, 0; 1 line | `--a-ink` → `--ch-text-primary` on `--a-glass` → glass | #1C1B18 on #FBF9F4 **16.31** | #F1ECDF on #141915 **15.13** |  | 03 Conversation: `ChConv.title` (phone: first name) |
| `.who span > em` | “Junior” | 35.7 × 15 | 12.5/15 500, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-glass` → glass | #5F5C55 on #FBF9F4 **6.32** | #ADA697 on #141915 **7.38** |  | 03 Conversation: role (`classYearLabel`, coach title) or "N members" |
| `.tools > button.ibtn` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.comp > div.comp__in` |  | 760 × 46.1, pad 5, r 24, gap 6 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `.comp__in > button.ibtn.comp__plus` |  | 36 × 36, pad 1 6, r 50% |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 | 36×36 ⚠ |  |
| `.comp__in > textarea.comp__ta` |  | 708 × 36.1, pad 8 4 7 |  |  |  |  | 708×36 ⚠ |  |

Rules the table doesn't show:
- Gaps (phone): context line to search 10; search to segmented 22; segmented to Pinned card 18; card to card 12. Search 310 wide, New 40, gap 8 between them.
- Pinned card: title row 46.1 (padding 14 16 10); pins start 8 inside the card (x 24); each pin 110 × 103.6, padding 10 4 9, radius 18, gap 7 face to label; bubblet sits over the face's top right, 92 × 23, radius 11, one line with ellipsis. The last pin's bubblet anchors to the pin's right edge (v12 fix 3).
- Unread dot: 9 × 9 circle before the name, `--a-unread` → `--ch-accent` (see Marks). Unread rows draw the preview in `--ch-text-primary` (d-extra wins over a-head's secondary).
- Rows (phone): 64 tall with a one-line preview, padding 10 16, face 44, gap 12, name 16/20.8 600 one line with ellipsis, time 13/16.9 tertiary at the right, preview 15/19.5 two lines then ellipsis; hairline `--ch-separator` inset 16.
- Rows (desktop rail): inset 8 (x 240 in a rail at 232), width 303, radius 12, padding 9 10, face 40; 61.3 tall with a one-line preview, 80.8 with two. The selected row is washed (`--a-wash` #E7E5DF / #1C1F1B over the page).
- Desktop rail: content inset 16 (x 248); h3 26/31.2 600, -0.034em; New key 40 at the h3's right; section labels 13/15.6 600 secondary, padding 0 18.
- Desktop thread bar: glass over the thread, `.who` 36 tall (face 36, name 15/18 600, role 12.5/15 500), Search and Details keys 40 at the right; bar 64 tall (d-extra v12 fix 1, page CSS). The bar's hairline shows only with content under it.
- Desktop composer: pill 760 × 46.1 at 1440 (max 760), padding 5, radius 24; thread side padding 28; bubble text 15/19.8.

### Large phone 430, XXL, desktop 1280

Large phone 430 (w430.json): the page edge is **20** (SETTLED-4NOV 1, SHARED-7): context line, search, segmented and cards start at x 20; cards 390, search 342, segments 128, pins 120.7; the root bar's switcher moves to x 40. XXL (xxl.json): type × 1.353 and every text box grows: context line 27 tall, row 64 → 77.5 (one-line preview) and 103.9 (two-line), card title row 53.9, pin 109.1 tall, bubblet 28.3; faces, search well (40), segmented (38) and New (40) do not grow. Desktop 1280 (w1280.json): the workspace is 1040 wide (sidebar 232); rail stays 320 with the same rows (303 × 61.3 / 80.8); the thread pane narrows to 720, so the composer is 664 (760 at 1440), bubbles keep their widths, and the bar's `.who` is 610 (770 at 1440).

Phone variants (light; dark is the same geometry):

| Element | Sample | 390 default: x, w × h, type | 430: x, w × h | XXL (×1.353): w × h, type |
|---|---|---|---|---|
| `.inbox__top > p.ctx` | 3 unread · Demo Univer | x 16, 358 × 19.9, 15/20 | x 20, 390 × 19.9 | 358 × 27, 20.3/27 |
| `.srow > div.search` | Search | x 16, 310 × 40, 16/16 | x 20, 342 × 40 | 310 × 40, 21.6/21.6 |
| `.search > svg.ic` |  | x 27, 17 × 17 | x 31, 17 × 17 | 17 × 17 |
| `.srow > button.ibtn.newbtn` |  | x 334, 40 × 40 | x 370, 40 × 40 | 40 × 40 |
| `.ibtn > svg.ic` |  | x 345, 19 × 19 | x 381, 19 × 19 | 19 × 19 |
| `.inbox__top > div.segw` |  | x 16, 358 × 38 | x 20, 390 × 38 | 358 × 38 |
| `.segw > i.segw__thumb` |  | x 19, 117.3 × 32 | x 23, 128 × 32 | 117.3 × 32 |
| `.segw > button` | All | x 19, 117.3 × 32, 14/14 | x 23, 128 × 32 | 117.3 × 32, 18.9/18.9 |
| `.scroll > div.lcard` |  | x 16, 358 × 165.7 | x 20, 390 × 165.7 | 358 × 179 |
| `.lcard > div.lcard__h` | Pinned | x 16, 358 × 46.1, 17/22.1 | x 20, 390 × 46.1 | 358 × 53.9, 23/29.9 |
| `.pins > button.pin` |  | x 24, 110 × 103.6 | x 28, 120.7 × 103.6 | 110 × 109.1 |
| `.pin > span.av.grp` |  | x 48, 62 × 62 | x 57, 62 × 62 | 62 × 62 |
| `.av > svg.ic` |  | x 64, 31 × 31 | x 73, 31 × 31 | 31 × 31 |
| `.pin > span` | Team | x 62, 33.6 × 15.6, 13/15.6 | x 72, 33.6 × 15.6 | 45.4 × 21.1, 17.6/21.1 |
| `.pin > span.bubblet` | Asking the real… | x 68, 92 × 23, 12/15 | x 77, 92 × 23 | 92 × 28.3, 16.2/20.3 |
| `.pin > span.av` | EB | x 164, 62 × 62, 23.6/23.6 | x 184, 62 × 62 | 62 × 62, 23.6/23.6 |

Desktop variants (light):

| Element | Sample | 1440: x, w × h | 1280: x, w × h |
|---|---|---|---|
| `.tbar > button.who` |  | x 566, 770 × 36 | x 566, 610 × 36 |
| `.comp > div.comp__in` |  | x 612, 760 × 46.1 | x 580, 664 × 46.1 |
| `.comp__in > textarea.comp__ta` |  | x 659, 708 × 36.1 | x 627, 612 × 36.1 |

**Redline (S-MSG)**, check on both images within 2pt:
1. Phone edge 16 at 390 (cards 358 wide), 20 at 430 (cards 390)
2. Search well 40 tall, radius 12; New 40 circle
3. Segmented 38 tall, padding 3, radius 10; thumb and segments 32 tall, radius 8
4. Pinned card 165.7 tall; pin face 62; bubblet 92 × 23, radius 11
5. Row height 64 (phone, one-line preview); face 44; name x 88
6. Card radius 16; card title row 46.1; gap between cards 12
7. Desktop rail 320; h3 26/31.2; rows 303 wide, radius 12, 61.3 / 80.8 tall
8. Desktop bubble radius 19 (join corner 6), text 15/19.8

## S-MSG.unread: Inbox filtered to Unread

state of the list · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#unread-phone-light` and `#unread-desk-light` · local `redesign/clubhouse-messages.html#unread-phone-light` · app `/clubhouse-preview/messages?state=design&view=unread` · capture `--id S-MSG.unread --state unread-phone`

Route `unread` = `build('inbox')` then `setFilter('unread')`. Nothing new is drawn; the thumb moves one segment right (phone thumb x 19 → 136, one segment of 117.3; desktop 93.7) and only unread conversations stay in the Recent card, whose count reads 2 in the measured frame (the Pinned card is unchanged). Every element is specced in S-MSG; use that table.

### Phone, 390 × 844 (`#unread-phone-light-shot` / `-dark-shot`)

Nothing new over the screens above. See the tables they point to.

### Desktop, 1440 × 900 (`#unread-desk-light-shot` / `-dark-shot`)

Nothing new over the screens above. Desktop: See the tables they point to.

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.unread)**, check on both images within 2pt:
1. Thumb at segment 2: x 136 on phone (117.3 wide, 32 tall)
2. Recent card height 174.1 with two rows (phone)
3. Rows still 64 tall
4. Count "2" 15/19.9 secondary in the card title

## S-MSG (typing in a row): Typing dots on a pin and a row

inline state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#rowtyping-phone-light` and `#rowtyping-desk-light` · local `redesign/clubhouse-messages.html#rowtyping-phone-light` · app `/clubhouse-preview/messages?state=design&view=rowtyping` · capture `--id S-MSG --state rowtyping-phone`

Route `rowtyping` sets Eli typing and Maya typing in the Qualifier group, then builds the inbox. The pin's bubblet shrinks to hold three 5 × 5 dots (37 × 23, same padding 4 8 and radius 11); the row's preview swaps to the same three dots. Groups show dots only, no name, on the row (02-PLAN §3.8). Dots hide 5 s after the last typing event. Reduce Motion: dots hold still at opacity 1. Dot fill `--a-dot` → `--ch-typing-dot` (new, PR 11d): #7A766C light, #827D71 dark (SETTLED-4NOV 2); contrast on every surface in Marks.

### Phone, 390 × 844 (`#rowtyping-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.pin > span.bubblet` |  | 37 × 23, pad 4 8, r 11 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  | 03 Inbox: `typingByConv` (02-PLAN §3.8) |
| `.typing-mini > i` |  | 5 × 5, r 50% |  | fill `--a-dot` → `--ch-typing-dot` (new) | #7A766C | #827D71 |  | 03 Inbox: `typingByConv` (02-PLAN §3.8) |

### Desktop, 1440 × 900 (`#rowtyping-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.typing-mini > i` |  | 5 × 5, r 50% |  | fill `--a-dot` → `--ch-typing-dot` (new) | #7A766C | #827D71 |  | 03 Inbox: `typingByConv` (02-PLAN §3.8) |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG (typing in a row))**, check on both images within 2pt:
1. Bubblet with dots 37 × 23, radius 11
2. Dot 5 × 5, gap 3
3. Dot colour #7A766C / #827D71 (`--ch-typing-dot`)

## S-MSG (loading): Inbox loading (skeleton)

inline state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#loading-phone-light` and `#loading-desk-light` · local `redesign/clubhouse-messages.html#loading-phone-light` · app `/clubhouse-preview/messages?state=design&view=loading` · capture `--id S-MSG --state loading-phone`

Route `loading` builds the inbox, removes the cards and draws one card of five skeleton rows with the same row height, so nothing moves when rows land. Context line reads "Loading conversations". Skeleton fill `--a-sk` = ink at 9%; build `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)`, no new token (SETTLED-4NOV 14): #EBEAE7 / #2C312C on the card, #DFDDD6 / #222622 on the desktop page; bars 11 tall (9 for the short line, at opacity .75), radius 6, faces 44 (40 desktop). The card carries `role="status"` and `aria-label="Loading conversations"`; rows are `aria-hidden`. Pulse `skp` 1.4s (1 ↔ .55) is off under Reduce Motion (motion in 07).

### Phone, 390 × 844 (`#loading-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.lcard__h > span.sk__l` |  | 64 × 11, r 6 |  | fill `--a-sk` → `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` | #EBEAE7 | #2C312C |  | none (placeholder, `aria-hidden`) |
| `.cv > span.sk__av` |  | 44 × 44, r 50% |  | fill `--a-sk` → `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` | #EBEAE7 | #2C312C |  | none (placeholder, `aria-hidden`) |
| `.cv__b > span.sk__l` |  | 124.2 × 11, r 6 |  | fill `--a-sk` → `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` | #EBEAE7 | #2C312C |  | none (placeholder, `aria-hidden`) |
| `.cv__b > span.sk__l.sm` |  | 210.6 × 9, r 6 |  | fill `--a-sk` → `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` | #EBEAE7 | #2C312C |  | none (placeholder, `aria-hidden`) |

### Desktop, 1440 × 900 (`#loading-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.sec > span.sk__l` |  | 56 × 11, r 6 |  | fill `--a-sk` → `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` | #DFDDD6 | #222622 |  | none (placeholder, `aria-hidden`) |
| `.cv > span.sk__av` |  | 40 × 40, r 50% |  | fill `--a-sk` → `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` | #DFDDD6 | #222622 |  | none (placeholder, `aria-hidden`) |
| `.cv__b > span.sk__l` |  | 106.3 × 11, r 6 |  | fill `--a-sk` → `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` | #DFDDD6 | #222622 |  | none (placeholder, `aria-hidden`) |
| `.cv__b > span.sk__l.sm` |  | 180.2 × 9, r 6 |  | fill `--a-sk` → `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)` | #DFDDD6 | #222622 |  | none (placeholder, `aria-hidden`) |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG (loading))**, check on both images within 2pt:
1. Skeleton face 44 (phone) / 40 (desktop)
2. Line 11 tall, short line 9, radius 6
3. Title bar 64 × 11 (phone), 56 × 11 (desktop)
4. Row height unchanged at 64 (phone)

## S-MSG (long text): Inbox with long names and previews

inline state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#longinbox-phone-light` and `#longinbox-desk-light` · local `redesign/clubhouse-messages.html#longinbox-phone-light` · app `/clubhouse-preview/messages?state=design&view=longinbox` · capture `--id S-MSG --state longinbox-phone`

Route `longinbox` renames the Qualifier group to "Qualifier group · Lonnie Poole travel squad", gives it the preview "Dana: You, Eli and Owen are in the 8:10 group, then Maya, Sam and Luca at 8:20", and renames Maya to "Maya Ortiz-Castellanos". Nothing new is drawn. The name stays one line with an ellipsis (202.9 wide); the preview wraps to its two-line cap (39 tall) and the row grows from 64 to 82.8; the face re-centres (y 465 in a row at 446). SHARED-5: rows grow, never clip.

### Phone, 390 × 844 (`#longinbox-phone-light-shot` / `-dark-shot`)

Nothing new over the screens above. See the tables they point to.

### Desktop, 1440 × 900 (`#longinbox-desk-light-shot` / `-dark-shot`)

Nothing new over the screens above. Desktop: See the tables they point to.

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG (long text))**, check on both images within 2pt:
1. Row with a two-line preview 82.8 tall
2. Name one line, ellipsis, 20.8 tall
3. Preview two lines, 39 tall, then ellipsis
4. Face 44 centred in the row

## S-MSG.row-menu: Row menu

menu (drawn) · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#rowmenu-phone-light` and `#rowmenu-desk-light` · local `redesign/clubhouse-messages.html#rowmenu-phone-light` · app `/clubhouse-preview/messages?state=design&view=rowmenu` · capture `--id S-MSG.row-menu --state rowmenu-phone`

Long-press (phone) or right-click (desktop) a row: a glass menu with Open conversation, Pin (Unpin when pinned), Mark as unread, Mute…, Delete conversation (today's items plus Pin from 11b), in that order. Delete conversation is danger red, `--a-danger` → `--ch-flag` (6.26 light, 7.03 dark), like Delete in the hold menu (SETTLED-4NOV 8). Route `rowmenu` unpins Dana first so Pin is live, then opens the menu on Maya's row. The menu is 236 × 222, padding 6, radius 18, glass-strong (blur 24, saturate 170) with `--a-shadow-float`. The rows have no icons on this menu.

### Phone, 390 × 844 (`#rowmenu-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.ovl > div.menu` |  | 236 × 222, pad 6, r 18 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `.menu > button` | “Open conversation” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “Pin” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “Mark as unread” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “Mute…” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button.danger` | “Delete conversation” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-danger` → `--ch-flag` on `--a-glass-strong` → glass-strong | #B3261E on #FCFAF6 **6.26** | #F28B7D on #191E1A **7.03** | 224×42 ⚠ |  |

### Desktop, 1440 × 900 (`#rowmenu-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.ovl > div.menu` |  | 236 × 222, pad 6, r 18 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `.menu > button` | “Open conversation” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “Pin” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “Mark as unread” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “Mute…” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button.danger` | “Delete conversation” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-danger` → `--ch-flag` on `--a-glass-strong` → glass-strong | #B3261E on #FCFAF6 **6.26** | #F28B7D on #191E1A **7.03** | 224×42 ⚠ |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.row-menu)**, check on both images within 2pt:
1. Menu 236 wide, padding 6, radius 18
2. Items 224 × 42, padding 8 12, radius 12
3. Item text 15/18 500
4. Five items, menu 222 tall
5. Delete conversation in `--ch-flag` (#B3261E / #F28B7D)

## S-MSG.row-menu (pin limit): Row menu at the pin limit

menu state (D7) · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#pinlimit-phone-light` and `#pinlimit-desk-light` · local `redesign/clubhouse-messages.html#pinlimit-phone-light` · app `/clubhouse-preview/messages?state=design&view=pinlimit` · capture `--id S-MSG.row-menu --state pinlimit-phone`

Route `pinlimit` opens the same menu with three pins in place: Pin is dimmed and carries a second line "Pin up to 3" (PIN-SYNC D7). Only the note is new; the item box is unchanged (224 × 42).

### Phone, 390 × 844 (`#pinlimit-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.menu button > small` | “Pin up to 3” | 60.7 × 16.3 | 12.5/16.3 500, 0; wraps | `--a-ink-3` → `--ch-text-tertiary` on `--a-glass-strong` → glass-strong | #5F5C55 on #FCFAF6 **6.39** | #ADA697 on #191E1A **6.96** |  |  |

### Desktop, 1440 × 900 (`#pinlimit-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.menu button > small` | “Pin up to 3” | 60.7 × 16.3 | 12.5/16.3 500, 0; wraps | `--a-ink-3` → `--ch-text-tertiary` on `--a-glass-strong` → glass-strong | #5F5C55 on #FCFAF6 **6.39** | #ADA697 on #191E1A **6.96** |  |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.row-menu (pin limit))**, check on both images within 2pt:
1. Note "Pin up to 3" 12.5/16.2 500 tertiary
2. Item still 224 wide

## S-MSG.new: New message

sub page · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#new-phone-light` and `#new-desk-light` · local `redesign/clubhouse-messages.html#new-phone-light` · app `/clubhouse-preview/messages?state=design&view=new` · capture `--id S-MSG.new --state new-phone`

Phone: a pushed page under the green bar with "Cancel" (champagne link) and the title "New message"; a To field card holding a person token, then a Suggested card of people (`.li` rows, 52 tall, face 32). Desktop: the pane shows the same cards at 848 wide; the bar title is 15/600 ink on glass with a text "Cancel" at the right.

### Phone, 390 × 844 (`#new-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.to > span` | “To:” | 22.1 × 20.8 | 16/20.8 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.scroll > div.lcard.sugg` |  | 358 × 306.1, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.lcard > button.li` |  | 358 × 52, pad 7 16, gap 12 |  |  |  |  | 358×52 |  |
| `.li > span.av` | “JL” | 32 × 32, r 50% | 12.2/12.2 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #634C82 **7.09** | #FDFCF8 on #634C82 **7.09** |  | 03 Empty and new: `directory` person |
| `.li span > b` | “Jack Liu” | 270 × 18.1 | 14.5/18.1 600, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Empty and new: `directory` name |
| `.li span > small` | “Freshman” | 270 × 16.3 | 13/16.3 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Empty and new: role |
| `.tbar div > button.pback` |  | 70.3 × 44, pad 0 8 0 2, r 12 |  |  |  |  | 70×44 |  |
| `.pback > span` | “Cancel” | 60.3 × 17, pad 0 0 0 6 | 17/17 400, 0; 1 line | `--a-champ-link` → PhoneBar back link on `--a-frame` → `--ch-frame` | #DCCDA6 on #0A331F **8.85** | #CDBB8E on #08150E **9.87** |  |  |
| `.tbar > b.ttl.on` | “New message” | 109.3 × 22.1 | 17/22.1 600, -0.01em; 1 line | `--a-on-green` → `--ch-on-green-ink` on `--a-frame` → `--ch-frame` | #F4EEDD on #0A331F **12.03** | #F4EEDD on #08150E **16.12** |  |  |

### Desktop, 1440 × 900 (`#new-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.scroll > div.lcard` |  | 848 × 52, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.to > span` | “To:” | 22.1 × 20.8 | 16/20.8 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.scroll > div.lcard.sugg` |  | 848 × 306.1, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.lcard > div.lcard__h` | “Suggested” | 848 × 46.1, pad 14 16 10, gap 10 | 17/22.1 600, -0.01em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.lcard__h > small` | “Players you haven’t messaged” | 204.9 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Inbox: rows in that card (filtered list) |
| `.lcard > button.li` |  | 848 × 52, pad 7 16, gap 12 |  |  |  |  | 848×52 |  |
| `.li > span.av` | “JL” | 32 × 32, r 50% | 12.2/12.2 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #634C82 **7.09** | #FDFCF8 on #634C82 **7.09** |  | 03 Empty and new: `directory` person |
| `.li span > b` | “Jack Liu” | 760 × 18.1 | 14.5/18.1 600, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Empty and new: `directory` name |
| `.li span > small` | “Freshman” | 760 × 16.3 | 13/16.3 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Empty and new: role |
| `.tbar > b.ttl.on` | “New message” | 96.5 × 19.5 | 15/19.5 600, -0.01em; 1 line | `--a-ink` → `--ch-text-primary` on `--a-glass` → glass | #1C1B18 on #FBF9F4 **16.31** | #F1ECDF on #141915 **15.13** |  |  |
| `.tools > button.txtbtn` | “Cancel” | 67 × 33, pad 8 6 | 17/17 500, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-glass` → glass | #155A39 on #FBF9F4 **7.79** | #7CC79B on #141915 **8.92** | 67×33 ⚠ |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.new)**, check on both images within 2pt:
1. To card 52 tall (desktop 848 wide)
2. Suggestion row 52 tall, padding 7 16, face 32, gap 12
3. Name 14.5/18.1 600, role 13/16.2 500
4. Suggested card 306.1 tall
5. Phone Cancel 70.3 × 44; title 17/22.1 600

## S-MSG.empty: First run (no conversations)

empty state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#empty-phone-light` and `#empty-desk-light` · local `redesign/clubhouse-messages.html#empty-phone-light` · app `/clubhouse-preview/messages?state=design&view=empty` · capture `--id S-MSG.empty --state empty-phone`

A centred card: illustration, title "No conversations yet", body copy naming the team, primary "Start a conversation" and ghost "Message the team". Same card on phone and desktop (desktop 360 wide, its `max-width`; at 430 the card also reaches its 360 max and centres at x 35). The v12 "CH-7301" line is gone: it was a design annotation, not app copy (SETTLED-4NOV 12).

### Phone, 390 × 844 (`#empty-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.empty > div.ecard` |  | 358 × 384.8, pad 26 20 20, r 16, gap 10 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.ecard > h4` | “No conversations yet” | 190 × 25 | 20/25 600, -0.015em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.ecard > p` | “Message a player, a coach or the w…” | 280 × 65.3 | 15/21.8 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Empty and new: copy with `teamName` |
| `.ecard > button.cta` | “Start a conversation” | 203.9 × 44, pad 0 18, r 999, gap 8 | 15/15 600, 0; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** | 204×44 |  |
| `.cta > svg.ic` | `compose` 18, stroke 2.2 | 18 × 18 |  | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  |  |
| `.ecard > button.ghost` | “Message the team” | 141.4 × 30.5, pad 8 | 14.5/14.5 600, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 141×31 ⚠ |  |

### Desktop, 1440 × 900 (`#empty-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.empty > div.ecard` |  | 360 × 384.8, pad 26 20 20, r 16, gap 10 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.ecard > h4` | “No conversations yet” | 190 × 25 | 20/25 600, -0.015em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.ecard > p` | “Message a player, a coach or the w…” | 280 × 65.3 | 15/21.8 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Empty and new: copy with `teamName` |
| `.ecard > button.cta` | “Start a conversation” | 203.9 × 44, pad 0 18, r 999, gap 8 | 15/15 600, 0; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** | 204×44 |  |
| `.cta > svg.ic` | `compose` 18, stroke 2.2 | 18 × 18 |  | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  |  |
| `.ecard > button.ghost` | “Message the team” | 141.4 × 30.5, pad 8 | 14.5/14.5 600, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 141×31 ⚠ |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.empty)**, check on both images within 2pt:
1. Card 358 × 384.8 (phone), padding 26 20 20, radius 16, gap 10
2. Title 20/25 600
3. Body 15/21.7, 280 wide
4. Primary button 203.9 × 44, radius 999, icon 18
5. Ghost button 141.4 × 30.5 (hit to 44)

## S-MSG.thread: Conversation (Eli, 1:1)

screen · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#thread-phone-light` and `#thread-desk-light` · local `redesign/clubhouse-messages.html#thread-phone-light` · app `/clubhouse-preview/messages?state=design&view=thread` · capture `--id S-MSG.thread --state thread-phone`

Eli's thread: day pills, runs of bubbles (theirs on paper, yours on green), a photo, Like and Love badges, your last message with "Seen 8:15 AM". Phone bar: back, face 36 with name and role, Details key (measured insets in "Shared: the green bars"). Desktop bubbles are in the S-MSG table; the desktop table here adds the hover bar, measured with hover forced at 1280 (hover.json). Times sit off-screen at the right (x 390 on phone) until the thread is dragged (S-MSG.times).

### Phone, 390 × 844 (`#thread-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.day > span` | “Thursday” | 129.6 × 24.9, pad 4 11, r 999 | 13/16.9 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: `dayLabel(at, now, timeZone)` |
| `.day span > b` | “5:48 PM” | 48 × 16 | 13/16.9 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: `clock(at, …)` of the first message |
| `(theirs, first) .col > div.b` | “Coach, could we move my lesson to …” | 278.2 × 57.2, pad 7.5 13, r 19 | 16/21.1 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, first) .row > span.time` | “5:48 PM” | 52 × 13 | 13/13 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Conversation: `clock(at, timeZone, clock)` |
| `(mine, first, joins below) .col > div.b` | “Friday at 3 works” | 146.6 × 36.1, pad 7.5 13, r 19 19 6 | 16/21.1 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, first, joins below) .row > span.time` | “5:52 PM” | 52 × 13 | 13/13 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Conversation: `clock(at, timeZone, clock)` |
| `(mine, joins above, has reactions) .col > div.b` | “Bring the 52 and the 56. We’re doi…” | 278.2 × 57.2, pad 7.5 13, r 19 6 19 19 | 16/21.1 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, joins above, has reactions) .rx > span` |  | 26 × 26, pad 0 6, r 999, gap 3 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(mine, joins above, has reactions) .rx span > svg.ic` | `like` 14, stroke 2 | 14 × 14 |  | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `(mine, joins above, has reactions) .row > span.time` | “5:52 PM” | 52 × 13 | 13/13 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Conversation: `clock(at, timeZone, clock)` |
| `(theirs, first, joins below) .col > div.b` | “Played the back nine at Lonnie Poo…” | 278.2 × 57.2, pad 7.5 13, r 19 19 19 6 | 16/21.1 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, first, joins below) .row > span.time` | “8:09 AM” | 52 × 13 | 13/13 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Conversation: `clock(at, timeZone, clock)` |
| `(theirs, joins above, joins below) .col > div.b` | “Hit 7 of 9 greens. The wedge ladde…” | 278.2 × 57.2, pad 7.5 13, r 6 19 19 6 | 16/21.1 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, joins above, joins below) .row > span.time` | “8:09 AM” | 52 × 13 | 13/13 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Conversation: `clock(at, timeZone, clock)` |
| `(theirs, joins above) .col > div.b.photo` |  | 242 × 176, pad 3, r 6 19 19 |  | fill `--a-recv` → `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 |  | 03 Conversation: `attachments(messageId)`, `image/*` |
| `(theirs, joins above) .b > span.photo__img` |  | 236 × 170, r 16 |  |  |  |  |  | 03 Conversation: `attachments(messageId)`, `image/*` |
| `(theirs, joins above) .row > span.time` | “8:10 AM” | 52 × 13 | 13/13 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Conversation: `clock(at, timeZone, clock)` |
| `(mine, first, joins below, has reactions) .col > div.b` | “That’s the round we’ve been waitin…” | 278.2 × 57.2, pad 7.5 13, r 19 19 6 | 16/21.1 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, first, joins below, has reactions) .rx > span` |  | 26 × 26, pad 0 6, r 999, gap 3 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(mine, first, joins below, has reactions) .rx span > svg.ic` | `love` 14, stroke 2 | 14 × 14 |  | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `(mine, first, joins below, has reactions) .row > span.time` | “8:14 AM” | 52 × 13 | 13/13 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Conversation: `clock(at, timeZone, clock)` |
| `(mine, joins above) .col > div.b` | “Send me the card when you get a se…” | 278.2 × 57.2, pad 7.5 13, r 19 6 19 19 | 16/21.1 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, joins above) .col > span.seen.txt` | “Seen 8:15 AM” | 94.8 × 22.3, pad 3 9, r 999, gap 6 | 12.5/16.3 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: `ChMsg.seen` + other member's `last_read_at` |
| `(mine, joins above) .row > span.time` | “8:14 AM” | 52 × 13 | 13/13 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-page` → `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.8** |  | 03 Conversation: `clock(at, timeZone, clock)` |
| `.tbar > button.ibtn.pback-i` |  | 44 × 44, pad 1 6, r 50% |  |  |  |  | 44×44 |  |
| `.tbar > button.who` |  | 90.9 × 41, pad 2 4, r 12, gap 10 |  |  |  |  | 91×41 ⚠ |  |
| `.who > span.av` | “EB” | 36 × 36, r 50% | 13.7/13.7 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #3A6580 **6.1** | #FDFCF8 on #3A6580 **6.1** |  | 03 Conversation: `convAvatarId` |
| `.who span > b` | “Eli” | 19 × 20.4, gap 2 | 17/20.4 600, -0.01em; 1 line | `--a-on-green` → `--ch-on-green-ink` on `--a-frame` → `--ch-frame` | #F4EEDD on #0A331F **12.03** | #F4EEDD on #08150E **16.12** |  | 03 Conversation: `ChConv.title` (phone: first name) |
| `.who span > em` | “Junior” | 36.9 × 15.6 | 13/15.6 400, 0; 1 line | `--a-on-green-soft` → `--ch-on-green-ink` 86% on `--a-frame` → `--ch-frame` | #D0D0BC on #0A331F **8.88** | #D0CBBA on #08150E **11.52** |  | 03 Conversation: role (`classYearLabel`, coach title) or "N members" |
| `.tbar > button.ibtn` |  | 44 × 44, pad 1 6, r 50% |  |  |  |  | 44×44 |  |

### Desktop, 1440 × 900 (`#thread-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(theirs, first) .col > div.hoverbar` (hover, at 1280) |  | 144 × 32.6, pad 3, r 999, gap 1 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `(theirs, first) .hoverbar > button` (hover, at 1280) |  | 26.9 × 26.9, pad 1 6, r 50% |  |  |  |  | 27×27 ⚠ |  |
| `(theirs, first) .hoverbar button > svg.ic` (hover, at 1280) | `like` 14.4, stroke 1.8 | 14.4 × 14.4 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  |  |

Rules the table doesn't show:
- Thread side padding 12 at 390, 16 at 430 (SETTLED-4NOV 1): theirs bubbles at x 12 / 16. Bubble max width 76% of the column: 278.2 at 390, 302.5 at 430.
- Bubble padding 7.5 13 (scales with Text Size), radius 19, join corners 6 (theirs left, yours right); the tail is on the last bubble of a run only (18 × 20 SVG, 04 §3).
- Gaps: 2 between bubbles of a run (measured 1.8 to 2.8 on rounded positions), 16 above a bubble with reactions (badge at top −14, side −10).
- Day pill 24.9 tall, padding 4 11, radius 999, on `--ch-card-bg` with the card shadow; the time inside is 400, the day 500.
- "Seen 8:15 AM" receipt pill 22.3 tall, padding 3 9, radius 999, right-aligned under your last bubble.
- Photo bubble 242 × 176, padding 3, image 236 × 170 radius 16.

### Large phone 430, XXL, desktop 1280

Large phone 430: thread side padding 16 (12 at 390); bubble max width 302.5 (76%); the day pill re-centres; the phone bar keeps its measured insets (back x 24, `.who` x 70, Details x 163). XXL: bubble text 21.65/28.6 and bubbles grow taller at the same 278.2 width (57.2 → 106 for two lines that become three); day pill 30.9 tall; Seen pill 28 tall; reaction badges keep 26 × 26 with 14 icons; the phone bar's `.who` grows to 53.7 tall (name 23/27.6, role 17.59/21.1) and the Details key moves to x 176; the time column stays one line, 70.3 wide (S-MSG.times). Desktop 1280: bubbles keep the same widths (`min(520px, 72%)` of the column), the column starts at x 580 (pane 552 + 28), the hover bar keys stay 26.9.

Phone variants (light; dark is the same geometry):

| Element | Sample | 390 default: x, w × h, type | 430: x, w × h | XXL (×1.353): w × h, type |
|---|---|---|---|---|
| `.day > span` | Thursday | x 130, 129.6 × 24.9, 13/16.9 | x 150, 129.6 × 24.9 | scrolled out of frame |
| `.day span > b` | 5:48 PM | x 201, 48 × 16, 13/16.9 | x 221, 48 × 16 | scrolled out of frame |
| `(theirs, first) .col > div.b` | Coach, could we move m | x 12, 278.2 × 57.2, 16/21.1 | x 16, 302.5 × 57.2 | scrolled out of frame |
| `(theirs, first) .row > span.time` | 5:48 PM | x 390, 52 × 13, 13/13 | x 430, 52 × 13 | scrolled out of frame |
| `(mine, first, joins below) .col > div.b` | Friday at 3 works | x 231, 146.6 × 36.1, 16/21.1 | x 267, 146.6 × 36.1 | scrolled out of frame |
| `(mine, first, joins below) .row > span.time` | 5:52 PM | x 390, 52 × 13, 13/13 | x 430, 52 × 13 | scrolled out of frame |
| `(mine, joins above, has reactions) .col > div.b` | Bring the 52 and the 5 | x 100, 278.2 × 57.2, 16/21.1 | x 112, 302.5 × 57.2 | 278.2 × 106, 21.6/28.6 |
| `(mine, joins above, has reactions) .rx > span` |  | x 90, 26 × 26 | x 102, 26 × 26 | scrolled out of frame |
| `(mine, joins above, has reactions) .rx span > svg.ic` |  | x 96, 14 × 14 | x 108, 14 × 14 | scrolled out of frame |
| `(mine, joins above, has reactions) .row > span.time` | 5:52 PM | x 390, 52 × 13, 13/13 | x 430, 52 × 13 | scrolled out of frame |
| `(theirs, first, joins below) .col > div.b` | Played the back nine a | x 12, 278.2 × 57.2, 16/21.1 | x 16, 302.5 × 57.2 | 278.2 × 106, 21.6/28.6 |
| `(theirs, first, joins below) .row > span.time` | 8:09 AM | x 390, 52 × 13, 13/13 | x 430, 52 × 13 | scrolled out of frame |
| `(theirs, joins above, joins below) .col > div.b` | Hit 7 of 9 greens. The | x 12, 278.2 × 57.2, 16/21.1 | x 16, 302.5 × 57.2 | 278.2 × 106, 21.6/28.6 |
| `(theirs, joins above, joins below) .row > span.time` | 8:09 AM | x 390, 52 × 13, 13/13 | x 430, 52 × 13 | scrolled out of frame |
| `(theirs, joins above) .col > div.b.photo` |  | x 12, 242 × 176 | x 16, 242 × 176 | 242 × 176 |
| `(theirs, joins above) .b > span.photo__img` |  | x 15, 236 × 170 | x 19, 236 × 170 | 236 × 170 |

Desktop variants (light):

| Element | Sample | 1440: x, w × h | 1280: x, w × h |
|---|---|---|---|
| `.tbar > button.who` |  | x 566, 770 × 36 | x 566, 610 × 36 |

**Redline (S-MSG.thread)**, check on both images within 2pt:
1. Bubble radius 19, join corner 6
2. Bubble padding 7.5 13; text 16/21.1 (desktop 15/19.8)
3. Bubble max width 278.2 at 390 (76%)
4. Thread side edge 12 at 390, 16 at 430
5. Day pill 24.9 tall, radius 999
6. Reaction badge 26 tall at top −14, side −10
7. Seen pill 22.3 tall
8. Phone bar: back 44 at x 24, face 36, Details 44
9. Desktop hover bar 144 × 32.6, keys 26.9

## S-MSG.composer: Composer

component · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#thread-phone-light` and `#thread-desk-light` · local `redesign/clubhouse-messages.html#thread-phone-light` · app `/clubhouse-preview/messages?state=design&view=thread` · capture `--id S-MSG.composer --state thread-phone`

The floating glass pill at the bottom of every thread: + key, field, and the send key that springs in with the first character (an empty field shows no key on the right; no dictate key, 04 §8). Phone: 8 from the bottom in shot frames (`max(8px, env(safe-area-inset-bottom) - 4px)` in the app, 04 §4), 10 from each side at 390 and 14 at 430 (SETTLED-4NOV 1). Glass-strong with blur 24 saturate 170. The field grows by steps to six lines (max 132), never animated. Desktop: the pill is 760 at 1440 (its max), centred in the pane.

### Phone, 390 × 844 (`#thread-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.comp > div.comp__in` |  | 370 × 46.1, pad 5, r 24, gap 6 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `.comp__in > button.ibtn.comp__plus` |  | 36 × 36, pad 1 6, r 50% |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 | 36×36 ⚠ |  |
| `.comp__in > textarea.comp__ta` |  | 318 × 36.1, pad 8 4 7 |  |  |  |  | 318×36 ⚠ |  |

### Desktop, 1440 × 900 (`#thread-desk-light-shot` / `-dark-shot`)

Nothing new over the screens above. Desktop: See the tables they point to.

### Large phone 430, XXL, desktop 1280

Large phone 430: pill 402 wide at x 14 (10 at 390), field 350. XXL: pill 53.6 tall, field 43.6 (one line at 21.65), + key stays 36 and centres; the pill grows, never clips. Desktop 1280: pill 664 × 46.1 (column 720 minus 28 each side); with details open, 364.

Phone variants (light; dark is the same geometry):

| Element | Sample | 390 default: x, w × h, type | 430: x, w × h | XXL (×1.353): w × h, type |
|---|---|---|---|---|
| `.comp > div.comp__in` |  | x 10, 370 × 46.1 | x 14, 402 × 46.1 | 370 × 53.6 |
| `.comp__in > button.ibtn.comp__plus` |  | x 15, 36 × 36 | x 19, 36 × 36 | 36 × 36 |
| `.comp__in > textarea.comp__ta` |  | x 57, 318 × 36.1 | x 61, 350 × 36.1 | 318 × 43.6 |

Desktop variants (light):

| Element | Sample | 1440: x, w × h | 1280: x, w × h |
|---|---|---|---|
| `.comp > div.comp__in` |  | x 612, 760 × 46.1 | x 580, 664 × 46.1 |
| `.comp__in > textarea.comp__ta` |  | x 659, 708 × 36.1 | x 627, 612 × 36.1 |

**Redline (S-MSG.composer)**, check on both images within 2pt:
1. Pill 370 × 46.1 at x 10 on phone 390, 402 × 46.1 at x 14 on 430 (desktop 760 × 46.1)
2. Pill padding 5, radius 24
3. + key 36 at x 15
4. Field 36.1 tall, padding 8 4 7, starts at x 57 (gap 6)
5. Send key 36 (S-MSG.file)
6. Bottom gap 8 in shot frames

## S-MSG.thread (failed): Failed message

inline state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#failed-phone-light` and `#failed-desk-light` · local `redesign/clubhouse-messages.html#failed-phone-light` · app `/clubhouse-preview/messages?state=design&view=failed` · capture `--id S-MSG.thread --state failed-phone`

Route `failed` adds e10 "Can you bring the scorecard to lift?" with `failed: true`. Under it, in place of the receipt, a paper pill: alert icon 14 and "Not delivered · Try again" in `--ch-flag` with "Try again" in primary 600. The pill is the retry button (tap to retry). The words are the page's; the build keeps today's Not sent line word for word (02-PLAN, 03-DATA-CHECKS), checked against today's source string by a test (SETTLED-4NOV 19). The pill's box, icon and colours below still apply. The previous bubble's bottom-right corner becomes a join corner (19 6 6 19). The pending (sending) bubble is not drawn: restyle today's (05 not-drawn list).

### Phone, 390 × 844 (`#failed-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(mine, joins above, joins below) .col > div.b` | “Send me the card when you get a se…” | 278.2 × 57.2, pad 7.5 13, r 19 6 6 19 | 16/21.1 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, joins above) .col > button.seen.fail` |  | 169.5 × 22.3, pad 3 9 3 4, r 999, gap 5 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A | 170×22 ⚠ | 03 Conversation: `ChMsg.failed` |
| `(mine, joins above) .seen > svg.ic` | `alert` 14, stroke 1.8 | 14 × 14 |  | `--a-danger` → `--ch-flag` on `--a-surface` → `--ch-card-bg` | #B3261E on #FFFEFB **6.48** | #F28B7D on #191E1A **7.06** |  |  |
| `(mine, joins above) .seen > span` | “Not delivered ·” | 137.5 × 16.3 | 12.5/16.3 500, 0; wraps | `--a-danger` → `--ch-flag` on `--a-surface` → `--ch-card-bg` | #B3261E on #FFFEFB **6.48** | #F28B7D on #191E1A **7.06** |  | 03 Conversation: `ChMsg.failed` |
| `(mine, joins above) .seen span > b` | “Try again” | 53.4 × 15 | 12.5/16.3 600, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Conversation: `ChMsg.failed` |

### Desktop, 1440 × 900 (`#failed-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(mine, joins above, joins below) .col > div.b` | “Send me the card when you get a se…” | 276.9 × 34.8, pad 7.5 13, r 19 6 6 19 | 15/19.8 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, joins above) .col > button.seen.fail` |  | 169.5 × 22.3, pad 3 9 3 4, r 999, gap 5 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A | 170×22 ⚠ | 03 Conversation: `ChMsg.failed` |
| `(mine, joins above) .seen > svg.ic` | `alert` 14, stroke 1.8 | 14 × 14 |  | `--a-danger` → `--ch-flag` on `--a-surface` → `--ch-card-bg` | #B3261E on #FFFEFB **6.48** | #F28B7D on #191E1A **7.06** |  |  |
| `(mine, joins above) .seen > span` | “Not delivered ·” | 137.5 × 16.3 | 12.5/16.3 500, 0; wraps | `--a-danger` → `--ch-flag` on `--a-surface` → `--ch-card-bg` | #B3261E on #FFFEFB **6.48** | #F28B7D on #191E1A **7.06** |  | 03 Conversation: `ChMsg.failed` |
| `(mine, joins above) .seen span > b` | “Try again” | 53.4 × 15 | 12.5/16.3 600, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Conversation: `ChMsg.failed` |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.thread (failed))**, check on both images within 2pt:
1. Fail pill 169.5 × 22.3, padding 3 9 3 4, radius 999, gap 5
2. Alert icon 14
3. Text 12.5/16.2 500 flag, "Try again" 600 primary
4. Hit area to 44 (see Hit areas)

## S-MSG.thread (long text): Long message and long names

inline state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#long-phone-light` and `#long-desk-light` · local `redesign/clubhouse-messages.html#long-phone-light` · app `/clubhouse-preview/messages?state=design&view=long` · capture `--id S-MSG.thread --state long-phone`

Route `long` renames Eli "Eli Brandt-Vanderhoeven", role "Junior · Transfer from Wake Forest", adds a long message with a long URL, and scrolls to the bottom. Nothing new is drawn. The new bubble grows to 289.4 tall at the 278.2 max width and the URL breaks inside the bubble; the phone bar shows the short name "Eli" and the role line widens the `.who` button to 255.5 (role 201.5 wide, one line). SHARED-5: bubbles grow, never clip.

### Phone, 390 × 844 (`#long-phone-light-shot` / `-dark-shot`)

Nothing new over the screens above. See the tables they point to.

### Desktop, 1440 × 900 (`#long-desk-light-shot` / `-dark-shot`)

Nothing new over the screens above. Desktop: See the tables they point to.

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.thread (long text))**, check on both images within 2pt:
1. Long bubble 278.2 wide (max), 289.4 tall
2. URL breaks inside the bubble
3. Phone bar role one line, 13/15.6

## S-MSG.team: Team channel

state (group) · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#team-phone-light` and `#team-desk-light` · local `redesign/clubhouse-messages.html#team-phone-light` · app `/clubhouse-preview/messages?state=design&view=team` · capture `--id S-MSG.team --state team-phone`

The team channel: the sender's name inside the first bubble of a run, the sender's face (30 slot) beside the last, reaction badges with counts, the poll (S-MSG.poll), and the Seen by pill under your latest message. In groups the theirs bubbles start at x 50 (12 + the 30 face slot + 8). Reaction badges on their bubbles are green with ivory; on yours, paper with green (04 §2).

### Phone, 390 × 844 (`#team-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(mine, first) .stack > span.av` | “LF” | 18 × 18, r 50% | 7.5/7.5 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #7F612A **5.61** | #FDFCF8 on #7F612A **5.61** |  | 03 Polls: voter faces (up to 3) |
| `(theirs, first, joins below) .b > span.bname` | “Maya” | 252.2 × 16.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Conversation: `personOf(senderId).name` (groups, first of a run) |
| `(theirs, joins above) .avslot > span.av` | “MO” | 30 × 30, r 50% | 12/12 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #84495A **6.64** | #FDFCF8 on #84495A **6.64** |  | 03 Conversation: `senderId` (groups, last of a run) |
| `(theirs, joins above) .col > div.b` | “The range opens at 7, so we’d stil…” | 278.2 × 57.2, pad 7.5 13, r 6 19 19 | 16/21.1 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, first, has reactions) .avslot > span.av` | “OP” | 30 × 30, r 50% | 12/12 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #2C706C **5.62** | #FDFCF8 on #2C706C **5.62** |  | 03 Conversation: `senderId` (groups, last of a run) |
| `(theirs, first, has reactions) .col > div.b` | “Seconding 7:45” | 136.5 × 54, pad 7.5 13, r 19 | 16/21.1 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, first, has reactions) .b > span.bname` | “Owen” | 110.5 × 16.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Conversation: `personOf(senderId).name` (groups, first of a run) |
| `(theirs, first, has reactions) .rx > span` | “2” | 36.1 × 26, pad 0 6, r 999, gap 3 | 12/12 600, -0.007em, tabular; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(mine, first, has reactions) .col > div.b` | “Van leaves the field house at 6:40…” | 278.2 × 78.3, pad 7.5 13, r 19 | 16/21.1 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, first, has reactions) .rx > span` | “4” | 36.1 × 26, pad 0 6, r 999, gap 3 | 12/12 600, -0.007em, tabular; wraps | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(mine, first, has reactions) .col > button.seen` |  | 169.1 × 22.3, pad 3 9 3 4, r 999, gap 6 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A | 169×22 ⚠ | 03 Conversation: `ChReceipts.marks` (up to 5 faces) |
| `(mine, first, has reactions) .stack > span.av` | “MO” | 16 × 16, r 50% | 7/7 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #84495A **6.64** | #FDFCF8 on #84495A **6.64** |  | 03 Conversation: Seen by faces (`last_read_at ≥ at`) |
| `(theirs, first) .avslot > span.av` | “SC” | 30 × 30, r 50% | 12/12 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #56653A **6.16** | #FDFCF8 on #56653A **6.16** |  | 03 Conversation: `senderId` (groups, last of a run) |
| `(theirs, first) .b > span.bname` | “Sam” | 252.2 × 16.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Conversation: `personOf(senderId).name` (groups, first of a run) |
| `.who > span.av.grp` |  | 36 × 36, r 50% |  |  |  |  |  | 03 Conversation: `convAvatarId` |

### Desktop, 1440 × 900 (`#team-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(mine, first) .col > div.b` | “Qualifier pairings for next week a…” | 506.9 × 54.6, pad 7.5 13, r 19 | 15/19.8 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, first) .stack > span.av` | “LF” | 18 × 18, r 50% | 7.5/7.5 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #7F612A **5.61** | #FDFCF8 on #7F612A **5.61** |  | 03 Polls: voter faces (up to 3) |
| `(theirs, first, joins below) .b > span.bname` | “Maya” | 295.7 × 16.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Conversation: `personOf(senderId).name` (groups, first of a run) |
| `(theirs, joins above) .avslot > span.av` | “MO” | 30 × 30, r 50% | 11.4/11.4 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #84495A **6.64** | #FDFCF8 on #84495A **6.64** |  | 03 Conversation: `senderId` (groups, last of a run) |
| `(theirs, joins above) .col > div.b` | “The range opens at 7, so we’d stil…” | 373 × 34.8, pad 7.5 13, r 6 19 19 | 15/19.8 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, first, has reactions) .avslot > span.av` | “OP” | 30 × 30, r 50% | 11.4/11.4 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #2C706C **5.62** | #FDFCF8 on #2C706C **5.62** |  | 03 Conversation: `senderId` (groups, last of a run) |
| `(theirs, first, has reactions) .col > div.b` | “Seconding 7:45” | 129.6 × 52.7, pad 7.5 13, r 19 | 15/19.8 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, first, has reactions) .b > span.bname` | “Owen” | 103.6 × 16.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Conversation: `personOf(senderId).name` (groups, first of a run) |
| `(theirs, first, has reactions) .rx > span` | “2” | 35.8 × 26, pad 0 6, r 999, gap 3 | 11.5/11.5 600, -0.007em, tabular; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(mine, first, has reactions) .col > div.b` | “Van leaves the field house at 6:40…” | 506.9 × 54.6, pad 7.5 13, r 19 | 15/19.8 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(mine, first, has reactions) .rx > span` | “4” | 35.8 × 26, pad 0 6, r 999, gap 3 | 11.5/11.5 600, -0.007em, tabular; wraps | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(mine, first, has reactions) .col > button.seen` |  | 169.1 × 22.3, pad 3 9 3 4, r 999, gap 6 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A | 169×22 ⚠ | 03 Conversation: `ChReceipts.marks` (up to 5 faces) |
| `(mine, first, has reactions) .stack > span.av` | “MO” | 16 × 16, r 50% | 7/7 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #84495A **6.64** | #FDFCF8 on #84495A **6.64** |  | 03 Conversation: Seen by faces (`last_read_at ≥ at`) |
| `(theirs, first) .avslot > span.av` | “SC” | 30 × 30, r 50% | 11.4/11.4 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #56653A **6.16** | #FDFCF8 on #56653A **6.16** |  | 03 Conversation: `senderId` (groups, last of a run) |
| `(theirs, first) .b > span.bname` | “Sam” | 237.4 × 16.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Conversation: `personOf(senderId).name` (groups, first of a run) |
| `.who > span.av.grp` |  | 36 × 36, r 50% |  |  |  |  |  | 03 Conversation: `convAvatarId` |

Rules the table doesn't show:
- Group face initials: 12/12 600 on the 30 face on phone (SETTLED-4NOV 5); desktop keeps 11.4 (0.38 of the face), since the 12 floor is the phone's (04 §3).
- Seen by pill: up to five 16 faces overlapping −4, each with a 1.5 ring of `--ch-card-bg` (d-extra), then "Seen by **8** of 10" (count 600 primary). The faces show colour only in the build (no 7 px initials, 04 §8).
- Poll voter faces: 18, overlap −5, ring 1.5 `--ch-well-bg-flat`, colour only.
- Reaction badge with a count: 36.1 × 26, padding 0 6, gap 3; the number is tabular, 12 (desktop 11.5) / 600.

### Large phone 430, XXL, desktop 1280

XXL: names in bubbles 17.59/22.9; badge with count 38.6 × 26 (number 16.24); Seen pill 199.4 × 28 with the count 16.91; sender faces stay 30, Seen faces 16. Large phone 430: group bubbles start at x 54 (thread padding 16 + face slot 30 + 8) and grow to the 76% width (302.5). Desktop 1280: same widths as 1440, shifted with the narrower pane.

Phone variants (light; dark is the same geometry):

| Element | Sample | 390 default: x, w × h, type | 430: x, w × h | XXL (×1.353): w × h, type |
|---|---|---|---|---|
| `(mine, first) .col > div.poll` |  | x 106, 272 × 282.7 | x 142, 272 × 282.7 | scrolled out of frame |
| `(mine, first) .poll > p.poll__q` | Practice round at Lonn | x 120, 244 × 44.2, 17/22.1 | x 156, 244 × 44.2 | scrolled out of frame |
| `(mine, first) .poll > button.opt` |  | x 120, 244 × 52.4 | x 156, 244 × 52.4 | scrolled out of frame |
| `(mine, first) .opt > span.opt__fill` |  | x 120, 139.4 × 52.4 | x 156, 139.4 × 52.4 | scrolled out of frame |
| `(mine, first) .opt > span.opt__ck` |  | x 130, 20 × 20 | x 166, 20 × 20 | scrolled out of frame |
| `(mine, first) .opt__ck > svg.ic` |  | x 134, 12 × 12 | x 170, 12 × 12 | scrolled out of frame |
| `(mine, first) .opt > span` | Tue 7:30 AM | x 162, 124.2 × 36.4, 14/18.2 | x 198, 124.2 × 36.4 | scrolled out of frame |
| `(mine, first) .opt span > span.lead-chip` | Most votes | x 191, 75.9 × 19, 12/16.2 | x 227, 75.9 × 19 | scrolled out of frame |
| `(mine, first) .opt > span.opt__n` | 4 | x 296, 57.8 × 18, 13/13 | x 332, 57.8 × 18 | scrolled out of frame |
| `(mine, first) .stack > span.av` | LF | x 296, 18 × 18, 7.5/7.5 | x 332, 18 × 18 | scrolled out of frame |
| `(mine, first) .poll__f > span` | 7 votes · Closes Sunda | x 120, 171.1 × 16.9, 13/16.9 | x 156, 171.1 × 16.9 | scrolled out of frame |
| `(mine, first) .poll__f > button` | See votes | x 303, 60.8 × 24.5, 12.5/12.5 | x 339, 60.8 × 24.5 | scrolled out of frame |
| `(theirs, first, joins below) .col > div.b` | Any chance Tuesday can | x 50, 278.2 × 75.1, 16/21.1 | x 54, 302.5 × 75.1 | 278.2 × 101.3, 21.6/28.6 |
| `(theirs, first, joins below) .b > span.bname` | Maya | x 63, 252.2 × 16.9, 13/16.9 | x 67, 276.5 × 16.9 | 243 × 22.9, 17.6/22.9 |
| `(theirs, first, joins below) .row > span.time` | 4:20 PM | x 390, 52 × 13, 13/13 | x 430, 52 × 13 | scrolled out of frame |
| `(theirs, joins above) .avslot > span.av` | MO | x 12, 30 × 30, 12/12 | x 16, 30 × 30 | 30 × 30, 12/12 |

Desktop variants (light):

| Element | Sample | 1440: x, w × h | 1280: x, w × h |
|---|---|---|---|
| `(mine, first, has reactions) .col > div.b` | Van leaves the field h | x 837, 506.9 × 54.6 | x 766, 478.1 × 54.6 |
| `.tbar > button.who` |  | x 566, 770 × 36 | x 566, 610 × 36 |
| `.comp > div.comp__in` |  | x 612, 760 × 46.1 | x 580, 664 × 46.1 |
| `.comp__in > textarea.comp__ta` |  | x 659, 708 × 36.1 | x 627, 612 × 36.1 |

**Redline (S-MSG.team)**, check on both images within 2pt:
1. Group bubble start x 50 (face slot 30)
2. Sender face 30, initials 12/12 600
3. Name in bubble 13/16.9 600 secondary
4. Badge with count 36.1 × 26
5. Seen by pill 169.1 × 22.3, faces 16, overlap −4
6. Phone bar group face 36 (icon 18)

## S-MSG.typing: Typing bubble

state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#typing-phone-light` and `#typing-desk-light` · local `redesign/clubhouse-messages.html#typing-phone-light` · app `/clubhouse-preview/messages?state=design&view=typing` · capture `--id S-MSG.typing --state typing-phone`

Route `typing` pushes a typing item from Eli. A theirs bubble 59 × 33 with three 7 dots, padding 13 15, gap 4, radius 19 19 19 6, with the tail. Hides 5 s after the last typing event (the design's 5 s wins over today's 3 s). Reduce Motion: dots static at full opacity.

### Phone, 390 × 844 (`#typing-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(theirs, first) .col > div.typing` |  | 59 × 33, pad 13 15, r 19 19 19 6, gap 4 |  | fill `--a-recv` → `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 |  | 03 Conversation: `api.typing`, 5 s clear |
| `(theirs, first) .dots > i` |  | 7 × 7, r 50% |  | fill `--a-dot` → `--ch-typing-dot` (new) | #7A766C | #827D71 |  | 03 Conversation: `api.typing`, 5 s clear |

### Desktop, 1440 × 900 (`#typing-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(theirs, first) .col > div.typing` |  | 59 × 33, pad 13 15, r 19 19 19 6, gap 4 |  | fill `--a-recv` → `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 |  | 03 Conversation: `api.typing`, 5 s clear |
| `(theirs, first) .dots > i` |  | 7 × 7, r 50% |  | fill `--a-dot` → `--ch-typing-dot` (new) | #7A766C | #827D71 |  | 03 Conversation: `api.typing`, 5 s clear |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.typing)**, check on both images within 2pt:
1. Typing bubble 59 × 33
2. Dots 7, gap 4
3. Padding 13 15
4. Radius 19 19 19 6

## S-MSG.typing (group): Typing in a group

state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#grouptyping-phone-light` and `#grouptyping-desk-light` · local `redesign/clubhouse-messages.html#grouptyping-phone-light` · app `/clubhouse-preview/messages?state=design&view=grouptyping` · capture `--id S-MSG.typing --state grouptyping-phone`

Route `grouptyping`: Maya types in the team channel. In a group the typer's name sits inside the typing bubble above the dots, exactly like the name in a first bubble: `.bname` 13/16.9 600 `--ch-text-secondary` (9.77 light, 8.99 dark). The bubble with a name is 58.5 × 49.4, padding 7.5 13 12, gap 5, a column; there is no caption under it (SETTLED-4NOV 6). When the reply lands the bubble opens into the message, which carries the same name, so nothing jumps. Several typers: one typing bubble per typer, each with its name. One-to-one typing is S-MSG.typing, unchanged. The inbox row and pin keep 05's default ("Maya and Owen are typing" / "Several people are typing").

### Phone, 390 × 844 (`#grouptyping-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(theirs, first) .col > div.typing.has-name` |  | 58.5 × 49.4, pad 7.5 13 12, r 19 19 19 6, gap 5 |  | fill `--a-recv` → `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 |  | 03 Conversation: `api.typing`, 5 s clear |
| `(theirs, first) .typing > span.bname` | “Maya” | 32.5 × 16.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Conversation: typer's id → directory first name |

### Desktop, 1440 × 900 (`#grouptyping-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(theirs, first) .col > div.typing.has-name` |  | 58.5 × 49.4, pad 7.5 13 12, r 19 19 19 6, gap 5 |  | fill `--a-recv` → `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 |  | 03 Conversation: `api.typing`, 5 s clear |
| `(theirs, first) .typing > span.bname` | “Maya” | 32.5 × 16.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Conversation: typer's id → directory first name |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.typing (group))**, check on both images within 2pt:
1. Typing bubble with name 58.5 × 49.4, padding 7.5 13 12, gap 5
2. Name "Maya" 13/16.9 600 secondary, 32.5 wide, at x 63
3. Dots 7 × 7 under the name, at x 63
4. Bubble at x 50 (after the 30 face slot)

## S-MSG.times: Drag for times

state (phone only) · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#times-phone-light` (phone only) · local `redesign/clubhouse-messages.html#times-phone-light` · app `/clubhouse-preview/messages?state=design&view=times` · capture `--id S-MSG.times --state times-phone`

Route `times` sets the thread's `translateX(-58px)`, revealing every message's time in a 52 wide column at the right (13/13 tertiary, on the page: 5.85 / 7.80). Nothing new is drawn; the times are the `span.time` rows in S-MSG.thread. Desktop has no drag; times appear on hover (S-MSG.thread desktop).

### Phone, 390 × 844 (`#times-phone-light-shot` / `-dark-shot`)

Nothing new over the screens above. See the tables they point to.

At XXL the column is `52 × k` wide (70.3 measured; 52 × 1.353 = 70.4) with no wrap, it sits at `right: -64 × k` (-86.6), and the drag goes to `58 × k` (78.5). "5:52 PM" is one line at XXL: 70.3 × 17.6, 17.59/17.59 (measured on `#times-phone-light-shot-reduce-xxl`, SETTLED-4NOV 9). App: `calc(52 * var(--ch-type-k))`, `calc(-64 * var(--ch-type-k))`, drag `calc(58 * var(--ch-type-k))`.

430 (fixed in v15, `SETTLED-4NOV.md` 30): the hidden column sits at `right: -68 × k` at 430 because the thread padding there is 16, so it starts at x 430, fully out of frame, and the 58 × k drag brings it in to 6 px from the edge, the same as at 390 (measured: revealed times 372 to 424 in the 430 frame, 332 to 384 at 390).

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.times)**, check on both images within 2pt:
1. Drag offset 58 (78.5 at XXL)
2. Time column 52 wide (70.3 at XXL), one line
3. Time text 13/13 400 tertiary (17.59 at XXL)
4. Column right -64 (-86.6 at XXL)

## S-MSG.date-pill: Floating date pill

overlay (added in v12) · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#datepill-phone-light` and `#datepill-desk-light` · local `redesign/clubhouse-messages.html#datepill-phone-light` · app `/clubhouse-preview/messages?state=design&view=datepill` · capture `--id S-MSG.date-pill --state datepill-phone`

Route `datepill` scrolls the team thread to 55% so Thursday's own marker has passed under the bar, and forces the pill on. A glass-strong pill (blur 16 saturate 160) centred at the top of the thread: phone y 74 in shot frames (bar 50 + lip 16 + 8, 04 §4), desktop y 140. It hides 1000 ms after scrolling stops.

### Phone, 390 × 844 (`#datepill-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(mine, first) .col > div.b` | “Qualifier pairings for next week a…” | 278.2 × 99.4, pad 7.5 13, r 19 | 16/21.1 400, -0.005em; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `.pg > div.datepill` | “Thursday” | 77.1 × 24.9, pad 4 10, r 999 | 13/16.9 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  | 03 Conversation: day of the topmost visible message (`dayLabel`) |

### Desktop, 1440 × 900 (`#datepill-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.pg > div.datepill` | “Thursday” | 77.1 × 24.9, pad 4 10, r 999 | 13/16.9 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  | 03 Conversation: day of the topmost visible message (`dayLabel`) |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.date-pill)**, check on both images within 2pt:
1. Pill 77.1 × 24.9, padding 4 10, radius 999
2. Text 13/16.9 500 secondary
3. Phone top 74 (shot), centred

## S-MSG.jump: Jump to latest

control · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#jump-phone-light` and `#jump-desk-light` · local `redesign/clubhouse-messages.html#jump-phone-light` · app `/clubhouse-preview/messages?state=design&view=jump` · capture `--id S-MSG.jump --state jump-phone`

Route `jump` scrolls the team thread to the top and holds the key on with a count of 2. A 40 glass-strong circle (blur 18), arrow-down 19 stroke 2.2, with a count badge 20 × 20 at its top right, count 12/20 700 (SETTLED-4NOV 4; ivory on green, 8.01 light, 5.58 dark). Phone 390: right 14, 12 above the composer (x 336, y 738; composer at 790). Phone 430: right 18 (x 372, y 826).

### Phone, 390 × 844 (`#jump-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.pg > button.jump` |  | 40 × 40, pad 1 6, r 50% |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A | 40×40 ⚠ |  |
| `.jump > svg.ic` | `down` 19, stroke 2.2 | 19 × 19 |  | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** |  |  |
| `.jump > b` | “2” | 20 × 20, pad 0 5, r 999 | 12/20 700, 0; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ThreadBelow` `unseen` |

### Desktop, 1440 × 900 (`#jump-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.pg > button.jump` |  | 40 × 40, pad 1 6, r 50% |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A | 40×40 ⚠ |  |
| `.jump > svg.ic` | `down` 19, stroke 2.2 | 19 × 19 |  | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** |  |  |
| `.jump > b` | “2” | 20 × 20, pad 0 5, r 999 | 12/20 700, 0; wraps | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  | 03 Conversation: `ThreadBelow` `unseen` |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.jump)**, check on both images within 2pt:
1. Key 40 circle
2. Right inset 14 at 390, 18 at 430; 12 above the composer
3. Badge 20 × 20, radius 999
4. Count 12/20 700

## S-MSG.attach: Attach menu

menu · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#attach-phone-light` and `#attach-desk-light` · local `redesign/clubhouse-messages.html#attach-phone-light` · app `/clubhouse-preview/messages?state=design&view=attach` · capture `--id S-MSG.attach --state attach-phone`

The + key turns to × (rotate 45°) and the menu opens above it: Photos, File, Poll only (Nick, 31 Oct: no Camera, no Announcement). Glass-strong with blur 28. Tiles: Photos #2F7D4C → `--ch-attach-photos`, File #7F612A → `--ch-attach-file`, Poll #155A39 → `--ch-attach-poll` (new in PR 11e, same hex in both themes, SETTLED-4NOV 15), each 32 radius 10 with a 17 ivory glyph (stroke 2; 4.92, 5.61, 8.01). Phone: menu at x 12 at 390 and x 16 at 430, its bottom 4 above the composer pill.

### Phone, 390 × 844 (`#attach-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.pg > div.attach` |  | 240 × 150, pad 6, r 22 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `.attach > button` | “Photos” | 228 × 46, pad 6 10, r 15, gap 12 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 228×46 |  |
| `.attach button > span.aic` |  | 32 × 32, r 10 |  | fill literal #2F7D4C → `--ch-attach-photos` (new) | #2F7D4C | #2F7D4C |  |  |
| `.aic > svg.ic` | `image` 17, stroke 2 | 17 × 17 |  | ivory #FDFCF8 on attach tile (`--ch-attach-photos` / `-file` / `-poll`) | #FDFCF8 on #2F7D4C **4.92** | #FDFCF8 on #2F7D4C **4.92** |  |  |
| `.attach > button` | “File” | 228 × 46, pad 6 10, r 15, gap 12 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 228×46 |  |
| `.attach > button` | “Poll” | 228 × 46, pad 6 10, r 15, gap 12 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 228×46 |  |

### Desktop, 1440 × 900 (`#attach-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.pg > div.attach` |  | 240 × 150, pad 6, r 22 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `.attach > button` | “Photos” | 228 × 46, pad 6 10, r 15, gap 12 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 228×46 |  |
| `.attach button > span.aic` |  | 32 × 32, r 10 |  | fill literal #2F7D4C → `--ch-attach-photos` (new) | #2F7D4C | #2F7D4C |  |  |
| `.aic > svg.ic` | `image` 17, stroke 2 | 17 × 17 |  | ivory #FDFCF8 on attach tile (`--ch-attach-photos` / `-file` / `-poll`) | #FDFCF8 on #2F7D4C **4.92** | #FDFCF8 on #2F7D4C **4.92** |  |  |
| `.attach > button` | “File” | 228 × 46, pad 6 10, r 15, gap 12 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 228×46 |  |
| `.attach > button` | “Poll” | 228 × 46, pad 6 10, r 15, gap 12 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 228×46 |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.attach)**, check on both images within 2pt:
1. Menu 240 × 150, padding 6, radius 22
2. Items 228 × 46, padding 6 10, radius 15, gap 12
3. Tile 32, radius 10; glyph 17 stroke 2
4. Item text 15/18 500
5. Menu bottom 4 above the composer

## S-MSG.file: File chip

state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#file-phone-light` and `#file-desk-light` · local `redesign/clubhouse-messages.html#file-phone-light` · app `/clubhouse-preview/messages?state=design&view=file` · capture `--id S-MSG.file --state file-phone`

Route `file` picks "Lineup · Saturday.pdf": a paper chip above the field with a file tile and a remove key, and the send key appears (the field narrows from 318 to 276). The tile's "PDF" letters are 8 px on the page; in the build the tile is an icon (`aria-hidden`) and the type travels in the subtitle at 12+ (04 §8).

### Phone, 390 × 844 (`#file-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.comp__files > span.chip-file` | “Lineup · Saturday.pdf” | 204.5 × 44, pad 6 8 6 6, r 12, gap 8 | 12.5/15 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Conversation: picked file `name` |
| `.chip-file > span.file__ic` | “PDF” | 28 × 32, r 7 | 8/8 700, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-chip-bg` → `--ch-accent` chip tint | #155A39 on #E8EEE8 **6.96** | #7CC79B on #253229 **6.68** |  | 03 Conversation: `mime` (icon only in build, 04 §8) |
| `.chip-file > button.ibtn` |  | 26 × 26, pad 1 6, r 50% |  |  |  |  | 26×26 ⚠ |  |
| `.comp__in > button.comp__send` |  | 36 × 36, pad 1 6, r 50% |  | fill `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #155A39 | #1F6B45 | 36×36 ⚠ |  |
| `.comp__send > svg.ic` | `up` 18, stroke 2.4 | 18 × 18 |  | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  |  |

### Desktop, 1440 × 900 (`#file-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.comp__files > span.chip-file` | “Lineup · Saturday.pdf” | 204.5 × 44, pad 6 8 6 6, r 12, gap 8 | 12.5/15 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Conversation: picked file `name` |
| `.chip-file > span.file__ic` | “PDF” | 28 × 32, r 7 | 8/8 700, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-chip-bg` → `--ch-accent` chip tint | #155A39 on #E8EEE8 **6.96** | #7CC79B on #253229 **6.68** |  | 03 Conversation: `mime` (icon only in build, 04 §8) |
| `.chip-file > button.ibtn` |  | 26 × 26, pad 1 6, r 50% |  |  |  |  | 26×26 ⚠ |  |
| `.comp__in > button.comp__send` |  | 36 × 36, pad 1 6, r 50% |  | fill `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #155A39 | #1F6B45 | 36×36 ⚠ |  |
| `.comp__send > svg.ic` | `up` 18, stroke 2.4 | 18 × 18 |  | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.file)**, check on both images within 2pt:
1. Chip 204.5 × 44, padding 6 8 6 6, radius 12, gap 8
2. Tile 28 × 32, radius 7
3. Remove key 26 (hit to 44)
4. Send key 36, fill `--ch-bubble-mine-fill`, arrow-up 18 stroke 2.4
5. Field 276 wide with the send key

## S-MSG.reply: Reply chip

state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#reply-phone-light` and `#reply-desk-light` · local `redesign/clubhouse-messages.html#reply-phone-light` · app `/clubhouse-preview/messages?state=design&view=reply` · capture `--id S-MSG.reply --state reply-phone`

Route `reply` sets the reply chip quoting e6: "Replying to Eli" with the reply icon 18 and a cancel key, above the field (a state, not the arrival; the arrival is M-MSG-08). Built in PR 11d (SETTLED-4NOV 21). Same chip style as S-MSG.file without the tile: 155.9 × 38.

### Phone, 390 × 844 (`#reply-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.chip-file > svg.ic.sm` | `reply` 18, stroke 1.8 | 18 × 18 |  | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |

### Desktop, 1440 × 900 (`#reply-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.chip-file > svg.ic.sm` | `reply` 18, stroke 1.8 | 18 × 18 |  | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.reply)**, check on both images within 2pt:
1. Chip 155.9 × 38
2. Reply icon 18, stroke 1.8, primary
3. Cancel key 26 (hit to 44)
4. Chip bottom 6 above the composer pill

## S-MSG.edit: Editing a message

state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#edit-phone-light` and `#edit-desk-light` · local `redesign/clubhouse-messages.html#edit-phone-light` · app `/clubhouse-preview/messages?state=design&view=edit` · capture `--id S-MSG.edit --state edit-phone`

Route `edit` sets `editing = 'e9'`, fills the field with e9's text, grows it, shows the send key and sets the edit chip: "Editing message" with the pencil icon 18 (170.5 × 38). The chip's motion is M-MSG-28; the caret is the browser's own (M-MSG-32, no motion row), SETTLED-4NOV 21. Nothing new is measured: the chip is S-MSG.reply's with a different icon and label, the send key is S-MSG.file's, the field is S-MSG.composer's at 276 wide.

### Phone, 390 × 844 (`#edit-phone-light-shot` / `-dark-shot`)

Nothing new over the screens above. See the tables they point to.

### Desktop, 1440 × 900 (`#edit-desk-light-shot` / `-dark-shot`)

Nothing new over the screens above. Desktop: See the tables they point to.

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.edit)**, check on both images within 2pt:
1. Edit chip 170.5 × 38, pencil 18
2. Field 276 wide, send key 36
3. Composer pill 46 tall

## S-MSG.poll-composer: New poll sheet

sheet (drawn) · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#pollnew-phone-light` and `#pollnew-desk-light` · local `redesign/clubhouse-messages.html#pollnew-phone-light` · app `/clubhouse-preview/messages?state=design&view=pollnew` · capture `--id S-MSG.poll-composer --state pollnew-phone`

Route `pollnew` opens the poll composer from the team thread (the poll card behind it is measured here first, so its rows appear in this table). Phone: a bottom sheet 390 wide, top radius 20, grabber 36 × 5; header Cancel / "New poll" / Send; a Question field; a card with "Allow multiple answers" (switch 44 × 26; off it carries a 1.5 inset ring `--a-sw-off` → `--ch-switch-off-ring` (new, PR 11f), #8F8B81 / #827D71, SETTLED-4NOV 11; on stays green) and the close time. Desktop: a centred 400 wide sheet, radius 20.

### Phone, 390 × 844 (`#pollnew-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(mine, first) .col > div.poll` |  | 272 × 282.7, pad 14 14 12, r 20 20 6 |  | fill `--a-recv` → `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 |  |  |
| `(mine, first) .poll > p.poll__q` | “Practice round at Lonnie Poole: wh…” | 244 × 44.2 | 17/22.1 600, -0.01em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Polls: `Poll.question` |
| `(mine, first) .poll > button.opt` |  | 244 × 52.4, pad 8 10, r 12, gap 10 |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 | 244×52 |  |
| `(mine, first) .opt > span.opt__fill` |  | 139.4 × 52.4, r 12 |  | fill `--a-bar` → `--ch-poll-bar` (new) | #E0E5DC | #202D25 |  | 03 Polls: choice count / total (`golf_message_responses`) |
| `(mine, first) .opt > span.opt__ck` |  | 20 × 20, r 50% |  |  |  |  |  | 03 Polls: your row's `choice` |
| `(mine, first) .opt__ck > svg.ic` | `check` 12, stroke 3 | 12 × 12 |  | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** |  | 03 Polls: your row's `choice` |
| `(mine, first) .opt > span` | “Tue 7:30 AM” | 124.2 × 36.4 | 14/18.2 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** |  | 03 Polls: `options[].label` |
| `(mine, first) .opt span > span.lead-chip` | “Most votes” | 75.9 × 19, pad 2 7, r 7 | 12/16.2 600, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-chip-bg` → `--ch-accent` chip tint | #155A39 on #E0E5DC **6.4** | #7CC79B on #202D25 **7.17** |  | 03 Polls: one choice strictly ahead |
| `(mine, first) .opt > span.opt__n` | “4” | 57.8 × 18, gap 6 | 13/13 600, 0, tabular; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-page-2` → `--ch-well-bg-flat` | #46433D on #F6F4EE **8.96** | #D0C9B8 on #141815 **10.87** |  | 03 Polls: rows for that choice; voter faces |
| `(mine, first) .poll__f > span` | “7 votes · Closes Sunday 8 PM” | 171.1 × 16.9 | 13/16.9 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Polls: total rows · `closesAt` / `closedAt` |
| `(mine, first) .poll__f > button` | “See votes” | 60.8 × 24.5, pad 6 2 | 12.5/12.5 600, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #155A39 on #FFFEFB **8.15** | #7CC79B on #232925 **7.42** | 61×25 ⚠ |  |
| `.ovl > div.sheet` |  | 390 × 522.6, r 20 20 0 0 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.sheet > div.sheet__grab` |  | 36 × 5, r 3 |  | fill `--a-hair` → `--ch-separator` | #E8E7E4 | #2F332E |  |  |
| `.sheet__h > button.txtbtn` | “Cancel” | 67 × 33, pad 8 6 | 17/17 500, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 67×33 ⚠ |  |
| `.sheet__h > h4` | “New poll” | 67.1 × 20.4 | 17/20.4 700, -0.015em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.sheet__h > button.txtbtn.strong` | “Send” | 53.5 × 33, pad 8 6 | 17/17 600, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 53×33 ⚠ |  |
| `.sheet__body > label` | “Question” | 358 × 66.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.sheet__body label > input` |  | 358 × 44, pad 10 12, r 12 |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 | 358×44 |  |
| `.sheet__body > div.lcard` |  | 358 × 104, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.lcard > div.pf-row` | “Allow multiple answers” | 358 × 52, pad 8 16, gap 10 | 16/20.8 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.pf-row > span.mute-sw` |  | 44 × 26, r 999 |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 |  |  |
| `.pf-row > b` | “Sunday 8 PM” | 96.5 × 20.8 | 16/20.8 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | poll close time (form value) |

### Desktop, 1440 × 900 (`#pollnew-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(mine, first) .col > div.poll` |  | 330 × 274.3, pad 14 14 12, r 20 20 6 |  | fill `--a-recv` → `--ch-bubble-theirs-bg` (new) | #FFFEFB | #232925 |  |  |
| `(mine, first) .poll > div.poll__h` | “Poll · Choose one” | 302 × 15.6, gap 8 | 13/15.6 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Polls: `Poll.multi` (Choose one / Choose any) |
| `(mine, first) .poll__h > svg.ic` | `poll` 14, stroke 1.8 | 14 × 14 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  |  |
| `(mine, first) .poll > p.poll__q` | “Practice round at Lonnie Poole: wh…” | 302 × 44.2 | 17/22.1 600, -0.01em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Polls: `Poll.question` |
| `(mine, first) .poll > button.opt` |  | 302 × 44, pad 8 10, r 12, gap 10 |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 | 302×44 |  |
| `(mine, first) .opt > span.opt__fill` |  | 172.6 × 44, r 12 |  | fill `--a-bar` → `--ch-poll-bar` (new) | #E0E5DC | #202D25 |  | 03 Polls: choice count / total (`golf_message_responses`) |
| `(mine, first) .opt > span.opt__ck` |  | 20 × 20, r 50% |  |  |  |  |  | 03 Polls: your row's `choice` |
| `(mine, first) .opt__ck > svg.ic` | `check` 12, stroke 3 | 12 × 12 |  | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** |  | 03 Polls: your row's `choice` |
| `(mine, first) .opt > span` | “Tue 7:30 AM” | 182.2 × 18.2 | 14/18.2 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** |  | 03 Polls: `options[].label` |
| `(mine, first) .opt span > span.lead-chip` | “Most votes” | 75.9 × 19, pad 2 7, r 7 | 12/16.2 600, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-chip-bg` → `--ch-accent` chip tint | #155A39 on #E0E5DC **6.4** | #7CC79B on #202D25 **7.17** |  | 03 Polls: one choice strictly ahead |
| `(mine, first) .opt > span.opt__n` | “4” | 57.8 × 18, gap 6 | 13/13 600, 0, tabular; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-page-2` → `--ch-well-bg-flat` | #46433D on #F6F4EE **8.96** | #D0C9B8 on #141815 **10.87** |  | 03 Polls: rows for that choice; voter faces |
| `(mine, first) .poll__f > span` | “7 votes · Closes Sunday 8 PM” | 171.1 × 16.9 | 13/16.9 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Polls: total rows · `closesAt` / `closedAt` |
| `(mine, first) .poll__f > button` | “See votes” | 60.8 × 24.5, pad 6 2 | 12.5/12.5 600, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #155A39 on #FFFEFB **8.15** | #7CC79B on #232925 **7.42** | 61×25 ⚠ |  |
| `.ovl > div.sheet` |  | 400 × 508.6, r 20 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.sheet__h > button.txtbtn` | “Cancel” | 67 × 33, pad 8 6 | 17/17 500, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 67×33 ⚠ |  |
| `.sheet__h > h4` | “New poll” | 67.1 × 20.4 | 17/20.4 700, -0.015em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.sheet__h > button.txtbtn.strong` | “Send” | 53.5 × 33, pad 8 6 | 17/17 600, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 53×33 ⚠ |  |
| `.sheet__body > label` | “Question” | 368 × 66.9 | 13/16.9 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.sheet__body label > input` |  | 368 × 44, pad 10 12, r 12 |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 | 368×44 |  |
| `.sheet__body > div.lcard` |  | 368 × 104, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.lcard > div.pf-row` | “Allow multiple answers” | 368 × 52, pad 8 16, gap 10 | 16/20.8 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.pf-row > span.mute-sw` |  | 44 × 26, r 999 |  | fill `--a-page-2` → `--ch-well-bg-flat` | #F6F4EE | #141815 |  |  |
| `.pf-row > b` | “Sunday 8 PM” | 96.5 × 20.8 | 16/20.8 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | poll close time (form value) |

Poll card (also S-MSG.poll): 272 wide on phone (330 desktop), padding 14 14 12, radius 20 20 6 (the mine tail corner); option wells 244 wide, padding 8 10, radius 12, 44 tall with one line and 52.4 tall when the "Most votes" chip wraps the label to two lines (phone); check ring 20; bar fill `--ch-poll-bar` (yours `--ch-poll-bar-on`); count 13/13 600 tabular with up to three 18 voter faces.

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.poll-composer)**, check on both images within 2pt:
1. Sheet 390 wide (phone), radius 20 20 0 0; desktop 400, radius 20
2. Grabber 36 × 5, radius 3
3. Header buttons 17/17: Cancel 500, Send 600
4. Field 358 × 44, padding 10 12, radius 12
5. Option row 52 tall, switch 44 × 26
6. Poll card padding 14 14 12, radius 20 20 6
7. Option 44 tall (52.4 when two lines), radius 12

## S-MSG.hold: Hold a message

overlay · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#hold-phone-light` and `#hold-desk-light` · local `redesign/clubhouse-messages.html#hold-phone-light` · app `/clubhouse-preview/messages?state=design&view=hold` · capture `--id S-MSG.hold --state hold-phone`

Route `hold` opens the hold on e6 (theirs): the bubble lifts over the blurred thread (scrim `--a-scrim` with `backdrop-filter: blur(14px) saturate(120%)`), the reaction bar above it and the menu below. Reaction bar keys: Like, Love, Laugh, Celebrate, Surprised, Thanks (`RX`). Menu for theirs: Reply, Copy, each with a 19 icon at the right. Hold slop: the page cancels past 8px; the build keeps today's 10px (04 §6). This is not an error.

### Phone, 390 × 844 (`#hold-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.ovl > div.rbar` |  | 260 × 50, pad 5, r 999, gap 2 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar button > svg.ic` | `like` 22, stroke 1.8 | 22 × 22 |  | `--a-accent-text` → `--ch-accent` on `--a-glass-strong` → glass-strong | #155A39 on #FCFAF6 **7.88** | #7CC79B on #191E1A **8.42** |  |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.menu > button` | “Reply” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu button > svg.ic` | `reply` 19, stroke 1.8 | 19 × 19 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  |  |
| `.menu > button` | “Copy” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |

### Desktop, 1440 × 900 (`#hold-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.ovl > div.rbar` |  | 260 × 50, pad 5, r 999, gap 2 |  | fill `--a-glass-strong` → glass-strong | #FCFAF6 | #191E1A |  |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar button > svg.ic` | `like` 22, stroke 1.8 | 22 × 22 |  | `--a-accent-text` → `--ch-accent` on `--a-glass-strong` → glass-strong | #155A39 on #FCFAF6 **7.88** | #7CC79B on #191E1A **8.42** |  |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.rbar > button` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.menu > button` | “Reply” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu button > svg.ic` | `reply` 19, stroke 1.8 | 19 × 19 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  |  |
| `.menu > button` | “Copy” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.hold)**, check on both images within 2pt:
1. Reaction bar 260 × 50, padding 5, radius 999, gap 2
2. Keys 40, icons 22
3. Menu 236 wide, items 224 × 42, radius 12
4. Menu icon 19 at the right
5. Bar at x 12 on phone

## S-MSG.holdseen: Hold your group message (Seen by row)

overlay · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#holdseen-phone-light` and `#holdseen-desk-light` · local `redesign/clubhouse-messages.html#holdseen-phone-light` · app `/clubhouse-preview/messages?state=design&view=holdseen` · capture `--id S-MSG.holdseen --state holdseen-phone`

Route `holdseen` holds t6 (yours) in the team thread as a coach: the menu gains Edit, a Seen by row (title, eye icon, six 20 faces, "8 of 10 · 2 not yet") and Delete in `--ch-flag` with the trash icon. Rows are separated by `hr` hairlines.

### Phone, 390 × 844 (`#holdseen-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.menu > button` | “Edit” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button.seenrow` |  | 224 × 83.6, pad 8 12, r 12, gap 6 |  |  |  |  | 224×84 |  |
| `.seenrow > span` | “Seen by” | 200 × 19 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** |  |  |
| `.seenrow span > svg.ic` | `eye` 19, stroke 1.8 | 19 × 19 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  |  |
| `.seenrow > small` | “8 of 10 · 2 not yet” | 97.5 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  | 03 Conversation: seen of members · not yet (`ChReceipts`) |
| `.menu > button.danger` | “Delete” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-danger` → `--ch-flag` on `--a-glass-strong` → glass-strong | #B3261E on #FCFAF6 **6.26** | #F28B7D on #191E1A **7.03** | 224×42 ⚠ |  |
| `.danger > svg.ic` | `trash` 19, stroke 1.8 | 19 × 19 |  | `--a-danger` → `--ch-flag` on `--a-glass-strong` → glass-strong | #B3261E on #FCFAF6 **6.26** | #F28B7D on #191E1A **7.03** |  |  |

### Desktop, 1440 × 900 (`#holdseen-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.menu > button` | “Edit” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button.seenrow` |  | 224 × 83.6, pad 8 12, r 12, gap 6 |  |  |  |  | 224×84 |  |
| `.seenrow > span` | “Seen by” | 200 × 19 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** |  |  |
| `.seenrow span > svg.ic` | `eye` 19, stroke 1.8 | 19 × 19 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  |  |
| `.seenrow > small` | “8 of 10 · 2 not yet” | 97.5 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-glass-strong` → glass-strong | #46433D on #FCFAF6 **9.44** | #D0C9B8 on #191E1A **10.21** |  | 03 Conversation: seen of members · not yet (`ChReceipts`) |
| `.menu > button.danger` | “Delete” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-danger` → `--ch-flag` on `--a-glass-strong` → glass-strong | #B3261E on #FCFAF6 **6.26** | #F28B7D on #191E1A **7.03** | 224×42 ⚠ |  |
| `.danger > svg.ic` | `trash` 19, stroke 1.8 | 19 × 19 |  | `--a-danger` → `--ch-flag` on `--a-glass-strong` → glass-strong | #B3261E on #FCFAF6 **6.26** | #F28B7D on #191E1A **7.03** |  |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.holdseen)**, check on both images within 2pt:
1. Seen by row 224 × 83.6, gap 6
2. Faces 20 in the row (colour only in build)
3. Line "8 of 10 · 2 not yet" 13/15.6 500
4. Delete 15/18 500 flag, trash 19

## S-MSG.react: Your reaction badge

state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#react-phone-light` and `#react-desk-light` · local `redesign/clubhouse-messages.html#react-phone-light` · app `/clubhouse-preview/messages?state=design&view=react` · capture `--id S-MSG.react --state react-phone`

Route `react` adds your Love to e6. The badge at the bubble's top outer corner is `--ch-bubble-mine-fill` with an ivory heart (your own reaction), a 4 page-colour halo (`box-shadow: 0 0 0 4px var(--a-page)`) and a 2 champagne ring, offset 1, `--a-ring` → `--ch-ring-own` (new, PR 11d): #8C703A light, #C9AD74 dark (SETTLED-4NOV 3). The ring sits inside the halo, so it is always read against the page: 4.10 light, 8.73 dark, on paper and on your green bubble alike. The same ring is the bubble focus ring (2, offset 3).

### Phone, 390 × 844 (`#react-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(theirs, joins above, joins below, has reactions) .col > div.b` | “Hit 7 of 9 greens. The wedge ladde…” | 278.2 × 57.2, pad 7.5 13, r 6 19 19 6 | 16/21.1 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, joins above, joins below, has reactions) .rx > span.me` |  | 26 × 26, pad 0 6, r 999, gap 3 |  | fill `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #155A39 | #1F6B45 |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(theirs, joins above, joins below, has reactions) .me > svg.ic` | `love` 14, stroke 2 | 14 × 14 |  | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  |  |

### Desktop, 1440 × 900 (`#react-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(theirs, joins above, joins below, has reactions) .col > div.b` | “Hit 7 of 9 greens. The wedge ladde…” | 366.3 × 34.8, pad 7.5 13, r 6 19 19 6 | 15/19.8 400, -0.005em; wraps | `--a-ink` → `--ch-text-primary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #232925 **12.58** |  | 03 Conversation: `ChMsg.text` (`MessageText`) |
| `(theirs, joins above, joins below, has reactions) .rx > span.me` |  | 26 × 26, pad 0 6, r 999, gap 3 |  | fill `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #155A39 | #1F6B45 |  | 03 Conversation: `reactions.get(id)`; number when count > 1; `mine` ring |
| `(theirs, joins above, joins below, has reactions) .me > svg.ic` | `love` 14, stroke 2 | 14 × 14 |  | `--a-sent-ink` → `--ch-text-on-accent` on `--a-sent-b` → `--ch-bubble-mine-fill` (new) | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** |  |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.react)**, check on both images within 2pt:
1. Badge 26 × 26, radius 999
2. Icon 14, stroke 2
3. At top −14, right −10 (theirs bubble)
4. Halo 4 in the page colour
5. Ring 2, offset 1, #8C703A / #C9AD74

## S-MSG.seen: Seen by sheet

sheet · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#seen-phone-light` and `#seen-desk-light` · local `redesign/clubhouse-messages.html#seen-phone-light` · app `/clubhouse-preview/messages?state=design&view=seen` · capture `--id S-MSG.seen --state seen-phone`

Route `seen` sets five readers on t6 and opens the sheet: title "Seen by", a line "5 of 10 · " and the message's first 46 characters, a close key (40 × 40, `flex: none`, SETTLED-4NOV 10), then a Seen group with each member's read time and a Not seen yet group ("Hasn't opened this chat"). "5 of 10" is a count of readers, not a figure, so SHARED-11 is untouched (SETTLED-4NOV 18). Phone: bottom sheet; desktop: centred 400 card.

### Phone, 390 × 844 (`#seen-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.sheet__h div > h4` | “Seen by” | 304 × 20.4 | 17/20.4 700, -0.015em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.sheet__h div > p` | “5 of 10 · Van leaves the field hou…” | 304 × 39 | 15/19.5 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: seen of total · message text (46 chars) |
| `.sheet__h > button.ibtn.solid` |  | 40 × 40, pad 1 6, r 50% |  | fill `--a-glass-strong` → glass-strong | #FDFBF7 | #1B201C | 40×40 ⚠ |  |
| `.sheet__body > div.vgroup` |  | 358 × 306.1, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.vgroup h5 > span` | “Seen” | 40 × 22.1 | 17/22.1 600, -0.01em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | group title (Seen / Not seen yet) |
| `.vgroup h5 > small` | “5” | 8.6 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: Seen count (`ChReceipts.marks`) |
| `.li > span.r` | “7:06 AM” | 49.6 × 15.6 | 13/15.6 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-surface` → `--ch-card-bg` | #5F5C55 on #FFFEFB **6.61** | #ADA697 on #191E1A **6.99** |  | 03 Conversation: `railTime` of each `last_read_at` |

### Desktop, 1440 × 900 (`#seen-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.sheet__h div > h4` | “Seen by” | 314 × 20.4 | 17/20.4 700, -0.015em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.sheet__h div > p` | “5 of 10 · Van leaves the field hou…” | 314 × 39 | 15/19.5 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: seen of total · message text (46 chars) |
| `.sheet__h > button.ibtn.solid` |  | 40 × 40, pad 1 6, r 50% |  | fill `--a-glass-strong` → glass-strong | #FDFBF7 | #1B201C | 40×40 ⚠ |  |
| `.sheet__body > div.vgroup` |  | 368 × 306.1, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.vgroup h5 > span` | “Seen” | 40 × 22.1 | 17/22.1 600, -0.01em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | group title (Seen / Not seen yet) |
| `.vgroup h5 > small` | “5” | 8.6 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Conversation: Seen count (`ChReceipts.marks`) |
| `.li > span.r` | “7:06 AM” | 49.6 × 15.6 | 13/15.6 400, 0; 1 line | `--a-ink-3` → `--ch-text-tertiary` on `--a-surface` → `--ch-card-bg` | #5F5C55 on #FFFEFB **6.61** | #ADA697 on #191E1A **6.99** |  | 03 Conversation: `railTime` of each `last_read_at` |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.seen)**, check on both images within 2pt:
1. Title 17/20.4 700
2. Line 15/19.5 500, two lines (39 tall)
3. Close key 40 × 40, `flex: none` (44 target by `::before`)
4. Group card 358 wide, radius 16
5. Group title 17/22.1 600, count 15/19.9
6. Time at right 13/15.6 tertiary

## S-MSG.poll: Poll card

card · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#poll-phone-light` and `#poll-desk-light` · local `redesign/clubhouse-messages.html#poll-phone-light` · app `/clubhouse-preview/messages?state=design&view=poll` · capture `--id S-MSG.poll --state poll-phone`

Route `poll` builds the team thread and centres the poll. Its body was measured with S-MSG.poll-composer (the first route that showed it); this adds the header "Poll · Choose one" with the poll icon 14. The page's base CSS sets the header to 11 px uppercase champagne; d-extra wins: 13/15.6 600 sentence case in `--ch-text-secondary`.

### Phone, 390 × 844 (`#poll-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `(mine, first) .poll > div.poll__h` | “Poll · Choose one” | 244 × 15.6, gap 8 | 13/15.6 600, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  | 03 Polls: `Poll.multi` (Choose one / Choose any) |
| `(mine, first) .poll__h > svg.ic` | `poll` 14, stroke 1.8 | 14 × 14 |  | `--a-ink-2` → `--ch-text-secondary` on `--a-recv` → `--ch-bubble-theirs-bg` (new) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** |  |  |

### Desktop, 1440 × 900 (`#poll-desk-light-shot` / `-dark-shot`)

Nothing new over the screens above. Desktop: See the tables they point to.

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.poll)**, check on both images within 2pt:
1. Header 13/15.6 600, icon 14, gap 8
2. Card padding 14 14 12, radius 20 20 6
3. Option 44 tall, radius 12
4. Question 17/22.1 600

## S-MSG.votes: See votes sheet

sheet · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#votes-phone-light` and `#votes-desk-light` · local `redesign/clubhouse-messages.html#votes-phone-light` · app `/clubhouse-preview/messages?state=design&view=votes` · capture `--id S-MSG.votes --state votes-phone`

Route `votes` opens See votes on t2: groups by choice, each with a title, "4 · 57%" and a 3 tall accent bar under the heading whose width is the share; voters as `.li` rows (face 32); then not-voted. Desktop adds a footer text button "Draft a reminder". Sheet chrome as S-MSG.seen.

### Phone, 390 × 844 (`#votes-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.vgroup h5 > i.bar` |  | 204 × 3, r 0 3 3 0 |  | fill `--a-accent-text` → `--ch-accent` | #155A39 | #7CC79B |  | 03 Polls: group count / total votes |

### Desktop, 1440 × 900 (`#votes-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.vgroup h5 > i.bar` |  | 209.8 × 3, r 0 3 3 0 |  | fill `--a-accent-text` → `--ch-accent` | #155A39 | #7CC79B |  | 03 Polls: group count / total votes |
| `.vfoot > button.txtbtn` | “Draft a reminder” | 141.8 × 33, pad 8 6 | 17/17 500, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 142×33 ⚠ |  |

### Large phone 430, XXL, desktop 1280

Large phone 430: sheet 430 × 727, groups 390 wide at x 20, share bar 222.3 for 57%. XXL: title 23/27.6, line 20.3/26.4 (two lines, 52.8 tall), group title 23/29.9, voter name 19.62/24.5, group card 296 tall; the close key stays 40 × 40 (`flex: none`, 44 target). Desktop 1280: the sheet stays 400, centred on the workspace (x 552 at 1280, 632 at 1440), 642.9 tall (724.9 at 1440).

Phone variants (light; dark is the same geometry):

| Element | Sample | 390 default: x, w × h, type | 430: x, w × h | XXL (×1.353): w × h, type |
|---|---|---|---|---|
| `.tbar > button.who` |  | x 70, 220.2 × 41 | x 70, 220.2 × 41 | 278.8 × 53.7 |
| `.ovl > div.sheet` |  | x 0, 390 × 658.3 | x 0, 430 × 727 | 390 × 658.3 |
| `.sheet > div.sheet__grab` |  | x 177, 36 × 5 | x 197, 36 × 5 | 36 × 5 |
| `.sheet__h div > h4` | Votes | x 18, 296.7 × 20.4, 17/20.4 | x 18, 296.7 × 20.4 | 304 × 27.6, 23/27.6 |
| `.sheet__h div > p` | Practice round at Lonn | x 18, 296.7 × 19.5, 15/19.5 | x 18, 296.7 × 19.5 | 304 × 52.8, 20.3/26.4 |
| `.sheet__h > button.ibtn.solid` |  | x 332, 40 × 40 | x 372, 40 × 40 | 40 × 40 |
| `.sheet__body > div.vgroup` |  | x 16, 358 × 254.1 | x 20, 390 × 254.1 | 358 × 296 |
| `.vgroup h5 > span` | Tue 7:30 AM | x 32, 96.3 × 22.1, 17/22.1 | x 36, 96.3 × 22.1 | 130.2 × 29.9, 23/29.9 |
| `.vgroup h5 > small` | 4 · 57% | x 313, 44.8 × 19.9, 15/20 | x 349, 44.8 × 19.9 | 60.6 × 27, 20.3/27 |
| `.vgroup h5 > i.bar` |  | x 16, 204 × 3 | x 20, 222.3 × 3 | 204 × 3 |
| `.li > span.av` | MO | x 32, 32 × 32, 12.2/12.2 | x 36, 32 × 32 | 32 × 32, 12.2/12.2 |
| `.li span > b` | Maya Ortiz | x 76, 270 × 18.1, 14.5/18.1 | x 80, 302 × 18.1 | 270 × 24.5, 19.6/24.5 |
| `.li span > small` | Senior | x 76, 270 × 16.3, 13/16.3 | x 80, 302 × 16.3 | 270 × 22, 17.6/22 |

Desktop variants (light):

| Element | Sample | 1440: x, w × h | 1280: x, w × h |
|---|---|---|---|
| `.tbar > button.who` |  | x 566, 770 × 36 | x 566, 610 × 36 |
| `.ovl > div.sheet` |  | x 632, 400 × 724.9 | x 552, 400 × 642.9 |

**Redline (S-MSG.votes)**, check on both images within 2pt:
1. Share bar 3 tall, radius 0 3 3 0, width = share (204 for 57% on phone)
2. Group card 358 wide (368 desktop)
3. Voter row face 32, name 14.5/18.1 600
4. Desktop sheet 400 wide, centred on the workspace
5. Footer "Draft a reminder" 17/17 500 accent

## S-MSG.toast: Toast

toast (added in v12) · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#toast-phone-light` and `#toast-desk-light` · local `redesign/clubhouse-messages.html#toast-phone-light` · app `/clubhouse-preview/messages?state=design&view=toast` · capture `--id S-MSG.toast --state toast-phone`

Route `toast` builds Eli's thread and adds the "Copied" toast. A glass-strong pill (blur 18) centred at the top: phone y 58 in shot frames (8 under the 50 bar; app `env(safe-area-inset-top) + 8` per 04 §4, which the shot frame doesn't model), desktop y 26 in the workspace. Auto-fades at 1700 ms (07).

### Phone, 390 × 844 (`#toast-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.phone__scr > div.toast` | “Copied” | 72.4 × 31, pad 9 14, r 999 | 13/13 600, 0; 1 line | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** |  |  |

### Desktop, 1440 × 900 (`#toast-desk-light-shot` / `-dark-shot`)

Nothing new over the screens above. Desktop: See the tables they point to.

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.toast)**, check on both images within 2pt:
1. Toast 72.4 × 31, padding 9 14, radius 999
2. Text 13/13 600 primary
3. Centred; phone y 58 (shot)

## S-MSG.details: Conversation details (Eli)

sub page / desktop column · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#details-phone-light` and `#details-desk-light` · local `redesign/clubhouse-messages.html#details-phone-light` · app `/clubhouse-preview/messages?state=design&view=details` · capture `--id S-MSG.details --state details-phone`

Phone: a pushed page with the green bar's Back (champagne link) and title "Details"; header (face 84, name, role · team; ruled the screen's large title and context line, allowed on the page by SHARED-2, SETTLED-4NOV 7), four quick actions (Mute, Search, Files, Profile), Class status card (coach only), Photos and files. Profile shows only to a coach viewer: for a player it would link to a teammate's stats (SHARED-11, SETTLED-4NOV 20). Desktop: the 300 column at the right of the thread, with a close key; face 64, name 18, actions 62 wide.

### Phone, 390 × 844 (`#details-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.dhead > span.av` | “EB” | 84 × 84, r 50% | 31.9/31.9 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #3A6580 **6.1** | #FDFCF8 on #3A6580 **6.1** |  | 03 Details: `convAvatarId` |
| `.dhead > h4` | “Eli Brandt” | 97.3 × 25.3 | 22/25.3 700, -0.02em; wraps | `--a-ink` → `--ch-text-primary` on `--a-page` → `--ch-grouped-bg` | #1C1B18 on #F2F0E9 **15.1** | #F1ECDF on #0E120F **16.01** |  | 03 Details: `ChConv.title` |
| `.dhead > p` | “Junior · Demo University Golf” | 196.6 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-page` → `--ch-grouped-bg` | #46433D on #F2F0E9 **8.64** | #D0C9B8 on #0E120F **11.45** |  | 03 Details: role · team, or "Group · N members" |
| `.dacts > button.dact` |  | 83.5 × 59.6, pad 10 2 9, r 14, gap 5 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A | 84×60 |  |
| `.dact > svg.ic` | `bell` 20, stroke 1.8 | 20 × 20 |  | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `.dact > span` | “Mute” | 31.7 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Details: `mute` (`ChMute`) |
| `.dact > span` | “Search” | 42.2 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.dact > span` | “Files” | 27.8 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.dact > span` | “Profile” | 39.6 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.scroll > div.grp-card` |  | 358 × 112.6, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.grp-card > h5` | “Class status” | 358 × 46.1, pad 14 16 10, gap 10 | 17/22.1 600, -0.01em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.grp-card > div.class-st` | “No classes today. Next: Monday 9:0…” | 358 × 66.5, pad 12 16 14, gap 10 | 15/20.3 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Details: `classDay` (coach only, P-10) |
| `.class-st > i` |  | 9 × 9, r 50% |  | fill `--a-accent-text` → `--ch-accent` | #155A39 | #7CC79B |  | 03 Details: `classDay` (coach only, P-10) |
| `.grp-card h5 > span.link` | “See all” | 45 × 19.9 | 15/20 500, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `.media > i` |  | 108.7 × 108.7, r 10 |  |  |  |  |  | 03 Details: `files(conversationId)` images |
| `.li > span.li-ic` |  | 32 × 32, r 9 |  | fill `--a-chip-bg` → `--ch-accent` chip tint | #E8EEE8 | #253229 |  | 03 Details: `ChFile` (non-image) |
| `.li-ic > svg.ic` | `file` 17, stroke 1.8 | 17 × 17 |  | `--a-accent-text` → `--ch-accent` on `--a-chip-bg` → `--ch-accent` chip tint | #155A39 on #E8EEE8 **6.96** | #7CC79B on #253229 **6.68** |  | 03 Details: `ChFile` (non-image) |
| `.pback > svg.ic` | `back` 24, stroke 1.8 | 24 × 24 |  | `--a-champ-link` → PhoneBar back link on `--a-frame` → `--ch-frame` | #DCCDA6 on #0A331F **8.85** | #CDBB8E on #08150E **9.87** |  |  |

### Desktop, 1440 × 900 (`#details-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.d-close > button.ibtn` |  | 40 × 40, pad 1 6, r 50% |  |  |  |  | 40×40 ⚠ |  |
| `.dhead > span.av` | “EB” | 64 × 64, r 50% | 24.3/24.3 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #3A6580 **6.1** | #FDFCF8 on #3A6580 **6.1** |  | 03 Details: `convAvatarId` |
| `.dhead > h4` | “Eli Brandt” | 79.6 × 20.7 | 18/20.7 700, -0.02em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Details: `ChConv.title` |
| `.dhead > p` | “Junior · Demo University Golf” | 196.6 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Details: role · team, or "Group · N members" |
| `.dacts > button.dact` |  | 62 × 59.6, pad 10 2 9, r 14, gap 5 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A | 62×60 |  |
| `.dact > svg.ic` | `bell` 20, stroke 1.8 | 20 × 20 |  | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `.dact > span` | “Mute” | 31.7 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Details: `mute` (`ChMute`) |
| `.dact > span` | “Search” | 42.2 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.dact > span` | “Files” | 27.8 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.dact > span` | “Profile” | 39.6 × 15.6 | 13/15.6 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  |  |
| `.scroll > div.grp-card` |  | 272 × 112.6, r 16 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.grp-card > h5` | “Class status” | 272 × 46.1, pad 14 16 10, gap 10 | 17/22.1 600, -0.01em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  |  |
| `.grp-card > div.class-st` | “No classes today. Next: Monday 9:0…” | 272 × 66.5, pad 12 16 14, gap 10 | 15/20.3 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Details: `classDay` (coach only, P-10) |
| `.class-st > i` |  | 9 × 9, r 50% |  | fill `--a-accent-text` → `--ch-accent` | #155A39 | #7CC79B |  | 03 Details: `classDay` (coach only, P-10) |
| `.grp-card h5 > span.link` | “See all” | 45 × 19.9 | 15/20 500, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** |  |  |
| `.media > i` |  | 80 × 80, r 10 |  |  |  |  |  | 03 Details: `files(conversationId)` images |
| `.li > span.li-ic` |  | 32 × 32, r 9 |  | fill `--a-chip-bg` → `--ch-accent` chip tint | #E8EEE8 | #253229 |  | 03 Details: `ChFile` (non-image) |
| `.li-ic > svg.ic` | `file` 17, stroke 1.8 | 17 × 17 |  | `--a-accent-text` → `--ch-accent` on `--a-chip-bg` → `--ch-accent` chip tint | #155A39 on #E8EEE8 **6.96** | #7CC79B on #253229 **6.68** |  | 03 Details: `ChFile` (non-image) |

### Large phone 430, XXL, desktop 1280

Large phone 430: edge 20; quick actions 91.5 wide (4 across, gap 8), cards 390, media tiles 119.3. XXL: name 29.77/34.2, line 20.3/27, action labels 17.59 and actions 65.1 tall, card title row 53.9, class status 80.8 tall; faces and tiles do not grow. Desktop 1280: the details column stays 300 (content 272); the thread column between rail and details is 420, so bubbles cap at 262.1 (72% of 364).

Phone variants (light; dark is the same geometry):

| Element | Sample | 390 default: x, w × h, type | 430: x, w × h | XXL (×1.353): w × h, type |
|---|---|---|---|---|
| `.dhead > span.av` | EB | x 153, 84 × 84, 31.9/31.9 | x 173, 84 × 84 | 84 × 84, 31.9/31.9 |
| `.dhead > h4` | Eli Brandt | x 146, 97.3 × 25.3, 22/25.3 | x 166, 97.3 × 25.3 | 131.6 × 34.2, 29.8/34.2 |
| `.dhead > p` | Junior · Demo Universi | x 97, 196.6 × 19.9, 15/20 | x 117, 196.6 × 19.9 | 265.9 × 27, 20.3/27 |
| `.dacts > button.dact` |  | x 16, 83.5 × 59.6 | x 20, 91.5 × 59.6 | 83.5 × 65.1 |
| `.dact > svg.ic` |  | x 48, 20 × 20 | x 56, 20 × 20 | 20 × 20 |
| `.dact > span` | Mute | x 42, 31.7 × 15.6, 13/15.6 | x 50, 31.7 × 15.6 | 42.9 × 21.1, 17.6/21.1 |
| `.dact > span` | Search | x 128, 42.2 × 15.6, 13/15.6 | x 144, 42.2 × 15.6 | 57.1 × 21.1, 17.6/21.1 |
| `.dact > span` | Files | x 227, 27.8 × 15.6, 13/15.6 | x 251, 27.8 × 15.6 | 37.5 × 21.1, 17.6/21.1 |
| `.dact > span` | Profile | x 312, 39.6 × 15.6, 13/15.6 | x 344, 39.6 × 15.6 | 53.5 × 21.1, 17.6/21.1 |
| `.scroll > div.grp-card` |  | x 16, 358 × 112.6 | x 20, 390 × 112.6 | 358 × 134.7 |
| `.grp-card > h5` | Class status | x 16, 358 × 46.1, 17/22.1 | x 20, 390 × 46.1 | 358 × 53.9, 23/29.9 |
| `.grp-card > div.class-st` | No classes today. Next | x 16, 358 × 66.5, 15/20.3 | x 20, 390 × 66.5 | 358 × 80.8, 20.3/27.4 |
| `.class-st > i` |  | x 32, 9 × 9 | x 36, 9 × 9 | 9 × 9 |
| `.grp-card h5 > span.link` | See all | x 313, 45 × 19.9, 15/20 | x 349, 45 × 19.9 | 60.9 × 27, 20.3/27 |
| `.media > i` |  | x 28, 108.7 × 108.7 | x 32, 119.3 × 119.3 | 108.7 × 108.7 |
| `.li > span.li-ic` |  | x 32, 32 × 32 | x 36, 32 × 32 | 32 × 32 |

Desktop variants (light):

| Element | Sample | 1440: x, w × h | 1280: x, w × h |
|---|---|---|---|
| `(theirs, first) .col > div.b` | Coach, could we move m | x 580, 377.3 × 54.6 | x 580, 262.1 × 54.6 |
| `(mine, joins above, has reactions) .col > div.b` | Bring the 52 and the 5 | x 731, 372.7 × 34.8 | x 682, 262.1 × 54.6 |
| `(theirs, first, joins below) .col > div.b` | Played the back nine a | x 580, 362.4 × 34.8 | x 580, 262.1 × 54.6 |
| `(theirs, joins above, joins below) .col > div.b` | Hit 7 of 9 greens. The | x 580, 366.3 × 34.8 | x 580, 262.1 × 54.6 |
| `(mine, first, joins below, has reactions) .col > div.b` | That’s the round we’ve | x 816, 287.5 × 34.8 | x 682, 262.1 × 54.6 |
| `(mine, joins above) .col > div.b` | Send me the card when  | x 827, 276.9 × 34.8 | x 682, 262.1 × 54.6 |
| `.tbar > button.who` |  | x 566, 470 × 36 | x 566, 310 × 36 |
| `.comp > div.comp__in` |  | x 580, 524 × 46.1 | x 580, 364 × 46.1 |
| `.comp__in > textarea.comp__ta` |  | x 627, 472 × 36.1 | x 627, 312 × 36.1 |

**Redline (S-MSG.details)**, check on both images within 2pt:
1. Face 84 (phone) / 64 (desktop)
2. Name 22/25.3 700 (desktop 18/20.7)
3. Quick actions 4 across, 83.5 × 59.6 (desktop 62), radius 14
4. Action icon 20, label 13/15.6 500
5. Card 358 wide (272 desktop), title row 46.1
6. Media tile 108.7 (80 desktop), radius 10
7. File icon tile 32, radius 9

## S-MSG.groupdetails: Team details (members)

sub page · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#groupdetails-phone-light` and `#groupdetails-desk-light` · local `redesign/clubhouse-messages.html#groupdetails-phone-light` · app `/clubhouse-preview/messages?state=design&view=groupdetails` · capture `--id S-MSG.groupdetails --state groupdetails-phone`

Route `groupdetails` builds details for the team channel: group face 84 (64 desktop) with the flag icon, Members card with the count "11", rows with Coach chips, and "Show all 11" at the foot. Captain chip not drawn (no field).

### Phone, 390 × 844 (`#groupdetails-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.dhead > span.av.grp` |  | 84 × 84, r 50% |  |  |  |  |  | 03 Details: `convAvatarId` |
| `.grp-card h5 > span` | “11” | 11.6 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Details: `members.length` |
| `.li > span.tag` | “Coach” | 50.7 × 20.2, pad 2 7, r 7 | 12/16.2 600, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-chip-bg` → `--ch-accent` chip tint | #155A39 on #E8EEE8 **6.96** | #7CC79B on #253229 **6.68** |  | 03 Details: `role = 'coach'` |
| `.grp-card > button.more` | “Show all 11” | 358 × 44, pad 12 16 14 | 15/18 500, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 358×44 | 03 Details: `members.length` |

### Desktop, 1440 × 900 (`#groupdetails-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.dhead > span.av.grp` |  | 64 × 64, r 50% |  |  |  |  |  | 03 Details: `convAvatarId` |
| `.grp-card h5 > span` | “11” | 11.6 × 19.9 | 15/20 400, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Details: `members.length` |
| `.li > span.tag` | “Coach” | 50.7 × 20.2, pad 2 7, r 7 | 12/16.2 600, 0; 1 line | `--a-accent-text` → `--ch-accent` on `--a-chip-bg` → `--ch-accent` chip tint | #155A39 on #E8EEE8 **6.96** | #7CC79B on #253229 **6.68** |  | 03 Details: `role = 'coach'` |
| `.grp-card > button.more` | “Show all 11” | 272 × 44, pad 12 16 14 | 15/18 500, 0; wraps | `--a-accent-text` → `--ch-accent` on `--a-surface` → `--ch-card-bg` | #155A39 on #FFFEFB **8.15** | #7CC79B on #191E1A **8.45** | 272×44 | 03 Details: `members.length` |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.groupdetails)**, check on both images within 2pt:
1. Coach chip 50.7 × 20.2, padding 2 7, radius 7, 12/16.2 600
2. "Show all 11" 358 × 44, padding 12 16 14
3. Members count 15/19.9 secondary

## S-MSG.mute: Mute menu

menu · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#mute-phone-light` and `#mute-desk-light` · local `redesign/clubhouse-messages.html#mute-phone-light` · app `/clubhouse-preview/messages?state=design&view=mute` · capture `--id S-MSG.mute --state mute-phone`

Route `mute` opens the mute flow from the team details' Mute action: a glass menu "For 8 hours", "For a week", "Until I turn it on". Build ships today's labels: Mute 8 hours, Mute a week, Until I turn it on (04 §8), checked against today's source strings by a test (SETTLED-4NOV 19). Menu chrome as S-MSG.row-menu.

### Phone, 390 × 844 (`#mute-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.menu > button` | “For 8 hours” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “For a week” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “Until I turn it on” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |

### Desktop, 1440 × 900 (`#mute-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.menu > button` | “For 8 hours” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “For a week” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |
| `.menu > button` | “Until I turn it on” | 224 × 42, pad 8 12, r 12, gap 10 | 15/18 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-glass-strong` → glass-strong | #1C1B18 on #FCFAF6 **16.5** | #F1ECDF on #191E1A **14.28** | 224×42 ⚠ |  |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.mute)**, check on both images within 2pt:
1. Items 224 × 42
2. Text 15/18 500
3. Menu 236 wide, radius 18

## S-MSG.fresh: New conversation (Jack)

state · design `https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev#fresh-phone-light` and `#fresh-desk-light` · local `redesign/clubhouse-messages.html#fresh-phone-light` · app `/clubhouse-preview/messages?state=design&view=fresh` · capture `--id S-MSG.fresh --state fresh-phone`

Route `fresh` opens an empty thread with Jack Liu: a hello card with face 72, name, "Freshman · No messages yet", and three starter chips that fill the field only.

### Phone, 390 × 844 (`#fresh-phone-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.msgs > div.hello` |  | 366 × 300.7, pad 22 16 18, r 16, gap 8 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.hello > span.av` | “JL” | 72 × 72, r 50% | 27.4/27.4 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #634C82 **7.09** | #FDFCF8 on #634C82 **7.09** |  | 03 Empty and new: the new conversation's person |
| `.hello > b` | “Jack Liu” | 68.2 × 22.8 | 19/22.8 700, -0.015em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Empty and new: the new conversation's person |
| `.hello > small` | “Freshman · No messages yet” | 196.4 × 19.5 | 15/19.5 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Empty and new: the new conversation's person |
| `.starters > button` | “Can you send me your card from tod…” | 281 × 32.8, pad 8 12, r 999 | 14/16.8 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** | 281×33 ⚠ | 03 Empty and new: static copy |
| `.starters > button` | “Nice round. What clicked?” | 194.6 × 32.8, pad 8 12, r 999 | 14/16.8 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** | 195×33 ⚠ | 03 Empty and new: static copy |
| `.starters > button` | “Can we meet before practice Monday…” | 273.6 × 32.8, pad 8 12, r 999 | 14/16.8 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** | 274×33 ⚠ | 03 Empty and new: static copy |

### Desktop, 1440 × 900 (`#fresh-desk-light-shot` / `-dark-shot`)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| `.msgs > div.hello` |  | 704 × 300.7, pad 22 16 18, r 16, gap 8 |  | fill `--a-surface` → `--ch-card-bg` | #FFFEFB | #191E1A |  |  |
| `.hello > span.av` | “JL” | 72 × 72, r 50% | 27.4/27.4 600, 0.01em; wraps | coin ink #FDFCF8 on coin hue (page per-person hue; build: PR 7 class-year fill, re-check each `--ch-yr-*`) | #FDFCF8 on #634C82 **7.09** | #FDFCF8 on #634C82 **7.09** |  | 03 Empty and new: the new conversation's person |
| `.hello > b` | “Jack Liu” | 68.2 × 22.8 | 19/22.8 700, -0.015em; wraps | `--a-ink` → `--ch-text-primary` on `--a-surface` → `--ch-card-bg` | #1C1B18 on #FFFEFB **17.08** | #F1ECDF on #191E1A **14.34** |  | 03 Empty and new: the new conversation's person |
| `.hello > small` | “Freshman · No messages yet” | 196.4 × 19.5 | 15/19.5 500, 0; wraps | `--a-ink-2` → `--ch-text-secondary` on `--a-surface` → `--ch-card-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #191E1A **10.25** |  | 03 Empty and new: the new conversation's person |
| `.starters > button` | “Can you send me your card from tod…” | 281 × 32.8, pad 8 12, r 999 | 14/16.8 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** | 281×33 ⚠ | 03 Empty and new: static copy |
| `.starters > button` | “Nice round. What clicked?” | 194.6 × 32.8, pad 8 12, r 999 | 14/16.8 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** | 195×33 ⚠ | 03 Empty and new: static copy |
| `.starters > button` | “Can we meet before practice Monday…” | 273.6 × 32.8, pad 8 12, r 999 | 14/16.8 500, 0; wraps | `--a-ink` → `--ch-text-primary` on `--a-page-2` → `--ch-well-bg-flat` | #1C1B18 on #F6F4EE **15.66** | #F1ECDF on #141815 **15.2** | 274×33 ⚠ | 03 Empty and new: static copy |

### Large phone 430, XXL, desktop 1280

Not measured at 430, XXL or 1280 for this route. Rules: phone edge 16 at 390 and 20 at 430 (SHARED-7; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18); every text size × 1.353 at XXL with its box growing (SHARED-5), faces, keys and glyphs fixed; desktop 1280 keeps every component size and only the pane width changes (see S-MSG).

**Redline (S-MSG.fresh)**, check on both images within 2pt:
1. Hello card 366 × 300.7 (phone), padding 22 16 18, radius 16, gap 8
2. Face 72
3. Name 19/22.8 700
4. Starters 32.8 tall, padding 8 12, radius 999, 14/16.8 500 (hit to 44)

## Hit areas

Rule: every target is at least 44 × 44. Where the drawn shape is smaller, keep the shape and add a transparent `::before` (position absolute, the inset given, no fill, no border) on the button, so the hit area grows and nothing moves. When two grown areas would overlap, they split at the midline of the gap, so a tap always goes to the nearer target. Measured hits under 44 (`hits.json`, 77 rows, deduped to the 28 below; "Where" names the routes where each was first measured, and the same rule applies wherever the element appears):
| Target | Selector | Where (device: routes) | Drawn | Rule |
|---|---|---|---|---|
| New message key (phone) | `.srow > button.ibtn.newbtn` | phone: inbox | 40 × 40 | `::before` inset -2 -2 (44 × 44 minimum) |
| Segmented All / Unread / Groups | `.segw > button` | phone: inbox | 117 × 32 | `::before` inset -6 0 (44 × 44 minimum) |
| New message key (desktop rail) | `.inbox__head > button.ibtn` | desk: inbox | 40 × 40 | `::before` inset -2 -2 (44 × 44 minimum) |
| Segmented All / Unread / Groups | `.segw > button` | desk: inbox | 94 × 32 | `::before` inset -6 0 (44 × 44 minimum) |
| Bar face and name (opens Details) | `.tbar > button.who` | desk: inbox | 770 × 36 | `::before` inset -4 0 (44 × 44 minimum) |
| Desktop bar Search / Details keys | `.tools > button.ibtn` | desk: inbox | 40 × 40 | `::before` inset -2 -2 (44 × 44 minimum) |
| Composer + (attach) | `.comp__in > button.ibtn.comp__plus` | desk + phone: inbox, thread | 36 × 36 | `::before` inset -4 -4 (44 × 44 minimum) |
| Composer text field | `.comp__in > textarea.comp__ta` | desk: inbox | 708 × 36 | A textarea takes no `::before`. The pill (46.1 tall) is the target: a tap anywhere on the pill outside + and Send focuses the field. Field stays 36 tall. |
| Menu items (row, hold, mute menus) | `.menu > button` | phone + desk: rowmenu, hold, holdseen, mute | 224 × 42 | `::before` inset -1 0. Items abut, so each hit area takes half the neighbour seam; the menu keeps 42 rows. |
| Menu Delete | `.menu > button.danger` | phone + desk: rowmenu, holdseen | 224 × 42 | `::before` inset -1 0. Items abut, so each hit area takes half the neighbour seam; the menu keeps 42 rows. |
| New message Cancel (desktop) | `.tools > button.txtbtn` | desk: new | 67 × 33 | `::before` inset -5.5 0 (44 × 44 minimum) |
| Empty state "Message the team" | `.ecard > button.ghost` | phone + desk: empty | 141 × 31 | `::before` inset -6.5 0 (44 × 44 minimum) |
| Bar face and name (opens Details) | `.tbar > button.who` | phone: thread | 91 × 41 | `::before` inset -1.5 0 (44 × 44 minimum) |
| Desktop hover bar keys | `.hoverbar > button` | desk: thread | 27 × 27 | Exception, desktop pointer only: stays 27 × 27 (meets WCAG 2.5.8, 24 minimum). Every action is also in the context menu and on the keyboard. No inset, the keys abut. |
| Composer text field | `.comp__in > textarea.comp__ta` | phone: thread | 318 × 36 | A textarea takes no `::before`. The pill (46.1 tall) is the target: a tap anywhere on the pill outside + and Send focuses the field. Field stays 36 tall. |
| Not delivered pill (retry) | `.col > button.seen.fail` | phone + desk: failed | 170 × 22 | `::before` inset -11 0 (44 × 44 minimum) |
| Seen by pill | `.col > button.seen` | phone + desk: team | 169 × 22 | `::before` inset -11 0 (44 × 44 minimum) |
| Jump to latest | `.pg > button.jump` | phone + desk: jump | 40 × 40 | `::before` inset -2 -2 (44 × 44 minimum) |
| Chip close (file, reply, edit) | `.chip-file > button.ibtn` | phone + desk: file | 26 × 26 | `::before` inset -9 -9 (44 × 44 minimum) |
| Composer Send | `.comp__in > button.comp__send` | phone + desk: file | 36 × 36 | `::before` inset -4 -4 (44 × 44 minimum) |
| Poll "See votes" | `.poll__f > button` | phone + desk: pollnew | 61 × 25 | `::before` inset -9.5 0 (44 × 44 minimum) |
| Sheet Cancel | `.sheet__h > button.txtbtn` | phone + desk: pollnew | 67 × 33 | `::before` inset -5.5 0 (44 × 44 minimum) |
| Sheet Send | `.sheet__h > button.txtbtn.strong` | phone + desk: pollnew | 53 × 33 | `::before` inset -5.5 0 (44 × 44 minimum) |
| Reaction bar keys | `.rbar > button` | phone + desk: hold | 40 × 40 | `::before` inset -2 -2 (44 × 44 minimum) |
| Sheet close key (Seen by, Votes; `flex: none`) | `.sheet__h > button.ibtn.solid` | phone + desk: seen | 40 × 40 | `::before` inset -2 -2 (44 × 44 minimum) |
| Votes "Draft a reminder" | `.vfoot > button.txtbtn` | desk: votes | 142 × 33 | `::before` inset -5.5 0 (44 × 44 minimum) |
| Details close (desktop) | `.d-close > button.ibtn` | desk: details | 40 × 40 | `::before` inset -2 -2 (44 × 44 minimum) |
| Starter chips (fresh conversation) | `.starters > button` | phone + desk: fresh | content × 33 | `::before` inset -5.5 0 (44 tall). Chips stack with a gap of 8, so neighbouring hit areas meet at the gap midline; widths are content. |

The one exception is the desktop hover bar: its keys are 27 × 27 on a pointer-only surface. That meets WCAG 2.5.8 (24 minimum), and every action on it (Like, Love, Laugh, Reply, More) is also in the context menu (right click) and on the keyboard (Enter or Space on a focused bubble opens the hold menu). It shows only on the desktop layout, on row hover or focus inside the row; the phone never draws it. CSS draws the keys 28; 27 was measured.

## Marks

Non-text marks need 3:1 against every colour they sit on (SHARED-4). Each mark below is given against each background it is drawn on in v14, both themes, computed with `meas/cc.mjs` (layers blended as drawn). Every counted mark passes. Rows marked decorative carry no meaning on their own (text beside them says it), so 3:1 does not apply; they are listed so the build knows not to "fix" them.

| Mark | Token (page → app) | Background it sits on | Light | Dark |
|---|---|---|---|---|
| Typing dots, thread bubble (7) | `--a-dot` → `--ch-typing-dot` | their bubble #FFFEFB / #232925 | #7A766C **4.49** | #827D71 **3.62** |
| Typing dots, phone pin bubblet and row (5) | same | card #FFFEFB / #191E1A | **4.49** | **4.12** |
| Typing dots, phone row while pressed | same | wash over the card #F4F3F0 / #262A26 | **4.08** | **3.55** |
| Typing dots, desktop rail row | same | page #F2F0E9 / #0E120F | **3.97** | **4.60** |
| Typing dots, selected desktop row (the measured `rowtyping` desk frame) | same | wash over the page #E7E5DF / #1C1F1B | **3.60** | **4.06** |
| Your own reaction ring (2, offset 1) | `--a-ring` → `--ch-ring-own` | the 4 page-colour halo #F2F0E9 / #0E120F (on paper and on your green bubble alike) | #8C703A **4.10** | #C9AD74 **8.73** |
| Bubble focus ring (2, offset 3) | same | page #F2F0E9 / #0E120F | **4.10** | **8.73** |
| Switch off ring (1.5, inset) | `--a-sw-off` → `--ch-switch-off-ring` | outside: card #FFFEFB / #191E1A | #8F8B81 **3.37** | #827D71 **4.12** |
| Switch off ring, inner edge | same | track well #F6F4EE / #141815 | **3.09** | **4.37** |
| Unread dot (9) | `--a-unread` → `--ch-accent` | card / desktop page / selected wash | #155A39 **8.15** / **7.21** / **6.53** | #7CC79B **8.45** / **9.44** / **8.33** |
| Mute glyph `bellOff` 13 | `--a-ink-3` → `--ch-text-tertiary` | card / desktop page / selected wash | #5F5C55 **6.61** / **5.85** / **5.29** | #ADA697 **6.99** / **7.80** / **6.88** |
| Poll check ring | `--a-ink-3` → `--ch-text-tertiary` | option well #F6F4EE / #141815 | **6.06** | **7.41** |
| Votes share bar (3 tall) | `--a-accent-text` → `--ch-accent` | card #FFFEFB / #191E1A | **8.15** | **8.45** |
| Attach tile glyph (17) | ivory #FDFCF8 | Photos / File / Poll tile (`--ch-attach-*`) | **4.92** / **5.61** / **8.01** | same |
| Group coin glyph `flag` | `--a-on-green` → `--ch-on-green-ink` | coin, lighter stop #1F6B45 | #F4EEDD **5.58** | **5.58** |
| Reaction icon on your badge | `--a-sent-ink` → `--ch-text-on-accent` | `--ch-bubble-mine-fill` #155A39 / #1F6B45 | #FDFCF8 **8.01** | #F4EEDD **5.58** |
| Reaction icon on a paper badge | `--a-accent-text` → `--ch-accent` | card #FFFEFB / #191E1A | **8.15** | **8.45** |
| Poll option bar | `--a-bar` → `--ch-poll-bar` | well | #E0E5DC 1.16 | #202D25 1.25 |
| Your choice's bar | `--a-bar-on` → `--ch-poll-bar-on` | well | #C9D5CA 1.38 | #2D4235 1.66 |
| Skeleton bars and faces | `--a-sk` (color-mix, no token) | card / desktop page | #EBEAE7 1.19 / #DFDDD6 1.19 | #2C312C 1.27 / #222622 1.23 |
| Sheet grabber | `--a-hair` → `--ch-separator` | card | #E8E7E4 1.23 | #2F332E 1.32 |
| Seen by and voter faces (16 to 18) | coin hues (PR 7) | card / dark card | 5.71 to 7.37 | 2.28 to 2.94 |

The last five rows are decorative. Poll bars: the count and % on each option are text (ink on your bar 11.36 / 9.17; count 6.50 / 6.55). Skeletons are `aria-hidden` under a "Loading conversations" status. The grabber repeats the sheet's close key. Faces are avatar art (SETTLED-4NOV 13) and show colour only (04 §8); the pill text ("Seen by 8 of 10") carries the meaning.

Lowest counted mark: light **3.09**, the switch off ring's inner edge against its own well (3.37 against the card around it); dark **3.55**, typing dots on a pressed phone row. Lowest steady (not pressed) dark mark: **3.62**, typing dots in their bubble.

Note on SETTLED-4NOV 2: the ruling gives the dots 4.08 on "the selected-row wash #F4F3F0". That is the wash over the card, which the phone draws on a pressed row. The selected desktop row is the wash over the page, #E7E5DF, where the dots measure 3.60 (dark: 4.06 on #1C1F1B). Both pass; the table gives both.

## Icons

From the page's `ic()` set (`c-app.js` line 63): 24 × 24 viewBox, `fill: none`, `stroke: currentColor`, round caps and joins. The base `.ic` is 22 at stroke 1.8; each context below sets its own size and stroke. Build them from today's icon component at the size and stroke given; the paths are in `c-app.js` `P`.

| Icon | Size | Stroke | Colour (app token) | Where |
|---|---|---|---|---|
| `alert` | 14 | 1.8 | `--ch-flag` | Not delivered pill |
| `back` | 24 | 1.8 | `--a-on-green-soft` (conversation bar), champagne link (pushed pages) | phone bars |
| `bell` | 20 | 1.8 | `--ch-accent` | Details quick action (Mute) |
| `bell` | 22 | 1.8 | `--a-on-green-soft` | root bar (unchanged) |
| `bellOff` | 13 | 1.8 | `--ch-text-tertiary` | muted row, after the name |
| `check` | 12 | 3 | `--ch-text-primary` | poll option ring (your choice) |
| `compose` | 19 | 1.8 | `--ch-accent` | New message key |
| `compose` | 18 | 2.2 | `--ch-text-on-accent` | empty state "Start a conversation" |
| `down` | 19 | 2.2 | `--ch-text-primary` | Jump to latest |
| `eye` | 19 | 1.8 | `--ch-text-secondary` | hold menu "Seen by" row |
| `file` | 17 | 1.8 | `--ch-accent` on chip tint | New message and Details list icons (`.li-ic`) |
| `file` | 17 | 2 | ivory #FDFCF8 | attach tile File |
| `flag` | 31 / 20 | 1.8 | `--ch-on-green-ink` | group coin at 62 / 40 (half the face) |
| `image` | 17 | 2 | ivory #FDFCF8 | attach tile Photos |
| `poll` | 17 | 2 | ivory #FDFCF8 | attach tile Poll |
| `poll` | 14 | 1.8 | `--ch-text-secondary` | poll card header |
| `like`, `love` | 14 | 2 | `--ch-accent` on the card; `--ch-text-on-accent` on your own badge | reaction badges |
| `like`, `love`, `laugh`, `party`, `wow`, `thanks` | 22 | 1.8 | `--ch-accent` | reaction bar |
| `like`, `love`, `laugh`, `reply`, `more` | 15 (14.4 measured at 1280) | 1.8 | `--ch-text-secondary` | desktop hover bar |
| `reply` | 19 | 1.8 | `--ch-text-secondary` | menus (Reply) |
| `reply`, `pencil` | 18 (`.ic.sm`) | 1.8 | `--ch-text-primary` | reply chip, edit chip |
| `copy`, `pencil`, `trash` | 19 | 1.8 | `--ch-text-secondary`; `trash` `--ch-flag` | hold menu |
| `search` | 17 | 1.8 | `--ch-text-secondary` | search well |
| `search` | 22 | 1.8 | `--ch-accent` | desktop thread bar Search key |
| `up` | 18 | 2.4 | `--ch-text-on-accent` | Send |
| `plus` | 22 | 1.8 | `--ch-text-secondary` on the well; turns 45° when the attach menu is open | composer + |
| `x` | 14 | 1.8 | `--ch-text-secondary` | chip close |
| `x` | 22 | 1.8 | `--ch-text-primary` on glass-strong (sheet close), `--ch-accent` (desktop Details close) | sheet and Details close |
| `chevD` | 16 | 1.8 | `--a-on-green-soft` | root bar switcher (unchanged) |
| `info` | 22 | 1.8 | `--a-on-green-soft` on phone, `--ch-accent` on desktop | Details key |

Icons not measured on a frame (`laugh`, `party`, `wow`, `thanks`, `more`, `copy`, `plus`, `x`, `info`; `users`, `userPlus` and `user` are in the `P` set but not drawn by these routes) take their size and stroke from the page CSS rule for their context (`a-head.html`: `.rbar button svg` 22 / 1.8, `.hoverbar svg` 15, `.menu button svg` 19, `.chip-file .ibtn svg` 14 in `d-extra.css`, base `.ic` 22 / 1.8).

## Settled 4 Nov

Every open point from the v12 draft is settled in `SETTLED-4NOV.md`; the tables above already show the v14 result. By ruling number:

1. Phone edge 16 at 390, 20 at 430; thread 12 / 16, composer 10 / 14, attach menu 12 / 16, jump right 14 / 18 ("Sizes").
2. Typing dots `--ch-typing-dot` #7A766C / #827D71; hold still under Reduce Motion ("Marks", S-MSG typing rows).
3. Own-reaction and focus ring `--ch-ring-own` #8C703A / #C9AD74 on a 4 page-colour halo (S-MSG.react, "Marks").
4. Jump badge 20 × 20, count 12/20 700 (S-MSG.jump).
5. Group face initials 12 on the 30 face on phone (S-MSG.team).
6. Group typing: the name inside the bubble, no caption (S-MSG.typing (group)).
7. Details header allowed on the page as large title and context line (S-MSG.details).
8. Delete conversation in `--ch-flag`; row menu order as drawn (S-MSG.row-menu).
9. XXL times: column `52 × k`, `right: -64 × k`, drag `58 × k`; one line (S-MSG.times).
10. Seen by and Votes close keys `flex: none`, 40 drawn, 44 target ("Hit areas").
11. Switch off ring `--ch-switch-off-ring` #8F8B81 / #827D71 (S-MSG.poll-composer, "Marks").
12. "CH-7301" removed from the empty card (S-MSG.empty).
13. Group coin gradient allowed as avatar art ("Tokens").
14. Skeleton fill built as `color-mix(in srgb, var(--ch-text-primary) 9%, transparent)`, no token ("Tokens", S-MSG (loading)).
15. Attach tiles `--ch-attach-photos`, `--ch-attach-file`, `--ch-attach-poll`; ivory glyph at least 4.5, lowest 4.92 ("Tokens", S-MSG.attach).
16. Root bar is today's; the conversation bar's Details key stays after the name ("Shared: the green bars").
17. Desktop hover bar keys stay 27, with the stated exception ("Hit areas").
18. Seen by "n of m" is a reader count, not a figure (SHARED-11 untouched; S-MSG.seen).
19. Today's exact strings ("Not sent", the mute lines) are checked against today's source by a test (S-MSG.thread (failed), S-MSG.mute).
20. Profile quick action shows to a coach viewer only, because for a player it would link to a teammate's stats (SHARED-11; S-MSG.details).
21. Reply chip in PR 11d; the edit chip uses M-MSG-28; M-MSG-32 uses the browser's own caret (S-MSG.reply, S-MSG.edit).

Nothing from the rulings is open.

**430 time column (fixed in v15, `SETTLED-4NOV.md` 30):** the column's offset follows the thread padding (`right: -64 × k` at 390, `-68 × k` at 430), so no part of it shows before a drag. Measured on v15: hidden at x 430 in the 430 frame; revealed 6 px from the edge at 390 and 430.

## Completeness pass, 4 Nov 2026

Element specs for the IDs 05 adds under the same heading. None is drawn on the page, so "page token" reads "not drawn" and each value comes from this lane's existing tokens (the tokens table above). Contrast is measured with the WCAG formula on the token hexes; every text pair clears the 4.9 target, every mark clears 3:1. Sizes are at 390 and scale with `--ch-type-scale` (XXL 1.353; the shared value 1.36 gives the same layout); boxes grow, nothing clips (SHARED-5). Phone edge 16, 20 at 414 and up (SHARED-7). All new rules sit under `[data-ch-ms-v2]` (05, the lane flag).

### S-MSG.pending, S-MSG.upload

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Receipt slot label | "Sending…" | auto × 16, right-aligned under your bubble, 4 above | 13/16 400, 0; one line | not drawn → `--ch-text-tertiary` on `--ch-grouped-bg` | #5F5C55 on #F2F0E9 **5.85** | #ADA697 on #0E120F **7.80** | n/a (not a control) | client state `pending`, shown after 1000ms |
| Failed pill | today's "Not sent" and its retry | as drawn for `failed` (06 S-MSG.thread failed) | as drawn | as drawn | as drawn | as drawn | 44 (the pill's hit area grows to 44 tall) | `sendFailed`; S2 copy |
| Upload spinner disc | spinner 20 in a disc | 32 × 32 circle, centred on the photo preview or in the file row's icon slot | n/a | not drawn → `--ch-glass-strong`; ring `--ch-accent` | ring #155A39 on #FCFAF6 **7.89** (mark) | ring #7CC79B on #191E1A **8.45** (mark) | n/a | upload in flight; indeterminate (no progress events) |
| Local photo preview | the picked photo | final bubble size from the file's own aspect, inside 76% | n/a | n/a | n/a | n/a | n/a | object URL, revoked once the server copy loads |
| Failed upload pill | today's "Not sent", or "choose again" after a reload | as the failed pill | as drawn | as drawn | as drawn | as drawn | 44 | `helm.golf.cache.v1:pending-attachment-send:<user>:<conv>` |
| Attachment open toast | "Couldn't open this file. Try again." | the one toast box (S-MSG.toast) | as S-MSG.toast | as S-MSG.toast | as S-MSG.toast | as S-MSG.toast | n/a | failed re-sign (bug M4) |

Redlines: the label never shifts the bubble (the slot is reserved under your latest message already). The disc has no backdrop blur over a photo (blur is set once on lift only, MSG-MOT-09); `--ch-glass-strong` is its flat fill.

### S-MSG.offline

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Offline banner | today's copy | today's `OfflineBanner` box, under the green bar | today's | today's tokens | today's | today's | n/a | `navigator.onLine` and the shell's reconnect |

Redline: nothing in Messages draws a second offline line; actions refused offline use today's CH-1903 refusal.

### S-MSG.edited, S-MSG.deleted

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Edited mark, theirs | "Edited" | inline after the text, 6 gap; wraps to its own line at the right | 13/16 400, 0 | not drawn → `--ch-text-secondary` on `--ch-bubble-theirs-bg` | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** | n/a | today's edited flag |
| Edited mark, yours | "Edited" | as theirs | 13/16 400, 0 | not drawn → `--ch-text-on-accent` on `--ch-bubble-mine-fill` | #FDFCF8 on #155A39 **8.01** | #F4EEDD on #1F6B45 **5.58** | n/a | today's edited flag |
| Deleted placeholder | today's deleted copy | the bubble's own box and tail, padding as a text bubble | 15/20 400, 0; one line | not drawn → `--ch-text-secondary` on `--ch-bubble-theirs-bg` (both sides) | #46433D on #FFFEFB **9.77** | #D0C9B8 on #232925 **8.99** | n/a (no hold menu) | today's deleted flag |

Redlines: the mark is never dimmed with opacity (dimming yours in dark would fall under 4.5). The deleted bubble keeps its side and tail so the run's shape doesn't change; it drops its reactions and receipt.

### S-MSG.divider, S-MSG.older

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Unread divider label | "New" (today's copy) | the day pill's box (06 S-MSG.date-pill), centred | 13/16 600, 0 | not drawn → `--ch-accent` on `--ch-grouped-bg` | #155A39 on #F2F0E9 **7.21** | #7CC79B on #0E120F **9.44** | n/a | first message after `last_read_at` |
| Unread divider rules | two 1px lines | from the thread padding to 8 off the pill on each side | n/a | `--ch-accent` | #155A39 on #F2F0E9 **7.21** (mark) | #7CC79B on #0E120F **9.44** (mark) | n/a | |
| Older loading row | one skeleton bubble | theirs-side bubble 180 × 36, radius as bubbles, 12 under the top inset | n/a | `--ch-well-bg-flat` pulse (M-MSG-31) | #F6F4EE | #141815 | n/a | paging in flight |
| Older failed pill | "Couldn't load earlier messages" · "Try again" | pill auto × 44, padding 0 14, radius 22, centred | 15/20 400; "Try again" 600 | not drawn → `--ch-text-secondary` and `--ch-accent` on `--ch-well-bg-flat` | #46433D **8.96**, #155A39 **7.48** on #F6F4EE | #D0C9B8 **10.87**, #7CC79B **8.96** on #141815 | 44 | paging error |

### S-MSG.search

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Search field | "Search" | as 06 `.srow > div.search` | as drawn | as drawn | **8.96** | **10.87** | 44 (the row) | query |
| Hit row | a conversation row with a snippet | the inbox row box | name 17/600; snippet 15/400, the match 600 | `--ch-text-primary`, `--ch-text-secondary` on `--ch-card-bg` | #1C1B18 **17.08**, #46433D **9.77** on #FFFEFB | #F1ECDF **14.34**, #D0C9B8 **10.25** on #191E1A | row 44+ | `searchGolfMessages`, minus hidden conversations |
| No results title | "No results" | card in the list area, padding 24 20, radius as inbox cards, centred text, gap 6 | 17/22 600 | not drawn → `--ch-text-primary` on `--ch-card-bg` | **17.08** | **14.34** | n/a | |
| No results line | "Try another name or word." | in the same card | 15/20 400; wraps | `--ch-text-secondary` on `--ch-card-bg` | **9.77** | **10.25** | n/a | |

### S-MSG.who-reacted, S-MSG.add

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Sheet | the votes sheet's box | as 06 S-MSG.votes | as drawn | as drawn | as drawn | as drawn | grabber row 44 | |
| Person row | face 32, "Maya Lopez", the reaction | 100% × 52, padding 0 16, gap 12 | 17/22 400; one line | `--ch-text-primary` on the sheet | as S-MSG.votes rows | as S-MSG.votes rows | 52 | reactions on the message; Add: the directory |
| Neutral face (removed person) | coin, no initial | 32 circle | n/a | `--ch-well-bg-flat` with a 1px `--ch-text-tertiary` ring | ring #5F5C55 on #FFFEFB **6.61** (mark) | ring #ADA697 on #191E1A **6.99** (mark) | n/a | person missing from the directory; name `?? 'Player'` |

### S-MSG.confirm, S-MSG.new-announcement

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Confirm card | today's modal | 300 wide (min(300, 100% − 32)), padding 20, radius 20, gap 8; centred | n/a | not drawn → `--ch-glass-strong` | #FCFAF6 | #191E1A | n/a | |
| Confirm title | "Leave Qualifier group?" (today's copy) | full width | 17/22 600; wraps | `--ch-text-primary` on glass | #1C1B18 on #FCFAF6 **16.52** | #F1ECDF on #191E1A **14.34** | n/a | |
| Confirm body | today's copy | full width | 15/20 400; wraps | `--ch-text-secondary` on glass | **9.45** | **10.25** | n/a | |
| Safe button | "Cancel" | half width × 44, radius 12, gap 8; stacks full width at XXL when either label wraps | 17/22 600 | `--ch-text-primary` on `--ch-well-bg-flat` | **15.66** | **15.20** | 44 | |
| Destructive button | "Leave" | as safe | 17/22 600 | `--ch-flag` on `--ch-well-bg-flat` | #B3261E on #F6F4EE **5.94** | #F28B7D on #141815 **7.48** | 44 | |
| Busy spinner | 16 spinner in the pressed button | replaces its label, same box | n/a | the button's ink | mark | mark | 44 (disabled) | request in flight |
| Discard confirm (poll, announcement) | "Discard this poll?" · Discard · Keep editing | the confirm card | as above | as above | as above | as above | 44 | the sheet has typed content |

### S-MSG.removed, S-MSG.prefill

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Not-a-member pill | "You're not in this conversation anymore." | in the composer's place: 100% − the composer's side padding × 44 min, padding 12 16, radius 22, centred text | 15/20 400; wraps | not drawn → `--ch-text-secondary` on `--ch-well-bg-flat` | #46433D on #F6F4EE **8.96** | #D0C9B8 on #141815 **10.87** | n/a (not a control) | participant row gone |
| Draft kept toast | "You already had a draft here." | the one toast box | as S-MSG.toast | as S-MSG.toast | as S-MSG.toast | as S-MSG.toast | n/a | own draft in `ch.msg.drafts.<userId>` |

### S-MSG.announcements, S-MSG.announcement

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Announcements row card | the folded row | the inbox card box; one row | n/a | `--ch-card-bg` | #FFFEFB | #191E1A | row 64 | `getAnnouncementsWithMeta` |
| Megaphone tile | `megaphone` 22 | 44 × 44, radius 12 | n/a | glyph `--ch-accent` on `--ch-well-bg-flat` | #155A39 on #F6F4EE **7.48** (mark) | #7CC79B on #141815 **8.96** (mark) | n/a | |
| Row title | "Announcements" | as the inbox row name | 17/22 600; one line | `--ch-text-primary` on card | **17.08** | **14.34** | n/a | |
| Row line | "Bus to Hargrove leaves at 6:45" | as the row preview | 15/20 400; one line | `--ch-text-secondary` on card | **9.77** | **10.25** | n/a | newest announcement title |
| Row count | "3" | the row's time slot | 15/20 400 | `--ch-text-tertiary` on card | **6.61** | **6.99** | n/a | unread or unacknowledged count, today's rule |
| Urgent chip | "Urgent" | auto × 22, padding 0 8, radius 11 | 12/16 600, 0.2 | not drawn → `--ch-flag` on a 10% (light) or 14% (dark) `--ch-flag` tint over card | #B3261E on #F7E8E5 **5.49** | #F28B7D on #372D28 **5.59** | n/a | `high` or `urgent` (model.ts 290) |
| Detail page | today's letter | pushed page on phone, thread pane on desktop; today's content | today's | the thread's page and card tokens | as thread | as thread | Back 44 | today's |

Redlines: no accent left border on the row, the chip or the detail (SHARED-3). An Ask-posted announcement uses these same elements with nothing added.

### S-MSG.narrow

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Floating details panel (720 to 1099) | details | 300 × 100% of the canvas under the bar, right edge, radius 0; today's floating details shadow | as 06 S-MSG.details | as drawn | as drawn | as drawn | close 44 | |

### S-MSG.prefill (Ask board and poll)

| Element | Sample | Box (w × h, padding, radius, gap) | Type (size/line weight, tracking; lines) | Colour: page token → app token | Light | Dark | Hit 44 | Data |
|---|---|---|---|---|---|---|---|---|
| Board chip | thumbnail of the board, "Board.png", × | the S-MSG.file chip box, with the photo thumbnail in its icon slot | as the file chip | as the file chip | as the file chip | as the file chip | × 44 | `attachment {kind:'board', pngKey}` |
| Filled poll composer | the question and choices from Ask | the S-MSG.poll-composer sheet, unchanged | as drawn | as drawn | as drawn | as drawn | as drawn | `poll {question, options[], closes?}` |
| Board missing toast | "The board picture wasn't found. Make it again in Ask." | the one toast box; wraps to two lines | as S-MSG.toast | as S-MSG.toast | as S-MSG.toast | as S-MSG.toast | n/a | blob not found by `pngKey` |
| Poll rejected toast | "Couldn't open the poll draft. Nothing was posted." | the one toast box | as S-MSG.toast | as S-MSG.toast | as S-MSG.toast | as S-MSG.toast | n/a | `takePrefill` rejected `poll` |

VoiceOver: the board chip reads "Board picture, attached, remove button"; the filled sheet is announced as "Poll, filled from Ask, not posted".

### VoiceOver labels and order (all CP IDs)

- Pending: the bubble reads its text, then "Sending". Failed: its text, then "Not sent, button, double tap to try again".
- Upload: "Photo, sending" or "<file name>, sending".
- Edited: its text, then "Edited". Deleted: today's placeholder copy only.
- Divider: "New messages" (a heading level 3, so the rotor finds it).
- Older failed pill: "Couldn't load earlier messages, Try again, button".
- Search empty: "No results. Try another name or word." announced politely once.
- Confirm: the card is a dialog labelled by its title; focus starts on the safe button.
- Not-a-member pill: read as static text after the last message.
- Announcements row: "Announcements, 3, <newest title>"; Urgent reads "Urgent" before the title.
- The thread is `role="log"`; arrivals from others are announced politely, never your own sends.


## Wiring, 4 Nov 2026

Every element and action in this lane, traced to helmv3 `main` 03d9087 (1 Nov). Paths are under `src/` unless they start with `supabase/`; `MV` is `clubhouse/screens/messages/MessagesView.tsx`, `MP` is `MessagesPhone.tsx`, `M` is `Messages.tsx` in that folder, `UGM` is `hooks/golf/use-golf-messages.ts`, `AM` is `app/actions/messages.ts` (the golf actions in `app/golf/actions/messages.ts` re-export it, 351-377), `FAN` is `lib/notifications/golf-message-fanout.ts`, `BASE` is `supabase/migrations/20260527000000_prod_public_baseline.sql`. "new:" names code the build adds. A missing value shows "—" unless the row says otherwise. Messages reads no shot data and changes nothing shot tracking collects, stores or sends (SHARED-10). Messages draws no stat figures, so no teammate figure can reach a player's DOM or a response here (SHARED-11); the per-row Privacy notes say where membership is enforced.

Shared rules for every write below, so the rows don't repeat them:
- Every change runs through `attempt` (M 281-298): offline refuses at once with CH-1903 and changes nothing; slow shows CH-1902 once after `CH_SLOW_SAVE_AFTER`; a throw toasts the row's catalog code through `fail` (M 265-273) with `haptic('error')`. Success plays `haptic('success')`.
- Double-submit: the composer's `sending` state (MV 1671) and the confirm modals' disabled pair (05 S-MSG.confirm) block a second press; reactions drop a tap while one saves (`reactions.pending`, M 778); a vote tap while saving is queued, last tap wins (`use-message-responses.ts` 167-197).
- No Messages action calls `revalidatePath` (by design, the `nosemgrep` notes at AM 102 and 234): other screens and devices learn from the realtime channels named per row, the 45 s badge poll and refetch on visibility.
- Flag: every row marked "v2" mounts or runs only when `redesign` is true (W8). Flag off is today's code path for that row.

### W1 Inbox: S-MSG, S-MSG.unread, S-MSG.row-menu, S-MSG.search, S-MSG.empty, S-MSG.noteam, S-MSG.narrow, S-MSG.announcements

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Conversation rows (face, name, time, preview, unread dot) | `useGolfConversations` (UGM 2055) over `loadGolfConversationRail` (UGM 1462): RPC `get_golf_conversations_with_details` plus the viewer's participant rows (1519-1533); mapped in M 113-136; `railTime`, `isUnread` (model.ts) | none | coach and player; `golf_participants_select_v2`, `golf_conversations_select_v2` (BASE 19266, 19008); the RPC is SECURITY DEFINER bound to the session (`20260803120100`) | none | rows paint from cache first (`conversationsCacheKey`, UGM 452) | list read fails with nothing cached: today's inbox error (`convsError`, M 649); with rows cached they stay | `golf-conversations:<user>`: own participant rows and `golf_conversations` UPDATE, 300 ms debounce (UGM 2177-2205) | none | today's | none |
| Context line "3 unread · Demo University Golf" / "· 7 conversations" | `convs` count of `isUnread`; `teamName` (`data/messages.ts:52`, `:100`) | none | as above | none | | team name null: the count alone | as rows | none | v2 | none |
| Mute glyph on a row | new: `notification_level, muted_until` added to the existing select at UGM 1519-1533, `isConversationMuted` (FAN 250), `ChConv.muted` | none | own row, `golf_participants_select_v2` | none | | the column read fails: no glyph (the select's error path is today's) | the list channel refetches on any change to the viewer's own participant row, so a mute on another device shows within the debounce | none | v2 draws it; the select addition is harmless with the flag off | none |
| Pinned card and rail Pinned section (11b) | new: `screens/messages/pinned.ts` (mirror of `marked-unread.ts`), key `ch:msg:pinned:<viewer>:<team>` | localStorage only | each person's own device | max 3; ids not in `convs` dropped | | storage throws: no pins, no error | none across devices until 11h (W6) | none | v2 | 11h table missing: device pins (PIN-SYNC section 1) |
| Pin bubblet | `c.lastText`, `c.lastSenderId` | none | as rows | none | | none: no bubblet | as rows | none | v2 | none |
| Typing dots on rows and pins | new: `screens/messages/use-typing-by-conversation.ts`, broadcast `typing` on `golf-conversation:<id>` (sent by UGM 1050-1064) | none (listen only) | members of the conversation; the channel is a public broadcast topic today (no `private: true`, UGM 929), unchanged by this lane | ignore own id; 5 s expiry; cap 30 channels; never the open conversation | | channel error: dots never show | the channel itself | none | v2 | none |
| Segmented All / Unread / Groups | `convs`, `ChConvFilter` | none | | | | | | | today's component | |
| Row menu: Open conversation | none | `select(id)` (M 240-254) | | | thread opens; `mark(id, false)` | conversation gone: CH-7015 (MessagesScreen 22-31) | | none | today's | |
| Row menu: Pin / Unpin | `pinned.ts` | new: `pinned.ts` write (11b); `golf_pin_conversation` RPC in 11h | own; 11h: no table grants, the RPC checks membership and the limit | Pin disabled "Pin up to 3" at 3 (D7) | Pinned card updates at once (optimistic) | 11h refusal: the pin comes back off with PIN-SYNC section 5 copy | 11h: private `golf-pins:<user>` | none | v2 | device pins |
| Row menu: Mark as read | `c.unread` | `markGolfMessagesAsRead` (AM 836) via `setRead` (M 932-955): own `last_read_at` (`golf_participants_update`, BASE 19270) and RPC `mark_golf_messages_read` (`20260710160000`) | own row | nothing to write when `unread` is 0 | dot goes; new: `badges.refetch()` | CH-7026; the row stays unread | list channel (own row UPDATE); new: badge refetch | none | today's; the badge refetch is v2 | none |
| Row menu: Mark as unread | none | `mark(id, true)` (M 103-110), `marked-unread.ts`, this device only | own device | | dot shows | storage throws: mark kept in memory | none across devices (owner decision 14) | none | today's | |
| Row menu: Mute… | `getGolfConversationMute` (`app/golf/actions/message-mute.ts:77`) when the sheet opens (`muteOf`, M 584-593) | `setGolfConversationMute` (message-mute.ts:81, impl 43-75) | own row, `golf_participants_update` | hours null, or 0 < hours ≤ 8760 (message-mute.ts:49) | toast "Conversation muted" / "Notifications back on", `replace: 'mute'` (M 596-604) | CH-7011 | list channel (own row) | silences email, push and bell for that person (FAN 61-66) | today's | none |
| Row menu: Delete conversation | `canHide` (route probe, M 148-159) | `hideGolfConversation` (`app/golf/actions/conversation-hide.ts:100`): own `hidden_at` | own row, `golf_participants_update`; team channel refused (conversation-hide.ts:72) | confirm CH-7503 first | toast "Conversation deleted"; row leaves; new: `badges.refetch()` | CH-7025; row stays | list channel; the RPC hides it until a newer message (`20261008160000`, applied 21 Oct) | none | today's; refetch v2 | 11h: the hide trigger unpins |
| Search: names | `convs`, `directory` | none | | | at once | | | none | today's | |
| Search: messages | `searchGolfMessages` (AM 1636, impl 1465-1560) via `searchMessages` (M 532-553) | none | participant-scoped in the action (1485-1494) and RLS `golf_messages_select_v2` (BASE 19241) | 2 characters minimum, 50 hits (AM 1480, 1513) | hits as rows | `null`: today's toast; names stay | none | none | today's; new v2: drop hits whose `conversationId` is not in `convs` (fixes M1 without changing the shared action) | none |
| Open a hit | `openHit` (M 915-918), `useFocusMessage` | none | | | ring on the bubble (MV 618) | message older than the 200 loaded: the thread opens at the end, no ring | | | today's | |
| First run / No team | `convs.length === 0`; `MessagesNoTeam` from the route when `resolveClubhouseTeam` is null (`routes/messages.tsx:24-27`) | none | | | | | | | today's, restyled v2 | |
| Announcements row and list | `getAnnouncementsWithMeta` with the page (`routes/messages.tsx:37-40`), else `loadAnns` (M 472-484) | none | players see posts addressed to them; coach counts (`acknowledged`) only for a coach (role from the session, #2269) | | | `annError`: today's | not realtime: refetched after own writes only, and on the next page read | push `team_announcement`, gated `push_announcements` (`lib/notifications/push.ts:55`), lands on `/golf/dashboard/announcements` (push.ts 127-132), not changed here | today's, restyled v2 | none |

### W2 Thread: S-MSG.thread, S-MSG.team, S-MSG.typing, S-MSG.times, S-MSG.date-pill, S-MSG.jump, S-MSG.divider, S-MSG.older, S-MSG.edited, S-MSG.deleted, S-MSG.removed, S-MSG.deeplink

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Messages in the thread | `useGolfMessages` (UGM 509), newest 200, `is_deleted = false` (739-775); mapped in M 420-442 | open marks read: `markGolfMessagesAsRead` at the end of the read (UGM 824) unless deferred (desktop auto-open, M 161-168) | `golf_messages_select_v2` (BASE 19241, `user_conversation_ids`) | | from cache first (`messagesCacheKey`, UGM 438) | read fails: thread error with Retry, or the cached copy marked stale (`msgsStale`, M 660) | `golf-conversation:<id>` INSERT and UPDATE on `golf_messages` (UGM 929-975); refetch on visibility (UGM 715) | none | today's | none |
| Bar face, name, role | `ChConv`, directory subtitle `classYearLabel` (`data/messages.ts:91`), `memberCount` | none | | | | person missing: "Member" (MV 1428) | as rows | | today's | |
| Day pill, date pill, times on drag | `dayLabel`, `clock` (model.ts) over `ChMsg.at` | none | | | | | | | v2 (pill, drag); day pill restyle v2 | |
| Sender name in run, face beside last | `personOf` (MV 316), run grouping in `Thread` | none | | | | missing person: "Member" and the neutral coin | | | v2 | |
| Faces with class year | new: `ChPerson.gradYear` from `p.graduation_year` in `loadMessagesDirectory` (`data/messages.ts:91`) | none | the directory already reads it through `readGolfPlayerProfiles` | coaches null | | null: today's coin | | | v2 | |
| Receipts under your latest message (direct) | `isRead` from the other member's `last_read_at` (UGM 652-698) | none | `golf_participants_select_v2` | | Delivered, then Seen | read map fails: "Delivered" stays | participants UPDATE on the thread channel (UGM 976-995) | none | today's | none (seen times come from `20261025010000`, applied 25 Oct) |
| Typing bubble (direct and group, one per typer) | broadcast `typing` (UGM 997-1019); new: `typingUserIds` set and `typingExpiryMs` option (UGM 492) | none; the composer sends `onTyping(true)` per keystroke throttled 500 ms (UGM 1054-1057), `false` 2500 ms after the last keystroke (MV 1883-1887) and on send (MV 1744, UGM 1099) | members | own id ignored | | | the channel | none | v2 uses 5 s and the set; off: 3 s, one boolean | none |
| Jump key and count | `useThreadAnchor` `unseen`, `atEnd`, `toEnd` (MV 2036, 1953) | none | | | | | | | v2 restyle | |
| Unread divider | `useNewDivider` (MV 1933) from `conv.unread` at open, `firstUnreadId` (model.ts 199) | none | | | | | fixed for the visit | | today's; v2 opening position 120pt under the bar | |
| Older messages (S-MSG.older) | none: no paging today (05 fixed row) | none | | | | | | | not built | |
| Edited mark | `edited_at` (M 432) | none | | | | | thread channel UPDATE (`applyRealtimeMessageUpdate`, UGM 281-310) | none | v2 restyle | |
| Deleted message | none in the thread (05 fixed row); reply quote parent "Message deleted" (MV 1439) | none | | | closes in place | | thread channel UPDATE removes the row (UGM 284-287) | none | today's | none |
| Removed state (S-MSG.removed) | `convs` no longer holds a conversation seen this visit | new v2 branch in `MessagesScreen.tsx` (22-31): keep the thread, swap the composer for the pill; keep CH-7015 for ids never seen | server: `user_conversation_ids` stops every read and the send check (AM 131-147) | | | | learned on the next list read or the first refused send, which calls `refetchConvs()` | none | v2; off: CH-7015 and close | 11h: the leave trigger unpins |
| Deep link `?conversation=`, `?player=`, `?user=`, `?compose=` | M 173-238 | `createGolfConversation` for a new DM (`startDirect`, M 310-338) | today's | ids checked against the directory (CH-7001) | thread opens; URL replaced with the bare path | unknown or left: CH-7015 (MessagesScreen 22-31); new v2: `select(null)` sets `paramsDone` so desktop opens the newest thread (fixes L3; today `paramsDone` is set only at M 185) | | push and bell rows carry `?conversation=<id>` (W7) | v2 for the fallback; phone at-rest push v2 | none |

### W3 Composer and send: S-MSG.composer, S-MSG.pending, S-MSG.offline, S-MSG.upload, S-MSG.attach, S-MSG.file, S-MSG.reply, S-MSG.edit, S-MSG.toast, S-MSG.prefill

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Send text | draft (`DraftStore`, `drafts.ts`, key `ch.msg.drafts.<user>`) | `api.send` (M 687-704) → `msgs.sendMessage` (UGM 1097) → `sendGolfMessage` (AM 808, impl 774-806) → `sendMessageCore` (AM 103-232) | participant; server check AM 131-147; `golf_messages_insert_v2` (BASE 19237: sender is you, conversation is yours) | 1 to 5000 characters (`action-schemas.ts:75`; `MESSAGE_MAX` model.ts 316); empty never sends; Enter never while `isComposing` (MV 1829) | optimistic row at once with the client id (UGM 1107-1125); a 23505 on that id counts as sent (AM 194-217) | refused: "Not sent" with retry (`markSendFailed`, UGM 1077); unknown: CH-7005 and the bubble says so; retry reuses the id (`retryMessage`, UGM 1199) | INSERT on the thread channel for everyone in it; `golf_conversations.updated_at` bump (AM 272-277) refetches every member's list | W7 new message | today's | none |
| Pending label "Sending…" after 1000 ms | `ChMsg.pending` (M 440) | none | | | | | | | v2 | |
| Offline | `isOffline()` (`clubhouse/lib/use-action`), shell `OfflineBanner.tsx` | none | | | | send fails at once, "Not sent" (today); chip and file stay in the composer | new v2: on `online`, call `refetch()`, `msgs.refetch()` and `badges.refetch()` from M | none | v2 refetch; banner today's | |
| + menu: Photos, File | `<input type=file>` in `ComposerPlus` (MV 1556) | none until Send | | `validateFile` (`lib/storage/attachments.ts:136`, limits `FILE_SIZE_LIMITS` 20, types `ALLOWED_MIME_TYPES` 31); refusal CH-7101 (M 706-712) | chip rises | | | | today's, restyled v2 | |
| Send with files (S-MSG.upload) | picked `File`s, local object URL for the preview | `sendMessageWithAttachments` (`hooks/golf/use-message-attachments.ts:198`): upload to bucket `golf-attachments` (`lib/storage/attachments.ts:14`, 402) then `sendGolfMessageWithAttachments` (`app/golf/actions/message-attachments.ts:335`, impl 86-333) | storage `golf_attachments_participant_insert` (`20260801080000:129`); rows "Users can add attachments to their own messages" (BASE 17310) | as above | bubble with spinner until both finish | upload or insert fails: the action's compensating deletes (message-attachments.ts 238-276); "Not sent" with retry from memory; after reload the pending record `helm.golf.cache.v1:pending-attachment-send:` (use-message-attachments.ts 37) offers "choose again"; partial: CH-7022; unknown: CH-7023 (M 705-772) | INSERT on the thread channel; `has_attachments` carried by the read (UGM 761) | W7, sent in `after()` (message-attachments.ts 302-306) | today's; v2 bubble | none |
| Photo and file bubbles | `getGolfMessageAttachments` (message-attachments.ts:424, impl 349-422), signed 3600 s (393); mapped in M 631-638; new: map `durationSeconds` (406) to `ChAttachment` | none | "Users can view attachments in their conversations" (`20261001130000`, hides a deleted message's files); storage `golf_attachments_participant_select` (`20260801080000:118`) | | | image fails to load: file chip | | | v2 (file bubble, duration) | none |
| Open an attachment after 50 minutes | new v2: keep `signedAt` with the result in `Attachments` (MV 915) state | re-call `api.attachments(messageId)`, which signs again | as above | | opens | "Couldn't open this file. Try again." toast | | | v2 | |
| Reply chip | `replyToId` | `send(text, replyToId)` → `validateGolfReplyTarget` (AM 150-155) | same conversation only | | quote under the bubble (`ReplyQuote`, MV 1425) | parent gone: "Message deleted" quote | | | today's | |
| Edit chip | own message | `api.edit` (M 759-764) → `editMessage` (UGM 1248) → `updateGolfMessage` (AM 1388, `updateMessage` 1222-1308) | sender only: server check (AM 1262-1268) and `golf_messages_update_v2` (BASE 19245) | 1 to 5000; empty refused | toast "Message edited" | CH-7007, edit stays in the box; not optimistic, so nothing to roll back | thread channel UPDATE | none | today's | none |
| Toast | `ui/Toast.tsx` `useToast` | none | | | | | | | restyle v2 | |
| Prefill (`?prefill=<key>`) | `takePrefill` (`prefill.ts:66-91`), sessionStorage `ch.messages.prefill.<key>` | existing DM: draft into `drafts` unless one exists (M 205-211); else New message seeded (M 212-213); nothing is sent | coach surfaces; recipients checked against the team directory (`onRoster`, M 188-204) | draft cut to 2000 (prefill.ts 52, 80) | field filled; URL replaced (M 186) | none on roster: CH-7001; some dropped: CH-7001 with the count | | none | today's; AK11c fields read with the flag on or off (05 table) | `20261028140800` (held): Ask's poll prefill stays off |
| Prefill `conversationId`, `poll`, `attachment`, `returnTo` | AK11c fields (05 table) | new in M's `pre` branch: `conversationId` → `select(id)` if in `convs`, else the one-player DM, else CH-7015; `poll` → open `PollSheet` with new `seed`; `attachment` → `File` "Board.png" from Ask's blob into `AttachChips`; `returnTo` → back key `router.back()` once | coach | `takePrefill` must accept `conversationId` with no players (today null at prefill.ts 79); `keyOf` (33) must hash the new fields | | blob missing: text lands, "The board picture wasn't found. Make it again in Ask."; poll rejected: "Couldn't open the poll draft. Nothing was posted." | | none | AK11c (Ask lane) builds; v2 reads identically | `20261028140800` |
| Draft wins toast "You already had a draft here." | `drafts.get(existing.id)` (M 208) | none | | | | | | | new; M today keeps the draft silently | |

### W4 Hold, reactions, Seen by, polls: S-MSG.hold, S-MSG.holdseen, S-MSG.react, S-MSG.who-reacted, S-MSG.seen, S-MSG.poll, S-MSG.votes, S-MSG.poll-composer

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Hold lift menu rows | today's sheet rows (MP 567-611, MV 1123-1135) | new: `screens/messages/MessageLift.tsx`, `code="CH-7604"` | Edit and Delete only on your own; Seen by on your own group message; Copy only after removal | today's disabled rules | | | | none | v2; off: today's `Modal` | |
| Copy | message text | `navigator.clipboard.writeText` | | | toast "Copied" | clipboard refused: today's toast | | | v2 | |
| Delete for everyone | own message | `api.remove` (M 765-773) → `removeMessage` (UGM 1273) → `deleteGolfMessage` (AM 1402, `deleteMessage` 1310) | sender only, `golf_messages_update_v2` (soft delete) | confirm CH-7501 | optimistic removal; toast "Message deleted" | CH-7008; the hook refetches and the bubble returns (UGM 1279-1298) | thread channel UPDATE removes it for everyone | none | today's | a poll can't be deleted on production until `20261028140800` (HELD.md 267): the CHECK refuses the NULL payload, CH-7008 |
| Reaction badges, bar, double-tap Like | `useMessageReactions` (`hooks/golf/use-message-reactions.ts`), `reactionMap` (M 449-463) | `react` (M 775-784) → `setReaction` (use-message-reactions.ts 145-172): insert or delete on `golf_message_reactions` | members: `golf_message_reactions_select`, `_insert`, `_delete` (`20260908160000`) | one emoji of `MESSAGE_REACTIONS`; one write at a time | not optimistic today: the badge lands after the refresh that follows the write (157), about one round trip; the pop plays then | CH-7009; nothing to roll back | `golf-reactions:<conv>` postgres changes and focus refetch (129-133) | none | today's write; v2 look | none |
| Who reacted | `ChReaction.userIds` (M 457) | none | members | | | missing person "Member" (MV 781) | as reactions | none | v2 sheet | |
| Seen by pill, sheet | `readMarks` (UGM 214-262, `fetchSeenTimes`), `useSeenBy` (seen-by.tsx 29), `listTitle` (111) | none | `golf_participants_select_v2`; seen times through `golf_read_marks_visible` and `golf_message_seen_times` (`20261025010000`, applied 25 Oct) | your own message in a group | | read map fails: `receipts.status` error with retry (M 786) | participants UPDATE on the thread channel, monotonic (UGM 976-995) | none | v2 look | none |
| Poll card, counts, bars, voters | `useMessageResponses` (`hooks/golf/use-message-responses.ts`), `tallyPoll`, `pollShare` (`lib/golf/message-polls.ts:178, 227`) | none | members: `golf_message_responses_select` (`20261024090000`) | | | responses fail: today's error line, retry (M 805-808) | `golf-responses:<conv>` (use-message-responses.ts 130) | none | v2 look | none |
| Vote, change, take back | your row | `vote` (M 789-802) → `responses.vote` (use-message-responses.ts 167-215): upsert on `(message_id, user_id)` or delete | members: `_insert`, `_update` (`20261025020000`), `_delete`; guard `golf_message_responses_poll_guard` (`20261025020100`) | one choice unless `multi` (`encodeChoice`, message-polls.ts 145) | optimistic at once | restores your row (`restore`), then CH-7030 "Voting has ended" for closed or deleted, CH-7029 otherwise | responses channel | none | today's | none |
| Close poll | `poll.closedAt` | `closeGolfPoll` (`app/golf/actions/message-polls.ts:179`, impl 140-170) | sender only (158); `golf_messages_update_v2`; `golf_messages_poll_freeze` allows `closed_at` once (`20261025020200`) | confirm `ClosePollModal` (polls.tsx 516) | card reads Closed | CH-7027 | thread channel UPDATE (payload compared, UGM 293-297) | none | today's | none |
| Remind | `pollWaiting` (message-polls.ts 231) | fills the composer with `pollRemindDraft` as a reply (polls.tsx 238-252); never sends by itself | coach, open poll | never "Remind 0" | field filled | | | the eventual send notifies as a message | today's | |
| Poll composer (+ → Poll) and Send | `PollSheet` (polls.tsx 615) | `polls.send` (M 809-832) → `sendGolfPoll` (message-polls.ts:175, impl 47-138) | participant (message-polls.ts 70-78); `golf_messages_insert_v2` plus `golf_messages_poll_freeze` shape check | question ≤ 140, 2 to 6 choices ≤ 60, end ≤ 30 days (`lib/golf/message-polls.ts:14-17, 242`) | card lands at once via `insertConfirmed`, deduped against the realtime insert (M 823) | sheet stays with the server's reason; an earlier copy is reported, not resent (D19) | thread channel INSERT; list refetch | W7 "Poll from {name}" | today's; v2 discard confirm | none |

### W5 Details, mute, new, confirm, add, announcements: S-MSG.details, S-MSG.groupdetails, S-MSG.mute, S-MSG.confirm, S-MSG.add, S-MSG.new, S-MSG.fresh, S-MSG.announcement, S-MSG.new-announcement

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Header, Members | `getGolfConversationParticipantIdentities` (`app/golf/actions/messages.ts:85`) via M 385-418, names from the directory | none | members only | | coaches first, then by name | `membersError` with retry | after add or remove, reread (M 875, 891) | none | today's, v2 look | |
| Class status card | `useTeamClassDay`, `useConversationTeam` (M 81-84) | none | coach only: `classOn = awareness && data.role === 'coach'` (M 82); `data.role` comes from the server route, so a player's hooks read nothing and the card is absent from the DOM | | | absent | | none | v2 card; `class_awareness_v1` as today | |
| Quick action Search | `searchMessages` scoped to the conversation | none | | | | | | | today's | |
| Quick action Files, shared files card | `getGolfConversationFiles` (message-attachments.ts:547, impl 456-545), metadata only, 100 rows (506); image tiles sign through `api.attachments` | none | members | | | today's files error | | none | today's | |
| Quick action Profile | `ChPerson.playerId` | link to the player's stats with the roster lane's href helper | coach viewing a direct thread with a player only; not rendered for a player (SETTLED-4NOV 20) | | | | | | v2 | |
| Mute menu and switch | `mute` (M 557-581) | `setMute` → `muteConversation` (M 596-604) | as W1 Mute | as W1 | as W1 | CH-7011; the switch returns | list channel | silences that person's email, push and bell | today's actions, v2 look | |
| Leave group | | `leaveGolfGroup` (AM 2161, impl 2107-2159) via M 843-854 | own row, `golf_participants_delete` (`20260907160000`) | confirm CH-7502 | toast "You left the group"; thread closes; list refetch | CH-7010 | list refetch; for other members the participant count changes on their next list read | none | today's | 11h: the leave trigger unpins |
| Add member | `getGolfGroupAddCandidates` (AM 1948) | `addGolfGroupMember` (AM 2015, impl 1954-2013) via M 868-877 | group creator only; `golf_participants_insert_v2` (`20261017003000`) and `golf_user_on_conversation_team` | | toast "Added {first} to {group}" | CH-7018 | members reread | none | today's | |
| Remove member | members | `removeGolfGroupMember` (AM 2091, impl 2022-2089) via M 878-896 | creator only, never self, team group only; `golf_participants_delete` | confirm CH-7504 | row leaves at once | CH-7024; the list is put back (M 894) | members reread; the removed person's client learns as W2 Removed | none | today's | 11h: unpins for them |
| New message, suggestions | `directory` (`loadMessagesDirectory`, `data/messages.ts:43`) | `startDirect` → `createGolfConversation` (`app/golf/actions/messages.ts:336`, impl 274-334); group: coach `createGolfTeamBroadcast` (AM 1111), player `createGolfConversation` | `golf_conversations_insert_v2` (BASE 19004), `golf_participants_insert_v2`; the action's audience probe (`withGolfAction` `rlsContext`, messages.ts 336-349) | a coach's group needs a player (CH-7105, M 345-350) | thread opens at once (`setStarted`, M 331) | CH-7002 / CH-7003; coaches not added: CH-7019 | list refetch | none until the first message | today's, v2 token look | |
| Hello card starters | static copy (05 settled: coach and player sets) | fill the field only | | | | | | none | v2 | |
| Announcement detail, Acknowledge, task | `getAnnouncementDetail` (`app/golf/actions/announcements.ts:1264`, team and recipient checks 1009-1060) | `acknowledgeAnnouncement` (`app/golf/actions/communication.ts:141`), `completeAnnouncementTask` (announcements.ts:1337) | player; ack and task rows for their own player id | | toasts (M 975-990), list reread | CH-7012 / CH-7013 | `loadAnns` after the write | none | today's, v2 look | |
| `?announcement=<id>` (11f) | new: `'announcement'` in `linkKey` (M 173); id looked up in `anns` | `selectAnn(id)` | the id must be in the viewer's list (active team, addressed to them) | | detail at rest | not in the list: "That announcement isn't available." | | Ask's push and bell are Ask's lane | v2 only; off: ignored | none |
| New announcement (coach) | | `createEnrichedAnnouncement` (announcements.ts:741) via M 991-1004 | coach only: the action refuses without a coach row (270-277); the entry renders only for `viewer.role === 'coach'`, never for a player | title required; today's limits | toast "Posted to {team} · {title}"; detail opens | CH-7014; sheet keeps its text | `loadAnns` | `notifyTeamAnnouncement` (announcements.ts:21) to the addressed players, gated by their settings | today's, v2 sheet | |

### W6 Pin sync (PR 11h)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Pins on every device | new: `use-conversation-pins.ts`; `golf_conversation_pins` own rows (`golf_conversation_pins_select_own`, `pin-sync/20261031150000_golf_conversation_pins.sql:108`) | `golf_pin_conversation(uuid, boolean)`, `golf_reorder_conversation_pins(uuid, uuid[])` (no table grants, 113) | own; membership and limit 3 per team under an advisory lock | D1 to D9 (PIN-SYNC section 3) | optimistic | PIN-SYNC section 5 copy; the pin reverts | private `golf-pins:<user>` (`golf_pins_receive` on `realtime.messages`) | none | reads `golf_messages_redesign_v1`; off: no probe, `pinned.ts` | held: device pins, nothing on screen says so |

### W7 Notifications this lane touches

| event | code that sends | category | who receives | deep link | respects settings |
|---|---|---|---|---|---|
| New text message | `sendGolfMessageImpl` (AM 785-799) → `notifyGolfMessageRecipients` (FAN 34) | email (`email_messages`, default on), push `new_message` (`push_messages`, default off; `lib/notifications/push.ts:45`), bell row `golf_calendar_notifications` type `message` (FAN 209-221) | every other member of the conversation except those muted (FAN 61-66) | push `/golf/dashboard/messages?conversation=<id>` (push.ts 113-124); bell `action_url` the same (FAN 214); tap `lib/utils/push-registration.ts:296-317` | email and push through `gatedDelivery` with quiet mode (FAN 151, 175); the bell is not gated by settings (deliberate, FAN 200-203) but mute removes it; class hold under `class_awareness_v1` (FAN 158-169) |
| Message with files | `sendGolfMessageWithAttachmentsImpl` (message-attachments.ts 302-306), same fan-out | same | same | same | same |
| Poll | `sendGolfPollImpl` (message-polls.ts 133-136), title "Poll from {name}", body with the end | same | same | same | same |
| Notify anyway | the coach's flag stored on insert (`20261025070300`), push not held, stamp after a real delivery (FAN 188-198) | push | same | same | push settings still apply |
| Announcement | `notifyTeamAnnouncement` (announcements.ts:21) | push `team_announcement` (`push_announcements`), bell, email | addressed players | `/golf/dashboard/announcements` (push.ts 127-132) | yes |
| Reactions, votes, edits, deletes, mute, pins, typing, read | none | none | | | |

The unread badge on Messages: `useNotificationBadges` (`contexts/notification-badge-context.tsx:313`), 45 s poll and on visibility (57, 254-268), from `countUnreadMessages` (`lib/golf/unread-message-count.ts:72`, hidden conversations skipped at 80; bug H1 is fixed on 03d9087). New v2: Messages calls `badges.refetch()` after a mark read (row menu, open, the arrival mark at UGM 911-921 once `msgs.loading` settles), a delete, a leave and on `online` (fixes M3).

### W8 The lane flag

| where | read | off |
|---|---|---|
| `config/feature-flags.yml` | new `golf_messages_redesign_v1`, shape of `golf_clubhouse_ui` (862-889), `default: false`, every environment false | |
| Server | `routes/messages.tsx` (22-49): `const redesign = isFlagEnabled('golf_messages_redesign_v1')` (synchronous, `lib/flags/is-enabled.ts:78`), spread onto `ChMessagesData` (`data/messages.ts:9-36`) as `redesign` | `false` |
| Client | `Messages` puts `redesign` on `ChMessagesApi`; `data-ch-ms-v2` on the root; `MessagesPhone`, `MessagesView`, `MessagesDesktop` branch at component level; `useGolfMessages(..., { typingExpiryMs: redesign ? 5000 : 3000 })`; the row typing listener, the mute glyph, the lift, the poll sheet look, the details push, the removed state, the L3 fallback, the M1 hit filter, `?announcement=`, the badge refetches and the 50 minute re-sign run only when true | today's components, listeners and timers exactly |
| Preview | `clubhouse-preview/[screen]/page.tsx` passes `redesign: true` to the fixture | n/a |
| 11h | `use-conversation-pins.ts` reads `api.redesign`; false makes no request to the pins table | `pinned.ts` only |

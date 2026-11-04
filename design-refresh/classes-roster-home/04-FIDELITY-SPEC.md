# Fidelity spec: Classes, Roster, coach Home

Nick, 31 Oct: "I want all of the designs to be accurately reflected in the builds. Sometimes they don't match up and I'm like what is the point of redesigning it if it's not gonna actually look like that."

So the rule for every PR in this package: **the build is a copy of the design page, not a reading of it.** Values come from `redesign/redesign.css`, not from a screenshot or memory. Where the app has a token for a value, use the token, and the value must be the same. Where something can't be built as drawn, it is listed in section 8 with the fix; nothing else may differ.

Design page: `redesign/clubhouse-phone-redesign.html` (open it in a browser; online as Clubhouse Phone Redesign, version 5).
Exact CSS: `redesign/redesign.css` (543 lines, the page's own styles minus the review chrome, with a header mapping each section to app files).

## 1. Capture links: open any state directly

Every screen, view and state on the design page has a link, so the builder and the screenshot script land on exactly what to match. Add tokens after `#`, joined with `-`, in any order after the screen:

| Token | Meaning |
|---|---|
| `classes`, `roster`, `home` | Screen (first, required) |
| `phone`, `desktop` | View. Phone is 390pt; desktop is the >820px layout |
| `light`, `dark` | Theme |
| `coach`, `player` | Role (Roster only; Classes is the player, Home is the coach) |
| `profile` | Roster: the first player's profile pushed open (phone) |
| `reduce` | Reduce Motion on (charts drawn in place, crossfades only) |
| `early` | Early season: today's staging data shape (2 rounds each, totals only) |
| `loading`, `empty`, `failed` | The screen's loading, empty and failed states |
| `long` | Long names, long course and class names |
| `big` | A 25-player roster |
| `xxl` | Largest Text Size (`--k` 1.36, the app's XXL cap) |

Examples: `#roster-phone-dark-coach-early`, `#classes-phone-light-loading`, `#home-desktop-dark-failed`, `#roster-phone-light-player-big-xxl`.
The page's control bar has the same switches (View, Theme, Role, Motion, Text Size, State, and the 6.1 and 6.9 inch phone sizes, 390pt and 430pt).

## 2. Tokens: design name to app token

`--k` is Text Size. **In the app every size is `calc(N * var(--ch-type-k))`**, because `--ch-type-k` already carries the px unit (`tokens.css` line 269: one CSS pixel at default size). The page writes the same thing as `calc(Npx * var(--k))` with a unitless `--k`. Translate mechanically: `calc(34px*var(--k))` becomes `calc(34 * var(--ch-type-k))`. Avatars cap at `min(--k, 1.2)` as drawn.

`--edge` is the page edge: 16px, 20px at 414pt and wider (`--ch-page-x-phone`).

"new" tokens go in PR 1 (tokens only) with light and dark values from this table and a contrast assertion each in `contrast-tokens.test.ts`. Dark values sit under `html[data-fw-theme='dark'] [data-ui='clubhouse']`.

| Design | Light | Dark | App token |
|---|---|---|---|
| `--pg` | `#F2F0E9` | `#0E120F` | `--ch-grouped-bg` |
| `--sf` | `#FFFEFB` | `#191E1A` | `--ch-card-bg` |
| `--sf2` | `#F8F6F0` | `#1D231F` | new --ch-card-bg-raised (sheet sections, peek) |
| `--well` | `#F6F4EE` | `#141815` | `--ch-well-bg-flat` |
| `--tile` | `#FFFEFB` | `rgb(255 255 255/.09)` | new --ch-tile-bg (week strip tiles) |
| `--ring` | `rgb(28 27 24/.07)` | `rgb(255 255 255/.06)` | `--ch-card-ring` |
| `--ring2` | `rgb(28 25 18/.05)` | `rgb(0 0 0/.3)` | inside --ch-card-shadow |
| `--sep` | `rgb(28 27 24/.10)` | `rgb(241 236 223/.10)` | `--ch-separator` |
| `--shadow` | `rgb(28 25 18/.12)` | `rgb(0 0 0/.5)` | inside --ch-card-shadow |
| `--ink` | `#1C1B18` | `#F1ECDF` | `--ch-text-primary` |
| `--ink2` | `#46433D` | `#D0C9B8` | `--ch-text-secondary` |
| `--ink3` | `#46433D` | `#D0C9B8` | `--ch-text-secondary` |
| `--ink4` | `#5F5C55` | `#ADA697` | `--ch-text-tertiary` |
| `--g900` | `#082B1C` | `(same)` | `--ch-green-900` |
| `--g800` | `#0B3A25` | `(same)` | `--ch-green-800 (--ch-field-green)` |
| `--g700` | `#0F4A2F` | `(same)` | `--ch-green-700` |
| `--g600` | `#155A39` | `(same)` | `--ch-green-600` |
| `--g500` | `#1F6B45` | `(same)` | `--ch-green-500` |
| `--mint` | `#7BC79A` | `(same)` | `--ch-hero-mint-strong` |
| `--mint2` | `#9FE0B6` | `(same)` | `--ch-hero-mint` |
| `--gtint` | `rgb(21 90 57/.10)` | `rgb(124 199 155/.12)` | new --ch-accent-tint |
| `--link` | `#155A39` | `#7CC79B` | `--ch-accent` |
| `--on-g` | `#FFFFFF` | `#FFFFFF` | `--ch-text-on-accent` |
| `--gain` | `#14613D` | `#7CC79B` | `--ch-gain` |
| `--loss` | `#9A5700` | `#E7AE57` | `--ch-loss` |
| `--flag` | `#B3261E` | `#F28B7D` | `--ch-flag` |
| `--warn-bg` | `rgb(154 87 0/.10)` | `rgb(231 174 87/.12)` | new --ch-warn-bg |
| `--warn-fg` | `#7A4500` | `#F0C77E` | new --ch-warn-ink |
| `--warn-ic` | `#9A5700` | `#E7AE57` | new --ch-warn-icon |
| `--warn-ring` | `rgb(154 87 0/.22)` | `rgb(231 174 87/.24)` | new --ch-warn-ring |
| `--hero` | `#0A331F` | `#08150E` | `--ch-frame` |
| `--hero-ink` | `#F4F1E8` | `(same)` | `--ch-on-green-plate` |
| `--hero-ink2` | `rgb(244 241 232/.84)` | `(same)` | new --ch-on-green-2 (84%) |
| `--hero-ink3` | `rgb(244 241 232/.72)` | `(same)` | new --ch-on-green-3 (72%) |
| `--av-bg` | `#E9E3D3` | `#2A2E27` | new --ch-coin-bg (neutral coin) |
| `--av-fg` | `#5A4E36` | `#DCD3BC` | new --ch-coin-ink |
| `--av-ring` | `rgb(90 78 54/.22)` | `rgb(220 211 188/.18)` | new --ch-coin-ring |
| `--seg` | `(see redesign.css)` | `(see redesign.css)` | `--ch-well-bg (today .ch-seg)` |
| `--seg-sh` | `(see redesign.css)` | `(see redesign.css)` | today .ch-seg track shadow |
| `--seg-chip` | `linear-gradient(180deg,#1f6b45 0%,#0f4a2f 100%)` | `linear-gradient(180deg,#23704a 0%,#1d613f 100%)` | `--ch-seg-on-bg` |
| `--seg-chip-sh` | `(see redesign.css)` | `(see redesign.css)` | today .ch-seg chip shadow |
| `--seg-on` | `#F9F7F1` | `#F9F7F1` | `--ch-seg-on-ink` |
| `--seg-off` | `#46433D` | `#D0C9B8` | `--ch-text-secondary` |
| `--seg-off-tsh` | `0 1px 0 rgb(255 255 255/.6)` | `none` | today .ch-seg |
| `--seg-mid` | `#DDD8CA` | `#0D110E` | (fallback only) |
| `--seg-chip-mid` | `#0F4A2F` | `#1D613F` | (fallback only) |
| `--mist-t` | `#DCE2E3` | `#1E2A2D` | `.ch-cl-t-mist --ch-cl-t` |
| `--mist-f` | `#3E5055` | `#B9CCD1` | `.ch-cl-t-mist --ch-cl-tf` |
| `--mist-b` | `#C4CDCF` | `#2F3E42` | `.ch-cl-t-mist --ch-cl-tb` |
| `--clay-t` | `#EBDDD3` | `#2C221D` | `.ch-cl-t-clay --ch-cl-t` |
| `--clay-f` | `#6A4A3C` | `#E0C2B0` | `.ch-cl-t-clay --ch-cl-tf` |
| `--clay-b` | `#D9C2B2` | `#41322A` | `.ch-cl-t-clay --ch-cl-tb` |
| `--sand-t` | `#EFE6D2` | `#2B2619` | `.ch-cl-t-sand --ch-cl-t` |
| `--sand-f` | `#6B5A33` | `#DFCB9F` | `.ch-cl-t-sand --ch-cl-tf` |
| `--sand-b` | `#DDCFAE` | `#423928` | `.ch-cl-t-sand --ch-cl-tb` |
| `--stone-t` | `#E5E2DB` | `#25231F` | `.ch-cl-t-stone --ch-cl-t` |
| `--stone-f` | `#4F4B43` | `#D3CDC0` | `.ch-cl-t-stone --ch-cl-tf` |
| `--stone-b` | `#CFCAC0` | `#39362F` | `.ch-cl-t-stone --ch-cl-tb` |
| `--sage-t` | `#DEE5D9` | `#1E271F` | `.ch-cl-t-sage --ch-cl-t` |
| `--sage-f` | `#3F5444` | `#B8CEBB` | `.ch-cl-t-sage --ch-cl-tf` |
| `--sage-b` | `#C3CFBF` | `#2E3B30` | `.ch-cl-t-sage --ch-cl-tb` |
| `--frame` | `#0A331F` | `#08150E` | `--ch-frame` |
| `--on-g-ink` | `#F4EEDD` | `(same)` | `--ch-on-green-ink` |
| `--on-g-soft` | `rgb(240 233 214/.86)` | `(same)` | new --ch-on-green-soft (bar icons) |
| `--champ` | `#E2C98F` | `(same)` | new --ch-champagne-dot (bar dot, ‹ Back) |
| `--yr-sr` | `#1F6B45` | `#2A7A51` | `--ch-yr-sr` |
| `--yr-jr` | `#3D6787` | `#46739A` | `--ch-yr-jr` |
| `--yr-so` | `#86672C` | `#8F6E31` | `--ch-yr-so` |
| `--yr-fr` | `#9A4A35` | `#A3533E` | `--ch-yr-fr` |
| `--yr-ink` | `#FFFFFF` | `(same)` | `--ch-yr-ink` |
| `--chip-on` | `#FDFCF8` | `rgb(255 255 255/.10)` | `--ch-ivory-25` |
| `--glass` | `rgb(253 251 247/.78)` | `rgb(22 27 23/.74)` | `--ch-glass-bg (strip and Up next only)` |
| `--sheet` | `#FFFEFB` | `#1B201C` | `--ch-sheet-bg` |
| `--card-shadow` | `(see redesign.css)` | `(see redesign.css)` | `--ch-card-shadow (DESIGN_LANGUAGE §4)` |

Classes tones: the light values above already equal `.ch-cl-t-*` in `classes.css`. Dark: keep the app's existing dark tones (`classes.css` 1864 on); they differ from the page by 2 to 3% lightness and are the board's tones everywhere else. That is the one colour where the app wins (section 8).

## 3. Type, spacing, radii, shadows

Instrument Sans only. Tabular figures on every number. True minus (−), "E" for even, "—" for no data.

| Role | Page value (default Text Size) | App |
|---|---|---|
| Large title | 600 34/1.2, −0.034em, `wdth` 88 | `--ch-type-large-title` |
| Bar title (green bar) | 600 18/1, −0.012em, `#F4EEDD` | today's `.ch-topbar` title (unchanged) |
| Pushed page title | 600 17/1, centred | today's `.ch-pbar` |
| Context line | 400 15/1.33, secondary | `--ch-type-meta` |
| Card title | 600 17/1.3, −0.012em | `--ch-type-card-title` |
| Card meta / link (right of title) | 400 15/1.3, secondary / accent | `--ch-type-meta` |
| Row title | 500 16/1.3, −0.005em, one line, ellipsis | `--ch-type-row` |
| Row subtitle | 400 15/1.33, secondary, one line, ellipsis | `--ch-type-meta` |
| Row figure | 600 17/1, tabular | `--ch-type-figure` |
| Row figure caption | 400 13/1, tertiary | `--ch-type-caption` |
| Chip | 600 13/1, radius 7, padding 5×8 | today's chip |
| Captain tag | 600 12/1, radius 7, padding 4×7 | new, in `roster.css` |
| Button | 600 15.5/1, height 46, radius 12, padding 0 18 | today's button |
| Home greeting | 600 34/1.1, `wdth` 88 | `--ch-type-large-title` |
| Home date | 400 15/1, `--hero-ink3` (72%) | |
| Home brief | 400 15/1.45, `--hero-ink2` (84%) | |
| Empty / failed title | 600 16/1.3 | |
| Empty / failed body | 400 14/1.45, max 34ch | |

Spacing and shape (all from `redesign.css`):
- Page edge 16, 20 at ≥414pt. Card radius 16. Sheet top radius 20. Feature cards radius 16 (Home hero: bottom radius **24**, full bleed).
- Card header padding 14 16 12; note padding 12 16 14; rows 10 16, min height 52 (one line) or 64 (two lines, with a coin). Hairlines inset 16 (60 after a coin), 0.66px, none after the last row.
- Sections 24 apart; `tight` sections 12 apart. Large title: 116 from the top of the screen (under the 98pt bar plus its 16pt lip), 16 below.
- Card shadow: `0 0 0 1px rgb(28 27 24/.07), 0 1px 2px rgb(28 25 18/.05), 0 8px 20px -12px rgb(28 25 18/.12)`; dark: `0 0 0 1px rgb(255 255 255/.06), inset 0 1px 0 rgb(255 255 255/.04)`.
- Touch targets 44×44 minimum (bar icons are 44×44 with a 12 radius press wash at 8% white).

## 4. Components: the numbers that make or break the match

Each line names the selector in `redesign.css`; copy the whole rule.

**Shared**
- Green bar `.tb.is-g`: 98pt tall including the status bar; padding 54 6 0 16; title left; right slot 44pt icon buttons. Lip `.tb.is-g::after`: 16pt rounded mask in `--ch-frame` so the parchment tucks under. On scroll past 8px the bar stays put and a 14pt shade (`rgb(0 0 0/.10)` to clear) fades in under it (`::before`, 180ms linear). No glass, no hairline, no title moving.
- Champagne dot `.tb__dot` 7×7 `#E2C98F`. Bell badge `.gbell em` 19pt pill, `--ch-green-700` fill, 1.5px ivory ring, 650 11/19.
- Pushed page bar `.tb.is-g.is-push`: columns 120 / 1fr / 120; "‹ Roster" in champagne, name centred 600 17, ellipsis.
- Sticky controls `.ctlbar`: sticky at top 98, page colour behind it, padding 6 edge 10, full bleed.
- Segmented `.seg`: today's `.ch-seg` look exactly; buttons 32 high; chip radius 12, track radius 16, padding 4, gap 4.
- Coin `.av` 32 (×min(k,1.2)), 650 12 initials; sizes 26 / 40 / 76 for `sm` / `md` / `xl`. Year colours `.y-sr` etc. fill with the year colour and white initials.

**Classes**
- Term card `.term`: `--ch-frame` fill, radius 16, padding 18 16 16, gap 16. Week well `.well` 66×66 radius 18, inset shade. Overlap chip `.ovchip` amber on green: `rgb(231 174 87/.18)` fill, `#F6D69E` text. Credits bar `.crbar` 10 high, 3 gaps, flex by credits. Term line `.tl` with `.tl__today` marker and finals marks `.tl__m`.
- Today ribbon `.ribbon` / `.rb`: 28 high well, radius 8, 7 AM to 5 PM scale, class blocks in their tone, team practice green.
- Time column `.trow .row__t`: **58 × k wide, never wraps** (time 600, AM/PM under it).
- Binder `.bind`: tone fill `--ch-cl-t`, 1px inset ring `--ch-cl-tb`, radius 16, padding 16 16 14, gap 12; course code large; credits chip; week strip `.wk` 5 columns, gap 5, today's tile ringed; room in a dashed footer.
- Class sheet: 90% height; join requests sheet 62%; round sheet 74%. Grabber 36×5.

**Roster**
- Team card `.rhero`: `--ch-frame` fill, radius 16, padding 16 16 14. Class mix `.mix` 12 high, gaps 3, year colours, legend `.mixlg`. Footer `.rhero__f`: top five coins (30) and their mean. Coaches only for the waiting count and the top five.
- Leaders `.ldrs` / `.ldr`: horizontal scroll snap (`x mandatory`, start), card width min(62%, 220), radius 16, fill = year colour 11% over the card, ring = year colour 24%.
- Join requests `.req`: one card row, coin stack, count badge, opens the sheet.
- Player row: coin, name + `.capt`, note, `.form5` (44×24, five bars, gap 3, radius 2, min 5 high; green `.g` beat the team average, amber `.l` more than 2 over; neutral otherwise), figure, chevron.
- Profile head `.phero`: centred, coin 76, name, hometown, `.ychip` (pill, year colour 14% fill, text year colour 62% into ink).

**Home**
- Hero `.hhero`: full bleed, `--ch-frame`, padding 54 edge 20, bottom radius 24, one continuous green with the bar. Bar row: crest `.hcrest` 32 circle ivory with the flag, "Home" 600 18, chevron, dot; ringed bell on the right.
- Up next `.next`: glass on green, `rgb(255 255 255/.08)` fill, 1px inner ring 13%, radius 16, padding 16.
- Team scoring `.form`, The team's game `.legs` 2×2 cells split by hairlines, diverging bars `.dbar` 8 high, radius 4, from a centre zero.
- This week `.week` 7 columns. Latest rounds rows 64 with `.score` well 54×48, radius 13; red only under par.

**Desktop** (>820px): `.desk` shell with the existing sidebar; team card and leaders across the top (`.dldrs`); table `.dtable` with sticky header; `.drow` rows; peek `.peek` with `.p4` figures and the year chip.

## 5. Every state and sub page, and where to check it in the app

The preview routes are `/clubhouse-preview/<screen>?state=<state>` (`src/app/clubhouse-preview/[screen]/page.tsx`). Where a state has no fixture yet, the PR adds one (fixtures only; no loader or data change).

| What | Design link | App preview |
|---|---|---|
| Classes | `#classes-phone-light` | `classes` |
| Class detail sheet | tap a Today row or a binder | `classes`, tap a class |
| Classes loading / empty / failed | `-loading` `-empty` `-failed` | `classes?state=loading` / `empty` / `failed` |
| Classes long names | `#classes-phone-light-long` | **add** `classes?state=long` |
| Classes, no team | (as today) | `classes?state=noteam` |
| Roster coach | `#roster-phone-light-coach` | `roster` |
| Roster player | `#roster-phone-light-player` | `roster-player` |
| Player profile (push) | `#roster-phone-light-coach-profile` | `roster`, tap a row |
| Join requests sheet | tap Join requests | `roster`, tap the requests row |
| Roster early season (today's real data) | `-early` | **add** `roster?state=early` |
| Roster loading / empty / failed | `-loading` `-empty` `-failed` | `roster?state=…`, `roster-player?state=…` |
| Roster long names | `-long` | **add** `roster?state=long` |
| Roster 25 players | `-big` | **add** `roster?state=big` |
| Roster injured | the Injured card | `roster?state=availability` |
| Coach Home | `#home-phone-light` | `home` |
| Round sheet | tap a Latest rounds row | `home`, tap a round |
| Section strip | tap "Home ⌄" (any title) | any screen, tap the title |
| Home loading / empty / failed | `-loading` `-empty` `-failed` | `home?state=loading` / `empty` / `failed` |
| Home, events only / no rounds | (Today and This week only; scoring cards hidden) | `home?state=eventsonly` / `norounds` |
| Largest Text Size | `-xxl` on any link | Settings > Text Size XXL, or `--ch-type-scale` 1.36 |
| Dark | `-dark` on any link | `golf_theme` = dark |
| Reduce Motion | `-reduce` | Playwright `reducedMotion: 'reduce'` |
| Desktop | `-desktop` on any link | same routes above 820px |

Rules for states:
- Loading: skeleton bars inside the card that will hold the data, `--ch-separator` fill, radius 6, a 1.6s opacity pulse to 55% that stops under Reduce Motion. The feature card loads as a green block with 16% ivory bars. No spinners, no shimmer sweep.
- Empty and failed: inside the card, centred: 44 icon circle (accent tint; amber for failed), title, one sentence, buttons. Failed always says nothing was lost and offers Try again.
- Early season: two rounds each, totals only, so no form bars (two neutral stubs), no SG ("—"), no leaders, no top five, rows read "Early read · 2 rounds".
- Long names: one line with ellipsis in rows; profile head wraps to two lines, centred; class names in binders wrap to two lines then ellipsis.
- 25 players: the list just grows; the class mix and counts are computed, nothing is truncated.

## 6. Mechanics: what every tap, swipe and toggle does

| Where | Gesture | Result | Back |
|---|---|---|---|
| Any green bar title ("Classes ⌄") | tap | Section strip drops under the bar; chevron turns 180° | tap again, or pick a section |
| Bell | tap | Notifications, as today | as today |
| Classes + | tap | Menu: Add class, Import schedule (today's sheets) | dismiss |
| Overlap chip | tap | Smooth scroll to the Overlaps card (instant under Reduce Motion) | |
| Today row, binder | tap | Class detail sheet rises (90%) | ✕, tap the dimmed page, or swipe down |
| Status switch | tap | Toggles sharing class status with coaches (today's write) | tap again |
| Roster sort (Avg / SG / Name; Name / Class / HCP) | tap | Chip springs over; rows slide to their new order | |
| Leaders row | swipe | Horizontal scroll with snap to each card | |
| Leader card, player row (coach) | tap | Profile pushes in from the right (desktop: peek selects) | "‹ Roster" or edge swipe |
| Player row (player view) | — | Not tappable, as today | |
| Join requests row | tap | Requests sheet (62%) with approve / decline per person (today's flow) | ✕ or dim |
| Home bar "Home ⌄" | tap | Section strip | |
| Waiting on you capsules | tap | The item's own page, as today | |
| Up next | tap | The event, as today | |
| Team stats, The team's game names | tap | Stats, at that leg where today's links do | |
| Latest rounds row | tap | Round sheet (74%) | ✕ or dim |
| Desktop roster row | click | Peek on the right selects that player | |

## 7. Motion

| Moment | Trigger | Duration | Curve | What moves | Reduce Motion |
|---|---|---|---|---|---|
| Press | pointer down on a card, button, leader | 110ms down, 280ms back | `cubic-bezier(.22,1,.36,1)` | scale 0.97 (rows: 5% ink wash, no scale) | wash only, no scale |
| Sheet in | tap that opens it | 462ms | `--ch-ease-spring-smooth` (`linear()` in redesign.css `--smooth`) | sheet from 102% to 0; page dims to 32% black over 260ms | `CH_FADE_MS` (180ms) opacity crossfade |
| Sheet out | ✕, dim, swipe | 280ms | `--ch-ease` | sheet back to 102% | `CH_FADE_MS` (180ms) crossfade |
| Push | tap a player | 462ms | smooth spring | profile 100% to 0; roster to −24% (`CH_UNDERLAY_SHIFT`) and dims 10% | `CH_FADE_MS` (180ms) crossfade, nothing slides |
| Pop | ‹ Roster | 280ms (330ms then unmount) | `--ch-ease` | reverse | `CH_FADE_MS` (180ms) crossfade |
| Section strip | tap the title | 462ms in / 180ms fade | smooth spring | strip from −12px, fades in | appears in place |
| Large title | scroll | scroll-linked over the first 56px | linear | scales to 86% and fades to 10% (origin left) | fade only |
| Bar shade | scroll past 8px | 180ms | linear | 14pt shade under the bar fades in | same |
| Segmented chip | tap | 360ms | `cubic-bezier(.34,1.3,.64,1)` | chip slides; label weight crossfades 360ms | instant |
| Sort reorder | sort change | 360ms | `cubic-bezier(.22,1,.36,1)` | FLIP: each row from its old y to its new y | instant |
| Chart grow | Home first shown | 360ms once | `cubic-bezier(.22,1,.36,1)` | SG bars scale X from the zero line | drawn in place |
| Switch | tap | thumb 462ms `--settle`; track 260ms linear | | thumb 20px | instant |
| Skeleton pulse | while loading | 1.6s loop | ease-in-out | opacity 1 to 0.55 | static |

Never: count-up numbers, entrance staggers, animated blur or shadow on scroll, motion on re-render. Settings > Animations off behaves as Reduce Motion.

Note: DESIGN_LANGUAGE.md section 8 still says the large title "moves into the bar; bar hairline fades in". That line predates the green bar. Section 5 of the same file and this page are right: the green bar keeps its own title and nothing moves into it.

## 8. Can't be built as drawn, and the fix

Nick settled every open row on 31 Oct ("Go with your picks"). The design page (version 6) now draws these fixes, so the page and this table agree.

| On the page | Why not | Fix | Decided |
|---|---|---|---|
| Captain tag | No captain field anywhere in the data | No tag (removed from the page). `.capt` stays in redesign.css for when a field exists | Nick, 31 Oct |
| "Injured · back Nov 16" | Availability has no return date | Chip reads "Injured" (page updated) | Nick, 31 Oct |
| Injured vs inactive | Injured is an availability flag; inactive is team access | Card titled "Injured" from availability; injured players count as active ("7 active · 1 injured"); inactive keeps today's handling (page updated) | Data rule |
| Season label | Seasons turn over on 1 August | "2026–27 season" (on the page, phone and desktop) | Nick's rule, Oct 24 |
| "Varsity" | No squad name in the data | Removed; the team name is the context line | Data rule |
| Finals, Thanksgiving, next-week travel on Classes | No source for finals or holidays; events load for this week only | Term line reads "6 weeks left · term ends Dec 15"; no finals marks; Soon lists only the term end and this week's team events (page updated). The Overlaps card follows today's loader: this week's conflicts only, hidden when there are none. The page's sample overlap (Fri, Nov 6) stands in for one | Nick, 31 Oct |
| Top five, leaders | Need 3+ rounds per player; staging has 2 | Hidden until 5 players qualify (top five) or 1 (leaders); this is the `early` state | No (built in) |
| SG on rows | Totals-only rounds have no SG | "—" | No |
| Team averages | Three different averages on Home and Roster | One definition (last 10 countable rounds), labelled where shown | No |
| "vs D1" | No D1 baseline; SG baseline is the team's `sg_baseline`, else Tour | Label reads the team's baseline name | No |
| Practice rounds in averages | Today they count | Leave practice rounds out of every scoring average, the leaders and the top five; they still show in Latest rounds | Nick, 31 Oct |
| Home hero seam | In hero mode the shell bar paints a radial light over `#0B3A25` (shell.css 1305–1310) while its lip uses `--ch-frame`, so a `--ch-frame` hero shows a seam | Change the hero-mode bar background at shell.css 1306 to `var(--ch-frame)`. One CSS line; player Home's bar changes too, on purpose | Nick, 31 Oct |
| Desktop "Needs a look" strip (`.ch-rs-attn`) | Overlaps the new Needs a look leader card | Remove the strip on desktop; the leader card replaces it | Nick, 31 Oct |
| Classes dark tones | App's board tones differ by 2 to 3% | Keep the app's dark tones | No |
| BUILD_BRIEF PR 10 says hero radius 20, greeting 28pt | The approved page has 24 and 34 | Build the page: 24 and 34 | No |

## 9. Fidelity check: a PR is done only when it matches

1. Run the app on the preview route and the design page on its capture link, same width (390 and 430), same theme, same Text Size, Reduce Motion on for stills. `capture/capture.mjs` does both in one go (README).
2. Put each pair side by side (`capture.mjs compare`). Look at full size. List every difference in the PR as **matches**, **fixed**, or **can't match (section 8 row)**. Anything else blocks the PR.
3. Measure, don't eyeball, the five things that drift most: page edge (16 / 20), card radius (16), row heights (52 / 64), the 58pt time column, and the bar height (98 with its 16pt lip). Use the browser inspector on both.
4. Motion: record the push, a sheet, the sort, the strip and the large title on both (Playwright `recordVideo`, 390 wide), with and without Reduce Motion. Durations and curves must be the ones in section 7.
5. Mechanics: walk section 6 for the screen and confirm each row, including Back.
6. Dark, XXL, long names, 25 players, loading, empty, failed: one still each.
7. Run the banned list (DESIGN_LANGUAGE.md section 10). No accent left-border cards anywhere.

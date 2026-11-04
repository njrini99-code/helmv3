# 06 Screen specs: Classes, Roster, coach Home
> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 16 spec blocks, CP-6.1 to CP-6.16).
> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Lane: `design-refresh/classes-roster-home/`. Design page: `redesign/clubhouse-phone-redesign.html` (approved by Nick on 31 Oct as version 6; now version 7, which only adds the missing `refresh`, `download` and `copy` icons on the failed and empty state buttons). This file is the build contract for every screen, sheet, push and inline part in the lane, element by element, top to bottom in the order the eye meets it. Screen IDs match `05-SCREENS.md` and `07-MOTION.md`.

Every value below was read off the design page's own CSS and JS (the `<style>` block, lines 7 to 618, and the render functions in the `<script>`), not from memory or from 04. Where `04-FIDELITY-SPEC.md` says something else, this file wins and the difference is listed in section 14. Where the app's existing token has a different value from the page, section 1.2 says which one to build.

Contrast ratios were computed in a script (WCAG 2.x relative luminance, alpha layers composited over the surface they actually sit on, `color-mix()` resolved in sRGB as the page does). 283 pairs were measured in light and dark. Every pair under target is listed in its screen section with its fix. Each screen's table sits in that screen's section; the shared, sheet and desktop tables and a roll-up of all 47 pairs under target, with fixes, are section 13. Section 14 lists every place where 04, 02 or the app disagrees with the HTML.

## 0. How to read this file

- `k` is iPhone Text Size: the page's unitless `--k` (0.88 to 1.36), the app's `--ch-type-k` (which carries the px unit). A size written `16k` means `calc(16 * var(--ch-type-k))` in the app and `calc(16px*var(--k))` on the page. A size without `k` is fixed and does not scale.
- `edge` is the page edge: 16px, 20px on phones 430 wide and up (`--ch-page-x-phone`, already `--ch-space-5` from 414px in `tokens.css`). Desktop uses 24px inside its main column.
- Type is written `weight size/line-height tracking`. Line heights given as a ratio (1.3) multiply the scaled size. `tab` means `font-variant-numeric: tabular-nums`. Instrument Sans only; `wdth 88` means `font-variation-settings: "wdth" 88`.
- Colours are written as the app token, then `light / dark` hex. Alpha colours are written `rgb(r g b / a)`. Where a token is marked **new**, it is added in the shared tokens PR (02-PLAN 2.1) with the values given.
- Boxes are written `width x height`, padding `T R B L`, `r` = radius. "fill" = stretches to the parent, "hug" = sizes to content.
- Hit area: at least 44 x 44pt. Where the drawn box is smaller, the row says how the 44 is reached (padding, a `::before` inset of the stated size, or the parent row).
- Data: the field each value comes from, pointing at the row in `03-DATA-CHECKS.md` ("03 Roster: Counts" means the Roster table, row "Counts"). The no-data glyph is the dash U+2014, written here as "the no-data dash".
- Contrast targets: text 4.9:1 target, 4.5:1 floor; large text (24pt and up, or 19pt and up at weight 700) and non-text glyphs 3:1. "Decorative" means the mark repeats information that text next to it already carries, so 1.4.11 does not require 3:1; it is still listed.
- Widths: phone 390 (6.1 inch, 16px edge), large phone 430 (6.9 inch, 20px edge), desktop 1280 (the page's `.desk`, shown above 820px).

## 1. Shared rules for every screen in this lane

### 1.1 Settled, not to be reopened

1. The green top bar stays exactly as today: `--ch-frame` #0A331F / #08150E, 98pt tall on the design page (54 status plus a 44 row), switcher left, bell or the page's own action right. In the app it is `PhoneTop` and `.ch-topbar` unchanged (02-PLAN section 1); its real height is `env(safe-area-inset-top) + --ch-phone-topbar-h (50px)`.
2. The page under the bar is flat `--ch-grouped-bg`, with a 34pt large title and one 15pt context line. Nothing else sits on the page.
3. No accent left-border cards anywhere. Status is a dot, a chip or coloured text.
4. Phone edge 16px, 20px at 430 and up.
5. Text follows iPhone Text Size; at XXL (`k` 1.36) nothing clips. One-line items ellipsize; multi-line items wrap.
6. Contrast: 4.9:1 target, 4.5:1 floor; large text and glyphs 3:1.
7. Reduce Motion: an opacity crossfade over `CH_FADE_MS`, 180ms today (`lib/motion.ts`, `chFade('fade')` on `--ch-ease`; `--ch-dur-vt-fade` in CSS; owner decision of 24 Oct, pinned by a test); nothing travels (see 07). The page's `.rm` rules use 120ms; the build uses 180ms.
8. The segmented control is the app's green chip (`ui/Segmented.tsx`, `.ch-seg`).
9. Practice rounds stay out of every average, the leaders and the top five.
10. Players never see a teammate's own figures (no averages, SG, form bars or top five in the player DOM, not just hidden).

### 1.2 Token map: where the app's token today differs from the page

The page's token map is in 04 section 2. These rows are where mapping a page token to the app token named in 04 would give a different colour at `main` 75b4956. Build the page value; the "Use" column says how.

| Page | Page light / dark | App token in 04 | App today light / dark | Use |
|---|---|---|---|---|
| `--ink2` (secondary text) | #46433D / #D0C9B8 | `--ch-text-secondary` | `--ch-ink-700` #3A3833 / #E2DCCD | Re-point `--ch-text-secondary` to `--ch-ink-600` in the tokens PR, as DESIGN_LANGUAGE section 3 already states. Until then use `--ch-ink-600` directly. |
| `--ink4` (tertiary) | #5F5C55 / #ADA697 | `--ch-text-tertiary` | `--ch-ink-600` #46433D / #D0C9B8 | Re-point `--ch-text-tertiary` to `--ch-ink-500` light; dark needs #ADA697 (the app's dark `--ch-ink-500` is #BAB3A4), so set the dark value explicitly. |
| `--link` | #155A39 / #7CC79B | `--ch-accent` | #155A39 / **#23704A** | Dark `--ch-accent` is a fill colour (2.9:1 as text on the dark card). **new** `--ch-accent-ink` #155A39 / #7CC79B for links, chip text and icons. |
| `--g600` as a fill (primary button, badge, strip chip "on", desktop pill "on") | #155A39 / #155A39 | `--ch-green-600` | #155A39 / **#6BBB8C** | The app's dark green-600 is a mint for text; white on it is 2.2:1. Use `--ch-green-fill-600` (#155A39 / #23704A, white on dark 6.02:1) and accept the one-step-lighter dark fill, or add **new** `--ch-fill-strong` #155A39 both themes. Pick one; this file writes `--ch-green-fill-600`. |
| `--g700` (bell badge fill) | #0F4A2F / #0F4A2F | `--ch-green-700` | #0F4A2F / **#84C9A0** | Same hazard. Use `--ch-green-fill-700` (#0F4A2F / #1D613F). |
| `--g500` (chart line, spark, week dots) | #1F6B45 / #1F6B45 | `--ch-green-500` | #1F6B45 / #6DB488 | Map to `--ch-green-500`. The app's dark value is the fix for the dark chart contrast failure (2.61:1 on the page, 6.87:1 with #6DB488). |
| `--sheet` | #FFFEFB / #1B201C | `--ch-sheet-bg` | **#FDFBF7** / #1B201C | Light differs by 1 to 2 levels. Use `--ch-sheet-bg`; note it in the PR as "matches". |
| Sheet dim | `rgb(0 0 0 / .32)` | `--ch-scrim` | `rgb(20 20 18 / .36)` / `rgb(2 6 4 / .58)` | Use `--ch-scrim` (the dialog's own scrim, driven by `--ch-scrim-a`). The page's .32 black is a stand-in. |
| `--glass` (strip) | `rgb(253 251 247 / .78)` / `rgb(22 27 23 / .74)` | `--ch-glass-bg` | `rgb(250 248 241 / .70)` / same | The strip is today's section strip (must not change). Use the app's. |
| `--chip-on` dark | `rgb(255 255 255 / .10)` | `--ch-ivory-25` | #1D231E | Not drawn on these screens; no action. |
| Large title colour | `--ink` #1C1B18 / #F1ECDF | `--ch-type-large-title` | `.ch-large-title` colour `--ch-ledger-ink` `rgb(18 59 41 / .9)` / `rgb(226 238 229 / .94)` | The page draws ink. The shared large-title rule draws forest ink. Owner decision 4 (24 Oct) made one title style everywhere; keep `.ch-large-title` as is and record "can't match: shared title colour" (green-black vs black, 1.3:1 apart, both over 12:1). |
| Large title tracking | -0.034em | `--ch-track-large-title` | -0.038em | Same reason; keep the shared value. |

Settled 3 Nov: the dark Sophomore fill is **#8B6B30**, not the page's #8F6E31, so white initials read 4.95:1 (the page's value gives 4.73:1, under the 4.9 target). Same hue, 3% darker. Light Sophomore #86672C stays (5.26:1).

Other page tokens map 1:1 to the app or to the **new** tokens in 04 section 2 (`--ch-card-bg`, `--ch-grouped-bg`, `--ch-card-ring`, `--ch-card-shadow`, `--ch-separator`, `--ch-well-bg-flat`, `--ch-gain`, `--ch-loss`, `--ch-flag`, `--ch-warn-bg`, `--ch-warn-ink`, `--ch-warn-icon`, `--ch-warn-ring`, `--ch-accent-tint`, `--ch-on-green-2`, `--ch-on-green-3`, `--ch-coin-bg`, `--ch-coin-ink`, `--ch-coin-ring`, `--ch-tile-bg`, `--ch-card-bg-raised`, `--ch-champagne-dot`, `--ch-yr-*`).

Short names used in the tables below (all values light / dark):

| Short | Token | Light | Dark |
|---|---|---|---|
| page | `--ch-grouped-bg` | #F2F0E9 | #0E120F |
| card | `--ch-card-bg` | #FFFEFB | #191E1A |
| raised | `--ch-card-bg-raised` (new) | #F8F6F0 | #1D231F |
| well | `--ch-well-bg-flat` | #F6F4EE | #141815 |
| tile | `--ch-tile-bg` (new) | #FFFEFB | rgb(255 255 255 / .09) |
| ring | `--ch-card-ring` | rgb(28 27 24 / .07) | rgb(255 255 255 / .06) |
| sep | `--ch-separator` | rgb(28 27 24 / .10) | rgb(241 236 223 / .10) |
| ink | `--ch-text-primary` | #1C1B18 | #F1ECDF |
| ink2 | `--ch-text-secondary` (re-pointed, 1.2) | #46433D | #D0C9B8 |
| ink4 | `--ch-text-tertiary` (re-pointed, 1.2) | #5F5C55 | #ADA697 |
| link | `--ch-accent-ink` (new) | #155A39 | #7CC79B |
| fill | `--ch-green-fill-600` | #155A39 | #23704A |
| gain | `--ch-gain` | #14613D | #7CC79B |
| loss | `--ch-loss` | #9A5700 | #E7AE57 |
| flag | `--ch-flag` | #B3261E | #F28B7D |
| tint | `--ch-accent-tint` (new) | rgb(21 90 57 / .10) | rgb(124 199 155 / .12) |
| warn-bg | `--ch-warn-bg` (new) | rgb(154 87 0 / .10) | rgb(231 174 87 / .12) |
| warn-ink | `--ch-warn-ink` (new) | #7A4500 | #F0C77E |
| warn-ic | `--ch-warn-icon` (new) | #9A5700 | #E7AE57 |
| frame | `--ch-frame` | #0A331F | #08150E |
| on-g | `--ch-on-green-ink` | #F4EEDD | #F4EEDD |
| on-g-soft | `--ch-on-green-ink-soft` | rgb(240 233 214 / .86) | same |
| champ | `--ch-champagne-dot` (new) | #E2C98F | #E2C98F |
| h-ink | `--ch-on-green-plate` | #F4F1E8 | #F4F1E8 |
| h-ink2 | `--ch-on-green-2` (new) | rgb(244 241 232 / .84) | same |
| h-ink3 | `--ch-on-green-3` (new) | rgb(244 241 232 / .72) | same |
| mint | `--ch-hero-mint-strong` | #7BC79A | #7BC79A |
| mint2 | `--ch-hero-mint` | #9FE0B6 | #9FE0B6 |
| coin | `--ch-coin-bg` / `--ch-coin-ink` / `--ch-coin-ring` (new) | #E9E3D3 / #5A4E36 / rgb(90 78 54 / .22) | #2A2E27 / #DCD3BC / rgb(220 211 188 / .18) |
| yr-sr, yr-jr, yr-so, yr-fr | `--ch-yr-*` (new) | #1F6B45, #3D6787, #86672C, #9A4A35 | #2A7A51, #46739A, **#8B6B30**, #A3533E |
| sheet | `--ch-sheet-bg` | #FDFBF7 (page #FFFEFB) | #1B201C |
| card-shadow | `--ch-card-shadow` (new) | `0 0 0 1px ring, 0 1px 2px rgb(28 25 18/.05), 0 8px 20px -12px rgb(28 25 18/.12)` | `0 0 0 1px ring, inset 0 1px 0 rgb(255 255 255/.04)` |

### 1.3 Shared components (used by every section below)

**Card** (`.panel`, app `Surface variant="card"`): fill width minus 2 x edge; `card` fill; r 16; `card-shadow`; `overflow: hidden`. No border, no left rule.

**Card header** (`.card__h`): display flex, baseline aligned, space-between, gap 10; padding 14 16 12 16; height 48.1 at k 1 (22.1 line plus 26). Title `h2`: 600 17k/1.3 -0.012em, `ink`, wraps (no max lines; at XXL a long title wraps under itself and the meta stays on the first line). Meta `.m`: 400 15k/1.3, `ink2`, one line, `white-space: nowrap`, never ellipsized (meta strings are short and fixed). Action `.a`: 400 15k/1.3, `link`, button with no padding; hit area: a `::before` of 44 x 44 centred on the text. Hairline under the header: 1px `sep` scaled 0.66 (0.66px), from x 16 to the right edge.

**Card note** (`.card__note`): padding 12 16 14 16; 400 15k/1.33 `ink2`, `text-wrap: pretty`, at most 2 lines at k 1 (law 6), wraps freely at larger sizes; hairline above it from x 16, 0.66px `sep`.

**Row** (`.row`, app `GroupRow`): display flex, centre aligned, gap 12; min height 52 (one line) or 64 (two lines or a coin); padding 10 16 10 16; full width. Hairline between rows: `::before` at top, 0.66px `sep`, from x `--inset` (16 by default, 60 after a 32 coin: 16 + 32 + 12) to the right edge; none above the first row. Title `b`: 500 16k/1.3 -0.005em `ink`, one line, ellipsis. Subtitle: 400 15k/1.33 `ink2`, one line, ellipsis, 3 below the title. Trailing value `.row__v`: right aligned grid, gap 3; figure 600 17k/1 -0.01em `ink` tab; caption 400 13k/1 `ink4` tab nowrap. Chevron: `chevron-right` 15, stroke 2.4, `ink4`, margin-right -4. A tappable row is a `button`; its whole box is the hit area (52 or 64 by full width).

**Coin** (`.av`, app `Avatar`): circle, 32 x min(k, 1.2) (32 at k 1, 38.4 at XXL); initials 650 12 x min(k,1.2) +0.01em, centred. Neutral: `coin` fill, `coin` ink, 1px inset `coin` ring. Year: fill `yr-*`, initials #FFFFFF, `inset 0 0 0 1px rgb(0 0 0/.10), inset 0 1px 0 rgb(255 255 255/.16)`. Sizes: `sm` 26 (10pt initials), `md` 40 (14pt), `xl` 76 (26pt); these three do not scale with k. Coach, invitee and unknown-year coins stay neutral. Year from `classYearKey(classYear)` (02-PLAN 2.2; 03 Roster: Row coin colour). Missing name: initials "?" (build rule; not drawn).

**Chip** (`.chip`): inline-flex, gap 4, padding 5 8, r 7; 600 13k/1, nowrap; `tint` fill with `link` text. Amber chip (`.chip.amber`): `warn-bg` fill, `warn-ink` text. Height 23 at k 1, so a tappable chip needs a 44 hit area (none of the chips on these screens is tappable except the overlap chip, below).

**Buttons** (`.btn`): height 46, padding 0 18, r 12, gap 7; 600 15.5k/1. Default: `card` fill, `ink` text, `0 0 0 1px ring, 0 1px 2px rgb(28 25 18/.05)`. Primary (`.pri`): `fill` background, #FFFFFF text, `inset 0 1px 0 rgb(255 255 255/.12), 0 6px 14px -8px rgb(11 58 37/.7)`. Danger (`.dan`): `flag` text on the default fill. Height grows with k only through its text (the 46 is fixed; at XXL 15.5 x 1.36 = 21pt text sits inside 46 with no clip).

**Empty and failed block** (`.ste`): inside the card that would hold the data. Grid, centred, gap 6, padding 26 20 22. Icon disc 44 x 44 circle, margin-bottom 6: empty `tint` fill with a `link` 20 icon (stroke 2.2); failed `warn-bg` fill with a `warn-ic` icon (`alert`). Title 600 16k/1.3 `ink`, balance. Body 400 14k/1.45 `ink2`, max 34ch, pretty. Buttons row: wrap, centred, gap 10, margin-top 12; buttons 42 high, 14.5k text. Failed always says nothing was lost and offers Try again (`refresh` 16).

**Skeleton** (`.sk`): `sep` fill, r 6, 1.6s pulse to opacity 0.55 (07 M-CRH-35). On the green card: `rgb(244 241 232 / .16)`. Skeleton row: same box as the real row (64 with a 32 coin skeleton, 52 without), two bars 13 and 11 high, gap 7, widths step down (52%, 47%, 42% and 70%, 63%, 56%), a 34 x 16 bar on the right. Skeleton feature card: `frame` fill, padding 18 16 16, gap 12, min height 168, four bars (14, 26, 10, 12 high). Loading is never a spinner or a sweep.

**Sheet** (`.sheet`): full width, height 90% / 74% / 62% of the screen (per sheet), r 20 20 0 0, `sheet` fill, shadow `0 -10px 40px -10px rgb(0 0 0/.35)`. Grabber 36 x 5, r 3, `color-mix(ink 22%)`, 7 from the top, centred. Header: flex, padding 8 14 8 18; title 650 17k/1.2 `ink`; close button 32 x 32 circle, `color-mix(ink 8%)` fill, `x` 16 stroke 2.4 `ink2`; its hit area is 44 x 44 (a 6pt `::before` inset all round). Body: scrolls, padding 4 edge 40 edge, gap 14, scrollbar hidden. Dim behind: `--ch-scrim` (page draws `rgb(0 0 0/.32)`), tap closes. In the app this is the existing dialog sheet with `useSheetDrag` (grab and header drag).

**Large title block** (`.lt`, app `LargeTitle` with `context`): text box top at 116 from the top of the screen (18 under the 98 bar, 2 under the 16 lip). Title 600 34k/1.2 (app `--ch-type-large-title` is 34/41: the line box is 41 at k 1 against the page's 40.8, inside the 2pt tolerance), `wdth` 88, one line; at XXL (46pt) a long title wraps to two lines, never ellipsized. Context line: margin-top 2, 400 15k/1.33 `ink2`, one line, ellipsis. Margin under the block 16. So the first card's top sits at 195 at k 1.

**Sticky control bar** (`.ctlbar`, app `.ch-stickybar`): sticky at top 98 (app: `calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top))`), z above the list, full bleed (margin 0 -edge), padding 6 edge 10 edge, `page` fill behind it, margin-bottom 4. No blur, no hairline, no shadow. Height 56 at k 1 (with the page's 32 segments) or 60 with the stock 36 segments.


## 2. Shared chrome: the green bar (on S-CLASSES, S-ROSTER, S-ROSTER-PLAYER, S-ROSTER.profile)

Not a screen ID of its own: it is today's `PhoneTop` and must not change (02-PLAN section 1). This section is the redline the side-by-side checks it against. Home's bar row is drawn inside the hero (section 9).

| Element | Box | Type | Colour (light / dark) | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Status bar | full width x 54, padding 6 30 0 36 | 600 16/1 (fixed) | #FFFFFF on `frame` (`.status.on-g`) | signal 18 x 11, battery 26 x 12 | none | system |
| Bar | full width x 98 (54 + 44 row), padding 54 6 0 16, grid `minmax(0,1fr) auto`, `frame` fill, no shadow, no blur, no hairline | | `frame` #0A331F / #08150E | | | |
| Lip | full width x 16, at bottom -16, `frame` fill masked by two 16px radial corners | | `frame` | | none, `pointer-events: none` | |
| Switcher title "Classes" | hug, padding 8 10, r 10, margin-left -10 (so the text starts at x 16), gap 6, inline-flex | 600 18k/1 -0.012em, nowrap | `on-g` #F4EEDD / #F4EEDD | `chevron-down` 16, stroke 2.4, `on-g-soft`; turns 180 degrees when the strip is open | the 44 bar row by the text width + 20 (at least 44 x 44) | section name, fixed copy |
| Champagne dot | 7 x 7 circle, margin-left 2, after the chevron | | `champ` #E2C98F | | part of the title button | shows when another section has news (as today) |
| Right icon key | 44 x 44, r 12, no fill; pressed `rgb(255 255 255/.08)` | | glyph `on-g-soft` | bell 21 (stroke 2), plus 22 (2.2) on Classes, user-plus 21 (2.1) on Roster coach | 44 x 44 drawn | Classes: Add or import; Roster coach: Invite players; Roster player: bell |
| Bell badge | min 19 x 19, padding 0 5, r 10, top 3 right 2 of the key, ring `0 0 0 1.5px on-g` | 650 11/19 (fixed) tab, centred | `on-g` text on `--ch-green-fill-700` #0F4A2F / #1D613F (page #0F4A2F both) | | part of the bell | unread count; hidden at 0; "99+" cap as today |
| Bar shade | `::before`, full width x 14 under the bar, `linear-gradient(rgb(0 0 0/.10), transparent)` | | | | none | shows once scrolled past 8px (07 M-CRH-05) |

Pushed-page bar (`.tb.is-g.is-push`, app `.ch-pbar`): grid `120px 1fr 120px`, padding-left 8. Back: `chevron-left` 22 stroke 2.4 plus "Roster" 500 17k/1, `champ`, padding 8 6, gap 2; hit area the full 120 x 44 cell. Title: 600 17k/1 `on-g`, centred, one line, ellipsis, max-width 100% of the middle column (150 at 390, 190 at 430). Right: `more` 21 stroke 2.4 in a 44 key, `on-g-soft`.

Contrast (light / dark, computed): bar title 12.03 / 16.12; bar glyphs 8.88 / 11.52; champagne dot 8.62 / 11.55; badge text 8.88 / 8.88 on the page's #0F4A2F (6.39 dark with `--ch-green-fill-700` #1D613F, still a pass); badge ring on the bar 12.03 / 16.12; Back text 8.62 / 11.55; pushed title 12.03 / 16.12; status time 13.94 / 18.68. Badge fill against the bar is 1.35 / 1.82, which needs no fix: the 1.5px ivory ring is the edge that meets the bar (12.03 / 16.12).

XXL: title 24.5pt in the fixed 44 row, no clip; a long section name ellipsizes before the right key (min 0 column). 430: identical, the 16 inset stays 16 (the bar does not use `edge`). Desktop: the bar is not drawn; the desktop shell's sidebar replaces it.

Redline (bar):
1. Bar height 98 on the design capture; in the app `env(safe-area-inset-top) + 50`.
2. Title text starts at x 16.
3. Title cap height centred in the 44 row (row top at 54).
4. Right key 44 x 44, its right edge 6 from the screen edge.
5. Lip radius 16, colour identical to the bar.
6. Shade 14 tall, 10% black at the top.
7. Badge 19 tall, top 3 inside the key.

## 3. S-STRIP: the section strip

What it is: today's section strip (`.ch-sw`, `docs/clubhouse/phone/section-strip.md`, approved 12 Oct), opened by tapping the bar title on any section and on Home. The page draws it as a row of capsules under the bar. Behaviour and look stay as today (must not change); this section records what the page draws so the capture can be compared.

| Element | Box | Type | Colour (light / dark) | Hit area | Data |
|---|---|---|---|---|---|
| Strip | absolute, top 98, full width, padding 8 edge 12 edge, flex gap 8, scrolls sideways (scrollbar hidden), z under the bar; height 50 at k 1 | | glass `--ch-glass-bg` rgb(250 248 241 / .70) (page .78) / rgb(22 27 23 / .74), `backdrop-filter: blur(24px) saturate(170%)`, bottom hairline `0 .5px 0 sep` | | |
| Capsule | hug, padding 8 14, r 999, `card` fill, `0 0 0 1px ring`; height 30 at k 1, 35 at XXL | 500 14k/1, nowrap | `ink` on `card` | 44 tall: a `::before` extending 7 above and below (the strip's 8 / 12 padding leaves room) | section list per role: coach Home, CoachHelm, Calendar, Stats, Messages, Team Hub, Roster, Qualifiers, Recruiting, Settings; player Home, CoachHelm, Rounds, Team Hub, Calendar, Messages, Roster, Qualifiers, My stats, Classes, Settings |
| Current capsule | same | 500 14k/1 | #FFFFFF on `fill` | same | the section shown |

Contrast (computed): capsule label 17.08 / 14.34; current capsule 8.22 / 8.22 on the page's #155A39 (6.02 dark with `--ch-green-fill-600` #23704A, a pass). Capsule edge against the glass is 1.05 / 1.06: decorative, the 1px ring and the label carry it. No fix needed.

States: closed (default, opacity 0, `translateY(-12px)`, no pointer events), open. Not drawn: a strip wider than the screen scrolls sideways with the current capsule scrolled into view on open (build rule, as today). XXL: capsules grow to 35 tall and the strip scrolls; nothing wraps. 430: same with 20 edge. Desktop: not shown (sidebar). Reduce Motion: appears with a 180ms (`CH_FADE_MS`) opacity fade in place.

Redline:
1. Strip top flush with the bar bottom (98).
2. Capsule height 30, radius full.
3. 8 between capsules, edge padding at both ends.
4. Current capsule green fill with white text.
5. Chevron in the bar rotated 180 degrees while open.


## 4. S-CLASSES: Classes (player)

Route `/golf/dashboard/classes`, players only. Design link `#classes-phone-light` (and `-dark`, `-xxl`, `-loading`, `-empty`, `-failed`, `-long`, `-desktop`). Order top to bottom: bar (section 2, right key = plus), large title, term card (the view's one feature card), Today, Overlaps, binders, status card, delete row. Gaps: `.sec` margin-top 24, `.sec.tight` margin-top 12. Scroll content padding 0 edge 48 edge.

### 4.1 Bar and large title

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Bar title | section 2 | "Classes" | | chevron + dot | section 2 | fixed |
| Right key "Add or import a class" | 44 x 44 | | `on-g-soft` | `plus` 22, stroke 2.2 | 44 x 44 | opens S-CLASSES.add-menu |
| Large title | 1.3 | 600 34k "Classes", one line (wraps at XXL only if the word cannot fit, which it can) | `ink` (shared title ink, 1.2) | | none | fixed |
| Context line | 1.3 | 400 15k/1.33 "Fall 2026 · Aug 20 – Dec 15", one line, ellipsis | `ink2` | | none | 03 Classes: Large title / context (`termOn` → `term.label/start/end`). Missing term: hide the line (build rule; not drawn) |

### 4.2 S-CLASSES.term: the term card (feature card)

Card: fill width, r 16, padding 18 16 16 16, grid gap 16, `frame` fill (#0A331F / #08150E), `card-shadow`, text `h-ink`. Exactly one green card on this view.

| Element | Box | Type | Colour (light / dark) | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Top row | flex, centre, gap 14 | | | | | |
| Week well | 66 x 66 fixed, r 18, fill `rgb(0 0 0/.22)` over the card, `inset 0 1px 3px rgb(0 0 0/.35), 0 1px 0 rgb(255 255 255/.08)`; contents centred | figure "11": 600 28k/.95 -0.04em tab; "of 17": 500 11.5k/1, margin-top 4 | figure `h-ink`; "of 17" `h-ink3` | | none | 03 Classes: Week well (`term.week`, `term.weeks`). Missing: hide the well, keep the heading |
| Heading | grid gap 4, min-width 0 | "Week 11": 650 20k/1.15 -0.02em; "6 weeks left · term ends Dec 15": 400 14k/1.35 | `h-ink`; `h-ink2` | | none | `weeks − week` and `term.end` (03 Classes: "6 weeks left"). One line each at k 1; wraps at XXL |
| Overlap chip | hug, margin-left auto, align top, padding 6 9, r 7, gap 5, fill `rgb(231 174 87/.18)`; 25 tall | 600 13k/1, nowrap | #F6D69E (new `--ch-warn-on-green`) | `alert` 13, stroke 2.4 | 44 x 44: `::before` inset -10 -6 (the chip is 25 tall) | `conflicts.length` this week (03 Classes: Overlap chip). "1 overlap" / "2 overlaps". Zero: chip hidden. Tap: smooth scroll to 4.4 (07 M-CRH-30) |
| Credits block | grid gap 8 | label row: 500 13k/1, space-between; "6 classes" left, "15 credits" right at 650 tab | `h-ink2`; total `h-ink` | | none | `termFigures` (sum of credits, null counts 0) |
| Credits bar | full width x 10, flex gap 3; each segment flex = its credits, r 3 | | segment fill = the class tone tint `--ch-cl-t` (light page tones; dark keeps the app's tones, 04 section 8) | | none | `c.credits`, `c.tone`, order by `created_at` |
| Term line | full width x 30, relative | | track: top 12, h 6, r 3, `rgb(255 255 255/.14)`; fill: top 12, h 6, r 3, `mint` #7BC79A, width = progress; Today knob: 20 x 20 circle at top 5, centred on the fill end, #F4EEDD, `0 0 0 4px rgb(123 199 154/.28), 0 2px 6px rgb(0 0 0/.4)` | | none, `aria-hidden` | `term.progress` (sample 61.2%). No finals marks (no source, Nick 31 Oct) |
| Soon list | grid 2 columns 1fr 1fr, gap 10 14, padding-top 12, border-top 1px `rgb(244 238 221/.14)` | date: 600 13k/1 tab; item: 400 15k/1.3 | date `mint2` #9FE0B6; item `h-ink` | | none | term end and this week's team events only (03 Classes: "Soon" list). Max 4 items (2 rows); zero events: only "Term ends". One line each, wraps at XXL |

### 4.3 S-CLASSES.today: Today card

Card with header "Today" and meta = weekday ("Saturday"). Two forms: a class day (rows only) and a day off (ribbon then rows of the next class day), as drawn.

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Header | 1.3 | "Today" / meta "Saturday" | `ink` / `ink2` | | none | `todayIso` |
| Ribbon block (day off only) | padding 14 16 10 16, grid gap 8 | | | | none | |
| Ribbon heading | flex space-between baseline | "No classes today" 650 16k/1.2; "Next: Monday, Nov 2" 500 13k/1 | `ink`; `ink2` (page `--ink3` = ink2) | | | `TodayClasses` next scan (7 days) |
| Ribbon | full width x 28, r 8, `well` fill, `inset 0 1px 2px rgb(28 25 18/.05)` (dark .3 black); 7 AM to 5 PM scale | | class block: top 3 bottom 3, r 5, tone tint `--ch-cl-t` with `inset 0 0 0 1px --ch-cl-tb`; practice block `mint` no ring | | none (`aria-label` "Monday from 7 AM to 5 PM") | classes (days, start, end) + `week.events`. left = (start − 7) / 10, width = duration / 10. Outside 7 to 5: clamp to the ends (build rule) |
| Axis | flex space-between | 400 13k/1 tab: "7 AM", "10", "1 PM", "5 PM" | `ink4` | | | fixed |
| Class row | `.row.trow`, min 52 (title + sub = 64 tall in practice), button | time col: see below; title 500 16k one line ellipsis; sub (room) 400 15k one line ellipsis | `ink`; `ink2` | tone dot 10 x 10 circle, fill `--ch-cl-t`, `inset 0 0 0 1.5px --ch-cl-tf`; chevron 15 | full row (64 x full width) | `c.start`, `c.tone`, `c.name`, `c.location`; dedupe by id + start (03) |
| Time column | width 58k fixed (78.9 at XXL), grid gap 2, never wraps | time 600 16k/1 tab nowrap; AM/PM 400 13k/1 | `ink`; `ink4` | | | `clockLabel(start)` |
| Practice row | `.row.trow`, not a button (no chevron) | "Team practice" / "Practice green" | `ink` / `ink2` | dot 10, `mint` fill, no ring | none | `week.events` (`toTeamEvent`) |

Rows: Monday's classes in start order, then the team event. Hairlines inset 16 (no coin).

### 4.4 S-CLASSES.overlaps: Overlaps card (inline part)

Shown only when this week has a conflict (hidden at zero; 04 section 8). Plain card, no tint, no edge. Anchor `#over` (the chip scrolls here, offset 110 from the top so the card clears the bar).

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Header | 1.3 | "Overlaps"; right: amber chip "1 this week" | `ink`; `warn-ink` on `warn-bg` | | none | `groups.length` |
| Lead row | `.row`, align top, padding-top 14 | title 500 16k/1.3, **wraps** (`white-space: normal`), up to 3 lines; sub 400 15k one line ellipsis | `ink`; `ink2` | icon tile 34 x 34, r 10, `color-mix(warn-ic 18%)` fill, `bus` 18 stroke 2 in `warn-ic` | none (not tappable) | `event.title`, `startMin`, `classes.length` ("Travel on Fri, Nov 6 overlaps 2 classes", "Fall Invitational · bus leaves 8:30 AM") |
| Class rows | `.row.trow` (not buttons) | as 4.3 with sub "BIOL 1010 · Science Hall 214" | | tone dot | none | `classes[]` of the group |
| Note | 1.3 | "Your coach sees this overlap too." | `ink2` | | | static copy |

### 4.5 S-CLASSES.binders: class binders

Stack, grid gap 12, one binder per class. Each binder is a `button`, full width, tone-filled identity card (not an accent edge).

| Element | Box | Type | Colour (per tone, light / dark from `.ch-cl-t-*`) | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Binder | fill width, padding 16 16 14 16, r 16, grid gap 12; fill `--ch-cl-t` (light: the page's tones, which equal `.ch-cl-t-*`; dark: the app's own tones, 04 section 8: mist #232C2E / ink #B9CACD / ring #3B494C, clay #30261F / #E2C1AF / #503E33, sand #2D2818 / #DCCB9C / #4C432A, stone #292824 / #D0CABE / #47443C, sage #222C24 / #BDD0C0 / #3B4B3D); shadow `inset 0 0 0 1px --ch-cl-tb, 0 1px 2px rgb(28 25 18/.06), 0 16px 30px -22px rgb(28 25 18/.45)` | | text `ink` | | whole card | opens S-CLASSES.class-sheet |
| Top row | flex space-between, align top, gap 10 | | | | | |
| Course code | flex baseline gap 7 | dept "BIOL" 700 12.5k/1 +0.08em (the one tracked label, it is a code); number "1010" 500 28k/.9 -0.045em tab | dept `--ch-cl-tf`; number `ink` | | | `tabParts(code)` |
| Credits chip | padding 5 8, r 7, fill `color-mix(card 62%)`, `inset 0 0 0 1px --ch-cl-tb`, nowrap | 600 13k/1 "3 cr" | `ink2` | | | `credits`; null: chip hidden |
| Name | grid gap 3 | 600 17k/1.22 -0.012em, balance, **2 lines then ellipsis** (line-clamp 2); professor: italic 400 15k/1.3, one line ellipsis | `ink`; `ink2` | | | `name`, `instructor` (missing: line hidden) |
| Week strip | grid 5 columns, gap 5 | day tile: letter 600 11.5k/1; start time 600 12k/1 tab under it, gap 3 | off tile: no fill, `inset 0 0 0 1px color-mix(tb 70%)`, letter `color-mix(tf 70%)`; on tile: `tile` fill, `0 1px 2px rgb(28 25 18/.12), 0 0 0 1px --ch-cl-tb`, letter `ink`, time `ink2`; today: ring `0 0 0 2px` green | | none | `days`, `clockLabel(start)`, `dayToken(todayIso)` |
| Day tile | height 46 x min(k,1.2) (55.2 at XXL), r 11, centred | | | | | |
| Footer | flex gap 8, padding-top 11, border-top 1px dashed `--ch-cl-tb` | 400 15k/1.2, room one line ellipsis | `ink2` | `pin` 14 stroke 2, `ink2` | | `location` |
| Travel flag | margin-left auto, padding 5 8, r 7, gap 4 | 600 13k/1 "Travel Fri" | `warn-ink` on `warn-bg` | `alert` 11 stroke 2.4 | | `conflictFlag` (03: the flag reads "Overlaps {title} Fri"); none: hidden |

### 4.6 S-CLASSES.status: status card

One card, no header. Shown only behind `class_awareness_v1`, as today.

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Switch row | flex gap 12, centre, padding 14 16 | title 500 16k/1.3; body 400 15k/1.35 wraps | `ink`; `ink2` | | the switch | `golf_player_class_settings.share_status` |
| Switch | 51 x 31, r 16; thumb 27 x 27 at 2, white, `0 3px 8px rgb(0 0 0/.15), 0 1px 1px rgb(0 0 0/.16)`; on: thumb +20, track #2E8A57; off: track `color-mix(ink 16%)` | | | | 51 x 44 (`::before` -7 top and bottom) | `role="switch"`, `aria-checked`. Today's write unchanged |
| Note row | `.row.note`, flex gap 12, padding 14 16, align top, min-height 0 | title 500 16k/1.3; body 400 15k/1.4 wraps | `ink`; `ink2` | `eye` 17 stroke 2, `link`, margin-top 2 | none | static copy |

### 4.7 Delete row

Separate card (`.sec.tight`), one `button.row.danger-row`, centred, 600 16k/1 `flag`, min 52, full width hit area. Today's confirm flow unchanged.

### 4.8 States

| State | Drawn | What shows |
|---|---|---|
| Loading | `#classes-phone-light-loading` | Large title and context as normal; skeleton feature card (four ivory 16% bars: 38% x 14, 62% x 26, 100% x 10, 54% x 12); "Today" card with 3 skeleton rows (52, no coin); "Your classes" card with 3 skeleton rows. No term card text, no spinner. |
| Empty | `-empty` | "Your classes" card with the empty block: icon `cap`, "No classes yet", "Add your schedule so practice and travel are planned around it. Your coach sees when you're in class. Your teammates don't.", buttons Import schedule (primary, `download` 16) and Add a class (`plus` 16). No term card. |
| Failed | `-failed` | "Your classes" card with the failed block: "Classes didn't load", "Check your connection and try again. Nothing you added is lost.", Try again. |
| Long names | `-long` | Class 2 name "English and Creative Writing 101 · Writing Seminar for First-Year Student-Athletes" wraps to 2 lines then ellipsis in the binder; room "Bauman Telecommunications and Media Center, Room 203" one line ellipsis in rows and the binder footer. Today rows ellipsize. |
| Day with classes | not drawn (sample is a Saturday) | No ribbon; rows only; meta = weekday. |
| No overlaps | not drawn | Overlaps card and the chip hidden. |
| No team (`?state=noteam`) | as today | Today card without the practice row; Overlaps hidden. |
| Offline or stale | not drawn | Keep the last good data (`use-last-good`), no banner beyond today's offline banner. |

### 4.9 Widths, dark, XXL

- 390: edge 16, cards 358 wide. Binder inner width 326; week tiles (326 − 20) / 5 = 61.2 wide.
- 430: edge 20, cards 390 wide, tiles 67.6. Nothing else changes.
- Desktop 1280 (`classes-desktop`): sidebar 232 + main (padding 28 36 40, gap 22). Header: kicker "Fall 2026 · Aug 20 – Dec 15" 500 14/1.2 `ink2`, title "Classes" 650 40/1 -0.035em `wdth` 88, actions Import schedule and Add class (primary), buttons 40 high 14.5. Term card as a row: grid `auto 1fr auto`, gap 22; well 84 x 84 with a 36 figure; heading 24; credits bar 12 high; overlap chip right; Soon in 4 columns across the bottom. Below: grid `1fr 340`, gap 22: left "Your classes" with count (650 20/1.15 `wdth` 94 heading, count 600 13 `ink2`) and binders in 3 columns, gap 14; right aside (sticky top 0, gap 14): Overlaps card with short rows (dot, code, time) and the status card. Desktop sizes do not scale with k.
- Dark: page tokens switch; the term card uses #08150E; binders keep the app's dark tones (classes.css 1864 on).
- XXL (k 1.36): time column 78.9; binder number 38pt; day tiles 55.2 high (capped at 1.2); Today rows grow to fit two lines of 21.8 and 20.4pt text (about 82); term heading wraps; overlap chip stays one line and may push the heading to wrap. Nothing clips.

### 4.10 Contrast

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Term card title "Week 11" 20/650 hero-ink on hero | 12.34 | 16.54 | 4.9 (floor 4.5) | pass |
| Term sub "6 weeks left" 14/400 hero-ink2 on hero | 9.13 | 11.79 | 4.9 (floor 4.5) | pass |
| Week well figure 28/600 hero-ink on well (black 22% over hero) | 14.04 | 17.07 | 3:1 | pass |
| Week well "of 17" 11.5/500 hero-ink3 on well | 7.86 | 9.03 | 4.9 (floor 4.5) | pass |
| Credits label 13/500 hero-ink2 on hero | 9.13 | 11.79 | 4.9 (floor 4.5) | pass |
| Credits total 13/650 hero-ink on hero | 12.34 | 16.54 | 4.9 (floor 4.5) | pass |
| Term line fill mint vs track (white 14% over hero) | 4.53 | 6.29 | 3:1 | pass |
| Term line Today knob #F4EEDD vs hero | 12.03 | 16.12 | 3:1 | pass |
| Soon date 13/600 mint2 on hero | 9.17 | 12.29 | 4.9 (floor 4.5) | pass |
| Soon item 15/400 hero-ink on hero | 12.34 | 16.54 | 4.9 (floor 4.5) | pass |
| Overlap chip 13/600 #F6D69E on amber 18% over hero | 7.08 | 9.55 | 4.9 (floor 4.5) | pass |
| Credits bar segment mist tint vs hero (glyph) | 10.64 | 1.31 | 3:1 | FAIL |
| Credits bar segment clay tint vs hero (glyph) | 10.50 | 1.27 | 3:1 | FAIL |
| Credits bar segment sand tint vs hero (glyph) | 11.23 | 1.27 | 3:1 | FAIL |
| Credits bar segment stone tint vs hero (glyph) | 10.78 | 1.27 | 3:1 | FAIL |
| Credits bar segment sage tint vs hero (glyph) | 10.83 | 1.29 | 3:1 | FAIL |
| Today "No classes today" 16/650 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Today "Next: Monday" 13/500 ink3 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Ribbon axis 13/400 ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |
| Ribbon practice block mint vs well (glyph) | 1.82 | 8.95 | 3:1 | FAIL |
| Ribbon mist block ring (tb) vs well (glyph) | 1.47 | 1.92 | 3:1 | FAIL |
| Ribbon mist block fill (t) vs well (glyph) | 1.19 | 1.26 | 3:1 | FAIL |
| Ribbon clay block ring (tb) vs well (glyph) | 1.55 | 1.77 | 3:1 | FAIL |
| Ribbon clay block fill (t) vs well (glyph) | 1.21 | 1.21 | 3:1 | FAIL |
| Ribbon sand block ring (tb) vs well (glyph) | 1.40 | 1.83 | 3:1 | FAIL |
| Ribbon sand block fill (t) vs well (glyph) | 1.13 | 1.22 | 3:1 | FAIL |
| Ribbon stone block ring (tb) vs well (glyph) | 1.48 | 1.84 | 3:1 | FAIL |
| Ribbon stone block fill (t) vs well (glyph) | 1.18 | 1.22 | 3:1 | FAIL |
| Ribbon sage block ring (tb) vs well (glyph) | 1.47 | 1.93 | 3:1 | FAIL |
| Ribbon sage block fill (t) vs well (glyph) | 1.17 | 1.24 | 3:1 | FAIL |
| Time "9:05" 16/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Time "AM" 13/400 ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |
| Class dot mist ring (tf) vs sf (glyph) | 8.38 | 9.98 | 3:1 | pass |
| Class dot clay ring (tf) vs sf (glyph) | 7.83 | 10.05 | 3:1 | pass |
| Class dot sand ring (tf) vs sf (glyph) | 6.64 | 10.52 | 3:1 | pass |
| Class dot stone ring (tf) vs sf (glyph) | 8.60 | 10.37 | 3:1 | pass |
| Class dot sage ring (tf) vs sf (glyph) | 8.12 | 10.42 | 3:1 | pass |
| Practice dot mint vs sf (glyph) | 1.99 | 8.44 | 3:1 | FAIL |
| Overlaps bus icon warn-ic on warn-ic 18% over sf | 4.32 | 5.90 | 3:1 | pass |
| Binder mist: code "BIOL" 12.5/700 tf on t | 6.46 | 8.42 | 4.9 (floor 4.5) | pass |
| Binder mist: number 28/500 ink on t | 13.15 | 12.10 | 3:1 | pass |
| Binder mist: name 17/600 ink on t | 13.15 | 12.10 | 4.9 (floor 4.5) | pass |
| Binder mist: professor 15/400 italic ink2 on t | 7.52 | 8.65 | 4.9 (floor 4.5) | pass |
| Binder mist: credits chip 13/600 ink2 on sf 62% over t | 8.87 | 9.65 | 4.9 (floor 4.5) | pass |
| Binder mist: day tile off "T" 11.5/600 tf 70% on t | 3.31 | 4.94 | 4.9 (floor 4.5) | FAIL |
| Binder mist: day tile on "M" 11.5/600 ink on tile | 17.08 | 9.14 | 4.9 (floor 4.5) | pass |
| Binder mist: day tile time 12/600 ink2 on tile | 9.77 | 6.53 | 4.9 (floor 4.5) | pass |
| Binder mist: today ring g600 vs t (glyph) | 6.28 | 1.74 | 3:1 | FAIL |
| Binder mist: room 15/400 ink2 on t | 7.52 | 8.65 | 4.9 (floor 4.5) | pass |
| Binder mist: Travel flag 13/600 warn-fg on warn-bg over t | 5.28 | 7.05 | 4.9 (floor 4.5) | pass |
| Binder clay: code "BIOL" 12.5/700 tf on t | 5.95 | 8.77 | 4.9 (floor 4.5) | pass |
| Binder clay: number 28/500 ink on t | 12.97 | 12.51 | 3:1 | pass |
| Binder clay: name 17/600 ink on t | 12.97 | 12.51 | 4.9 (floor 4.5) | pass |
| Binder clay: professor 15/400 italic ink2 on t | 7.42 | 8.95 | 4.9 (floor 4.5) | pass |
| Binder clay: credits chip 13/600 ink2 on sf 62% over t | 8.83 | 9.78 | 4.9 (floor 4.5) | pass |
| Binder clay: day tile off "T" 11.5/600 tf 70% on t | 3.16 | 5.09 | 4.9 (floor 4.5) | FAIL |
| Binder clay: day tile on "M" 11.5/600 ink on tile | 17.08 | 9.47 | 4.9 (floor 4.5) | pass |
| Binder clay: day tile time 12/600 ink2 on tile | 9.77 | 6.77 | 4.9 (floor 4.5) | pass |
| Binder clay: today ring g600 vs t (glyph) | 6.19 | 1.79 | 3:1 | FAIL |
| Binder clay: room 15/400 ink2 on t | 7.42 | 8.95 | 4.9 (floor 4.5) | pass |
| Binder clay: Travel flag 13/600 warn-fg on warn-bg over t | 5.22 | 7.23 | 4.9 (floor 4.5) | pass |
| Binder sand: code "BIOL" 12.5/700 tf on t | 5.40 | 9.15 | 4.9 (floor 4.5) | pass |
| Binder sand: number 28/500 ink on t | 13.88 | 12.47 | 3:1 | pass |
| Binder sand: name 17/600 ink on t | 13.88 | 12.47 | 4.9 (floor 4.5) | pass |
| Binder sand: professor 15/400 italic ink2 on t | 7.94 | 8.91 | 4.9 (floor 4.5) | pass |
| Binder sand: credits chip 13/600 ink2 on sf 62% over t | 9.05 | 9.76 | 4.9 (floor 4.5) | pass |
| Binder sand: day tile off "T" 11.5/600 tf 70% on t | 2.96 | 5.28 | 4.9 (floor 4.5) | FAIL |
| Binder sand: day tile on "M" 11.5/600 ink on tile | 17.08 | 9.43 | 4.9 (floor 4.5) | pass |
| Binder sand: day tile time 12/600 ink2 on tile | 9.77 | 6.74 | 4.9 (floor 4.5) | pass |
| Binder sand: today ring g600 vs t (glyph) | 6.63 | 1.79 | 3:1 | FAIL |
| Binder sand: room 15/400 ink2 on t | 7.94 | 8.91 | 4.9 (floor 4.5) | pass |
| Binder sand: Travel flag 13/600 warn-fg on warn-bg over t | 5.57 | 7.21 | 4.9 (floor 4.5) | pass |
| Binder stone: code "BIOL" 12.5/700 tf on t | 6.71 | 9.05 | 4.9 (floor 4.5) | pass |
| Binder stone: number 28/500 ink on t | 13.31 | 12.51 | 3:1 | pass |
| Binder stone: name 17/600 ink on t | 13.31 | 12.51 | 4.9 (floor 4.5) | pass |
| Binder stone: professor 15/400 italic ink2 on t | 7.62 | 8.94 | 4.9 (floor 4.5) | pass |
| Binder stone: credits chip 13/600 ink2 on sf 62% over t | 8.91 | 9.76 | 4.9 (floor 4.5) | pass |
| Binder stone: day tile off "T" 11.5/600 tf 70% on t | 3.39 | 5.22 | 4.9 (floor 4.5) | FAIL |
| Binder stone: day tile on "M" 11.5/600 ink on tile | 17.08 | 9.45 | 4.9 (floor 4.5) | pass |
| Binder stone: day tile time 12/600 ink2 on tile | 9.77 | 6.76 | 4.9 (floor 4.5) | pass |
| Binder stone: today ring g600 vs t (glyph) | 6.36 | 1.79 | 3:1 | FAIL |
| Binder stone: room 15/400 ink2 on t | 7.62 | 8.94 | 4.9 (floor 4.5) | pass |
| Binder stone: Travel flag 13/600 warn-fg on warn-bg over t | 5.35 | 7.25 | 4.9 (floor 4.5) | pass |
| Binder sage: code "BIOL" 12.5/700 tf on t | 6.37 | 8.91 | 4.9 (floor 4.5) | pass |
| Binder sage: number 28/500 ink on t | 13.38 | 12.25 | 3:1 | pass |
| Binder sage: name 17/600 ink on t | 13.38 | 12.25 | 4.9 (floor 4.5) | pass |
| Binder sage: professor 15/400 italic ink2 on t | 7.66 | 8.76 | 4.9 (floor 4.5) | pass |
| Binder sage: credits chip 13/600 ink2 on sf 62% over t | 8.93 | 9.69 | 4.9 (floor 4.5) | pass |
| Binder sage: day tile off "T" 11.5/600 tf 70% on t | 3.28 | 5.17 | 4.9 (floor 4.5) | FAIL |
| Binder sage: day tile on "M" 11.5/600 ink on tile | 17.08 | 9.26 | 4.9 (floor 4.5) | pass |
| Binder sage: day tile time 12/600 ink2 on tile | 9.77 | 6.62 | 4.9 (floor 4.5) | pass |
| Binder sage: today ring g600 vs t (glyph) | 6.39 | 1.76 | 3:1 | FAIL |
| Binder sage: room 15/400 ink2 on t | 7.66 | 8.76 | 4.9 (floor 4.5) | pass |
| Binder sage: Travel flag 13/600 warn-fg on warn-bg over t | 5.37 | 7.12 | 4.9 (floor 4.5) | pass |
| Switch on: thumb white vs track #2E8A57 (glyph) | 4.30 | 4.30 | 3:1 | pass |
| Switch on: track #2E8A57 vs sf (glyph) | 4.26 | 3.94 | 3:1 | pass |
| Switch off: track ink 16% vs sf (glyph) | 1.39 | 1.58 | 3:1 | FAIL |
| Switch off: thumb white vs track ink 16% over sf (glyph) | 1.40 | 10.72 | 3:1 | FAIL |
| Note eye icon link on sf | 8.15 | 8.45 | 3:1 | pass |
| "Delete all classes" 16/600 flag on sf | 6.48 | 7.06 | 4.9 (floor 4.5) | pass |

Fixes for the pairs under target:
1. **Day tile letters on off days** (11.5pt at 70% tone ink): 2.96 to 3.39 light, FAIL. Fix: draw the off-day letter in `--ch-cl-tf` at 100% (5.40 to 6.71 light; dark, on the app's dark tones, is already 4.94 to 5.28 at 70% and 7 and up at 100%, so draw it at 100% in both). The tile outline stays at 70%.
2. **Binder today ring in dark** (green-600 #155A39 on the dark tones): 1.74 to 1.79 on the app's dark tones, FAIL. Fix: dark ring `link` #7CC79B (7.14 to 7.38). Light keeps #155A39 (6.19 to 6.63).
3. **Practice dot and practice ribbon block in light** (mint #7BC79A on card 1.99, on well 1.82): FAIL as marks. The row's text says "Team practice", so they are decorative, but give them a 1.5px inset ring in `--ch-green-500` (6.41 on card, 5.88 on well) so the mark holds in light. Dark passes (8.44 / 8.95).
4. **Ribbon class blocks** (tone tints on the well, 1.13 to 1.26; their rings 1.40 to 1.55 light, 1.77 to 1.93 dark): decorative, the rows below give every time. Optional fix if the ribbon must stand alone: ring in `--ch-cl-tf` instead of `--ch-cl-tb` (6.09 to 7.89 light, 10.58 to 11.16 dark).
5. **Credits bar in dark** (the app's dark tone tints on the green, 1.27 to 1.31): decorative (the label states the credit total and each binder its credits). Optional fix: dark segments in `--ch-cl-tf` (the light tone inks), which are 9 to 11:1 on #08150E.
6. **Switch off state** (track 1.39 / 1.58; white thumb on it 1.40 light): FAIL for a control boundary. Fix: 1px inset ring on the off track at `color-mix(ink 50%)` (3.31 light, 4.55 dark). On state: thumb on #2E8A57 4.30, track on card passes.

### 4.11 Redline (S-CLASSES)

1. Large title text box top 116 from the screen top; first card top 195.
2. Term card radius 16, padding 18 16 16; week well 66 x 66, radius 18.
3. Credits bar 10 tall, 3 gaps.
4. Today row 64 tall; time column 58 wide (78.9 at XXL), no wrap.
5. Ribbon 28 tall, radius 8.
6. Binder padding 16 16 14, radius 16, 12 apart; day tiles 46 tall, 5 gap.
7. Card header height 48 (14 + 22.1 + 12).
8. Section gaps 24, tight 12.
9. Edge 16 at 390, 20 at 430.
10. Switch 51 x 31.

## 5. S-CLASSES.class-sheet: class detail sheet

From a Today class row or a binder. Sheet 90% of the screen height (760 of 844 at 390; 838 of 932 at 430). Design: tap a binder on `#classes-phone-light`.

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Grabber, header, close | 1.3 Sheet | title "BIOL 1010" 650 17k/1.2 | `ink` on `sheet` | `x` 16 | close 44 x 44; grab and header drag | `dept num` |
| Identity block (`.dhero2`) | fill, r 16, padding 18, grid gap 8, tone fill, `inset 0 0 0 1px --ch-cl-tb` | code as the binder; name 600 **20k**/1.22 wraps (no clamp); professor italic 400 15k | `ink`, `--ch-cl-tf`, `ink2` | | none | `name`, `instructor` |
| Facts card | card, grid 2 x 2 | each cell padding 12 16, gap 4; label 400 13k/1 `ink4`; value 500 16k/1.3 `ink` wraps | | | none | Meets (`daysLabel`), Time (`timeRange`, "9:05–9:55 AM"), Room (`location`), Credits. Hairline above row 2 from 16 to 16, 0.66px |
| This week card | card, header "This week" + meta "3 meetings" | rows 52: title "Mon, Nov 2" 500 16k; sub time 400 15k `ink2` | | amber chip "Travel" with `bus` 12 on the conflicting day | none | `week.dates` x `days`, conflicts |
| Buttons | grid 2 columns, gap 10 | Remove (danger), Edit class (primary) | `flag` on `card`; white on `fill` | | 46 tall each | today's flows; Remove asks to confirm as today |
| Body | padding 4 edge 40, gap 14, scrolls | | | | | |

States: not drawn for loading (the sheet opens on data already loaded). Long names: the sheet title (code) never truncates; the identity name wraps. XXL: the body scrolls; buttons stay 46. Desktop: the same content opens in today's desktop sheet or dialog (not drawn on the page). Dark: `sheet` #1B201C, cards `card`.

Contrast: as 4.10 for tone text; facts label 6.61 / 6.99, value 17.08 / 14.34; identity name 20pt `ink` on tones 12.9 and up. No failures beyond those in 4.10.

Redline:
1. Sheet top at 10% of the screen height (84 at 390).
2. Top radius 20; grabber 36 x 5, 7 from the top.
3. Close button 32 circle, 14 from the right.
4. Identity block radius 16, padding 18.
5. Facts cells padding 12 16.
6. Buttons 46 tall, 10 apart.

## 6. S-CLASSES.add-menu: the plus menu

Not drawn on the page (the plus key has no menu in the mock). Build rule from 04 section 6: today's menu, anchored under the plus key, with two items: "Add class" (`plus`) and "Import schedule" (`download`), each opening today's sheets. Use the app's `ui/Menu.tsx` as is: menu surface `--ch-sheet-bg` with its elevation, items 44 tall minimum, 500 16k labels, icons 18. Contrast as the app's menu today. Motion: `CH_POP` (07 M-CRH-31). Capture state: "add, open" in 05.


## 7. S-ROSTER: Roster, coach view

Route `/golf/dashboard/roster` as a coach. Design `#roster-phone-light-coach` (plus `-early`, `-loading`, `-empty`, `-failed`, `-long`, `-big`, `-xxl`, `-desktop`). Order: bar (right key = Invite players), large title, team card, leaders row, join requests row, sticky sort, Active card, Injured card.

### 7.1 Bar and large title

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Bar title | section 2 | "Roster" | | | | fixed |
| Right key "Invite players" | 44 x 44 | | `on-g-soft` | `user-plus` 21, stroke 2.1 | 44 | today's invite flow |
| Large title | 1.3 | "Roster" | | | | fixed |
| Context line | 1.3 | "Demo University Golf", one line ellipsis | `ink2` | | | `golf_teams.name` → `ChRoster.teamName` (03 Roster: Large title context). The fixture's "Varsity" is replaced by the team name |

### 7.2 S-ROSTER.team-card: team card (feature card)

Card: fill width, r 16, padding 16 16 14 16, grid gap 14, `frame` fill, `card-shadow`, text `h-ink`.

| Element | Box | Type | Colour (light / dark) | Hit area | Data |
|---|---|---|---|---|---|
| Top row | flex space-between, align top, gap 12 | | | | |
| Season | block | "2026–27 season" 650 20k/1.15 -0.02em | `h-ink` | none | `currentSeasonLabel` (turns over 1 Aug). Never "Varsity" (no squad field) |
| Counts | | "7 active · 1 injured · 2 waiting" 400 14k/1.35, wraps at XXL | `h-ink2` | none | active = `status='active'` (injured count as active); injured = active and `availability='injured'`; waiting = pending requests (03 Roster: Counts). Zero injured or zero waiting: that part drops. Player view: active only |
| Total | grid, right aligned, gap 4, flex none | "7" 600 34k/.9 -0.04em tab; "players" 500 13k/1 | `h-ink`; `h-ink3` | none | `players.length` (active + inactive) |
| Class mix | full width x 12, flex gap 3; segment flex = count, r 4, `inset 0 0 0 1px rgb(255 255 255/.14)` | | segment fill `yr-*` | none, `aria-hidden` | `classYear` counts; unknown years are not drawn in the bar (build rule; not drawn) |
| Legend | flex wrap, gap 6 14 | 500 13k/1; count 650 tab `h-ink` | `h-ink2` | none | per year: "1 Senior", "4 Juniors" (plural by count). A year with 0: shown with 0 as drawn |
| Legend swatch | 9 x 9, r 3, year fill | | `yr-*` | | |
| Footer (coach only) | flex gap 10, centre, padding-top 12, border-top 1px `rgb(244 241 232/.14)` | "Top five" 400 15k/1.2 | `h-ink2` | none | shown only when 5 active players each have 3+ countable rounds (practice excluded) |
| Footer coins | stack, 30 x 30, 11pt initials, overlap -8, ring `0 0 0 2px frame` | | year fills | | the five lowest averages |
| Footer mean chip | margin-left auto, padding 5 8, r 7 | 600 13k/1 tab "76.2 avg" | #E3F5E9 (new `--ch-on-green-chip`) on `rgb(123 199 154/.18)` | none | mean of the five, 1 decimal |

### 7.3 S-ROSTER.leaders: leaders row (coach only, inline part)

Row: flex gap 10, horizontal scroll, `scroll-snap-type: x mandatory`, full bleed (margin 0 -edge), padding 2 edge 6 edge, `scroll-padding: 0 edge`, scrollbar hidden. In `.sec.tight` (12 under the team card). Hidden entirely when no card qualifies.

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Leader card | `button`, width min(62%, 220) = 220 at 390 and 430, flex none, snap start, r 16, padding 14 14 13 14, grid gap 10; fill `color-mix(yr 11%, card)`; shadow `0 0 0 1px color-mix(yr 24%), 0 1px 2px rgb(28 25 18/.05), 0 8px 20px -14px rgb(28 25 18/.12)` | | text `ink` | | whole card (about 220 x 124) | pushes S-ROSTER.profile for that player |
| Kicker | flex space-between, gap 6 | 600 13k/1 "Low average" / "On a heater" / "Needs a look" | `ink2` | `trophy` / `up` / `alert` 15 stroke 2.4 in the year colour | | |
| Figure | | 600 30k/1 -0.04em tab; unit `small` 500 13k/1, margin-left 4, `ink2` ("last 3", "SG / rd") | `ink`; Needs a look figure in `loss` | | | Low average: min `avg`; On a heater: mean of the last 3 countable rounds; Needs a look: `sgPerRound` with a true minus. 1 decimal. Missing SG: that card hidden |
| Player | flex gap 8, min-width 0 | name 600 15k/1.2, one line ellipsis | `ink` | coin 26 (10pt) | | name |

Rules: only active players with 3+ countable rounds (practice excluded) count. Needs a look shows only when someone has the attention note.

### 7.4 S-ROSTER.requests-row: join requests row

`button.req`, margin-top 6 (so 18 under the leaders' 6 padding... measured: 6 under the row's bottom padding), flex gap 12, centre, padding 12 16, `card` fill, r 16, `card-shadow`; height 64 at k 1.

| Element | Box | Type | Colour | Hit area | Data |
|---|---|---|---|---|---|
| Coin stack | 32 coins, overlap -8, ring `0 0 0 2px card` | 12pt | year or neutral | | up to 3 requesters; more: "+n" coin (build rule; not drawn) |
| Text | `.row__b` | "Join requests" 500 16k; names "Liam Ortiz, Noah Patel" 400 15k one line ellipsis | `ink`; `ink2` | | `getTeamJoinRequests` (03 Roster: Join requests row) |
| Badge | min 24 x 24, padding 0 7, r 12 | 650 13k/24 tab | #FFFFFF on `fill` | | count |
| Chevron | 15 | | `ink4` | | |
| Row | | | | full row | opens S-ROSTER.requests-sheet. Zero requests: row hidden |

### 7.5 S-ROSTER.sort: sticky sort

`.ctlbar` (1.3), margin-top 12, holding the segmented control (Avg / SG / Name) with no "Sort by" label.

| Element | Box | Type | Colour | Hit area | Data |
|---|---|---|---|---|---|
| Track | fill width, grid columns equal, gap 4, padding 4, r 16; fill = `--ch-well-bg` gradient (#D4CEBE, #DDD8CA 55%, #E4DFD3 / #0A0D0B, #0D110E, #101411); shadow as today's `.ch-seg` | | | | |
| Option | page: 32 tall, r 12; **app stock: 36 tall** (see 14) | page 500 15k/1; app stock `--ch-type-13-medium` | off `ink2` with `0 1px 0 rgb(255 255 255/.6)` light shadow; on `--ch-seg-on-ink` #F9F7F1 600 with `0 1px 0 rgb(0 0 0/.18)` | 44 tall: the stock control extends its hit area to 44 | `useRosterSort` (Avg ascending, SG descending, last name; nulls last) |
| Chip | width (100% − 8 − (n−1)·4) / n, top 4 bottom 4, r 12; `--ch-seg-on-bg` gradient #1F6B45 to #0F4A2F / #23704A to #1D613F; `--ch-seg-on-shadow` | | | | |

### 7.6 S-ROSTER.active: Active card

`.sec.tight`, margin-top 2 under the sticky bar. Card header "Active" with meta "6 players". Rows are buttons, 64 tall, inset 60.

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Coin | 32 (x min(k,1.2)) | 12pt initials | year fill, white | | | `classYearKey` |
| Name | `.row__b b` | 500 16k, one line ellipsis | `ink` | | | name |
| Note | sub line | 400 15k one line ellipsis | default `ink2`; attention text in `warn-ic`; good-news text in `gain`; class note with an 8 x 8 tone dot, gap 5 | | | `classNoteFor` → else `rowNote` (03 Roster: Note line). "Early read · 2 rounds" when under 3 rounds |
| Form bars | 44 x 24, flex end-aligned, gap 3; five bars flex 1, r 2, min 5 high; height = 30% + 70% x (hi − v) / (hi − lo), lo = min − 2, hi = max + 1 of the five | | gain bar `gain`; loss bar `loss` at 85%; neutral bar `color-mix(ink 20%)` (fix in 7.10) | | none, `role="img"` with `aria-label` "Last 5 rounds: 76, 75, 77, 74, 73" | last five **countable** rounds (practice rounds left out, settled 3 Nov); gain when the round beats the team average, loss when more than 2 over it; under 3 rounds: two neutral stubs ("Not enough rounds") |
| Figure | `.row__v` | Avg sort: "74.6" 600 17k tab and "2.4 HCP" 400 13k `ink4`; SG sort: "+0.8" in `gain` / "−1.4" in `loss` and "SG / rd" | | | | `avg` (1 decimal), `displayHandicap`, `sgPerRound` (true minus, plus sign). Missing: the no-data dash in `ink4` |
| Chevron | 15 | | `ink4` | | | |
| Row | button, min 64 | | | | full row | pushes S-ROSTER.profile |
| Note | card note | "Bars are the last five rounds. Green beats the team average." | `ink2` | | | static (03 asks for "this season" wording) |

### 7.7 S-ROSTER.injured: Injured card (inline part)

`.sec`, card header "Injured" with meta count. Rows 64, inset 60, buttons with chevron (coach opens the profile).

| Element | Box | Type | Colour | Hit area | Data |
|---|---|---|---|---|---|
| Coin | 32, `filter: saturate(.35)`, opacity .8 (see 7.10 fix) | | year fill | | |
| Name | | 500 16k | `ink` | | |
| Chip | padding 4 7, r 7, gap 4 | 600 13k/1 "Injured" | `warn-ink` on `warn-bg`, `alert` 12 stroke 2.4 | | `availability='injured'`. No return date (no field) |
| Figure | | avg and HCP as 7.6 | | | |
| Row | | | | full row | profile |

Hidden when nobody is injured. Injured players are also counted as active in the team card.

### 7.8 States

| State | Drawn | What shows |
|---|---|---|
| Loading | `-loading` | Skeleton feature card (44% x 14, 30% x 12, 100% x 10, 70% x 12 ivory bars), the segmented control drawn and usable, "Active" card with 6 skeleton rows (64, coin skeleton). |
| Empty (coach) | `-empty` | "Players" card, icon `users`, "No players yet", "Share your team code or invite by email. Players show here once you approve them.", Invite players (primary, `user-plus`) and Copy team code (`copy`). |
| Failed | `-failed` | "Players" card, "The roster didn't load", "Check your connection and try again.", Try again. |
| Early season | `-early` | Every player 2 rounds, totals only: form bars are two neutral stubs, SG figures the no-data dash, no leaders row, no top-five footer, notes "Early read · 2 rounds". |
| Long names | `-long` | "Maximilian Featherstonehaugh-Whitaker" ellipsizes in rows, leader cards and the requests row; wraps to two lines centred in the profile head. |
| 25 players | `-big` | The list grows to 24 active rows; the class mix and counts are computed; nothing truncated; no "Show all". |
| One player | not drawn | Team card, one row; leaders hidden unless that player qualifies. |
| No requests | not drawn | Requests row hidden. |
| Offline or stale | not drawn | Last good data; today's offline banner. |

### 7.9 Widths, dark, XXL

- 390 / 430: edges 16 / 20; leader cards stay 220 so 1.6 cards show at 390 and 1.75 at 430.
- Desktop 1280 (`roster-desktop-coach`): header kicker "Demo University Golf · 2026–27 season", title "Roster" 650 40, line "7 active · 1 injured · team avg 77.3" 500 14 `ink2`; actions Export and Invite players (primary, `user-plus` 16), 40 high. Then `.dldrs`: grid `1.2fr repeat(3, 1fr)`, gap 14, the team card (content spaced between) and the three leader cards (width auto). Requests row max-width 520. Toolbar: search field (max 320 x 38, r 11, `card`, ring, `search` 16, 14pt `ink2` placeholder), filter pills (padding 8 12, r 10, 500 14, `card-shadow`; on = white on `fill`), the segmented control 320 wide on the right (Avg / Handicap / Rounds / Name). Then grid `1fr 330`, gap 22: the table (section 7.11) and the peek (S-ROSTER.desktop-peek, 7.12). The old "Needs a look" strip is removed.
- Dark: green card #08150E; leader tints mix with #191E1A; year colours dark values (Sophomore #8B6B30).
- XXL: rows grow (name 21.8pt, note 20.4pt: about 86 tall); coins cap at 38.4; form bars stay 44 x 24 (fixed); the figure column grows; names ellipsize first; team-card counts wrap; leader figure 40.8pt fits the 192 inner width; segmented labels 20.4pt in the fixed height (page 32, stock 36) with no clip.

### 7.10 Contrast (S-ROSTER, also S-ROSTER-PLAYER and the profile head)

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Team card "2026-27 season" 20/650 hero-ink on hero | 12.34 | 16.54 | 4.9 (floor 4.5) | pass |
| Team card counts 14/400 hero-ink2 on hero | 9.13 | 11.79 | 4.9 (floor 4.5) | pass |
| Team card total 34/600 hero-ink on hero | 12.34 | 16.54 | 3:1 | pass |
| Team card "players" 13/500 hero-ink3 on hero | 7.11 | 8.86 | 4.9 (floor 4.5) | pass |
| Class-mix legend 13/500 hero-ink2 on hero | 9.13 | 11.79 | 4.9 (floor 4.5) | pass |
| Class-mix segment srs vs hero (glyph) | 2.16 | 3.56 | 3:1 | FAIL |
| Class-mix segment jr vs hero (glyph) | 2.32 | 3.72 | 3:1 | FAIL |
| Class-mix segment so vs hero (glyph) | 2.65 | 3.78 | 3:1 | FAIL |
| Class-mix segment fr vs hero (glyph) | 2.26 | 3.44 | 3:1 | FAIL |
| Top five label 15/400 hero-ink2 on hero | 9.13 | 11.79 | 4.9 (floor 4.5) | pass |
| Top five mean chip 13/600 #E3F5E9 on mint 18% over hero | 8.46 | 11.63 | 4.9 (floor 4.5) | pass |
| Coin initials white on srs (12/650) | 6.47 | 5.25 | 4.9 (floor 4.5) | pass |
| Coin initials white on jr (12/650) | 6.02 | 5.02 | 4.9 (floor 4.5) | pass |
| Coin initials white on so (12/650) | 5.26 | 4.95 | 4.9 (floor 4.5) | pass |
| Coin initials white on fr (12/650) | 6.17 | 5.43 | 4.9 (floor 4.5) | pass |
| Neutral coin initials av-fg on av-bg | 6.36 | 9.28 | 4.9 (floor 4.5) | pass |
| Leader card (srs): label 13/600 ink2 on y 11% over sf | 8.33 | 9.28 | 4.9 (floor 4.5) | pass |
| Leader card (srs): figure 30/600 ink | 14.55 | 12.97 | 3:1 | pass |
| Leader card (srs): name 15/600 ink | 14.55 | 12.97 | 4.9 (floor 4.5) | pass |
| Leader card (srs): icon in year colour (glyph) | 5.46 | 2.92 | 3:1 | FAIL |
| Leader card (srs): Needs a look figure loss 30/600 | 4.75 | 7.72 | 3:1 | pass |
| Leader card (srs): card ring y 24% vs page (edge, info) | 1.41 | 1.26 | none | info |
| Leader card (jr): label 13/600 ink2 on y 11% over sf | 8.39 | 9.22 | 4.9 (floor 4.5) | pass |
| Leader card (jr): figure 30/600 ink | 14.67 | 12.90 | 3:1 | pass |
| Leader card (jr): name 15/600 ink | 14.67 | 12.90 | 4.9 (floor 4.5) | pass |
| Leader card (jr): icon in year colour (glyph) | 5.13 | 3.03 | 3:1 | pass |
| Leader card (jr): Needs a look figure loss 30/600 | 4.79 | 7.67 | 3:1 | pass |
| Leader card (jr): card ring y 24% vs page (edge, info) | 1.39 | 1.27 | none | info |
| Leader card (so): label 13/600 ink2 on y 11% over sf | 8.47 | 9.22 | 4.9 (floor 4.5) | pass |
| Leader card (so): figure 30/600 ink | 14.80 | 12.89 | 3:1 | pass |
| Leader card (so): name 15/600 ink | 14.80 | 12.89 | 4.9 (floor 4.5) | pass |
| Leader card (so): icon in year colour (glyph) | 4.52 | 3.07 | 3:1 | pass |
| Leader card (so): Needs a look figure loss 30/600 | 4.83 | 7.67 | 3:1 | pass |
| Leader card (so): card ring y 24% vs page (edge, info) | 1.36 | 1.27 | none | info |
| Leader card (fr): label 13/600 ink2 on y 11% over sf | 8.34 | 9.36 | 4.9 (floor 4.5) | pass |
| Leader card (fr): figure 30/600 ink | 14.57 | 13.09 | 3:1 | pass |
| Leader card (fr): name 15/600 ink | 14.57 | 13.09 | 4.9 (floor 4.5) | pass |
| Leader card (fr): icon in year colour (glyph) | 5.22 | 2.84 | 3:1 | FAIL |
| Leader card (fr): Needs a look figure loss 30/600 | 4.75 | 7.79 | 3:1 | pass |
| Leader card (fr): card ring y 24% vs page (edge, info) | 1.41 | 1.24 | none | info |
| Join requests badge 13/650 white on g600 | 8.22 | 8.22 | 4.9 (floor 4.5) | pass |
| Note "Needs a look" 15/400 warn-ic on sf | 5.57 | 8.53 | 4.9 (floor 4.5) | pass |
| Note "Best 3 rounds" 15/400 gain on sf | 7.42 | 8.45 | 4.9 (floor 4.5) | pass |
| Form bar gain vs sf (glyph) | 7.42 | 8.45 | 3:1 | pass |
| Form bar loss at 85% vs sf (glyph) | 4.13 | 6.51 | 3:1 | pass |
| Form bar neutral ink 20% vs sf (glyph) | 1.52 | 1.80 | 3:1 | FAIL |
| Row figure 17/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Row SG figure gain on sf | 7.42 | 8.45 | 4.9 (floor 4.5) | pass |
| Row SG figure loss on sf | 5.57 | 8.53 | 4.9 (floor 4.5) | pass |
| Row SG the no-data dash ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |
| Injured chip 13/600 warn-fg on warn-bg over sf | 6.77 | 8.40 | 4.9 (floor 4.5) | pass |
| Injured coin (Junior) white initials, saturate .35, opacity .8 | 3.94 | 4.37 | 4.9 (floor 4.5) | FAIL |
| "You" chip 13/600 link on gtint over sf | 6.96 | 6.68 | 4.9 (floor 4.5) | pass |

Fixes for the pairs under target:
1. **Neutral form bars** (ink 20%: 1.52 / 1.80): FAIL, chart marks need 3:1 (settled 3 Nov, the Steady spark included). Fix: neutral bar `--ch-chart-flat` #6B675F / #A39D90 (5.58 / 6.27), DESIGN_LANGUAGE's neutral chart mark. Gain and loss bars pass.
2. **Class-mix segments on the green card** (2.16 to 2.65 light, 3.44 to 3.78 dark): FAIL in light. The legend gives every count in text, so the bar is supplementary, but give each segment a 1px inset ring at `rgb(244 241 232/.5)` (4.21 against the card) in place of the 14% ring, so every segment's edge holds 3:1.
3. **Leader card icons in dark** (Senior 2.92, Freshman 2.84): FAIL. Fix: icon colour `color-mix(yr 62%, ink)`, as the year chip does (5.41 to 5.82 dark, 7.27 to 8.23 light).
4. **Injured coin initials** (saturate .35 and opacity .8 on the whole coin: 3.94 / 4.37): FAIL. Fix: apply the saturate filter and the 80% to the coin fill only, keep the initials opaque white (6.22 / 5.21).
5. **Sophomore coin in dark**: fixed by the settled #8B6B30 (4.95; was 4.73).

### 7.11 S-ROSTER desktop table (inline part)

`.dtable`: `card` fill, r 16, `card-shadow`, overflow hidden. Rows `.drow`: grid `minmax(0,2.3fr) 100 120 70 64 70 64`, gap 12, padding 12 18, buttons; hairline between rows `inset 0 1px 0 sep`. Header row: 500 13/1 `ink2`, sticky at the table top. Columns: Player (coin 40, name 600 15/1.25, sub 400 13/1.3 `ink2` "Senior · In class until 11:50 AM" one line ellipsis), Status ("Active" chip, or amber "Injured"), Last 5 (form bars 84 x 26, gap 4), Avg, HCP, SG/rd (coloured), Rds; figures 600 15.5/1 tab right aligned. Selected row: `color-mix(ink 5%)` fill and name at 700. Desktop type is fixed (no k). Hit area: whole row (about 64 x 900).

### 7.12 S-ROSTER.desktop-peek (inline part)

`aside.peek`: 330 wide, `card`, r 16, `card-shadow`, padding 20, grid gap 14, sticky top 0 in its column.

| Element | Box | Type | Colour | Data |
|---|---|---|---|---|
| Identity | grid centred, gap 4 | coin xl 76; name 650 22/1.1 -0.02em; year chip | `ink`; chip as 8.2 | selected player |
| Buttons | grid 2 columns, gap 10, 40 tall | Message (primary, `msg` 16), Schedule 1:1 | | today's flows |
| Figures | 2 x 2 grid, 1px gaps on `sep`, r 12, ring; cells `card`, padding 12, gap 4 | label 400 13/1 `ink2`; figure 600 20/1 tab -0.02em | SG coloured | Avg, HCP, SG / round, Rounds (03 Roster: Desktop peek) |
| Chart | 300 x 70 | line chart as 8.3, no labels | | `trend` |
| Open full profile | full width, 40 tall | | | today's link |

Selection is instant (07 M-CRH-33). Default selection: the first row by the current sort.

### 7.13 Redline (S-ROSTER)

1. Team card radius 16, padding 16 16 14; total figure 34pt.
2. Class-mix bar 12 tall, 3 gaps, radius 4.
3. Leader card 220 wide, radius 16, padding 14 14 13; 10 between cards.
4. Requests row 64 tall, radius 16.
5. Sticky bar pinned at 98 with page colour behind it, no hairline.
6. Player row 64 tall, hairline inset 60.
7. Form bars 44 x 24, 3 gaps, minimum bar 5.
8. Coin 32; figure column right edge 16 + chevron.
9. Edge 16 / 20.
10. Desktop: peek 330 wide, 22 from the table.

## 8. S-ROSTER.profile: player profile (push)

From a player row, a leader card or an injured row (coach only). Pushed over the roster (07 M-CRH-17). Design `#roster-phone-light-coach-profile`. Bar: pushed-page bar (section 2): "‹ Roster", the player's name centred, more key.

### 8.1 Head (`.phero`, on the page)

Grid centred, text centred, gap 4, padding-top 118 (the head starts 20 under the bar). Profile pages count the head as the large title block: name and the one context line are the only page text; the chip is a control-like label.

| Element | Box | Type | Colour | Hit area | Data |
|---|---|---|---|---|---|
| Coin xl | 76 x 76 | 26pt initials (fixed) | year fill, white | none | `classYearKey` |
| Name | margin-top 10 | 600 34k/1.2 -0.034em `wdth` 88; wraps to 2 lines, centred, then ellipsis | `ink` | | name |
| Hometown | | 400 15k/1.33, one line ellipsis | `ink2` | | `hometown` + `state`; missing: line hidden. No Captain (no field) |
| Year chip | margin-top 6, padding 6 10, r 999, gap 6; fill `color-mix(yr 14%)`; dot 8 x 8 year fill | 600 13k/1 "Junior · Class of 2028" | text `color-mix(yr 62%, ink)` | none | `classYearLine(classYear, gradYear)` (no repeats). Unknown year: neutral chip `tint` / `link` with "Class of 2031" once |
| Buttons | grid 2 columns, gap 10, full width, margin-top 12; 46 tall | Message (primary, `msg` 17 stroke 2.1); Plan 1:1 (`calendar` 17) | | 46 each | today's flows |

### 8.2 Cards

| Card | Contents | Data |
|---|---|---|
| This season (`.sec`, header meta "Last 10 rounds", 03 says label it "Season") | `.figs`: 3 columns; cell padding 14 12 13 16, gap 5; divider 1px `sep` (0.66) from 14 to 14 between cells; label 400 13k/1.1 `ink2`; figure 600 24k/1 -0.035em tab; foot 400 13k/1.1 tab ("−0.8 vs prev" in `gain`, "Index", "vs D1" in `ink2`). Labels: Scoring avg, Handicap, SG / round | `avg` (season), `handicap`, `sgPerRound`. "vs prev" has no source: show `formChange` or drop; "vs D1" reads the team's baseline name ("vs Tour"). Missing SG: the no-data dash in `ink4` |
| Scoring trend (`.sec.tight`, meta "Last 10" → "Last 7" per 03) | `.chart` padding 14 16 10; SVG 320 x 84 viewBox, width 100%; area fill green-500 at 18% to 0; line 2.2 `--ch-green-500` round joins; dashed mean line `sep`, dash 2 4; last point r 4 in `--ch-green-500` with a 2.2 `card` stroke; label "mean 75.3" 400 11 `ink4`, right aligned 5 above the mean line | `trend` (up to 7, season, countable rounds) |
| Recent rounds (`.sec.tight`, header action "All 14" in `link`) | rows 64: course 500 16k, date 400 15k `ink2`; score well 54 min-width x 48, r 13, `well` fill, `inset 0 1px 2px rgb(28 25 18/.05)`; score 600 19k/1 -0.03em tab `ink`; to-par 600 13k/1 tab `ink2`, `flag` only under par; "E" for even | `recent` (3), `rounds` count |
| About (`.sec.tight`) | `.facts` 2 x 2 as 5: Hometown, High school, Joined ("Aug 2023"), Rounds this season | `hometown`, `highSchool`, `joined`, `rounds`. Missing: the no-data dash |

### 8.3 States, widths, XXL

Loading: not drawn (the push opens on loaded roster data; the profile's extra fields load in place as today). Long name: wraps in the head, ellipsizes in the bar. Player view: profile not reachable (rows not tappable). XXL: head name 46pt wraps to 2 lines; figs cells 3 across with 32.6pt figures (fits 108 wide cells: "74.6" is about 80 wide); the chart scales with width. 430: edge 20, cards 390. Desktop: replaced by the peek (7.12) and "Open full profile". Dark: as tokens; chart line `--ch-green-500` dark #6DB488.

### 8.4 Contrast

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Profile name 34/600 ink on page | 15.10 | 16.01 | 3:1 | pass |
| Hometown 15/400 ink2 on page | 8.64 | 11.45 | 4.9 (floor 4.5) | pass |
| Year chip (srs) 13/600 y 62% into ink on y 14% over page | 7.02 | 6.01 | 4.9 (floor 4.5) | pass |
| Year chip (jr) 13/600 y 62% into ink on y 14% over page | 6.74 | 6.18 | 4.9 (floor 4.5) | pass |
| Year chip (so) 13/600 y 62% into ink on y 14% over page | 6.24 | 6.26 | 4.9 (floor 4.5) | pass |
| Year chip (fr) 13/600 y 62% into ink on y 14% over page | 6.84 | 5.94 | 4.9 (floor 4.5) | pass |
| XL coin initials 26/650 white on Junior | 6.02 | 5.02 | 3:1 | pass |
| Figure label 13/400 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Figure 24/600 ink on sf | 17.08 | 14.34 | 3:1 | pass |
| Figure delta 13/400 gain on sf | 7.42 | 8.45 | 4.9 (floor 4.5) | pass |
| Chart line g500 vs sf (glyph) | 6.41 | 2.61 | 3:1 | FAIL |
| Chart label 11/400 ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |
| Score well 19/600 ink on well over sf | 15.66 | 15.20 | 4.9 (floor 4.5) | pass |
| Score well to-par 13/600 ink2 on well | 8.96 | 10.87 | 4.9 (floor 4.5) | pass |
| Score well under par 13/600 flag on well | 5.94 | 7.48 | 4.9 (floor 4.5) | pass |

Fix: **chart line in dark** (#1F6B45: 2.61): FAIL. Fix: map to `--ch-green-500`, whose app dark value #6DB488 gives 6.87. The page keeps #1F6B45 in dark; the build uses the token.

### 8.5 Redline

1. Head top 118 (20 under the bar); coin 76.
2. Name 34pt, 10 under the coin.
3. Year chip height 25, radius full.
4. Buttons 46 tall, 12 under the chip, 10 apart.
5. Figure cells: figure 24pt, divider inset 14.
6. Chart height 84 at 320 wide (scales with width).
7. Score well 54 x 48, radius 13.
8. Pushed bar title centred, ellipsis at 150 wide (390).

## 9. S-ROSTER.requests-sheet: join requests sheet

From the requests row. Sheet 62% (523 of 844 at 390).

| Element | Box | Type | Colour | Hit area | Data |
|---|---|---|---|---|---|
| Header | 1.3 Sheet | "Join requests" | | close 44 | |
| Requests card | card, no header; rows 64 with coin 32 | name 500 16k one line ellipsis; class 400 15k `ink2` | | Decline 36 tall, padding 0 12, 15pt (default button); Approve 36 tall primary. Hit area 44: each button's `::before` extends 4 above and below | `ChJoinRequest` name, `classYear` (03: "joined with team code" is not in the shape, so the sub line is the class only) |
| Note | card note | "Both joined with the team code." | `ink2` | | copy depends on the source; drop when unknown |
| Team code card | one row: "Team code" / "Players join with this code"; code 600 17k/1 mono +0.06em | `ink` | | none (copy is today's flow) | `golf_teams.join_code` |
| Approve all | full width, 46, primary | | | 46 | today's bulk approve |

States: zero requests closes the sheet when the last one is handled inside it (build rule; not drawn). A sheet opened by `?tab=requests` with none open shows CP-6.5 (fixed 4 Nov: reconciled with 05). Approve all is absent with one request or none (DECISIONS). Long name ellipsizes before the buttons; at XXL the two buttons may push the name to a single short line: the name keeps min-width 0 and ellipsizes, the buttons never wrap. Contrast: buttons and rows as section 1; team code 17.08 / 14.34.

Redline:
1. Sheet top at 38% of the screen.
2. Row 64 with Decline and Approve 36 tall, 12 apart (row gap).
3. Approve all 46 tall, full width.
4. Body gap 14 between cards.
5. Grabber 7 from the top.

## 10. S-ROSTER-PLAYER: Roster, player view

Route `/golf/dashboard/roster` as a player. Design `#roster-phone-light-player`. Same bar (right key = bell), large title and context. Team card without injured, waiting or the top five (players never see teammates' figures: no averages, SG, form bars, leaders or top five in the player DOM). No leaders, no requests row.

| Element | Box | Type | Colour | Data |
|---|---|---|---|---|
| Team card | as 7.2, counts "7 active" only, no footer | | | active and class mix only (03: injured is not loaded for players) |
| Sort | sticky, Name / Class / HCP | | | client sort on `gradYear`, `handicap` |
| Coaches card | header "Coaches" meta "3"; rows 52 (one title + role), coin 32 neutral, inset 60, not tappable | name 500 16k; role 400 15k `ink2` | | `coachesOf` |
| Players card | header "Players" meta "6"; rows 64, inset 60, not tappable, no chevron | name 500 16k; sub "Senior · Class of 2027" or "You" chip + year on the player's own row; right: HCP 600 17k and "HCP" 13k `ink4` | | `ChTeammate` (`classYear`, `gradYear`, `isYou`, `handicap`). Handicap is the one figure players see, as today |
| "You" chip | padding 4 7, r 7 | 600 13k/1 | `link` on `tint` | `isYou` |

States: empty "Teammates" card, icon `users`, "No teammates yet", "Your coach adds players to the team. They'll show here." (no buttons). Loading and failed as 7.8. Contrast: as 7.10 (no player-only failures). Redline: as 7.13 items 1, 2, 5, 6, 9; plus "player rows have no chevron and no form bars".

## 11. S-HOME: coach Home

Route `/golf/dashboard` as a coach. Design `#home-phone-light`. The hero is full bleed and holds Home's bar row; cards follow on the flat page.

### 11.1 S-HOME.hero (feature card, full bleed)

Header `.hhero`: margin 0 -edge (full bleed), padding 54 edge 20 edge, `frame` fill, r 0 0 24 24, shadow `0 1px 0 #082B1C, 0 18px 40px -24px rgb(11 58 37/.6)`, grid gap 0, text `h-ink`. One green with the bar (shell.css 1306 hero-mode bar background to `var(--ch-frame)`, Nick 31 Oct), no seam, no radial light.

| Element | Box | Type | Colour (light / dark) | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Bar row | flex space-between, centre, height 44, margin 0 -10 18 -6 | | | | | today's hero bar contents |
| Team switcher | padding 6, gap 6 | crest 32 circle `on-g` fill with `flag` 15 stroke 2.2 in `frame`, ring `0 0 0 1.5px rgb(240 233 214/.5)`, margin-right 4; "Home" 600 18k/1 -0.012em | `on-g` | `chevron-down` 16 `on-g-soft`; champagne dot | 44 tall row, button width | opens S-STRIP |
| Bell | 40 x 40 circle, `rgb(255 255 255/.09)` fill, `inset 0 0 0 1px rgb(255 255 255/.12)`; badge top -4 right -5 | | glyph `h-ink` | `bell` 19 stroke 2 | 44 x 44 (`::before` -2) | today's bell |
| Date | | 400 15k/1 "Saturday, October 31" | `h-ink3` | | | `todayLabel` |
| Greeting | margin 8 0 10 | 600 34k/1.1 -0.034em `wdth` 88; wraps (2 lines at XXL) | `h-ink` | | | `greeting` + first name |
| Brief | flex gap 8, margin 0 0 16 | 400 15k/1.45, pretty, up to 3 lines | `h-ink2` | `sparkles` 14 in `mint2`, margin-top 3 | | `homeSubline` (03: mismatch to settle in data) |
| Waiting on you | grid gap 8, margin-bottom 16; label 400 15k/1; capsules wrap, gap 8 | capsule 600 13.5k/1, count in #FFFFFF tab | label `h-ink2`; capsule text `h-ink` | | capsule 34 tall, padding 0 12, r 10, fill `rgb(255 255 255/.10)`, ring `inset 0 0 0 1px rgb(255 255 255/.14)`; hit area 44 tall (`::before` -5) | `queue` (`data/home-queue.ts`); labels from `CoachQueue.tsx` (03: use the real labels, "replies missing", "tasks overdue", "posts awaiting acknowledgement"). Zero items: block hidden |
| Up next (S-HOME.up-next) | `button`, full width, grid gap 6, padding 16, r 16, fill `rgb(255 255 255/.08)`, shadow `inset 0 0 0 1px rgb(255 255 255/.13), inset 0 1px 0 rgb(255 255 255/.14), 0 10px 24px -14px rgb(0 0 0/.5)` | kicker 600 13k/1 (type left with `flag` 13, countdown chip right: padding 5 8, r 7, #E3F5E9 on `rgb(123 199 154/.18)`); title 600 22k/1.15 -0.02em, margin-top 4, wraps; time and place 400 15k/1.35; footer: margin-top 8, padding-top 12, border-top `rgb(244 241 232/.14)`, coins `sm` 26 stack, "4 of 6 going · Dylan hasn't replied" 400 15k/1.2 with the count at 650, chevron 17 at 70% | kicker `mint2`; title `h-ink`; rest `h-ink2` | | whole card | `phone.next` (`type`, `whenLabel`, `title`, `rangeLabel`, `location`, `invitees`, `going` only with RSVP, `awaiting`). None: card hidden (staging Oct 31 is null) |

### 11.2 Cards on the page

Order: Today (`.sec`), Team scoring (`.sec.tight`), The team's game (`.sec.tight`), This week (`.sec`), Latest rounds (`.sec.tight`). The scroll has padding-top 0 (the hero starts at the top).

| Card | Element | Box and type | Colour | Data |
|---|---|---|---|---|
| Today (S-HOME.today) | header action "Calendar" | 1.3 | `link` | today's link |
| | rows | min 56; time column 48k wide, 600 15k/1 tab nowrap; tone dot 10; title 500 16k; sub 400 15k `ink2`; trailing "Next" chip (`tint`/`link`) or amber "Clash" chip with `alert` 11 | | `phone.today` (`isNext`, `conflict`); past rows at opacity .5 (not drawn on the sample) |
| Team scoring (S-HOME.scoring) | header action "Team stats" | | `link` | |
| | top | padding 14 16; flex space-between end; label "Average · last 10 rounds" 400 15k/1.3 `ink2`; figure 500 40k/1 -0.04em `wdth` 92 tab `ink`; delta grid right, gap 5: "−0.6" 650 17k/1 tab in `gain` (or `loss`, or `ink` with no tone), "vs previous 10" 400 15k/1.2 `ink2` | | `form.avg`, `form.delta`, `deltaSe` → tone (03 Home). Practice rounds excluded |
| | chart | padding 12 0 6; SVG 320 x 70, no labels, line 2.2 `--ch-green-500`, area 18% to 0, dashed mean, last point r 4 | | `form.line` (up to 10) |
| | figures | 3 columns, padding-top 12, border-top 1px `sep`; label 400 13k/1 `ink2`; figure 600 21k/1 -0.03em tab; foot 400 13k/1.1 tab (`loss` / `gain` / `ink2`) | | Rounds this week, GIR %, Putts per 18 |
| The team's game (S-HOME.legs) | header meta "SG per round" | 1.3 | | baseline label "vs Tour" per 03 |
| | grid | 2 x 2 (`.legs`); cell padding 14 16, grid gap 8; vertical divider 1px `sep` (0.66) between columns from 14 to 14; horizontal divider over row 2 (16 to 0 on the left cell, 0 to 16 on the right) | | |
| | cell | name 500 16k/1.2 `ink`; SG 600 28k/1 -0.04em tab in `gain`/`loss` with unit "SG" 400 13k `ink2` margin-left 3; diverging bar (below); stat 400 15k/1.3 `ink2`; trend 600 13k/1.25 with icon 13 stroke 2.6 (`up` gain, `down` loss, `flat` ink2); people line 400 15k/1.35 `ink2` with names as links 600 `link`, underline 1px offset 2 at 45% | | `legs.rows[]` (`sg`, `delta`, `se`, `stat`, `gains`, `loses`) |
| | diverging bar | full width x 8, r 4, `well` fill, `inset 0 1px 1px rgb(28 25 18/.05)`; zero rule 1.5 wide `ink4`, 3 above and below, at 50%; fill from the centre: width = min(50, abs(sg) / 3.5 x 50)%, r 4, `gain` / `loss` | | |
| | note | "Approach and putting cost the most. Names open that player's game on Stats." | `ink2` | two most negative `sg` |
| This week (S-HOME.week) | header action "Calendar" | | | |
| | tiles | grid 7 columns, gap 4, padding 10 10 6; tile padding 10 0 9, r 14, grid centred, gap 6; day letter 400 13k/1 `ink4`; date 600 17k/1 tab `ink`; dots 5 x 5 circles, gap 3, row height 6, `--ch-green-500`; today tile `well` fill with `inset 0 1px 2px rgb(28 25 18/.06), inset 0 0 0 1.5px` green ring | | `week.days[].eventCount` (max 3 dots; more: 3, build rule) |
| | note | "**Fri, Nov 6** Fall Invitational · travel day" (date 600 `ink`) | `ink2` | `phone.weekNote`; none: no note |
| Latest rounds (S-HOME.rounds) | header action "Team stats" | | | |
| | rows | buttons, 64; coin 32; name 500 16k; "Springfield CC · Wed, Oct 21" 400 15k ellipsis; spark 48 x 22 (stroke 1.75 `--ch-green-500`, end dot r 2.4); score well 54 x 48 as 8.2 | | `latestRounds.rounds` (3 newest 18-hole rounds per 03; the sample draws 5), spark from `trend`, date format per app. Tap: S-HOME.round-sheet |

### 11.3 States

| State | Drawn | What shows |
|---|---|---|
| Loading | `#home-phone-light-loading` | Hero with bar row, date and greeting; brief as two ivory 16% bars (86%, 58% x 13); no capsules, no Up next. Cards: Today (3 rows), Team scoring (30% x 30 and 100% x 70 bars), The team's game (2 rows). |
| Empty | `-empty` | Greeting "Welcome to Clubhouse, Nick."; brief "Set up your team and your first week shows here."; card "Get your team set up" with three 64 rows (icon tile 36 x 36, r 10, `tint`/`link`): Invite players, Add your season, Post the first round; Today card empty block "Nothing on the calendar today", New event. |
| Failed | `-failed` | Brief "Some of today didn't load. What did is below."; Today failed block; Team scoring failed block ("Your rounds are safe. Try again in a moment."). |
| Events only / no rounds | as today (`?state=eventsonly`, `norounds`) | Today and This week only; scoring cards hidden. |
| No next event | not drawn | Up next hidden. |
| Long names | `-long` | Latest rounds names and "Springfield Country Club · North Course" ellipsize. |

### 11.4 Widths, dark, XXL

- 390 / 430: hero full bleed, inner edge 16 / 20; cards 358 / 390.
- Desktop 1280 (`home-desktop`): hero card r 16, padding 22 24, grid `1fr 380`, gap 24: left date, greeting 650 36/1.05, brief, capsules; right Up next (no chevron). Then grid `1.35fr 1fr`, gap 18: This week agenda (rows 56) and Team scoring; The team's game in 4 columns (`.dlegs`, dividers between); grid again: Latest rounds (4 rows, not tappable) and Leaderboard (rows 52, inset 56, rank 22 wide 600 13 `ink4`, coin 26, average). Desktop type is fixed.
- Dark: hero #08150E; chart, spark and dots use `--ch-green-500` (#6DB488 dark).
- XXL: greeting wraps; capsules wrap to more lines; Up next title wraps; leg cells stay 2 columns at 390 (the page's container query only drops to 1 column under 300 wide); the 28pt SG becomes 38pt and fits 179 wide cells; people lines wrap; week tiles keep 7 columns (date 23pt in 45 wide tiles); score wells keep 54 x 48 with 25.8pt scores (fits); rows grow.

### 11.5 Contrast

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Hero bar "Home" 18/600 on-g-ink on hero | 12.03 | 16.12 | 4.9 (floor 4.5) | pass |
| Crest flag glyph frame on on-g-ink | 12.03 | 16.12 | 3:1 | pass |
| Crest disc on-g-ink vs hero (glyph) | 12.03 | 16.12 | 3:1 | pass |
| Hero bell glyph hero-ink on white 9% over hero | 9.44 | 13.16 | 3:1 | pass |
| Date 15/400 hero-ink3 on hero | 7.11 | 8.86 | 4.9 (floor 4.5) | pass |
| Greeting 34/600 hero-ink on hero | 12.34 | 16.54 | 3:1 | pass |
| Brief 15/400 hero-ink2 on hero | 9.13 | 11.79 | 4.9 (floor 4.5) | pass |
| Brief sparkle mint2 on hero (glyph) | 9.17 | 12.29 | 3:1 | pass |
| "Waiting on you" 15/400 hero-ink2 on hero | 9.13 | 11.79 | 4.9 (floor 4.5) | pass |
| Waiting capsule 13.5/600 hero-ink on white 10% over hero | 9.14 | 12.75 | 4.9 (floor 4.5) | pass |
| Waiting capsule count white on white 10% over hero | 10.33 | 14.40 | 4.9 (floor 4.5) | pass |
| Up next kicker 13/600 mint2 on white 8% over hero | 7.24 | 10.08 | 4.9 (floor 4.5) | pass |
| Up next countdown 13/600 #E3F5E9 on mint 18% over card | 6.86 | 9.24 | 4.9 (floor 4.5) | pass |
| Up next title 22/600 hero-ink on card | 9.74 | 13.56 | 4.9 (floor 4.5) | pass |
| Up next time 15/400 hero-ink2 on card | 7.40 | 9.96 | 4.9 (floor 4.5) | pass |
| Up next chevron hero-ink2 at 70% (glyph) | 4.40 | 5.49 | 3:1 | pass |
| Small coin ring 2px hero vs coin (info) | 2.32 | 3.72 | none | info |
| Today time 15/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| "Next" chip 13/600 link on gtint | 6.96 | 6.68 | 4.9 (floor 4.5) | pass |
| Team scoring label 15/400 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Team scoring figure 40/500 ink on sf | 17.08 | 14.34 | 3:1 | pass |
| Delta 17/650 gain on sf | 7.42 | 8.45 | 4.9 (floor 4.5) | pass |
| Line chart g500 vs sf (glyph) | 6.41 | 2.61 | 3:1 | FAIL |
| Last-point dot g500 vs sf (glyph) | 6.41 | 2.61 | 3:1 | FAIL |
| Figure 21/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| GIR delta 13/400 loss on sf | 5.57 | 8.53 | 4.9 (floor 4.5) | pass |
| Leg name 16/500 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Leg SG 28/600 gain on sf | 7.42 | 8.45 | 3:1 | pass |
| Leg SG 28/600 loss on sf | 5.57 | 8.53 | 3:1 | pass |
| Leg unit "SG" 13/400 ink2 | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Diverging bar gain vs well (glyph) | 6.80 | 8.96 | 3:1 | pass |
| Diverging bar loss vs well (glyph) | 5.11 | 9.04 | 3:1 | pass |
| Diverging bar zero rule ink4 vs well (glyph) | 6.06 | 7.41 | 3:1 | pass |
| Diverging track well vs sf (edge) | 1.09 | 1.06 | none | info |
| Trend 13/600 gain on sf | 7.42 | 8.45 | 4.9 (floor 4.5) | pass |
| Trend 13/600 loss on sf | 5.57 | 8.53 | 4.9 (floor 4.5) | pass |
| Leg names link 15/600 on sf | 8.15 | 8.45 | 4.9 (floor 4.5) | pass |
| Week day letter 13/400 ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |
| Week date 17/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Week event dot g500 vs sf (glyph) | 6.41 | 2.61 | 3:1 | FAIL |
| Week today date ink on well | 15.66 | 15.20 | 4.9 (floor 4.5) | pass |
| Week today ring g600 vs sf (glyph) | 8.15 | 2.06 | 3:1 | FAIL |
| Latest rounds spark g500 vs sf (glyph) | 6.41 | 2.61 | 3:1 | FAIL |
| Latest rounds spark end dot g600 vs sf (glyph) | 8.15 | 2.06 | 3:1 | FAIL |

Fixes for the pairs under target (all are dark-theme chart marks; settled 3 Nov: the Steady spark and every non-text chart mark need 3:1):
1. **Line chart, last point, week dots, spark lines in dark** (#1F6B45: 2.61): FAIL. Fix: `--ch-green-500` dark #6DB488 (6.87).
2. **Spark end dot and week today ring in dark** (#155A39: 2.06): FAIL. Fix: spark end dot `--ch-green-500` (#6DB488, 6.87); today ring `link` #7CC79B (8.45).

### 11.6 Redline (S-HOME)

1. Hero bottom radius 24, full bleed; bar row 44 tall at 54.
2. Greeting 34pt, 8 under the date.
3. Capsules 34 tall, radius 10, 8 apart.
4. Up next padding 16, radius 16; title 22pt.
5. Today rows 56 with a 48 time column.
6. Team scoring figure 40pt; chart 70 tall.
7. Leg cell padding 14 16; diverging bar 8 tall with a 1.5 zero rule.
8. Week tiles 7 across, radius 14, gap 4.
9. Latest round rows 64; score well 54 x 48.
10. Hero to first card: 24.

## 12. S-HOME.round-sheet: round sheet

From a Latest rounds row. Sheet 74% (625 of 844 at 390).

| Element | Box | Type | Colour | Data |
|---|---|---|---|---|
| Header | 1.3 Sheet; two lines: name 650 17k/1.2, then "Springfield CC · Wed, Oct 21" 400 15k/1.3 `ink2` | | | `ChLatestRound` |
| Summary strip | card, grid 4 columns; cell padding 12, gap 5; label 400 13k/1 `ink2`; figure 600 19k/1 tab | to-par inside the score at 0.7em: `flag` under par, `ink2` otherwise; SG in `gain`/`loss` | | Score, GIR, Putts, SG. Totals-only rounds: GIR, Putts and SG show the no-data dash (03: staging rounds are totals only) |
| Scorecard | card, padding 12 12 10, scrolls sideways; grid `38px repeat(9,1fr) 34px`, gap 2, min-width 300; cells 26 tall; 500 12.5k/1 tab centred | hole numbers 13 `ink4`; row labels 650 `ink2` ("Out", "Par", "Score"); totals 650 | | `holes`. No hole data: card hidden |
| Score marks | 24 x 24 | birdie or better: circle ring 1.5 `flag` with `flag` 650 text; bogey: square r 4, inset ring 1.5 `ink2`; double or worse: double square ring | | per hole score minus par |
| Buttons | grid 2, gap 10, 46 | Message (`msg` 16), Round recap (primary, `chart` 16) | | today's links |

States: a round with no card shows only the summary and buttons. XXL: the scorecard scrolls sideways (min-width 300 grows with text); summary figures 25.8pt fit 4 cells of 81. Contrast: all pass (see 13); birdie text 6.48 / 7.06. Redline: sheet top at 26%; summary 4 equal cells; scorecard cell 26 tall; score marks 24; buttons 46.


## 13. Contrast: shared, sheet and desktop tables, and every pair under target

Method: WCAG 2.x relative luminance. Alpha layers are composited over the surface they actually sit on (a 5% ink wash over the card, a tint over the well, the green card over the page). `color-mix()` is resolved in sRGB, as the page does. Dark values use the app's own dark class tones (04 section 8, settled 3 Nov) and the settled dark Sophomore fill #8B6B30. 283 pairs were measured, each in light and dark.

The screen tables for S-CLASSES, S-ROSTER (with S-ROSTER-PLAYER), S-ROSTER.profile and S-HOME are printed in full in 4.10, 7.10, 8.4 and 11.5 and are not repeated here. This section prints the rest, then rolls up every pair under target with its fix and its value after the fix.

"Need" is 4.9 (floor 4.5) for text under 24pt (19pt at 700), 3:1 for large text and for glyphs, marks and control edges. "FAIL" in a table means under the need as drawn on the page; it does not mean the build ships it, because every FAIL has a fix or a stated "decorative" reason below.

### 13.1 Shared chrome and shared components

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Bar title "Classes" 18/600 on-g-ink on frame | 12.03 | 16.12 | 4.9 (floor 4.5) | pass |
| Bar chevron and icon glyphs on-g-soft on frame | 8.88 | 11.52 | 3:1 | pass |
| Champagne dot on frame | 8.62 | 11.55 | 3:1 | pass |
| Bell badge "2" 11/650 on-g-ink on g700 | 8.88 | 8.88 | 4.9 (floor 4.5) | pass |
| Bell badge fill g700 against frame (glyph) | 1.35 | 1.82 | 3:1 | FAIL |
| Bell badge 1.5px ivory ring vs frame | 12.03 | 16.12 | 3:1 | pass |
| Push bar "< Roster" 17/500 champagne on frame | 8.62 | 11.55 | 4.9 (floor 4.5) | pass |
| Push bar name 17/600 on-g-ink on frame | 12.03 | 16.12 | 4.9 (floor 4.5) | pass |
| Status bar time white on frame | 13.94 | 18.68 | 4.9 (floor 4.5) | pass |
| Large title 34/600 ink on page | 15.10 | 16.01 | 3:1 | pass |
| Context line 15/400 ink2 on page | 8.64 | 11.45 | 4.9 (floor 4.5) | pass |
| Strip chip label 14/500 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Strip chip "on" 14/500 white on g600 | 8.22 | 8.22 | 4.9 (floor 4.5) | pass |
| Strip chip fill sf vs glass over page (edge) | 1.05 | 1.06 | 3:1 | FAIL |
| Seg off label 15/500 seg-off on track mid | 6.92 | 11.53 | 4.9 (floor 4.5) | pass |
| Seg off label on track top stop (worst) | 6.28 | 11.84 | 4.9 (floor 4.5) | pass |
| Seg on label 15/600 seg-on on chip top stop | 6.04 | 5.62 | 4.9 (floor 4.5) | pass |
| Seg on label on chip bottom stop | 9.60 | 6.92 | 4.9 (floor 4.5) | pass |
| Card title 17/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Card meta 15/400 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Card link 15/400 link on sf | 8.15 | 8.45 | 4.9 (floor 4.5) | pass |
| Row title 16/500 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Row subtitle 15/400 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Row figure caption 13/400 ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |
| Chevron 15 ink4 on sf | 6.61 | 6.99 | 3:1 | pass |
| Card note 15/400 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Chip 13/600 link on gtint over sf | 6.96 | 6.68 | 4.9 (floor 4.5) | pass |
| Amber chip 13/600 warn-fg on warn-bg over sf | 6.77 | 8.40 | 4.9 (floor 4.5) | pass |
| Button 15.5/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Primary button 15.5/600 white on g600 | 8.22 | 8.22 | 4.9 (floor 4.5) | pass |
| Danger button 15.5/600 flag on sf | 6.48 | 7.06 | 4.9 (floor 4.5) | pass |
| Sheet title 17/650 ink on sheet | 17.08 | 14.02 | 4.9 (floor 4.5) | pass |
| Sheet close glyph ink2 on ink 8% over sheet | 8.33 | 8.10 | 3:1 | pass |
| Sheet grabber ink 22% vs sheet | 1.59 | 1.92 | 3:1 | FAIL |
| Empty icon link on gtint over sf | 6.96 | 6.68 | 3:1 | pass |
| Failed icon warn-ic on warn-bg over sf | 4.85 | 6.76 | 3:1 | pass |
| Empty/failed title 16/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Empty/failed body 14/400 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Skeleton bar sep on sf (decorative, no target) | 1.22 | 1.31 | none | info |
| Skeleton bar 16% ivory on green feature card (decorative) | 1.58 | 1.54 | none | info |

### 13.2 Sheets

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Facts label "Meets" 13/400 ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |
| Facts value 16/500 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Sheet hero mist: name 20/600 ink on t | 13.15 | 12.10 | 4.9 (floor 4.5) | pass |
| Sheet hero clay: name 20/600 ink on t | 12.97 | 12.51 | 4.9 (floor 4.5) | pass |
| Sheet hero sand: name 20/600 ink on t | 13.88 | 12.47 | 4.9 (floor 4.5) | pass |
| Sheet hero stone: name 20/600 ink on t | 13.31 | 12.51 | 4.9 (floor 4.5) | pass |
| Sheet hero sage: name 20/600 ink on t | 13.38 | 12.25 | 4.9 (floor 4.5) | pass |

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Team code 17/600 mono ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Summary label 13/400 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Summary figure 19/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Hole number 13/500 ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |
| Par row 12.5/500 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Score 12.5/500 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Birdie 12.5/650 flag + ring on sf | 6.48 | 7.06 | 4.9 (floor 4.5) | pass |
| Bogey square ring ink3 vs sf (glyph) | 9.77 | 10.25 | 3:1 | pass |
| Sheet subtitle 15/400 ink2 on sheet | 9.77 | 10.02 | 4.9 (floor 4.5) | pass |

### 13.3 Desktop (S-ROSTER desktop, S-HOME desktop, the desktop peek)

| Pair | Light | Dark | Need | Result |
|---|---|---|---|---|
| Sidebar link 14.5/500 ink2 on sf2 | 9.12 | 9.70 | 4.9 (floor 4.5) | pass |
| Sidebar group 13/500 ink4 on sf2 | 6.17 | 6.61 | 4.9 (floor 4.5) | pass |
| Sidebar on 14.5/600 ink on sf | 17.08 | 14.34 | 4.9 (floor 4.5) | pass |
| Header kicker 14/500 ink3 on page | 8.64 | 11.45 | 4.9 (floor 4.5) | pass |
| Table head 13/500 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Table sub 13/400 ink3 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Selected row name 15/700 ink on ink 5% over sf | 15.47 | 12.65 | 4.9 (floor 4.5) | pass |
| Selected row sub 13/400 ink3 on ink 5% over sf | 8.85 | 9.05 | 4.9 (floor 4.5) | pass |
| Status chip "Active" 13/600 link on gtint | 6.96 | 6.68 | 4.9 (floor 4.5) | pass |
| Filter pill 14/500 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Filter pill on 14/500 white on g600 | 8.22 | 8.22 | 4.9 (floor 4.5) | pass |
| Search placeholder 14 ink3 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Peek sub 13.5 ink3 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Peek figure label 13/400 ink2 on sf | 9.77 | 10.25 | 4.9 (floor 4.5) | pass |
| Leaderboard rank 13/600 ink4 on sf | 6.61 | 6.99 | 4.9 (floor 4.5) | pass |

### 13.4 Roll-up: all 47 pairs under target

47 of the 283 pairs are under their need as the page draws them. They fall into three groups.

**A. Text under the floor (6 pairs). Must be fixed.**

| # | Pair | As drawn light / dark | Fix | After the fix light / dark | Section |
|---|---|---|---|---|---|
| A1 to A5 | Binder off-day letters ("T"), 11.5/600, tone ink at 70% on the tone tint (mist, clay, sand, stone, sage) | 3.31, 3.16, 2.96, 3.39, 3.28 / 4.94, 5.09, 5.28, 5.22, 5.17 | Draw the letter in `--ch-cl-tf` at 100% in both themes; the tile outline stays at 70% | 5.40 to 6.71 / 7 and up | 4.5 |
| A6 | Injured coin initials (white, `saturate(.35)` and opacity .8 on the whole coin) | 3.94 / 4.37 | Apply the filter and the 80% to the coin fill only; initials stay opaque white | 6.22 / 5.21 | 7.7 |

Also fixed by a settled value, so it shows as a pass in 7.10: the dark Sophomore coin, white initials on #8F6E31 = 4.73 on the page; the build uses #8B6B30 = 4.95.

**B. Glyphs, chart marks and control edges under 3:1 (23 pairs). Must be fixed.** (Settled 3 Nov: the Steady spark and every non-text chart mark need 3:1.)

| # | Pair | As drawn light / dark | Fix | After the fix light / dark | Section |
|---|---|---|---|---|---|
| B1 | Practice dot, mint, on the card | 1.99 / 8.44 | 1.5px inset ring `--ch-green-500` | 6.41 / pass | 4.3 |
| B2 | Practice block on the ribbon, mint, on the well | 1.82 / 8.95 | same ring | 5.88 / pass | 4.3 |
| B3 to B7 | Binder today ring, `--ch-green-600` #155A39, on the dark tone tints | 6.28, 6.19, 6.63, 6.36, 6.39 / 1.74, 1.79, 1.79, 1.79, 1.76 | Dark ring `--ch-accent-ink` #7CC79B; light unchanged | unchanged / 7.14 to 7.38 | 4.5 |
| B8 | Switch off: track ink 16% on the card | 1.39 / 1.58 | 1px inset ring at `color-mix(ink 50%)` on the off track | 3.31 / 4.55 | 4.6 |
| B9 | Switch off: white thumb against the off track | 1.40 / 10.72 | the same ring gives the thumb's track its edge | 3.31 / pass | 4.6 |
| B10 to B13 | Class-mix segments (Senior, Junior, Sophomore, Freshman) on the green team card | 2.16, 2.32, 2.65, 2.26 / 3.56, 3.72, 3.78, 3.44 | 1px inset ring `rgb(244 241 232 / .5)` on each segment in place of the 14% ring | 4.21 / 4.21 and up | 7.2 |
| B14, B15 | Leader card icon in year colour (Senior, Freshman) | 5.46, 5.22 / 2.92, 2.84 | Icon colour `color-mix(in srgb, yr 62%, ink)`, as the year chip does | 7.27 to 8.23 / 5.41 to 5.82 | 7.3 |
| B16 | Form bar, neutral (ink 20%) | 1.52 / 1.80 | `--ch-chart-flat` #6B675F / #A39D90 | 5.58 / 6.27 | 7.6 |
| B17 | Profile chart line, `--ch-green-500` as the page draws it in dark (#1F6B45) | 6.41 / 2.61 | Map to `--ch-green-500` whose app dark value is #6DB488 | 6.41 / 6.87 | 8.4 |
| B18, B19 | Home line chart and its last-point dot (dark #1F6B45) | 6.41 / 2.61 | same | 6.41 / 6.87 | 11.5 |
| B20 | Week event dot (dark #1F6B45) | 6.41 / 2.61 | same | 6.41 / 6.87 | 11.5 |
| B21 | Latest rounds spark line, the Steady spark included (dark #1F6B45) | 6.41 / 2.61 | same | 6.41 / 6.87 | 11.5 |
| B22 | Latest rounds spark end dot (dark #155A39) | 8.15 / 2.06 | `--ch-green-500` | 6.41 / 6.87 | 11.5 |
| B23 | Week today ring (dark #155A39) | 8.15 / 2.06 | `--ch-accent-ink` #7CC79B in dark | 8.15 / 8.45 | 11.5 |

**C. Decorative, no fix required (18 pairs).** Each repeats information that text beside it already carries, so WCAG 1.4.11 does not ask for 3:1. They stay as drawn unless the optional fix is chosen.

| # | Pair | Light / dark | Why it is decorative | Optional fix |
|---|---|---|---|---|
| C1 | Bell badge fill `--ch-green-fill-700` against the bar | 1.35 / 1.82 | The badge's ivory 1.5px ring is its edge (12.03 / 16.12); the count inside is text (8.88 / 6.39) | none |
| C2 | Section strip capsule fill against the glass | 1.05 / 1.06 | Each capsule's label is the control; the current one is the green fill | none |
| C3 | Sheet grabber, ink 22% | 1.59 / 1.92 | The iOS sheet standard; the close button (44 hit area) is the accessible close, and drag is not the only way out | none |
| C4 to C8 | Credits bar segments in dark (the app's dark tone tints on #08150E) | pass / 1.27 to 1.31 | The label states the credit total, each binder its own credits | dark segments in `--ch-cl-tf` (9 to 11:1) |
| C9 to C18 | Ribbon class blocks on the well: fills 1.13 to 1.21 light, 1.21 to 1.26 dark; rings 1.40 to 1.55 light, 1.77 to 1.93 dark | see 4.10 | The rows under the ribbon give every class and time in text | ring in `--ch-cl-tf` (6.09 to 7.89 / 10.58 to 11.16) |

Summary for the build: 29 pairs (groups A and B) change; 18 stay decorative. After the fixes, every text pair in the lane is at or over 4.9, and every glyph, mark and control edge that carries meaning is at or over 3:1.

## 14. Where 04, 02 or the app disagree with the HTML, and what to build

Rule: the HTML wins over 04. Where the coordinator settled a value (3 Nov), the settled value wins over both. Where the app already has a house value that the page only approximates (a spring, a scrim), this file builds the app's value and says so, so the side-by-side check (SHARED-12) knows which frames to compare.

| # | Topic | 04 or 02 says | HTML does | Build | SHARED |
|---|---|---|---|---|---|
| 1 | Push underlay shift | 04 section 7: screen behind moves 30%; app route view transition `--ch-vt-parallax` -30% | `translateX(-30%)` on the base layer, 462ms | **24%**, `CH_UNDERLAY_SHIFT` 0.24 (settled 3 Nov). The page is not edited; the underlay frames are expected to differ by 6% of the width and are excluded from the one-frame check (07 M-CRH-17) | 12 |
| 2 | The house spring for sheets, pushes and the strip | 04: "462ms --smooth" | `--smooth` is a `linear()` string that fits k about 222, c about 29.8 (m 1): softer. At 25% of the time it is at 0.51 of the way | The app's `CH_SPRINGS.smooth`: k 405.6, c 40.28, m 1, settles at 462ms, `--ch-ease-spring-smooth` / `--ch-dur-spring-smooth`; at 25% of the time it is at 0.675. Same duration, faster start. Recommend the page's `--smooth` be replaced with the app's string before clips are recorded, or SHARED-12's one-frame rule fails on every sheet and push | 12 |
| 3 | The settle spring (segmented chip, switch thumb) | 04 matches the page | `--settle` `linear()` with a 1.011 overshoot, fits k about 363, c about 31.2 | App `chSpring('settle')`: k 405.6, c 36.25, m 1, 417ms, peak 1.0015 (no CSS token; it runs in TS) | 12 |
| 4 | Segmented chip curve | 04: settle spring | `transform 360ms cubic-bezier(.34,1.3,.64,1)` on the chip | The app's stock `ui/Segmented.tsx` (chip slides on the settle spring via `useSlidePlate`), which 02 says must not change | 12 |
| 5 | Segmented size | 04: page size | 32 tall, label 500 15k | Stock 36 tall, label `--ch-type-13-medium` (02: Segmented.tsx unchanged). Flagged for Nick: this is the one visible size difference in the lane | 12 |
| 6 | Segmented label on change | 04: label weight crossfades | label colour 360ms `--ease`; weight snaps | Colour change on the chip's timing; weight snaps, as the page does | 6 |
| 7 | Sheet dim colour | 04: `--ch-scrim` | `rgb(0 0 0 / .32)`, opacity 260ms linear | `--ch-scrim` (`rgb(20 20 18 / .36)` / `rgb(2 6 4 / .58)`), the app dialog's own; the page's .32 black is a stand-in | 12 |
| 8 | Press curve | MOTION card text: `cubic-bezier(.2,.8,.2,1)` | CSS `.is-down` scale .97 110ms on `--ease` cubic-bezier(.22,1,.36,1); release 280ms `--ease` | `--ch-ease` (the CSS, which equals 04 section 7) | 12 |
| 9 | Card press scale | DESIGN_LANGUAGE and the page: cards scale .97 | `.is-down` on cards | The app press controller scales only boxes up to 240 wide, at `max(.96, 1 - 6/width)`. Cards and binders opt in with `data-ch-press-scale=".97"` (07 M-CRH-01). Rows never scale (5% ink wash only) | 6 |
| 10 | Press under Reduce Motion | 04: "wash only"; MOTION card demo: opacity .7 | CSS: `.rm` removes the press transform; cards get no feedback | Rows keep the instant 5% wash; cards and buttons get the same wash at 6% with no scale, no transition | 6 |
| 11 | Switch timing | MOTION card: "360ms, 260ms, segmented curve"; 04: 462ms settle | thumb 462ms `--settle`, travel 20; track colour 260ms linear | The app's `.ch-switch` today: 17px travel, 260ms `--ch-ease-spring`. Build the page geometry (51 x 31, thumb 27, travel 20) and the app settle spring for the thumb, 260ms linear for the track (07 M-CRH-26) | 12 |
| 12 | Section strip under Reduce Motion | settled: the Reduce Motion crossfade | `.rm` sets the strip transition to 1ms (an instant cut) | Opacity crossfade over `CH_FADE_MS` 180ms | 6 |
| 13 | Dim, chevron rotation and segmented label colour under Reduce Motion | settled: the Reduce Motion crossfade | no `.rm` rule: they keep their full timing | Dim: opacity over `CH_FADE_MS` 180ms. Chevron: instant (it is a rotation). Label colour: instant | 6 |
| 14 | Large title collapse end state | 02 plan: `@keyframes ch-lt-tuck` to scale .86, opacity 0 | `opacity 1 - .9p`, scale `1 - .14p` over 0 to 56px: ends at opacity 0.1, scale .86 | Opacity 0.1 at the end, as the page does (the 02 keyframe's last stop changes from 0 to 0.1) | 12 |
| 15 | Bar shade timing | app: 180ms `--ch-ease` | 180ms linear | 180ms linear (the HTML); the shade only fades, so the curve makes no visible difference beyond 1 frame | 12 |
| 16 | Bar shade threshold | app: `data-scrolled` at scrollTop over 0; 02: over 8 | `is-solid` at scrollTop over 8 | Over 8 (02 and the page agree; the app value changes) | 12 |
| 17 | Sticky sort padding | 02: 8 top and bottom | 6 top, 10 bottom | 6 / 10 (HTML) | 12 |
| 18 | Reduce Motion fade length | 02 2.1 planned a new `--ch-dur-crossfade-rm` 120ms | `.rm` sheets and push: opacity 120ms linear | `CH_FADE_MS` 180ms (`chFade('fade')`, `--ch-ease`; `--ch-dur-vt-fade` 180ms in CSS), the owner decision of 24 Oct pinned by a test (coordinator, 3 Nov). `--ch-dur-crossfade-rm`, where used, is set to the same value in PR 1. The design clips under reduce run 120ms; the check compares end states, not frames | 6 |
| 19 | Token: `--ch-text-secondary` | 04 maps `--ink2` to it | `--ink2` #46433D / #D0C9B8 | The app token today is ink-700 #3A3833 / #E2DCCD. Re-point it to the page values (06 1.2) | 4 |
| 20 | Token: `--ch-text-tertiary` | 04 maps `--ink4` to it | #5F5C55 / #ADA697 | App today is ink-600 / dark ink-500 #BAB3A4. Set explicit values (06 1.2) | 4 |
| 21 | Token: `--ch-accent` in dark | 04 maps `--link` to it | #7CC79B in dark | App dark `--ch-accent` is #23704A, a fill (2.9:1 as text). New `--ch-accent-ink` | 4 |
| 22 | Tokens: `--ch-green-500/600/700` "(same)" in dark | 04 section 2 says the dark values are the same | page dark g600 and g700 are fills (#155A39, #0F4A2F) | App dark green-600 #6BBB8C and green-700 #84C9A0 are text mints; white on them fails. Fills use `--ch-green-fill-600` (#155A39 / #23704A, white 6.02) and `--ch-green-fill-700` (#0F4A2F / #1D613F, ivory 6.39). Dark `--ch-green-500` #6DB488 fixes the dark charts (13.4 B17 to B22) | 4 |
| 23 | Dark class tones | page has its own dark tones | page dark tint, ink, ring per tone | The app's own dark tones (04 section 8, settled 3 Nov): mist #232C2E / #B9CACD / #3B494C, clay #30261F / #E2C1AF / #503E33, sand #2D2818 / #DCCB9C / #4C432A, stone #292824 / #D0CABE / #47443C, sage #222C24 / #BDD0C0 / #3B4B3D | 4 |
| 24 | Dark Sophomore fill | page #8F6E31 | white on it 4.73 | **#8B6B30** (settled 3 Nov), 4.95 | 4 |
| 25 | Practice rounds in form bars | 04 is silent; the page's demo includes them | the last five rounds whatever their type | Practice rounds are left out of the form bars (settled 3 Nov), as they are left out of every average, leader and top five | 11 |
| 26 | Home bar row | 04: green bar fixed over the hero | the bar row scrolls inside the hero | The app's fixed hero-mode bar (SHARED-1, the bar is unchanged); the hero scrolls under it | 1 |
| 27 | Leader card width | 04: 62% | `min(62%, 220px)` | `min(62%, 220px)` | 12 |
| 28 | Large title note in DESIGN_LANGUAGE section 8 | "the title moves into the bar" | the title fades and scales in place; the bar title never changes | In place (HTML). DESIGN_LANGUAGE section 8 is out of date | 6 |
| 29 | Chart grow | 04: chart grows on load | `@keyframes grow` scaleX 0 to 1, 360ms `--ease`, only on a full render (`S.grow`) | Once per screen visit; never on sort, scroll, theme or refresh (07 never-animate list) | 6 |
| 30 | Skeleton pulse period | 04 silent | `skp` 1.6s ease-in-out, 50% at opacity .55 | The app's `ch-skel-breathe` over `--ch-dur-shimmer` 1.9s (same shape, same .55), so this lane's skeletons breathe with every other Clubhouse skeleton. A loop period is not compared frame by frame (07 M-CRH-35) | 12 |
| 31 | Sheet heights | 04 follows the page | the class sheet 90%, requests 62%, round sheet 74% of the screen | The app's `ui/Modal.tsx` has no detents: content height, capped at 92dvh (SUBSURFACES, 3 Nov). Build: the three sheets take the design height as a fixed height, `min(<share> of the screen, 92dvh)`, through a new optional height prop on Modal that leaves every other Modal as it is (fixed 4 Nov: settled in DECISIONS, no longer an open flag). Every other sheet in the lane keeps content height | 12 |
| 32 | Press and hold on a row | not drawn | rows have press feedback only | The app's 450ms hold on a coach Roster row or a Home Latest rounds row opens PlayerPeek. Kept unchanged (07 M-CRH-41) | 6 |
| 33 | Classes plus button | 04 follows the page | one + ("Add or import a class"), menu not drawn | The app's + opens ClassForm directly and Import is a separate header button. Build the new menu (section 6, 07 M-CRH-31) with Add class and Import schedule | 1 |

Already agreeing (checked, no action): 04 section 7 press curve `cubic-bezier(.22,1,.36,1)` matches the CSS; no Captain tag anywhere and a plain "Injured" chip, injured players counted as active (Nick, 31 Oct, 04 section 8), as the page draws; the bar title and bell are as SHARED-1.

## Completeness pass, 4 Nov 2026

Specs for every piece the 05 completeness pass adds that the design never drew. Same table shape as the sections above. Short names are the 1.2 table. Contrast computed the same way (WCAG 2, layers composited), light / dark; every new pair passes 4.9:1 for text and 3:1 for marks, so none joins the 13.4 roll-up.

### CP-6.1 Focus ring (S-ALL.keyboard, every interactive element in the lane)

| Element | Box | Type | Colour (light / dark) | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Ring on the page, cards and sheets | `outline: 2px solid`, `outline-offset: 2px`, follows the element's radius (rows: inset 2 inside the row, radius 10, so it never crosses a hairline) | | `link` `--ch-accent-ink` #155A39 / #7CC79B | | unchanged | `:focus-visible` only; never on pointer or touch focus |
| Ring on green (bar keys, switcher, hero capsules, Up next card, term card overlap chip, push bar back) | same | | `champ` `--ch-champagne-dot` #E2C98F both themes | | unchanged | same |

Contrast (non-text, 3:1): ring on page 7.21 / 9.44; on card 8.15 / 8.45; on sheet 7.96 / 8.27; on well 7.48 / 8.96; champagne on `frame` 8.62 / 11.55. Motion: instant, no transition (07 M-CRH-40, M-CRH-50).

### CP-6.2 Form field in the restyled sheets (ClassForm, ExamSheet, TermSheet, TeamBreakSheet, InviteByEmail chips field, NoClassTodaySheet radio rows)

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Label | margin-bottom 6 | 500 13k/1.2 | `ink2` | | | today's label text |
| Field | fill width, min-height 46 (grows with text), padding 0 14 (text area 12 14), r 12, `well` fill, `inset 0 1px 2px rgb(28 25 18/.06)` (dark `rgb(0 0 0/.3)`), no border | value 400 17k/1.3 (17, so iOS never zooms on focus); placeholder 400 17k | value `ink`; placeholder `ink4` | trailing icons 18, `ink2` | full field, at least 46 x full width | today's fields, order, defaults and validation |
| Invalid | as field plus `inset 0 0 0 1.5px var(--ch-flag)` | | ring `flag` | | | today's rule |
| Error line | margin-top 6, flex gap 5 | 400 13k/1.35, wraps | `flag` | `alert` 13 stroke 2.4 `flag` | | today's message |
| Group gap | 16 between fields, 24 between groups | | | | | |
| Radio row (NoClassTodaySheet) | 06 1.3 Row, min 52; check `check` 18 in `link` on the chosen row | 500 16k | `ink` | | full row | today's options |
| Save area | sticky at the sheet bottom, padding 12 edge (safe area added), `sheet` fill, hairline above 0.66 `sep` | buttons per CP-6.4 | | | 46 tall | today's buttons |

Contrast: value 15.66 / 15.20 on `well`; label 8.96 / 10.87 on `well`'s parent (`sheet`: 9.54 / 10.02); placeholder 6.06 / 7.41; error text on `sheet` 6.32 / 6.90; invalid ring on `well` 5.94 / 7.48. XXL: fields grow, the label wraps above, nothing clips; the save area stays pinned and the body scrolls. Keyboard up (iPhone): the sheet body scrolls the focused field above the keyboard; the sheet does not change height.

### CP-6.3 Segmented inside sheets (Import Pick, profile Availability)

Stock `ui/Segmented.tsx`, unchanged (02 section 1), full width of the card, 36 tall, inside a 06 card with no header (Availability: header "Availability"). Contrast as the stock control.

### CP-6.4 Confirm (every restyled confirm: Discard, Start over, Remove class, Delete all, Remove exam, Mark inactive or active, Remove player, Remove break, note discard)

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Sheet | 06 1.3 Sheet, content height | | `sheet` | | | |
| Title | padding 8 edge 4 | 650 17k/1.25, wraps | `ink` | | | today's title |
| Body | padding 0 edge 16 | 400 15k/1.4, wraps | `ink2` | | | today's body |
| Buttons | grid 2 columns, gap 10, padding 0 edge (safe area); keep button left, the act right | 06 1.3 Buttons, 46 tall | keep: default; act: danger (`flag` on `card`) or primary when not destructive | | 46 each | today's labels |
| Buttons at XXL or a long label | stack, gap 10: the act on top, keep at the bottom | | | | 46 each | |
| Desktop | today's centred dialog, width as today (420 or 460), r 16, `sheet` fill, the same type | | | | | |

Contrast: title `ink` on `sheet` 16.66 / 14.02; body 9.54 / 10.02; danger label on `card` 6.48 / 7.06.

### CP-6.5 S-ROSTER.requests.none and .one

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Requests card, none | card, no header, one block padding 22 20, centred | 400 15k/1.4 "No join requests right now." | `ink2` | | none | `requests.length` 0 |
| Team code card | as section 9 | | | | | `golf_teams.join_code` |
| Approve all | absent from the DOM when `requests.length` is 0 or 1 | | | | | DECISIONS |

### CP-6.6 S-CLASSES.no-term and S-CLASSES.term-edges

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| No term | term card and context line absent; Today card's top sits where the term card's would (195 at k 1) | | | | | `termOn` returns no term: render without it, never throw to the route error |
| Before start heading | the term card heading cell, week well absent (the heading starts at x 16 + 16) | "Starts Mon, Aug 20" 650 20k; "17 weeks · term ends Dec 15" 400 14k | `h-ink`; `h-ink2` | | none | `term.start`, `term.weeks`, `term.end` |
| After end heading | same, no well | "Term ended" 650 20k; "Ended Dec 15" 400 14k | `h-ink`; `h-ink2` | | none | `term.end` |
| Last week sub | | "1 week left · term ends Dec 15"; on the end date "Ends today" | `h-ink2` | | | `weeks − week` |
| Term line before start | fill width 0, knob at x 0 | | as 4.2 | | none | |
| Term line after end | fill 100%, knob absent | | as 4.2 | | none | |

Contrast: `h-ink` on `frame` 12.34 / 16.54; `h-ink2` 9.13 / 11.79.

### CP-6.7 S-CLASSES.partial

The failed block (06 1.3) inside the card whose read failed, with that card's header kept. Overlaps uses today's CH-12202 copy. Term card: absent when its read failed. Contrast as 1.3.

### CP-6.8 Toast copy this pass adds (today's toast component, unchanged look)

| Toast | When | Copy |
|---|---|---|
| Profile missing | S-ROSTER.profile.missing | "That player isn't on your roster." |
| Profile removed | S-ROSTER.profile.removed | "{first} is no longer on the roster." |

No other new toast; every other result uses today's copy (SUBSURFACES "Toasts").

### CP-6.9 S-HOME.day-actions and S-HOME.queue-failed (on the green hero)

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Action capsules on Up next | flex gap 8, margin-top 12; each hug, height 34, padding 0 12, r 999, fill `rgb(255 255 255/.10)`, ring `inset 0 0 0 1px rgb(255 255 255/.14)` | 600 14k/1, nowrap | `h-ink` | `bell` (Nudge), `msg` (Message), `map-pin` (Directions) 15 stroke 2.2 `h-ink2` | 44 tall: `::before` inset -5 0 | today's `DayCard` actions, shown only where today shows them |
| Queue failed line | in the capsule row's place, flex gap 10, wraps | 400 15k/1.4 today's CH-2220 text | `h-ink2` | `alert` 15 `h-ink2` | | `queue` read failed |
| Try again capsule | as the action capsule | "Try again" | `h-ink` | `refresh` 15 | 44 tall | refetches the queue |

Contrast: capsule label `h-ink` on the capsule over `frame` 9.14 / 12.75 (#F4F1E8 on 10% white over #0A331F / #08150E); capsule icon `h-ink2` on the capsule 7.00 / 9.44; `h-ink2` text on `frame` 9.13 / 11.79; on the glass Up next card (8% white) 7.40 / 9.96. Capsules on Up next sit on the card's 8% layer, so the capsule's own fill composites over it: label 7.24 / 9.96, icon 5.68 / 7.57. XXL: capsules wrap to a second line; none clips.

### CP-6.10 Accessible names and reading order (S-ALL.voiceover)

| Element | Role | Accessible name (example) | Notes |
|---|---|---|---|
| Large title | heading level 1 | "Roster" | the context line is its description, read next |
| Term card | group | "Week 11 of 17. 6 weeks left, term ends Dec 15." | well, line and knob `aria-hidden` |
| Credits bar | img | "15 credits across 6 classes" | segments hidden |
| Overlap chip | button | "1 overlap this week. Show overlaps" | |
| Binder | button | "BIOL 1010, Principles of Biology, 3 credits, Monday Wednesday Friday 9:05 AM, Science Hall 214" | week strip tiles hidden |
| Day ribbon | img | "Monday from 7 AM to 5 PM: BIOL 1010 9:05, …, Team practice 3:00" | as 4.3 |
| Status switch | switch | "Share class status with coaches" | `aria-checked` |
| Team card | group | "2026–27 season. 8 players. 7 active, 1 injured, 2 waiting." | coach; the player version has "7 active" only |
| Mix bar | img | "1 Senior, 4 Juniors, 1 Sophomore, 1 Freshman" | |
| Top five | group | "Top five average 76.2" | coach only; coins hidden |
| Leader card | button | "Low average, Cole Bennett, 74.6. Open profile" | coach only |
| Sort | radiogroup | "Sort by" (label in `aria-label` only, never a text node, 08 item 13) | stock |
| Coach row | button | "Theo Marchetti, Senior. In class until 11:50 AM. Average 70.9, handicap plus 0.8. Last five rounds: 71, 70, 72, 69, 70" | form bars `aria-hidden`; the scores are in the label |
| Player row | text, not a button | "Theo Marchetti, you, Senior, Class of 2027, handicap plus 0.8" | no teammate figure other than HCP, as today |
| Join requests row | button | "2 join requests: Liam Ortiz, Noah Patel" | |
| Profile head | heading level 1 on the name; chip read after | "Jonah Okafor. Junior, Class of 2028" | coin hidden |
| Home hero | heading level 1 on the greeting | "Good morning, Nick." | date read before, brief after |
| Waiting capsule | link | "2 join requests" | |
| Up next card | link | "Practice, in 2 hours 15 minutes, Short-game block, 11:30 AM to 1:30 PM, Practice green, 4 of 6 going" | coins hidden |
| Team scoring chart | img | "Team average by round day, last 10: from 75.0 to 73.0" | |
| Leg cell | group; names are links | "Approach, minus 3.3 strokes per round, down. Gains most Tyler H., loses most Ethan P." | bar hidden |
| Week tile | link | "Monday, 2 events" | |
| Latest round row | button | "Theo Marchetti, Oakmont CC, Wednesday Oct 21, 70, 1 under" | spark hidden |
| Sheets | dialog, `aria-modal`, labelled by the header title | "BIOL 1010" | the grabber is hidden; close is "Close" |

Order: the DOM order is the visual order on every screen; nothing uses a positive `tabindex`.

### CP-6.11 Busy button (S-ALL.busy)

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Any write button while its write runs | unchanged box | unchanged label | unchanged; default buttons hold the pressed fill `color-mix(in srgb, var(--ch-ink) 6%, var(--ch-card-bg))`, primary buttons hold their fill | | unchanged, but `pointer-events: none` | `aria-busy="true"`, `aria-disabled="true"`; released when the write returns |

No opacity change, so contrast stays as each button's pair. Applies to Approve, Decline, Approve all, every confirm's act, Save in every form, Import, Send invites, Mark no class, Save dates, Mark no classes.

### CP-6.12 Round sheet CoachHelm and Player stats (S-HOME.round-links)

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| Primary when no recap | the drawn Round recap button | today's "Player stats" | as 12 | `chart` 16 | 46 | today's rule for a round with no recap |
| CoachHelm | full width, 46, margin-top 10, default button | today's label | `ink` on `card` | `sparkles` 16 `link` | 46 | today's link; absent when today hides it |

### CP-6.13 Profile cards the design did not draw (S-ROSTER.profile.order)

| Card | Box | Contents | Data |
|---|---|---|---|
| Availability | 06 card, header "Availability" | stock Segmented Available / Injured / Away (CP-6.3); the coach-only note line under it as today | `availability`, `golf_player_availability_coach_notes` |
| Coach's note | 06 card, header "Coach's note", meta "Only coaches see this" when today shows that line | the note field (CP-6.2 text area) with today's save | `golf_coach_player_intent` |
| CoachHelm | 06 card, today's panel content in 06 rows | today's panel; its link per 05 CP.4 | today's CoachHelm block |

### CP-6.14 Desktop no-results and tools (S-ROSTER.desktop-search, .desktop-tools)

| Element | Box | Type | Colour | Icon | Hit area | Data |
|---|---|---|---|---|---|---|
| No results | the empty block (06 1.3) inside the table card, under the sticky header | today's copy | `ink`, `ink2` | `search` 20 in the tint disc | | search text |
| Search field | as CP-6.2 field, height 36 on desktop, r 10, leading `search` 16 `ink2` | 400 15/1.3 | `ink`; placeholder `ink4` | | 36 tall (desktop pointer) | today's search |
| Export, view toggle | today's buttons and stock Segmented, on the page above the table card | | | | today's | today's |

### CP-6.15 Widths 821 to 1279 and 768 (S-ALL.mid-width)

Desktop between 821 and 1279: the main column is fluid; the team card keeps min 320 and the leaders cards min 200; under 960 of main column width the leaders row moves under the team card and scrolls sideways with snap (as the phone). The Home hero's `1fr 380` grid becomes one column below a main column of 1100, Up next under the greeting at full width. Tables keep their columns and scroll sideways inside the card under 760 of card width, with the Player column sticky. 768 to 820: the phone layout with the 20 edge.

### CP-6.16 Fixes made in place
- Section 9 "zero requests closes the sheet": kept for the last request handled inside the sheet; a sheet opened by `?tab=requests` with none shows CP-6.5 (fixed 4 Nov in section 9).
- Section 14 row 31: the detent prop is settled in DECISIONS (fixed 4 Nov in row 31).


## Wiring, 4 Nov 2026

Checked against helmv3 `main` 03d9087 (1 Nov), read only. Paths are under `src/clubhouse/` unless they start with `src/`, `supabase/` or `config/`. Line numbers are at 03d9087; the plan's 75b4956 lines still hold for every component this lane edits (same file lengths, same function lines) except the ones fixed in place in 02 and 05 and named here. "new:" is code the build adds. No held migration: every row below runs on today's schema (05 CP.1 stands).

Rules that hold for every table below, so the rows do not repeat them:
- **Double submit.** Every write goes through `useAction` (`lib/use-action.ts:62`), whose `inFlight` ref (73 to 77) answers a second tap with `busy` and sends nothing. The busy look (06 CP-6.11) reads `pending` (124). Offline sends nothing and shows CH-1903 (80 to 84); a slow write shows CH-1902 after 5 s (`CH_SLOW_SAVE_AFTER`, 44).
- **Sync to other screens and devices.** No realtime on Roster, Classes or Home rows (only `lib/use-class-day.ts:163` on `golf_class_exceptions`, unchanged). A server action that calls `revalidatePath` refreshes the current route in its own response; other devices and other coaches see the change on their next read: `useQuietRefresh` (`shell/use-quiet-refresh.ts`, mounted in `ClubhouseFrame`) refetches after 60 s away or on reconnect, never while a dialog is open or a field has focus (`busy()`, 20 to 27); pull to refresh; or a navigation.
- **Notifications.** This lane adds none and changes no writer. Every bell row this lane lands on is a row in `notifications` (bell open: `shell/Bell.tsx:385` to 387, `isSafeInternalPath` then `armRelink` then `router.push`). Category comes from `src/app/golf/actions/unified-notifications-model.ts:121` to 125 (all join types are `pipeline`). None of them sends a push: the join writers insert bell rows only, and push settings (`src/lib/notifications/push.ts:88` `shouldSendPush`) gate push, not bell rows.
- **Shot tracking.** Nothing in this lane changes what shot tracking collects, stores or sends. Home's Latest rounds, round sheet and team's game, and Roster's figures, read finished `golf_rounds` rows and hole rows that already exist; no write in this lane touches `golf_rounds`, holes or shots.
- **Lane flag.** `clubhouse_classes_roster_home_v1` (new in PR 7, `config/feature-flags.yml`, entry shape of `coachhelm_track_record_v1` at 1198, but `default: false` and all three environments false). `isFlagEnabled` is server only (`src/lib/flags/is-enabled.ts:1`), so it is read on the server only: in `routes/classes.tsx` next to the `class_awareness_v1` read (21), in `routes/roster.tsx` (16 to 17, passed to both `Roster` and `TeamRoster`), in the Home route `src/app/golf/(dashboard)/dashboard/page.tsx` (206 to 213, passed to `CoachHome`), and in the shell as new `ChShellData.crh` in `data/shell.ts` beside `classAwareness` (266), which `ClubhouseFrame` sets as `data-ch-crh="on"` on `.ch-root` (`shell/ClubhouseFrame.tsx:256`) so the hero-mode bar rule can see it. Flag off: no prop is passed, every branch renders main. The preview reads `&crh=0|1` in `src/app/clubhouse-preview/[screen]/page.tsx`.
- **Practice rounds** (DECISIONS: out of every average, the leaders, the top five and the form bars; still listed in Latest rounds). Today nothing filters them: `loadSeasonRounds` (`data/season.ts`, select at 120 to 123) keeps every completed non-test round. One shared helper, new: `countsForScoring(r)` in `data/season.ts`, true when `r.round_type` is null or `roundTypeFromDb(r.round_type) !== 'practice'` (an untyped round counts, as `stats-figures.ts:190` and `stats-filter.ts` `roundKind` treat it; an unknown type such as casual reads as practice) (`src/lib/golf/round-type-utils`, the helper `data/stats-figures.ts:191` already uses). Roster applies it in `loadRoster` before `summarizePlayer` and the `teamAvg` mean (`data/roster.ts:264`); Home applies it before `teamForm`, `teamLegs` and the leaderboard (`data/home.ts:445` to 458) but not to `latestWithHoles` (357). Both under `crh`; flag off counts as today. Stats uses the same helper (stats-home 03), so the three screens agree once both lanes are on.

### W.1 Gate, shell and entries (S-ALL.flag-off, S-ALL.deeplink, S-ALL.day-rollover)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| `crh` gate | `isFlagEnabled('clubhouse_classes_roster_home_v1')` at the four server reads above | none | server only | n/a | `data-ch-crh="on"` on `.ch-root` and the screen roots | flag missing from the registry reads false (`unknown_flag`) | n/a | none | this row | none held |
| Deep-link sheets (`roster?tab=requests`, `?invite=1`, `?player=`, `classes?new=1`) | today: `Roster.tsx:115` to 123 (invite), 137 to 147 (tab, desktop), 164 to 181 (player), `RosterPhone.tsx:92` to 101 (tab, phone), `ClassesView.tsx:285` to 290 (new) | new: `useDeepLinkSheet(param)` in `shell/use-deep-link-sheet.ts`: read the param once, `replaceState` to the bare URL, `pushState` it back, open at rest; `popstate` closes; a hand close calls `replaceState` | coach params are only read in the coach tree (`routes/roster.tsx:16`); `TeamRoster` never reads them | `player` must match a row in `players`, else S-ROSTER.profile.missing | sheet or profile at rest | missing player: toast "That player isn't on your roster.", param dropped | n/a | bell rows land here (W.3) | `crh` on; off keeps today's replaceState only | none |
| Day and 1 August rollover | Home: `useHomeDayRollover` (`screens/home/use-day-rollover.ts:44`, used at `CoachHome.tsx:44`) with `ChCoachHome.clock` (`data/home.ts:455`). Classes and Roster have none today | Classes: new `clock: { tz, day }` on `ChClassesPage` from the values `loadClasses` already has (`data/classes.ts:48` to 49) and call `useHomeDayRollover(data.clock, frozen)` in `ClassesView`. Roster: new `clock` on `ChRoster` from the `tz` `loadRoster` already reads (`data/roster.ts:176`), same hook in `Roster` and `TeamRoster` | n/a | n/a | `router.refresh` through `useRefresh` (`lib/use-refresh.ts:10`), no motion | the hook retries 3 times a minute apart (use-day-rollover.ts 33 to 34) | refetch | none | Classes and Roster hooks under `crh` | none |

### W.2 S-CLASSES, S-CLASSES.desktop and their parts (player only)

Reads: one loader, `loadClasses` (`data/classes.ts:45` to 88), called by `routes/classes.tsx:21`. A coach never reaches it (`routes/classes.tsx:19` returns `ClassesNoTeam` for a coach team; S-CLASSES.coach is the legacy page).

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Large title context, term card week well, "N weeks left", term line, Soon (term end only) | `termOn(todayIso)` (`data/classes-shape.ts:260` to 276) over `TERM_WINDOWS` (`src/lib/golf/semester.ts:35`); not `golf_team_terms` | none | player's own page | n/a | n/a | n/a | rollover W.1 | none | `crh` | none |
| S-CLASSES.no-term, .term-edges | same. `inferTermForImport` (semester.ts:83 to 110) always returns the term in progress or the next one, so on real data "no term" and "after end" cannot occur; `loadClasses` throws only for an unreadable date (classes.ts:81 to 82), which is today's route error. "Before start" is real in the gaps between windows (for example 16 to 19 Aug), with `term.startsIn` set | none | n/a | n/a | build both as guards on the shape (`term.week === null` and `startsIn === null`, or a fixture `term: null` in the preview) so the fixture states render; no loader change | route error shows the drawn failed state (DECISIONS "Classes route errors") | n/a | none | `crh` | none |
| Credits bar and "N classes / N credits" | `termFigures` (`screens/classes/parts.tsx:100`) over `golf_player_classes.credits` | none | `golf_player_classes_select_team` (baseline 19319) | null credits count 0 | n/a | classes read failed: `classes.error` (classes.ts:86), card failed block | n/a | none | `crh` | none |
| Overlap chip, Overlaps card | `conflictsOf` / `groupConflicts` over `week.events` (classes.ts:63 to 79, this week Mon minus 3 to Sun plus 2) | chip: scroll to `#ch-cl-overlaps`, no write | as above; team events via `golf_events` RLS, meetings hidden by `hiddenMeetings` (classes.ts:37 to 43) | n/a | n/a | `week.error`: CH-12202 block with Try again = `router.refresh` (`ClassesView.tsx:460`) | n/a | none | `crh` | none |
| Today card, Next line, DayRibbon | `classes.list` plus `week.events`; Next scan 7 days in `TodayClasses` (`parts.tsx:465`, CH-12308 at 482). A next class day past Sun plus 2 has no events loaded: the ribbon then draws classes only | none | as above | dedupe by `id|start` and by `(code or name)|start` (02 §3.2) | n/a | CH-12203 boundary (`ClassesView.tsx:446`) | rollover W.1 | none | `crh` | none |
| Binders, class sheet facts, This week, Travel chip | `ChClass` (`data/classes-shape.ts`), `week.dates`, conflicts | none | as above | n/a | n/a | n/a | n/a | none | `crh` | none |
| S-CLASSES.add-menu | none | opens `startAdd` / `startImport` (today's handlers in `ClassesView.tsx`) | player | n/a | today's sheet opens | n/a | n/a | none | `crh`; off: + opens ClassForm directly | none |
| Add or edit class (S-CLASSES.class-form) | `ClassForm.tsx:139` | `writes.save` (`screens/classes/writes.ts:145` to 175): browser client `update` or `insert` on `golf_player_classes`, then `syncClassToCalendar` (`src/app/golf/actions/calendar-sync.ts:570`) | player, own rows: `golf_player_classes_insert_player` / `_update_player` (baseline 19313, 19327), `.eq('player_id')` | code (max 20) and name (max 120) required, term required, both times or neither, an exact twin refused; overlaps warn only (`ClassForm.tsx:42` to 48, fields 180 to 318) | form closes, list updates from the saved row (`ClassesView.tsx:148`), toast | CH-12001 toast; not optimistic, nothing to roll back; sync failure CH-12002 and the S-CLASSES.sync row (`SyncStatus`, `parts.tsx:436`) | local state; other devices on quiet refresh; the calendar on its own realtime (`screens/calendar/live.ts:31`) | none | look under `crh` | none |
| Discard confirm | dirty form state (`ClassForm.tsx:322`) | none | player | n/a | closes | n/a | n/a | none | `crh` | none |
| Import schedule (S-CLASSES.import-sheet, start-over) | `ImportSchedule.tsx:228`, 472; image read `extractClassesFromScheduleImage` (`src/app/golf/actions/schedule-image.ts:180`) | `writes.importRows`: RPC `golf_import_player_classes` (`writes.ts:131`, migration `20261021110000_golf_import_player_classes.sql`), then sync per class (`ClassesView.tsx:251`) | player; the RPC is security definer on the caller's own player id | the RPC skips known rows and returns `skipped` / `known` (writes.ts:141 to 142) | Done step, list grows (`ClassesView.tsx:247`), toast | CH-12004; nothing added, nothing to roll back | local; quiet refresh | none | `crh` | none |
| Remove class (S-CLASSES.remove-confirm, sheet-stack) | `ClassesView.tsx:511` | `writes.remove` (`writes.ts:185`): `removeClassFromCalendar` (`calendar-sync.ts:687`) then delete the row | `golf_player_classes_delete_player` (baseline 19307) | n/a | both sheets close, binder gone, toast "{code} removed" | CH-12003; row kept if the delete failed; a calendar part that landed is flagged (`ClassesView.tsx:46`) | local; quiet refresh | none | `crh` | none |
| Delete all classes | `ClassesView.tsx:537` | `writes.removeAll` (`writes.ts:213`) | same policy | n/a | list empties, toast | CH-12005 / CH-12006 with the counts (`ClassesView.tsx:204` to 234); kept rows stay | local | none | `crh` | none |
| S-CLASSES.gone | refetch no longer has the open id | none | n/a | n/a | sheet closes, no toast | a write returning not found: today's failure toast, then close | quiet refresh skips while the sheet is open, so it is the next refetch after the sheet closes, or a write's not-found answer | none | `crh` | none |
| Share status switch, hold pushes (status card) | `golf_player_class_settings` (P-10, applied) | `setShare` / `setHold` (`class-status-writes.ts:66` to 79): upsert on `player_id` | `golf_player_class_settings_own` FOR ALL, own row (`20261025070000_golf_class_awareness_tables.sql:191`) | boolean | switch stays; today's toast | switch moves back on the same spring (M-CRH-48), CH-12270 (`ClassStatusPanel.tsx:86`) | coaches read it through the `golf_team_class_day` RPC (`data/class-day.ts:30`) | none from this switch | `class_awareness_v1` and `crh` | none |
| No class today, exams (S-CLASSES.no-class-today, exam-sheet, exam-remove) | `NoClassTodaySheet.tsx:54`, `ExamSheet.tsx:51`, `ClassDetail.tsx:228` | `markNoClass` / exam writes (`class-status-writes.ts:86`, 95, 132, 140) on `golf_class_exceptions` | `golf_class_exceptions_insert_player` / `_delete` (`20261025070000…:370`, 387) | label max 60 (class-status-writes.ts:132) | toast with Undo (today) | today's toasts | realtime `class-exceptions:<team>` (`lib/use-class-day.ts:163`) | held class pushes follow `golf_push_holds` (unchanged) | `class_awareness_v1` | none |

### W.3 S-ROSTER (coach), S-ROSTER.desktop, S-ROSTER.peek, profile and sheets

Reads: `loadRoster` (`data/roster.ts:164` to 300), coach only (`routes/roster.tsx:16`). Players get `loadPlayerRoster` (W.4), so no coach field can reach a player's tree.

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Large title context, team card title | `ChRoster.teamName`, `season` = `currentSeasonLabel` (`data/roster.ts:21`, 288 to 296) | none | `golf_teams` coach read | n/a | n/a | `teamError`: name falls back, season "—" | rollover W.1 | none | `crh` | none |
| Team card counts, total, class mix, top five and mean | `players[].status`, `availability` (roster.ts:172, 225), `classYear`; `teamAvg` (264); new `teamCardFigures(players)` in `screens/roster/format.ts` | none | `golf_team_members_select_v5` (baseline) | injured counts as active (DECISIONS); top five needs 5 players with 3 or more counting rounds, else hidden | n/a | `playersError`: card failed block; `statsError`: mean "—", no top five | n/a | none | `crh` | none |
| "n waiting" | `jr.reqs.length` (`useJoinRequests.ts:36`) from `getTeamJoinRequests` (`src/app/golf/actions/teams.ts:1222`) | none | "Coaches can view team join requests" (baseline) | coach only | n/a | `requestsError`: the waiting part is left out, never "0 waiting" | updates on approve or decline in place | none | `crh` | none |
| Leaders row | new `leaderPicks(players)` in `format.ts` over `avg`, `trend`, `sgPerRound`, `attention` (`attentionFor`, roster.ts:143) | tap: `openPlayer(id)` (`Roster.tsx:183`) | coach tree only | 3 counting rounds per card; "Needs a look" hidden when no `attention` | profile push | n/a | n/a | none | `crh` | none |
| Sort bar, Active, Injured, Inactive cards, rows, form bars | `useRosterSort` (`screens/roster/sort.ts`, unchanged), `players`, `trend`, `teamAvg`; class line `useRosterClassLines` (P-10) | tap: `openPlayer`; hold: `PlayerPeek` (`ui/PlayerPeek.tsx:48`) | coach | bars need 3 rounds (`earlyBelow`) | profile push | n/a | n/a | none | `crh` | none |
| Desktop table, faces, peek figures | same `players`; peek `RosterPeek.tsx:37` | row select is local state | coach | n/a | n/a | n/a | n/a | none | `crh`; off keeps `.ch-rs-attn` (`Roster.tsx:536`) | none |
| Approve, Decline (S-ROSTER.requests, .one, .failed) | `RosterPhone.tsx:487` sheet, `RosterRequests.tsx` desktop | `acceptJoinRequest` (`teams.ts:1444`, impl 1229 to 1433): insert `golf_team_members`, mark the request approved; `rejectJoinRequest` (1577, impl 1453 to 1567) | coach of that team: checked in the action (`getCoachTeamId`, 1281 / 1505), then "Coaches can review team join requests" (UPDATE) and `golf_team_members_insert_coach` (`is_golf_team_coach`) | the request must be pending; a player already on a team is refused and the request closed (1325 to 1349) | row fades (M-CRH-36), toast "{name} added to {team}" / "Request from {name} declined" (`useJoinRequests.ts:69` to 89); last one closes the sheet | optimistic hide then `restore` on a refusal or throw (`decideOne`, 51 to 67); CH-3002 / CH-3003 | `revalidatePath` roster and dashboard (1432 to 1433, 1566), so Home's capsule count follows on the next Home read | approve inserts `team_join_approved` for the player, `action_url` `/golf/dashboard` (1405 to 1408); decline inserts `team_join_rejected`, `/golf/dashboard/settings` (1536 to 1541); bell only, category pipeline | look under `crh` | none |
| S-ROSTER.requests.elsewhere | the action's answer | change, new in `decideOne` (`useJoinRequests.ts:51`): when the error is exactly "This request has already been processed" (teams.ts:1284, 1508), keep the row hidden, show no error toast, and call `router.refresh()` | as above | n/a | row leaves as on success, count from the server | n/a | refresh | none | `crh`; off keeps today's restore and CH-3002 | none |
| Approve all | `RosterPhone.tsx:483` (phone only, hidden with one request) | `approveEach` loops `acceptJoinRequest` (`useJoinRequests.ts:91` to 117) | as above | skips ids already approved (95) | toast "{n} players added" | rows the server refused stay or return; CH-3007 with counts (119 to 135) | as above | one `team_join_approved` row per player | `crh` | none |
| Invite sheet, Copy code, Share or Copy link | `joinCode` (roster.ts:288); link `/golf/join/<code>` (`Roster.tsx:898`) | `useCopyText`; `navigator.share` (`Roster.tsx:910`) | coach | n/a | "{what} copied" (`useCopyText.ts:15`, CH-3703) | CH-3006, select and copy by hand (18) | n/a | none | `crh` | none |
| Email invites (S-ROSTER.invite-email) | `emailInvites` (roster.ts:99) | `emailPlayerInvites` (`team-management.ts:278`, impl 204) | coach; rate limited (`rate_limited`) | up to `MAX_INVITE_EMAILS` 10 (`src/lib/golf/invite-emails.ts:7`) | "Invite sent" / "{n} invites sent" | CH-3080; off state CH-3980 (`InviteByEmail.tsx:133`) | n/a | the email itself (owner-gated), no bell row | `crh` | none |
| Mark inactive or active (S-ROSTER.status-confirm) | `RosterStatus.tsx:50` | `updatePlayerStatus` (`team-management.ts:365`, impl 283 to 358) on `golf_team_members.status` | `golf_team_members_update_coach` (`20260807030200_golf_teams_and_members_tenant_binding.sql`) | one of the four status values | row moves cards, "{name} marked {status}" | CH-3008; local change applied only on success (`Roster.tsx:278` to 290) | `revalidatePath` roster (348) | none | `crh` | none |
| Remove from team (S-ROSTER.remove-confirm) | `Roster.tsx:405` | `removePlayerFromTeam` (`src/app/golf/actions/roster.ts:198`, impl 55 to 160): delete the membership | `golf_team_members_delete_coach` (`is_golf_team_coach`) | blocked while the player has a saved in-progress round (error 55000, 113 to 128) | profile pops, row gone, "{name} removed from {team}" | CH-3001, nothing changed (`Roster.tsx:255` to 274) | `revalidatePath` dashboard and roster (155 to 157) | none; an audit line only (`logServerEvent`, 150) | `crh` | none |
| S-ROSTER.profile.removed | next refetch lacks the id | none | n/a | n/a | profile pops, toast "{first} is no longer on the roster." | n/a | refetch (focus, pull, or a write's revalidation) | none | `crh` | none |
| Availability (profile and peek) | `availability`, `availabilityUpdated` (roster.ts:225, 257) | `setPlayerAvailability` (`team-management.ts:600`, impl 389 to 487) on `golf_team_members.availability` | `golf_team_members_update_coach`; players have no update policy | available, injured or away (430) | chip stays; today's toast | optimistic with `before` restore (`Roster.tsx:297` to 315), CH-3009 | `revalidatePath` roster (479) | none (no availability notification exists) | `crh` | none |
| Availability reason (coach only) | `golf_player_availability_coach_notes` via `loadAvailabilityNotes` (roster.ts:361) | `setPlayerAvailabilityCoachNote` (`team-management.ts:594`, impl 510 to 582) | the four coach-only policies in `20261022090000_golf_player_availability_coach_notes.sql` (80 to 118) | 1 to 280 characters (`AVAILABILITY_NOTE_MAX`, `data/availability.ts:18`) | "Note saved for {first}" | CH-3011, text kept | `revalidatePath` roster (574) | none | applied 22 Oct; field hidden when the table did not answer (`availabilityCoachNotes`) | none |
| Coach's note (S-ROSTER.profile.note-dirty) | `coachNote` from `golf_coach_player_intent` (roster.ts:376) | `setIntent` (`src/app/golf/actions/v3/intent.ts:100`) | `intent_coach_only` (baseline 19912) | no server length limit today; keep the textarea's client cap | "Note saved for {first}" (`RosterPeek.tsx:359` to 375) | CH-3004, text kept; locked when `notesError` | `revalidatePath` roster (intent.ts:82) | none | dirty guard is new under `crh` | none |
| Message, View stats, Plan 1:1, All {n}, CoachHelm | hrefs: `messages?player=` (`RosterProfile.tsx:41`, read at `screens/messages/Messages.tsx:179`), `stats?player=` (`Roster.tsx:360`), rounds `RosterProfile.tsx:43`, `coachHelmPlayerHref` (`ui/PlayerPeek.tsx:32`) | navigation only | coach | n/a | lands per 05 CP.4 | n/a | n/a | none | other lanes' gates | none |
| Export CSV, print | `rows` (`Roster.tsx:223`), `exportCsv` (328) | file download in the browser | coach | n/a | download | CH-3005 | n/a | none | `crh` (print selectors) | none |

### W.4 S-ROSTER.player (player view)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Team card (no injured, no waiting, no top five), class mix, Coaches, Players, You chip, HCP, sort | `loadPlayerRoster` (`data/roster-player.ts:43` to 95): active members (59), `golf_player_profiles` display columns, staff (68); `ChTeammate` (13 to 21) carries `classYear`, `gradYear`, `handicap`, `isYou` | none; rows are not tappable | own team only; teammates through `golf_player_profiles` (security review S4) | n/a | n/a | `playersError`, `teamError`, `coaches: null` as today | rollover W.1 | none | `crh` | none |
| Privacy (SHARED-11, S-ROSTER.role-guard) | the filter is the separate loader, chosen on the server by role (`routes/roster.tsx:16` to 17): no score, average, SG, trend, availability or request is selected for a player, so none can reach the DOM or a response | none | server | n/a | n/a | n/a | n/a | none | both sides | none |

### W.5 S-HOME (coach), S-HOME.desktop, round sheet, strip and sheets

Reads: `loadCoachHome` (`data/home.ts:312` to 460) from the Home route (`src/app/golf/(dashboard)/dashboard/page.tsx:206` to 213), coach only; the queue is `loadCoachQueue` (`data/home-queue.ts:38`). Desktop Home files (02 CP-02.2): `screens/home/CoachHome.tsx` (desktop branch 47 to 100) with `HomeActions.tsx`, `CoachQueue.tsx`, `LiveNowCard.tsx`, `Week.tsx`, `TeamForm.tsx`, `TeamLegs.tsx` (`TeamLegs`, 95), `LatestRound.tsx`, `Leaderboard.tsx`, skeleton `SkeletonDeskHead.tsx`.

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Date, greeting, brief | `todayLabel` / `greeting` on `homeClock` (`data/home-clock.ts:25`), `subline` = `homeSubline` (`data/home.ts:453`) | none | coach | n/a | n/a | n/a | rollover (`CoachHome.tsx:44`) | none | `crh` | none |
| Waiting on you capsules | `loadCoachQueue` counts: pending requests (`home-queue.ts:50`), replies, `golf_tasks` (95), posts; labels and hrefs `queueParts` (`CoachQueue.tsx:16` to 37): `roster?tab=requests`, the event or Calendar, `team-hub?tab=tasks`, `team-hub?tab=ann` | navigation only | coach; counts under each table's RLS | a part that did not load is left out, never 0 | lands per 05 CP.4 | S-HOME.queue-failed: CH-2220; new "Try again" capsule calls `useRefresh().refresh` | refetch | none | `crh` | none |
| Up next coins and "N of M going" | `phone.next` (`ChHomeEvent`, `data/home.ts:133` to 145): `invitees` (names, filtered to known names at 757), `inviteeIds` (all ids, 781), `going` (only when names and ids agree, 779) | tap opens the event (`DayCard.tsx:89`) | coach; player Home takes the counts-only path with no ids (763 to 774) | year coins only when `invitees.length === inviteeIds.length`, else name-only coins (fixed in 02 §6.2) | n/a | n/a | n/a | none | `crh` | none |
| Year coins on Home (Up next, Latest rounds) | new `yearById: Record<string, ChYearKey or null>` on `ChCoachHome`, built in `loadCoachHome` from the roster read it already makes (`data/home.ts:331` to 333 selects `graduation_year`) through `classYearLabel` then `classYearKey`; no new query | none | coach only; not on `ChPlayerHome` | unknown id keeps the tone | n/a | roster read failed: no map, tone coins | n/a | none | `crh` | none |
| Nudge, Message, Directions (S-HOME.day-actions) | `awaiting`, `nudgeDraft` (`screens/home/nudge-draft.ts:6`), `directionsHref` (`DayCard.tsx:61`) | `messagesPrefillHref` (`screens/messages/prefill.ts:49`, the shared `ChPrefill`): a draft only, nothing is sent | coach | draft max 2000 (prefill.ts:52) | Messages opens with the draft | n/a | n/a | none (the coach sends from Messages) | `crh` | none |
| Today, Later today, Since you looked, no events, Plan | `phone.today`, `nextId`, `conflict`; `LaterToday` (`DayCard.tsx:184`), `SinceYouLooked` (376) from `home-changes.ts`; `newEventHref` (`HomePhone.tsx:47`, CH-2309 224, CH-2301 273) | navigation to Calendar | coach | n/a | n/a | part failed per 05 S-HOME.part-failed | rollover | none | `crh` | none |
| Team scoring, team's game, This week, Latest rounds, Leaderboard | `form` (`teamForm`, `data/home.ts:445`), `legs` (`teamLegs`, 447), `week`, `latestRounds` (`latestWithHoles`, 357 and 472), `leaderboard` (458); leg names `legPlayerHref` (`TeamLegs.tsx:18`) | navigation only | coach | practice rounds out of form, legs and leaderboard (rule above) | n/a | `roundsError`, `noholes`, `unranked` per 05 | rollover | none | `crh` | none |
| Round sheet links (S-HOME.round-links) | `HomePhone.tsx:543` to 576: `messages?player=`, `roundHref`, `stats?player=`, `coachHelmPlayerHref` | navigation only | coach | n/a | lands per 05 CP.4 | n/a | n/a | none | other lanes' gates | none |
| Class line, In class now, term sheet, breaks (S-HOME.class-line, in-class-sheet, term-sheet, breaks-sheet) | `useTeamClassDay` / RPC `golf_team_class_day` (`data/class-day.ts:30`), `loadTeamTerms` (74), exceptions (103) | `saveTeamTerm` (`src/app/golf/actions/class-status.ts:200`), `addTeamBreak` (205), `removeTeamBreak` (210) | `golf_team_terms_*_coach` and `golf_class_exceptions_insert_coach` (`20261025070000…:157` to 168, 381) | zod `termSchema` / `breakSchema` (class-status.ts) | "Save dates" / "Mark no classes" toasts as today | today's toasts; not optimistic | `revalidatePath('/golf/dashboard')` (95, 124, 153); players' class day on the exceptions realtime | none | `class_awareness_v1` | none |
| Live now (S-HOME.live) | `loadLiveRounds` (page.tsx 211), `LiveNowCard.tsx:37`, `PlayerLiveSheet` | none | coach viewer | n/a | n/a | `tourfailed` block | live channel (`live/channel.ts:80`, unchanged) | none | `golf_tournaments_v1` for the tournament part | none |
| Hero-mode bar fill (S-HOME.player-boundary) | CSS only | shell.css near 1306 under `[data-ch-crh='on']` on coach Home; player Home only with `[data-ch-hero-flat]` from stats-home | n/a | n/a | n/a | n/a | n/a | none | `crh` and stats-home's gate | none |

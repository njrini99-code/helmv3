# Fidelity spec: My stats, Team Stats, Home "Your game"

The build is a copy of `redesign/stats-and-home-phone.html`, not an interpretation of it. When this spec and the page disagree, the page wins, unless section 8 says why it can't. When the page and `DESIGN_LANGUAGE.md` disagree, this spec says which one ships (section 8 again).

The page draws the phone only. Desktop keeps its layout and takes the shared token changes only (`02-PLAN.md`, Desktop).

Every figure the page shows is real fixture data computed the way the app computes it (`03-DATA-CHECKS.md`). Every Tour figure is a value from `golf_pga_standards`; where there's no Tour value, the page draws no tick and no Tour text.

## 1. Capture links: open any state directly

Add a hash to the page's address. Tokens go in any order, joined by `-`. Anything left out takes the default (bold).

| Token | Values | What it sets |
|---|---|---|
| Screen | **`stats`**, `team`, `home` | My stats (player), Team Stats (coach), player Home's "Your game" |
| Theme | **`light`**, `dark` | The phone's scheme |
| Data | **`full`**, `few`, `none` | A full season, 2 rounds (early: strokes gained waits for round 3), no rounds |
| Window | `last5`, **`last10`**, `last20`, `season`, `qualifiers` | The window switch |
| Text Size | `small`, **(default)**, `large`, `larger`, `xxl` | `--k` = 0.88, 1, 1.12, 1.24, 1.36 (`is-big` from 1.24). The app takes `--ch-type-k` from iOS; these are stand-ins for the same range |
| Width | **(393pt)**, `wide` | `wide` is a 430pt phone (page edge 20) |
| Motion | `reduce` | Reduce Motion on (without it, the page follows the computer's own setting) |
| Detail | `scoring`, `sg`, `tee`, `approach`, `short`, `putting`, `rounds`, `goals` (stats); `tscore`, `tgame`, `tplayers` (team) | Opens that detail page over the summary |

Examples:

- `#stats-light-full` My stats summary, the default.
- `#stats-dark-few-sg` Strokes gained detail in the 2-round state, dark.
- `#stats-light-full-season-xxl-approach` Approach detail, Season, largest standard Text Size.
- `#team-dark-full-wide-tgame` Team game detail on a 430pt phone.
- `#home-light-none` Home "Your game" with no rounds.

The same links work while the page is open (it listens for `hashchange`), so `capture/capture.mjs` drives every shot with them. The app's own routes for the same views are in section 5.

## 2. Token map: design name to app token

> Updated in 06: XXL Text Size is 1.36 (the app's `--ch-type-scale`), and `--loss-tint` is now #F7F0E6 (dark #3A3524), which takes the loss pill to 4.97 / 6.18. New tokens for loading and didn't load (`--skel`, `--skel-sheen`, `--danger`, `--danger-tint`) are in 06's States section. Where this table and 06 differ, 06 wins.

Source: `redesign/stats-phone.css` (the page's own phone styles; the page `redesign/stats-and-home-phone.html` inlines the same rules plus a stronger Reduce Motion rule for the review highlight). Where two rules set the same thing, the value below is the one that wins.

`--k` is Text Size, unitless on the page. **In the app every size is `calc(N * var(--ch-type-k))`** (`--ch-type-k` carries the px unit). Translate mechanically: `calc(34px*var(--k))` becomes `calc(34 * var(--ch-type-k))`. The page's steps: Small 0.88, Default 1, Large 1.12, Larger 1.24, XXL 1.35.

`--edge` (not a variable on this page, written as padding): 16px, 20px when the phone is 414pt or wider (`.ph.is-large`, set from `ph.clientWidth >= 414`). App: `--ch-page-x-phone`.

"new" tokens go in the tokens PR with light and dark values from this table and a contrast assertion each. Dark values sit under `html[data-fw-theme='dark'] [data-ui='clubhouse']`.

| Design token | Light | Dark | App token |
|---|---|---|---|
| `--k` | `1` | `1` | `--ch-type-k` (see above) |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | (same) | `--ch-ease` |
| `--spring` | `cubic-bezier(.34,1.3,.64,1)` | (same) | `--ch-ease-spring` |
| `--spring-smooth` | `linear(0,.0418,…,.9988,1)` (30 stops, see CSS line 7) | (same) | `--ch-ease-spring-smooth` |
| `--sans` (page `:root`) | `'Instrument Sans', ui-sans-serif, -apple-system, …` | (same) | `--ch-font-sans` |
| `--bg` | `#F2F0E9` | `#0E120F` | `--ch-grouped-bg` |
| `--card` | `#FFFEFB` | `#191E1A` | `--ch-card-bg` |
| `--well` | `#F6F4EE` | `#141815` | `--ch-well-bg-flat` |
| `--ink` | `#1C1B18` | `#F1ECDF` | `--ch-ink-900` (odd value 1) |
| `--ink-2` | `#46433D` | `#D0C9B8` | `--ch-ink-600` (odd value 1) |
| `--ink-3` | `#5F5C55` | `#ADA697` | `--ch-ink-500` (odd value 1) |
| `--gain` | `#14613D` | `#7CC79B` | `--ch-gain` |
| `--loss` | `#9A5700` | `#E7AE57` | `--ch-loss` |
| `--under` | `#B3261E` | `#F28B7D` | `--ch-flag` |
| `--accent` | `#155A39` | `#7CC79B` | `--ch-green-600` (odd value 1) |
| `--sep` | `rgb(28 27 24 / .10)` | `rgb(241 236 223 / .10)` | `--ch-separator` |
| `--sep-strong` | `rgb(28 27 24 / .16)` | `rgb(241 236 223 / .16)` | new `--ch-separator-strong` (total row rule, DL §7) |
| `--ring` | `rgb(28 27 24 / .07)` | `rgb(255 255 255 / .06)` | `--ch-card-ring` |
| `--card-shadow` | `0 0 0 1px var(--ring), 0 1px 2px rgb(28 25 18 / .05), 0 8px 20px -12px rgb(28 25 18 / .12)` | `0 0 0 1px var(--ring), inset 0 1px 0 rgb(255 255 255 / .04)` | `--ch-card-shadow` |
| `--glass` | `rgb(253 251 247 / .78)` | `rgb(22 27 23 / .74)` | not used on these screens (the stuck switch sits on the page colour) |
| `--press` | `rgb(28 27 24 / .05)` | `rgb(241 236 223 / .06)` | new `--ch-press-wash` (DL §7: ink 900 at 5%) |
| `--thumb` | `#FFFEFB` | `#2F3530` | none: superseded by `--seg-chip`, unused (odd value 8) |
| `--thumb-shadow` | `0 3px 8px rgb(0 0 0 / .12), 0 3px 1px rgb(0 0 0 / .04), 0 0 0 .5px rgb(0 0 0 / .06)` | `0 3px 8px rgb(0 0 0 / .3), 0 0 0 .5px rgb(255 255 255 / .06)` | none: superseded by `--seg-chip-sh`, unused (odd value 8) |
| `--seg` | `linear-gradient(180deg, #d4cebe 0%, #ddd8ca 55%, #e4dfd3 100%)` | `linear-gradient(180deg, #0a0d0b 0%, #0d110e 55%, #101411 100%)` | `--ch-well-bg` (today `.ch-seg` track) |
| `--seg-sh` | `inset 0 2px 3px rgb(28 25 18/.2), inset 0 4px 10px -2px rgb(28 25 18/.16), inset 0 -1px 0 rgb(255 255 255/.55), inset 0 0 0 1px rgb(28 25 18/.13), 0 1px 0 #fff` | `inset 0 2px 3px rgb(0 0 0/.5), inset 0 4px 10px -2px rgb(0 0 0/.4), inset 0 0 0 1px rgb(0 0 0/.4), 0 1px 0 rgb(255 255 255/.05)` | today `.ch-seg` track shadow |
| `--seg-chip` | `linear-gradient(180deg, #1f6b45 0%, #0f4a2f 100%)` | `linear-gradient(180deg, #23704a 0%, #1d613f 100%)` | `--ch-seg-on-bg` |
| `--seg-chip-sh` | `inset 0 1px 0 rgb(255 255 255/.2), inset 0 -1px 0 rgb(0 0 0/.12), 0 1px 2px rgb(11 58 37/.35), 0 3px 8px -2px rgb(11 58 37/.3)` | `inset 0 1px 0 rgb(255 255 255/.16), inset 0 -1px 0 rgb(0 0 0/.2), 0 1px 2px rgb(0 0 0/.5), 0 3px 8px -2px rgb(0 0 0/.45)` | today `.ch-seg` chip shadow |
| `--seg-on` | `#F9F7F1` | `#F9F7F1` (not redefined) | `--ch-seg-on-ink` |
| `--seg-off` | `#46433D` | `#D0C9B8` | `--ch-ink-600` (Classes writes `--ch-text-secondary`; odd value 1) |
| `--seg-off-tsh` | `0 1px 0 rgb(255 255 255/.6)` | `none` | today `.ch-seg` label shadow |
| `--champ` | `#E2C98F` | `#E2C98F` | new `--ch-champagne-dot` (as Classes: bar dot, back label) |
| `--gain-tint` | `#E8EEE8` | `#29392F` | new `--ch-chip-gain-bg` (also icon tile `.pi`, empty icon) |
| `--loss-tint` | `#F7F0E6` (was #F5EDE2; 4.97 light) | `#3A3524` | new `--ch-chip-loss-bg` |
| `--under-tint` | `#F7E8E5` | `#3C2F2A` | new `--ch-chip-flag-bg` (under par score tile) |
| `--flat-tint` | `#F2F1EE` | `#292D28` | new `--ch-chip-flat-bg` |
| `--gain-fill` | `#1F6B45` | `#4FA877` | `--ch-green-500` (odd value 2) |
| `--loss-fill` | `#B86F0C` | `#E09A35` | new `--ch-chart-loss-fill` |
| `--flat` | `#6B675F` | `#A39D90` | new `--ch-chart-flat` |
| `--track` | `#EBE5D8` | `#2C322D` | new `--ch-chart-track` |
| `--zero` | `#5F5C55` | `#ADA697` | new `--ch-chart-zero` (same values as `--ink-3`) |
| `--eagle` | `#7F2A21` | `#E26252` | `--ch-score-eagle-fill` |
| `--bogey` | `#B3884A` | `#C9A46A` | new `--ch-chart-bogey` |
| `--double` | `#3A3833` | `#D0C9B8` | `--ch-ink-700` (odd value 1) |
| `--par-seg` | `#D9D2C3` | `#3A403B` | new `--ch-chart-par` |
| `--nav` | `#0A331F` | `#08150E` | `--ch-frame` (the bar on every screen, and Home's hero, one flat green: Nick, 31 Oct 13:47) |
| `--nav-ink` | `#F4EEDD` | `#F4EEDD` | `--ch-on-green-ink` |
| `--nav-ink-2` | `#D9D3C2` | `#D3CCB9` | new `--ch-on-green-ink-2` (Home subline only; the bar dot is `--champ`) |
| `--f-bg` | `#0B3A25` | `#123D29` | `--ch-green-800` (odd value 3) |
| `--f-lit` | `#1A442E` | `#204732` | new `--ch-feature-lit` (the one soft light, top right) |
| `--f-ink` | `#F4F1E8` | `#F4F1E8` | `--ch-on-green-plate` |
| `--f-ink-2` | `#D3D9CB` | `#D3D9CB` | new `--ch-feature-ink-2` |
| `--f-ink-3` | `#B4C0B3` | `#B4C0B3` | new `--ch-feature-ink-3` (axis labels, par rule) |
| `--f-gain` | `#8FD3AA` | `#8FD3AA` | new `--ch-feature-gain` |
| `--f-loss` | `#EDB867` | `#EDB867` | new `--ch-feature-loss` |
| `--f-under` | `#F49A8D` | `#F49A8D` | new `--ch-feature-under` |
| `--f-flat` | `#BCC5B9` | `#BCC5B9` | new `--ch-feature-flat` |
| `--f-gain-fill` | `#6FC096` | `#6FC096` | new `--ch-feature-gain-fill` |
| `--f-loss-fill` | `#E5A445` | `#E5A445` | new `--ch-feature-loss-fill` |
| `--f-sep` | `rgb(244 241 232 / .14)` | (same) | new `--ch-feature-sep` |
| `--f-track` | `#2C5440` | `#325644` | new `--ch-feature-track` |
| `--f-gain-tint` | `#20523A` | `#26553E` | new `--ch-feature-gain-tint` |
| `--f-loss-tint` | `#2F4E30` | `#355133` | new `--ch-feature-loss-tint` |
| `--f-flat-tint` | `#2B5340` | `#315643` | new `--ch-feature-flat-tint` |
| `--spot` | `#1F6B45` | `#7CC79B` | review highlight plus focus ring on the chart and glance cells; no token (odd value 12) |

The `--seg*` and `--champ` rows come from the two override blocks at the end of the CSS (house segmented, house bar); they are set on `.ph` and `.ph[data-scheme="dark"]` and win over everything earlier.

Fixed colours written into rules, not variables (each needs a token or stays literal, builder's call per row):

| Where | Light | Dark | Proposed |
|---|---|---|---|
| Feature card shadow `.feature` | `0 1px 2px rgb(11 30 20 / .2), 0 10px 24px -14px rgb(11 30 20 / .5)` | `0 0 0 1px rgb(255 255 255 / .06)` | new `--ch-feature-shadow` |
| Feature icon tile `.feature .ah .pi` | `rgb(244 241 232 / .12)` fill, `--f-ink` icon | (same) | new `--ch-feature-icon-bg` |
| Selected segmented label `.iseg button::after` | `text-shadow: 0 1px 0 rgb(0 0 0/.18)` | (same) | today `.ch-seg` on-label shadow |
| Push shade `.shade` | `rgb(20 18 12 / .10)` | (same) | `--ch-push-dim` |
| Pushed page edge shadow `#phPush` | `-10px 0 28px rgb(0 0 0 / .10)` | (same) | today's push shadow |
| Home top `.top` | `--nav` flat | `--nav` flat | `--ch-frame`; the rest is context (odd value 6) |
| Home avatar `.avatar` | `#D8CCB0` fill, `#0B3A25` initials, ring `0 0 0 2px rgb(244 238 221 / .35)` | (same) | context only |
| Home logo `.logo` | `#E9E2CF` fill, `#0B3A25` mark | (same) | today's crest |

Inside the feature card (`.ph .feature`) these are re-pointed, so every component inside it reads feature tones with no extra rules: `--ink`→`--f-ink`, `--ink-2`→`--f-ink-2`, `--ink-3`→`--f-ink-3`, `--gain`→`--f-gain`, `--loss`→`--f-loss`, `--under`→`--f-under`, `--flat`→`--f-flat`, `--gain-fill`→`--f-gain-fill`, `--loss-fill`→`--f-loss-fill`, `--sep`→`--f-sep`, `--track`→`--f-track`, `--zero`→`--f-ink-3`, `--gain-tint`→`--f-gain-tint`, `--loss-tint`→`--f-loss-tint`, `--flat-tint`→`--f-flat-tint`, `--card`→`--f-bg`, `--spot`→`#F4F1E8`. Build it the same way: a `.ch-feature` scope that re-points the semantic tokens.

## 3. Type, spacing, radii, shadows

Instrument Sans only, width axis via `font-variation-settings:'wdth' N`. Tabular figures on every number (`font-variant-numeric:tabular-nums`). True minus (−), "E" for even, the U+2014 dash for no data. All sizes and line heights below are at Text Size Default and scale with `--k` unless marked "fixed".

| Role | Value (weight size/line, tracking, width) | Selector | App |
|---|---|---|---|
| Bar title (section switch) | 600 18/1, −0.012em | `.sw` | today's bar title (odd value 5) |
| Pushed page title | 600 17/1, centred, max 52% wide, ellipsis | `.gb .ptitle` | today's `.ch-pbar` |
| Back label | 400 17/1 | `.back` | today's back |
| Section name (on the page) | 700 22/28, −0.02em, wdth 92 | `.sech` | new `--ch-type-section` (odd value 10) |
| Card title | 600 17/22 | `.ah h2`, `.ch h2` | `--ch-type-card-title` |
| Card meta | 400 15/20, `--ink-2` | `.ah .meta`, `.ch .meta` | `--ch-type-meta` |
| Note, caption sentence, foot | 400 15/20, `--ink-2` | `.cap`, `.anote`, `.sumfoot`, `.cn`, `.readout`, `.how-t`, `.leg .cnt` | `--ch-type-meta` |
| Note on a well, empty body | 400 15/21 | `.few-note`, `.empty-card p` | (odd value 15) |
| Lead sentence | 400 16/23, `--ink` | `.plead`, `.hl p` | `--ch-type-body-l` is 16/24 (odd value 15) |
| Row title | 500 16/21 | `.rrow .c b`, `.drow .lab`, `.hb .l`, `.db .l`, `.dev b` | `--ch-type-row` |
| Row title, player rank row | 500 16/1.2 | `.prow .nm` | `--ch-type-row` |
| Leg title (Home) | 600 16/21 | `.leg-h b` | |
| Row figure | 600 17/1 | `.drow .val`, `.hb .v`, `.prow .val`, `.cmp-row .v`, `.db .nums b` | `--ch-type-figure` |
| Small figure | 600 15/1 | `.mrow .val`, `.mr .v`, `.rrow .tp`, ring label `.rg>span` | |
| Hero figure (feature card) | 500 40/1, −0.04em, wdth 92 | `.fig` | `--ch-type-figure-hero` |
| Hero figure sub | 400 17/22, `--ink-2` | `.fig-sub` | |
| Detail hero figure | 500 40/1, −0.04em, wdth 92 | `.d-hero .bigv` | (odd value 14) |
| Summary figure | 600 34/1, −0.035em, wdth 92; unit `small` 500 17/1, 0 tracking, `--ink-2` | `.sb .bigv`, `.kfr .bigv` | new `--ch-type-figure-summary` |
| Tile figure (Home leg) | 600 28/1, −0.03em, wdth 92 | `.leg-main .v` | new `--ch-type-figure-tile` (page's own proposal) |
| Cell figure | 600 24/1.1, −0.02em, wdth 92; unit 500 15/1 | `.gc .v`, `.m4 .v` | new `--ch-type-figure-cell` |
| Cell figure, team round | 600 24/1.1, −0.02em, no width axis | `.m3 .v` | (odd value 14) |
| Strip figure | 600 20/1.15, −0.015em; unit 500 13/1 `--ink-2` | `.strip .v` | |
| Score tile | 600 19/1, −0.02em | `.score` | |
| Cell label | 400 15/1.25 (`.gc .t`), 15/20 (`.m4 .t`), 15/1.3 (`.m3 .t`), `--ink-2` | | `--ch-type-meta` |
| Small label | 400 15/1.2, `--ink-2` | `.mrow .lab`, `.mr .l`, `.cmp-row .k`, `.skey div` | |
| Caption | 400 13/1.3, `--ink-2` | `.gc .m`, `.m4 .m`, `.m3 .m`, `.strip .t`, `.mini-cap`, `.hb .l small`, `.rings small` | `--ch-type-caption` is 13/18 (odd value 15) |
| Caption, key | 400 13/1.2, `--ink-2` | `.legend`, `.mini-key`, `.spark-cap` | |
| Axis label | 400 13 (SVG, normal leading), `--ink-3` | `.ax` | `--ch-type-caption` |
| Axis label, ribbon and scale | 400 13/1, `--ink-2` (ribbon), `--ink-3` (`.scale`, `.prow .rk`) | `.rib .ry`, `.rib .rx`, `.scale span` | |
| Ribbon reference label | 500 13/1, `--ink-2`, `--card` behind, padding 1 2 | `.rib .rref` | |
| Chip | 600 13/16 | `.pill` | today's chip (odd value 16) |
| Segmented label | 500 15/1 (window switch 14/1), `--seg-off` with `--seg-off-tsh`; selected 600 `--seg-on` (cross-fade) | `.iseg button` | `.ch-seg` |
| Ring caption | 500 15/1.25 | `.rings b` | |
| Goal title | 600 17/1.25 | `.goal1>div>b` | |
| Empty title | 600 20/1.25, balanced | `.empty-card h2` | |
| Compare empty | 600 16/1.3 title, 400 15/20 body | `.empty b`, `.empty span` | |
| Link row | 400 16/1.2, `--accent` | `.how` | |
| Bench key | 600 15/1.2; Tour side 400 `--ink-2` | `.bench-k` | |
| Bell badge | 650 11/19, fixed, on `--ch-green-700` | `.badge` | (odd value 5) |
| Home greeting | 600 22/1.2, −0.015em, wdth 92 | `.who b` | context only (odd value 6) |
| Home subline | 400 15/1.35, `--nav-ink-2` | `.who span` | context only |
| Status bar | 600 15/1, fixed | `.status` | mock only, not built |

Spacing and shape:
- Page edge 16, 20 at ≥414pt: `.sheet.airy`, `.d-sheet`, `.ctl`, `.gb`, Home `.sheet`. Home `.top` stays 16 at every width (odd value 7).
- Summary sheet `.sheet.airy`: padding 8 16 56, gap 12. Detail sheet `.d-sheet`: padding 8 16 56, gap 12. Home sheet `.lip .sheet`: padding 0 16 48, gap 12, under `.lip` padding-top 14.
- Between cards 12. Section name `.sech`: margin 18 2 0 (first child 4), so 30 from the card above to the name, 12 from the name to its card (odd value 11).
- Card `.card.air` (summary and detail): radius **18**, padding 14 16 16. `.card.air.flushb` (lists): padding 14 0 4, header padding 0 16. Home `.card`: radius **16**, header `.ch` padding 14 16 12, body `.cb.flush` 0, note `.cn` padding 12 16 14 (odd value 13).
- Card header `.ah`: no hairline under it; margin-bottom 10, min-height 24, gap 4 10.
- Hairlines: 1px, `--sep`. Row lists inset 16 from the leading edge, 0 at the trailing edge, none before the first row. Content rules (`.sumfoot`, `.strip`) span the content box (16 to 16). Grid rules (`.glance`, `.how`) run edge to edge of the card. Total row rule `--sep-strong`, edge to edge. (Odd value 17.)
- Row heights (min, fixed px): 64 (`.rrow`), 56 (`.lrow`), 52 (`.prow`), 44 (`.drow`, `.hb`), 30 (`.mrow`), 24 (`.ah`).
- Radii: card 18 (air), 16 (Home card), pill 7, icon tile 8, segmented track 16 and chip 12, filter button 14, few note 14, empty icon 12, score tile 11, stacked bar 8 (detail) and 6 (summary), rails and tracks 999, ticker bars 2.5, key swatch 3, bar lip 16, Home lip 20.
- Shadows: card `--card-shadow`; feature card shadow (section 2, fixed colours); segmented track and filter button `--seg-sh`; segmented chip `--seg-chip-sh`; pushed page `-10px 0 28px rgb(0 0 0 / .10)`; bell badge ring `0 0 0 1.5px var(--nav-ink)`; marker rings `0 0 0 2px var(--card)` (dumbbell now dot) and `0 0 0 2.5px var(--card)` (ribbon and spark end dots).
- Touch: bar buttons 44×44; glance cells full cell; `.dlink` 24×24 min (odd value 18).

## 4. Component numbers

> Updated in 06: the team chart is shown 128pt tall (not 160). 06 has every box measured off the page, per screen id; where a number here differs, 06 wins.

Each line names the selector in `stats-phone.css`. Copy the whole rule. Colours by token.

### Green bar `.gbar`
- Sticky, top 0, z 7. Fill `--nav`, ink `--nav-ink`. Height 114 total: status 50 + bar row `.gb` 48 (the 98pt bar) + padding-bottom 16 for the lip.
- Lip `.gbar::after`: 16 high, radius 16 16 0 0, `--bg`, at the bottom, so the page tucks under.
- Row `.gb`: flex, centre, gap 10, padding 0 6 4 16 (left 20 at ≥414).
- Switch `.sw`: inline-flex, gap 7, padding 10 4 10 0, min-height 44, nowrap. Caret 12×12 ×k, stroke 1.8, opacity .9, margin-top 2. Dot `.sw .live` 7×7 circle, `--champ`, margin-left 2.
- Bell `.bellb`: 44×44, margin-left auto, icon 22×22 stroke 1.5. Badge `.badge`: top 3 right 2, min-width 19, height 19, padding 0 5, radius 10, fill `--ch-green-700`, ring 1.5px `--nav-ink`, 650 11/19 (fixed), centred. Team shows "2"; My stats none.
- Focus: 2px `--nav-ink` outline, offset 2, radius 8.
- No scroll shade in this mock (DL §5 has a 14pt shade after 8px; odd value 5).

### Sticky controls `.ctl`, `.ctl-row`
- `.ctl`: sticky, top 114 (the script also sets it to the bar's measured height, 114), z 6, padding 2 16 10 (20 sides at ≥414).
- Once stuck (`.is-stuck`): `::before` takes the page colour `--bg` (no blur, no hairline), 200ms linear. Under the bar, after 1pt of scroll, the bar's 14pt shade (`rgb(0 0 0/.10)` to clear) fades in, 180ms linear.
- `.ctl-row`: flex, gap 8, centre.
- Window switch `.iseg.w5` (house segmented, DL §9): flex 1, min-width 0, grid columns **1fr 1fr 1fr 1.3fr 1.6fr**, gap 4 between buttons. Track: padding 4, radius 16, fill `--seg`, shadow `--seg-sh`. Buttons: min-height 32×k (track 40×k), radius 12, padding 0 2, 500 14/1 (other segmented controls 15/1), `--seg-off` with text shadow `--seg-off-tsh`. Labels "5", "10", "20", "Season", "Qualifiers" (aria-labels "Last 5", "Last 10", "Last 20"). Chip `.thumb`: absolute, top and bottom 4, radius 12, `--seg-chip`, `--seg-chip-sh`; slides `transform` and `width` 360ms `--spring`. Selected label: 600, `--seg-on`, text shadow `0 1px 0 rgb(0 0 0/.18)`, cross-fades in 200ms `--ease`. Focus 2px `--accent`, offset 1.
- Filter `.fbtn`: 40×k square (same height as the track), radius 14, fill `--seg`, shadow `--seg-sh`, icon `--seg-off` 18×18 stroke 1.7; press scale .97.
- Larger and XXL (`.is-big`): see the last subsection.

### Section names `.sech`
- 700 22/28, −0.02em, wdth 92, `--ink`, margin 18 2 0; first child 4.
- My stats: Overview, Your game, Rounds, Development. Team: Overview, Team game, Players. No rounds: Development only. Few rounds: the few note comes first, so Overview takes 18.

### Summary card `.card.air.sum` and its header `.ah`
- Card: `--card`, `--card-shadow`, radius 18, padding 14 16 16, overflow hidden. Whole card is the tap target (`role="link"`).
- Header `.ah`: flex, centre, nowrap, gap 4 10, margin-bottom 10, min-height 24.
  - Title `h2`: flex, gap 8, 600 17/22 `--ink`, flex 1 1 auto, min-width 0 (wraps instead of pushing meta).
  - Icon tile `.pi` (part cards): 26×k square, radius 8, fill `--gain-tint`, icon `--accent` 16×16 stroke 1.6.
  - Meta `.meta`: 400 15/20 `--ink-2`, nowrap, flex none, margin-left auto, inline-flex gap 6.
  - Chevron `.chev`: 8×14, stroke 1.8, `--ink-3`, flex none, margin-left 2.
- Press: `background-image: linear-gradient(var(--press), var(--press))`; no scale (house rule CH-1606) (odd value 19). Focus 2px `--accent`, offset 2.
- Plain detail cards `.card.air` (no `.sum`): same box, header has no chevron, not tappable.

### Feature card (scoring, green) `.card.air.feature.sum`
- Fill `radial-gradient(90% 70% at 100% 0%, var(--f-lit), transparent 70%), var(--f-bg)`. Shadow light `0 1px 2px rgb(11 30 20/.2), 0 10px 24px -14px rgb(11 30 20/.5)`; dark `0 0 0 1px rgb(255 255 255/.06)`. Radius 18, padding 14 16 16. Tokens re-pointed (section 2).
- Header: icon tile `rgb(244 241 232/.12)` with `--f-ink` flag; title "Scoring average" (team "Team scoring average"); meta = window label; chevron `--f-ink-2`. My stats puts the chevron in `.dlink` (24×24 min, `--f-ink-2`); team uses a bare chevron.
- Press: `filter: brightness(.94)`. Focus outline `--spot` (`#F4F1E8` here).
- Figures `.figs`: grid gap 4. `.figline` flex, baseline, gap 10, wraps. `.fig` 500 40/1 wdth 92 −0.04em. `.fig-sub` 400 17/22 `--f-ink-2` ("+2.4 to par").
- Change `.delta`: flex, gap 8, wraps, min-height 24×k, margin-top 6, 400 15/20 `--f-ink-2`; a pill plus "than the 10 before".
- Chart `.chart`: margin-top 14, `touch-action: pan-y`. My stats SVG height **160** (fixed), padding L 4 R 30 T 10 B 26. Team SVG height **160**, padding L 0 R 30 T 8 B 24 (odd value 20).
  - Grid lines `.grid` 1px `--sep`, from x 4 to W−26. Y ticks step 4 when the span is over 10, 2 over 6, else 1. Labels `.ax` right-aligned at x = W, y + 4.
  - Par rule `.parline` (team: the mean) 1px `--ink-3`, dash 3 4.
  - Five-round average `.avgline` 2.5 wide, round caps and joins, colour by tone: `--gain-fill`, `--loss-fill` or `--flat`. Area under it: linear gradient of that colour, 28% to 0. Team line and area always `--gain-fill`.
  - Round dots `.rdot` r 3.6 (team 3.4), newest r 5, scrubbed r 6; fill `--ink`, `--under` when under par; 2px stroke `--card`.
  - Scrub: rule 1px `--ink` at 60%, from T−4 to H−B+2; ring r 10, 1.5 stroke `--ink`. Date labels at the bottom corners, y = H − 6 (team H − 5). Team mean label "Mean 74.1" at x 4, 6 above the rule.
- Legend `.legend` (My stats only): margin-top 12, gap 6 16, 400 13/1.2 `--f-ink-2`; dot 8 `--ink`; line 16×3 radius 2 in the tone colour; par 16 wide, 1.5 dashed `--ink-3`; 6 after each mark.

### What changed `.card.air.sum.hl`
- Sentence `.hl p` 400 16/23 `--ink`.
- `.cmp`: grid gap 10, margin-top 14. `.cmp-row`: columns 78×k | 1fr | auto, gap 10, centre. Label 400 15/1.2 `--ink-2`. Value 600 17/1, min 3ch, right. Track `.cmp-track` 14×k high, radius 999, `--track`. Fill radius 999: `.gain` `--gain-fill`, `.loss` `--loss-fill`, `.flat` `--flat`, `.was` `--zero`; width 30% plus 70% of the scaled value.

### At a glance `.glance` (plain card, meta "Tap one for more")
- Grid 3 equal columns, margin 0 −16 −16 (to the card edges), border-top 1px `--sep`.
- Cell `.gc`: padding 12 14 14 16, grid gap 3; press `--press` (120ms); focus 2px `--spot`, offset −3, radius 12.
- Rules: vertical 1px `--sep` on cells 1, 2, 4, 5 at the right, 12 from top and bottom. Row two top rule: cell 4 from 16 to the edge, cell 5 full, cell 6 from the edge to 16.
- `.t` 400 15/1.25 `--ink-2`; `.v` 600 24/1.1 −0.02em wdth 92, toned (`--gain`/`--loss`) only past the error rule; unit `small` 500 15/1, margin-left 1; `.m` 400 13/1.3 `--ink-2` ("Tour 66%" or "a round").
- Order: Greens, Fairways, Scrambling / Putts, Birdies, Bogeys.

### Strokes gained summary and mini diverging bars `.mrows`, `.mrow`
- Figure block `.sb.one`: one column, margin-bottom 10. Total `.bigv` toned; caption "Strokes a round against the Tour".
- `.mrows`: grid gap 2. `.mrow`: columns 96×k | 1fr | 42×k, gap 10, centre, min-height 30.
- Label 400 15/1.2 `--ink-2`; value 600 15/1 right, toned.
- Rail `.rail` 10×k high, radius 999, `--track`. Zero `.zero`: centre, 1.5 wide, 5 above and below the rail (20 tall at Default), `--zero`, radius 1. Bar: absolute, radius 999, from the zero to the value; `.gain` `--gain-fill`, `.loss` `--loss-fill`, `.flat` `--flat` (flat when |v| < 0.05). Scale: ±ceil(max |v|), at least 1.
- Foot `.sumfoot`: 400 15/20 `--ink-2`, margin-top 12, padding-top 10, border-top 1px `--sep`; bold names 600 `--ink`.
- Under 3 rounds (`.mrows.wait`): columns 1fr auto, value is the no-data dash in `--ink-3`, no rails.
- Team "Strokes gained by leg": same card, fixed scale ±4, foot "Greens 55% · Putts 32.6 · Scrambling 32%".

### Part cards (Off the tee, Approach, Short game, Putting)
- Header with `.pi` icon tile and chevron, no meta.
- Key row `.kfr`: flex, start, space-between, gap 12, margin-bottom 14. Figure `.bigv` 600 34/1; unit `small` margin-left 2. Caption `.cap` 15/20 margin-top 6 ("Greens in regulation · Tour 66%"). SG pill `.pill` flex none, margin-top 4 (hidden under 3 rounds).
- Off the tee: stacked bar `.stack` 22×k high, radius 6, gap 2 (gaps show `--card`), segments min 2 wide: Left `--flat`, Fairway `--gain-fill`, Right `--ink-3` (odd value 21). Key `.mini-key`: flex space-between, gap 6, margin-top 8, 400 13/1.2 `--ink-2`, figures 600 `--ink`.
- Approach (7 bands), Short game (4 rows), Putting (4 bands): mini rails `.mrails` one shared grid, columns max-content | 1fr | max-content, gap 9 10, centre; rows are `display: contents`. Label `.l` 400 15/1.2 `--ink-2`, nowrap. Value `.v` 600 15/1 right, min-width 34×k. Rail `.hrail` 10×k, radius 999, `--track`; fill from the left, radius 999, `--gain-fill` at or past the Tour, `--loss-fill` short of it, `--flat` with no Tour figure. Tour tick `.tour` 2 wide, 4 above and below (18 tall), `--ink`, radius 1. Caption `.mini-cap` 400 13/1.3 `--ink-2`, margin-top 6.
- Figure strip `.strip` (tee and approach: 3 figures, putting: 2, short game: none): grid auto-fit min 84×k, gap 12, margin-top 14, padding-top 12, border-top 1px `--sep`, items aligned to the bottom. `.t` 400 13/1.3 `--ink-2`; `.v` 600 20/1.15 −0.015em, margin-top 3; unit 500 13 `--ink-2`, margin-left 1.

### Round ticker (Rounds summary) `.tick`
- Card body `.sb`: two columns minmax(0,1fr) minmax(0,1.15fr), gap 6 16, aligned to the bottom. Figure "20 rounds" (unit margin-left 5), caption "Best 73 · Oct 3".
- SVG 100% wide × 64×k high, viewBox 300×64, stretched (`preserveAspectRatio="none"`). One bar per round, oldest left. Gap 3 when more than 12 rounds, else 5. Height: (worst+1 − score) / (worst+1 − (best−3)) × 64, at least 6. Radius 2.5. Best round `--gain-fill`, every other `--flat`.
- Caption `.mini-cap` "Taller is lower; best in green".

### Goal rings `.rings`
- Grid 3 equal columns, gap 8, centred.
- Ring `.rg`: 68×k square, margin 2 auto 10. SVG viewBox 64, r 27, starts at 12 o'clock. Track `--track` 7 wide; fill `--gain-fill` 7 wide, round cap. Label inside 600 15/1.
- Name 500 15/1.25; caption 400 13/1.3 `--ink-2`, margin-top 2.
- Detail `.goal1`: flex, gap 16, centre; ring margin 0; title 600 17/1.25; line 400 15/1.3 `--ink-2`, margin-top 2.

### Few rounds and no rounds
- `.few-note` (on the page, above Overview): margin 4 2 0, padding 12 14, radius 14, `--well`, 400 15/21 `--ink-2`, bold lead 600 `--ink`.
- `.card.air.empty-card`: grid, centred, gap 8, padding 28 22 26. Icon `.em-ic` 44×k square, radius 12, `--gain-tint`, icon `--accent` 22×22. Title 600 20/1.25, margin-top 6, balanced. Body 400 15/21 `--ink-2`, max 30ch.

### Back bar (detail pages)
- Same `.gbar`, `.gb` row (heights, lip, sticky).
- `.back`: inline-flex, gap 4, padding 10 8 10 0, margin-left −6, min-height 44, 400 17/1 `--champ` (chevron too, `currentColor`). Chevron 11×19, stroke 2.2. Text "My stats" or "Stats".
- Title `.ptitle`: absolute, left 50%, translateX(−50%), 600 17/1, max-width 52%, ellipsis.
- Right: an empty 44×44 slot (`.bellb`), no bell.

### Detail page push `#phPush`, `.d-sheet`, `.d-hero`
- Layer: absolute, fills the phone, `--bg`, z 10.
- In: translateX(100%) to 0, 462ms `--spring-smooth`. Summary underneath: translateX(−24%) same timing. Shade `rgb(20 18 12/.10)` fades in 462ms `--ease`. Edge shadow `-10px 0 28px rgb(0 0 0/.10)`. Reduce Motion: opacity crossfade, `CH_FADE_MS` (180ms today), no slide, no shade (the design page draws it at 120ms) (odd value 22).
- `.d-sheet`: flex column, gap 12, padding 8 16 56 (20 sides at ≥414).
- Hero `.d-hero` (on the page, no card): padding 6 2 4. Figure 600 40/1 −0.04em wdth 92 (unit `small` as summary). Caption `.cap` 400 15/20 `--ink-2`, margin-top 6. Chips row `.chips`: flex, wraps, gap 8, margin-top 10, centred, 400 15/1.3 `--ink-2` (odd value 10).
- Pages: scoring, sg, tee, approach, short, putting, rounds, goals (My stats); tscore, tgame, tplayers (team).

### Detail visuals
- Trend ribbon `.rib`: padding-right 44. SVG 100% × 124×k, viewBox 300×120, inner padding 10, stretched. Grid lines at top, middle, bottom 1px `--sep` (non-scaling). Reference line `.rf-l` `--zero` 1.25 wide, dash 3 4. Area fill tone colour at 14%; line `.ln` 2.5, round. End dot 10×10, ring 2.5 `--card`. Y labels `.ry` at right 0 (best and worst value) 400 13/1 `--ink-2`. Reference label `.rref` at right −42, 500 13/1 `--ink-2`, `--card` behind, padding 1 2. X labels `.rx` first and last date, margin-top 6, 13/1 `--ink-2`. Better is always up. Line tone is `--flat` on every page.
- Stacked bar, detail (`.stack`): 28×k high, radius 8, gap 2, segments min 2. Scoring: Eagle `--eagle`, Birdie `--under`, Par `--par-seg`, Bogey `--bogey`, Double+ `--double`. Key `.skey`: grid auto-fit min 96×k, gap 8 14, margin-top 12; item flex, baseline, gap 6, 400 15/1.2 `--ink-2`; swatch 10×10 radius 3; figure 600 `--ink`, margin-left auto.
- Four figures `.m4`: 2 columns, margin −2 −16 −16 (to the card edges). Cell padding 12 16 14. Vertical rule on cells 1 and 3 at the right, 12 from top and bottom. Row two top rule: cell 3 from 16 to the edge, cell 4 from the edge to 16. `.t` 15/20 `--ink-2`; `.v` 600 24/1.1 −0.02em wdth 92, margin-top 4; `.m` 400 13/1.3 `--ink-2`, margin-top 3.
- Team "The round" `.m3`: grid auto-fit min 92×k, gap 12; `.t` 15/1.3; `.v` 600 24/1.1 −0.02em (no width axis), margin-top 4; `.m` 13/1.3, margin-top 3; pill margin-top 8.
- Team "Round days" table `.tbl` (odd value 23): 400 15/1.3; head 400 13/1.2 `--ink-2`, right-aligned, padding 0 0 8; cells padding 9 0, top rule 1px `--sep`, right-aligned; first column left; average 600.
- Dumbbells `.db`: grid 1fr auto, gap 6 12, padding 12 0 (first 0 in a card). Rule between rows: 1px `--sep` from the content edge to the card edge. Name 500 16/21; numbers 400 15/1.3 `--ink-2`, now 600 17 `--ink`. Track 16 high, full row: line 2 high at y 7, radius 1, `--track`. Segment y 6, 4 high, radius 2, tone colour. Was dot 12, `--card` fill, 2px inset `--zero` ring; now dot 12, tone colour, 2px `--card` ring. Pill aligned to the top.
- Horizontal bars `.hb`: columns 84×k | 1fr | 44×k, gap 10, centre, min-height 44. Label 500 16/21; sub `small` 400 13/1.3 `--ink-2`. Value 600 17/1 right. Rail `.hrail` 12×k, radius 999, `--track`; fill from the left; Tour tick 2 wide, 5 above and below, `--ink`. Key `.tour-key`: flex, gap 6, 400 13/1 `--ink-2`, margin-top 12; mark 2×12 `--ink` radius 1.
- Bench bar on a part page `.hrail.kf-bar`: block, margin-top 4, **10×k high**. `.bench-k` margin-top 8.
- Lead `.plead`: 400 16/23 `--ink`, margin 0 0 12.
- How this is measured `.how`: full-width button, margin 12 −16 −16, padding 13 16, border-top 1px `--sep` edge to edge, 400 16/1.2 `--accent`, press `--press`; chevron turns 90° over 200ms when open. Text `.how-t` 400 15/20 `--ink-2`, padding 12 0 0.
- Focus areas `.dev`: rows padding 12 16 14, rule inset 16; title 500 16/21; line 15/20 `--ink-2`, margin-top 2; progress `.prog` 8×k, radius 999, `--track`, margin-top 10, fill `--gain-fill`.

### Detail rows `.drow`, `.prow`, `.rrow`, `.scale`
- SG row `.drow`: columns 104×k | 1fr | 48×k, gap 12, centre, min-height 44, padding 4 16, margin 0 −16 (press runs edge to edge). Press and pinned: `--press`. Label 500 16/21; value 600 17/1 right, toned. Rail 12×k; zero 5 above and below (22 tall). Range whisker `.whisk`: 2 high `--ink`, end caps 2×12; opacity 0, 0.9 when pinned (200ms).
- Total `.drow.total`: margin-top 6, padding-top 10, padding-bottom 6; rule 1px `--sep-strong` edge to edge; label and value 600.
- Readout `.readout` above the rows: min-height 40×k, 15/20 `--ink-2`, margin-bottom 4 (`.pad`: padding 0 16).
- Scale `.scale`: same three columns, gap 12, margin-top 8; middle cell flex space-between "−4 0 +4", 400 13/1 `--ink-3`.
- Player row `.prow`: columns 20×k | 104×k | 1fr | 44×k, gap 10, centre, padding 4 16, min-height 52; rule inset 16; press `--press`. Rank 400 13/1 `--ink-3`; name 500 16/1.2 ellipsis; value 600 17/1 right. Rail scale fixed ±8 (odd value 25). Summary shows the top 3, not tappable.
- Round row `.rrow`: columns 44×k | 1fr | auto | 13, gap 12, centre, padding 10 16, min-height 64; rule inset 16; press `--press` 120ms. Score tile `.score` 44×k square, radius 11, `--well`, 600 19/1 −0.02em; under par: `--under-tint` fill, `--under` ink. Title 500 16/21 ellipsis; sub 15/20 `--ink-2` ellipsis ("Oct 21 · Tournament"). Right `.r`: grid, end, gap 5; to par `.tp` 600 15/1 `--ink-2` (`--under` when under); SG pill. Chevron 8×14 `--ink-3`.
- Part link row `.rrow.lrow`: columns 26×k | 1fr | auto | 13, min-height 56; `.pi` 26×k radius 8 `--gain-tint` / `--accent`.
- Pill `.pill`: inline-flex, gap 4, padding 4 7, radius 7, 600 13/16, nowrap. `.gain` `--gain-tint`/`--gain`; `.loss` `--loss-tint`/`--loss`; `.flat` `--flat-tint`/`--ink-2`. Arrow 11×11, stroke 1.8.

### Home "Your game"
- Context (built by the Home package, not here): green `.top` padding 0 16 34; logo 32 circle; greeting; `.lip` margin-top −20, radius 20 20 0 0, `--bg`, padding-top 14 (odd value 6).
- Card `.card` radius 16, `--card-shadow`. Header `.ch`: flex, wraps, baseline, gap 2 12, padding 14 16 12; title 600 17/22; meta "Strokes gained vs Tour" 400 15/20 `--ink-2`, right; hairline 1px `--sep` at the bottom, inset 16.
- Leg `.leg`: padding 14 16 16; rule between legs inset 16.
  - `.leg-h`: flex, space-between, centre, gap 8. Title 600 16/21 with its icon 16×16 in `--ink-2`, gap 8. SG pill toned (flat inside ±0.05).
  - `.leg-main`: grid auto | 1fr, gap 16, aligned to the bottom, margin-top 8. Figure `.v` 600 28/1 −0.03em wdth 92; stat `.s` 400 15/20 `--ink-2`, margin-top 4.
  - Spark `.spark`: 100% × 46×k, viewBox 240×46, inner padding 6, stretched. Line `.ln` 2.25 non-scaling, round; colour `--gain-fill` / `--loss-fill` / `--flat` by tone. Area gradient that colour 22% to 0. Mean `.mn` 1px `--ink-3`, dash 2 3. End dot 9×9 that colour, ring 2.5 `--card`.
  - `.spark-cap`: flex, space-between, wraps, gap 2 8, margin-top 6, 400 13/1.2 `--ink-2`; each span nowrap; last pushed right; word 600, `--gain`/`--loss` ink or `--ink-2` when steady.
  - Bench (Approach only) `.bench`: margin-top 14; rail `.hrail` 12×k block, fill toned, Tour tick 2 wide 5 above and below `--ink`. Key `.bench-k` margin-top 8, 600 15/1.2; "You 55%" in the bar's tone ink; "Tour 66%" 400 `--ink-2`.
  - Count `.cnt` 400 15/20 `--ink-2`, margin-top 10.
- Note `.cn`: 400 15/20 `--ink-2`, padding 12 16 14, rule 1px `--sep` at the top inset 16.

### Motion that sets a number
- Chart marks `.grow` (scaleX from 0), `.rv` (scaleY from the bottom), `.fadein` (opacity): 360ms `--ease`, once, when the card is 25% in view. Rings: dash offset 360ms `--ease`. Reduce Motion: drawn at rest.
- Window change: content cross-fades 260ms `cubic-bezier(.22,1,.36,1)` (`CH_FADE_MS` (180ms today) with Reduce Motion); the scoring line glides point to point 360ms (cubic ease-out `1−(1−t)^3.2`), not under Reduce Motion.
- Row press: 120ms background. Thumb: 360ms `--spring`.

### Larger Text Size `.is-big` (Text Size Larger 1.24 and XXL 1.36)
- Window switch scrolls sideways: grid columns none, auto columns max-content, buttons padding 0 12, right edge masked `linear-gradient(90deg, #000 85%, transparent)`, no scrollbar.
- Card header wraps: title takes its own line when there is a meta (flex 1 1 100%); meta margin-left 0; chevron and `.dlink` margin-left auto.
- `.sb` stacks to one column (figure over the ticker).
- Glance grid goes to 2 columns and drops its inner rules (the top rule stays).
- App trigger: `--ch-type-k` at or over 1.24 (a class from the same code that sets the scale, or a container query).

### Odd values found, and what ships

1. **Ink and accent mappings in dark.** The brief maps `--ink`/`--ink-2`/`--ink-3`/`--double` to `--ch-ink-900/600/500/700` and `--accent` to `--ch-green-600`. Their dark values (`#F1ECDF`, `#D0C9B8`, `#ADA697`, `#D0C9B8`, `#7CC79B`) are the dark values of `--ch-text-primary/-secondary/-tertiary` and `--ch-accent` in the Classes table. If the `--ch-ink-*` and `--ch-green-600` primitives do not flip in dark, use the semantic tokens. **Resolved:** Use the semantic tokens (`--ch-text-primary/-secondary/-tertiary`, `--ch-accent`), which flip in dark.
2. **`--gain-fill` dark is `#4FA877`**; `--ch-green-500` is `#1F6B45` in both themes per the Classes table. The page's own additions table names `--ch-chart-gain-fill` (`#1F6B45`/`#4FA877`). **Resolved:** Map `--gain-fill` to `--ch-chart-gain-fill`, which exists with these values.
3. **Bar and feature green.** `--nav` dark `#0A2418` and `--f-bg` dark `#123D29` both map to `--ch-green-800` (`#0B3A25` in both themes). DESIGN_LANGUAGE §5 says the bar is `--ch-frame` (`#0A331F`/`#08150E`), and §9 names `--ch-feature-bg`. The mock bar matches neither in dark. **Resolved:** Fixed: the bar is now `--ch-frame` on all three screens. `--f-bg` stays the feature card colour (`--ch-feature-bg`, new).
4. **Segmented gap.** The window switch buttons sit with no gap; the Classes spec gives `.seg` a 4 gap between buttons. Everything else on the control now matches the house segmented. **Resolved:** Fixed: gap 4.
5. **Bar still differs from DL §5 and the Classes spec in three places** (lip 16, champagne dot and back label now match): switch title 600 20 (they say 18), badge 600 11.5 on `--nav` (Classes: 650 11 on `--ch-green-700`), and no 14pt scroll shade. DL says the bar is unchanged, so the build should keep today's bar; confirm. **Resolved:** Fixed: title 600 18, badge 650 11 on `--ch-green-700`, the 14pt shade under the bar after scroll (180ms linear).
6. **Home top** (`.top`) has a radial light behind the greeting, greeting 22pt, lip 20. DL "Adopted" Home says flat green, greeting 34, hero bottom radius 24. Treat `.top` as context; build only the Your game card from this spec. **Resolved:** Fixed to one flat green. The rest of `.top` is context: build Home's hero from the Classes package, not from here.
7. **Home `.top` padding stays 16 at ≥414pt**; every other edge goes to 20. **Resolved:** Context only (see 6).
8. **Leftover paper-thumb tokens.** `--thumb` and `--thumb-shadow` are still defined but nothing rendered reads them (only the dead `.gdnav`); the earlier well inset on `.iseg` and `.fbtn` is replaced by `--seg-sh`. Do not build them. **Resolved:** Agreed: do not build them.
9. **Sticky controls take glass and a hairline when stuck.** DL §5.4 and Classes `.ctlbar` say page colour behind it. **Resolved:** Fixed: page colour behind it, no blur, no hairline.
10. **Text on the page.** `.sech` section names and the detail `.d-hero` (figure, caption, chips) sit straight on the page; DL law 1 allows only the large title and context line. The page lists section names as an addition needing a nod; the detail hero is not listed. **Resolved:** Section names stay (Nick, 31 Oct: "Keep as drawn"). The detail hero sits where a large title would and is built as drawn.
11. **Gaps and padding.** 12 between cards, 30 above a section name, card padding 16. DL law 6 says 24 between cards and 20 card padding; Classes uses 24 between sections, 12 tight. **Resolved:** Build as drawn (02-PLAN override 4).
12. **`--spot` light is `#1F6B45`**, not `--ch-accent` (`#155A39`). It is also the focus ring on the chart and glance cells. **Resolved:** Build as drawn; map to `--ch-green-700` light.
13. **Card radius 18** on every Stats card (`.card.air`); Home card, DL §4 and Classes use 16. **Resolved:** Build as drawn (02-PLAN override 4).
14. **Detail hero figure is 600**; the feature figure and DL hero figure are 500. `.m3 .v` has no width axis while `.m4 .v` and `.gc .v` use wdth 92. **Resolved:** Fixed: detail hero figure 500.
15. **Line heights off the scale:** 15/21 (`.few-note`, `.empty-card p`) vs meta 15/20; lead 16/23 vs `--ch-type-body-l` 16/24; captions 13/1.3 (16.9) and 13/1.2 vs `--ch-type-caption` 13/18. **Resolved:** Build as drawn.
16. **Chip** padding 4 7, line 16; Classes chip is padding 5 8, 13/1. **Resolved:** Use the Classes chip (padding 5 8, 13/1) so chips match across screens.
17. **Hairlines are 1px**; Classes says 0.66px. `.glance`, `.how` and the flushb `.sumfoot.pad` rules run edge to edge, not inset 16. **Resolved:** Use the app hairline (`--ch-separator`, 0.66 on 3x screens); keep the full-bleed rules as drawn.
18. **`.dlink`** (scoring card chevron) is a 24×24 button, under the 44 minimum; the whole card is also tappable. **Resolved:** Fixed: 44pt hit area around the 24pt chevron.
19. **Press.** `.card.sum` transitions `background-color` 280ms but the press changes `background-image`, so the wash snaps on with no fade. DL §8/§9 say tappable cards scale 0.97; the mock follows CH-1606 (no scale). **Resolved:** Fixed: the press tint now fades out over 280ms. No scale (CH-1606 wins over DL).
20. **Team hero chart is 128 tall**; DL law 6 says hero charts at least 160. **Resolved:** Fixed: 160.
21. **Off the tee "Right" segment uses `--ink-3`** (a text token) while "Left" uses `--flat`. **Resolved:** Build as drawn: two misses in two greys.
22. **Push offsets.** Summary drifts −24% and dims 10%; DL §8 and Classes say −30%. The page cites the app's `CH_UNDERLAY_SHIFT` and `--ch-push-dim`, so the app values may already be −24% and 10%. **Resolved:** The app values: `CH_UNDERLAY_SHIFT = 0.24`, `--ch-push-dim` 10%. Build those.
23. **Team "Round days" is a table**; DL §10 bans tables on phone. **Resolved:** Build as drawn: three columns of short figures. Flag if a test bans it.
24. **`.kf-bar` is 10px fixed** (beats `.hrail` 12×k); every other rail scales with Text Size. **Resolved:** Fixed: scales with Text Size.
25. **Player rows hard-code the loss tone** (`.bar loss`, `.val loss-ink`) whatever the sign; build with the same tone rule as `.drow`. **Resolved:** Fixed: the bar and figure take the SG tone and side.
26. **XXL is `--k` 1.35** on this page; the app's XXL cap is 1.36 (Classes spec). **Resolved:** Fixed: 1.36.
27. **Dead rules** (not rendered by the page; do not build): `.nav`, `.bar` grid row, `.it`, `.acts`, `.icon-btn`, `.lt`, `.q`, `.tiles`/`.tile`, `.tap`, `.mtiles`, `.viz-h`, `.gdnav`, `.lead`, `.basis`, `.more`, `.rlist-wrap`, `.rrow.enter`, `.frow`, `.menu-btn`, `.d-lead`, `.scat`, `.sb .viz .spark`, `.sb .viz .bench-k`. The first `.ctl` rule (top 94, padding 14 16 10) is overridden by the later ones (padding 2 16 10, then top 114 in the house bar block). **Resolved:** Agreed: do not build dead rules.

## 5. Every state and sub page, and where to check it in the app

> Updated in 05 and 06: loading and didn't load are now drawn (CH-5201, CH-4201, CH-2216), as are long names. 05 is the full list of screen ids and their state matrices; 06 measures each drawn state.

App routes are the preview routes on `npm run dev -- -p 3100`. Hashes are the detail scheme in `02-PLAN.md` (Routing). A route marked "add" has no fixture today; the PR that needs it adds it.

### My stats (player)

| View | Design link | App |
|---|---|---|
| Summary | `#stats-light-full` | `/clubhouse-preview/player?state=self` |
| Scoring | `#stats-light-full-scoring` | `…?state=self#gm-scoring` |
| Strokes gained | `#stats-light-full-sg` | `…?state=self#sd-sg` |
| Off the tee | `#stats-light-full-tee` | `…?state=self#gm-tee` |
| Approach | `#stats-light-full-approach` | `…?state=self#gm-approach` |
| Short game | `#stats-light-full-short` | `…?state=self#gm-short` |
| Putting | `#stats-light-full-putting` | `…?state=self#gm-putting` |
| Rounds | `#stats-light-full-rounds` | `…?state=self#sd-rounds` |
| Goals | `#stats-light-full-goals` | `…?state=self#sd-goals` |
| 2 rounds | `#stats-light-few` (and `-sg`, `-approach`) | `…?state=early` |
| No rounds | `#stats-light-none` | `…?state=empty` (add if missing) |
| Failed read | none drawn: today's failed notice, unchanged, above the cards | `…?state=failed` |
| Loading | none drawn: today's skeleton, card shaped (one block per summary card, same radius and gap) | `…?state=loading` |

Summary order, top to bottom: green bar; sticky window switch and filter; **Overview**: Scoring average (the one green feature card), What changed, At a glance (3 by 2); **Your game**: Strokes gained, Off the tee, Approach, Short game, Putting; **Rounds**: Round by round; **Development**: Goals and focus areas.

Detail pages, their blocks in order (as drawn):

- **Scoring:** hero (average, to par, change chip) · Score by round (par dashed) · An average round (score mix) · Per round · What changed · Against the N before.
- **Strokes gained:** hero (total, likely range) · By part of the game (tap a row for its range) · Open a part (four rows that push the part) · How strokes gained works.
- **Off the tee:** hero (Fairways hit, SG chip) · In short · The figures · Where drives finish (left, fairway, right) · Against the N before.
- **Approach:** hero (Greens in regulation, SG chip) · You and the Tour (only Tour figures that exist) · The figures · Greens hit by distance (7 bands, yards, no Tour tick) · Greens by round · Against the N before.
- **Short game:** hero (Scrambling, SG chip) · In short · The figures · Up and down by lie (Tour ticks: fairway 65, rough 58, sand 50) · How this is measured.
- **Putting:** hero (Putts per round, SG chip) · In short · The figures · Make rate by distance (6 bands, Tour ticks where they exist) · Putts by round (up is fewer) · Against the N before.
- **Rounds:** Round by round (the ticker, full size) · Personal bests · Against the N before · Every round (list; a row opens the round as today).
- **Goals:** Goals this season (rings) · Focus areas (from your coach).

Today's blocks the page doesn't draw still ship, inside these details, at the places `02-PLAN.md` ("Where today's content goes") gives them, in the page's card style (`acard`: title and meta in the card head, 14/16 padding). So the built details are longer than the page. That is expected and is the one place the build may show more than the drawing.

### Team Stats (coach)

| View | Design link | App |
|---|---|---|
| Summary | `#team-light-full` | `/clubhouse-preview/stats` |
| Team scoring | `#team-light-full-tscore` | `/clubhouse-preview/stats#sd-team-score` |
| Team game | `#team-light-full-tgame` | `…#sd-team-game` |
| Players | `#team-light-full-tplayers` | `…#sd-team-players` |
| Last 20 | `#team-light-full-last20` | `…?state=last20` |
| 2 round days | `#team-light-few` | `…?state=partial` |
| No rounds | `#team-light-none` | `…?state=empty` |
| Failed, loading | not drawn: today's notice and a card-shaped skeleton | `…?state=failed`, `…?state=loading` |

Summary order: green bar ("Stats ⌄", bell with badge); sticky window switch and filter; **Overview**: Team scoring average (green feature card), Team game (four mini bars, Strokes gained by leg), Players (top three, Who gains and loses).

Details: **Team scoring:** By round day · The round · Round days (a Rounds column, not To par). **Team game:** Strokes gained by leg · The round · How strokes gained works. **Players:** Who gains and loses (every player, tap to pin), then today's Players list with its Avg / SG sort and peek, unchanged.

### Home "Your game" (player)

| View | Design link | App |
|---|---|---|
| Full | `#home-light-full` | `/clubhouse-preview/home-player` |
| 2 rounds | `#home-light-few` | add `?state=early` |
| No rounds | `#home-light-none` | add `?state=empty` |

One card, "Your game · Strokes gained vs Tour", four legs (Off the tee, Approach, Short game, Putting). Each: icon, strokes gained a round this season, the key figure for the last 10 rounds, the trend word ("Improving", "Slipping" or "No clear change"), a spark, the counts line, and a You vs Tour rail where a Tour value exists (Approach only: you 55, Tour 66). Footnote under the rows. A leg row opens that part's detail on My stats (`#gm-…`).

### Every screen, also

- Dark: add `-dark` to any link.
- Text Size XXL: add `-xxl`. The window switch scrolls sideways with a fade on its right edge; card heads wrap their meta under the title; nothing clips.
- 430pt: add `-wide`. Page edge 20.
- Reduce Motion: add `-reduce`.

## 6. Mechanics: what every tap, swipe and key does

> Updated in 07 and 08: pinning a row shows its range whisker and the press wash; the other rows do not dim. "How this is measured" is a toggle only on Scoring, Off the tee, Approach and Putting.

| Where | Action | Result |
|---|---|---|
| Summary card (anywhere on it except a chart) | Tap, or Enter / Space when focused | Pushes its detail (section 7). Haptic `select`. |
| Scoring feature chart | Press and drag | Reads the nearest round: a rule, the dot grows, the figure shows that round's score and date. Haptic tick per round crossed. Release restores the average. It never opens the detail. Arrow keys step rounds when the chart has focus. |
| Card chevron (›) | Tap | Same as the card. It's the visible affordance and the keyboard target when the chart holds focus. |
| At a glance tile | Tap | Pushes its part: Greens → Approach, Fairways → Off the tee, Scrambling → Short game, Putts → Putting, Birdies and Bogeys → Scoring. |
| Window switch | Tap a segment | Chip slides to it; every figure on the page and in any open detail changes with a crossfade; the scoring line morphs. Haptic `select`. Retapping the current one does nothing. |
| Filter button | Tap | Opens today's `StatsFilter` sheet, unchanged. When a filter is on, the button shows the app's active state and "Custom" appears as a sixth segment (section 8). |
| Bar title "My stats ⌄" / "Stats ⌄" | Tap | Today's section switch, unchanged. |
| Bell | Tap | Today's notifications, unchanged. Not on detail pages. |
| Detail bar "‹ My stats" / "‹ Stats" | Tap | Pops to the summary at the scroll it left. |
| Detail | Swipe from the left edge | Interactive pop, as every pushed page (PhoneScreen). |
| Detail | Escape (keyboard) | Pops. |
| SG detail, By part row | Tap | Pins the row: shows its likely range under the bar and dims the others. Tap again to unpin. |
| SG detail, Open a part row | Tap | Opens that part. Replaces the SG page (one level), so Back reads "‹ My stats" and returns to the summary (`02-PLAN.md` open call 4). |
| Players (team) row | Tap | Pins that player's row as above. A second tap on a pinned row opens the player (today's TeamRank behaviour). |
| Team game, leg row | Tap | Pins that leg's row. |
| Every round row (Rounds detail) | Tap | Opens the round, as today. |
| Home leg row | Tap | Opens `#gm-<part>` on My stats. |
| Section strip retap | Tap the current section | Pops any open detail (`history.go(-level)`), as on Roster. |
| Deep link | Arrive on `#gm-…`, `#sd-…`, `?tab=rounds`, `?tab=dev`, `?tab=game` | The detail shows in place, with no slide; one Back lands on the summary. Table in `02-PLAN.md`. |

Presses: cards and rows never scale (house rule CH-1606). A pressed card takes the pressed surface (`--press` over the card, 280ms ease out on release); the green feature card darkens to brightness .94. Buttons (the filter, the chevron, segments) take the house `pressScale` .97.

## 7. Motion

> Superseded by 07-MOTION.md, which gives every movement as a row with its frame check. Changes from this section: the window chip is instant under Reduce Motion; press is a wash on cards and rows (no scale, CH-1606), brightness .94 on the feature card, scale .97 only on the filter button; the edge swipe is not drawn on the page and uses the app's existing pop.

Curves, as the app names them: `--ease` = `cubic-bezier(.22,1,.36,1)`; `--spring` = `cubic-bezier(.34,1.3,.64,1)` (the settle spring); `--spring-smooth` = the app's 462ms smooth spring (`linear(…)` in the CSS, same samples as `lib/motion`).

| What | Normal | Reduce Motion | Animations off |
|---|---|---|---|
| Push a detail | New page slides in from the right, 462ms `--spring-smooth`. The summary underneath moves left 24% (`CH_UNDERLAY_SHIFT`) and takes `--ch-push-dim` (`rgb(20 18 12 / .10)`). The house push, not a new one. | `CH_FADE_MS` (180ms today) crossfade, opacity only, no movement | Instant swap |
| Pop (Back, edge swipe, Escape) | The same, reversed. Edge swipe follows the finger and settles on release | `CH_FADE_MS` (180ms today) crossfade | Instant |
| Window chip | Slides to the new segment, 360ms `--spring` (transform and width) | Instant (the chip doesn't travel; 07) | Instant |
| Figures on a window change | Old and new crossfade in place, 260ms `--ease` | `CH_FADE_MS` (180ms today) | Instant |
| Scoring line on a window change | Line, area and dots morph from the old positions to the new, 360ms (interpolated at each new x) | No morph; crossfade | Instant |
| Chart marks (bars, rails, rings, ticker) | Grow once, 360ms `--ease`, the first time their card is a quarter in view. Never again on scroll or on a window change | Drawn at full size | Drawn at full size |
| Goal rings | Stroke draws to its value, 360ms `--ease`, once | Full | Full |
| Scrub | The rule and the grown dot follow the finger with no lag; haptic tick per round | Same (it's direct manipulation) | Same |
| Card press | Pressed surface on press; fades out over 280ms `--ease` on release | Same | Instant |
| Sticky window switch | Takes the bar's shade once content passes under it (14pt, `rgb(0 0 0/.10)` to clear, 180ms linear) | Same | Instant |
| Deep-link arrival | No animation (`AnimatePresence initial={false}`) | Same | Same |

Nothing on these screens counts numbers up, bounces, or loops.

## 8. Can't be built as drawn, and the fix

The page was corrected to match the app wherever it could (section 9 of `03-DATA-CHECKS.md` lists every correction). These remain:

| Spot | Why it can't be built as drawn | Build this |
|---|---|---|
| SG total | The page's total is the sum of the four legs (−5.7). The app stores its own total (`sgPerRound`), which can differ by a few tenths | Show the stored total in the summary, the hero and the Total row. The leg bars stay as drawn |
| Goals rings | The page's rings ("6/10", "3/8", "Approach 125–150 yds", "Bunker work", "practice blocks logged") are invented | One ring per active goal from `progressOf(goal)`; label from the goal's title, small line from its metric and target. A goal with no baseline shows its value and target as text, no ring. Focus areas list the coach's rows, no progress |
| Home sparks | The page draws 10 rounds per spark. The app draws `LEG_TREND = 7`, so "Improving" can't show | Draw what `LEG_TREND` gives and label the real count. Raising it to 10 is open call 3 (`02-PLAN.md`) |
| Home leg icons | The page has a glyph per leg; Home has none today | Build them, using the same four glyphs as the Stats part cards (one shared icon map), 26pt tile, `--gain-tint` fill |
| Custom window | The page has five segments. The app adds "Custom" when a custom range is on | Append it as a sixth segment; the switch then scrolls sideways as it does at XXL |
| Filter sheet | The page's filter button does nothing | Today's `StatsFilter` sheet, unchanged |
| Coach on a player | The page draws the player's own view | A coach sees the same page under today's coach head (identity, handicap, Message). The bar reads "Player stats ⌄"; a detail's back reads "‹ Player stats" |
| Content the page leaves out | Coach head, Share, notices, SG by round, the SG change chip, par tiles, GreenMiss, CupMiss, lag, break, distance by club, by lie, More, ReadsLine, BestCardShare, Development controls, TeamInsight, the Players list and peek, team putting | Each goes in a detail at the place `02-PLAN.md` gives it, in the page's card style. Nothing is removed |
| Haptics | The page can't vibrate | `haptic('select')` on a push, a window change and each round crossed while scrubbing |
| Missed short | The page's "Missed short" uses the corrected formula; today's code counts corner misses twice | Fix the formula (`03-DATA-CHECKS.md` §1), on desktop too |
| One-putt rate | Needs a denominator the page assumes | Holes with a putt recorded (`03-DATA-CHECKS.md`) |
| Large title | Classes and Roster have a 34pt large title; the page has none | Settled by Nick, 31 Oct ("Keep as drawn"): no large title on Stats. Section names stay on the page, an exception to law 1 for Stats only |

Settled the other way (the app wins and the page now matches it): the window switch is the house green chip with all five windows and the filter; the bar is the house bar (98pt, 16pt lip, champagne dot, no bell on a detail); the push is the house push; cards don't scale on press; strokes gained waits for round 3; only real Tour values.

## 9. Fidelity check: a PR is done only when it matches

1. Shoot the design and the branch with `capture/capture.mjs` (README), same width (393 and 430), same theme, same Text Size, Reduce Motion on for stills.
2. Compare each pair side by side at full size (`capture.mjs compare`). List every difference in the PR as **matches**, **fixed**, **longer by design** (a block from section 8's "content the page leaves out") or **can't match (section 8 row)**. Anything else blocks the PR.
3. Measure, don't eyeball, the things that drift most: page edge (16, 20 at 430), card radius 18, card padding 14 16 16, gap 12 between cards, section name 22/28 bold with 30 above (18 plus the 12 gap), summary figure size, the window switch height (40), its 4 gap and chip radius (12), the bar (98) and its lip (16). Use the browser inspector on both.
4. Motion: record a push, a pop, an edge swipe, a window change and a scrub on both (Playwright `recordVideo`, 393 wide), with and without Reduce Motion. Durations and curves must be section 7's.
5. Mechanics: walk section 6 for the screen and confirm each row, including Back, Escape and every deep link.
6. States: full, 2 rounds, none, failed, loading, dark, XXL, 430. One still each.
7. Figures: for each summary card, the figure equals its detail's hero, in every window (`03-DATA-CHECKS.md`).
8. The banned list (`DESIGN_LANGUAGE.md` section 10). No accent left-border cards anywhere.

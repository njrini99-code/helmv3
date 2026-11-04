# 06-SCREEN-SPECS: CoachHelm quick chat

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 12 rows).

> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

How to read this: one section per screen ID from 05, in the order the eye meets it; each row is one element, with its box, type, colour token (light / dark hex), measured contrast (light / dark), icon, hit area and the data it shows; each section ends with the redline numbers to check on a screenshot first.

Source: design page `coachhelm/quick-chat.html` (same file as the scratchpad copy `coachhelm-quick-chat.html`) with `fix06.py` applied (the 06 fixes, 4 Nov), read as the browser resolves it: base `.qc` v1 rules, then the later rebuild rules, then the Glass `.pv-a` overrides, then the "06 fixes" block at the end of the stylesheet, then the `--a-*` values for light (`:root`) and dark (`prefers-color-scheme` and `[data-theme="dark"]`, identical). App tokens: helmv3 at commit 75b4956, `src/clubhouse/styles/tokens.css` and `coachhelm-ask.css`. Data: `03-DATA-CHECKS.md` (what the panel shows) and `TASK_FIELDS.md` (what each task writes; it wins).

Conventions:
- Sizes are CSS px = iOS pt at 1x. Phone values are for the 390 wide capture (`-w390`); the panel keeps the same insets at 402 and 430. Desktop is the 1280×800 frame.
- Type is written `size/line-height weight`, in pt at default Text Size. "×k" means it scales with iPhone Text Size: the page writes `calc(Npx * var(--k))`, the app writes `calc(N * var(--ch-type-k))`. XXL is k = 1.36 and nothing may clip there (SHARED-5). Sentence case everywhere, no tracking unless given, no tracked caps.
- Contrast is WCAG 2.x relative luminance, computed by script (`scratchpad/qc06/pairs.py`), with every rgba composited over the surface it really sits on. The header, the composer zone and the grab bar sit on the panel's glass fill, `--a-pglass` over the veiled page (phone) or the page (desktop), = #fbfaf6 / #191e1a. Everything in the scrolling body sits on the solid body sheet, `--ch-card-bg` #fffefb / #191e1a. `saturate(180%)` on the backdrop is ignored (it moves the fill by under 1%). Target 4.9:1 for text, hard floor 4.5:1; 3:1 for glyphs, rings and marks (SHARED-4).
- "Hit" is the touch target. Every target is 44: where the drawn control is smaller, a transparent `::before` pad, centred, `max(100%, 44)` each way, makes up the difference; the drawn size does not change.
- Reduce Motion: every move is an opacity crossfade of `CH_FADE_MS` (180ms today), linear; nothing scales or slides.
- Shared criteria are referenced as SHARED-1 to SHARED-12 (`redesign-package-src/ACCEPTANCE-SHARED.md`), not repeated: 1 green bar, 2 flat page and no gradients, 3 no accent left borders, 4 contrast, 5 XXL unclipped (`--ch-type-scale` 1.36), 6 Reduce Motion, 7 phone edge 16/20, 8 draft PRs behind a flag, 9 no deploy/flag/migration, 10 shot tracking, 11 players never see teammates' figures, 12 side-by-side match.
- Surfaces are flat (SHARED-2). The page's three former gradients are now flat: primary button and send button are `--ch-accent` with an inset `0 1px 0 rgb(255 255 255 / 0.2)` lit top edge, and the header mark tile is #155a39. The one accepted gradient use is the two moving shimmer sheens, `.step.active .step__l::after` (S-RUN.steps) and `.sk.anim::after` (skeleton bars): they are travelling highlights, not surfaces, and both stop under Reduce Motion (SHARED-6).

---

## Below 4.9:1

Every pair that measured under 4.9:1 in either theme on the 3 Nov page, with its fix. All of them are fixed on the page by `fix06.py` and the values in the screen tables below are the fixed ones; "Was" is kept so the change can be checked.

### Text (all fixed)

| # | Screen | Pair | Was L / D | Fix on the page and in the build | Now L / D |
|---|---|---|---|---|---|
| T1 | S-RUN.cancelled | Cal day letters (`--ch-text-tertiary` on card) in a cancelled card | 2.69 / 3.38 | Fixed. The card body no longer dims. Only marks dim to 0.6 (event dots, seats, plan swatches, folder art), and the new event block and plan segments turn neutral: `--ch-skel-base` fill, `--ch-text-secondary` text. Text keeps its full colour | 6.61 / 6.99 |
| T2 | S-RUN.cancelled | Round label (`--ch-accent-text` on well) | 2.96 / 4.01 | Fixed, as T1 | 7.48 / 8.96 |
| T3 | S-RUN.cancelled | Fact label and thread meta (`--ch-text-secondary` on well) | 3.14 / 4.66 | Fixed, as T1 | 8.96 / 10.87 |
| T4 | S-RUN.cancelled | Fact value (`--ch-text-primary` on well) | 4.39 / 6.13 | Fixed, as T1. Neutral block or segment text: `--ch-text-secondary` on skeleton 7.98 / 8.91 | 15.66 / 15.20 |
| T5 | S-RCPT (msg) | Tone chips after Send at 40% | 2.06 / 2.77 | Fixed. On Send the tone row fades to 0 and goes inert (keeps its space, so nothing jumps); on Undo it comes back at full | gone; back at 8.96 / 10.87 |
| T6 | S-RUN.ask-plan, ask-qual | Disabled primary at 0.45 | 1.01 / 3.99 | Fixed. Disabled = `--ch-well-bg-flat` fill, `--ch-text-tertiary` label, no fade, no shadow | 6.06 / 7.41 |
| T7 | S-TASK.*, S-RUN.ask-*, S-RCPT.failed | Primary label on the old gradient's top stop | 5.96 / 4.28 | Fixed 3 Nov: flat `--ch-accent` (SHARED-2) | 8.01 / 5.58 |
| T8 | S-TASK.*, S-RCPT.told | Coin initials, Sophomore: white on `--ch-yr-so` | 5.26 / 4.73 | Fixed. Dark `--ch-yr-so` #88692e | 5.26 / 5.11 |
| T9 | S-RCPT.failed | Chip "Not saved": `--ch-loss` on `--ch-loss-tint` over card | 4.85 / 6.76 | Fixed. Light `--ch-loss-tint` rgb(154 87 0 / 0.08) | 4.99 / 6.76 |

### Glyphs and rings (all fixed, or no fix needed)

| # | Screen | Pair | Was L / D | Fix on the page and in the build | Now L / D |
|---|---|---|---|---|---|
| G1 | S-TASK.qual | Coach-pick seat ring, champagne on accent tint | 1.23 / 7.57 | Fixed. New `--ch-champagne-ink` light #725b2c, dark #cdbb8e | 5.03 / 7.57 |
| G2 | S-KEY (desktop) | Key flag on the light glass bar | 1.49 / 9.43 | Fixed. `--ch-champagne-ink` on desktop; the phone flag keeps `--ch-champagne-300` on the green bar (8.85 / 9.87) | 6.12 / 9.43 |
| G3 | S-PANEL | Phone grab bar at 35% | 1.69 / 2.00 | Fixed. `--ch-text-tertiary` at 100% | 6.39 / 7.00 |
| G4 | S-TASK.plan.new-folder | Name field ring at 45% | 2.17 / 2.81 | Fixed. `--ch-accent-text` at 100%, 2pt | 7.48 / 8.96 |
| G5 | S-TASK.* building | "Being written" ring at 45% | 2.22 / 2.78 | Fixed. `--ch-accent-text` at 100%, 2pt | 8.15 / 8.45 |
| G6 | S-TASK.cal | Week strip event dots at 55% | 2.44 / 3.06 | Fixed. `--ch-text-tertiary` at 100% | 6.61 / 6.99 |
| G7 | S-RCPT.plan | Folder outline at 55% | 2.66 / 3.57 | Fixed. `--ch-accent-text` at 100%, 1.2pt | 7.48 / 8.96 |
| G8 | S-TASK.msg | Draft bubble outline at 55% | 2.74 / 3.49 | Fixed. `--ch-accent-text` at 100%, 1.5pt inset | 8.15 / 8.45 |
| G9 | S-RCPT.told (msg) | "Seen" dot, `--ch-accent` on the dark well | 7.48 / 2.77 | Fixed. `--ch-accent-text` | 7.48 / 8.96 |
| G10 | S-RCPT.qual | Older qualifier row icon at 60% | 2.84 / 3.77 | Fixed. Full opacity; its "Finished" line says it is old | 6.40 / 7.17 |
| G11 | S-RCPT.plan | Folder body fills vs well | 1.34 / 1.25 | None needed: illustration fill; the outline (G7) is the edge that holds 3:1 | n/a |
| G12 | S-KEY | Key "on" disc vs the bar | 1.57 / 1.53 | None needed: decorative; "open" is carried by the panel and `aria-expanded`. The mark on the disc holds 5.91 / 7.93 | n/a |
| G13 | S-PANEL | Panel fill vs page | 1.09 / 1.11 | None needed: not a text pair; the edge is the 0.5pt ring, the two-layer shadow and the lit top rim | n/a |
| G14 | S-PANEL.composer | Send arrow on the old gradient's top stop | 5.67 / 4.10 | Fixed 3 Nov: flat `--ch-accent` | 8.01 / 5.58 |
| G15 | S-PANEL.hello | Qualifier tile icon, `--ch-yr-so` on its tint | 4.37 / 6.34 | Fixed. Tiles no longer use year colours: every icon is `--ch-accent-text` on `mix(accent-text 13%, tile)` | 6.55 / 6.20 |
| G16 | S-TASK.busy | Sweep rgb(244 241 232 / 0.75) on accent | 4.87 / 3.98 | Fixed. Alpha 0.9 | 6.24 / 4.98 |
| G17 | S-RCPT.failed | Amber alert glyph on loss tint | 4.85 / 6.76 | Fixed, follows T9 | 4.99 / 6.76 |

Everything else in this file is 4.9:1 or more in both themes.

---

## Page cascade conflicts (read before building)

On the 3 Nov page some values rendered differently from what the rules meant, because an older rule won the cascade. `fix06.py` fixes C1 to C5 and C10 on the page and makes C6 and C8 match the written values. C7, C9 and C11 stay as rendered: build the rendered value.

| # | Where | Now on the page (build this) | Was | Fix |
|---|---|---|---|---|
| C1 fixed | Start tile arrow | 15pt ↗ arrow, `--ch-text-tertiary`, absolute top 12 right 12, stroke 2.2 | a 22pt → arrow in the tile's flow | the duplicate `I.arrow` key is removed |
| C2 fixed | Qualifier landed rows (`.qlist .r`) | 52pt grid rows `32 / 1fr / auto`, gap 12, hairline from x 56 | stacked, no separator | `.qlist .r` gets its own grid and hairline |
| C3 fixed | Message thread header coins | white 700 initials | `--ch-text-secondary` 400 initials | the header's count rule is scoped to `> span:not(.coins)` |
| C4 fixed | Panel header Helm mark (and the desktop sidebar mark) | line mark in #f4eedd: wheel stroke 1.7, ball filled | a black filled disc | wheel and ball rules also cover `.qc__mark` and `.dside__brand` |
| C5 fixed | Confirm footer and folder menu | footer absent until the card settles; menu absent when closed | shown while building; an empty 8pt well | `.task__f[hidden]` and `.fmenu[hidden]` get `display:none !important` |
| C6 fixed | Greeting sub line | 14.5/19.6 400, margin −8 0 0 (6pt under the greeting in the 14 stack) | 15/21, margin 0 0 12 | selector raised to `.hello .hello__s` |
| C7 | Plan block titles | `--ch-text-secondary` (inherited) | same | build rendered; flag to design (likely meant `--ch-text-primary`) |
| C8 fixed | Context line gap | 6pt between dot and text | 5pt | selector raised to `.qc__ttl .qc__ctx` |
| C9 | Panel top | 104, 6pt under the 98pt bar | same (prose says 12) | build 6pt as rendered |
| C10 fixed | Stop button | no shadow | kept the send button's green shadow | `.cmp__send.stop` resets `box-shadow` |
| C11 | Busy primary | radius 12 | same (prose says capsule) | build radius 12 as rendered |

---

## Token table

Every `--a-*` token on the page, its light and dark value, and the app token to use. "DL" means the token is defined in `DESIGN_LANGUAGE.md` §3 or its "Adopted" log but is not yet in `tokens.css` at 75b4956; the nearest existing token is named so the builder can see the gap.

| Page token | Light | Dark | App token | Note |
|---|---|---|---|---|
| `--a-page` | #f2f0e9 | #0e120f | `--ch-grouped-bg` (DL) | nearest today `--ch-bg-page` #ebe7dc / #111512 |
| `--a-card` | #fffefb | #191e1a | `--ch-card-bg` (DL) | nearest `--ch-bg-surface` #fcfaf5 / #1b201c |
| `--a-well` | #f6f4ee | #141815 | `--ch-well-bg-flat` (DL) | nearest `--ch-bg-subtle` #f5f2ea / #181d19 |
| `--a-ink` | #1c1b18 | #f1ecdf | `--ch-text-primary` | exact (ink-900) |
| `--a-ink-2` | #46433d | #d0c9b8 | `--ch-text-secondary` (DL value) | today that token is ink-700; the exact value is `--ch-ink-600` in both themes |
| `--a-ink-3` | #5f5c55 | #ada697 | `--ch-text-tertiary` (DL value) | `--ch-ink-500` light exact; dark ink-500 is #bab3a4 |
| `--a-accent` | #155a39 | #1f6b45 | `--ch-accent` | light exact; app dark is #23704a (ivory on it 5.20, passes) |
| `--a-accent-ink` | #fdfcf8 | #f4eedd | `--ch-text-on-accent` | app light is #ffffff (8.30 on accent); dark exact |
| `--a-accent-text` | #155a39 | #7cc79b | new `--ch-accent-text` | DL `--ch-accent` values; today light `--ch-green-600`, dark green-600 is #6bbb8c; nearest dark `--ch-hero-mint-strong` #7bc79a |
| `--a-tint` | rgb(21 90 57 / 0.1) | rgb(124 199 155 / 0.12) | new `--ch-accent-tint` | nearest `--ch-focus-halo` rgb(21 90 57 / 0.13) |
| `--a-gain` | #14613d | #7cc79b | `--ch-gain` (DL) | not used on this page |
| `--a-loss` | #9a5700 | #e7ae57 | `--ch-loss` (DL) | nearest `--ch-warning-600` #8a5a0c / #e3a94f |
| `--a-loss-tint` | rgb(154 87 0 / 0.08) | rgb(231 174 87 / 0.12) | new `--ch-loss-tint` | light 0.08 (T9, was 0.1) |
| `--a-sep` | rgb(28 27 24 / 0.1) | rgb(241 236 223 / 0.1) | `--ch-separator` (DL) | nearest `--ch-border-hairline` |
| `--a-ring` | rgb(28 27 24 / 0.07) | rgb(255 255 255 / 0.06) | `--ch-card-ring` (DL) | nearest `--ch-edge` rgb(28 25 18 / 0.08) |
| `--a-shadow` | 0 1px 2px rgb(28 25 18/.05), 0 8px 20px −12px rgb(28 25 18/.12) | 0 1px 0 rgb(255 255 255/.04) inset | DL card shadow | nearest `--ch-elevation-card` |
| `--a-shadow-pop` | v1 panel shadow | v1 | none | overridden in Glass; don't build |
| `--a-frame` | #0a331f | #08150e | `--ch-frame` | exact |
| `--a-frame-ink` | #f4eedd | #f4eedd | `--ch-on-green-ink` | exact |
| `--a-frame-icon` | rgb(240 233 214 / 0.86) | same | `--ch-on-green-ink-soft` | exact |
| `--a-champ` | #dccda6 | #cdbb8e | `--ch-champagne-300` | exact; on the green bar only |
| `--a-champ-ink` | #725b2c | #cdbb8e | new `--ch-champagne-ink` | champagne marks on light surfaces: pick seat ring, desktop flag (G1, G2) |
| `--a-skel` | #ebe7dd | #232a25 | `--ch-skel-base` | app #e2dbca / #252c26; use the app token |
| `--a-scrim` | rgb(14 18 15 / 0.16) | rgb(0 0 0 / 0.4) | none | overridden by `--a-veil` in Glass; don't build |
| `--a-glass` | rgb(253 251 247 / 0.78) | rgb(22 27 23 / 0.74) | `--ch-glass-bg` | desktop bar only, which is today's shell; app light is rgb(250 248 241 / 0.7). Keep the app's bar |
| `--a-yr-sr` | #1f6b45 | #2a7a51 | `--ch-yr-sr` (DL) | coins only (year colours mark players, nothing else) |
| `--a-yr-jr` | #3d6787 | #46739a | `--ch-yr-jr` (DL) | |
| `--a-yr-so` | #86672c | #88692e | `--ch-yr-so` (DL) | dark #88692e (T8, was #8f6e31; DESIGN_LANGUAGE lists #8f6e31 at 4.7, so update DL too) |
| `--a-yr-fr` | #9a4a35 | #a3533e | `--ch-yr-fr` (DL) | |
| `--a-block` | #1f6b45 | #4fa877 | new `--ch-event-new-bg` | = DL chart gain fill; app `--ch-chart-gain-fill` dark is #2a7d53 |
| `--a-block-ink` | #f4f1e8 | #0e120f | new `--ch-event-new-ink` | light = `--ch-on-green-plate` |
| `--a-block-2` | #6b675f | #a39d90 | none | not used |
| `--a-seg1` | #155a39 | #4fa877 | new `--ch-plan-seg-1` | accent, strongest; white label 8.22, dark label 6.47 |
| `--a-seg2` | #23704a | #7cc79b | new `--ch-plan-seg-2` | accent, middle; 6.02 / 9.44 |
| `--a-seg3` | #2f7d55 | #9dd6b4 | new `--ch-plan-seg-3` | accent, lightest; 5.02 / 11.43. Was jr and so year colours |
| `--a-pglass` | rgb(253 252 248 / 0.84) | rgb(27 32 28 / 0.84) | new `--ch-panel-glass-bg` | composite on page: #fbfaf6 / #191e1a; frame, header and composer zone only |
| `--a-pglass-hi` | rgb(255 255 255 / 0.7) | rgb(255 255 255 / 0.07) | new `--ch-panel-glass-rim` | inset 0 1px 0 |
| `--a-veil` | rgb(242 240 233 / 0.42) | rgb(14 18 15 / 0.5) | new `--ch-panel-veil` | nearest `--ch-scrim` (darker; not this look) |
| `--a-veil-dark` | rgb(14 18 15 / 0.2) | rgb(0 0 0 / 0.45) | none | not used |
| `--a-pshadow` | 0 0 0 .5px rgb(28 25 18/.12), 0 36px 72px −26px rgb(28 25 18/.4), 0 12px 28px −12px rgb(28 25 18/.18) | ring rgb(237 231 216/.14), drops rgb(0 0 0/.85) and /.5 | new `--ch-elevation-panel` | |
| `--a-tile` | #fffefb | #1f2520 | new `--ch-tile-bg` | light = card; dark one step up (nearest `--ch-bg-elevated` #232925) |
| `--a-tile-ring` | rgb(28 27 24 / 0.07) | rgb(255 255 255 / 0.06) | `--ch-card-ring` (DL) | same values |

Raw colours the page writes without a token:

| Value | Where | App token |
|---|---|---|
| #06231a | live pill fill (both themes) | new `--ch-live-bg` (nearest `--ch-forest-900` #082b1c light) |
| rgb(220 205 166 / 0.28) | live pill ring | new `--ch-live-ring` (nearest `--ch-champagne-rule`) |
| rgb(244 238 221 / 0.16) | key "on" disc | new `--ch-on-green-disc` |
| #0b3a25 | bell badge ink, live check ink | `--ch-green-800` light value in both themes; new `--ch-on-champagne-ink` |
| #7cc79b | live "done" disc | `--ch-hero-mint-strong` (#7bc79a) |
| #155a39 | header mark tile, flat in both themes (was a radial gradient; flattened for SHARED-2) | `--ch-accent` light value, used in both themes; new `--ch-mark-tile` if dark must not follow `--ch-accent` (ivory mark 7.10:1) |
| rgb(28 25 18 / 0.05) / rgb(255 255 255 / 0.07) | header round buttons | new `--ch-panel-btn-bg` |
| rgb(244 241 232 / 0.9) | busy sweep | new `--ch-busy-sweep` (G16, was 0.75) |
| #ffffff / #0e120f | plan bar labels; coin initials (#fff both) | `--ch-on-fill-0` light; dark label `--ch-grouped-bg` dark |

Type map (page values to the nearest app role; where the line-height differs, override it):

| Page | App token | Override |
|---|---|---|
| 24/27.6 600 −0.025em | `--ch-type-22-strong` is 22/28 | new `--ch-type-24-strong` 24/27.6 |
| 17/20.4 600 −0.01em | `--ch-type-17-strong` 17/22 | line-height 1.2 |
| 17/21.25 600 | `--ch-type-card-title` 17/22 | line-height 1.25 |
| 16/20.8 400 and 600 | `--ch-type-16` / `-strong` 16/21 | none (within 0.2) |
| 15.5/20.9 and 15.5/22.5 400 | none | new `--ch-type-chat` 15.5 with 1.35 (bubble) and 1.45 (line) |
| 15/19.5 400 and 500, 15/18.75 600 | `--ch-type-15` family 15/20 | 1.3 or 1.25 as given |
| 14.5/14.5 600, 14.5/18.1 500 | none | new `--ch-type-14h` 14.5 |
| 14/18.9 400, 14/14 500 | `--ch-type-14` 14/19 | 1.0 for pills |
| 13.5/18.2 400, 13.5/13.5 600 | none | new 13.5 role |
| 13/16.9 400, 13/13 500 | `--ch-type-13` 13/18 | as given |
| 13/13 500 and 600, 13/16.25 400 (meta, was 11.5 to 12.5) | `--ch-type-13` 13/18 | line-height as given; nothing in the panel is under 13 except coin initials and key caps |
| 9.5/9.5 700 ×k (coins), 10/10 700 ×k ("+N"), 10.5/17 700 ×k (badge), 11/11 500 mono ×k (kbd) | none | scale with Text Size (were fixed px) |

---

## S-KEY

The Helm key in the green bar's actions slot (phone `.gbar`) and in the desktop glass bar (`.dbar`). Replaces today's sparkle `AskSheetButton`. The bar itself is SHARED-1 and unchanged; its rows here are for reference only.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Phone bar (ref) | full width, 98 tall, padding 54 8 0 16, row gap 4 | — | `--ch-frame` #0a331f / #08150e | — | — | — | — |
| Bar title (ref) | hug, flex 1 | 18/21.6 600 ×k, nowrap | `--ch-on-green-ink` #f4eedd / #f4eedd | 12.03 / 16.12 | chevron 14, stroke 2.4, opacity 0.86; dot 7 `--ch-champagne-300` | today's | section name |
| Key slot | 44×44, in the row before the bell; right edge 56 from the screen edge (x 290 to 334 at 390), y 54 to 98 | — | none (no fill at rest) | — | — | 44×44 | — |
| Key mark | 24×24 centred | — | `--ch-on-green-ink-soft` rgb(240 233 214 / 0.86) / same | 8.88 / 11.52 | Helm line mark: wheel circle r 8.2 + 8 spokes, stroke 1.7 round; ball r 4.6 filled | in slot | — |
| On disc | inset 4 (36×36), radius 18 | — | rgb(244 238 221 / 0.16) over frame = #2f513d / #2e382f | disc vs bar 1.57 / 1.53 (G12); mark on disc 5.91 / 7.93 | — | — | shown while the panel is open (`aria-expanded="true"`) |
| Flag | 9×9 circle at top 7 right 7, ring 2 in the bar colour | — | `--ch-champagne-300` #dccda6 / #cdbb8e | 8.85 / 9.87 | — | — | a task waits on the coach with the panel closed |
| Working | wheel turns, ball still | — | as mark | as mark | — | — | a step runs with the panel open (not triggered on the page) |
| Bell (ref) | 44×44, right 8 | — | `--ch-on-green-ink-soft` | 8.88 / 11.52 | bell 22, stroke 1.8 | 44 | count |
| Bell badge (ref) | min 17×17, padding 0 4, top 6 right 5, radius 999 | 10.5/17 700 ×k | `--ch-champagne-300` fill, #0b3a25 text | 8.10 / 6.74 | — | — | unread count |
| Desktop bar (ref) | 56 tall, padding 0 12 0 24, gap 8, glass `--ch-glass-bg` + blur 24 saturate 170%, bottom 0.5 `--ch-separator` | crumb 15/15 600; "Team · " 400 | `--ch-text-primary` / `--ch-text-secondary` on #fbf9f4 / #141915 | 16.31 / 15.13; 9.34 / 10.82 | — | — | — |
| Desktop key | 44×44 slot, radius 10, between the 240 search pill and the bell (each gap 8); x 1127 to 1171, y 6 to 50 in the bar | — | mark `--ch-accent-text` #155a39 / #7cc79b | 7.79 / 8.92 | same mark, 24 | 44×44 | — |
| Desktop on disc | inset 3 (38×38 face), radius 10 | — | `--ch-accent-tint` over the bar = #e4e9e1 / #202e25 | mark on it 6.66 / 7.12 | — | — | open |
| Desktop flag | 9×9 at top 8 right 8 of the slot (5/5 of the face), ring 2 `--ch-grouped-bg` | — | `--ch-champagne-ink` #725b2c / #cdbb8e | 6.12 / 9.43 (G2) | — | — | as phone |

Redlines:
- Phone key: 44×44, right edge 56pt from the screen edge, 4pt from the bell, vertical centre 76pt from the top of the screen.
- Mark 24pt, stroke 1.7, ball radius 4.6.
- Disc 36pt (inset 4), radius 18, only when open.
- Flag 9pt at 7/7 from the key's top right, 2pt bar-colour ring.
- Desktop key slot 44×44 with a 38×38 face (disc inset 3), radius 10, 8pt left of the bell.
- The bar band above y 98 is pixel-identical to main except the key's 44pt slot (SHARED-1).

## S-LIVE

The key grows left into a capsule while a task runs with the panel closed.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Pill | height 36, radius 18, padding 0 12 0 10, gap 8; right edge = key slot's right edge; vertically centred on the key; width hugs | — | `--ch-live-bg` #06231a both; inset 1 ring `--ch-live-ring` rgb(220 205 166 / 0.28) | — | — | 36 tall, 44 with the transparent pad | — |
| Label | one line, nowrap | 13.5/13.5 600 ×k | `--ch-on-green-ink` #f4eedd | 14.35 / 14.35 | — | in pill | the running step label, "Needs your OK", "Added" / "Sent" / "Set" / "Saved", "Didn't go through" (03 §4) |
| Label overflow | not drawn on the page (the long step label runs over the bar title) | — | — | — | — | — | build rule from 05: max 172pt phone, 260 desktop, ellipsis; never covers the title |
| Icon slot | 18×18 | — | — | — | — | — | — |
| Work spinner | 16×16 circle, 2pt border | — | track rgb(244 238 221 / 0.25), head #f4eedd | head 14.35 | — | — | running |
| Wait dot | 9×9 | — | `--ch-champagne-300` | 10.55 / 8.78 | — | — | needs the coach |
| Done disc | 18×18 circle | — | #7cc79b, check #0b3a25 | disc 8.31; check 6.38 | check 11, stroke 3.2 | — | committed |
| Desktop pill | height 34, no ring | 13.5 600 | `--ch-accent` fill, `--ch-text-on-accent` | 8.01 / 5.58 | same | 34 tall, 44 with the pad | same |

Redlines:
- Pill height 36 (desktop 34), radius 18.
- Left padding 10, right 12, icon 18, gap 8.
- Right edge aligned to the key slot's right edge; centre on the key's centre line.
- Label 13.5pt semibold, one line.
- The key is hidden (visibility) while the pill shows.

## S-PANEL

The Glass frame, its scrim and its header. Fixed size: the panel never animates its height.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Scrim (phone) | inset 98 0 0 (under the bar only; the bar stays undimmed), z under the bar | — | `--ch-panel-veil` rgb(242 240 233 / 0.42) / rgb(14 18 15 / 0.5), veil only, no backdrop blur | — | — | whole area; tap closes | — |
| Scrim (desktop) | none drawn | — | — | — | — | click outside closes | — |
| Panel, phone | left 10, right 10 (370 wide at 390, 410 at 430), top 104, height 700, radius 32, overflow hidden, column | — | `--ch-panel-glass-bg` rgb(253 252 248 / 0.84) / rgb(27 32 28 / 0.84), backdrop blur 30 saturate 180%; = #fbfaf6 / #191e1a on the page | fill vs page 1.09 / 1.11 (G13) | — | — | — |
| Panel, desktop | width 432, right 14, top 62 inside the workspace (6 under the 56 bar), height 640, radius 26 | — | same | same | — | — | — |
| Rim and shadow | inset 0 1px 0 `--ch-panel-glass-rim`; ring 0.5 rgb(28 25 18 / 0.12); 0 36 72 −26 rgb(28 25 18 / 0.4); 0 12 28 −12 rgb(28 25 18 / 0.18) | — | `--ch-elevation-panel` (dark: ring rgb(237 231 216 / 0.14), drops black 0.85 / 0.5) | — | — | — | — |
| Reduce Transparency | not drawn | — | build rule: the app's Reduce Transparency block (tokens.css 1202) turns glass opaque; panel fill becomes `--ch-card-bg`, no blur | as card | — | — | — |
| Header | full width, padding 18 14 12 20, gap 12, row centred; 69 tall (18 + 39 + 12) | — | none (on the frame) | — | — | — | — |
| Mark tile | 36×36, radius 12; inset 0 1 0 rgb(255 255 255 / 0.18); drop 0 4 10 −4 rgb(11 58 37 / 0.5) | — | flat #155a39 in both themes (SHARED-2) | ivory mark #f4eedd on #155a39 7.10 / 7.10 | Helm mark 22, #f4eedd, wheel stroke 1.7, ball filled (C4) | — | — |
| Title | flex 1, column, gap 1 | "CoachHelm" 17/20.4 600 −0.01em ×k | `--ch-text-primary` on the fill | 16.50 / 14.37 | — | — | fixed |
| Context line | margin-top 2, one line, ellipsis | 13/15.6 400 ×k | `--ch-text-secondary` | 9.44 / 10.27 | live dot 6×6 `--ch-accent-text` with a 3pt `--ch-accent-tint` halo, gap 6 (C8): dot 7.88 / 8.47 | — | `lookingAt()`: "Looking at Calendar · week of 3 Nov" (03 §1) |
| Expand button | 34×34 circle | — | `--ch-panel-btn-bg` rgb(28 25 18 / 0.05) / rgb(255 255 255 / 0.07) | icon 8.55 / 8.42 | expand 16, stroke 2.1, `--ch-text-secondary` | 34 drawn, 44 with the pad | opens the full chat (S-PANEL.full) |
| Close button | 34×34, 12 right of expand, 14 from the panel edge | — | same | 8.55 / 8.42 | × 16, stroke 2.1 | same | — |
| Grab bar (phone) | 36×5, radius 3, centred, at the panel's foot: 8 from the bottom edge, under the composer | — | `--ch-text-tertiary` (G3) | 6.39 / 7.00 | — | swipe zone: the bottom 21pt, full width | — |
| Body sheet | the scrolling body: 6 in from the frame's sides (358 wide at 390, 420 desktop), radius 20, padding 14 14 16, between the header and the composer zone | — | `--ch-card-bg` #fffefb / #191e1a, ring 0.5 `--ch-card-ring`; solid, no blur | text on it as listed per screen (`--ch-text-primary` 17.08 / 14.34) | — | — | everything that scrolls |
| Mid-open over the bar | the panel crosses the bar only while it scales out of the key | — | fill over the frame #d6dcd5 / #181e1a | title 12.34 / 14.34; context 7.06 / 10.25 | — | — | — |

Inner layout (phone): header 69, body sheet = 700 − 69 − composer 66 − grab 13 = 552, scrolls. Desktop: header 69, composer 87 (with the 13pt hint row), body sheet 484. Content inside the sheet keeps the old 20pt inset from the frame (6 + 14).

Redlines:
- Phone panel 10pt from each side, top 104, height 700, radius 32.
- Desktop panel 432 wide, 14 from the workspace's right edge, top 62, height 640, radius 26.
- Header padding 18 top, 20 left, 14 right; mark tile 36, radius 12.
- Header buttons 34pt circles, 12 apart, 14 from the right edge; 44pt hit pads.
- Body sheet 6pt in from both sides, radius 20, solid card colour.
- Grab bar 36×5 at 8pt above the panel's bottom edge.
- Scrim starts at y 98; the bar above it is not dimmed; no blur.

## S-PANEL.hello

Inside the body sheet before a request. Sheet padding 14 14 16 at 6 from the frame (content 330 wide at 390, 392 on desktop); stack gap 14.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Greeting | margin-top 4 (+14 sheet, +2 block): top 89 from the panel top; balance wrap | 24/27.6 600 −0.025em ×k | `--ch-text-primary` on the sheet | 17.08 / 14.34 | — | — | fixed: "What should we get done?" |
| Sub line | 6 below the greeting (14 gap, margin −8; C6) | 14.5/19.6 400 ×k | `--ch-text-secondary` | 9.77 / 10.25 | — | — | fixed: "You confirm everything before it happens." |
| Tile grid | 2 columns, gap 10; tile 160 wide at 390 (191 desktop); starts 14 under the sub line | — | — | — | — | — | — |
| Tile | min 104 tall, hugs (about 109 with a one-line line, 126 with two), padding 12 12 13, radius 16, column gap 3 | — | `--ch-tile-bg` #fffefb / #1f2520; ring 1 `--ch-card-ring`; 0 1 2 rgb(28 25 18/.04), 0 8 18 −12 rgb(28 25 18/.18) | — | — | whole tile (≥104×160) | `quickStarts(pathname)` (03 §1) |
| Tile icon square | 34×34, radius 11, margin-bottom 8 | — | every tile the same accent tint: fill `mix(--ch-accent-text 13%, tile)` = #e0e7e0 / #2a372e; inset ring `mix(--ch-accent-text 18%, transparent)`; glyph `--ch-accent-text`. No year colours; the icons tell the tiles apart | 6.55 / 6.20 (G15) | calendar, bubble, flag, clipboard; 18, stroke 2 | — | — |
| Tile arrow | absolute top 12 right 12, 15×15, out of the flow (C1) | — | `--ch-text-tertiary` | 6.61 / 6.46 | ↗ arrow, stroke 2.2 | — | — |
| Tile title | 2 lines then ellipsis (05) | 15/18.75 600 ×k | `--ch-text-primary` | 17.08 / 13.25 | — | — | "Add a practice", "Message the travel squad", "Set the fall qualifier", "Make a practice plan" |
| Tile line | 1 line, ellipsis (05) | 13/16.9 400 ×k | `--ch-text-secondary` | 9.77 / 9.47 | — | — | names a real object on the screen: "Thursday at 3, at the range", "Friday's bus time", "3 rounds next week", "It asks what you want first" |
| "Earlier today" label | padding-left 2; 6 above the row | 13/13 500 ×k | `--ch-text-secondary` on the sheet | 9.77 / 10.25 | — | — | fixed |
| Earlier row | grid 26 / 1fr / auto, gap 10, padding 10 12, radius 14 | — | `--ch-tile-bg`, ring 1 `--ch-card-ring` | — | — | row is not a button on the page; if it opens the thread, 44+ tall already (≈54) | latest `data-action-receipt` today (03 §1) |
| Row check disc | 24×24 circle | — | `--ch-accent-tint` over tile, glyph `--ch-accent-text` | 6.96 / 6.13 | check 12, stroke 3 | — | — |
| Row title | 1 line | 14.5/18.1 500 ×k | `--ch-text-primary` | 17.08 / 13.25 | — | — | receipt title, "Moved Team lift to 2:00 PM" |
| Row line | 1 line | 13/16.9 400 ×k | `--ch-text-secondary` | 9.77 / 9.47 | — | — | date and audience: "Mon 3 Nov · 11 players told" (03) |
| Row time | right | 13/13 400 ×k, tabular | `--ch-text-tertiary` (timestamp) | 6.61 / 6.46 | — | — | receipt time, team zone, "9:12 AM" |

Redlines:
- Greeting top 89pt below the panel's top edge; 24pt semibold, on the solid sheet.
- Sub line 6pt below the greeting; tiles 14pt below the sub line.
- Tiles 160pt wide at 390, gap 10 both ways, radius 16, min height 104; all icon squares the same green tint.
- Icon square 34pt, radius 11, 8pt above the title.
- Arrow 15pt at 12/12 from the tile's top right (not in the flow; C1).
- "Earlier today" row radius 14, padding 10/12, disc 24.

## S-PANEL.composer

The Messages-style pill at the panel's foot. No hairline above it; it sits on the frame.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Composer zone | padding 6 12 14 | — | none | — | — | — | — |
| Pill | full width (346 at 390), 46 tall at one line, padding 5, gap 4, radius 26, centred row | — | `--ch-tile-bg`; ring 0.5 rgb(28 25 18 / 0.12), 0 8 22 −8 rgb(28 25 18 / 0.22), 0 2 5 rgb(28 25 18 / 0.06); dark ring rgb(237 231 216 / 0.14), drop rgb(0 0 0 / 0.6) | — | — | — | — |
| + button | 36×36 circle | — | `--ch-well-bg-flat`, glyph `--ch-text-secondary` | 8.96 / 10.87 | plus 18, stroke 2 | 36 drawn, 44 with the pad | attach |
| Field | flex 1, min 34 tall, padding 8 4 7; grows to 4 lines then scrolls (05) | 16/20.8 400 ×k | text `--ch-text-primary`; placeholder `--ch-text-tertiary` | 17.08 / 13.25; placeholder 6.61 / 6.46 | — | full field | placeholder "Ask CoachHelm or tell it what to do" |
| Mic | 36×36, no fill | — | glyph `--ch-text-tertiary` | 6.61 / 6.46 | mic 18, stroke 2 | 36 drawn, 44 with the pad | dictate |
| Send, on | 36×36 circle; inset 0 1 0 rgb(255 255 255 / 0.2) lit top edge, 0 2 6 −2 rgb(11 58 37 / 0.5) | — | flat `--ch-accent` (SHARED-2); glyph `--ch-text-on-accent` | 8.01 / 5.58 | arrow up 17, stroke 2.5 | 36 drawn, 44 with the pad | — |
| Send, off | same box, no shadow | — | `--ch-well-bg-flat`, glyph `--ch-text-tertiary` | 6.06 / 7.41 | same | — | no text |
| Stop | same box, no shadow (C10) | — | fill `--ch-text-primary`, square `--ch-card-bg` | 17.08 / 14.34 | square 11×11, radius 3 | 36 drawn, 44 with the pad | shown the whole time steps run |
| Hint row (desktop only) | padding-top 8, centred, gap 14 | 13/13 400 ×k | `--ch-text-secondary` on the frame | 9.44 / 10.27 | — | — | "⌘J open", "esc close", "Saved in CoachHelm" |
| Key caps | padding 2 5, radius 5, inset 0 −1 0 `--ch-separator` | 11/11 500 mono ×k | `--ch-text-secondary` on `--ch-well-bg-flat` | 8.96 / 10.87 | — | — | — |
| Offline line | not drawn | — | build rule from 05: one line above the pill, amber glyph, `--ch-text-secondary` | — | alert | — | "You're offline. CoachHelm will send when you're back." |

Redlines:
- Pill 46pt tall at one line, radius 26, 12pt from the panel's sides, 14pt above the grab zone.
- Buttons 36pt circles; field text 16pt.
- Phone: no hint row. Desktop: hint row 8pt under the pill, 13pt secondary ink.
- Buttons draw at 36 and hit at 44.
- Send off is the well colour with a tertiary arrow; on is solid accent.

## S-RUN.request

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Coach bubble | align right, max 84% of the sheet's content width (277 at 390), padding 9 14, radius 19 19 6 19 | 15.5/20.9 400 ×k; wraps, no max lines | `--ch-accent` fill, `--ch-text-on-accent` | 8.01 / 5.58 | — | — | the coach's words, verbatim; or the answers line after an ask |
| CoachHelm line | full body width, margin 0 | 15.5/22.5 400 ×k | `--ch-text-primary` on the sheet | 17.08 / 14.34 | — | — | the reply: "Thursday's lift ends at 2:45, so 3:00 is clear. Here's the practice." |
| Gap | 14 between all body items | — | — | — | — | — | — |

Redlines:
- Bubble right edge flush with the sheet's content edge (14pt inside the sheet, 20pt from the panel edge).
- Bubble radius 19 with the bottom right at 6.
- Bubble padding 9/14, 15.5pt text.
- 14pt between the bubble, the steps and the reply line.

## S-RUN.steps

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| List | padding 2 0, row gap 2 | — | none (on the sheet) | — | — | — | announced steps (03 §2) |
| Step row | grid 20 / 1fr, gap 10, min 32 tall, centred | 15/19.5 400 ×k; 2 lines then ellipsis (05) | active `--ch-text-primary`; done `--ch-text-secondary` | active 17.08 / 14.34; done 9.77 / 10.25 | — | — | present tense while running ("Checking Thursday on the team calendar"); past tense plus one fact when done ("Checked Thursday · lift ends at 2:45") |
| Active dot | 8×8 in the 20 slot, breathing | — | `--ch-accent-text` | 8.15 / 8.45 | — | — | — |
| Done check | 16×16 | — | `--ch-accent-text` | 8.15 / 8.45 | check path, stroke 2.6 round | — | — |
| Failed glyph | 16×16 (rule exists, not triggered on the page) | — | `--ch-loss` | 5.57 / 8.53 | check stroke in amber; build an alert glyph | — | "Couldn't read the calendar" (05) |
| Shimmer | over the active label, band 45% wide; 1.9s loop | — | linear sheen transparent → `mix(--ch-card-bg 62%, transparent)` → transparent; the accepted gradient use (SHARED-2), a moving highlight, not a surface | — | — | — | loop stops under Reduce Motion (SHARED-6) |
| Folded summary | hug, padding 5 10 5 8, radius 999, gap 6; 23 tall | 13/13 500 ×k | `--ch-well-bg-flat`, text `--ch-text-secondary` | 8.96 / 10.87 | check 13, stroke 2.6, `--ch-accent-text` 7.48 / 8.96 | 23 drawn, 44 with the pad | "3 steps · 2s" (03 §2) |

Redlines:
- Row height 32, glyph slot 20, 10pt to the label.
- Dot 8pt; check 16pt at stroke 2.6.
- Rows 2pt apart.
- Summary pill 23pt tall, radius full, left aligned.

## S-RUN.ask-plan

The question card shown after the first read step of a plan request.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Card | full sheet content width, padding 14, gap 12, radius 16 | — | `--ch-card-bg`; ring 1 `--ch-card-ring`; 0 10 24 −14 rgb(28 25 18 / 0.2) | — | — | — | the flow's ASK fields (TF §5.15) |
| Question | margin 0 | 16/20.8 600 ×k | `--ch-text-primary` | 17.08 / 14.34 | — | — | "What should Tuesday cover?" |
| Reason | 2 below the question | 13.5/18.2 400 ×k | `--ch-text-secondary` | 9.77 / 10.25 | — | — | "Pick what fits. Anything you already said is ticked." |
| Group | gap 6 | label 13.5/16.2 400 ×k | `--ch-text-secondary` | 9.77 / 10.25 | — | — | How long; Work on; Who |
| Option pill | min 36 tall, padding 0 13, radius 999, wrap gap 6 | 14/14 500 ×k | `--ch-well-bg-flat`, inset 1 `--ch-separator`, text `--ch-text-primary` | 15.66 / 15.20 | — | 36 drawn, 44 with the pad (pads of neighbours overlap; the later one wins) | 60 min / 90 min / 2 hours; Putting / Wedges / Driving / On course (several); Everyone / Travel squad / Pick players |
| Option, picked | same | same | `--ch-accent`, `--ch-text-on-accent`, no ring | 8.01 / 5.58 | — | — | pre-ticked from the coach's words |
| Build button | full width, min 44, radius 12 | 15/15 600 ×k | see S-TASK primary; disabled build rule T6 | enabled 8.01 / 5.58; disabled `--ch-well-bg-flat`, `--ch-text-tertiary`, no shadow 6.06 / 7.41 (T6) | — | 44 | "Build the plan" |
| Answer bubble | as S-RUN.request | | | 8.01 / 5.58 | — | — | "90 min · putting, wedges, on course · everyone" |

Redlines:
- Card padding 14, radius 16, 12 between groups.
- Pills 36 tall (44 hit), radius full, 6 apart.
- Disabled primary is the well colour with a tertiary label, never faded.
- Primary 44 tall, radius 12, full width.

## S-RUN.ask-qual

Same card as S-RUN.ask-plan; only content differs.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Question | as plan | 16/20.8 600 | `--ch-text-primary` | 17.08 / 14.34 | — | — | "Two things before I set it" ("One thing…" with one group, 05) |
| Reason | as plan | 13.5/18.2 | `--ch-text-secondary` | 9.77 / 10.25 | — | — | "“Top 5 travel” doesn't say how many are your picks, and Lonnie Poole has three tees." |
| Groups | as plan | | | | | | "Your picks in the 5": None, all by score / 1 / 2 (`selection_slots_coach_pick`, TF §5.8); "Tees": White / Blue / Black, only that course's saved tees (`tee_id`) |
| Button | as plan | | | | | | "Set it up" |
| Answer bubble | as S-RUN.request | | | 8.01 / 5.58 | | | "1 pick · white tees" |

Redlines: as S-RUN.ask-plan.

## S-TASK.cal

The confirm card. Header, footer and button rows here are shared by S-TASK.msg, .qual and .plan.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Card | full sheet content width (330 at 390), radius 16, overflow hidden | — | `--ch-card-bg`; ring 1 `--ch-card-ring`; 0 1 2 rgb(28 25 18/.05), 0 10 24 −14 rgb(28 25 18/.2) | — | — | — | — |
| Header | padding 14 14 10, gap 10, centred row | — | — | — | — | — | — |
| Icon tile | 32×32, radius 10 | — | `--ch-accent-tint` over card, glyph `--ch-accent-text` | 6.96 / 6.68 | calendar 18, stroke 2 | — | — |
| Title | flex 1, min-height 1.25em; 2 lines then ellipsis (05) | 17/21.25 600 ×k | `--ch-text-primary` | 17.08 / 14.34 | — | — | `title` "Team practice" (TF §5.1) |
| Subtitle | | 13/16.9 400 ×k | `--ch-text-secondary` | 9.77 / 10.25 | — | — | fixed per kind: "Team calendar" |
| Chip | padding 3 8, radius 7, nowrap | 13/16.9 600 ×k | `--ch-well-bg-flat`, `--ch-text-secondary` | 8.96 / 10.87 | — | — | state: Draft |
| Body | padding 0 14 12, gap 12 | — | — | — | — | — | — |
| Week strip | 7 equal columns, gap 3 | — | none (on card) | — | — | display only | the event's week, team zone (03 §3) |
| Day cell | padding 6 0 7, radius 10, gap 3 | letter 13/13 500 ×k; date 15/15 600 ×k tabular | letter `--ch-text-tertiary`; date `--ch-text-primary` | 6.61 / 6.99; 17.08 / 14.34 | — | — | M T W T F S S, 3 to 9 |
| Event dot | 5×5 | — | `--ch-text-tertiary` (G6) | 6.61 / 6.99 | — | — | the day has an event |
| Target day | cell fill | date `--ch-accent-text` | `--ch-accent-tint` over card | 6.96 / 6.68 | — | — | event date (Thu 6) |
| New dot | 5×5, absolute bottom 7 in the target cell; hidden until it lands | — | `--ch-accent-text` | 6.96 / 6.68 | — | — | — |
| Day rail | full width, 150 tall, radius 12 | — | `--ch-well-bg-flat` | — | — | — | start − 1h to end + 1h |
| Hour lines | 1pt at y 12, 44, 76, 108, 140 | label 13/13 500 ×k tabular, at x 10, y −7, well fill, padding-right 6 | line `--ch-separator`; label `--ch-text-tertiary` | 6.06 / 7.41 | — | — | 2 PM … 6 PM |
| Existing block | left 62, right 10, top 12, height 24, padding 4 10, radius 9 | 13.5/16.2 600 ×k | `--ch-card-bg`, inset 1 `--ch-separator`, `--ch-text-primary` | 17.08 / 14.34 | — | — | "Team lift · until 2:45" (calendar read) |
| New block | left 62, right 10, top 45, height 62 (3:00 to 5:00 at 32pt an hour), padding 6 10, radius 9; shadow 0 6 14 −8 rgb(11 58 37 / 0.6) | title 13.5/16.2 600; line 13/16.25 400 ×k | `--ch-event-new-bg` #1f6b45 / #4fa877, `--ch-event-new-ink` | 5.73 / 6.47 | — | — | `title`; `location` · start to end: "Lonnie Poole range · 3:00 to 5:00" |
| New block, ghost | while growing: transparent, inset 1.5 `--ch-accent-text` | | `--ch-accent-text` on well | 7.48 / 8.96 | — | — | — |
| Building ring | 2pt outer ring on the cell or field being written | — | `--ch-accent-text` (G5) | 8.15 / 8.45 | — | — | — |
| Facts well | radius 12 | — | `--ch-well-bg-flat` | — | — | — | — |
| Fact row | grid 84 / 1fr, gap 10, min 44, padding 8 12; hairline from x 12 | label 14/18.2 400; value 15/19.5 500 ×k | label `--ch-text-secondary`; value `--ch-text-primary`; unset value `--ch-text-secondary` 400 | 8.96 / 10.87; 15.66 / 15.20 | — | 44 (tap to edit in place) | When: "Thu 6 Nov · 3:00 to 5:00 PM" (`start_time`, `end_time`); Where: "Lonnie Poole range" (`location`); Who: coins + "All 11 active" (invitees); RSVP: "Not asked" (`requires_rsvp` false, unset style). Missing optional: "Not set" |
| Skeleton bar | 12 tall, radius 6, width 30 to 70% | — | `--ch-skel-base`; sheen transparent → `mix(--ch-card-bg 50%, transparent)` → transparent, 60% wide, 1.6s linear, the accepted gradient use (SHARED-2) | — | — | — | before a field resolves; sheen stops under Reduce Motion (SHARED-6) |
| Coins | 24×24 circles, overlap −6, ring 2 in the well colour + inset 1 rgb(0 0 0 / 0.1) | 9.5/9.5 700 ×k | white on `--ch-yr-*` | sr 6.47 / 5.25; jr 6.02 / 5.02; so 5.26 / 5.11 (T8); fr 6.17 / 5.43 | — | — | initials by class year; up to 5 then "+N" (5 + "+6" = 11) |
| "+N" coin | 28×24, radius 12 | 10/10 700 ×k | `--ch-card-bg`, `--ch-text-secondary`, inset 1 `--ch-separator` | 9.77 / 10.25 | — | — | told count − 5 |
| Footer | padding 12 14 14, gap 10, top hairline `--ch-separator` | — | — | — | — | — | absent until the card settles (C5) |
| On confirm line | gap 8, top aligned | 14/18.9 400 ×k; lead "On confirm:" 600 | `--ch-text-secondary`; lead `--ch-text-primary` | 9.77 / 10.25; 17.08 / 14.34 | info 16, stroke 2, `--ch-text-secondary`, margin-top 1 | — | "On confirm: 11 players see it on their calendar. No RSVP asked." (03 §3) |
| Button row | gap 8 | — | — | — | — | — | — |
| Cancel | hug, min 44, padding 0 16, radius 12 | 15/15 600 ×k | `--ch-well-bg-flat`, `--ch-text-primary` | 15.66 / 15.20 | — | 44 | "Cancel" |
| Primary | flex 1, min 44, padding 0 16, radius 12; inset 0 1 0 rgb(255 255 255 / 0.2) lit top edge, 0 4 10 −6 rgb(11 58 37 / 0.6) | 15/15 600 ×k | flat `--ch-accent` (SHARED-2); `--ch-text-on-accent` | 8.01 / 5.58 | — | 44 | "Add to calendar" |

Redlines:
- Card radius 16; header padding 14/14/10; icon tile 32, radius 10.
- Week cells: 7 columns, 3pt gap, radius 10; target cell tinted.
- Day rail 150 tall, hour lines every 32pt from y 12; blocks start at x 62, 10 from the right.
- New block 62 tall for two hours, radius 9.
- Fact rows 44 tall, label column 84.
- Footer hairline at full card width; buttons 44 tall, radius 12, 8 apart; primary fills the rest of the row.

## S-TASK.msg

Header, footer and buttons as S-TASK.cal; icon is the message bubble, subtitle "Messages".

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Thread well | padding 10 12 12, gap 8, radius 12 | — | `--ch-well-bg-flat` | — | — | — | the thread whose title matches exactly once (TF §5.4) |
| Thread header | gap 8, centred row | 14/16.8 600 ×k; count 400 | `--ch-text-primary`; count `--ch-text-secondary` | 15.66 / 15.20; 8.96 / 10.87 | coins as S-TASK.cal, white 700 initials (C3) | — | coins of members (4 + "+2"), "Travel squad", "· 6" |
| Their bubble | left, max 88%, padding 8 12, radius 17, bottom-left 6 | 15/20.25 400 ×k | `--ch-card-bg`, ring 1 `--ch-card-ring`, `--ch-text-primary` | 17.08 / 14.34 | — | — | the thread's last message, "Do we need to bring our own lunch Friday?" |
| Draft bubble | right, max 88%, min 36×60, same padding and radius, bottom-right 6 | 15/20.25 400 ×k | `--ch-card-bg`, inset 1.5 `--ch-accent-text` (G8), `--ch-text-primary` | text 17.08 / 14.34; outline 8.15 / 8.45 | — | tap to edit | draft ≤ 2000 characters (TF §5.4); count from 1600 (05) |
| Meta | right | 13/15.6 500 ×k | `--ch-text-secondary` on well | 8.96 / 10.87 | — | — | "Draft · only you can see this" |
| Tone chips | wrap gap 6; each padding 6 11, radius 999 (25 tall) | 13/13 500 ×k | `--ch-well-bg-flat`, `--ch-text-secondary`; picked `--ch-text-primary` fill, `--ch-card-bg` text | 8.96 / 10.87; picked 17.08 / 14.34 | — | 25 drawn, 44 with the pad | Plain / Warmer / Shorter (redraft in place); fade out and go inert on Send, back on Undo (T5) |
| On confirm | as cal | | | 9.77 / 10.25 | | | "Sends as you to 6 players in Travel squad, after an 8 second Undo." (member count minus the coach) |
| Primary | as cal | | | | | | "Send to 6 players" |

Redlines:
- Thread well radius 12, padding 10/12/12.
- Bubbles radius 17 with the tail corner 6; draft min 36 tall.
- Coins 24pt overlapping 6pt.
- Tone chips 25 tall (44 hit), 6 apart; gone after Send.

## S-TASK.qual

Header and footer as S-TASK.cal; icon is the flag, subtitle "Qualifiers".

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Round tiles | 3 equal columns, gap 6 | — | — | — | — | — | one per round (`num_rounds`) |
| Round tile | padding 9 10, gap 3, radius 12 | label 13/13 600; date 15/18 600; course 13/16.25 400 ×k | `--ch-well-bg-flat`; label `--ch-accent-text`; date `--ch-text-primary`; course `--ch-text-secondary` | 7.48 / 8.96; 15.66 / 15.20; 8.96 / 10.87 | — | — | "Round 1"; date in the team zone ("Mon 10 Nov", "Tue 11 Nov", "Wed 12 Nov"); course and tee ("Lonnie Poole · white") |
| Travel row | fact row as S-TASK.cal | — | — | — | — | — | squad size `selection_slots_total`, coach's picks `selection_slots_coach_pick` |
| Seat | 30×30 circle, gap 6 | — | off: inset 1.5 `--ch-separator`, glyph `--ch-text-tertiary`; on: `--ch-accent-tint` fill, inset 1.5 `--ch-accent-text`, glyph `--ch-accent-text` | off glyph 6.06 / 7.41; on 6.40 / 7.17 | person 14, stroke 2.2 | display only | one per seat |
| Coach-pick seat | same; ring champagne | — | `--ch-champagne-ink` ring (G1) | 5.03 / 7.57 | star 14 | — | the last N seats |
| Seats line | after the seats | 13/16.9 400 ×k | `--ch-text-secondary` | 8.96 / 10.87 | — | — | "4 by score · 1 your pick" |
| Field row | coins + count | value 15 500 | as fact | 15.66 / 15.20 | coins | — | entries: "11 players" (active roster) |
| Entry ends | fact row | value unset style | `--ch-text-secondary` 400 | 8.96 / 10.87 | — | — | `entry_deadline`, "Not set" |
| On confirm | as cal | | | 9.77 / 10.25 | | | "On confirm: 11 players get a push and an email once Undo closes." |
| Primary | as cal | | | | | | "Set qualifier" |

Redlines:
- Three round tiles, 6 apart, radius 12, padding 9/10.
- Seats 30pt, 6 apart; the pick seat last.
- Fact label column 84.

## S-TASK.plan

Header and footer as S-TASK.cal; icon is the clipboard, subtitle "Practice plan".

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Time bar | full width, 34 tall, radius 10, gap 2, overflow hidden | — | track `--ch-well-bg-flat` | — | — | — | blocks in proportion to minutes (flex = minutes) |
| Segment | padding 0 8, nowrap, clipped | 13/13 600 ×k | `--ch-plan-seg-1/2/3`: accent at three strengths, #155a39 / #23704a / #2f7d55 light, #4fa877 / #7cc79b / #9dd6b4 dark; label white (light), #0e120f (dark) | 8.22 / 6.47; 6.02 / 9.44; 5.02 / 11.43 | — | — | short block name: Putting, Wedges, 9 holes |
| Block list | radius 12 | — | `--ch-well-bg-flat` | — | — | — | blocks (TF §5.15, `PlanBodyV2`) |
| Block row | grid 10 / 1fr / auto, gap 10, min 48, padding 7 12; hairline from x 32 | name 15/18.75 500; detail 13/16.25 400; minutes 14/14 600 tabular ×k | swatch 10×10 radius 3 in the segment's accent strength; name `--ch-text-secondary` (C7); detail and minutes `--ch-text-secondary` | 8.96 / 10.87 | — | 48 | "Putting ladder", "3, 6, 9, 12 ft · make 3 in a row", "20 min" |
| Facts | as S-TASK.cal | | | | | | Length: "90 min · Tue 4 Nov, 3:00 PM"; Where: "Lonnie Poole" (place ≤ 80) |
| Save to row | gap 10, centred | label 14/14 400 ×k | `--ch-text-secondary` on card | 9.77 / 10.25 | — | — | "Save to" |
| Folder button | hug, min 40, padding 0 10 0 11, gap 7, radius 11 | 14.5/14.5 600 ×k | `--ch-well-bg-flat`, inset 1 `--ch-separator`, `--ch-text-primary` | 15.66 / 15.20 | folder 16 `--ch-accent-text` (7.48 / 8.96); chevron 16 `--ch-text-primary` | 40 drawn, 44 with the pad | folder name by name until N-10 (TF §5.15); default "Practice plans" |
| On confirm | as cal | | | 9.77 / 10.25 | | | "On confirm: saved to Documents in Practice plans. Players see it only when you publish." (folder name live) |
| Primary | as cal | | | | | | "Save plan" |

Redlines:
- Time bar 34 tall, radius 10, 2pt gaps; segment widths 20 : 30 : 40; three greens, darkest first (light).
- Block rows 48 tall, swatch 10 radius 3, hairline from x 32.
- Folder button 40 tall, radius 11, 10pt after "Save to".

## S-TASK.plan.folder-menu

A list that opens in place under the Save to row (inside the footer), not a popover.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Menu | full footer width, padding 4, radius 14; absent when closed (C5) | — | `--ch-well-bg-flat` | — | — | — | folders with plan counts |
| Item | grid 20 / 1fr / 18, gap 10, min 44, padding 0 10, radius 10 | name 14.5/17.4 500 ×k; count 400, margin-left 6 | `--ch-text-primary`; count `--ch-text-secondary` | 15.66 / 15.20; 8.96 / 10.87 | folder 17 `--ch-text-secondary` (8.96 / 10.87) | 44 | "Practice plans 4", "Qualifier prep 2", "Team rules 3" |
| Item, chosen | same | same | `--ch-card-bg` fill, ring 1 `--ch-card-ring` | 17.08 / 14.34; count 9.77 / 10.25 | folder `--ch-accent-text`; check 17 `--ch-accent-text` 8.15 / 8.45 | 44 | current folder |
| New folder item | top hairline `--ch-separator`, 4 margin and padding above | 14.5 500 | `--ch-accent-text` on well | 7.48 / 8.96 | plus 17 | 44 | "New folder" |

Redlines:
- Menu padding 4, radius 14; items 44 tall, radius 10.
- Chosen item is a card-colour plate with a check at the right.
- New folder sits below a hairline with 4pt above and below it.

## S-TASK.plan.new-folder

The New folder item turns into a field with Create.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Row | padding 4, gap 6 | — | — | — | — | — | — |
| Field | flex 1, 40 drawn, padding 0 12, radius 10; a 2pt transparent border makes the box 44 (margin −2 keeps the layout) | 14.5/14.5 500 ×k | `--ch-card-bg`, `--ch-text-primary`; ring 2 `--ch-accent-text` drawn in the transparent border (G4); placeholder `--ch-text-tertiary` | 17.08 / 14.34; ring 7.48 / 8.96; placeholder 6.61 / 6.99 | — | 44 (an input takes no `::before`, so the border is the pad) | "Folder name", max 40 characters (page); folder name 1-60 (TF §5.15) |
| Create | min 40, padding 0 14, radius 12 | 15/15 600 | as primary | 8.01 / 5.58 | — | 40 drawn, 44 with the pad | "Create" |
| New folder in list | first row, chosen | as chosen item | | | | | count reads "new" |

Redlines:
- Field 40 tall, radius 10, 2pt focus ring.
- Create 40 tall, 6pt right of the field.
- After Create the new folder is first and checked, and the On confirm line names it.

## S-TASK.busy

Confirm pressed.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Cancel | fades to 0, then removed from the row | — | — | — | — | locked | — |
| Primary | takes the full row; min 44, radius 12 (C11), locked | 15/15 600 | as primary | flat 8.01 / 5.58 | — | locked | "Adding…" / "Sending…" / "Setting…" / "Saving…" |
| Sweep | 3 tall, 40% wide, radius 2, at the bottom edge | — | rgb(244 241 232 / 0.9) (G16) | 6.24 / 4.98 | — | — | loop; static full width at 0.35 under Reduce Motion |

Redlines:
- Primary spans the whole footer width once Cancel is gone.
- Sweep 3pt tall on the button's bottom edge, 40% of its width.

## S-RCPT

The receipt replaces the footer's contents; the landed object shows in the card body.

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Chip | as header chip | 13 600 | `--ch-accent-tint` over card, `--ch-accent-text` | 6.96 / 6.68 | — | — | Added / Sent / Set / Saved |
| Card edge flash | inset 2 ring, opacity 0 → 0.6 → 0 | — | `--ch-accent-text` | — | — | — | once |
| Receipt row | grid 26 / 1fr / auto, gap 10, centred | — | — | — | — | — | read-back row (TF §2 rule 5) |
| Check disc | 24×24 circle | — | `--ch-accent`, glyph `--ch-text-on-accent` | 8.01 / 5.58 | check 13, stroke 3.2 | — | — |
| Title | wraps (no truncation; about 118pt wide at 390) | 15/18.75 600 ×k | `--ch-text-primary` | 17.08 / 14.34 | — | — | "Added to calendar", "Sent to Travel squad", "Qualifier set", "Plan saved" |
| Line | wraps | 13.5/17.55 400 ×k | `--ch-text-secondary` | 9.77 / 10.25 | — | — | "Thu 6 Nov, 3:00 to 5:00 PM"; "Delivered to 6 players"; "Fall qualifier · starts Mon 10 Nov"; "Documents · Practice plans" |
| Undo | min 44, padding 0 10, gap 6, radius 10; pressed fill `--ch-accent-tint` | 14.5/14.5 600 ×k | `--ch-accent-text` | 8.15 / 8.45 | ring 22: track r 9 stroke 2.4 `--ch-accent-tint`; remaining stroke 2.4 round `--ch-accent-text` (8.15 / 8.45), starts at 12 o'clock, dash 56.55; arrow 12 at inset 5, stroke 2.4 | 44 | `held_until` − now (03 §4) |
| Open | as Undo, 2pt right | 14.5 600 | `--ch-accent-text` | 8.15 / 8.45 | — | 44 | routes to the object (S-OPEN) |
| Landed, cal | the target cell gets its new dot; the block stays | — | as S-TASK.cal | 6.96 / 6.68 | — | — | — |
| Landed, msg | draft bubble fills: `--ch-accent`, `--ch-text-on-accent`; meta counts "Sending in 8s" → "Delivered"; tone row fades out and goes inert (T5) | 15/20.25 | | 8.01 / 5.58 | — | — | — |
| Landed, qual | body becomes a well list (radius 12) of 52pt rows: grid 32 / 1fr / auto, gap 12, padding 8 12, hairline from 56 (C2); the older row's icon at full strength (G10) | title 16/20.8 500; line 15/19.5 400 ×k | `--ch-text-primary` / `--ch-text-secondary` on well; icon tile `--ch-accent-tint`; chip "New" tint | 15.66 / 15.20; 8.96 / 10.87; icon 6.40 / 7.17; chip 6.40 / 7.17 | flag 18; chevron 14 stroke 2.2 `--ch-text-tertiary` (6.06 / 7.41) | 52 | "Fall qualifier · 3 rounds · Lonnie Poole · 11 players" over "Spring qualifier · Finished · 4 rounds" |
| Landed, plan | body becomes a shelf: padding 12, gap 10, radius 12, bottom aligned | folder name 13/15.6 600; count 400; shelf label 13/16.9 400, right | `--ch-text-primary` / `--ch-text-secondary` on well; dim folders' names `--ch-text-secondary` 500 | 15.66 / 15.20; 8.96 / 10.87 | folder 58×46: back `mix(accent 22%, card)`, front `mix(accent 34%, card)`, outline 1.2 `--ch-accent-text` (G7, 7.48 / 8.96); dim folders card fill, ring outline, skeleton front | — | chosen folder first with "5 plans", two others dim, "Documents" at the right |

Redlines:
- Receipt disc 24pt; 10pt to the title.
- Undo ring 22pt, stroke 2.4, radius 9.
- Undo and Open 44 tall, 2pt apart, right aligned.
- Qualifier landed rows 52 tall, icon 32, hairline from x 56.
- Folder icon 58×46 in a 74 wide column.

## S-RCPT.told

Undo fades and is removed; this row is added under the receipt (footer gap 10).

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Told row | gap 10, margin-top 2, padding 9 12, radius 12 | 13.5/18.2 400 ×k; lead 600 | `--ch-well-bg-flat`; `--ch-text-secondary`; lead `--ch-text-primary` | 8.96 / 10.87; 15.66 / 15.20 | — | — | notification rows in `created_at` order (03 §4) |
| Coins | as S-TASK.cal, ring 2 in the well colour; up to 5 then "+N" | 9.5 700 ×k | white on year colours | as S-TASK.cal (so dark 5.11) | — | — | delivery order |
| Seen dot | 9×9 at right −2 bottom −2 of a coin, ring 2 well | — | `--ch-accent-text` (G9) | 7.48 / 8.96 | — | — | messages read receipts only |
| Plan variant | 28×28 icon tile instead of coins | 13.5 | tint, `--ch-accent-text` | 6.40 / 7.17 | folder 18 | — | "Only coaches can see it. Players are told when you publish." (fixed 4 Nov: was "Only you can see it.") |
| Lines | | | | | | | "11 players got it on their calendar." / "Delivered to 6. Seen by 2." / "11 players got a push and an email." |

Redlines:
- Row padding 9/12, radius 12, 2pt under the receipt plus the 10pt footer gap.
- Coins 24pt overlapping 6; "+N" 28 wide.
- Seen dot 9pt at the coin's bottom right.

## S-RCPT.undone

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Chip | as header chip | 13 600 | `--ch-well-bg-flat`, `--ch-text-secondary` | 8.96 / 10.87 | — | — | "Undone" |
| Disc | 24×24 | — | `--ch-well-bg-flat`, glyph `--ch-text-secondary` | 8.96 / 10.87 | undo arrow 13, stroke 3.2 | — | — |
| Title and line | as S-RCPT; no actions | 15 600 / 13.5 400 | as S-RCPT | 17.08 / 14.34; 9.77 / 10.25 | — | — | cal "Undone" / "Nothing was added and nobody was told."; msg "Unsent" / "Nobody saw it."; qual "Undone" / "Nothing was created and nobody was told."; plan "Undone" / "Nothing was saved." |
| Object | cal: block and new dot removed. msg: bubble back to the outlined draft, meta "Unsent · back to draft", tone row back at full and active. qual and plan: the page hides the landed row and leaves a blank slot; build: remove it so the card shrinks | — | — | — | — | — | — |

Redlines:
- Neutral disc 24pt, well colour.
- No Undo or Open on this row.

## S-RCPT.failed

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Chip | as header chip | 13 600 | `--ch-loss-tint` (light 0.08) over card, `--ch-loss` | 4.99 / 6.76 (T9) | — | — | "Not saved" |
| Disc | 24×24 | — | `--ch-loss-tint`, glyph `--ch-loss` | 4.99 / 6.76 (G17) | alert 13, stroke 3.2 | — | — |
| Title and reason | as S-RCPT | 15 600 / 13.5 400 | as S-RCPT | 17.08 / 14.34; 9.77 / 10.25 | — | — | "Couldn't add the practice" / "The calendar didn't answer. Nothing was saved." (per kind) |
| Buttons | as the confirm row | 15 600 | Cancel ghost; primary flat accent | 15.66 / 15.20; 8.01 / 5.58 | — | 44 | "Cancel", "Try again" |
| Draft | stays as it was | — | — | — | — | — | nothing lost |

Redlines:
- Amber disc 24pt; never red.
- Button row 10pt under the receipt row, same 44 buttons as confirm.

## S-RUN.cancelled

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Card body | no opacity on the body (T1 to T4) | — | marks at 0.6: event dots, seats, plan swatches, folder art; the new event block and plan segments turn neutral: `--ch-skel-base` fill, `--ch-text-secondary` text, no shadow; all other text at full colour | text as S-TASK.*; neutral block text 7.98 / 8.91 | — | — | — |
| Chip | as header chip | 13 600 | well, `--ch-text-secondary` | 8.96 / 10.87 | — | — | "Cancelled" |
| Disc | 24×24 | — | well, `--ch-text-secondary` | 8.96 / 10.87 | × 13, stroke 3.2 | — | — |
| Title and line | as S-RCPT | | | 17.08 / 14.34; 9.77 / 10.25 | — | — | "Cancelled" / "Nothing was created." |

Redlines:
- Body marks at 60%, the event block and plan segments neutral; every text line stays at its full colour.
- Neutral disc 24pt; no actions.

## S-RUN.stopped

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Stopped step | as a step row; label keeps its present tense and `--ch-text-primary`; shimmer off | 15/19.5 | `--ch-text-primary` | 17.08 / 14.34 | dash 10×2, radius 1, `--ch-text-tertiary` (6.61 / 6.99) in the 20 slot | — | the step that was running |
| Done steps | unchanged | | `--ch-text-secondary` | 9.77 / 10.25 | checks | — | — |
| Line | under the list, 14 gap | 15.5/22.5 400 ×k | `--ch-text-secondary` on the sheet | 9.77 / 10.25 | — | — | "Stopped. Nothing was saved." |
| Send | back to off | — | as S-PANEL.composer | 6.06 / 7.41 | — | — | — |

Redlines:
- Dash 10×2 centred in the 20pt glyph slot.
- Line 14pt under the last step, secondary ink.
- Composer shows Send (off), not Stop.

## Completeness pass, 4 Nov 2026

Specs for the states 05's Completeness section adds. Every value reuses a token from the token table above; no new token. Contrast is computed with the WCAG formula on the hex values (light / dark), on the surface named. Hit areas follow SHARED-4 (44pt).

### S-TASK.plan.inert

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Save to row, inert | as the Save to row, chevron removed; not a button | 14.5 500 ×k | `--ch-text-primary` on `--ch-well-bg-flat` #F6F4EE / #141815 | 15.66 / 15.20 | folder 17 `--ch-text-secondary` #46433D / #D0C9B8 (8.96 / 10.87) | none | "Save to Practice plans" |
| Primary, inert | as the named primary: min 44, radius 12, same width | 15/15 600 ×k | fill `--ch-well-bg-flat` #F6F4EE / #141815, text `--ch-text-tertiary` #5F5C55 / #ADA697 | 6.06 / 7.41 | none | 44 (focusable, `aria-disabled="true"`) | "Comes with the Practice tab" |
| On confirm line, inert | as the On confirm line | 13/1.35 400 ×k | `--ch-text-secondary` #46433D / #D0C9B8 on `--ch-card-bg` #FFFEFB / #191E1A | 9.77 / 10.25 | none | none | "Nothing is saved yet. Plans save once the Practice tab is on." |

Redlines: the inert primary is the same size as the live one (no layout shift when the flag turns on); no chevron; no Open on any receipt.

### S-TASK.offline

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Offline line | above the button row, gap 6, one line then wraps | 13/1.35 500 ×k | text `--ch-text-secondary` on `--ch-card-bg` | 9.77 / 10.25 | wifi-off 15, `--ch-loss` #9A5700 / #E7AE57 on card (5.57 / 8.53, mark floor 3:1) | none | "You're offline. Nothing was saved." |
| Primary, offline | as the named primary | 15/15 600 ×k | as the inert primary | 6.06 / 7.41 | none | 44, `aria-disabled` | its own label ("Add to calendar") |

### S-TASK.plan.new-folder: duplicate and reserved names

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Name line | under the field, margin-top 6, padding 0 4 | 13/1.35 500 ×k | `--ch-loss` #9A5700 / #E7AE57 on `--ch-well-bg-flat` #F6F4EE / #141815 | 5.11 / 9.04 | alert 13 `--ch-loss` | none | "There's already a folder called Qualifier prep. Pick it above." or "Team is used by Documents. Pick another name." |
| Create, blocked | as Create | 15/15 600 | as the inert primary | 6.06 / 7.41 | none | 40 drawn, 44 with the pad | "Create" |

### S-TASK.plan.needs-event

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Event card | S-TASK.cal as drawn | as S-TASK.cal | as S-TASK.cal | as S-TASK.cal | calendar | 44 | "Team practice", the day, the free window, everyone |
| Practice row on the plan card | a field row (label 84, min 44) | label 13 500; value 14.5 500 ×k | label `--ch-text-secondary`, value `--ch-text-primary` on well | 8.96 / 10.87; 15.66 / 15.20 | none | none | "For Tue 4 Nov practice, 3:00 to 4:30 PM · from your calendar" (read: `golf_events` start, end, zone) |
| No-practice line after Undo | the plan card's footer swapped for one line | 13.5 400 ×k | `--ch-text-secondary` on card | 9.77 / 10.25 | neutral disc 24 | none | "No practice, so no plan was made." |

### S-RUN.earlier

| Element | Box | Type | Colour L / D | Contrast L / D | Icon | Hit | Data |
|---|---|---|---|---|---|---|---|
| Fold row | full body width, min 44, padding 0 4, bottom hairline `--ch-separator` | 13/1.35 500 ×k | `--ch-text-secondary` on `--ch-card-bg` | 9.77 / 10.25 | none | 44 (whole row is the button) | "Earlier in this chat" (count of folded turns read by VoiceOver) |
| Open full chat | trailing text in the row | 13/1.35 600 ×k | `--ch-accent-text` #155A39 / #7CC79B on card | 8.15 / 8.45 | chevron 12 | shares the row's 44 | "Open full chat" |

### S-OPEN.gone and S-PANEL.full

Nothing new to draw: S-OPEN.gone uses each destination's existing not-found state, and S-PANEL.full is today's Ask screen. The receipt that has lost its object drops the Open button and keeps its line; the row's height does not change (Undo's slot was already empty after the window).

## Wiring, 4 Nov 2026

Checked against helmv3 main 03d9087 (1 Nov) by reading code and migrations only (the lane was written at 75b4956; moved citations are fixed in place in 02, 03, 05 and TASK_FIELDS with "fixed 4 Nov wiring"). Paths are under `src/` unless they start with `supabase/`. `AT` is `lib/coachhelm/v3/chat/agent-tools.ts`, `ROUTE` is `app/api/coachhelm/v3/chat/stream/route.ts`, `ACT` is `app/golf/actions/`, `QC` is `clubhouse/shell/quick-chat/` (new). The quick chat adds no server code of its own: every write is an Ask lane tool on the Ask lane's hold (`ask/06-SCREEN-SPECS.md` "Wiring, 4 Nov 2026" W4 and W5 hold the full rows; this section names what differs at panel width).

Rules for every row, so they are not repeated:
- Flags, server only: `coachhelm_quick_chat_v1` (new, QC0) read in `clubhouse/data/shell.ts` as `quickChat: askOn && isFlagEnabled('coachhelm_quick_chat_v1')` beside `classAwareness` (:266); every write also needs `coachhelm_ask_v2` (Ask AK0). Flag off: `AskSheetButton` and `AskSheetProvider` exactly as main (`TopBar.tsx:104`, `ClubhouseFrame.tsx:174`).
- Who: coach only. `askOn` is computed only with a `coachId` (`shell.ts:174`, `isCoachHelmEnabledForCoach`, `lib/coachhelm/v2/gate.ts:181`); the provider also checks `useClubhouseRole() === 'coach'` as `AskSheetProvider` does (`AskSheet.tsx:65-68`); the stream route refuses a non-coach with 403 (`lib/coachhelm/v3/chat/context.ts:89`).
- The session: `useCoachHelmChat` lives in a lazily loaded `QC/QuickChatSession.tsx` mounted once on `warm` and never keyed by path, because the route aborts generation when its request goes (ROUTE 571) and today's sheet remounts per path (`AskSheet.tsx:97`).
- Double submit: Confirm and Cancel lock on the first press; the server claim is UNIQUE `(coach_id, idempotency_key)` (`20260725170000_coachhelm_action_runs_and_ui_parts.sql:78`, `claimForExecution`, `lib/coachhelm/v3/chat/action-runs.ts:148`).
- Optimistic update: none. The capsule is the only interim state; every receipt value is read back (TASK_FIELDS §2 rule 5).
- Shot tracking: nothing here reads or writes shot capture or save code (02 §1).

### QW1. Key, pill, panel and session (S-KEY, S-LIVE, S-PANEL, S-PANEL.hello, S-PANEL.composer, S-PANEL.full)

| element or action | reads (source, file:line) | writes or calls (file:line or new) | who and RLS | validation | success | failure and rollback | sync (realtime or refresh) | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Helm key, ⌘J, flag dot | `shell.quickChat` (new field on `ChShellData`, `shell.ts:49`) | none; `warm` loads the panel and session chunks | coach (see rules) | ⌘J ignored while focus is in another text field | panel opens | chunk load fails: the key stays, a second press retries the import | n/a | none | `coachhelm_quick_chat_v1` | n/a |
| Live pill | `QuickChatSession` state (current run's step label, `status`, receipt status) | none | coach | n/a | follows the run | failed run: amber "Didn't go through", stays until opened | follows the stream; a reload drops the pill (no server resume) and the held receipt shows on the next open from the saved thread | none | as above | n/a |
| Context line | `lookingAt(pathname, search, useCrumbTrail())` (`AskSheet.tsx:36-47`) | none | client | n/a | "Looking at …" | trail missing: route label (`routeLabel`) | on path change | none | as above | n/a |
| Start tiles | `quickStarts(pathname)` (new, `QC/starts.ts`): fixed copy, second lines from the screen's loader data already on the client | sends a turn | coach | n/a | turn starts | n/a | n/a | none | as above | n/a |
| Earlier today | `GET /api/coachhelm/v3/chat/conversations` (`listConversations`, `lib/coachhelm/v3/chat/persistence.ts:57`): newest row created since the team zone's midnight (`season.ts` zone, fallback America/New_York); then `GET …/conversations/[id]` (`getConversation`, :66) and its last `data-action-receipt` in `ui_parts` | none | coach: `chat_conversations_coach_only`, `chat_messages_coach_only` (baseline :18520, :18524) | n/a | one row, reserved height | read fails or none today: the block is left out | on panel open | none | as above | n/a |
| Composer, Stop, offline line | `subscribeOnline` (exported from `shell/AskSheetBody.tsx:22`) | `POST` ROUTE (327) through the session's `useCoachHelmChat`; Stop calls the hook's stop | coach; budget `checkBudget` before any row (ROUTE 52) | empty send disabled | streamed turn | offline: S-TASK.offline; stream error: what streamed stays, composer line | the turn saves at `onFinish` (ROUTE 961) | none | as above | n/a |
| Open full chat | the session's conversation id | navigation `conversationHref(id)` (`screens/coachhelm/chat/History.tsx:34-36`, `?view=ask&c=<id>`) | coach | id exists (server minted it) | Ask on the same thread; while a run is live the Ask screen renders from `useQuickChatRun()` (new context in `QuickChatSession`), then its own loader | id not minted yet (first turn still starting): the button waits for `onConversationId` before routing | Ask refetches the thread at run end | none | button shows with `coachhelm_ask_v2` off too | n/a |

### QW2. Run, steps and ask cards (S-RUN.request, S-RUN.steps, S-RUN.ask-plan, S-RUN.ask-qual, S-RUN.stopped, S-RUN.cancelled, S-RUN.earlier)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Steps and fold | `data-progress` parts (AT 239-245, labels `PROGRESS_LABEL` AT 144) as rewritten by Ask AK1 | none | server | labels only from announced steps | "N steps · Ns" | failed read: `unavailableEnvelope` (AT 220), amber step | stream | none | `coachhelm_ask_v2` (AK1) | n/a |
| Plan brief card | Ask AK9 `ask_practice_brief` (lane 6) | none (answers fold into the coach's bubble and send as the next turn) | coach | three groups at most | folds | n/a | n/a | none | `coachhelm_practice_plans_v1` (lane 6) | n/a |
| Qualifier ask (picks, tees) | Ask AK11a create engine's missing-field output; tees only from the course's saved tees (the course read), picks from the roster | none | coach | tee ids from the read only | folds | n/a | n/a | none | `coachhelm_ask_v2` | n/a |
| Stop | client | none (reads only before Confirm) | coach | n/a | "Stopped. Nothing was saved." | n/a | n/a | none | as above | n/a |
| Earlier fold past 30 turns | the session's messages | none | client | 30 turns rendered at most | one row "Earlier in this chat · Open full chat" | n/a | n/a | none | as above | n/a |

### QW3. Task cards (S-TASK.cal, S-TASK.msg, S-TASK.qual, S-TASK.plan, S-TASK.plan.folder-menu, S-TASK.plan.new-folder, S-TASK.plan.needs-event, S-TASK.plan.inert, S-TASK.busy, S-TASK.offline)

Every held write: press records `held` with `run_at` (Ask AK4 `holdForExecution` in `executeGated`, AT 372-437), release from `after()` in ROUTE (needs `import { after } from 'next/server'`; ROUTE imports only `NextRequest`, `NextResponse` at 27-28), `sweepHeld` on the next chat request, Undo and Open through the new `app/api/coachhelm/v3/chat/actions/[key]/route.ts`.

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| S-TASK.cal visual and "Add to calendar" | week from `loadCalendar` (`clubhouse/data/calendar.ts:142`, the Calendar screen's loader), roster, team zone | Ask `create_event` (AK11a, `lib/coachhelm/v3/chat/create-tools.ts`) to `createGolfEvent` (`ACT/calendar-events.ts:537`, impl 332), `requestId` from the run key (:411-433) | coach: `golf_events_insert_coach` (baseline); attendance `golf_event_attendance_insert_coach` (baseline) | TASK_FIELDS §5.1: end in the coach's words or asked; `allDay` and offset sent | "Added to calendar · Thu 6 Nov, 3:00 to 5:00 PM" from the read-back row | f_event failed; partial when `invitationsError` (:486) | `clubhouse/screens/calendar/live.ts`, `hooks/golf/use-calendar-range-events.ts` (realtime `golf_events`, `golf_event_attendance`) | RSVP off: nobody (`lib/calendar/rsvp.ts:268`; fan-out invitees only when `requiresRsvp`, :513); RSVP on: bell and push to invitees after the window (`after(fanOutEventInvitation)`, :515), push under `push_events` | `coachhelm_ask_v2`, quick chat flag | not offered (05 HM1 row) |
| S-TASK.msg visual and "Send to N players" | thread: the coach's conversations with an exact title match once (TASK_FIELDS §5.4) from `clubhouse/data/messages.ts`; members; the coach's unsent draft in sessionStorage | held run whose executor calls `sendGolfMessage(conversationId, content, clientMessageId)` (`app/actions/messages.ts:808`) with `clientMessageId` derived from the run key | coach: `golf_messages_insert_v2` (sender = `auth.uid()` and a conversation the coach is in, baseline) | 1 to 2000 on the card (action allows 5000, `lib/validation/action-schemas.ts:75`); members with no account are named and left out | receipt "Sent to Travel squad" after the window | refused: amber, draft kept; Undo: back to the draft, no row | Messages realtime `hooks/golf/use-golf-messages.ts` | the action's own message fan-out to members, after the window | as above | not offered; "Open in Messages" via `messagesPrefillHref` (`clubhouse/screens/messages/prefill.ts:49-61`) |
| Tone chips Plain / Warmer / Shorter | the draft | a new turn that redrafts (no write) | coach | 2000 | bubble redrafts in place | n/a | n/a | none | as above | n/a |
| S-TASK.qual visual and "Set qualifier" | roster, course and its saved tees | Ask `create_qualifier` to `createGolfQualifier` (`ACT/qualifier-actions.ts:349`, impl 113) with `roundCourses` in the same call | coach: `golf_qualifiers_insert_coach` (baseline); round courses `golf_qualifier_round_courses` (`20260621231000`) | `selectionSlotsTotal` at most 12 (DB check); `selectionSlotsCoachPick` within it; `numRounds` | "Qualifier set · Fall qualifier · starts Mon 10 Nov" | failed: amber; partial: the round-course write is best effort and only logged (:211-240), so the receipt re-reads `golf_qualifier_round_courses` and says "Tees weren't saved. Set them on the qualifier." when rows are missing | `clubhouse/screens/qualifiers/live.ts`, `hooks/golf/use-qualifier-realtime.ts` | inside the call, hence held: email `notifyQualifierCreated` (:309, only while `isCustomerEmailEnabled()`) and push `qualifier_created` (:315-316) | as above | not offered |
| S-TASK.plan, folder menu, new folder | `listPlanFolders(teamId)` (lane 6, `golf_documents.folder`), the day's practice event | `savePracticePlanDraft({conversationId, planId, version, draft, folder})` (lane 6, `ACT/coachhelm-practice-plans.ts`, new): N-00 `golf_practice_plan_save` (held 010500) then `golf_practice_plan_file_draft` (lane 6 held `20261104090000`); not on the hold, writes at once | coach: the definer functions' own coach check; `golf_documents_insert_coach` / `_update_coach` (baseline) | folder 1 to 60 trimmed, duplicate ignoring case, "Team" reserved; plan needs `event_id` | "Plan saved · Practice plans" | Undo: `undoPracticePlanDraft` (server allows 10s); refused: amber, card kept | plan page and Documents refetch | none: "Only coaches can see it. Players are told when you publish." | `coachhelm_practice_plans_v1` and `coachhelm_ask_v2` | S-TASK.plan.inert until N-00 010000, 010400, 010500 and lane 6 090000 run (boot check on `golf_practice_plan_save`) |
| S-TASK.plan.needs-event | `golf_events` that day, type practice, not all-day or cancelled | S-TASK.cal's held event first; Save calls `POST …/actions/[key]?now=1` (commit early), then saves | coach | one practice that day, or ask | event receipt, then Save live | Undo on the event: the plan draft goes, "No practice, so no plan was made." | Calendar realtime | as S-TASK.cal | as above | without HM1: "Add a practice to the calendar first" |
| S-TASK.busy capsule | the pending request | none | n/a | n/a | "Adding…" until the held receipt | network error: S-TASK.offline; claim error: amber failed | n/a | none | as above | n/a |
| S-TASK.offline | `subscribeOnline`, plus the stream's error | none; nothing sends by itself when back | coach | n/a | primary disabled, "You're offline. Nothing was saved." | n/a | n/a | none | as above | n/a |
| Roster re-read at commit | roster at release (Ask 02 §14 execute-time re-check) | none extra | server | a player who left is dropped | told count from delivery rows | everyone left: failed, nobody told | n/a | as the flow | as above | n/a |

### QW4. Receipt, Told, Undo, Open (S-RCPT, S-RCPT.told, S-RCPT.undone, S-RCPT.failed, S-OPEN, S-OPEN.gone)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Receipt and Undo ring | `data-action-receipt` `{status: 'held', held_until}` (Ask AK4); the ring is `held_until` minus server-corrected now | none | coach: `coachhelm_action_runs_coach_only` (`20260725170000:96-101`) | n/a | ring drains | n/a | reopen mid-window: ring from `held_until` (3s left at 5s) | none in the window | as above | no ring; "Done. Undo isn't on here yet." for today's four writes only |
| Undo | ledger row | `DELETE /api/coachhelm/v3/chat/actions/[key]` (new, AK4): `held` to `cancelled` only `where run_at > now()` | coach; another coach's key is 404 | key held | S-RCPT.undone; message card back to a draft | late (0 rows): "Too late to undo. It's done. Open it to change it." | next refetch shows `cancelled` everywhere | none, ever | as above | n/a |
| Release | ledger row | `releaseHeld` (AK4): `held` to `approved` where `run_at <= now()`, then the executor, then `recordOutcome` (`action-runs.ts:221`) | server, coach session | once per key | durable receipt; success decided by a read-back of the domain row, because `updateTag` (called inside `createGolfEvent` at :519-520, and in others) only works in a Server Action (`app/admin/actions/triage.ts:38-39`) and may throw from a route or `after()` | S-RCPT.failed amber; nobody told | destination realtime as QW3 | as QW3 | as above | n/a |
| Told row | `GET /api/coachhelm/v3/chat/actions/[key]` (new, AK4): ledger `result` plus counts read with the admin client, because players' `notifications` rows are not readable by the coach (`notifications_select_own`, baseline): event `golf_event_attendance` rows (RSVP off) or bell rows by `data` object id (RSVP on); message members and `golf_conversation_read_marks` (`20261025010000`, policy `golf_read_marks_select`) at or after the message; qualifier push counts and email sends | none | coach; the route returns counts and roster ids for the coach's own team only | order by `created_at`; "seen" only where recorded | coins 90ms apart, then the line | delivery read fails: the line without coins, never an invented count | read when the ring ends, again on focus | n/a | as above | no Told row |
| Open | ledger row, object id | `POST …/actions/[key]?now=1` (commit early) then route: event `eventHref` (`clubhouse/screens/home/event-links.ts:7`), thread `/golf/dashboard/messages?conversation=<id>`, qualifier `/golf/dashboard/qualifiers/<id>`, plan `/golf/dashboard/practice/plan/<id>?from=coachhelm&ret=<path>` | coach | key held or completed | panel closes, destination | S-OPEN.gone: destination's not-found; the receipt drops Open | browser back to the source screen | as release | as above | n/a |

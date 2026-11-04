# Clubhouse design language (phone first refresh, 31 Oct 2026)

One language for the four redesigns: Messages, phone Stats plus player Home, Classes plus Roster plus coach Home, and the gradient text sweep. Every page in the refresh follows this file. Where a thread already chose something better, it says so in the "Adopted from threads" log at the end and this file is updated.

Bar: Apple. Smooth, accurate motion. Handcrafted, not basic. Design only: nothing here changes app code until the build brief.

Sources read for this file:
- Nick's Claude Design reference: `design/handoff/` in helmv3 (the "Fairway, Clubhouse Edition" system in `design/handoff/_ds/fairway-clubhouse-edition-*/readme.md`, the mobile boards `Coach - * - Mobile.html`, `Player - * - Mobile.html`, `m.css`, `m-shell.jsx`, screenshots in `design/handoff/screenshots/*-mobile.jpg`)
- Today's runtime: `src/clubhouse/styles/tokens.css`, `shell.css`, `ui/Section.tsx`, `ui/Surface.tsx`, `ui/PhoneBar.tsx`, `ui/LargeTitle.tsx`
- Nick's screenshot of phone Stats, 31 Oct, 8:15am

---

## 1. What is wrong today, in one paragraph

On phone the page behind the cards is not a color, it is a moving light: `--ch-workspace #f5f0e4` plus `--ch-light-paper` (a warm #e8b46a wash that strengthens toward golden hour) plus `--ch-light-canvas` (a radial key light at the top). At 8:15am that renders as a tan, uneven beige. Then `ui/Section.tsx` (the Oct 7 "Ledger": headings flush on the canvas, no card) puts section titles, meta and captions straight onto that light. The text passes WCAG numerically (ink 900 on the tinted canvas is about 13.5:1), so this is not a contrast-ratio bug. It is a structure bug: dark text floats on a muddy, shifting field between white cards that barely separate from it (card to page is under 1.1:1 luminance). The Claude Design boards never do this. In every mobile board the section title lives inside its card's header, the note lives in the card, and the page holds only the large title.

## 2. The six laws

1. **Text lives on a surface.** On phone, the only text allowed directly on the page is the large title and its one context line. Section titles, meta, notes, counts and captions go inside a card or a grouped list. No exceptions for "small" captions. One agreed exception, Nick's call on 31 Oct ("Keep as drawn"): the Stats page as drawn (v7) has no large title and puts section names such as "Overview" on the page. Build it as drawn.
2. **The page is one flat color.** No radial light, no paper tint, no wash behind content, in light or dark. The time-of-day light stays on the green frame (desktop sidebar and frame) where there is no body text.
3. **Depth comes from surfaces, not from color.** Cards separate from the page with a hairline ring plus a soft two-layer shadow, never with a colored border, a tinted fill or a gradient.
4. **No accent left-border cards, ever** (Nick, Oct 24). No thick left rule, no colored edge bar, no stripe. Status shows as a dot, a chip or colored text.
5. **One feature card per view.** Deep green, used once, for the single most important thing on the screen. Everything else is paper.
6. **Organized, airy, visual first** (Nick, 31 Oct, on the first Stats page: "too busy, complicated, and not airy modern and visual", then "Not fewer. Just better organized."). Keep all the content; organize it so the screen reads calmly:
   - Group by question. Related figures share one card under one title; each group answers one question ("How am I scoring?", "Where do I gain and lose?", "Recent rounds"). Order the groups from the headline down to detail.
   - Clear hierarchy in every card: one lead visual or figure, then supporting figures smaller and quieter, then the note. The eye should land in one place first.
   - Picture first, words second: a chart, bar or ring carries the data, labels and sentences support it. On phone, prefer a chart or a grouped list over a table.
   - Generous, even spacing: 24pt between cards, 20pt card padding (list rows keep their 16pt inset), the hero chart at least 160pt tall. Same gaps on every screen so the rhythm is predictable.
   - Notes stay short (one or two lines) and inside their card.
   - Nothing is removed to get there. Where a group is long, it can collapse behind a "Show all" row or a segmented switch inside its card, but the content stays on the screen.

## 3. Color tokens

New semantic tokens sit on top of today's primitives in `tokens.css`. Names are the build brief's; values are final. Ratios are WCAG 2.x, measured against both the page and the card.

### Light

| Token | Value | Role | On page | On card |
|---|---|---|---|---|
| `--ch-grouped-bg` | `#F2F0E9` | Phone page, flat. Replaces workspace + light + paper on phone | | |
| `--ch-card-bg` | `#FFFEFB` | Cards and grouped lists | | |
| `--ch-well-bg-flat` | `#F6F4EE` | Recessed wells inside a card (evidence, segmented track) | | |
| `--ch-text-primary` | `#1C1B18` (ink 900) | Titles, values | 15.1 | 17.1 |
| `--ch-text-secondary` | `#46433D` (ink 600) | Meta, notes, row subtitles | 8.6 | 9.8 |
| `--ch-text-tertiary` | `#5F5C55` (ink 500) | Axis labels, timestamps only | 5.9 | 6.6 |
| `--ch-gain` | `#14613D` | Gains, positive deltas | 6.6 | 7.4 |
| `--ch-loss` | `#9A5700` | Losses, below benchmark (amber, not brown) | 4.9 | 5.6 |
| `--ch-flag` | `#B3261E` | Under par only | 5.7 | 6.5 |
| `--ch-accent` | `#155A39` | Links, active tab, primary button fill | 7.2 | 8.2 |
| `--ch-separator` | `rgb(28 27 24 / 0.10)` | Row hairlines, inset 16px from the leading edge | | |
| `--ch-card-ring` | `rgb(28 27 24 / 0.07)` | 1px ring around every card | | |

### Dark

| Token | Value | On page | On card |
|---|---|---|---|
| `--ch-grouped-bg` | `#0E120F` | | |
| `--ch-card-bg` | `#191E1A` | | |
| `--ch-well-bg-flat` | `#141815` | | |
| `--ch-text-primary` | `#F1ECDF` | 16.0 | 14.3 |
| `--ch-text-secondary` | `#D0C9B8` | 11.5 | 10.3 |
| `--ch-text-tertiary` | `#ADA697` | 7.8 | 7.0 |
| `--ch-gain` | `#7CC79B` | 9.4 | 8.5 |
| `--ch-loss` | `#E7AE57` | 9.5 | 8.5 |
| `--ch-flag` | `#F28B7D` | 7.9 | 7.1 |
| `--ch-accent` | `#7CC79B` | 9.4 | 8.5 |
| `--ch-separator` | `rgb(241 236 223 / 0.10)` | | |
| `--ch-card-ring` | `rgb(255 255 255 / 0.06)` | | |

Rules:
- Body and meta text use primary or secondary only. Tertiary is for axis labels and timestamps, never for a sentence.
- Target 4.9:1 for all text, floor 4.5:1, 3:1 for chart marks and control borders, checked in light and dark against the surface the text actually sits on.
- Color law from the Claude Design system holds: red means under par and nothing else; gains green; losses amber; over par on a scoreboard is ink.
- No pale mint highlight fills (the Stats "Team total" row). A summary row is a summary by weight and a top rule, not by tint.

## 4. Surfaces

| Surface | Light | Dark | Radius | Use |
|---|---|---|---|---|
| Card | `--ch-card-bg`, 1px `--ch-card-ring`, shadow `0 1px 2px rgb(28 25 18/.05), 0 8px 20px -12px rgb(28 25 18/.12)` | ring only plus `0 1px 0 rgb(255 255 255/.04) inset` | 16 | Every content group |
| Grouped list | Card with rows; no inner cards | same | 16 | Settings-like lists, roster, classes |
| Well | `--ch-well-bg-flat`, `inset 0 1px 2px rgb(28 25 18/.06)` | `--ch-well-bg-flat` | 12 | Segmented track, evidence band, search field |
| Feature card | `--ch-green-800 #0B3A25`, flat (no radial light; SHARED-2 allows no gradient but the segmented chip; fixed 4 Nov, completeness pass); text `#F4F1E8` (9.1:1 on the green) | `#123D29` | 16 | Once per view |
| Sheet | `--ch-card-bg`, top radius 20, grabber 36x5 | `#1B201C` | 20 | Modals, pickers |
| Glass | `rgb(253 251 247 / 0.78)`, `backdrop-filter: blur(24px) saturate(170%)`, bottom hairline appears only once content scrolls under | `rgb(22 27 23 / 0.74)` | n/a | Nav bar, tab bar, composer, menus. Never behind data |

Card anatomy (the fix for Nick's screenshot):
```
┌─────────────────────────────────────────┐
│ Strokes gained by leg     Per round · vs Tour │  ← header: title 17/600 primary, meta 15/400 secondary, 16px pad
│─────────────────────────────────────────│  ← hairline, inset 16
│  body rows …                              │
│─────────────────────────────────────────│
│ Three legs are losing strokes: Approach,  │  ← note: 15/400 secondary, inside the card
│ Around green and Putting.                 │
└─────────────────────────────────────────┘
  Hole stats from 56 of 70 rounds            ← NOT allowed on the page. Moves into the card's note.
```

## 5. Phone page anatomy

1. **Top bar: today's green bar, on every section, unchanged** (Nick, 31 Oct: the real phone top bar is the green bar with the section switcher on the left and the bell on the right, and every redesign keeps it). Same spec as `CLASSES_ROSTER_HOME_IMPLEMENTATION.md` section 2, which matches today's app:
   - Bar: `--ch-frame` (#0a331f light, #08150e dark), about 98pt tall including the status bar. No glass, no hairline.
   - Left: the section name is the switcher ("Stats ⌄", "Roster ⌄"), 16px from the edge, 18pt semibold in on-green ink `#f4eedd` (12.0:1 light, 16.1:1 dark), with the chevron and the champagne dot (news in another section) after it. It opens the section strip (`docs/clubhouse/phone/section-strip.md`, approved 12 Oct).
   - Right: the bell with its count badge, or the page's own action in its place where the page has one today (+ on Classes, add-player on Roster). Bare 44pt icons in `rgb(240 233 214 / .86)` (8.9:1).
   - Sheet: the flat page (`--ch-grouped-bg`, the parchment) tucks under the bar with today's 16px rounded lip (the mask on `PhoneTop`). No green fading into a beige wash.
   - On scroll the bar stays put and keeps its title; only a soft 14px shade fades in under it after 8px.
   - Pushed pages (player profile): same green bar, "‹ Roster" in champagne on the left, the page's name centred in on-green ink, a more button on the right.
   - Home: the same green bar with the team mark and "Home ⌄", over the flat deep green hero.
   - Code: `shell/phone-chrome.tsx`, `ui/PhoneBar.tsx`, `PhoneTop`, the section switch. The refresh changes nothing about the bar's look, gestures or contents. No ivory or glass bar replaces it.
2. **Large title** (optional per screen, 34pt `--ch-type-large-title`) on the sheet under the bar, as the page's heading. It opens nothing; the bar's title is always visible above it. On scroll it shrinks about 14% and fades; nothing moves into the bar. Reduce Motion: fade only.
3. **Context line** under the large title: 15pt secondary, one line ("Varsity · 7 active · countable rounds").
4. **Controls** (the green segmented) directly under the context line, sticky under the green bar when scrolled, on the page colour.
5. **Cards**, 24pt apart, grouped by question (law 6).
6. **No tab bar.** The phone uses the section strip; nothing sits at the bottom except the Resume round accessory and a page's thumb dock, as today.

Edges: 16px page edge, 20px on large phones (≥ 414pt wide), already `--ch-page-x-phone` → `--ch-space-5` in the `@media (min-width: 414px)` block in `tokens.css`. Rows inside a card pad 16px. Minimum touch target 44x44.

## 6. Type

Instrument Sans only (`--ch-font-sans`). Every size scales with iPhone Text Size through `--ch-type-k` (from `-apple-system-body`, capped at XXL), as it does today. No tracked caps, no serif, sentence case everywhere.

| Role | Token | Size/leading (at default Text Size) | Weight |
|---|---|---|---|
| Large title | `--ch-type-large-title` | 34/41 | 600, width 88, −0.034em |
| Bar title | `--ch-type-bar-title` | 17/22 | 600 |
| Card title | `--ch-type-card-title` | 17/22 | 600 |
| Body | `--ch-type-body-l` | 16/24 | 400 |
| Row title | new `--ch-type-row` | 16/21 | 500 |
| Meta, notes, subtitles | new `--ch-type-meta` | 15/20 | 400, secondary |
| Caption (axis, time) | `--ch-type-caption` | 13/18 | 400, tertiary |
| Hero figure | new `--ch-type-figure-hero` | 40/1 | 500, width 92, −0.04em, tabular |
| Row figure | new `--ch-type-figure` | 17/1 | 600, tabular |

Numbers: tabular figures everywhere, a true minus (−), "E" for even, "—" for no data, window and sample stated ("Last 10 rounds · 142 shots"). The Stats hero drops from about 64pt to 40pt: one number per card is the headline, it should not shout.

## 7. Lists and rows

- Row height 52 (single line) or 64 (two lines); hairline separator inset 16 from the leading edge, none after the last row.
- Leading: 32pt avatar coin or 28pt icon tile. Trailing: value, then chevron (13pt, tertiary) when the row opens something.
- Pressed state: `--ch-ink-900` at 5% wash, no scale on full-width rows.
- Swipe actions (existing `SwipeRow`) keep their springs.
- Summary row (team total): 600 weight, a full-width top hairline at 16% ink, no fill.

## 8. Motion

One motion set, already in `tokens.css`; this file fixes which to use where.

| Moment | Duration | Easing | Notes |
|---|---|---|---|
| Press (buttons, cards that open) | 110ms down, 280ms release | `--ch-ease` | Scale 0.97 on buttons and tappable cards; rows wash instead |
| Tab switch | 260ms | crossfade, `--ch-ease` | Content only; bars do not move |
| Push to detail | 462ms | `--ch-ease-spring-smooth` (the `linear()` spring) | Incoming slides 100% → 0, outgoing to −24% (`CH_UNDERLAY_SHIFT` 0.24; `--ch-vt-parallax` moves to −24% in PR 1) and dims to 0.9 |
| Sheet up | 462ms spring; down 280ms `--ch-ease` | | Follows the finger; velocity hands off to the spring |
| Segmented thumb | 360ms | `--ch-ease-spring` (slight overshoot) | Thumb slides, label weights cross-fade |
| Large title on scroll | scroll-linked | none | Title scales to 86% and fades as it scrolls under; nothing moves into the green bar, whose title is always shown; the 14px shade fades in under the bar after 8px. Reduce Motion: fade only |
| Chart marks | 360ms once, when first scrolled into view | `--ch-ease` | Bars grow from the zero axis; never on re-render, never count-ups. Marks inside the shared read sheet and other sheets are drawn at rest (completeness pass, 4 Nov) |
| New message, new row | 260ms | spring | Height opens, then content fades and rises 6px |

Reduce Motion: every duration above goes to 0 except crossfades, which become opacity only (no movement) over `CH_FADE_MS` (180ms today, owner decision of 24 Oct, pinned by `reduced-motion.test.tsx`). Any lane file that says 120ms for the Reduce Motion crossfade means `CH_FADE_MS`. Today's override block at `tokens.css` 1094–1108 already zeroes them; add the 120ms crossfade exception.

Frame budget: animate only transform and opacity. No animated blur, no animated box-shadow on scroll.

## 9. Components every thread uses

- **Card** = today's `ui/Surface.tsx` (`title`, `subtitle`, `actions`, `footerNote`). The note moves into `footerNote`; that is the whole fix for most caption-on-page cases.
- **Section on phone**: `ui/Section.tsx` keeps its API, but on phone (≤ 820px) its head renders as the card header of the first card inside it, or as a grouped list header inside the list's card. Desktop keeps the flush Ledger head, on a flat canvas.
- **Feature card**: once per view, `--ch-feature-bg`, flat. No radial light (SHARED-2; fixed 4 Nov, completeness pass).
- **Segmented**: today's `ui/Segmented.tsx` and `.ch-seg` in `controls.css`, unchanged in look: a recessed well (`--ch-well-bg`) with the green chip (`--ch-seg-on-bg`, keeping its top-to-bottom shade, Nick's 16 Oct call and the one allowed exception to the no-gradient rule) and an ivory label (9.6:1). Nick approved this on the Roster sort (Avg / SG / Name). Every segmented control in the refresh uses it, including the Stats window switch (the Stats page drew a paper thumb; build it green). It sits in the sticky bar under the large title with no "Sort by" label.
- **Summary to detail (the Stats pattern)** (Nick, 31 Oct: "they should be able to tap on the summary that has a visual in each stats tab, and then the detailed version with other visuals as well"; desktop production already does this with Overview zones opening Game detail at that leg). Each area gets one summary card: title, the lead figure, one visual, a one-line note, and a chevron. The whole card is the tap target (press 0.97), and it pushes that area's detail page: the same green bar with "‹ Stats" in champagne and the area's name centred, then the area's full set of visuals, grouped by question as law 6 says. Back returns to the summary at the same scroll. Nothing is cut: the summary is the way in, the detail holds everything. Use it wherever a screen has areas with deeper data (Stats first; any later screen with the same shape).
- **Chips**: status as text on a 10% tint of its own color, 7 radius, 13/600. Never a colored edge.
- **Empty and failed states**: inside the card that would have held the data, not floating on the page.

## 10. Banned list (check every design and PR against it)

- Text directly on the phone page other than the large title and its context line
- Radial light, paper tint or any gradient behind text
- Accent left-border or colored edge cards
- Pale mint or tinted highlight rows
- Brown for losses (use `--ch-loss` amber)
- Tracked uppercase, serif, emoji
- Count-up numbers, entrance staggers on page load
- Glass behind data
- Replacing or restyling the green top bar
- Loose cards with no grouping, uneven gaps, captions over two lines, tables on phone (law 6)

## 11. Hand-off

- Threads: build your pages to this file. If you need a token that is not here, name it in your report and I'll add it so all four stay in step.
- Build brief: `BUILD_BRIEF.md` in this folder (next), PR-sized and in order, starting with the page background, which takes the gradient off every screen at once. Moving text into cards is per screen (only 17 files use `ui/Section.tsx`), so each redesign PR moves its own. The 34 screens no redesign covers are listed under "Later" at the end of the brief.
- Nothing here changes what shot tracking collects.

## Adopted from threads

Approved by Nick on 31 Oct (Classes, Roster and coach Home page), plus the phone Stats page. These are now part of the language.

**Class-year colours** (avatars, leader cards, class-mix bar, year chip). White initials on the fill. Coaches and unknown years keep the neutral coin.

| Token | Light | White on it | Dark | White on it |
|---|---|---|---|---|
| `--ch-yr-sr` Senior | `#1F6B45` | 6.5 | `#2A7A51` | 5.3 |
| `--ch-yr-jr` Junior | `#3D6787` | 6.0 | `#46739A` | 5.0 |
| `--ch-yr-so` Sophomore | `#86672C` | 5.3 | `#8F6E31` | 4.7 |
| `--ch-yr-fr` Freshman | `#9A4A35` | 6.2 | `#A3533E` | 5.4 |

A year-coloured surface (leader card) is the year colour at 11% over `--ch-card-bg` with a 24% ring of it. Text on it stays primary and secondary ink.

**Class tones** (Classes binders, ribbon, dots): five muted pairs, tint plus ink, every ink over 5.4:1 on its tint and primary ink over 12.9:1. Light tint / ink: mist `#DCE2E3`/`#3E5055`, clay `#EBDDD3`/`#6A4A3C`, sand `#EFE6D2`/`#6B5A33`, stone `#E5E2DB`/`#4F4B43`, sage `#DEE5D9`/`#3F5444`. Dark pairs are in the Classes page's `:root[data-theme=dark]` block. These are colour fills of a whole card, not edges, so law 4 holds.

**Green team card**: the Roster's feature card (team, "7 active · 1 injured" with injured counted as active, class-mix bar, top five; practice rounds never count toward averages, leaders or the top five). It is that view's one feature card.

**Leader cards**: a horizontal snap row of three year-coloured cards (best average, best SG, most improved) under the team card on phone; across the top on desktop.

**Chart marks** (from the Stats page): bar fills a step stronger than text tones so marks hold 3:1 on their track. Light: gain fill `#1F6B45`, loss fill `#B86F0C`, neutral `#6B675F`, track `#EBE5D8`, zero rule `#5F5C55`. Dark: `#4FA877`, `#E09A35`, `#A39D90`, `#2C322D`, `#ADA697`. Steady sparklines use the neutral ink (5.6:1), turning green or amber only when the change is past its likely error.

**Feature card text** on the green: primary `#F4F1E8`, secondary `#D3D9CB`, gain `#8FD3AA`, loss `#EDB867`, under par `#F49A8D`.

**Home**: player and coach Home both keep the green bar and the flat deep green hero under it (no glow behind text), greeting at 34pt, hero bottom radius 24, and an ivory lip into the flat page. On Home the bar takes `--ch-frame` too (the hero-mode bar rule in shell.css), so bar and hero read as one green. Every other section keeps the same green bar with its switcher and bell; the page under it is flat.

**Settled from the Classes thread's open calls** (31 Oct): the phone keeps the section strip, no tab bar; year colours replace the B19 id tone for players whose year is known; the green segmented chip keeps its shade; tinted identity cards (class binders, leader cards) count as identity, not a second card style, and the one-feature-card rule still holds. Settled at 13:47: no Captain tag; a plain "Injured" chip with no date; nothing on Classes without a source (no finals, holidays or travel); desktop drops the "Needs a look" strip.

**Completeness pass, 4 Nov 2026** (every lane checked so one agent can build it all; full list in `COMPLETENESS.md`):
- Practice groups D to F (N-00 allows six): D slate `--gD` #435466 with a white letter (7.78:1), dark #9FB0C2 with a #0E120F letter (8.51:1), tint #E8ECF0 / #1F252B; E and F the neutral coin #5F5C55 (white 6.67:1), dark #ADA697 (#0E120F 7.8:1), tint #EFEDE7 / #24261F. Groups are always told apart by their letter, never by colour alone. A to C as before (C plum).
- Feature cards are flat: no radial light anywhere (SHARED-2).
- Breakpoints: phone up to 820 (`useChPhone()`); above that, desktop. Between 821 and the full layout each lane's 05 gives its narrow-desktop rule (rails fold or overlay, panes become pushes): Team, Read and Lenses go full at 1180, Ask at 1280, Documents per N-10 §12.14. Desktop captures stay at 1280.
- XXL Text Size is `--ch-type-scale` 1.36. Where a lane file says 1.35 or 1.353, read 1.36.
- Motion clip checks compare springs and curves against `tokens.css` and `lib/motion.ts`, never against a design page's `linear()` strings.

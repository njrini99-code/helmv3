# 06. CoachHelm Ask: screen specs

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 44 rows: 12 pieces and 32 ID specs).

> Wiring, 4 Nov 2026: see the section of that name at the end of this file.

Element specs for every ID in `05-SCREENS.md`, built from the design page v12 (https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA). Each ID lists the pieces it shows (E-codes), in the order they sit on screen, then the copy that is specific to it, the data it reads and a redline of 5 to 10 numbers. The pieces are specified once, in the library below, with box, type, colour token (light / dark hex), contrast, icon, hit area and data. Tokens are the app's (`tokens.css`); the page-to-app map is in 04. Every contrast figure is light / dark from `capture/contrast-table.txt`.

Rules that hold for every piece, so they are not repeated: sizes are points at Text Size default and scale with `--ch-type-scale` (XXL 1.353); spacing does not scale. Sentence case everywhere, no tracked uppercase. Every hit area is at least 44×44; where a piece is drawn smaller the build met with a transparent `::after` inset to 44×44 (no layout change). Copy is the page's at the anchor; where an ID lists copy below, that wording is the one to build.

## Piece library

### E-BAR: Green phone bar (unchanged, SHARED-1)

| | Spec |
|---|---|
| Box | status area 47 (device), bar 50 tall, padding 0 6 0 16; switcher left, actions right |
| Type | switcher "CoachHelm ⌄" 19×k / 600, tracking -0.01em, sentence case |
| Colour | bar `--ch-frame` #0a331f / #08150e; title `--ch-on-green-ink` #f4eedd / #f4eedd; icons `--ch-on-green-ink-soft` rgb(240 233 214/.86) / rgb(240 233 214/.86); news dot 7 `--ch-champagne-500` #D8B871 / #D8B871 |
| Contrast | Green bar title (onframe on frame): 12.03 / 16.12; Green bar icons and desktop nav (onframe2 on frame): 8.88 / 11.52; Badge count (#1C1B18 on champ): 9.03 / 9.03 |
| Icon | chevron 15 at 85%; bell 22 in a 44×44 button, badge 17 tall radius 9, 11/700 |
| Hit | bell and switcher 44×44 |
| Data | badge count from today's notifications (unchanged) |

Redline: bar height 50 under the 47 status area; switcher left inset 16; bell button 44×44.

### E-SHEET: Parchment sheet and Board | Ask segmented

| | Spec |
|---|---|
| Box | sheet radius 16 16 0 0 tucked under the bar; segmented row padding 12 16 8, two equal columns, button padding 8 |
| Type | segment labels 15 / 500, on segment 600 |
| Colour | sheet `--ch-grouped-bg` #F2F0E9 / #0E120F; on segment green shade `--ch-accent` #155A39 / #7CC79B with `--ch-bubble-mine-ink (Messages 11a)` #F7F4EA / #F1ECDF label |
| Contrast | Segmented on label (#F7F4EA on #155A39): 7.47 / 7.47; Segmented on label (#F7F4EA on #1d6a45, top of shade): 5.96 / 5.96 |
| Icon | none |
| Hit | each segment full half width, 44 tall with its padding |
| Data | none |

Redline: sheet top radius 16; segmented padding 12 16 8; segment height 44.

### E-SCOPE: Scope line (phone)

| | Spec |
|---|---|
| Box | centred row, gap 6, padding-bottom 6 |
| Type | 13 / 400, scope name 600; one line, ellipsis at the end |
| Colour | `--ch-text-secondary` #46433D / #D0C9B8; name `--ch-text-primary` #1C1B18 / #F1ECDF |
| Contrast | Secondary on page (scope line, home context line): 8.64 / 11.45; Body text on page (home greeting, history rows): 15.10 / 16.01 |
| Icon | none |
| Hit | not interactive on phone |
| Data | scope of the chat: team or player and window (03 H1, P1, PY1) |

Redline: scope type 13; gap to thread 6.

### E-THREAD: Thread column

| | Spec |
|---|---|
| Box | phone padding 8 16 140 (bottom clears the composer), gap 22 between turns; desktop padding 28 and side max(28, (100% - 680)/2) so the column is at most 680, bottom 150 |
| Type | none of its own |
| Colour | transparent on `--ch-grouped-bg` #F2F0E9 / #0E120F |
| Contrast | none |
| Icon | none |
| Hit | none |
| Data | none |

Redline: thread side inset 16 (20 at 430); turn gap 22; desktop column max 680.

### E-USER: Coach or player bubble

| | Spec |
|---|---|
| Box | right aligned, hug, max width 84%; padding 9 15; radius 20 20 6 20 |
| Type | 16×k / 1.4, 400; wraps, never truncates |
| Colour | fill vertical gradient `--ch-bubble-mine-bg (top)` #155A39 / #1F4D35 to `--ch-bubble-mine-bg (bottom)` #0F4A2E / #173D2A; text `--ch-bubble-mine-ink (Messages 11a)` #F7F4EA / #F1ECDF; inset top highlight 1px white 16%; shadow `--ch-elevation-bubble-mine` |
| Contrast | User bubble text, top of gradient: 7.47 / 8.20; User bubble text, bottom of gradient: 9.36 / 10.25 |
| Icon | none |
| Hit | long press opens Copy (today) |
| Data | the typed question, verbatim |

Redline: bubble max width 84%; padding 9 15; tail corner radius 6 bottom right.

### E-CARD: Answer card (one per turn)

| | Spec |
|---|---|
| Box | fill width; radius 22; padding 16 18 14; gap 14 between its parts; inner cards (tool, artifact, confirm, brief) radius 18 with a 0.5 hairline |
| Type | header "CoachHelm" 15 / 600 beside the 26 mark |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; shadow `--ch-elevation-bubble` (three drop shadows); inner hairline `--ch-border-hairline` rgb(28 27 24/.14) / rgb(241 236 223/.14) |
| Contrast | Body text on card: 17.08 / 14.34 |
| Icon | CoachHelm mark 26 circle in `--ch-feature-bg` #0B3A25 / #123D29 with a 16 glyph in `--ch-champagne-500` #D8B871 / #D8B871; it turns (2.4s linear) while the turn is busy |
| Hit | none (the card is not a button) |
| Data | none |

Redline: card radius 22; card padding 16 18 14; part gap 14; mark 26.

### E-PROSE: Answer prose

| | Spec |
|---|---|
| Box | fill width |
| Type | 16×k / 1.55, 400; bold 600; figures tabular 600; wraps |
| Colour | `--ch-text-primary` #1C1B18 / #F1ECDF; losses `--ch-loss` #9A5700 / #E7AE57; gains `--ch-gain` #14613D / #7CC79B |
| Contrast | Body text on card: 17.08 / 14.34; Loss figures on card: 5.57 / 8.53; Gain figures on card: 7.42 / 8.45 |
| Icon | none |
| Hit | none |
| Data | every figure traces to a read cited by a chip in the same sentence (03 §13) |

Redline: prose 16 / 1.55.

### E-STEPS: Steps (kit ①)

| | Spec |
|---|---|
| Box | no card of its own inside the answer card; row grid 20 + 10 gap + text, min height 32, padding 6 0; folded line padding 2 0 6 with a 16 chevron |
| Type | label 15 / 400; detail 14; folded line 15 with the count 600; label present tense while active, past tense plus one fact when done |
| Colour | active label `--ch-text-primary` #1C1B18 / #F1ECDF with a shimmer to `--ch-text-tertiary` #5F5C55 / #ADA697; done label `--ch-text-secondary` #46433D / #D0C9B8; done detail `--ch-text-tertiary` #5F5C55 / #ADA697; check `--ch-gain` #14613D / #7CC79B; dot `--ch-accent` #155A39 / #7CC79B; failed ring `--ch-loss` #9A5700 / #E7AE57 |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99; Active step dot (accent on card): 8.15 / 8.45; Failed step ring (loss on card): 5.57 / 8.53 |
| Icon | glyph box 20; active dot 8 breathing to 0.6; done check 14 drawn in 240ms; failed amber ring with a bar 18 |
| Hit | folded line is a full-width button 44 tall |
| Data | one row per announced `data-progress` part; detail is the fact the read returned |

Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### E-SKEL: Tool card skeleton

| | Spec |
|---|---|
| Box | card radius 18; padding 16; bars 12 tall radius 6, gap 9, widths from the block type |
| Type | none |
| Colour | bars `--ch-chart-track` #EBE5D8 / #2C322D with a sweep to `--ch-well-bg-flat` #F6F4EE / #141815 (1.2s linear loop, stops under Reduce Motion) |
| Contrast | marks only, no text |
| Icon | none |
| Hit | none |
| Data | shape per block type (bars, dots, line, strip) |

Redline: skeleton padding 16; bar height 12, gap 9.

### E-VCARD: Tool card (visual)

| | Spec |
|---|---|
| Box | fill; radius 18 in the answer card; header padding 14 16 10 with a separator under; body padding 12 16 6; footer padding 10 16 14, gap 6 10 |
| Type | title 17×k / 1.25 / 600, wraps; subtitle 14; footer 14; footnote 13; tags 13 / 600; chart labels 12 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; subtitle and footer `--ch-text-secondary` #46433D / #D0C9B8; footnote `--ch-text-tertiary` #5F5C55 / #ADA697; tags `--ch-well-bg-flat` #F6F4EE / #141815 with `--ch-text-secondary` #46433D / #D0C9B8; Hypothesis tag `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with `--ch-accent` #155A39 / #7CC79B; marks `--ch-chart-gain-fill` #1F6B45 / #4FA877, `--ch-chart-loss-fill` #B86F0C / #E09A35, `--ch-chart-flat` #6B675F / #A39D90 on `--ch-chart-track` #EBE5D8 / #2C322D, zero rule `--ch-chart-zero` #5F5C55 / #ADA697 |
| Contrast | Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Accent on accent tint over card (read chip on, Hypothesis tag, Draft chip done, location chip): 6.96 / 6.39; Loss fill on track: 3.15 / 5.52; Gain fill on track: 5.15 / 4.50; Neutral fill on track: 4.49 / 4.86; Zero rule and season tick on card: 6.61 / 6.99 |
| Icon | expand button 32 radius 9 in `--ch-well-bg-flat` #F6F4EE / #141815 with a 16 glyph in `--ch-text-secondary` #46433D / #D0C9B8 |
| Hit | expand 32 drawn, met with a transparent `::after` inset to 44×44 (no layout change); every bar and dot is a button with a hit of at least 44 tall |
| Data | the read the card draws (see this ID's data line) |

Redline: card radius 18; header padding 14 16 10; title 17; body padding 12 16 6; expand button 32.

### E-CITE: Read chip and popover

| | Spec |
|---|---|
| Box | inline pill after the sentence, margin-left 4, padding 4 8, radius 99, gap 4; popover 280 wide, radius 14, padding 12 14 |
| Type | chip 13 / 600, line height 1, one line; popover 14, title 15 / 600, rows `dt` / `dd` gap 4 12, values tabular |
| Colour | chip `--ch-well-bg-flat` #F6F4EE / #141815 with `--ch-text-secondary` #46433D / #D0C9B8 and a 0.5 hairline; on `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with `--ch-accent` #155A39 / #7CC79B; popover `--ch-card-bg` #FFFEFB / #191E1A, labels `--ch-text-tertiary` #5F5C55 / #ADA697, values `--ch-text-primary` #1C1B18 / #F1ECDF, "Open in Stats" `--ch-accent` #155A39 / #7CC79B |
| Contrast | Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Accent on accent tint over card (read chip on, Hypothesis tag, Draft chip done, location chip): 6.96 / 6.39; Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99; Accent links and labels on card (Open, Undo, hint, Change answers): 8.15 / 8.45 |
| Icon | chip glyph 12 |
| Hit | chip about 21 tall drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | read name, window, sample, computed time from `evidence_ref` (03 P8 to P10, P15) |

Redline: chip padding 4 8; chip type 13 / 600; popover width 280; popover padding 12 14.

### E-SRCS: Sources row and list

| | Spec |
|---|---|
| Box | row: button, gap 8, padding 4 0; stack of 20 circles overlapping 6 with a 2 page-colour border; list: well radius 12, padding 4 14; each source grid 24 + 10 gap, padding 10 0, separator between |
| Type | row 14; source title 15 / 600; detail 14; number tile 12 / 700 |
| Colour | row `--ch-text-secondary` #46433D / #D0C9B8; stack `--ch-feature-bg` #0B3A25 / #123D29 with `--ch-champagne-500` #D8B871 / #D8B871 glyph; list `--ch-well-bg-flat` #F6F4EE / #141815; number tile `--ch-card-bg` #FFFEFB / #191E1A |
| Contrast | Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Body text on well (pills, answer pills, mk chips): 15.66 / 15.20; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87 |
| Icon | stack glyph 11; actions (copy, thumbs) 16 in 32 buttons, `--ch-text-tertiary` #5F5C55 / #ADA697 |
| Hit | row 44 tall with its padding extended; action buttons 32 drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | one row per read cited in the answer |

Redline: stack circles 20, overlap 6; list radius 12, padding 4 14; source row padding 10.

### E-CHIPS: Follow-up chips

| | Spec |
|---|---|
| Box | wrap row, gap 8; chip radius 99, padding 8 14, gap 6 |
| Type | 15×k / 500; wraps inside the pill when longer than the row |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A with a 0.5 hairline and a 1pt shadow; glyph `--ch-accent` #155A39 / #7CC79B |
| Contrast | Body text on card: 17.08 / 14.34; Accent links and labels on card (Open, Undo, hint, Change answers): 8.15 / 8.45 |
| Icon | 14 glyph |
| Hit | chip 36 drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | three at most, each drawn from a read made in this turn |

Redline: chip padding 8 14; chip gap 8; chip type 15.

### E-ACARD: Artifact card

| | Spec |
|---|---|
| Box | grid 44 + 1fr + auto, gap 12, padding 12 12 12 14, radius 18; page tile 44×52 radius 9 |
| Type | title 16 / 600; status 14; Open 14 / 600 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; tile `--ch-well-bg-flat` #F6F4EE / #141815 with lines in `--ch-chart-track` #EBE5D8 / #2C322D and the first in `--ch-chart-gain-fill` #1F6B45 / #4FA877; status `--ch-text-secondary` #46433D / #D0C9B8; Open `--ch-accent` #155A39 / #7CC79B on `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) radius 8 padding 6 10; writing scan line `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Accent on accent tint over card (read chip on, Hypothesis tag, Draft chip done, location chip): 6.96 / 6.39 |
| Icon | page tile drawn, no glyph |
| Hit | whole card is the button (at least 76 tall) |
| Data | plan title, status "Practice plan · 5 blocks · 2h 30m · version 1", then "saved in November" (03 PL11, PL24) |

Redline: card padding 12 12 12 14; tile 44×52; gap 12.

### E-CONF: Kit card: header and Draft chip

| | Spec |
|---|---|
| Box | fill; radius 18; header padding 14 16 10 with a separator under, gap 10; icon tile 32 radius 9 |
| Type | title 16 / 600; subtitle 14; Draft chip 12 / 600 padding 3 9 radius 99 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; icon tile `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with `--ch-accent` #155A39 / #7CC79B glyph; Draft chip `--ch-well-bg-flat` #F6F4EE / #141815 with `--ch-text-secondary` #46433D / #D0C9B8, then Added / Posted / Set on `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with `--ch-accent` #155A39 / #7CC79B |
| Contrast | Body text on card: 17.08 / 14.34; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Accent on accent tint over card (read chip on, Hypothesis tag, Draft chip done, location chip): 6.96 / 6.39 |
| Icon | flow glyph 17 in the 32 tile |
| Hit | header not interactive |
| Data | the tool's draft (`action-proposal` part) |

Redline: card radius 18; header padding 14 16 10; icon tile 32 radius 9; Draft chip 12 / 600.

### E-EVD: Kit draft well (fields)

| | Spec |
|---|---|
| Box | margin 14 16 6; grid 48 + 1fr, gap 12; radius 12; padding 12; fields gap 5, each min height 20 |
| Type | date tile weekday 12 / 700 tracking 0.04em, day 21 / 1.1; title field 16 / 600; other fields 15; each value clamps at 2 lines then ellipsis |
| Colour | `--ch-well-bg-flat` #F6F4EE / #141815 with a 1pt inset shadow; date tile `--ch-card-bg` #FFFEFB / #191E1A with `--ch-accent` #155A39 / #7CC79B weekday and `--ch-text-primary` #1C1B18 / #F1ECDF day; title `--ch-text-primary` #1C1B18 / #F1ECDF; fields `--ch-text-secondary` #46433D / #D0C9B8; "Not set" `--ch-text-secondary` #46433D / #D0C9B8; skeleton bars `--ch-card-bg` #FFFEFB / #191E1A at 90%; write head 2×16 caret `--ch-accent` #155A39 / #7CC79B |
| Contrast | Body text on well (pills, answer pills, mk chips): 15.66 / 15.20; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Accent on well (goal label): 7.48 / 8.96; Write head caret (accent on well): 7.48 / 8.96 |
| Icon | flow glyph 22 in the date tile when the draft has no date |
| Hit | each field is tappable to edit inline; rows reach 44 with the field gap extended |
| Data | each field from the draft; see this ID's data line |

Redline: well margin 14 16 6; well padding 12; date column 48; field gap 5; title 16 / 600.

### E-ONCF: On confirm line

| | Spec |
|---|---|
| Box | padding 6 16 0 |
| Type | 14, lead phrase 600 |
| Colour | `--ch-text-secondary` #46433D / #D0C9B8; lead `--ch-text-primary` #1C1B18 / #F1ECDF |
| Contrast | Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Body text on card: 17.08 / 14.34 |
| Icon | none |
| Hit | none |
| Data | who hears about it and when (from the tool's recipients) |

Redline: line padding 6 16 0; type 14.

### E-BTNS: Confirm row and capsule (kit ③ ④)

| | Spec |
|---|---|
| Box | padding 12 16 14, gap 8; Cancel ghost padding 9 10 radius 10; primary right aligned, padding 9 14, radius 10; capsule radius 99, padding 9 18, sweep bar 2 tall 40% wide at the bottom |
| Type | Cancel 15 / 500; primary 15 / 600, verb plus object; capsule label the flow's verb with an ellipsis ("Adding…") |
| Colour | Cancel `--ch-text-secondary` #46433D / #D0C9B8; primary `--ch-accent (button fill)` #155A39 / #7CC79B with `--ch-text-on-accent` #FFFEFB / #0E120F; capsule `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with `--ch-accent` #155A39 / #7CC79B, sweep `--ch-accent` #155A39 / #7CC79B |
| Contrast | Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Primary button label (onbtn on btn): 8.15 / 9.44; Capsule label (accent on tint over card): 6.96 / 6.39; Cancel after the confirm press (disabled, 50%): 2.57 / 3.57 (exempt (disabled)) |
| Icon | none |
| Hit | both buttons about 38 tall drawn, met with a transparent `::after` inset to 44×44 (no layout change); both lock after the first tap |
| Data | button label from the flow (this ID's copy line) |

Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### E-RCPT: Receipt and Undo (kit ⑤)

| | Spec |
|---|---|
| Box | replaces the confirm row; padding 12 16, separator above, gap 10; check disc 22; links padding 6, gap 6 |
| Type | line 15 / 600 (wraps to 2); sub 14; Open and Undo 14 / 600, never wrap |
| Colour | disc `--ch-accent` #155A39 / #7CC79B with a `--ch-card-bg` #FFFEFB / #191E1A check 13; sub `--ch-text-secondary` #46433D / #D0C9B8; links `--ch-accent` #155A39 / #7CC79B; Undo ring track `--ch-chart-track` #EBE5D8 / #2C322D, drain `--ch-accent` #155A39 / #7CC79B; undone line `--ch-text-secondary` #46433D / #D0C9B8 500 |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Accent links and labels on card (Open, Undo, hint, Change answers): 8.15 / 8.45; Undo ring drain (accent on card): 8.15 / 8.45; Undo ring track against card: 1.24 / 1.29 (exempt: track is decorative (the drain carries the meaning, 8.15/8.45)) |
| Icon | check 13 drawn in 240ms after 100ms; Undo ring 20 (r 10, dash 63) draining over 8s linear |
| Hit | Open and Undo about 26 tall drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | persisted `action-receipt`; time and place from the write |

Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### E-TOLD: Told row

| | Spec |
|---|---|
| Box | margin 0 16 14; padding 10 12; radius 14; gap 12; coins 28 overlapping |
| Type | 13; counts 600 |
| Colour | `--ch-well-bg-flat` #F6F4EE / #141815 with a 0.5 inset hairline; text `--ch-text-secondary` #46433D / #D0C9B8, counts `--ch-text-primary` #1C1B18 / #F1ECDF; coins in player colours with #fdfcf8 initials 10.5 / 700; before lighting 35% and desaturated; seen dot 9 `--ch-chart-gain-fill` #1F6B45 / #4FA877 |
| Contrast | Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Coin initials #fdfcf8 on #5B5F8F (MA): 5.88 / 5.88 and the other six coins 5.47 to 6.30; Told coin before it lights (initials at 35%): 2.07 / 2.07 (exempt: the unlit coin is a transitional frame) |
| Icon | private writes: a 24 tile with a lock glyph 14 instead of coins |
| Hit | not interactive |
| Data | delivery and seen events in arrival order (03 Told rows) |

Redline: told margin 0 16 14; padding 10 12, radius 14; coins 28.

### E-CXL: Cancelled

| | Spec |
|---|---|
| Box | replaces the confirm row; padding 12 16 14; the draft loses its colour (filter saturate(0)), never its opacity |
| Type | 15 |
| Colour | `--ch-text-secondary` #46433D / #D0C9B8 |
| Contrast | Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Cancelled draft, title (ink on well, saturate(0)): 15.66 / 15.20; Cancelled draft, secondary (ink2 on well, saturate(0)): 8.97 / 10.86. Text keeps full contrast because only colour is removed. |
| Icon | none |
| Hit | none |
| Data | none: nothing was written |

Redline: line padding 12 16 14; draft filter saturate(0), opacity 1.

### E-HS: Home surface preview (where it lands)

| | Spec |
|---|---|
| Box | margin 10 16 6; padding 12; radius 16; header gap 8, margin-bottom 10; rows min height 48, padding 7 10, radius 12, gap 6 |
| Type | header app 13 / 600, place 13; row title 14 / 600 one line ellipsis; row meta 12 one line ellipsis; status pill 11.5 / 600 |
| Colour | `--ch-grouped-bg` #F2F0E9 / #0E120F with a 0.5 inset hairline; header tile 24 `--ch-card-bg` #FFFEFB / #191E1A; rows `--ch-card-bg` #FFFEFB / #191E1A; row icon tile 28 `--ch-well-bg-flat` #F6F4EE / #141815; meta `--ch-text-secondary` #46433D / #D0C9B8; new row ring `--ch-accent` #155A39 / #7CC79B at 40%; slot row `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) pulsing |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87 |
| Icon | header 14, row 15 |
| Hit | not interactive inside the draft |
| Data | the real rows already in that tab (03 rows for this flow) |

Redline: surface margin 10 16 6, padding 12; row min height 48; row radius 12.

### E-INF: Worked out pills

| | Spec |
|---|---|
| Box | label row gap 7; pills wrap, gap 6; pill radius 12, padding 7 11 8 |
| Type | label 13 / 600 with a right-aligned 12 note; pill value 13.5 / 600; pill source 11.5 |
| Colour | label `--ch-text-secondary` #46433D / #D0C9B8, note `--ch-text-tertiary` #5F5C55 / #ADA697, glyph `--ch-accent` #155A39 / #7CC79B; pill `--ch-card-bg` #FFFEFB / #191E1A with a 0.5 hairline; value `--ch-text-primary` #1C1B18 / #F1ECDF; source `--ch-text-tertiary` #5F5C55 / #ADA697; edited pill ring 1.5 `--ch-accent` #155A39 / #7CC79B |
| Contrast | Body text on card: 17.08 / 14.34; Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25 |
| Icon | label glyph 15 |
| Hit | each pill is a button about 40 tall, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | each pill names its value and the read it came from |

Redline: pill padding 7 11 8; pill gap 6; value 13.5 / 600.

### E-QCARD: Brief card (Ask first, kit ⑥)

| | Spec |
|---|---|
| Box | radius 18; header padding 13 16 11, 0.5 hairline under, gap 10, icon tile 30 radius 9; dots 16×4 (current 24) gap 4; pane padding 16 16 4, gap 12; options gap 8, each radius 14 padding 12 13 gap 12; box 22 (round, multi radius 7); free line radius 14 padding 12 13 min height 46; footer padding 12 16 14 gap 8; folded summary padding 14 16, pills gap 6 radius 99 padding 5 11 |
| Type | header 15 / 600 with 13 / 500 count line; question 18×k / 1.25 / 600 tracking -0.015em; why 14; option 15×k with 13 detail; hint 12 / 600; Back 15 / 500; Skip 14 / 600; Next 15 / 600; pills 13 / 600; Change answers 14 / 600 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; icon tile `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14); dots `--ch-chart-track` #EBE5D8 / #2C322D, done and current `--ch-accent` #155A39 / #7CC79B; options `--ch-well-bg-flat` #F6F4EE / #141815 with a 0.5 hairline; picked `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with a 1.5 `--ch-accent` #155A39 / #7CC79B ring and an `--ch-accent` #155A39 / #7CC79B box with `--ch-text-on-accent` #FFFEFB / #0E120F check; why and details `--ch-text-secondary` #46433D / #D0C9B8; hint `--ch-accent` #155A39 / #7CC79B on `--ch-card-bg` #FFFEFB / #191E1A; Next `--ch-accent (button fill)` #155A39 / #7CC79B with `--ch-text-on-accent` #FFFEFB / #0E120F |
| Contrast | Body text on well (pills, answer pills, mk chips): 15.66 / 15.20; Ink on accent tint over card (picked option, chosen folder): 14.57 / 10.83; Accent links and labels on card (Open, Undo, hint, Change answers): 8.15 / 8.45; Primary button label (onbtn on btn): 8.15 / 9.44; Back on the first brief question (disabled, 40%): 2.07 / 2.76 (exempt (disabled)) |
| Icon | header glyph 16; check 13 |
| Hit | options 46 or more; Back, Skip and Next about 38 drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | questions only for what the reads could not settle; defaults from the reads (this ID's data line) |

Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### E-APANEL: Artifact pane and push screen

| | Spec |
|---|---|
| Box | desktop pane 452 wide beside the chat, left separator; phone push full screen from the right; header padding 12 12 12 18 (push 8 12 10 6) with a separator; body padding 14 18 18; footer padding 12 18 with a separator (push: glass dock, buttons flex 1, padding 12 14, radius 14) |
| Type | title 16 / 600 one line ellipsis (centred on the push); subtitle 13; version pill 13; "‹ Ask" 16 / 500; footer buttons 15 / 600 and 15 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; subtitle `--ch-text-secondary` #46433D / #D0C9B8; version pill `--ch-well-bg-flat` #F6F4EE / #141815; back `--ch-accent` #155A39 / #7CC79B; primary `--ch-accent (button fill)` #155A39 / #7CC79B with `--ch-text-on-accent` #FFFEFB / #0E120F; secondary `--ch-well-bg-flat` #F6F4EE / #141815; push dock `--ch-glass-bg (strong, add --ch-ak-glass-strong)` rgb(253 251 247/.9) / rgb(27 32 28/.88) |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Accent links and labels on card (Open, Undo, hint, Change answers): 8.15 / 8.45; Primary button label (onbtn on btn): 8.15 / 9.44 |
| Icon | back chevron 20; close 18 in a 36 button; version arrows 14 in 24 buttons |
| Hit | version arrows 24 drawn and close 36 drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | plan blocks, groups and why chips (03 PL10 to PL15) |

Redline: pane width 452; header padding 12 12 12 18; body padding 14 18 18; dock buttons padding 12 14 radius 14.

### E-PLAN: Plan content (hero and blocks)

| | Spec |
|---|---|
| Box | hero radius 16, padding 16, gap 10, timeline 10 tall radius 5 with 2 gaps; blocks card radius 16, each block grid 52 + 1fr, gap 12, padding 13 14, separator between |
| Type | hero title 20 / 600 tracking -0.015em; hero line 14; legend 12; block time 14 / 600 tabular with 12 length; block title 15 / 600; text 14; why 13; group chips 12 / 600 |
| Colour | hero `--ch-feature-bg` #0B3A25 / #123D29 with `--ch-feature-ink` #F4F1E8 / #F4F1E8 and `--ch-feature-ink-2` #D3D9CB / #D3D9CB; blocks `--ch-card-bg` #FFFEFB / #191E1A; length `--ch-text-tertiary` #5F5C55 / #ADA697; text `--ch-text-secondary` #46433D / #D0C9B8; chips `--ch-well-bg-flat` #F6F4EE / #141815 |
| Contrast | Feature ink on feature card (pulse, plan hero): 11.30 / 10.78; Feature secondary on feature card (pulse small, legend): 8.84 / 8.44; Body text on card: 17.08 / 14.34; Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99 |
| Icon | legend squares 8 radius 2 |
| Hit | Why chips as E-CITE |
| Data | 03 PL11 to PL14 |

Redline: hero padding 16; block padding 13 14; time column 52; block title 15 / 600.

### E-SAVE: Save to a folder card (kit ⑦)

| | Spec |
|---|---|
| Box | docked card radius 20 over a well dock (padding 10 12 12); row margin 8 16 4, padding 9 12, radius 14, gap 10, folder 30×24; list opens in place (height spring), items padding 8 10 radius 11 gap 10, folder 26×21, check 18; New folder name field radius 12 padding 6 6 6 10 with Create radius 9 padding 7 12 |
| Type | row 15: "Save to" 400, folder name 600 one line ellipsis, count 13; list 15 with 13 counts; New folder 15 / 600; Create 14 / 600 |
| Colour | row `--ch-well-bg-flat` #F6F4EE / #141815; label `--ch-text-secondary` #46433D / #D0C9B8; chosen item `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with an `--ch-accent` #155A39 / #7CC79B check; New folder `--ch-accent` #155A39 / #7CC79B; field `--ch-card-bg` #FFFEFB / #191E1A with a 1.5 ring of `--ch-accent` #155A39 / #7CC79B at 50%; folder art `add --ch-ak-fold-back` #CDBB8C / #6B6047 and `add --ch-ak-fold-front` #E6D8AF / #8A7C59 |
| Contrast | Body text on well (pills, answer pills, mk chips): 15.66 / 15.20; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Ink on accent tint over card (picked option, chosen folder): 14.57 / 10.83; Accent links and labels on card (Open, Undo, hint, Change answers): 8.15 / 8.45; document rows (not folders) at full opacity: Folder list document row (ink2 on card, full opacity): 9.77 / 10.25, icon Folder list document icon (ink3 at 70% on card): 3.30 / 4.12 |
| Icon | chevron 16 turning 180° when open; check 16; document rows 20 glyph in a 40×32 box at 70% |
| Hit | row 44 with padding; list items 38 drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | folders with counts (03 PL23); default last folder used |

Redline: row margin 8 16 4, padding 9 12; folder art 30×24; list item padding 8 10; Create padding 7 12.

### E-FPICK: Publish sheet

| | Spec |
|---|---|
| Box | sheet inset 8 from the pane edges, radius 30 30 34 34, max height pane minus 40; grabber 36×5; header padding 10 18 8 with a 38×46 page thumb; footer 0.5 hairline above, padding 10 16 16, gap 8 |
| Type | title 17×k / 600; subtitle 13; buttons 15 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A with `--ch-shadow-float`; scrim `--ch-push-dim` rgb(14 12 8/.32) / rgb(0 0 0/.5); grabber `--ch-border-hairline at 8% (add --ch-ak-hair-2)` rgb(28 27 24/.08) / rgb(241 236 223/.08); thumb `--ch-feature-bg` #0B3A25 / #123D29 |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Primary button label (onbtn on btn): 8.15 / 9.44 |
| Icon | none |
| Hit | buttons as E-BTNS |
| Data | recipients from the roster (03 PL25) |

Redline: sheet inset 8; sheet radius 30 30 34 34; thumb 38×46.

### E-HOME: Ask home (empty thread)

| | Spec |
|---|---|
| Box | gap 14, padding-top 8; greeting gap 4; pulse radius 20 padding 16 gap 10, rows gap 10 with 8 dots; suggestions card radius 20, rows padding 13 14, gap 12, separator between |
| Type | greeting 26×k / 1.15 / 600 tracking -0.025em; context 15; pulse 15 with 13 footnote; suggestion 15 with 13 tag |
| Colour | greeting `--ch-text-primary` #1C1B18 / #F1ECDF and context `--ch-text-secondary` #46433D / #D0C9B8 on `--ch-grouped-bg` #F2F0E9 / #0E120F; pulse `--ch-feature-bg` #0B3A25 / #123D29 with `--ch-feature-ink` #F4F1E8 / #F4F1E8 and `--ch-feature-ink-2` #D3D9CB / #D3D9CB; suggestions `--ch-card-bg` #FFFEFB / #191E1A, glyph `--ch-accent` #155A39 / #7CC79B, tag `--ch-text-tertiary` #5F5C55 / #ADA697 |
| Contrast | Body text on page (home greeting, history rows): 15.10 / 16.01; Secondary on page (scope line, home context line): 8.64 / 11.45; Feature ink on feature card (pulse, plan hero): 11.30 / 10.78; Feature secondary on feature card (pulse small, legend): 8.84 / 8.44; Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99 |
| Icon | suggestion glyph 18 |
| Hit | each suggestion row 46 or more, full width |
| Data | 03 H1 to H4 (coach), H5 to H8 (player) |

Redline: greeting 26 / 600; pulse padding 16 radius 20; suggestion row padding 13 14.

### E-COMP: Composer

| | Spec |
|---|---|
| Box | pinned bottom over a page-colour fade (padding 10 12 22 on phone; desktop centred to 680, padding 12 and 14); glass box radius 26, padding 8 8 8 14, gap 4; scope chips gap 6; buttons 38 circles |
| Type | input 16×k, one line with ellipsis for the placeholder; scope chips 13 / 600; desktop disclaimer 12 |
| Colour | box `--ch-glass-bg (strong, add --ch-ak-glass-strong)` rgb(253 251 247/.9) / rgb(27 32 28/.88) with blur 24 and saturate 170% and `--ch-shadow-float`; placeholder `--ch-text-tertiary` #5F5C55 / #ADA697, typed `--ch-text-primary` #1C1B18 / #F1ECDF; caret `--ch-accent` #155A39 / #7CC79B; chips `--ch-well-bg-flat` #F6F4EE / #141815 with `--ch-text-secondary` #46433D / #D0C9B8; Send `--ch-accent (button fill)` #155A39 / #7CC79B with `--ch-text-on-accent` #FFFEFB / #0E120F; Stop `--ch-text-primary` #1C1B18 / #F1ECDF fill with `--ch-card-bg` #FFFEFB / #191E1A square; paused box at full opacity with Send on `--ch-chart-track` #EBE5D8 / #2C322D and its icon `--ch-text-tertiary` #5F5C55 / #ADA697 |
| Contrast | Composer text on glass over page: 16.50 / 14.28; Composer placeholder on glass over page: 6.39 / 6.96; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Primary button label (onbtn on btn): 8.15 / 9.44; Paused composer placeholder (ink3 on strong glass, box at full opacity): 6.39 / 6.96; Paused send button icon (ink3 on track): 5.31 / 5.42 |
| Icon | + and @ and Send 20 in 38 circles |
| Hit | buttons 38 drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | scope from the chat; paused state from the allowance bucket (03 LM4) |

Redline: box radius 26; box padding 8 8 8 14; buttons 38; bottom padding 22 on phone.

### E-MPOP: @ and / menu

| | Spec |
|---|---|
| Box | card radius 14 with `--ch-shadow-lg`; section label padding 10 14 4; rows padding 8 14, gap 10; avatar 28; action tile 28 radius 8 |
| Type | section label 13 / 600; row 15 with 13 detail; shortcut 13 / 600 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; label and detail `--ch-text-tertiary` #5F5C55 / #ADA697; highlighted row `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14); shortcut `--ch-accent` #155A39 / #7CC79B; action tile `--ch-well-bg-flat` #F6F4EE / #141815 |
| Contrast | Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99; Body text on card: 17.08 / 14.34; Ink on accent tint over card (picked option, chosen folder): 14.57 / 10.83 |
| Icon | action glyph 15 |
| Hit | rows 44 tall |
| Data | roster (players, class year) and the action list |

Redline: row padding 8 14; avatar 28; menu radius 14.

### E-DESK: Desktop shell and history rail

| | Spec |
|---|---|
| Box | sidebar 232 (unchanged); main radius 12; glass top bar 56 with a separator; history rail 248, padding 14 10, gap 2; New chat padding 9 12 radius 10; group label padding 10 10 4; rows padding 7 10 radius 8; CoachHelm knows card radius 12 padding 12, gap 6, pinned to the bottom |
| Type | top bar crumb 16 / 600; search 14; rail rows 15 one line ellipsis; group label 13; knows 14, title 600 |
| Colour | top bar `--ch-glass-bg` rgb(253 251 247/.80) / rgb(22 27 23/.78) blur 24; search `--ch-card-bg` #FFFEFB / #191E1A with `--ch-text-tertiary` #5F5C55 / #ADA697; rail on `--ch-grouped-bg` #F2F0E9 / #0E120F; current row `--ch-card-bg` #FFFEFB / #191E1A with ring; group label `--ch-text-tertiary` #5F5C55 / #ADA697; knows `--ch-card-bg` #FFFEFB / #191E1A with `--ch-text-secondary` #46433D / #D0C9B8 |
| Contrast | Desktop top bar search placeholder (ink3 on card): 6.61 / 6.99; Body text on page (home greeting, history rows): 15.10 / 16.01; Tertiary on page (desktop disclaimer, history "Today"): 5.85 / 7.80; Desktop nav active (#0a331f on 95% ivory over frame): 10.99 / 10.87; Desktop nav group label (240 233 214 at 72% on frame): 6.68 / 8.31 |
| Icon | nav 18; New chat 16; search 15 |
| Hit | rail rows 36 drawn: rows are full-width so the 44 rule is met with 4 extra padding in the build |
| Data | chats grouped by day; facts the coach wrote (03 K2, K3) |

Redline: sidebar 232; top bar 56; rail 248; thread column max 680; pane 452 when open.

### E-TONE: Tone control

| | Spec |
|---|---|
| Box | segmented three options; sample text below, min height 150 |
| Type | segments 15; sample 16 / 1.55 |
| Colour | segmented as E-SHEET; sample `--ch-text-primary` #1C1B18 / #F1ECDF |
| Contrast | Segmented on label (#F7F4EA on #155A39): 7.47 / 7.47; Body text on card: 17.08 / 14.34 |
| Icon | none |
| Hit | segments 44 tall |
| Data | per-chat tone (HM2); wording only, numbers identical (03 K1) |

Redline: segment height 44; sample min height 150.

### E-ALLOW: Ask this week meter

| | Spec |
|---|---|
| Box | card radius 18, padding 13 15, gap 7; meter 6 tall radius 3 |
| Type | label 14 / 600; state 13; never a number |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; state `--ch-text-secondary` #46433D / #D0C9B8; meter `--ch-chart-track` #EBE5D8 / #2C322D with `--ch-chart-gain-fill` #1F6B45 / #4FA877, low `--ch-chart-loss-fill` #B86F0C / #E09A35, empty `--ch-chart-flat` #6B675F / #A39D90 |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Gain fill on track: 5.15 / 4.50; Loss fill on track: 3.15 / 5.52 |
| Icon | none |
| Hit | not interactive |
| Data | bucket plenty, low or out (03 H7, H8) |

Redline: card padding 13 15; meter height 6.

### E-OUT: Out of Ask card

| | Spec |
|---|---|
| Box | radius 18; top padding 16 16 12 gap 10 with a 38 icon tile radius 12; keep row padding 10 16 with a hairline; ask row padding 12 16 14 gap 10, button radius 99 padding 9 16 |
| Type | title 18×k / 1.25 / 600; reason 15×k / 1.45; rows 14; button 15 / 600 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; reason `--ch-text-secondary` #46433D / #D0C9B8; icon tile `--ch-well-bg-flat` #F6F4EE / #141815; keep glyph `--ch-accent` #155A39 / #7CC79B; button `--ch-accent (button fill)` #155A39 / #7CC79B with `--ch-text-on-accent` #FFFEFB / #0E120F |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Primary button label (onbtn on btn): 8.15 / 9.44 |
| Icon | icon 20; keep glyph 16 |
| Hit | Request more 38 drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | 03 LM1 to LM3 |

Redline: top padding 16 16 12; title 18 / 600; button padding 9 16.

### E-DRILL: Player read-only drill card

| | Spec |
|---|---|
| Box | radius 18, padding 14 16, gap 10; header icon tile 30; ladder 3 columns gap 8, cells radius 12 padding 10 |
| Type | title 15 / 600; meta 13; ladder value 20 / 600 tabular; ladder label 12; note 13 |
| Colour | `--ch-card-bg` #FFFEFB / #191E1A; meta, labels and note `--ch-text-secondary` #46433D / #D0C9B8; cells `--ch-well-bg-flat` #F6F4EE / #141815 |
| Contrast | Body text on well (pills, answer pills, mk chips): 15.66 / 15.20; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25 |
| Icon | header 16 |
| Hit | no button (player Ask has no writes) |
| Data | 03 PY6, PY7 |

Redline: card padding 14 16; ladder gap 8; ladder value 20.

### E-WK: Week grid (event and plan)

| | Spec |
|---|---|
| Box | padding 6 16 10; header and body grid 30 + 5 columns, gap 4; body 132 tall, columns radius 10 with an hour line every 30; busy blocks inset 3 radius 7; slot inset 3 radius 8; event inset 3 radius 8; dots 7 under each day |
| Type | weekday 11 / 600 tracking 0.04em with day 15 / 600; hours 10.5 tabular; busy block 10.5 / 600; event 11 / 600 with 10.5 time |
| Colour | columns `--ch-well-bg-flat` #F6F4EE / #141815; hours `--ch-text-tertiary` #5F5C55 / #ADA697; busy `--ch-chart-track` #EBE5D8 / #2C322D with `--ch-text-secondary` #46433D / #D0C9B8; today `--ch-accent` #155A39 / #7CC79B; slot `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with a 1.5 ring of accent at 35%; event `--ch-accent (button fill)` #155A39 / #7CC79B with `--ch-text-on-accent` #FFFEFB / #0E120F; dots `--ch-chart-track` #EBE5D8 / #2C322D, busy `--ch-chart-loss-fill` #B86F0C / #E09A35, free `--ch-chart-gain-fill` #1F6B45 / #4FA877 |
| Contrast | Tertiary on well (goal and strip axis labels): 6.06 / 7.41; Secondary on track (busy blocks on the week grid): 7.85 / 7.95; Event block label on the week grid (onbtn on btn, 11px): 8.15 / 9.44; Event block time (onbtn at 85% on btn): 6.40 / 7.19; Busy dot on the week (lossfill on card): 3.92 / 7.12 |
| Icon | none |
| Hit | the slot is tappable to move the time (44 tall at least) |
| Data | events plus class schedule for the week (03 E1, E2; PL20) |

Redline: grid padding 6 16 10; hour column 30, gap 4; body height 132; hour line every 30.

### E-LOCKP: Lock screen preview (announcement)

| | Spec |
|---|---|
| Box | margin 14 16 4; radius 18; padding 14 12 12; gap 10, centred; banner fill width, radius 16, padding 9 11, gap 9, app tile 26 radius 7 |
| Type | time 30 / 600 tracking -0.02em tabular; date 12; banner team 11 / 600 (drawn uppercase with 0.03em tracking: build sentence case, no tracking); label 11.5 ("Announcement · now" or "Urgent · now", Urgent 600); title 14 / 600; body 13; "Also emailed to 7 players" 12 |
| Colour | gradient `--ch-frame raised (add --ch-ak-frame-2)` #0d3d26 / #0b1d13 to `--ch-frame` #0a331f / #08150e at 165°; time `--ch-on-green-ink` #f4eedd / #f4eedd; date and email line `--ch-on-green-ink-soft` rgb(240 233 214/.86) / rgb(240 233 214/.86); banner ivory rgb(253 251 247/.9) in both themes with #1C1B18 title and #46433D meta; Urgent label #8A4C00 at 600 (fixed light, as the banner); app tile #155A39 |
| Contrast | Lock screen time and date (onframe2 on frame2): 7.91 / 10.90; Lock banner title (#1C1B18 on 90% ivory over frame): 13.81 / 13.52; Lock banner meta (#46433D on 90% ivory over frame): 7.91 / 7.74; Lock banner Urgent (#8A4C00 on 90% ivory over frame): 5.41 / 5.29 |
| Icon | app glyph 15 in the tile |
| Hit | not interactive |
| Data | title and body from the coach's words; urgency from the brief (03 §11.2) |

Redline: preview margin 14 16 4, padding 14 12 12; banner radius 16, padding 9 11; time 30; app tile 26.

### E-TRAVEL: Trip draft (route, rooms, uniform)

| | Spec |
|---|---|
| Box | route well margin 12 16 2, radius 16, padding 4 6; rooms row margin 10 16 0 gap 12, label column min 72, pairs radius 99 padding 4 8 4 6 with 26 coins; uniform row margin 10 16 0 gap 6, chips radius 99 padding 4 9 4 5 with a 16 swatch |
| Type | route labels 12 (600 for places); rooms label 14 / 600 with 12; uniform 12.5 / 600; gear 12 |
| Colour | route base `--ch-chart-track` #EBE5D8 / #2C322D 6 wide, line `--ch-accent` #155A39 / #7CC79B 3 wide; stops `--ch-card-bg` #FFFEFB / #191E1A with accent ring; flag `--ch-flag` #B3261E / #F28B7D (build: `--ch-loss` #9A5700 / #E7AE57 or ink, red is under par only); van `--ch-card-bg` #FFFEFB / #191E1A with ink stroke; swatches #1F6B45 and #FBF9F3 (build: tokens) |
| Contrast | Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Body text on well (pills, answer pills, mk chips): 15.66 / 15.20 |
| Icon | van, flag drawn in SVG |
| Hit | rooms and uniform chips tappable to edit (44 tall with padding) |
| Data | 03 TR1 to TR7 |

Redline: route margin 12 16 2; route line 3 on a 6 base; room coins 26; label column 72.

### E-BOARD: Board and Messages hand-off

| | Spec |
|---|---|
| Box | board well margin 12 16 4, radius 18, padding 12, gap 10; note card radius 14 padding 10 12 with a 24 coach mark; tiles 2 columns gap 8, radius 14, padding 10; hand-off thread as E-HS with a bubble radius 18 18 18 6 and a composer pill radius 22 with a 58×40 attachment slot |
| Type | note 14 / 1.4; tile title 13 / 600 with 11.5 meta; ladder 17 / 600 tabular with 10.5 labels; footnote 11.5 |
| Colour | board `--ch-well-bg-flat` #F6F4EE / #141815; tiles and note `--ch-card-bg` #FFFEFB / #191E1A; coach mark gradient #155A39 to #0B3A25 with #F4F1E8 initials; meta `--ch-text-secondary` #46433D / #D0C9B8; footnote `--ch-text-tertiary` #5F5C55 / #ADA697; composer placeholder `--ch-text-tertiary` #5F5C55 / #ADA697; send 30 `--ch-accent (button fill)` #155A39 / #7CC79B |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Coach mark CR #F4F1E8 on #155A39: 7.28 / 7.28; Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99 |
| Icon | send 15 |
| Hit | tiles tappable to remove (44 at least) |
| Data | 03 B1 to B6 |

Redline: board padding 12, radius 18; tile gap 8; attachment 58×40.

### E-POLL: Poll draft

| | Spec |
|---|---|
| Box | well margin 12 16 4, radius 18, padding 12, gap 10; options gap 6, each grid 92 + 1fr + 18 + auto, gap 8, radius 12, padding 9 10; bar 6 tall radius 3 |
| Type | question 15 / 600; option 14 / 600; count 13; "free" tag 11.5 / 600; footnote 12 |
| Colour | `--ch-well-bg-flat` #F6F4EE / #141815; rows `--ch-card-bg` #FFFEFB / #191E1A; bar `--ch-chart-track` #EBE5D8 / #2C322D; count and footnote `--ch-text-secondary` #46433D / #D0C9B8; free tag `--ch-accent` #155A39 / #7CC79B |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Accent links and labels on card (Open, Undo, hint, Change answers): 8.15 / 8.45 |
| Icon | check 11 |
| Hit | rows 44 with padding |
| Data | 03 PO1 to PO7 |

Redline: poll padding 12; row padding 9 10; bar height 6.

### E-QUAL: Qualifier draft (rounds and seats)

| | Spec |
|---|---|
| Box | rounds grid auto-fit min 130, gap 8, margin 12 16 0; round card radius 14 padding 9 10 with a 40 date tile; seats grid margin 10 16 0, gap 6 12; seat bar 5 equal cells gap 4, 6 tall |
| Type | date tile 10.5 / 700 tracking 0.04em with 17 day; round 14 / 600 with 12; seats 14 / 600 with 12 |
| Colour | round cards `--ch-well-bg-flat` #F6F4EE / #141815; date tile `--ch-card-bg` #FFFEFB / #191E1A with `--ch-accent` #155A39 / #7CC79B weekday; seats `--ch-chart-track` #EBE5D8 / #2C322D, filled `--ch-chart-gain-fill` #1F6B45 / #4FA877; no exempt seat (v12) |
| Contrast | Body text on well (pills, answer pills, mk chips): 15.66 / 15.20; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Gain fill on track: 5.15 / 4.50 |
| Icon | none |
| Hit | round cards tappable to move (44 tall) |
| Data | 03 Q1 to Q7 |

Redline: round card padding 9 10; date tile 40; seat bar height 6, gap 4.

### E-LINEUP: Lineup draft (standings and seats)

| | Spec |
|---|---|
| Box | two columns gap 10, margin 12 16 4; rows radius 11 padding 5 8 gap 8 with 24 coins; seats min height 35 |
| Type | column label 11 / 600 (drawn uppercase with 0.05em tracking: build sentence case); rows 13.5; score 13 / 600; seat number 12 tabular |
| Colour | standings `--ch-well-bg-flat` #F6F4EE / #141815; seats `--ch-card-bg` #FFFEFB / #191E1A with a separator ring; seated standings rows keep full opacity: name `--ch-text-secondary` #46433D / #D0C9B8, coin at saturate(.25); tie ring `--ch-chart-loss-fill` #B86F0C / #E09A35 at 55% with `--ch-loss` #9A5700 / #E7AE57 text; lock glyph `--ch-accent` #155A39 / #7CC79B |
| Contrast | Body text on well (pills, answer pills, mk chips): 15.66 / 15.20; Loss on well (tied standings): 5.11 / 9.04; Lineup standings row already seated (name in ink2 on well): 8.96 / 10.87; Seated coin #fdfcf8 on #5B5F8F at saturate(.25) (MA): 5.97 / 5.97; seats get a lock glyph that pops in only after Lock lineup. |
| Icon | lock 14 |
| Hit | tied rows are the pick buttons (44 tall in the build) |
| Data | 03 §11.7 |

Redline: columns gap 10; row padding 5 8; coins 24; seat min height 35.

### E-LOCKASK: Lock the lineup card (after Told)

| | Spec |
|---|---|
| Box | its own card under the lineup confirm card, margin-top 12, radius 22, padding 14 16, gap 12; title row gap 10 with a 28 icon tile radius 8; buttons row gap 8 with the primary pushed right |
| Type | "Lock the lineup for round 1?" 15 / 600; "Locking can't be undone. Scores then count for these five." 13; buttons "Not yet" and "Lock lineup" 15 / 600; capsule "Locking…"; receipt "Lineup locked · round 1" with "Locked for good. There is no Undo."; Not yet line "Not locked. Lock it from the lineup any time." |
| Colour | card `--ch-card-bg` #FFFEFB / #191E1A with `--ch-elevation-bubble`; icon tile `--ch-chart-track` #EBE5D8 / #2C322D with `--ch-text-primary` #1C1B18 / #F1ECDF glyph; small line `--ch-text-secondary` #46433D / #D0C9B8; Lock lineup `--ch-accent (button fill)` #155A39 / #7CC79B with `--ch-text-on-accent` #FFFEFB / #0E120F; Not yet as the kit secondary; receipt as E-RCPT with no Undo ring |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card (step done label, meta, receipt sub): 9.77 / 10.25; Primary button label (onbtn on btn): 8.15 / 9.44 |
| Icon | lock 16 in the tile; seat locks 14 in `--ch-accent` #155A39 / #7CC79B |
| Hit | both buttons 44 tall |
| Data | golf_tournament_lock_lineup on its own press, after set_lineup has closed its Undo window (03 §11.7); no Undo, no Told |

Redline: card margin-top 12; radius 22; padding 14 16; icon tile 28; capsule 700ms; lock pops 70ms apart.

### E-TASK: Task draft

| | Spec |
|---|---|
| Box | well margin 12 16 0, radius 16, padding 12, gap 14; progress ring 64; chips radius 99 padding 3 9 3 7 |
| Type | ring value 18 / 700 tabular with 9.5 label; title 15 / 600; chips 12.5 / 600; checklist 12.5 |
| Colour | `--ch-well-bg-flat` #F6F4EE / #141815; ring `--ch-chart-track` #EBE5D8 / #2C322D with `--ch-chart-gain-fill` #1F6B45 / #4FA877; chips `--ch-card-bg` #FFFEFB / #191E1A with `--ch-text-secondary` #46433D / #D0C9B8, bell `--ch-accent` #155A39 / #7CC79B (off `--ch-text-tertiary` #5F5C55 / #ADA697) |
| Contrast | Body text on well (pills, answer pills, mk chips): 15.66 / 15.20; Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87 |
| Icon | bell 13 |
| Hit | chips tappable to edit (44 with padding) |
| Data | 03 §11.8 |

Redline: task padding 12; ring 64; gap 14.

### E-GOAL: Goal draft

| | Spec |
|---|---|
| Box | chart well margin 12 16 0, radius 16, padding 8 8 2; target row margin 10 16 6 with a 36 coin |
| Type | axis 11; target label 12 / 600; "Waiting" label 11 / 600 (drawn uppercase: build sentence case) |
| Colour | zero `--ch-chart-zero` #5F5C55 / #ADA697; line `--ch-chart-flat` #6B675F / #A39D90 2.2; dots `--ch-chart-loss-fill` #B86F0C / #E09A35; band `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with accent at 45%; arrow `--ch-accent` #155A39 / #7CC79B dashed |
| Contrast | Tertiary on well (goal and strip axis labels): 6.06 / 7.41; Accent on well (goal label): 7.48 / 8.96; Loss fill on card (dots, tees): 3.92 / 7.12 |
| Icon | none |
| Hit | band tappable to change the target (44) |
| Data | 03 §11.9; baseline reads "Scoring baseline" |

Redline: chart padding 8 8 2; coin 36; line width 2.2.

### E-NOTE: Round note draft

| | Spec |
|---|---|
| Box | strip well margin 12 16 0, radius 16, padding 12, gap 6; note card radius 14 padding 10 12 |
| Type | strip title 14 / 600 with 12.5 meta; hole labels 11; note 14 / 1.4 |
| Colour | `--ch-well-bg-flat` #F6F4EE / #141815; pin `--ch-accent` #155A39 / #7CC79B; under par marks `--ch-flag` #B3261E / #F28B7D (red is under par only, correct here) |
| Contrast | Body text on card: 17.08 / 14.34; Under par red on card (hole strip only): 6.48 / 7.06; Tertiary on well (goal and strip axis labels): 6.06 / 7.41 |
| Icon | pin drawn |
| Hit | holes tappable (44 tall row) |
| Data | 03 §11.10; always shared with Theo (no question), appended under the earlier note on hole 4 |

Redline: strip padding 12; note padding 10 12.

### E-DGREEN: Drill draft (green diagram)

| | Spec |
|---|---|
| Box | well margin 12 16 0, radius 16, padding 8, gap 8; steps list gap 4 padding 0 6 6 with 18 number discs |
| Type | labels 12 / 600; steps 13; numbers 11 |
| Colour | green `--ch-chart-gain-fill` #1F6B45 / #4FA877 at 22% over card; ring accent at 40% dashed; tees `--ch-chart-loss-fill` #B86F0C / #E09A35; flag `--ch-flag` #B3261E / #F28B7D (build: ink, red is under par only); ball #FFFEFB with ink stroke |
| Contrast | Secondary on well (read chips, tags, Told row, scope chips): 8.96 / 10.87; Loss fill on card (dots, tees): 3.92 / 7.12 |
| Icon | drawn in SVG |
| Hit | none |
| Data | 03 §11.11 |

Redline: diagram padding 8; step discs 18.

### E-MO: Task moment board card (design page only)

| | Spec |
|---|---|
| Box | stage area page colour, margin 0 12, radius 18, padding 22 16, min height 430; stage bar chips radius 99 padding 4 9 |
| Type | stage bar 12 / 600 |
| Colour | stage bar `--ch-card-bg` #FFFEFB / #191E1A with `--ch-text-tertiary` #5F5C55 / #ADA697, current `--ch-selected-tint` rgb(21 90 57/.10) / rgb(124 199 155/.14) with `--ch-accent` #155A39 / #7CC79B |
| Contrast | Tertiary text on card (done step detail, axis, hours): 6.61 / 6.99; Accent on accent tint over well (stage bar current): 6.96 / 6.39 |
| Icon | none |
| Hit | Play 44 |
| Data | 03 §6 |

Redline: stage min height 430; stage padding 22 16.

## Per-ID specs

### S-ASK

Screen. CoachHelm section switcher, then the Ask segment (phone); CoachHelm in the sidebar, then Ask (desktop). PR: AK1 Answer card and steps.

- Pieces: E-BAR (Green phone bar (unchanged, SHARED-1)), E-SHEET (Parchment sheet and Board | Ask segmented), E-SCOPE (Scope line (phone)), E-THREAD (Thread column), E-HOME (Ask home (empty thread)), E-COMP (Composer).
- Data: 03 §1 (H1 to H8).
- Redline: bar height 50 under the 47 status area; switcher left inset 16; sheet top radius 16; segmented padding 12 16 8; scope type 13; gap to thread 6; thread side inset 16 (20 at 430); turn gap 22; greeting 26 / 600; pulse padding 16 radius 20.

### S-ASK.player

Screen. Player signed in, CoachHelm, Ask (own switch). PR: AK10a Player Ask.

- Pieces: E-BAR (Green phone bar (unchanged, SHARED-1)), E-SHEET (Parchment sheet and Board | Ask segmented), E-SCOPE (Scope line (phone)), E-THREAD (Thread column), E-HOME (Ask home (empty thread)), E-ALLOW (Ask this week meter), E-COMP (Composer).
- Data: 03 §1 (H1 to H8).
- Redline: bar height 50 under the 47 status area; switcher left inset 16; sheet top radius 16; segmented padding 12 16 8; scope type 13; gap to thread 6; thread side inset 16 (20 at 430); turn gap 22; greeting 26 / 600; pulse padding 16 radius 20.

### S-ASK.scope

Inline state. Always above the thread on phone; changes when a question is sent. PR: AK1 Answer card and steps.

- Pieces: E-SCOPE (Scope line (phone)).
- Data: 03 §2 (P1 to P15).
- Redline: scope type 13; gap to thread 6.

### S-ASK.composer

Inline state. Bottom of the Ask tab, idle. PR: AK1 Answer card and steps.

- Pieces: E-COMP (Composer).
- Data: 03 §1 (H1 to H8).
- Redline: box radius 26; box padding 8 8 8 14; buttons 38; bottom padding 22 on phone.

### S-ASK.composer.typing

Inline state. Tap the composer and type. PR: AK1 Answer card and steps.

- Pieces: E-COMP (Composer).
- Data: 03 §2 (P1 to P15).
- Redline: box radius 26; box padding 8 8 8 14; buttons 38; bottom padding 22 on phone.

### S-ASK.composer.busy

Inline state. Send; the send button becomes Stop while steps run. PR: AK1 Answer card and steps.

- Pieces: E-COMP (Composer).
- Data: 03 §2 (P1 to P15).
- Redline: box radius 26; box padding 8 8 8 14; buttons 38; bottom padding 22 on phone.

### S-ASK.composer.paused

Inline state. Player Ask when the weekly allowance is out. PR: AK10b Allowance.

- Pieces: E-COMP (Composer), E-OUT (Out of Ask card).
- Data: 03 §8 (LM1 to LM9).
- Redline: box radius 26; box padding 8 8 8 14; top padding 16 16 12; title 18 / 600; buttons 38.

### S-ASK.composer.at-menu

Menu. Type @ in the composer. PR: AK1 Answer card and steps.

- Pieces: E-COMP (Composer), E-MPOP (@ and / menu).
- Data: 03 §10 (K3) and the roster.
- Redline: box radius 26; box padding 8 8 8 14; row padding 8 14; avatar 28; buttons 38.

### S-ASK.composer.slash-menu

Menu. Type / in the composer. PR: AK1 Answer card and steps.

- Pieces: E-COMP (Composer), E-MPOP (@ and / menu).
- Data: 03 §10 (K3) and the roster.
- Redline: box radius 26; box padding 8 8 8 14; row padding 8 14; avatar 28; buttons 38.

### S-ASK.composer.add-menu

Menu. Tap + in the composer. PR: AK1 Answer card and steps. Not drawn: build from the rule in 05.

- Pieces: E-COMP (Composer), E-MPOP (@ and / menu).
- Data: 03 §1 (H1 to H8).
- Redline: box radius 26; box padding 8 8 8 14; row padding 8 14; avatar 28; buttons 38.

### S-ASK.history

Screen. Desktop: always in the left rail of Ask. PR: AK8 Tone and CoachHelm knows.

- Pieces: E-DESK (Desktop shell and history rail).
- Data: 03 §1 (H1 to H8).
- Redline: sidebar 232; top bar 56; rail 248; thread column max 680; pane 452 when open.

### S-ASK.history.sheet

Sheet (74%). Phone: tap the chat title or history button (today's drawer). PR: AK8 Tone and CoachHelm knows. Not drawn: build from the rule in 05.

- Pieces: E-DESK (Desktop shell and history rail).
- Data: 03 §1 (H1 to H8).
- Redline: sidebar 232; top bar 56; rail 248; thread column max 680; pane 452 when open.

### S-ASK.knows

Inline state. Desktop: bottom of the history rail. PR: AK8 Tone and CoachHelm knows.

- Pieces: E-DESK (Desktop shell and history rail).
- Data: 03 §1 (H1 to H8).
- Redline: sidebar 232; top bar 56; rail 248; thread column max 680; pane 452 when open.

### S-ASK.knows.edit

Sheet (90%). Tap "Edit what it knows". PR: AK8 Tone and CoachHelm knows. Not drawn: build from the rule in 05.

- Pieces: E-DESK (Desktop shell and history rail).
- Data: 03 §1 (H1 to H8).
- Redline: sidebar 232; top bar 56; rail 248; thread column max 680; pane 452 when open.

### S-ASK.settings.sheet

Sheet (62%). Phone: chat settings (tone and what it knows). PR: AK8 Tone and CoachHelm knows. Not drawn: build from the rule in 05.

- Pieces: E-TONE (Tone control).
- Data: 03 §1 (H1 to H8).
- Redline: segment height 44; sample min height 150.

### S-ASK.tone

Inline state. History rail (desktop) or settings sheet (phone), Straight picked. PR: AK8 Tone and CoachHelm knows.

- Pieces: E-TONE (Tone control).
- Data: 03 §10 (K1 to K3).
- Redline: segment height 44; sample min height 150.

### S-ASK.tone.detailed

Inline state. Tap Detailed. PR: AK8 Tone and CoachHelm knows.

- Pieces: E-TONE (Tone control).
- Data: 03 §10 (K1 to K3).
- Redline: segment height 44; sample min height 150.

### S-ASK.tone.team-talk

Inline state. Tap Team talk. PR: AK8 Tone and CoachHelm knows.

- Pieces: E-TONE (Tone control).
- Data: 03 §10 (K1 to K3).
- Redline: segment height 44; sample min height 150.

### S-ASK.loading

Inline state. Open Ask while the team loads. PR: AK1 Answer card and steps. Not drawn: build from the rule in 05.

- Pieces: E-BAR (Green phone bar (unchanged, SHARED-1)), E-SHEET (Parchment sheet and Board | Ask segmented), E-HOME (Ask home (empty thread)), E-COMP (Composer).
- Data: 03 §1 (H1 to H8).
- Redline: bar height 50 under the 47 status area; switcher left inset 16; sheet top radius 16; segmented padding 12 16 8; greeting 26 / 600; pulse padding 16 radius 20; box radius 26; box padding 8 8 8 14.

### S-ASK.error

Inline state. The stream fails or the team can't load. PR: AK1 Answer card and steps. Not drawn: build from the rule in 05.

- Pieces: E-BAR (Green phone bar (unchanged, SHARED-1)), E-SHEET (Parchment sheet and Board | Ask segmented), E-HOME (Ask home (empty thread)), E-COMP (Composer), E-CARD (Answer card (one per turn)).
- Data: 03 §1 (H1 to H8).
- Redline: bar height 50 under the 47 status area; switcher left inset 16; sheet top radius 16; segmented padding 12 16 8; greeting 26 / 600; pulse padding 16 radius 20; box radius 26; box padding 8 8 8 14; card radius 22; card padding 16 18 14.

### S-ASK.flag-off

Screen. coachhelm_ask_v2 off: today's Ask. PR: AK0 Plumbing. Not drawn: build from the rule in 05.

- Pieces: E-BAR (Green phone bar (unchanged, SHARED-1)), E-SHEET (Parchment sheet and Board | Ask segmented), E-HOME (Ask home (empty thread)), E-COMP (Composer).
- Data: 03 §1 (H1 to H8).
- Redline: bar height 50 under the 47 status area; switcher left inset 16; sheet top radius 16; segmented padding 12 16 8; greeting 26 / 600; pulse padding 16 radius 20; box radius 26; box padding 8 8 8 14.

### S-ASK.turn.user

Inline state. Send a question. PR: AK1 Answer card and steps.

- Pieces: E-THREAD (Thread column), E-USER (Coach or player bubble).
- Data: 03 §2 (P1 to P15).
- Redline: thread side inset 16 (20 at 430); turn gap 22; bubble max width 84%; padding 9 15; desktop column max 680.

### S-ASK.turn.answer

Inline state. The answer lands. PR: AK1 Answer card and steps.

- Pieces: E-THREAD (Thread column), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)), E-PROSE (Answer prose).
- Data: 03 §2 (P1 to P15).
- Redline: thread side inset 16 (20 at 430); turn gap 22; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10; prose 16 / 1.55.

### S-ASK.steps

Inline state. Steps run inside the answer card while CoachHelm reads. PR: AK1 Answer card and steps.

- Pieces: E-STEPS (Steps (kit ①)).
- Data: 03 §2 (P1 to P15).
- Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### S-ASK.steps.folded

Inline state. The answer lands; steps fold to "4 steps · 4s". PR: AK1 Answer card and steps.

- Pieces: E-STEPS (Steps (kit ①)).
- Data: 03 §2 (P1 to P15).
- Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### S-ASK.steps.open

Inline state. Tap the folded steps line. PR: AK1 Answer card and steps.

- Pieces: E-STEPS (Steps (kit ①)).
- Data: 03 §2 (P1 to P15).
- Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### S-ASK.steps.waiting

Inline state. A turn stops at Confirm. PR: AK1 Answer card and steps.

- Pieces: E-STEPS (Steps (kit ①)).
- Data: 03 §2 (P1 to P15).
- Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### S-ASK.steps.failed

Inline state. A read fails. PR: AK1 Answer card and steps.

- Pieces: E-STEPS (Steps (kit ①)).
- Data: 03 §2 (P1 to P15).
- Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### S-ASK.steps.next

Inline state. A step announced but not started. PR: AK1 Answer card and steps.

- Pieces: E-STEPS (Steps (kit ①)).
- Data: 03 §2 (P1 to P15).
- Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### S-ASK.steps.stopped

Inline state. Tap Stop while steps run. PR: AK1 Answer card and steps. Not drawn: build from the rule in 05.

- Pieces: E-STEPS (Steps (kit ①)).
- Data: 03 §2 (P1 to P15).
- Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### S-ASK.toolcard.skeleton

Inline state. A read with a visual is in flight. PR: AK3 Tool cards and Follow-ups.

- Pieces: E-SKEL (Tool card skeleton).
- Data: 03 §2 (P1 to P15).
- Redline: skeleton padding 16; bar height 12, gap 9.

### S-ASK.toolcard.putt-profile

Inline state. The putts read lands. PR: AK6 Shot reads.

- Pieces: E-VCARD (Tool card (visual)).
- Data: 03 §2 (P1 to P15).
- Redline: card radius 18; header padding 14 16 10; title 17; body padding 12 16 6; expand button 32.

### S-ASK.toolcard.sg

Inline state. Strokes gained read lands. PR: AK3 Tool cards and Follow-ups.

- Pieces: E-VCARD (Tool card (visual)).
- Data: 03 §3 (J1 to J12).
- Redline: card radius 18; header padding 14 16 10; title 17; body padding 12 16 6; expand button 32.

### S-ASK.toolcard.miss-pattern

Inline state. Shot read lands. PR: AK6 Shot reads.

- Pieces: E-VCARD (Tool card (visual)).
- Data: 03 §3 (J1 to J12).
- Redline: card radius 18; header padding 14 16 10; title 17; body padding 12 16 6; expand button 32.

### S-ASK.toolcard.season

Inline state. Season compare read lands. PR: AK7 Engine reads.

- Pieces: E-VCARD (Tool card (visual)).
- Data: 03 §4 (T1 to T7).
- Redline: card radius 18; header padding 14 16 10; title 17; body padding 12 16 6; expand button 32.

### S-ASK.toolcard.hole-strip

Inline state. Player asks about a round. PR: AK7 Engine reads.

- Pieces: E-VCARD (Tool card (visual)).
- Data: 03 §9 (RC1 to RC10).
- Redline: card radius 18; header padding 14 16 10; title 17; body padding 12 16 6; expand button 32.

### S-ASK.toolcard.ask-about

Inline state. Tap a bar or dot on a chart. PR: AK3 Tool cards and Follow-ups.

- Pieces: E-VCARD (Tool card (visual)), E-COMP (Composer).
- Data: 03 §2 (P1 to P15).
- Redline: card radius 18; header padding 14 16 10; box radius 26; box padding 8 8 8 14; title 17.

### S-ASK.toolcard.expanded

Sheet (full). Tap the expand button on a tool card. PR: AK3 Tool cards and Follow-ups. Not drawn: build from the rule in 05.

- Pieces: E-VCARD (Tool card (visual)).
- Data: 03 §2 (P1 to P15).
- Redline: card radius 18; header padding 14 16 10; title 17; body padding 12 16 6; expand button 32.

### S-ASK.readchip

Inline state. After a sentence with a figure. PR: AK2 Read chips and Sources.

- Pieces: E-CITE (Read chip and popover).
- Data: 03 §2 (P1 to P15).
- Redline: chip padding 4 8; chip type 13 / 600; popover width 280; popover padding 12 14.

### S-ASK.readchip.popover

Popover. Tap a read chip. PR: AK2 Read chips and Sources.

- Pieces: E-CITE (Read chip and popover).
- Data: 03 §2 (P1 to P15).
- Redline: chip padding 4 8; chip type 13 / 600; popover width 280; popover padding 12 14.

### S-ASK.sources

Inline state. Under every answer. PR: AK2 Read chips and Sources.

- Pieces: E-SRCS (Sources row and list).
- Data: 03 §2 (P1 to P15).
- Redline: stack circles 20, overlap 6; list radius 12, padding 4 14; source row padding 10.

### S-ASK.sources.open

Inline state. Tap "4 reads". PR: AK2 Read chips and Sources.

- Pieces: E-SRCS (Sources row and list).
- Data: 03 §2 (P1 to P15).
- Redline: stack circles 20, overlap 6; list radius 12, padding 4 14; source row padding 10.

### S-ASK.followups

Inline state. Under the answer card. PR: AK3 Tool cards and Follow-ups.

- Pieces: E-CHIPS (Follow-up chips).
- Data: 03 §2 (P1 to P15).
- Redline: chip padding 8 14; chip gap 8; chip type 15.

### S-ASK.hypothesis

Inline state. An answer that suggests something to test. PR: AK1 Answer card and steps.

- Pieces: E-PROSE (Answer prose), E-CITE (Read chip and popover).
- Data: 03 §3 (J1 to J12).
- Redline: prose 16 / 1.55; chip padding 4 8; chip type 13 / 600; popover width 280; popover padding 12 14.

### S-ASK.answer.putts

Screen. Ask "Why are we missing so many short putts lately?". PR: AK1 Answer card and steps.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)), E-PROSE (Answer prose), E-VCARD (Tool card (visual)), E-CITE (Read chip and popover), E-SRCS (Sources row and list), E-CHIPS (Follow-up chips).
- Data: 03 §2 (P1 to P15).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10; prose 16 / 1.55; card radius 18; header padding 14 16 10; chip padding 4 8.

### S-ASK.answer.jonah

Screen. Ask "Where is Jonah losing strokes?". PR: AK1 Answer card and steps.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)), E-PROSE (Answer prose), E-VCARD (Tool card (visual)), E-CITE (Read chip and popover), E-SRCS (Sources row and list), E-CHIPS (Follow-up chips).
- Data: 03 §3 (J1 to J12).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10; prose 16 / 1.55; card radius 18; header padding 14 16 10; chip padding 4 8.

### S-ASK.answer.trend

Screen. Ask "How are we scoring this fall compared to last fall?". PR: AK1 Answer card and steps.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)), E-PROSE (Answer prose), E-VCARD (Tool card (visual)), E-CITE (Read chip and popover), E-SRCS (Sources row and list), E-CHIPS (Follow-up chips).
- Data: 03 §4 (T1 to T7).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10; prose 16 / 1.55; card radius 18; header padding 14 16 10; chip padding 4 8.

### S-ASK.flow.plan.reads

Inline state. Ask "Build Tuesday's practice" (or /plan). PR: AK9 Practice brief and Save to folder.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Data: 03 §5 (PL1 to PL25).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.brief.q1

Inline state. After the first read step. PR: AK9 Practice brief and Save to folder.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Data: 03 §5 (PL1 to PL25).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.brief.q2

Inline state. Next on question 1. PR: AK9 Practice brief and Save to folder.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Data: 03 §5 (PL1 to PL25).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.brief.q3

Inline state. Next on question 2. PR: AK9 Practice brief and Save to folder.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Data: 03 §5 (PL1 to PL25).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.brief.q4

Inline state. Next on question 3. PR: AK9 Practice brief and Save to folder.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Data: 03 §5 (PL1 to PL25).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.brief.free

Inline state. Tap "Anything else?" and type. PR: AK9 Practice brief and Save to folder.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Data: 03 §5 (PL1 to PL25).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.brief.folded

Inline state. Build the plan on the last question. PR: AK9 Practice brief and Save to folder.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- Data: 03 §5 (PL1 to PL25).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.brief.skip

Inline state. Tap "Skip, just build" on any question. PR: AK9 Practice brief and Save to folder.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- Data: 03 §5 (PL1 to PL25).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.brief.change

Inline state. Tap "Change answers" on the folded brief. PR: AK9 Practice brief and Save to folder. Not drawn: build from the rule in 05.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- Data: 03 §5 (PL1 to PL25).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.plan.drafting

Inline state. The brief folds; drafting steps run. PR: AK1 Answer card and steps.

- Pieces: E-STEPS (Steps (kit ①)).
- Data: 03 §5 (PL1 to PL25).
- Redline: row min height 32; glyph column 20, gap 10; label 15, detail 14; dot 8.

### S-ASK.artifact.card

Inline state. The plan starts writing. PR: AK5 Artifacts.

- Pieces: E-ACARD (Artifact card).
- Data: 03 §5 (PL1 to PL25).
- Redline: card padding 12 12 12 14; tile 44×52; gap 12.

### S-ASK.artifact.card.saved

Inline state. After Save, back in the thread. PR: AK5 Artifacts.

- Pieces: E-ACARD (Artifact card).
- Data: 03 §5 (PL1 to PL25).
- Redline: card padding 12 12 12 14; tile 44×52; gap 12.

### S-ASK.artifact.push

Push. Phone: the plan opens as its own screen (or tap Open on the card). PR: AK5 Artifacts.

- Pieces: E-APANEL (Artifact pane and push screen), E-PLAN (Plan content (hero and blocks)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; hero padding 16; block padding 13 14; body padding 14 18 18.

### S-ASK.artifact.pane

Screen. Desktop: the right pane widens to 452 beside the chat. PR: AK5 Artifacts.

- Pieces: E-DESK (Desktop shell and history rail), E-APANEL (Artifact pane and push screen), E-PLAN (Plan content (hero and blocks)).
- Data: 03 §5 (PL1 to PL25).
- Redline: sidebar 232; top bar 56; pane width 452; header padding 12 12 12 18; hero padding 16; block padding 13 14.

### S-ASK.artifact.versions

Inline state. Header arrows, "1 of 3" when a plan was revised. PR: AK5 Artifacts.

- Pieces: E-APANEL (Artifact pane and push screen), E-PLAN (Plan content (hero and blocks)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; hero padding 16; block padding 13 14; body padding 14 18 18.

### S-ASK.artifact.why-popover

Popover. Tap a Why chip in a plan block. PR: AK5 Artifacts.

- Pieces: E-APANEL (Artifact pane and push screen), E-PLAN (Plan content (hero and blocks)), E-CITE (Read chip and popover).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; hero padding 16; block padding 13 14; chip padding 4 8; chip type 13 / 600.

### S-ASK.artifact.edit

Toast. Desktop: tap "Edit in builder". PR: AK5 Artifacts.

- Pieces: E-APANEL (Artifact pane and push screen), E-PLAN (Plan content (hero and blocks)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; hero padding 16; block padding 13 14; body padding 14 18 18.

### S-ASK.save

Sheet (docked card). Tap "Save draft…" in the artifact footer or dock. PR: AK9 Practice brief and Save to folder.

- Pieces: E-APANEL (Artifact pane and push screen), E-SAVE (Save to a folder card (kit ⑦)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; row margin 8 16 4, padding 9 12; folder art 30×24; body padding 14 18 18.

### S-ASK.save.folder-list

Menu (in place). Tap "Save to [Practice plans ⌄]". PR: AK9 Practice brief and Save to folder.

- Pieces: E-APANEL (Artifact pane and push screen), E-SAVE (Save to a folder card (kit ⑦)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; row margin 8 16 4, padding 9 12; folder art 30×24; body padding 14 18 18.

### S-ASK.save.new-folder

Inline state. Tap New folder in the list and type. PR: AK9 Practice brief and Save to folder.

- Pieces: E-APANEL (Artifact pane and push screen), E-SAVE (Save to a folder card (kit ⑦)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; row margin 8 16 4, padding 9 12; folder art 30×24; body padding 14 18 18.

### S-ASK.save.confirm

Inline state. New folder created, list closed, "Save to November" ready. PR: AK9 Practice brief and Save to folder.

- Pieces: E-APANEL (Artifact pane and push screen), E-SAVE (Save to a folder card (kit ⑦)), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; row margin 8 16 4, padding 9 12; folder art 30×24; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.save.commit

Inline state. Tap "Save to November". PR: AK9 Practice brief and Save to folder.

- Pieces: E-SAVE (Save to a folder card (kit ⑦)), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §5 (PL1 to PL25).
- Redline: row margin 8 16 4, padding 9 12; folder art 30×24; row padding 12 16 14; primary padding 9 14 radius 10; list item padding 8 10.

### S-ASK.save.receipt

Inline state. The plan lands in the folder. PR: AK9 Practice brief and Save to folder.

- Pieces: E-SAVE (Save to a folder card (kit ⑦)), E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Data: 03 §5 (PL1 to PL25).
- Redline: row margin 8 16 4, padding 9 12; folder art 30×24; receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48.

### S-ASK.save.told

Inline state. Undo window closes. PR: AK9 Practice brief and Save to folder.

- Pieces: E-SAVE (Save to a folder card (kit ⑦)), E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Data: 03 §5 (PL1 to PL25).
- Redline: row margin 8 16 4, padding 9 12; folder art 30×24; receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14.

### S-ASK.save.undone

Inline state. Tap Undo within 8s. PR: AK9 Practice brief and Save to folder.

- Pieces: E-SAVE (Save to a folder card (kit ⑦)), E-RCPT (Receipt and Undo (kit ⑤)).
- Data: 03 §5 (PL1 to PL25).
- Redline: row margin 8 16 4, padding 9 12; folder art 30×24; receipt padding 12 16; check disc 22; list item padding 8 10.

### S-ASK.save.cancelled

Inline state. Tap Cancel on the save card. PR: AK9 Practice brief and Save to folder.

- Pieces: E-APANEL (Artifact pane and push screen), E-SAVE (Save to a folder card (kit ⑦)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; row margin 8 16 4, padding 9 12; folder art 30×24; body padding 14 18 18.

### S-ASK.publish

Sheet (90%). Tap "Publish…" in the artifact footer or dock. PR: AK5 Artifacts.

- Pieces: E-APANEL (Artifact pane and push screen), E-FPICK (Publish sheet), E-CONF (Kit card: header and Draft chip), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; sheet inset 8; sheet radius 30 30 34 34; card radius 18; header padding 14 16 10; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.publish.commit

Inline state. Tap "Publish to 7 players". PR: AK5 Artifacts.

- Pieces: E-FPICK (Publish sheet), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §5 (PL1 to PL25).
- Redline: sheet inset 8; sheet radius 30 30 34 34; row padding 12 16 14; primary padding 9 14 radius 10; thumb 38×46.

### S-ASK.publish.receipt

Inline state. The plan fans out to 7 players and Practice plans. PR: AK5 Artifacts.

- Pieces: E-FPICK (Publish sheet), E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Data: 03 §5 (PL1 to PL25).
- Redline: sheet inset 8; sheet radius 30 30 34 34; receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48.

### S-ASK.publish.told

Inline state. Undo window closes. PR: AK5 Artifacts.

- Pieces: E-FPICK (Publish sheet), E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Data: 03 §1 (H1 to H8).
- Redline: sheet inset 8; sheet radius 30 30 34 34; receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14.

### S-ASK.publish.undone

Inline state. Tap Undo within 8s. PR: AK5 Artifacts.

- Pieces: E-FPICK (Publish sheet), E-RCPT (Receipt and Undo (kit ⑤)).
- Data: 03 §5 (PL1 to PL25).
- Redline: sheet inset 8; sheet radius 30 30 34 34; receipt padding 12 16; check disc 22; thumb 38×46.

### S-ASK.publish.cancelled

Inline state. Tap Cancel on the publish sheet. PR: AK5 Artifacts.

- Pieces: E-APANEL (Artifact pane and push screen), E-FPICK (Publish sheet), E-CONF (Kit card: header and Draft chip), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §5 (PL1 to PL25).
- Redline: pane width 452; header padding 12 12 12 18; sheet inset 8; sheet radius 30 30 34 34; card radius 18; header padding 14 16 10; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.plan.draft

Inline state. Before Save when the plan's day has no practice event (fixed 4 Nov: event first, 02 completeness AK9; the page draws it after Save). PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-CONF (Kit card: header and Draft chip), E-WK (Week grid (event and plan)), E-EVD (Kit draft well (fields)).
- Data: 03 §5 (PL1 to PL25).
- Redline: card radius 18; header padding 14 16 10; grid padding 6 16 10; hour column 30, gap 4; well margin 14 16 6; well padding 12.

### S-ASK.flow.plan.confirm

Inline state. Every field filled. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-CONF (Kit card: header and Draft chip), E-WK (Week grid (event and plan)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §5 (PL1 to PL25).
- Redline: card radius 18; header padding 14 16 10; grid padding 6 16 10; hour column 30, gap 4; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.plan.commit

Inline state. Tap "Add to calendar". PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §5 (PL1 to PL25).
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.plan.receipt

Inline state. The event lands on Tuesday. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Data: 03 §5 (PL1 to PL25).
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.plan.told

Inline state. Undo window closes; invites go out. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Data: 03 §5 (PL1 to PL25).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.plan.undone

Inline state. Tap Undo within 8s. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Data: 03 §5 (PL1 to PL25).
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.plan.cancelled

Inline state. Tap Cancel on the event draft. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-CXL (Cancelled), E-EVD (Kit draft well (fields)).
- Data: 03 §5 (PL1 to PL25).
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; well margin 14 16 6; well padding 12; date column 48.

### S-ASK.moment.cal.draft

Inline state. Add a practice to the calendar. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-MO (Task moment board card (design page only)), E-CONF (Kit card: header and Draft chip), E-EVD (Kit draft well (fields)), E-WK (Week grid (event and plan)).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; card radius 18; header padding 14 16 10; well margin 14 16 6; well padding 12; grid padding 6 16 10; hour column 30, gap 4.

### S-ASK.moment.cal.confirm

Inline state. Add a practice to the calendar. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-MO (Task moment board card (design page only)), E-CONF (Kit card: header and Draft chip), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-WK (Week grid (event and plan)).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; card radius 18; header padding 14 16 10; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.moment.cal.receipt

Inline state. Add a practice to the calendar. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-MO (Task moment board card (design page only)), E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)), E-WK (Week grid (event and plan)).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; grid padding 6 16 10; hour column 30, gap 4.

### S-ASK.moment.cal.told

Inline state. Add a practice to the calendar. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-MO (Task moment board card (design page only)), E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row), E-WK (Week grid (event and plan)).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; grid padding 6 16 10; hour column 30, gap 4.

### S-ASK.moment.fold.draft

Inline state. Save into a new folder. PR: AK9 Practice brief and Save to folder.

- Pieces: E-MO (Task moment board card (design page only)), E-CONF (Kit card: header and Draft chip), E-EVD (Kit draft well (fields)), E-SAVE (Save to a folder card (kit ⑦)).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; card radius 18; header padding 14 16 10; well margin 14 16 6; well padding 12; row margin 8 16 4, padding 9 12; folder art 30×24.

### S-ASK.moment.fold.confirm

Inline state. Save into a new folder. PR: AK9 Practice brief and Save to folder.

- Pieces: E-MO (Task moment board card (design page only)), E-CONF (Kit card: header and Draft chip), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-SAVE (Save to a folder card (kit ⑦)).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; card radius 18; header padding 14 16 10; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.moment.fold.receipt

Inline state. Save into a new folder. PR: AK9 Practice brief and Save to folder.

- Pieces: E-MO (Task moment board card (design page only)), E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)), E-SAVE (Save to a folder card (kit ⑦)).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; row margin 8 16 4, padding 9 12; folder art 30×24.

### S-ASK.moment.fold.told

Inline state. Save into a new folder. PR: AK9 Practice brief and Save to folder.

- Pieces: E-MO (Task moment board card (design page only)), E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row), E-SAVE (Save to a folder card (kit ⑦)).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; row margin 8 16 4, padding 9 12; folder art 30×24.

### S-ASK.moment.focus.draft

Inline state. Set a focus area. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-MO (Task moment board card (design page only)), E-CONF (Kit card: header and Draft chip), E-EVD (Kit draft well (fields)), E-CHIPS (Follow-up chips).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; card radius 18; header padding 14 16 10; well margin 14 16 6; well padding 12; chip padding 8 14; chip gap 8.

### S-ASK.moment.focus.confirm

Inline state. Set a focus area. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-MO (Task moment board card (design page only)), E-CONF (Kit card: header and Draft chip), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-CHIPS (Follow-up chips).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; card radius 18; header padding 14 16 10; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.moment.focus.receipt

Inline state. Set a focus area. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-MO (Task moment board card (design page only)), E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)), E-CHIPS (Follow-up chips).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; chip padding 8 14; chip gap 8.

### S-ASK.moment.focus.told

Inline state. Set a focus area. PR: AK4 Confirm, commit, receipt, Undo.

- Pieces: E-MO (Task moment board card (design page only)), E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row), E-CHIPS (Follow-up chips).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; chip padding 8 14; chip gap 8.

### S-ASK.moment.pub.draft

Inline state. Publish a plan to players. PR: AK5 Artifacts.

- Pieces: E-MO (Task moment board card (design page only)), E-CONF (Kit card: header and Draft chip), E-EVD (Kit draft well (fields)), E-FPICK (Publish sheet).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; card radius 18; header padding 14 16 10; well margin 14 16 6; well padding 12; sheet inset 8; sheet radius 30 30 34 34.

### S-ASK.moment.pub.confirm

Inline state. Publish a plan to players. PR: AK5 Artifacts.

- Pieces: E-MO (Task moment board card (design page only)), E-CONF (Kit card: header and Draft chip), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-FPICK (Publish sheet).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; card radius 18; header padding 14 16 10; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.moment.pub.receipt

Inline state. Publish a plan to players. PR: AK5 Artifacts.

- Pieces: E-MO (Task moment board card (design page only)), E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)), E-FPICK (Publish sheet).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; sheet inset 8; sheet radius 30 30 34 34.

### S-ASK.moment.pub.told

Inline state. Publish a plan to players. PR: AK5 Artifacts.

- Pieces: E-MO (Task moment board card (design page only)), E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row), E-FPICK (Publish sheet).
- Data: 03 §6 (M1 to M5).
- Redline: stage min height 430; stage padding 22 16; receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; sheet inset 8; sheet radius 30 30 34 34.

### S-ASK.kit.failed

Inline state. The write fails after the confirm press. PR: AK4 Confirm, commit, receipt, Undo. Not drawn: build from the rule in 05.

- Pieces: E-CONF (Kit card: header and Draft chip), E-RCPT (Receipt and Undo (kit ⑤)).
- Data: 03 §11.1 (E1 to E10).
- Redline: card radius 18; header padding 14 16 10; receipt padding 12 16; check disc 22; icon tile 32 radius 9.

### S-ASK.kit.partial

Inline state. Part of a multi-row write fails. PR: AK4 Confirm, commit, receipt, Undo. Not drawn: build from the rule in 05.

- Pieces: E-CONF (Kit card: header and Draft chip), E-RCPT (Receipt and Undo (kit ⑤)).
- Data: 03 §11.1 (E1 to E10).
- Redline: card radius 18; header padding 14 16 10; receipt padding 12 16; check disc 22; icon tile 32 radius 9.

### S-ASK.kit.reloaded

Inline state. Reload after the Undo window: the durable receipt. PR: AK4 Confirm, commit, receipt, Undo. Not drawn: build from the rule in 05.

- Pieces: E-CONF (Kit card: header and Draft chip), E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Data: 03 §11.1 (E1 to E10).
- Redline: card radius 18; header padding 14 16 10; receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14.

### S-ASK.flow.f_event.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11a Create engine.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Set a team meeting before the qualifier". Scope: "Varsity · week of Nov 2".
- Steps: "Reading next week's calendar" then "Read next week's calendar", detail "Practice Tue, film Thu, qualifier Fri"; "Checking classes for 7 players" then "Checked classes for 7 players", detail "Everyone is free Wednesday after 3:30".
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_event.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11a Create engine.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Wed Nov 4 · 4:00 PM" · "Calendar and classes"; "45 minutes" · "Your usual meeting"; "Reminder 1 hour before" · "Your default".
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_event.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11a Create engine.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 1 of 2: "Who is it for?", why line "Everyone on the qualifier field is free.".
- Options: "Whole team [All 7 players]"; "Seniors only [Josie and Sam]". Picked by default: option 1.
- Next on the last question reads "Draft the meeting".
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_event.brief-2

Inline state. Next. PR: AK11a Create engine.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 2 of 2: "Where?".
- Options: "Clubhouse film room [Where you met last time]"; "On the range"; "Video call (Adds a link)". Picked by default: option 1.
- Next on the last question reads "Draft the meeting".
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_event.folded

Inline state. Last Next; answers fold to pills. PR: AK11a Create engine.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_event.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-WK (Week grid (event and plan)), E-EVD (Kit draft well (fields)).
- Header: "New event", Draft chip.
- Fields: "Team meeting · before the qualifier"; "4:00 to 4:45 PM"; "Clubhouse film room"; "7 players · RSVP on"; "Reminder 1 hour before".
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: card radius 18; header padding 14 16 10; grid padding 6 16 10; hour column 30, gap 4; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_event.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-WK (Week grid (event and plan)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Header: "New event", Draft chip.
- Fields: "Team meeting · before the qualifier"; "4:00 to 4:45 PM"; "Clubhouse film room"; "7 players · RSVP on"; "Reminder 1 hour before".
- On confirm: 7 players get an invite once Undo closes. Nothing else is sent.
- Buttons: "Cancel" and "Add to calendar".
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: card radius 18; header padding 14 16 10; grid padding 6 16 10; hour column 30, gap 4; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_event.commit

Inline state. Tap the primary button. PR: AK11a Create engine.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Adding…"; Cancel disables.
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_event.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-WK (Week grid (event and plan)).
- Receipt: "Added to calendar · Wed Nov 4, 4:00 PM", sub "Invites go out when Undo closes", "Open" and Undo with the 8s ring.
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: receipt padding 12 16; check disc 22; grid padding 6 16 10; hour column 30, gap 4; line 15 / 600.

### S-ASK.flow.f_event.told

Inline state. Undo window closes; players told. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Invites sent". Told row: "7 players got it on their calendar", then "Delivered to 7. Seen by 2.".
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_event.undone

Inline state. Tap Undo within 8s. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The meeting was removed.".
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_event.cancelled

Inline state. Tap Cancel on the draft. PR: AK11a Create engine.

- Pieces: E-CXL (Cancelled), E-WK (Week grid (event and plan)).
- Header: "New event", Draft chip.
- Fields: "Team meeting · before the qualifier"; "4:00 to 4:45 PM"; "Clubhouse film room"; "7 players · RSVP on"; "Reminder 1 hour before".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; grid padding 6 16 10; hour column 30, gap 4; body height 132.

### S-ASK.flow.f_event.confirm.seniors

Inline state. Answer: seniors. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-WK (Week grid (event and plan)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Header: "New event", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Team meeting · before the qualifier"; "4:00 to 4:45 PM"; "Clubhouse film room"; "7 players · RSVP on"; "Reminder 1 hour before".
- On confirm: 7 players get an invite once Undo closes. Nothing else is sent.
- Buttons: "Cancel" and "Add to calendar".
- Answers for this ID: "Seniors only". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: card radius 18; header padding 14 16 10; grid padding 6 16 10; hour column 30, gap 4; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_event.told.seniors

Inline state. Answer: seniors, then Undo closes. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Invites sent". Told row: "7 players got it on their calendar", then "Delivered to 7. Seen by 2.".
- Answers for this ID: "Seniors only". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_event` into golf_events; lands in Calendar, in Wednesday's open slot.
- Data: 03 §11.1 (E1 to E10).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_annc.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11b More creates.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Tell the team the bus leaves Sunday at 7 for Hargrove". Scope: "Varsity · announcements".
- Steps: "Reading the Hargrove trip" then "Read the Hargrove trip", detail "Leaves Sun Nov 8 from the Clubhouse lot"; "Reading your recent announcements" then "Read your recent announcements", detail "Your travel posts asked for Got it".
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_annc.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11b More creates.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Title: Bus to Hargrove" · "Your words"; "7 players" · "Roster"; "Times from the Hargrove trip" · "Hub".
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_annc.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 1 of 2: "How urgent is it?", why line "Every announcement pushes to their phones. Urgent is never held back during class.".
- Options: "Normal [Push when they are free]"; "Urgent [Push right away, even in class]". Picked by default: option 1.
- Next on the last question reads "Draft the announcement".
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_annc.brief-2

Inline state. Next. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 2 of 2: "Ask them to tap Got it?", why line "You asked on your last 3 travel posts.".
- Options: "Yes, ask for Got it"; "No". Picked by default: option 1.
- Next on the last question reads "Draft the announcement".
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_annc.folded

Inline state. Last Next; answers fold to pills. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_annc.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LOCKP (Lock screen preview (announcement)), E-EVD (Kit draft well (fields)).
- Header: "New announcement", Draft chip.
- Fields: "Bus to Hargrove"; "Bus leaves the Clubhouse lot Sunday at 7:00 AM. Bags at the vans by 6:45."; "Normal · pushes when they are free"; "Asks for Got it"; "To 7 players".
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: card radius 18; header padding 14 16 10; preview margin 14 16 4, padding 14 12 12; banner radius 16, padding 9 11; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_annc.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LOCKP (Lock screen preview (announcement)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New announcement", Draft chip.
- Fields: "Bus to Hargrove"; "Bus leaves the Clubhouse lot Sunday at 7:00 AM. Bags at the vans by 6:45."; "Normal · pushes when they are free"; "Asks for Got it"; "To 7 players".
- Where it lands: "Messages / Announcements".
- On confirm: It posts to 7 players with a push and an email once Undo closes.
- Buttons: "Cancel" and "Post to 7 players".
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: card radius 18; header padding 14 16 10; preview margin 14 16 4, padding 14 12 12; banner radius 16, padding 9 11; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_annc.commit

Inline state. Tap the primary button. PR: AK11b More creates.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Posting…"; Cancel disables.
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_annc.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Receipt: "Posted · Bus to Hargrove", sub "Players are told when Undo closes", "Open" and Undo with the 8s ring.
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.f_annc.told

Inline state. Undo window closes; players told. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Posted to Announcements". Told row: "7 players got it on their phones", then "Seen by 4. 2 tapped Got it.".
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_annc.undone

Inline state. Tap Undo within 8s. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. Nothing was posted.".
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_annc.cancelled

Inline state. Tap Cancel on the draft. PR: AK11b More creates.

- Pieces: E-CXL (Cancelled), E-LOCKP (Lock screen preview (announcement)).
- Header: "New announcement", Draft chip.
- Fields: "Bus to Hargrove"; "Bus leaves the Clubhouse lot Sunday at 7:00 AM. Bags at the vans by 6:45."; "Normal · pushes when they are free"; "Asks for Got it"; "To 7 players".
- Where it lands: "Messages / Announcements".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; preview margin 14 16 4, padding 14 12 12; banner radius 16, padding 9 11; time 30.

### S-ASK.flow.f_annc.confirm.urgent

Inline state. Answer: urgent. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LOCKP (Lock screen preview (announcement)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New announcement", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Bus to Hargrove"; "Bus leaves the Clubhouse lot Sunday at 7:00 AM. Bags at the vans by 6:45."; "Normal · pushes when they are free"; "Asks for Got it"; "To 7 players".
- Where it lands: "Messages / Announcements".
- On confirm: It posts to 7 players with a push and an email once Undo closes.
- Buttons: "Cancel" and "Post to 7 players".
- Answers for this ID: "Urgent". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: card radius 18; header padding 14 16 10; preview margin 14 16 4, padding 14 12 12; banner radius 16, padding 9 11; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_annc.confirm.no-got-it

Inline state. Answer: no got it. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LOCKP (Lock screen preview (announcement)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New announcement", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Bus to Hargrove"; "Bus leaves the Clubhouse lot Sunday at 7:00 AM. Bags at the vans by 6:45."; "Normal · pushes when they are free"; "Asks for Got it"; "To 7 players".
- Where it lands: "Messages / Announcements".
- On confirm: It posts to 7 players with a push and an email once Undo closes.
- Buttons: "Cancel" and "Post to 7 players".
- Answers for this ID: "No". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: card radius 18; header padding 14 16 10; preview margin 14 16 4, padding 14 12 12; banner radius 16, padding 9 11; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_annc.told.no-got-it

Inline state. Answer: no got it, then Undo closes. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Posted to Announcements". Told row: "7 players got it on their phones", then "Seen by 4. 2 tapped Got it.".
- Answers for this ID: "No". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_announcement` into golf_announcements; lands in Messages, top of Announcements.
- Data: 03 §11.2 (A1 to A10).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_travel.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11b More creates.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Set up travel for Hargrove". Scope: "Varsity · Hargrove Invitational".
- Steps: "Reading the Hargrove Invitational" then "Read the Hargrove Invitational", detail "Nov 9 to 10 · round 1 Monday 8:30 AM"; "Reading last year's Hargrove trip" then "Read last year's Hargrove trip", detail "Two vans, Hampton Inn Ridgeway, 4 rooms".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_travel.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11b More creates.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Leave Sun Nov 8 · 7:00 AM" · "Tee times"; "Hampton Inn Ridgeway · 2 nights" · "Last year's trip"; "Gear list, 9 items" · "Last trip".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_travel.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Three quick questions", question 1 of 3: "How are you getting there?", why line "It's 212 miles, about 3 hours 40.".
- Options: "Two vans [Last year]"; "Charter bus"; "Fly (Adds flight details)". Picked by default: option 1.
- Next on the last question reads "Draft the trip".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_travel.brief-2

Inline state. Next. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Three quick questions", question 2 of 3: "How should I pair rooms?", why line "4 rooms for 7 players.".
- Options: "By class [Last year]"; "By tee time (Early starters together)"; "I'll set them". Picked by default: option 1.
- Next on the last question reads "Draft the trip".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_travel.brief-3

Inline state. Next. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Three quick questions", question 3 of 3: "Uniform?".
- Options: "Green Monday, white Tuesday [Last year]"; "White Monday, green Tuesday". Picked by default: option 1.
- Next on the last question reads "Draft the trip".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_travel.folded

Inline state. Last Next; answers fold to pills. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_travel.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TRAVEL (Trip draft (route, rooms, uniform)), E-EVD (Kit draft well (fields)).
- Header: "New trip", Draft chip.
- Fields: "Hargrove Invitational trip"; "Leave 7:00 AM · Two vans"; "Hampton Inn Ridgeway · Nov 8 to 10"; "7 players, 2 coaches".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: card radius 18; header padding 14 16 10; route margin 12 16 2; route line 3 on a 6 base; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_travel.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TRAVEL (Trip draft (route, rooms, uniform)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New trip", Draft chip.
- Fields: "Hargrove Invitational trip"; "Leave 7:00 AM · Two vans"; "Hampton Inn Ridgeway · Nov 8 to 10"; "7 players, 2 coaches".
- Where it lands: "Hub / Trips".
- On confirm: 7 players and 2 coaches see the trip in Hub once Undo closes. Rooms show only to the players in them.
- Buttons: "Cancel" and "Add the trip".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: card radius 18; header padding 14 16 10; route margin 12 16 2; route line 3 on a 6 base; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_travel.commit

Inline state. Tap the primary button. PR: AK11b More creates.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Saving the trip…"; Cancel disables.
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_travel.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Receipt: "Trip added · Hub · Hargrove", sub "Players see it when Undo closes", "Open trip" and Undo with the 8s ring.
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.f_travel.told

Inline state. Undo window closes; players told. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "In Hub for 7 players and 2 coaches". Told row: "7 players see the trip in Hub", then "Delivered to 7. Seen by 3.".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_travel.undone

Inline state. Tap Undo within 8s. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The trip was removed.".
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_travel.cancelled

Inline state. Tap Cancel on the draft. PR: AK11b More creates.

- Pieces: E-CXL (Cancelled), E-TRAVEL (Trip draft (route, rooms, uniform)).
- Header: "New trip", Draft chip.
- Fields: "Hargrove Invitational trip"; "Leave 7:00 AM · Two vans"; "Hampton Inn Ridgeway · Nov 8 to 10"; "7 players, 2 coaches".
- Where it lands: "Hub / Trips".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; route margin 12 16 2; route line 3 on a 6 base; room coins 26.

### S-ASK.flow.f_travel.confirm.fly

Inline state. Answer: fly. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TRAVEL (Trip draft (route, rooms, uniform)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New trip", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Hargrove Invitational trip"; "Leave 7:00 AM · Two vans"; "Hampton Inn Ridgeway · Nov 8 to 10"; "7 players, 2 coaches".
- Where it lands: "Hub / Trips".
- On confirm: 7 players and 2 coaches see the trip in Hub once Undo closes. Rooms show only to the players in them.
- Buttons: "Cancel" and "Add the trip".
- Answers for this ID: "Fly". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: card radius 18; header padding 14 16 10; route margin 12 16 2; route line 3 on a 6 base; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_travel.confirm.rooms-mine

Inline state. Answer: rooms mine. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TRAVEL (Trip draft (route, rooms, uniform)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New trip", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Hargrove Invitational trip"; "Leave 7:00 AM · Two vans"; "Hampton Inn Ridgeway · Nov 8 to 10"; "7 players, 2 coaches".
- Where it lands: "Hub / Trips".
- On confirm: 7 players and 2 coaches see the trip in Hub once Undo closes. Rooms show only to the players in them.
- Buttons: "Cancel" and "Add the trip".
- Answers for this ID: "I'll set them". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: card radius 18; header padding 14 16 10; route margin 12 16 2; route line 3 on a 6 base; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_travel.confirm.by-tee-time

Inline state. Answer: by tee time. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TRAVEL (Trip draft (route, rooms, uniform)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New trip", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Hargrove Invitational trip"; "Leave 7:00 AM · Two vans"; "Hampton Inn Ridgeway · Nov 8 to 10"; "7 players, 2 coaches".
- Where it lands: "Hub / Trips".
- On confirm: 7 players and 2 coaches see the trip in Hub once Undo closes. Rooms show only to the players in them.
- Buttons: "Cancel" and "Add the trip".
- Answers for this ID: "By tee time". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_trip` into golf_travel_itineraries; lands in Hub, in the trips strip.
- Data: 03 §11.3 (TR1 to TR8).
- Redline: card radius 18; header padding 14 16 10; route margin 12 16 2; route line 3 on a 6 base; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_board.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11c Board and poll.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Make Jonah a board on his approach I can send him". Scope: "Jonah Okafor · last 8 rounds".
- Steps: "Reading Jonah's strokes gained" then "Read Jonah's strokes gained", detail "Last 8 rounds"; "Reading his approach shots" then "Read his approach shots", detail "64 shots from 125 to 150 yd".
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_board.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11c Board and poll.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Jonah's last 8 rounds" · "Stats"; "His focus: approach 125 to 150" · "Focus areas".
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_board.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11c Board and poll.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 1 of 2: "What should it show?", why line "Pick up to four. I marked what tells his story best.".
- Options: "Strokes gained [Where the strokes go]"; "Miss pattern 125 to 150 [Short and short right]"; "This fall against last"; "Tuesday's drill [Distance ladder]". Picked by default: option 1, 2.
- Next on the last question reads "Make the board".
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_board.brief-2

Inline state. Next. PR: AK11c Board and poll.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 2 of 2: "Add a note from you?", why line "It sits at the top of the board, in your words.".
- Options: "Add a note"; "No note". Picked by default: option 1.
- Next on the last question reads "Make the board".
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_board.brief-free

Inline state. Tap the free line and type. PR: AK11c Board and poll.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Free line under "Add a note from you?", typed: "Your misses are consistent, so they're fixable. Let's own 125 to 150 before Hargrove.".
- Next on the last question reads "Make the board".
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_board.folded

Inline state. Last Next; answers fold to pills. PR: AK11c Board and poll.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_board.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11c Board and poll.

- Pieces: E-CONF (Kit card: header and Draft chip), E-BOARD (Board and Messages hand-off), E-EVD (Kit draft well (fields)).
- Header: "Board for Jonah", Draft chip.
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: card radius 18; header padding 14 16 10; board padding 12, radius 18; tile gap 8; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_board.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11c Board and poll.

- Pieces: E-CONF (Kit card: header and Draft chip), E-BOARD (Board and Messages hand-off), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "Board for Jonah", Draft chip.
- Where it lands: "Jonah Okafor / Messages".
- On confirm: Nothing is sent. The board goes into your message to Jonah, and you send it from Messages.
- Buttons: "Cancel" and "Open in Messages".
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: card radius 18; header padding 14 16 10; board padding 12, radius 18; tile gap 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_board.commit

Inline state. Tap the primary button. PR: AK11c Board and poll.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Opening…"; Cancel disables.
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_board.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11c Board and poll.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Receipt: "Board added to your message to Jonah", sub "Send it from Messages when you're ready", "Open thread" and Undo with the 8s ring.
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.f_board.told

Inline state. Undo window closes; players told. PR: AK11c Board and poll.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Waiting for you to send it". Told row: "Nothing is sent until you tap Send in Messages.", then "".
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_board.undone

Inline state. Tap Undo within 8s. PR: AK11c Board and poll.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The board is out of the message.".
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_board.cancelled

Inline state. Tap Cancel on the draft. PR: AK11c Board and poll.

- Pieces: E-CXL (Cancelled), E-BOARD (Board and Messages hand-off).
- Header: "Board for Jonah", Draft chip.
- Where it lands: "Jonah Okafor / Messages".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; board padding 12, radius 18; tile gap 8; attachment 58×40.

### S-ASK.flow.f_board.confirm.no-note

Inline state. Answer: no note. PR: AK11c Board and poll.

- Pieces: E-CONF (Kit card: header and Draft chip), E-BOARD (Board and Messages hand-off), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "Board for Jonah", Draft chip.
- Where it lands: "Jonah Okafor / Messages".
- On confirm: Nothing is sent. The board goes into your message to Jonah, and you send it from Messages.
- Buttons: "Cancel" and "Open in Messages".
- Answers for this ID: "No note". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: card radius 18; header padding 14 16 10; board padding 12, radius 18; tile gap 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_board.confirm.four-tiles

Inline state. Answer: four tiles. PR: AK11c Board and poll.

- Pieces: E-CONF (Kit card: header and Draft chip), E-BOARD (Board and Messages hand-off), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "Board for Jonah", Draft chip.
- Where it lands: "Jonah Okafor / Messages".
- On confirm: Nothing is sent. The board goes into your message to Jonah, and you send it from Messages.
- Buttons: "Cancel" and "Open in Messages".
- Answers for this ID: "Strokes gained", "Miss pattern 125 to 150", "This fall against last", "Tuesday's drill". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `draft_board` into golf_messages (attachment); lands in Your message to Jonah, as a draft.
- Data: 03 §11.4 (B1 to B6).
- Redline: card radius 18; header padding 14 16 10; board padding 12, radius 18; tile gap 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_poll.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11c Board and poll.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Ask the team which night works for a team dinner". Scope: "Varsity · evenings next week".
- Steps: "Reading evenings next week" then "Read evenings next week", detail "4 nights have nothing on after 5"; "Checking classes and travel" then "Checked classes and travel", detail "Saturday is packing for Hargrove".
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_poll.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11c Board and poll.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Team chat · Varsity" · "Messages"; "Names show on votes" · "Your last 2 polls".
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_poll.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11c Board and poll.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 1 of 2: "Which nights go on the poll?", why line "All three are clear for everyone. Saturday is the night before travel.".
- Options: "Mon Nov 2 [Free after 5:30]"; "Wed Nov 4 [Free after 5]"; "Thu Nov 5 [Free after 6]"; "Sat Nov 7 (Night before travel)". Picked by default: option 1, 2, 3.
- Next on the last question reads "Draft the poll".
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_poll.brief-2

Inline state. Next. PR: AK11c Board and poll.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 2 of 2: "When should it close?".
- Options: "When all 7 answer"; "Tomorrow at noon"; "Leave it open". Picked by default: option 1.
- Next on the last question reads "Draft the poll".
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_poll.folded

Inline state. Last Next; answers fold to pills. PR: AK11c Board and poll.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_poll.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11c Board and poll.

- Pieces: E-CONF (Kit card: header and Draft chip), E-POLL (Poll draft), E-BOARD (Board and Messages hand-off), E-EVD (Kit draft well (fields)).
- Header: "Poll for the team", Draft chip.
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: card radius 18; header padding 14 16 10; poll padding 12; row padding 9 10; board padding 12, radius 18; tile gap 8; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_poll.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11c Board and poll.

- Pieces: E-CONF (Kit card: header and Draft chip), E-POLL (Poll draft), E-BOARD (Board and Messages hand-off), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "Poll for the team", Draft chip.
- Where it lands: "Varsity team chat / Messages".
- On confirm: Nothing is posted. The poll goes into the team chat composer, and you send it.
- Buttons: "Cancel" and "Open in Messages".
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: card radius 18; header padding 14 16 10; poll padding 12; row padding 9 10; board padding 12, radius 18; tile gap 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14.

### S-ASK.flow.f_poll.commit

Inline state. Tap the primary button. PR: AK11c Board and poll.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Opening…"; Cancel disables.
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_poll.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11c Board and poll.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Receipt: "Poll added to team chat", sub "Post it from Messages when you're ready", "Open chat" and Undo with the 8s ring.
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.f_poll.told

Inline state. Undo window closes; players told. PR: AK11c Board and poll.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Waiting for you to post it". Told row: "Nothing is posted until you tap Send in team chat.", then "".
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_poll.undone

Inline state. Tap Undo within 8s. PR: AK11c Board and poll.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The poll is out of the composer.".
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_poll.cancelled

Inline state. Tap Cancel on the draft. PR: AK11c Board and poll.

- Pieces: E-CXL (Cancelled), E-POLL (Poll draft), E-BOARD (Board and Messages hand-off).
- Header: "Poll for the team", Draft chip.
- Where it lands: "Varsity team chat / Messages".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; poll padding 12; row padding 9 10; board padding 12, radius 18; tile gap 8.

### S-ASK.flow.f_poll.confirm.leave-open

Inline state. Answer: leave open. PR: AK11c Board and poll.

- Pieces: E-CONF (Kit card: header and Draft chip), E-POLL (Poll draft), E-BOARD (Board and Messages hand-off), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "Poll for the team", Draft chip.
- Where it lands: "Varsity team chat / Messages".
- On confirm: Nothing is posted. The poll goes into the team chat composer, and you send it.
- Buttons: "Cancel" and "Open in Messages".
- Answers for this ID: "Leave it open". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: card radius 18; header padding 14 16 10; poll padding 12; row padding 9 10; board padding 12, radius 18; tile gap 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14.

### S-ASK.flow.f_poll.confirm.four-nights

Inline state. Answer: four nights. PR: AK11c Board and poll.

- Pieces: E-CONF (Kit card: header and Draft chip), E-POLL (Poll draft), E-BOARD (Board and Messages hand-off), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "Poll for the team", Draft chip.
- Where it lands: "Varsity team chat / Messages".
- On confirm: Nothing is posted. The poll goes into the team chat composer, and you send it.
- Buttons: "Cancel" and "Open in Messages".
- Answers for this ID: "Mon Nov 2", "Wed Nov 4", "Thu Nov 5", "Sat Nov 7". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: none from Ask. `draft_poll` opens the Team chat composer with the poll filled through Messages prefill (`ChPrefill.poll`); no golf_messages row until the coach presses Post, which calls `sendGolfPoll` (fixed 4 Nov: matched to 02 AK11c and DECISIONS, polls stay drafts in the coach's Messages composer).
- Data: 03 §11.5 (PO1 to PO7).
- Redline: card radius 18; header padding 14 16 10; poll padding 12; row padding 9 10; board padding 12, radius 18; tile gap 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14.

### S-ASK.flow.f_qual.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11b More creates.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Set up a qualifier for the Tiger Classic". Scope: "Varsity · qualifiers".
- Steps: "Reading the Tiger Classic" then "Read the Tiger Classic", detail "Nov 16 to 17 · 5 spots"; "Reading your last qualifier" then "Read your last qualifier", detail "36 holes over 2 days"; "Finding two free days" then "Found two free days", detail "Thu Nov 12 and Fri Nov 13".
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_qual.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11b More creates.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "5 spots" · "Tournament entry"; "Thu Nov 12 and Fri Nov 13" · "Free on the calendar"; "All 7 players" · "Roster".
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_qual.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "One quick question", question 1 of 1: "How many rounds?".
- Options: "2 rounds, 36 holes [Your usual]"; "3 rounds, 54 holes (Adds Sat Nov 14)"; "1 round". Picked by default: option 1.
- Next on the last question reads "Draft the qualifier".
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_qual.folded

Inline state. Last Next; answers fold to pills. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_qual.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-QUAL (Qualifier draft (rounds and seats)), E-EVD (Kit draft well (fields)).
- Header: "New qualifier", Draft chip.
- Fields: "Tiger Classic qualifier"; "Nov 12 to 13 · 36 holes"; "5 spots · top 5 by total"; "7 players".
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: card radius 18; header padding 14 16 10; round card padding 9 10; date tile 40; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_qual.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-QUAL (Qualifier draft (rounds and seats)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New qualifier", Draft chip.
- Fields: "Tiger Classic qualifier"; "Nov 12 to 13 · 36 holes"; "5 spots · top 5 by total"; "7 players".
- Where it lands: "Qualifiers / This season".
- On confirm: 7 players get it on their calendar once Undo closes.
- Buttons: "Cancel" and "Create qualifier".
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: card radius 18; header padding 14 16 10; round card padding 9 10; date tile 40; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_qual.commit

Inline state. Tap the primary button. PR: AK11b More creates.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Creating…"; Cancel disables.
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_qual.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Receipt: "Qualifier created · Nov 12", sub "Players are told when Undo closes", "Open" and Undo with the 8s ring.
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.f_qual.told

Inline state. Undo window closes; players told. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "In Qualifiers and on calendars". Told row: "7 players got it on their calendar", then "Delivered to 7. Seen by 2.".
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_qual.undone

Inline state. Tap Undo within 8s. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The qualifier was removed.".
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_qual.cancelled

Inline state. Tap Cancel on the draft. PR: AK11b More creates.

- Pieces: E-CXL (Cancelled), E-QUAL (Qualifier draft (rounds and seats)).
- Header: "New qualifier", Draft chip.
- Fields: "Tiger Classic qualifier"; "Nov 12 to 13 · 36 holes"; "5 spots · top 5 by total"; "7 players".
- Where it lands: "Qualifiers / This season".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; round card padding 9 10; date tile 40; seat bar height 6, gap 4.

### S-ASK.flow.f_qual.confirm.three-rounds

Inline state. Answer: three rounds. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-QUAL (Qualifier draft (rounds and seats)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New qualifier", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Tiger Classic qualifier"; "Nov 12 to 13 · 36 holes"; "5 spots · top 5 by total"; "7 players".
- Where it lands: "Qualifiers / This season".
- On confirm: 7 players get it on their calendar once Undo closes.
- Buttons: "Cancel" and "Create qualifier".
- Answers for this ID: "3 rounds, 54 holes". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: card radius 18; header padding 14 16 10; round card padding 9 10; date tile 40; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_qual.confirm.one-round

Inline state. Answer: one round. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-QUAL (Qualifier draft (rounds and seats)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New qualifier", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Tiger Classic qualifier"; "Nov 12 to 13 · 36 holes"; "5 spots · top 5 by total"; "7 players".
- Where it lands: "Qualifiers / This season".
- On confirm: 7 players get it on their calendar once Undo closes.
- Buttons: "Cancel" and "Create qualifier".
- Answers for this ID: "1 round". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_qualifier` into golf_qualifiers, entries, round courses; lands in Qualifiers list.
- Data: 03 §11.6 (Q1 to Q7).
- Redline: card radius 18; header padding 14 16 10; round card padding 9 10; date tile 40; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_lineup.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11d Lineup.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Set the Hargrove lineup from the fall qualifier". Scope: "Varsity · Hargrove Invitational".
- Steps: "Reading the fall qualifier" then "Read the fall qualifier", detail "Oct 26 to 27 · 7 players, 36 holes"; "Checking ties for the last spot" then "Checked ties for the last spot", detail "Spot 5 is a tie at +9".
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_lineup.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11d Lineup.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Josie, Jonah, Theo, Eli" · "Qualifier top 4"; "Order by qualifier score" · "Your usual".
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_lineup.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11d Lineup.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "One quick question", question 1 of 1: "Who gets spot 5?", why line "Maya and Ana tied at +9, and your tie rule (the last 18) is tied too.".
- Options: "Maya (Better over her last 5 rounds)"; "Ana (Better at Hargrove last year)"; "Play off Monday (I'll hold spot 5)". Picked by default: option 1.
- Next on the last question reads "Fill spot 5".
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_lineup.folded

Inline state. Last Next; answers fold to pills. PR: AK11d Lineup.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your call. Filling spot 5"-style summary; Change answers link.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_lineup.tie

Inline state. Seats fill; the tie for spot 5 wobbles. PR: AK11d Lineup.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LINEUP (Lineup draft (standings and seats)).
- Seats 1 to 4 fill from the standings; seat 5 reads "Tie · your call"; the two tied rows (Maya and Ana, +9) wobble in amber.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card radius 18; header padding 14 16 10; columns gap 10; row padding 5 8; icon tile 32 radius 9.

### S-ASK.flow.f_lineup.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11d Lineup.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LINEUP (Lineup draft (standings and seats)), E-EVD (Kit draft well (fields)).
- Header: "Hargrove lineup", Draft chip.
- Fields: "Hargrove Invitational · round 1"; "5 players · alternates told"; "Lock it after, on its own".
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card radius 18; header padding 14 16 10; columns gap 10; row padding 5 8; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_lineup.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11d Lineup.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LINEUP (Lineup draft (standings and seats)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Header: "Hargrove lineup", Draft chip.
- Fields: "Hargrove Invitational · round 1"; "5 players · alternates told"; "Lock it after, on its own".
- On confirm: The 5 players and the alternates are told once Undo closes. Locking is a separate step after that.
- Buttons: "Cancel" and "Set the lineup".
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card radius 18; header padding 14 16 10; columns gap 10; row padding 5 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_lineup.commit

Inline state. Tap the primary button. PR: AK11d Lineup.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Setting…"; Cancel disables.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_lineup.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11d Lineup.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-LINEUP (Lineup draft (standings and seats)).
- Receipt: "Lineup set · Hargrove round 1", sub "Players are told when Undo closes", "Open" and Undo with the 8s ring.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: receipt padding 12 16; check disc 22; columns gap 10; row padding 5 8; line 15 / 600.

### S-ASK.flow.f_lineup.told

Inline state. Undo window closes; players told. PR: AK11d Lineup.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Set for round 1. Not locked yet". Told row: "5 players know they're in", then "Seen by 2. Alternates told too.".
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_lineup.undone

Inline state. Tap Undo within 8s. PR: AK11d Lineup.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The lineup is back as it was.".
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_lineup.cancelled

Inline state. Tap Cancel on the draft. PR: AK11d Lineup.

- Pieces: E-CXL (Cancelled), E-LINEUP (Lineup draft (standings and seats)).
- Header: "Hargrove lineup", Draft chip.
- Fields: "Hargrove Invitational · round 1"; "5 players · alternates told"; "Lock it after, on its own".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; columns gap 10; row padding 5 8; coins 24.

### S-ASK.flow.f_lineup.lock

Inline state. Undo window closes; the Lock card rises under the receipt. PR: AK11d Lineup.

- Pieces: E-LOCKASK (Lock the lineup card (after Told)), E-LINEUP (Lineup draft (standings and seats)).
- Lock card: "Lock the lineup for round 1?", small "Locking can't be undone. Scores then count for these five.", buttons "Not yet" and "Lock lineup". The receipt above reads "Set for round 1. Not locked yet".
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card margin-top 12; radius 22; columns gap 10; row padding 5 8; padding 14 16.

### S-ASK.flow.f_lineup.locked

Inline state. Tap "Lock lineup"; each seat locks, then the no-Undo receipt. PR: AK11d Lineup.

- Pieces: E-LOCKASK (Lock the lineup card (after Told)), E-LINEUP (Lineup draft (standings and seats)), E-RCPT (Receipt and Undo (kit ⑤)).
- After the press: capsule "Locking…" for the call, each seated row gets a lock glyph 70ms apart, then the receipt "Lineup locked · round 1" with "Locked for good. There is no Undo." No Undo ring, no Told row.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card margin-top 12; radius 22; columns gap 10; row padding 5 8; receipt padding 12 16; check disc 22.

### S-ASK.flow.f_lineup.not-locked

Inline state. Tap "Not yet" on the Lock card. PR: AK11d Lineup.

- Pieces: E-LOCKASK (Lock the lineup card (after Told)), E-LINEUP (Lineup draft (standings and seats)).
- Buttons replaced by "Not locked. Lock it from the lineup any time." in secondary ink; seats keep no lock glyph.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card margin-top 12; radius 22; columns gap 10; row padding 5 8; padding 14 16.

### S-ASK.flow.f_lineup.confirm.ana

Inline state. Answer: ana. PR: AK11d Lineup.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LINEUP (Lineup draft (standings and seats)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Header: "Hargrove lineup", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Hargrove Invitational · round 1"; "5 players · alternates told"; "Lock it after, on its own".
- On confirm: The 5 players and the alternates are told once Undo closes. Locking is a separate step after that.
- Buttons: "Cancel" and "Set the lineup".
- Answers for this ID: "Ana". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card radius 18; header padding 14 16 10; columns gap 10; row padding 5 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_lineup.confirm.playoff

Inline state. Answer: playoff. PR: AK11d Lineup.

- Pieces: E-CONF (Kit card: header and Draft chip), E-LINEUP (Lineup draft (standings and seats)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Header: "Hargrove lineup", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Hargrove Invitational · round 1"; "5 players · alternates told"; "Lock it after, on its own".
- On confirm: The 5 players and the alternates are told once Undo closes. Locking is a separate step after that.
- Buttons: "Cancel" and "Set the lineup".
- Answers for this ID: "Play off Monday". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `set_lineup` into golf_tournament_set_entries, then golf_tournament_lock_lineup; lands in The Hargrove lineup, set, then locked on its own press.
- Data: 03 §11.7.
- Redline: card radius 18; header padding 14 16 10; columns gap 10; row padding 5 8; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_task.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11a Create engine.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Have Eli and Theo log 50 short putts before Thursday". Scope: "Eli and Theo · this week".
- Steps: "Reading Eli and Theo's focus areas" then "Read Eli and Theo's focus areas", detail "Both on short putts, 3 to 5 ft"; "Reading Thursday" then "Read Thursday", detail "Film at 4:00, no practice".
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_task.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11a Create engine.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Eli and Theo" · "Their focus area"; "Due Thu Nov 5 · 4:00 PM" · "Before film"; "Log 50 putts, 3 to 5 ft" · "Your words".
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_task.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11a Create engine.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 1 of 2: "When should I remind them?", why line "They both open Clubhouse most evenings.".
- Options: "Wed at 7 PM [The night before]"; "Thu at 8 AM [Morning of]"; "No reminder". Picked by default: option 1.
- Next on the last question reads "Draft the task".
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_task.brief-2

Inline state. Next. PR: AK11a Create engine.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 2 of 2: "Just this week, or every week?".
- Options: "Just this week"; "Every week until Hargrove". Picked by default: option 1.
- Next on the last question reads "Draft the task".
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_task.folded

Inline state. Last Next; answers fold to pills. PR: AK11a Create engine.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_task.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TASK (Task draft), E-EVD (Kit draft well (fields)).
- Header: "New task", Draft chip.
- Fields: "Log 50 putts from 3 to 5 ft"; "Due Thu Nov 5 · 4:00 PM"; "Eli Navarro, Theo Lindqvist"; "This week only".
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: card radius 18; header padding 14 16 10; task padding 12; ring 64; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_task.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TASK (Task draft), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New task", Draft chip.
- Fields: "Log 50 putts from 3 to 5 ft"; "Due Thu Nov 5 · 4:00 PM"; "Eli Navarro, Theo Lindqvist"; "This week only".
- Where it lands: "Eli's Home / To do".
- On confirm: Eli and Theo see it on their Home once Undo closes.
- Buttons: "Cancel" and "Assign to 2 players".
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: card radius 18; header padding 14 16 10; task padding 12; ring 64; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_task.commit

Inline state. Tap the primary button. PR: AK11a Create engine.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Assigning…"; Cancel disables.
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_task.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Receipt: "Task assigned · Eli and Theo", sub "They see it when Undo closes", "Open" and Undo with the 8s ring.
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.f_task.told

Inline state. Undo window closes; players told. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "On their Home". Told row: "Eli and Theo got the task", then "Seen by Theo.".
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_task.undone

Inline state. Tap Undo within 8s. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The task was removed.".
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_task.cancelled

Inline state. Tap Cancel on the draft. PR: AK11a Create engine.

- Pieces: E-CXL (Cancelled), E-TASK (Task draft).
- Header: "New task", Draft chip.
- Fields: "Log 50 putts from 3 to 5 ft"; "Due Thu Nov 5 · 4:00 PM"; "Eli Navarro, Theo Lindqvist"; "This week only".
- Where it lands: "Eli's Home / To do".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; task padding 12; ring 64; gap 14.

### S-ASK.flow.f_task.confirm.no-reminder

Inline state. Answer: no reminder. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TASK (Task draft), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New task", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Log 50 putts from 3 to 5 ft"; "Due Thu Nov 5 · 4:00 PM"; "Eli Navarro, Theo Lindqvist"; "This week only".
- Where it lands: "Eli's Home / To do".
- On confirm: Eli and Theo see it on their Home once Undo closes.
- Buttons: "Cancel" and "Assign to 2 players".
- Answers for this ID: "No reminder". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: card radius 18; header padding 14 16 10; task padding 12; ring 64; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_task.confirm.weekly

Inline state. Answer: weekly. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-TASK (Task draft), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New task", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Log 50 putts from 3 to 5 ft"; "Due Thu Nov 5 · 4:00 PM"; "Eli Navarro, Theo Lindqvist"; "This week only".
- Where it lands: "Eli's Home / To do".
- On confirm: Eli and Theo see it on their Home once Undo closes.
- Buttons: "Cancel" and "Assign to 2 players".
- Answers for this ID: "Every week until Hargrove". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_task` into golf_tasks, assignments, reminders; lands in Their Home, under To do.
- Data: 03 §11.8.
- Redline: card radius 18; header padding 14 16 10; task padding 12; ring 64; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_goal.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11b More creates.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Set Jonah a goal on approach". Scope: "Jonah Okafor · approach".
- Steps: "Reading Jonah's approach by round" then "Read Jonah's approach by round", detail "−0.9 a round over 8 rounds"; "Finding what's realistic" then "Found what's realistic", detail "His best 30 days this fall was −0.4".
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_goal.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11b More creates.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Approach strokes gained" · "His focus area"; "Starts at −0.9" · "Last 8 rounds".
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_goal.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 1 of 2: "How far, and by when?", why line "His best 30 days this fall was −0.4.".
- Options: "To −0.5 in 30 days [Steady]"; "To −0.3 in 45 days [Stretch]"; "To even by spring". Picked by default: option 1.
- Next on the last question reads "Draft the goal".
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_goal.brief-2

Inline state. Next. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "Two quick questions", question 2 of 2: "Should Jonah accept it?", why line "Goals he accepts show on his Home.".
- Options: "Yes, he accepts it [Your usual]"; "Just set it". Picked by default: option 1.
- Next on the last question reads "Draft the goal".
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_goal.folded

Inline state. Last Next; answers fold to pills. PR: AK11b More creates.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_goal.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-GOAL (Goal draft), E-EVD (Kit draft well (fields)).
- Header: "New goal for Jonah", Draft chip.
- Fields: "Approach: −0.9 to −0.5"; "30 days · from Nov 1"; "Counts rounds from 125 to 175 yd approaches"; "Jonah accepts it".
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: card radius 18; header padding 14 16 10; chart padding 8 8 2; coin 36; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_goal.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-GOAL (Goal draft), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Header: "New goal for Jonah", Draft chip.
- Fields: "Approach: −0.9 to −0.5"; "30 days · from Nov 1"; "Counts rounds from 125 to 175 yd approaches"; "Jonah accepts it".
- On confirm: Jonah gets it to accept once Undo closes. It shows on his Home when he does.
- Buttons: "Cancel" and "Set the goal".
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: card radius 18; header padding 14 16 10; chart padding 8 8 2; coin 36; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_goal.commit

Inline state. Tap the primary button. PR: AK11b More creates.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Setting…"; Cancel disables.
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_goal.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-GOAL (Goal draft).
- Receipt: "Goal set · Jonah · approach", sub "He's asked to accept when Undo closes", "Open" and Undo with the 8s ring.
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: receipt padding 12 16; check disc 22; chart padding 8 8 2; coin 36; line 15 / 600.

### S-ASK.flow.f_goal.told

Inline state. Undo window closes; players told. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Waiting for Jonah to accept". Told row: "Sent to Jonah to accept", then "Jonah accepted it.".
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_goal.undone

Inline state. Tap Undo within 8s. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The goal was removed.".
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_goal.cancelled

Inline state. Tap Cancel on the draft. PR: AK11b More creates.

- Pieces: E-CXL (Cancelled), E-GOAL (Goal draft).
- Header: "New goal for Jonah", Draft chip.
- Fields: "Approach: −0.9 to −0.5"; "30 days · from Nov 1"; "Counts rounds from 125 to 175 yd approaches"; "Jonah accepts it".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; chart padding 8 8 2; coin 36; line width 2.2.

### S-ASK.flow.f_goal.confirm.just-set

Inline state. Answer: just set. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-GOAL (Goal draft), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Header: "New goal for Jonah", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Approach: −0.9 to −0.5"; "30 days · from Nov 1"; "Counts rounds from 125 to 175 yd approaches"; "Jonah accepts it".
- On confirm: Jonah gets it to accept once Undo closes. It shows on his Home when he does.
- Buttons: "Cancel" and "Set the goal".
- Answers for this ID: "Just set it". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: card radius 18; header padding 14 16 10; chart padding 8 8 2; coin 36; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_goal.told.just-set

Inline state. Answer: just set, then Undo closes. PR: AK11b More creates.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "Waiting for Jonah to accept". Told row: "Sent to Jonah to accept", then "Jonah accepted it.".
- Answers for this ID: "Just set it". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_goal.confirm.stretch

Inline state. Answer: stretch. PR: AK11b More creates.

- Pieces: E-CONF (Kit card: header and Draft chip), E-GOAL (Goal draft), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Header: "New goal for Jonah", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Approach: −0.9 to −0.5"; "30 days · from Nov 1"; "Counts rounds from 125 to 175 yd approaches"; "Jonah accepts it".
- On confirm: Jonah gets it to accept once Undo closes. It shows on his Home when he does.
- Buttons: "Cancel" and "Set the goal".
- Answers for this ID: "To −0.3 in 45 days". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_goal` into golf_goals; lands in Jonah's card, under Goals.
- Data: 03 §11.9.
- Redline: card radius 18; header padding 14 16 10; chart padding 8 8 2; coin 36; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_note.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11a Create engine.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Leave Theo a note on hole 13 at Hilltop". Scope: "Theo Lindqvist · Hilltop round 2".
- Steps: "Reading Theo's Hilltop round 2" then "Read Theo's Hilltop round 2", detail "Hole by hole, 74 (+2)"; "Reading his shots on 13" then "Read his shots on 13", detail "Tee shot left into the bunker, approach short".
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_note.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11a Create engine.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Hilltop round 2 · hole 13" · "Rounds"; "Tee shot left, approach short" · "Shot tracking".
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_note.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-NOTE (Round note draft), E-EVD (Kit draft well (fields)).
- Header: "Note for Theo", Draft chip.
- Fields: "Hole 13 · par 4 · made 6"; "Tee shot left into the bunker, approach 31 ft short"; "Added under your note on hole 4".
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: card radius 18; header padding 14 16 10; strip padding 12; note padding 10 12; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_note.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11a Create engine.

- Pieces: E-CONF (Kit card: header and Draft chip), E-NOTE (Round note draft), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "Note for Theo", Draft chip.
- Fields: "Hole 13 · par 4 · made 6"; "Tee shot left into the bunker, approach 31 ft short"; "Added under your note on hole 4".
- Where it lands: "Round review / Coach notes".
- On confirm: Theo sees it on his round once Undo closes.
- Buttons: "Cancel" and "Share with Theo".
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: card radius 18; header padding 14 16 10; strip padding 12; note padding 10 12; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_note.commit

Inline state. Tap the primary button. PR: AK11a Create engine.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Saving…"; Cancel disables.
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_note.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Receipt: "Note shared · hole 13", sub "Theo sees it when Undo closes", "Open round" and Undo with the 8s ring.
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.f_note.told

Inline state. Undo window closes; players told. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "On Theo's round". Told row: "Theo can see it on his round", then "Seen by Theo.".
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_note.undone

Inline state. Tap Undo within 8s. PR: AK11a Create engine.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. Your earlier notes are back as they were.".
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_note.cancelled

Inline state. Tap Cancel on the draft. PR: AK11a Create engine.

- Pieces: E-CXL (Cancelled), E-NOTE (Round note draft).
- Header: "Note for Theo", Draft chip.
- Fields: "Hole 13 · par 4 · made 6"; "Tee shot left into the bunker, approach 31 ft short"; "Added under your note on hole 4".
- Where it lands: "Round review / Coach notes".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `add_round_note` into golf_round_reviews (coach_notes); lands in Theo's Hilltop round, in Coach notes.
- Data: 03 §11.10.
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; strip padding 12; note padding 10 12.

### S-ASK.flow.f_drill.reads

Inline state. Ask in words (or from / or a follow-up chip); steps run. PR: AK11e Drill.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Bubble: "Add the gate drill with a 5 foot ring to our drill bank". Scope: "Varsity · drill bank".
- Steps: "Reading your drill bank" then "Read your drill bank", detail "Gate drill is saved at 4 ft".
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.flow.f_drill.worked

Inline state. Reads done; the Worked out pills pop in. PR: AK11e Drill.

- Pieces: E-CARD (Answer card (one per turn)), E-INF (Worked out pills).
- Worked out pills (value, then source): "Putting, 3 to 5 ft" · "From the gate drill"; "15 minutes" · "Same as the original"; "Make 8 in a row" · "Your words on the original".
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: card radius 22; card padding 16 18 14; pill padding 7 11 8; pill gap 6; part gap 14.

### S-ASK.flow.f_drill.brief

Inline state. Only what Ask could not work out, question 1. PR: AK11e Drill.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)).
- Header: "One quick question", question 1 of 1: "Who can see it?", why line "Players see a drill when a plan uses it.".
- Options: "Coaches and players"; "Coaches only". Picked by default: option 1.
- Next on the last question reads "Draft the drill".
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: question 18 / 600; option padding 12 13, radius 14; option gap 8; pane padding 16 16 4; Next padding 10 16 radius 12.

### S-ASK.flow.f_drill.folded

Inline state. Last Next; answers fold to pills. PR: AK11e Drill.

- Pieces: E-QCARD (Brief card (Ask first, kit ⑥)), E-INF (Worked out pills).
- The brief folds to its answers as pills with "Your answers"-style summary; Change answers link.
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: question 18 / 600; option padding 12 13, radius 14; pill padding 7 11 8; pill gap 6; option gap 8.

### S-ASK.flow.f_drill.draft

Inline state. The live draft is built; its fields are about to fill. PR: AK11e Drill.

- Pieces: E-CONF (Kit card: header and Draft chip), E-DGREEN (Drill draft (green diagram)), E-EVD (Kit draft well (fields)).
- Header: "New drill", Draft chip.
- Fields: "Gate drill, 5 ft ring"; "Putting · 3 to 5 ft · 15 min"; "Coaches and players".
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: card radius 18; header padding 14 16 10; diagram padding 8; step discs 18; well margin 14 16 6; well padding 12.

### S-ASK.flow.f_drill.confirm

Inline state. Every field filled; "On confirm:" line and buttons. PR: AK11e Drill.

- Pieces: E-CONF (Kit card: header and Draft chip), E-DGREEN (Drill draft (green diagram)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New drill", Draft chip.
- Fields: "Gate drill, 5 ft ring"; "Putting · 3 to 5 ft · 15 min"; "Coaches and players".
- Where it lands: "Practice / Drill bank".
- On confirm: It goes in your drill bank. Players see it when a plan uses it.
- Buttons: "Cancel" and "Add to drill bank".
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: card radius 18; header padding 14 16 10; diagram padding 8; step discs 18; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.flow.f_drill.commit

Inline state. Tap the primary button. PR: AK11e Drill.

- Pieces: E-BTNS (Confirm row and capsule (kit ③ ④)).
- Primary becomes the capsule "Adding…"; Cancel disables.
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: row padding 12 16 14; primary padding 9 14 radius 10; capsule padding 9 18; button type 15.

### S-ASK.flow.f_drill.receipt

Inline state. The draft lands in its home; Undo runs 8s. PR: AK11e Drill.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Receipt: "Added to the drill bank", sub "Players see it when a plan uses it", "Open" and Undo with the 8s ring.
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48; line 15 / 600.

### S-ASK.flow.f_drill.told

Inline state. Undo window closes; players told. PR: AK11e Drill.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Receipt sub becomes "In your drill bank". Told row: "Nobody is told. Players see it when a plan uses it.", then "".
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14; line 15 / 600.

### S-ASK.flow.f_drill.undone

Inline state. Tap Undo within 8s. PR: AK11e Drill.

- Pieces: E-RCPT (Receipt and Undo (kit ⑤)).
- Receipt: "Undone. The drill was removed.".
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: receipt padding 12 16; check disc 22; line 15 / 600; Undo ring 20.

### S-ASK.flow.f_drill.cancelled

Inline state. Tap Cancel on the draft. PR: AK11e Drill.

- Pieces: E-CXL (Cancelled), E-DGREEN (Drill draft (green diagram)).
- Header: "New drill", Draft chip.
- Fields: "Gate drill, 5 ft ring"; "Putting · 3 to 5 ft · 15 min"; "Coaches and players".
- Where it lands: "Practice / Drill bank".
- Line: "Cancelled. Nothing was created."; the draft loses its colour (saturate 0) and keeps full opacity.
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: line padding 12 16 14; draft filter saturate(0), opacity 1; diagram padding 8; step discs 18.

### S-ASK.flow.f_drill.confirm.coaches-only

Inline state. Answer: coaches only. PR: AK11e Drill.

- Pieces: E-CONF (Kit card: header and Draft chip), E-DGREEN (Drill draft (green diagram)), E-EVD (Kit draft well (fields)), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)), E-HS (Home surface preview (where it lands)).
- Header: "New drill", Draft chip.
- Default fields (the answers below change the ones they set, as drawn at the anchor): "Gate drill, 5 ft ring"; "Putting · 3 to 5 ft · 15 min"; "Coaches and players".
- Where it lands: "Practice / Drill bank".
- On confirm: It goes in your drill bank. Players see it when a plan uses it.
- Buttons: "Cancel" and "Add to drill bank".
- Answers for this ID: "Coaches only". The draft and confirm copy follow from them as the page draws them at the anchor.
- Write: `create_drill` into golf_drills; lands in Drill bank. (fixed 4 Nov: into `golf_team_drills`, N-00 010100, held.)
- Data: 03 §11.11.
- Redline: card radius 18; header padding 14 16 10; diagram padding 8; step discs 18; well margin 14 16 6; well padding 12; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.player.steps

Inline state. Player asks "Why is my approach costing me strokes?". PR: AK10a Player Ask.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-STEPS (Steps (kit ①)).
- Data: 03 §7 (PY1 to PY8).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; row min height 32; glyph column 20, gap 10.

### S-ASK.player.answer

Screen. The answer lands with the coach's drill as a read-only card. PR: AK10a Player Ask.

- Pieces: E-CARD (Answer card (one per turn)), E-PROSE (Answer prose), E-VCARD (Tool card (visual)), E-DRILL (Player read-only drill card), E-CITE (Read chip and popover).
- Data: 03 §7 (PY1 to PY8).
- Redline: card radius 22; card padding 16 18 14; prose 16 / 1.55; card radius 18; header padding 14 16 10; card padding 14 16; ladder gap 8; chip padding 4 8; chip type 13 / 600.

### S-ASK.player.drill

Inline state. Read-only drill card inside the answer (no button). PR: AK10a Player Ask.

- Pieces: E-DRILL (Player read-only drill card).
- Data: 03 §7 (PY1 to PY8).
- Redline: card padding 14 16; ladder gap 8; ladder value 20.

### S-ASK.player.recap

Screen. Player asks "How did I play at Hilltop?". PR: AK10a Player Ask.

- Pieces: E-USER (Coach or player bubble), E-CARD (Answer card (one per turn)), E-PROSE (Answer prose), E-VCARD (Tool card (visual)), E-CITE (Read chip and popover), E-CHIPS (Follow-up chips).
- Data: 03 §9 (RC1 to RC10).
- Redline: bubble max width 84%; padding 9 15; card radius 22; card padding 16 18 14; prose 16 / 1.55; card radius 18; header padding 14 16 10; chip padding 4 8; chip type 13 / 600; chip padding 8 14.

### S-ASK.player.allowance

Inline state. Player Ask home: "Ask this week" meter. PR: AK10b Allowance.

- Pieces: E-HOME (Ask home (empty thread)), E-ALLOW (Ask this week meter).
- Data: 03 §1 (H1 to H8).
- Redline: greeting 26 / 600; pulse padding 16 radius 20; card padding 13 15; meter height 6; suggestion row padding 13 14.

### S-ASK.player.allowance-low

Inline state. Under 20% left this week. PR: AK10b Allowance. Not drawn: build from the rule in 05.

- Pieces: E-HOME (Ask home (empty thread)), E-ALLOW (Ask this week meter).
- Data: 03 §1 (H1 to H8).
- Redline: greeting 26 / 600; pulse padding 16 radius 20; card padding 13 15; meter height 6; suggestion row padding 13 14.

### S-ASK.player.out

Inline state. Send a question with the allowance used up. PR: AK10b Allowance.

- Pieces: E-OUT (Out of Ask card), E-COMP (Composer).
- Data: 03 §8 (LM1 to LM9).
- Redline: top padding 16 16 12; title 18 / 600; box radius 26; box padding 8 8 8 14; button padding 9 16.

### S-ASK.player.request

Inline state. Tap "Request more". PR: AK10b Allowance.

- Pieces: E-OUT (Out of Ask card), E-CONF (Kit card: header and Draft chip), E-ONCF (On confirm line), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §8 (LM1 to LM9).
- Redline: top padding 16 16 12; title 18 / 600; card radius 18; header padding 14 16 10; line padding 6 16 0; type 14; row padding 12 16 14; primary padding 9 14 radius 10.

### S-ASK.player.request.commit

Inline state. Tap "Send request". PR: AK10b Allowance.

- Pieces: E-OUT (Out of Ask card), E-BTNS (Confirm row and capsule (kit ③ ④)).
- Data: 03 §8 (LM1 to LM9).
- Redline: top padding 16 16 12; title 18 / 600; row padding 12 16 14; primary padding 9 14 radius 10; button padding 9 16.

### S-ASK.player.request.receipt

Inline state. Request ready; Undo runs 8s. PR: AK10b Allowance.

- Pieces: E-OUT (Out of Ask card), E-RCPT (Receipt and Undo (kit ⑤)), E-HS (Home surface preview (where it lands)).
- Data: 03 §8 (LM1 to LM9).
- Redline: top padding 16 16 12; title 18 / 600; receipt padding 12 16; check disc 22; surface margin 10 16 6, padding 12; row min height 48.

### S-ASK.player.request.told

Inline state. Undo closes; one email sent. PR: AK10b Allowance.

- Pieces: E-OUT (Out of Ask card), E-RCPT (Receipt and Undo (kit ⑤)), E-TOLD (Told row).
- Data: 03 §8 (LM1 to LM9).
- Redline: top padding 16 16 12; title 18 / 600; receipt padding 12 16; check disc 22; told margin 0 16 14; padding 10 12, radius 14.

### S-ASK.player.request.undone

Inline state. Tap Undo within 8s. PR: AK10b Allowance.

- Pieces: E-OUT (Out of Ask card), E-RCPT (Receipt and Undo (kit ⑤)).
- Data: 03 §8 (LM1 to LM9).
- Redline: top padding 16 16 12; title 18 / 600; receipt padding 12 16; check disc 22; button padding 9 16.

### S-ASK.player.request.cancelled

Inline state. Tap Cancel on the request. PR: AK10b Allowance.

- Pieces: E-OUT (Out of Ask card), E-CXL (Cancelled), E-EVD (Kit draft well (fields)).
- Data: 03 §8 (LM1 to LM9).
- Redline: top padding 16 16 12; title 18 / 600; line padding 12 16 14; draft filter saturate(0), opacity 1; well margin 14 16 6; well padding 12.



## Completeness pass, 4 Nov 2026

Specs for the 32 IDs added in 05 §Completeness pass, 4 Nov 2026 (CP-A), plus the new pieces they need. Same shapes as above: a piece library entry (`| | Spec |`) and a per-ID entry (kind line, Pieces, Data, Redline). Every hex is light / dark from `04` and every contrast figure is a measured pair from `capture/contrast-table.txt`; no new colour pair is introduced, so the contrast table needs no new rows. Failure is amber (`--ch-loss`), never red. The Reduce Motion fade is `CH_FADE_MS`.

### CP piece library

#### CP-E-RELFAIL: Failed or partial receipt (amber)

| | Spec |
|---|---|
| Box | replaces E-RCPT in place, same box: padding 12 16, separator above, gap 10; alert disc 22; Try again and Edit (failed) or Open (partial) as text links padding 6, gap 6; no Undo ring |
| Type | line 15 / 600 (wraps to 3); sub 14; links 14 / 600, never wrap |
| Colour | disc `--ch-loss` #9A5700 / #E7AE57 with a `--ch-card-bg` #FFFEFB / #191E1A bar-and-dot glyph 13; line `--ch-text-primary` #1C1B18 / #F1ECDF; sub `--ch-text-secondary` #46433D / #D0C9B8; links `--ch-accent` #155A39 / #7CC79B; the Draft chip returns to its Draft colours and the draft regains full colour |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card: 9.77 / 10.25; Accent links on card: 8.15 / 8.45; Failed step ring (loss on card), used for the disc: 5.57 / 8.53 |
| Icon | alert glyph 13 inside the 22 disc (the steps' failed ring glyph at receipt size); no check, no ring |
| Hit | links about 26 tall drawn, met with a transparent `::after` inset to 44×44 (no layout change) |
| Data | the run's `status` failed or partial and `error_code` from `coachhelm_action_runs`; copy from 05 CP-C by flow; partial names from the failed rows of the write's result |

Redline: padding 12 16; disc 22; line 15 / 600; links 14 / 600; separator above 0.5.

#### CP-E-STOP: Stopped and dropped answer line

| | Spec |
|---|---|
| Box | sits at the end of the answer card under the last prose line, padding 4 16 14, gap 10; Try again text link padding 6 |
| Type | 14; Try again 14 / 600 |
| Colour | stopped: `--ch-text-secondary` #46433D / #D0C9B8; dropped: an 8 dot `--ch-loss` #9A5700 / #E7AE57 before the line, line `--ch-text-secondary`; link `--ch-accent` #155A39 / #7CC79B |
| Contrast | Secondary text on card: 9.77 / 10.25; Accent links on card: 8.15 / 8.45; Failed step ring (loss on card), used for the dot: 5.57 / 8.53 |
| Icon | none (stopped); 8 dot (dropped) |
| Hit | Try again met with `::after` to 44×44 |
| Data | the turn's stream end reason: `stopped` (client abort) or `dropped` (no `done` event before the socket closed) |

Redline: padding 4 16 14; line 14; dot 8; gap 10.

#### CP-E-GONE: Chat not available notice

| | Spec |
|---|---|
| Box | well card above the composer, margin 0 16 10, padding 12 14, radius 14, gap 10; New chat button padding 9 14 radius 10 |
| Type | line 15; button 15 / 600 |
| Colour | `--ch-well-bg-flat` #F6F4EE / #141815 with a 0.5 inset hairline; line `--ch-text-primary` #1C1B18 / #F1ECDF; button `--ch-accent` #155A39 / #7CC79B fill with `--ch-text-on-accent` #FFFEFB / #0E120F |
| Contrast | Body text on well: 15.66 / 15.20; Primary button label (onbtn on btn): 8.15 / 9.44 |
| Icon | none |
| Hit | button 38 drawn, `::after` to 44×44 |
| Data | the chat read returns 404; nothing about the chat is shown |

Redline: margin 0 16 10; padding 12 14; radius 14; button padding 9 14.

#### CP-E-LATE: Too late to undo line

| | Spec |
|---|---|
| Box | E-RCPT box with the ring removed and the Undo link gone; Open stays |
| Type | line 15 / 600; sub 14 |
| Colour | as E-RCPT: disc `--ch-accent` with the check; sub `--ch-text-secondary` #46433D / #D0C9B8 |
| Contrast | Body text on card: 17.08 / 14.34; Secondary text on card: 9.77 / 10.25; Accent links on card: 8.15 / 8.45 |
| Icon | check 13 in the 22 disc |
| Hit | Open met with `::after` to 44×44 |
| Data | the DELETE on `/api/coachhelm/v3/chat/actions/[key]` returns 409 `already_released` |

Redline: as E-RCPT; no ring.

#### CP-E-RECHK: Something changed line

| | Spec |
|---|---|
| Box | replaces the E-ONCF line in place, padding 10 16 0, gap 8; the confirm row under it is reset to its unpressed state |
| Type | 15 |
| Colour | glyph `--ch-loss` #9A5700 / #E7AE57; text `--ch-text-primary` #1C1B18 / #F1ECDF |
| Contrast | Body text on card: 17.08 / 14.34; Loss figures on card, used for the glyph: 5.57 / 8.53 |
| Icon | info glyph 15 (the steps' failed glyph shape) |
| Hit | not interactive |
| Data | execute-time re-check result (02 §14): the field that changed and its new value |

Redline: padding 10 16 0; glyph 15; gap 8.

#### CP-E-MORE: Load more history row

| | Spec |
|---|---|
| Box | full rail or sheet row, 44 tall, padding 7 10; one skeleton bar 60% wide, 10 tall, radius 5 |
| Type | none while loading; on failure "Couldn't load more. Try again." 14 |
| Colour | bar `--ch-well-bg-flat` #F6F4EE / #141815 on the rail's `--ch-grouped-bg` #F2F0E9 / #0E120F; failure text `--ch-text-secondary` #46433D / #D0C9B8 on page |
| Contrast | Secondary on page: 8.64 / 11.45 (failure text); the bar is decorative |
| Icon | none |
| Hit | the failure row is one 44 target |
| Data | next 30 chats, cursor on `updated_at` then id |

Redline: row 44; bar 60% × 10, radius 5.

#### CP-E-MID: Mid desktop shell, 821 to 1279

| | Spec |
|---|---|
| Box | sidebar 232 unchanged (shell owns it); the history rail is hidden and opens as a 280 overlay from the left edge of the main area over a scrim, full height under the 56 top bar; thread column fluid with 24 side gutters, max 680, centred; the artifact pane opens as an overlay from the right, width min(452, main width minus 64), over a scrim, instead of sitting beside the thread; composer follows the thread column |
| Type | as E-DESK |
| Colour | as E-DESK; overlay rail on `--ch-grouped-bg` #F2F0E9 / #0E120F with `--ch-shadow-lg`; scrim black at 18% light, 40% dark |
| Contrast | as E-DESK (Body text on page 15.10 / 16.01; Tertiary on page 5.85 / 7.80) |
| Icon | a history button 36 in the top bar, left of the crumb (sidebar-left glyph 18) |
| Hit | history button 36 drawn, `::after` to 44×44; scrim tap closes |
| Data | window width from the shell's media query; nothing new |

Redline: break 821 and 1280; rail overlay 280; gutters 24; pane min(452, main minus 64); top bar 56.

#### CP-E-FOCUS: Keyboard focus ring

| | Spec |
|---|---|
| Box | 2 outline, offset 2, follows the element's radius; on glass circles the ring sits outside the glass |
| Type | none |
| Colour | `--ch-accent` #155A39 / #7CC79B |
| Contrast | Active step dot (accent on card), used for the ring: 8.15 / 8.45; Accent on well: 7.48 / 8.96 |
| Icon | none |
| Hit | none |
| Data | `:focus-visible` only |

Redline: outline 2; offset 2.

#### CP-E-JUMP: Jump to latest key

| | Spec |
|---|---|
| Box | Messages S-MSG.jump reused as is: 40 glass-strong circle (blur 18), right 14 at 390 and 18 at 430, 12 above the composer; desktop: 12 above the composer at the thread column's right edge; no count badge in Ask (one answer at a time) |
| Type | none |
| Colour | glass-strong #FCFAF6 / #191E1A; arrow `--ch-text-primary` #1C1B18 / #F1ECDF |
| Contrast | 16.5 / 14.28 (S-MSG.jump row) |
| Icon | arrow-down 19, stroke 2.2 |
| Hit | 40 drawn, `::after` to 44×44 |
| Data | thread scroll position and the streaming state |

Redline: key 40; right 14 / 18; 12 above the composer.

#### CP-E-QUIET: Quiet flow draft

| | Spec |
|---|---|
| Box | E-CONF header with the flow's icon tile and title, then E-EVD with the TASK_FIELDS rows for the flow, then E-ONCF and E-BTNS; no flow visual and no E-HS |
| Type | as E-EVD |
| Colour | as E-EVD |
| Contrast | as E-EVD (Body text on well 15.66 / 15.20; Secondary on well 8.96 / 10.87) |
| Icon | tile glyphs: q_block clock, q_break calendar, q_term book, q_avail person, q_recruit person-plus |
| Hit | as E-EVD |
| Data | TASK_FIELDS §5.16 to §5.20 for that flow |

Redline: as E-CONF and E-EVD; Told uses E-TOLD's private 24 tile with the lock glyph.

#### CP-E-DRILLNOTE: Drill bank line

| | Spec |
|---|---|
| Box | under the green diagram in the drill draft, padding 8 16 0 |
| Type | 14 |
| Colour | `--ch-text-secondary` #46433D / #D0C9B8 |
| Contrast | Secondary text on card: 9.77 / 10.25 |
| Icon | none |
| Hit | not interactive |
| Data | fixed copy (05 CP-L) |

Redline: padding 8 16 0; 14.

#### CP-E-REQD: Requested this week row

| | Spec |
|---|---|
| Box | replaces the Request more button row in E-OUT, padding 12 16 16 |
| Type | 15 |
| Colour | `--ch-text-secondary` #46433D / #D0C9B8 |
| Contrast | Secondary text on card: 9.77 / 10.25 |
| Icon | check 14 `--ch-accent` before the line |
| Hit | not interactive |
| Data | `ask_credit_requests` row for this player and week |

Redline: padding 12 16 16; check 14; line 15.

### CP per-ID specs

#### S-ASK.turn.stopped

Inline state. Stop pressed while words stream. PR: AK1 Answer card and steps. Not drawn: build from 05 CP-G.

- Pieces: E-CARD, E-PROSE, CP-E-STOP.
- Data: 03 §2 (P1 to P15) for what had streamed.
- Redline: answer padding as E-CARD; stop line padding 4 16 14; line 14.

#### S-ASK.turn.dropped

Inline state. The connection drops mid-answer. PR: AK1 Answer card and steps. Not drawn: build from 05 CP-G.

- Pieces: E-CARD, E-PROSE, CP-E-STOP (dropped), E-COMP (offline line).
- Data: 03 §2 (P1 to P15).
- Redline: stop line padding 4 16 14; dot 8; composer as E-COMP.

#### S-ASK.jump

Control. Shown while the reader is more than 0.9 of a screen from the bottom. PR: AK1 Answer card and steps. Not drawn: Messages S-MSG.jump.

- Pieces: CP-E-JUMP.
- Data: none.
- Redline: key 40; right 14 / 18; 12 above the composer.

#### S-ASK.chat.gone

Inline state. A chat link to a deleted or not-allowed chat. PR: AK8 Tone and CoachHelm knows. Not drawn: build from 05 CP-G.

- Pieces: E-SHEET, E-SCOPE, CP-E-GONE, E-COMP.
- Data: 03 §1 (H1 to H8): the chat read.
- Redline: notice margin 0 16 10; padding 12 14; radius 14.

#### S-ASK.history.more

Inline state. End of the history list with more than 30 chats. PR: AK8 Tone and CoachHelm knows. Not drawn: build from 05 CP-G.

- Pieces: E-DESK (rail) or the history sheet, CP-E-MORE.
- Data: 03 §1 (H1 to H8).
- Redline: rail 248; rows padding 7 10; more row 44.

#### S-ASK.desk-mid

Screen. Window 821 to 1279 wide. PR: AK1 Answer card and steps. Not drawn: build from this section.

- Pieces: CP-E-MID, E-THREAD, E-COMP, E-APANEL (as overlay).
- Data: none new.
- Redline: sidebar 232; rail overlay 280; gutters 24; thread max 680; pane min(452, main minus 64).

#### S-ASK.kit.release-failed

Inline state. The held write is refused when Undo closes. PR: AK4 Confirm, commit, receipt, Undo. Not drawn: build from 05 CP-C.

- Pieces: E-CONF, the flow draft, CP-E-RELFAIL.
- Data: 03 §11 (the flow's rows); `coachhelm_action_runs` status.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.kit.undo-late

Inline state. Undo pressed after the server released the write. PR: AK4 Confirm, commit, receipt, Undo. Not drawn: build from 05 CP-G.

- Pieces: E-CONF, the flow draft, CP-E-LATE, E-TOLD.
- Data: 03 §11.1 (E1 to E10).
- Redline: as E-RCPT, no ring; told margin 0 16 14.

#### S-ASK.kit.recheck

Inline state. Something the draft names changed before the press. PR: AK11a Create engine. Not drawn: build from 05 CP-G.

- Pieces: E-CONF, the flow draft (redrawn), CP-E-RECHK, E-BTNS.
- Data: the re-check reads (02 §14).
- Redline: line padding 10 16 0; row padding 12 16 14.

#### S-ASK.kit.no-hold

Inline state. HM1 not run: today's ActionCard and AskReceiptCard. PR: AK4 Confirm, commit, receipt, Undo. Not drawn: today's app.

- Pieces: today's `ActionCard` and `AskReceiptCard` restyled to E-CONF and E-RCPT with no ring and no Undo.
- Data: today's `coachhelm_action_runs`.
- Redline: as E-CONF and E-RCPT; no ring.

#### S-ASK.flow.f_event.failed

Inline state. The write is refused. PR: AK11a Create engine. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-WK, CP-E-RELFAIL.
- Data: 03 §11.1.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_event.partial

Inline state. The main row saved; a side write failed. PR: AK11a Create engine. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-WK, CP-E-RELFAIL (partial), E-TOLD (only the reached people).
- Data: 03 §11.1.
- Redline: receipt padding 12 16; disc 22; told margin 0 16 14.

#### S-ASK.flow.f_annc.failed

Inline state. The write is refused. PR: AK11b More creates. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-LOCKP, CP-E-RELFAIL.
- Data: 03 §11.2.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_annc.partial

Inline state. The main row saved; a side write failed. PR: AK11b More creates. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-LOCKP, CP-E-RELFAIL (partial), E-TOLD (only the reached people).
- Data: 03 §11.2.
- Redline: receipt padding 12 16; disc 22; told margin 0 16 14.

#### S-ASK.flow.f_travel.failed

Inline state. The write is refused. PR: AK11b More creates. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-TRAVEL, CP-E-RELFAIL.
- Data: 03 §11.3.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_board.failed

Inline state. The write is refused. PR: AK11c Board and poll. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-BOARD, CP-E-RELFAIL.
- Data: 03 §11.4.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_poll.failed

Inline state. The write is refused. PR: AK11c Board and poll. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-POLL, CP-E-RELFAIL.
- Data: 03 §11.5.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_qual.failed

Inline state. The write is refused. PR: AK11b More creates. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-QUAL, CP-E-RELFAIL.
- Data: 03 §11.6.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_lineup.failed

Inline state. The write is refused. PR: AK11d Lineup. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-LINEUP, CP-E-RELFAIL.
- Data: 03 §11.7.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_lineup.lock-failed

Inline state. The lock RPC refuses after Told. PR: AK11d Lineup. Not drawn: copy from 05 CP-C.

- Pieces: E-LOCKASK, CP-E-RELFAIL.
- Data: 03 §11.7.
- Redline: card as E-LOCKASK; receipt padding 12 16; disc 22.

#### S-ASK.flow.f_task.failed

Inline state. The write is refused. PR: AK11a Create engine. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-TASK, CP-E-RELFAIL.
- Data: 03 §11.8.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_task.partial

Inline state. The main row saved; a side write failed. PR: AK11a Create engine. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-TASK, CP-E-RELFAIL (partial), E-TOLD (only the reached people).
- Data: 03 §11.8.
- Redline: receipt padding 12 16; disc 22; told margin 0 16 14.

#### S-ASK.flow.f_goal.failed

Inline state. The write is refused. PR: AK11b More creates. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-GOAL, CP-E-RELFAIL.
- Data: 03 §11.9.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_note.failed

Inline state. The write is refused. PR: AK11a Create engine. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-NOTE, CP-E-RELFAIL.
- Data: 03 §11.10.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.f_drill.failed

Inline state. The write is refused. PR: AK11e Drill. Not drawn: copy from 05 CP-C.

- Pieces: E-CONF, E-EVD, E-DGREEN, CP-E-DRILLNOTE, CP-E-RELFAIL.
- Data: 03 §11.11.
- Redline: receipt padding 12 16; disc 22; line 15 / 600.

#### S-ASK.flow.q_block

Inline state, every kit stage (`&stage=`). PR: AK11b More creates. Not drawn: build from 05 CP-B.

- Pieces: E-STEPS, E-INF, E-QCARD (only for TASK_FIELDS ASK rows), CP-E-QUIET, E-RCPT, E-TOLD (private tile), E-CXL.
- Data: TASK_FIELDS §5.16.
- Redline: card radius 18; header padding 14 16 10; well margin 14 16 6, padding 12; receipt padding 12 16.

#### S-ASK.flow.q_break

Inline state, every kit stage (`&stage=`). PR: AK11b More creates. Not drawn: build from 05 CP-B.

- Pieces: E-STEPS, E-INF, E-QCARD (only for TASK_FIELDS ASK rows), CP-E-QUIET, E-RCPT, E-TOLD (private tile), E-CXL.
- Data: TASK_FIELDS §5.17.
- Redline: card radius 18; header padding 14 16 10; well margin 14 16 6, padding 12; receipt padding 12 16.

#### S-ASK.flow.q_term

Inline state, every kit stage (`&stage=`). PR: AK11b More creates. Not drawn: build from 05 CP-B.

- Pieces: E-STEPS, E-INF, E-QCARD (only for TASK_FIELDS ASK rows), CP-E-QUIET, E-RCPT, E-TOLD (private tile), E-CXL.
- Data: TASK_FIELDS §5.18.
- Redline: card radius 18; header padding 14 16 10; well margin 14 16 6, padding 12; receipt padding 12 16.

#### S-ASK.flow.q_avail

Inline state, every kit stage (`&stage=`). PR: AK11b More creates. Not drawn: build from 05 CP-B.

- Pieces: E-STEPS, E-INF, E-QCARD (only for TASK_FIELDS ASK rows), CP-E-QUIET, E-RCPT, E-TOLD (private tile), E-CXL.
- Data: TASK_FIELDS §5.19.
- Redline: card radius 18; header padding 14 16 10; well margin 14 16 6, padding 12; receipt padding 12 16.

#### S-ASK.flow.q_recruit

Inline state, every kit stage (`&stage=`). PR: AK11b More creates. Not drawn: build from 05 CP-B.

- Pieces: E-STEPS, E-INF, E-QCARD (only for TASK_FIELDS ASK rows), CP-E-QUIET, E-RCPT, E-TOLD (private tile), E-CXL.
- Data: TASK_FIELDS §5.20.
- Redline: card radius 18; header padding 14 16 10; well margin 14 16 6, padding 12; receipt padding 12 16.

#### S-ASK.player.requested

Inline state. Request more already sent this week. PR: AK10b Allowance. Not drawn: build from 05 CP-E.

- Pieces: E-OUT, CP-E-REQD, E-COMP (paused).
- Data: 03 §8 (LM1 to LM9); `ask_credit_requests`.
- Redline: top padding 16 16 12; title 18 / 600; row padding 12 16 16.

#### S-ASK.player.request.failed

Inline state. The request row can't be written when Undo closes. PR: AK10b Allowance. Not drawn: copy from 05 CP-C.

- Pieces: E-OUT, CP-E-RELFAIL.
- Data: 03 §8 (LM1 to LM9).
- Redline: top padding 16 16 12; receipt padding 12 16; disc 22.



## Wiring, 4 Nov 2026

Checked against helmv3 main 03d9087 (1 Nov) by reading code and migrations only (the lane was written at 75b4956; citations that moved are fixed in place in 02, 03, 05 and 08 with "fixed 4 Nov wiring"). Paths are under `src/` unless they start with `supabase/`. `AT` is `lib/coachhelm/v3/chat/agent-tools.ts`, `RT` is `read-tools.ts` beside it, `ROUTE` is `app/api/coachhelm/v3/chat/stream/route.ts`, `ACT` is `app/golf/actions/`. "new" names code the build adds, in the PR given. Policy names are the effective ones after every migration on 03d9087 (later DROP and CREATE taken into account); `baseline` is `supabase/migrations/20260527000000_prod_public_baseline.sql`. Every write runs with the coach's own session client, so RLS is the second check behind the action's own team check, and the action's own check is named where it is the one that bites.

Rules for every row below, so they are not repeated:
- Flags are read on the server only (`lib/flags/is-enabled.ts:1` imports `server-only`). `coachhelm_ask_v2` and `coachhelm_player_ask_v1` are new in AK0 (`config/feature-flags.yml`, shape of `coachhelm_track_record_v1` at line 1198). The route reads `isAskV2Enabled()` once beside `claimsBlockEnabled` (ROUTE 550) and passes `askV2` into `buildCoachTools` (ROUTE 554-562) and `v2` into `<Ask>` (`clubhouse/routes/coachhelm.tsx:60-70`). Flag off: every new tool, part and route is absent and today's code path runs (S-ASK.flag-off). Every new tool is also inside the `teamTools` block (AT 585, `isClubhouseForTeam`, ROUTE 561), so Fairway's chat never gets it.
- Shot tracking: Ask only reads `golf_shots`, `golf_holes` and `golf_rounds` (AK6 `shot-reads.ts`, new). Nothing on any screen below changes what shot tracking collects, stores or sends; `hooks/golf/use-shot-tracking.ts`, `submit_round_atomic` and the partial save RPC are untouched (02 §1).
- Double submit: Confirm and Cancel lock on the first press (today's `deciding` lock, `clubhouse/screens/coachhelm/chat/ActionCard.tsx:22`); the server claim is `claimForExecution` on UNIQUE `(coach_id, idempotency_key)` (`lib/coachhelm/v3/chat/action-runs.ts:148`, `supabase/migrations/20260725170000_coachhelm_action_runs_and_ui_parts.sql:78`), so a second press or a retried request returns the first run's receipt.
- Optimistic update: none. Nothing shows as done before the read-back (TASK_FIELDS §2 rule 5); the capsule ("Adding…") is the only interim state.
- A missing value shows "—". A figure with no source row in 03 does not ship (SHARED-11).

### W1. Shell, gates and the turn (S-ASK, S-ASK.player, S-ASK.flag-off, S-ASK.desk-mid, S-ASK.turn.*, S-ASK.steps.*, S-ASK.jump)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Ask route and home | `loadAskCoachHelm` (`clubhouse/data/coachhelm-chat.ts:116`), gate `loadCoachHelmGate` (`routes/coachhelm.tsx:65`), scope from `ASK_RANGES` (`data/coachhelm-chat-shape.ts:244`), pulse `program-pulse.ts`, starters `buildAskSuggestions` (chat-shape 101) | none | coach: `resolveCoachChatContext` (`lib/coachhelm/v3/chat/context.ts:78-111`, throws 403 at :89 for a non-coach); conversations `chat_conversations_coach_only` (baseline :18520) | none | renders | gate off: today's "CoachHelm is off" board; load failed: S-ASK.error | refetch on route load | none | `coachhelm_ask_v2` (server, route prop `v2`) | n/a |
| Send a question | composer text | `POST /api/coachhelm/v3/chat/stream` (ROUTE 327, `maxDuration` 120 at 114) through `useCoachHelmChat` (`components/golf/coachhelm/chat/useCoachHelmChat.ts:33`) | coach session; budget `checkBudget` (`lib/coachhelm/v3/llm/budget.ts`, coach-keyed) before any row | 1 to today's composer limit; empty send disabled | streamed answer card | budget out: today's message; stream error: S-ASK.turn.dropped (what streamed stays) | the turn persists in `golf_coachhelm_chat_messages` (`chat_messages_coach_only`, baseline :18524) at `onFinish` (ROUTE 961); other device sees it on focus refetch | none | as above | n/a |
| Live steps and fold | `data-progress` parts (AT 239-245, labels `PROGRESS_LABEL` AT 144-167); AK1 rewrites the same part id with `state`, `done`, `detail` | none | server only | `detail` built from the envelope's own counts (`detailFor`, new AK1) | fold "N steps · Ns" (`stepsReceipt`, new in `clubhouse/data/coachhelm-chat-thread.ts`, beside `workReceipt` :262) | failed read: `unavailableEnvelope` (AT 220) gives the amber step | stream | none | `askV2` | n/a |
| Stop, stopped mid-words | client abort of the stream | none (answers write nothing) | coach | n/a | "Stopped." line | n/a | none | none | `askV2` | n/a |
| Jump key, composer text per chat | client scroll; sessionStorage per chat id (Messages drafts pattern) | none | client | n/a | n/a | storage throws: text not kept, nothing else changes | n/a | none | `askV2` | n/a |

### W2. Read chips, Sources, tool cards and follow-ups (S-ASK.readchip*, S-ASK.sources*, S-ASK.toolcard.*, S-ASK.followups, S-ASK.answer.*)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Read chip, popover, Sources well | `data-evidence` parts written by `evidence()` (AT 248-255) with `evidence_ref` (AT 270); today's reads in RT (`getPlayerMetric` 269, `getPlayerTrend` 415, `getPuttingDistanceProfile` 537, `getRecentRounds` 820, `getFocusAreas` 972, `getUpcomingEvents` 1028, `getTeamRounds` 1240, `getTournaments` 1366, `getQualifiers` 1431) | none | coach; each read closes over `ctx` and checks `requireRosterPlayer` (`context.ts:186`); tables under their own coach policies (for example `golf_player_stats_cache` "Coaches can view team player stats", baseline) | a figure must be in the envelope (claim audit `claims-packet.ts`, flag `coachhelm_chat_claim_gate`) | chip opens | read failed: amber step, chip absent | n/a | none | `askV2` | n/a |
| Tool cards (putt profile, SG, miss pattern, season, hole strip) | new reads AK6 `shot-reads.ts` (`get_shot_pattern`, `get_proximity_by_band`, `get_round_detail`), AK7 (`get_root_causes` over `lib/coachhelm/v3/engine/root-cause.ts`, `get_team_patterns`, `get_calendar`, `get_course`, `compare_seasons`); blocks in `lib/coachhelm/v3/chat/visuals/composition.ts` v2 | none | coach; reads `golf_shots` under `golf_shots_select` (baseline) | putting bands 0-3, 3-5, 5-10 ft (`putt-distance-buckets.ts`); SG "scoring baseline" (`metrics-catalog.ts`) | card crossfades from skeleton | a block whose read failed is dropped, never drawn empty | n/a | none | `askV2`; `get_team_patterns` also `coachhelm_team_pattern_v1` (yml 781) | n/a |
| "Ask about this" on a mark, follow-up chips | the mark's `evidence_ref` | sends a new turn | coach | n/a | new turn | n/a | n/a | none | `askV2` | n/a |
| "Open in Stats" | metric and window | navigation `statsHref` (`clubhouse/.../statsHref`, filter shape) | coach | n/a | Stats | n/a | n/a | none | none | n/a |

### W3. History, chat links, tone and CoachHelm knows (S-ASK.history*, S-ASK.chat.gone, S-ASK.history.more, S-ASK.tone*, S-ASK.knows*, S-ASK.settings.sheet)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| History list, groups | `listConversations` (`lib/coachhelm/v3/chat/persistence.ts:57`, no limit today); groups `groupConversations` (chat-shape 149) | new `listConversationsPage(sb, {before, limit: 30})` in `persistence.ts` (AK8), used by S-ASK.history.more | coach: `chat_conversations_coach_only` | 30 per page | rows | read failed: today's notice with Try again | refetch on sheet open, rail on focus | none | `askV2` | n/a |
| Open a chat link | `?view=ask&c=<id>` (`conversationHref`, `clubhouse/screens/coachhelm/chat/History.tsx:34-36`), `getConversation` (`persistence.ts:66`) and `GET /api/coachhelm/v3/chat/conversations/[id]` (404 at :33) | none | RLS returns no row for another owner, so the route answers 404 and never the title | uuid | thread at bottom | missing or not allowed: S-ASK.chat.gone | n/a | none | `askV2` | n/a |
| Tone control | `golf_coachhelm_chat_conversations.tone` (HM2) | new server action `setChatTone(conversationId, tone)` in `app/golf/actions/coachhelm-ask.ts` (AK8) | coach: `chat_conversations_coach_only` (FOR ALL) covers the update | one of straight, detailed, team_talk (HM2 CHECK) | segment moves; next turn's instructions add the tone paragraph (`lib/coachhelm/v3/chat/instructions.ts`) | refused: segment springs back, toast "Couldn't change the tone" | refetch on focus | none | `askV2` | HM2 not run (42703 on `tone`): control hidden, tone Straight |
| CoachHelm knows list, Edit sheet | `golf_coachhelm_coach_facts` (HM2) | new `saveCoachFact`, `deleteCoachFact` in the same file (AK8); never a model tool | coach: `golf_coachhelm_coach_facts_select/insert/update/delete` (HM2) | 1 to 280 characters trimmed (HM2 CHECK) | row shows; loads into the system prompt as "Standing facts the coach gave" | refused: the field keeps the text with the error line | refetch on sheet open | none | `askV2` | HM2 not run (42P01): list, sheet and settings button hidden |

### W4. The kit: confirm, commit, receipt, Undo, Told (S-ASK.kit.*, every `.confirm`, `.commit`, `.receipt`, `.told`, `.undone`, `.cancelled`, S-ASK.moment.*)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Draft and confirm card | `data-action-proposal` from `proposeGated` (AT 317-370), ledger row `recordProposal` (`action-runs.ts:96`, status `proposed`) | none until the press | coach: `coachhelm_action_runs_coach_only` (FOR ALL, `20260725170000:96-101`) | the flow's planner (TASK_FIELDS §5); `CONFIRM_REQUIRED_TOOLS` (AT 102-107) gains each new write tool under `askV2` only | primary live | planner refused (`ActionPlanError`): one line in the answer, no card | n/a | none | `askV2` | HM1 not run: S-ASK.kit.no-hold (today's `AskActionCard`, `ActionCard.tsx:22`) |
| Primary press (commit) | approval through `chat.addToolApprovalResponse` (`useCoachHelmChat.ts:239-258`); route `toolApproval` (ROUTE 655) | `executeGated` (AT 372-437) calls new `holdForExecution(sb, {coach_id, idempotency_key, run_at})` in `lib/coachhelm/v3/chat/undo-hold.ts` (AK4): `proposed` to `held`, `run_at = now() + 8s`; writes `data-action-receipt` `{status: 'held', held_until}` | coach, same policy; execute-time re-check of `team_id` and roster (02 §14 Risks) | re-check failure: S-ASK.kit.recheck, no hold written | capsule then receipt with ring timed to `held_until` (server time) | claim error: S-ASK.kit.failed, nothing held | other device: the held receipt on focus refetch, ring from `held_until` | none yet: nobody is told inside the window | `askV2` | HM1 not run: immediate write as today, no Undo |
| Undo (inside 8s) | ledger row | new route `DELETE /api/coachhelm/v3/chat/actions/[key]` (`app/api/coachhelm/v3/chat/actions/[key]/route.ts`, AK4) calls `cancelHeld`: `held` to `cancelled` only `where run_at > now()` | coach session; 404 for another coach's key (RLS returns no row) | key must exist and be held | "Undone. Nothing was added and nobody was told." | late (0 rows): S-ASK.kit.undo-late, "Too late to undo. It's done. Open it to change it." | either device: next refetch shows `cancelled` | none, ever | `askV2` | HM1 not run: no Undo |
| Release (window closes) | ledger row re-read | `releaseHeld` from `after()` in ROUTE (add `import { after } from 'next/server'`; ROUTE imports only `NextRequest`, `NextResponse` at 27-28), atomic `update … set status = 'approved' where status = 'held' and run_at <= now() returning`, then the flow's executor, then `recordOutcome` (`action-runs.ts:221`); `sweepHeld` at the next chat request; the client's ring end calls `POST …/actions/[key]?now=0` as a third trigger (no-op if released) | server, coach session cookies (route handler) | runs once: the state compare and the idempotency key | durable receipt replaces the held one | release refused: S-ASK.kit.release-failed (amber, CP-C line), nobody told; a post-commit cache error (`updateTag` outside a Server Action, see 02 §7 fixed note) is decided by a read-back of the domain row, never by `ActionResult` alone | the destination's own channel (W5) | the flow's own fan-out runs inside the executor, so players hear only now | `askV2` | n/a |
| Open | ledger row | `POST …/actions/[key]?now=1` commits early (`run_at = now()`, then release), waits for the receipt, then routes | coach | key held or completed | destination (05 CP-I Open row; hrefs in W5) | object gone since: S-OPEN.gone shape (destination's not-found) | browser back returns to the chat at the same scroll | as release | `askV2` | n/a |
| Told row | `GET …/actions/[key]` returns the ledger `result` plus delivery counts read with the admin client (players' `notifications` rows are not readable by the coach, `notifications_select_own`, baseline): bell rows by the run's object id in `data`, `golf_event_attendance` rows for events, `golf_announcement_acknowledgements` (`golf_acks_select_coaches`, `20261017101500`) for "n of N acknowledged", `golf_conversation_read_marks` (applied `20261025010000`) for messages | none | coach; the route returns counts and roster ids only | order by `created_at`; "seen" only where a column records it (`notifications.read_at`) | coins, then the line | delivery read fails: the line without coins ("Sent."), never an invented count | refetch when the ring ends and on focus | n/a | `askV2` | HM1 not run: no Told row (today's receipt) |
| Cancel | none | `recordDenial` (`action-runs.ts:209`) through today's `addToolApprovalResponse(…, approved: false)` | coach | n/a | "Cancelled. Nothing was created." | n/a | n/a | none | `askV2` | same today |

### W5. Today's four writes and every create flow (S-ASK.flow.f_*, S-ASK.flow.q_*, CP-A failed and partial IDs)

Every row here goes through W4 (hold, Undo, release, Told). "Tells" is who the executor's own fan-out reaches at release. Push respects `users.notification_preferences` through `pushDeliveryKeyFor` (`lib/notifications/push.ts:39-80`: `team_announcement`, `qualifier_created` and events under `push_events`, tasks under `push_task_reminders`); email goes only while `HELM_CUSTOMER_EMAIL_ENABLED` (`isCustomerEmailEnabled`, `lib/email/outbound-gate.ts:32`).

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Recurring practice (today) | roster, calendar | `create_recurring_practice` (AT 721-876) moves onto `executeGated` under `askV2`; executor `executeRecurringPractice` | coach: `golf_events_insert_coach` (baseline, `is_golf_team_coach(team_id)`) | today's planner | "Added N practices" | today's partial copy | Calendar `clubhouse/screens/calendar/live.ts` (realtime on `golf_events`) | invitees only when RSVP is on (as f_event) | `askV2` for the hold | today's immediate write |
| Focus area (today) | roster | `executeFocusArea` (`action-planners.ts:135`) to `createFocusArea` (`ACT/development.ts:515`) | coach: `golf_player_focus_areas_insert_coach` (baseline) | duplicate guard `ACTIVE_FOCUS_DUPLICATE_ERROR` | receipt | today's failed copy | `revalidatePath` in the action; player's Lenses refetch on focus | today's focus-area notice | `askV2` | today's immediate write |
| f_task, task (today) | roster | `executeTask` (`action-planners.ts:256`) to `createTask` (`ACT/tasks.ts:541`, impl 331); reminders `golf_task_reminders` | coach: `golf_tasks_insert_coach`, `golf_task_assignments_coach_all`, "Coaches can create team task reminders" (all baseline) | TASK_FIELDS §5.x (priority low, normal, high) | "Assigned to …" | f_task.failed; f_task.partial when the reminder insert fails | `hooks/golf/use-task-realtime.ts` (`golf_tasks`, `golf_task_assignments`) | `notifyTaskAssigned` (tasks.ts impl, about :515) and push `task_assigned` | `askV2` | today's immediate write |
| f_annc, team update (today's `create_team_announcement`; the brief's "create_announcement" is this tool) | roster | `executeAnnouncement` (`action-planners.ts:373`) to `createEnrichedAnnouncement` (`ACT/announcements.ts:741`, impl 254); urgency only `normal` or `urgent` | coach: "Coaches can manage announcements" (baseline, FOR ALL); bell insert by admin client (announcements.ts:619-640) because `notifications_insert_own` allows self only | title 120, body 2000 (`planAnnouncement`, `action-planners.ts:324`) | "Post to 7 players" then receipt | f_annc.failed; f_annc.partial when `sendBulkPushNotification` reports `failed > 0` (announcements.ts:664-676) | no realtime on `golf_announcements`: `revalidatePath('/golf/dashboard/announcements')` (:696) and Messages refetch on focus | bell (`notifications`, type `event_reminder`, `data.announcement_id`, :621-632), email `notifyTeamAnnouncement` (:648), push `team_announcement` (:664) to the chosen players only | `askV2` | today's immediate post with today's card |
| f_event | `get_calendar` (AK7), roster, team zone (`resolveTeamTimeZone`) | new `create_event` tool in `lib/coachhelm/v3/chat/create-tools.ts` (AK11a) to `createGolfEvent` (`ACT/calendar-events.ts:537`, impl 332) with `requestId` = a uuid from the run key, so a double release returns the same row (calendar-events.ts:411-433) | coach: `golf_events_insert_coach` | `allDay` and offset always sent (TASK_FIELDS §7.3); end after start | "Added to calendar" | f_event.failed; f_event.partial when `invitationsError` is returned (calendar-events.ts:486) | `clubhouse/screens/calendar/live.ts` and `hooks/golf/use-calendar-range-events.ts` (realtime `golf_events`, `golf_event_attendance`) | only when RSVP is on: `fanOutEventInvitation` from `after()` (calendar-events.ts:507-514, `lib/calendar/fan-out.ts:33`); RSVP off tells nobody, so Told reads "On 7 calendars" from attendance rows | `askV2`; class dots `class_awareness_v1` | absent (CP-D) |
| f_travel | tournament read when `golf_tournaments_v1` | new `create_trip` to `createGolfTravelItinerary` (`ACT/travel.ts:295`, impl 171) | coach: "Coaches can manage travel" (baseline, FOR ALL) | TASK_FIELDS §5 travel | "Added the trip" | f_travel.failed | `revalidatePath('/golf/dashboard/travel')` (travel.ts impl about :262); Hub refetch on focus | none (travel creates no notification), so the Told row has no "Seen by" | `askV2` | absent |
| f_qual | course tees, roster | new `create_qualifier` to `createGolfQualifier` (`ACT/qualifier-actions.ts:349`, impl 113) | coach: `golf_qualifiers_insert_coach` (baseline) | `selection_slots_total` at most 12 (DB check, qualifier-actions.ts:160); tees only from the course's saved tees | "Qualifier set" | f_qual.failed | `clubhouse/screens/qualifiers/live.ts`, `hooks/golf/use-qualifier-realtime.ts` | inside the call: `notifyQualifierCreated` email and push `qualifier_created` (qualifier-actions.ts:286-330), which is why it is held | `askV2` | absent |
| f_goal | roster, eight stats | new `create_goal` to `createGoal` (`ACT/v3/goals.ts:312`, impl 88), `coach_assignment_mode` | coach: `goals_coach_create` (`20260528010000`) | eight stats only | "Goal set" | f_goal.failed | `revalidatePath('/golf/dashboard/coachhelm')` (goals.ts:295) | `notifyCoachAssignedGoal` (goals.ts:291) | `askV2` | absent |
| f_note | the round's existing `golf_round_reviews.coach_notes` | new `add_round_note` to `saveRoundCoachNote` (`ACT/round-coach-note.ts:101`), which replaces the text (update at :66), so the planner appends and Undo inside 8s writes nothing | coach: `round_reviews_write_coach` (UPDATE), `round_reviews_insert_coach` (`20260602191000`) | 2000 characters (`NOTE_MAX`, :13); re-read at release, changed since the draft is f_note.failed with the redraw | "Shared with Theo" | f_note.failed | `revalidatePath('/golf/dashboard/rounds/[id]')` (:87) | `notifyCoachCommented` (:86) | `askV2` | absent |
| f_lineup set | entries and version from the tournament read | new `set_lineup` to `setTournamentEntries(id, entries, version)` (`ACT/tournaments.ts:357`, impl 188); never the raw RPC | coach: `asCoach` in tournaments.ts and the RPC `golf_tournament_set_entries` (`20261024100200_golf_tournaments_rpcs.sql`) | zod: at most 20 entries, slot 1 to 9 (tournaments.ts:183-185); version clash refuses | "Lineup set" | f_lineup.failed: re-read the version and redraw, never a blind retry | `revalidatePath(ROUTE, 'layout')` in tournaments.ts | none | `askV2` and `golf_tournaments_v1` (yml 926) | absent |
| f_lineup lock | lineup | second confirm, no Undo and no hold (it can't be undone): `lockTournamentLineup(id)` (tournaments.ts:361, impl 195) | coach, same | n/a | "Lineup locked" | f_lineup.lock-failed | as above | none | same | absent |
| f_board | the player and the board picture | no server write: `draft_board` returns a prefill href; `ChPrefill` gains `conversationId`, `attachment {kind: 'board', pngKey}`, `returnTo` (`clubhouse/screens/messages/prefill.ts:20-61`) | coach; nothing written | draft 2000 (prefill.ts:52) | "Nothing is sent until you tap Send"; Open writes a fresh `ch.messages.prefill.<key>` per tap | f_board.failed (picture or storage) | n/a | none (the coach's own Send in Messages notifies as any message) | `askV2` | not on the hold: works without HM1 |
| f_poll | the team chat id | no server write: `draft_poll` returns a prefill href with `poll {question, options[], closes?}`; the coach's Post in Messages calls `sendGolfPoll` (`ACT/message-polls.ts:175`) | coach; Ask never calls `sendGolfPoll`, `sendGolfMessage` or inserts `golf_messages` (test 02 §14) | Messages' poll limits | as f_board | f_poll.failed | Messages realtime `hooks/golf/use-golf-messages.ts` once posted | none from Ask | `askV2` | absent until held `20261028140800_golf_messages_deleted_poll_payload_check.sql` runs (poll delete breaks without it) |
| f_drill | bank read `golf_team_drills` (N-00 held `20261026010100`), then `golf_drills` (`drills_read_all_authenticated`, baseline :18633) | new `create_drill` to N-00's `createTeamDrill` or `copyLibraryDrill` (`ACT/practice-library.ts`, N-00 slice 2, new) | coach: `golf_team_drills_insert` (N-00 010100) | name 1 to 80, unique per team on `lower(btrim(name))` (`golf_team_drills_team_name_uniq`), minutes 1 to 180, area and kind CHECKs (N-00 §8.3) | "Added to drill bank"; Told "Nobody is told" | 23505: f_drill.failed "You already have a drill called {name}. Rename this one." | Practice tab refetch | none | `askV2`; tool registered only when `to_regclass('public.golf_team_drills')` is not null | absent; gallery "Drill bank comes with the Practice tab" |
| q_block | calendar | `addCoachBlockedTime` (`ACT/calendar-blocked-time.ts:154`) | coach: "Coaches can manage their own blocked time" (baseline) | the action's | receipt, private told | kit failed | Calendar refetch | none | `askV2` | absent |
| q_break, q_term | terms | `addTeamBreak` (`ACT/class-status.ts:205`, insert `golf_class_exceptions` kind off at :114, at most 21 days), `saveTeamTerm` (:200) | coach: `golf_class_exceptions_insert_coach`, `golf_team_terms_insert_coach` (`20261025070000`) | break 21 days; term overlap refused | receipt | kit failed; overlap line | `clubhouse/lib/use-class-day.ts` realtime on `golf_class_exceptions` | none | `askV2` and `class_awareness_v1` (yml 955; shell reads it at `clubhouse/data/shell.ts:266`) | absent |
| q_avail | roster | `setPlayerAvailabilityCoachNote` (`ACT/team-management.ts:594`, upsert `golf_player_availability_coach_notes`) | coach: `golf_player_availability_coach_notes_insert/update` (`20261022090000`) | the action's | "Only coaches see it." | kit failed | roster tag `updateTag(CACHE_TAGS.ROSTER)` in the action | none | `askV2` | absent |
| q_recruit | none | `createRecruit` (`ACT/recruiting.ts:340`) | coach: `golf_recruits_insert_coach` (baseline) | the action's | receipt | kit failed | Recruiting refetch | none | `askV2` | absent |

### W6. Practice plan inside Ask (S-ASK.flow.plan.*, S-ASK.brief.*, S-ASK.artifact.*, S-ASK.save*, S-ASK.publish*)

Lane 6 (practice-plan) owns the server actions; this lane calls them and adds no second save path (05 CP-F). Event first (02 "AK9 event first").

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Brief card | `get_calendar` free window, focus areas, slipped metrics; `ask_practice_brief` (no write) | none | coach | three groups, never asks what a read answered | folds to the coach's bubble | n/a | n/a | none | `coachhelm_practice_plans_v1` (new, lane 6) | n/a |
| Plan card, artifact pane and push | `draft_practice_plan` (lane 6, replaces `create_practice_plan`), body `PracticePlanSheet` | none | coach | lane 6 | card writes itself | read failed: plain answer | n/a | none | as above | n/a |
| No practice that day: event confirm first | `golf_events` that day, type practice, not all-day or cancelled | f_event's `create_event` on W4's hold; Save turns on once it commits; Save before the window ends calls `POST …/actions/[key]?now=1` | coach: `golf_events_insert_coach` | CH-17110, CH-17117 (all-day, cancelled) | event receipt, then the plan card | Undo on the event: the plan draft goes too, "No practice, so no plan was made." | Calendar realtime | as f_event (RSVP rule) | `askV2` | HM1 not run: no event confirm, so a plan for a day with no practice can't be saved; the card reads "Add a practice to the calendar first" with an f_event follow-up |
| Save draft | `listPlanFolders(teamId)` (lane 6, `golf_documents` by `folder`) | `savePracticePlanDraft({conversationId, planId, version, draft, folder})` in `ACT/coachhelm-practice-plans.ts` (lane 6, new): N-00 `golf_practice_plan_save` (010500) then `golf_practice_plan_file_draft` (lane 6 held `20261104090000`); writes at once, not on the HM1 hold | coach: the definer functions' own coach check; `golf_documents_insert_coach` / `_update_coach` (baseline) | folder 1 to 60 trimmed; plan needs `event_id` | "Plan saved · Practice plans"; Told "Only coaches can see it. Players are told when you publish." | Undo (8s ring, server allows 10s): `undoPracticePlanDraft({planId, documentId, savedAt})` deletes both rows or restores the previous version | Documents refetch on focus | none (a draft reaches nobody) | `coachhelm_practice_plans_v1` and `golf_practice_plans` | N-00 010000, 010400, 010500 or lane 6 `20261104090000` missing: inert "Comes with the Practice tab", no network call |
| Publish | the saved plan, audience | `publish_practice_plan` in `CONFIRM_REQUIRED_TOOLS` (lane 6 §7.2) to N-00 `publishPracticePlan({notify: 'defer'})` (`ACT/practice-publish.ts`, 010600); files at once; `releaseNotify` after 8s (lane 6 `lib/coachhelm/v3/practice-plan/deferred-notify.ts`) | coach | "Publish to 11 people" | receipt, Told after the window | Undo: the AK4 `DELETE` route calls lane 6 `undoPublish` for `publish_practice_plan` runs (take down with `notify: false, revertToDraft: true`): "Taken back. Nobody was told." | plan page and Documents refetch | after the window: push `practice_plan` under `push_events`, bell `event_reminder` with `data.kind = 'practice_plan'`, deep link `/golf/dashboard/practice/plan/<id>`, team chat text | both flags | inert as Save; N-00 010600 |

### W7. Player Ask and the allowance (S-ASK.player*, CP-E, S-ASK.player.requested, S-ASK.player.request.failed)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| Player route | `routes/coachhelm.tsx` player branch (224-233) gains `view === 'ask' && isPlayerAskEnabled()`; new `loadAskPlayer({playerId})` in `clubhouse/data/coachhelm-chat.ts` | none | player session; new `resolvePlayerChatContext` in `context.ts` (roster reduced to the player) | n/a | player home | load failed: "Couldn't load your Ask" | n/a | none | `coachhelm_player_ask_v1` on top of `coachhelm_ask_v2` | HM4 not run: player `?view=ask` falls through to the Board |
| Player answer, steps, chips, cards | new `buildPlayerTools` in `lib/coachhelm/v3/chat/player-tools.ts` (AK10a): own `get_player_metrics`, `get_player_trend`, `get_recent_rounds`, `get_focus_areas`, `get_upcoming_events`, `get_shot_pattern`, `get_round_detail`, `compare_seasons`, insights through `projectInsightsForPlayer` (`lib/coachhelm/delivery/player-projection.ts:43`), `show_visual`; each overwrites `player_id` with the session's | none (no write tool; tool keys never match `^(create|set|add|draft|save|publish|request)_`) | player; privacy filter lives in `player-tools.ts`, on the server: RLS alone is not enough because "Players can view teammates stats cache" (baseline) lets a player session read teammates' `golf_player_stats_cache` | team average only as one aggregate with no names, and only when at least 5 teammates other than the player have a value (`PERCENTILE_MIN_TEAM_N`, `lib/coachhelm/v2/stats/percentiles.ts:35`); else "—". No rank, percentile, `compare_players`, `get_team_metric_ranking`, `get_team_overview`, `get_team_rounds` | answer | read failed: amber step | turns persist only with HM3 | none | both player flags | HM3 not run: no saved history, history button absent |
| The response itself | the envelope a player tool returns is written to the client as `data-evidence` (AT 248-255) and stored in `ui_parts` | n/a | the envelope is the response: a teammate's row or id must never be in it, not only absent from the prose | DOM and network test (02 §13 Done when) | n/a | n/a | n/a | n/a | n/a | n/a |
| Allowance meter, Out card | `ask_usage_weekly` (HM4) read with the admin client by the route after the session check; bucket from new `bucketFor(used, cap)` in `lib/coachhelm/v3/chat/player-allowance.ts` | `recordPlayerSpend` in `onFinish` (ROUTE 961) with `estimateCachedCostUsd` (ROUTE 48, as `recordTurnCost` at 1211); `golf_coachhelm_llm_calls` row with `player_id` set, `coach_id` null (both nullable today) | service role only: HM4 restrictive deny per command for anon and authenticated | week starts Monday 00:00 team zone; cap `PLAYER_ASK_WEEKLY_CAP_USD` 5 in server config, or `cap_micros` | meter word only (plenty, low under 20%, out) | read fails: meter hidden, the server still enforces | next load | none | both player flags | HM4 not run: player Ask off |
| Request more | `ask_credit_requests` this week (HM4) | new `request_ask_credits` server action: insert with `release_at = now() + 8s` (service role after the session check); Undo deletes the row while `release_at > now()`; release from `after()` and the next player request sets `released_at`, then one email through the ops transport (`lib/admin/digest/transport.ts`, `sendOpsAlert` :72) to `ASK_CREDITS_TO` only while `isCustomerEmailEnabled()`, then `sent_at` | service role only | once per player per week (`ask_credit_requests_one_per_week`) | told "Sent to Helm Sports Labs"; switch off: "Request logged. Helm Sports Labs will see it." | S-ASK.player.request.failed; 23505: S-ASK.player.requested | next load | email to the company address only; the coach is not told | both player flags | HM4 not run: player Ask off |

### W8. Hand-offs and links (05 CP-I, CP-K)

| element or action | reads (source, file:line) | writes or calls | who and RLS | validation | success | failure and rollback | sync | notification | flag | until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| `askAboutHref`, `askAboutReadHref` (for Read, Team, Lenses) | seed | new `clubhouse/screens/coachhelm/chat/ask-links.ts` (AK2); the route reads `seed=read:<id>`, `station:<id>`, `player:<rosterId>` | coach; player only for their own read (projection) | a seed the viewer can't see is dropped silently | composer filled, nothing sent | n/a | n/a | none | returns null with `coachhelm_ask_v2` off | n/a |
| Open targets | the receipt's object id | event `eventHref` (`clubhouse/screens/home/event-links.ts:7`, `/golf/dashboard/calendar?date=&event=`); announcement `/golf/dashboard/messages` Announcements fold; thread `/golf/dashboard/messages?conversation=<id>`; qualifier `/golf/dashboard/qualifiers/<id>`; round `roundHref` (`screens/home/player-links.ts:13`); plan `/golf/dashboard/practice/plan/<id>?from=ask`; board and poll a fresh prefill href | as the destination | n/a | destination | object gone: destination's not-found, the receipt drops Open | browser back | none | destination's own | n/a |
| Prefill origin | `ChPrefill.returnTo: 'ask'` | Messages honours it once (lead note, 02 end) | coach | sessionStorage only | Messages back returns to Ask once | n/a | n/a | none | `askV2` | n/a |
| Quick chat "Open full chat" | conversation id | `conversationHref(id)` (`History.tsx:34`) | coach | n/a | same chat with a held receipt's remaining ring | n/a | n/a | none | quick chat flag | n/a |

# Lane audit: Coach vs player (CoachHelm lenses, player file, Your week, Deep dive, Standing)

Repo `helmv3` at main `062f8a2`, read-only.

**Scope:** the live components listed in these previews:
- `src/clubhouse/preview/PreviewCoachHelmCoachPlayer.tsx`
- `PreviewCoachHelmViews.tsx`
- `PreviewCoachHelmPlayerFile.tsx`

They use flag `coachhelm_player_file_v1`, and the code lives in `src/clubhouse/screens/coachhelm/file/*`. The CSS files are:
- `styles/coachhelm-file.css`
- `styles/coachhelm-views.css`
- `styles/coachhelm-dive.css`
- `styles/coachhelm-standing.css`

The spec is `design-refresh/coachhelm-lenses/`. Contrast ratios were computed from the hex values in use, for both light and dark.

---

### CVP-1 The file's loading skeleton has no page edge, no top bar and no lens control, so the layout jumps on load
- Severity: P0
- Where: Player file (coach and player lens), loading state, on phone and desktop, in light and dark
- File: `src/clubhouse/screens/coachhelm/file/FileSkeleton.tsx` (renders `<main className="ch-hf is-loading">`); it is used as the Suspense fallback at `src/clubhouse/routes/coachhelm.tsx:120`
- What's wrong:
  - The skeleton has no `is-phone`/`is-desk` class and no `PhoneTop`.
  - On phone, `.ch-hf.is-phone{padding:0 16px 48px}` (coachhelm-file.css:59) never applies, so the shimmer cards run to the screen edges with 0px inset.
  - On desktop, there is no `.dfile` padding and no rail.
  - When the file loads, the bar, the lens Segmented and the 16/20px insets all appear at once.
  - The comment in the file says the lens control is drawn, but it is not.
  - It also shimmers twice: `.ch-skel` and `.ch-hf .sk i::before` are both applied.
- Should be: ACCEPTANCE loading state (the skeleton keeps the final frame); H5.
- Fix:
  - Render the skeleton inside the same shell as `PlayerFile`: the same `is-phone`/`is-desk` class from `useIsPhone()`, `PhoneTop` with the title placeholder, and a disabled `Segmented` for the lens.
  - Keep one shimmer only: the ui `Skeleton`/`.ch-skel`.
- Confidence: high

### CVP-2 The phone page edge is 16px on 414–429px phones, where the token says 20px
- Severity: P1
- Where: Player file, Your week and lenses, on phone at 414/428 wide (Plus/Max sizes), in light and dark
- File: `src/clubhouse/styles/coachhelm-file.css:59-60` (`.ch-hf.is-phone{padding:0 16px 48px}` with `@media (min-width:430px){padding-inline:20px}`); `src/clubhouse/styles/coachhelm-views.css:14-19` (`.ch-hv-chips{margin:0 -16px;padding:4px 16px}`)
- What's wrong:
  - Both edges are hard-coded at 16px, with a 430px breakpoint.
  - `--ch-page-x-phone` switches to 20px at ≥414 (tokens.css:1446).
  - So on 414–429 phones this screen's content is 4px narrower in from the edge than every other tab, and the chip strip bleeds 16px into a 20px gutter.
- Should be: H5.
- Fix: Use `padding:0 var(--ch-page-x-phone) calc(48px + env(safe-area-inset-bottom))`, and `.ch-hv-chips{margin-inline:calc(-1*var(--ch-page-x-phone));padding-inline:var(--ch-page-x-phone)}`.
- Confidence: high

### CVP-3 The "Goal" label on the goal sparkline collides with the latest point and can clip above the chart
- Severity: P1
- Where: Player file, Goal block (coach and player lens), on phone and desktop, in light and dark
- File: `src/clubhouse/screens/coachhelm/file/cards.tsx:273-314` (`GoalBlock`, `<text x={W} y={y(goal.target)-4} textAnchor="end" className="gt">` at :295-296); `src/clubhouse/styles/coachhelm-file.css:83` (`.gt` uses `font:var(--ch-type-12)`)
- What's wrong:
  - The label is end-anchored at x=W. The latest data point is drawn at x=W-6, so whenever the player is near the target, the label sits on top of the newest dot.
  - When the target is the top of the range, `y(target)` is about 11.8, so the baseline is about 7.8. At 12px or larger, the cap height pushes the text above y=0 and it is clipped.
  - The text uses a type token, so at XXL it grows into the line.
  - The viewBox is 320×72 with the default `meet`, so on the desktop rail there are empty bars on each side.
- Should be: The brief's patterns (fixed-coordinate labels, type tokens in SVG); H11.
- Fix:
  - Put the goal label on the left (`x=0`, `textAnchor="start"`), or outside the SVG as HTML, and clamp its y to ≥ 12.
  - Pin the font at 11px in the SVG.
  - Use `preserveAspectRatio="none"` on the line layer with a non-scaling stroke.
- Confidence: high

### CVP-4 The correction and "why" buttons use undefined tokens, so their background and transition are dropped
- Severity: P1
- Where: Player file, coach corrections (`.corr`) and "Why this" (`.cx__why`), on phone and desktop, in light and dark
- File: `src/clubhouse/styles/coachhelm-file.css:245` (`.corr button, .cx__why button{background:var(--ch-hf-card); transition: … var(--ch-hf-ease)}`)
- What's wrong:
  - `--ch-hf-card` and `--ch-hf-ease` are not defined anywhere. The file defines `--ch-hf-a-card`, and the app uses `--ch-ease-*`.
  - Because of that, the background resolves to transparent, so the buttons show the tint behind them instead of a card chip.
  - The whole `transition` declaration is also invalid, so pressing them has no feedback.
- Should be: Tokens only (DESIGN_LANGUAGE.md); H2 (motion uses tokens).
- Fix: Use `background:var(--ch-card-bg); transition:background var(--ch-dur-1) var(--ch-ease-standard)`. Better still, render ui `Button variant="tertiary" size="sm"`.
- Confidence: high

### CVP-5 The lens Segmented and the Your week tabs are fixed at 300px with nowrap labels, so long first names overflow
- Severity: P1
- Where: Player file lens control ("As {first} sees it") and Your week header tabs, on phone and desktop, in light and dark
- File: `src/clubhouse/styles/coachhelm-file.css:304` (`.dhead .aseg{width:300px}`); `src/clubhouse/styles/controls.css:26` (`.ch-seg__b{white-space:nowrap}`, no ellipsis); `src/clubhouse/styles/coachhelm-views.css:4-10` (header `flex-wrap`)
- What's wrong:
  - Each segment gets about 143px of text room at 13px.
  - "As Christopher sees it" is about 157px, so it runs past its segment and under the next one.
  - On desktop Your week, the 300px Segmented and the "Development" button don't fit together on one line, so the header wraps onto two misaligned rows.
  - This is the owner's "Short game" tab-wrap pattern.
- Should be: The brief's patterns (labels that wrap or overflow in fixed-width tabs); H11.
- Fix:
  - Drop the fixed width and use `width:auto; max-width:100%`.
  - Add `overflow:hidden;text-overflow:ellipsis;min-width:0` to `.ch-seg__b`, in the shared control, which fixes every caller.
  - Shorten the label to "{first}'s view" when it is longer than about 12 characters.
- Confidence: medium

### CVP-6 The sticky "Previewing X's screen" pill uses a magic 158px offset
- Severity: P1
- Where: Player file, coach previewing the player lens, on phone, in light and dark
- File: `src/clubhouse/styles/coachhelm-file.css:224` (`.pv{position:sticky;top:158px;margin:-12px 0 -8px}`)
- What's wrong:
  - 158px is a hard-coded guess at the bar height plus the sticky lens control.
  - It ignores `env(safe-area-inset-top)`, which is 47–59px on notch phones, and it ignores Text Size, which grows the Segmented.
  - On real devices the pill either sits over the lens control or floats with a gap, and the negative margins pull it into the cards next to it.
- Should be: The shell's sticky contract (`--ch-phone-topbar-h` plus the safe area), same as `coachhelm-file.css:62`.
- Fix:
  - Make it part of the sticky lens container, as a second row in the same sticky element.
  - Or use `top:calc(var(--ch-phone-topbar-h) + env(safe-area-inset-top) + var(--ch-hf-seg-h))`, with `--ch-hf-seg-h` measured.
  - Remove the negative margins.
- Confidence: medium

### CVP-7 The plan stepper's undone ring is 1.24:1, and the dark check is 2.92:1
- Severity: P1
- Where: Player file, focus or plan stepper (`.hs__s`), on phone and desktop, in light and dark
- File: `src/clubhouse/styles/coachhelm-file.css:172-176` (`.hs__s i` with an inset 2px `--ch-hf-c-track` ring; `.hs__s i svg{stroke:#fff}` on `--ch-hf-c-gain`)
- What's wrong:
  - The ring of an unfinished step against the card is 1.24:1 in light and 1.29:1 in dark, so you can't see the steps that are left.
  - In dark, the white tick on #4fa877 is 2.92:1.
- Should be: H8 (UI marks 3:1).
- Fix:
  - Draw the ring with `--ch-ink-4`/`--ch-hairline-strong`, which is ≥3:1 on the card.
  - In dark, use `--ch-forest-900`/`--ch-ink-on-gain` for the tick, or darken the fill to `--ch-chart-gain`.
- Confidence: high

### CVP-8 The file runs on a private hex palette that duplicates the app tokens
- Severity: P1
- Where: All of the player file, in light and dark, including Increase Contrast
- File: `src/clubhouse/styles/coachhelm-file.css:3-30` (`--ch-hf-a-card:#fffefb`, inks, gain/loss, track and so on, with their own dark block)
- What's wrong:
  - The design-page palette was copied over as is.
  - The values happen to match today (`--ch-card-bg` #fffefb / #191e1a), but they skip the Increase Contrast overrides and the theme system.
  - That is why the typos in CVP-4 go unnoticed: nothing checks these names.
- Should be: 06-SCREEN-SPECS (cards use `--ch-card-bg`); DESIGN_LANGUAGE.md (tokens only); brief pattern "design-page CSS ported verbatim".
- Fix:
  - Map each `--ch-hf-*` to the app token: `--ch-hf-a-card: var(--ch-card-bg)`, ink to `--ch-ink-1..4`, gain/loss to `--ch-chart-gain/-loss`, track to `--ch-fill-2`.
  - Then delete the private dark block.
- Confidence: high

### CVP-9 The "you" dot in the field strip is drawn 2px off its value, and dots are unclamped
- Severity: P1
- Where: Player file, "Where you sit" field card (`.dots`), on phone and desktop, in light and dark
- File: `src/clubhouse/styles/coachhelm-file.css:210-211` (`.dots i{margin-left:-6px}` for a 14px dot; `.dots i.me{margin-left:-8px}` for a 20px dot); `src/clubhouse/screens/coachhelm/file/cards.tsx:316-348` (`FieldCard`, `at(v)` unclamped)
- What's wrong:
  - Each dot should be centred with a margin of minus half its width: −7 for the 14px dot and −10 for the 20px dot, as in the design.
  - The current values put the player's dot 2px right of its true position, and team dots 1px right.
  - `at(v)` has no clamp, so a value outside the scale draws the dot past the track and over the card padding.
- Should be: The coachhelm-lenses redesign (`redesign.css` dots −7/−10); the brief's "data-driven positions without clamp".
- Fix: Use `transform:translateX(-50%)` instead of margins, and set `left: clamp(0%, at(v), 100%)`. Add an edge caret when the value was clamped.
- Confidence: high

### CVP-10 Strokes-gained bars are capped at ±1.0 with no overflow mark
- Severity: P2
- Where: Player file, SG card (`.sg__row`), on phone and desktop
- File: `src/clubhouse/screens/coachhelm/file/cards.tsx:350-400` (`SgCard`, `Math.min(1,|strokes|)*50`)
- What's wrong:
  - −3.9 putting draws the same bar as −1.0, so the worst area looks no worse than a mild one.
  - The cap is the right idea, the opposite of TeamHole's uncapped size, but nothing shows that it was hit.
- Should be: The brief (clamp and say so); H13.
- Fix: Keep the clamp, add a ▸ cap mark or a 2px notch at the end when `|v|>1`, and always print the value. It is already printed, so the mark is the only missing piece.
- Confidence: medium

### CVP-11 The SG row's fixed 108px label column wraps "Around the green"
- Severity: P2
- Where: Player file, SG card, on phone, and on all sizes at large Text Size
- File: `src/clubhouse/styles/coachhelm-file.css:189, 198` (`.sg__row`, `.sg__axis{grid-template-columns:108px minmax(0,1fr) 46px}`)
- What's wrong:
  - "Around the green" at 15px medium is about 120px wide, so in a 108px column it wraps to two lines and that row is taller than the others.
  - At XXL every label wraps.
  - This is the same label the owner saw run off the TeamHole card.
- Should be: The brief's patterns (fixed-width label columns).
- Fix: Use `grid-template-columns:minmax(max-content, 40%) minmax(0,1fr) auto`, or say "Short game" / "Around green" on phone.
- Confidence: high

### CVP-12 The card body is inset 20px while the card title is inset 16px, and the coach line and track rows bleed back to 16px
- Severity: P2
- Where: All player file cards, on phone and desktop
- File: `src/clubhouse/styles/coachhelm-file.css:115` (`.card__h` padding 16), `:119` (`.card__b{padding:4px 20px 16px}`), `:78` (`.ch-hf-coachline{margin:0 -20px}`), `:91` (`.ch-hf-trackrows{margin:0 -20px -16px}`)
- What's wrong:
  - Inside one card the title starts at 16px, the body text at 20px, and the full-bleed rows' content at 16px again.
  - So three left edges are 4px apart. The 20px comes from the design page (redesign.css:224), but the live card header is 16px.
- Should be: Brief §Edges (card inner padding consistent); `Surface` inner padding token.
- Fix: Use one inset, `--ch-card-pad-x`, for header, body and rows. Use `Surface`/`Section` padding instead of local negative margins.
- Confidence: high

### CVP-13 The IntentSheet "picks" are hand-drawn chip buttons for single-choice groups
- Severity: P2
- Where: Player file, set-intent sheet (Aim, Alerts, note), on phone and desktop
- File: `src/clubhouse/screens/coachhelm/file/IntentSheet.tsx` (`.picks` with `aria-pressed` buttons); `src/clubhouse/styles/coachhelm-file.css:283-284` (`.picks button`), `:285` (`.note` textarea)
- What's wrong:
  - Aim and Alerts are one-of-n choices built from toggle buttons. Screen readers announce them as independent toggles, and keyboard users get no arrow-key movement.
  - The textarea is styled by hand rather than with the FormSheet field.
  - The chips set their own height (~34px), which is under 44px.
- Should be: Brief §Components (`Segmented`, `FormSheet` fields); H10.
- Fix:
  - Use `<Segmented>` for Aim and Alerts, or a `role="radiogroup"` from the ui form kit.
  - Use the FormSheet `Field`/`TextArea`, and set the tap target to at least 44px.
- Confidence: high

### CVP-14 The retry and more buttons in the player file are hand-drawn
- Severity: P2
- Where: Player file, failed state, partial failure, and the desktop header "more" button
- File: `src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:106-118` (`FileFailed`), `:395-410` (`PartFailed`), `:365-369` (`button.ib` 36×36); `src/clubhouse/styles/coachhelm-file.css:121` (`.ch-hf-partfail button`), `:295` (`.dhead .ib`)
- What's wrong:
  - These are local copies of controls.
  - The 36×36 icon button is under 44px.
  - The partial-failure "Try again" is a bare text link with no focus ring.
- Should be: Brief §Components; H10.
- Fix: Use `<Button variant="secondary">Try again</Button>` inside ui `States`, and ui `IconButton` with `Menu` for "more". The hit area should be at least 44px even where the icon box is 36px.
- Confidence: high

### CVP-15 Three-across stat wells are nested inside cards on phone, and "Focuses assigned" wraps
- Severity: P2
- Where: Player file, feature card comparison (`.feat__cmp`) and the three-tile row (`.tr3`), on phone, in light and dark
- File: `src/clubhouse/styles/coachhelm-file.css:133-137` (`.feat__cmp`), `:219-223` (`.tr3{grid-template-columns:repeat(3,1fr)}`)
- What's wrong:
  - At 390 wide each tile has about 76px of content inside the card's padding, so "Focuses assigned" and figures with units wrap to two or three lines and the tiles end up different heights.
  - The tinted wells inside a card are the card-in-card pattern the owner flagged on Coach Home.
- Should be: The brief's patterns (nested cards; multi-column kept on phone).
- Fix:
  - On phone, show them as one `Section` list of label/value rows, or as a two-column grid with the third tile spanning.
  - Drop the well background and separate the items with hairlines.
- Confidence: medium

### CVP-16 Off segments in the progress meter are 1.67:1 on the feature card
- Severity: P2
- Where: Player file, feature card week progress (`.prog`), in light and dark
- File: `src/clubhouse/styles/coachhelm-file.css:267` (`.prog i{background:rgb(244 241 232/.18)}`)
- What's wrong: The empty segments against the green feature surface are 1.67:1 in light and 1.65:1 in dark, so the number left to do can't be read.
- Should be: H8 (UI marks 3:1).
- Fix: Use `rgb(244 241 232/.38)` (about 3.1:1), or the feature-surface track token, and show the "2 of 5" figure as text beside it.
- Confidence: high

### CVP-17 The fold animates height and margin-top
- Severity: P2
- Where: Player file, expand/collapse sections, on phone and desktop
- File: `src/clubhouse/screens/coachhelm/file/PlayerFile.tsx:47-88` (`Fold`, WAAPI keyframes on `height` and `marginTop`)
- What's wrong:
  - It animates layout properties, which triggers a reflow on every frame and stutters on long files.
  - Spec M-LNS-04 asks for a height fold, so this follows the spec, but it breaks H2.
  - The reduced-motion branch should be confirmed to skip the animation, not just shorten it.
- Should be: H2; 07-MOTION M-LNS-04 (reconcile with the rubric).
- Fix: Use `grid-template-rows:0fr→1fr` with the duration tokens, or clip-path/transform. Skip the animation entirely when `prefers-reduced-motion` is set.
- Confidence: medium

### CVP-18 Feature cards and read rows put buttons inside role="button"; badge widths throw the titles out of line
- Severity: P2
- Where: Player file, feature card and "read" rows, on phone and desktop
- File: `src/clubhouse/screens/coachhelm/file/cards.tsx:47-133` (`FeatureCard`, section `role="button"` contains buttons and links), `:402-421` (`readRow`, hand-drawn chevron SVG, variable-width badge before the title)
- What's wrong:
  - Nested interactive elements: one tap target swallows the inner actions for VoiceOver, and a tap on an inner link also fires the card.
  - The badge goes before the title and is a different width on each row, so the titles start at different x positions.
- Should be: H10; brief §Components (`Badge`, the ui chevron/`ListRow`).
- Fix: Make the card a `Surface` with the primary action on its header only. Use `ListRow` with a trailing `Badge`, and the ui chevron.
- Confidence: medium

### CVP-19 The Your week large title is hand-drawn instead of ui LargeTitle
- Severity: P2
- Where: Your week, on phone and desktop
- File: `src/clubhouse/screens/coachhelm/file/YourWeek.tsx` (`.dhead.is-week h1.lt`)
- What's wrong: It uses its own font and margins, so the title sits at a different size and baseline from every other tab's LargeTitle and doesn't take part in the collapse into the phone bar.
- Should be: Brief §Components.
- Fix: Use `<LargeTitle>` from `src/clubhouse/ui/`.
- Confidence: medium

### CVP-20 The Standing "behind" fill is a hard-coded amber gradient with no dark variant
- Severity: P2
- Where: Standing view, the behind-the-gap bar, in dark
- File: `src/clubhouse/styles/coachhelm-standing.css:829` (`linear-gradient(90deg,#d9a441,#b8862b)`)
- What's wrong: The fixed light-theme amber glares on the dark card, and it is not the warning token the rest of the app uses for "behind".
- Should be: Brief §Dark mode; H15 (status colours by token).
- Fix: Use `background:var(--ch-warn)` or `var(--ch-chart-warn)`, which have dark values. Drop the gradient.
- Confidence: medium

---

## Summary
1. The file's Suspense skeleton has none of the page frame (no edge padding, top bar or lens control), so the cards touch the screen edge and the page jumps on load (CVP-1).
2. The page edge is hard-coded to 16px with a 430px breakpoint, so 414 and 428 phones get the wrong gutter on this tab (CVP-2).
3. The goal sparkline's "Goal" label is pinned at the right end, on the latest point, and clips at the top. The field dots are off-centre and unclamped (CVP-3, CVP-9).
4. The lens control and the Your week tabs are fixed at 300px with nowrap labels, so long first names overflow. The sticky preview pill uses a magic 158px offset (CVP-5, CVP-6).
5. The design-page CSS was ported verbatim: a private hex palette, undefined `--ch-hf-card`/`--ch-hf-ease`, a 16 vs 20 inner inset, stepper and progress marks under 3:1, and hand-drawn chips and buttons instead of `src/clubhouse/ui/` (CVP-4, CVP-7, CVP-8, CVP-12 to CVP-16).

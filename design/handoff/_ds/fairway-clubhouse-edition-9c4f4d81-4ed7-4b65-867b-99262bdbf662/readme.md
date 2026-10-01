# Fairway — Clubhouse Edition (v2)

A redesign of **GolfHelm's Fairway design system**: modern ivory and Augusta green. The ivory neutrals carry the layout, and green is reserved for action, selection and good news. The one sans typeface is Instrument Sans. Scorecard conventions are built into the components. The aim is a premium product UI in the spirit of Linear, Stripe and Vercel, with a golf identity.

**v3 (latest owner review):** the shell is Augusta green again (sidebar and frame) with an ivory canvas. Surfaces are warm paper rather than white. Toggles are recessed wells, and selected pills look pressed. Identity uses monogram coins on calm neutral fills and adds leaderboard nameplates. Cards were rebuilt around their content, with strokes-gained proof, full-bleed trends, an Out/In scorecard and an event card. Trend lines are smooth, colored by outcome and drawn against a dashed mean. The scorecard is back to classic outlined notation. Buttons are satin rather than glossy, and glass blur is heavier (34px).

**v2 changes after owner review:** no serif, no brass wordmark, no tracked-caps eyebrows, and neutral ink form controls (green is out of forms). Cards are white, tables and data were rebuilt, and the dark clubhouse sidebar became a light, Linear-style shell with an inset canvas. Icons are unchanged.

## Sources
- **GolfHelm codebase, read via GitHub**: `njrini99-code/helmv3@main` (2026-09-29). The attached local `helmv3` folder was not readable. Used: `docs/v3-design-language.md` (doctrine, surfaces, motion), `src/components/fairway/charts/*` and `modules/*` (chart inventory and honesty rules), `.claude/skills/golfhelm-creative-engine/references/product-features.md` (features, sample data). Notes: `research/codebase-notes.md`. Logos and imagery copied from `public/`.
- **Web research**: `research/web-notes.md` (Masters scoreboard color convention, WHOOP one-question-per-view trends, direct labeling).
- **Previous Fairway system**: project `9b2877ba-ed1d-4050-9e67-a81be18729f3` (`GolfHelmFairway`, golfhelm-fairway@1.0.0, 119 components). Component names and main props are kept where they overlap.
- **Helm Design Studio handbook and plugin**: `uploads/Helm_Design_Studio_Claude_Handbook*.md` and `uploads/helm-design-studio/` (see `references/fairway.md` and `visual-craft.md`).
- **Codebase** (referenced, not attached): `njrini99-code/helmv3`, branch `agent/golf-green-vintage-theme`. Carried-over invariants: scope golf styling to `data-helm-sport="golf"`, keep light and dark pairs, final data on mount, and no nested interactive children.
- **Research**: Untitled UI's table guidance, which favours minimal tables with no excess elements (untitledui.com/blog/create-tables-in-figma).
- **No logo or photography was provided.** The wordmark is plain type and image areas are placeholders.

## Index
- `styles.css`: `@import`s only
- `tokens/`: fonts, colors (light + `[data-theme="dark"]`), typography, spacing, elevation (radius, shadow, glass, motion, z), base (the `.fairway` scope)
- `components/components.css`: all `fw-*` component styles
- `components/<group>/`: `<Name>.jsx`, `.d.ts`, `.prompt.md`, plus one `*.card.html` per group
- `guidelines/`: foundation cards (Colors, Type, Spacing, Brand)
- `ui_kits/golfhelm/`: the coach web app (Brief, Roster, Player, Round recap, New-session modal)
- `SKILL.md`, `thumbnail.html`

## Components
Loaded as `window.FairwayClubhouseEdition_9c4f4d.*` from `_ds_bundle.js`. Add `class="fairway"` to the root element.

- **icons**: Icon
- **buttons**: Button (primary, secondary, ghost, ink, danger), IconButton
- **selection**: Segmented, Tabs, FilterPill
- **identity**: Avatar, PlayerIdentity, Badge, NamePlate
- **forms**: FormField, Input, Select, TextArea, Checkbox, Radio, Switch
- **surfaces**: Surface (default, flat, raised, feature), Inset, GlassSurface
- **data**: Numeric, DeltaChip, Sparkline, StatStrip, ScoreMark, RoundStrip, StrokesGainedTornado
- **data-table**: DataTable
- **cards**: InsightCard, MetricCard
- **cards-feature**: RoundCard, EventCard
- **charts** (yardage book): YardagePage, PredictionCard, ScoreTrend, ScoreBoard, StrokesGainedRoute, DriveDispersion, PuttingGreen, FieldTable, StatPlate
- **feedback**: InlineNotice, EmptyState, Skeleton, ToastStack
- **overlays**: ModalShell, PopoverPanel
- **navigation**: Eyebrow, ViewHeader, FairwaySidebar, FairwayTopBar

**Intentional additions:** `Icon` is a Lucide wrapper with one shared stroke. `ScoreMark` renders a single hole's score inline. `NamePlate` is a classic leaderboard plate. `RoundCard` and `EventCard` are object and feature cards the owner asked for in the card redesign.

**Not yet rebuilt from the previous 119:** GenomeRadar / GenomeFingerprint, LeakMap, RadialGauge / Dial, Ribbon, SegmentBar, BandHistogram, AdoptionHeatGrid, the "view as table" InstrumentTable and keyboard crosshair, calendar and DatePicker, Combobox, NumberField, Slider, CommandMenu and SearchField, Sheet, ConfirmAlert, the instrument family, OnboardingSteps, and the CoachHelm views. The yardage-book charts replace TrendChart, SprayField, MakeCurve and StandingStrip.

## Charts: the yardage book (owner-selected)
Charts are drawn the way a tour caddie's yardage book would draw them: numbers sit where they happen on the course. The prediction lands in a fairway (PredictionCard), rounds post to a hand-operated scoreboard (ScoreBoard), strokes gained walks from tee to hole (StrokesGainedRoute), drives land on a mown fairway (DriveDispersion), and putting reads off rings around the cup (PuttingGreen). You vs team vs tour is a scorecard table (FieldTable), and season stats are leaderboard nameplates (StatPlate).
- **Page anatomy:** YardagePage is warm paper `--chart-paper`, 14px radius, a hairline ring and soft shadow, a sentence-case title with meta on the right over a hairline, and one green italic **note** underneath. Course metaphors carry the meaning; the chrome stays modern and quiet (owner: don't over-lean on Masters styling).
- **Color law:** red `--chart-flag` means under par (and the pin flag) and nothing else. Gains are green `--chart-gain`. Losses, misses and below-benchmark readings are **amber** `--chart-loss`. Over par on the scoreboard is ink. Deltas, sparklines and the strokes-gained tornado follow the same rule.
- **Honesty (from the codebase):** state the window and sample, keep null distinct from zero, compare markers to a benchmark line rather than bar height to a line, and never animate a count-up.
- **Voice of the note (head pro):** calm, exact, and says why. "Inside six feet he makes 72%. The team makes 84%, so short putts cost him most." "Approach is the only leg losing strokes, about eight-tenths a round." Avoid hype and imperatives without a reason.
- Chart SVG colors are fixed hex values tuned for the light paper; dark mode for charts is not designed yet.
- Direction explorations (A Scorebook, B Instrument, C Yardage Book) are kept in `explorations/` for reference.

## Content fundamentals
- **Voice:** a composed club professional. Specific, calm, never salesy. Use first names in briefs ("Good morning, Maya.") and "you" in instructions.
- **Lead with the decision.** Say who, then what changed, then by how much, then the next step. For example: *"Jonah's approach play from 125–150 yards accounts for most of his 2.1-stroke rise."*
- **Actions are verbs plus an object**: "Log round", "Plan range session", "Sign scorecard". Avoid "Learn more".
- **Sentence case everywhere**, including context lines ("Tuesday, 14 October"). No tracked uppercase.
- **Numbers carry their window and sample** ("Last 7 rounds · 142 shots"). Use a true minus (−), "E" for even, and "—" for no data. Keep null, zero and "early read" distinct.
- No emoji and no exclamation marks.

## Visual foundations
- **Color:** the app frame is ivory-150 `#F2EFE7`, the canvas is ivory-100 `#F7F5EF`, and cards are white. Subtle fills (table heads, evidence bands, modal footers) use ivory-50 `#FBFAF6`. Text is warm ink `#1C1B18`, `#55524B` and `#6B6860`. Green `#155A39` appears on primary buttons, the active nav icon, selected rows, positive deltas and sparklines. Deep green `#0B3A25` is the **feature card**, used once per view. Status colors are text on tint. Under par is red, per golf convention.
- **Type:** Instrument Sans only. Display is 600 weight at width 88 with −0.034em tracking (titles 28–36, hero 44–52). Figures are 500 weight at width 92, −0.04em, tabular. UI text is 13–15. Context lines are 13px tertiary in sentence case.
- **Cards:** warm paper `#FDFCF8`, 16px radius, a 1px 7% ink ring plus a soft 8/20 shadow. Footers are a darker ivory bar (`#F4F2EA`) holding the source and actions. Evidence sits in a recessed well. No colored left borders and no gradients, except the feature card's single soft radial light. Several figures share one ruled `StatStrip`. Evidence sits in an inset band inside the card.
- **Tables:** an ivory-50 header row with 12.5px tertiary labels in sentence case. Rows are 56px (44 dense) with hairline separators. Numbers are right-aligned and tabular. Hover is ivory-50; selected is a 4.5% green tint. No zebra striping and no vertical rules.
- **Forms:** white 38px fields using a ring rather than a border (14% ink, 24% on hover). Focus is a 62% ink ring plus a 4px soft halo. Checkbox, radio and switch use ink when on.
- **Radius:** 5 (score cells, kbd), 7 (badges, segments), 10 (buttons, inputs), 14 (cards), 20 (modals), full (avatars, filter pills).
- **Elevation:** a ring first, then a soft shadow in `sm` (cards), `md` (raised) or `lg` (overlays). Primary and ink buttons get a 1px top highlight and a tinted shadow.
- **Glass:** warm ivory at 70% or 86% with 34px blur and 170% saturation. Use it only for the sticky top bar, menus and overlays on imagery, never for data. It falls back to solid white.
- **Motion:** 90, 150, 220 and 360ms with ease-out `cubic-bezier(.2,.8,.2,1)`. Spring easing on the switch thumb only. Press scales to 0.985. No count-ups or entrance staggers.
- **Hover:** secondary controls get a stronger ring; ghost controls a 5% ink wash; rows ivory-50. **Focus:** a 2px ink outline with a 2px offset.
- **Layout:** a 240px Augusta-green sidebar (`tone="green"`, the default) on a green frame, with the ivory canvas inset 8px at a 14px radius. `tone="ivory"` is the light alternative. A sticky 56px glass top bar, 1200px maximum content width, and 40px gutters.
- **Imagery:** real course and player photography only, with natural low-saturation greens. None has been supplied yet.
- **Dark theme:** warm black grounds (`#121210`, `#1A1A17`) with the same roles.

## Assets
- `assets/logos/`: `helm-logo-main.png` and `helm-logo-white.png` (Helm Sports Labs mark, green), `helm-golf-logo.png` (GolfHelm), `helm-coach-icon.png`. Pass a logo to `FairwaySidebar` via `header`.
- `assets/imagery/`: `golf-course-aerial.webp`, `hero-golf.jpg` (from the product's public folder).

## Iconography
- **Lucide** at a **1.6 stroke**, outline only, 16px in nav and controls and 13–15px inline. Use the `Icon` component, which lazy-loads `lucide@0.460.0` UMD. In plain HTML, use `lucide.createIcons()`.
- No emoji. The only unicode used is typographic: ⌘, −, ·, –.

## Fonts
Instrument Sans (variable weight and width) and JetBrains Mono (kbd only) load from Google Fonts. No binaries are shipped. **This is a proposed replacement**; the owner rejected the previous typeface, and the choice still needs sign-off.

## Publishing
1. **Share it inside Claude Design.** Open Share, then set the file type to **Design System**. Teammates can then attach "Fairway — Clubhouse Edition" to new projects, and the components load from `window.FairwayClubhouseEdition_9c4f4d`.
2. **Use it in Claude Code.** Download the project. `SKILL.md` at the root makes the folder an Agent Skill; drop it into `.claude/skills/fairway-clubhouse-design/` in the helmv3 repo.
3. **Ship it in helmv3.** Treat this system as the spec. Port tokens into `src/styles/design-tokens.css` behind `[data-helm-sport="golf"]`, then port components family by family, starting with the charts (YardagePage → ScoreTrend → PredictionCard). Update `.claude/rules/design-system.md` in the same change: red for under par only, amber for losses, Instrument Sans, and the retired serif and tracked caps.
4. **Before sign-off:** the Instrument Sans license and loading check, chart dark mode, a "view as table" path and keyboard crosshair on every chart, and a check of the charts with real sparse data (under 3 rounds, missing putts).

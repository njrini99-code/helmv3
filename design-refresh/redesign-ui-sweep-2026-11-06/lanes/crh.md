# Lane CRH: Classes, Roster, Home (coach and player)

Auditor sweep, read-only, repo `helmv3` at main `062f8a2`. Scope: `src/clubhouse/screens/{home,classes,roster}`, `styles/{home,classes,roster}.css`, plus the shared `ui/` pieces these screens draw (`WeekStrip`, `Surface`, Ledger rows). Lane flag `clubhouse_classes_roster_home_v1` renders as `data-ch-crh="on"`.

Main cause behind most of the Home bugs: the lane's phone card rules (`home.css` 4513-4840) were laid over the older "Mobile clubhouse pass" rules (`home.css` 2711-3382). That earlier pass put rows on a cardless section edge using `margin-inline: -12px` and `width: calc(100% + 24px)`. The lane put those sections into cards (`overflow: hidden`, no padding) but never reset the negative margins. It also kept the earlier pass's paddings, borders and nested containers. Every finding marked "cascade" below comes from this.

Owner-screenshot items are CRH-1, CRH-3 and CRH-4 (`screenshots/nick-phone-home.png`).

---

### CRH-1 Latest rounds rows have no inner inset (avatar ~4px from the card edge, score chip flush right)
- Severity: P0
- Where: Coach Home phone, Latest rounds, light and dark
- File: `src/clubhouse/styles/home.css:3293-3296` (`.ch-hm-rd { width: calc(100% + 24px); margin-inline: -12px; padding-inline: 12px }`), not reset by the lane rule `home.css:4823-4826` (`.ch-hm[data-ch-crh='on'] .ch-hm-rd { padding: 8px 16px }`). The card clips at `home.css:4617-4623` (`:is(.ch-hm-sec, .ch-hm-form) { overflow: hidden }`). Markup: `screens/home/HomePhone.tsx:528-560`.
- What's wrong: the lane rule restores 16px padding but leaves the −12px margins and the +24px width. The row starts 12px outside the card and the card clips it, so the avatar sits 16 − 12 = 4px from the card edge. The score well's right edge is also 4px from the card edge. The screenshot shows about 3 to 5pt on both sides. The pressed tint is clipped the same way.
- Should be: 04-FIDELITY-SPEC §3: "rows 10 16, min height 52 / 64; hairlines inset 16 (60 after a coin)"; §4 Home: "Latest rounds rows 64 with `.score` well 54×48".
- Fix: in the lane block, add `.ch-hm[data-ch-crh='on'] .ch-hm-rd { width: 100%; margin-inline: 0; padding: 10px 16px; border-radius: 0; }`. Make the separators inset: `.ch-hm[data-ch-crh='on'] .ch-hm-list li + li { box-shadow: none; position: relative }` plus a `::before` hairline at `inset: 0 0 auto 60px` (`--ch-separator`, `--ch-hairline-w`), the way `.ch-dh-rows li + li::before` (`home.css:5121-5127`) already does on desktop.
- Confidence: high (owner screenshot plus cascade arithmetic)

### CRH-2 Today card rows on coach Home have the same 4px inset
- Severity: P0
- Where: Coach Home phone, Today card (any day with events), light and dark
- File: `home.css:3264-3266` (`.ch-hm-tl__a { margin-inline: -12px; padding-inline: 12px }`) against the lane rule `home.css:4650-4656` (`padding: 8px 16px` and no margin reset). The rows are rendered by `HomePhone.tsx:303-329` (`Today card`) inside the card at `home.css:4617`.
- What's wrong: this is the same cascade as CRH-1. The time column and the Clash or Next chip start 4px inside the card's clipped edge. The row hairlines (`.ch-hm-tl__r + .ch-hm-tl__r`, `home.css:3089-3091`) also run edge to edge.
- Should be: 04 §3, rows 10 16. The time column should sit 16 from the card edge.
- Fix: add `.ch-hm[data-ch-crh='on'] .ch-hm-tl__a { margin-inline: 0; border-radius: 0; padding: 10px 16px }` and inset the `.ch-hm-tl__r + .ch-hm-tl__r` rule 16px.
- Confidence: high (same mechanism as CRH-1)

### CRH-3 "The team's game" stays two columns on the phone, and every line wraps every two words
- Severity: P0
- Where: Coach Home phone at 390 (and worse at 375, 340 or larger Text Size), light and dark
- File: `home.css:4740-4746` (`.ch-hm[data-ch-crh='on'] .ch-hm-legs__grid { grid-template-columns: 1fr 1fr }`) and `:4747-4753` (cell `padding: 12px 16px`). Markup: `screens/home/TeamLegs.tsx:220-238` (`PeopleLine`, `:185-199`).
- What's wrong: the card is 390 − 32 = 358px wide, so each cell is 179px with a 147px text column. 15px secondary text gives about 18 characters a line. The line "Tyler H. and 2 others gain most · Ethan P. and 2 others lose most" breaks into 4 to 5 lines (screenshot). "No clear change vs previous 10" (13/600) and "Fairways 61% · Tour 66%" both take 2 lines. The `·` separator lands at the start of a line ("·Ethan P."). The two cells in a row end at different heights, so the hairline grid reads ragged.
- Should be: the brief's pattern, "multi-column layouts kept on phone". `redesign.css:443` draws 2×2 only with the design's short sample names. Real names and the people line don't fit 147px.
- Fix: at ≤820 use one column, `grid-template-columns: minmax(0,1fr)`. Each leg becomes one row: label and SG figure on one line (`justify-content: space-between`), the diverging bar full width under it, the stat and change on one line, then "gains most" and "loses most" each on their own line (split `PeopleLine` into two spans with `display: block`). Drop the `:nth-child(odd)` right hairline (`:4763-4765`) and use a 16px-inset top hairline between rows. If 2×2 has to stay for the figures, keep only label, figure and bar in the grid and move the stat, change and people lines to a full-width list under it.
- Confidence: high (owner screenshot)

### CRH-4 "This week" is a card nested in a card; the strip runs to the outer card's edges and the event line sits 2px from the edge
- Severity: P0
- Where: Coach Home phone (also the coach first run with events, `CoachHome.tsx:201`), light and dark
- File: `home.css:4972-4980` (`.ch-hm[data-ch-crh='on'] .ch-hm-week { background: var(--ch-card-bg); box-shadow: var(--ch-card-shadow); border-radius: var(--ch-radius-lg); padding: 8px 8px 6px }`) inside the section card `home.css:4617-4623`. Note line: `home.css:1501-1505` (`.ch-hm-week__n { padding: 0 2px }`). Section gap: `home.css:3065-3067` (`gap: 6px`). Markup: `HomePhone.tsx:437-465`, `ui/WeekStrip.tsx:93-100`.
- What's wrong: the outer card has no padding, so the inner strip card spans the full 358px. It has its own radius and lifted shadow (`--ch-elevation-lifted` casts about 60px), and the outer `overflow: hidden` cuts that shadow off. The header text sits at 16px while the strip's card edge sits at 0. "Saturday Spring Preview Tournament" sits 2px from the card's left edge and on its bottom edge, because the section has no bottom padding.
- Should be: `redesign.css:464`: `.week{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:10px 10px 6px}`, the card body with no card of its own. The note is the card's footer note (04 §3: "note padding 12 16 14"). The design head also has a "Calendar" link (`clubhouse-phone-redesign.html:962`).
- Fix: in the lane, delete `background`, `box-shadow` and `border-radius` from `.ch-hm-week` and set `padding: 10px 10px 6px`. Give `.ch-hm[data-ch-crh='on'] .ch-hm-week__n` `padding: 12px 16px 14px` with a top `--ch-separator` hairline inset 16. Set `.ch-hm[data-ch-crh='on'] .ch-hm-sec { gap: 0 }`. Better still, render This week through `Surface variant="card" padded={false} footerNote={…}` like The team's game, and add the `Calendar` link in `actions`.
- Confidence: high (owner screenshot)

### CRH-5 Coach first-run Home: "Waiting on you" capsules are ivory text on the ivory page (1.01:1)
- Severity: P0
- Where: Coach Home phone, first run (team with no players or rounds yet but with a join request or a reply waiting), light
- File: `screens/home/CoachHome.tsx:200` renders `<CoachQueue phone />` in `.ch-hm-body`, not in the green hero. The lane rules `home.css:4561-4581` paint `.ch-hm-queue__k` in `--ch-on-green-2` and `.ch-hm-queue__a` in `--ch-on-green-plate` (#f4f1e8) on `rgb(255 255 255/.1)`.
- What's wrong: on `--ch-grouped-bg` #f2f0e9 both the key and the capsules measure 1.01:1, so they are invisible. These are the coach's join requests, the first thing a new coach needs to act on.
- Should be: H8 (text ≥ 4.5:1). The queue is drawn on the hero's green (06 §11.1).
- Fix: move `<CoachQueue … phone />` into the first-run `<header className="ch-hm-hero">` after the brief, as `HomePhone.tsx:86` does. Or scope the capsule rules to `.ch-hm-hero .ch-hm-queue*`, so that in the body the queue falls back to the ink capsules at `home.css:4361-4402`.
- Confidence: high (code certain; contrast computed)

### CRH-6 "Since you last looked" is a card inside a card, and its rows are 4px from the inner card edge
- Severity: P1
- Where: Coach Home phone, a day with events and changes since last visit, light and dark
- File: `home.css:5233-5238` (`[data-ch-crh='on'] :is(.ch-hm-later .ch-hm-tl, .ch-hm-since__l) { padding-inline: 16px; background: var(--ch-card-bg); box-shadow: var(--ch-card-shadow); border-radius }`) applied inside the section card from `home.css:4617` (`DayCard.tsx:400-406`, `section.ch-hm-sec.ch-hm-since > LedgerList.ch-hm-since__l`). The rows are `ui.css:818-821` (`.ch-lgr__row.is-link { margin-inline: -12px; width: calc(100% + 24px) }`).
- What's wrong: this is the nested-card pattern again. The list card spans the outer card edge to edge, its lifted shadow is clipped by the outer `overflow: hidden`, and the Ledger rows' −12px margin puts their content 16 − 12 = 4px inside the inner card.
- Should be: one card per section (06 §11, "every other section on the lane's Home"). Rows inset 16.
- Fix: drop `.ch-hm-since__l` from the `:5233` selector, because its parent is already the card. Add `.ch-hm[data-ch-crh='on'] .ch-hm-since .ch-lgr__row.is-link { margin-inline: 0; width: 100%; padding-inline: 16px; border-radius: 0 }`.
- Confidence: high (code)

### CRH-7 Team scoring card: the sparkline runs edge to edge, there is an extra 16px above the title, and a stray rule sits at the bottom
- Severity: P1
- Where: Coach Home phone, Team scoring, light and dark
- File: `home.css:1447-1451` and `:3145-3147` (`.ch-hm-form__svg { width: 100%; margin: 16px 0 16px }`). `home.css:3114-3117` (`.ch-hm-form { padding-top: 16px; border-top: … }`): the lane resets the border at `:4617-4623` but not the padding. `home.css:3148-3152` (`.ch-hm-form__figs { border-bottom: … ledger-rule }`): the lane `:4732-4738` sets only `border-top`.
- What's wrong: the card has no side padding, so the line's first point is about 4px from the left edge and the end dot (r 3.6 at x=316/320) touches the right edge. The "Team scoring" head sits 28px from the card top while every sibling card's head sits 12px down. A parchment ledger rule draws along the card's bottom edge under the figures.
- Should be: 04 §3, consistent card header padding (14 16 12) and content inset 16. The desktop lane already insets the chart (`home.css:5559-5562`: `width: calc(100% - 32px); margin-inline: 16px`).
- Fix: in the lane add `.ch-hm[data-ch-crh='on'] .ch-hm-form { padding: 0 }`, `.ch-hm[data-ch-crh='on'] .ch-hm-form__svg { width: calc(100% - 32px); margin: 12px 16px 8px }` and `.ch-hm[data-ch-crh='on'] .ch-hm-form__figs { border-bottom: 0 }`.
- Confidence: high (code)

### CRH-8 Player names in "The team's game" are colour-only links on the phone
- Severity: P1
- Where: Coach Home phone, The team's game, light and dark
- File: `home.css:4466-4472` (`.ch-hm-legs__a { color: var(--ch-green-600); text-decoration: none }`). The lane's `:4760-4762` only removes padding. Desktop has the underline (`home.css:5385-5392`).
- What's wrong: in-text links are marked by green alone, so in greyscale "Tyler H." reads as plain text.
- Should be: H13 ("an in-text link needs an underline at rest"). `redesign.css:463` `.leg__p a` is underlined, 1px, 45% colour.
- Fix: copy the desktop rule into the phone lane block: `text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 2px; text-decoration-color: color-mix(in srgb, currentcolor 45%, transparent)`.
- Confidence: high

### CRH-9 The team's game name links are about 20px tall tap targets
- Severity: P1
- Where: Coach Home phone, light and dark
- File: `home.css:4760-4762` (`.ch-hm[data-ch-crh='on'] .ch-hm-legs__a { padding: 0 }`) cancels the 12px vertical padding from `:4466-4471` that the hit-area `::after` (`:4475-4479`, `inset: -1px …`) relied on.
- What's wrong: the target is one 15px line (about 20px) plus 2px. Adjacent names in a wrapped people line are about 20px apart, so taps land on the wrong player.
- Should be: H10, 44pt targets.
- Fix: keep `padding: 0` for layout but set `.ch-hm[data-ch-crh='on'] .ch-hm-legs__a::after { inset: -12px min(0px, calc(50% - 22px)) }`. With CRH-3's one-column layout, put each people line on its own row so the 44px areas don't overlap.
- Confidence: high

### CRH-10 The team's game notes and notices sit flush on the card edge
- Severity: P1
- Where: Coach Home phone, The team's game; states "nobody ranked" (CH-2315), up-and-down figures failed (CH-2218), Tour marks failed (CH-2219)
- File: `TeamLegs.tsx:214-245` (`Surface padded={false}` with `<Notices>` and `<p className="ch-hm-legs__note">` as direct children). `home.css:4484-4488` gives `.ch-hm-legs__note` only `margin-top: 4px`.
- What's wrong: `padded={false}` removes the body padding. The rows bring their own 16px, but the note and the RefreshNotice blocks don't, so "No player has 3 rounds with hole scores yet…" starts at x=0 of the card.
- Should be: 04 §3, "note padding 12 16 14".
- Fix: pass the note as `footerNote` (the CH-2315 sentence replaces the "cost the most" note when `!legs.ranked`). Wrap `<Notices>` in a `div` with `padding: 12px 16px 0`.
- Confidence: high (code)

### CRH-11 The week strip's event dots are 2.17:1
- Severity: P1
- Where: Coach and player Home phone (This week), Hub and Calendar strips (shared `ui/WeekStrip`), light (dark 2.39:1)
- File: `src/clubhouse/styles/ui.css:2029-2034` (`.ch-wks__d i span { background: var(--ch-ink-300) }`)
- What's wrong: ink-300 #b3afa5 on the card #fffefb measures 2.17:1. In dark, #5c584f on #191e1a measures 2.39:1. The dots are the only sign a day has events (the label is screen-reader only).
- Should be: H8, icons and UI marks ≥ 3:1 (and "ink-400 / ink-300 never live text"). The design draws the dots in `--g500` (`redesign.css:469`).
- Fix: `background: var(--ch-green-500)` (or `--ch-text-tertiary`). Keep `--ch-on-green-ink-soft` for `.is-on`.
- Confidence: high (computed)

### CRH-12 The week strip tile has a fixed 64px height that its own content overflows
- Severity: P1
- Where: Every WeekStrip (Home phone, Hub, Calendar), worst at larger Text Size, light and dark
- File: `ui.css:1964-1971` (`.ch-wks__d { height: 64px; padding: 12px 0 0; gap: 6px }`). Contents: `em` 12px, `b` 17px at `--ch-lead-tight` 1.1, `i` 11px.
- What's wrong: at the default size the content is 12 + 13.2 + 6 + 18.7 + 6 + 11 = 66.9px in a 64px box. At XXL (k = 1.36) it is about 78px. The trophy mark and the dots fall below the today ring, into the strip's bottom padding or the note line.
- Should be: H11, no overlap at the largest Text Size. Design `.week div` is padding-based with no fixed height (`redesign.css:465`).
- Fix: replace `height: 64px` with `min-height: calc(64 * var(--ch-type-k))` and `padding: 10px 0 9px`, as `.week div` does.
- Confidence: medium (arithmetic from tokens; not measured on device)

### CRH-13 Leader cards and the profile's year chip never get their year colour
- Severity: P1
- Where: Roster phone and desktop (leaders row), player profile head (year chip), light and dark
- File: `roster.css:3824-3835` sets `--ch-rs-y` only for `:is(.ch-rs-mix, .ch-rs-mix__lg) [data-year=…]`. `RosterLeaders.tsx:101` puts `data-year` on `.ch-rs-ldr` (outside `.ch-rs-mix`). `RosterProfileCrh.tsx` puts `data-year` on `.ch-rs-ychip`. Fallbacks: `roster.css:2953` and `:2974` (`--ch-chart-flat`), `:3468-3469` and `:3477` (`--ch-accent-ink`).
- What's wrong: every leader card gets the same neutral tint, ring and icon colour whatever the player's year. The year chip is always green, even for a Sophomore whose coin is another colour.
- Should be: 04 §4 Roster: leaders "fill = year colour 11% over the card, ring = year colour 24%"; ychip "year colour 14% fill, text year colour 62% into ink".
- Fix: widen the selectors to `[data-ch-crh='on'] [data-year='sr'] { --ch-rs-y: var(--ch-yr-sr) }` (and the same for jr, so and fr), or add `.ch-rs-ldr, .ch-rs-ychip` to the `:is()`.
- Confidence: high (code)

### CRH-14 Binders after the first lose their tone ring and lift on the phone, and a pressed binder loses its tone fill
- Severity: P1
- Where: Classes phone, Your classes deck, light and dark
- File: `classes.css:1644-1647` (`.ch-cl.is-phone .ch-cl-card + .ch-cl-card { box-shadow: inset 0 var(--ch-hairline-w) 0 var(--ch-ledger-rule-soft) }`, specificity 0,4,0) beats the lane's `classes.css:3040-3049` (`[data-ch-crh='on'] .ch-cl-deck .ch-cl-card { box-shadow: var(--ch-classes-shadow-2) }`, 0,3,0). Also `:1648-1650` (`[data-ch-pressed] { background: var(--ch-ledger-row-press) }`, 0,4,0) beats the lane's `background: var(--ch-cl-t)`.
- What's wrong: the first binder has its tone ring and lift. Every later one shows a 1px parchment rule along its top inside edge and no ring. On press, the coloured binder turns parchment.
- Should be: 04 §4 Classes: "Binder `.bind`: tone fill, 1px inset ring `--ch-cl-tb`, radius 16". 07: press is "scale 0.97 … no colour swap" for cards.
- Fix: in the lane block add `[data-ch-crh='on'].ch-cl.is-phone .ch-cl-card + .ch-cl-card { box-shadow: var(--ch-classes-shadow-2) }` and `[data-ch-crh='on'].ch-cl.is-phone .ch-cl-card[data-ch-pressed] { background: var(--ch-cl-t); transform: scale(.97) }`, or scope the old phone rules to `:not([data-ch-crh='on'])`.
- Confidence: high (specificity)

### CRH-15 Classes day-ribbon axis labels don't sit at their hours
- Severity: P1
- Where: Classes phone, Today card on a day off ("No classes today", ribbon of the next class day), light and dark
- File: `screens/classes/ClassesCrh.tsx:204-209` (four spans "7 AM", "10", "1 PM", "5 PM") with `classes.css:3000-3006` (`display: flex; justify-content: space-between`). Blocks are placed by `ribbonBox` (`ClassesCrh.tsx:182-186`) on a 7 AM to 5 PM scale.
- What's wrong: on that scale 10 AM is at 30% and 1 PM at 60%. `space-between` spreads the four labels evenly: on a 326px ribbon "10" centres at about 34% and "1 PM" at about 64%. A 1:00 PM class block starts visibly left of the "1 PM" label. The labels are at fixed points that don't match the data.
- Should be: the brief's pattern, "fixed-coordinate labels"; 04 §4 "Today ribbon … 7 AM to 5 PM scale".
- Fix: position each label absolutely at its fraction (`left: 30%` and `60%`, `transform: translateX(-50%)`; first `left: 0`, last `right: 0`), with `position: relative` on the axis.
- Confidence: high (arithmetic)

### CRH-16 The team-event block on the ribbon and the team row dot are 1.82:1
- Severity: P1
- Where: Classes phone, Today card (ribbon and rows), light
- File: `classes.css:2996-2998` (`.ch-cl-ribbon i.is-team { background: var(--ch-hero-mint-strong) }` on `--ch-well-bg-flat`), `classes.css:2936-2938` (`.ch-cl-tr__dot.is-team`)
- What's wrong: #7bc79a on #f6f4ee measures 1.82:1, and on the card about 1.9:1. The team practice block is the item the ribbon exists to show against the classes.
- Should be: H8, graphics ≥ 3:1. 04 §4: "team practice green".
- Fix: use `--ch-green-600` (or `--ch-chart-gain`) for the light theme, and keep mint for dark (`html[data-fw-theme='dark']`).
- Confidence: high (computed)

### CRH-17 Dark mode: a parchment double rule draws across the top of the coach Home green hero
- Severity: P1
- Where: Coach Home phone, dark
- File: `home.css:3652-3654` (`html[data-fw-theme='dark'] .ch-hm-hero__date { border-top: var(--ch-ledger-rule-double) }`), not reset by the lane's `home.css:4530-4532`
- What's wrong: the old ledger pass's 3px double rule (`rgb(205 187 142/.22)`) draws over the date line on the new green hero, in dark mode only.
- Should be: 04 §4 Home hero, one continuous green with no rules.
- Fix: add `border-top: 0` to `.ch-hm[data-ch-crh='on'] .ch-hm-hero__date`.
- Confidence: medium-high (cascade; not seen on device)

### CRH-18 Term card "Soon" stays two columns on the phone
- Severity: P1
- Where: Classes phone, term card, light and dark
- File: `classes.css:2872-2879` (`[data-ch-crh='on'] .ch-cl-term__soon { grid-template-columns: 1fr 1fr }`), `ClassesCrh.tsx:113-120`
- What's wrong: the green card is 358 − 32 = 326px, so each column is 157px. Real event labels from `eventLabel` ("Saturday Spring Preview Tournament", "Travel to Demo University Golf Invitational") at 15px wrap to 2 or 3 lines beside a one-line "Term ends". This is the same two-columns-on-phone pattern as CRH-3.
- Should be: brief pattern "grid columns that don't collapse on phone".
- Fix: `grid-template-columns: minmax(0, 1fr)` at ≤820 (keep 2 or 4 columns on desktop, `classes.css:3346-3349`). Lay each item out as date then label on one row: `display: flex; gap: 12px`, with the `dt` at a fixed 58×k width like the time column.
- Confidence: medium (depends on event title lengths)

### CRH-19 Player Home (phone) is still the pre-redesign ledger page
- Severity: P2
- Where: Player Home phone, light and dark
- File: `screens/home/PlayerHomePhone.tsx` (no `crh` prop, no `data-ch-crh`). It draws `.ch-hm-sec` sections with double rules and parchment rows (`home.css:3226-3382`, `3390+`).
- What's wrong: the coach's Home is grouped cards on `--ch-grouped-bg`. The player's is cardless parchment with engraved rules, champagne and the old Up next. Roster and Classes (the player's other tabs) are already on the new cards, so Home is the odd one out on a player's phone.
- Should be: DESIGN_LANGUAGE / ACCEPTANCE-SHARED, one look across sections. 04 covers coach Home only, so this is a scope gap rather than a defect against 04.
- Fix: carry the lane's card treatment to `PlayerHomePhone` behind the same flag (reuse `CrhFailedCard`, the `Surface` sections and `TeamLegsPhone`'s pattern), or record it as out of scope in DECISIONS.md.
- Confidence: high (code); severity is a judgement call

### CRH-20 The SG bars grow on every mount, at 280ms
- Severity: P2
- Where: Coach Home phone and desktop, The team's game
- File: `home.css:4806` and `:5340` (`animation: ch-hm-leg-grow var(--ch-dur-release) var(--ch-ease) both`)
- What's wrong: the animation runs whenever the card mounts: returning to Home, a section retry, the day rollover refresh. It is a chart draw-in each time, not "once when Home is first shown". The duration is 280ms against the spec's 360ms.
- Should be: 04 §7 "Chart grow · Home first shown · 360ms once"; H2 (no draw-ins beyond that).
- Fix: gate it with a session flag (`data-ch-grown` set after the first paint via `useChSessionState`) and use a 360ms token, or drop it per H2.
- Confidence: medium

### CRH-21 "Team stats" can be a dead `#` link
- Severity: P2
- Where: Coach Home phone and desktop, Team scoring head and failed cards
- File: `HomePhone.tsx:117` and `:391` (`rebuiltHref('/golf/dashboard/stats') ?? '#'`), `CoachHome.tsx:95` and `:111`
- What's wrong: when Stats or Roster isn't rebuilt for the role, the link renders as `href="#"`. A tap jumps to the top and does nothing.
- Should be: brief "dead taps".
- Fix: render the link only when `rebuiltHref` returns a value (as `Rounds` does at `HomePhone.tsx:515`), and make `CrhFailedCard`'s `href` optional.
- Confidence: high

### CRH-22 Latest rounds row type, coin and separators are off spec
- Severity: P2
- Where: Coach Home phone, Latest rounds
- File: `HomePhone.tsx:543` (`Avatar size={38}`); `home.css:1551-1564` (name 15/600, meta 13 tertiary); `home.css:3289-3291` (full-width separator); `home.css:2476-2478` (`.ch-hm-score em { font-size: 12px }`, fixed)
- What's wrong: the coin is 38 against the spec's 40. The name is 15/600 against row 500 16. The subtitle is 13 tertiary against 15 secondary. Separators run full width against inset 60 after a coin. The to-par line is a fixed 12px against the 13 caption.
- Should be: 04 §3 rows (`--ch-type-row`, `--ch-type-meta`, `--ch-type-caption`); §4 coin `md` 40.
- Fix: `Avatar size="md"`; in the lane block `.ch-hm-rd__b b { font: var(--ch-type-row) }`, `.ch-hm-rd__b span { font: var(--ch-type-meta); color: var(--ch-text-secondary) }`, `.ch-hm-score em { font: var(--ch-type-caption) }`; separators as in CRH-1.
- Confidence: high

### CRH-23 This week: no Calendar link, and competition days lack the design's green tile
- Severity: P2
- Where: Coach Home phone, This week
- File: `HomePhone.tsx:440-442` (head without a link); `ui/WeekStrip.tsx:110-111` (a trophy icon only)
- What's wrong: the design head has "Calendar" on the right. Competition days are drawn as `.week .major { background: var(--hero) }` with mint text (`redesign.css:471-473`). The app shows a small ink-secondary trophy.
- Should be: 04 §4 Home "This week `.week` 7 columns"; `clubhouse-phone-redesign.html:962`.
- Fix: add `<Link className="ch-hm-link" href={CALENDAR}>Calendar</Link>` in the head. Add an `is-major` tile style under `.ch-hm[data-ch-crh='on'] .ch-hm-week li.is-major .ch-wks__d` (`--ch-frame` fill, `--ch-hero-mint` letter). The `li` already carries `is-major`.
- Confidence: high

### CRH-24 The leaders scroller cuts off the cards' lift shadow
- Severity: P2
- Where: Roster phone, leaders row, light
- File: `roster.css:3018-3028` (`overflow-x: auto; padding: 2px … 6px`) with the cards' `--ch-roster-x3`, which includes `--ch-elevation-lifted` (`tokens.css:570-572`, cast to about 60px below)
- What's wrong: `overflow-x: auto` forces vertical clipping. Only 6px of shadow shows, so the cards look sliced flat at the bottom.
- Should be: 04 §4 leaders "ring = year colour 24%" (a ring, not a long cast).
- Fix: use `--ch-elevation-reading`, or the ring plus `0 1px 2px` only, on `.ch-rs-ldr` on the phone. Alternatively, give the scroller `padding-bottom: 16px; margin-bottom: -10px`.
- Confidence: medium

### CRH-25 Roster coin initials are 11px
- Severity: P2
- Where: Roster phone, team card top-five coins and leader coins
- File: `roster.css:2917` and `:2999` (`--ch-av-type: 11px !important`)
- What's wrong: this is below the 12px phone floor.
- Should be: H12; 04 §4 coin initials "650 12".
- Fix: set `--ch-av-type: 12px` (or `calc(12 * min(var(--ch-type-k), 1.2px))` as `:3126` does).
- Confidence: high

### CRH-26 Binder week tiles keep the old champagne "today" and grey "team" fills
- Severity: P2
- Where: Classes phone and desktop, binders, light and dark
- File: `classes.css:2021-2036` (`.ch-cl .ch-cl-card__week > span.is-today` champagne 24%; `.is-team` `--ch-bg-subtle` with hairline). The lane's `:3083-3085` overrides only `box-shadow` on `.is-today` and nothing on `.is-team`.
- What's wrong: today's tile is champagne-tinted inside a green ring, and team days are grey wells. Neither is in the design (`.wk` today ringed only).
- Should be: 04 §4 Classes, "week strip `.wk` 5 columns, gap 5, today's tile ringed".
- Fix: `[data-ch-crh='on'] .ch-cl-deck .ch-cl-card__week > span:is(.is-today, .is-team) { background: none }`, then restore `.is-on`'s selected tint.
- Confidence: medium-high (specificity)

### CRH-27 Ribbon: a class that is wholly before 7 AM or after 5 PM disappears
- Severity: P2
- Where: Classes phone, Today card ribbon
- File: `ClassesCrh.tsx:182-186` (`ribbonBox` clamps both ends, and `width = max(0, b − a)` becomes 0)
- What's wrong: a 6 PM lab draws with 0 width. The comment says it "clamps to the ends", but nothing shows, so the ribbon claims a free evening.
- Fix: give out-of-range blocks a minimum width (for example 6px) at the clamped end, or add an "and 1 later" note under the axis.
- Confidence: high

### CRH-28 Desktop binder hover replaces the tone ring with the generic card shadow
- Severity: P2
- Where: Classes desktop, binders, hover
- File: `classes.css:360-364` (`.ch-cl-card:hover { box-shadow: var(--ch-elevation-reading-hover) }`) against the lane's `--ch-classes-shadow-2`
- What's wrong: the tone ring vanishes while hovered.
- Fix: `[data-ch-crh='on'] .ch-cl-deck .ch-cl-card:hover { box-shadow: var(--ch-classes-shadow-2), var(--ch-elevation-reading-hover) }`.
- Confidence: high

### CRH-29 Coach Home Today time column is 48px with nowrap
- Severity: P2
- Where: Coach Home phone, Today card, larger Text Size or "All day"
- File: `home.css:4657-4661` (`width: calc(48 * var(--ch-type-k)); white-space: nowrap`)
- What's wrong: "All day" at 15/600 is about 50px, and 24-hour times with a minute are close to that. The text pushes past the column into the rail with no ellipsis.
- Should be: 04 §4 "Time column 58 × k wide, never wraps" (the Classes value; Home should match).
- Fix: `width: calc(58 * var(--ch-type-k))`.
- Confidence: medium

### CRH-30 Player Roster: the sort bar sits above the Coaches card it doesn't sort
- Severity: P2
- Where: Roster phone, player view
- File: `screens/roster/TeamRosterPhoneCrh.tsx:67-80` (sort) before `:81-96` (Coaches)
- What's wrong: the sticky Name / Class / HCP control rides over the Coaches card, which it doesn't affect.
- Fix: render the sort bar after the Coaches card, directly above Players.
- Confidence: high

### CRH-31 Desktop "The team's game" squeezes into four 148px columns at 821-1100
- Severity: P2
- Where: Coach Home desktop, narrow windows or iPad landscape
- File: `home.css:5370-5372` (`.ch-hm-legs__grid { grid-template-columns: repeat(4, minmax(0, 1fr)) }`, no intermediate breakpoint); hero `home.css:4863-4865` (`minmax(0,1fr) 380px`)
- What's wrong: at 1024 the content is about 720px, so each cell has 148px of text. This is the CRH-3 wrap problem on desktop.
- Fix: `@container` or `@media (max-width: 1180px)`, use 2×2 there, and keep 4 columns above.
- Confidence: medium

### CRH-32 "Names open that player's game on Stats" shows when names aren't links
- Severity: P2
- Where: Coach Home phone, The team's game footer
- File: `TeamLegs.tsx:212` (note text) against `:44-53` (`legPlayerHref` null renders plain text)
- What's wrong: the footer promises links that aren't there when Stats isn't rebuilt for coaches.
- Fix: add the second sentence only when `legPlayerHref(any) != null`.
- Confidence: high

### CRH-33 The Classes deck is wrapped in `.ch-cl-deck` twice on the phone
- Severity: P2
- Where: Classes phone
- File: `ClassesView.tsx:475` (`<div className="ch-cl-deck">{deck}</div>`) around `:323` (the deck's own `.ch-cl-deck`)
- What's wrong: the grid sits inside a grid, so the lane's `gap: 12px` applies twice and "Delete all classes" spaces differently from the binders. The deck-scoped selectors (`.ch-cl-deck .ch-cl-danger`) also match more widely than intended.
- Fix: render `{deck}` directly as desktop does (`:487`).
- Confidence: high

### CRH-34 Join requests badge digit sits high in its pill
- Severity: P2
- Where: Roster phone and desktop, Join requests row
- File: `roster.css:3084-3095` and `:3544-3555` (`height: 24px`, `text-align: center`, no `line-height` or flex centring; 13/18 type)
- What's wrong: the numeral rides about 3px above centre.
- Fix: `display: inline-grid; place-items: center; line-height: 1`.
- Confidence: medium

### CRH-35 The term card's "now" knob is a hard-coded colour
- Severity: P2
- Where: Classes phone and desktop, term line
- File: `classes.css:2868` (`background: #f4eedd`)
- What's wrong: a raw hex where `--ch-on-green-ink` exists. The colour is right in both themes today because it sits on green, but it won't follow a token change.
- Fix: `background: var(--ch-on-green-ink)`.
- Confidence: high

---

## Summary
1. On coach Home, the lane's phone cards were laid over the older cardless pass without resetting its `margin-inline: -12px` and `width: calc(100% + 24px)` rows. Latest rounds (CRH-1), Today (CRH-2) and Since you last looked (CRH-6) put avatars, times and score chips 4px from the card edge.
2. Layouts kept their design-page columns on the phone: The team's game 2×2 (CRH-3, owner screenshot, 147px columns, 4 to 5 line people lines), the term card's Soon (CRH-18), and desktop legs at narrow widths (CRH-31).
3. Cards are nested in cards: This week's strip (CRH-4) and Since you last looked (CRH-6). The inner cards run to the outer edges, their shadows are clipped, and footer lines sit 2px from the edge.
4. Specificity collisions with the old Classes and Roster rules: binders 2..n lose their tone ring (CRH-14), leaders and year chips never get a year colour (CRH-13), and a dark-mode double rule appears on the Home hero (CRH-17).
5. Contrast and targets: invisible first-run "Waiting on you" capsules (CRH-5, 1.01:1), week dots 2.17:1 (CRH-11), team ribbon block 1.82:1 (CRH-16), colour-only name links (CRH-8) that are about 20px tall (CRH-9).

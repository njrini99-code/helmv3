# Classes, Roster and coach Home (phone): implementation notes

Approved by Nick on Oct 31 ("All of it", then "Classes roster and coach home are all good to go"). The visual source of truth is the interactive page Clubhouse Phone Redesign, now version 6 with every state drawn and Nick's six data calls applied (https://claude.ai/artifact/QnVN3x63a79TM8geunzccU; local copy `classes-roster-home/redesign/clubhouse-phone-redesign.html`). The shared rules are in `DESIGN_LANGUAGE.md` in this folder.

**The build package is `classes-roster-home/` (start at its README).** It supersedes these notes wherever they differ: `04-FIDELITY-SPEC.md` for exact values, states, mechanics and motion; `02-PLAN.md` for files and lines; `03-DATA-CHECKS.md` for every figure. Nick, 31 Oct: "I want all of the designs to be accurately reflected in the builds." A PR is done only when its screenshots match the page side by side (spec section 9).

Data findings that change what's drawn (spec section 8; Nick settled the open ones on 31 Oct, "Go with your picks"): no Captain tag until there's a field; a plain "Injured" chip (no return date), injured players count as active; season label "2026–27"; no "Varsity"; Classes shows no finals, holidays or next week's travel; practice rounds stay out of averages, leaders and the top five; Home's bar and hero share `--ch-frame` (shell.css 1306, player Home too); the desktop "Needs a look" strip goes. Leaders and the top five need 3+ rounds per player, so staging today shows the early-season state; SG shows "—" when missing. The design page is now version 6 and draws all of this.

These notes cover only these three screens. The design refresh thread owns the combined plan for all the redesigns, so fold this file into that plan.

Repo: `njrini99-code/helmv3`, checked against `main` at 75b4956 (Oct 31). Paths are under `src/clubhouse/`. Line numbers drift, so find code by component or selector name.

## Ground rules for whoever builds this

- **Scope:** no new screens, data queries, tables or writes. Every figure below comes from data each screen already loads. Where a piece needs a small derived value (for example, last-three average), compute it on the client from what is loaded.
- **Release:** no deploy, no migration and no flag flip. Ship through PRs to `main` behind the existing Clubhouse flag, as before.
- **Top bar:** Classes and Roster show the same green bar as Stats (left title, dot, bell or page action, sheet lip). Compare against a Stats screenshot.
- **Accent borders:** no cards with a thicker accent border on the left, anywhere.
- **Text Size:** text keeps following iPhone Text Size (`--ch-type-k`).
- **Page edge:** 16px on phones, 20px on large phones.
- **Theme and motion:** test light, dark and Settings > Animations off (`[data-motion='off']`), plus Reduce Motion.
- **Visuals:** match the page exactly, value for value, from `classes-roster-home/redesign/redesign.css`. Nick judges against it.

## Shared pieces (build once, use on all three screens)

### 1. Card surface

- **Rule:** one card style, set by the design language:
  - surface fill, 16px radius
  - 1px ring plus a soft shadow
  - title (17pt semibold) inside the card, with the count or link on the right of the title row
  - caption, when there is one, inside the card under a hairline
- **Page:** flat colour behind the cards.
- **Remove on these three screens:**
  - the double-rule section headings (`--ch-ledger-rule-double`, `.ch-hm-sec__h`, the classes and roster `__sec` headings)
  - the ledger rows that sit straight on the page
- **Lists:** rows sit inside one card, 52pt (64pt with a sub-line). Separators are inset past the avatar.

### 2. Top bar: keep the app's green bar (Nick, Oct 31: "the top bar doesn't match my actual app")

The redesign does not change the phone top bar. Classes, Roster and the player profile use the same green bar as Stats today:

- **Bar:** `--ch-frame` (#0a331f light, #08150e dark), about 98pt tall including the status bar. No glass, no hairline.
- **Title:** "Classes ⌄" / "Roster ⌄" left-aligned at 16px from the edge, 18pt semibold, on-green ink `#f4eedd` (12.0:1 light, 16.1:1 dark). The chevron and the champagne dot (news in another section) sit right after it. Tapping it opens the section strip as now.
- **Right:** the bell with its count badge, or the page's own action in its place: + (Add or Import class) on Classes, add-player on Roster. Icons are bare 44pt targets in `rgb(240 233 214 / .86)` (8.9:1).
- **Sheet:** the parchment page tucks under the bar with the existing 16px rounded lip (the mask on `PhoneTop`).
- **On scroll:** the bar stays put and keeps its title. Only a soft 14px shade fades in under it after 8px.
- **Player profile (pushed):** same green bar. "‹ Roster" in champagne on the left, the player's name centred in on-green ink, a more button on the right.

### 2b. Large title

- **Size:** 34pt, with a one-line context under it (term, or team), sitting on the parchment sheet under the green bar.
- **On scroll:** it scales to 86% and fades to 10% over the first 56px. The bar title is always visible, so nothing fades into the bar.
- **Reduce Motion:** fade only.
- **Where:** the current phone pass hides `LargeTitle` on these screens. Turn it back on under the green bar; leave `PhoneTop` as it is.

### 3. Class-year colours (new)

- **Tokens:**

  | Year | Light | Dark |
  |---|---|---|
  | Senior | `#1F6B45` | `#2A7A51` |
  | Junior | `#3D6787` | `#46739A` |
  | Sophomore | `#86672C` | `#8F6E31` |
  | Freshman | `#9A4A35` | `#A3533E` |

  Initials are white. Every pair measured 4.73:1 or better.
- **Avatar:** in `ui/Avatar.tsx`, add an optional `year` prop (`'sr' | 'jr' | 'so' | 'fr'`) that sets `data-year`. Style `.ch-avatar[data-year]` with:
  - fill: the year colour
  - initials: white
  - `inset 0 0 0 1px rgb(0 0 0/.10), inset 0 1px 0 rgb(255 255 255/.16)`
- **Where the year comes from:** the player's class year, from `classYearLabel` / `graduation_year` (data/season.ts).
- **Fallbacks:** coaches, invites and players with no known year keep today's id-based `data-tone` (B19).
- **Where it shows:** pass `year` wherever a player coin is drawn and the year is known:
  - Roster (phone and desktop), profile and peek
  - Home (Up next stack, Latest rounds, Leaderboard)
  - join requests
- **Inactive players:** the coin is desaturated (`filter:saturate(.35); opacity:.8`).
- **Open call:** this overrides the B19 "one tint rule" for players. Nick approved the look; record it as the new rule in the Avatar comment.

### 4. Sort toggle

- **Component:** use `ui/Segmented` exactly as the rest of the app draws it: the `--ch-well-bg` well, the green chip from `--ch-seg-on-bg` / `--ch-seg-on-shadow`, and `--ch-seg-on-ink`.
- **Overrides:** Nick called out that the toggle must be the green Clubhouse one, so no screen-level restyle may flatten it.
- **Placement:** on Roster it moves into a sticky bar pinned under the top bar, with no "Sort by" caption. The bar uses the page colour, and the chip springs between options.
- **Order:** the list reorders with a FLIP slide (360ms, `cubic-bezier(.22,1,.36,1)`). Nothing fades.

### 5. Motion

These are the design language's shared values:

| Motion | Timing |
|---|---|
| Press | 110ms down, 280ms back, scale .97; list rows tint instead of scaling |
| Push | 462ms on the smooth spring; the outgoing screen moves −30% and dims |
| Sheet | 462ms in, 280ms out |
| Segmented | 360ms, `cubic-bezier(.34,1.3,.64,1)` |
| Chart grow | 360ms, once, on first paint only |
| Reduce Motion / Animations off | everything becomes a 120ms opacity crossfade, or is drawn in place |

## Classes (player): `screens/classes/`

- **Top bar and large title:** `ClassesView.tsx`.
  - Large title "Classes", with "Fall 2026 · Aug 20 – Dec 15" under it.
  - The + button opens Add class / Import, so the "Your classes" heading row goes.
- **Term card:** `parts.tsx` `TermBar`. This is the screen's one feature card, in deep green `--ch-green-800`.
  - Delete the compact phone one-liner (`.ch-cl-tb.is-compact`, `.ch-cl-tb__one` in `classes.css`).
  - Contents:
    - week well ("11 of 17")
    - "Week 11", "6 weeks left · finals start Dec 9"
    - overlap chip, which scrolls to the Overlaps card
    - credits bar split by class tone, with "6 classes / 15 credits"
    - term line with a Today marker and ticks for finals and term end
    - "Soon" list in two columns
  - Flat fill, no glow or gradient behind text.
- **Today card:** `parts.tsx` `TodayClasses`.
  - Title row: "Today", with the weekday on the right.
  - On a day with no classes: "No classes today", "Next: Monday, Nov 2", then a 7 AM–5 PM ribbon of the next class day. Classes show in their tone and team events from the calendar in green.
  - Rows:
    - fixed 58pt time column, with the number over AM/PM, tabular, never wrapping
    - tone dot, class name, room
    - chevron that opens the class
  - De-duplicate by class id plus start time. Today's demo shows every class twice.
- **Overlaps:** `OverlapsCard` (`parts.tsx`).
  - A standard white card, not a tinted one. The amber chip "1 this week" sits in the title row.
  - Contents: a bus icon chip, the travel line, then the affected classes with start times.
  - Caption: "Your coach sees this overlap too."
  - Use warning tokens only.
- **Class binders:** `ClassCard`, `.ch-cl-card`.
  - Delete the phone flattening block (`.ch-cl.is-phone .ch-cl-card {…}` and its siblings in `classes.css`).
  - The card keeps:
    - tone fill and 16px radius, with the same ring and shadow as every card
    - course code large
    - credits chip, name, professor in italic
    - week strip with start times, today's tile ringed in green
    - dashed footer with the room, plus an amber flag when travel hits
  - Tap opens the detail sheet.
- **Status and coach note:** `ClassStatusPanel` and `CoachNote` merge into one card: the "Share class status with coaches" switch row, then "What your coach sees". Copy is unchanged.
- **Detail:** `ClassDetail` becomes a bottom sheet.
  - 20px radius, grab handle, swipe down to close.
  - Contents: tone header, two-column facts, this week's meetings with travel flagged, Remove and Edit.
- **Dark:** the tone set in `classes.css` needs deep tinted fills with light tone ink so cards stay distinct without glowing. Use the dark values on the page.

## Roster (coach and player): `screens/roster/`

- **Head:**
  - Coach: `RosterPhone.tsx`. Player: `TeamRosterPhone.tsx`.
  - Large title "Roster", with the team name under it.
  - Invite stays top right for coaches.
- **Team card (new, from loaded data):** the Roster's one feature card, deep green.
  - "Varsity · Fall 2026"
  - "n active · n injured · n waiting". Coaches see "waiting"; players don't.
  - Total player count large, on the right.
  - Class-mix bar: one segment per year in the year colours, sized by count, with a legend ("1 Senior · 4 Juniors …"). Count active and inactive.
  - Footer: the top five coins (lowest scoring average among active players), with their mean in a mint chip ("76.2 avg").
  - Players see the same card without "waiting".
- **Leaders, coach only (new, computed on the client):** a horizontal snap-scroll row of three cards, each about 62% of the width and capped at 220pt.
  - Low average: the lowest scoring average.
  - On a heater: the best average over the last three rounds, among players with at least three.
  - Needs a look: the player whose row already carries the amber attention note. Show SG/rd in loss amber. Hide the card when nobody has the note.
  - Each card is tinted with that player's year colour (11% over the surface, 24% ring). It has the label with an icon, the figure large, then the coin and name.
  - Tap pushes the profile.
- **Join requests:** `RequestsBanner` becomes one card row: stacked coins, names, green count badge, chevron. It opens `RequestsSheet`: Decline/Approve per row, team code, Approve all.
- **Sort:** sticky `Segmented`, as in shared piece 4.
  - Coach: Avg / SG / Name.
  - Player: Name / Class / HCP.
- **Rows (coach):** replace the ledger list (`.ch-rsm-list`) with rows inside one card. Each row has:
  - year coin
  - name, plus a "Captain" tag in champagne (`--yr-so` at 16%) when the player has that role
  - note line:
    - the class line shows its class tone dot
    - amber for a slide
    - green for a gain
    - otherwise plain
  - form bars instead of the grey `FormLine` spark: five bars for the last five rounds, taller for lower scores, sharing one range down the list (keep the B5 `FormRange` idea). A bar is green when the round beat the team scoring average, loss amber when it was more than two over, and neutral otherwise.
  - the sorted figure, with HCP or "SG / rd" under it
  - chevron
- **Card caption:** "Bars are the last five rounds. Green beats the team average."
- **Rows (player view):**
  - same card and coins, with "Senior · Class of 2027" under the name
  - "You" chip on your own row
  - HCP on the right
  - not tappable, as today
  - a Coaches card above the players
- **Inactive:** its own card. The coin is desaturated and an amber chip shows the reason, for example "Injured · back Nov 16".
- **Profile:** `RosterProfile.tsx`, pushed with the UIKit push.
  - Head: centred year coin, name, then hometown and Captain. Under them, a chip in the year colour: "Junior · Class of 2028".
  - Then, as today: Message / Plan 1:1, the three-figure card, Scoring trend card, Recent rounds with score wells, About.
- **Desktop:** `Roster.tsx` table plus `RosterPeek.tsx`.
  - Top row: the team card plus the three leader cards.
  - The table sits inside a card with a sticky header. The "Last 5" column shows the form bars, and coins use year colours.
  - The peek shows a year chip under the name.
- **Class year bug:** `classYearLabel` fallback.
  - Fix the repeated "Class of 2031 · Class of 2031" in the profile, peek and requests sheet.
  - Show no year rather than "Class of 2026" when `graduation_year` is missing. Year colours need a real year and fall back to the B19 tone.

## Coach Home: `screens/home/`

Keep the cards under the hero the same shape as player Home, which the Stats thread is redesigning. Check `stats-and-home-phone.html` in this folder before building, so both Homes match.

- **Hero:** `HomePhone.tsx`. Restore `.mh-hero`, whose green fill the phone pass removed in `home.css`.
  - Flat `--ch-frame` green (the bar's green, so bar and hero are one piece) with a 24px bottom radius. No glow or gradient behind text. Today the hero-mode bar paints a radial light over `#0b3a25` (shell.css 1305–1310); change it to `--ch-frame` (one line; player Home's bar changes too, Nick's call 31 Oct).
  - Top row as today: team crest (32pt ivory circle with the flag), "Home ⌄" with the dot (opens the section strip), and the ringed bell with its count.
  - Date, then the greeting at 28–34pt.
  - The brief, with its sparkle icon.
  - All ivory text at 72% opacity or more.
- **Waiting on you:** `CoachQueue` (phone) becomes capsules on the green with a bold count, drawn 34pt tall in a 44pt hit area.
- **Up next:** `DayCard.tsx` becomes a glass card on the hero:
  - type, and a countdown chip
  - title at 22pt
  - time · place
  - coin stack with "4 of 6 going"
  - chevron
- **Today:** `Today` in `HomePhone`.
  - Card with a fixed time column.
  - A clash shows as an amber chip, and the next item gets a "Next" chip instead of a mint highlighted row.
- **Team scoring:** `Form`.
  - A card again: average large with a real text label (drop the `::after` label in `home.css`), the delta, the line chart, then Rounds / GIR / Putts under a hairline.
  - Change colours only when the change clears the standard error, as today.
- **The team's game:** `TeamLegsPhone` in `TeamLegs.tsx`.
  - One card with a 2×2 grid split by hairlines, the same as the player's `.ch-ph-leg`. Each cell has:
    - SG large
    - a diverging bar from a centre zero line, in gain green or loss amber, that grows once on load
    - the stat
    - the trend
    - "X gains most · Y loses most", with the names underlined as links to that player's Stats
  - Caption: "Approach and putting cost the most."
- **This week:** day tiles. Today is ringed in green, with dots for events.
- **Latest rounds:** `Rounds`.
  - Card with 64pt rows: coin, name, course · date, spark, score well.
  - Use red only for under par.
  - Move the hard-coded `#3F7556` stroke and `#9E3B2E` under-par colour to tokens.
- **Stylesheet:** collapse the three stacked phone blocks in `home.css` into one, so a later pass can't flatten it again.

## Demo data issues (fix in the loader or demo seed, not the design)

- **Duplicate classes:** demo Classes shows every class twice (14 rows for 7). Look at the import or loader.
- **Missing years:** "Class of 2026" shows where `graduation_year` is missing.
- **Repeated label:** "Class of 2031 · Class of 2031" in the profile, peek and requests sheet.
- **Sample data:** the redesign page made Jackson Hale a junior only to show three year colours. That is sample data, not a change.

## Open calls to settle in the combined plan

1. **Tab bar or section strip:** `DESIGN_LANGUAGE.md` mentions a tab bar, but the phone uses the section strip (approved Oct 12, `docs/clubhouse/phone/section-strip.md`). These screens keep the strip.
2. **Year colours vs B19:** year colours replace the B19 id tone for players whose year is known.
3. **Toggle gradient:** the green `Segmented` chip has a top-to-bottom shade (Nick's Oct 16 call), which the design language's no-gradient-behind-text rule should allow for this one control.
4. **Tinted cards:** tinted cards (class binders, leader cards) count as identity, not a second card style.

## Acceptance checks per PR

- **Contrast:** AA for all text in light and dark. The page's contrast tables list every pair; the lowest is 4.73:1, Sophomore initials in dark.
- **Phone widths:** 390pt with a 16px edge and 430pt with a 20px edge. No horizontal scroll, and the time columns never wrap.
- **Text Size:** test at Default and at the largest standard size. Rows grow; nothing clips.
- **Motion:** Reduce Motion and Animations off swap every move for a crossfade or a static draw. The chart bars grow once, never on scroll.
- **Top bar:** Classes and Roster show the same green bar as Stats (left title, dot, bell or page action, sheet lip). Compare against a Stats screenshot.
- **Accent borders:** no left accent borders, tracked capitals, gradients behind text (except the toggle chip), mint highlight rows or count-up numbers.
- **Visual check:** a Playwright screenshot of each screen in light and dark, compared side by side with the redesign page.

## Suggested PR split

1. **Shared pieces:** the Avatar `year` prop and tokens, the card surface and large-title wiring, and the class-year label fix.
2. **Classes.**
3. **Roster, phone:** coach and player views, and the profile.
4. **Roster, desktop.**
5. **Coach Home.** Coordinate with the player Home PR from the Stats thread.
6. **Demo data:** the duplicate classes and missing graduation years.

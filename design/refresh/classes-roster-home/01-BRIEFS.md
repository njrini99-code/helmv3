# Briefs: Classes, Roster, coach Home

Nick approved all three on Oct 31: "Classes roster and coach home are all good to go." The approved look is the page `redesign/clubhouse-phone-redesign.html` in this folder (the same page Nick reviewed online as Clubhouse Phone Redesign, now version 5 with every state drawn). Open it in a browser. The tabs switch screens. Phone, desktop, light, dark, Text Size and Reduce Motion are toggles on the page.

Each brief says what the screen is for, what's wrong today, what the redesign does, what must not change, and how to know it's done. Exact values, states, mechanics and motion are in `04-FIDELITY-SPEC.md` (the build must match the page, not interpret it). The file-by-file steps are in `02-PLAN.md`, and where every number comes from is in `03-DATA-CHECKS.md`.

Rules for all three:

- **Top bar:** keep the app's real green bar (`PhoneTop` / `TopBar`). The title goes on the left with the chevron and the champagne dot, and the bell or the page's own action goes on the right. The parchment sheet tucks under the bar with its 16px lip. See `screenshots/before/reference-stats-top-bar.png`.
- **Cards:** one card style, set by `DESIGN_LANGUAGE.md`. The title sits inside the card, on a flat page. No card with a thicker accent border on the left.
- **Text Size:** text follows iPhone Text Size (`--ch-type-k`).
- **Edges:** 16px phone edge, 20px on large phones.
- **Motion:** light, dark, Reduce Motion and Settings > Animations off all work.
- **Data:** only numbers the screen already loads, or computes from what it loads. No change to what shot tracking collects. Practice rounds stay out of scoring averages, leaders and the top five (Nick, 31 Oct).
- **Release:** prep and PRs only. No deploy, migration or flag flip.

---

## 1. Classes (player)

**Route:** `/golf/dashboard/classes`. Players only.

**What it's for:** a player checks today's classes, the week, and anything that clashes with team travel, then adds or imports classes. Coaches see the same class status from their side.

**Today** (`screenshots/before/phone-classes-player-light.png`):
- The term is crushed into one line in the green bar area ("Week 11 of 17 · 15 credits · 14 classes").
- Class binders are flattened into ledger rows on the parchment.
- "Today" lists each class twice (a demo data bug, see the data checks).
- The time column wraps.

**Redesign:**
- **Large title:** "Classes" under the green bar, with the term ("Fall 2026 · Aug 20 – Dec 15") beneath it.
- **Term card:** the screen's one deep-green feature card. It holds:
  - week well "11 of 17"
  - weeks left and the term end (no finals: no source yet)
  - overlap chip
  - credits bar split by class colour
  - term line with a Today marker
  - a "Soon" list: the term end and this week's team events only
- **Today card:**
  - On a day with no classes, it says so, shows the next class day, and draws a 7 AM–5 PM ribbon of that day.
  - Rows have a fixed 58pt time column that never wraps.
- **Overlaps card:** a white card with an amber chip and a bus icon. It lists the classes the travel hits, captioned "Your coach sees this overlap too".
- **Class binders:** cards again. Tone fill, course code large, credits chip, professor, week strip with today's tile ringed, room in a dashed footer. Tap opens a bottom sheet with the detail.
- **Status card:** the "Share class status with coaches" switch and "What your coach sees" merged into one card.
- **Top bar:** + replaces the bell and holds Add class and Import, so the "Your classes" heading row goes.

**Must not change:** the green bar, the class data model, the import flow, the class-status sharing logic, and the coach-side copy.

**Done when:**
- It matches the redesign page on phone and desktop, light and dark.
- No class shows twice.
- Time columns never wrap at 390pt with the largest standard Text Size.
- The overlap chip scrolls to the Overlaps card.

---

## 2. Roster (coach and player, plus the player profile)

**Routes:** `/golf/dashboard/roster`. Opening a player is in-page: a push on phone, the peek on desktop.

**What it's for:**
- **Coach:** sees the whole team at a glance (who's playing well, who needs a look, join requests) and opens a player.
- **Player:** sees teammates and coaches.

**Today** (`screenshots/before/phone-roster-player-light.png`, the player view; the coach view has the same rows plus Avg / SG / Name):
- Ledger rows on parchment, every avatar the same pale coin, and a grey form spark.
- The sort toggle is captioned "Sort by" and sits in the flow.
- Nothing tells you about the team as a whole. Nick called it "basic and boring and colorless".

**Redesign:**
- **Large title:** "Roster" with the team name.
- **Team card:** deep green, titled with the season ("2026–27 season"). It shows the active count, the total, and a class-mix bar in year colours with a legend. Coaches also see injured and waiting counts and, in the footer, the top five coins with their mean (only once five players have 3+ rounds). Players see neither.
- **Leaders row (coach only):**
  - Low average, On a heater (best last-three), and Needs a look, all among players with at least three rounds. The row is hidden until someone qualifies.
  - Swipeable cards tinted in each player's year colour.
  - Needs a look hides when nobody has the attention note.
- **Join requests:** one row that opens the requests sheet.
- **Sort toggle:** the stock green Clubhouse segmented control (Avg / SG / Name for coaches, Name / Class / HCP for players), sticky under the bar. The list slides into its new order.
- **Coach rows** (one card):
  - year-coloured coin and name
  - note line
  - five form bars for the last five rounds, green when the round beat the team average and amber when more than two over
  - the sorted figure, with HCP or SG/rd under it ("—" when a player has no SG)
- **Player rows:** "Senior · Class of 2027", a You chip on your own row, HCP on the right, and a Coaches card above.
- **Injured card:** desaturated coins with an amber "Injured" chip, from availability. No return date (there's no field for one).
- **Profile (push):**
  - The same green bar, with "‹ Roster" in champagne, the name centred and a more button.
  - Head: centred year coin, name, hometown, and a chip in the year colour ("Junior · Class of 2028").
  - Then today's actions, figures, scoring trend, recent rounds and About.
- **Desktop:** the team card and the leaders across the top (the old "Needs a look" strip goes), the table in a card with a sticky header, form bars in "Last 5", and a year chip in the peek.

**New look rule:** class-year colours for player coins (Senior green, Junior blue, Sophomore ochre, Freshman brick, white initials, all at 4.73:1 or better). They replace the id-based tone (B19) only where the class year is known.

**Must not change:** the green bar, invite and request logic, permissions (who sees waiting), and what a player can open.

**Done when:**
- It matches the page.
- The sort chip is the green Clubhouse one.
- Year colours show only with a real class year, and no "Class of 2031 · Class of 2031" or invented "Class of 2026" appears.
- Every figure matches the data checks.

---

## 3. Coach Home

**Route:** `/golf/dashboard`, as the coach.

**What it's for:** the coach's first look of the day: what's waiting on them, what's next, today, how the team is scoring, and where strokes are lost.

**Today** (`screenshots/before/phone-home-coach-light-scrolled.png`):
- The green hero was flattened by the phone pass.
- Sections are ledger headings on parchment with double rules.
- Highlighted mint rows, and hard-coded colours in Latest rounds.

**Redesign:**
- **Hero:** flat `--ch-frame` green, the same green as the bar, so they read as one piece. Bottom radius 24.
  - The bar row stays as Home has it today: team crest, "Home ⌄" with the dot, and the ringed bell with its count.
  - Then the date, "Good morning, Nick.", and the brief with its sparkle.
  - "Waiting on you" capsules.
  - The glass Up next card: type, countdown, title, time and place, coins, "4 of 6 going".
- **Cards on the flat page:**
  - **Today:** fixed time column, amber Clash chip, a Next chip instead of a mint row.
  - **Team scoring:** average large with a real label, the change against the previous 10, a line chart, and Rounds / GIR / Putts.
  - **The team's game:** 2×2 SG grid with diverging bars that grow once, and "X gains most · Y loses most" names linking to Stats.
  - **This week:** day tiles.
  - **Latest rounds:** 64pt rows with coin, spark and score well. Red only for under par, colours from tokens.
- **Coordination:** player Home is being redesigned in the Stats thread (`../stats-and-home-phone.html`). Match its card shapes.

**Must not change:** the bar row's contents (crest, title, dot, bell; the bar's fill becomes `--ch-frame` on both Homes, Nick's call), the brief's source, queue logic, standard-error rule for colouring changes, and links into Stats.

**Done when:**
- It matches the page.
- The hero and the bar are one continuous green with no seam.
- Every figure matches the data checks.
- The three stacked phone blocks in `home.css` are one.

<!-- Source: design-direction judge panel (4 lenses → synthesis), 2026-07-01. North-star for all BaseballHelm UI/UX enhancement waves. -->

> ## ADDENDUM (founder direction, 2026-07-01): CONTRAST + MORE GREEN
> The Fairway system's weak spot was **low contrast — especially in stats** (warm-gray
> numerals on warm cream washed out) and **not enough green**. These rules OVERRIDE any
> softer default and apply to the whole kit:
> 1. **Stat numerals = maximum contrast, never warm-gray-on-cream.** Every `StatReadout` /
>    `RuledStatLine` value renders in near-black `--graphite` on paper (target ≥7:1), OR in
>    `--team-ink` green for an emphasis/leader value. Labels stay quiet (`graphite/60`
>    small-caps); the **number carries the contrast**.
> 2. **Green does real emphasis + wayfinding work** (more assertively than Fairway did). In
>    team lanes (Pressbox/Passport) the `RuledStatLine` **baseline rule is green** (`--team-ink`),
>    not hairline-gray — it adds green presence and separates rows crisply. Clay rule in the
>    War Room lane only.
> 3. **Leaders/bests get green.** In Stats Center / roster / KPI strips, the team-leading value
>    in a column gets a green treatment (green numeral or green underline + a small `LEADS`/HOT
>    tick) so the eye lands on green.
> 4. **Active/selected/focus states = green** (active tab, selected row, focus ring, section-
>    masthead accent rule) — more visible green than Fairway's subtle accents.
> 5. Clay stays strictly recruiting; green is used everywhere team/dev and used **boldly for
>    contrast**, not as a faint tint. No gray card-soup — contrast comes from green rules +
>    high-contrast numerals + whitespace.
>
> ## ADDENDUM 2 (founder direction, 2026-07-01): FONT + CREAM
> These OVERRIDE §4.1's Fraunces/mono type roles for BaseballHelm:
> - **Type = Space Grotesk** for player names / hero numerals / section titles AND stat figures
>   (`--font-space-grotesk` → Tailwind `font-annual`, always `tabular-nums` on numbers). ONE
>   athletic grotesk for display + numbers. **Fraunces (serif) and Fragment Mono are dropped
>   from the baseball kit.** Chrome/body labels stay on the existing sans (Geist/DM Sans).
> - **Less white, more cream.** Surfaces are warm cream, NOT white cards. Palette: canvas
>   deep warm cream (~`#EDE5D3`), card/surface a lighter cream (~`#F5EEDD` — still clearly
>   cream, never `#FFF`/near-white), hairline warm (~`#DED3BC`). `--paper` is redefined to the
>   cream, and baseball surfaces override the Fairway white `--fw-color-surface` with cream
>   **inside a baseball scope only** (golf untouched). Green rules + graphite numerals read
>   even better on the deeper cream.

# BaseballHelm Design Spec — "The Living Annual"
*Design director's decision + build-ready architecture. This document is the north star for all BaseballHelm redesign waves.*

---

## 1. Scoring the four pitches

| Direction | Wow | Baseball-native | Clarity/Usability | Implementability (cream+green+Tailwind) | Notes |
|---|---|---|---|---|---|
| **1. Editorial sports-annual** | 8 | 8 | **9** | **9** | Cream-native, clarity-first, "ruled stat line" + two-ink lanes are genuine connective tissue. Lowest-risk, highest-coherence. |
| **2. Broadcast telemetry** | **9** | 8 | 7 | 6 | "Readout settle" and LIVE presence are gold, but the required Booth Black dark shell fights the Helm cream brand and risks a gamer-dashboard feel if over-applied. |
| **3. Scouting dossier** | 8 | **9** | 8 | 7 | The 20-80 Grade Stamp is the single most baseball-fluent object anyone pitched. Letterpress paper physics are very buildable. Risks skeuomorphic kitsch if taken literally everywhere. |
| **4. Kinetic performance lab** | **9** | **9** | 7 | 6 | "The Trace" is the only pitch that solves baseball-native *data-viz* (break/spray/climb). Needs a dark canvas though, and pure-viz can starve the CRM/ops surfaces of structure. |

**Verdict:** No single pitch wins outright, but Direction 1 is the only one that is simultaneously top-tier on clarity *and* implementability while staying inside the Helm cream+green system — and its "ruled stat line" and two-ink lane model are the strongest *system* (they scale across every surface, not just the hero moments). It becomes the **spine**. It is missing exactly two things — a baseball-fluent *evaluation object* and baseball-native *data-viz* — which Directions 3 and 4 supply perfectly. Direction 2 contributes motion physics and "aliveness," used with restraint.

---

## 2. The decision: **"The Living Annual"**

**PRIMARY = Editorial sports-annual (1)**, grafted with:
- **The 20-80 Grade Stamp + tool rail + Compare overlay + Commit seal** (from 3) → becomes the evaluation atom of the recruiting lane.
- **"The Trace" viz primitive + chalk-on-clay canvas** (from 4) → becomes the *only* dark surface in the product, reserved exclusively for baseball motion data (pitch break, spray, season climb).
- **"The Readout" settle motion + Number Flow + LIVE presence** (from 2) → becomes how every number *behaves*, and how genuinely-live states are marked — without adopting the Booth Black shell.

We reject: the all-dark broadcast shell, literal manila-folder skeuomorphism, and any "pick one metaphor and force it everywhere." We keep three metaphors mapped to the three real jobs, unified by **one grid, one ruled-line motif, and two inks.**

---

## 3. Design read

BaseballHelm is the **glossy college-baseball season annual crossed with a front-office scouting file — live, and theirs.** Every number is set in ink and treated with reverence. The coach edits the magazine (team ops) and reads the field files (recruiting); the recruit writes their own cover story (development). Three jobs, three "sections" of one publication, bound by a ruled record-book spine and told in two inks: **green = team & development, clay = recruiting & pursuit.** Where baseball motion becomes data — a pitch breaking, a ball sprayed, a season climbing — the page cuts to a lit **chalk-on-clay** instrument panel, the one dark surface, like a chart dropped into a magazine spread. It never looks like a gray CRM; even an empty roster looks like an unreleased first issue.

---

## 4. Language: type, color, surface, motion

### 4.1 Type — three voices, used with intent
Reuse Helm's existing font stack; add one editorial serif if not already loaded.

| Voice | Font | Role | Tailwind |
|---|---|---|---|
| **Byline (serif)** | Newsreader / GT Sectra / Canela-class | Player & program names, section splashes, **hero numerals only**. Never UI chrome. | `font-serif` (add `--font-serif` to `tailwind.config`) |
| **Chrome (grotesk)** | Existing Helm sans (Inter/Geist) | All labels, nav, body, tables. | `font-sans` (default) |
| **Ledger (mono)** | Geist Mono / JetBrains Mono | Every *measurable* and grade numeral in tables/stamps — `tabular-nums`, locked figures so digits never jitter. | `font-mono tabular-nums` |

Signature moves:
- **Player name = editorial masthead**: given name in serif regular, `SURNAME` in serif medium small-caps, two lines.
- **Eyebrow datelines**: `text-[11px] tracking-[0.14em] uppercase text-graphite/60` → `SS · 2B — CLASS OF ’26 — RALEIGH, NC`.
- **Hero numerals**: serif, 80–160px, `tabular-nums`, sitting *on* a hairline rule.

```js
// tailwind.config — fontSize additions
'ink-hero': ['clamp(4rem, 9vw, 10rem)', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
'ink': ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '0.95' }],
'eyebrow': ['0.6875rem', { lineHeight: '1', letterSpacing: '0.14em' }],
```

### 4.2 Color — two inks + one reserved dark canvas
Stay in the Helm system. Introduce exactly one editorial accent and one viz surface.

```css
:root {
  /* Helm base (unchanged) */
  --paper:        #FFFEFA;   /* cream canvas */
  --graphite:     #1C1A17;   /* primary text */
  --hairline:     #E7E3D8;   /* THE border — does the work of most cards */

  /* Two inks */
  --team-ink:     #16A34A;   /* green — team & development */
  --team-ink-2:   #22C55E;   /* green highlight */
  --pursuit-ink:  #C2703D;   /* infield-clay terracotta — recruiting & urgency */
  --pursuit-deep: #7A2E22;   /* oxblood — seals & stamps only */

  /* Grade ramp (20–80 scale) */
  --grade-low:    #B4573F;   /* 20–40 muted clay-red */
  --grade-avg:    #6B655B;   /* 45–55 ink-neutral */
  --grade-plus:   #16A34A;   /* 60–80 team green */

  /* Reserved viz canvas — the ONE dark surface */
  --clay:         #17130F;   /* warm dirt-black, never blue-black */
  --chalk:        #F4EFE6;   /* chalk hairlines/grid on clay */
  --sodium:       #F5A623;   /* PR / live / in-progress accent — sparingly */
}
```

**Rules that must hold:**
1. **Green = team + development. Clay = recruiting + pursuit.** The active lane's ink *is* the wayfinding. Never mix inks within a lane's chrome.
2. **Clay/oxblood only on stamps, seals, deadlines, offers, hot signals** — never as generic chrome or a red error badge. Urgency is a color, not a toast.
3. **`--clay` dark canvas appears ONLY inside a viz frame** (pitch break, spray, climb). It never becomes a page background, never a sidebar, never a card. Cutting to it should feel like cutting to the analytics desk.
4. **`--sodium` amber fires once** on a PR / commit / live-value-crossed-threshold, then rests. It is not a fourth chrome color.
5. No gray card-soup. Structure comes from **hairline rules + whitespace**, not filled gray boxes.

### 4.3 Surface — three families
| Family | Use | Treatment |
|---|---|---|
| **Paper** | Editorial reading: passport, roster spread, postgame, command center. | Flat `--paper`, hairline rules, generous margins, `2–3%` newsprint grain overlay, die-cut registration-corner tick on hero cards. |
| **Glass** | Live/interactive tooling: pipeline board, filters, live game, drag surfaces. | GolfHelm-grade frosted panel (`backdrop-blur`, soft inner light) — keep parity with GolfHelm's glass tokens. |
| **Clay canvas** | Baseball motion viz only. | `--clay` with `--chalk` graticule, faint scan-line vignette, Traces drawn on it. |

Depth is **letterpress, not drop-shadow**: `shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_-1px_0_rgba(0,0,0,0.06)]` + hairline border. Reserve real elevation shadow for actively-dragged objects only.

### 4.4 Motion — "print coming to life," alive but never bouncy
Six principles (superset of all four pitches, deduped):

1. **INK SETTLES** — serif hero numerals/names arrive `opacity 0→1 + translateY 2px + blur 2px→0`, `400ms ease-out`, staggered down a ruled column so a stat line "sets" top-to-bottom.
2. **RULES DRAW** — every hairline baseline rule animates `scaleX 0→1` from left, `200ms ease-out`, on mount. This is the signature transition that ties all pages together.
3. **ODOMETER TRUTH** — any *changing* number (pipeline counts, completeness %, live velo, score) rolls mechanically via Number Flow / tabular odometer, ~450ms, single-digit overshoot-and-lock. Numbers are sacred; they move like a radar gun, not a spring.
4. **TRACES DRAW** — all viz strokes render via `stroke-dashoffset` animation (grid → axes → data strokes → labels, staggered ~40ms), like a pen moving. Weight + glow encode quality.
5. **STAMP PRESS** — grade reveals, commit seals, completeness snaps: fast down (~120ms) → slow settle w/ hair of overshoot (~260ms) + 6–10% ink-bleed. "Pressed, not popped."
6. **PAGE-TURN NAV** — lane switches and passport→packet cross-dissolve with a subtle depth/lift (the paper turn), not a slide.

**Budget:** one signature move per view, GolfHelm's slow-glass restraint. **LIVE presence:** a small breathing dot (2s pulse) marks anything genuinely receiving data — used sparingly (live game, incoming sync), not decoration. **`prefers-reduced-motion`:** rules render drawn, numbers set instantly, traces render fully-drawn static, PRs show without pulse.

---

## 5. Information architecture — three lanes, ink-as-wayfinding

Kill the flat 14-item settings-menu sidebar. Replace with a **three-lane masthead model**. A slim left rail carries only a **lane switcher** (three tabs, each its own ink) + the current lane's 3–5 sections. The top is a magazine **masthead bar**: team wordmark left · season/issue dateline center · global ⌘K search right.

### Lane 1 — THE PRESSBOX · green ink · coach team-ops
`Command Center (the cover) · Roster · Stats · Practice · Postgame · Calendar/Travel`

### Lane 2 — THE WAR ROOM · clay ink · coach recruiting
`Pipeline (board) · Discover · Watchlist · Scout Packets · Decision Room · Signals`

### Lane 3 — THE PASSPORT · green ink · player development
`Today · My Passport · Development · Stats · Recruiting (Go-Live gate)`

**Coach types remap to lanes, never to new nav:**
- **College** → War Room + Pressbox.
- **HS** → Pressbox only.
- **JUCO** → a masthead toggle that flips accent ink green↔clay (both lanes).
- **Showcase** → Pressbox with a multi-team "issue selector" in the dateline.

The **ink color is the wayfinding** — you always know which magazine you're reading. Player recruiting activation stays a deliberate, ceremonial **"GO LIVE"** gate on the passport (opt-in / anonymous-then-identified model preserved).

---

## 6. Signature surfaces to redesign first (prioritized)

> Priority = (impact on "wow" + how broken it is today + reuse leverage). Build the shared kit (§7) in parallel with #1–#3.

### P0 — 1. The Player Passport Spread *(player-dev hero; replaces today's form-list)*
Full editorial cover spread. **Left third:** portrait column, name as serif masthead (`Marcus / RODRIGUEZ`), small-caps dateline, die-cut registration tick. **Right two-thirds:** the **Ruled Stat Line stack** — `60-YARD 6.71 / EXIT VELO 94 / POP TIME 1.94`, each a 120px serif ink numeral on a hairline rule; **verified** fields wear a green `ON THE RECORD` check, **unverified** ghost at 40% waiting to be filled. Grafted from Dir 3: measurables also expressible as a **20-80 tool rail** (`GradeStamp` row) for scouted players. Below the fold: a single-column **Development Story** — dated pull-quotes from coach notes + PR milestones, set like a magazine feature, not a checkbox list. Scroll-linked masthead shrinks the serif name into a sticky byline. **Build:** 12-col CSS grid, `tabular-nums`, Number Flow, framer-motion scroll.
*"Profile completeness 38%" dies here → the card literally fills in; ghosted Traces/rules mark what's missing.*

### P0 — 2. The War Room Pipeline Board *(recruiting; today it's a redirect stub)*
Five record-book ledger columns: `WATCHLIST → HIGH PRIORITY → OFFER EXTENDED → COMMITTED` (`UNINTERESTED` filed in a drawer, never deleted). Each column = paper column with a **clay spine rule** + live count in oversized serif. Recruit cards are **mini box-score chips**: serif surname, one ruled stat line, top-3 `GradeStamp`s, and a **clay "days-since-contact" aging bar** that darkens like a deadline. Drag a card → destination count flips on an **odometer roll**; drop into `OFFER EXTENDED` → clay wash + embossed `OFFER` stamp; drop into `COMMITTED` → **oxblood `COMMITTED` seal presses down** (stamp-press ease + ink-bleed) and Signals tickers the commit. **Build:** glass board over paper columns, dnd-kit, FLIP/shared-layout so the card morphs board-spine ↔ open-dossier, optimistic odometer counts.

### P0 — 3. The Command Center Cover *(coach team-ops; replaces four zero-cards + broken pulse boxes)*
The dashboard *is* a magazine cover. **One dominant hero:** this week's opponent as a serif cover line `vs COASTAL STATE — SUN 4:30` with the record ruled beneath. A masthead **contents strip:** three big serif KPI numerals on ruled lines (`ROSTER 14 · ON THE RECORD 0 · OPEN RISKS 0`) reading as a table of contents. CoachHelm's daily brief becomes a **signed editor's letter** ("From the desk of CoachHelm") in serif with a green rule — so **empty/error states look composed, not like yellow warning boxes.** Grafted from Dir 2: KPI Readouts settle on load and flash their rule green when a background sync lands a value; day-one emptiness reads as `STANDING BY — awaiting first pitch`, not broken zeros.

### P1 — 4. The Break Room *(pitch-movement + spray viz; the baseball-native thing golf can't do)*
The **one chalk-on-clay** moment. **Pitchers:** a Statcast-style break plot on a home-plate axis — each pitch type a cluster of **Traces** breaking release→plate; velo drives glow intensity; select two dates and the older shape ghosts behind so *added break* is visible as distance between strokes. Command grade as a corner `GradeStamp`. **Hitters:** same canvas flips to a **spray chart** — batted balls arrive as Traces landing with a soft impact bloom, colored by outcome, filterable by count/pitch/opponent; drag the season scrubber and the chart animates the season into being. Captions in mono, colorway green (in-zone/strength) → clay (chase/weakness). **Build:** SVG/Canvas over dark glass, `stroke-dashoffset` draw-on + rAF trail decay, ruled-stat-line tooltips, reduced-motion → static drawn chart.

### P1 — 5. The Stats Center / Radar-Gun Stat Wall
The wall of identical empty cards becomes a **record-book roster spread**: each player row anchored by a serif name plate + settling velo/AVG **Readout** in mono, positions as small-caps chips, a `HOT` sodium tick on a season best. Batting/Pitching/Both switch = a page-turn with the category label swapping like a broadcast graphic. Every figure via Number Flow so a dead page now recalculates in real time. **Build:** reuse `RuledStatLine` + `StatReadout` + `PositionChip`.

### P1 — 6. The Roster Spread *(Pressbox)*
Two-per-row editorial spread of ruled stat lines instead of avatar chips — same dossier stock as recruits but **stamps flip projection→production** (this-season lines + readiness flags). A returning player and a recruit are visibly the same species in different tenses.

### P2 — 7. The Player "Today" *(assignment framing)*
Framed as "today's assignment" — the daily contract set as a **signed commitment** with a green rule, so the player feels *authored*, not tracked. Dev-plan goals appear as target ticks on their Climb arc.

### P2 — 8. The Development "Climb" *(replaces "No development plan yet")*
Each tracked skill (exit velo, K-rate, whiff%, SG-style composite) is a **Trace filling an arc** across the season, faint "then" ghost at start, bright "now" head, single best day pinned in **sodium** as a PR marker that pulses once. Coach-assigned goals sit as target ticks — `assigned → progressing → hit` is one continuous visual.

### P2 — 9. The Scout Packet Tear-Sheet *(the exportable artifact)*
When a coach mints a packet or a player sets exposure to `Scout`, the passport reflows into a **print-perfect one-page tear-sheet** — masthead name, ruled measurables, spray/break infographic, one verified video still, footer dateline `ISSUED BY RINI UNIVERSITY BASEBALL · JUL ’26`. It animates like a page being pulled (paper-lift + crop-mark + wax-style Helm **seal** press) and exports to the *same* PDF layout — screen and artifact are one object. Exposure ribbon (`Staff · Player · Public · Scout`) sets who can break the seal; player-side, "Profile Completeness" becomes **"File Readiness: ready to send to scouts."**

### P3 — 10. Decision Room / Compare Overlay
Two players' 20-80 tool rails stacked on the same rule — green pulls right, clay pulls left — so a coach *sees* the louder tool before reading a digit; a mono sparkline of measurable trend under each tool. Agenda items are pulled dossiers with open questions.

---

## 7. Reusable component / pattern kit (the consistency engine)

Build these first; every surface above composes from them. Names are prescriptive.

| Component | Purpose | Key props / behavior |
|---|---|---|
| **`<RuledStatLine>`** | THE signature atom. Label (small-caps, hung left) + serif numeral sitting *on* a hairline baseline rule. | `label, value, unit, size='hero'|'row', verified?, ink='team'|'pursuit'`. Rule draws on mount; value uses `<StatReadout>`. Stacks fractally for slash lines `.341 / .420 / .611` and as column spines. |
| **`<StatReadout>`** | Any number that can change. | mono `tabular-nums`, Number Flow odometer, `flashOnChange` → green rule pulse, `pr?` → sodium once. |
| **`<GradeStamp>`** | 20-80 evaluation atom (recruiting). | Debossed rounded-square token, mono numeral, ring label (tool name), ramp color by value, ±1.5° rotation, `present` solid + `future` ghost outline, stamp-press animation. |
| **`<ToolRail>`** | 20-80 horizontal scale viz. | ticks 20–80, 50 marked `MLB AVG`, filled pip (present) + hollow pip (future) + ink connector; compare mode stacks a second athlete. |
| **`<Masthead>`** | Two-line editorial name block. | `given` (serif regular) + `SURNAME` (serif small-caps caps), optional dateline eyebrow, registration tick, scroll-shrink-to-byline. |
| **`<Eyebrow>`** | Small-caps dateline label. | `POSITION · CLASS · STATE` grammar, `tracking-[0.14em]`. |
| **`<PaperCard>` / `<GlassPanel>` / `<ClayCanvas>`** | The three surface families. | Paper = grain + hairline + registration tick; Glass = GolfHelm frosted; Clay = dark viz frame w/ chalk graticule. Enforced so nothing else invents a surface. |
| **`<Trace>`** | Viz stroke primitive. | Renders swing plane / pitch break / spray flight / climb arc / sprint line as one stroke language; weight + glow encode quality; `stroke-dashoffset` draw-on; reduced-motion → static. |
| **`<LaneShell>`** | The masthead + lane-switcher + ink context. | Provides `--active-ink` via context; sets green/clay for all children; handles coach-type→lane mapping + JUCO toggle. |
| **`<EditorsLetter>`** (empty/brief state) | Composed empty & error states. | Serif letter voice + green/clay rule + optional `STANDING BY` live dot. **No yellow warning boxes anywhere.** |
| **`<CommitSeal>` / `<PacketSeal>`** | Ceremony moments. | Oxblood emboss, stamp-press ease, ink-bleed, optional haptic-style pulse. |

**Empty-state doctrine (product-wide):** every zero/empty/error renders through `<EditorsLetter>` or a ghosted `<RuledStatLine>` — day-one always looks like "an unreleased first issue," never a broken CRM.

---

## 8. Motion / interaction principles (engineering contract)

- **One signature move per view.** Rules draw, then ink settles, then (if present) a Trace draws. Never all three competing.
- **Numbers are sacred** → always `<StatReadout>`, always `tabular-nums`, always odometer on change. Never spring a number.
- **Urgency is color, not chrome.** Clay aging bars / offer washes; never a red badge or toast for recruiting heat.
- **The dark canvas is quarantined** to `<ClayCanvas>` viz frames. A PR reviewer should reject `--clay` used as any page/sidebar/card background.
- **Drag has weight** (tilt toward drag, growing shadow, spring-settle) — the only place real elevation shadow is allowed.
- **`prefers-reduced-motion` is a first-class path**, not an afterthought: rules/traces render final, numbers set, PRs/commits show without pulse.
- **Performance:** GPU transform/opacity + SVG stroke only; 60fps cap; Traces batched. Follow the repo's framer-motion performance skill (memoized motion values, no layout thrash).

---

## 9. The three north-star WOW moments
*The whole product is judged against these. If a surface doesn't ladder up to one of them, it's not done.*

1. **The Passport that writes itself.** A recruit opens their page and sees their own name set as an editorial masthead with `ON THE RECORD` verified measurables in giant serif ink on ruled lines — and feels like a prospect worth committing to before a word is exchanged. Completeness isn't a bar; the file *fills in*.
2. **The Commit seal.** A coach drags a recruit into `COMMITTED` and an oxblood seal presses down with ink-bleed while the count rolls and Signals tickers the name — the emotional payoff of landing a kid, made physical.
3. **The cut to the Break Room.** From a cream editorial page, a pitcher's arsenal draws itself on a lit chalk-on-clay strike zone — Traces breaking, velo glowing, added break visible as new distance between strokes — the sport finally rendered as itself, something GolfHelm structurally cannot do.

**The bar:** a coach opens BaseballHelm and it doesn't look like software — it looks like the glossy season annual and front-office scouting file their program could never afford to print, except it's live, it's baseball to its bones, and it's theirs.
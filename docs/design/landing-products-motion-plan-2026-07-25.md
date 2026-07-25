# Landing + Products — motion & interaction plan (2026-07-25)

Scope: `/` (LandingView) and `/products` (ProductsLanding).
Stack (mandated): GSAP · ScrollTrigger · Lenis · SplitText · Flip.

Owner decisions taken before planning:

- **`/products` stays GolfHelm-deep.** No BaseballHelm branch. The centrepiece
  is **team management — "everything in one place"** — plus a **materially
  deeper CoachHelm chapter**. Bar: "creative, deep, architecturally premium".
- **Stat count is 85.** Fix the three sites that say 87 (`Hero.tsx:82`,
  `ProductsIntro.tsx:193`, `FinalCta.tsx:35`); the marquee already targets 85.

---

## 1. What the application does

Helm Sports Labs builds sport-specific operating systems for college programs.
Every product runs the same loop: **capture an event → turn it into honest math
→ rank it into evidence → resolve it into a decision.**

In GolfHelm that loop is literal. A player logs each stroke from their phone
mid-round (lie, distance, result, miss direction, putt break/slope). The round
closes into a large computed object — strokes gained is derived against a
Broadie/PGA-ShotLink expected-strokes table, `SG = E[strokes before] −
E[strokes after] − 1` (`src/lib/golf/strokes-gained.ts:5`), not an imported
handicap. CoachHelm then mines patterns across the season and **tests them for
causation** (temporal precedence, dose–response, confounder elimination —
`src/lib/coachhelm/v2/mining/causal-engine.ts`), producing a ranked,
source-cited, confidence-gated insight that becomes a development plan with a
real target and a practice block. Around that core sits the program: roster,
calendar with multi-person availability overlay, travel, five-day qualifying
with a cut line, tasks, messages, announcements, documents.

**The claim worth animating: nothing on screen is invented.** Penalty shots draw
a symbolic "+1" rather than a fabricated flight line, because the write path
never captured that distance (`HoleShotPath/geometry.ts:48-80`). A qualifier
player with zero rounds gets an em-dash, never a fake "E". There is no map
provider — the hole diagram is an honest synthetic reconstruction.

## 2. What each product does

| Product | Role | Primary user | Strongest differentiator |
|---|---|---|---|
| **GolfHelm** | The flagship vertical; the only product rendered on `/` and `/products` | College golf head coach (daily operating view) + a genuinely distinct player surface (logs shots on a phone) | Strokes gained computed from the player's own logged shots against a lie×distance baseline — not self-reported |
| **CoachHelm** | An intelligence **layer inside** GolfHelm ("Built-in CoachHelm AI"), never a separate SKU | Coach triaging a roster in one queue ranked by strokes at stake | Tests causation, not correlation — and never shows a conclusion without its receipts (source window, confidence, strokes at stake, sample size) |
| **BaseballHelm** | Second vertical, recruiting-first | Recruiting coordinator | Core artifact is a decision ledger, not a measurement. **Out of scope here** — ships at `/baseball` in its own Living Annual kit |
| **Lift Lab** | Cross-sport strength module at `/lifting` | Strength coach | Shares `organizations.id`; a supporting mention only |

## 3. Audit — current `/` (landing)

Order: Header → Hero → Thesis → DashboardReveal (pinned) → CoachHelm (dark) →
Performance → StatsShowcase → TeamSection (pinned) → FinalCTA → Footer.

- Every "product screenshot" is a **hand-built DOM/SVG recreation** on real
  Fairway tokens (`DashboardMock`, `CoachHelmPanel`, `TrackingCockpit`,
  `PlayerDetailCard`, `StatsMock`, `TeamMock`). Zero raster screenshots. The
  only real images: `hero-golf.jpg` + two logo marks.
- Motion is a bespoke non-GSAP system (`src/components/landing/motion.tsx`,
  394 lines): one shared rAF scroll loop, clip-path `Reveal` wipes, an on-enter
  `useSequence` stagger, `useParallax` drift+tilt, and two genuinely pinned
  scrub scenes (`DashboardReveal` perspective settle, `TeamSection`
  scatter-to-assembly).
- **Lenis is installed but not mounted on `/`.** Smooth scroll is off here.
- **Generic today:** `ThesisSection` (three lines, no visual, staggered wipe —
  the textbook SaaS thesis slab); `FinalCTASection` (dark band + two static
  concentric rings — the most common dark-CTA trope); `StatsShowcase` (the
  richest data on the site moved as one rigid slab on a `data-parallax="66"`
  tilt); the hero's 14px translateY fade-up spent on the most valuable frame.
- **Chronologically backwards:** the aggregate dashboard appears *before* raw
  shot capture and *before* the stats detail. That is why it reads as a section
  list rather than an argument.
- **Protect, don't rebuild:** `TeamSection`'s scatter-to-assembly (deterministic
  seeded start positions via a sin-based PRNG, not `Math.random`, so scrub is
  stable and SSR matches) — the one genuinely non-generic idea on the page.

## 4. Audit — current `/products`

Order: Hero → ProductsIntro → TeamManagement → LiveRound → StatsTicker →
CoachHelm → FinalCta. Strictly linear; no switcher, no tabs.

- `productsData.ts` is **not** a product registry — it is two 20-string arrays
  feeding the marquee. All product identity is hardcoded inline per section.
- All motion lives in `useProductsEffects.ts` (one `useEffect`, IO-driven,
  imperative DOM) + `products-landing.module.css` (keyframes). Four primitives
  read off `data-reveal`/`data-fx`: fade/rise reveal, count-up, SVG
  stroke-dashoffset draw, staggered list, width progress bar. Fire-once.
- **Generic today:** the `data-reveal` primitive (opacity 0→1 + translateY(24px),
  IO threshold 0.15) applied to nearly every block — this *is* the "generic
  fade-up" named in the brief; the infinite dual-direction stat marquee (46s
  left / 52s right) which brags about scale while saying nothing; the ambient
  `.scan` sweep and `.pulse` dot on the CoachHelm cards ("AI is thinking" clip
  art unconnected to real data); a centred logo + h1 + p + two-buttons hero.
- **Richest un-choreographed asset on either page:** the `LiveRound` phone —
  ~6 distinct real UI modules revealed as a single block with zero internal
  sequencing.
- Eight feature tiles all link to `#getdemo` — a feature grid impersonating
  navigation.

## 5. Creative direction

### 5.1 Motion language — "ball flight and settle"

Everything does one of four things: it **travels** a path, it **draws**, it
**grows from a baseline**, or it **settles**. Nothing bounces, scales up from
zero, spins, or floats without reason. This is the product's own physics, and
the codebase already wrote the rule down twice: *"Cinematic ease-out only — NO
bouncy springs"* (`living-annual/motion.ts:7`) and *"Hover lift: 2px translateY
— never scale. Scale on a card looks cheap; lift looks architectural."*
(`coachhelm/v3/motion.ts:29`).

**The house curve.** Helm already has one signature easing used by the golf app,
the baseball app and both marketing pages: `cubic-bezier(0.16, 1, 0.3, 1)` —
`--fw-ease-glide` (`design-tokens.css:193`), byte-identical to `EASE_CINEMATIC`
(`coachhelm/v3/motion.ts:41`), `EASE_GLIDE` (`living-annual/motion.ts:24`),
`--ease-cinematic` (`tokens.css:273`) and `LANDING_EASE` (`motion.tsx:40`).
Five files, five subsystems, one curve. Building on it is what will make this
read as Helm rather than as a template.

Two families, never mixed:

- **Arrival** (anything the page brings you): `cubic-bezier(0.16, 1, 0.3, 1)`.
- **Touch** (anything a hand causes — hover, tap, chip): `--fw-ease-emph:
  cubic-bezier(0.32, 0.72, 0, 1)`.
- `--fw-ease-soft: cubic-bezier(0.22, 0.61, 0.36, 1)` for hairlines/rules only.
- **Banned:** `--fw-ease-spring`, `--ease-bounce`, `--ease-spring`. Overshoot on
  marketing chrome is precisely what reads as template.

**Duration ladder.** Two ladders exist in-repo and agree only at 280ms.
`coachhelm/v3/motion.ts:50` — `{micro:0.12, short:0.28, medium:0.44, long:0.68}`
under the hard rule "four tiers, no in-between values" — is adopted as the
single marketing source of truth, because it is written as an explicit contract
and it is what the actually-animated product surfaces already run on.
`--fw-dur-*` (180/280/380/520) stays for CSS-level chrome.

**Stagger:** `0.07` (70ms — "a wave, not a stutter"). Wide rows compress and cap
exactly as `Filmstrip` does (`0.02` step, cap 12) to stay inside the <600ms
entrance budget.

**Path-draw budget:** a full shot sequence draws in **≤ ~900ms regardless of
stroke count** — `DRAW_BASE_DELAY 0.05`, `DRAW_BUDGET 0.85`, per-segment
120–180ms scaled by real yardage against a 280yd reference, all compressing
proportionally (`HoleShotPath/index.tsx:494-529`). Scroll simply replaces the
clock.

**Depth model — three planes, only three.**

1. **Canvas** — photograph, corridor ground plane. Slowest; never rotates.
2. **Instrument** — glass-bezelled product surfaces. Pin and settle.
   Perspective allowed *here and only here*, and **exactly one settle each** —
   never a continuous tilt tracking the cursor or scrollbar (the tell of a
   template parallax kit).
3. **Datum** — shot dot, SG bar, roster row, signal row, filmstrip column.
   These travel, draw and stagger; the only things allowed to move quickly.

### 5.2 The one law that also solves the a11y trap

> **A datum never fades.** It draws, grows from a baseline, or travels along a
> path. Only decorative elements may use opacity.

`e2e/accessibility.spec.ts` axe-audits `/` at WCAG 2.1 AA + 2.2 AA with **zero
tolerance**, and axe samples computed styles while scrolling nodes into view —
so fractionally-opaque text reads as a false contrast failure. That is exactly
why the current system animates clip-path rather than opacity
(`motion.tsx:17-20`). Adopting the product's native verbs dissolves the problem:
`pathLength` 0→1, width-grow and transform-travel are **full opacity at every
frame**. Text keeps the clip-wipe. **Per-character opacity fades of the SplitText
variety are banned** — SplitText is used for line/word *masked* reveals
(translate under `overflow:hidden`), never opacity ramps on glyphs.

---

## 6. Section plan — `/` (landing)

**Narrative: "One shot becomes a practice block."** One logged stroke followed
through the machine in the order the product actually processes it — capture →
math → cause → decision → program — never cutting away. **Structural theme: THE
CORRIDOR.** The hole runs down the page as one continuous vertical axis; the
camera moves down one ground plane and product surfaces rise into it.

Reordered from today so the chain is chronological (capture now precedes
aggregate).

### L1 · Hero — "establish the axis"

- **Purpose:** promise + establish the motion language for everything below.
- **Focal point:** the headline, then the horizon line of the photograph.
- **Concept:** the photograph is the *ground plane*, not decoration. Headline
  arrives as a **SplitText line-mask reveal** (lines translate up under
  `overflow:hidden` — no glyph opacity). As scroll begins, a single shot dot
  leaves the horizon and a flight arc **draws** down-page; the arc's tail
  becomes the page's spine and persists as a thin corridor rule down the entire
  document.
- **Why it fits:** the product's signature visual is a ball travelling a
  corridor. The hero stops being a stock "fade-up + photo" and becomes the tee.
- **Transition out:** the arc does not stop — it continues into L2.
- **Tech:** `SplitText` (lines, masked) + `gsap.timeline()` on load;
  `ScrollTrigger` scrub for the arc draw (`drawSVG`-style via `strokeDasharray`,
  no paid plugin).
- **Tablet/mobile:** arc shortens to a quarter-screen gesture; the persistent
  spine rule is dropped below `md` (it competes with the 390px gutter).
- **Reduced motion:** headline renders settled, arc renders fully drawn.

### L2 · Thesis — "the shot becomes a datum" (replaces the text slab)

- **Purpose:** state the thesis. Today: three lines, no visual.
- **Concept:** the arc's landing dot **detaches** from the hole and becomes the
  first datum — a single mono numeral. The thesis copy is set as the *caption to
  that transformation*, not as a standalone slab.
- **Why it fits:** it is the literal moment the product converts an event into
  data — the page's whole argument, shown once, small.
- **Tech:** `Flip` — the landing dot is genuinely reparented from the hero's SVG
  into the thesis block, so the position change is spatially continuous rather
  than two separate elements crossfading. **Flip use #1.**
- **Mobile:** the dot travels a shorter vertical, no horizontal component.
- **Reduced motion:** dot is already in its thesis position.

### L3 · Capture — "every shot, in its place" (TrackingCockpit)

- **Purpose:** show raw capture — the thing every other section depends on.
- **Focal point:** the hole corridor.
- **Concept:** the corridor **bleeds edge-to-edge with no bezel** (framing varies
  by chapter; the glass material stays constant). Scroll scrubs the real
  draw-in: each segment's `pathLength` 0→1 on the yardage-scaled schedule, a
  ball marker riding the curve, a landing pulse the instant each segment
  finishes, numbered dots wearing lie-coloured halo rings. The result chips
  (Fairway/Rough/Sand/**Green**/Hole) resolve as the ball lands; proximity
  counts to 18 ft.
- **Why it fits:** this is the single largest delta between what Helm does and
  what its homepage shows — the product animates a ball down a hole; the landing
  page currently renders it as one static `<path>` with dots on a fixed timer.
- **Transition out:** the corridor's walls converge into the SG zero baseline.
- **Tech:** `ScrollTrigger` pinned + `scrub: 1`, one `gsap.timeline()`.
- **Mobile:** pin duration halved; the corridor rotates to a vertical portrait
  aspect (as the app itself does on phone); ball marker retained, hazards
  dropped.
- **Reduced motion:** full path drawn, all dots placed, no pin.

### L4 · Math — "the tornado grows from zero"

- **Purpose:** prove the math is real and derived, not asserted.
- **Concept:** the converged corridor walls *become* the dashed zero baseline.
  Four category bars **grow from that baseline** — right/green gained,
  left/amber lost — with `Putting −0.6` flagged as the leak. The signed hero
  numeral counts as the bars grow.
- **Why it fits:** growth from a fixed baseline is legible at any scrub
  position, perfectly reversible, and full-opacity throughout — the ideal scrub
  subject. It is also the literal picture of the product's core equation, so the
  motion *is* the explanation.
- **Tech:** `ScrollTrigger` scrub on a `scaleX` timeline (transform-only).
- **Mobile:** bars stack; scrub becomes a shorter triggered timeline.
- **Reduced motion:** bars at final width.

### L5 · Cause — "bars resolve into a sentence" (CoachHelm dark band)

- **Purpose:** the differentiator — evidence, not vibes.
- **Concept:** the flagged `Putting` bar **flips** out of the chart and becomes
  the subject line of the insight card (**Flip use #2** — a shared element moving
  between two sections, which is exactly the continuity Flip is for). The insight
  sentence arrives via **SplitText word reveal**, then the receipts land in
  order: `SOURCE · LAST 10 ROUNDS`, `CONFIDENCE · HIGH`, `n=214`, strokes at
  stake. Nothing appears before its evidence.
- **Why it fits:** CoachHelm's actual guarantee is that no conclusion ships
  without its receipts. The animation enforces that order.
- **Tech:** `Flip.fit` + `SplitText` (words, masked) + staggered timeline.
- **Mobile:** Flip runs on a shorter path; chips wrap to two rows.
- **Reduced motion:** card composed, chips present, no flight.

### L6 · Program — "the week assembles in the order a week resolves"

- **Purpose:** everything lands in the program.
- **Concept:** **keep** the existing pinned scatter-to-assembly — it is the best
  idea on the site and dramatises its own headline ("No more group chats"). The
  upgrade is **meaning, not more motion**: today seven pieces fly in from random
  angles in a random stagger. Make the order deterministic and semantic —
  roster (who you have) → this week (what's scheduled) → qualifier (who earned
  it) → travel (who's going) → development → announcements. The recommendation
  from L5 arrives as the practice block on the week card.
- **Why it fits:** the pieces arrive in the sequence a coach's week actually
  resolves. The flourish becomes an argument.
- **Tech:** port the existing deterministic seeded scatter to `ScrollTrigger`
  scrub; keep the sin-based PRNG so SSR matches and scrub stays stable.
- **Mobile:** assembly distance reduced ~60%; pin shortened to 120vh.
- **Reduced motion:** board fully assembled.

### L7 · Final CTA — "the pin"

- **Purpose:** convert.
- **Concept:** replace the two static concentric rings (the dark-CTA trope) with
  the **corridor's terminal point** — the flag. The spine rule that has run the
  whole page terminates here; the flag is the only ornament.
- **Tech:** short triggered timeline; no scrub, no pin — CTAs must be instantly
  reachable.
- **Reduced motion:** static composition.

---

## 7. Section plan — `/products`

**Narrative: "The whole program, in one system."** Per owner steer, the
centrepiece is team management / everything-in-one-place, and CoachHelm gets a
materially deeper chapter. Golf only.

### P1 · Hero — "the program, scattered" (replaces the template hero)

- **Concept:** the eight program surfaces (roster, calendar, travel, qualifiers,
  tasks, messages, announcements, documents) exist as **separate, scattered
  tool cards** on the canvas — the fragmented-tools problem, stated visually
  instead of in a paragraph. Headline arrives as a SplitText line-mask.
- **Transition:** scrolling begins pulling them toward a common centre.
- **Tech:** `gsap.timeline()` on load; `ScrollTrigger` hands off to P2.
- **Mobile:** four cards instead of eight; smaller scatter radius.

### P2 · **The dock** — team management centrepiece (the showstopper)

- **Purpose:** the eye-catching moment the owner asked for — everything in one
  place.
- **Concept:** a **pinned command-centre stage**. The scattered tool cards
  **dock**: they genuinely reparent from a loose constellation into a tight,
  aligned dashboard grid, each snapping to its real position in the product's
  layout. Then the stage keeps running: the docked board *operates* — the
  calendar overlay stacks three players' busy chips until one open hour
  survives; the qualifier leaderboard's cut line draws and a mover ticks up;
  travel flips to Confirmed.
- **Why it fits:** "everything in one place" is a *layout* claim, so the
  animation must be a *layout* transition — which is precisely what Flip is
  for. **Flip use #3, and the primary one:** scattered → docked is a real
  first/last layout change, spatially continuous, impossible to fake
  convincingly with transforms alone.
- **Tech:** `Flip.from(state, {...})` driven by a pinned `ScrollTrigger`;
  sub-timelines for the operating beats.
- **Tablet/mobile:** the dock still happens but into a 2-column grid; the
  "operating" beats reduce to the calendar overlay only; pin ≤ 150vh.
- **Reduced motion:** board renders docked and operating-state-final; no pin.

### P3 · Capture — "logged tap by tap" (LiveRound phone)

- **Concept:** the richest un-choreographed mock on the site becomes the
  **tap-by-tap capture sequence**: hole nav → shot chip → approach card →
  result grid (Green highlights) → distance ladder → `Next Shot →`. Discrete
  and rhythmic, because taps are discrete — the only section whose physics is
  staccato rather than continuous.
- **Why it fits:** it is the most honest "how it works", and the shot logged
  here is the shot the stats derive from next.
- **Tech:** `ScrollTrigger` scrub with snapped steps; `--fw-ease-emph` (touch
  family) for every simulated tap.
- **Mobile:** the phone is already portrait — becomes near-fullbleed; steps
  advance on a shorter scrub.

### P4 · Derivation — "one round → 85 stats"

- **Concept:** replace the infinite dual-direction marquee (scale-bragging that
  says nothing) with **derivation**: the round from P3 visibly *produces* its
  stats — a counter climbing to **85** while stat names precipitate out of the
  logged shots into categories. The number is earned on screen.
- **Why it fits:** the page's whole argument is that the numbers are real; a
  marquee asserts, a derivation proves.
- **Tech:** scrubbed counter + staggered precipitation; `STATS_PER_ROUND = 85`
  as a single exported constant wired to every site that prints it.
- **Mobile:** categories collapse to three columns; counter retained.
- **Reduced motion:** counter shows 85 immediately.

### P5 · **CoachHelm, deep** — the evidence cascade (multi-beat, pinned)

- **Purpose:** the owner asked for a materially deeper CoachHelm area. This is
  the chapter that earns "deep".
- **Concept:** a pinned stage that runs the **real pipeline**, beat by beat,
  each beat a distinct visual verb:
  1. **Raw signals** — shot-ledger rows stream in.
  2. **Pattern mining** — rows cluster and a named pattern resolves
     (`lag-distance-3putt`, one of ten real composite patterns).
  3. **Causal test** — candidate explanations are struck through as confounders
     are eliminated; one survives. *This is the differentiator and nothing on
     either page depicts it today.*
  4. **Prediction** — a point estimate with a confidence interval draws.
  5. **Composition** — the insight sentence assembles (SplitText), receipts land.
  6. **Development plan** — promoted to a focus area with a target and a trend
     line that draws.
  7. **The queue drains** — Triage Desk rows change state (New → Ack'd →
     Resolved), the 68% month bar grows, `+1.8 team SG` counts up.
- **Why it fits:** the motion verb here is *state change*, not appearance — a
  queue that resolves is a different gesture from a list that fades up, and it
  depicts the product's actual job (triage) rather than its inventory. Beat 3
  is the only place any Helm surface has ever shown causation being tested.
- **Tech:** one long pinned `ScrollTrigger` timeline with labelled beats;
  `SplitText` at beat 5 only.
- **Tablet/mobile:** beats 1–2 merge and 4 is dropped; five beats, pin ≤ 200vh,
  each beat snapped so a thumb-flick never lands mid-beat.
- **Reduced motion:** all seven beats rendered as a static vertical sequence —
  the information survives in full, only the choreography goes.

### P6 · Capability floor — "and the rest of the program"

- **Concept:** demote the eight tiles-that-all-link-to-`#getdemo` from a fake
  navigation grid to a quiet, dense capability floor beneath the dock — the
  supporting cast, presented honestly as a list rather than as eight equal
  hero-weight cards.
- **Tech:** batched entrance only; no scrub. Supporting detail, not a concept.

### P7 · Final CTA

- Matches L7's terminal treatment so the two pages end in the same voice.

---

## 8. How the concepts were derived from the product

| Concept | Derived from |
|---|---|
| Ball travels a corridor; page *is* the corridor | `HoleShotPath` + `FairwayHoleHero` — the app already animates a ball down a hole on a yardage-scaled schedule |
| Draw budget ≤900ms regardless of stroke count | `DRAW_BUDGET_SEC = 0.85` (`HoleShotPath/index.tsx:494`) |
| Bars grow from a zero baseline | `StrokesGainedTornado` — diverging bars around a dashed `x=0`, the literal picture of `SG = E_before − E_after − 1` |
| Nothing appears before its evidence | CoachHelm hard-gates insights behind confidence + lifecycle state before they reach a screen |
| Causal test as strike-through elimination | `causal-engine.ts` — temporal precedence, dose–response, confounder elimination |
| Queue drains / rows change state | Triage Desk signal lifecycle (New / Ack'd / Resolved) |
| Ordered assembly = a coach's week | Roster → schedule → qualifier → travel → development → announcements |
| Scattered → docked | The actual product claim: one system instead of group chats + spreadsheets |
| Taps are staccato | `FairwayShotEntry` is a discrete decision sequence, not a continuous form |
| A datum never fades | The repo's own "never invent data" discipline + the axe contrast constraint |

## 9. Responsive strategy

`gsap.matchMedia()` with four contexts:

| Context | Query | Behaviour |
|---|---|---|
| Large desktop | `(min-width: 1440px)` | Full choreography, full pin durations |
| Standard desktop | `(min-width: 1024px)` | Full concepts, pins −20% |
| Tablet | `(min-width: 768px)` | Pins −40%; parallax removed; instrument settles kept |
| Mobile | `(max-width: 767px)` | Distances −60%; pins ≤150vh (≤200vh for P5); scrub steps snapped; no perspective; corridor goes portrait; CTAs never behind a pin |
| Reduced motion | `(prefers-reduced-motion: reduce)` | Lenis **disabled**; all scrubs removed; every timeline rendered at its end state; no pins |

Mobile is *designed*, not disabled — each concept keeps its meaning at reduced
amplitude.

## 10. Architecture

```
src/lib/motion/gsap/
  register.ts        # single registerPlugin() entry — ScrollTrigger, SplitText, Flip
  tokens.ts          # DURATION / EASE / STAGGER / DISTANCE / SCRUB — named constants
  useGsapContext.ts  # gsap.context() + useLayoutEffect scoping, StrictMode-safe
  useLenisScrollTrigger.ts # ONE Lenis instance driving gsap.ticker + ScrollTrigger
src/components/landing/scenes/*.ts   # one timeline per landing section
src/components/products/landing/scenes/*.ts
```

Rules: no one giant animation file; timelines live beside their component;
`gsap.context()` scoped to a component ref (never global selector strings);
every context reverted on unmount; `ScrollTrigger.getById()` guards against
duplicate triggers on dev remount.

**Two integration constraints found in the audit that shape this:**

1. `useSmoothScroll` is **shared with the golf dashboard**
   (`SmoothScrollMount`) and `/privacy`, `/terms`. The GSAP ticker rewire must
   therefore live in a **new marketing-only provider**, not by mutating the
   shared hook — otherwise every dashboard route inherits a GSAP-driven RAF.
2. `landing/motion.tsx` is **also consumed by `/about` and `/pricing`**. It
   stays. GSAP is additive for `/` and `/products`; `motion.tsx` is only
   *unwired from those two pages*, not deleted.

## 11. Verification plan

Load/refresh at top and mid-page · slow/fast/reverse scroll · trackpad + wheel +
touch · resize + orientation · route nav and back/forward · anchor links ·
repeated `/` ⇄ `/products` navigation · reduced motion · dev remount · lazy
images · font swap. Then: `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `e2e/accessibility.spec.ts` (axe on `/`, zero tolerance),
`e2e/mobile-viewports.spec.ts`, Lighthouse (CLS + a11y are hard errors).
Visual verification in a real browser at 1440 / 768 / 390, not compilation alone.

---

## Build log — defects found while implementing

Recorded because each was invisible in the rendered page and only appeared
under measurement, and every one of them is easy to reintroduce.

| # | Defect | How it surfaced | Fix |
|---|---|---|---|
| 1 | **The team board collapsed to zero height** whenever its tiles were scattered. Flip takes them out of grid flow, leaving the grid with no in-flow children — ~840px of page appearing and disappearing as the reader scrolled, and every ScrollTrigger anchored to that grid measuring against a zero-height box (the hop timeline computed `start 1435 / end 1768`, a range *ending above the board's own top edge*). | Probing `st.start`/`st.end` against the measured grid position. Nothing in the rendered page said so. | The scene reserves the board's docked height as `min-height` before the scatter, and releases it on teardown. |
| 2 | **Tiles lost their `grid-column` permanently.** `Flip.from(..., {absolute:true})` rewrites each tile's inline style and does not restore unrelated inline properties, so the 12-column board collapsed into ~49 implicit tracks with tiles between 125px and 520px wide. | Reading computed `grid-template-columns`: `38.6px ×7, 521px, 468px …`. | Column spans moved from inline styles to CSS classes, which inline-style rewriting cannot clear. |
| 3 | **`1fr` tracks overflowed their container** by ~450px, because `1fr` is `minmax(auto, 1fr)` and never shrinks below content min-width. | Same measurement as #2. | `repeat(12, minmax(0, 1fr))`. |
| 4 | **Wiring geometry measured the wrong layout.** Three approaches failed before one worked — see the long comment in `dockScene.ts`. The instructive one: stripping positional inline styles to measure and restoring them afterwards *corrupted the board*, because Flip had moved on in between and the restore wrote `left: 50%` onto a now-static tile. | Logging each measurement; one tile read docked while another read 542px out, alternating between refreshes. | Route against `offsetLeft`/`offsetTop` (layout box, immune to transforms), snapshot only when the board is provably at rest. |
| 5 | **Re-routing left paths in an incoherent draw state**, since `strokeDashoffset` is in the same units as a length that had just changed. A hop that should have been undrawn read as 77% drawn. | Probing `1 - dashoffset/length` at fixed scroll positions. | `invalidate()` + a forced render at the current progress. |
| 6 | **The accessibility audit was measuring animation frames.** /products reported 87 contrast failures, every one of them arithmetic on part-revealed text (`#d9d2c4` on `#f7efdf`). Scrolling to settle the page does not fix it either: a scrubbed timeline *rewinds* when you scroll back up, so there is no scroll position at which every scene is simultaneously settled. | Reading the failing colours — they were washed-out inks, not palette values. | Audit under `prefers-reduced-motion: reduce`, where every scene renders its end state at mount. Deterministic, and it doubles as proof the reduced-motion path preserves all information. |
| 7 | **Real AA failures, previously hidden behind the phantom ones.** Small white text on accent-600 (4.15–4.45:1, just under 4.5) across the phone mock, chips and badges; and two "de-emphasised" rows conveyed with a blanket `opacity` that drove their text to 2.2–3.2:1. | The reduced-motion audit, once it was deterministic. | Text-bearing accent fills moved to accent-700. Below-the-cut rows now earn de-emphasis from position and the absence of the accent wash — never from opacity. |

**Standing rule this produced:** de-emphasis is never an opacity multiplier on
text. Rank, position, and the absence of an accent already carry it, and a
multiplier is the one method that makes the content unreadable to the readers
least able to afford it.

## Pre-existing, NOT fixed

`/golf/login` fails the same contrast audit: the "Sign in" button is white on
`bg-primary-600` at 3.29:1. It is unrelated to this work (no golf auth file is
touched) and darkening the primary CTA is a brand decision spanning every auth
surface, so it is flagged rather than changed.

---

# Delivered

## Stack

Installed and in use, no substitutions: **GSAP 3.15**, **ScrollTrigger**,
**SplitText**, **Flip**, **Lenis**. Registered in exactly one place
(`src/lib/motion/gsap/register.ts`). Motion/Framer remains only where it
already was, on component-level interactions; it drives no scroll work.

Lenis runs on GSAP's ticker and feeds ScrollTrigger — one loop, not two
(`MarketingScrollProvider`). Under `prefers-reduced-motion` Lenis is never
instantiated at all.

## Scene inventory

| Page | Section | Scene | Motion verb, and what it depicts |
|---|---|---|---|
| / | Hero | `heroScene` | A shot **leaves the tee** — arc drawn, ball riding the path head. |
| / | Thesis | `thesisScene` | Three concerns **resolve into one line** (Flip, column → row). |
| / | Performance | `captureScene` | Shots **draw in the order they were hit**, on a yardage-scaled budget. |
| / | CoachHelm | `coachHelmScene` | SG bars **grow from the zero baseline**; leaks flag after the bars. |
| / | Stats showcase | `statsScene` | Verdict, then the product's **own ranking**, then cells in that rank order. |
| / | Team | TeamSection assembly | The board **assembles in the order a program is built**. |
| / | Close | `pinScene` | The same shot **arrives** — pin, cup, ball. Bookends the hero. |
| /products | Hero | `openingScene` | Masked type **arrives**; runs on load, not on scroll. |
| /products | Team board | `dockScene` | Loose tools **dock** (Flip), then the board **operates** — one qualifier decision propagating along the real dependency chain. |
| /products | Live round | `captureLoopScene` | The four taps that **log one shot**. |
| /products | 85 stats | `derivationScene` | The number is **derived**: 18 holes → 72 shots → six families → 85. |
| /products | CoachHelm | `coachHelmDeepScene` | Candidate causes are **eliminated one at a time**, each with the test it failed. |
| /products | Close | `closingScene` | Same arrival as the hero, scrubbed. |

## Anti-patterns removed

- Two infinite counter-scrolling stat marquees (`helmMqL` / `helmMqR`).
- The `.scan` "AI is thinking" sweep and the `.pulse` blinking dot.
- Four `.heroItem` keyframes on staggered `animation-delay`s.
- Three stacked `Reveal` fade-ups on the thesis.
- Two concentric hairline rings behind the closing CTA.
- Eight identical `<a href="#getdemo">` tiles posing as navigation.

## Laws this work established

1. **A datum never fades.** Text reveals by translating under a mask, never by
   ramping opacity. Fractional-opacity text is unreadable to the readers least
   able to afford it, and it is what makes contrast audits meaningless.
2. **De-emphasis is never an opacity multiplier.** Rank, position, a strike
   rule, and the absence of an accent all carry it without hurting legibility.
3. **Measuring must never move what is being measured.** Read layout
   (`offsetLeft`), never save-and-restore properties another library owns.
4. **Audit the settled state.** Scrubbed timelines rewind; there is no scroll
   position where a whole page is settled. Audit under reduced motion.

## Verification

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `eslint` (landing, products, motion, e2e) | clean, 0 warnings |
| `next build` | compiles |
| axe WCAG 2.1 AA + 2.2 AA — `/` and `/products` | pass (both newly deterministic) |
| Responsive × reduced-motion sweep — 5 viewports × 2 modes × 2 routes | 20/20 clean, no overflow, no console errors |
| Robustness — mid-page refresh, fast + reverse scroll, breakpoint resize, anchors, 3× route round-trip, back/forward | 8/8 clean |
| `mobile-viewports` public routes @ 320 / 390 / 430px | 12/12 pass |
| Reduced-motion content parity | every figure, readout and verdict present at full opacity |

Known and unchanged: `/golf/login`'s "Sign in" button fails contrast at 3.29:1
(pre-existing, unrelated, brand decision). `mobile-viewports` authenticated
projects fail on a missing `playwright/.auth/*.json` fixture — environment, not
code.

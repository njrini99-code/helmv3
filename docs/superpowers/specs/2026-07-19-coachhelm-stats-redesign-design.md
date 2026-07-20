# CoachHelm + Stats + Round Review Redesign — "Spine & Stage"

**Date:** 2026-07-19 · **Status:** Approved (mockup v2 sign-off by Nick) · **Branch:** `redesign/fairway-spine-stage`

Interactive mockup (visual source of truth for all measurements/colors):
`claude.ai/code/artifact/cbf56f0d-f756-4991-b1c7-7a5492df02ee` (also mirrored in the session scratchpad as `golfhelm-redesign-mockup.html`).

---

## 1. Problem

Seven surfaces (player CoachHelm ×4 tabs, coach CoachHelm ×8 routes, player Stats ×7 tabs,
Team Stats, Round Review) share the same failure modes:

- **Feeds of prose** where visuals should be (25+ `DetailGrid` text tables on Stats; 9 accordions
  + 3 AI-prose blocks on Round Review; accordion insight feeds on CoachHelm).
- **Summary and depth interleaved** in one long scroll — jump-link pill rows and closed-by-default
  accordions are the symptoms.
- **Huge sparse cards** (4 padded cards for 4 single numbers; roster cards with 8-cell micro-grids).
- **Cream-on-cream** with green only in chips; no structural green, no green data-ink.
- **Rich fetched data never rendered** (per-player category values, alert severity mix,
  worst-hole analysis, strengths/weaknesses, `shortGameAnalysis`, `scoringDistribution`).

## 2. Design decisions (locked)

| Decision | Choice |
|---|---|
| IA | Full restructure: one summary-first home per role per surface; old URLs redirect |
| Color | Green as **structure** (one deep-green spine/panel per page) + **data-ink** (all chart fills) + **bolder accents**; champagne canvas stays |
| Build strategy | New shared "module" components on top of existing Fairway tokens/charts; monoliths retired page-by-page |
| Phasing | Foundation → Stats → CoachHelm → Round Review |
| Orchestration | Fable orchestrates; Sonnet subagents build; verify gates between phases |

## 3. The three architectures

### 3.1 Spine + Stage (chassis for Stats and both CoachHelm homes)

```
┌──────────┬──────────────────────────────┐
│  SPINE   │  STAGE                        │
│ (green,  │  view: "home" = bento grid    │
│  sticky) │  view: "<area>" = drill panel │
└──────────┴──────────────────────────────┘
```

- **Spine** — the ONLY structural-green element on the page (gradient `accent-900 → accent-800`,
  border `accent-700`, radius 28, cream text). Sticky (`top-20`), never scrolls away. Contains,
  top to bottom: eyebrow · hero number (Fragment Mono) · one-sentence verdict ·
  `StandingTrack` (you/team/Tour on one rail) · ranked `PriorityList` (numbered — order IS rank) ·
  `SpineLedger` (label/value mono rows) · one pill CTA.
- **Stage** — everything right of the spine. Exactly one view visible at a time, driven by a URL
  search param (`?area=` on stats, `?view=` on CoachHelm homes). The home view is a **Bento**;
  every other view is a **DrillPanel**. Transition: 220ms opacity/translate (disabled under
  `prefers-reduced-motion`). Old tab URLs map onto these params via permanent redirects.
- **No tabs, no accordions, no jump-links** anywhere in the chassis.

### 3.2 Bento (stage home view)

- One continuous `Surface` — cells separated by **1px hairline seams** (grid `gap-px` over a
  border-colored background), NOT by per-card borders/shadows. 4-col grid, `minmax(118px,auto)` rows.
- **Cell size encodes importance**: the biggest leak gets `span2 row2` with a real chart;
  strengths/steady areas get 1×1 with headline + one sentence.
- Cell anatomy: uppercase label + status chip (the only status color on the cell) → mono headline
  number → mini-viz (`RailBars` with neutral Tour ticks / `DivergingBars`) → one plain-language
  sentence → bottom-right exit affordance. Whole cell is the click target (opens its drill view).

### 3.3 Matrix Board (Team Stats; reused for coach roster views)

- One board, not N cards. Sticky KPI header band (team scoring / team SG / trajectory `3▲ 2→ 1▼` /
  rounds), then a ranked grid: player identity · 5 **RankCells** (green-ramp: darker = stronger) ·
  composite **RingGauge** · trend `Sparkline` · one CoachHelm **SignalChip**.
- Row click expands an **inline detail band** (sunken background) inside the board — key numbers +
  one-sentence signal + links (Full stats / Fingerprint / Prescribe). No navigation for triage.
- Column headers sort; the old Rank-by/Format segmented controls are deleted (9/18 becomes a
  column toggle in the header, not page state).

### 3.4 Filmstrip (Round Review)

- The 18-hole strip IS the page spine: one column per hole, bar height ∝ |score−par|, color:
  par = warm-300 · birdie = accent-500 · bogey = warning · double+ = danger. Hover/tap/focus
  scrubs a detail line (`#7 · Par 4 · 7 (+3) — long-iron miss right, then 3-putt from 42 ft`).
- Left block: the green panel — score + to-par (mono), course/date, **grade as green-intensity
  dots** (5-dot scale replaces the A–F letter + red F badge), scoring mix line.
- Below: ONE narrative (single AI story, replaces all three prose surfaces) attached to the damage
  holes · strokes-lost `RailBars` · "what to do next" (practice priority + add-focus-area CTA) ·
  a single "Full breakdown" DrillPanel (front/back, putting bands, momentum, penalties — the old
  9 accordions' content, one door). Hole tap opens the shot-path detail for that hole (in place).

## 4. Foundation modules (Phase 1 deliverable)

New directory: `src/components/fairway/modules/` (client components; pure presentational;
all data via props; no Supabase imports). All styling via Fairway tokens — no new colors,
no `bg-white/N`, no `text-[Npx]`, banned-color lint stays green.

| Module | Props (contract sketch) | Notes |
|---|---|---|
| `Spine` | `eyebrow, hero:{value,unit}, verdict, track?, priorities?, ledger?, cta?` | composes the pieces below; owns green treatment |
| `StandingTrack` | `pct, benchmarks:[{label,pct,emphasis?}], labels:{you,…}` | one rail, pin + neutral tick marks |
| `PriorityList` | `items:[{rank,title,value}]` | numbered = ranked |
| `SpineLedger` | `rows:[{label,value}]` | mono values |
| `StageRouter` | `param, views:{key:ReactNode}, home` | reads/writes search param (`useSearchParams`/`router.replace`), renders one view, handles transition + reduced-motion |
| `Bento` / `BentoCell` | cell: `label, chip?, headline?, viz?, sentence?, span?, onOpen` | gapless seams; whole-cell button; a11y label |
| `RailBars` | `rows:[{label,pct,value,dim?,tick?}]` | tick = benchmark (neutral) |
| `DivergingBars` | `rows:[{label,delta,max}]` | over = warning, under = accent |
| `RampMatrix` | `cols, rows:[{label,cells:[{value,n?}]}], thresholds` | green-ramp cells (accent-100/300/500/700 + sunken zero) with legend |
| `TickerStrip` | `items:[{label,value,emphasis?}]` | last-N rounds mini columns |
| `RingGauge` | `value(0-100), size?` | SVG stroke ring, accent-500 |
| `SignalChip` | `tone:'hot'│'watch'│'quiet', children` | the one status color per row/cell |
| `RankCell` | `rank, of` | ramp background by rank position |
| `MatrixBoard` (+`MatrixRow`,`MatrixExpand`) | header cells, rows, controlled expand | inline expand band |
| `Filmstrip` | `holes:[{n,par,score,note?}], onScrub` | button columns, keyboard focusable |
| `GradeDots` | `score(0-5), label` | green-intensity grade |
| `RxCard` | `title, children` | accent-50 prescription inset |
| `DrillPanel` | `title, back:{label,onBack}, chip?, children` | stage drill chrome (back chip + title row) |

Sizing rules: cell padding 16–18px; KPI band cells 14–16px; mono numerals get
`font-variant-numeric: tabular-nums`; card radius 20, drill/spine radius 28.

## 5. Per-surface IA + routing

### 5.1 Player Stats — `/golf/dashboard/stats` (Phase 2)

- **Spine:** SG total (or scoring avg fallback when SG unavailable) · verdict sentence (reuse
  SgVerdict synthesis) · StandingTrack vs team/Tour · top-3 priorities (derived from worst
  standing gaps) · ledger (rounds/FW/GIR/putts) · CTA "Ask CoachHelm".
- **Stage home bento:** Putting (2×2 when it's the biggest leak — sizing chosen by worst SG
  category at render), Off the tee, Approach, Short game, Scoring (diverging), Standing
  best/worst (2×1), Last-10 ticker (2×1).
- **Drill views (`?area=`):** `putting` (RampMatrix by break×distance + break bars + Rx + cost
  line + LeakMap), `driving` (spray chart + miss bars + by-club), `approach` (GIR bands +
  LeakMap proximity), `short-game`, `scoring` (par splits + streaks/bests), `standing` (all
  metrics by category — the old Detailed Standings, promoted), `rounds` (last-10 list).
- **Deduping:** putting heatmap lives ONLY in `?area=putting`; 30d-vs-prev deltas live ONLY in
  the spine ledger. The `Analysis` catch-all tab dies.
- **Redirects:** `?tab=driving→?area=driving`, `?tab=analysis→?area=standing`, others 1:1
  (server-side mapping in the page; old param accepted forever).
- **Data:** existing `getDetailedStats`, `getTrendAnalysis`, `getPlayerStandingRows`,
  `getPlayerLeakMaps`, `getSprayChartData`, plus **newly surfaced** `getPlayerStrengthsWeaknesses`
  and `getWorstHoleAnalysis` (already implemented in `stats-data.ts`, currently uncalled).
- Coach-viewing-teammate mode is preserved (same page, `playerId` prop path).

### 5.2 Team Stats — `/golf/dashboard/stats/team` (Phase 2)

- KPI band (team scoring, team SG, trajectory counts, rounds-30d) → MatrixBoard (all roster).
- RankCells from the per-player standing map (already fetched, currently dropped); composite ring
  from intelligence composite; SignalChip from `topInsightPriority`/`insightCount`
  (already fetched, currently dropped). Inline expand = worst metric, SG putt, slump length,
  last round + links.
- CSV export demoted to an icon button. Cold-start: board renders with `quiet` chips and
  "N rounds to trend" copy — charts never block the roster.

### 5.3 Player CoachHelm — `/golf/dashboard/coachhelm` (Phase 3)

- **Spine:** composite/prediction hero (predicted score + confidence) · verdict · StandingTrack ·
  priorities = active focus areas (top 3) · ledger (rounds analyzed, FW, GIR, putts) ·
  CTA "Log a round" / "Ask CoachHelm".
- **Stage home bento:** Top insight (2×2, evidence viz + one sentence, helpful/dismiss) ·
  Focus areas cell · Game profile cell (mini `GenomeRadar` teaser) · Standing best/worst cell ·
  Trend cell · Themes cell (when flag on).
- **Drill views (`?view=`):** `development` (goals + causal why + focus areas — absorbs
  `/my-development`), `profile` (genome radar + dimensions — absorbs `/my-game-profile`),
  `standing` (absorbs `/my-standing`), `insights` (full feed), `deep-dive` (shot analysis + what-if).
- **Redirects:** `/my-development → /coachhelm?view=development`, `/my-game-profile →
  /coachhelm?view=profile`, `/my-standing → /coachhelm?view=standing` (permanent shims, same
  pattern as `/my-insights`; surface-registry entries marked `legacy`).

### 5.4 Coach CoachHelm — `/golf/dashboard/intelligence` (Phase 3)

- **Spine:** team composite + health · directive verdict ("Work on this first") · trajectory ·
  priorities = top 3 flagged players · ledger (players, attention count, last analyzed) ·
  CTA "Scan team".
- **Stage home bento:** Weakest category (2×2 with SG-by-category ribbon + evidence) ·
  Roster×category heat cell (mini MatrixBoard teaser → opens Team board) · Signals summary cell
  (severity 3-segment bar from full `getAlertCounts` payload) · Effectiveness teaser cell
  (accuracy readout) · Ask cell.
- **Drill views (`?view=`):** `signals` (the unified Alerts/Insights/Patterns workspace —
  ONE view with saved-filter chips; `FairwayCoachHelmSignals` consolidated), `players` (roster
  MatrixBoard + focus areas), `effectiveness` (cockpit content), plus per-player deep-dive
  remains its own route (`/players/[id]/game`).
- **Redirects:** `/alerts → /intelligence?view=signals&filter=alerts`, `/insights → …=insights`,
  `/patterns → …=patterns` (registry entries flip to `legacy`; rail shows ONE CoachHelm entry).
  `/analytics/coachhelm → /intelligence?view=effectiveness`. `/development →
  /intelligence?view=players`. Ask/chat route unchanged.

### 5.5 Round Review — `/golf/dashboard/rounds/[id]/review` (Phase 4)

- Filmstrip architecture per §3.4. Data: existing `RoundReviewContent` DTO + V2 review; surface
  `scoringDistribution` (mix line) and `shortGameAnalysis` (in Full breakdown) — both currently
  computed-but-hidden. Exactly one AI narrative (prefer V2; fall back to V1 summary; the separate
  LLM opener card is deleted). Share-with-coach + promote-to-focus-area CTAs kept.

## 6. States, a11y, motion

- **Empty/cold-start:** every module accepts explicit empty props; bento cells render honest
  "N more rounds" copy inline (no full-page empty takeover; spine always renders).
- **A11y:** drill/expand triggers are `<button>` with `aria-expanded`/labels; filmstrip columns
  focusable with keyboard scrub; ramp cells carry text values (never color-only); contrast per
  token doc (text-tertiary already AA-tuned).
- **Motion:** stage swap 220ms; cell hover tint + 2px lift; all gated on `prefers-reduced-motion`.
  framer-motion only where already imported; CSS transitions preferred.

## 7. Testing & quality gates

- Unit (vitest): param mapping (tab→area redirects), rank→ramp mapping, grade-dots scoring,
  filmstrip score→height/color, StandingTrack pct clamping.
- Every phase gate: `npm run typecheck` + `npm run lint` + `npm test` green before the next
  phase starts; `npm run build` before PR.
- Reviews: code-reviewer agent on each phase diff; ui-polish-reviewer on the final diff.
- CI: PR into `main` via the normal review gate (CodeRabbit/Greptile).

## 8. Non-goals (this project)

- No engine/data-pipeline changes (SG backfill, putting_tendencies writes) — UI consumes what
  exists; newly-surfaced actions are existing code.
- No baseball surfaces; no Calendar/Roster/Messages restyle.
- Legacy `.glass-standard` cleanup outside the seven surfaces.
- Claude Design project sync happens after code lands (modules pushed as cards).

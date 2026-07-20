# Spine & Stage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild GolfHelm's Stats (player + team), CoachHelm homes (player + coach), and Round Review on the approved Spine & Stage architecture with a shared green-forward module kit.

**Architecture:** A new presentational module kit (`src/components/fairway/modules/`) implements the four approved patterns — spine+stage, gapless bento, matrix board, filmstrip — on existing Fairway tokens. Pages are rebuilt to compose these modules and existing chart primitives; legacy tab routes become permanent redirects mapped onto stage URL params.

**Tech Stack:** Next.js 16 App Router · TypeScript strict · Tailwind + Fairway tokens (`src/styles/design-tokens.css`) · existing `src/components/fairway/*` primitives · Vitest.

**Authoritative references (read before any task):**
- Spec: `docs/superpowers/specs/2026-07-19-coachhelm-stats-redesign-design.md`
- Visual source of truth: `docs/design/spine-stage-mockup.html` (approved interactive mockup — exact colors, spacing, ramps, cell anatomy; open it and copy its measurements)
- Token reference: `src/styles/design-tokens.css` (`--fw-*`)

## Global Constraints

- Types import from `@/lib/types` only; never `@/types/*`.
- Tables always sport-prefixed (`golf_*`); pages consume EXISTING server actions only — no schema or engine changes.
- Interactive components start with `'use client'`; module kit is client, presentational, props-only — **no Supabase imports inside `modules/`**.
- Lint hard rules: no `bg-white/N` outside `src/components/ui`, no `text-[Npx]`, no `emerald-*`/raw `green-*`/`helm-green-*`/`#DC2626` (use `--fw-*` tokens / existing tailwind `primary-*`, `accent-*`, `warm-*`, `cream-*` utilities as the surrounding fairway components already do — copy the idiom from `src/components/fairway/surfaces/Surface.tsx` and `charts/`).
- No `any`, no `console.log`.
- Numerals: Fragment Mono via the existing `--font-fairway-mono` / fairway mono utility (see how `Readout`/`Numeric` do it) + `tabular-nums`.
- Radii: cards 20px, spine/drills/sheets 28px. Cell padding 16–18px. One structural-green element per page maximum.
- Motion: CSS transitions ≤220ms, always gated by `prefers-reduced-motion` (kit handles it centrally).
- Accessibility: every click target a real `<button>`/link with a label; ramp/heat cells always show a text value; `aria-expanded` on expanders.
- Phase gates: `npm run typecheck && npm run lint && npm test` green before the next phase; `npm run build` before PR.
- Commit per task on branch `redesign/fairway-spine-stage`; never stage unrelated pre-existing modified files (`.claude/settings.json`, CRM files).

---

## File Structure (locked)

```
src/components/fairway/modules/
├── types.ts            # ALL public prop contracts (Task 1 — verbatim below)
├── logic.ts            # pure helpers (ramps, grade, filmstrip, param maps) — unit-tested
├── index.ts            # barrel
├── Spine.tsx           # + StandingTrack.tsx PriorityList.tsx SpineLedger.tsx
├── StageRouter.tsx     # + DrillPanel.tsx
├── Bento.tsx           # + BentoCell.tsx
├── RailBars.tsx  DivergingBars.tsx  RampMatrix.tsx  TickerStrip.tsx
├── RingGauge.tsx SignalChip.tsx  RankCell.tsx  GradeDots.tsx  RxCard.tsx
├── MatrixBoard.tsx     # + MatrixRow / MatrixExpand in same file (one board unit)
├── Filmstrip.tsx
└── __tests__/logic.test.ts

src/components/golf/stats/spine-stage/     # Task 6 (player stats composition + drill views)
src/components/golf/stats/team-board/      # Task 7
src/components/golf/coachhelm/home/        # Task 8 (player) & Task 9 (coach) compositions
Rebuilt pages: stats/page.tsx, stats/team/page.tsx, coachhelm/page.tsx,
intelligence/page.tsx, rounds/[id]/review/page.tsx
Redirect shims: my-development, my-game-profile, my-standing, alerts, insights,
patterns, analytics/coachhelm, development page.tsx files
Shared updates: src/lib/golf/surface-registry.ts, CoachHelmSubNav, CommandPalette,
nav-registry (Tasks 8–9 only, sequential)
```

---

### Task 1: Module contracts (`types.ts` + `logic.ts` + tests + barrel)

**Files:** Create `src/components/fairway/modules/types.ts`, `logic.ts`, `index.ts`, `__tests__/logic.test.ts`

**Interfaces — Produces (verbatim, all later tasks import these):**

```ts
// types.ts — public contracts for the Spine & Stage module kit
import type { ReactNode } from 'react';

export interface StandingTrackProps {
  /** 0–100 position of the subject pin */
  pct: number;
  benchmarks: { label: string; pct: number; emphasis?: boolean }[];
  subjectLabel: string;          // "You" | "Team"
}

export interface PriorityItem { rank: number; title: string; value: string }

export interface SpineProps {
  eyebrow: string;
  hero: { value: string; unit?: string };
  verdict: string;
  track?: StandingTrackProps;
  priorities?: PriorityItem[];
  ledger?: { label: string; value: string }[];
  cta?: { label: string; onClick?: () => void; href?: string };
  children?: ReactNode;          // escape hatch for surface-specific rows
}

export interface StageView { key: string; node: ReactNode }
export interface StageRouterProps {
  /** search param name, e.g. "area" (stats) or "view" (coachhelm) */
  param: string;
  homeKey: string;               // key rendered when param is absent/unknown
  views: StageView[];
}

export interface DrillPanelProps {
  title: string;
  backLabel: string;             // e.g. "All areas"
  onBack: () => void;
  chip?: ReactNode;
  children: ReactNode;
}

export type CellChipTone = 'leak' | 'strength' | 'neutral';
export interface BentoCellProps {
  label: string;
  chip?: { tone: CellChipTone; text: string };
  headline?: { value: string; unit?: string };
  sentence?: string;
  span?: 1 | 2;                  // columns
  rows?: 1 | 2;
  exitLabel?: string;            // defaults to "→"
  onOpen?: () => void;
  children?: ReactNode;          // mini-viz slot
}

export interface RailBarRow { label: string; pct: number; value: string; dim?: boolean; tickPct?: number }
export interface RailBarsProps { rows: RailBarRow[]; labelWidth?: number }

export interface DivergingRow { label: string; delta: number; display: string }
export interface DivergingBarsProps { rows: DivergingRow[]; max: number }

export interface RampCell { value: string; n?: string; band: 0 | 1 | 2 | 3 | 4 }
export interface RampMatrixProps {
  cols: string[];
  rows: { label: string; cells: RampCell[] }[];
  legend?: { band: 1 | 2 | 3 | 4; label: string }[];
}

export interface TickerItem { label: string; heightPct: number; emphasis?: boolean }
export interface TickerStripProps { items: TickerItem[] }

export interface RingGaugeProps { value: number; size?: number }   // value 0–100
export type SignalTone = 'hot' | 'watch' | 'quiet';
export interface SignalChipProps { tone: SignalTone; children: ReactNode }
export interface RankCellProps { rank: number; of: number }
export interface GradeDotsProps { score: 0 | 1 | 2 | 3 | 4 | 5; label: string }
export interface RxCardProps { title: string; children: ReactNode }

export interface MatrixColumn { key: string; label: string; align?: 'left' | 'center' }
export interface MatrixBoardProps {
  kpis: { label: string; value: ReactNode }[];
  columns: MatrixColumn[];
  rows: MatrixBoardRow[];
}
export interface MatrixBoardRow {
  id: string;
  cells: ReactNode[];            // rendered per column, same order as columns
  expand?: ReactNode;            // inline detail band content
  ariaLabel: string;
}

export interface FilmstripHole { n: number; par: number; score: number; note?: string }
export interface FilmstripProps {
  holes: FilmstripHole[];
  activeHole?: number;
  onScrub?: (hole: FilmstripHole) => void;
}
```

```ts
// logic.ts — pure, unit-tested helpers
import type { FilmstripHole } from './types';

export const clampPct = (n: number): number => Math.min(100, Math.max(0, n));

/** rank 1..of → ramp band 4..1 (darker = stronger). of<=1 → 4. */
export function rampBandForRank(rank: number, of: number): 1 | 2 | 3 | 4 {
  if (of <= 1) return 4;
  const q = (rank - 1) / (of - 1);          // 0 best … 1 worst
  if (q <= 0.2) return 4;
  if (q <= 0.45) return 3;
  if (q <= 0.75) return 2;
  return 1;
}

/** value vs thresholds [t1,t2,t3] ascending → band 1..4 (>=t3 → 4); null/NaN → 0 */
export function rampBandForValue(value: number | null, t: [number, number, number]): 0 | 1 | 2 | 3 | 4 {
  if (value === null || Number.isNaN(value)) return 0;
  if (value >= t[2]) return 4;
  if (value >= t[1]) return 3;
  if (value >= t[0]) return 2;
  return 1;
}

/** round delta vs par → 0..5 green dots (5 = career day) */
export function gradeDotsForDelta(delta: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (delta <= -3) return 5;
  if (delta <= 0) return 4;
  if (delta <= 4) return 3;
  if (delta <= 9) return 2;
  if (delta <= 14) return 1;
  return 0;
}
export const gradeLabel = (s: number): string =>
  ['Rough day', 'Rough day', 'Grinding', 'Solid', 'Sharp', 'Career day'][s] ?? 'Solid';

/** filmstrip bar geometry+tone. height in px within a 108px strip. */
export function holeBar(h: FilmstripHole): { heightPx: number; tone: 'par' | 'birdie' | 'bogey' | 'double' } {
  const d = h.score - h.par;
  const tone = d < 0 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
  const heightPx = d === 0 ? 10 : Math.min(Math.abs(d) * 26 + 10, 88);
  return { heightPx, tone };
}

/** legacy stats ?tab= → new ?area= */
export function mapLegacyStatsTab(tab: string | undefined): string | null {
  if (!tab) return null;
  const map: Record<string, string> = {
    scoring: 'scoring', driving: 'driving', approach: 'approach', putting: 'putting',
    scrambling: 'short-game', 'strokes-gained': 'standing', analysis: 'standing',
  };
  return map[tab] ?? null;
}
```

**Steps:**
- [ ] Write `types.ts` + `logic.ts` exactly as above; barrel `index.ts` re-exporting both (components join the barrel in Tasks 2–5).
- [ ] Write `__tests__/logic.test.ts` covering: `clampPct(-5)===0`, `clampPct(140)===100`; `rampBandForRank(1,6)===4`, `(6,6)===1`, `(2,6)===3`, `(1,1)===4`; `rampBandForValue(null,[35,60,85])===0`, `(90,[35,60,85])===4`, `(10,…)===1`; `gradeDotsForDelta(-3)===5`, `(0)===4`, `(13)===2`, `(20)===0`; `holeBar({n:7,par:4,score:7})` → `{heightPx:88,tone:'double'}`, par → `{heightPx:10,tone:'par'}`, birdie tone; `mapLegacyStatsTab('analysis')==='standing'`, `('scrambling')==='short-game'`, `('bogus')===null`, `(undefined)===null`.
- [ ] Run `npx vitest run src/components/fairway/modules` → all pass. `npm run typecheck` green.
- [ ] Commit: `feat(fairway): spine-stage module contracts + pure logic`.

### Task 2: Spine group — `Spine`, `StandingTrack`, `PriorityList`, `SpineLedger`

**Files:** Create the four components; extend `index.ts`.
**Interfaces:** Consumes Task 1 types. Produces components matching mockup section 01 spine (gradient `accent-900→accent-800`, `border accent-700`, radius 28, sticky `top-20` handled by the CONSUMER via className prop passthrough — Spine itself takes `className?`).
**Steps:** implement per mockup `.spine`/`.track`/`.prio`/`.ledger` styling translated to Tailwind+tokens; hero uses fairway mono; verdict `--fw` dim-green text tone equivalent (use `text-on-accent` utilities as fairway does for on-green text); CTA renders `<a>` when `href`, else `<button>`. Verify with a temporary vitest render smoke (`@testing-library/react` render, assert hero value + priorities order rendered). Typecheck/lint. Commit `feat(fairway): Spine module group`.

### Task 3: Stage group — `StageRouter`, `DrillPanel`

**Files:** Create both; extend barrel.
**Interfaces:** `StageRouter` is `'use client'`; reads param via `useSearchParams`, writes via `router.replace('?'+params, {scroll:false})`; exposes stage context `useStage()` hook returning `{ open(key), home() }` so BentoCells/DrillPanels navigate without prop-drilling. Unknown/absent param → `homeKey` view. 220ms opacity/translate transition, disabled under `prefers-reduced-motion` (CSS media query class, no JS matchMedia needed).
**Steps:** implement; smoke test with two dummy views asserting param switching renders the right node (jsdom + next/navigation mock — follow existing hook-test patterns in `src/hooks/golf/__tests__` if present, else render-only smoke). Commit `feat(fairway): StageRouter + DrillPanel`.

### Task 4: Viz group — `RailBars`, `DivergingBars`, `RampMatrix`, `TickerStrip`, `RingGauge`, `SignalChip`, `RankCell`, `GradeDots`, `RxCard`

**Files:** Create nine components; extend barrel.
**Interfaces:** Consumes Task 1 types + `logic.ts` (`rampBandForRank` inside `RankCell`; band → class map lives in ONE place: export `RAMP_CLASSES: Record<0|1|2|3|4, string>` from `RampMatrix.tsx` and reuse in `RankCell`).
**Steps:** translate mockup `.bars/.divg/.matrix/.ticker/.ring/.sig/.rk/.gradedots/.rx` to components. Bars: neutral benchmark tick (warm-400), green fills (accent-500, dim variant accent-300), sunken rails. RampMatrix bands: 0=sunken/ink-3 · 1=accent-100/accent-900 · 2=accent-300/accent-900 · 3=accent-500/on-accent · 4=accent-700/on-accent, radius 7–8px, mono values, optional `n=` sub-caption, legend row. RingGauge: SVG circle stroke-dasharray `(value/100)*2πr`, rotate −90°, accent-500 on sunken. GradeDots: 5 squares 13–14px radius 4, `.on`=accent-400 (on-green context) — component takes a `onGreen?: boolean` to pick accent-400 (on spine) vs accent-500 (on cream). Commit `feat(fairway): spine-stage viz modules`.

### Task 5: Boards — `Bento`+`BentoCell`, `MatrixBoard`, `Filmstrip`

**Files:** Create; finish barrel.
**Interfaces:** Bento = `grid grid-cols-4 gap-px` on border-color background inside overflow-hidden radius-20 bordered container; cells are `<button>` when `onOpen` (whole-cell target, hover `surface-tint`), `span2/rows2` map to `col-span-2/row-span-2`. MatrixBoard: KPI band row (hairline-divided) + header row + rows; row = `<button aria-expanded>` when `expand` present; expand band renders under the row on sunken background; mobile: hide trend/signal columns below `sm` (grid template swap, one component — do NOT fork a mobile card component). Filmstrip: builds columns from `holeBar()`; hover/focus/click all call `onScrub`; active column keeps `surface-tint`; each column `aria-label="Hole N, par P, score S"`.
**Steps:** implement; vitest smoke for Filmstrip (renders 18 buttons, scrub callback fires with hole 7 on click) and MatrixBoard (expand toggles `aria-expanded`). **Gate A:** `npm run typecheck && npm run lint && npm test` all green. Commit `feat(fairway): bento, matrix board, filmstrip modules`.

### Task 6: Player Stats rebuild — `/golf/dashboard/stats`

**Files:** Create `src/components/golf/stats/spine-stage/` (StatsSpine.tsx, StatsBento.tsx, drills: PuttingDrill.tsx, DrivingDrill.tsx, ApproachDrill.tsx, ShortGameDrill.tsx, ScoringDrill.tsx, StandingDrill.tsx, RoundsDrill.tsx, data adapter `buildStatsViewModel.ts` + `__tests__/buildStatsViewModel.test.ts`). Modify `src/app/golf/(dashboard)/dashboard/stats/page.tsx` (keep coach-viewing-teammate path + `FairwayPlayerStats` identity shell). Do NOT delete `FairwayStatsCockpit.tsx` yet (Task 10 cleanup).
**Interfaces:** Consumes existing actions (read their signatures first): `getDetailedStats`, `getTrendAnalysis`, `getPlayerStandingRows`, `getPlayerLeakMaps`, `getPlayerPatterns`, `getSprayChartData` (all currently called from `FairwayStatsCockpit.tsx` — mine it for exact call/response shapes and for the chart components to reuse: `StrokesGainedTornado`, `LeakMap`, `PuttingHeatmap`→ replaced by `RampMatrix`, `FairwayDrivingSpray`, `Ribbon`, `ScoringByPar`, `StandingStrip`). Also call the currently-unused `getPlayerStrengthsWeaknesses` + `getWorstHoleAnalysis` from `stats-data.ts` for spine priorities + scoring drill.
**Layout:** grid `300px 1fr` (stack under 940px, spine not sticky on mobile); `StageRouter param="area" homeKey="home"`; bento per spec §5.1 — biggest-leak cell chosen from worst SG/standing category at render (helper in adapter, tested); DetailGrid appears NOWHERE.
**Redirects:** in `page.tsx`, before render: `searchParams.tab` present → `permanentRedirect('/golf/dashboard/stats?area='+mapLegacyStatsTab(tab))` when mapped, else strip.
**Steps:** adapter first with tests (`biggestLeakArea()` picks putting given fixture standings; ledger/priority extraction), then components, then page wiring. `npm run typecheck && npm run lint && npm test` green. Commit `feat(stats): player stats on spine & stage`.

### Task 7: Team Stats rebuild — `/golf/dashboard/stats/team`

**Files:** Create `src/components/golf/stats/team-board/TeamStatsBoard.tsx` + `buildTeamBoardViewModel.ts` + test. Modify `stats/team/page.tsx`. Keep `FairwayTeamStats.tsx` on disk (Task 10 cleanup).
**Interfaces:** page.tsx already fetches per-player aggregates + intelligence (composite, `topInsightPriority`, `insightCount`) + leak maps + standing map — reuse those fetches verbatim; view model turns them into `MatrixBoardRow[]`: RankCells per category from standing map via `rampBandForRank`; RingGauge composite; Sparkline (existing chart) trend; SignalChip tone: `hot` = top-performer/improving, `watch` = declining/slump (`topInsightPriority` high), `quiet` otherwise — mapping tested. Expand band: worst metric, SG putt, last round, links (Full stats → `/stats?playerId=`, Fingerprint → `/players/[id]/game`, Prescribe → `/development?player=`). KPI band per spec; leak maps + tornado move BELOW the board (roster first); CSV export = icon button in masthead.
**Steps:** view model + tests → board → page wiring → gates green. Commit `feat(stats): team stats matrix board`. **Gate B** + dispatch code-reviewer on Phase 2 diff; fix findings before Phase 3.

### Task 8: Player CoachHelm home — `/golf/dashboard/coachhelm` (+ redirects)

**Files:** Create `src/components/golf/coachhelm/home/PlayerCoachHelmHome.tsx` (+ small view components as needed under `home/`). Modify `coachhelm/page.tsx` (keep its 8 parallel fetches; pass into home). Replace page bodies of `my-development/page.tsx`, `my-game-profile/page.tsx`, `my-standing/page.tsx` with `permanentRedirect('/golf/dashboard/coachhelm?view=…')` per spec §5.3. Modify `surface-registry.ts`: player coachhelm-tab entries → `legacy: true, hidden: true`, hrefs → new `?view=` targets; verify every registry consumer still compiles (`CoachHelmSubNav.tsx`, `CommandPalette.tsx`, breadcrumb, nav-registry) — player sub-nav strip is removed for this cluster (the stage IS the nav); CommandPalette entries point at the new hrefs.
**Interfaces:** Reuse from `FairwayPlayerCoachHelm.tsx` (mine, don't rewrite): HeroNarrativeCard content → spine verdict; prediction → spine hero; FocusAreasGrid, GenomeRadar, StandingStrip rows, ShotAnalysisCard, WhatIfPanel → embedded in drill views. Keep helpful/dismiss feedback actions wired on the top-insight cell.
**Steps:** home bento + spine → drill views (`development`, `profile`, `standing`, `insights`, `deep-dive`) → redirects → registry/nav updates → gates green. Commit `feat(coachhelm): player home on spine & stage + legacy redirects`.

### Task 9: Coach CoachHelm home — `/golf/dashboard/intelligence` (+ signals consolidation, redirects)

**Files:** Create `src/components/golf/coachhelm/home/CoachIntelligenceHome.tsx`. Modify `intelligence/page.tsx`; replace page bodies of `alerts/insights/patterns/page.tsx` → `permanentRedirect('/golf/dashboard/intelligence?view=signals&filter=…')`; `analytics/coachhelm/page.tsx` → `?view=effectiveness`; `development/page.tsx` → `?view=players`. Modify `surface-registry.ts` (coach tabs legacy; ONE rail entry), CoachHelmSubNav (coach strip removed), CommandPalette/nav-registry hrefs. **Sequential after Task 8 (shared files).**
**Interfaces:** Spine from `getTeamOverview` (composite, health, directive, flagged players, trajectory). Bento per spec §5.4 — weakest-category 2×2 reuses Ribbon; signals summary cell uses FULL `getAlertCounts` (critical/warning/info 3-segment bar). Drill `signals` mounts the existing `FairwayCoachHelmSignals` (pass `signalSource` from `filter` param — do not rewrite its internals this phase; its 3 duplicate chrome stacks collapse naturally since it now renders once). Drill `players` = roster MatrixBoard (reuse Task 7 board with coach dev data) + FocusAreaBoard; drill `effectiveness` mounts the existing cockpit content component.
**Steps:** home → drills → redirects → registry/nav → gates green. Commit `feat(coachhelm): coach intelligence home + unified signals + legacy redirects`. **Gate C** + code-reviewer on Phase 3 diff; fix findings.

### Task 10: Round Review rebuild + retirement sweep

**Files:** Create `src/components/golf/coachhelm/round-review/FilmstripReview.tsx` (+ `buildReviewViewModel.ts` + test). Modify `rounds/[id]/review/page.tsx`. Delete now-unmounted legacy components ONLY after `npx knip`-style grep confirms zero imports: `RoundReviewLlmCard` usage, duplicate hole-by-hole grid, plus (from earlier phases, if now orphaned) `FairwayStatsCockpit.tsx`, `FairwayTeamStats.tsx` — delete only what nothing imports; leave anything still referenced.
**Interfaces:** Filmstrip from `RoundReviewContent.holeByHole` (n/par/score + note synthesis: penalties/3-putts/miss text where present); GradeDots via `gradeDotsForDelta(scoreToPar)`; mix line from `scoringDistribution`; ONE narrative: V2 review body, else V1 summary; strokes-lost RailBars from `strokesToGain` (single home); "next" block = practice priority + add-focus-area CTA (existing actions); "Full breakdown" DrillPanel = front/back, putting bands, momentum, driving/penalties, `shortGameAnalysis` (surfaced). Hole tap swaps stage to that hole's existing `HoleShotPath` detail.
**Steps:** view model + tests (note synthesis, grade, mix) → components → page → deletion sweep → **Gate D:** typecheck/lint/test/build green. Commit `feat(rounds): filmstrip round review + legacy retirement`.

### Task 11: Final review + PR

- [ ] `npm run build` clean; `npm run docs:regen && npm run docs:check` (routes changed → inventory blocks).
- [ ] Dispatch code-reviewer (full branch diff) + ui-polish-reviewer; fix confirmed findings; commit fixes.
- [ ] Push branch, open PR into `main` titled `Redesign: Spine & Stage — CoachHelm, Stats, Round Review` with spec/plan links, mockup screenshot, redirect table. PR body ends with the standard attribution block.

## Self-Review Notes

- Spec §5.1–§5.5 → Tasks 6–10; §4 kit → Tasks 1–5; §7 gates → Gates A–D + Task 11. No uncovered spec sections.
- Names cross-checked: `rampBandForRank`/`RAMP_CLASSES`/`mapLegacyStatsTab`/`gradeDotsForDelta`/`holeBar` used consistently across Tasks 1/4/5/6/7/10.
- Deliberate deviations from default granularity: component-internal markup is specified by the committed mockup (measurable artifact) rather than inline code blocks; Tasks 8–9 are ordered sequentially due to shared registry/nav files.

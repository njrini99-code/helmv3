# CoachHelm cockpit (Brief + Signals) at /golf/dashboard/coachhelm (implemented as TriageDesk, mounted via CoachIntelligenceHome at /golf/dashboard/intelligence) v2 spec

<!-- Synthesized by the facelift design panel (three concepts, one judge) on 2026-09-10. -->

## CoachHelm cockpit (Brief + Signals): Rail, Strip, Stage

## Purpose

The owner's complaint is that the screen reads as basic cards with no visuals, no thought, no architecture. The fix is not a new layout, it is finishing the instrument the codebase already half built. Three real defects, all verified in the running code, are why the screen reads that way: the leak band is a tall panel that pushes the actual triage workspace below the fold at 1440x900, the workspace's three panes (queue, dossier, inspector) are each independently bordered so an open inspector produces three stacked identical boxes, and Spine's own `readouts` and `urgent` props, built for exactly this screen, sit unused while an urgent signal gets pushed through a bare `children` slot and renders in the wrong order. None of this needs a new layout. It needs the fold problem solved first, the three boxes merged into one bezel, and the unused Spine slots wired up with real instruments instead of more text.

This spec takes Concept 3's diagnosis of the fold problem as the spine, because it is the only one of the three that names a real, measurable constraint (the workspace does not fit above the fold today) rather than a stylistic complaint, and its fix is a single additive prop with a safe default for every other consumer of the leak band. Onto that spine, this spec grafts Concept 1's shared bezel merge and claim promotion (the correct, if imperfectly justified, fix for the identical-card-grid violation) and Concept 2's best-targeted instruments (the team-signal decomposition, tiered to the one place it is not redundant, plus a severity mix and priority magnitude bars built entirely from data already in memory). The result uses two additive primitive changes, wires up primitives that already exist and are already accepted as a follow-up in REVIEW.md, and ships as one PR from one engineer this week.

## First question

What needs my attention right now, and which player or leak does it point to.

## Named hierarchy: Rail, Strip, Stage

Three regions, each a distinct instrument, stacked top to bottom on desktop and in document order on phone.

1. **Rail** (Spine): the persistent verdict. What is true right now, in one glance.
2. **Strip** (team leak band): the roster-wide signal. Where the team is bleeding strokes, collapsed to one line, expandable.
3. **Stage** (the Signals workspace): where triage actually happens. One bezel, three panes, no card soup.

The Rail never scrolls out of view at 940px and above. The Strip is one line by default so the Stage clears the fold at 1440x900 without the coach scrolling past a tall band first. The Stage is the only place with three columns, and it is now one instrument, not three.

## Region 1: Rail (Spine)

**Visual.** The existing green full-bleed rail: hero number, one-sentence verdict, then three things that do not exist on the production screen today: a compact severity-mix bar, the urgent signal in its own slot ahead of the ledger instead of trailing after it, and magnitude bars under the top three priorities. All four of Spine's existing render slots (`hero`, `verdict`, `readouts`, `urgent`, `priorities`, `ledger`, `cta`) get used for what each was built for; none of this needs a new component in Spine.tsx itself.

**Data mapping.**

- `hero.value`: `groups.reduce((n, g) => n + g.signals.length, 0)`. Existing, `TriageDesk.tsx:500`, unchanged.
- `verdict`: `spineVerdict`, from `buildSpineVerdict` in `buildTriageViewModel.ts`. Existing, unchanged.
- Severity-mix bar (new): a new exported `computeSeverityMix(groups)` in `buildTriageViewModel.ts` walks `groups.flatMap(g => g.signals)` and counts by `GroupedSignal.severity` (`signal-grouping.ts`) into `{ urgent, high, medium, low }`. This is a new derivation, not a reuse of `computeBriefCounts`, which only returns `{ urgent, playersFlagged }` (`buildTriageViewModel.ts:187-197`, verified). The counts render through a small local `SeverityMixBar` subcomponent (same pattern as the existing `SpineUrgentRow`/`SpineHairline` locals already inside `Spine.tsx`, not a new registered primitive), passed as the single row's `value` in Spine's existing `readouts` prop (`SpineReadoutRow.value` is typed `ReactNode`, currently unused in production).
- Urgent (fixed): `urgentSignal`, existing TriageDesk state, now passed to Spine's existing `urgent` prop instead of through `children`. This is the exact fix REVIEW.md's Decisions section already accepted as a primitives follow-up; it also corrects the render-order bug, since `urgent` renders before `ledger` while `children` rendered after it.
- Priorities (fixed and extended): a new exported `buildDedupedPriorities(groups, limit = 3)` in `buildTriageViewModel.ts` replaces the current inline `groups.flatMap(...).slice(0, 3)`, which takes the pinned team bucket's first three signals unfiltered. The new version sorts the flattened signals by `strokeImpact` descending, keeps only the first occurrence per `category`, and takes the top three, so three different leaks show instead of near-duplicates from the same bucket. Each `PriorityItem` gains a new `barPct`, the item's `strokeImpact` normalized against the top item's, rendered as a thin bar under the row via the modified `PriorityList`.
- Ledger: the existing five rows, unchanged, desktop only (`isDesktopSpine`, the existing 940px `useMediaQuery`).

## Region 2: Strip (team leak band)

**Visual.** `TeamCategoryLeakBand` gets a new `variant?: 'panel' | 'strip'` prop, defaulting to `'panel'` so its other callers (`FairwayPlayerCard`, the intelligence loading skeletons, `CoachIntelligenceHome`'s own use) are unaffected, verified by grep: five files besides this screen import the component. TriageDesk opts into `variant="strip"` on desktop only. The strip is one seamed row: the existing `RingGauge` plus a label, then a compact horizontal row of category chips (label, value, trend glyph only, no ticks, no badge, no per-player rows). Tapping a chip expands, below the strip, that category's worst offenders as `RailBars` rows instead of today's bare text-and-glyph rows, the one place this spec keeps Concept 2's decomposition idea at full strength, because it is the only place it is not redundant with the Stage.

**Data mapping.**

- `categories` / `teamHealth`: existing `categoryBandData.categories` / `categoryBandData.teamHealth` (`TriageDesk.tsx:577`), from `getTeamCategoryInsights`, unchanged source.
- Expanded worst-offender rows: existing `category.players` (`PlayerCategoryStat[]`, `team-category-insights.ts`) filtered to `needsAttention`, mapped to `RailBarRow { label: playerName, pct: <attention-share, derived from the existing sort order>, value: <trendDelta text>, tone: 'warning' }`, using the new `RailBars.tone` prop.
- `variant`: `isDesktopSpine ? 'strip' : 'panel'`, using the existing 940px flag already defined at `TriageDesk.tsx:140`.

## Region 3: Stage (the Signals workspace)

**Visual.** The three `ResizableWorkspace` panes (queue, dossier, inspector) currently each render their own independently bordered box: `SignalQueue.tsx` and `SignalDossier.tsx` share a byte-identical `rounded-fw-lg border border-border-subtle bg-surface` wrapper, and the docked `SignalInsightPanel` renders `InsightPanel`'s default `elevation="border"`, which is also a bordered `Surface`. Opening the inspector today produces three stacked identical cards, a direct hit on the identical-card-grid ban, and a more severe one than any of the three concepts individually described. The fix: one outer `Surface` (`elevation="border"`, `rounded-fw-lg`) wraps the whole `ResizableWorkspace`; the three pane components drop their own border and background classes and render bare on that shared surface; the workspace's existing 8px handle tracks, already a `bg-border-subtle` hairline, become the only seam between panes.

Inside the dossier, the claim sentence, today an 18px `text-h3` heading, becomes the largest, most dominant piece of text on the Stage at 24px `text-h2` (both are real entries in the canonical type scale in `tailwind.config.ts`; this is a type-size class change on the existing heading tag, not a change of heading level). `DossierSection`'s four titled blocks ("Recent trend", "Other open signals for {player}", "Focus areas", "Active goals") drop their own `border border-border-subtle bg-surface-sunken` box, becoming bare labeled zones instead of four more nested cards inside an already-bordered pane. The two list-shaped sections, "Other open signals" and "Focus areas"/"Active goals" (each currently a loosely spaced `<ul><li>`), adopt the existing, already-registered `InsetGroup`/`InsetGroup.Row` primitive for seamed rows instead: this is the primitive's first real consumer in this codebase.

When the selected signal is a `team_synthesis` roll-up, a new "Who's contributing" instrument appears under the claim: `RailBars` (existing primitive, `tone="accent"`) showing each contributing player's share, resolving today's confirmed gap where `EvidencePanel`'s `tryRenderV3Standing`/`EvidenceValuePair` render nothing at all for this shape.

**Data mapping.**

- Bezel merge: no data change. Structural class edits only, in `TriageDesk.tsx`, `SignalQueue.tsx`, `SignalDossier.tsx`, `SignalInsightPanel.tsx`.
- Claim headline: existing `signal.title`, unchanged source, className only.
- InsetGroup rows: existing `otherSignals`, `activeFocusAreas`, `playerGoals` arrays in `SignalDossier.tsx`, unchanged sources, markup only.
- Team decomposition (new): a new exported `buildTeamBreakdown(teamSignal, groups)` in `buildTriageViewModel.ts`. `metricOf`, today a private helper in `team-synthesis.ts` that reads `signal.evidence.metric`, gets exported (visibility change only, no logic change). `buildTeamBreakdown` resolves the roll-up's own metric id via `metricOf(teamSignal)`, then filters the full roster `groups` array TriageDesk already holds for per-player signals whose OWN `evidence` resolves to that same id via the same `metricOf` call. This is the exact join key `synthesizeTeamSignals` already used to build the roll-up in the first place, verified in `team-synthesis.ts`, so decomposing it back client-side reuses an already-trusted key rather than inventing a new, riskier one. Matches map to `RailBarRow { label: playerName, pct: <strokeImpact normalized to the group max>, value: '<strokeImpact.toFixed(1)> str/rd' }`. Passed as a new `teamBreakdown?: RailBarRow[]` prop into `SignalDossier`. If the array comes back empty, nothing extra renders and the existing claim sentence stands alone, matching `EvidencePanel`'s own precedent of honest emptiness over a broken row.

## Desktop grid, 1440px

- Page container keeps today's max width and side gutters.
- Row 1: `grid-cols-[320px_1fr]` (existing, `TriageDesk.tsx:496`). Rail sits at 320px, `sticky top-6`, beside the main column.
- Main column, top to bottom: Toolbar (unchanged, full width), Strip (full width, roughly 64px collapsed versus today's roughly 220 to 260px always-expanded panel), Stage (the bezel-merged `ResizableWorkspace`, `defaultLayout={[26, 48, 26]}`, unchanged split) filling the remaining viewport height.
- Net effect: at 1440x900, Toolbar plus Strip now leaves enough height that the Stage's queue and dossier are visible without scrolling past the Rail and a tall band first, which is Concept 3's fold claim, now actually true.

## Phone flow, 390px

- Same component tree, same 940px `isDesktopSpine` gate, no new breakpoint.
- Rail: hero number, verdict, the new severity-mix bar (kept on phone too, it is one compact row), the urgent row via the fixed `urgent` prop, CTA. Priorities and ledger stay desktop only, unchanged, a deliberate scope line, not an oversight: the top three priorities are one tap away in the Signals list right below, and Rail stays lean on a phone screen.
- Strip: stays `variant="panel"`, the existing, already-tuned two-up grid (the 2026-07-25 `Badge` wrapping fix already covers this). The fold pressure that motivates the strip variant is a 1440x900 desktop constraint; a phone screen is already a naturally scrolling page, so collapsing it there would cost a tap for no space it needs back.
- Stage: unchanged mobile flow, `SignalQueue` as a flat list, tapping a row opens `SignalDossier` in a bottom `Sheet`. Because the claim promotion, `InsetGroup` rows, and team-breakdown `RailBars` all live inside `SignalDossier.tsx` itself, they apply automatically inside this Sheet with no extra mobile-specific code, which is exactly the "reflow to native sheets" instruction already at work here. The bezel merge is desktop only; phone never renders the three-pane `ResizableWorkspace`.

## Primitives

**Existing, reused as-is (wiring or class changes only):** `Spine` (`readouts` and `urgent` props), `PriorityList`, `RingGauge`, `TrendGlyph`, `Badge`, `StatusPill`, `InstrumentPanel`, `ResizableWorkspace`, `Sheet`, `Surface`, and `InsetGroup`/`InsetGroup.Row` (registered, first real consumer).

**Modified, additive, two total:**

1. `RailBars`: add `tone?: 'accent' | 'warning'` to `RailBarRow`. Omitted, it renders exactly as today (`bg-accent-500`/`bg-accent-300`); `'warning'` maps to `bg-fw-warning`, the same token `SignalRow`'s severity dot already uses.
2. `PriorityList`: add `barPct?: number` to `PriorityItem`. Omitted, a row renders exactly as today; present, a thin sunken track with an accent fill renders under the row.

**New, not a registered primitive:** `SeverityMixBar`, a small local subcomponent living beside `SpineUrgentRow`/`SpineHairline` inside `Spine.tsx`, the same category those already are.

## Removals

- The `border border-border-subtle bg-surface-sunken` wrapper on `DossierSection` (four instances plus a fifth inline duplicate on the Evidence block, all in `SignalDossier.tsx`).
- `SignalQueue.tsx` and `SignalDossier.tsx`'s own `rounded-fw-lg border border-border-subtle bg-surface` root wrapper.
- The docked `InsightPanel`'s default `elevation="border"` Surface styling, overridden at the `SignalInsightPanel.tsx` consumer level for this screen only (Surface itself only exposes `'border'`/`'shadow'`, and changing that primitive is out of this week's two-primitive budget).
- The urgent-signal `children` block in `TriageDesk.tsx` (roughly lines 516 to 529), replaced by the `urgent` prop.
- `TeamCategoryLeakBand`'s always-expanded five-column panel, at this screen only, via the new strip variant; every other consumer keeps the panel.

## Implementation plan

**Files to edit.**

- `src/components/golf/coachhelm/triage/buildTriageViewModel.ts`: add `computeSeverityMix`, `buildDedupedPriorities`, `buildTeamBreakdown`.
- `src/components/golf/coachhelm/triage/TriageDesk.tsx`: use the three new functions above; move the urgent block from `children` to the `urgent` prop; pass `readouts` with the severity-mix row; pass `variant={isDesktopSpine ? 'strip' : 'panel'}` to `TeamCategoryLeakBand`; pass `teamBreakdown` into both `SignalDossier` call sites (desktop pane and mobile Sheet); wrap the `ResizableWorkspace` in one shared outer `Surface`.
- `src/components/golf/coachhelm/triage/SignalQueue.tsx`: drop the root border and background classes.
- `src/components/golf/coachhelm/triage/SignalDossier.tsx`: drop the root border and background classes; promote the claim heading to `text-h2`; strip `DossierSection`'s box classes; swap the three list sections to `InsetGroup`/`InsetGroup.Row`; accept and render the new `teamBreakdown` prop via `RailBars`.
- `src/components/golf/coachhelm/triage/SignalInsightPanel.tsx`: override the docked panel's default border and background via className so it renders bare on the shared bezel.
- `src/components/fairway/pages/coachhelm/TeamCategoryLeakBand.tsx`: add the `variant` prop and the strip rendering, including the click-to-expand `RailBars` breakdown.
- `src/components/fairway/modules/RailBars.tsx`: add the `tone` fill-color branch.
- `src/components/fairway/modules/PriorityList.tsx`: render the optional bar when `barPct` is present.
- `src/components/fairway/modules/types.ts`: add `tone?: 'accent' | 'warning'` to `RailBarRow`; add `barPct?: number` to `PriorityItem`.
- `src/lib/coachhelm/v3/insights/team-synthesis.ts`: export the existing `metricOf` helper (visibility only).

**Files to create.** None. Everything above is additive to an existing file; `SeverityMixBar` is a small function added inside `Spine.tsx`, not a new file.

**Data plumbing.** Every new value traces to data already fetched for this screen today: `groups` (per-player and team-synthesis signals, already in TriageDesk state) feeds the severity mix, the deduped priorities, and the team breakdown; `categoryBandData` (already fetched via `getTeamCategoryInsights`) feeds the strip and its expanded rows. No new server action, no new query, no new migration.

**Tests.**

- `src/components/golf/coachhelm/triage/__tests__/buildTriageViewModel.test.ts`: add cases for `computeSeverityMix`, `buildDedupedPriorities` (asserting at most one item per category), and `buildTeamBreakdown` (asserting the empty-match case returns an empty array).
- `src/components/golf/coachhelm/triage/__tests__/TriageDesk.navigation.test.tsx`: assert the urgent block now renders via Spine's `urgent` slot, before the ledger, not after it.
- `src/components/golf/coachhelm/triage/__tests__/SignalDossier.teamRollup.test.tsx`: add a case asserting `RailBars` render when `teamBreakdown` has matches, and that nothing extra renders when it is empty.
- `src/components/golf/coachhelm/triage/__tests__/SignalDossier.test.tsx`: add a case asserting the claim heading carries `text-h2`.
- `src/components/fairway/pages/coachhelm/TeamCategoryLeakBand.test.tsx`: add cases for `variant="strip"` (collapsed by default, `RailBars` only after a chip is clicked) and confirm the default, `variant` omitted, still matches today's panel output.
- `src/components/fairway/modules/__tests__/RailBars.sample-column.test.tsx`: add a case for `tone: 'warning'` rendering `bg-fw-warning`, and confirm omitting `tone` still renders today's default fill.
- `src/components/fairway/modules/__tests__/PriorityList.test.tsx` (new file): assert `barPct` renders a bar element and its absence renders identically to today.

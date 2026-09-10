<!-- markdownlint-disable MD013 MD024 -->
# Fairway Premium Facelift — operating brief (golf)

Status: approved direction, in execution. Owner sessions: helmv3-7f (system, desktop, registry), helmv3-20 (mobile).
Scope: GolfHelm coach + player surfaces. Baseball and Lift Lab are out of scope.
Palette: premium warm cream canvas with structural Fairway green. Frost is a material, not the identity.

## 0. Thesis

Fairway should feel dimensional, editorial, instrumented, and spatial — not card-based. Premium comes from hierarchy, composition, component selection, depth, asymmetry, data visualization, typography, control design, motion, mobile behavior, state design, consistency, fewer containers, and using the Fairway system we already have. Not from blur, shadows, gradients, or radii.

Before any screen: ask "what is the most important thing here, what architecture expresses it, what can be removed or merged, what data deserves a visual, what is matte / raised / floating, which Fairway component already solves this?" Never ask "how do I make this look more premium".

## 1. What is wrong today

- Every region uses the same grammar: rounded card, pill, segmented pill, rounded card, floating bar. Equal weight everywhere, so nothing wins.
- Pages read as assembled, not authored. Local decisions fine, composition accidental.
- Repeated container chrome (border + shadow + padding + heading) is noise.
- Layers sit at similar tonal values, so the UI is flatter than it should be.

## 2. Materials (semantic)

| Material | Use | Character |
| --- | --- | --- |
| 0 Canvas | page / workspace / calendar environment | warm ivory, quiet tonal gradient allowed, no border, no shadow |
| 1 Matte | calendar grid, boards, stat detail, settings, forms, tables, long text | near-opaque, low-contrast border, minimal shadow, strong text |
| 2 Inset | metadata groups, response matrices, event details, settings rows, nested evidence | slightly warmer/darker, inner boundary, seams, no outer shadow |
| 3 Raised | selected object, active insight, primary action block, elevated chart | opaque, clearer edge, lit top edge, may lift on hover |
| 4 Float | toolbar, bottom dock, popover, command palette, contextual action bar | frost allowed: translucency + blur + saturate + edge light + contact shadow |
| 5 Modal | sheet, drawer, modal, focused task | frost allowed, readability first |
| 6 Structural green | Spine, major hero, instrument shell, primary decision surface | deep Fairway green, one strong region per screen |

Depth ladder is semantic: Z0 canvas, Z1 matte/inset, Z2 raised, Z3 float, Z4 modal. Tokens: `--fw-depth-1..4`, `--fw-shadow-control`, `.fw-frost{,-subtle,-floating,-modal,-bar,-selection}`, `.fw-dock-fade`. No arbitrary shadows, z-indexes, colors, or radii in feature code.

Frost budget per screen: one major frosted region plus at most two small floating controls. Frost never on calendar body, tables, dense stats, forms, long text, KPI cells, every card, every tab.

## 3. Radius hierarchy (closed ramp, Tailwind names)

| Role | px | class |
| --- | --- | --- |
| shell (sheet, drawer, hero shell) | 28 | `rounded-fw-lg` |
| surface (primary large surface) | 20 | `rounded-card` |
| panel (raised / inset panel) | 14 | `rounded-fw-md` |
| control (button block, input, toolbar item) | 14 / 10 | `rounded-fw-md` / `rounded-fw-sm` |
| cell (board cells, dense UI) | 10 | `rounded-fw-sm` |
| pill (chips, compact pill buttons) | full | `rounded-full` |

A component is not pill-shaped merely because it is interactive. Large CTAs use `Button shape="block"`.

## 4. Typography roles

Display, Page title, Panel title, Section title, Body, Secondary body, Eyebrow, Metric hero, Metric normal, Metric unit, Metadata, Caption, Control label, Tabular data. No arbitrary text sizes in feature code. Tabular numerals, consistent precision, aligned units, NumberFlow only for values that change meaningfully. Not every number is huge.

## 5. Spacing rhythm

4 micro · 8 tight · 12 compact · 16 control · 20 component · 24 group · 32 section · 40 major · 48 page · 64 hero. No invented combinations.

## 6. Composition rules

1. Classify the screen (archetype) and name the dominant object, supporting objects, tertiary detail, persistent controls, temporary controls, drill path.
2. One dominant object above the fold. Four equal cards means hierarchy failed.
3. Use asymmetry: 2×1, 2×2 hero cell, narrow rail + wide panel, strong left Spine, big chart + small companions. Cell size expresses importance.
4. Prefer one Surface with seams over a stack of cards. A 1px hairline often replaces a card.
5. Card-soup flags: >3 same-size cards above the fold → StatMatrix / StatStrip / Bento / Board / seams. Card inside card → Inset. 4+ pills in one region → toolbar / menu / segmented / drawer. Custom shadow → which depth token? Glass with body copy → matte.

## 7. Archetypes

- A Intelligence overview: Spine, StageRouter, Bento, BentoCell, PriorityList, StandingTrack, InsightCard, InstrumentPanel. CoachHelm home, development, player intelligence.
- B Operational board: MatrixBoard, RankCell, SignalChip, RingGauge, Sparkline, DataTable. Roster, recruiting, team comparison, triage.
- C Analytical instrument: InstrumentCluster, InstrumentPanel, Readout, RadialGauge, Ribbon, Dial, SegmentBar, charts. Prediction, effectiveness, readiness.
- D Workspace: ResizableWorkspace, ScrollArea, FrostToolbar, InsightPanel, DrillPanel, MatrixBoard, Sheet. Signals, power-user analysis, recruiting, admin.
- E Chronology: Filmstrip, TickerStrip, timeline, strip navigation. Rounds, holes, practices, history.
- F Drill / context detail: DrillPanel, Sheet, Drawer, inline expansion, right inspector. Event, signal, player detail, evidence.

## 8. Component preference

Feature screen → Fairway component → Base UI / Radix / Vaul / Recharts / visx. Never style Base UI directly in a feature. Never invent a new card component. Check `src/components/fairway/**` and `fairway/modules/**` before creating anything. Legacy `src/components/ui/**` is strangled, not rewritten; do not mix legacy and Fairway in one new composition.

Question → visual: improving? TrendChart/Sparkline · what changed? delta + trend · what hurts most? Tornado/DivergingBars · where do I rank? StandingTrack/RankCell · who needs attention? MatrixBoard · where are misses? ShotDispersion · putting weakness? PuttingHeatmap/RampMatrix · profile? GenomeFingerprint · what first? PriorityList · what happened in the round? Filmstrip · confidence? Meter/Readout · completeness? Progress/Meter · above/below baseline? DivergingBars · evolution? TickerStrip/TrendChart.

## 9. New Fairway primitives

P0: InsetGroup (done), StatMatrix (done), FloatingDock (FairwayBottomNav reworked), FrostToolbar, FairwayDrawer (only if Sheet/vaul is insufficient), ResizableWorkspace, ScrollArea, Menu, Tooltip.
P1: Autocomplete, PreviewCard, ContextMenu, Progress, Meter, Kbd, Pagination.

## 10. Surface matrix (golf)

- Calendar (E/F): canvas → one composed toolbar → one continuous date rail → player context rail → matte stage → floating dock. Events are timeline rows, not cards. Event detail is a frost bottom sheet: type + overflow, title, time, metadata InsetGroup, response StatMatrix, notes, sticky block CTA. Avoid seven date pills, four containers before the grid, glass month grid, giant green dock pill.
- Mobile navigation: FloatingDock, 4–5 destinations, compact tinted active island (≤ a third of the dock), quiet inactive items, only strong floating material near the bottom.
- CoachHelm home (A): deep green Spine + asymmetric matte Bento, one raised top insight, charts as energy. No top row of equal KPI cards.
- CoachHelm signals (D): desktop queue | evidence | CoachHelm (ResizableWorkspace). Mobile queue → sheet → assistant. Dense rows, not cards.
- CoachHelm players (B): MatrixBoard, inline expand, right inspector, PreviewCard on hover. Mobile condensed board + sheet.
- Effectiveness (C): one instrument cluster, one longitudinal chart, one comparison, one evidence list. Instrument surfaces may be richer (deep green, dark warm glass, inset rails).
- Player stats (A+C): Spine + stage, Bento overview, dedicated drill views (dispersion hero, heatmap, tornado). Never one card per stat.
- Team stats (B): MatrixBoard primary, compact StatMatrix header, inline expand.
- Round review (E): score/grade → Filmstrip → narrative → strokes lost → next → breakdown. The round is the story; no accordions hiding analysis.
- Practice planner (D): schedule lane + inspector; drag only where it helps.
- Recruiting (B): prospect board | profile/evidence; optional map mode.
- Notifications: compact grouped stream, light frost popover, matte rows.
- Settings: InsetGroup semantics, native grouped sections, two-column on desktop.
- Forms: labels above, helper below, grouped fields share spacing not boxes.
- Command/search: frost is appropriate; grouped results, keyboard hints.
- Tables: DataTable/TanStack, density modes, sticky columns, row menus. No row cards.
- CoachHelm chat: structured messages (CoachMessage, EvidenceBlock, MetricCitation, RecommendedAction, ToolActivity). Coach messages are open/matte with inset evidence; no bubble around every answer.

## 11. Motion, mobile, desktop, states

Motion explains structure: fast 120–160, standard 180–240, panel 240–320, spring for sheets only. Press scale ~0.98, indicator slides, stage fade + translate, hover lift ≤ 2px, NumberFlow for metrics. No staggered page entrances, no decorative motion, no scroll-linked blur.

Mobile: bottom sheets for filters/detail/creation/actions; preserve scroll, filter, selection, date, view on close; 44px targets; haptic on meaningful select; no hover-only behavior.

Desktop: right inspectors, resizable panes, hover previews, keyboard shortcuts, context menus, dense boards, inline expansion. Never a stretched phone.

States: loading preserves layout (chart skeletons look like charts); empty retains context with one action; errors are local with retry.

## 12. Do-nots

No new UI library, no shadcn conversion, not everything glass/dark/green, no more generic cards, no tabs as page architecture by default, no accordions hiding key content, no equal KPI grids by reflex, no player card galleries for comparison, no random gradients/shadows/tokens, no over-animation, no hover-only mobile behavior, no data/query logic changes during a visual facelift, no stretched mobile → desktop or stacked desktop → mobile, no pixel-copying Apple, no "premium as decoration".

## 13. Preflight (required before changing a route) and output format

Read the route and its primary children; identify archetype, dominant object, card-like surfaces and which to remove, existing Fairway / modules, analogous good screens, mobile and desktop behavior, loading/empty/error states, visualization opportunities, needed behavior kit, and what will not be introduced. Then write the SCREEN block (Archetype, Dominant object, Supporting, Tertiary, Floating, Modal, EXISTING FAIRWAY, NEW FAIRWAY NEEDED, UNDERLYING KIT, CONTAINERS TO REMOVE, VISUALIZATIONS, MOBILE, DESKTOP, STATES, RISKS) before coding. Screen specs live in `docs/design/fairway-facelift/screens/`.

## 14. Review checklist

Hierarchy (one dominant object, clear reading order), composition (merge containers, intentional spacing, asymmetry), depth (canvas/surface/float/modal legible, semantic shadows, selective frost), typography (page title obvious, metrics consistent, metadata quiet, numerals aligned), controls (pill count, consistent active states, obvious primary action), data (prose → visual, benchmarks and trends visible), mobile (44px, safe areas, keyboard, context preserved), brand (could this be a random SaaS? then keep going).

## 15. Roadmap and ownership

1. Foundation (tokens, depth, radius, frost, GlassSurface tiers, InsetGroup, StatMatrix, FloatingDock, FrostToolbar) — helmv3-7f, branch `agent/frost-facelift`.
2. Behavior primitives (ScrollArea, Menu, Tooltip, ResizableWorkspace, Progress, Meter, Autocomplete, PreviewCard) — helmv3-7f.
3. Calendar proof — desktop helmv3-7f, mobile helmv3-20.
4. CoachHelm signals workspace — desktop helmv3-7f, mobile helmv3-20.
5. CoachHelm home — helmv3-7f, mobile pass helmv3-20.
6. Player / team stats — helmv3-7f, mobile pass helmv3-20.
7. Round review — helmv3-7f, mobile pass helmv3-20.
8. CoachHelm chat message system — helmv3-7f.
9. Fairway registry (`src/components/fairway/registry.ts`) + Lab — helmv3-7f.
10. Enforcement ratchets — helmv3-7f.

Cross-cutting: both sessions hunt competing implementations (duplicate recipes, parallel components for the same job), hydration hazards (Date/now in render, window/media-query first paint mismatches, locale/timezone drift), and dead code, and record them in `docs/design/fairway-facelift/AUDIT.md`.

Evidence: `npm run ui:facelift:capture -- --base=http://localhost:<port>` writes labelled fold/full shots for every golf surface (coach + player, phone + desktop, tabs and sheets) plus the code graph per route to `ui-intelligence/facelift/`.

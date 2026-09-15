# Coach home (dashboard), /golf/dashboard v2 spec

<!-- Synthesized by the facelift design panel (three concepts, one judge) on 2026-09-10. -->

## Coach home (dashboard) redesign spec

`/golf/dashboard` (coach) · target file `src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx`

## Purpose

Answer, in order, exactly what a coach opens this page to find out: what is on today, does anyone on the team need me right now, and is the team's scoring actually moving. Everything else (recent rounds, activity) is chronology, not the point.

The owner's complaint is specific: "so basic, just cards down, where is the architecture." The fix is not more cards, it is:

1. one composed instrument band that reads as a designed cockpit, not a StatMatrix box glued to a chart box
2. a sticky toolbar that gives the page real structure across a scroll instead of every fact living inside whichever card happens to hold it
3. Today itself becoming a real instrument (an hour rail) instead of a plain list, since it is the dominant object and currently the least visually resolved thing on the page
4. deliberately different shapes side by side in every row, so no two neighbors read as the same rectangle

## First question

"What's on today, and does the team need me right now?"

## Hierarchy named

- **Stage**: masthead (ViewHeader) + a one-sentence verdict line
- **Toolbar**: sticky, carries the performance window control and the one thing worth surfacing while scrolling (open signals)
- **Operations row**: Today (bare seam rows, an hour rail on top) beside Who needs attention (MatrixBoard's own ruled grid, no outer box), a rounded list shape next to a bare ruled-grid shape, never two identical cards
- **Instrument band**: Team performance, full width, one cockpit (InstrumentCluster)
- **Ledger row**: Recent rounds (boxed Surface, the row's one "card") beside Activity (bare seam rows), again two different shapes, not two cards

Four distinct visual instruments carry the page, each a different shape: the AgendaStrip hour rail (Today), the InstrumentCluster cockpit (readout + benchmarked trend line + secondary readout panels + a tertiary micro-readout row), the TickerStrip form line colored by sign (Recent rounds), and MatrixBoard's ruled grid with rank pills (Who needs attention).

## A note on typography before anything else

`src/styles/design-tokens.css` was updated 2026-09-10 (today): Fraunces and General Sans were **removed**. `font-fw-display` and `font-fw-sans` both now resolve to the system SF Pro stack; only `font-fw-mono` still loads a webfont (Fragment Mono). Do not describe anything on this page as "serif" or "editorial." Use only the role names (`font-fw-display` for the h1 and section headings, `font-fw-sans` for body copy, `font-fw-mono tabular-nums` for every numeral), that convention is unchanged and is what this spec uses throughout.

## Region-by-region composition

### 1. Masthead (stage)

Unchanged `ViewHeader`: eyebrow = `todayLabel`, title = `greeting`, description = team name (or the roster-zero onboarding line), `meta` = the existing players/upcoming-events/active-qualifiers pills (`stats.rosterSize`, `stats.upcomingEvents`, `stats.activeQualifiers`, `dashboard-data.ts` `CoachDashboardPayload.stats`, already wired at `FairwayCoachDashboard.tsx:560-576`). Primary action "New event," overflow Menu (Add player / Qualifiers / Invite). No change here, this is the one place on the page that should not carry new visual weight.

### 2. Verdict line (stage), new copy, no new component

One sentence directly under the header, plain text (`font-fw-display text-h2` desktop / `text-h3` phone, 2-line clamp, sentence case, a sentence, never a numeral, so it cannot read as the banned hero-metric template). Built from data already in `enhancedData`, computed once in the parent (no client-only timezone logic duplicated from `TodayPanel`, so no hydration risk):

- event clause: `enhancedData.todayEvents.length` (`dashboard-data.ts:19` `TodayEvent[]`) → `"{n} events on today's schedule."` or `"Nothing on today's schedule."` when 0. Count only, no per-event time formatting, so nothing here needs the client-resolved timezone `TodayPanel` uses.
- pulse clause, only when `improving + stable + declining > 0` (honest, omit rather than claim movement that cannot be classified yet): `enhancedData.teamPulse.improving` / `.declining` (`dashboard-data.ts:50-57`) → `"{improving} players improving, {declining} sliding."`
- signals clause, only when `badges.coachhelm > 0`: `useNotificationBadges().coachhelm` (`src/contexts/notification-badge-context.tsx:23`, provider already wraps this route tree at `src/app/golf/(dashboard)/FairwayDashboardShell.tsx:751`) → `"{n} signals waiting on you."`

Example: "3 events on today's schedule. 3 players improving, 4 sliding. 2 signals waiting on you." No em dashes, no arrows.

### 3. Context toolbar (toolbar)

`Toolbar` (`src/components/fairway/controls/Toolbar.tsx`), `sticky`, `stickyTop` set to the same top-bar-clearing expression `FairwayCoachRoster.tsx:483` already uses (`--golf-mobile-header-offset` plus the hub-subnav offset), AUDIT.md confirms the Toolbar primitive already resolves this to a safe pixel offset internally (both the numeric and calc()-string paths were fixed for the roster crash), so this is copying an established, already-safe pattern, not a new risk.

- `leading` slot: a signals chip, `StatusPill tone="warning" dot` reading "{badges.coachhelm} signals," rendered only when `> 0` (honest, never a fake zero), linking to `/golf/dashboard/intelligence`. This is deliberately the ONLY fact promoted here, the players/events/qualifiers pills stay in the header (region 1), not duplicated.
- `viewToggle` slot: the existing `Segmented` (7D/30D/90D/Season/All, `RANGE_OPTIONS`, `handleRangeChange`) rendered `hidden md:flex` (desktop), plus a `Menu`-triggered `Button` reading "Window · {RANGE_OPTIONS.find(o => o.value === range)?.label}" rendered `flex md:hidden` (phone), both stay in the DOM, CSS-gated, matching the Tasks page's existing Segmented/Sheet-fallback pattern. This is the exact fix REVIEW.md already names for this screen ("range control demoted to a Menu"), it is promoted out of the old Team performance card header into the toolbar instead, since that card no longer exists as a half-width box.

### 4. Operations row, Today | Who needs attention (7/5)

**Today** (left, `lg:col-span-7`). The Surface wrapper is REMOVED from `TodayPanel`'s populated branch (`FairwayCoachDashboard.tsx:1282`) so Today is a bare seam section end to end, this also fixes the still-open phone defect (REVIEW.md row 1: "Clear schedule today." sits at a different indent than the rows below it inside a box) by giving the section one consistent bare treatment in every state, matching the already-bare `nothingAtAll` case.

New: an **AgendaStrip** hour rail sits directly under the "Today" hairline, above `FeaturedEventRow`/`QuietEventRow`, rendered only when `sortedToday.length > 0` (a rail with zero events is dead space, so a genuinely clear day stays the existing quiet sentence with no rail). Data: `todayEvents` mapped to `{ id, label: title, startMinutes, endMinutes, tone }` using the SAME `EVENT_TONE` map already in this file (`FairwayCoachDashboard.tsx:1069`), no new tone vocabulary. `nowMinutes` is mount-gated (`useEffect`, `null` until mount) exactly like `TodayPanel`'s own `tz` state, so server and client never disagree.

**Who needs attention** (right, `lg:col-span-5`). Renamed from "Team pulse" back to "Who needs attention", this is a correction, not an invention: `docs/design/fairway-facelift/screens/coach-home.md`'s own composition diagram already names this section "Who needs attention"; the shipped code drifted to "Team pulse." The outer `<Surface elevation="border">` wrapper (`FairwayCoachDashboard.tsx:975`) is REMOVED: `MatrixBoard` already paints its own full card chrome (`rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]`, confirmed at `MatrixBoard.tsx`'s render root), so the wrapper was a genuine nested-card violation, not a stylistic choice. The heading, KPI band (`improving`/`stable`/`declining`), ranked rows (`topPlayers`, `avg_score`, `rounds`), the "Top mover" line and the "Rankings" link are unchanged in content and logic, only the outer box is gone, so the section reads as heading + hairline + the board's own ruled-grid card, a genuinely different shape from Today's bare rows beside it.

Both grid cells get `items-start` on their shared row (`lg:items-start` on the row's grid div) as a defensive measure against any residual height mismatch between the two columns, now that neither column is forced tall by a chart.

Invite-code / roster-full `InlineNotice`s stay exactly where they are today (directly under this board), unchanged.

### 5. Team performance, the cockpit (instrument band, full width)

This is the one genuinely new visual moment, and it replaces the StatMatrix-plus-chart-in-one-card that REVIEW.md's desktop row 24 flags as a nested-card defect ("a StatMatrix box and a chart box inside the Team performance card"). Moving it to a full-width band below the operations row is also the structural fix for REVIEW.md's desktop row 25 ("the 340px hole"): the tall instrument content no longer lives in a half-width column beside a short Today, so there is nothing left for a short column to leave a hole under.

`<section aria-label="Team performance">` wraps an `InstrumentCluster` (`balance="focal"`, default):

- **primary**: `InstrumentPanel tone="accent" depth="raised"`, the ONE green bezel on the page. `eyebrow`: "TEAM SCORING · {range label}." `children`: a `Readout size="lg"` (`value={scoringAvg}`, `delta={scoringDelta ? { value: scoringDelta.value, caption: seriesDeltaLabel(scoringDelta.points) } : undefined}`, `state={scoringAvg == null ? 'awaiting' : 'live'}`), then the existing lazy `TrendChart` (unboxed inside the bezel, exactly as it is embedded today) with one new prop: `benchmark={{ value: stats.previousAverage ?? stats.teamScoringAverage, label: 'Prior period' }}`, passed only when that value is a finite number. `TrendChart` already supports `benchmark` (`src/components/fairway/charts/TrendChart.tsx:66`) and `stats.previousAverage` (`dashboard-data.ts:118`) is already fetched and currently unused anywhere in this file, this single prop fixes the near-flat-line-in-empty-space problem the component's own domain-fitting logic produces without a benchmark. When `!hasTrend`, the existing `InsufficientData` fallback renders unchanged (same copy, same "widen the window" / "invite players" actions).
- **secondary** (flanking rail, two panels, both `InstrumentPanel depth="base"`, deliberately NOT `RadialGauge`. Verified: `RadialGauge` renders its own internal `InstrumentPanel depth="raised" tone={...'accent'...}` whenever the reading is on the good side of its benchmark (`RadialGauge.tsx`'s render), and exposes no prop to force it neutral, using it here would silently produce a SECOND green bezel whenever GIR is trending well, contradicting "green appears exactly once." A plain `InstrumentPanel depth="base"` + `Readout` gives the same instrument-panel visual family without that risk):
  - GIR panel: `eyebrow="GIR · {range label}"`, `Readout size="md" value={girValue} unit="%" delta={girDelta ? {...} : undefined} state={girValue == null ? 'awaiting' : 'live'}`.
  - Putts/rd panel: same shape, `puttsValue`/`puttsDelta`.
- **tertiary** (foot row, `tertiaryColumns={3}`, drops to 2-up on phone per the primitive's own doctrine, never 1-up): three bare `Readout size="sm"` micro-readouts, Rounds logged (`roundsLogged`), Signals (`badges.coachhelm`, only rendered when the value is present; links to `/golf/dashboard/intelligence`, this inherits the same momentary-zero-before-first-poll behavior the sidebar bell already has product-wide, which is accepted, not a new problem), Rounds this week (`pulse.roundsThisWeek`, nullable, meaning the count query failed; per the file's own honesty convention, OMIT this readout entirely when null rather than rendering a 0 or a dash).

### 6. Ledger row, Recent rounds | Activity (8/4)

**Recent rounds** (left, `lg:col-span-8`). Unchanged position and content, kept in its existing bordered `Surface`, the row's one "card" shape. Two fixes, both additive:

- `TickerStrip`'s container padding changes from `mt-1` to `pt-5` (`TickerStrip.tsx`) so the absolutely-positioned `-top-4` label has room inside the container instead of colliding with the card edge, the confirmed root cause of REVIEW.md's open row 26 defect.
- `TickerItem` gains an additive `tone?: 'good' | 'even' | 'over'` field (`types.ts:163`), computed the same place `tickerItems` already computes `tp` (`FairwayCoachDashboard.tsx` ~L410): `good` when `tp < 0` (bg-accent-500), `over` when `tp > 0` (bg-fw-warning), `even` when `tp === 0` (bg-surface-sunken). When `tone` is absent (the Rounds library's own `TickerStrip` call, its only other consumer), rendering falls back to the current `emphasis`-only behavior unchanged. This turns the strip from "one round highlighted, nine identical dim bars" into a form line that reads by sign.

**Activity** (right, `lg:col-span-4`). `NotificationsLatestModule` gains an additive `frame?: 'card' | 'bare'` prop, default `'card'` (byte-identical to today, so its other consumer, the player dashboard, is unaffected). This page passes `frame="bare"`: the module's internal `<Surface elevation="border" padding="none">` is skipped and its rows render as bare seam rows under the section's own heading + hairline, matching Today's and Who-needs-attention's bare treatment. This is what makes the ledger row read as two different objects (a rounded card, a bare list) rather than two identical cards side by side. Self-fetching, honest-empty (renders nothing while loading or when genuinely empty), unchanged.

Both cells get `lg:items-start` on this row's grid div too, same defensive reasoning as region 4.

## Desktop grid (1440)

```text
ViewHeader ───────────────────────────────────────────── [New event] [⋯]
Verdict line (one sentence, full width)
Toolbar (sticky) ── [signals chip] ──────────────────── [Window: 7D 30D 90D Szn All]

┌ Today (7, bare) ───────────────────┐ ┌ Who needs attention (5) ─────┐
│ AgendaStrip hour rail               │ │ MatrixBoard's own card:      │
│ Featured now/next event             │ │ KPI band + 5 ranked rows      │
│ Remaining today, Next 3 days        │ │ Top mover · Rankings →        │
└──────────────────────────────────── ┘ └───────────────────────────────┘

┌ Team performance, InstrumentCluster, full width (12) ──────────────────┐
│ PRIMARY: accent bezel, Readout(lg) + benchmarked TrendChart              │
│ SECONDARY rail: GIR panel · Putts/rd panel (both base, neutral)         │
│ TERTIARY: Rounds logged · Signals · Rounds this week                     │
└───────────────────────────────────────────────────────────────────────── ┘

┌ Recent rounds (8, boxed) ──────────┐ ┌ Activity (4, bare) ───────────┐
│ TickerStrip (colored by sign)       │ │ seam rows, unread dot         │
│ seam-row list, View all             │ │ View all →                     │
└──────────────────────────────────── ┘ └───────────────────────────────┘
```

Each row is its own CSS grid (already true in the current code, the fix is `items-start` per row plus moving the tall content out of a half-width column entirely, not restructuring into independent flex columns).

## Phone flow (390)

1. ViewHeader (large title collapses into the top bar, unchanged existing behavior; meta facts wrap under the title as today)
2. Verdict line, `text-h3`, 2-line clamp
3. Toolbar, one bare row: signals chip (only if `> 0`) + "Window · {label}" Menu trigger (Segmented never renders on phone)
4. Today, AgendaStrip at 3 hour labels (e.g. 6a / 12p / 6p) instead of desktop's full set, then the existing seam rows
5. Who needs attention, MatrixBoard's own `<940px` column collapse (identity · avg · rounds)
6. Team performance, InstrumentCluster's own narrow-viewport behavior: primary first, secondary rail drops below it, tertiary stays 2-up (never 1-up monolith cards)
7. Recent rounds, `TickerStrip` stays `hidden md:block` (existing, unchanged); seam-row list shows at every width
8. Activity, bare seam rows

## Primitives

**Existing, reused as-is**: `ViewHeader`, `Toolbar`, `Segmented`, `Menu`, `StatusPill`, `MatrixBoard`, `Inset`, `InlineNotice`, `InstrumentCluster`, `InstrumentPanel`, `Readout`, `TrendChart`, `InsufficientData`, `TickerStrip`, `Avatar`, `EmptyState`, `NotificationsLatestModule`.

**New primitive (1, well under the two-new-primitive budget)**: `AgendaStrip`, `src/components/fairway/modules/AgendaStrip.tsx`.

```text
interface AgendaStripEvent { id: string; label: string; startMinutes: number; endMinutes: number; tone: 'accent' | 'warning' | 'info' | 'neutral' }
interface AgendaStripProps {
  events: AgendaStripEvent[];
  rangeStartMinutes?: number;   // default 360 (6am)
  rangeEndMinutes?: number;     // default 1320 (10pm)
  nowMinutes?: number | null;   // mount-gated by the caller
  hourLabels?: number;          // 6 desktop, 3 phone
  className?: string;
}
```

A labeled hour rail with tone-filled event pills positioned by percentage of the visible range, an optional 2px accent "now" tick, and a visually-hidden `<ul>` listing each event's title/time for screen readers. Reduced-motion-guarded fade-in, staggered left to right (`useReducedMotionGuard`, never raw `useReducedMotion`). Add a `registry.ts` entry (category `data-viz`, archetype `A`, `bestFor: ["a compact same-day hour axis for a day's events"]`, `avoidFor: ["multi-day ranges", "more than ~8 events (use Filmstrip)"]`) and export it from `src/components/fairway/index.ts`.

**Additive props on existing components (not counted against the primitive budget)**: `NotificationsLatestModule`'s `frame?: 'card' | 'bare'`; `TickerItem`'s `tone?: 'good' | 'even' | 'over'`.

## Removals

1. The old "Team performance" half-width card (Segmented header + 4-cell StatMatrix + boxed TrendChart), replaced by the full-width InstrumentCluster band. This directly answers REVIEW.md's open desktop rows 24 and 25.
2. `TeamPulseBoard`'s outer `<Surface elevation="border">` wrapper, `MatrixBoard` already renders its own card; the wrapper was a nested-card violation.
3. `TodayPanel`'s populated-branch `<Surface elevation="border">` wrapper, Today becomes bare seam rows in every state, fixing REVIEW.md's open phone row 1 (mismatched indentation between "Clear schedule today." and the rows under it).
4. The section name "Team pulse", reverted to "Who needs attention," correcting drift from `coach-home.md`'s own composition diagram.
5. The Segmented range control's old home inside the (now-removed) Team performance card header, promoted into the sticky Toolbar's `viewToggle` slot (desktop) / a Menu trigger (phone), per REVIEW.md's own already-decided fix for this exact control.
6. ViewHeader's meta facts are NOT duplicated into the toolbar (a deliberate simplification versus an earlier draft of this idea), they stay exactly where they are today; the toolbar carries only the one new fact (signals) that has nowhere else to live persistently while scrolling.

## Deviation notes (documented inline, same convention `TeamPulseBoard` and `RadialGauge` already use in this codebase)

- This spec pairs Today with Who-needs-attention in row 1 and promotes Team performance to its own full-width band, which differs from `coach-home.md`'s original composition diagram (Today | Team pulse in row 1, Who-needs-attention in row 2). The change is intentional: it is the structural fix for the two open desktop REVIEW.md defects on this screen, and it is what actually answers the owner's "where is the architecture" complaint, a half-width chart card cannot be both compact and legible, a full-width band can be both.
- `InstrumentCluster`/`InstrumentPanel`/`Readout` are registry archetype C (analytical instrument) and this is archetype A (intelligence overview). This is a deliberate cross-archetype use, consistent with how this exact file already documents `TeamPulseBoard`'s own deviation from a literal MatrixBoard-only reading.

## Implementation plan

### Files to edit

1. `src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx`, the composition rewrite described above: import `useNotificationBadges`; add the verdict-line `useMemo`; add the `Toolbar` with the signals `StatusPill` and the Segmented/Menu window control; remove `TodayPanel`'s Surface wrapper and insert `AgendaStrip`; rename `TeamPulseBoard`'s `aria-label`/heading to "Who needs attention" and drop its outer `Surface`; extract the `InstrumentCluster` cockpit into its own function (mirroring how `TeamPulseBoard` is already its own function) and move it to a new full-width row between the operations row and the ledger row; pass `stats.previousAverage ?? stats.teamScoringAverage` as `TrendChart`'s `benchmark`; change the ledger row from 7/5 to 8/4 and pass `frame="bare"` to `NotificationsLatestModule`; add `tone` to the `tickerItems` `useMemo`; add `items-start` to both row grids.
2. `src/components/fairway/modules/TickerStrip.tsx`, container `mt-1` → `pt-5`; bar fill picks `tone` first, falls back to `emphasis`.
3. `src/components/fairway/modules/types.ts`, add `tone?: 'good' | 'even' | 'over'` to `TickerItem`.
4. `src/components/fairway/notifications/NotificationsLatestModule.tsx`, add `frame?: 'card' | 'bare'` (default `'card'`); skip the `Surface` wrapper when `'bare'`.
5. `src/components/fairway/registry.ts`, add the `AgendaStrip` entry.
6. `src/components/fairway/index.ts`, export `AgendaStrip`.
7. `src/components/fairway/pages/dashboard/FairwayDashboardSkeleton.tsx`, this file is SHARED with the player dashboard and is deliberately generic (its own header comment says so), so this is a bounded, not a 1:1, update: change row 1's right-column shape from "KPI 2x2 + chart-shaped block" to a ranked-list shape (KPI band + rows, matching Who-needs-attention's silhouette), and insert one new full-width chart/cluster-shaped block between row 1 and the existing two-column area, standing in for the new Team performance band. Leave the "two balanced content columns" section's shape as-is (already generic enough for the new 8/4 ledger row).
8. `src/components/fairway/pages/dashboard/FairwayCoachDashboard.composition.test.tsx`, rewrite per the Tests section below.

### Files to create

1. `src/components/fairway/modules/AgendaStrip.tsx`, the new primitive.
2. `src/components/fairway/modules/AgendaStrip.test.tsx`, a11y hidden-list contents, tone-to-fill mapping, reduced-motion guard, "now" tick only renders when `nowMinutes` is provided.

### Data plumbing

No new server actions or new fields. Every value used above already flows through `CoachDashboardPayload` (`src/app/golf/actions/dashboard-data.ts`) into `enhancedData`, already destructured in this file: `todayEvents`, `teamPulse.{improving,stable,declining,roundsThisWeek,topMover}`, `stats.{rosterSize,upcomingEvents,activeQualifiers,teamScoringAverage,previousAverage}`, `sparklines.{scoringAvg,girPct,puttsPerRound}`, `recentRounds`, `topPlayers`, `teamScoringTrend`. The one new wire is `useNotificationBadges()` (`src/contexts/notification-badge-context.tsx`), reachable with no new provider because `NotificationBadgeProvider` already wraps this route tree (`FairwayDashboardShell.tsx:751`), this file simply has not imported the hook yet.

Null handling, stated as data mapping, not as a caveat: `stats.rosterSize`/`upcomingEvents`/`activeQualifiers` are nullable (a failed count is not a zero), omit the fact, never render a dash or a fake 0; unchanged from today's `ViewHeader` meta logic. `teamPulse.roundsThisWeek` nullable (null means the count query failed), omit the tertiary readout entirely when null. `badges.coachhelm` defaults to 0 from `EMPTY_BADGES` until the provider's first 45-second poll resolves, the signals chip and tertiary readout inherit the same brief zero-before-first-poll window the sidebar bell already has everywhere in the product; accepted, not a regression introduced here.

### Tests

Rewrite `FairwayCoachDashboard.composition.test.tsx`'s region assertions:

- Query regions by name: `"Today's schedule"`, `"Who needs attention"` (renamed from `"Team pulse"`), `"Team performance"` (name unchanged, position changed), `"Recent rounds"`, `"Latest notifications"` (unchanged).
- DOM order: `today` precedes `whoNeedsAttention` (same operations row, left to right), `today.compareDocumentPosition(whoNeedsAttention) & FOLLOWING` truthy.
- `whoNeedsAttention` precedes `teamPerformance` (operations row precedes the full-width instrument band), `whoNeedsAttention.compareDocumentPosition(teamPerformance) & FOLLOWING` truthy.
- `teamPerformance` precedes `recentRounds` (instrument band precedes the ledger row), same pattern.
- `recentRounds` precedes `latestNotifications` (ledger row, left to right), same pattern.
- Keep the existing "never renders the removed containers" assertions (`Window` eyebrow, `Schedule` heading, `Top Performers` heading all absent) and add: no heading named `"Team pulse"` (confirms the rename actually landed, not just an additional label).

Add/extend: `AgendaStrip.test.tsx` (new, above); one or two new cases in `TickerStrip`'s existing test file for `tone` rendering and for the no-`tone` fallback staying byte-identical (protects `FairwayRoundsLibrary.tsx`'s untouched call site); one new case in `NotificationsLatestModule`'s test coverage (if none exists today, add a minimal one) for `frame="bare"` skipping the `Surface`, and confirm the player dashboard's call site is left on the `'card'` default.

One line acknowledging scope overlap: `home-polish` owns several of the same open REVIEW.md rows on this exact screen (the 340px hole, the TickerStrip clipping, the phone Segmented-to-Menu demotion), this spec resolves all of them as part of the same composition change, so implementation should be coordinated with (or handed to) that lane rather than done twice.

## Result (shipped 2026-09-10)

Implemented as specified, region by region:

- **Stage** — masthead unchanged. The verdict line is a new `useMemo` in `FairwayCoachDashboard.tsx`, three optionally-present clauses (today's event count, the improving/sliding pulse split gated on `tracked > 0`, the CoachHelm signals count gated on `badges.coachhelm > 0`) joined into one sentence.
- **Toolbar** — sticky, bare `Toolbar` with the signals `StatusPill` in `leading` (rendered only when `badges.coachhelm > 0`) and the performance window as a `Segmented` (desktop) / `Menu` (phone) pair in `viewToggle`, both always in the DOM, CSS-gated. Wrapped in its own `<div>` — see Deviations.
- **Operations row** — `TodayPanel` (`lg:col-span-7`) beside `WhoNeedsAttentionBoard` (`lg:col-span-5`, renamed from `TeamPulseBoard`), `lg:items-start` so neither column stretches to match the other's height. `TodayPanel`'s outer `Surface` is removed; a new `AgendaStrip` hour rail renders above the event rows whenever `sortedToday.length > 0`. `WhoNeedsAttentionBoard`'s outer `Surface` is removed; `MatrixBoard` supplies its own ruled-grid chrome directly under a heading + accent hairline.
- **Instrument band** — a new `TeamPerformanceCluster` function renders a full-width `InstrumentCluster`: a focal `InstrumentPanel tone="accent" depth="raised"` (Readout + benchmarked `TrendChart`, benchmark = `stats.previousAverage ?? stats.teamScoringAverage`), a secondary rail of two `depth="base"` panels (GIR, Putts/round), and a tertiary foot row (Rounds logged, Signals, Rounds this week — the last omitted when the count is `null`, never rendered as a fake 0).
- **Ledger row** — Recent Rounds (`lg:col-span-8`, still the row's one boxed `Surface`) beside `NotificationsLatestModule frame="bare"` (`lg:col-span-4`). The `TickerStrip` now colors each bar by to-par sign (`good`/`even`/`over`) instead of one bar highlighted among identical dim ones.

New primitive: `AgendaStrip` (`src/components/fairway/modules/AgendaStrip.tsx`) — a labeled hour rail with tone-filled event pills, an optional "now" tick, dual desktop/phone tick-label density (CSS-gated, both always in the DOM), and a `sr-only` list carrying the same content for assistive tech. Registered in `registry.ts` (archetype A, replaces "a plain seam list as the only reading of today").

### Deviations from the written plan above

- **Toolbar wrapper div (new, not in the original plan).** `Toolbar` returns a two-element fragment when `sticky` (a zero-height intersection sentinel ahead of the row). Rendered as a direct child of this page's `gap-8`/`gap-10` flex column, the sentinel and the row each became their own flex item and each earned a full flex gap, opening an ~80px blank band between the verdict line and the toolbar's controls. Fixed by wrapping the `Toolbar` call in a plain `<div>`, the same mitigation `FairwayCalendarHero.tsx` already uses around its own sticky `Toolbar`. Confirmed by direct DOM measurement (sentinel and row bounding boxes were 40px apart before the fix, adjacent after) and by the desktop capture.
- **`InstrumentPanel tone="accent"`'s bezel is a quiet green hairline border, not a filled or glowing bezel.** This is the primitive's own documented design (`instrument-panel.module.css`: "a quiet green hairline. Nothing more (no ring, no glow)"), not a gap introduced here. It reads as intended: restrained, not a hero-metric treatment.
- **`AgendaStrip` is not visible in the captured screenshots.** The demo coach account (`Nick Rini` / Demo University Golf) has a clear schedule today (verdict line: "Nothing on today's schedule…"), and `AgendaStrip` only mounts when `sortedToday.length > 0` (a rail with zero events is dead space, so a genuinely clear day stays the existing quiet sentence). The component itself is covered by 5 passing unit tests (`AgendaStrip.test.tsx`) exercising the sr-only list, tone-fill mapping, now-tick gating, and reduced-motion behavior; it has not been visually confirmed in situ against real "today" events, since seeding one would mean writing to shared account data outside this task's scope.
- **Tertiary foot row renders as one bordered "grouped ledger" on phone**, not bare micro-readouts. This is `InstrumentCluster`'s own documented phone-tier behavior (`TERTIARY_PHONE_GROUP`, the fix for an earlier Mobile Doctrine rule-11 violation where each tertiary readout became its own full-width card) — confirmed correct, not something this pass changed.

### Verification

- `eslint` on every changed/created file: 0 errors, 0 warnings (two initial warnings — two `text-[10px]` arbitrary values in `AgendaStrip.tsx`, one unused `signedDelta` helper in `FairwayCoachDashboard.tsx` — fixed).
- `npx vitest run --maxWorkers=1 src/components/fairway/pages/dashboard src/components/fairway/charts src/components/fairway/modules src/test/static`: 41 files / 382 tests passed, 0 failed (a transient failure from a concurrent session's own in-progress registry entries resolved itself by the final run).
- `npx tsc --noEmit -p tsconfig.json`: 0 errors in any file this pass owns. Two `TS2724` errors remain in `src/components/golf/coachhelm/round-review/ReviewBreakdown.tsx` / `ReviewHero.tsx`, a different concurrent session's own mid-refactor state, outside this pass's files.
- Visual capture (`scripts/ui-intelligence/capture-golf-facelift.mjs --persona=coach --only=home`), both viewports, iterated once after the initial capture surfaced the Toolbar-gap and TickerStrip-tone issues above:
  - `ui-intelligence/facelift/captures/coach/home__desktop__fold.png`
  - `ui-intelligence/facelift/captures/coach/home__desktop__full.png`
  - `ui-intelligence/facelift/captures/coach/home__phone__fold.png`
  - `ui-intelligence/facelift/captures/coach/home__phone__full.png`

### Addendum (2026-09-10): `FairwayDashboardSkeleton.tsx`

`FairwayDashboardSkeleton` is the shared pre-role `loading.tsx` shell for both
`/golf/dashboard` roles (role isn't known until the server resolves the
session). It was rewritten in the same pass to shape-match this composition
where it favors coach — the new verdict-line bar, the bare toolbar row with
one right-pinned pill, and the 8/4 ledger row (a bar-strip + list Panel
beside a bare list) — and to shape-match `FairwayPlayerDashboard`'s own v2
pass (landed separately, `2f7dd217b`) where it favors player instead — row
1's `SectionTitle` + Ribbon-shaped 180px panel on the left, a schedule
Surface + bare task rows on the right, and a flat `StatMatrix`-shaped KPI strip at
every width for the full-width band. Neither role gets a perfect mirror
everywhere; the file's own doc comment names exactly which role each section
favors and what the other role's accepted mismatch looks like on handoff —
the same trade-off principle this file has used since 2026-07-22, now applied
across the whole page instead of only row 1. Verified with a new
`FairwayDashboardSkeleton.test.tsx` (a11y contract + "shapes only, no visible
text") and, since a loading boundary is transient, with a throttled-navigation
Playwright capture at both 1440 and 390 confirming the six sections render in
the intended shapes and proportions with no overflow.

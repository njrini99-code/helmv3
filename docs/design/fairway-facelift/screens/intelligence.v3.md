<!-- markdownlint-disable MD013 -->
# Intelligence (coach), /golf/dashboard/intelligence — v3 spec

Supersedes `intelligence.v2.md`, which predates `LANGUAGE.md` and composes the
screen as a green `Spine` (identity, hero, priorities, ledger) beside a
`ResizableWorkspace` three-pane workspace (queue | dossier | CoachHelm) — the
bento/spine architecture LANGUAGE.md's "Why the first pass failed" section
retires. This spec follows LANGUAGE.md's field-sheet anatomy and its own
per-page table row for Intelligence: stage = leak ranking by category;
readouts = signals count by severity; ledger = triage queue; table = signals.
Reference implementation: `FairwayCoachDashboard.tsx` (home),
`coach-home-parts.tsx` / `coach-home-logic.ts` (parts/logic split),
`ScoreField.tsx` (instrument geometry precedent). Entry point read for this
spec: `TriageDesk.tsx`, its loader
`src/app/golf/(dashboard)/dashboard/intelligence/page.tsx`, the pure adapter
`buildTriageViewModel.ts`, the frozen contract
`src/lib/coachhelm/signal-grouping.ts`, and `src/components/fairway/registry.ts`.

This spec covers only the default `?view=signals` composition. The page's two
sibling views reached from the same `ViewSwitch` — Players, Effectiveness —
are unchanged and out of scope; see "What this deletes" for their explicit
non-deletion.

## The question

Where is the team bleeding strokes, and who needs the coach's attention
first.

## Masthead

Bare on the canvas, built like `FairwayCoachDashboard.tsx`'s masthead, not the
current `ViewHeader` (`TriageDesk.tsx:456-494`).

- **Eyebrow**: `lastScanLabel` (`formatRelativeScanTime`,
  `buildTriageViewModel.ts:244-256`, called with the server-seeded `now` prop,
  `TriageDesk.tsx:329`) — the same value the current `ViewHeader`'s `eyebrow`
  already shows (`TriageDesk.tsx:461`). Degrades to "No scans yet" when
  `scannedAt` is null.
- **Title**: `surfaceName('brief')` = "Brief" (`surface-registry.ts:95`) —
  unchanged; matches the breadcrumb leaf for this route, the reason
  `TriageDesk.tsx:465` already uses it over a hardcoded string.
- **Verdict**, `text-h3` regular, max 64ch, a `VerdictPart[]` with real
  `href`s — a new pure function `buildIntelligenceVerdict()`, sibling of
  `buildVerdict` (`coach-home-logic.ts:158-189`), built only from facts
  `buildBriefVerdict` / `buildSpineVerdict` already compute
  (`buildTriageViewModel.ts:203-240`), with links added on top (today both
  return a plain string with no `href`s — the gap this spec closes).

  **Template** (branches mirror `buildBriefVerdict`'s own cascade,
  `buildTriageViewModel.ts:203-222`, verbatim except for the added links):

  - **A — all clear** (`groups.length === 0`): "All clear. No open signals
    right now." (verbatim, `:205`) — no links, nothing to link to.
  - **B — urgent signals open** (`counts.urgent > 0`): "{urgent} urgent
    {signal|signals} need review across {playersFlagged} {player|players}.
    {topPlayerGroup.playerName} needs the most attention right now."
    `{urgent}` links to `?filter=urgent` (`toggleQueueFilter` /
    `navigate`, `TriageDesk.tsx:435-441`, the same `QueueFilterKey` chip the
    Toolbar already sets, `:551-557`). `{topPlayerGroup.playerName}` links to
    `/golf/dashboard/roster/{topPlayerGroup.playerId}`
    (`topPlayerGroup = groups.find(g => g.playerId !== null)`, `:207`).
    **Fallback** when `topPlayerGroup` is null (every urgent signal is
    `team_synthesis`-only, no single player attributed): drop the second
    sentence — mirrors `:211`'s own `who = topPlayerGroup ? ... : ''`.
  - **C — nothing urgent, a player leads the queue** (`counts.urgent === 0 &&
    topPlayerGroup`): "Nothing urgent. {topPlayerGroup.playerName} has the
    highest-priority open signal." (`:217-218`), name linked as above.
  - **D — nothing urgent, only team-level signals** (`counts.urgent === 0 &&
    !topPlayerGroup`): "{totalSignals} open {signal|signals} to review.
    Nothing urgent right now." (`:220-221`), `{totalSignals}` links to
    `?filter=all`.
  - **Append**, any branch except A, when `outcomesAwaiting > 0`
    (`TriageDesk.tsx:312`, `Math.max(0, adoption.generated -
    adoption.actedUpon)`): " {outcomesAwaiting} {outcome|outcomes} awaiting a
    resolved result." (`buildSpineVerdict`, `:237-239`), `{outcomesAwaiting}`
    links to `?view=effectiveness`.

- **Facts line**: none. Unlike Home, this screen's current header carries no
  third mono line, and every other current-state number already has a home
  in the readouts column below — a facts line here would only restate them
  in a different type size.

## The stage

**Instrument: `RailBars`** (`src/components/fairway/modules/RailBars.tsx`,
registered `registry.ts:209`, `bestFor: 'rate vs benchmark, several rows'`) —
one row per raw signal category, ranked by strokes at risk.

**Data**: a new pure aggregation, `aggregateCategoryLeaks(groups)`, over
fields that exist today — not a new fact, a new sum of existing ones:

```
for each group in groups, for each signal in group.signals
  where signal.kind !== 'team_synthesis'   // signal-grouping.ts:16-23 — a
                                            // roster roll-up double-counts
                                            // the per-player leaks already
                                            // in this same list
  bucket by signal.category                 // buildTriageViewModel.ts:137's
                                            // distinctCategories, the raw
                                            // taxonomy — never the 5 fixed
                                            // TeamCategory buckets
  strokesAtRisk = sum(|signal.strokeImpact|) over signals with
                  strokeImpact !== null, else null when NONE in the
                  bucket has a measured impact (signal-grouping.ts:80-82:
                  zero is a real reading, null is "we do not know" — must
                  not collapse the two)
  signalCount   = bucket.length (includes impact-unknown signals)
```

**What each mark encodes**:
- **Position/length** (`pct`, RailBars' fill width) — that category's
  `strokesAtRisk` as a percentage of the largest measured `strokesAtRisk`
  across all categories (`clampPct`, `modules/logic.ts:4`, already imported
  by `RailBars.tsx:19`). A category with no measured impact renders `pct=0`,
  `dim=true`.
- **Right-aligned mono value** — `"{strokesAtRisk.toFixed(1)} str/rd"`, or
  the plain text "Not measured" when every signal in the bucket has a null
  `strokeImpact`.
- **Sample annotation** (`row.sample`, quiet, one step down) — signal count
  for that category, e.g. "(7 signals)" — the same "a rate with no
  denominator is not actionable" precedent `RailBars.tsx:67-77` already
  documents for its other call site (the putting distance-bucket breakdown).
- **Color** — fill `bg-fw-warning` (a leak is the LANGUAGE.md "amber ...
  over par or declining" semantic, never green); the "not measured" rows use
  `bg-fw-warning-bg` (`tailwind.config.ts:114-115`, the existing lighter
  tint of the same hue — no new token). Rail track unchanged
  `bg-surface-sunken` (`RailBars.tsx:45`).
- **Shared tick** (`tickPct`, one position drawn on every row) — the
  across-category mean of `strokesAtRisk` among categories with a measured
  value, as a percentage of the same max used for `pct`. Omitted when fewer
  than two categories have a measured value (a mean of one value coincides
  with that value's own bar tip and is not an informative reference).

**Baseline**: the rail's own left edge, `pct = 0`, is the true zero — there
is no negative side. `evidence.strokes_impact` is documented as "Magnitude
only — sign just indicates direction"
(`src/lib/coachhelm/v3/ranking/score.ts:76-77`), and the codebase's own
ranking always takes `Math.abs()` of it (`cappedStrokesImpact`,
`score.ts:44-49`); the roster roll-up generator sums `|strokes_impact|` the
same way (`src/lib/coachhelm/v3/insights/team-synthesis.ts:21`). This is
therefore a one-sided magnitude ranking, never a diverging tornado with a
green "gained" side — see Risks.

**What a mark links to**: the whole row (rail + label) navigates to
`?filter=category:{category}` — the existing `QueueFilterKey` category
branch (`matchesFilter`, `buildTriageViewModel.ts:100`), the exact value the
Toolbar's Category `FilterMenu` already builds (`TriageDesk.tsx:558-570`) —
pre-filtering the ledger's Queue column and the table below to that category.

**Order and cap**: descending by `strokesAtRisk`; categories with no
measured impact sort after every measured one, by `signalCount` descending,
then alphabetically. Capped at 8 rows. `distinctCategories` has no fixed
cardinality ceiling — overflow categories are not hidden, only de-prioritized
off the rail; every signal in an overflow category still appears in the
table.

**Degradation**:
- **Zero categories** (`groups.length === 0`, all clear): no `RailBars` at
  all — one line, the same precedent `ScoreField`'s own degrade uses
  (`FairwayCoachDashboard.tsx:409-422`): "No open signals. Nothing to rank."
- **One category**: a single `RailBars` row, tick omitted (see above).
- **Every category unmeasured** (`maxKnown === 0`): every row renders
  `pct=0`, `dim=true`, "Not measured" — a truthful zero-width rendering, not
  a fabricated number. The stage header's one-line legend (LANGUAGE.md's
  instrument-header slot) switches to "No measured stroke impact yet —
  ranked by signal count," and the sort key falls back to `signalCount` desc
  for this case only.

**Why this instrument beats a table**: ranking magnitude across 3-8
categories is a pre-attentive length comparison a bar affords and a column
of numbers does not — a coach reading five numbers must sort them mentally;
five bar lengths rank themselves. The sample annotation rides the same row
so a category built on one low-confidence signal reads differently from one
built on seven, without a second chart. The table beneath still holds the
exhaustive per-signal list; the rail's only job is the one-glance ranking a
table forces the reader to compute.

**Row height / geometry**: unchanged `RailBars` geometry — 9px rail
(`RailBars.tsx:45`), `gap-1.5` between rows (`:28`), each row a CSS grid
`labelWidth px / 1fr / minmax(38px, max-content)` (`:42`); `labelWidth`
widened from the 56px default to 96px to fit the longest real category label
(`formatCategoryLabel` output, e.g. "Short Game").

**Entrance motion**: unchanged — `RailBars`'s own staggered slide/fade
(`opacity 0→1, x -6→0`, `DURATION.short`, `EASE_CINEMATIC`, `stagger(i)`,
reduced-motion guarded via `useReducedMotionGuard`, `RailBars.tsx:24-34`).

**Legend** (LANGUAGE.md's stage-header "one-line legend" slot, directly under
the overline/title — not one of the four readouts, see below): a thin
segmented hairline bar, one segment per `SignalSeverity`
(`SEVERITY_ORDER`, `signal-grouping.ts:58`), sized by its share of
`groups.flatMap(g => g.signals).filter(s => s.kind !== 'team_synthesis')`,
built the same way `AttentionLedger`'s segmented mix bar already is
(`coach-home-parts.tsx:182-195`). Colors match `SEVERITY_DOT`
(`SignalRow.tsx:21-26`): urgent/high `bg-fw-danger`, medium `bg-fw-warning`,
low `bg-text-tertiary/50`. The urgent+high segment links to `?filter=urgent`
(the only severity chip that exists, `BASE_QUEUE_FILTERS`,
`buildTriageViewModel.ts:79-83`); medium/low are unlinked — no chip exists
for them and inventing one is out of scope.

## Readouts

At most four, in the stage's right-hand column (`FieldReadouts`,
`coach-home-parts.tsx:102-134`, reused verbatim — generic over
`ReadoutItem[]`, no new component). Deliberately **not** the four
severity-count buckets (Urgent/High/Medium/Low): four counts of the same kind
of fact, stacked in a column instead of a grid, is still the banned "big
number, small label" tile — the severity breakdown already lives in the
stage's own legend above. These four are different kinds of fact:

1. **Open signals** — `groups.reduce((n, g) => n + g.signals.length, 0)`
   (`TriageDesk.tsx:500`, the value the retired Spine's hero used). Fewer is
   better. Links to `#signals-table` (in-page anchor). No numeric delta
   today — see Risks / `newFields`.
2. **Players flagged** — `counts.playersFlagged`
   (`computeBriefCounts`, `buildTriageViewModel.ts:187-196`). Fewer is
   better. Links to `#ledger-players`. No numeric delta today.
3. **Outcomes awaiting** — `outcomesAwaiting` (`TriageDesk.tsx:312`,
   null-safe via `summarizeAdoption`'s `generated=0, actedUpon=0` degrade).
   Fewer is better — it means prescriptions are getting acted on. Links to
   `?view=effectiveness`. No numeric delta today.
4. **Last scan** — `lastScanLabel` (`formatRelativeScanTime`,
   `buildTriageViewModel.ts:244-256`). More recent is better — a stale scan
   means every number above it may already be stale. Degrades to "No scans
   yet." Not linked (a timestamp, not a navigable list). Needs no stored
   snapshot: its own value already encodes freshness, unlike 1-3.

None carries a sparkline: this loader has no per-metric historical series
behind any of the four (unlike Home's `enhancedData.sparklines`), and
drawing one would be a fabricated series.

## The ledger row

Three bare columns, `divide-x divide-border-subtle` on `lg`, unequal widths
**5/3/4** on a 12-column grid — the same ratio `FairwayCoachDashboard.tsx`'s
own ledger row uses, matching LANGUAGE.md's per-page table cell for
Intelligence ("Triage queue"). None of the three repeats a category-level
number the stage shows — the stage aggregates by category; each column below
aggregates by something else (signal, player, prescription).

**Column 1 — Queue (5/12)**, id `ledger-queue`. Rows: the top 6 signals
across every group, in the same worst-first, most-recoverable-first order
`groupSignals` already produces (`signal-grouping.ts:255-276`) — no re-sort.
Each row: a `SeverityChip` (`SignalRow.tsx:30-37`) + player name or "Team"
(`group.playerName`) + the claim, one line, truncated
(`toCoachVoice`, `SignalRow.tsx:19`). Row link: opens the `DrillPanel` for
that signal (same canonical detail surface the table's rows open — see
below, not a second one). Header count: total open signals — the same
number Readout 1 shows, which is fine (`SectionHead`'s own convention
already restates a count in its header; the rule against repetition is
about the stage's per-category numbers, not a section title). Empty: "All
clear. No open signals." (branch A verbatim).

**Column 2 — Players (3/12)**, id `ledger-players`. Rows:
`groups.filter(g => g.playerId !== null)`, already attention-ordered
(`signal-grouping.ts:290-294`), capped at 6. Each row: player name +
`worstSeverity` chip + that player's signal count (`group.signals.length`)
— a per-player tally the category-aggregated stage cannot show. Row link:
`/golf/dashboard/roster/{playerId}`. Empty: "No players flagged." (only
reachable in branch D, when every open signal is `team_synthesis`).

**Column 3 — Focus areas (4/12)**, id `ledger-focus`. Rows: active /
in-progress focus areas
(`playersDrillProps.focusAreas.filter(fa => fa.status === 'active' || fa.status === 'in_progress')`,
`TriageDesk.tsx:313-315`), capped at 6. Each row: player name + focus area
title — what is already prescribed, the one fact none of the other columns
or the stage carry. Row link: `?view=players&player={id}&playersTab=areas`
(the exact `navigate` call the current Prescribe action already makes,
`TriageDesk.tsx:424`). Header count: `activeFocusAreaCount`
(`TriageDesk.tsx:313-315`, the value the retired Spine's ledger row showed
as "Focus areas active"). Empty: "No active focus areas."

## The table

"Signals" — dense, full-width `<table>`, id `signals-table`, uppercase
caption header over a `border-strong` rule, hairline rows, matching
`RoundsLedgerTable`'s construction (`coach-home-parts.tsx:243-289`). Mono
numerals right-aligned; the strokes column colors amber when a value is
present, plain tertiary text for "Not measured" (there is nothing to color
green here — see the stage's baseline note).

| Column | Align | Source | Hidden below |
|---|---|---|---|
| Severity | left, chip | `SeverityChip` (`SignalRow.tsx:30-37`) | always visible |
| Player | left | `group.playerName` (or "Team") | always visible |
| Claim | left | `toCoachVoice(signal.claim, subjectName)`, one line, truncated (`SignalRow.tsx:19`) | always visible |
| Category | left | `formatCategoryLabel(signal.category)` (`buildTriageViewModel.ts:312-318`) | `md` |
| Strokes | right, mono | `signal.strokeImpact != null ? \`${Math.abs(signal.strokeImpact).toFixed(2)} str\` : 'Not measured'` (`signal-grouping.ts:31`) | always visible |
| Occurrences | right, mono | `signal.supersededCount + 1` when `supersededCount > 0` (precedent: `SignalDossier.tsx:201-205`), else blank | `lg` |

**Row link**: the whole `<tr>` opens a `DrillPanel`
(`registry.ts:95-99` — `examples: ['Signals', ...]` is already this
screen's own named use case) appended directly below the table, in place of
the retired `ResizableWorkspace` center/right panes. Content inside: the
same real fields `SignalDossier.tsx` renders today — claim, `EvidencePanel`
(`SignalDossier.tsx:33,196`), the strokes figure
(`SignalDossier.tsx:209-213`), the Review/Dismiss/Prescribe actions, and the
related-context sections (recent trend, other open signals for this player,
focus areas, active goals) — as plain typeset sections inside the one
`DrillPanel` surface instead of four separate bordered `DossierSection`
boxes (`SignalDossier.tsx:79-81`, used at `:251,268,290,309`). On phone,
`DrillPanel` is already documented as a bottom sheet (`registry.ts:98`) —
the same mobile treatment `SignalDossier`'s current `Sheet` wrapper gives it
today (`TriageDesk.tsx:641-668`), a one-for-one swap.

**Row count**: top 10 by the same worst-first order, "View all N" below.
Since this table is already the only, canonical location for the full
signal list on this route (unlike Home's Rounds table, which links out to a
separate rounds-library route), "View all N" expands the same table in
place rather than navigating anywhere. `N` = the current filter's total,
the same value `countForFilter` already computes for the Toolbar's chip
counts (`buildTriageViewModel.ts:131-133`).

**Toolbar above it**: unchanged — the existing `Toolbar` with `ViewSwitch` +
Severity/Category `FilterMenu`s (`TriageDesk.tsx:539-574`), now sitting
directly above this one table instead of above the retired
`ResizableWorkspace`.

## Phone

Same order, one column, per LANGUAGE.md's phone rule.

1. **Masthead**: unchanged pattern — eyebrow row wraps, verdict wraps at
   phone width.
2. **Stage**: the severity-mix legend stays one row (already a thin bar, not
   a grid). The four readouts become a 2×2 typographic grid above the rail
   (`FieldReadouts`'s own existing `grid-cols-2` phone layout,
   `coach-home-parts.tsx:104`, unchanged). `RailBars` rows stay full width,
   one per line — the primitive already renders as a vertical list, no
   layout change needed.
3. **Ledger row**: the three columns stack full width, `divide-y` replacing
   `lg:divide-x` (the same `grid-cols-1` / `lg:grid-cols-12` mechanism
   `FairwayCoachDashboard.tsx:434` already uses).
4. **Toolbar**: unchanged from today's phone behavior
   (`Toolbar`'s own documented mobile pattern, `registry.ts:104`, "one bare
   row, overflow into a sheet"). `ViewSwitch` is kept as-is on phone rather
   than converted to a `Menu` (LANGUAGE.md's generic phone note for a view
   control) — a deliberate, cited exception: `ViewSwitch.tsx:20-29`
   documents that its cmd/ctrl/shift/middle-click-opens-new-tab contract and
   its own test (`getByRole('link', { name: 'Players' })`) depend on real
   anchors, which a `Menu` cannot replicate.
5. **Table**: `Severity`, `Player`, `Claim`, `Strokes` stay visible;
   `Category`, `Occurrences` hide via `hidden md:table-cell` /
   `hidden lg:table-cell` (plain CSS, `RoundsLedgerTable`'s own mechanism,
   `coach-home-parts.tsx:250-257`). Row tap opens the same `DrillPanel`,
   itself the bottom sheet on phone (`registry.ts:98`) — no separate mobile
   branch to write.

Every phone/desktop split above is a CSS class or a primitive's own built-in
responsive behavior. The two client-only breakpoint hooks on this screen
today — `isDesktopSpine` (`useMediaQuery('(min-width: 940px)')`,
`TriageDesk.tsx:140`) and `isWideWorkspace`
(`useMediaQuery('(min-width: 1536px)')`, `TriageDesk.tsx:144`) — are deleted
along with the `Spine` / `ResizableWorkspace` they gate (`priorities`,
`ledger`, `defaultCollapsed` props at `TriageDesk.tsx:502,504-513,626`); no
client-measured width remains on this screen after this spec.

## What this deletes

- `Spine` (`TriageDesk.tsx:497-530`) — the entire green identity / hero /
  priorities / ledger / urgent-signal block, including its `eyebrow`,
  `hero`, `priorityItems` (`:330-340`), its five-row ledger (`:503-513`),
  and the urgent-signal children block (`:516-529`). Every real fact it
  carried (open signal count, players flagged, outcomes awaiting, rounds
  logged, focus areas active, last scan) is now a readout, a stage legend
  segment, or a ledger row — none dropped, none duplicated as decoration.
- `isDesktopSpine` / `isWideWorkspace` (`TriageDesk.tsx:140,144`) and every
  prop they gate — a client-only breakpoint branch, the pattern LANGUAGE.md
  bans outright.
- `ResizableWorkspace` (`TriageDesk.tsx:594-673`) — its `left` / `center` /
  `right` panes, `defaultLayout`, `minSizes`, `collapsible`,
  `defaultCollapsed`, and its persisted `storageKey="coachhelm-signals-workspace-v2"`
  layout. Replaced by the ledger's Queue column + the Signals table + an
  inline `DrillPanel`.
- `SignalQueue.tsx`'s own bordered wrapper
  (`rounded-fw-lg border border-border-subtle bg-surface`) — its
  grouped-by-player row content migrates into the ledger's Queue column and
  the table, without the card chrome.
- `SignalDossier.tsx`'s outer bordered wrapper (`:134`) and empty-state
  bordered wrapper (`:112`), plus its four bordered `DossierSection` boxes
  (`:79-81`, used at `:251,268,290,309` for Recent trend / Other open
  signals / Focus areas / Active goals) — a banned "panel whose only content
  is a list," four times over. Their content (plus `EvidencePanel`, `:33,196`,
  and the strokes readout, `:209-213`) migrates into the one `DrillPanel`
  as plain typeset sections.
- `SignalInsightPanel`'s permanently-docked right pane (`insightPanel`,
  `TriageDesk.tsx:443-452`, rendered at both `:622` desktop and `:669`
  mobile) and its always-visible "Ask CoachHelm" chrome. CoachHelm chat
  access moves to the existing global surface already one click away in the
  overflow `Menu` (`surfaceHref('ask')`, `:486-491`) rather than occupying a
  permanent third pane on every load of this screen.
- `TeamCategoryLeakBand` (`TriageDesk.tsx:576-578`) — built from the five
  fixed `TeamCategory` buckets (`team-category-insights.ts`), a taxonomy
  distinct from the raw `GroupedSignal.category` strings this spec's stage
  rail uses. Superseded, not ported forward, to avoid the two-taxonomy
  conflation the current page already carries (the Toolbar's own Category
  filter already uses the raw taxonomy, so the band and the filter chips
  disagree today on what "category" means).
- The entire `intelligence.v2.md` Rail/Strip/Stage proposal — its
  `computeSeverityMix`, `buildDedupedPriorities`, `buildTeamBreakdown`
  functions and its bezel-merge/fold fixes are superseded wholesale; nothing
  from v2 carries forward into this composition.

**Explicitly not deleted** (in scope elsewhere on the same route, unchanged
by this spec):
- `PlayersGridView` under `?view=players` (`TriageDesk.tsx:676-689`).
- `EffectivenessScoreboard` under `?view=effectiveness` (`:690-696`).
- `ViewSwitch` itself (`:542-546`), including its phone rendering (see
  Phone above).

## Risks

- **`strokeImpact` sign risk (load-bearing)**. `evidence.strokes_impact` is
  documented as "Magnitude only — sign just indicates direction"
  (`src/lib/coachhelm/v3/ranking/score.ts:76-77`), and the codebase's own
  ranking function always takes `Math.abs()` of it before using it
  (`cappedStrokesImpact`, `score.ts:44-49`); the roster roll-up generator
  sums `|strokes_impact|` across the roster the same way
  (`src/lib/coachhelm/v3/insights/team-synthesis.ts:21`). This spec
  therefore builds the stage as a one-sided magnitude ranking, never a
  diverging tornado with a green "gained" side — there is no verified data
  support for a clean gained/lost split. If a future field cleanly
  separates over-benchmark from under-benchmark per category, this becomes
  a true diverging chart with a real zero-crossing baseline; until then, a
  diverging rendering of this field would be exactly the "fabricated
  series" the honesty rule forbids.
- **`RailBars` needs a `tone` prop.** It hardcodes green fill
  (`bg-accent-500` / `bg-accent-300`, `RailBars.tsx:50-51`) with no way to
  render amber today. This spec depends on a small, additive
  `tone?: 'accent' | 'warning'` prop (default `'accent'`, so every existing
  call site is unaffected) — flagged here rather than silently reusing the
  green token for a bad-news number, which would contradict LANGUAGE.md's
  own color-semantic rule (amber = over par / declining).
- **`newFields`**: no stored historical snapshot of `{open signal count,
  playersFlagged, outcomesAwaiting}` exists anywhere in the loader
  (`page.tsx`'s `getSignalGroups` / `getAlertCounts` / `getCoachHelmOverview`
  calls all return current-state reads only). Readouts 1-3 therefore state
  direction-of-good only ("fewer is better"), never a numeric delta or a
  sparkline — drawing either would be a fabricated series. A real delta
  needs a new snapshot table (e.g. `golf_coachhelm_signal_snapshots`, keyed
  by `coach_id` + `scanned_at`) written at scan time and read back by a new
  server action alongside `getSignalGroups`. Readout 4 (Last scan) needs no
  such table — its own value already encodes freshness.
- **Category cardinality is unbounded.** `distinctCategories`
  (`buildTriageViewModel.ts:137`) reflects whatever free-form `category`
  strings the generators have written; the stage caps the rail at 8 rows.
  Nothing is hidden (every signal in an overflow category still appears in
  the table), but a team whose signals span many distinct categories will
  see a rail that under-represents its long tail — worth confirming against
  real category cardinality in production before shipping.
- **Null must not become zero.** `signal-grouping.ts:80-82` is explicit that
  zero is a real reading and must not be confused with "we do not know."
  The category aggregation sums only signals with a non-null
  `strokeImpact`; a category where every signal's impact is null renders
  "Not measured," never a phantom zero-length bar indistinguishable from a
  genuinely-zero leak.
- **The `team_synthesis` exclusion is load-bearing in two places at once** —
  both the category aggregation (stage) and the ledger's Queue/Players
  columns must skip `kind === 'team_synthesis'` rows the same way
  `runSignalAction` already does for actions (`TriageDesk.tsx:385`, "a
  roster roll-up has no row behind it"), or the stage double-counts leaks
  its own per-player signals already report (`signal-grouping.ts:16-23`).
- **`DrillPanel` replacing `SignalDossier`'s bordered `DossierSection`s is a
  real content-density change**, not a free one: four separate scannable
  boxes (trend / other signals / focus areas / goals) become plain typeset
  sections inside one panel. This mirrors the trade `roster.v3.md` already
  accepts for its own retired expand band — flagged here to confirm in
  review, not assumed free.
- **Retaining `ViewSwitch` unchanged on phone** (rather than LANGUAGE.md's
  generic phone note "the view control becomes a Menu") is a deliberate,
  cited exception — see Phone — justified by `ViewSwitch.tsx:20-29`'s own
  frozen `role="link"` test contract, not an oversight.

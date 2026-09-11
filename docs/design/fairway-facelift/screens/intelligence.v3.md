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
  `buildTriageViewModel.ts:203-222`, verbatim except for the added links).
  `groupsError` (non-null when `getSignalGroups` itself failed —
  `page.tsx`'s `signalGroupsResult.success ? signalGroupsResult.groups : []`
  forces `groups` to `[]` on that path, the identical shape a genuinely
  empty queue has) is checked BEFORE any of these: branch A's "all clear" is
  only honest when the queue is actually empty, never when it is merely
  unknown. See Risks, "an honest failure state," for what this gates below
  the masthead too.

  - **E — load failure** (`groupsError` non-null): "Couldn't load signals.
    Try again." — no links; `counts` and `topPlayerGroup` are both derived
    from a `groups` array that is `[]` for a reason unrelated to how many
    signals exist, so neither is trustworthy enough to print.
    `outcomesAwaiting` is a separate, unaffected read
    (`effectivenessDrillProps`/`getInsightEffectiveness`, independent of
    `getSignalGroups`), so the **Append** rule below still applies on top
    of branch E exactly as it does on top of B/C/D.
  - **A — all clear** (`groupsError` is null and `groups.length === 0`):
    "All clear. No open signals right now." (verbatim, `:205`) — no links,
    nothing to link to.
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

**Overline / Title** (LANGUAGE.md's stage-header slot — the two lines above
the legend, matching `FairwayCoachDashboard.tsx:369-370`'s own "The team ·
{range}" / "Score field" precedent): overline "The team · by category";
title "Leak ranking". Both are structural chrome, not a data value — no
field citation applies, the same as Home's own overline text.

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
pre-filtering the ledger's Queue column and the table below to that
category. **This is a new capability, not an existing one**: neither
`RailBarRow` nor `RailBars` carries a link today (`modules/types.ts:131-151`;
`RailBars.tsx` renders each row as a plain `<m.div>`, no `<Link>`/`onClick`
anywhere in the file). `PlayerHomeBento.tsx:35-36`'s own docstring confirms
this directly — it lists `RailBars` among the primitives it reuses
specifically because "none render a `<button>`." See Risks for the additive
fix this depends on.

**Order and cap**: descending by `strokesAtRisk`; categories with no
measured impact sort after every measured one, by `signalCount` descending,
then alphabetically. Capped at 8 rows. `distinctCategories` has no fixed
cardinality ceiling — overflow categories are not hidden, only de-prioritized
off the rail; every signal in an overflow category still appears in the
table.

**Degradation** (after the load-failure check — see Risks, "an honest
failure state," which this stage defers to when `groupsError` is set):
- **Zero categories** (`groupsError` is null and
  `aggregateCategoryLeaks(groups).length === 0`): no `RailBars` at all — one
  line, the same precedent `ScoreField`'s own degrade uses
  (`FairwayCoachDashboard.tsx:409-422`). This is reachable two different
  ways and each gets its own honest line, not a shared one:
  - **`groups.length === 0`** (a genuine all clear, masthead branch A): "No
    open signals. Nothing to rank."
  - **`groups.length > 0` but every signal in every group is `kind ===
    'team_synthesis'`** (masthead branch D): the aggregation's own
    exclusion above empties the bucket even though real signals exist, so
    "No open signals" would be false here. Instead: "No per-player leaks to
    rank. {teamSynthesisCount} team-level {signal|signals} in the table
    below," linked to `#signals-table` — `{teamSynthesisCount}` is the same
    count Column 1's own branch-D empty line below uses, and this mirrors
    Column 2's existing branch-D empty precedent the same way.
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
(`coach-home-parts.tsx:182-195`). Colors deliberately do NOT match
`SEVERITY_DOT`'s red `bg-fw-danger` for urgent/high (`SignalRow.tsx:21-26`)
— LANGUAGE.md's materials rule allows exactly two hues on a coach page
(green ink, amber leak/decline), and the reference implementation never
spends a third: `AttentionLedger`'s own three-bucket mix bar
(`coach-home-parts.tsx:164-166`) colors improving/flat/declining as
`bg-accent-500` / `bg-warm-300` / `bg-fw-warning`, never red. This legend
follows that same palette instead: urgent+high `bg-fw-warning` (solid — the
same fill the rail itself uses for a leak), medium `bg-warm-300` (the same
neutral-warm tone `AttentionLedger` already uses for its middle bucket),
low `bg-text-tertiary/50` (unchanged from `SEVERITY_DOT`). See Risks for the
matching fix `SeverityChip` itself still needs before the ledger's Queue
column and the table's Severity column stop rendering that same red. The
urgent+high segment links to `?filter=urgent`
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
   `?view=effectiveness`. No numeric delta today. Reads
   `effectivenessDrillProps`/`getInsightEffectiveness`, wholly independent of
   `getSignalGroups` — stays visible and correct even while the stage's own
   `groupsError` failure state (see Risks) is showing in place of the rail.
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
aggregates by something else (signal, player, prescription). Columns 1 and 2
read the same `groups` the stage does, so like it they assume `groupsError`
is null — see Risks, "an honest failure state," for what replaces them when
it isn't. Column 3 reads a separate loader
(`playersDrillProps`/`focusAreasError`, `page.tsx:305`), independent of
`groupsError` — see Risks, "Focus areas needs its own failure state," for
what it shows when `playersDrillProps.loadError` is set instead.

**Column 1 — Queue (5/12)**, id `ledger-queue`. Rows: the top 6 signals
across every group, EXCLUDING `kind === 'team_synthesis'` (the same
exclusion the stage's aggregation makes, and the same gate
`SignalDossier.tsx:223` already applies before rendering its action row — a
roster roll-up is a fact worth reading, not a queue item worth reviewing
individually; it still surfaces in the full Signals table below), in the
same worst-first, most-recoverable-first order `groupSignals` already
produces (`signal-grouping.ts:255-276`) — filtered, not re-sorted.
Each row: a `SeverityChip` (`SignalRow.tsx:30-37`) + player name or "Team"
(`group.playerName`) + the claim, one line, truncated
(`toCoachVoice`, `SignalRow.tsx:19`). Row link: opens the `DrillPanel` for
that signal (same canonical detail surface the table's rows open — see
below, not a second one). Header count: total open signals — the same
number Readout 1 shows, which is fine (`SectionHead`'s own convention
already restates a count in its header; the rule against repetition is
about the stage's per-category numbers, not a section title). Empty: the
same two cases as the stage's own zero-categories branch above, each with
its own line rather than one shared "empty" copy —
**`groups.length === 0`** (branch A): "All clear. No open signals."
(verbatim). **`groups.length > 0` but every signal is `kind ===
'team_synthesis'`** (branch D, the same case Column 2's own empty copy below
already names): "No player-level signals. {teamSynthesisCount} team-level
{signal|signals} below" (`teamSynthesisCount =
groups.flatMap(g => g.signals).filter(s => s.kind === 'team_synthesis').length`),
linked to `#signals-table`.

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
as "Focus areas active"). Empty: "No active focus areas." Failure
(`playersDrillProps.loadError` non-null — `page.tsx:305`'s
`playersError || focusAreasError`, a read wholly independent of
`getSignalGroups`/`groupsError`): its own `InlineNotice` ("Couldn't load
focus areas. Try again.") replaces the column's rows in place of the empty
copy above — this column can fail while the stage and Columns 1-2 load
fine, and vice versa, so it needs its own honest state rather than
inheriting theirs. See Risks.

## The table

"Signals" (when `groupsError` is null — see Risks, "an honest failure
state") — dense, full-width `<table>`, id `signals-table`, uppercase
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

- **An honest failure state, scoped to exactly what `getSignalGroups`
  feeds — not the whole page.** `getSignalGroups` failing (`page.tsx`'s
  `signalGroupsResult.success ? signalGroupsResult.groups : []`) forces
  `groups` to `[]` and sets `groupsError` to a non-null string — the exact
  same shape a genuinely empty, all-clear queue has. Every empty-state
  branch keyed on `groups`/`groups.length` (masthead Verdict branch A, the
  stage's "Zero categories," Column 1 and Column 2's own empty copy, the
  table) cannot tell "zero" from "unknown," so none is safe to reach while
  `groupsError` is set. `groupsError` therefore gates exactly the parts that
  read `groups`: the masthead verdict (falls back to branch E), the
  `RailBars` instrument and its legend inside the stage, Ledger Columns 1
  and 2, and the Signals table. One `InlineNotice` (tone `danger`, title
  "Couldn't load signals," a Try again button calling `router.refresh()`)
  replaces the rail + legend and spans below it in place of Columns 1-2 and
  the table, the exact treatment `TriageDesk.tsx:580-592` already gives this
  same condition today (there, in place of the `ResizableWorkspace`). Two
  parts of the page are deliberately left alone by this notice because
  neither reads `getSignalGroups`, and blanking them too would hide real,
  successfully-loaded data — the mirror-image mistake this fix exists to
  prevent: **Column 3** (Focus areas — `playersDrillProps`/`focusAreasError`,
  see the next Risk bullet for its own, separate failure state) and
  **Readout 3** (Outcomes awaiting — `effectivenessDrillProps`/
  `getInsightEffectiveness`, see Readouts above). Readout 4 (Last scan)
  keeps rendering too: `getSignalGroups`'s own failure path already returns
  `scannedAt: null` explicitly, so "No scans yet" during a load failure is
  still an honest read of that real null, not a fabrication. This mirrors
  two precedents already shipped in the reference implementation —
  `FairwayCoachDashboard`'s own `teamStatsUnavailable` stage branch
  (`FairwayCoachDashboard.tsx:398-401`) and its `AttentionLedger`'s
  `unavailable` branch (`coach-home-parts.tsx:171-174`) — both of which
  treat a read failure as materially different from zero real rows, never
  as an empty state, and both scoped to only the region whose own read
  failed.
- **Focus areas needs its own failure state, independent of `groupsError`.**
  `page.tsx:305` already computes `playersLoadError` (`playersError ||
  focusAreasError`) and passes it through as `playersDrillProps.loadError` —
  a real field, already wired, that nothing in today's ledger reads. Column
  3 above adds the missing branch: `playersDrillProps.loadError` non-null
  shows its own `InlineNotice` ("Couldn't load focus areas. Try again.")
  in place of the column's rows, distinct from its "No active focus areas."
  empty copy. Without this, a failed focus-area read would render
  identically to a coach who has genuinely prescribed nothing — the same
  failure-as-empty-state bug the bullet above fixes for signals, left open
  here otherwise.
- **`RailBars` needs a per-row link.** No existing `RailBarRow` field or
  `RailBars` render path makes a row clickable (`modules/types.ts:131-151`,
  `RailBars.tsx:29-80`) — every current call site renders it read-only;
  `PlayerHomeBento.tsx:35-36`'s own docstring lists `RailBars` among the
  primitives it reuses specifically because "none render a `<button>`."
  This spec depends on a small, additive fix parallel to the `tone` prop
  below: an optional `href?: string` on `RailBarRow`, and `RailBars.tsx`
  wrapping the row in a `Link` when it's present (falling back to today's
  plain `<m.div>` when it's not, so every existing read-only call site —
  `PlayerHomeBento`, `TeamStatsBoard`, the stats drills — is unaffected).
  Flagged here rather than silently assuming the row already navigates.
- **`SeverityChip` needs its own tone fix.** Reused verbatim in the ledger's
  Queue column and the table's Severity column (`SignalRow.tsx:30-37`), it
  still resolves `urgent`/`high` to Badge's `danger` tone
  (`SignalRow.tsx:31`) — the same red the stage's own Legend deliberately
  avoids (see The stage). `SeverityChip` is used nowhere outside this
  route's own Triage feature (`SignalQueue.tsx`, `SignalRow.tsx`,
  `SignalDossier.tsx` — all three inside this spec's own scope), so the fix
  is small and local: change `SignalRow.tsx:31`'s ternary from `'danger'`
  to `'warning'` for `urgent`/`high`. Severity stays legible by its text
  label ("Urgent"/"High"/"Medium"/"Low"); only the swatch color changes.
  This is an intended consequence, not a side effect to catch in review:
  `urgent`, `high`, and `medium` now all resolve to the same `warning`
  tone, so the chip's color alone no longer separates those three — only
  the text label does; `low` remains the one visually distinct (neutral)
  swatch. That is what the two-hue rule requires once a third color is off
  the table: a four-grade severity chip cannot be carried by two hues, so
  the finer grades move to text, the same tradeoff the stage's own Legend
  makes one section up.
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

## Result

Built on `agent/frost-facelift`. Files: `src/components/golf/coachhelm/triage/TriageDesk.tsx`
(rewritten), `intelligence-logic.ts` + `intelligence-parts.tsx` (new, page-local),
`SignalDossier.tsx` (chrome stripped), `__tests__/intelligence-logic.test.ts` (new),
`__tests__/TriageDesk.navigation.test.tsx` / `SignalDossier.test.tsx` /
`SignalDossier.teamRollup.test.tsx` (updated to the new composition),
`memory/features/coach-intelligence-triage.md`. Deleted: `SignalQueue.tsx`,
`SignalRow.tsx`, `SignalInsightPanel.tsx`.

Deviations from the spec above, each with its reason.

1. **The stage is a page-local `LeakRail`, not `modules/RailBars`.** The spec's
   own Risks section says `RailBars` needs two additive fields — `tone` and
   `href` — and both live on `RailBarRow` in `modules/types.ts`, which this pass
   does not own (`modules/index.ts`, `modules/types.ts` and `registry.ts` are the
   lead's files). `LeakRail` reproduces the canonical geometry (label column,
   flexible track, right-aligned mono figure with its sample one step down,
   percentage-only layout, capped stagger entrance behind `useReducedMotionGuard`)
   without touching any of the three.

2. **No per-row rail track, and the shared tick is a vertical rule instead.**
   `RailBars` draws `bg-surface-sunken` under every bar and a 2px `tickPct` mark
   part-way along it. LANGUAGE.md bans exactly that shape: a rail under a mark
   turns the mark into a handle on a slider. The bars are anchored to one
   vertical zero rule spanning every row, and the across-category mean is a
   second vertical rule spanning every row — vertical ground rather than eight
   private sliders. Every row still states its own value in mono beside it.
   `MIN_BAR_PCT` (1.5%) gives a measured-but-tiny leak a visible nub; the printed
   figure is untouched.

3. **The `ViewSwitch` sits on the masthead eyebrow row, not above the table.**
   Players and Effectiveness replace the entire field sheet, so the control
   belongs to the page. Drawn above the table it would put the only route to
   those two views below the fold on every load. The `Toolbar` above the table
   keeps the Severity/Category `FilterMenu`s, which genuinely do scope the table.

4. **Readouts carry no links.** `ReadoutItem` (`coach-home-parts.tsx`) has no
   `href` field and that file belongs to the coach-home pass. The readouts state
   direction-of-good in their caption, as specced; the links are the only part
   dropped.

5. **The drill renders inline at every width rather than as a bottom sheet on
   phone.** `Sheet` portals to `document.body`, so a `md:hidden` wrapper cannot
   gate it and an open sheet would cover the desktop page too; choosing between
   them needs a runtime breakpoint read, which LANGUAGE.md bans outright. The
   `DrillPanel` is appended under the table and scrolled into view with
   `block: 'nearest'` when a ledger row selects a signal from further up the page.

6. **Two signal counts exist, and they are captioned apart.** `Open signals`
   (the readout, and the table's own total) counts every open signal including
   roster roll-ups; `Queue` (the ledger column's count, and the denominator the
   rail's per-category samples add up to) counts only the triageable ones. They
   differ by exactly the roll-up count, which the readout's own note states
   ("includes N team roll-ups"). The table's heading names the active filter
   ("Signals · Urgent") whenever one is set, so a filtered count never wears the
   same caption as an unfiltered one.

7. **`SeverityChip` moved from the deleted `SignalRow.tsx` into
   `intelligence-parts.tsx`** and now resolves `urgent`/`high`/`medium` to the
   amber `warning` tone and `low` to neutral, as the spec requires. The grade is
   carried by the text label, which is never abbreviated away.

8. **The `groupsError` notice is rendered ONCE, in the stage**, rather than
   repeated in place of Ledger Columns 1-2 and again in place of the table.
   Those three regions are omitted while it shows; Column 3 (Focus areas, with
   its own independent `loadError` branch) and Readouts 3-4 keep rendering, which
   is the scoping the spec asks for.

9. **`categoryInsights` and `teamName` stay on the props contract** even though
   nothing renders them now. Removing them is a `page.tsx` /
   `CoachIntelligenceHome.tsx` change that belongs with the loader, not with this
   screen's composition.

Verification: `npx tsc --noEmit -p tsconfig.json` exit 0; `npx eslint` on all
changed files exit 0, zero warnings; `npx vitest run
src/components/golf/coachhelm/triage/__tests__/
src/components/golf/coachhelm/home/__tests__/` exit 0, 202 passed.

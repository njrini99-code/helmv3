# Dead BaseballHelm Application Code — Inventory

Generated 2026-08-19. Scope: `src/app/baseball/**`, `src/lib/baseball/**`,
`src/components/baseball/**`, `src/app/api/baseball/**`, `src/lib/recruiting/**`.
Owner has confirmed baseball is seed data / no live users — the remaining risk
is breaking the build or a route, not data loss. **Nothing was deleted in this
pass.** This is the case file for a separate, reviewed deletion commit.

Method: three independent instruments, cross-validated against each other —
`npx knip` (ad-hoc, temp config outside the repo, no repo file added),
`npm run orphans:mounts`, and manual reachability grep (import graph, JSX
name-mentions, dynamic imports, barrel re-exports, cross-sport contamination).
Every candidate below was confirmed dead by at least two instruments, or by
knip plus a full manual trace when the third instrument had a documented
blind spot.

---

## INCIDENTAL FINDINGS (bugs found in passing, not fixed)

1. **`orphans:mounts` false positive on default-export name mismatch.**
   `src/app/baseball/(dashboard)/dashboard/organization/OrganizationClient.tsx`
   declares its component as `export default function
   OrganizationDashboardPage()` (not `OrganizationClient` — the file name).
   `page.tsx` imports it as `import OrganizationClient from
   './OrganizationClient'` and renders `<OrganizationClient />`, which IS a
   real, live route (confirmed: `TeamSelector` and `OrgDashboard` are
   imported and rendered at lines 57–58 of that file). Because the script's
   reachability walk keys on the *declared* component name, not the file's
   default-export alias, it never marks `OrganizationClient.tsx` reachable,
   so it never propagates reachability to `TeamSelector.tsx` and
   `OrgDashboard.tsx` — both got flagged as orphans (35-item list) despite
   being genuinely live. This is a documented instrument limit now (see
   below), not a repo bug — flagging so nobody re-deletes these two files
   off a future orphans:mounts run without re-checking.

2. **Stale/aspirational doc comment in `src/components/baseball/signals/index.ts`.**
   The barrel header says "The Command Center imports CommandSignalStack" —
   it doesn't (verified: zero references to `signals` or `CommandSignalStack`
   in `CommandCenterFairway.tsx`). Either the wiring was reverted and the
   comment never updated, or the intended integration was never finished.
   Whichever it is, the comment is actively misleading about what's live.

3. **Duplicate-name collision masks a real dead file from `orphans:mounts`.**
   Two unrelated components are both named `SprayChart`:
   `src/components/baseball/stat-visuals/HittingVisuals.tsx` (live, rendered
   in `StatVisualsSection.tsx`) and
   `src/components/baseball/living-annual/viz/SprayChart.tsx` (dead). Because
   `orphans:mounts` matches by bare component *name* text, not by which file
   an import resolves to, the live file's "SprayChart" text-match caused the
   *unrelated* dead file with the same component name to read as reachable.
   knip's real import-graph analysis was not fooled and flagged it correctly
   (see instrument-limits section). This is a second, distinct instrument
   limit — separate from #1 above.

---

## A. SAFE TO DELETE

Every finding below has zero non-comment, non-barrel, non-self references
anywhere in `src/`, confirmed with `grep -rn '\bName\b' src --include="*.ts"
--include="*.tsx" | grep -v <own-file-and-barrel>`, and zero cross-sport
importer, confirmed with a repo-wide grep scoped to
`src/app/golf src/lib/golf src/components/golf src/app/api/golf
src/components/ui src/lib/types src/app/admin src/lib/admin
src/components/admin`. No dynamic-import (`import(`, `next/dynamic`,
`React.lazy`) or dedicated test file exists for any of them.

### A1. The "Living Annual" dead evaluation/artifact cluster (6 files, 533 lines)

A connected dead subtree inside the otherwise-heavily-used
`src/components/baseball/living-annual` design-system kit. `ToolRailStack`
imports `ToolRail` from the parent barrel; `TearSheet` imports `StatLineStack`
directly. Both chains dead-end with zero external consumer.

| Path | What it is | LOC |
|---|---|---|
| `src/components/baseball/living-annual/ToolRail.tsx` | 20-80 tool-grade rail atom | 138 |
| `src/components/baseball/living-annual/molecules/ToolRailStack.tsx` | Stack of `ToolRail`s (Decision Room compare) | 55 |
| `src/components/baseball/living-annual/molecules/GradeStampGrid.tsx` | Grid of grade stamps | 50 |
| `src/components/baseball/living-annual/molecules/StatLineStack.tsx` | Composed stat-line molecule | 37 |
| `src/components/baseball/living-annual/molecules/TearSheet.tsx` | Composed player artifact card | 62 |
| `src/components/baseball/living-annual/viz/BreakPlot.tsx` | Pitch-break dark-canvas viz | 191 |

Proof (representative — same pattern for all six):
```
$ grep -rn '\bToolRail\b' src --include="*.ts" --include="*.tsx" | grep -v "/living-annual/"
src/components/baseball/staff-decision-room/StaffDecisionRoomFairway.tsx:40:// quality-direction vocabulary (GradeStamp/ToolRail already use it inside the
```
That is the *only* non-barrel, non-self hit in the entire repo, and it's a
prose comment, not code. Every other name in the cluster (`ToolRailStack`,
`GradeStampGrid`, `StatLineStack`, `TearSheet`, `BreakPlot`) returns literally
zero hits outside `living-annual/`.

- **Instruments agreeing:** `orphans:mounts` flagged all 6 directly. knip
  independently flagged the same 6 names as unused exports of their
  respective barrels (`living-annual/index.ts` for `ToolRail`,
  `molecules/index.ts` for the other four molecules... `BreakPlot` via
  `viz/index.ts`) — a second, independent confirmation via the import graph
  rather than name-text matching.
- **Cross-sport check:** no golf/shared/admin importer, verified by
  `grep -rln '\b<Name>\b' src/app/golf src/lib/golf src/components/golf
  src/app/api/golf src/components/ui src/lib/types src/app/admin
  src/lib/admin src/components/admin` for each of the 6 names — zero hits.
- **What breaks if wrong:** nothing renders these; if some undiscovered
  caller existed, the app would fail a `tsc` compile immediately (missing
  import), which `npm run typecheck` catches before merge.
- **Companion edit required (not a separate deletion, but do it in the same
  commit):** remove the corresponding barrel export lines —
  `living-annual/index.ts` (`ToolRail` + `ToolRailProps`/`ToolRailAthlete`
  types), `living-annual/molecules/index.ts` (`StatLineStack`,
  `ToolRailStack`, `GradeStampGrid`, `TearSheet` + their prop types),
  `living-annual/viz/index.ts` (`BreakPlot` + prop types — **keep**
  `ClimbArc`/`SprayChart`... see A2, `SprayChart` is also dead, see below).

### A2. `living-annual/viz/SprayChart.tsx` — dead, missed by `orphans:mounts` (name collision)

`src/components/baseball/living-annual/viz/SprayChart.tsx` (218 lines).
**Not** the same component as the live `SprayChart` in
`src/components/baseball/stat-visuals/HittingVisuals.tsx` (rendered by
`StatVisualsSection.tsx:464`) — two different files declare a component with
the identical name, which is exactly why `orphans:mounts`' name-text matching
missed this one (see Incidental Finding #3).

Proof:
```
$ grep -rn "living-annual/viz" src --include="*.ts" --include="*.tsx" | grep -i spray
src/components/baseball/living-annual/viz/index.ts:10: *   import { BreakPlot, SprayChart, ClimbArc } from '@/components/baseball/living-annual/viz';
```
That doc-comment import example in the barrel's own header is the only
reference to this file's `SprayChart` anywhere outside itself. knip
independently flagged `SprayChart` as an unused export of
`living-annual/viz/index.ts`.

- **Instruments agreeing:** knip (real import-graph analysis) + manual path
  grep. `orphans:mounts` false-negatived this one — documented as Incidental
  Finding #3 / Instrument Limit below, not corroborating evidence.
- **Cross-sport check:** no golf/shared/admin importer, verified by
  `grep -rln '\bSprayChart\b' src/app/golf src/lib/golf src/components/golf
  ...` restricted further to files that import from
  `living-annual/viz` specifically (the bare-name grep does hit golf files,
  but every one of them is the *other*, live `SprayChart` from
  `stats-data-types.ts` / `HittingVisuals.tsx` — none import from
  `living-annual/viz`).
- **Companion edit required:** remove `SprayChart`/`SprayChartProps`/
  `SprayBall`/`SprayOutcome` from `living-annual/viz/index.ts`; **keep**
  `ClimbArc` (confirmed live — `AnalyticsClient.tsx`,
  `PerformanceDashboardClient.tsx`, `player-stats/TrendChart.tsx` all import
  and render it).

### A3. `CoachPlayerDailyContractPanel.tsx`

`src/components/baseball/coach-daily-contract/CoachPlayerDailyContractPanel.tsx`
(249 lines). Sibling `CoachDailyContracts` in the same barrel is genuinely
live (rendered in `CommandCenterFairway.tsx:320`); this one is not.

```
$ grep -rn "CoachPlayerDailyContractPanel" src --include="*.tsx" --include="*.ts"
src/components/baseball/coach-daily-contract/index.ts:17:export { CoachPlayerDailyContractPanel } from './CoachPlayerDailyContractPanel';
src/components/baseball/coach-daily-contract/CoachPlayerDailyContractPanel.tsx: (3 self-references: interface name, function decl)
```
The barrel's own header comment says the old
`src/components/baseball/daily-contract/index.ts` "still re-exports both
names for backward compatibility" — checked, that file is actually empty
(0 bytes of re-exports), so that claimed compat path doesn't exist either.

- **Instruments agreeing:** `orphans:mounts` + knip (flagged unused export
  `CoachPlayerDailyContractPanel` at **both** the barrel and the file itself
  — knip's own-file flag here means it correctly saw through the one-hop
  barrel, this is not a case of the "root only" blind spot).
- **Cross-sport check:** no golf/shared/admin importer, verified by
  `grep -rln 'CoachPlayerDailyContractPanel' src/app/golf src/lib/golf
  src/components/golf ...` — zero hits.
- **What breaks if wrong:** nothing; `tsc` would catch a real missed caller.

### A4. Player-profile Snapshot Cards V7 dead pair (2 files, 594 lines)

`src/components/baseball/player-profile/snapshot-cards/SnapshotCardGrid.tsx`
(111 lines) and
`src/components/baseball/player-profile/snapshot-cards/SnapshotCards.tsx`
(483 lines, exports `PerformanceSnapshotCard`, `HittingSnapshotCard`,
`PitchingSnapshotCard`, `DefenseSnapshotCard`, `StrengthSnapshotCard`,
`ClassesSnapshotCard`, `VideoSnapshotCard`, `TaskDevSnapshotCard`).
`SnapshotCardGrid` imports and composes every one of those 8 card exports
from `SnapshotCards.tsx` — a self-contained dead pair.

The barrel (`snapshot-cards/index.ts`) also exports `SnapshotHeaderBand`,
which **is** live — `PlayerProfileClient.tsx:59` imports it and renders it at
line 783. `PlayerProfileClient.tsx` never imports `SnapshotCardGrid`.

```
$ grep -n "SnapshotHeaderBand\|SnapshotCardGrid\|snapshot" src/components/baseball/player-profile/PlayerProfileClient.tsx
59:import { SnapshotHeaderBand } from './snapshot-cards';
...
783:            <SnapshotHeaderBand header={snapshotHeader} playerId={player.id} />
```
Only the header band survived from this generation of the snapshot-cards
system; the grid and its 8 cards did not get wired in.

- **Instruments agreeing:** `orphans:mounts` flagged both files directly.
  knip independently flagged `SnapshotCardGrid` as an unused export at both
  the barrel and the file itself. knip did **not** separately flag
  `SnapshotCards.tsx`'s own exports as unused — because `SnapshotCardGrid.tsx`
  (itself dead) imports them, which is exactly the "root only" blind spot the
  task described: `SnapshotCardGrid` is the visible root, `SnapshotCards.tsx`
  is invisible beneath it until you trace what the root imports. Manual trace
  closes that gap here.
- **Cross-sport check:** no golf/shared/admin importer, verified by grepping
  all 9 component names (`SnapshotCardGrid` + the 8 card exports) against
  `src/app/golf src/lib/golf src/components/golf src/components/ui
  src/lib/types src/app/admin src/lib/admin` — zero hits.
- **What breaks if wrong:** the read-model these cards would have consumed
  (`getPlayerSnapshotCards()` in `src/lib/baseball/read-models/
  player-snapshot-cards.ts`) is **still called** by
  `players/[id]/page.tsx` — but only to feed `SnapshotHeaderBand`'s header
  data, which is a strict subset. That read-model file stays; only the two
  unused component files go.

### A5. `CommandSignalStack.tsx`

`src/components/baseball/signals/CommandSignalStack.tsx` (219 lines). See
Incidental Finding #2 — the barrel's own doc comment claims Command Center
uses this, and does not.

```
$ grep -n "signals\|CommandSignal" src/components/baseball/command-center/CommandCenterFairway.tsx
(no output)
```

- **Instruments agreeing:** `orphans:mounts` + knip (unused export at both
  `signals/index.ts` and the file itself).
- **Cross-sport check:** no golf/shared/admin importer, verified by
  `grep -rln 'CommandSignalStack' src/app/golf src/lib/golf
  src/components/golf ...` — zero hits.

### A6. `SpeedArmVisuals.tsx` (whole file — both exports dead)

`src/components/baseball/stat-visuals/SpeedArmVisuals.tsx` (601 lines).
Exports exactly two components, `ArmBoard` and `SpeedDecisionBoard`; neither
has a consumer anywhere outside its own barrel re-export.

```
$ grep -rn "SpeedArmVisuals" src --include="*.tsx" --include="*.ts"
src/components/baseball/stat-visuals/index.ts:137:} from './SpeedArmVisuals';
src/components/baseball/stat-visuals/SpeedArmVisuals.tsx:4:// (self header comment)
```

- **Instruments agreeing:** `orphans:mounts` + knip (unused export at both
  `stat-visuals/index.ts` and the file itself for both `ArmBoard` and
  `SpeedDecisionBoard`).
- **Cross-sport check:** no golf/shared/admin importer, verified by
  `grep -rln 'ArmBoard\|SpeedDecisionBoard' src/app/golf src/lib/golf
  src/components/golf ...` — zero hits.
- **Companion edit:** remove `ArmBoard`/`SpeedDecisionBoard` (+ prop types)
  from `stat-visuals/index.ts`; every other export in that large barrel
  (`StatVisualFrame`, `SprayChart` [the live one], `HittingVisuals` family,
  etc.) is unaffected.

### A7. BaseballHelm "ui" premium primitives — 3 of 5 dead (3 files, 508 lines)

`src/components/baseball/ui/index.ts` exports 6 primitives:
`CommandCard`, `EvidencePill`, `PlayerTile`, `StatusRibbon`, `ActionRail`,
`GroupAvailabilityGrid`. Three are dead:

| Path | LOC |
|---|---|
| `src/components/baseball/ui/EvidencePill.tsx` | 80 |
| `src/components/baseball/ui/PlayerTile.tsx` | 296 |
| `src/components/baseball/ui/StatusRibbon.tsx` | 132 |

`CommandCard`'s own doc comment mentions `EvidencePill` as something it
accepts as children ("Accepts EvidencePill nodes"), which is why
`EvidencePill` shows a hit inside `CommandCard.tsx` — it's a JSDoc mention,
not an import or usage; `CommandCard.tsx` has no `import` of `EvidencePill`
anywhere in the file.

```
$ grep -rn "EvidencePill\|PlayerTile\b|StatusRibbon\b" src --include="*.tsx" --include="*.ts" | grep -v "/ui/"
(no output for all three names)
```
(`CommandCard` and `ActionRail`/`GroupAvailabilityGrid` are confirmed live
elsewhere and are **not** part of this deletion — not verified further here
since they're out of scope for a dead-code inventory, but note they were not
flagged by any instrument.)

- **Instruments agreeing:** `orphans:mounts` + knip (unused export at both
  `ui/index.ts` and each individual file, for all three).
- **Cross-sport check:** no golf/shared/admin importer, verified by
  `grep -rln 'EvidencePill\|PlayerTile\|StatusRibbon' src/app/golf
  src/lib/golf src/components/golf src/components/ui src/lib/types ...` —
  zero hits. (`src/components/ui/` — the truly shared, cross-sport primitive
  library — has its own, unrelated components; no name collision.)
- **Companion edit:** remove `EvidencePill`/`PlayerTile`/`StatusRibbon` (+
  prop types) from `ui/index.ts`; keep `CommandCard`, `ActionRail`,
  `GroupAvailabilityGrid`.

### A8. `LiftLabWelcomeState.tsx`

`src/components/baseball/performance/lift-onboarding/LiftLabWelcomeState.tsx`
(66 lines). This one has an explicit, dated confession in the codebase: the
route that used to host it documents its own removal.

```
// src/app/baseball/.../dashboard/lift/page.tsx header comment:
// The first-run onboarding tour (Task C) is preserved: LiftOnboardingGate is
// a standalone overlay (not a wrapper), so it renders alongside the canonical
// list instead of inside it. The bespoke LiftLabWelcomeState branded empty
// state is not carried over — a brand-new athlete with zero upcoming/recent
// sessions now sees the canonical component's own on-brand EmptyState.
```
The only other mention of `LiftLabWelcomeState` in `lift/page.tsx` is that
same comment — never an import or JSX use. Its sibling components in the
same `lift-onboarding/` directory — `LiftOnboardingGate`, `LiftOnboardingFlow`,
`readLiftOnboardingFlag`/`writeLiftOnboardingFlag` (`onboarding-storage.ts`)
— are all genuinely **live** (`LiftOnboardingGate` is rendered at
`lift/page.tsx:177`, and it directly imports and renders `LiftOnboardingFlow`
and the storage helpers by path, not through the barrel). Do **not** touch
those four; only `LiftLabWelcomeState.tsx` itself is dead. This correction
matters: knip's barrel-level report flags all four of
`LiftOnboardingFlow`/`LiftLabWelcomeState`/`readLiftOnboardingFlag`/
`writeLiftOnboardingFlag` as "unused" re-exports of
`lift-onboarding/index.ts` — that flag is **only** about the barrel's own
re-export being unconsumed; three of those four names are consumed directly
by `LiftOnboardingGate.tsx` bypassing the barrel, and are very much alive.

- **Instruments agreeing:** `orphans:mounts` + knip, cross-checked by full
  manual read of every sibling file to avoid the barrel-blind-spot trap that
  would otherwise take three live files down with it.
- **Cross-sport check:** no golf/shared/admin importer, verified by
  `grep -rln 'LiftLabWelcomeState' src/app/golf src/lib/golf
  src/components/golf ...` — zero hits.
- **Companion edit:** remove `export { LiftLabWelcomeState } from
  './LiftLabWelcomeState';` from `lift-onboarding/index.ts`. **Do not**
  touch the other three lines in that barrel.

### A9. `getPlayerLiftHome` / `getPlayerLiftSession` (partial-file — 2 functions + 1 type, ~136 lines)

`src/lib/baseball/read-models/player-lift.ts` (353 lines total) — **file
stays**, `getPlayerLiftOnboardingState` (the third exported function) is
live and used by `lift/page.tsx:155`. Delete only:
- `PlayerLiftHome` interface, ~lines 57–64
- `getPlayerLiftHome()`, ~lines 144–209
- `getPlayerLiftSession()`, ~lines 215–276

Both dead functions are explicitly documented as superseded, in two
different files' own header comments:
```
// src/app/baseball/.../dashboard/lift/page.tsx:
// ...Data is fetched directly from helm_lifting_sessions /
// helm_lifting_readiness_checkins here ... rather than via getPlayerLiftHome
// (which still returns the legacy BaseballLift* shape for the now-deleted
// component and is frozen for this lane).

// src/app/baseball/actions/signals.ts:
// ...The legacy baseball_lift_assignments table was MOVED to the graveyard
// schema (migration 20260704070000) and is never read or written.
```
Zero real call sites confirmed:
```
$ grep -rn "getPlayerLiftHome(" src --include="*.ts" --include="*.tsx" | grep -v player-lift.ts
(no output)
$ grep -rn "getPlayerLiftSession(" src --include="*.ts" --include="*.tsx" | grep -v player-lift.ts
(no output)
```
The "now-deleted component" the comment references
(`src/components/baseball/performance/PlayerLiftHomeClient.tsx`) was
confirmed already gone — `find` returns nothing. That migration already
shipped; these two functions are the leftover.

`resolveAthleteContext()` (the private helper both dead functions call) and
the `AthleteContext` type **stay** — `getPlayerLiftOnboardingState` (live)
calls `resolveAthleteContext` too, at line 317.

- **Instruments agreeing:** knip (unused exports `getPlayerLiftHome`,
  `getPlayerLiftSession`, unused type `PlayerLiftHome`) + manual grep for
  real call sites + two independent doc-comment confirmations.
  `orphans:mounts` doesn't cover `.ts` (non-`.tsx`) files, so it has no
  opinion here — this is entirely a knip + manual find.
- **Cross-sport check:** no golf/shared/admin importer, verified by
  `grep -rln 'getPlayerLiftHome\|getPlayerLiftSession' src/app/golf
  src/lib/golf src/components/golf ...` — zero hits.
- **What breaks if wrong:** `tsc` catches a missed caller immediately.

### A10. `getNextStage()` (partial-file — 1 function, ~7 lines)

`src/lib/recruiting/stages.ts` (50 lines total) — **file stays**;
`PIPELINE_STAGES` and `PipelineStageColor` are consumed by both baseball
(`PipelineClient.tsx`, `WatchlistClient.tsx`, `src/app/baseball/page.tsx`)
**and** golf (`src/app/golf/admin/crm/crm-config.tsx`,
`src/app/golf/admin/crm/page.tsx` and their tests) — this file is genuinely
shared cross-sport despite living under `src/lib/recruiting/`, so nothing
else in it is a deletion candidate. Only `getNextStage()`, lines ~43–49, is
dead:
```
$ grep -rn "getNextStage" src --include="*.ts" --include="*.tsx"
src/app/golf/admin/crm/components/PipelineView.tsx:47:function getNextStageStatus(...)   ← unrelated, own local function
src/app/golf/admin/crm/components/PipelineView.tsx:333:          const nextStatus = getNextStageStatus(...)
src/lib/recruiting/stages.ts:44:export function getNextStage(currentStage: PipelineStage): PipelineStage | null {
```
Golf's CRM has its own, differently-named `getNextStageStatus` — a coincidence
of naming, not a caller. Zero real callers of `getNextStage` anywhere.

- **Instruments agreeing:** knip (unused export) + manual grep.
- **Cross-sport check:** **the FILE has a golf importer** (documented above)
  — this is the one candidate in this report where the containing file is
  not baseball-exclusive. The specific function has zero callers from either
  sport, so it is still safe to delete, but flagging prominently since it's
  the one case that brushes against rule #4 in the task and needs a human
  eye before the deletion commit, not just a instrument majority vote.

### A11. `StepIndicator` component + `StepConfig` type (partial-file — ~66 of 118 lines)

`src/components/baseball/onboarding/StepIndicator.tsx` — **file stays**;
`slideVariants`, `staggerContainer`, `staggerItem` (motion variants, lines
~13–45) are live, imported directly by
`src/app/baseball/(onboarding)/player/page.tsx:22-26`. Only the
`StepIndicator` component itself (line 58 to EOF) and the `StepConfig` type
(lines ~46–51) are dead. Baseball built its own separate `StepProgress`
component instead and says so in its own comment:
```
// src/app/baseball/(onboarding)/player/_components/StepProgress.tsx:5
// `@/components/baseball/onboarding/StepIndicator` dot-and-connector `<nav>`
// (this component does something different — see file for what/why)
```
This is a naming trap distinct from #A9/#A10: `src/components/golf/onboarding/
StepIndicator.tsx` is a **completely different file** that IS live (used by
both golf onboarding pages) — do not confuse the two when executing the
deletion; only the `baseball/onboarding/StepIndicator.tsx` component export
is dead, and only within that one file.

- **Instruments agreeing:** knip (unused export `StepIndicator`, unused type
  `StepConfig`) + manual grep confirming zero JSX/import use of the baseball
  copy anywhere, including inside its own directory's `_components/`.
- **Cross-sport check:** the *golf* `StepIndicator.tsx` is a different file
  and stays untouched; confirmed the baseball file's `StepIndicator` name
  has zero hits under `src/app/golf`, `src/components/golf` when grepped
  together with the baseball import path (`@/components/baseball/onboarding`)
  to rule out a false "shared name" match.

---

## B. AMBIGUOUS — leave alone

| Path | Why it's here |
|---|---|
| `src/components/baseball/showcase/OrgDashboard.tsx` | `orphans:mounts` flagged it, but it's a **confirmed false positive** — genuinely imported and rendered by `OrganizationClient.tsx:57-58`, which is reachable from the live route `organization/page.tsx`. See Incidental Finding #1. |
| `src/components/baseball/showcase/TeamSelector.tsx` | Same false positive, same root cause, same importer. |
| `src/lib/baseball/ai-policy-server.ts` (specific exports `decideAiGenerationAllowed`, `decideStaffAiAllowed`, `decideAiOutput`, `isAiOutputStale`, `applyGuardrails`) | knip flags these 5 exports unused, but the *file* is actively imported by `src/app/baseball/actions/coachhelm.ts`, `ai-governance.ts`, and `src/lib/baseball/ai-policy.ts` for its other exports (`readAiPolicy`/`readAiPolicyWithClient`). Did not do the deeper trace to confirm whether these 5 are truly dead or reached through a path knip's static analysis can't see (e.g. a re-export chain); needs its own dedicated pass, not a byproduct of this one. |
| `src/components/baseball/position-planner/PositionPlayerPill.tsx` (`PositionPlayerPill` export) | knip flags the export unused, but it's a false alarm from same-file usage: `PositionPlayerStack` in the *same file* renders `<PositionPlayerPill>` internally at line 284. The export keyword is just unnecessary, not the component. Not dead code — do not touch. |
| `src/components/baseball/living-annual/molecules/EmptyIssue.tsx` (`EMPTY_ISSUE_PRESETS` export) | knip flags this specific named export unused at the barrel; not independently traced (no `orphans:mounts` hit since it's a `.ts`-style named-const export, not a component declaration). Needs its own check before acting. |
| ~120 other knip "unused type" hits across `src/lib/baseball/**` (Props interfaces, options types, read-model result types) | Not investigated individually. These are overwhelmingly interface/type-only exports for components and functions that ARE live — TypeScript consumers frequently don't need to import a function's own parameter/return type by name, so "unused type export" is extremely weak signal on its own in this codebase (matches the CLAUDE.md-documented "type-only importer" trap, but in reverse: type NOT imported doesn't mean the value isn't). Flagging the pattern, not each instance — would need per-symbol tracing matching the rigor above before any one of them is actionable. |

---

## INSTRUMENT LIMITS

- **`orphans:mounts` name-collision false negative.** It matches component
  mentions by bare name text against files it's already proven reachable —
  two unrelated files that happen to declare a same-named component (here,
  two different `SprayChart`s) get merged into one reachability bucket. A
  dead file can hide behind a live file's identical name. (Incidental
  Finding #3 / candidate A2.)
- **`orphans:mounts` false-positive on default-export alias mismatch.** When
  a file's declared function name differs from the name callers import it
  as (`OrganizationDashboardPage` vs. the file/import name
  `OrganizationClient`), the script's name-keyed reachability walk never
  marks that file reachable, and everything only reachable *through* it
  reads as orphaned even though it's live. (Incidental Finding #1 —
  `OrgDashboard.tsx`/`TeamSelector.tsx` moved to AMBIGUOUS specifically
  because of this.)
- **`orphans:mounts` only reports `.tsx` files under `src/components/`** that
  declare a component (per its own header docs) — it has zero visibility
  into `.ts` helper/read-model files (candidates A9, A10 were knip+manual
  only) and zero visibility into anything under `src/app/` or `src/lib/`.
- **knip's per-file export analysis reports the root of a laundering chain,
  not everything beneath it**, exactly as warned: a barrel's re-export of a
  dead component reads as "unused" at the barrel, but the component's *own*
  file often reads as "used" because the barrel itself imports it — so a
  dead component that composes other, otherwise-unreferenced files (A4:
  `SnapshotCardGrid` composing all 8 cards in `SnapshotCards.tsx`) requires
  a manual trace of what the flagged root itself imports; knip alone would
  have under-reported this cluster by one file.
- **knip's "unused type" signal is very weak in this codebase** — the vast
  majority of ~150+ unused-type hits in the raw output are Props interfaces
  for components that are demonstrably live; TS consumers routinely don't
  need to import a component's own prop type by name. Included in AMBIGUOUS
  as a documented pattern, not chased individually — chasing all of them at
  the same rigor as the SAFE list would have meant tracing ~150 individual
  symbols, well beyond what a single pass here could respect the "actual
  proof, not padding" bar for.
- **Neither instrument (nor this manual pass) checked dynamic/runtime
  string-keyed lookups** beyond a literal `import(`/`next/dynamic`/
  `React.lazy` grep — a component referenced only via a runtime registry
  keyed by a string built at runtime (not a template literal with a visible
  path) would not be caught by any of the three methods here. No such
  pattern was found for any SAFE candidate, but it's a structural blind spot
  common to all three instruments, not something ruled out with certainty.
- **Server actions, API routes, and database objects were explicitly out of
  scope** for this pass (owned by other sessions per the task brief) — a
  dead component whose only remaining tether is an orphaned server action
  is not visible from this report.
- **knip's full-file "completely unused" report found zero baseball files**
  (7 total repo-wide, all golf/shared/admin) — every baseball dead-code
  finding in this report came from the finer-grained "unused export within a
  used file" signal, which is exactly the blind spot the task predicted
  knip would have on this codebase, and exactly why the manual sweep was
  necessary rather than optional.

---

## TOTAL AND DELETION ORDER

**Whole-file deletions (16 files, 2,988 lines):**
1. `src/components/baseball/living-annual/ToolRail.tsx` (138)
2. `src/components/baseball/living-annual/molecules/GradeStampGrid.tsx` (50)
3. `src/components/baseball/living-annual/molecules/StatLineStack.tsx` (37)
4. `src/components/baseball/living-annual/molecules/TearSheet.tsx` (62)
5. `src/components/baseball/living-annual/molecules/ToolRailStack.tsx` (55)
6. `src/components/baseball/living-annual/viz/BreakPlot.tsx` (191)
7. `src/components/baseball/living-annual/viz/SprayChart.tsx` (218)
8. `src/components/baseball/coach-daily-contract/CoachPlayerDailyContractPanel.tsx` (249)
9. `src/components/baseball/player-profile/snapshot-cards/SnapshotCardGrid.tsx` (111)
10. `src/components/baseball/player-profile/snapshot-cards/SnapshotCards.tsx` (483)
11. `src/components/baseball/signals/CommandSignalStack.tsx` (219)
12. `src/components/baseball/stat-visuals/SpeedArmVisuals.tsx` (601)
13. `src/components/baseball/ui/EvidencePill.tsx` (80)
14. `src/components/baseball/ui/PlayerTile.tsx` (296)
15. `src/components/baseball/ui/StatusRibbon.tsx` (132)
16. `src/components/baseball/performance/lift-onboarding/LiftLabWelcomeState.tsx` (66)

**Partial-file deletions (3 files, ~209 lines removed, files remain):**
17. `src/lib/baseball/read-models/player-lift.ts` — remove `PlayerLiftHome`
    type + `getPlayerLiftHome()` + `getPlayerLiftSession()` (~136 lines)
18. `src/lib/recruiting/stages.ts` — remove `getNextStage()` only (~7 lines)
19. `src/components/baseball/onboarding/StepIndicator.tsx` — remove
    `StepIndicator()` + `StepConfig` (~66 lines)

**Grand total: 16 whole files + 3 partial files = 19 files touched,
~3,197 lines removed** (2,988 whole-file + ~209 partial-file).

**Deletion order (leaves before roots, so `npm run typecheck` stays green at
every step):**

1. **Leaves with zero internal dependents first:**
   `GradeStampGrid.tsx`, `StatLineStack.tsx`, `BreakPlot.tsx`,
   `SprayChart.tsx`, `CoachPlayerDailyContractPanel.tsx`,
   `SnapshotCards.tsx`, `CommandSignalStack.tsx`, `SpeedArmVisuals.tsx`,
   `EvidencePill.tsx`, `PlayerTile.tsx`, `StatusRibbon.tsx`,
   `LiftLabWelcomeState.tsx` — none of these are imported by any other file
   in this list.
2. **Then the two internal-composition roots**, now that their sole
   dependents are gone: `TearSheet.tsx` (depended on `StatLineStack.tsx`,
   already removed in step 1), `SnapshotCardGrid.tsx` (depended on
   `SnapshotCards.tsx`, already removed in step 1).
3. **Then `ToolRailStack.tsx`** (depends on `ToolRail.tsx` via the parent
   barrel) **before `ToolRail.tsx` itself.**
4. **Barrel edits, in the same commits as steps 1–3** (not a separate step —
   do each barrel edit alongside the file(s) it re-exports, so the tree
   never has a dangling re-export of a deleted file):
   `living-annual/index.ts`, `living-annual/molecules/index.ts`,
   `living-annual/viz/index.ts`, `coach-daily-contract/index.ts`,
   `player-profile/snapshot-cards/index.ts`, `signals/index.ts`,
   `stat-visuals/index.ts`, `ui/index.ts`,
   `performance/lift-onboarding/index.ts`.
5. **Partial-file edits last, independently** (no ordering dependency on
   1–4): `player-lift.ts`, `stages.ts`, `StepIndicator.tsx`.
6. **After every step:** `npm run typecheck` (catches any missed caller
   immediately — every candidate here is trivially compile-checked) and
   `npm run lint` (catches an unused-import left behind in a barrel edit).

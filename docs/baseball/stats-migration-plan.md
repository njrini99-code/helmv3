# BaseballHelm Stats Migration / Adapter Plan

> Companion to `docs/baseball/stats-architecture.md`. Keyed to the
> grandfathered allowlist in `src/lib/baseball/stat-layer-manifest.ts`.
> Last updated: 2026-06-30.
>
> **Scope note:** this is a plan, not an implementation. No consumer is
> migrated and no adapter is built in this pass (issue #381 is the
> architecture note + manifest + guard test + this plan). Adapter
> implementation and per-consumer cutover are tracked as follow-up work,
> sequenced below by risk and dependency.

## The shared problem every group has

Every grandfathered consumer derives the same handful of computed metrics
from `baseball_player_stats` / `baseball_player_aggregates` flat rows:
K-rate, BB-rate, AVG / OBP / SLG, ERA, exit velocity, pitch velocity, plus a
few rollup shapes (career/practice/game averages, trend deltas, last-5/
last-10 averages) that only `baseball_player_aggregates` currently
precomputes. None of today's canonical read-models (`stats-center.ts`,
`elite-stat-events.ts`) expose those exact shapes yet — they expose the
box-score/season and event-grain shapes instead. That gap, not consumer
laziness, is why ~30 files still read the deprecated layer directly.

**Recommended approach:** introduce thin adapter helpers inside
`src/lib/baseball/read-models/` (e.g. a new `legacy-stat-adapters.ts`, or
additions to `stats-center.ts`) that expose **flat-row-equivalent shapes**
— same field names a consumer currently destructures off a
`baseball_player_stats` row or a `baseball_player_aggregates` row — but
internally sourced from `baseball_box_score_batting/_pitching` +
`baseball_player_season_stats` (layer 2) and, where the metric is
event-derived (exit velocity, pitch velocity, chase/whiff-style rates),
from `elite-stat-events.ts` (layer 3). A consumer migrates by swapping its
import, not by rewriting its metric math — that's what makes per-consumer
cutover safe to do one file at a time and removable from the allowlist
incrementally, rather than as one big-bang rewrite.

This plan does not commit to the adapter's exact function signatures yet —
that's an implementation-phase decision once a concrete consumer is
selected as the first migration. It commits to the shape contract (inputs
in, same outputs out) and the sequencing below.

---

## Sequencing overview

| Phase | Group | Risk | Why this order |
|---|---|---|---|
| 0 | Type definitions & test fixtures | None (no behavior) | Free — just clean up doc-comment examples once the table names they cite no longer exist anywhere live. Do last, opportunistically, alongside whichever group's last consumer leaves. |
| 1 | Read models already in `read-models/` | Lowest | These are the closest to the canonical layer already (same directory, same "read-model" contract shape) — the adapter work done here is directly reusable by every group below. |
| 2 | Server actions | Low–medium | Each is independently testable and already isolated behind a server action boundary; a regression is contained to one feature surface. |
| 3 | Page / components | Medium | Depends on phase 1/2 adapters existing; UI-visible, so verify against the existing E2E/contract test coverage before cutover. |
| 4 | CoachHelm engine | Highest | The engine's metrics registry, generators, and outcome/baseline tracking are the most interconnected and highest-blast-radius surface (insight generation, action attribution). Migrate last, once the adapter shape has proven stable across phases 1–3. |
| 5 | Retire the legacy writer | Final | Only after every reader above is off the deprecated tables does it become safe to stop writing `baseball_player_stats` / `baseball_player_aggregates` at all (i.e. retire `actions/imports.ts`'s flat-CSV write target and `actions/stats.ts`'s aggregate rollup) and drop the tables. |

---

## Group: Read models (Phase 1)

| File | Target canonical entry point | Adapter shape needed |
|---|---|---|
| `src/lib/baseball/read-models/roster.ts` | `stats-center.ts` (season-level rollup) | Per-player season summary row shaped like the current `baseball_player_aggregates` join (career_avg-equivalent, total sessions) |
| `src/lib/baseball/read-models/player-today.ts` | `stats-center.ts` | "Recent activity" snapshot — last N games, sourced from box-score rows instead of flat stat rows |
| `src/lib/baseball/read-models/player-snapshot-cards.ts` | `stats-center.ts` + `elite-stat-events.ts` | Career/practice/game averages from box-score season rollup, **plus** exit-velocity fields from event data (the file's own comment already flags these as "typed but un-migrated" — this is the fix) |
| `src/lib/baseball/read-models/player-passport.ts` | `stats-center.ts` | "Recent activity counts" card — session/game counts derived from box-score rows in a date window |
| `src/lib/baseball/read-models/command-center.ts` | `stats-center.ts` | Same aggregate join as `roster.ts`; share the adapter rather than duplicating it |

These five share enough shape overlap (career/season averages, recent
activity counts) that they should land behind **one** shared adapter
helper, not five bespoke ones — reducing this group to roughly two new
adapter functions plus five import swaps.

## Group: Server actions (Phase 2)

| File | Target canonical entry point | Adapter shape needed |
|---|---|---|
| `src/app/baseball/actions/stats.ts` | `stats-center.ts` | This file currently *derives* the aggregate shape (career/practice/game avg, trend, last-5/last-10) from flat rows — once `stats-center.ts` exposes season rollups, this derivation logic moves into the adapter and `stats.ts`'s `recalculatePlayerAggregates` becomes a thin caller (or is retired once nothing else needs the `baseball_player_aggregates` row materialized). |
| `src/app/baseball/actions/insights.ts` | `stats-center.ts` | Same player stat + aggregate shape as above, read-only here. |
| `src/app/baseball/actions/operational-signals.ts` | `stats-center.ts` | Game-type recent-span + season-type rollup (OPS/OBP/SLG) for the cold-streak rule — box-score-derived equivalents already exist in `stats-center.ts`'s split logic. |
| `src/app/baseball/actions/practice-effectiveness.ts` | `stats-center.ts` (practice-type rows) | **Caveat:** `stats-center.ts` is currently scoped to official box-score (game) data; practice-session rows are not yet part of either canonical layer. This consumer may need a canonical "practice session" shape added to `stats-center.ts` (or a dedicated practice read-model) before it can migrate — flagged here as a dependency, not assigned a target yet. |

## Group: Page / components (Phase 3)

| File | Target canonical entry point | Adapter shape needed |
|---|---|---|
| `src/app/baseball/(dashboard)/dashboard/players/[id]/page.tsx` | `stats-center.ts` (player profile already needs roughly the same shape `player-passport.ts` needs) | Reuse the Phase 1 adapter once it lands; this page-level fetch should call the read-model directly rather than querying tables itself, matching the pattern `src/contracts/baseball/product-trust.contract.test.ts` already enforces for the command-center page. |
| `src/app/baseball/(dashboard)/dashboard/roster/RosterClient.tsx` | `stats-center.ts` | Reuse the `roster.ts` read-model's adapter once Phase 1 lands — this client should call through the read-model, not duplicate its own `baseball_player_aggregates` query. |

## Group: CoachHelm engine (Phase 4)

| File | Target canonical entry point | Adapter shape needed |
|---|---|---|
| `src/lib/coachhelm/baseball/loaders.ts` | `stats-center.ts` + `elite-stat-events.ts` | The input-series loader for the V10 metrics registry — needs both box-score-derived rate stats (K-rate, BB-rate, AVG/OBP/SLG, ERA, walks/inning) and event-derived velocity metrics (exit velocity, pitch velocity), so this is the one file in the engine that depends on adapters from **both** canonical layers landing first. |
| `src/lib/coachhelm/baseball/metrics/registry.ts` | (consumes `loaders.ts`'s output) | No direct table read — once `loaders.ts` migrates, this file's `source_refs` table-name strings change from `'baseball_player_stats'` to whichever canonical table backs the metric (box-score table or event table), but its math is untouched. |
| `src/lib/coachhelm/baseball/generators/v10.ts`, `generators/index.ts`, `effectiveness/engine.ts` | (citation only) | These only cite `baseball_player_stats` as a `source_refs` table label on generated insights — once `loaders.ts`/`registry.ts` migrate, update the citation string to match the new canonical source table. No data-flow change. |
| `src/lib/baseball/coachhelm/outcome-sweep.ts`, `engine-run.ts`, `action-baseline.ts` | `stats-center.ts` | These read post-action stat rows to compute outcome evidence / baselines — same box-score-derived rate-stat shape as `loaders.ts` needs, so the same adapter should serve all four files. |
| `src/lib/baseball/operational-rule-engine.ts` | `stats-center.ts` | Declares `baseball_player_stats` as a rule `sourceType` — update to the canonical source type alongside `operational-signals.ts`'s migration (Phase 2), since they share the same underlying rule data. |

## Group: Type definitions & test fixtures (Phase 0, opportunistic)

`src/lib/types/baseball-coachhelm.ts`, `baseball-imports.ts`,
`baseball-signals.ts` only cite `baseball_player_stats` as a doc-comment
*example* value (e.g. "Source table, e.g. `'baseball_player_stats'`") — no
code change needed beyond updating the example once a real migrated
caller exists to cite instead.

The test files (`action-baseline.test.ts`, `ai-policy-enforcement.test.ts`,
`outcome-sweep-insight-resolve.test.ts`, `signal-from-insight.test.ts`,
`engine-v10.test.ts`, `registry.role-visibility.test.ts`,
`imports-registry.test.ts`) are fixtures that mirror their corresponding
production file's table usage. Each migrates in lockstep with the
production file it tests — there is no independent test-migration step.

`src/contracts/baseball/product-trust.contract.test.ts` requires no
migration: it already asserts the command-center *page* does **not**
contain `baseball_player_aggregates`, i.e. it's the one place already
proving the target end-state for Phase 3's command-center work. It stays
on the manifest only because the assertion's own source text contains the
table-name string, which the static scanner can't distinguish from a real
reference — see the manifest's note on that entry.

## Group: Legacy writer (Phase 5 — final)

`src/app/baseball/actions/imports.ts` (and the UI it backs:
`ImportCenterShell.tsx`'s "Box score" mode, `ImportWizardClient.tsx`,
`stamped-trust.ts`'s provenance columns, `import-matching.ts`'s match
cross-reference, `event-rows.ts`'s contrast comment) is the writer, not a
reader — it can't "migrate to a read-model." It is retired by ceasing to
route any import feed type to it once:

1. Every reader in phases 1–4 has migrated off `baseball_player_stats` /
   `baseball_player_aggregates` (otherwise retiring the writer just leaves
   stale data behind those readers), and
2. The box-score pipeline (`games.ts`) and/or event pipeline
   (`stat-event-imports.ts`) covers every feed shape coaches currently rely
   on the legacy CSV wizard for (notably: bulk "season totals" CSV imports
   that don't go through a per-game flow today — this may require a new
   canonical season-totals import path before the legacy wizard's
   `season_totals` shape can be safely deprecated outright, not just its
   table target corrected).

Until then, `imports.ts` keeps writing `baseball_player_stats` and stays on
the manifest as the (intentionally) permanent exception: a deprecated
table needs exactly one writer for as long as it has any readers, and that
writer is this one.

## Out of scope for this ticket

- No adapter helper is implemented.
- No consumer's import statement changes.
- No table is dropped or has its RLS/grants altered.
- `ImportWizardClient.tsx`'s `DATA_SHAPE_META` label drift (see
  `docs/baseball/stats-architecture.md`'s "Known drift" section) is not
  corrected here — tracked as a separate, low-risk documentation-only
  follow-up.

All of the above are follow-up work, to be opened as separate, individually
reviewable changes once a first concrete migration target is chosen from
Phase 1.

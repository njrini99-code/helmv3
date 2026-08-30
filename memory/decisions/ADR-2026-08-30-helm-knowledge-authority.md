# ADR-2026-08-30 — Helm knowledge authority

**Status:** accepted · **Date:** 2026-08-30 · **Supersedes:** nothing ·
**Anchor SHA:** `df7bb77fd55d5f9ffa2eb068faa59ec318c6206e`

## Context

Helm already has every primitive an engineering knowledge system needs: a
semantic router, a per-feature current-state corpus, an incident model, append-
only ledgers, a repair queue, a gap registry, generated control-plane truth, and
this decisions directory. Nothing is missing.

What is missing is a statement of **which of them owns which kind of truth**,
and the absence is not theoretical. Measured on the anchor SHA above:

- `memory/README.md` says two feature-doc generations describe the same
  features, that `features/` wins, and that collapsing them is "real work still
  owed". The registry still routes the `recruiting` feature to the losing
  generation — to a file which, verified by search, contains **no recruiting
  section at all**.
- `docs/README.md` opens with "Everything in `docs/` is hand-written prose. None
  of it is generated." Two generated files sit in that directory today
  (`CONTROL_PLANE_ENFORCEMENT.md`, `TOOL_AUTHORITY_MATRIX.md`), and its Start
  Here list points at a ledger whose own header reads `STATUS: SUPERSEDED`.
- `memory/system/golfhelm-engineering-os.md` — the runtime operating contract —
  says a `guard-feature-context` PreToolUse hook denies governed edits. That
  hook file does not exist and is not wired. It also credits a `guard-bash.sh`
  rule deleted on 2026-08-27.
- `memory/ledgers/README.md` documents a `ledgers/operations/` directory that
  has never existed.
- `memory/operations/release-queue.yml` says it is "empty until then, not a
  placeholder for hand-written entries" directly above five hand-written repair
  units.
- `config/open-pr-dispositions.json` declared itself the record of open PRs
  while holding ACTIVE rows for four PRs that had closed or merged.

None of these is a lie anyone told. Each is a statement that was true when it
was written and had no mechanism attached that would notice it stopping being
true. That is the failure mode this ADR addresses, and it is why the answer is
ownership plus regeneration rather than more prose.

The immediate trigger was mechanical rather than editorial. On 2026-08-30
`npm run worktrees:retire` removed a concurrent session's checkout because the
classifier read "no process visible to `lsof` at this instant" as "nobody is
using this". Two documents described the lifecycle; neither was the mechanism;
the mechanism was wrong. That is the same shape at a smaller scale.

## Decision

### 1. One owner per kind of truth

Authority runs top-down. When two sources disagree, the higher one wins and the
lower one is the thing to fix.

<!-- markdownlint-disable MD013 -->

| # | Kind of truth | Authority |
| --- | --- | --- |
| 1 | Live / generated mechanism truth | production, `src/lib/types/database.ts`, generated enforcement + tool-authority docs, and the code itself |
| 2 | Durable repository policy | `AGENTS.md`, then scoped `.claude/rules/*.md` |
| 3 | Semantic routing — which files belong to which feature | `memory/registry.yml` |
| 4 | Current feature behaviour | `memory/features/<feature>.md` |
| 5 | Runtime observability vocabulary | `src/lib/admin/feature-registry.ts` |
| 6 | Confirmed product defects | `memory/incidents/<feature_id>/INC-*.md` |
| 7 | Repair execution state | `memory/operations/release-queue.yml` |
| 8 | Semantic history | `memory/ledgers/changes/**`, `tests/**`, `deployments.md` |
| 9 | Consciously accepted control limitations | `config/control-plane-gaps.json` |
| 10 | Architectural decisions | `memory/decisions/ADR-*.md` |
| 11 | "Is production healthy right now" | Mission Control — **synthesis only** |
| 12 | What was true on a past date | dated snapshots, audits, plans, `docs/archive/**` |

<!-- markdownlint-enable MD013 -->

### 2. Projections summarise; they never become second copies

This is the load-bearing rule, and the one every failure above violates. A
generated file naming its generator is a projection. A hand-written table
restating what a registry holds is a second authority that will drift, and the
drift will be invisible because both copies look equally confident.

Concretely: Mission Control reads from the authorities and stores no independent
narrative of what an issue is, which feature owns it, or whether it is fixed.
`docs/HELM_OS.md` maps authorities and duplicates none of their mutable
contents.

### 3. Identity and name normalization

One canonical identifier per semantic feature: the **`memory/registry.yml` key**,
`snake_case`. Everything else derives from it.

```text
feature id          golf_round_lifecycle          registry.yml key, canonical
change ledger       memory/ledgers/changes/golf_round_lifecycle.md
test ledger         memory/ledgers/tests/golf_round_lifecycle.md
incidents           memory/incidents/golf_round_lifecycle/INC-*.md
feature doc         declared explicitly at registry.features.<id>.docs.feature
```

Ledgers and incidents use the id verbatim. The feature doc is the one path that
is **declared, not derived** — 17 of 20 happen to be
`memory/features/<kebab(id)>.md`, but three deliberately point elsewhere, and a
derived rule would either forbid that or silently mis-resolve it. Checkers read
the declaration.

No feature may be reachable under two spellings without an explicit alias
recorded in the registry.

### 4. The three feature maps, and why there are three

They are not duplicates and must not be merged.

**`memory/registry.yml` — semantic identity.** Which code paths belong to a
feature, which docs describe it, which tests and checks apply. 20 features. This
is what `knowledge:map` and `knowledge:context` route through.

**`src/lib/admin/feature-registry.ts` — runtime observability vocabulary.** The
`FeatureKey` union written into `admin_events.feature`, plus action manifests,
primary and heartbeat tables, traffic tier and health signal. 87 keys across
three apps. It is consumed by running code and cannot be replaced by a document.

The relationship is **many-to-one and deliberately so**: `qualifiers` and
`my_qualifiers` are one semantic feature and two telemetry surfaces. The
crosswalk therefore lives *inside* `memory/registry.yml`, as an `observability`
block on each feature, rather than in a third file:

```yaml
qualifiers:
  observability:
    feature_keys: [qualifiers, my_qualifiers]
```

A runtime key with no semantic owner must be classified explicitly —
`observability_only`, `platform`, or `excluded` — never left unmapped. Silence
is what this ADR exists to remove.

**`docs/superpowers/specs/helm-bridge/FEATURE_COVERAGE.md`** currently calls
itself a canonical spec. It is demoted to `DESIGN_SPEC`, historical. A directory
named `specs/` cannot hold a live runtime registry: nothing regenerates it and
nothing fails when it drifts.

### 5. Current-state registries hold current state, in both directions

A registry that only ever grows is a history file wearing a registry's name.
Every current-state registry fails on a stale entry as well as a missing one.
`config/open-pr-dispositions.json` is the first to enforce it.

**Stated cost, accepted — both ends.** Opening a PR turns
`control-plane:verify` red until a row is written for it, and the row can only
land after the PR exists. Merging one turns it red again until the row is
removed, and that removal can only land in a later PR. Every PR therefore
carries two transients on `main`.

That is real friction and it is the point. An unclassified open PR is exactly
the background state that let #1623 sit open for weeks while `main` carried a
stale route count, with nobody wrong because nobody owned it — and a leftover
row is the same failure inverted, a current-state file asserting something that
stopped being true. The alternative considered and rejected was to check only
the missing direction, which is what the file did while accumulating four dead
rows.

### 6. No rule may claim more enforcement than the inventory proves

`docs/CONTROL_PLANE_ENFORCEMENT.md` is regenerated from `.claude/settings.json`
and the hook scripts on disk. Where a rule and that inventory disagree about
whether something is *prevented*, the inventory wins and the rule is corrected —
never the reverse. Policy ("load feature context before mutating") stays in
prose; enforcement ("this is denied") does not.

## Rejected alternatives

**A new unified feature database.** Rejected: the problem is not missing storage,
it is several descriptions of one truth with different update paths. A fourth
map makes that strictly worse, and `memory/registry.yml` already holds semantic
identity.

**Merging `registry.yml` into `feature-registry.ts`.** Rejected: one is read by
agent tooling at authoring time and one is imported by running product code.
Merging them couples documentation edits to a shipped bundle and forces a
one-to-one identity the 87-to-20 measurement shows is false.

**A `KNOWN_ISSUES.md` or `issues.json`.** Rejected: `memory/incidents/**`,
`config/control-plane-gaps.json`, `memory/decisions/**` and the release queue
already express confirmed defect, accepted limitation, undecided product
question, and in-flight repair — four different lifecycles that a single flat
list would flatten into one.

**Deleting the superseded documents.** Rejected: they are evidence. They are
marked historical and unrouted instead. The goal was never fewer files.

**A prose contradiction detector.** Rejected: natural-language contradiction
detection by regex produces confident nonsense, and this repo has already
deleted one guard for exactly that. The authority checker verifies *structural*
claims — a declared path exists, a generated file names its generator, a
superseded document names its replacement, no two documents claim the same
registered role — and reports the rest for a human.

## Consequences

- `docs/HELM_OS.md` becomes the navigation entry point and is non-authoritative
  for every mutable fact by construction.
- `npm run knowledge:check` grows registry-reconciliation, ledger-integrity and
  authority-integrity stages; `npm run helm-os:check` composes the static set.
  Neither may require network, Supabase, Sentry or Vercel — those stay in
  `control-plane:verify`.
- `memory/context/golfhelm-features.md` stops being routed as any feature's
  current-state doc. It remains in the tree, marked historical.
- Every claim in this ADR that a mechanism enforces something is checkable
  against `docs/CONTROL_PLANE_ENFORCEMENT.md`. If this file and that file ever
  disagree, that file is right.

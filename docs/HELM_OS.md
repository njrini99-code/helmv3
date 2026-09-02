# Helm OS — where each kind of truth lives

**This document maps authorities. It does not duplicate their mutable contents.**

Nothing here is the source of truth for anything. Every row points at the file,
registry, or mechanism that is — so that when one of them changes, this page
does not silently become wrong. If you find a fact stated here rather than
linked, that is a defect in this page.

The reasoning behind the map, and the alternatives rejected, is
`memory/decisions/ADR-2026-08-30-helm-knowledge-authority.md`.

---

## Start here

<!-- markdownlint-disable MD013 -->

| Question | Authority |
| --- | --- |
| What features exist, at a glance? | `docs/generated/HELM_FEATURE_MAP.md` (generated) |
| What files belong to a feature? | `memory/registry.yml` |
| How does that feature behave now? | the `docs.feature` it maps to, plus verified code |
| What telemetry key does runtime use? | `src/lib/admin/feature-registry.ts` |
| What confirmed product defects exist? | `memory/incidents/**` |
| What repair is in flight? | `memory/operations/release-queue.yml` |
| What changed, and why? | `memory/ledgers/changes/**` |
| What test guarantee changed? | `memory/ledgers/tests/**` |
| What deployed? | `memory/ledgers/deployments.md` |
| What architectural decision was made? | `memory/decisions/**` |
| What limitations are consciously accepted? | `config/control-plane-gaps.json` |
| Which open PRs intentionally remain? | `config/open-pr-dispositions.json` |
| What is mechanically enforced? | `docs/CONTROL_PLANE_ENFORCEMENT.md` |
| Which tools carry authority? | `docs/TOOL_AUTHORITY_MATRIX.md` |
| What do Sentry and `admin_events` each mean? | `docs/OBSERVABILITY_AUTHORITY.md` |
| How does self-heal operate? | `docs/ai-system/selfheal/` |
| Is production healthy right now? | Mission Control, synthesised from the rows above |
| What was true on a past date? | the dated snapshot, audit, or `docs/archive/**` |

<!-- markdownlint-enable MD013 -->

---

## The map

```text
POLICY
  AGENTS.md                             the constitution
  .claude/rules/*.md                    scoped, path-attached
  CLAUDE.md                             adapter; AGENTS.md outranks it

SEMANTIC PRODUCT MODEL
  memory/registry.yml                   feature identity + code ownership + routing
  memory/features/*.md                  current behaviour, per feature
  docs/generated/HELM_FEATURE_MAP.md    navigation projection (generated)

RUNTIME FEATURE HEALTH
  src/lib/admin/feature-registry.ts     FeatureKey vocabulary, tables, tiers

OBSERVABILITY MEANING
  docs/OBSERVABILITY_AUTHORITY.md       what each surface knows
  docs/OBSERVABILITY.md                 how application code emits

DEFECTS AND REPAIR
  memory/incidents/<feature_id>/        confirmed product defects
  memory/operations/release-queue.yml   repair units and their state

HISTORY
  memory/ledgers/changes/*              behavioural history, per feature
  memory/ledgers/tests/*                test-contract history, per feature
  memory/ledgers/deployments.md         one row per production promote

DECISIONS
  memory/decisions/ADR-*.md             architecture, and what was rejected

CONTROL PLANE
  config/control-plane-gaps.json        knowingly accepted limitations
  docs/CONTROL_PLANE_ENFORCEMENT.md     what is actually enforced (generated)
  docs/TOOL_AUTHORITY_MATRIX.md         tool/connector capability (generated)
  config/open-pr-dispositions.json      open PRs, and what may happen to them

SELF-HEAL CONTRACT
  docs/ai-system/selfheal/              capture -> diagnose -> repair -> close

HISTORICAL EVIDENCE ONLY
  docs/archive/**                       never current architecture or schema
  docs/audits/*                         dated audits
  docs/ai-system/selfheal/STATE-*.md    dated snapshots
  docs/superpowers/plans|specs/**       plans and design specs
```

---

## Mission Control is a projection, not a ledger

It answers one question — *what is known right now* — by reading the
authorities. It stores no independent narrative of what an issue is, which
feature owns it, or whether it is fixed. Those already have owners, and a second
copy would be a second thing to keep true.

```text
runtime surfaces        Sentry · admin_events · heartbeats
feature vocabulary      src/lib/admin/feature-registry.ts
semantic ownership      memory/registry.yml
confirmed defects       memory/incidents/**
repair state            memory/operations/release-queue.yml
accepted limitations    config/control-plane-gaps.json
        ↓
MISSION CONTROL — synthesis
```

What each surface may and may not claim is
`docs/OBSERVABILITY_AUTHORITY.md`. The rule that matters most:

> A count of zero from one surface is not a statement about production. It is a
> statement about that surface.

## The self-heal loop, and where it hands off to Git

`docs/ai-system/selfheal/` owns the runtime half — capture, diagnose, repair,
close — against `admin_events`, `rca_analysis`, `admin_error_resolutions` and
background-job heartbeats. That model is unchanged. What was never written down
is where it crosses into the Git-backed records:

```text
runtime event                    admin_events / Sentry
      ↓  diagnose                rca_analysis
CONFIRMED ROOT CAUSE
      ↓                          <-- the handoff
memory/incidents/<feature_id>/   the durable defect
      ↓
release-queue.yml repair unit    observed → … → verified_in_production
      ↓
PR, merge, release
      ↓
ledgers/changes · ledgers/tests · deployments.md
      ↓
memory/features/<feature>.md     current behaviour updated
```

The two halves have different jobs. Database rows are what production emits and
are queryable but not reviewable; the Git records are what a human decided, and
they are reviewable, portable and diffable. A root cause that stays only in
`rca_analysis` has no owner; an incident with no runtime evidence has no proof.

---

## Three rules that make the map hold

**A projection may summarise an authority. It may never become a second copy
with its own update path.** A generated file that names its generator is a
projection. A hand-written table restating a registry is a second authority that
will drift, and both copies will look equally confident while it does.

**Generated truth outranks prose, always.** `src/lib/types/database.ts`,
`src/lib/golf/surface-registry.ts`, the `AUTOGEN:*` blocks in `memory/`, and the
two generated control-plane documents. Never hand-edit inside an AUTOGEN block.

**A rule may not claim more enforcement than the inventory proves.**
`docs/CONTROL_PLANE_ENFORCEMENT.md` is regenerated from `.claude/settings.json`
and the hook scripts on disk. Where a rule and that file disagree about whether
something is *prevented*, that file is right.

---

## Finding the context for a task

```bash
npm run knowledge:map -- --files <paths...>            # file -> feature
npm run knowledge:context -- --files <paths...> --task "<task>"
```

## Checking that the map still holds

```bash
npm run docs:check          # generated docs, schema names, doc paths
npm run knowledge:check     # feature/ledger/authority integrity
npm run knowledge:feature-map  # regenerate the feature map after a registry edit
npm run control-plane:verify  # runtime capability and enforcement truth
```

The first two are static and need no network, database or connector. The third
reaches GitHub and the live configuration, and is the only one that can report
UNKNOWN.

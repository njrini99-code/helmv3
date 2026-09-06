# docs/ — Index

> **Trust first.** `docs/` holds two kinds of file and they carry different
> weight.
>
> **Generated projections** — regenerated from a mechanism, and authoritative
> for what that mechanism currently does. Each one names its generator in its
> own header, and a `--check` mode fails CI when the file and the mechanism
> disagree:
>
> | File | Gate |
> | --- | --- |
> | `CONTROL_PLANE_ENFORCEMENT.md` | `npm run enforcement:check` |
> | `TOOL_AUTHORITY_MATRIX.md` | `npm run tool-authority:check` |
> | `generated/HELM_FEATURE_MAP.md` | `npm run knowledge:check` |
>
> This preamble read "Everything in `docs/` is hand-written prose. None of it is
> generated" until 2026-08-30, while both files above sat in this directory. A
> trust model that misclassifies its own strongest sources is worse than none.
>
> **Hand-written prose** — everything else. Not verified on write, and some of
> it is known stale. Two CI gates bound the damage — `npm run docs:schema-drift`
> (database names) and `npm run docs:path-drift` (file paths) — but they cover
> `memory/**`, `.claude/rules/**`, `CLAUDE.md`, `AGENTS.md` and
> `docs/REPO_MAP.md`, **not this whole tree**.
>
> For anything you intend to *act* on — a table name, a column, a file path —
> prefer a generated source. **Hand-written `docs/` tells you why things are the
> way they are; the code, the `AUTOGEN` blocks and the generated projections
> tell you what is actually there.**
>
> Known stale, flagged in place: **`docs/REPO_MAP.md` is well past its verify
> point.** It records its anchor SHA; run
> `git rev-list --count <sha>..HEAD -- 'src/**'` for the current distance rather
> than trusting a number written here, which starts rotting the day it is typed.
>
> **Where each kind of truth lives:** `docs/HELM_OS.md`.

## Canonical map

**`memory/registry.yml`** is the canonical living-doc map for this repo — it maps code
paths to current-state feature docs, business rules, UI contracts, tests, and suggested
checks. Before trusting any doc in this tree (including this index) for a specific
code change, prefer the registry:

```bash
npm run knowledge:map -- --files <paths...>
npm run knowledge:context -- --files <paths...> --task "<task>"
```

A file's presence in `memory/registry.yml` means its path is load-bearing — those files
never move (see `docs/archive/` semantics below). Everything else in `docs/` is
organized into the clusters listed further down, or has already been swept into
`docs/archive/`.

## Start here

For orientation before diving into a specific doc cluster, read (in rough order):

- **`CLAUDE.md`** — product rules, stack, design system, code patterns, context routing.
- **`AGENTS.md`** — agent/session operating conventions.
- **`memory/README.md`** — ⭐ **the trust map for the knowledge base.** Which files
  are generated (authoritative) vs hand-written (hint only), what the two CI
  gates measure, and which of the two feature-doc generations wins. Read this
  before `memory/glossary.md` or anything in `memory/context/`.
- **`memory/glossary.md`** — every table, view, function, enum, and type location.
- **`memory/projects/golfhelm.md`** — all GolfHelm routes, action files, component tree.
- **`memory/features/*.md`** — the current-state feature corpus, reached
  through `memory/registry.yml`. For BaseballHelm the corpus is still
  **`memory/context/baseballhelm-features.md`**; the golf equivalent
  (`memory/context/golfhelm-features.md`) is historical as of 2026-08-30 and
  is routed from nowhere.
- **`docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`** — source of truth for what BaseballHelm
  should be.
- **`memory/incidents/`** — confirmed product defects, one file per incident, per
  feature. This entry used to point at `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md`
  as the ledger "driving the current clean-slate work"; that file's own header
  reads `STATUS: SUPERSEDED` and has since 2026-07-10. Both dated issue ledgers
  under `docs/audits/` are historical audits now — current defects flow through
  the incident system, and `config/control-plane-gaps.json` holds the
  consciously accepted limitations.
- **`docs/business/`** — the business-model cluster (personas, JTBD, product invariants,
  revenue/packaging, competitor positioning).
- **`docs/baseball/`** — active BaseballHelm design docs (execution plan, production
  roadmap, "Living Annual" design system, stats architecture).

## `docs/archive/<YYYY-MM>/`

Every subfolder under `docs/archive/` is a dated bucket of superseded/historical
docs — phase plans, stale architecture snapshots, completed audits, old UI-system docs.
The `<YYYY-MM>` is the **content date** of the material (a `Generated:`/`Date:` header or
a filename-embedded date), not the date it was archived — git-log dates on this repo are
unreliable for that purpose (a 2026-07-01 bulk commit touched most files). Nothing under
`docs/archive/` is maintained going forward; treat it as a historical record, not a live
reference. If an archived doc is still linked from a living doc, that link is deliberately
flagged as archived/stale at the link site rather than silently pointing into the past.

## Living clusters

These directories are actively maintained and safe to treat as current:

| Cluster | Path(s) | What's in it |
|---|---|---|
| **Setup** | `docs/setup/` | Environment variables, deploy, OAuth, Supabase MCP, backup/DR, integration setup guides (Resend, Gmail send, error monitoring). |
| **Business** | `docs/business/` | The model cluster: business context, personas, jobs-to-be-done, product invariants, workflow maps, revenue/packaging, competitor positioning, per-product business context. |
| **Baseball** | `docs/baseball/` | Active BaseballHelm design docs: execution/production-readiness plans, nav proposals, "Living Annual" design system, stats architecture/migration. |
| **Operations + Context** | `docs/operations/` (incl. `docs/operations/context/`) | Runbooks, incident/investigation logs, business contract + feature-readiness matrices, and the curated Mission Control context pack (`context/SYSTEMS_AND_DATA_MAP.md`, `context/MISSION_CONTROL_CONTEXT_INDEX.md`) that points into the deeper engineering docs. |
| **Reference** | `docs/seed/`, `docs/security/`, `docs/research/`, `docs/lifting-lab/`, `docs/ai-system/` | `docs/seed/`, `docs/research/` and `docs/lifting-lab/` are still single-file (demo-data contract, coach-outreach legal/best-practices, Lift Lab blueprint). `docs/security/` has grown to two files (`auth-config.md` plus `accepted-risks.md`). `docs/ai-system/` has grown well past single-file into the control-plane doc cluster (`HELM_AUTONOMY_CONTROL_PLANE.md`, the self-healing/reliability specs, `selfheal/`, `briefs/`, `FEATURE_FLAGS.md`, plus the original `helmv3-ai-codebase-intelligence.md`) — see `memory/system/golfhelm-engineering-os.md` for how those pieces relate. Kept as separate top-level dirs rather than consolidated because `docs/security/auth-config.md` and `docs/ai-system/helmv3-ai-codebase-intelligence.md` are `memory/registry.yml`-referenced paths that must not move — the rest stay alongside them for consistency. |

## Loose files at `docs/` root

**Every loose root file is referenced from outside `docs/`.** That is the
invariant to preserve: if a file sits loose at the root, something points at it.
For the current census — how many there are and what each one is — read the
generated document inventory rather than a number typed here;
`docs/HELM_OS.md` says where it lives.

A 2026-08-20 sweep archived the unreferenced remainder into
`docs/archive/superseded-2026-08/` — completed one-shot audits, fix plans and
session reports (verified by grep across `CLAUDE.md`, `AGENTS.md`, `.claude/`,
`memory/`, `scripts/`, `src/`, `.github/`, `.circleci/` and `package.json`
before moving; the path-drift gate confirmed zero broken links after). They are
history, not reference.

The two counts that stood here — "there are 22" and "the other 44" — are gone
on purpose. `.claude/rules/shipping.md` §1 forbids writing a count into prose
because it rots within weeks and reads as current forever, and an index that
breaks that rule about itself is not one to trust about anything else.

What remains loose, and why:

| File(s) | Why it stays |
|---|---|
| `REPO_MAP.md`, `CODEBASE_MAP.md`, `CI_RUNBOOK.md`, `OBSERVABILITY.md`, `README.md` | Routed to from `CLAUDE.md` / `AGENTS.md` / `.claude/rules/` |
| `v3-*.md` (9 files) | Referenced from `memory/registry.yml` — registry paths never move |
| `SECURITY_AUDIT.md`, `BASEBALL_RLS_SECURITY_AUDIT.md`, `PRIVACY_AUDIT.md`-class | Cited from rules or audit docs as standing references |
| `AGENT_LIFECYCLE.md` | Documented exception, added 2026-09-06: a self-auditing trace of the agent/CI machinery with its own staleness check (an anchor SHA + a `git rev-list` command at the top of the file). Nothing outside `docs/` links to it yet — the trace itself currently reports as unverified past its anchor, so re-run its own check before adding a link that implies it's current. |
| the rest | Each is linked from a living doc or the registry |

**Before adding a file here:** put it in a cluster directory instead. A loose
root file is only justified when something outside `docs/` links to it directly.

**Before moving or deleting anything:** check `memory/registry.yml`, then run
`npm run docs:path-drift` — it will tell you if you broke a reference.

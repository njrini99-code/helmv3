# docs/ — Index

> **Trust first.** Everything in `docs/` is hand-written prose. None of it is
> generated, none of it is verified on write, and several files here are known
> stale. Two CI gates bound the damage — `npm run docs:schema-drift` (database
> names) and `npm run docs:path-drift` (file paths) — but they cover
> `memory/**`, `.claude/rules/**`, `CLAUDE.md`, `AGENTS.md` and
> `docs/REPO_MAP.md`, **not this whole tree**.
>
> For anything you intend to *act* on — a table name, a column, a file path —
> go to the generated sources instead: `memory/README.md` explains which those
> are and why. **`docs/` tells you why things are the way they are; the code
> and the `AUTOGEN` blocks tell you what is actually there.**
>
> Known stale, flagged in place: **`docs/REPO_MAP.md` is 192 `src/**` commits
> past its verify point** — treat its counts and `file:line` anchors as hints.

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
- **`memory/context/golfhelm-features.md`** / **`memory/context/baseballhelm-features.md`** —
  feature-by-feature data flow, files, tables, gaps, per product.
- **`docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`** — source of truth for what BaseballHelm
  should be.
- **`docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md`** — validated, per-issue root-cause
  ledger driving the current clean-slate work.
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
| **Reference** | `docs/seed/`, `docs/security/`, `docs/research/`, `docs/lifting-lab/`, `docs/ai-system/` | Five single-file, single-purpose reference docs (demo-data contract, auth config, coach-outreach legal/best-practices, Lift Lab blueprint, AI codebase-intelligence report). Kept as separate top-level dirs rather than consolidated because two of them (`docs/security/auth-config.md`, `docs/ai-system/helmv3-ai-codebase-intelligence.md`) are `memory/registry.yml`-referenced paths that must not move — the other three stay alongside them for consistency. |

## Loose files at `docs/` root

**As of 2026-08-20 there are 22, and every one is referenced from outside
`docs/`.** That is the invariant to preserve: if a file sits loose at the root,
something points at it.

The other **44 were archived into `docs/archive/superseded-2026-08/`** on
2026-08-20 — completed one-shot audits, fix plans and session reports that
nothing referenced (verified by grep across `CLAUDE.md`, `AGENTS.md`,
`.claude/`, `memory/`, `scripts/`, `src/`, `.github/`, `.circleci/` and
`package.json` before moving; the path-drift gate confirmed zero broken links
after). They are history, not reference.

What remains loose, and why:

| File(s) | Why it stays |
|---|---|
| `REPO_MAP.md`, `CODEBASE_MAP.md`, `CI_RUNBOOK.md`, `OBSERVABILITY.md`, `README.md` | Routed to from `CLAUDE.md` / `AGENTS.md` / `.claude/rules/` |
| `v3-*.md` (9 files) | Referenced from `memory/registry.yml` — registry paths never move |
| `SECURITY_AUDIT.md`, `BASEBALL_RLS_SECURITY_AUDIT.md`, `PRIVACY_AUDIT.md`-class | Cited from rules or audit docs as standing references |
| the rest | Each is linked from a living doc or the registry |

**Before adding a file here:** put it in a cluster directory instead. A loose
root file is only justified when something outside `docs/` links to it directly.

**Before moving or deleting anything:** check `memory/registry.yml`, then run
`npm run docs:path-drift` — it will tell you if you broke a reference.

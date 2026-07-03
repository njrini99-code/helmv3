# Helm Mission Control — Context Pack Index

> **Read this first.** This folder (`docs/operations/context/`) is the curated,
> partner-and-agent-readable context layer for Helm Mission Control. It does not
> replace the deep engineering docs — it points to them and adds the
> business/ops/telemetry lens the command center needs to answer:
>
> _What is Nick fixing? What changed today? What shipped? What is blocked?
> What is broken in production? What needs partner review? What do competitors
> do? What tools run this company?_

---

## What lives here

| Doc | What it gives you | Primary readers |
|---|---|---|
| [PRODUCT_CONTEXT_PACK.md](PRODUCT_CONTEXT_PACK.md) | 60-second brief per product (BaseballHelm, GolfHelm, CoachHelm, Lift Lab, Platform): buyer/users, jobs-to-be-done, key surfaces, never-break invariants, maturity. | Partners, n8n triage, Greptile |
| [TOOLS_AND_SERVICES_REGISTRY.md](TOOLS_AND_SERVICES_REGISTRY.md) | Every tool/service Helm runs on, grouped by category, with purpose, tier, where configured, and partner-visibility. | Nick, ops, onboarding |
| [COMPETITIVE_INTEL_BASELINE.md](COMPETITIVE_INTEL_BASELINE.md) | Competitor profiles (golf, baseball recruiting/team/hardware, coaching-AI) with strengths, gaps, Helm's edge, threat level. Seeds the Huly Competitive Intel space. | Partners, roadmap, GTM |
| [TELEMETRY_BASELINE.md](TELEMETRY_BASELINE.md) | Point-in-time production-health snapshot (live Sentry + Vercel), top issues by blast radius, and the prioritized fix list. Seeds the Huly Telemetry space. | Nick, n8n Sentry/Vercel workflows |
| [SYSTEMS_AND_DATA_MAP.md](SYSTEMS_AND_DATA_MAP.md) | How the system fits together (request path, tenancy, products→surfaces→tables→integrations) and where the authoritative maps live. | Engineers, Claude/Codex agents |

---

## The deeper source-of-truth docs this pack points to

This context pack is a **lens**, not a duplicate. The authoritative detail lives here:

**Business / product truth** (already used by Greptile as review context):
- `docs/business/00-business-context.md` … `09-coachhelm-business-context.md` — company, personas, jobs-to-be-done, product invariants, workflow maps, revenue/packaging, competitor positioning, and per-product context.

**Engineering / feature truth:**
- `memory/context/golfhelm-features.md`, `golfhelm-database.md`, `coachhelm-ai.md`
- `memory/context/baseballhelm-features.md`, `baseballhelm-database.md`, `baseballhelm-workflows.md`
- `memory/glossary.md` — canonical table names, enums, type locations.
- `CLAUDE.md` / `AGENTS.md` — engineering conventions, routing, design tokens.

**Maps of "everything":**
- `.devin/wiki.json` — Devin's repo map (repo notes + titled pages).
- `docs/CODEBASE_MAP.md` — Cartographer system overview + mermaid diagram (~1,752 files).
- `docs/archive/2026-01/architecture/ROUTE_INVENTORY.md` — route/page/layout inventory + orphan detection (archived, stale — dated 2026-01-01).
- `docs/archive/2026-06/baseballhelm_revolution_plan_v2/` — the BaseballHelm program plan, IA maps, data model v2 (superseded by `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md`; archived 2026-07).

**Mission Control operating model:**
- `docs/operations/HELM_MISSION_CONTROL_OS.md` — the master operating system.
- `docs/operations/GIT_ACTIVITY_TIMELINE.md`, `PARTNER_INTAKE_TO_PR_PIPELINE.md`,
  `N8N_WORKFLOW_SPECS.md`, `HULY_WORKSPACE_SETUP.md`, `GITHUB_LABELS_AND_PROJECT_SETUP.md`.

---

## For Mission Control (how the automation uses this pack)

- **Greptile** — these docs are high-signal review context. Add the ones relevant
  to a surface to `.greptile/files.json` so PR review is product-aware (e.g.
  competitive intel + product pack when judging whether a change strengthens the edge).
- **n8n** — the intake/triage workflows read `PRODUCT_CONTEXT_PACK.md` (to route by
  product/surface) and `TELEMETRY_BASELINE.md` (to correlate a Sentry/Vercel signal
  with a product). The Daily CEO Brief and Weekly Partner Update pull the "what's
  broken / what shipped / competitive signals" framing from here.
- **Huly** — seed the **Competitive Intel** space from `COMPETITIVE_INTEL_BASELINE.md`,
  the **Telemetry / App Health** space from `TELEMETRY_BASELINE.md`, and the
  **Docs Registry** with this whole folder (status: Current on merge).

> **Freshness:** the telemetry snapshot is point-in-time; the tools/competitor/product
> docs should be reviewed when a tool, competitor, or product materially changes.
> Everything else here is durable. No secrets, tokens, or PII live in this folder — pointers only.

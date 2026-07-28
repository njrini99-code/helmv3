# Helm Feature-Scan Research Pack (2026-07-26)

Read-only research pass of **njrini99-code/helmv3** (default branch `main`) and connected Supabase project **Helm-Production** (`qmnssrrolpinvwjjnufo`, region `us-east-1`).

**Purpose:** Authoritative, evidence-backed specification so a separate testing agent can build a comprehensive automated feature-bug scan (Playwright, API, DB assertions, visual, a11y, role workflows) without rediscovering the application.

**Rules followed:** No application code changes, no commits, no PRs, no schema/data mutations, no secrets exposed.

## Documents

| # | File | Contents |
|---|------|----------|
| 1 | [helm-system-overview.md](./helm-system-overview.md) | Products, architecture, deploy, auth/tenancy, AI, integrations, risks |
| 2 | [helm-feature-catalog.md](./helm-feature-catalog.md) | Stable feature IDs + status for Golf/Baseball/Lift/Admin/CRM/AI |
| 3 | [helm-route-inventory.md](./helm-route-inventory.md) | Routes, auth, roles, shims, nav linkage |
| 4 | [helm-role-permission-matrix.md](./helm-role-permission-matrix.md) | UI vs server vs RLS permission comparison |
| 5 | [helm-database-map.md](./helm-database-map.md) | Data dictionary summary, relationships, RLS, storage |
| 6 | [helm-workflow-specifications.md](./helm-workflow-specifications.md) | End-to-end workflow traces for P0/P1 paths |
| 7 | [helm-coachhelm-ai-map.md](./helm-coachhelm-ai-map.md) | CoachHelm V3 architecture, tools, prompts, testing |
| 8 | [helm-test-personas-and-seed-data.md](./helm-test-personas-and-seed-data.md) | Personas, seed blueprint, deterministic IDs |
| 9 | [helm-feature-scan-blueprint.md](./helm-feature-scan-blueprint.md) | Playwright/CI handoff for the testing agent |
| 10 | [helm-test-case-matrix.csv](./helm-test-case-matrix.csv) | Proposed tests (one row per test) |
| 11 | [helm-bug-risk-register.md](./helm-bug-risk-register.md) | Ranked hotspots with evidence |
| 12 | [helm-open-questions.md](./helm-open-questions.md) | Unresolved unknowns |

## Confidence legend

- **Confirmed** — Direct code + DB evidence
- **Strongly inferred** — Multiple evidence pieces; runtime not observed
- **Tentative** — Incomplete evidence
- **Unknown** — Insufficient evidence

## Snapshot facts (2026-07-26)

- Repo: `https://github.com/njrini99-code/helmv3`, branch `main` @ `88721852`
- Pages: Golf 66 · Baseball 107 · Lifting 23 · Admin 22 · Total app pages ~229
- API `route.ts`: 52
- Golf actions: ~165 · Baseball actions: ~99
- Public tables: 264 (all RLS enabled) · Policies: 940 · Views: 6 · Matviews: 1
- Migrations in repo: 256 · Edge functions (live): 4 · Vercel crons: 18
- Unit tests ~816 · E2E specs 22 · pgTAP RLS suites 47 · Vitest RLS project: 0 files
- Open PRs: 0 · Open issues: many QA/product (see risk register)

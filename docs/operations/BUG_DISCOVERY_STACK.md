# Bug Discovery Stack

Master map of how Helm finds bugs before and after merge. Layers align with **PR** (static + contracts), **runtime** (browser), **data** (DB + RLS), and **production** (live/staging signals).

See also: [`FREE_PRODUCTION_READINESS_STACK.md`](./FREE_PRODUCTION_READINESS_STACK.md), [`GATE_MATRIX.md`](./GATE_MATRIX.md), [`CI_RUNBOOK.md`](./CI_RUNBOOK.md).

## Unified npm entry points

| Script | Layer | What it runs |
|---|---|---|
| `npm run verify:bugs:pr` | PR | Route hygiene, gitleaks, Semgrep, business contracts |
| `npm run verify:bugs:runtime` | Runtime | Route crawler, critical E2E, a11y, Playwright visual |
| `npm run verify:bugs:data` | Data | RLS tests, read-only prod DB audit |
| `npm run verify:bugs:advisory` | Advisory | Schemathesis stub, dependency-cruiser, jscpd, Helm auditor |

Run the full local sweep:

```bash
npm run verify:bugs:pr && npm run verify:bugs:runtime && npm run verify:bugs:data && npm run verify:bugs:advisory
```

---

## Layer map

### PR hunter (static + contracts)

Catches wrong routes, leaked secrets, unsafe patterns, and product-truth regressions before code ships.

| Tool | Status | npm script | Workflow / CI | Bug class |
|---|---|---|---|---|
| Route hygiene P0/P1 | **Hard gate** | `routes:check` | `free-production-readiness.yml` → Route Hygiene | Missing/duplicate routes, stale links, Golf/Baseball boundary leaks |
| Business contracts | **Hard gate** | `verify:business` | `free-production-readiness.yml` → Business contracts | Stats/CoachHelm/product-trust regressions |
| Business source-shape | Advisory | `test:business:advisory` | Same workflow, `continue-on-error` | Contracts that still need behavior tests |
| Gitleaks | **Hard gate** | `secrets:scan` | `review-gate.yml` | Leaked secrets in working tree |
| Semgrep (Helm rules) | **Hard gate** (Review Gate) + advisory radar | `analyze:semgrep` | `review-gate.yml`, `free-production-readiness.yml` → Static radar | Service-role in client, silent errors, route anti-patterns |
| ast-grep | **Hard gate** | — | `review-gate.yml` | Banned project patterns |
| dependency-cruiser | Advisory (P2/P3) | `analyze:deps` | Static radar job | Architecture boundary smells |
| jscpd | Advisory | `analyze:duplicates` | Static radar job | Duplicate code clusters |
| Knip | Advisory | `analyze:knip` | CircleCI weekly | Dead exports / unused files |
| CodeRabbit + Greptile | External (installed) | — | GitHub App on every PR | Line-level + whole-repo drift review |
| Greptile TREX | External setup | — | [Greptile dashboard](https://app.greptile.com) | AI test-generation from PR context — enable per repo in Greptile settings |

### Runtime (browser + UX)

Catches broken pages, navigation, accessibility, and visual regressions.

| Tool | Status | npm script | Workflow / CI | Bug class |
|---|---|---|---|---|
| Playwright smoke | **Hard gate** | `verify:e2e:smoke` | `playwright-smoke.yml` | Critical entry paths |
| Playwright full E2E | Advisory | `test:e2e` | `playwright.yml` | Auth flows, dashboards, round entry |
| Route crawler | Advisory | `routes:crawl` | `free-production-readiness.yml` → Route Crawler | Unlinked routes, runtime 404/500 |
| Critical E2E | Local + advisory | `e2e:critical` | — | High-value product paths |
| axe a11y | Local + advisory | `a11y:critical` | — | WCAG violations on critical routes |
| Playwright visual | Advisory | `e2e:visual` / `e2e:visual:update` | `free-production-readiness.yml` → Visual regression | Public landing CSS/layout regressions |
| Meticulous AI | External setup | — | `meticulous-advisory.yml` | Recorded user-flow visual + workflow regressions |
| Chromatic | External setup (optional) | — | See [Chromatic](#chromatic-optional) | Storybook/component snapshot diffs |

Config: `playwright.visual.config.ts`, tests in `e2e/visual/`, baselines in `e2e/visual/__snapshots__/`.

### Data (database + RLS)

Catches schema/RLS mistakes and production DB posture issues.

| Tool | Status | npm script | Workflow / CI | Bug class |
|---|---|---|---|---|
| Supabase RLS tests | **Hard gate** | `test:rls` | `ci.yml` → Supabase lint + RLS | Policy regressions |
| Schema invariants | **Hard gate** | — | `ci.yml` | Known migration mistakes |
| DB types drift | **Hard gate** | `check:types-drift` | `ci.yml` | Stale generated types |
| Production DB audit | Advisory (skip without secret) | `prod:audit:db` | `free-production-readiness.yml` → Production DB audit | Missing RLS, unsafe SECURITY DEFINER |
| Local DB audit | Local | `db:audit:local` | — | Same checks against local Supabase |

Secret: `PROD_AUDIT_DATABASE_URL` (read-only Postgres URL). See [`FREE_PRODUCTION_READINESS_STACK.md`](./FREE_PRODUCTION_READINESS_STACK.md#production-db-audit-prod_audit_database_url).

### Production & staging (live signals)

Catches issues only visible against deployed environments.

| Tool | Status | npm script | Workflow / CI | Bug class |
|---|---|---|---|---|
| Sentry + Session Replay | **Installed** (needs DSN in env) | — | Vercel prod/preview | Client errors, replay on failures |
| OWASP ZAP baseline | Advisory | — | `zap-scan-advisory.yml` | XSS, misconfig, passive web vulns |
| StackHawk | External setup (paid) | — | — | DAST with OpenAPI-aware auth flows |
| Schemathesis | Advisory stub | `schemathesis:advisory` | `free-production-readiness.yml` → Schemathesis | API fuzzing when OpenAPI exists |
| k6 staging load | Advisory | `load:staging` | CircleCI / manual | Latency and reliability under load |
| Lighthouse CI | Advisory | `lighthouse` / `perf:lighthouse` | CircleCI preview job | Perf, a11y, CLS on public routes |
| Promptfoo | Advisory | `evals` | CircleCI weekly | LLM prompt drift (round review) |

---

## Workflows reference

| Workflow file | Trigger | Merge blocker? |
|---|---|---|
| `ci.yml` | PR | Yes (typecheck, lint, build, RLS, …) |
| `review-gate.yml` | PR | Yes (`Review Gate / all`) |
| `playwright-smoke.yml` | PR | Yes |
| `free-production-readiness.yml` | PR | Partial — Business contracts + Route Hygiene **block**; other jobs advisory |
| `zap-scan-advisory.yml` | PR | No |
| `meticulous-advisory.yml` | PR | No |
| `playwright.yml` | PR | No (full E2E advisory) |
| `codeql.yml` | PR | Yes |

---

## Schemathesis {#schemathesis}

Property-based API fuzzing. **Currently a stub**: no OpenAPI schema is checked in.

1. Generate or add schema at `docs/openapi/openapi.json` (or `.yaml`).
2. Install CLI: `pip install schemathesis` (or use Docker).
3. Run locally: `npm run schemathesis:advisory` (respects `SCHEMATHESIS_TARGET_URL` or `PLAYWRIGHT_BASE_URL`).
4. CI writes `docs/operations/generated/schemathesis-report.json` and skips with exit 0 when no schema.

---

## External setup (manual)

### Meticulous AI

Full guide: [`integrations/METICULOUS.md`](./integrations/METICULOUS.md)

1. Create account at [meticulous.ai](https://meticulous.ai).
2. Install [GitHub App](https://github.com/apps/meticulous-ai/installations/new) on `helmv3`.
3. Add repo secret `METICULOUS_API_TOKEN` (optional `METICULOUS_PROJECT_ID`).
4. Connect Vercel preview deployments for session recording.

### Chromatic (optional)

For Storybook/component-level visual regression (upgrade path from Playwright public-page baselines):

1. Sign up at [chromatic.com](https://www.chromatic.com).
2. Link the GitHub repo and add `CHROMATIC_PROJECT_TOKEN` to CI secrets.
3. Add a Chromatic step to your Storybook build workflow when Storybook is published for Golf/Baseball shared UI.

Playwright visual (`e2e:visual`) covers marketing landings today; Chromatic is optional for component libraries.

### StackHawk (optional paid DAST)

Alternative/complement to free ZAP baseline:

1. Sign up at [stackhawk.com](https://www.stackhawk.com).
2. Create an app pointing at preview or staging URL.
3. Add `HAWK_API_KEY` and `HAWK_APP_ID` as GitHub secrets.
4. Add a StackHawk GitHub Action workflow (advisory) — not wired in-repo until license is chosen.

Free path today: `zap-scan-advisory.yml` with optional `ZAP_TARGET_URL` secret (defaults to production landing).

### Sentry Session Replay

Already configured in `src/instrumentation-client.ts`:

- `NEXT_PUBLIC_SENTRY_DSN` — required for any capture
- Replay: 100% on error, 10% session sample in production (disabled in dev)
- `maskAllText: true` on replay

Set DSN in Vercel project env and `.env.local` for local verification.

### Greptile TREX / Qodo

- **Greptile TREX**: enable in Greptile project settings → Test Generation; no repo change required.
- **Qodo**: alternative AI review — document-only unless team adds API key and workflow.

---

## Generated artifacts

Reports under `docs/operations/generated/` are gitignored. Issue drafts land in:

- `docs/operations/revealed-bugs/routes/` — route crawler / hygiene
- `docs/operations/revealed-bugs/production-readiness/` — auditor aggregation

Run `npm run auditor:all` after static/DB scans to refresh drafts locally.

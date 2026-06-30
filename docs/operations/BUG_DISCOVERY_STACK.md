# Bug Discovery Stack

Multi-layer bug net for Helm Sports Labs. Each tool hunts a different failure class. Advisory jobs use `continue-on-error: true` until findings are triaged and promoted via `docs/operations/GATE_MATRIX.md`.

**Unified entry points:**

| Script | Layer | What it runs |
|---|---|---|
| `npm run verify:bugs:pr` | PR hunter | Semgrep, dependency-cruiser, route hygiene, gitleaks |
| `npm run verify:bugs:runtime` | Runtime | Route inventory + crawler, critical E2E, visual regression |
| `npm run verify:bugs:data` | Data / prod | RLS tests, read-only production DB audit |
| `npm run verify:bugs:advisory` | Advisory | Schemathesis stub, documents ZAP/StackHawk |

---

## Stack map (priority order)

| # | Layer | Tool | Status | npm script / workflow | Bug class |
|---|---|---|---|---|---|
| 1 | Runtime | **Playwright route crawler** | Installed | `npm run routes:crawl` · `.github/workflows/free-production-readiness.yml` → `route-crawler` | Blank pages, 404/500 routes, console errors, wrong-sport redirects, error boundaries |
| 2 | Data | **Production read-only DB audit** | Installed (secret-gated) | `npm run prod:audit:db` · `free-production-readiness.yml` → `prod-db-audit` | Missing RLS, tables without PK, unsafe `SECURITY DEFINER` functions |
| 3 | Runtime | **Sentry + Session Replay** | Installed | `src/instrumentation-client.ts` · Vercel env | Client exceptions, hydration errors, slow traces, session replay on errors |
| 4 | PR hunter | **Semgrep Helm rules** | Installed | `npm run analyze:semgrep` · `free-production-readiness.yml` → `static-radar` · `review-gate.yml` | Service-role in client, missing auth in actions, sport table violations |
| 5 | PR hunter | **Greptile (+ TREX)** | External setup | GitHub App · `.greptile/instructions.md` | Cross-file drift, forgotten callers, architecture violations |
| 6 | Runtime | **Meticulous AI** | Docs + placeholder workflow | `.github/workflows/meticulous-advisory.yml` · `docs/operations/integrations/METICULOUS.md` | Recorded workflow visual regressions, multi-step UI breaks |
| 7 | Advisory | **Schemathesis** | Stub (no OpenAPI yet) | `npm run schemathesis:advisory` · `free-production-readiness.yml` → `schemathesis-advisory` | API schema violations, 500s on edge-case inputs |
| 8 | Runtime | **Playwright visual regression** | Installed | `npm run e2e:visual` · `free-production-readiness.yml` → `visual-regression` | CSS/layout regressions on public routes |
| 9 | Advisory | **OWASP ZAP baseline** | Installed (advisory) | `.github/workflows/zap-scan-advisory.yml` | XSS, missing security headers, exposed paths on public surface |
| — | PR hunter | **CodeRabbit** | Installed | GitHub App · `.coderabbit.yaml` | Line-level lint, custom ast-grep/semgrep gate |
| — | PR hunter | **dependency-cruiser** | Installed | `npm run analyze:deps` | Illegal cross-product imports, circular deps |
| — | PR hunter | **Route hygiene** | Installed (hard gate) | `npm run routes:check` | Duplicate routes, stale links, dead routes, coverage gaps |
| — | PR hunter | **Gitleaks** | Installed (hard gate) | `npm run secrets:scan` · `review-gate.yml` | Secrets in working tree |
| — | Data | **Supabase RLS tests** | Installed (hard gate) | `npm run test:rls` · `ci.yml` | Policy gaps, cross-tenant leaks |
| — | Runtime | **Playwright smoke / critical** | Installed | `npm run e2e:smoke` · `npm run e2e:critical` | Core paths load without 5xx |
| — | Runtime | **axe a11y** | Installed | `npm run a11y:critical` | WCAG violations on public routes |
| — | Advisory | **StackHawk** | External setup | See [StackHawk](#stackhawk-optional) | DAST with auth, OpenAPI-aware scanning |
| — | Advisory | **Chromatic** | External setup | See [Chromatic](#chromatic-optional-upgrade) | Component-level visual diffs (Storybook) |

---

## Already wired (verified)

### Playwright route crawler

- Spec: `e2e/route-crawler/route-crawler.spec.ts`
- Requires route inventory first: `npm run routes:inventory`
- Report: `docs/operations/generated/route-crawler-report.md`
- CI: advisory job in `free-production-readiness.yml`

### Production DB audit

- Script: `scripts/prod-audit/run-readonly-db-audit.mjs`
- Secret: `PROD_AUDIT_DATABASE_URL` (read-only Postgres URL)
- Skips gracefully when secret missing — see `docs/operations/FREE_PRODUCTION_READINESS_STACK.md`

### Sentry + Session Replay

Configured in `src/instrumentation-client.ts`:

- `replaysOnErrorSampleRate: 1.0` — full replay on errors
- `replaysSessionSampleRate: 0.1` — 10% session sample in production
- `maskAllText: true` on replay integration
- PII scrubbed in `beforeSend` (cookies, auth headers, query strings)

Required env vars (see `.env.example`):

```bash
NEXT_PUBLIC_SENTRY_DSN=...
SENTRY_ORG=...
SENTRY_PROJECT=...
SENTRY_AUTH_TOKEN=...          # source maps upload at build
NEXT_PUBLIC_SENTRY_RELEASE=... # optional; defaults to VERCEL_GIT_COMMIT_SHA
```

### Semgrep

- Rules: `.semgrep/helm-rules.yml`, `.semgrep/helm-route-rules.yml`
- CI: `npm run analyze:semgrep` in `static-radar` job + `review-gate.yml` on changed files
- Output: `docs/operations/generated/semgrep.json` (gitignored)

### dependency-cruiser + route hygiene

- `npm run analyze:deps` → architecture graph
- `npm run routes:check` → hard gate (P0/P1)
- Semgrep companion: `.semgrep/helm-route-rules.yml`

---

## External setup required

### Greptile TREX

Greptile is installed as a GitHub App. **TREX** (Test Execution) runs generated tests against PR changes.

1. Open [Greptile dashboard](https://app.greptile.com) → your `helmv3` repo
2. **Settings → Features → Enable TREX**
3. Point TREX at Playwright config: `playwright.config.ts`
4. Set base branch: `main`
5. TREX complements (does not replace) `npm run routes:crawl` — it executes tests Greptile generates from codebase context

**Qodo alternative:** If Greptile TREX is unavailable, [Qodo](https://www.qodo.ai/) offers PR-level test generation via GitHub App. Install separately; no repo config required beyond the app. Use one or the other — both are PR-hunter layer tools.

### Meticulous AI

Full guide: `docs/operations/integrations/METICULOUS.md`

Manual steps:

1. Create account at [meticulous.ai](https://meticulous.ai)
2. Install GitHub App on `helmv3`
3. Add `METICULOUS_API_TOKEN` repository secret
4. Connect Vercel preview for session recording
5. Uncomment `upload-container` step in `.github/workflows/meticulous-advisory.yml`

### Schemathesis

**Current state:** No OpenAPI schema in repo. API routes exist under `src/app/api/` (46 route handlers) but are not documented as OpenAPI.

**Stub:** `npm run schemathesis:advisory` writes `docs/operations/generated/schemathesis-report.json` with `skipped: true`.

**To enable:**

1. Generate OpenAPI spec (pick one approach):
   - **Manual:** Maintain `docs/openapi/openapi.json` from route handlers
   - **next-swagger-doc / zod-to-openapi:** Derive from Zod schemas in API routes
   - **typed routes:** Export from a central `src/lib/api/openapi.ts` registry
2. Install CLI: `pip install schemathesis` (or `brew install schemathesis`)
3. Run: `SCHEMATHESIS_TARGET_URL=https://preview-url.vercel.app npm run schemathesis:advisory`
4. CI job `schemathesis-advisory` in `free-production-readiness.yml` will fuzz automatically once schema exists

Example minimal spec location:

```
docs/openapi/openapi.json   ← schemathesis runner checks here first
```

### Chromatic (optional upgrade)

In-repo Playwright visual tests (`e2e/visual/`) cover public marketing routes with baselines in `e2e/visual/__snapshots__/`.

**Chromatic** adds component-level visual diffs if you adopt Storybook:

1. Sign up at [chromatic.com](https://www.chromatic.com/)
2. Add `CHROMATIC_PROJECT_TOKEN` secret
3. Install: `npm i -D chromatic @chromatic-com/storybook`
4. Add script: `"chromatic": "chromatic --exit-zero-on-changes"`
5. Wire into CI on Storybook build

Until Storybook exists, use `npm run e2e:visual` for visual regression.

### StackHawk (optional)

**ZAP baseline** (free, in-repo) scans the public surface without auth. See `.github/workflows/zap-scan-advisory.yml`.

**StackHawk** adds authenticated DAST + OpenAPI-aware scanning:

1. Sign up at [stackhawk.com](https://www.stackhawk.com/)
2. Add `HAWK_API_KEY` secret
3. Create `.stackhawk.yml` with `app.applicationId` and `host` (preview URL)
4. Add CI job using `stackhawk/hawkscan-action`

StackHawk requires an OpenAPI spec for best results — generate alongside Schemathesis setup.

### OWASP ZAP

Workflow: `.github/workflows/zap-scan-advisory.yml`

- Default target: `https://helmsportslabs.com` (public landing)
- Override: repository secret `ZAP_TARGET_URL` or `workflow_dispatch` input
- Advisory only — does not block merge

---

## Promotion path

| Tool | Current | Promote when |
|---|---|---|
| Route crawler | Advisory | 1 week green on main; triage P2 findings |
| Visual regression | Advisory | Baselines stable; < 2% flake rate |
| Prod DB audit | Advisory | Secret configured; zero false positives for 2 weeks |
| ZAP | Advisory | Baseline established; only net-new highs block |
| Schemathesis | Skipped | OpenAPI spec maintained; preview env available |
| Meticulous | Not configured | Account + 50+ recorded sessions |
| Greptile TREX | Dashboard toggle | TREX green for 2 weeks on PRs |

Update `docs/operations/GATE_MATRIX.md` when promoting a tool from advisory to hard gate.

---

## Related docs

- `docs/operations/FREE_PRODUCTION_READINESS_STACK.md` — free tooling foundation
- `docs/operations/GATE_MATRIX.md` — hard vs advisory gates
- `docs/operations/CI_RUNBOOK.md` — triage failing jobs
- `docs/current/status.md` — current gate status

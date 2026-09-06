<!-- markdownlint-disable MD003 MD007 MD012 MD013 MD022 MD028 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
---
paths:
  - ".github/workflows/**"
  - ".circleci/**"
  - "vitest.config.ts"
  - "eslint.config.mjs"
  - "scripts/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.test.mjs"
  - "*-baseline.json"
---

## Quality gates — ratchets, lint, CI, tests

Loads when you touch the verification machinery. A gate that cannot fail is
not a gate — every item below exists because a check ran green while
verifying nothing.

### Ratchets
Baseline files record known-bad counts that may only shrink; the count
lives in the file, never in prose. Never raise a baseline to pass a
build — fix the violation and re-run the `--update` command. Adding a new
violation always fails regardless of baseline.

### Gates that do not currently enforce coverage
- `check:types-drift` silently degrades to a warning + `exit 0` if
  `SUPABASE_ACCESS_TOKEN` is unset in CI — a passing job doesn't prove the
  secret exists.
- `check:ledger` has a test proving the guard works, but no workflow
  invokes `scripts/check-migration-ledger.mjs` itself.
- The Golf e2e suite's coach/player auth gates read env vars at module load
  time. `playwright.config.ts` now loads `.env.local` via dotenv before any
  spec is collected, so a local `.env.local` is enough on its own. Locally a
  missing credential still skips visibly; in CI it fails the run instead of a
  silent, always-green skip.
- `orphans:mounts` has no CI caller.
- `test:rls` is pgTAP (`scripts/test-pgtap.sh`), not vitest; the vitest
  `rls` project matches zero files by design.
- A file under `scripts/__tests__/` only runs if `vitest.config.ts` names
  it explicitly (no glob) or an npm script/workflow calls `node --test` on
  it directly — unreferenced either way, it's decorative.

### Tests — three separate systems
| Layer | Runner | Where | CI |
|---|---|---|---|
| Unit/unit-dom/integration/business/contract | vitest projects | `src/**/*.test.{ts,tsx}` + named `scripts/**` files | `test:run`, `test:integration` |
| RLS | pgTAP | `supabase/tests/rls/*.sql` | Supabase lint + RLS tests job |
| E2E | Playwright | `e2e/**` | PR smoke is path-gated; the full suite is manual (`workflow_dispatch`, `full_e2e=true`) |

`npm test` runs unit + unit-dom only, the fast loop. `npm run test:all` runs
every project.

### Lint
`npm run lint` is the gate; `npm run lint:ratchet` enforces the count.
ESLint does not catch `text-[Npx]` arbitrary Tailwind values. The Review
Gate's blocking rules live in `.coderabbit/ast-grep/` and
`.coderabbit/semgrep/` — that directory name is historical; CI consumes
them directly. A zero-finding semgrep run is not evidence of a clean tree —
check the scanned-file count.

### CI shape
Every GitHub Actions workflow that posts on a PR, one line each:
`ci.yml` (typecheck, lint, vitest, build, RLS, doc gates → required
`CI aggregate`); `review-gate.yml` (static analyzers → required
`Review Gate aggregate`); `codeql.yml` (three required `Analyze (...)`
legs plus GitHub's own non-required `CodeQL` status); `sentry-snapshots.yml`
(visual diff, advisory); `feature-awareness.yml` (context pack, advisory,
code paths only); `pr-smoke.yml` (a11y smoke, advisory, frontend paths);
`migration-lockdown.yml` (`block-historical-edits`, reports on every PR);
`claude-code.yml` (gated agent run). CircleCI runs the weekly heavy jobs and
the branch-gated native compiles. `main` has `enforce_admins` on; take the
required-checks list from GitHub and `docs/CONTROL_PLANE_ENFORCEMENT.md`,
never from prose.

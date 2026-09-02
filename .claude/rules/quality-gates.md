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
verified: 2026-08-20  # every claim re-checked against package.json, the workflows, and vitest.config.ts this date
---

## Quality gates — ratchets, lint, CI, tests

Loads when you touch the verification machinery. The universal habits
(never pipe a gate, verify before claiming green) live in `shipping.md`.

**The rule this file exists to enforce: a gate that cannot fail is not a
gate.** Every finding below is an instance of that — a check that runs, prints
nothing alarming, exits 0, and verifies nothing. They are worse than no check,
because they buy false confidence.

---

### 1. The ratchet system

Baseline files record known-bad counts so a fix can land green and the
number can only shrink. The count lives in each baseline file — never in
prose (this table once carried the numbers and every one of them rotted):

| Baseline | Guards |
|---|---|
| `.supabase-error-baseline.json` | unchecked Supabase reads |
| `.doc-schema-baseline.json` | doc-named DB objects that don't exist |
| `.fail-open-baseline.json` | fail-open error paths |
| `.doc-path-baseline.json` | doc-named file paths that don't resolve |
| `.registry-globs-baseline.json` | registry entries that resolve to nothing (held at ZERO) |
| `.duplicate-exports-baseline.json` | same function name exported from two files under src/app |
| `.markdownlint-baseline.json` | markdown lint |
| `.lint-baseline.json` | ESLint |
| `.sqlfluff-baseline.json` | SQL lint |
| `.paginated-read-baseline.json` | unpaginated PostgREST reads |
| `.cycles-baseline.json` | import cycles |
| `.migration-drift-baseline.json` | local↔production migration-ledger drift (`db:ledger-drift`) — **no CI caller, by necessity**: it reads the production ledger and needs `DATABASE_URL` or `SUPABASE_PROJECT_ID` + `SUPABASE_DB_PASSWORD`, and Actions holds no database password (ci.yml's `supabase` job records the same limit for `db:drift:check`). Run it locally against production credentials; a CI job that cannot connect would only ever exit 2 |

**Rules:**

- **Never raise a baseline to make a build pass.** The number is a debt ledger,
  not a config knob. Raising it converts a caught regression into permanent
  debt, silently.
- Fix the violation, then re-run the `--update` command so the count drops.
  Leaving it stale also fails — the ratchet checks both directions, which is
  what stops a fixed count from drifting back up.
- Adding a *new* violation always fails, regardless of baseline.
- When a check bounds coverage (top-N, sampling, skip-on-missing-tool),
  **`log()` what was dropped.** Silent truncation reads as "covered everything".

### 2. ⚠️ Gates that currently do not enforce

Verified 2026-08-20. Do not treat these as coverage:

- **`check:types-drift` degrades to advisory if its secret is unset.** The
  workflow is wired correctly — the `Database types drift` step (of the
  `Static checks` job since 2026-09-02) sets
  `SUPABASE_ACCESS_TOKEN` in a job-level `env:` block. But without a token value
  the script takes its tokenless branch: `::warning::` then **`exit 0`**. So if
  that repo secret is ever unset or rotated away, the job stays **green while
  checking nothing**, and the only signal is a warning annotation nobody reads.
  If you need certainty that types are guarded, confirm the secret exists in
  repo settings — a passing job does not prove it.
- **`check:ledger` is tested but never run.** Its test is promoted into vitest
  (so CI proves the guard *works*), but no workflow ever *invokes*
  `scripts/check-migration-ledger.mjs`. We verify the smoke detector and never
  install it. (`check:env` used to sit in this bullet too; it no longer
  belongs here — `package.json`'s `prebuild` runs
  `scripts/check-required-env.mjs` on every `npm run build`, so it fires in
  CI's `next-build` job and on every local build.)
- **`orphans:mounts`** exists as a script with no CI caller. (`db:drift:check`
  was in this bullet until 2026-09-01; it now runs in ci.yml's `supabase` job
  against the migrations-rebuilt local stack, and in `db-drift.yml` against
  production — see the comment in ci.yml for what each run does and does not
  prove.)
- **`test:rls` is pgTAP, not vitest.** `npm run test:rls` runs
  `bash scripts/test-pgtap.sh` against `supabase/tests/rls/*.sql`, which needs
  a local Supabase stack. The vitest `rls` project still exists and still
  matches **0** `src/**/*.rls.test.*` files — kept so the naming convention
  stays available, not as evidence of anything (`vitest.config.ts` says the
  same at the project definition). CI runs the pgTAP suites in the
  "Supabase lint + RLS tests" job.
- **A file under `scripts/__tests__/` runs only if `vitest.config.ts` names
  it.** Nothing references `node --test` — not one npm script, not one
  workflow — and the `unit` project lists these files explicitly, **with no
  glob**, so a new file there executes never unless you add it by name. Some
  legacy hold-outs still fail against `main` (`single-<h1>` violations,
  unconsolidated badges, and similar) — real drift that accumulated while they
  sat unrun. How many of each is a count, and counts rot: this bullet carried
  "19 of 51" and "32 promoted" while both had moved. Measure it when you need
  it, with the two commands `vitest.config.ts` documents beside the list.

**When you add a guard, add its caller in the same change.** A script in
`package.json` with no workflow step is not a gate.

### 3. Tests — three separate systems

| Layer | Runner | Where | CI |
|---|---|---|---|
| Unit / unit-dom / integration / business / contract | vitest projects | `src/**/*.test.{ts,tsx}` + the `scripts/**` files named in `vitest.config.ts` | `test:run`, `test:integration` |
| RLS | **pgTAP**, not vitest | `supabase/tests/rls/*.sql` | "Supabase lint + RLS tests" |
| E2E | Playwright | `e2e/**` | `smoke` on PRs; the full chromium suite is **manual only** (`workflow_dispatch` with `full_e2e=true`) |

- `npm test` runs **unit + unit-dom only** — the fast inner loop, not coverage.
  `npm run test:all` runs every project.
- CI does **not** run `npm run test:e2e`. `playwright.yml` runs `smoke` on PRs;
  the full suite has not run automatically since 2026-08-20 (owner decision —
  its post-merge run seeded PRODUCTION fixtures). It runs only when someone
  dispatches the workflow with `full_e2e=true`. Nothing runs "on push to
  `main`"; this table said so until 2026-09-01.
- Promoting a `scripts/__tests__` file: change its import from `node:test` to
  `vitest`, then add the path **by name** to `vitest.config.ts`. Run it first —
  if it fails against `main`, it encodes real drift and wiring it turns `main`
  red. That is a decision, not a formality.

### 4. Lint

- `npm run lint` is the gate; `npm run lint:ratchet` enforces the count against
  `.lint-baseline.json`. Both run in CI.
- **Blind spots that have shipped bugs:** ESLint does not catch
  `text-[Npx]` arbitrary Tailwind values, and `*.png` in `.gitignore` is a
  blanket rule that has hidden whole directories from `git status`.
- **`markdownlint-cli2` is a devDependency** (`package.json`), so
  `npm run markdown:ratchet` runs locally after `npm ci` and in CI via
  `review-gate.yml`. (This bullet said it was "not installed locally" and that
  the ratchet failed with `ENOENT`; that stopped being true when the package
  was added and the bullet was not updated. If you see `ENOENT` now, the
  checkout has not installed dependencies — a fresh worktree starts empty.)
- The Review Gate's blocking rules live in `.coderabbit/ast-grep/` and
  `.coderabbit/semgrep/` — **that directory name is historical**; the bots were
  dropped 2026-07-20 and CI consumes those packs directly. Do not delete them
  as vendor config.
- **semgrep false-zeros:** a bad path glob, a NUL byte, or a broken config makes
  semgrep exit 0 having scanned nothing. A zero-finding semgrep run is not
  evidence of a clean tree — check the file count it reported.

### 5. CI shape

- **GitHub Actions** — per-PR fast path: `ci.yml` (typecheck, lint, vitest,
  build, RLS, knowledge + doc gates) and `review-gate.yml` (static analyzers).
- **CircleCI** — weekly heavy jobs (Knip, Stryker, sqlfluff, npm audit, Squawk)
  Mondays 06:00 UTC, plus iOS Capacitor compile.
- **5 required checks on `main`**, verified live 2026-09-02 and all resolving to
  real job names: `CI aggregate`, `Review Gate aggregate`,
  `Analyze (actions)`, `Analyze (javascript-typescript)`, `Analyze (python)`.
  (`Smoke checks` was the sixth until 2026-09-02 — a duplicate `next build`,
  removed job-and-context together.)
  The last three render from the CodeQL matrix — **a matrix job's status name is
  the rendered `name:`, so changing the matrix silently renames the required
  check.** That produced two phantom required checks and made every PR
  unsatisfiable until 2026-08-19.
- **`docs:check` is five gates in one script** (`package.json`):
  `docs:inventory-check` (regenerated AUTOGEN blocks match their sources —
  non-mutating, unlike the old `docs:regen && git diff` shape), `docs:schema-drift`,
  `docs:path-drift`, `enforcement:check` and `tool-authority:check`. All five
  run in CI: the inventory check directly, and the enforcement and
  tool-authority checks through `control-plane:verify:static`, in ci.yml's
  `control-plane` job; the two drift ratchets in its `feature-knowledge` job. (This
  bullet named a `docs:diff-check` half that does not exist and called the
  script local-only; both were stale by 2026-09-01.)
- Renaming any job means updating the required-checks list on GitHub. There is
  no error for a required check that nothing posts; the PR just never goes
  green.

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
  workflow is wired correctly — the `Database types drift` job sets
  `SUPABASE_ACCESS_TOKEN` in a job-level `env:` block. But without a token value
  the script takes its tokenless branch: `::warning::` then **`exit 0`**. So if
  that repo secret is ever unset or rotated away, the job stays **green while
  checking nothing**, and the only signal is a warning annotation nobody reads.
  If you need certainty that types are guarded, confirm the secret exists in
  repo settings — a passing job does not prove it.
- **`check:ledger` and `check:env` are tested but never run.** Both have tests
  promoted into vitest (so CI proves the guard *works*), but no workflow ever
  *invokes* the guard. We verify the smoke detector and never install it.
- **`db:drift:check` and `orphans:mounts`** exist as scripts with no CI caller.
- **`npm run test:rls` runs the real pgTAP suites** — it is
  `bash scripts/test-pgtap.sh`, which assembles every contract under
  `supabase/tests/rls/` against a local Postgres, using the same pattern CI's
  "Supabase lint + RLS tests" job uses. It needs the local stack up
  (`127.0.0.1:54322`); a connection refusal means Docker is down, not that RLS
  is untested.

  Corrected 2026-08-27. This bullet previously said `test:rls` "points at an
  empty vitest project" and put RLS coverage at "59 pgTAP suites". Both were
  stale: the script was repointed at pgTAP, and the suite count had moved. It
  is worth noticing WHERE that lie lived — a rules file about the verification
  machinery, so it misled exactly the person trying to check whether RLS was
  covered, and told them not to trust a command that works.

  The vitest `rls` project does still select zero files; that part was true. It
  no longer implies anything about `test:rls`.

  Counts are deliberately not restated here, per `shipping.md`'s rot rule.
  Derive them:

  ```bash
  ls supabase/tests/rls/*.sql | wc -l          # suites (incl. _helpers.sql)
  grep -ohE 'plan\([0-9]+\)' supabase/tests/rls/*.sql | grep -oE '[0-9]+' | paste -sd+ - | bc
  ```
- **19 of 51 files under `scripts/__tests__/` run nowhere.** Nothing references
  `node --test` — not one npm script, not one workflow — so an unpromoted file
  never executes and its guard is decorative. 32 are promoted explicitly in
  `vitest.config.ts`; **there is no glob**, so a new file there runs only if you
  add it by name. The 19 hold-outs fail against current `main` (8
  `single-<h1>` violations, unconsolidated badges, and similar) — real drift
  that accumulated while they sat unrun.

**When you add a guard, add its caller in the same change.** A script in
`package.json` with no workflow step is not a gate.

### 3. Tests — three separate systems

| Layer | Runner | Where | CI |
|---|---|---|---|
| Unit / unit-dom / integration / business / contract | vitest projects | `src/**/*.test.{ts,tsx}` + 32 named `scripts/**` files | `test:run`, `test:integration` |
| RLS | **pgTAP**, not vitest | `supabase/tests/rls/*.sql` | `test:rls` locally; "Supabase lint + RLS tests" in CI |
| E2E | Playwright | `e2e/**` | `smoke` on PRs; full suite on push to `main` only |

- `npm test` runs **unit + unit-dom only** — the fast inner loop, not coverage.
  `npm run test:all` runs every project.
- CI does **not** run `npm run test:e2e`. `playwright.yml` runs `smoke` on PRs.
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
- **`markdownlint-cli2` is not installed locally** — `npm run markdown:ratchet`
  fails with `ENOENT` on a dev machine. It runs in CI via `review-gate.yml`.
  A local failure there is an environment gap, not a finding.
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
- **6 required checks on `main`**, verified live 2026-08-20 and all resolving to
  real job names: `Smoke checks`, `CI aggregate`, `Review Gate aggregate`,
  `Analyze (actions)`, `Analyze (javascript-typescript)`, `Analyze (python)`.
  The last three render from the CodeQL matrix — **a matrix job's status name is
  the rendered `name:`, so changing the matrix silently renames the required
  check.** That produced two phantom required checks and made every PR
  unsatisfiable until 2026-08-19.
- **`docs:check` is local-only** and its `docs:diff-check` half only compares the
  generator to itself. The two that catch real problems —
  `docs:schema-drift` and `docs:path-drift` — run in CI on every PR.
- Renaming any job means updating the required-checks list on GitHub. There is
  no error for a required check that nothing posts; the PR just never goes
  green.

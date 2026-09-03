<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Feature Awareness System change ledger

## 2026-09-02 — World Model graph generator added; a registry.mjs parsing bug fixed

- SHA: recorded on merge of `agent/bridge-worldmodel`.
- Added `scripts/knowledge/world-model.mjs` (+ `scripts/knowledge/lib/
  world-model-core.mjs`, `scripts/knowledge/lib/dump-feature-keys.mjs`) and
  two new npm scripts, `knowledge:world-model` / `knowledge:world-model:check`
  — both in this feature's own `services:` glob
  (`scripts/knowledge/**`, `package.json`). See `docs/ai-system/
  helmv3-ai-codebase-intelligence.md`'s new "World Model" section for the
  full design.
- **Fixed a real, pre-existing bug in `scripts/knowledge/lib/registry.mjs`'s
  `coerceScalar`**, found by `world-model.mjs`'s first real read of
  `observability.feature_keys` through this parser: a non-empty inline array
  (`feature_keys: [round_tracking, course_library]`, the form 16 registry.yml
  entries already used) fell through to the plain-scalar branch and became
  the literal STRING `"[round_tracking, course_library]"`. Nothing had
  broken visibly before this — no existing `.mjs` consumer
  (`map-changed-files.mjs`, `check-doc-coverage.mjs`, `stale-doc-check.mjs`)
  reads `observability` at all; `check-feature-registry.ts` was unaffected
  because it parses with real `js-yaml`, not this hand-rolled line parser.
  `for (const key of keys)` over the un-fixed string iterated it character by
  character, producing dozens of one-character garbage nodes in the first
  World Model generation run. Fixed to parse `[a, b, c]` into a real array;
  regression-pinned in `scripts/knowledge/lib/__tests__/registry.test.mjs`.
- Two more issues found and fixed by running the generator against real
  repository data rather than a synthetic fixture, all captured in
  `scripts/knowledge/world-model.mjs`'s own doc comments and inline code
  comments: `git grep -E` silently returning zero matches for a pattern using
  `\s` (POSIX ERE has no `\s`; switched to `-P`), and SQL line/block comments
  being scanned as schema (a comment containing the English sentence "this
  migration's CREATE TABLE runs against a fresh DB" produced a garbage table
  node named `runs`; comments are now stripped before scanning).
- Verified: `npm run knowledge:check` (all seven stages), `npm run
  knowledge:world-model:check` (deterministic round-trip), `npx vitest run
  scripts/knowledge/__tests__/world-model-core.test.mjs
  scripts/knowledge/lib/__tests__/registry.test.mjs` (39 tests), the full
  `unit`/`unit-dom` vitest suite (13,167 tests, no regressions), typecheck,
  lint.
<!-- markdownlint-disable MD013 MD022 MD032 MD034 MD037 MD038 MD040 MD050 MD060 -->
# Change ledger — feature_awareness_system

## 2026-09-03 — Active Contract Compiler (`npm run contract:resolve`)

- Branch: `agent/bridge-track-e`.
- Change: `scripts/contracts/resolve.mjs` + `scripts/contracts/lib/{registry,
  sources,claims,supersede,render}.mjs`. `npm run contract:resolve -- --feature
  <id>` resolves one feature's CURRENT contract by gathering claims in
  authority order — generated artifacts (`src/lib/admin/feature-registry.ts`,
  `src/lib/types/database.ts`) > code (`memory/registry.yml`'s
  routes/components/actions/services, each existence-checked against
  `git ls-files`) > migrations/schema > tests > the feature doc
  (`memory/features/<id>.md`) > ADRs (`memory/decisions/ADR-*.md`) >
  ledgers/history (`memory/ledgers/changes/<id>.md`,
  `memory/ledgers/tests/<id>.md`) — and prints the current contract plus every
  SUPERSEDED claim with its evidence, where it still appears, and file:line
  provenance. Per §7 K.4.3 (item 17) of the Bridge control-plane
  implementation plan dated 2026-09-03, written by the concurrent Sentry
  session onto its own `agent/sentry-max-controlplane` branch. As of this entry, `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` does not exist on this branch — it lands here once that branch merges.
- `--feature` accepts a `memory/registry.yml` feature id directly, or a
  `src/lib/admin/feature-registry.ts` runtime FeatureKey (e.g.
  `round_tracking`) — resolved via `observability.feature_keys` to its owning
  feature, with the resolution disclosed at the top of every render (never a
  silent alias). An id in neither namespace is the ONE hard failure: exit 2,
  never a contradiction finding.
- `scripts/contracts/**` was previously unmapped in `memory/registry.yml` —
  this change adds it under `feature_awareness_system.code.services`
  (alongside the existing `scripts/knowledge/**`) in the same commit, per
  the OS contract's "a governed file that maps to no feature is a system
  gap" rule (`memory/system/golfhelm-engineering-os.md`).
- Supersession detection, three confidence tiers (kept visually distinct in
  every renderer): **mechanical** (a path/glob matches zero tracked files, or
  an identifier is absent from `src/lib/types/database.ts`), **structured**
  (an ADR's own `**Supersedes:**` header names another ADR), **heuristic** (a
  ledger entry matches a curated correction-marker phrase, linked to the
  earlier entry it most resembles by shared vocabulary — a prompt to verify,
  never asserted as fact).
- Explicitly does NOT reimplement `scripts/check-doc-schema-drift.mjs`: it
  reuses that script's own ground-truth file (`src/lib/types/database.ts`)
  and its baseline (`.doc-schema-baseline.json`, read-only) for a much
  narrower per-feature existence check, and inherits its registry-feature-id
  exclusion. Three false-positive classes were found and fixed against real
  data before landing: RLS `POLICY` names and schema-qualified identifiers
  outside `public`/`graphql_public` (e.g. `helm_private.*`) are never in
  `database.ts` by design, not by drift, so neither is schema-checked;
  `RETURNS trigger` functions are never PostgREST-exposed either, so neither
  are they; and a migration's own `-- CREATE TABLE ...` narration comment is
  excluded from extraction entirely (three real false hits in
  `supabase/migrations/*.sql` header comments, confirmed and fixed before
  this ledger entry).
- Run for real against `round_tracking` (resolves to `golf_round_lifecycle`),
  `coachhelm_ai`, and `admin_platform`; outputs committed under
  `docs/generated/contracts/` alongside this change. Two genuinely NEW,
  previously-uncaught findings surfaced (not from the known
  `.doc-schema-baseline.json`/`.doc-path-baseline.json` backlog): the
  `golf_round_lifecycle` registry entry's `code.tests` glob
  `e2e/**/round*.spec.ts` matches zero tracked files (the real spec is
  `e2e/golf-round.spec.ts`, no subdirectory), and `coachhelm_ai`'s
  `code.db` glob `supabase/migrations/*golf_coachhelm*.sql` matches zero
  tracked files (real migrations use `*coachhelm*`, not `*golf_coachhelm*`).
  <!-- schema-drift-absent: golf_coachhelm -->
  `golf_coachhelm` above is a glob-pattern fragment being cited as absent,
  not a claimed table name.
  Left unfixed here deliberately — this task's own scope (Bridge
  control-plane plan §10 group E: `scripts/contracts/**` is new, read-only
  over `memory/**`, writes nothing existing routing depends on) does not
  cover it; a registry-glob fix belongs in golf_round_lifecycle's/
  coachhelm_ai's own ledgers, not this one.
- Why: `memory/features/*.md` exist as hand-written prose that can silently
  drift from generated/code truth with no compiled, provenance-carrying
  output proving which claims are still true. This compiles one, read-only,
  reusing existing drift-checker ground truth rather than duplicating it.
- Not done, deliberately (per the plan's own K.4.4 "smallest coherent
  implementation" scoping for this item): no test/lint-rule/runtime-code
  compilation from resolved claims — the JSON output is the artifact a later
  invariant/journey validator (Phase D) would consume, not itself a gate. No
  Context Retrieval Bench (K.4.2, item 16) or Janitor generator (K.4.5, item
  18) — separate plan items, separate worktrees per the plan's own
  parallel-worktree table.
- Verified: `node --test scripts/contracts/__tests__/resolve.test.mjs` (17/17
  pass) against a synthetic fixture proving all three supersession tiers plus
  provenance and the FeatureKey-alias/unknown-id resolution paths — not the
  real repo's own content, so it cannot regress as this repo's docs change.
  `node scripts/knowledge/check.mjs`, `node scripts/check-registry-globs.mjs`,
  `node scripts/check-doc-path-drift.mjs`, `node
  scripts/check-doc-schema-drift.mjs` all clean against this change (see this
  PR's body for full gate output). `npm run typecheck`/`npm run lint` NOT run
  — no `.ts`/`.tsx` app code changed, and this worktree does not install its
  own `node_modules` (symlinked to the canonical checkout's, read-only) per
  this task's instructions; CI runs both.

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

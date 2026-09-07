---
description: Run the full local CI gate set with exit codes preserved
---

Run the local gate set below, in this order. Report the real result of each —
never summarize a gate you did not actually run.

**This does not cover every check GitHub Actions runs on a PR.** It covers
`tsc`, lint, vitest, and (via `docs:check`) the doc/knowledge-drift static
checks. It does **not** run: `npm run build`, Supabase lint + RLS/pgTAP
tests, or the Playwright e2e suite — those need a build and/or a running
Supabase instance this command does not set up. Run those separately when
the change touches a `'use server'` surface, a migration/RLS policy, or
Golf/Baseball e2e-covered flows.

**Every command below is prefixed with `set -o pipefail` deliberately.** Without
it a piped gate reports the *pipe's* exit status, so a failing suite reads as a
pass. Nothing enforces this — no hook inspects Bash commands
(`docs/CONTROL_PLANE_ENFORCEMENT.md`: the only PreToolUse hook matches
Write/Edit/MultiEdit), and `.claude/rules/shipping.md` §3 says the same — it
is on you to keep the prefix.

```bash
set -o pipefail; npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v '^\.next/dev/types' | tail -20
set -o pipefail; npm run lint
set -o pipefail; npx vitest run 2>&1 | tail -15
set -o pipefail; npm run docs:check
```

Notes:
- `tsc` output under `.next/dev/types/` is stale generated noise, not your
  change — filter it, but never filter real errors.
- `npm run lint` is `--max-warnings 0`; there is no "just warnings" pass state.
- `docs:check` includes `knowledge:check` and `knowledge:world-model:check` —
  the doc-inventory and world-model drift checks CI enforces as separate
  required steps. Run `npm run knowledge:doc-inventory` and `npm run
  knowledge:world-model` first if you touched docs/registry-mapped files, so
  this doesn't fail on your own edit.
- If a gate fails, fix it before reporting; if you cannot, say exactly which
  gate failed and paste its output.

Then report a one-line verdict per gate: `tsc ✓ / lint ✓ / vitest ✓ (N passed) / docs:check ✓`.

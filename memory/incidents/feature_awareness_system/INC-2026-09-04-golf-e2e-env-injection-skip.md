# INC-2026-09-04 — Golf e2e suite skipped on credentials Playwright itself injected

- Feature: `feature_awareness_system`

## What happened

`e2e/golf-critical-paths.spec.ts` — the only spec covering
`/golf/dashboard/messages`, `/roster`, `/calendar`, `/intelligence` — gates
every test on a module-level `process.env.GOLFHELM_COACH_EMAIL &&
...PASSWORD` read. Those variables are in `.env.local`, and Playwright
prints "injected env (80) from .env.local" on startup, yet the constant
still evaluated false: the injection never reached the spec module's
top-level read.

## Reproduction

```
npx playwright test ... -g "messages loads a conversation"   -> 1 skipped, exit 0
set -a; . ./.env.local; set +a; <same command>                -> 1 passed,  exit 0
```

Both commands exit 0 — the first verified nothing.

## Fix / where it lives now

`.claude/rules/quality-gates.md` documents that the credentials must be
exported into the shell environment before the run, not left to
`.env.local` injection alone, and that the passed/skipped counts (not the
exit code) are what tell the two cases apart.

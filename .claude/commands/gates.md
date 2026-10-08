---
description: Run the checks relevant to the changed behavior and report real exit codes
---

Inspect changed files and choose the applicable checks from package.json,
the mapped feature doc, and AGENTS.md. Run focused tests during iteration.
Run typecheck and changed-file lint for application changes; a server-action
change needs a build, and a migration needs database/RLS verification.
For config-only work, validate syntax and the affected tooling tests.

Inner loop: `npm run check:changed`. It diffs against `origin/main` plus
uncommitted work and runs ESLint on the changed files, `tsgo` (`typecheck:fast`)
when TypeScript or a manifest changed, and vitest on the changed tests and the
tests related to changed sources, one process at a time. Type-aware lint, the
ratchets, the build and the full suite stay CI-only. For one file in a hurry,
`npm run test:file -- <paths>`. Before a PR, `npm run gates:review` previews the
Review Gate. A full pass takes several minutes, longer than a foreground Bash
call allows: run it in the background to a log file and read the file.

Run the full local set only when explicitly requested or the scope warrants
it: `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check`.
Capture output to files and preserve exit codes; never hide errors with
`grep`. Report unavailable checks and failures. Do not repeat a passing
check unless subsequent changes or a new concern invalidate its result.

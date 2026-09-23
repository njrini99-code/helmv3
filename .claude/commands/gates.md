---
description: Run the checks relevant to the changed behavior and report real exit codes
---

While iterating, run focused tests and the affected typecheck/lint for the
files you changed. Before any push or PR, run `npm run preflight` — it
mirrors the required CI checks from the workflow files (add `--full` for
migrations, a `use server` change, or broad changes). Its exit code is the
answer; fix everything it reports in one batch, then push once.

Capture output to files and preserve exit codes; never hide errors with
`grep`. Report UNKNOWN/skipped checks and failures as preflight prints them.
Do not repeat a passing check unless subsequent changes invalidate it —
preflight's stamp stays valid until the tree changes.

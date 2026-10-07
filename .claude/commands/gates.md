---
description: Run the checks relevant to the changed behavior and report real exit codes
---

While iterating, run focused tests and the affected typecheck/lint for the
files you changed. Before any push or PR, run `npm run preflight` — it
mirrors the required CI checks from the workflow files (add `--full` for
migrations, a `use server` change, or broad changes). Its exit code is the
answer; fix everything it reports in one batch, then push once.

<<<<<<< HEAD
=======
Inner loop: `npm run test:file -- <paths>` and `npm run typecheck:fast`. A
full pass takes several minutes, longer than a foreground Bash call allows:
run it in the background to a log file and read the file.

Run the full local set only when explicitly requested or the scope warrants
it: `npm run typecheck`, `npm run lint`, `npm test`, `npm run docs:check`.
>>>>>>> ca15f4ce6c4559e02af41f49db27b15b668f2de5
Capture output to files and preserve exit codes; never hide errors with
`grep`. Report UNKNOWN/skipped checks and failures as preflight prints them.
Do not repeat a passing check unless subsequent changes invalidate it —
preflight's stamp stays valid until the tree changes.

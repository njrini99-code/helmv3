---
description: Run the checks relevant to the changed behavior and report real exit codes
---

Inner loop: `npm run test:file -- <paths>` and `npm run typecheck:fast` for
the files you changed.

Before any push or PR: `npm run preflight` — it mirrors the required CI checks
from the workflow files (add `--full` for migrations, a `use server` change,
or broad changes). Its exit code is the answer; fix everything it reports in
one batch, then push once. A run takes minutes, longer than a foreground Bash
call allows: run it in the background to a log file and read the file.

Preserve exit codes; never hide errors with `grep`. Report UNKNOWN and skipped
checks as preflight prints them. Do not repeat a passing check unless later
changes invalidate it — preflight's stamp stays valid until the tree changes.

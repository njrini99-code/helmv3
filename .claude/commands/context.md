---
description: Build a feature-context pack for the given files/task and load the first mapped doc
---

`/context <paths...>` — map the given files to their governed features, then
build a context pack for the task at hand:

```bash
npm run knowledge:map -- --files <paths...>
npm run knowledge:context -- --files <paths...> --task "<task>"
```

The context step writes a per-run file and prints its path (`Wrote <path>`);
read that file, not a fixed `/tmp` name. Pass `--output <file>` to choose one.

The map step prints `contextDocs.docs`: at most three docs, primary first, with
docs whose STATUS banner says STALE, HISTORICAL, SUPERSEDED or RETIRED already
left out (they are listed under `contextDocs.skipped`). Read the first one (not
all live under `memory/features/`) and open the others only when the task needs
them. Ignore paths that appear inside pasted logs or quoted blocks. If a path maps to nothing
in `memory/registry.yml`, say so: that is a registry gap to map in the same
change, not a reason to skip context.

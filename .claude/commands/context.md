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

Read the first doc the map step names (not all live under `memory/features/`),
and open further ones only when the task needs them. If a path maps to nothing
in `memory/registry.yml`, say so: that is a registry gap to map in the same
change, not a reason to skip context.

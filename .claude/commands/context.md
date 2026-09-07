---
description: Build a feature-context pack for the given files/task and load the mapped docs
---

`/context <paths...>` — map the given files to their governed features, then
build a context pack for the task at hand:

```bash
npm run knowledge:map -- --files <paths...>
npm run knowledge:context -- --files <paths...> --task "<task>"
```

Then Read every `memory/features/*.md` doc the map step names before making
or reviewing any change to those paths. If a path maps to nothing in
`memory/registry.yml`, say so explicitly instead of proceeding silently —
that is a registry gap, not a green light to skip context.

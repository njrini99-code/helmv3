---
description: Land a PR through the sole landing script and report the result
---

`/land <pr>` — merge and clean up PR `<pr>` through the one door:

```bash
npm run pr:land -- <pr>
```

Before running: confirm the PR's head branch matches `agent/*`
(`gh pr view <pr> --json headRefName`). If it does not, refuse and say so —
proceed only if the user explicitly says to land a non-`agent/*` branch.

Never call `gh pr merge` directly and never pass `--admin`. `pr:land` is the
only sanctioned merge path (see `scripts/pr-land.mjs` once it lands on
`main` — as of this writing it is only on the worktree-hygiene branch, so
treat `npm run pr:land -- <n>` as the interface and confirm it exists before
relying on it).

Report the script's own four-line summary verbatim — do not paraphrase or
invent a summary if the script fails before producing one. On failure, state
the exit code and the last few lines of output.

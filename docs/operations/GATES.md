# Gates on a shared machine

The heavy gates (`typecheck`, every `test*` script, `build`) are scheduled, not
just run. This page says how and why, so nobody removes the wrapper thinking it
is slowing them down.

## What runs where

- **typecheck**: `node scripts/serialize.mjs -- tsc --noEmit`. One run loads
  every file under `src/` plus every declaration under `node_modules`;
  several GB of memory on a cold cache. One process.
- **test, test:run, test:all, test:\***: `node scripts/serialize.mjs -- vitest …`.
  One worker per fork; capped at 3 forks in `vitest.config.ts`.
- **build**: `node scripts/serialize.mjs -- next build --webpack`. Webpack
  workers plus its persistent cache; capped at 3 workers by
  `experimental.cpus` in `next.config.mjs`.

`scripts/serialize.mjs` keeps a lock directory at `~/.helm-gates/`. At most two
wrapped commands run at once across every worktree on the machine; the rest
print one line and wait for a slot. A lock whose process has died is cleared on
the next scan. The wrapped command's exit code is passed through unchanged.

`HELM_GATE_SLOTS=<n>` widens the queue on a bigger machine. `HELM_GATE_NOWAIT=1`
bypasses it for a one-off. Neither is set in CI, where one job is one run and
the wrapper is a no-op.

## Why

Measured on the owner's laptop on 2026-09-05 with five agent worktrees running
their gates at the same time: swap at 3.8 GB of 4 GB, load average 26,
seventeen typecheck, test and build processes. Each gate on its own was already
as light as it gets (`skipLibCheck`, `incremental`, `isolatedModules` are all
on); the cost was that they all ran together. Scheduling them is the fix.
Individual runs sometimes wait half a minute; the machine stops swapping and
total throughput goes up.

## A new worktree starts warm

`tsconfig.tsbuildinfo` is listed in `.worktreeinclude`, so the workspace door
copies it into every new worktree and the first typecheck there is incremental
rather than a cold full run. The file is gitignored; it is machine state, and
that is exactly why the door has to carry it.

## The build cache trims itself

`next.config.mjs` sets webpack's persistent cache to keep entries for seven days
(the default is sixty) with one in-memory generation. Nothing deletes the cache;
it stops hoarding, and the 8 GB it had grown to on 2026-09-05 shrinks on its
own over a week. `experimental.webpackMemoryOptimizations` lowers the build's
peak on top of that.

## Trial before switching: the Go TypeScript port

`@typescript/native-preview` (`tsgo --noEmit`) is roughly ten times faster than
`tsc` and uses a fraction of the memory. It is not the typecheck script yet. To
trial it, run both side by side on a few branches:

```bash
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "tsc $?"
npx -p @typescript/native-preview tsgo --noEmit > /tmp/tsgo.txt 2>&1; \
  echo "tsgo $?"
diff <(sort /tmp/tsc.txt) <(sort /tmp/tsgo.txt)
```

Switch the `typecheck` script only once the two agree on every branch
tried, and keep the wrapper: a faster gate still competes with the other
two.

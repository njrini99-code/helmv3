# Helm workspaces

Operating authority lives in `AGENTS.md`. This page describes the workspace
implementation and diagnostics; it adds no permission requirements.

## Creation

`scripts/lib/create-workspace.mjs` implements both `scripts/new-worktree.sh`
and `.claude/hooks/worktree-create.mjs`. The WorktreeCreate hook is wired in
`.claude/settings.json`; SessionStart also runs `stamp-workspace.mjs`.

```bash
scripts/new-worktree.sh <task>
```

The creator validates the name and rejects an existing path or branch. It
then checks capacity, fetches the base, creates an `agent/<task>` branch with
`--no-track`, and writes `.helm/workspace.json`. The default location is
`~/worktrees/helmv3/<task>`; `HELM_WORKTREE_HOME` overrides it.

Existing checkout count is advisory by default. The threshold is
`DEFAULT_MUTATION_BUDGET` (currently 6), shared with the lifecycle classifier.
A folder count cannot establish how many agents are currently working.
Setting `HELM_MAX_MUTATION_WORKTREES` explicitly makes that value a hard cap.
The disk reserve remains enforced: 12 GiB by default, configurable through
`HELM_DISK_RESERVE_GIB` (or legacy `HELM_MIN_FREE_GIB`).

A failed fetch produces a warning and uses the available base. `--no-track`
prevents a new task branch from inheriting `origin/main` as its upstream.
The marker records the task, base, branch, environment, and cleanup policy.
The default `parkPolicy` is `PARK_IF_REPRODUCIBLE`; `--keep` selects `KEEP`.

## Dependencies and local environment

By default, `node_modules` links to the canonical checkout and `.node-version`
is copied. Use `--install` or `node scripts/ensure-worktree-deps.mjs <dir>`
when the task's lockfile differs or dependencies are unavailable. Tests must
use dependencies matching their checkout.

The creator writes a fresh local `.env.local`, never copies production
credentials, and never modifies canonical `.env.local`. It uses
`http://127.0.0.1:54321` and the anon key from a running local Supabase stack.
If that stack is absent, the key is empty with an explanatory comment.
Starting an application or integration test then requires a working local
stack and its actual key. `SUPABASE_SERVICE_ROLE_KEY` is absent. Authorized
remote work can use a separately authenticated connector or explicit target;
the marker is descriptive, not a tool authorization system.

## Cleanup and diagnostics

```bash
npm run worktrees          # inspect
npm run worktrees:park     # remove disposable checkouts, preserve branches
npm run worktrees:retire   # also retire branches proven merged by exact OID
```

The lifecycle classifier owns cleanup decisions, including dirty work,
upstream evidence, PR state, and `parkPolicy`. Follow `AGENTS.md` for standing
cleanup authorization. Do not delete unrelated work to make a count green.

`repo:doctor` reports old merged checkouts, branch counts, and default
workspace counts as cleanup warnings. An explicit workspace cap remains
enforced. Nested locations and missing markers have separate diagnostics;
SessionStart stamps the active workspace automatically. Read live results
instead of treating an older machine snapshot as current.

Claude's own worktree-removal prompt is a separate cleanup mechanism. The
repository's `parkPolicy` applies to its lifecycle script, so use that script
when relying on its preservation checks.

## Check timing

`scripts/serialize.mjs` queues heavy checks behind `HELM_GATE_SLOTS` (default
2) and records wait/run times in `memory/ledgers/gates.jsonl`.
`npm run gates:report` summarizes them. Use measured contention to choose
parallelism; creating a checkout does not itself mean a test is running.

## Validation

```bash
npx vitest run --project unit scripts/__tests__/create-workspace.test.ts
```

Fixtures cover existing-name refusals, advisory default counts, enforced
explicit caps, disk reserve, marker contents, dependency links, local-only
environment creation, and the hook's path-only stdout contract.

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

The creator links canonical ignored environment files (`.env`, `.env.local`,
and environment-specific local files), `.vercel/project.json`, and
`.claude/settings.local.json`. Updates to canonical credentials and tool
preferences are visible through the links. It also takes `.mcp.json` from
canonical so an older branch gets the current project tool definitions.
Branch isolation applies to source changes, not runtime or tool access.
The workspace launcher and Git hook installer resolve canonical tooling via
Git's common directory, so old branches use the same creator and local hooks.

If a canonical input is absent, it remains absent; no empty replacement or
invented credential is generated. Runtime values are never printed. Existing
custom files are preserved unless replacement is requested; the shared-runtime
helper backs them up inside ignored `.helm/runtime-backups/` before linking.
Claude also inherits canonical local permissions natively in current versions.
Authentication remains owned by the installed tools and the user's account.

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
explicit caps, disk reserve, marker contents, dependency links, shared runtime links and
environment updates, and the hook's path-only stdout contract.

The Supabase CLI also shares canonical `supabase/.temp/project-ref` and
`pooler-url`, so `--linked` commands have the same project identity in every
worktree. Other Supabase temporary files and local stack state stay separate.

## Claude across older branches

The `helm` and `h` shell functions run canonical `scripts/claude.mjs`. Inside
a Helm worktree they preserve the working directory; elsewhere they open
canonical Helm. The launcher selects user and shared local settings, passes
current canonical project settings and MCP configuration explicitly, and
loads canonical agent definitions and operating policy. Hook commands resolve
to canonical scripts. It leaves other installed connectors available and does
not rewrite tracked source files or create automatic Git commits.

Claude merges permission lists, so adding a local allow cannot cancel an old
project deny. Selecting the current profile at launch avoids that merge.
Launching `claude` directly still loads the checked-out branch's settings; use
`helm` when working on historical source. User-supplied CLI flags remain
available for deliberate per-session customization.

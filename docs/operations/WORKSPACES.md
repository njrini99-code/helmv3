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

`npm run dev` uses Webpack, matching production. Turbopack's worktree-local
filesystem root rejects the shared `node_modules` symlink, so the default dev
command must support that shared dependency layout.

## Dependencies and local environment

By default, `node_modules` links to the canonical checkout and `.node-version`
is copied. Use `--install` or `node scripts/ensure-worktree-deps.mjs <dir>`
when the task's lockfile differs or dependencies are unavailable. Tests must
use dependencies matching their checkout.

The creator links canonical ignored environment files (`.env`, `.env.local`,
and environment-specific local files), `.vercel/project.json`, and
`.claude/settings.local.json`. Updates to canonical credentials and tool
preferences are visible through the links. It copies canonical's `.mcp.json`
only into a branch that predates the tracked file; overwriting the tracked
copy used to leave every worktree dirty and unparkable.
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

Three cleanup paths share `scripts/lib/worktree-lifecycle.mjs`:

- **WorktreeRemove hook** (`.claude/hooks/worktree-remove.mjs` →
  `scripts/lib/remove-workspace.mjs`). Claude Code calls it when it removes a
  worktree it created: a finished isolated subagent or workflow step, or a
  `--worktree` session. It refuses uncommitted work, commits that are neither
  pushed nor in a merged PR, and `parkPolicy: KEEP`. It deletes the branch
  when the tip is already in main, or when its PR is proven merged (archive
  tag first). It keeps a pushed branch. It never uses `--force`.
- **`pr:land`** runs `--retire --branch <head>` for the PR it just merged,
  then the usual repo-wide `--retire`. It reports whether that PR's checkout
  and branch are gone. A live session in the checkout keeps it.
- **`npm run worktrees:retire`**, the sweep, for everything else.

Two cases that used to keep checkouts forever are now resolved. A `.mcp.json`
whose content matches canonical's copy, or a version main has held, is a
stale copy rather than work. The sweep and the hook restore it before
removal, and any other `.mcp.json` edit still counts as dirty. A branch whose
PR merged at a different tip, such as a squash or merge-train residue, is
`DELETE_MERGED_CONTENT` when `git merge-tree` proves main already has every
change. Otherwise it stays `KEEP_DIVERGED_AFTER_PR`.

## Check timing

`scripts/serialize.mjs` queues heavy checks behind `HELM_GATE_SLOTS` (default
2) and records wait/run times in `memory/ledgers/gates.jsonl`.
`npm run gates:report` summarizes them. Use measured contention to choose
parallelism; creating a checkout does not itself mean a test is running.

## Validation

```bash
npx vitest run --project unit scripts/__tests__/create-workspace.test.ts
npx vitest run --project unit src/test/scripts/worktree-lifecycle.test.ts \
  src/test/scripts/worktree-remove-hook.test.ts src/test/scripts/pr-land.test.ts
```

Fixtures cover existing-name refusals, advisory default counts, enforced
explicit caps, disk reserve, marker contents, dependency links, shared runtime links and
environment updates, and the hook's path-only stdout contract.

The Supabase CLI also shares canonical `supabase/.temp/project-ref` and
`pooler-url`, so `--linked` commands have the same project identity in every
worktree. Other Supabase temporary files and local stack state stay separate.

## Claude across older branches

The `helm` and `h` shell functions run canonical `scripts/claude.mjs`. Inside
a Helm checkout they open Claude in that checkout's top level; elsewhere they
open canonical Helm. Claude then loads the checkout's own CLAUDE.md (which
imports AGENTS.md), rules, skills, commands, agents, hooks, settings and
`.mcp.json` — the same as a direct `claude` launch. User-supplied CLI flags
pass through unchanged.

Before launching, the launcher compares the agent configuration (`AGENTS.md`,
`CLAUDE.md`, `.claude/`, `.mcp.json`, the launcher itself) with `origin/main`
and warns when the branch carries a stale copy: a file the branch never changed
but main has since. Claude merges permission lists across scopes, so an old
branch's settings can bring back retired rules; the fix is to merge or rebase
on `origin/main`, not to overlay canonical settings (excluding the project
source also drops CLAUDE.md, rules, skills and commands). The launcher never
fetches and never changes the checkout.

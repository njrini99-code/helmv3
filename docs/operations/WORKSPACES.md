# Helm workspaces

Operating authority lives in `AGENTS.md`. This page describes the workspace
implementation and diagnostics; it adds no permission requirements.

## Creation

`scripts/lib/create-workspace.mjs` (`createWorkspace()`) is the one creation
module. Two thin callers use it and nothing else creates a workspace:
`scripts/new-worktree.sh` (people and agents) and the WorktreeCreate hook
`.claude/hooks/worktree-create.mjs` (wired in `.claude/settings.json`; the
harness calls it for `claude --worktree`, `isolation: worktree` subagents and
background sessions). A raw `git worktree add` is unsupported: it gets the
`post-checkout` dependency clone but no marker and no checks.

```bash
scripts/new-worktree.sh <task>
```

The creator validates the name and rejects an existing path or branch. It
then checks capacity, fetches the base, creates an `agent/<task>` branch with
`--no-track`, and writes `.helm/workspace.json`. The default location is
`~/worktrees/helmv3/<task>`; `HELM_WORKTREE_HOME` overrides it.

**Base.** `new-worktree.sh` branches from `origin/main` unless `--base` says
otherwise. The WorktreeCreate hook always branches from `origin/main` (its call
passes `base: 'origin/main'`; the harness hands it only `cwd` and `name`), so an
isolated subagent started from a session on an unpushed or unmerged branch
cannot see that branch's commits. Push the work and tell the subagent which
ref to `git fetch`, or do the slice in the parent's checkout.

**Capacity: one advisory number and one hard refusal.**

| Rule | Value | What happens |
| --- | --- | --- |
| Checkout count (`DEFAULT_MUTATION_BUDGET`, `scripts/lib/worktree-lifecycle.mjs`) | 6 | Advisory. With 6 or more counted checkouts, creation prints a warning and carries on. `repo:doctor` warns above 7. The SessionStart line `worktrees: N linked (advisory; ...)` shows the count and nothing refuses at it. A folder count cannot tell how many agents are working. |
| `HELM_MAX_MUTATION_WORKTREES=<n>` | unset | Opt-in. Setting it makes `<n>` a hard cap: creation refuses with `BUDGET_EXCEEDED` and `repo:doctor` fails instead of warning. Nothing sets it today. `scripts/checks/check-mutation-budget.mjs` reports the same count as a CLI; creation does not call it. |
| Disk reserve (`HELM_DISK_RESERVE_GIB`, legacy `HELM_MIN_FREE_GIB`) | 12 GiB | Hard. Creation refuses with `DISK_LOW` when less than 12 GiB is free under the worktree home. At zero free bytes no command can run, not even the cleanup, so this is the machine's floor. |
| Clone floor (`HELM_CLONE_RESERVE_GIB`, `HELM_CLONE_BUDGET_GIB`) | 2 GiB + 0.5 GiB | The `post-checkout` clone and the deps-hygiene backstop need only this much free, so a raw `git worktree add` can succeed where `new-worktree.sh` is refused. |

When `DISK_LOW` hits, run `npm run worktrees` (report), then
`npm run worktrees:park` or `worktrees:retire`; they remove disposable checkouts
and keep or retire only branches the classifier proves safe.

A failed fetch produces a warning and uses the available base. `--no-track`
prevents a new task branch from inheriting `origin/main` as its upstream.
The marker records the task, base, branch, environment, and cleanup policy.
The default `parkPolicy` is `PARK_IF_REPRODUCIBLE`; `--keep` selects `KEEP`.

`npm run dev` uses Webpack. Production builds with Turbopack (`npm run build`),
so dev and production use different bundlers. Turbopack's worktree-local
filesystem root rejects a symlinked `node_modules`; a cloned one (below) is a
real directory, so `npm run build` works in a worktree too.

`npm run dev` (scripts/dev.mjs) picks the port from the worktree directory name,
in 3001..3099, so several worktrees can run a dev server at once; the canonical
checkout keeps 3000. The port is the first line it logs. An explicit `PORT=` or
`-p` wins, and a busy port falls through to the next free one in range.
`npm run ios:dev` and the Playwright configs read or pin the same value.
Dev servers left running pile up: `npm run dev:stop-idle` lists any `next dev`
idle for more than 2 hours and `npm run dev:stop-idle -- --apply` stops them.
There is no cron; run it when the machine feels slow.

## Dependencies and local environment

Every checkout gets `node_modules` as an APFS clone (`cp -c`) of the deps store
entry for its own `package-lock.json` (`scripts/lib/deps-store.mjs`). A clone is
a real directory: about 25 MiB and 10-20 s for a 2 GiB tree, and writes into it
never reach the source. `.node-version` is copied.

- **Store:** `~/.helm/deps-store/<key>/node_modules` (`HELM_DEPS_STORE`),
  keyed by the lockfile with the Node ABI, platform and arch. An entry is
  filled only by a fresh `npm ci` against that lockfile, or by an install whose
  `node_modules/.package-lock.json` matches it entry by entry.
- **Who clones:** `.githooks/post-checkout` on every `git worktree add` (and any
  checkout that has no `node_modules`), `create-workspace.mjs`, and the
  `deps-hygiene` SessionStart hook as a backstop. None of them runs `npm ci` or
  touches an existing tree.
- **By hand:** `node scripts/ensure-worktree-deps.mjs <dir>` clones on a store
  hit and otherwise runs the one `npm ci` that fills the store. `--refresh`
  replaces a tree installed for another lockfile (only when nothing runs from
  it), `--check` changes nothing, `--gc` removes store entries no checkout uses
  (it keeps main's and the newest 3).
- **Disk:** an install needs 12 GiB reserve + 5 GiB; a clone needs 2 + 0.5 GiB
  (`ensure-worktree-deps.mjs` says why the floors differ).
- **Never** a symlinked `node_modules`: it resolves whatever the donor has,
  Turbopack refuses it, and an npm write through it changes the donor's tree.

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

A checkout with no `.helm/workspace.json` (made by hand with `git worktree add`,
or before the marker existed) is kept, with one exception: when its branch's PR
has merged and the checkout's tip is that merged head, or every change is proven
in main, it parks like a released one. An explicit `KEEP`, an unreadable marker,
and an unmarked checkout on an open, closed or missing PR are still kept.

The SessionStart backstop (`.claude/hooks/stamp-workspace.mjs`) writes a marker
into an unmarked linked checkout that a session starts in. It stamps
`parkPolicy: PARK_IF_REPRODUCIBLE`, the door's own default, never `KEEP`: `KEEP`
comes only from `--keep` or a human edit. (Until 2026-11-25 it stamped `KEEP`,
which made the merged-PR exception above unreachable for any checkout a session
had opened and made the WorktreeRemove hook refuse it forever.) A stamped
checkout is still never parked while it is dirty, unpushed, held by a live
process, or on an open PR without a recorded disposition.

`repo:doctor` reports old merged checkouts, branch counts, and the checkout
count as cleanup warnings; an explicit `HELM_MAX_MUTATION_WORKTREES` cap fails
instead. Nested locations and missing markers have separate diagnostics, and
SessionStart stamps the active workspace (above). Read live results instead of
treating an older machine snapshot as current.

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
explicit caps, disk reserve, marker contents, dependency clones (never links), shared runtime links and
environment updates, and the hook's path-only stdout contract.
`scripts/__tests__/stamp-workspace-backstop.test.ts` pins the backstop: a
checkout it stamps parks once its PR merges, and the dirty, unpushed and
live-process refusals still hold.

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

## Dependency checks and on-demand tools (`deps-hygiene`)

`.claude/hooks/deps-hygiene.mjs` is advisory (it never blocks, per
`AGENTS.md`) and runs on SessionStart and after every Bash call (PostToolUse on
purpose: this repo keeps no PreToolUse hook outside an audit session, see
`src/test/scripts/control-plane-enforcement.test.ts`):

- **SessionStart:** clones a missing `node_modules` from the deps store (or names the
  one command that fills the store), reports a symlinked or broken `node_modules` as
  unsupported, flags a tree installed for a different lockfile (never replacing it: a
  dev server may run from it), and a Node major that differs from `.nvmrc`. Silent
  when healthy.
- **After Bash:** warns when `npm ci|install|uninstall|dedupe|…` wrote through a
  symlinked `node_modules` (this includes `--package-lock-only`, which still rewrites
  `node_modules/.package-lock.json`), or when a checkout others still link to just
  installed while `next dev|build` is running. It also points a bare `promptfoo` /
  `momentic` call at its pinned form.
- **On-demand tools** (not dependencies, so they do not bloat every install):
  `npx --yes promptfoo@0.124.0 <cmd>`; `npx --yes momentic@3.63.1 <cmd>`.
  The pins live in `ON_DEMAND_TOOLS` in the hook, `package.json` and
  `.circleci/config.yml`; bump them together.

Tests: `scripts/__tests__/hooks/deps-hygiene.test.mjs`,
`scripts/__tests__/deps-store.test.ts`,
`scripts/__tests__/ensure-worktree-deps-floors.test.ts`.

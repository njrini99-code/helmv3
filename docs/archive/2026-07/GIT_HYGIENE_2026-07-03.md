# Local Git Hygiene — 2026-07-03

Phase 13 of the HelmV3 stabilization brief. Read-only audit + two safe,
verified-reversible-by-construction cleanups. No destructive commands were
run (`git clean -Xdf`/`-xfd`, `git branch -D`, force-push, history rewrite
— all explicitly out of scope per the brief's guardrails).

## Done

### 1. Corrupted commit-graph cache — fixed

`git fsck --full` was failing with ~15 `Could not read <sha> / failed to
parse commit ... from object database for commit-graph` errors — a stale
multi-layer `commit-graph-chain` in `.git/objects/info/` referencing
objects that no longer resolve the same way (this is a derived
performance cache, not repo history). Fixed by removing the stale
chain/graph files and regenerating from scratch:

```bash
rm -rf .git/objects/info/commit-graph* .git/objects/info/commit-graphs
git commit-graph write --reachable
```

Post-fix, `git fsck --full` only reports normal `dangling commit/tree/blob`
entries — expected in any active repo with stash/rebase/amend history, not
a sign of corruption. This is a purely local, derived-cache operation; no
git objects or history were touched.

### 2. Six confirmed-merged stale local branches — deleted

`git branch -vv` showed 6 local branches whose remote tracking branch was
`[gone]` (deleted on GitHub, almost certainly via squash-merge). Each was
verified merged into `main` with `git merge-base --is-ancestor <branch>
main` (exits 0 only if true) **before** deletion, and removed with `git
branch -d` (not `-D` — refuses to delete if not actually merged, so this
could not have silently discarded unmerged work):

- `chore/clean-slate-20260704`
- `feat/liftlab-helm-unification`
- `fix/admin-consolidated-20260703`
- `hotfix/green-main-ci-env`
- `hotfix/semgrep-comment-fp`
- `hotfix/visx-subpackages`

## Documented, not acted on

### Stashes — 24 total, classification needs a human pass

`git stash list` shows 24 stashes, the oldest referencing work from well
before this session (`stash@{23}`: `fix: remove strict LazyMotion prop
that crashed golf dashboard pages`, `stash@{18}`: `sw.js build artifact`,
etc.). Per the brief, each needs `git stash show --stat` /
`--patch` review and one of **keep / branch / apply to branch / drop**
before any are dropped — none were reviewed deeply enough in this pass to
responsibly drop, since several reference branches/efforts this session
has no context on (e.g. `pr-420`, `audit/ultra-12-data-visualization`,
`TEAM-D-temp-stash-2`). Recommend a dedicated pass:

```bash
git stash show --stat stash@{N}
git stash show --patch stash@{N}
```

### 794 ignored-but-removable paths — do NOT bulk-clean

`git clean -Xdn` (dry run) lists 794 paths that are gitignored and would
be removed by `git clean -Xdf`. **Critically, this list includes real
secret-bearing files**: `.env`, `.env.local`, `.env.development.local`,
`.env.production.local`, plus tool credentials under
`.claude/skills/golfhelm-creative-engine/tools/.env` and MCP config
(`.cursor/mcp.json`). This is exactly why the brief bans `git clean -Xdf`
/ `-xfd` outright — a bulk ignored-file clean on this repo would delete
live local credentials, not just build caches.

If a future pass wants to reclaim disk space, do it **file-by-file or
directory-by-directory** with an explicit allowlist of known-safe build
artifacts (`.next/`, `playwright-report/`, `test-results/`,
`.playwright-mcp/`), never `git clean -X*` unscoped. This pass did not
run even the scoped `rm -rf` cleanup — it's local disk hygiene with no
bearing on repo/CI health, and out of scope for what this session could
respsonsibly verify as safe on a machine it doesn't own.

## Not available in this session

`npm run git:audit` / `npm run git:clean:dry` / `npm run git:stash:audit`
(the brief's suggested helper scripts) live on the still-open `#773`
branch (`codex/cleanup-repomix-knip-supabase-audit`), not yet on `main`.
This audit used the equivalent raw `git` commands directly instead of
waiting for that PR to merge.

---
name: helm-process
description: The one-screen operating loop for doing work in helmv3 — worktree door, feature context, gates, landing, retirement, and the read-only tool surfaces. Use whenever starting a task, deciding how to ship it, or unsure which script/agent/command owns a step.
---

# helm-process

The loop, in order. Each step names the real command — never a hand-rolled
substitute.

1. **Door.** New work gets its own worktree via `scripts/new-worktree.sh
   <task>` (never raw `git worktree add`/`checkout -b`/`switch -c`). This is
   the only door the `WorktreeCreate` hook and a human share, so budget
   checks and the `.helm/workspace.json` stamp never drift between them. Run
   `node scripts/ensure-worktree-deps.mjs <dir>` if the task needs deps.
2. **Confirm the branch.** `git -C <dir> rev-parse --abbrev-ref HEAD` before
   the first edit — never assume the checkout you're in is the one you
   think it is.
3. **Load context.** `npm run knowledge:map -- --files <paths>` then
   `npm run knowledge:context -- --files <paths> --task "<task>"` (or
   `/context`). Read the mapped `memory/features/*.md` doc before changing
   governed behavior. A missing mapping is a registry gap to flag, not a
   reason to skip.
4. **Work.** `git add <explicit paths>`, never `-A`. See
   `.claude/agents/helm-worker.md` for the full worker contract (secrets,
   destructive-op, and deploy prohibitions) and `.claude/agents/helm-reader.md`
   for a read-only audit pass.
5. **Gates.** Capture every gate to a file with `set -o pipefail`; report
   exit codes as observed, never inferred (`/status`, `/gates`).
6. **Push and PR.** `git push -u origin <branch>`; `gh pr create`. Pushing
   does **not** deploy — the git integration is disconnected.
7. **Land.** `/land <pr>` (`npm run pr:land -- <pr>` — this script ships on
   the worktree-hygiene PR; if it is not yet on `main`, treat `npm run
   pr:land -- <n>` as the target interface and say so rather than
   hand-merging). Never `gh pr merge` directly, never `--admin`.
8. **Retire.** `npm run worktrees:retire` (or `:park` for a disposable,
   unmerged checkout). This is the sole lifecycle authority — never remove a
   worktree or delete a branch by hand. A deleted branch is preserved first
   as an `archive/<branch>` tag.

## The deploy path — separate from all of the above

Production is promoted **only** through `scripts/deploy-prod.sh`, which
enforces the budget in `config/release-policy.yml`. `HELM_DEPLOY_OVERRIDE`
requires a stated reason — it is not a silent bypass. Pushing to a branch or
landing a PR never deploys anything by itself.

## Key precedence (`src/lib/supabase/keys.mjs`)

For every Supabase credential pair, the new-format key is checked first and
the legacy JWT is the fallback — publishable key before anon-key JWT, secret
key before service-role-key JWT. One resolver, so the precedence can't drift
between callers; never re-implement it inline.

## The three read doors

- **Supabase**: this repo's `.mcp.json` server (`mcp__supabase__*`,
  project-scoped, `read_only=true`) for the sanctioned path, plus the
  account-wide connector (`mcp__e139bbde-4728-4ed3-977f-7b1b22f4b69c__*`) for
  read tools like `list_tables`/`get_advisors`/`query_logs`/`search_docs` —
  its `execute_sql` is an unenforced production write path and stays off the
  allow list regardless of which door is used.
- **Sentry**: the account MCP, org `helm-xs` — read/search/analyze tools
  only; no mutator is on the allow list.
- **Vercel**: the repo-local CLI (`./node_modules/.bin/vercel`, never a
  global install), `deploy` needs `--archive=tgz`; the account connector's
  read tools (`list_projects`, `get_deployment_build_logs`,
  `get_runtime_logs`, etc., under
  `mcp__fba2ada3-c190-4053-b91a-3e81f5296483__*`) for inspection only —
  `deploy_to_vercel` and every purchase tool stay denied.

`docs/CONTROL_PLANE_ENFORCEMENT.md` and `docs/TOOL_AUTHORITY_MATRIX.md` are
the live authority on what each of these can actually do right now — both
are generated; never hand-edit between their AUTOGEN markers.

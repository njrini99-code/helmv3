---
verified: 2026-09-04  # working-style guidance ON TOP OF code claims — scripts, npm scripts, .gitignore, settings.json and the enforcement inventory are all greppable, and three drift scanners already read this file
---

## Autonomy — finish the work, don't narrate it

No `paths:` frontmatter, so this loads on every session in this repo. That is
deliberate: the failure it addresses shows up in the first turn, before any
file has been touched.

### The default is: do it

The owner works solo and is the only reviewer. A turn that ends in a question
costs a full round trip and gets an answer that was almost always predictable.
Treat a request as authorization for the **whole** job, including the parts
that were implied rather than listed.

- Multi-step work runs end to end. Report once, at the end.
- Do not end a turn with "want me to continue?", "shall I proceed?", "let me
  know how you'd like to handle X", or a plan presented for approval. If you
  know the next step, take it.
- Do not stop at the first thing you find. "Audit X" means audit X, fix what
  you find, and verify the fixes.
- When something is ambiguous, pick the reading a careful colleague would,
  state the assumption in one line, and keep going. Surface it in the final
  report, not as a blocking question.
- A concern is worth one or two sentences, then you build anyway under the
  stated assumption. Raising a concern is not a reason to stop.
- If part of the job is genuinely blocked, finish every other part in full and
  say what you left out and why. Do not let one blocked item stall the rest.

### Parallel agents share ONE working tree

Dispatching several agents at once is the right instinct, and the trap is that
they are not isolated the way they look. Every agent spawned into this repo
shares a single checkout, which means a single `HEAD`, a single index, and a
single set of files on disk.

Observed 2026-08-16: two agents were dispatched in parallel and each was told to
`git checkout -b`. The second checkout moved `HEAD` out from under the first,
which was mid-edit. Nothing errored — the work simply landed on the wrong
branch. `git add -A` then made it worse by sweeping in the other agent's
half-finished files.

Pick one of these before dispatching, never neither:

- **Serialize** — agent 1 finishes and commits, *then* agent 2 starts. Simplest,
  and correct when the work is small or the agents touch the same files.
- **Give each agent its own worktree** — real isolation, real parallelism.
  **There is exactly one supported way to make one:**

  ```bash
  scripts/new-worktree.sh <task-name>
  # -> ~/worktrees/helmv3/<task-name> on branch agent/<task-name>
  git worktree list                    # what's still checked out
  npm run worktrees:retire             # when merged — never a raw remove
  ```

  Use it because it guarantees four things at once: an external managed
  location, the `agent/<task>` branch name, `--no-track`, and a known base.

  It can also REFUSE, before allocating anything: one mutation workspace at a
  time (`HELM_MAX_MUTATION_WORKTREES`, default 1) and a free-space reserve.
  A refusal costs nothing and is the tool working — park an existing checkout
  rather than overriding it. An agent told to give three sub-agents a
  worktree each will be refused on the second, by design.

  The harness has its own worktree isolation (`isolation: "worktree"` on the
  Agent tool, `EnterWorktree`). It gives you a checkout and NONE of the four
  guarantees: no `--no-track`, so the `agent/foo -> origin/main` trap below is
  live again; no `.helm/workspace.json`, so the lifecycle tool cannot classify
  it and returns `KEEP_WORKSPACE_INTENT_REQUIRED`; and no mutation-budget
  accounting. Use it for throwaway reads; use the script for anything that
  will push.

  It no longer installs dependencies. A checkout cost ~3.8 GiB of node_modules
  whether or not the task needed one, and most control-plane, docs and config
  work never runs a test — that coupling is why six worktrees in one day took
  the volume to zero bytes free. Install when something actually needs it:

  ```bash
  node scripts/ensure-worktree-deps.mjs <dir>   # or: new-worktree.sh <task> --install
  ```

  which applies a reserve-plus-budget policy instead of starting and hoping.

  The proven failure mode is narrower than "raw git is dangerous". It is
  specifically **creating a task branch from a REMOTE-TRACKING ref (such as
  `origin/main`) without disabling tracking**. Git's `autoSetupMerge` default
  then configures the new branch to track that ref:

  ```text
  agent/foo -> origin/main
  ```

  and a later bare `git push` from `agent/foo` targets **main**. That was live
  on a consolidation branch carrying 23 commits that existed nowhere else.
  Branching from a local ref does not produce this, and `--no-track` prevents
  it in either case. Check with:

  ```bash
  git for-each-ref --format='%(refname:short) -> %(upstream:short)' refs/heads
  ```

**A worktree goes OUTSIDE the repo — never `.worktrees/` inside it.**
`.gitignore` line 5 hides `.worktrees/` from git, and that is exactly the trap:
`find`, `grep`, `ls` and most agent file search do NOT honour gitignore.
Observed 2026-08-18 —
`.worktrees/codex-golf-team-operations/` held **4,314** `.ts`/`.tsx` files
against `src/`'s 3,884, so a search from the repo root returned two hits for
essentially every file:

```
./.worktrees/codex-golf-team-operations/src/.../PlayerCoachHelmHome.tsx
./src/.../PlayerCoachHelmHome.tsx
```

Agents picked one at random and edited a branch nobody was shipping, then
reported success. That is the mechanical cause of "the agents keep getting
lost". Put worktrees in a sibling directory and this cannot happen.

**Prune through the lifecycle authority. Do not hand-roll a second one.**
This repo squash-merges, so a merged branch's commits never become ancestors of
`main` and `git branch --merged` will never list it — `codex/golf-team-operations`
still reported "10 commits not in main" long after #1513 had shipped as
`a9f2c7f37`. Cleanup keyed on `--merged` never fires and worktrees accumulate
forever.

```bash
npm run worktrees          # report — the default, and always safe
npm run worktrees:park     # remove disposable checkouts, KEEP their branches
npm run worktrees:retire   # park, AND delete branches proven merged
```

This block used to spell out `git worktree remove --force`, `git branch -D` and
an `lsof +D` pre-check. All three are gone deliberately: `scripts/worktree-lifecycle.mjs`
is the single lifecycle authority, a hand-run recipe is a second deletion
algorithm that nothing tests, and the `lsof` step in particular taught the exact
inference that removed a live checkout on 2026-08-30 — `lsof` answers about one
instant, so seeing no process is not evidence that nobody is using a worktree.
The policy boundary lives in AGENTS.md; the mechanism lives in the tool.

  Worktrees share the object store, so branches and commits are visible from the
  main checkout immediately — no pushing between them.

Two rules that hold either way:

- **`git add <explicit paths>`, never `git add -A`.** In a shared tree `-A`
  stages whatever another agent happens to have written.
- **Never assume a `git checkout -b` succeeded.** The historical cause was the
  fsmonitor daemon: `fsmonitor_ipc__send_query: unspecified error` made a
  checkout fail while looking like it had worked. Whether that can happen on
  the checkout you are in is a `.git/config` question, and `.git/config` is
  NOT version controlled — so do not take this file's word for it, CHECK:

  ```bash
  git config --show-origin --get-all core.fsmonitor
  ```

  No output means the key is unset, which is the git default (daemon off);
  `true` means the daemon is on and the failure is possible; `false` means it
  was disabled explicitly. (This paragraph asserted "`core.fsmonitor = false`,
  verified 2026-08-19" until 2026-09-01, when the command above returned
  nothing and `.git/config` had no `[core]` section at all — the setting had
  never travelled, or had been removed, and the prose could not tell.)
  `scripts/deploy-prod.sh` still passes `-c core.fsmonitor=false` on its own
  git calls, which is correct regardless of what the config says.

  Confirming the branch you are on is cheap and correct regardless of cause,
  because in a shared tree another agent's checkout can move `HEAD` under you:
  `git rev-parse --abbrev-ref HEAD` before editing anything.

### When asking IS right

The bar is: proceeding under any assumption would be unsafe, or would waste
substantial work if the guess is wrong. In practice that is close to:

- Destructive or irreversible actions with real blast radius — dropping data,
  rewriting published history, deleting something not recoverable from git.
- Outward-facing actions — sending mail, posting to a PR or an external
  service, anything a third party sees.
- A fork where the two readings produce genuinely different deliverables and
  you would have to throw one away.

Cost, effort, and "this is a big change" are **not** reasons to ask. Neither is
touching something that merely sounds sensitive.

### Confidence

State what you did and what you verified, plainly. If tests fail, say so with
the output. If a claim rests on something you could not run locally, name that
limit once. Do not hedge work that is done and checked, and do not re-audit
your own phrasing after the fact.

### What actually makes acting without asking safe

Not the hooks. This section used to say the guard hooks "block the shapes that
actually matter (force push, destructive SQL, unscoped recursive delete)" and
concluded "trust them and work." **All three examples were false**, measured
2026-08-29: no hook and no deny rule covers force push, destructive SQL, or
recursive `rm`. One `PreToolUse` hook exists and it refuses exactly one thing —
`Write`/`Edit`/`MultiEdit` into the canonical checkout.

That mattered more than the other stale claims, because this was the paragraph
telling you it was safe to proceed without asking. A false safety claim used to
justify autonomy is the worst possible place for one.

What is actually true:

- `permissions.deny` fires deterministically, is not suspended by allow rules
  or by `bypassPermissions`, and a project-scope deny overrides a user-scope
  allow. That mechanism is real. What it demonstrably covers is the Supabase
  CLI migration path — four commands across three spellings (bare,
  `./node_modules/.bin/`, `npx`), which is the spelling coverage that matters
  because the bare binary does not resolve on this machine at all.
- **It does NOT currently cover the account-wide Supabase MCP.** That claim
  was here until 2026-09-04 and is the same shape of error as the paragraph
  above it. The deny rules exist, but `docs/CONTROL_PLANE_ENFORCEMENT.md`
  records that the display-name spelling `mcp__claude_ai_Supabase__*` "match[es]
  nothing the session can call today", and the UUID spelling is `CONFIGURED`,
  `NOT yet observed to remove the tools`, with id stability across sessions
  UNVERIFIED — that is the registered gap
  `MCP_DENY_RULES_KEYED_ON_ROTATABLE_CONNECTOR_IDS`. Reconfirmed 2026-09-04
  from a live session inventory: no `mcp__claude_ai_*` name is present. Rules
  keyed on a name nothing exposes are not enforcement; they are a bet that the
  spelling returns unchanged.
- One `PreToolUse` hook covers canonical writes via three tool names, and by
  its own header does not read intent, match keywords, or look at features.
- Everything else on the destructive list is on you.

`docs/CONTROL_PLANE_ENFORCEMENT.md` is regenerated from the live configuration
and resolves each claim to a mechanism, a location, and how it was observed.
Check there before believing any sentence in these rules that says something is
blocked — including this one.

So: work autonomously because the owner asked for it and because the work is
recoverable through git and PR review, not because a machine will catch a
destructive mistake. Mostly it will not.

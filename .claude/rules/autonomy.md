---
verified: 2026-08-16  # working-style guidance, not code claims — nothing here to grep
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
- **Give each agent its own worktree** — real isolation, real parallelism:

  ```bash
  git worktree add ../helmv3-wt-1 -b agent/task-one
  git worktree add ../helmv3-wt-2 -b agent/task-two
  # ...agents work in ../helmv3-wt-1 and ../helmv3-wt-2, each with its own HEAD
  git worktree remove ../helmv3-wt-1   # when merged
  git worktree list                    # what's still checked out
  ```

  Worktrees share the object store, so branches and commits are visible from the
  main checkout immediately — no pushing between them.

Two rules that hold either way:

- **`git add <explicit paths>`, never `git add -A`.** In a shared tree `-A`
  stages whatever another agent happens to have written.
- **Never assume a `git checkout -b` succeeded.** The fsmonitor daemon in this
  repo intermittently fails with `fsmonitor_ipc__send_query: unspecified error`
  and can leave a checkout half-applied. Re-run with
  `git -c core.fsmonitor=false checkout -b <name>` and confirm with
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

The guard hooks in `.claude/hooks/` are the safety net — they block the shapes
that actually matter (force push, destructive SQL, unscoped recursive delete)
deterministically and are not suspended by permission allow rules. That is
what makes acting without asking safe here. Trust them and work.

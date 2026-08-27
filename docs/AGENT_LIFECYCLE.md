# How an agent turns into a commit here

Written 2026-08-27 by tracing the live system, not by reading the docs about
it. Where this contradicts another doc, this one was checked and that one
probably was not — but check both and fix whichever is wrong.

Anchor SHA `43bca2838`. Staleness check:

```bash
git rev-list --count 43bca2838..HEAD -- \
  '.claude/**' '.github/workflows/**' 'package.json'
```

---

## Part 0 — Every place bytes get written

An agent writes to six places. Only one is your repo.

**1. Session scratchpad.**
`/private/tmp/claude-501/<project>/<session-id>/scratchpad/`
Scratch scripts, captured gate output, backups taken before risky edits.
Outside the repo. **Not a backup** — `/private/tmp` lost two worktrees on
this machine overnight.

**2. Session state.** `.claude/session-state/<session-id>.jsonl`
Append-only log of what this session loaded and touched. Gitignored. This
is what the Stop gate reads, so git is never asked to guess whose change
is whose.

**3. Transcripts.** `~/.claude/projects/<project-slug>/*.jsonl`
Full conversation history. 1,052 files here. Cleaned after
`cleanupPeriodDays` (45).

**4. Auto memory.** `~/.claude/projects/<project-slug>/memory/`
A `MEMORY.md` index plus topic files. Machine-local, keyed on the git
repo, so **all worktrees share one memory directory**. Exempt from the
retention sweep. Does not travel with a clone.

**5. The working tree** of whichever worktree the agent is in.

**6. `.git/objects`** — committed content, forever, shared by every
worktree. This is the only one that is actually the repo.

---

## Part 1 — Session start

Context is assembled in a fixed order and injected as a **user message**,
not the system prompt. It is guidance the model reads, not a rule the
runtime enforces. Enforcement is hooks (Part 2).

1. `~/.claude/CLAUDE.md` — absent on this machine.
2. `./CLAUDE.md`, with `@AGENTS.md` and the engineering OS **expanded
   inline**.
3. `.claude/rules/*.md` — every file **without** `paths:` frontmatter.
   Files with `paths:` load later, when a matching file is read.
4. `SessionStart` hooks: `session-context.sh` prints the banner,
   `init-session-state.mjs` creates the session `.jsonl`.

### The import trap

`@AGENTS.md` does **not** save context. Imports expand at launch, so the
cost is the sum of every file. This repo loaded **1,108 lines** before an
agent did anything, while `CLAUDE.md` itself was 353. Official guidance
targets under 200 lines per file.

### When a rule may be path-scoped

The test:

> Could this rule prevent a mistake made on a turn that opens no files?

If yes it must stay always-on, whatever its length.

- `autonomy.md` **passes** — ask-vs-act is decided before the first file.
- "Never grant `anon` EXECUTE" **fails** — needs a `.sql` in play.
- The Supabase MCP warning **passes** — `execute_sql` opens no file, so
  scoping it would load the warning after the damage.

---

## Part 2 — The hook chain, exactly as wired

Matchers are regexes against the tool name.

| Event | Matcher | Hook |
| --- | --- | --- |
| SessionStart | all | `session-context.sh` |
| SessionStart | all | `init-session-state.mjs` |
| PreToolUse | `Bash` | `guard-bash.sh` |
| PreToolUse | `Write\|Edit\|MultiEdit` | `guard-sql.sh` |
| PreToolUse | `Write\|Edit\|MultiEdit` | `guard-feature-context.mjs` |
| PreToolUse | `Write\|Edit\|MultiEdit` | `guard-concurrent-edit.mjs` |
| PreToolUse | `mcp__.*(apply_migration\|execute_sql)` | `guard-sql.sh` |
| PostToolUse | `Read\|Bash` | `record-context-load.mjs` |
| PostToolUse | `Write\|Edit\|MultiEdit` | `record-session-touch.mjs` |
| PostToolUse | `Write\|Edit\|MultiEdit` | `post-edit.sh` |
| Stop | all | `stop-verify.sh` |

One file edit fires **three** PreToolUse hooks in sequence. Any one exits
2 and the write never happens.

### Why hooks are the whole safety story

`~/.claude/settings.json` sets `permissions.defaultMode:
bypassPermissions`. The approval prompt is **off**. The 43 user and 64
project allow-rules grant nothing extra, because everything is already
permitted.

Hooks are **not** suspended by allow rules or by bypass mode. They are the
only enforcement left. That is the design: fast by default, with a small
set of deterministic blocks that cannot be argued with.

### `guard-bash.sh` — 17 blocked shapes

Force push, any spelling including combined shorts like `-vf`. `git
stash`, because `refs/stash` is repo-global across every worktree. `git
clean -f`. Recursive `rm` outside the project, or with `..` or a `cd` in
the same command. `rm -rf .next`. Piped gate commands. `supabase config
push`, `db reset`, `db push`. Destructive SQL through `psql`. `git
worktree add` resolving inside the repo. `vercel --prod`, `promote`,
`rollback`, `alias set`.

The piped-gate block is the subtle one. `npm test | tail` exits with
**tail's** status, so a failing suite reads as success.

### `guard-feature-context.mjs` — the one that looks like a bug

Governed paths: `src/app/golf/`, `src/lib/golf/`, `src/components/golf/`,
`src/app/api/golf/`, the three baseball equivalents,
`supabase/migrations/`, any `.sql`, `src/lib/supabase/`, `scripts/db/`.
`memory/**` is excluded.

Editing a governed file is **blocked** until this session has loaded the
mapped feature doc — reading it, or running `npm run knowledge:context`.
Writing a flag does not count; the hook reads this session's own `.jsonl`.

A governed file mapping to **no** feature also blocks, with an escape
hatch: `npm run knowledge:map -- --files <path>` records the gap.

This is why `memory/registry.yml` and `memory/features/**` are
**executable, not prose**. Delete them and every golf, baseball and
migration edit fails closed — looking like a permissions bug rather than a
deletion.

### `stop-verify.sh` — the turn itself can be rejected

Before a turn ends: were governed files touched, was context loaded, was
memory evidence written? A behavioural change needs a **dated** entry in
`memory/ledgers/changes/<feature-id>.md`. A non-behavioural one needs a
structured reason via `record-event.mjs no-memory-change`; "not needed" is
rejected.

---

## Part 3 — Git, mechanically

### A branch is a 41-byte file

`.git/refs/heads/main` holds one commit SHA. That is the whole branch.
Creating one writes a file. Deleting one deletes a pointer — **the commits
are untouched**, just unreferenced, until `git gc`.

### A commit is a snapshot, not a diff

Each commit points to a **tree**, a complete listing of every tracked file
at that instant, plus its parents. Git *computes* diffs between trees; it
never stores them.

This is why two `refs/codex/turn-diffs/checkpoints/…` refs here point at
**trees with 88 entries and no commit** — whole repo states with nothing
wrapping them.

### Four places a file exists

```text
working tree  ->  index  ->  object store  ->  refs
  on disk       .git/index   .git/objects     .git/refs
```

`git add` copies tree to index. `git commit` freezes the index into a tree
object, wraps it in a commit, moves the branch pointer.

They are independent, which is why `git status` can say modified while
`git diff` shows nothing — stat-dirty, mtime changed, bytes identical.
`git update-index --refresh` clears it. `tsconfig.json` does this after
every build.

### Worktrees: what is shared

Shared by every worktree:

- `.git/objects` — every commit, tree and blob
- `.git/refs` — **every branch, globally**
- `refs/stash` — one global stack

Private to each, in `.git/worktrees/<name>/`:

- `HEAD` — which branch
- `index` — the staging area
- the files on disk

What follows:

- A commit made in `/private/tmp/helmv3-msgfix` is **instantly visible**
  from the main checkout. No push. Commits survive the directory being
  deleted, because the objects live in `Downloads/helmv3/.git`.
- Branch names are global. Another session can check out yours.
- `refs/stash` is global — one stack, four worktrees. Hence the guard.
- Two worktrees cannot check out the same branch.
- `git add -A` cannot cross worktrees, but in **one shared checkout with
  two sessions** it sweeps the other's half-written files. That happened
  here on 2026-08-16.

### Squash merge — the biggest confusion

This repo: `squash=true`, `delete_branch_on_merge=true`.

A squash merge builds **one new commit**, new SHA, new tree, parented on
main's old tip. Your branch's commits are **never ancestors of main**.
So:

```bash
git branch --merged main       # NEVER lists a merged branch here
git merge-base --is-ancestor   # false for work that shipped
```

Both are correct and both are useless. `codex/golf-team-operations`
reported "10 commits not in main" long after it shipped, and cleanup keyed
on `--merged` never fires. Use PR state:

```bash
gh pr list --state merged --limit 20 \
  --json headRefName,number,mergeCommit
```

---

## Part 4 — Edit to merged

1. **Edit** — three PreToolUse hooks vote; PostToolUse records the touch.
2. **Verify** — `npm run preflight`, ten gates, all also run by CI.
3. **`git add <explicit paths>`** — never `-A` in a shared checkout.
4. **`git commit`** — new tree and commit; branch pointer moves.
5. **`git show --stat`** — a commit that "succeeded" is not one that
   contains what you meant. A pathspec error aborts the whole add line and
   the commit still succeeds, holding less than you think.
6. **`git push -u origin <branch>`** — explicit upstream. Branches here
   default to tracking `origin/main`, so a **bare push targets main**.
7. **`gh pr create`**
8. **CI** — 43 jobs across 13 workflows.
9. **Squash merge** — one new commit on main; remote branch auto-deleted.
10. **`git fetch`** — local main catches up.

A push to `main` deploys nothing. `vercel.json` carries
`"git": {"deploymentEnabled": {"*": false}}`. Production is an on-demand
CLI promote a human runs. Merging is not shipping.

---

## Part 5 — What CI actually gates

13 workflows, 43 jobs. Two aggregates gate a merge, and each gates **only
through its own `needs:` list**:

| Aggregate | Workflow jobs | In `needs` |
| --- | --- | --- |
| CI aggregate | 18 | 15 |
| Review Gate aggregate | 12 | 11 |

A job added to a workflow but **not** to `needs:` runs, posts its own
check line, and blocks nothing. That is a visible orphan rather than an
invisible one — still not a gate.

### The skipped-need trap

The aggregate fails on failure, cancelled, **or skipped** when
`detect-changes.outputs.code == 'true'`. So a job you add to `needs` must
actually run on every code PR. Give it a narrow path filter and a code PR
that misses that path fails for no reason — the fastest way to get a gate
deleted. The house pattern is
`if: needs.detect-changes.outputs.code == 'true'`, which skips only on
docs-only PRs, where the aggregate tolerates it.

### Required checks are matched by NAME

Six required contexts on `main`: `Smoke checks`, `CI aggregate`,
`Review Gate aggregate`, and three `Analyze (…)` jobs.

Both aggregate job **ids** are `all`; only the `name:` field becomes the
check-run string. A required list naming `Review Gate / all` waits forever
on a check nothing posts, with **no error anywhere**. Two of three
required contexts were phantoms until 2026-08-19. The three `Analyze (…)`
names are rendered from the CodeQL matrix, so editing the matrix silently
renames a required check.

Canonical account: `.github/branch-protection.md`. Do not restate it.

### Deliberately not gating

`baseball-auth-smoke` and `unit-tests-timezone` are out of `needs` by
owner decision for PR throughput. Both run on push to `main` only, so a
failure blocks the next **promote** rather than every merge. Not drift.

---

## Part 6 — Tests are three systems, not one

| Layer | Runner | Gated by |
| --- | --- | --- |
| unit | vitest `unit` | `test:run` |
| unit-dom | vitest `unit-dom` | `test:run` |
| integration | vitest `integration` | `test:integration` |
| business | vitest `business` | CI |
| RLS | **pgTAP, not vitest** | Supabase lint + RLS tests |
| E2E | Playwright | smoke on PRs, full on main |

Notes that matter:

- `npm test` runs **unit + unit-dom only** — the fast loop, not coverage.
  `npm run test:all` runs everything.
- The vitest `rls` project selects **zero** files. True, and it says
  nothing about `npm run test:rls`, which is `bash scripts/test-pgtap.sh`
  and runs the real suites against a local Postgres. Docker down means a
  connection refusal, **not** that RLS is untested.
- `scripts/__tests__/` has **no glob**. A new file there runs only if you
  add it by name to `vitest.config.ts`.
- Counts are deliberately absent here. Derive:
  `ls supabase/tests/rls/*.sql | wc -l`.

---

## Part 7 — Ratchets

Nine baselines, each locking a per-rule count that may only go **down**.
`--update` is legitimate only after the net decreases.

**Per-rule, not net.** A change can drop the total by 1,457 and still fail
because one rule went 26 to 27. That is correct — net hides regressions.

### The reproducibility rule

> A gate must read `git ls-files`, never the filesystem.

A `readdirSync` walk is not gitignore-aware, so it counts whatever is on
the machine. `markdown-lint-ratchet.mjs` walked `docs/`, which contains a
wholly gitignored `docs/redesign/` holding 21 `.md` files. One checkout
linted 1,479 files, CI linted 1,458. The same script, same commit, gave
two people numbers **1,850 apart**, and each concluded the other's tree
was broken.

All four filesystem-walking gates now filter through
`scripts/lib/tracked-files.mjs`. Prove a scope filter **both ways**: an
untracked probe must not move the count, and the same file staged must.

### Two things that are not gates

- `check:ledger` needs `psql` output on stdin; `knowledge:report` needs
  `changed-files.txt`. Both are pipeline components that `package.json`
  advertises as gates.
- `preflight` is a **subset** of CI. All ten of its gates also run in CI,
  but CI additionally runs build, tests, RLS and the Review Gate
  analysers.

### The documentation tax

The markdown ratchet grandfathers roughly 30,000 existing violations while
holding new files to zero. Adding any substantial doc to `docs/` means
writing it violation-free: 80 columns hard, padded table separators
(`| --- |`), blank lines around every list and heading. This file was
rewritten twice to satisfy it.

---

## Part 8 — Traps, ranked by cost

1. `git branch --merged` never works here. Squash merge. Use PR state.
2. A required check is matched by name, and a stale name never errors —
   it waits forever.
3. `git check-ignore` on a path that does not exist **lies**. A
   trailing-slash pattern matches only directories; with no directory it
   reports NOT IGNORED for a rule that works. Verify with a probe file.
4. `.gitignore` hides a directory from git, not from `find` or `grep`. A
   nested worktree once put 4,314 duplicate `.ts` files in front of every
   search.
5. Grep finds callers only in the syntax you searched. CI invokes scripts
   by **path**, not `npm run <name>`; npm fires `prebuild`/`postbuild` by
   **naming convention**, so no file references them. Both produced wrong
   "this is an orphan" conclusions here.
6. A gate that cannot fail is worse than no gate. `check:env`
   early-returns unless `VERCEL_ENV` is set, which Actions never sets.
7. `timeout` does not exist on macOS. Use `gtimeout`.
8. `ls` is aliased to `eza`. Use `/bin/ls` in scripts.
9. A six-space continuation under a list item is a code block (MD046).
10. Imports do not save context.

---

## Part 9 — Worktrees in practice

Claude Code has **built-in** worktree support. `claude --worktree <name>`
creates one under `.claude/worktrees/<name>/`, branched from the default
branch, and **enforces isolation**: it blocks edits targeting the main
checkout, blocks commands whose cwd resolves there, and blocks git
redirects back into it. `.claude/worktrees/` is already gitignored, and
`.worktreeinclude` already copies gitignored files such as `.node-version`
into each new one — deliberately **excluding** `.env*`, so production
secrets are not multiplied across parallel worktrees.

But `guard-bash.sh` blocks any `git worktree add` resolving inside the
repo. The manual path is blocked while the built-in path is not. Both
rules exist for the same 2026-08-18 incident and neither knows about the
other. Resolve that before relying on either.

Manual, outside the repo:

```bash
git worktree add ~/worktrees/helmv3-task -b my-branch
lsof +D ~/worktrees/helmv3-task | awk '$4=="cwd"'
git worktree remove ~/worktrees/helmv3-task
```

---

## Part 10 — The failure mode behind most of this

Almost every confusing behaviour here is **a pointer that resolves to
something other than what you assumed**:

- a branch "not merged" by ancestry that shipped by squash
- a required check name that resolves to nothing
- `check-ignore` resolving an absent path
- an import that resolves but costs full price
- a registry entry that resolved to a doc about a different feature
- a ratchet that resolved a different file set per machine

Every one of them *worked*. None of them was *right*. When something here
surprises you, the question is not "is it broken" but **"what is this
actually pointing at, and did anything check?"**

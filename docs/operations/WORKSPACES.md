# Workspaces — one door

**Status: mechanism shipped, harness wiring pending.** This page documents
`scripts/lib/create-workspace.mjs` and the two hooks that call it
(`.claude/hooks/worktree-create.mjs`, `.claude/hooks/stamp-workspace.mjs`).
Both hooks exist on disk and are tested; **neither is wired into
`.claude/settings.json` yet** — that edit is deliberately deferred to a
separate PR (another change owns `.claude/settings.json`). Until it lands,
the harness's own `--worktree` / `isolation: "worktree"` / background-session
default still creates an ungoverned worktree under
`.claude/worktrees/<name>/`. The exact JSON to add is below.

## The problem this closes

Before this change, a worktree in this repo could be created three ways, and
only one of them was governed:

| Path | Governed? |
| --- | --- |
| `scripts/new-worktree.sh` | yes — budget, disk reserve, `--no-track`, marker |
| harness `--worktree` / `isolation: "worktree"` / background session | **no** |
| raw `git worktree add` | **no** |

The harness's own default bypasses every invariant this repo relies on: no
mutation-budget check, no disk-reserve check, no `.helm/workspace.json`
marker, and a location (`.claude/worktrees/<name>/`, inside the repo root)
that the nested-worktree check exists to flag. A subagent asking for
isolation got none of what a human running `new-worktree.sh` got for free.
Measured on this machine while writing this page: two such worktrees already
exist under `/Users/ricknini/Downloads/helmv3/.claude/worktrees/`, nested and
unmarked — `npm run repo:doctor` now reports them as FAIL
(`workspace.nested-worktrees`, `workspace.worktree-markers`) precisely
because they bypassed the door. `repo:doctor` is not a required CI check, so
this does not block anyone — but it will not go green on this machine until
those two are either stamped (see below) or removed.

## One module, every caller

`scripts/lib/create-workspace.mjs` exports `createWorkspace()`. Every entry
point calls it — none of them re-implements it:

```text
scripts/new-worktree.sh              CLI front door (thin — parses flags only)
.claude/hooks/worktree-create.mjs    the WorktreeCreate hook (once wired)
```

`createWorkspace({ name, base, install, home, repo })` does, in order,
failing loudly and refusing before allocating anything:

1. normalise `name` (slashes → dashes; empty refused)
2. refuse if the path or the branch `agent/<name>` already exists
3. **mutation budget** — `HELM_MAX_MUTATION_WORKTREES`, default **3**
   (`DEFAULT_MUTATION_BUDGET` in `scripts/lib/worktree-lifecycle.mjs`),
   reusing the same `inspectWorkspaces` / `mutationBudgetDecision` classifier
   `scripts/check-mutation-budget.mjs` always used
4. **disk reserve** — 12 GiB floor under the worktree home
   (`HELM_DISK_RESERVE_GIB`, falls back to the legacy `HELM_MIN_FREE_GIB`)
5. `git fetch origin --quiet` — a failure here is a **warning**, not a
   refusal; working from a stale `origin/main` is survivable, refusing
   because the network hiccuped is not
6. `git worktree add --no-track <path> -b agent/<name> <base>` — `--no-track`
   is load-bearing: without it the new branch inherits `base` as its
   upstream, and a bare `git push` later targets that ref instead of its own
7. writes `.helm/workspace.json` — `kind: task`, `parkPolicy:
   PARK_IF_REPRODUCIBLE` by default (`KEEP` only with `--keep`, since
   2026-09-06), `createdBy: "create-workspace.mjs"`, plus `task`/`branch`/
   `base`/`environment`/`supabase`/`productionWrites`/`createdAt`
8. **dependencies**: symlinks `node_modules` from the canonical checkout by
   default; `install: true` runs a real, isolated `npm ci` via
   `scripts/ensure-worktree-deps.mjs` instead
9. copies `.node-version` from the canonical checkout
10. writes a **local-only** `.env.local` — see below

Always under `~/worktrees/helmv3/<name>` (`HELM_WORKTREE_HOME`), never inside
the repo, and it never touches the canonical checkout's own `.env.local`.

### The node_modules symlink is a deliberate reversal

`scripts/new-worktree.sh`'s own history recorded, for cause, why the symlink
was replaced with a real per-worktree `npm ci`: two branches with different
lockfiles testing against whichever tree was installed last manufactures both
fake failures and fake passes. This change makes the symlink the **default
again**. That is an accepted, real hazard — not an oversight — because the
lesson only bites a worktree that actually runs tests against a lockfile that
might differ from the canonical checkout's. Most control-plane, docs, and
config work never runs a single test, and coupling every worktree to a
~3.8 GiB isolated install is what took this repo's disk to zero bytes free on
2026-08-29. The escape hatch is `install: true` / `--install`. Choose it for
any task that will run tests against a possibly-different lockfile.

### The `.env.local` this writes

Generated fresh every time, never copied from the canonical checkout:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase status -o env` if the local
                                stack is running at creation time, else
                                empty with a comment — this repo's
                                supabase/config.toml documents no default
                                local anon key to fall back to, and one is
                                never invented>
```

`SUPABASE_SERVICE_ROLE_KEY` is **deliberately absent**. A task workspace gets
no production write capability — see AGENTS.md's "Helm agent canonicality".

## The budget moved from 1 to 3, and two docs are now stale by exactly that amount

`DEFAULT_MUTATION_BUDGET` changed because the harness's own isolation paths
now count against it too: a session doing one task worktree plus two isolated
subagent checks is normal parallel work, and a budget sized for a single
human session would refuse it. `AGENTS.md` and `.claude/rules/autonomy.md`
both still say **"one mutation workspace at a time"** / "defaults to 1" —
those lines need this correction in their own PR:

```text
"One mutation workspace at a time." (AGENTS.md, autonomy.md)
  -> "Up to three mutation workspaces at a time." — HELM_MAX_MUTATION_WORKTREES
     defaults to 3 (scripts/lib/worktree-lifecycle.mjs), because a subagent
     with isolation: "worktree" now goes through the same door as a human
     running scripts/new-worktree.sh and therefore consumes the same budget.
```

## Budget, parking, retirement

Unchanged mechanism, just a different number:

```bash
npm run worktrees          # report — always safe
npm run worktrees:park     # remove disposable checkouts, KEEP branches
npm run worktrees:retire   # park + delete branches proven merged (exact OID)
```

See `scripts/lib/worktree-lifecycle.mjs` for the classifier and AGENTS.md's
"Helm agent canonicality" section for the ownership rules (`parkPolicy`, open
PR dispositions) that gate what an agent may do without asking.

## repo:doctor — what changed, and what it will report on this machine today

`scripts/repo-doctor/checks/workspace.mjs` now grades a worktree on two
**separate** axes — location and marker presence — because a marked
mis-placed worktree is at least accounted for, while an unmarked one (however
placed) is invisible to the mutation budget as anything but "counts, fails
safe":

| Situation | Check | Status |
| --- | --- | --- |
| nested, marker present | `workspace.nested-worktrees` | WARN |
| nested, no marker | `workspace.nested-worktrees` | FAIL |
| anywhere, no marker | `workspace.worktree-markers` | FAIL |
| canonical, no marker | `workspace.canonical-marker` | WARN (1) |
| canonical, `kind: canonical` | `workspace.canonical-marker` | PASS |

(1) gitignored and machine-local, so absence is expected on a fresh clone —
not a defect worth failing on.

`repo:doctor` is not a required CI check, so none of this blocks a PR. But it
will not go green on a machine that still has pre-door worktrees sitting
around. Two fixes, pick per worktree:

- **stamp it** — `.claude/hooks/stamp-workspace.mjs` does this automatically
  at SessionStart for whichever worktree is ACTIVE in that session (it cannot
  reach an idle one it isn't running from); or write the marker by hand:
  `{"kind":"task","parkPolicy":"PARK_IF_REPRODUCIBLE","createdBy":"manual"}` into
  `<worktree>/.helm/workspace.json`. For the **canonical checkout itself**
  (the WARN case, not FAIL), the equivalent is
  `{"kind":"canonical"}` written into `.helm/workspace.json` at the repo
  root — harmless to add since the file is gitignored, and it turns that WARN
  into a PASS.
- **remove it** — `git worktree remove <path>` if the work is done or
  reproducible from a pushed branch (prefer `npm run worktrees:park`, which
  makes that determination for you).

`config/repo/manifest.yml`'s `workspace:` block documents the same table.

## Hook wiring — the exact JSON to add to `.claude/settings.json`

Not applied by this change. When the owning PR edits `.claude/settings.json`,
add a `WorktreeCreate` top-level key:

```json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/worktree-create.mjs",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

and append one more entry to the existing `SessionStart` array's `hooks`
list (it currently runs `session-context.sh` and `init-session-state.mjs`;
this is a third, independent hook, not a replacement for either):

```json
{
  "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/stamp-workspace.mjs",
  "timeout": 10
}
```

`worktree-create.mjs` gets a longer timeout than the other hooks because it
does real work synchronously — a `git fetch`, a `git worktree add`, and
optionally an `npm ci` when the harness passes `install`-equivalent intent
(today it never does, so this always symlinks; see the module for how to
change that if the harness contract grows an install flag).

### Known interaction: harness exit-cleanup vs. this repo's own refusals

`parkPolicy` in the marker is **this repo's own convention** — read by
`scripts/lib/worktree-lifecycle.mjs`, not by the harness. Per the harness's
own worktree-lifecycle docs, an interactive `--worktree` session's exit
prompt, if the caller chooses to remove, "deletes the worktree directory and
its branch, along with all the work in them" — regardless of what
`.helm/workspace.json` says. So once `worktree-create.mjs` is wired in, a
human answering that exit prompt "yes" can delete an `agent/<name>` branch
that `worktree-lifecycle.mjs` would have refused to touch without a recorded
disposition. This is a **different** cleanup path from the periodic
subagent/background-session sweep — the harness docs say that sweep "keeps
any worktree without one [the harness's own git marker], including a
worktree a WorktreeCreate hook created," so the sweep is not the risk here.
Whoever wires this hook into `.claude/settings.json` should decide
consciously whether that interaction is acceptable as-is, rather than
discover it later.

## The one-line rule for AGENTS.md

Also deferred to the PR that edits AGENTS.md's canonicality section:

```text
Make a worktree through the door; it refuses when the budget or disk says so.
```

The "door" is `scripts/lib/create-workspace.mjs`, reached via
`scripts/new-worktree.sh` (humans) or the `WorktreeCreate` hook (the harness,
once wired). Nothing should call `git worktree add` directly.

## Tests

```bash
npx vitest run scripts/__tests__/create-workspace.test.ts
```

Covers: name normalisation and refusal, path/branch-exists refusal,
over-budget refusal, the marker's exact shape, the `node_modules` symlink,
`.env.local` never containing `SUPABASE_SERVICE_ROLE_KEY`, and the
`worktree-create.mjs` hook's stdout/exit-code contract (path-only on success,
nothing on stdout and exit 1 on refusal).

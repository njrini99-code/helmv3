---
verified: 2026-08-20  # every claim below re-checked against the guards, vercel.json, and prod this date
---

## Shipping — docs, git, bash, Supabase, Vercel

No `paths:`, so this loads every session. That is deliberate: these are the
traps that don't care which file you opened.

Everything here is either enforced by a `PreToolUse` guard in `.claude/hooks/`
or was learned by breaking something. **Guards are not suspended by permission
allow rules or by `bypassPermissions`** — they are the real safety layer, which
is what makes working fast here safe.

---

### 1. Documentation — the rot rule

An audit on 2026-08-19/20 found the knowledge base naming **59 database objects
that do not exist in production** and **file paths that do not resolve**
(current counts live in `.doc-schema-baseline.json` / `.doc-path-baseline.json`
— never in prose),
each rendered with full detail and formatted identically to the real ones. A
session that obeyed the docs produced fluent, confident, broken work. The fix is
mechanical, and these are the habits that keep it fixed.

- **Never write a count into prose.** Not "266 tables", not "41 action files",
  not "8 skills". Counts rot within weeks and a stale number reads as current
  forever. Put it in an `AUTOGEN` block or leave it out. `glossary.md` said
  "75 tables" for six months against a schema of 268; `golfhelm-database.md`'s
  header contradicted its own AUTOGEN block fifteen lines below.
- **Never document a table, column, or path you have not just verified.** Query
  it or `ls` it. "The migration exists in this repo" is *not* evidence the table
  is live — see trap G8 in `memory/context/baseballhelm-database.md`.
- **Run the gates before claiming a doc is correct:**
  `npm run docs:schema-drift` and `npm run docs:path-drift`. Both baseline to a
  known-bad count that may only go DOWN, and both fail CI on anything new.
- **A "DO NOT EDIT — regenerated" stamp is not evidence of correctness.** That
  exact stamp sat on an enum block that reported 6 of 18 enums for ~6 months
  because the generator's regex silently dropped the rest. Verify the generator,
  not the stamp.
- **A missing table does not mean a missing feature.** Recurring events are
  fully implemented on `golf_events.recurring` / `recurrence_rule` /
  `parent_event_id`; `golf_recurring_events` never existed. Check the code
  before concluding anything is absent.
- **Staleness markers must be a number, not a date.** "Re-verified 2026-08-15"
  reads as current for weeks after it stops being true. Record the anchor SHA
  and let the reader run `git rev-list --count <sha>..HEAD -- 'src/**'`.
- **Never bulk-repoint dead paths by basename search.** Tried; nearest-name
  matches were build artifacts under `src/.helmdev/`. That swaps a visibly
  broken path for a confidently wrong one.

### 2. Git and commits

- **Work on the currently checked-out branch; `main` is home.** Never switch
  branches or create worktrees unless asked; return to clean `main` only when
  the task is merged and verified — the resting-state policy is AGENTS.md's
  canonicality section, stated once there. **A push to `main` ships nothing** —
  `vercel.json` carries `"git": {"deploymentEnabled": {"*": false}}`, so no
  branch auto-deploys; production is an on-demand promote.
- **`git add <explicit paths>`. Never `git add -A`.** Every agent in this repo
  shares one working tree, one index, one `HEAD`. `-A` sweeps in whatever
  another agent has half-written.
- **Confirm the branch before editing:** `git rev-parse --abbrev-ref HEAD`. A
  parallel `git checkout` can move `HEAD` under you mid-edit.
- **Check a branch's upstream before pushing from it.** On 2026-08-20
  `overnight/remediation-2026-08-18` was configured `merge = refs/heads/main`,
  so `git push` from it targeted `main`. Verify:
  `git for-each-ref --format='%(refname:short) -> %(upstream:short)' refs/heads`
- **Worktrees go OUTSIDE the repo** (`../` or `~/worktrees/`), never
  `.worktrees/` inside it. `.gitignore` hides an internal one from git but
  `find`/`grep` still return it, so agents edit the copy nobody ships.
- **Prune worktrees by PR state, not `--merged`.** This repo squash-merges, so a
  merged branch never becomes an ancestor of `main` and `git branch --merged`
  never lists it.
- **Blocked by `guard-bash.sh`, deliberately:** `git push --force` (the only
  push shape still blocked — it is the sole guard on shared history),
  `git stash` (`refs/stash` is repo-global and shared across every worktree, so
  parallel agents steal each other's work), `git clean -f/-fd` (deletes
  untracked work that exists nowhere else; `-n`/`--dry-run` is allowed).
- Commit messages: explain **why**, and state what you verified. If a claim
  rests on something you could not run, say so once.

### 3. Bash

- **Never pipe a gate command.** `npm test | tail` exits with `tail`'s status,
  not the test's — it manufactures a green result. Blocked by `guard-bash.sh`.
  Capture to a file and check the exit code separately.
- **Recursive `rm` must stay inside the project or `$TMPDIR`.** Blocked
  elsewhere: `~/.claude/settings.local.json` allows `Bash(rm:*)` globally and an
  allow rule suspends both the prompt and the auto-mode classifier — the hook is
  the only thing left.
- **`rm -rf .next` is blocked.** It wedges Turbopack cold-compile for the rest
  of the session.
- **`timeout` does not exist on macOS.** `timeout 90 cmd` fails with "command
  not found" and every wrapped call reads as a failure. This produced a bogus
  "21 of 21 tests failing" result on 2026-08-20. Use `gtimeout` (coreutils) or
  no wrapper.
- **A `.ts`/`.tsx` logged as `Bin N -> M bytes` in a commit stat is a
  smell, not a formatting quirk.** git found a NUL byte and treated the
  source as binary, so the diff never rendered and the code was never
  actually reviewed. `src/lib/csv/safe-cell.ts` carried a literal NUL and a
  0x1f inside a regex character class exactly that way; `file` reported
  it as "data", and it took `no-control-regex` on a later lint run to
  surface it — on a branch that had never been gated. Check with
  `file <path>`: it should say "Unicode text", never "data". (2026-08-27.)
- **`ls` is aliased to `eza` here.** Scripted `ls` with flags it doesn't share
  errors out. Use `/bin/ls` in scripts.

### 4. Supabase

- **Production is a single SHARED database serving live users.** Golf and
  baseball are both in it. There is no staging copy.
- **MCP `apply_migration` / `execute_sql` hit production directly with
  `service_role`** — no file, no review, no RLS. Treat every call as a
  production write.
- **Blocked by the guards:** `supabase config push` (pushes the whole
  `config.toml`, including the dev `site_url` — would overwrite production's and
  break every auth email link), `supabase db reset` (drops and recreates from
  migrations), and destructive SQL through `psql` / `supabase db execute` /
  `db query` (which bypass `guard-sql.sh`'s file route entirely).
- `guard-sql.sh` blocks privilege escalation and destructive shapes on **both**
  routes — `.sql` file edits *and* MCP payloads. `DELETE FROM x;` with no
  `WHERE` is blocked.
- **Never grant `anon` EXECUTE** on a `SECURITY DEFINER` function, and never
  `GRANT ALL`. Recreating a matview or view **re-grants `anon`** — REVOKE after,
  then verify.
- **New table ⇒ RLS + policy in the same migration.** Enforced by the Review
  Gate.
- **Sport prefixes are load-bearing:** `golf_*`, `baseball_*`, `helm_lifting_*`.
  An unprefixed table name almost certainly does not exist.
- **"Recorded" ≠ "applied".** The migrations directory and the applied state
  have disagreed before. Verify against the live catalog, not the file list.

### 5. Vercel

- **Pushing does not deploy.** `deploymentEnabled: {"*": false}`. Production is
  an on-demand CLI promote. Any doc or comment claiming "production serves
  main" is stale.
- **One deploy per milestone.** Deploys cost real money; do not deploy
  incrementally to preview a change. Use GitHub Actions frames for visuals.
- **`vercel deploy` needs `--archive=tgz`** — there is a 15,000-file upload cap
  and this repo is over it.
- `.vercelignore` **replaces** the default ignore set; it does not extend it.
- Team-scoped and integration env vars **do not show in `vercel env ls`**. Its
  absence from that listing is not evidence a variable is unset.

---

**When one of these guards blocks you, it is not an obstacle to route around.**
Each one exists because the thing it blocks already cost this repo real work.

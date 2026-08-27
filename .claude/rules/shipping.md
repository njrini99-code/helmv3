---
verified: 2026-08-20  # every claim below re-checked against the guards, vercel.json, and prod this date
---

## Shipping — git, bash, production writes, deploys

No `paths:`, so this loads every session. That is deliberate, and the test is
narrow: **could this rule prevent a mistake made on a turn that opens no
files?** "Never pipe a gate" passes. "Never grant `anon` EXECUTE" does not — it
needs a `.sql` in play, so it lives in `database.md`.

Split on 2026-08-27. The documentation rot rule moved to
`.claude/rules/documentation.md` (`memory/**`, `docs/**`, `**/*.md`) and the SQL
authoring rules to `.claude/rules/database.md`. Both failed the test above.

Everything here is either enforced by a `PreToolUse` guard in `.claude/hooks/`
or was learned by breaking something. **Guards are not suspended by permission
allow rules or by `bypassPermissions`** — they are the real safety layer, which
is what makes working fast here safe.

---

### 1. Git and commits

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
- **A commit that "succeeded" is not a commit that contains what you meant.**
  `git show --stat` before you move on. On 2026-08-27 a `git add` hit a pathspec
  error on an already-`git rm`'d file, aborted the whole line, and produced a
  commit holding only a deletion while its message described a seven-file
  rewrite. It reported success. Two other near-misses that night were the same
  shape: a mechanical operation reporting success while doing something narrower
  than intended.
- Commit messages: explain **why**, and state what you verified. If a claim
  rests on something you could not run, say so once.

### 2. Bash

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

### 3. Production writes

Only the part you can trigger without opening a file. Everything about
authoring SQL — grants, RLS-with-the-migration, sport prefixes,
recorded-vs-applied — lives in `.claude/rules/database.md`, which loads on
`supabase/**`, any `.sql`, and `src/lib/supabase/**`.

- **Production is a single SHARED database serving live users.** Golf and
  baseball are both in it. There is no staging copy.
- **MCP `apply_migration` / `execute_sql` hit production directly with
  `service_role`** — no file, no review, no RLS. Treat every call as a
  production write. This bullet is always-on precisely because an MCP call
  opens no file, so a path-scoped warning would load after the damage.
- **Blocked by the guards:** `supabase config push` (pushes the whole
  `config.toml`, including the dev `site_url` — would overwrite production's and
  break every auth email link), `supabase db reset`, and destructive SQL through
  `psql` / `supabase db execute` / `db query`, which bypass `guard-sql.sh`'s
  file route entirely.
- `guard-sql.sh` covers **both** routes — `.sql` file edits *and* MCP payloads.
  `DELETE FROM x;` with no `WHERE` is blocked.

### 4. Deploys

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

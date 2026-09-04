---
verified: 2026-08-20  # every claim below re-checked against the guards, vercel.json, and prod this date
---

## Shipping — docs, git, bash, Supabase, Vercel

No `paths:`, so this loads every session. That is deliberate: these are the
traps that don't care which file you opened.

Everything here was either learned by breaking something or is enforced by
configuration — and **which one applies is not something this file should be
trusted to tell you.** `docs/CONTROL_PLANE_ENFORCEMENT.md` is regenerated from
`.claude/settings.json` and the hook scripts on disk, and resolves each safety
claim to a mechanism, a config location, and how it was observed. Three claims
in these rules turned out to be false on 2026-08-29 — all about irreversible
operations, all confident — which is why enforcement is no longer asserted in
prose here.

What IS true and load-bearing: `permissions.deny` rules and the one wired
`PreToolUse` guard are not suspended by permission allow rules or by
`bypassPermissions`. That is the real safety layer. It is also much smaller
than this file used to imply.

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

### 1b. Agent settings ownership

- **`autoMemoryEnabled` must be `false` for Helm work, and
  `.claude/settings.json` sets it.** Measured 2026-09-04 the invariant is
  VIOLATED: `~/.claude/settings.json` sets the same key to `true`. Which
  scope wins for this key is UNVERIFIED — the project-deny-over-user-allow
  precedence proven in §4 is the PERMISSIONS resolver and does not
  generalise, and the enforcement inventory reads project config only. Clear
  the user-scope key rather than reasoning about precedence. That is an OWNER
  action: user scope affects every project and any concurrent session, so an
  agent reports this rather than editing it.
- The reason is not that auto-memory is bad. It is that this repo already has
  an explicit Git-backed memory architecture — `memory/registry.yml`,
  `memory/features/**`, `memory/ledgers/**`, `memory/incidents/**`,
  `memory/decisions/**` — which is visible, version-controlled, reviewable and
  portable. A machine-local store that can disagree with committed state is a
  second authority for engineering truth. One authority.
- **`.claude/settings.json` is version-controlled, so a `git checkout` can
  change agent behaviour.** That is a real hazard, not a hypothetical: on
  2026-08-27 this key read `true` on one local branch and `false` on two
  others. If you see agent behaviour change after switching branches, diff this
  file first.

### 1c. The canonical checkout boundary — what is actually enforced

- **`AGENTS.md` owns workspace and concurrency policy. This section owns only
  what is mechanically enforced.** Two lines in this file used to answer the
  same question differently — "All mutating agent work begins in a task
  worktree" here, and "Never switch branches or create worktrees unless asked"
  in §2 — while AGENTS.md carried the actual rule: one active session may work
  in canonical directly; concurrent sessions each take a worktree. Two rules for
  one decision means neither is followed. The policy is stated once, there.
- **What is enforced here is narrow, and it is a rule, not a mechanism:**

  | Route into canonical | Blocked? | By what |
  | --- | --- | --- |
  | `Write` / `Edit` / `MultiEdit` | **yes** | `guard-canonical-write.mjs` |
  | `Bash` — redirection, `cp`, `mv`, `python3`, a formatter | **no** | nothing |

- Measured 2026-08-27: the hook is wired under matcher `Write|Edit|MultiEdit`,
  a regex over the TOOL NAME, so it never executes for `Bash`; and a Bash
  payload carries `command`, not `file_path`, so it would exit 0 even if it
  did. End to end, `echo > <canonical>/src/…ts` from Bash created the file.
- **Under `bypassPermissions`, Bash is the instructed default for file
  changes.** The unguarded route is the normal one, not an edge case.
- **Do not close this with a Bash command parser.** That architecture was
  deleted for cause: it refused an `echo`, a `grep` and a commit message for
  containing the words of a blocked command, and its read-only exemption was
  bypassable through `$(...)`. A regex does not understand shell semantics.
- **The structural option, for the owner.** `sandbox.filesystem` can deny
  writes by PATH at the OS level, which covers Bash-spawned processes without
  parsing. It is currently `disabled: true` in `~/.claude/settings.json`, which
  is why the probe above succeeded. Enabling it is user-global — it affects
  every project and could break a concurrent session — so it is an owner
  decision, not an agent one.

### 2. Git and commits

- **Confirm the branch, then work on it; `main` is home.** Return to clean
  `main` only when the task is merged and verified. Whether a task takes a
  worktree or the canonical checkout is AGENTS.md's call, not this file's — its
  canonicality section is where that policy is stated, once.
  **A push to `main` ships nothing** —
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
- **Make worktrees with `scripts/new-worktree.sh <task>`.** It is the one
  supported path: `~/worktrees/helmv3/<task>`, `--no-track`, a known base.
  It does NOT install dependencies — this read "isolated dependencies" until
  2026-09-04, while the script itself prints `not installed — run: node
  scripts/ensure-worktree-deps.mjs <dir>` and AGENTS.md says so outright. An
  agent that trusted the old wording and ran `npm test` got a bare checkout.
  Never `.worktrees/` inside the repo — `.gitignore` hides an
  internal one from git but `find`/`grep` still return it, so agents edit the
  copy nobody ships.
- **Prune with `npm run worktrees{,:park,:retire}`, never by hand.** This repo
  squash-merges, so a merged branch never becomes an ancestor of `main` and
  `git branch --merged` never lists it — which is why the tool keys on PR state
  and an exact head OID. Since 2026-08-30 it also refuses to park a checkout
  whose branch has an OPEN PR unless `config/open-pr-dispositions.json` records
  `worktree_policy: PARK_IF_REPRODUCIBLE` for it. AGENTS.md states the policy;
  `scripts/worktree-lifecycle.mjs` is the mechanism.
- **No hook blocks git commands any more.** `guard-bash.sh` was deleted
  2026-08-27 after being unwired; it protected nothing while it sat there.
  What remains, and is PROVEN to fire even under `bypassPermissions`, is
  `permissions.deny` in `.claude/settings.json`. How many rules, and what
  each one covers, is a count that belongs in the generated
  `docs/CONTROL_PLANE_ENFORCEMENT.md`, not here — this line said "29" while
  the file held 32, and a number in prose reads as current forever. Force
  push and `git clean -fd` are no longer blocked locally; GitHub's own
  `allow_force_pushes: false` still refuses the remote.
- **`git stash` is not blocked.** Worth knowing anyway: `refs/stash` is
  repo-global, so a stash pushed in one worktree is visible and poppable from
  every other one. One task, one worktree, one mutating session is what
  addresses that.
- Commit messages: explain **why**, and state what you verified. If a claim
  rests on something you could not run, say so once.

### 3. Bash

- **Never pipe a gate command.** `npm test | tail` exits with `tail`'s status,
  not the test's — it manufactures a green result. Nothing blocks this any
  more; it is on you to notice.
  Capture to a file and check the exit code separately.
- **Recursive `rm` is UNENFORCED — keep it inside the project or `$TMPDIR`
  yourself.** `~/.claude/settings.local.json` allows `Bash(rm:*)` globally, an
  allow rule suspends both the prompt and the auto-mode classifier, and the hook
  that used to be "the only thing left" no longer exists. No `permissions.deny`
  rule covers `rm` either. Nothing will stop you.
- **`rm -rf .next` is NOT blocked** — avoid it because it wedges Turbopack
  cold-compile for the rest of the session, not because anything refuses it.
  (Both of these lines claimed enforcement until 2026-08-29;
  `docs/CONTROL_PLANE_ENFORCEMENT.md` now resolves them against live config.)
- **`timeout` does not exist on macOS.** `timeout 90 cmd` fails with "command
  not found" and every wrapped call reads as a failure. This produced a bogus
  "21 of 21 tests failing" result on 2026-08-20. Use `gtimeout` (coreutils) or
  no wrapper.
- **zsh eats `:r`, `:h`, `:t`, `:e` after a variable.** `"refs/heads/$b:refs/heads/$b"`
  becomes `refs/heads/recovered/stash-0efs/heads/recovered/stash-0` — zsh reads
  `$b:r` as the `:r` history modifier. `git push` then reports
  `src refspec ... does not match any` for a ref that resolves fine, and the
  same command typed literally works, so it reads as a git problem. Seven
  branch pushes failed this way on 2026-08-30. Use `git push origin "$b"`, or
  `${b}` followed by a literal colon.
- **`npm run dev` inside the Bash sandbox does not work, and it fails while
  looking healthy.** Measured 2026-09-04: a flood of
  `Watchpack Error (watcher): Error: EMFILE: too many open files, watch`
  (with `ulimit -n` reporting 1048576, so this is the sandbox's own limit, not
  the shell's), then a loop of

  ```text
  ⨯ The directory at ".next/dev" was deleted. ... Restarting the server to recover...
  ▲ Next.js — Local: http://localhost:3000 — ✓ Ready in 133ms
  ```

  The log says READY. `curl localhost:3000` says `(52) Empty reply from
  server`, then `(7) Failed to connect`. The obvious diagnosis is a second dev
  server fighting over `.next/` — check `lsof -a -p <pid> -d cwd` before
  believing it; on that date the other two `next` processes were in
  `~/worktrees/helmv3/controlplane-d` with their own `.next`, and were
  innocent. Run it with `dangerouslyDisableSandbox: true` and it is ready in
  158ms and answers 200. **`curl` the server before reporting it as running** —
  the log alone cannot distinguish the two cases.
- **`ls` is aliased to `eza` here.** Scripted `ls` with flags it doesn't share
  errors out. Use `/bin/ls` in scripts.

### 4. Supabase

- **Production is a single SHARED database serving live users.** Golf and
  baseball are both in it. There is no staging copy.
#### Two production paths, and they are not the same risk

Do not collapse these. An earlier version of this section did, and overstated
the MCP one.

**Path 1 — the Supabase MCP server.** `.mcp.json` declares exactly one server
*in this repo*, pointed at the production project and carrying `read_only=true`:

```text
https://mcp.supabase.com/mcp?project_ref=<prod>&read_only=true
```

- `execute_sql` — a write against production is *expected* to be rejected by
  the read-only database role. That is the configuration's intent.
- `apply_migration` — **behaviour under `read_only=true` is UNVERIFIED here.**
  Do not assume it is available, and do not assume it is blocked. Verify before
  relying on either, and record what you observed.

Never edit `read_only=true` out of `.mcp.json` to make something work.

**Which MCP namespace is authoritative, what it is connected to, and what it is
allowed to do are GENERATED, not written here.**

    docs/TOOL_AUTHORITY_MATRIX.md          per-service authority + evidence
    docs/CONTROL_PLANE_ENFORCEMENT.md      what is actually enforced
    config/control-plane-gaps.json         what is knowingly not
    npm run control-plane:verify           whether any of it has drifted

Those are rebuilt from `.claude/settings.json`, `.mcp.json` and recorded
observations, and each observation carries a fingerprint of the configuration
that produced it — change a deny rule and the matching EXERCISED claim goes
STALE by itself. A table of namespaces and connection states used to live in
this section. It is gone on purpose: prose cannot notice a mechanism being
deleted, which is the failure this whole file keeps recording.

What stays here is the part no generator can derive — policy and the reasons
behind it:

- **Never edit `read_only=true` out of `.mcp.json`** to make something work.
- **The sanctioned path's OAuth grant requests only `:read` scopes** —
  organizations, projects, database, analytics, secrets, edge_functions,
  environment, storage. That is connector-enforced read-only, observable
  without any write probe, and it is why `apply_migration` on that namespace
  may not function as granted. Do not resolve that by attempting a production
  migration.
- **Arbitrary SQL through the account connector is UNENFORCED**, deliberately
  and temporarily. It is the only working query path; `DELETE FROM x;` through
  it reaches production and nothing intercepts it. Registered as
  `SUPABASE_ARBITRARY_SQL_UNENFORCED`, not described as safe.
- **No hook sees an MCP call.** The only `PreToolUse` hook matches
  `Write|Edit|MultiEdit`, a regex over the TOOL NAME. Permission rules are the
  entire MCP defence — which is why deny rules, not a hook, are where this is
  enforced.
- **A project-scope DENY overrides a user-scope ALLOW**, mid-session, proven by
  probe rather than assumed.
- **User-scope grants are not edited from this repo.** They affect every
  project and any concurrent session.

**`.mcp.json` is not the list of MCP tools you have.** It is the list this REPO
declares. Account-level connectors add more and appear in no file here — check
your own tool inventory rather than inferring it from this directory. That
distinction cost two days: this section once said "`.mcp.json` declares exactly
one server", true of the file and read as "one MCP server exists", while an
authenticated Sentry MCP sat available the whole time.

**The Sentry MCP is the working read path for Sentry.** Org slug `helm-xs`.
`find_organizations`, `search_issues`, `search_events` (grouped aggregates —
`field=feature&field=level&field=count_unique(issue)` replaced an 85-request
fanout with one query).

**The Sentry credentials in `.env.local` are real since 2026-09-03.** The owner issued a user auth token with org-admin scopes (`SENTRY_AUTH_TOKEN`), and `SENTRY_ORG=helm-xs` / `SENTRY_PROJECT=javascript-nextjs` are the real slugs, so direct REST calls and `src/lib/admin/sentry-api.ts` reads work locally. The MCP remains the read path that needs no secret. Until that date the three values were 11-character placeholders that passed `usableSecret()` and made every local Sentry read fail soft — if a read fails with `401 Invalid token` again, check whether the token was rotated (it was pasted in chat once and is due for rotation) before debugging code. Control-plane edits (detectors, workflows, uptime, snapshots) are documented in `docs/operations/SENTRY_MONITORS.md`.

**Path 2 — direct database credentials.** `psql`, `supabase db execute`,
`supabase db query`, and anything else holding
`SUPABASE_SERVICE_ROLE_KEY` / `HELM_PROD_POSTGRES_PASSWORD` /
`HELM_PROD_DB_URL_DIRECT` from `.env.local`. These carry write capability and
**nothing intercepts them** — `guard-sql.sh` was deleted 2026-08-27, and it had
been unwired before that, so this describes what was already true rather than a
new gap. `DELETE FROM x;` with no `WHERE` reaches production if you type it.

This is the path that needs your attention. It is also why `.worktreeinclude`
withholds the `.env.local` family from worktrees.

**Blocked by `permissions.deny`**, proven to fire even under
`bypassPermissions`: `supabase config push` (pushes the whole `config.toml`,
including the dev `site_url` — would overwrite production's and break every
auth email link), `supabase db reset` (drops and recreates from migrations),
and `supabase db push` / `migration up`. Which SPELLINGS each is denied under
is what matters, because the bare `supabase` binary does not resolve on this
machine (`npm run doctor` says so) — only `./node_modules/.bin/supabase` and
`npx supabase` actually run. Until 2026-09-01 `config push` and `db reset`
were denied in the bare spelling only, i.e. the one that cannot execute, while
this line said "each in four spellings". The rule count and spellings live in
`docs/CONTROL_PLANE_ENFORCEMENT.md` ("The Supabase CLI migration path is
refused"), which is regenerated from the file that enforces them.
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
- **`vercel deploy` needs `--archive=tgz`.** The 15,000-file upload cap is
  real, and this repo blew through it twice — 48,139 files on 2026-08-03 and
  19,795 on 2026-08-09. It is **no longer over it**: measured 2026-08-31 the
  upload is 5,712 files / 101 MB, because `.vercelignore` grew to cover the
  directories those rejections named. Keep `--archive=tgz` anyway; it is also
  what avoids the 10 MB request-body limit that stalled a promote.
  (This line read "and this repo is over it" until 2026-08-31. A count in prose
  outlived the condition it described — §1's own rule, in §5.)
- `.vercelignore` **replaces** the default ignore set; it does not extend it.
  This is the single most expensive line in this section. Every deploy failure
  above was the same mechanism: a directory `.gitignore` excluded, uploaded
  anyway, because the moment `.vercelignore` exists Vercel consults it INSTEAD.
  A new untracked tooling directory is therefore a new upload, silently.
- Team-scoped and integration env vars **do not show in `vercel env ls`**. Its
  absence from that listing is not evidence a variable is unset.
- **Never let a reader hang up on the Vercel CLI mid-output.** The 2026-09-02
  promote deployed fine and then died with a bare exit 134 in
  `vercel inspect ... 2>&1 | awk '/id/ {print $2; exit}'`. The CLI prints every
  row to stderr; awk closed the pipe at the second one; the CLI's next write
  got EPIPE and it allocated until V8 aborted ~90 s later (SIGABRT), which
  `pipefail` + `set -e` turned into a dead script and an unwritten release
  marker. Capture the whole output into a variable, then parse it.
  `scripts/deploy-prod.sh` carries the mechanism and
  `scripts/__tests__/deploy-prod-verify.test.ts` pins it.

---

**When one of these guards blocks you, it is not an obstacle to route around.**
Each one exists because the thing it blocks already cost this repo real work.

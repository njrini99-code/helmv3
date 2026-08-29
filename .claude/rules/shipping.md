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

- **Helm project scope owns `autoMemoryEnabled`, and the value is `false`.**
  `.claude/settings.json` is authoritative; do not set this key in user scope
  for Helm work, and do not flip it per branch.
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

- **The canonical checkout is the control tower.** All mutating agent work
  begins in a task worktree: `scripts/new-worktree.sh <task>`.
- **That is a rule, not a mechanism.** State the narrow truth:

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
- **Make worktrees with `scripts/new-worktree.sh <task>`.** It is the one
  supported path: `~/worktrees/helmv3/<task>`, `--no-track`, isolated
  dependencies. Never `.worktrees/` inside the repo — `.gitignore` hides an
  internal one from git but `find`/`grep` still return it, so agents edit the
  copy nobody ships.
- **Prune worktrees by PR state, not `--merged`.** This repo squash-merges, so a
  merged branch never becomes an ancestor of `main` and `git branch --merged`
  never lists it.
- **No hook blocks git commands any more.** `guard-bash.sh` was deleted
  2026-08-27 after being unwired; it protected nothing while it sat there.
  What remains, and is PROVEN to fire even under `bypassPermissions`, is
  `permissions.deny` in `.claude/settings.json` — 29 prefix rules. Force push
  and `git clean -fd` are no longer blocked locally; GitHub's own
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

**Three Supabase MCP namespaces exist; exactly one answers, and it is not the
sanctioned one.** Measured 2026-08-29:

| Namespace | Scope | Connected |
| --- | --- | --- |
| `mcp__supabase__*` (this repo's `.mcp.json`) | project-scoped, `read_only=true` | **no** — only `authenticate` exposed |
| `mcp__plugin_supabase_supabase__*` | a plugin that is **not installed** | **no** |
| `mcp__claude_ai_Supabase__*` (account connector) | **whole account** | **yes** |

`list_organizations` succeeds through the account connector, so it is not
project-scoped. Its ten project-mutating tools — `apply_migration`,
`create_project`, `pause_project`, `restore_project`, `deploy_edge_function`,
and the five branch verbs — are now in `permissions.deny` in
`.claude/settings.json`. Its read tools are deliberately kept: it is the only
Supabase MCP that works.

**`execute_sql` on that connector is NOT denied, and that is a gap, stated
rather than closed.** It is the working query path and the owner may use it
daily; it also carries no `read_only=true`, so `DELETE FROM x;` through it
reaches production and nothing intercepts it. Denying it would remove the
capability, not make it safe.

**The permission asymmetry this closed.** The CLI migration path is denied in
four spellings (`db push`, `migration up`, `db reset`, `config push`). Before
this, **zero** deny rules mentioned `mcp__`, while six ALLOW rules granted
`apply_migration`/`execute_sql` across all three namespaces — and an allow rule
suspends both the prompt and the auto-mode classifier. Two of those six named
`mcp__plugin_supabase_supabase__*`, a plugin that does not exist on this
machine: a standing pre-authorization that would activate the moment anyone
installed it.

**No hook sees an MCP call.** The only `PreToolUse` hook is
`guard-canonical-write.mjs` under matcher `Write|Edit|MultiEdit`, a regex over
the TOOL NAME. Nothing in `.claude/hooks/` matches `mcp__`. Permission rules
are the entire MCP defence — which is why the deny list, not a hook, is where
this was fixed.

**Precedence, proven here rather than assumed:** a project-scope DENY overrides
a user-scope ALLOW, and it takes effect mid-session. Probe: denying the
read-only `list_projects` at project scope, while it was ALLOW in three
user-scope places, removed it from the tool set — while `list_organizations` on
the same server still answered, proving the server was connected and the deny
is what bit. A second probe (`Bash(echo …)`) confirmed hot reload. The real
rules were then verified the same way: exactly the ten denied tools vanished;
`list_tables` still loaded.

**The six ALLOW rules live in user scope** (`~/.claude/settings.json`,
`~/.claude/settings.local.json`) and are NOT edited from here — user-global,
affecting every project and any concurrent session. Same boundary as
`sandbox.filesystem`. The project-scope deny is what neutralises them for Helm.

**`.mcp.json` is not the list of MCP tools you have.** It is the list this REPO
declares. Account-level connectors add more, and they do not appear in any file
here — check your own tool inventory rather than inferring it from this
directory. That distinction cost two days on 2026-08-29: this section said
"`.mcp.json` declares exactly one server", which is true of the file and was
read as "one MCP server exists". A Sentry MCP was authenticated and available
the entire time while ET-4 sat blocked on "we cannot reach Sentry without a
token".

**The Sentry MCP is the working read path for Sentry.** Org slug `helm-xs`.
`find_organizations`, `search_issues`, and `search_events` (which does grouped
aggregates — `field=feature&field=level&field=count_unique(issue)` is how ET-4
replaced an 85-request fanout with one query). Use it for evidence and for
answering questions about response shape.

**The Sentry credentials in `.env.local` are NOT usable.** Measured 2026-08-29:
`SENTRY_READ_TOKEN` and `SENTRY_AUTH_TOKEN` are 11-character placeholders and
`SENTRY_ORG` is not the real slug, so a direct REST call returns
`HTTP 401 {"detail":"Invalid token"}`. They still pass `usableSecret()` in
`src/lib/admin/sentry-api.ts` (>= 10 chars, no placeholder pattern), so
`config()` treats Sentry as CONFIGURED and every local Sentry read fails soft
and silently. Production is unaffected. Do not spend time debugging local
Sentry reads — they cannot work; use the MCP.

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
and `supabase db push` / `migration up`, each in four spellings.
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

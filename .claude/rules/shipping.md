<!-- markdownlint-disable MD022 MD012 -->
## Shipping — docs, git, bash, Supabase, Vercel
Loads every session. `docs/CONTROL_PLANE_ENFORCEMENT.md` is the live
authority on what is enforced — check it before believing any claim here.
`permissions.deny` and the wired `PreToolUse` hooks are real and survive
`bypassPermissions`: `guard-canonical-write.mjs` (Write/Edit/MultiEdit into
canonical), `guard-git.mjs` (dangerous Bash git/gh/vercel commands),
`guard-sql.mjs` (destructive SQL to Supabase MCP or Bash psql/supabase-db),
`guard-config-change.mjs` (a config-surface change without
`HELM_CONFIG_EDIT=1`) — each is text/path matching, not a parser; see its
own header for what it misses. Nothing else here is mechanically enforced.

**The canonical checkout boundary is a table, not an absolute**: the three
editing tools are blocked; a Bash redirect, `cp`, `mv` or formatter writing
the same bytes is not. Do not close this with a Bash command parser (deleted
for cause); the structural fix is `sandbox.filesystem`, disabled, owner's call.

### Docs

- Never write a count into prose — put it in an AUTOGEN block, a baseline
  file, or leave it out. Never document a table/column/path you have not
  just verified; run `npm run docs:schema-drift` / `docs:path-drift` first.
- A "DO NOT EDIT — regenerated" stamp is not proof; verify the generator.
  Staleness markers are a SHA or a ratchet count, never a bare date. Never
  bulk-repoint dead paths by basename search.
- Rules files state current behavior only; history belongs in
  `memory/incidents/`. `npm run docs:rules-current` enforces this.

### Git

- `git add <explicit paths>`, never `-A` — the tree is shared. Confirm the
  branch (`git rev-parse --abbrev-ref HEAD`) and a branch's upstream before
  pushing (`git for-each-ref --format='%(refname:short) -> %(upstream:short)'
  refs/heads`) — a stray `merge = refs/heads/main` makes a plain push main.
- Worktrees only via `scripts/new-worktree.sh`; prune only via `npm run
  worktrees{,:park,:retire}`. A deleted branch is tagged `archive/<branch>` first.
- `autoMemoryEnabled` is `false`, in `.claude/settings.json`; `memory/` is
  the only memory this repo uses.
- `npm install` wires a `pre-push` hook (`.githooks/`, `scripts/setup-hooks.mjs`
  via `prepare`) that runs the cheap checks scoped to changed files; see
  `docs/CI_RUNBOOK.md`'s "Before you push".

### Bash

- Never pipe a gate command — capture to a file, check the exit code.
  `timeout` does not exist on macOS (`gtimeout` or none); `ls` is aliased to
  `eza`, use `/bin/ls` in scripts.
- zsh reads `$var:r`/`:h`/`:t`/`:e` as history modifiers — write
  `git push origin "$b"`, never a bare variable glued to a `:`.
- `npm run dev` in the Bash sandbox floods EMFILE and logs "Ready" while
  serving nothing — use `dangerouslyDisableSandbox: true` and `curl` it first.
- Recursive `rm` is UNENFORCED, and so is force push; scope them yourself.
- `gh` and any GitHub call need `dangerouslyDisableSandbox: true`; a background
  shell cannot reach GitHub, so check-polling loops run unsandboxed too.

### Supabase and MCP

- Production is one shared database (Golf + Baseball + Lift Lab), no staging
  copy. Sport prefixes are load-bearing: `golf_*`, `baseball_*`,
  `helm_lifting_*`. New table ⇒ RLS + policy in the same migration.
- Never `GRANT ... TO anon/PUBLIC`; pair every `SECURITY DEFINER` with a
  `REVOKE EXECUTE ... FROM PUBLIC, anon`, re-revoked after recreating a
  view. "Recorded" ≠ "applied" — verify against `information_schema`.
- `.mcp.json` declares exactly one server *in this repo* (Supabase,
  production project, `read_only=true`; never edit that flag out) — not the
  full tool list, since account-level connectors add more and appear in no
  file here. The account-wide connector's mutators are denied by UUID in
  `permissions.deny` (spellings in `docs/CONTROL_PLANE_ENFORCEMENT.md`); its
  `execute_sql` is unenforced; the sanctioned namespace per service is the
  generated `docs/TOOL_AUTHORITY_MATRIX.md`.
- The Sentry MCP (`helm-sentry` skill) is the working read path (org
  `helm-xs`). A `401 Invalid token` means rotate it, not gone.

### Vercel

- Pushing does not deploy — the git integration is disconnected; production
  ships only through `scripts/deploy-prod.sh` (enforces the deploy budget).
- `vercel deploy` needs `--archive=tgz`; `.vercelignore` REPLACES the
  default ignore set; team-scoped env vars don't show in `vercel env ls`.

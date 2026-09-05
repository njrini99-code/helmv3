<!-- markdownlint-disable MD022 MD012 -->
## Shipping — docs, git, bash, Supabase, Vercel
Loads every session. `docs/CONTROL_PLANE_ENFORCEMENT.md` is the live
authority on what is enforced — check it before believing any claim here.
`permissions.deny` and the one wired `PreToolUse` hook (`guard-canonical-write.mjs`,
refusing `Write`/`Edit`/`MultiEdit` into the canonical checkout) are real and
survive `bypassPermissions`. Nothing else here is mechanically enforced.

**The canonical checkout boundary is a table, not an absolute**: the three
editing tools are blocked; a Bash redirect, `cp`, `mv` or formatter writing
the same bytes is not. Do not close that with a Bash command parser (deleted
for cause: it refused an `echo` and `$(...)` bypassed it). The structural fix
is `sandbox.filesystem`, currently disabled — owner's call.

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
  branch before editing (`git rev-parse --abbrev-ref HEAD`) and a branch's
  upstream before pushing (`git for-each-ref --format='%(refname:short) ->
  %(upstream:short)' refs/heads`) — a stray `merge = refs/heads/main`
  makes a plain push target main.
- Worktrees only via `scripts/new-worktree.sh` (the one door); prune only
  via `npm run worktrees{,:park,:retire}`. A deleted branch is preserved as
  an `archive/<branch>` tag first.
- `autoMemoryEnabled` is `false`, set only in `.claude/settings.json`;
  `memory/` is the only memory this repo uses.

### Bash

- Never pipe a gate command — capture to a file, check the exit code.
  `timeout` does not exist on macOS (`gtimeout` or none); `ls` is aliased
  to `eza`, use `/bin/ls` in scripts.
- zsh reads `$var:r`/`:h`/`:t`/`:e` as history modifiers — write
  `git push origin "$b"`, never a bare variable glued to a `:`.
- `npm run dev` inside the Bash sandbox floods EMFILE and logs "Ready" while
  serving nothing — run it with `dangerouslyDisableSandbox: true` and `curl`
  it before reporting it up.
- Recursive `rm` and force push are UNENFORCED; scope them yourself.

### Supabase and MCP

- Production is one shared database (Golf + Baseball + Lift Lab), no staging
  copy. Sport prefixes are load-bearing: `golf_*`, `baseball_*`,
  `helm_lifting_*`. New table ⇒ RLS + policy in the same migration.
- Never `GRANT ... TO anon/PUBLIC`; pair every `SECURITY DEFINER` with a
  `REVOKE EXECUTE ... FROM PUBLIC, anon`, re-revoked after recreating a
  view. "Recorded" ≠ "applied" — verify against `information_schema`.
- `.mcp.json` declares exactly one server *in this repo* (Supabase,
  production project, `read_only=true`; never edit that flag out). It
  is not the list of MCP tools you have: account-level connectors add more
  and appear in no file here. The account-wide connector is the connected
  query path today — its mutators are denied by UUID in `permissions.deny`
  (exact spellings in `docs/CONTROL_PLANE_ENFORCEMENT.md`), its
  `execute_sql` is an unenforced production write path — and the sanctioned
  namespace per service comes from the generated `docs/TOOL_AUTHORITY_MATRIX.md`.
- The Sentry MCP is the working Sentry read path (org `helm-xs`). A `401
  Invalid token` from the `.env.local` token means rotate it, not that the
  path is gone — `usableSecret()` checks shape only, so a placeholder passes.

### Vercel

- Pushing does not deploy — the git integration is disconnected; production
  ships only through `scripts/deploy-prod.sh`, which enforces the deploy budget.
- `vercel deploy` needs `--archive=tgz`; `.vercelignore` REPLACES the default
  ignore set; team-scoped env vars do not show in `vercel env ls`. Capture CLI
  output to a variable before parsing it — never pipe it into a reader.

<!-- markdownlint-disable MD022 MD012 -->
## Shipping — docs, git, bash, Supabase, Vercel
Loads every session. `docs/CONTROL_PLANE_ENFORCEMENT.md` is the live
authority on what is actually enforced — check it before believing any
enforcement claim here, including this one. `permissions.deny` and the one
wired `PreToolUse` hook (`guard-canonical-write.mjs`, refusing
`Write`/`Edit`/`MultiEdit` into the canonical checkout) are real and
survive `bypassPermissions`. Nothing else in this file is mechanically
enforced — treat the rest as discipline, not a safety net.

**The canonical checkout boundary is a table, not an absolute**:
`Write`/`Edit`/`MultiEdit` into canonical is blocked; a Bash redirect,
`cp`, `mv`, or formatter writing the same bytes is not.
Do not close this with a Bash command parser — that shape was deleted for
cause (refused an `echo` for containing a blocked word; `$(...)` bypassed
it anyway). `sandbox.filesystem` is the structural fix, disabled, owner's call.

### Docs
- Never write a count into prose (tables, scripts, checks, branches) — put
  it in an AUTOGEN block, a baseline file, or leave it out. Never document
  a table/column/path you haven't just verified — query or `ls` it, and
  run `npm run docs:schema-drift` / `docs:path-drift` first.
- A "DO NOT EDIT — regenerated" stamp is not proof of correctness; verify
  the generator, not the stamp. Staleness markers are a SHA or a ratchet
  count, never a bare date. Never bulk-repoint dead paths by basename
  search — nearest-name matches can be build artifacts.
- Rules files state current behavior only; history belongs in
  `memory/incidents/`. `npm run docs:rules-current` enforces this.

### Git
- `git add <explicit paths>`, never `-A` — the tree is shared. Confirm the
  branch before editing (`git rev-parse --abbrev-ref HEAD`), and check a
  branch's upstream before pushing (`git for-each-ref --format=
  '%(refname:short) -> %(upstream:short)' refs/heads`) — a stray
  `merge = refs/heads/main` makes a plain push target main.
- Worktrees only via `scripts/new-worktree.sh` — the one door; prune only
  via `npm run worktrees{,:park,:retire}`, never by hand. A deleted branch
  is preserved as an `archive/<branch>` tag first.
- `autoMemoryEnabled` is `false`, set only in `.claude/settings.json`;
  there is no auto-memory directory — `memory/` is the only memory this
  repo uses.

### Bash
- Never pipe a gate command — capture output to a file and check the exit
  code separately. `timeout` doesn't exist on macOS; use `gtimeout` or no
  wrapper. `ls` is aliased to `eza` here; use `/bin/ls` in scripts.
- zsh reads `$var:r`/`:h`/`:t`/`:e` as history modifiers — use
  `git push origin "$b"`, never a literal `:` glued to a bare variable.
- `npm run dev` inside the Bash sandbox floods EMFILE and logs "Ready"
  while serving nothing — run with `dangerouslyDisableSandbox: true` and
  `curl` it before reporting it up.
- Recursive `rm` is UNENFORCED, and neither is force push — scope them
  yourself.

### Supabase
- Production is a single shared database (Golf + Baseball + Lift Lab), no
  staging copy. Sport prefixes are load-bearing: `golf_*`, `baseball_*`,
  `helm_lifting_*`. New table ⇒ RLS + policy in the same migration.
- Never `GRANT ... TO anon/PUBLIC`; pair every `SECURITY DEFINER` with a
  `REVOKE EXECUTE ... FROM PUBLIC, anon`, re-revoked after recreating a
  view. "Recorded" ≠ "applied" — verify against `information_schema`.
- The account-wide connector is the connected query path today; its
  migration/branch/project mutators are denied by UUID in
  `permissions.deny`, same as the CLI migration path (see
  `docs/CONTROL_PLANE_ENFORCEMENT.md` for exact spellings). Its
  `execute_sql` is unenforced — a live production write path, not a
  sandbox.

### Vercel
- Pushing does not deploy — the git integration is disconnected;
  production ships only through `scripts/deploy-prod.sh`, which is where
  the one-deploy-per-milestone budget is enforced.
- `vercel deploy` needs `--archive=tgz`; `.vercelignore` REPLACES rather
  than extends the default ignore set. Team-scoped/integration env vars
  don't show in `vercel env ls` — absence there isn't evidence of unset.
- Capture Vercel CLI output to a variable before parsing it; never pipe it
  into something that can close the pipe early.

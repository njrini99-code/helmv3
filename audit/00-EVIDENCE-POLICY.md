# Evidence-availability policy (owner, 2026-09-07)

Acting on the handoff from session helmv3-0e
(`~/worktrees/helmv3/mobile-ui-audit/premium-audit/HANDOFF-FROM-helmv3-0e.md`).

## 1. Credential decision — settled, do not re-ask

`SUPABASE_DB_PASSWORD` is **deliberately not** added to `.env.local`. It is Postgres
superuser on the shared production database — strictly more powerful than the service-role
key already in that file. The control plane keeps it in GitHub secrets for the `db-apply`
workflow only: `db push` is denied locally and `apply.mjs --apply` is denied to agents.

That is the right call. This manifest does not ask for it again, and no finding below is
"blocked pending a credential".

`SUPABASE_PROJECT_ID` is **not** a secret — it is already committed in the repo's MCP server
config — so it may safely be set locally. It does not unblock anything on its own.

Two fixes are in flight in `~/worktrees/helmv3/db-env-docs` (branch `agent/db-env-docs`):
`.env.example` gaining the four DB vars with which-script-needs-which, and the `scripts/db/*.mjs`
loaders reading `.env.local` then `.env` so the access token resolves from either — killing the
split-token footgun at the source rather than duplicating a credential. Three of those loaders
also pass a relative `.env.local` and so only work from the repo root; that is being fixed too.
Both supersede the corresponding items in my earlier "what's wrong with the Supabase config"
answer.

## 2. Findings re-labelled `UNVERIFIABLE-LOCALLY`

Not open, not blocking — deferred, with the reason recorded:

| Finding | Question it needs answered |
|---|---|
| **G-38** | Was migration `20260819070000`'s cross-tenant injection guard ever applied? |
| **G-44** | Do signed attachment URLs enforce conversation membership? |
| **G-51** | Is the shipped roster presence indicator dead under `users` RLS? |
| M01 pgTAP claim | Is there genuinely zero RLS test coverage on the core messaging tables? |

All four are answered by **one** query pair against production — `pg_policies` for
`golf_conversation_participants` and `users`, plus `pg_proc` for
`golf_conversation_has_other_participant`. None can be run from a developer checkout by design.

## 3. The caveat this policy rests on — UNCONFIRMED

The handoff says these checks "belong in CI, where the secret already exists." I could not
verify that any workflow actually invokes `db/rls-coverage.mjs` or `db/check-supabase-drift.mjs`:
the config-change guard blocks Bash from reading the workflow directory, and setting
`HELM_CONFIG_EDIT=1` would assert a config change I am not making.

This matters more than it sounds. `.claude/rules/quality-gates.md` documents this exact failure
shape twice under "Gates that do not currently enforce coverage": `check:ledger` "has a test
proving the guard works, but no workflow invokes `scripts/check-migration-ledger.mjs` itself",
and `orphans:mounts` "has no CI caller." A script existing is not evidence anything runs it.

**If no workflow calls these two scripts, G-38 is not deferred to CI — it is unchecked
everywhere, and the cross-tenant guard's status stays unknown indefinitely.** Someone with
workflow read access should confirm before this is treated as covered.

## 4. Report-writing location, for any future lane

Write to `~/worktrees/helmv3/<task>/…`, never into the canonical checkout.
`guard-canonical-write.mjs` blocks `Write`/`Edit`/`MultiEdit` into canonical but matches on
**tool name only**, so a Bash heredoc writing identical bytes passes straight through — the gap
is documented in `.claude/rules/shipping.md`, which is why one session's lanes saw a `Write`
refused and a heredoc succeed for the same content.

The fix is the write *location*, not the format: keep both the queryable register and the
per-lane narrative files. This audit's lanes were pointed at the worktree from the start, so no
lane hit this and no report was dropped for the wrong reason.

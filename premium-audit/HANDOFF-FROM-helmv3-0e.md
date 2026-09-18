# Handoff to the mobile UI/UX audit coordinator

From session helmv3-0e, 2026-09-07. Two unblockers. Both verified against the
files, not inferred.

## 1. The `report.md` refusal is misdiagnosed

There is **no global "no report.md" preference.** Checked both settings files:
`Write` is allowed at user scope and project scope, and neither carries a deny
rule matching any `.md` path.

What the lanes actually hit is the canonical-write guard hook
(`guard-canonical-write.mjs`). It blocks `Write`/`Edit`/`MultiEdit` whenever the
resolved target path is inside `/Users/ricknini/Downloads/helmv3`, and it matches
on **tool name only** — so a Bash heredoc writing identical bytes passes straight
through. That is exactly why A02's heredoc worked and A06's `Write` did not. The
hook's own header documents this gap explicitly, as does the shipping rules file:

> the three editing tools are blocked; a Bash redirect, `cp`, `mv` or formatter
> writing the same bytes is not.

**Fix — do not drop the per-lane `.md` files.** The problem is the write
*location*, not the format. Point every lane's writes outside the canonical
checkout:

    ~/worktrees/helmv3/mobile-ui-audit/premium-audit/

`Write` then works normally, no heredoc workaround, and A06 keeps its narrative.

Keep both artifacts. `findings.jsonl` is the queryable register; the per-lane
`.md` files carry reasoning that does not survive as JSON rows. Once the path is
right they cost nothing.

Confirm by asking a lane what the refusal text said — the hook prints
`BLOCKED: this file is inside the canonical Helm checkout` with resolved paths.
No preference would produce that.

## 2. Env gaps: decision made, do not block on it

`SUPABASE_DB_PASSWORD` is **not** being added to `.env.local`. It is Postgres
superuser on the shared production database, strictly more powerful than the
service-role key. The control plane deliberately keeps it in GitHub secrets for
the `db-apply` workflow only: `db push` is denied locally, and `apply.mjs
--apply` is denied to agents.

Two fixes are in flight in worktree `~/worktrees/helmv3/db-env-docs`
(branch `agent/db-env-docs`):

- `.env.example` now documents `DATABASE_URL`, `SUPABASE_PROJECT_ID`,
  `SUPABASE_DB_PASSWORD` and `SUPABASE_ACCESS_TOKEN`, including which script
  needs which. The template omitting a whole class of required vars was the real
  defect — it made unconfigured scripts read as broken.
- The `scripts/db/*.mjs` loaders will read `.env.local` then `.env`, so
  `SUPABASE_ACCESS_TOKEN` resolves from either file. That kills the split-token
  footgun at the source rather than duplicating a credential. Three of them also
  pass a *relative* `.env.local`, so they only work from the repo root; that is
  being fixed too.

**For the audit:** treat `db:rls-coverage` and `db:drift:check` as unavailable
locally. Mark those findings `UNVERIFIABLE-LOCALLY` with the reason, rather than
blocking on them — those checks belong in CI, where the secret already exists.
`SUPABASE_PROJECT_ID` on its own is not a secret (it is already committed in the
repo's MCP server config), so it is safe to set locally if wanted.

## 3. Record these two naming facts in the design-system rule

Both cost a lane two failed compiles, and neither is written down anywhere:

- Fairway colour keys are **not** `fw-`prefixed in Tailwind. It is
  `bg-surface`, not `bg-fw-surface` — the `--fw-` prefix exists on the CSS
  variable only, not on the Tailwind key generated from it.
- Tailwind v3's `--content` CLI flag does **not** override the config's
  `content` array. A scan run that way silently reads the config's globs.

Put both in `.claude/rules/design-system.md` as part of this audit's PR. A trap
that burns a compile twice in one session belongs in the rule, not a report.

## 4. Note on A03-002 / A03-005

Both are real, and both are the same shape: a rule declared with zero
mechanical enforcement. `FORBIDDEN` on the non-`fw` radius scale with 31
violating sites — including `Segmented`, the plan's own cited reference
component (:142, :217) — is not a documentation gap, it is an unenforced
invariant. Same for two live z-index ladders with two Radix popovers already
escaping both via an undocumented third value.

Worth proposing an ast-grep rule under `.coderabbit/ast-grep/` for the radius
scale in the audit's PR: the Review Gate consumes that directory directly, so a
rule there is the difference between "declared forbidden" and "cannot land".

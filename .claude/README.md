# `.claude/` — how this directory is wired

What each part does, so nothing here has to be re-derived by reading JSON.
Project instructions live in `/CLAUDE.md` and `/AGENTS.md`, not here.

## Layout

| Path | What it is |
|---|---|
| `settings.json` | **Committed.** Hooks, enabled plugins, and the two always-allowed git permissions. Shared by everyone on the repo. |
| `settings.local.json` | **Git-ignored, per-machine.** Tool permissions and which `.mcp.json` servers are enabled. Never commit it. |
| `rules/` | 8 scoped rule files, auto-loaded by the `paths` frontmatter when you touch matching code. See the table in `/CLAUDE.md`. |
| `agents/` | 4 review subagents: `code-reviewer`, `security-reviewer`, `ui-polish-reviewer`, `db-migration-reviewer`. |
| `commands/` | 5 slash commands: `/complete`, `/cleanup-db`, `/status`, `/db-audit`, `/gates`. |
| `hooks/` | 4 shell hooks — see below. |
| `skills/` | Vendored skill packs. |
| `workflows/` | One-off multi-agent scripts kept for reference; not wired to anything automatic. |
| `worktrees/`, `.cc-writes/`, `scheduled_tasks.lock` | Runtime state. Regenerated automatically — do not hand-edit or delete while a session is running. |

## Hooks

| Hook | Fires on | Purpose |
|---|---|---|
| `session-context.sh` | SessionStart | Injects repo/branch state at session start. |
| `guard-bash.sh` | PreToolUse `Bash` | 5 guards: `git stash`, `rm .next`, gate-command-on-left-of-pipe (exit-code masking), force push, push to `main`. |
| `guard-sql.sh` | PreToolUse `Write\|Edit\|MultiEdit` **and** `mcp__.*(apply_migration\|execute_sql)` | Blocks RLS-bypass and destructive SQL. |
| `post-edit.sh` | PostToolUse `Write\|Edit\|MultiEdit` | `eslint --fix`. |

**Each hook is registered exactly once per matcher.** `guard-bash.sh` was
registered four times on the same `Bash` matcher, each entry carrying an
`"if": "Bash(npm *)"`-style key. `if` is **not a Claude Code hook field** — it
was ignored, so the script ran four times on every Bash call. The labels were
also wrong: there was no `if` for push-to-main even though the script guards it.
The script does all its own filtering on `.tool_input.command`; one registration
is correct. Do not re-add per-pattern entries.

`guard-sql.sh` deliberately covers two routes: `.sql` files, and MCP calls whose
payload is `.tool_input.query`. The MCP route hits **production** with
`service_role` and never touches a file, so a file-only guard would miss it
entirely. Its matcher is a regex over the tool name, so it holds for any
Supabase MCP server, not just the one currently configured.

## MCP topology — one Supabase, one write path

Reviewed and consolidated 2026-08-09. Three Supabase registrations existed at
once, two of them with pre-approved `execute_sql` / `apply_migration`, i.e. two
unprompted write paths into the production database.

**The invariant now:**

- `.mcp.json` declares exactly one Supabase server (`project_ref=qmnssrrolpinvwjjnufo`).
  It is the only one with pre-approved writes.
- The `supabase@claude-plugins-official` plugin is **off** — it only ever
  surfaced auth stubs and duplicated the above.
- `settings.local.json` sets `enabledMcpjsonServers: ["supabase"]` explicitly.
  `enableAllProjectMcpServers` was removed on purpose: it would silently enable
  any server later added to `.mcp.json` without review.

If a second Supabase or Vercel server shows up in the permission list, that is
drift — collapse it back to one before granting it writes.

Permission entries naming a raw UUID (`mcp__7524981b-…__…`) are dead connector
instances. They grant nothing and should be deleted, not kept "just in case".

## Not here any more

One-off audit reports and scratch docs (`AGENT_TASKS_REMAINING.md`,
`*_REPORT.md`, `*_SCAN.md`, `START_HERE.md`, `HOW_IT_WORKS.md`, `REFERENCE.md`,
`ALL_COMMANDS.md`) moved to `docs/archive/2026-08/claude-scratch/` on
2026-08-09. The June 2026 audit had already flagged them as clutter. Put new
one-off reports in `docs/`, not here — this directory is configuration.

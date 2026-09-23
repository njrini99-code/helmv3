<!-- markdownlint-disable MD013 -->

# Control-plane enforcement inventory

**Generated. Do not hand-edit between the AUTOGEN markers** —
`node scripts/gen-enforcement-inventory.mjs` rewrites them from
`.claude/settings.json` and the hook scripts on disk.

This file exists because prose could not notice a mechanism being deleted. On
2026-08-29 three rule files claimed protections that no longer existed, all
about irreversible operations. The rules now point here instead of asserting
enforcement themselves.

Read the last column carefully. These are **not** synonyms:

| | meaning |
| --- | --- |
| CONFIGURED | a rule or hook is declared |
| WIRED | it is attached to an event whose matcher can reach the tool |
| EXERCISED | it has actually been observed to fire |
| REQUIRES APPROVAL | a permission `ask` rule prompts the user before it runs |
| UNENFORCED | nothing in this repo's configuration stops it |

A generator can establish the first two. It cannot establish the third, so
EXERCISED is only claimed where a specific observation is named.

**Scope:** this reads PROJECT configuration only. User-global
`~/.claude/settings.json` can add capability that this file cannot see. Its
`autoMode` prose once repeated a stale hook claim sourced from this repo;
whether that claim is present NOW is measured by
`npm run control-plane:verify` (`user-global/no-stale-hook-claim`), never
asserted here — see `.claude/rules/database.md`.

<!-- AUTOGEN:enforcement:start -->

## Hooks, as wired

| Event | Matcher | Script | On disk | Can refuse a call |
| --- | --- | --- | --- | --- |
| SessionStart | `(all tools)` | `.claude/hooks/session-context.sh` | yes | no — records/reports only |
| SessionStart | `(all tools)` | `.claude/hooks/stamp-workspace.mjs` | yes | no — records/reports only |
| SessionStart | `compact\|resume` | `.claude/hooks/restore-session-state.mjs` | yes | no — records/reports only |
| WorktreeCreate | `(all tools)` | `.claude/hooks/worktree-create.mjs` | yes | no — records/reports only |
| WorktreeRemove | `(all tools)` | `.claude/hooks/worktree-remove.mjs` | yes | no — records/reports only |
| UserPromptSubmit | `(all tools)` | `.claude/hooks/route-prompt.mjs` | yes | no — records/reports only |
| PreCompact | `(all tools)` | `.claude/hooks/save-session-state.mjs` | yes | no — records/reports only |

No hook can refuse a tool call; every wired hook observes or reports.

## Permission rules

| Kind | Count |
| --- | --- |
| `permissions.deny` total | 0 |
| …covering `mcp__` | 0 |
| …covering `Bash(` | 0 |
| …other | 0 |

Deny rules fire even under `bypassPermissions`, and a project-scope
deny overrides a user-scope allow (probed 2026-08-29).

Production mutation requests use `permissions.ask` instead of permanent denies.
This table reports hard refusal only; an UNENFORCED row does not grant task authorization.

## Claims, resolved against the configuration above

| Claim | Mechanism | Config location | How observed |
| --- | --- | --- | --- |
| A write into the canonical checkout via Write/Edit/MultiEdit is refused | NONE | — | NOT A GOAL — AGENTS.md allows authorized edits in canonical; parallel sessions use worktrees |
| A write into the canonical checkout via Bash is refused | NONE | — | UNENFORCED — authorized edits are allowed in the owned checkout |
| Destructive SQL (DROP TABLE / TRUNCATE / unqualified DELETE) is refused before it runs | NONE | — | UNENFORCED — guard-sql.sh was deleted 2026-08-27 |
| An MCP tool call can be refused by a hook | NONE | — | UNENFORCED — no hook matcher mentions mcp__; permission rules are the only MCP control |
| A recursive rm outside the project is refused | NONE | — | UNENFORCED |
| `rm -rf .next` is refused | NONE | — | UNENFORCED — advisory only (it wedges Turbopack) |
| A governed edit without loaded feature context is prevented | NONE | — | NOT ENFORCED BY DESIGN — AGENTS.md "Context" asks for it; no hook detects or prevents it |
| The Supabase CLI migration path is refused | NONE | — | UNENFORCED |
| Account-wide Supabase MCP mutation is refused (display-name spelling `mcp__claude_ai_Supabase__*`) | NONE | — | UNENFORCED |
| Account-wide Supabase MCP mutation is refused (UUID spelling the session exposes) | NONE | — | UNENFORCED — the connector id is recorded but no deny rule names it |
| A production deploy, purchase, pause or deployment-protection change through the Vercel MCP is refused | NONE | — | UNENFORCED |
| A file write or process spawn through the Desktop Commander MCP is refused | NONE | — | UNENFORCED — Desktop Commander bypasses guard-canonical-write.mjs and the Bash sandbox |
| The uninstalled Supabase plugin namespace cannot activate on install | NONE | — | UNENFORCED |
| Arbitrary SQL against production through MCP is refused | NONE | — | UNENFORCED, KNOWINGLY — the only working query path; no read_only enforcement on it |
| Direct psql / service-role writes to production are refused | NONE | — | UNENFORCED — guard-sql.sh deleted 2026-08-27; SUPABASE_SERVICE_ROLE_KEY carries write capability |
| A production deploy typed as a vercel command (`deploy --prod`, `promote`, `rollback`) is refused | NONE | — | UNENFORCED, BY OWNER GRANT — e5ec5e7b8 (2026-09-01) removed these rules so scripts/deploy-prod.sh is the one sanctioned promote path; AGENTS.md still forbids a production action the user did not ask for |
| Re-pointing the production alias (`vercel alias set`) is refused | NONE | — | UNENFORCED |
| A production deploy run through scripts/deploy-prod.sh is refused | NONE | — | UNENFORCED — scripts/deploy-prod.sh runs `vercel deploy --prod` in a child process; deny rules match the submitted command, which is the script. NOT probed: the only probe is a real production deploy |

<!-- AUTOGEN:enforcement:end -->

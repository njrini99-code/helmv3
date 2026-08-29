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
| UNENFORCED | nothing in this repo's configuration stops it |

A generator can establish the first two. It cannot establish the third, so
EXERCISED is only claimed where a specific observation is named.

**Scope:** this reads PROJECT configuration only. User-global
`~/.claude/settings.json` can add capability that this file cannot see, and
its `autoMode` prose currently repeats a stale claim sourced from this repo —
see `.claude/rules/database.md`.

<!-- AUTOGEN:enforcement:start -->

## Hooks, as wired

| Event | Matcher | Script | On disk | Can refuse a call |
| --- | --- | --- | --- | --- |
| SessionStart | `(all tools)` | `.claude/hooks/session-context.sh` | yes | no — records/reports only |
| SessionStart | `(all tools)` | `.claude/hooks/init-session-state.mjs` | yes | no — records/reports only |
| PreToolUse | `Write\|Edit\|MultiEdit` | `.claude/hooks/guard-canonical-write.mjs` | yes | yes |
| PostToolUse | `Read\|Bash` | `.claude/hooks/record-context-load.mjs` | yes | no — records/reports only |
| PostToolUse | `Write\|Edit\|MultiEdit` | `.claude/hooks/record-session-touch.mjs` | yes | no — records/reports only |
| Stop | `(all tools)` | `.claude/hooks/stop-verify.sh` | yes | no — records/reports only |

Exactly one hook can refuse a tool call: `guard-canonical-write.mjs` under matcher `Write|Edit|MultiEdit`. Every other wired hook observes.

## Permission rules

| Kind | Count |
| --- | --- |
| `permissions.deny` total | 42 |
| …covering `mcp__` | 13 |
| …covering `Bash(` | 22 |
| …other | 7 |

Deny rules fire even under `bypassPermissions`, and a project-scope
deny overrides a user-scope allow (probed 2026-08-29).

## Claims, resolved against the configuration above

| Claim | Mechanism | Config location | How observed |
| --- | --- | --- | --- |
| A write into the canonical checkout via Write/Edit/MultiEdit is refused | PreToolUse hook `guard-canonical-write.mjs` | .claude/settings.json → hooks.PreToolUse | WIRED — matcher covers the tool names; exercised in src/test/hooks/ |
| A write into the canonical checkout via Bash is refused | NONE | — | UNENFORCED — no PreToolUse matcher includes Bash |
| Destructive SQL (DROP TABLE / TRUNCATE / unqualified DELETE) is refused before it runs | NONE | — | UNENFORCED — guard-sql.sh was deleted 2026-08-27 |
| An MCP tool call can be refused by a hook | NONE | — | UNENFORCED — no hook matcher mentions mcp__; permission rules are the only MCP control |
| A recursive rm outside the project is refused | NONE | — | UNENFORCED |
| `rm -rf .next` is refused | NONE | — | UNENFORCED — advisory only (it wedges Turbopack) |
| A governed edit without loaded feature context is prevented | NONE (detection only) | .claude/settings.json → hooks.Stop | POST-HOC — the Stop gate reports it after the edit; nothing prevents it |
| The Supabase CLI migration path is refused | 8 deny rules | .claude/settings.json → permissions.deny | CONFIGURED — fires under bypassPermissions |
| Account-wide Supabase MCP mutation is refused | 10 deny rules | .claude/settings.json → permissions.deny | EXERCISED 2026-08-29 — the denied tools left the session tool set; list_tables still loaded |
| The uninstalled Supabase plugin namespace cannot activate on install | mcp__plugin_supabase_supabase | .claude/settings.json → permissions.deny | CONFIGURED — server-level deny |
| Arbitrary SQL against production through MCP is refused | NONE | — | UNENFORCED, KNOWINGLY — the only working query path; no read_only enforcement on it |
| Direct psql / service-role writes to production are refused | NONE | — | UNENFORCED — guard-sql.sh deleted 2026-08-27; SUPABASE_SERVICE_ROLE_KEY carries write capability |

<!-- AUTOGEN:enforcement:end -->

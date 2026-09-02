<!-- markdownlint-disable MD013 -->

# Tool Authority Matrix

**Generated between the AUTOGEN markers** — `node scripts/gen-tool-authority.mjs`
rebuilds them from `config/tool-authority.json`,
`config/control-plane-observations.json`, `.claude/settings.json` and
`.mcp.json`.

These five words are **not** synonyms, and this document exists because they
were treated as one:

| | meaning |
| --- | --- |
| CONFIGURED | a file declares it |
| CONNECTED | the server answered at all |
| EXPOSED | its real tools are present, not just `authenticate` |
| ALLOWED | permission rules permit calling it |
| EXERCISED | someone actually called it and it worked |

ET-4 sat blocked for two days on "we cannot reach Sentry without a token" while
an authenticated Sentry MCP was connected the entire time. The cause was one
sentence that was true of a file being read as a claim about the world (#1671).

**Runtime evidence expires.** Each observation records the fingerprint of the
configuration that produced it. Change a deny rule, a grant, or `.mcp.json`,
and the matching EXERCISED claims become STALE on the next regeneration — no
human has to remember to invalidate them.

<!-- AUTOGEN:tool-authority:start -->

## Authority per service

| Service | Authority | Scope | Source | Runtime evidence |
| --- | --- | --- | --- | --- |
| Supabase | `mcp__supabase__*` | project-scoped: qmnssrrolpinvwjjnufo, read_only=true | .mcp.json (this repo) | **FAILED** — 2026-08-29 — exposes ONLY authenticate/complete_authentication — OAuth not completed. Its grant requests exclusively :read scopes (organizations, projects, database, analytics, secrets, edge_functions, environment, storage): connector-enforced read-only, not a URL string. |
| Sentry | `mcp__claude_ai_Sentry__*` | org helm-xs | account connector | **EXERCISED** — 2026-08-29 — find_organizations -> org helm-xs (us.sentry.io) |
| Vercel | `mcp__claude_ai_Vercel__*` | account | account connector | **STALE** — observed 2026-08-29 under config 877140c1c20967a1; config is now 6a0055d9843bbc8e |
| GitHub | `gh CLI (gh api)` | repo njrini99-code/helmv3 | scripts/worktree-lifecycle.mjs | **EXERCISED** — 2026-08-29 — exercised three ways: MERGED #1676 -> head 7843291b2; OPEN #1659 -> head 03a13075d; feat/ask-nav-and-opening -> NONE. A failed lookup classifies UNKNOWN_PR, never NONE (#1668). Capability is fingerprintable after all: the authenticated account id, the repository id and the OAuth scope set (X-Oauth-Scopes response header) are all stable and carry no secret material. Recorded 2026-08-30; control-plane:verify re-measures them live and reports drift. |

## Every namespace, classified

| Namespace | Service | Disposition | Configured | Connected | Exposed | Allowed | Exercised |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mcp__supabase__*` | Supabase | AUTHORITY | yes | no | no | yes | FAILED |
| `mcp__claude_ai_Supabase__*` | Supabase | TEMPORARY_FALLBACK | yes | yes | yes | partial (10 mutators denied) | EXERCISED |
| `mcp__plugin_supabase_supabase__*` | Supabase | PHANTOM_REMOVED | no | no | no | DENIED (server-level) | FAILED |
| `mcp__claude_ai_Sentry__*` | Sentry | AUTHORITY | yes | yes | yes | yes | EXERCISED |
| `mcp__plugin_sentry_sentry__*` | Sentry | REDUNDANT_DENIED | yes | yes (pre-deny) | yes (pre-deny) | DENIED (server-level) | DENIED_BY_POLICY |
| `mcp__claude_ai_Vercel__*` | Vercel | AUTHORITY | yes | yes | yes | yes | STALE |
| `mcp__plugin_vercel_vercel__*` | Vercel | DEAD_DENIED | yes | no | no | DENIED (server-level) | STALE |
| `gh CLI (gh api)` | GitHub | AUTHORITY | yes | yes | yes | yes | EXERCISED |
| `mcp__github__*` | GitHub | RETAINED_INTERACTIVE | yes | unknown | yes | yes | NOT_EXERCISED |

## Why each non-authority namespace is where it is

**`mcp__claude_ai_Supabase__*`** — TEMPORARY_FALLBACK

Account-scoped (list_organizations succeeds), so it is NOT project-scoped and carries no read_only enforcement. Its ten project-mutating tools are denied at project scope (#1673). execute_sql is deliberately retained ONLY because the sanctioned path is not yet connected — it is the sole working query path. It is UNENFORCED, not safe. Remove once mcp__supabase__* is connected and exercised.

**`mcp__plugin_supabase_supabase__*`** — PHANTOM_REMOVED

No such plugin is installed on this machine. It held user-global ALLOW grants for execute_sql and apply_migration that would have activated the moment anyone installed it. Those grants were removed 2026-08-29; the namespace remains denied at project scope.

**`mcp__plugin_sentry_sentry__*`** — REDUNDANT_DENIED

Probed 2026-08-29: connected, and find_organizations returns byte-identical results to the authority (org helm-xs, same region). A duplicate full tool set with no distinct capability. Denied at project scope. REVERSIBLE: if the account connector is ever disconnected, delete one deny line to restore this path — it is a duplicate, not a dead end.

**`mcp__plugin_vercel_vercel__*`** — DEAD_DENIED

Probed 2026-08-29: exposes ONLY authenticate/complete_authentication, so it is CONFIGURED but not CONNECTED and cannot operate. Denied at project scope so a dead namespace cannot sit beside the live one as though equivalent.

**`mcp__github__*`** — RETAINED_INTERACTIVE

Declared globally in ~/.claude.json. Retained for interactive use; it is NOT on the lifecycle path and no automation depends on it. Not denied, because it removes no safety property and provides real interactive capability.

## Configuration fingerprints

An observation is only evidence about the configuration it was made under.
When a fingerprint changes, every EXERCISED claim under it becomes STALE.

| Service | Fingerprint | Drift detectable? |
| --- | --- | --- |
| Supabase | `20b8aa0d1c1206ee` | yes — derived from the allow/deny/ask rules and `.mcp.json` entries naming this service |
| Sentry | `e1d6b5e512b23087` | yes — derived from the allow/deny/ask rules and `.mcp.json` entries naming this service |
| Vercel | `6a0055d9843bbc8e` | yes — derived from the allow/deny/ask rules and `.mcp.json` entries naming this service |
| GitHub | `ungoverned:87544794` | **NO** — no allow/deny/ask rule or `.mcp.json` entry in this repo governs it, so there is nothing here to fingerprint |

<!-- AUTOGEN:tool-authority:end -->

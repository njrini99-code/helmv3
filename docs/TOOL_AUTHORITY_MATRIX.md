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
| Supabase | `mcp__supabase__*` | project-scoped: qmnssrrolpinvwjjnufo, read/write | .mcp.json (this repo) | **EXERCISED** — 2026-09-08T14:44:38.455Z — Claude Haiku executed read-only metadata SQL from canonical and an older worktree using the current Helm launch profile. Role postgres, transaction_read_only=off; apply_migration present in tool catalog; zero permission denials. Read privileges inspected across schemas; application tables accessible. No production data/schema mutations were executed. |
| Sentry | `mcp__claude_ai_Sentry__*` | org helm-xs | account connector | **STALE** — observed 2026-08-29 under config 6965b945cbb523f5; config is now 4d81ab6283cd58ec |
| Vercel | `mcp__claude_ai_Vercel__*` | account | account connector | **STALE** — observed 2026-09-01 under config 5b174c1ef5d936bb; config is now e14074e44c19ddeb |
| GitHub | `gh CLI (gh api)` | repo njrini99-code/helmv3 | scripts/worktree-lifecycle.mjs | **EXERCISED** — 2026-08-29 — exercised three ways: MERGED #1676 -> head 7843291b2; OPEN #1659 -> head 03a13075d; feat/ask-nav-and-opening -> NONE. A failed lookup classifies UNKNOWN_PR, never NONE (#1668). Capability is fingerprintable after all: the authenticated account id, the repository id and the OAuth scope set (X-Oauth-Scopes response header) are all stable and carry no secret material. Recorded 2026-08-30; control-plane:verify re-measures them live and reports drift. |

## Every namespace, classified

| Namespace | Service | Disposition | Configured | Connected | Exposed | Allowed | Exercised |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mcp__supabase__*` | Supabase | AUTHORITY | yes | yes | yes | approval required for listed operations | EXERCISED |
| `mcp__claude_ai_Supabase__*` | Supabase | ALTERNATIVE | yes | unknown (stale observation) | unknown (stale observation) | approval required for listed operations | STALE |
| `mcp__e139bbde-4728-4ed3-977f-7b1b22f4b69c__*` | Supabase | ALTERNATIVE | yes (account connector, no file in this repo) | unknown (stale observation) | unknown (stale observation) | approval required for listed operations | STALE |
| `mcp__plugin_supabase_supabase__*` | Supabase | ALTERNATIVE | no | unknown (stale observation) | unknown (stale observation) | not denied by project | STALE |
| `mcp__claude_ai_Sentry__*` | Sentry | AUTHORITY | yes | unknown (stale observation) | unknown (stale observation) | not denied by project | STALE |
| `mcp__plugin_sentry_sentry__*` | Sentry | ALTERNATIVE | yes | unknown (stale observation) | unknown (stale observation) | not denied by project | STALE |
| `mcp__7524981b-0003-40de-9f86-c5275420784a__*` | Sentry | ALTERNATIVE | yes (account connector, no file in this repo) | unknown (stale observation) | unknown (stale observation) | not denied by project | STALE |
| `mcp__claude_ai_Vercel__*` | Vercel | AUTHORITY | yes | unknown (stale observation) | unknown (stale observation) | not denied by project | STALE |
| `mcp__plugin_vercel_vercel__*` | Vercel | ALTERNATIVE | yes | unknown (stale observation) | unknown (stale observation) | not denied by project | STALE |
| `mcp__plugin_vercel-plugin_vercel__*` | Vercel | ALTERNATIVE | yes (plugin) | unknown (stale observation) | unknown (stale observation) | not denied by project | STALE |
| `mcp__fba2ada3-c190-4053-b91a-3e81f5296483__*` | Vercel | ALTERNATIVE | yes (account connector, no file in this repo) | unknown (stale observation) | unknown (stale observation) | approval required for listed operations | STALE |
| `gh CLI (gh api)` | GitHub | AUTHORITY | yes | yes | yes | not denied by project | EXERCISED |
| `mcp__github__*` | GitHub | ALTERNATIVE | yes | unknown | yes | not denied by project | NOT_EXERCISED |

## Why each non-authority namespace is where it is

**`mcp__claude_ai_Supabase__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

**`mcp__e139bbde-4728-4ed3-977f-7b1b22f4b69c__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

**`mcp__plugin_supabase_supabase__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

**`mcp__plugin_sentry_sentry__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

**`mcp__7524981b-0003-40de-9f86-c5275420784a__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

**`mcp__plugin_vercel_vercel__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

**`mcp__plugin_vercel-plugin_vercel__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

**`mcp__fba2ada3-c190-4053-b91a-3e81f5296483__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

**`mcp__github__*`** — ALTERNATIVE

Use if installed, connected, and suitable for the task. This namespace is not permanently disabled. Current permissions are in .claude/settings.json; historical connectivity must be rechecked.

## Configuration fingerprints

An observation is only evidence about the configuration it was made under.
When a fingerprint changes, every EXERCISED claim under it becomes STALE.

| Service | Fingerprint | Drift detectable? |
| --- | --- | --- |
| Supabase | `0c81fcff3e2212cf` | yes — derived from the allow/deny/ask rules and `.mcp.json` entries naming this service |
| Sentry | `4d81ab6283cd58ec` | yes — derived from the allow/deny/ask rules and `.mcp.json` entries naming this service |
| Vercel | `e14074e44c19ddeb` | yes — derived from the allow/deny/ask rules and `.mcp.json` entries naming this service |
| GitHub | `ungoverned:87544794` | **NO** — no allow/deny/ask rule or `.mcp.json` entry in this repo governs it, so there is nothing here to fingerprint |

<!-- AUTOGEN:tool-authority:end -->

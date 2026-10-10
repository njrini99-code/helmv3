# Supabase MCP setup

This page used to describe a Cursor `.cursor/mcp.json` setup. That is no
longer how this repo connects to Supabase.

- **Configuration:** the tracked `.mcp.json` at the repo root defines the
  project-scoped Supabase servers for project `qmnssrrolpinvwjjnufo`: a
  write-capable `supabase` server and a `supabase-readonly` server. Both use
  OAuth; never put an access token in a config file.
- **Usage, traps and judgment:** the `helm-supabase` skill
  (`.claude/skills/helm-supabase/SKILL.md`) covers connected database access,
  key precedence, row caps and applied-vs-recorded migrations.
- **Production changes:** follow AGENTS.md "Database" and
  `docs/operations/APPLY_PATH.md`.

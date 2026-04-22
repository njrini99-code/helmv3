# Supabase Auth configuration (mirror of dashboard settings)

**Last updated:** 2026-04-21 (Team F, Phase 1)

This doc is the source of truth for intended auth settings. Anything in
the Supabase dashboard that conflicts with this doc is wrong.

## Required settings

| Setting | Value | Why |
|---|---|---|
| Leaked password protection | **ENABLED** (HaveIBeenPwned) | Blocks signups using compromised passwords |
| Password strength | Min length 10, require lower+upper+digit | Standard defense-in-depth |
| MFA methods | TOTP | For coach accounts on sensitive teams |
| Email confirmations | ON (signup) | Avoid throwaway accounts on prod |
| Rate limits — sign-ups | 30 / hour / IP | Supplements app-level limiter |
| Rate limits — token refresh | 150 / hour / user | Prevents refresh storms from buggy clients |

## Pending manual toggles

Supabase advisor (`mcp__plugin_supabase_supabase__get_advisors`, run
2026-04-21) flagged:

- [ ] `auth_leaked_password_protection: disabled`
  - **Who:** Project admin
  - **Where:** Supabase Dashboard → Project `qmnssrrolpinvwjjnufo` →
    Authentication → Providers → Email → Advanced → "Check passwords
    against HaveIBeenPwned"
  - **Rollback:** flip the toggle off

After enabling, re-run the advisor and update this doc.

## Why not enable via SQL / MCP?

The Supabase MCP doesn't expose an `update_auth_config` verb and the
setting isn't in any `auth.*` table we can `UPDATE`. It's a GoTrue
runtime config that lives outside the Postgres surface. Must be toggled
in the dashboard.

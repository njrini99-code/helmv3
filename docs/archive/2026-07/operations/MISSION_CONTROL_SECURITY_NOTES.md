# Mission Control Security Notes

Helm Mission Control connects partners, GitHub, n8n, Claude/Codex, telemetry, and docs. That is powerful, but it requires strong guardrails.

## Rules

- Partners submit requests; they do not control automation.
- n8n can triage and request PRs; it must not auto-merge.
- Claude/Codex should work through branches and PRs.
- High-risk work requires Nick approval.
- Do not send credentials, private tokens, or private customer data into issue bodies, Huly cards, PR descriptions, or AI prompts.
- Keep the n8n editor private or strongly authenticated.
- Use scoped credentials.
- Log every AI-generated action into the Git Activity Timeline.

## High-risk areas

Human review required for:

- Authentication
- Permissions
- Supabase RLS
- Database migrations
- Billing/payments
- Production jobs
- Environment configuration
- Production data changes
- Broad architecture rewrites

## Safe first tests

Test automation on:

- Docs-only issues
- Copy changes
- Issue template changes
- Small UI empty-state fixes
- Test-only changes

Do not test first on production data, auth, database, billing, or security-sensitive work.

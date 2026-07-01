# Mission Control Phase 1 PR Notes

This branch implements the docs/config foundation for Helm Mission Control.

## What changed

- Added partner bug intake issue template.
- Added feature/enhancement request issue template.
- Linked GitHub issue chooser to the Mission Control OS doc.
- Updated PR template with partner-readable summary, risk level, and Git Activity Timeline note.
- Added guarded Claude Code GitHub Action scaffold.
- Added GitHub label/project setup guide.
- Added n8n Mac mini setup guide.
- Added n8n workflow specs.
- Added Huly workspace setup guide.
- Added Git Activity Timeline spec.
- Added Partner Intake to PR Pipeline spec.

## What this does not do yet

- Does not turn on Claude Code automatically.
- Does not add secrets.
- Does not create n8n workflows inside a running n8n instance.
- Does not connect Huly, Sentry, Vercel, PostHog, or Google Drive yet.
- Does not change app runtime behavior.
- Does not modify Supabase migrations.

## Manual setup after merge

1. Create the GitHub labels from `GITHUB_LABELS_AND_PROJECT_SETUP.md`.
2. Create the Huly workspace from `HULY_WORKSPACE_SETUP.md`.
3. Start n8n on the Mac mini from `N8N_MAC_MINI_SETUP.md`.
4. Build n8n workflows from `N8N_WORKFLOW_SPECS.md`.
5. Keep Claude Code workflow disabled until ready.
6. Add `CLAUDE_CODE_OAUTH_TOKEN` (subscription, via `claude setup-token`) — or `ANTHROPIC_API_KEY` for API billing — only after validating the workflow.
7. Set `ENABLE_CLAUDE_CODE_ACTION=true` only after testing on a dummy issue.

## Partner-readable summary

This PR turns Helm Mission Control from an idea into a setup plan the repo can actually follow. Partners will be able to submit issues, see what Nick/Claude is fixing, follow PRs and deployments in a timeline, and understand shipped work without reading raw GitHub activity.

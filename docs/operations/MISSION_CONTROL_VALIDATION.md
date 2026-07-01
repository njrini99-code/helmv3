# Mission Control Validation Checklist

Use this before merging Phase 1.

## Files

- [ ] `docs/operations/HELM_MISSION_CONTROL_OS.md` exists.
- [ ] `docs/operations/GITHUB_LABELS_AND_PROJECT_SETUP.md` exists.
- [ ] `docs/operations/HULY_WORKSPACE_SETUP.md` exists.
- [ ] `docs/operations/N8N_MAC_MINI_SETUP.md` exists.
- [ ] `docs/operations/N8N_WORKFLOW_SPECS.md` exists.
- [ ] `docs/operations/GIT_ACTIVITY_TIMELINE.md` exists.
- [ ] `docs/operations/PARTNER_INTAKE_TO_PR_PIPELINE.md` exists.
- [ ] `.github/ISSUE_TEMPLATE/partner_bug.yml` exists.
- [ ] `.github/ISSUE_TEMPLATE/feature_request.yml` exists.
- [ ] `.github/workflows/claude-code.yml` exists.

## Safety

- [ ] Claude workflow is gated by `ENABLE_CLAUDE_CODE_ACTION=true`.
- [ ] High-risk labels block the Claude workflow.
- [ ] PR template requires a risk level.
- [ ] PR template requires a partner-readable summary.
- [ ] No secrets or environment values are committed.
- [ ] No runtime app code changed.
- [ ] No Supabase migrations changed.

## Manual setup after merge

- [ ] Create labels.
- [ ] Create GitHub Project.
- [ ] Create Huly workspace.
- [ ] Start n8n on Mac mini.
- [ ] Connect GitHub webhooks to n8n.
- [ ] Build Git Activity Timeline workflow.
- [ ] Test partner intake with a dummy issue.
- [ ] Test Claude on a dummy docs-only issue before enabling code fixes.

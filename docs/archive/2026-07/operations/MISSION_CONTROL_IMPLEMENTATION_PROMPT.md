# Mission Control Implementation Prompt

Use this after Phase 1 is merged.

```text
Read these docs:
- docs/operations/HELM_MISSION_CONTROL_OS.md
- docs/archive/2026-07/operations/MISSION_CONTROL_FILE_INDEX.md
- docs/operations/MISSION_CONTROL_NEXT_STEPS.md
- docs/operations/GITHUB_LABELS_AND_PROJECT_SETUP.md
- docs/operations/HULY_WORKSPACE_SETUP.md
- docs/operations/N8N_MAC_MINI_SETUP.md
- docs/operations/N8N_WORKFLOW_SPECS.md
- docs/operations/GIT_ACTIVITY_TIMELINE.md
- docs/operations/PARTNER_INTAKE_TO_PR_PIPELINE.md
- docs/archive/2026-07/operations/MISSION_CONTROL_SECURITY_NOTES.md

Implement the next smallest safe step.

Rules:
- Do not add secrets.
- Do not auto-merge PRs.
- Do not change app runtime behavior unless explicitly asked.
- Do not touch auth, RLS, migrations, billing, production jobs, or production data without human review.
- Prefer docs/config-only PRs until Huly and n8n are manually configured.
- Use branches and PRs.
- Include partner-readable summaries.
```

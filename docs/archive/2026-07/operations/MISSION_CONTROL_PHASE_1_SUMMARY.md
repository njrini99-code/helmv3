# Mission Control Phase 1 Summary

Phase 1 creates the docs/config foundation for Helm Mission Control.

## Core outcome

Partners can eventually submit issues in plain English, see what Nick/Claude is fixing, follow PRs/fixes/deploys as a timeline, and get daily/weekly business-readable updates.

## Main systems planned

- Huly: partner command center
- GitHub: engineering truth
- n8n on Mac mini: automation layer
- Claude/Codex: PR-creating coding agents
- Sentry/Vercel/PostHog/Supabase: telemetry and app-state sources

## Safety model

- Auto-create issues and PRs where safe.
- Never auto-merge.
- Use Issue Court before PR creation.
- High-risk areas require human approval.
- Keep n8n private.
- Keep credentials out of prompts, issues, comments, and docs.

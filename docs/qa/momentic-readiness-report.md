# Helm Momentic Readiness Report

**Date:** 2026-07-26

**Status:** Blocked for browser execution and production mutation

**Infrastructure decision:** Production-hosted QA

## Environment

| Item | Current state | Evidence |
|---|---|---|
| Application URL | Production domain is `https://helmsportslabs.com`. Momentic requires `HELM_QA_BASE_URL` at runtime so a production run cannot start merely from committed configuration. | Public application domain; `momentic.config.yaml` |
| Vercel environment | The existing production deployment was selected for production-hosted QA. No separate QA deployment is configured. | User environment decision, 2026-07-26 |
| Supabase environment | The existing production project was selected for production-hosted QA. No separate QA database is configured. | User environment decision, 2026-07-26 |
| Existing QA users | Designated QA credentials have not been configured. | Momentic runtime-variable readiness check |
| Existing QA organizations | The required `Raleigh Hawks` and `Raleigh Hawks Academy` QA tenants have not been provisioned. | QA provisioning readiness check |
| Notification safety | Not verified. No application-wide QA suppression switch was found for email, SMS, push, webhooks, or notification fan-out. | `.env.example`; `src/`; `supabase/functions/`; repository search, 2026-07-26 |
| Stripe mode | Unknown in the deployed environment. The repository contains live-key placeholders and a separate test-invoice script, but deployed secret values were not read. | `.env.example`; `scripts/stripe-test-invoice.mjs` |
| Reset capability | No production-safe deterministic reset exists for QA tenants. The available Supabase branch reset does not apply to the production project selected for QA. | Supabase branch inventory; `docs/qa/helm-test-personas-and-seed-data.md` |

## Momentic

| Item | Current state |
|---|---|
| Package | `momentic` 3.37.0 installed as a development dependency |
| Project config | Present at `momentic.config.yaml`, file format v2 |
| Environment | `production-qa`; URL and all credentials are shell-provided |
| Execution | `parallel: 1`, `retries: 0`, `recordVideo: on-fail` |
| Browser | Chromium selected, `America/New_York`, 7-second smart wait, 15-second page load timeout |
| Config validation | Configuration loaded successfully with placeholder runtime variables; no tests or modules exist yet |
| Browser binaries | FFmpeg installed in the temporary workspace. Chromium download is blocked by this environment's browser-CDN/network restrictions |
| Local runtime | Momentic runs, but one transitive dependency warns that Node 24.15.0 or newer is preferred; the current workspace is Node 24.14.0 |
| Momentic login | Not completed. The no-browser login flow could not reach a usable authorization response from this workspace |
| Momentic MCP | Not connected. The `codex` CLI is not installed in this workspace |
| Agent skills | `momentic-test`, `momentic-result-classification`, and `momentic-explore-prompt` installed for Codex under `.agents/skills/` |
| Permanent tests/modules | None; no Momentic test or module YAML was edited directly |

## Production Guardrails

The following conditions must be satisfied before any mutating browser test:

1. Create designated QA auth accounts with non-real recipients and unique
   credentials supplied outside source control.
2. Create two isolated QA organizations and teams with deterministic IDs or
   stable lookup keys.
3. Prove that QA actions cannot send production email, SMS, push,
   webhook, billing, or AI write side effects.
4. Provide a deterministic, QA-tenant-scoped reset that cannot target
   non-QA records.
5. Verify every cleanup operation rejects records outside the allowlisted QA
   organizations.
6. Install Chromium in the machine that will run Momentic.
7. Authenticate Momentic and connect its MCP server.

Until these conditions are met, only non-mutating repository setup and
read-only production checks are allowed. No browser test has been run.

## Current Blockers

- QA email addresses and passwords have not been supplied.
- QA organizations, teams, players, and deterministic fixtures do not exist.
- Outbound production side effects are not suppressed or redirected.
- No production-safe QA reset mechanism exists.
- Chromium could not be installed in this workspace.
- Momentic authentication requires a local session that can reach and open
  its authorization flow.
- Momentic MCP registration requires a machine with the `codex` CLI.

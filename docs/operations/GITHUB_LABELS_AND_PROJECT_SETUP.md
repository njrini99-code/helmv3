# GitHub Labels and Project Setup for Helm Mission Control

> Source of truth: `docs/operations/HELM_MISSION_CONTROL_OS.md`
>
> Purpose: make GitHub issues/PRs structured enough that Huly, n8n, Claude Code, partners, and future agents can all understand what is happening.

---

## 1. Required labels

Create these labels in GitHub before turning on the n8n/Huly automations.

### Product labels

```text
product:baseballhelm
product:golfhelm
product:coachhelm
product:platform
```

### Surface labels

```text
surface:calendar
surface:stats-import
surface:dashboard
surface:auth
surface:mobile
surface:admin
surface:ai
surface:database
surface:telemetry
surface:onboarding
surface:billing
surface:docs
```

### Severity labels

```text
severity:p0
severity:p1
severity:p2
severity:p3
```

Rules:

- `severity:p0` = production/security/data-loss/demo-killing issue. Never auto-run Claude.
- `severity:p1` = major breakage or active demo/customer blocker.
- `severity:p2` = meaningful but not urgent.
- `severity:p3` = polish, copy, backlog, minor UX.

### Source labels

```text
source:partner
source:sentry
source:posthog
source:customer
source:competitive-intel
source:claude
source:n8n
source:security
```

### Agent labels

```text
agent:needs-triage
agent:ready
agent:claude-working
agent:blocked
agent:needs-human-review
agent:done
```

Rules:

- `agent:needs-triage` is default.
- `agent:ready` is the only label that should trigger the Claude GitHub Action.
- `agent:needs-human-review` blocks automation.
- `agent:done` means the fix is merged/deployed/verified or deliberately closed.

### Risk labels

```text
risk:low
risk:medium
risk:high
```

`risk:high` means human review required before agent work or merge. Use for auth, RLS, migrations, payments, cron, secrets, production data, destructive writes, or cross-app architecture changes.

### Workflow labels

```text
workflow:bug
workflow:feature
workflow:docs
workflow:refactor
workflow:telemetry
workflow:qa
workflow:release
workflow:competitive-intel
workflow:customer-feedback
```

### Special labels

```text
demo-blocker
release-note-needed
needs-repro
needs-spec
needs-partner-decision
customer-impact
```

---

## 2. Suggested GitHub Project

Create a GitHub Project named:

```text
Helm Engineering Control
```

### Views

```text
1. Intake
2. Ready for Claude
3. Claude Working
4. Active PRs
5. Demo Blockers
6. Shipped This Week
7. Roadmap Now / Next / Later
8. High Risk Changes
9. Needs Partner Decision
```

### Custom fields

```text
Product
Surface
Severity
Risk
Agent Status
Roadmap Bucket
Target Release
Partner Visibility
Demo Impact
Huly URL
Timeline Summary
```

---

## 3. Triage workflow

```text
New partner issue
  → labels: source:partner + agent:needs-triage
  → n8n/AI enriches product/surface/severity/risk
  → if missing reproduction: add needs-repro
  → if strategic ambiguity: add needs-partner-decision
  → if safe and clear: add agent:ready
  → Claude opens PR
  → n8n posts PR timeline summary
```

Do not mark an issue `agent:ready` when:

- It involves secrets, auth, RLS, migrations, cron, payments, production data, or destructive operations.
- It lacks enough context to verify the bug.
- It is really a roadmap/product decision.
- It could expose private customer, coach, player, or school data.

---

## 4. Recommended GitHub CLI setup script

Run manually from a checked-out repo with GitHub CLI authenticated.

```bash
#!/usr/bin/env bash
set -euo pipefail

repo="njrini99-code/helmv3"

labels=(
  "product:baseballhelm|0052CC|BaseballHelm product area"
  "product:golfhelm|0E8A16|GolfHelm product area"
  "product:coachhelm|5319E7|CoachHelm product area"
  "product:platform|1D76DB|Shared platform/infrastructure"
  "surface:calendar|BFDADC|Calendar surface"
  "surface:stats-import|BFDADC|Stats/import surface"
  "surface:dashboard|BFDADC|Dashboard surface"
  "surface:auth|BFDADC|Authentication surface"
  "surface:mobile|BFDADC|Mobile surface"
  "surface:admin|BFDADC|Admin surface"
  "surface:ai|BFDADC|AI surface"
  "surface:database|BFDADC|Database surface"
  "surface:telemetry|BFDADC|Telemetry surface"
  "surface:onboarding|BFDADC|Onboarding surface"
  "surface:billing|BFDADC|Billing surface"
  "surface:docs|BFDADC|Docs surface"
  "severity:p0|B60205|Critical production/security/data issue"
  "severity:p1|D93F0B|Major blocker"
  "severity:p2|FBCA04|Important but not critical"
  "severity:p3|C5DEF5|Polish/minor/backlog"
  "source:partner|7057FF|Reported by partner"
  "source:sentry|7057FF|From Sentry"
  "source:posthog|7057FF|From PostHog"
  "source:customer|7057FF|From customer/coach"
  "source:competitive-intel|7057FF|From market/competitor research"
  "source:claude|7057FF|Created by Claude"
  "source:n8n|7057FF|Created by n8n automation"
  "source:security|B60205|Security-sensitive source"
  "agent:needs-triage|EDEDED|Needs triage before agent work"
  "agent:ready|0E8A16|Safe and ready for Claude"
  "agent:claude-working|1D76DB|Claude is working"
  "agent:blocked|D93F0B|Agent blocked"
  "agent:needs-human-review|B60205|Human review required"
  "agent:done|0E8A16|Agent work complete"
  "risk:low|0E8A16|Low risk change"
  "risk:medium|FBCA04|Medium risk change"
  "risk:high|B60205|High risk change, human required"
  "workflow:bug|D73A4A|Bug fix"
  "workflow:feature|A2EEEF|Feature/enhancement"
  "workflow:docs|0075CA|Docs change"
  "workflow:refactor|C5DEF5|Refactor"
  "workflow:telemetry|5319E7|Telemetry/observability"
  "workflow:qa|FBCA04|QA/testing"
  "workflow:release|0E8A16|Release/changelog"
  "workflow:competitive-intel|7057FF|Competitive intel"
  "workflow:customer-feedback|7057FF|Customer feedback"
  "demo-blocker|B60205|Blocks demo readiness"
  "release-note-needed|0E8A16|Needs release note"
  "needs-repro|D93F0B|Needs reproduction details"
  "needs-spec|D93F0B|Needs spec/acceptance criteria"
  "needs-partner-decision|FBCA04|Needs partner decision"
  "customer-impact|B60205|Customer-facing impact"
)

for label in "${labels[@]}"; do
  IFS='|' read -r name color description <<< "$label"
  gh label create "$name" --repo "$repo" --color "$color" --description "$description" --force
done
```

---

## 5. Manual setup checklist

- [ ] Create labels.
- [ ] Create GitHub Project: `Helm Engineering Control`.
- [ ] Add custom fields.
- [ ] Add views.
- [ ] Add one auth secret (the workflow accepts either, no edit needed): `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, uses a Pro/Max subscription) or `ANTHROPIC_API_KEY` (API billing) — only when ready.
- [ ] Add repo variable: `ENABLE_CLAUDE_CODE_ACTION=true` only after testing.
- [ ] Confirm branch protections prevent direct pushes to `main`.
- [ ] Confirm high-risk labels block the Claude workflow.

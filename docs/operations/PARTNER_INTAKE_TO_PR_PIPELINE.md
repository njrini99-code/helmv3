# Partner Intake to PR Pipeline

> Purpose: make it possible for partners to submit bugs/requests and have Helm turn them into structured issues, safe Claude/Codex PRs, reviewable fixes, and partner-visible status updates.

---

## 1. The safe version

This is possible, but the safe version is not:

```text
Partner submits bug → AI blindly edits code
```

The safe version is:

```text
Partner submits bug/request
  → n8n triages it
  → GitHub issue is created
  → system decides whether it is PR-worthy
  → branch is created
  → Claude/Codex attempts fix
  → PR opens
  → tests/review run
  → Nick approves merge
```

Same for Sentry:

```text
Sentry detects real error
  → n8n receives alert
  → severity/duplicate/recent-deploy check
  → GitHub issue
  → optional AI fix PR
  → partner timeline update
```

Core rule: **auto-create PRs, never auto-merge them.**

---

## 2. Partner request portal

Partners should use a simple form or Huly intake card, not raw GitHub.

Required fields:

```text
type: bug | request | idea | design issue | data issue
area: BaseballHelm | GolfHelm | CoachHelm | onboarding | dashboard | billing | other
severity
what happened
expected behavior
screenshot/video
URL/page
who reported it
business impact
is this blocking a demo?
```

Flow:

```text
Partner Form/Huly Card
  → n8n Webhook
  → AI cleanup
  → duplicate check
  → GitHub issue
  → command center update
```

---

## 3. Issue Court

Every partner request goes through Issue Court before it becomes work.

Verdicts:

```text
Bug: verified enough
Bug: needs reproduction
Feature request
Enhancement
Duplicate
Bad report
Strategic idea
Safe auto-PR candidate
Human decision needed
```

Example:

```text
Partner says: “The dashboard looks weird on mobile.”

Issue Court asks:
- Which dashboard?
- Which device/browser?
- Is there a screenshot?
- What should it look like?
- Is this blocking a demo?
```

If actionable, create an issue. If not, request missing info.

---

## 4. GitHub issue shape

Accepted reports should become issues like:

```md
## Summary
Partner reported that the Coach Dashboard mobile layout overflows on iPhone.

## Source
Submitted by: Partner name
Source: Partner Portal
Area: Coach Dashboard

## Evidence
- Screenshot attached
- URL: /coach/dashboard
- Device: iPhone

## Expected Behavior
Cards should stack vertically and remain inside viewport.

## Actual Behavior
Right side of trend card is clipped.

## AI Triage
Type: Bug
Confidence: 82%
Severity: Medium
Safe PR candidate: Yes

## Acceptance Criteria
- Dashboard renders correctly at mobile widths
- No horizontal overflow
- Loading and empty states remain intact
- Existing desktop layout unaffected
```

---

## 5. Auto-PR categories

### Allowed auto-PR candidates

```text
UI bugs
copy changes
docs
loading states
empty states
simple validation
tests
lint fixes
type errors
non-production config
small isolated bug fixes
```

### Blocked from auto-PR without Nick approval

```text
auth
Supabase RLS
billing
payments
user permissions
database migrations
production data changes
destructive SQL
credentials/environment changes
dependency upgrades
security-sensitive reports
large architecture rewrites
```

---

## 6. Auto-PR flow

```text
Issue labeled safe candidate
  → n8n checks blocked labels/areas
  → n8n generates implementation prompt
  → GitHub Action runs Claude/Codex
  → branch created
  → code changed
  → PR opened
  → tests run
  → CodeRabbit/Greptile/CI review
  → command center shows status
  → Nick approves merge
```

Trigger labels:

```text
agent:ready
risk:low
risk:medium
workflow:bug
workflow:docs
workflow:qa
```

Blocked labels:

```text
risk:high
severity:p0
agent:needs-human-review
source:security
```

---

## 7. Sentry version

Sentry alert flow:

```text
Sentry new issue/regression
  → n8n webhook
  → enrich with stack trace, route, environment, release, commit
  → search duplicate GitHub issues
  → assign severity
  → create GitHub issue
  → decide if safe candidate
  → trigger AI PR only if safe
  → update command center
```

Example issue summary:

```text
Sentry Bug: Coach Dashboard crash
Environment: Production
Users affected: 14
Likely area: /coach/dashboard
Error: Cannot read property 'length' of undefined

AI Assessment:
Likely missing empty-state handling when a team has no players.

Safe PR candidate: Yes
Reason: localized frontend null-check, no database migration, no auth change.
```

---

## 8. PR review gauntlet

Every auto-created PR goes through:

```text
AI created PR
  → run tests
  → run lint/typecheck
  → run CodeRabbit
  → run Greptile/Claude/Codex review if available
  → generate plain-English summary
  → assign risk score
  → require Nick approval
```

PR description should include:

```text
What this PR changes
Why it was created
Source: partner bug / Sentry alert / failed deploy / roadmap
Risk score
Files touched
What to test
Do not merge if...
Partner-readable summary
Git Activity Timeline note
```

---

## 9. Command center card pipeline

Partner-facing status pipeline:

```text
Captured
Triaged
Issue Created
Claude Working
PR Created
Reviewing
Preview Ready
Approved
Deployed
Verified
```

Partner-visible wording:

```text
Bug submitted
Engineering reviewed it
Fix in progress
Fix ready for review
Fix shipped
Fix verified
```

---

## 10. Done criteria

This pipeline works when:

- Partners can submit a report without using GitHub.
- n8n creates a clean GitHub issue.
- Duplicate and evidence checks run before work begins.
- Only safe items can become Claude PR candidates.
- Claude/Codex opens PRs instead of pushing to main.
- CI/review gates run.
- Nick approves merge.
- Huly timeline shows the whole journey in plain English.

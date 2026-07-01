# n8n Workflow Specs for Helm Mission Control

> Companion to `N8N_MAC_MINI_SETUP.md` and `HELM_MISSION_CONTROL_OS.md`.
>
> Principle: n8n can create issues, summaries, timeline events, and PR requests. It must not silently merge production code.

---

## 1. Normalized signal model

Every incoming item should become a normalized signal before it becomes an issue, roadmap item, decision, or partner update.

```text
Signal
  source
  type
  product
  surface
  summary
  evidence
  business impact
  severity
  risk
  confidence
  related links
  recommended next action
```

Sources:

```text
partner form
Huly card
Gmail
Google Drive note
GitHub issue
GitHub PR
Sentry issue
Vercel deployment
PostHog signal
coach feedback
competitor change
failed test/check
```

---

## 2. Workflow A — Partner Request to Issue Court

Trigger options:

```text
Huly card created
Google Form submitted
Gmail subject contains [Helm Issue]
Manual n8n webhook
Future mobile shortcut
```

Flow:

```text
Raw request
  → clean and structure with AI
  → search GitHub for duplicates
  → classify in Issue Court
  → create issue, decision, roadmap item, or clarification request
  → update Huly command center
  → send received confirmation
```

Issue Court verdicts:

```text
Valid bug
Likely bug, needs reproduction
Feature request
Enhancement
Duplicate
Bad report
Strategic idea
Safe PR candidate
Human decision needed
```

AI triage output fields:

```text
verdict
title
type
product
surface
severity
risk
confidence_score
missing_info
duplicate_search_terms
labels
expected_behavior
actual_behavior
reproduction_steps
acceptance_criteria
safe_pr_candidate
reason
partner_summary
```

Rules:

- Do not invent reproduction steps.
- If context is missing, ask for the smallest missing detail.
- High-risk issues must go to human review.
- Safe PR candidates should be limited to low-risk UI, copy, docs, validation, tests, and isolated bug fixes.

---

## 3. Workflow B — Issue to Claude PR Request

Trigger:

```text
GitHub issue labeled agent:ready
```

Required conditions:

```text
agent:ready
not risk:high
not severity:p0
not agent:needs-human-review
```

Flow:

```text
Issue marked ready
  → n8n safety gate
  → generate Claude implementation comment
  → post comment or trigger GitHub Action
  → update Huly status to Claude Working
  → wait for PR opened event
```

Claude request template:

```text
@claude implement this issue safely.

Create a branch and PR.
Make the smallest safe change.
Do not push to main.
Do not handle high-risk areas without human review.
Run relevant checks.
Include a partner-readable summary and Git Activity Timeline note.
If the issue is unclear or risky, stop and ask for human review.
```

Blocked areas for automation:

```text
authentication
permissions
RLS
database migrations
billing/payments
cron/production jobs
credentials or environment configuration
production data changes
broad architecture rewrites
```

---

## 4. Workflow C — Sentry to Fix Pipeline

Trigger:

```text
Sentry issue alert webhook
```

Flow:

```text
Sentry alert
  → classify new issue/regression/spike
  → enrich with route/environment/release/commit if available
  → search GitHub duplicates
  → create GitHub issue if needed
  → determine whether safe for automation
  → update Huly timeline
```

Partner summary example:

```text
Sentry detected a recurring production error in the Coach Dashboard. It appears tied to a missing empty-state check. A GitHub issue was created and marked for triage.
```

---

## 5. Workflow D — Vercel Failed Deployment to Issue

Trigger:

```text
Vercel deployment failure webhook
```

Flow:

```text
Failed deployment
  → fetch failure context/log summary
  → identify likely PR/commit
  → create or update GitHub issue
  → mark related PR as blocked in Huly
  → send Nick an alert
```

Partner summary example:

```text
The latest deployment failed before reaching production. The app is still running on the previous stable version. The failure was linked to PR #123 and is being reviewed.
```

---

## 6. Workflow E — PR Review Gauntlet

Trigger:

```text
Pull request opened or synchronized
```

Flow:

```text
PR opened
  → summarize diff for partners
  → assign risk score
  → watch checks
  → track CodeRabbit/Greptile/CI status
  → update Git Activity Timeline
  → if checks fail, mark blocked
  → if checks pass, mark ready for Nick review
```

PR summary output:

```text
what changed
why it was created
source
risk score
areas touched
what Nick should test
do not merge if...
```

---

## 7. Workflow F — Daily Helm CEO Brief

Schedule:

```text
Weekdays at 7:45 AM America/New_York
```

Inputs:

```text
GitHub issues
GitHub PRs
recent commits
Vercel deployments
Sentry issues
PostHog events
Google Drive docs
Huly roadmap and decisions
```

Output sections:

```text
executive summary
what changed yesterday
what is being fixed now
what shipped
what is blocked
failed deploys or broken checks
docs and roadmap inconsistencies
demo readiness risks
top three things Nick should do today
partner decisions needed
```

---

## 8. Workflow G — Weekly Partner Update

Schedule:

```text
Friday 4:30 PM America/New_York
```

Sections:

```text
State of Helm
What shipped
What Nick/Claude fixed
Open PRs
Active blockers
Product roadmap movement
Telemetry signals
Customer/coach feedback
Competitive intel
Docs needing partner review
Decisions needed
Next week's focus
```

---

## 9. Workflow H — Docs and Roadmap Consistency Checker

Trigger:

```text
Scheduled daily or on Google Drive/GitHub docs changes
```

Flow:

```text
Scan docs registry
  → compare product docs, pricing docs, launch docs, roadmap docs
  → detect stale or conflicting statements
  → create Docs State timeline entry
  → create issue only if action is needed
```

Example finding:

```text
BaseballHelm pricing doc mentions $1,000/team, but the launch doc mentions referral discounts. Pricing docs may be inconsistent.
```

---

## 10. Workflow I — Competitor Intelligence Tracker

Trigger:

```text
Scheduled website checks
Manual competitor note
Partner card in Huly
```

Track:

```text
pricing page changes
feature page changes
blog posts
job postings
new integrations
screenshots
launch announcements
```

Competitors to start with:

```text
Teamworks
Hudl
GameChanger
PrestoSports
SIDEARM Sports
ARMS
Blast
Rapsodo
TrackMan
Clippd
DECADE
Arccos
CoachNow
```

---

## 11. Workflow J — Roadmap Auto-Sorter

Trigger:

```text
New issue, feedback note, competitor note, or partner request
```

Buckets:

```text
must fix now
revenue feature
coach experience
player experience
recruiting
stats/imports
UI polish
technical debt
later but cool
```

Flow:

```text
new signal
  → classify roadmap bucket
  → update Huly roadmap
  → link evidence
  → avoid changing priority without confidence score and source
```

---

## 12. Non-negotiable safety rules

- No workflow auto-merges PRs.
- No workflow silently changes production data.
- No workflow sends credentials into issue text, PR descriptions, Huly cards, or AI prompts.
- High-risk changes require Nick approval.
- Every AI-generated action should create a timeline entry.
- Every partner-visible summary should be plain English.

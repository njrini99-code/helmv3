# Git Activity Timeline

> Purpose: turn GitHub, Claude, CI, Vercel, Sentry, and release activity into a plain-English timeline partners can understand.
>
> This is one of the most important parts of Helm Mission Control. It answers: “What changed today? What is Nick fixing? What shipped? What is blocked?”

---

## 1. Timeline principle

Partners do not need raw Git noise.

They need a chronological story:

```text
Captured → Triaged → Issue Created → Claude Working → PR Opened → Reviewing → Preview Ready → Approved → Deployed → Verified
```

Every timeline item should include:

```text
what happened
why it matters
current status
next step
risk
links
```

---

## 2. Event types

```text
Issue Created
Issue Triaged
Issue Needs Repro
Claude Started
Branch Created
Commit Pushed
PR Opened
CI Started
CI Passed
CI Failed
Review Requested
Changes Requested
PR Approved
PR Merged
Vercel Preview Ready
Vercel Deploy Failed
Production Deployed
Sentry Issue Created
Sentry Regression Detected
Fix Verified
Release Note Created
Partner Update Sent
```

---

## 3. Timeline card schema

```text
id
timestamp
event_type
product
surface
actor
status
risk
severity
human_summary
business_impact
next_step
github_issue_url
github_pr_url
commit_url
deployment_url
sentry_url
huly_url
related_doc_url
metadata
```

---

## 4. Partner-friendly summary examples

### PR opened

```text
PR opened — BaseballHelm Calendar
Claude opened a PR to fix time-zone calendar drift. This matters because partner demos can show events on the wrong date for players in different time zones. Status: CI running. Next: review once checks pass.
```

### PR merged

```text
Shipped — Player Dashboard Loading Fix
The player dashboard loading crash was merged. This improves demo stability and prevents a blank dashboard when player data is incomplete. Status: waiting for production deploy verification.
```

### Failed deploy

```text
Deploy blocked — Production unchanged
The latest deploy failed before reaching production, so users are still on the previous stable version. The failure appears linked to PR #123. Status: blocked. Next: Nick/Claude reviews the failing build.
```

### Sentry issue

```text
Production issue detected — Coach Dashboard
Sentry detected a recurring Coach Dashboard error affecting multiple sessions. A GitHub issue was created for triage. Status: needs review. Risk: medium until verified.
```

---

## 5. n8n workflow: GitHub event to timeline

Trigger:

```text
GitHub Trigger node
```

Events:

```text
issues
issue_comment
pull_request
pull_request_review
push
check_run
check_suite
deployment
deployment_status
release
```

Steps:

```text
1. Receive GitHub webhook.
2. Normalize event type.
3. Extract URLs and IDs.
4. Infer product/surface from labels, title, branch, changed files, or issue body.
5. Generate partner-readable summary.
6. Write/update Huly Timeline card.
7. Optional: insert into Supabase mission_events.
8. Notify only if important.
```

---

## 6. AI summary prompt

```text
Summarize this engineering event for non-technical Helm business partners.

Return:
- title
- product
- surface
- event_type
- human_summary under 80 words
- business_impact
- risk: low | medium | high
- status
- next_step

Rules:
- Write in plain English.
- Do not expose private data.
- Do not include credentials or internal tokens.
- Do not overstate certainty.
- If this is not partner-important, mark partner_visibility=false.
```

---

## 7. Daily Git Timeline digest

Schedule:

```text
Weekdays at 5:15 PM America/New_York
```

Output:

```text
# Helm Git Timeline — Today

## Shipped
- PR #118 merged: fixed player dashboard loading crash. Production deploy succeeded.

## In review
- PR #123: calendar time-zone fix. CI passed. Needs Nick review.

## Claude working
- Issue #127: CSV import validation. Claude created branch `claude/fix-csv-validation`.

## Blocked
- Issue #130: Sentry auth error needs reproduction steps from partner.

## Business translation
Today improved demo stability and reduced two known onboarding risks. No customer-facing regressions detected.
```

---

## 8. Weekly partner timeline digest

Schedule:

```text
Friday 4:30 PM America/New_York
```

Output sections:

```text
What shipped
What is in review
What Claude worked on
What Nick reviewed
What broke
What got blocked
What decisions are needed
What changed for demos/customers
Next week’s engineering focus
```

---

## 9. Partner visibility rules

Show partners:

```text
issue created
PR opened
PR merged
production deployed
fix verified
blocked work
demo risks
partner decisions needed
release notes
```

Hide or down-rank:

```text
minor commits
formatting-only changes
routine dependency noise
internal CI retries
low-signal bot comments
```

---

## 10. Status mapping

```text
GitHub issue opened → Issue Created
label agent:needs-triage → Issue Triaged or Needs Repro
label agent:ready → Ready for Claude
Claude comment/action starts → Claude Started
branch created/push → Branch Created or Commit Pushed
PR opened → PR Opened
check suite success → CI Passed
check suite failure → CI Failed
PR review requested → Review Requested
PR approved → PR Approved
PR merged → PR Merged
Vercel preview ready → Vercel Preview Ready
Vercel production success → Production Deployed
manual confirmation → Fix Verified
```

---

## 11. Definition of done

The timeline works when a partner can open Huly and understand:

- What Nick/Claude worked on today
- Which PRs exist
- What is waiting on review
- What shipped
- What failed
- Whether the app is demo-ready
- What decision is needed next

without asking Nick for a status update.

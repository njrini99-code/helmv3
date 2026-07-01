# Huly Workspace Setup for Helm Mission Control

> Purpose: configure Huly as the partner-facing Helm command center.
>
> Huly should show the truth in plain English. GitHub remains engineering truth. n8n keeps Huly updated.

---

## 1. Workspace

Create workspace:

```text
Helm Sports Labs
```

Invite partners as collaborators/commenters depending on access needs.

Do not make Huly the only source of truth for code. Huly should mirror and explain GitHub activity.

---

## 2. Required spaces

Create these spaces:

```text
Mission Control
Active Fixes / Issue Intake
Git Activity Timeline
Product Roadmap
Competitive Intel
Customer / Coach Intelligence
Docs Registry
Partner Decisions
Launch / Sales
Telemetry / App Health
```

---

## 3. Mission Control home

This is the partner home page.

Sections:

```text
Today’s Helm State
Active Fixes
Git Activity Timeline
Blockers / Demo Risks
Shipped This Week
Roadmap: Now / Next / Later
Partner Decisions Needed
Competitive Intel Highlights
Customer / Coach Signals
Docs That Need Review
```

This page should answer:

- What is Nick fixing?
- What changed today?
- What shipped?
- What is broken?
- What is blocked?
- What needs review?
- Are we demo-ready?
- What changed in the market?
- What are customers/coaches asking for?

---

## 4. Active Fixes / Issue Intake

Statuses:

```text
New Partner Report
Needs Clarification
Triaged
Ready for Claude
Claude Working
PR Open
In Review
Merged
Deployed
Verified
Closed
Won’t Fix
```

Fields:

```text
Product
Surface
Severity
Impact
Repro steps
Expected behavior
Actual behavior
Screenshot/video
Linked GitHub issue
Linked PR
Claude status
Risk level
Last Git update
Demo blocker
Customer impact
```

Partner intake rule:

A partner can write naturally, but the card must eventually become structured enough for n8n/Claude:

```text
What happened?
What should have happened?
Where did it happen?
How important is it?
Is there evidence?
```

---

## 5. Git Activity Timeline

Purpose: make Git understandable to partners.

Statuses/event types:

```text
Issue Created
Issue Triaged
Claude Started
Branch Created
Commit Pushed
PR Opened
CI Passed
CI Failed
Review Requested
Changes Requested
PR Merged
Vercel Preview Ready
Production Deployed
Fix Verified
Release Note Created
```

Fields:

```text
Timestamp
Event type
Product
Area
Human summary
Business impact
Risk
GitHub link
Related issue
Status
Actor
```

Example card:

```text
PR opened — BaseballHelm Calendar
Claude opened PR #123 to fix time-zone calendar drift. This matters because partner demos can show events on the wrong date for players in different time zones. Status: In Review. Risk: Medium. Next: wait for CI + review.
```

Views:

```text
Today
This Week
Shipped
Blocked
Claude Working
Production Events
Partner-Important Only
```

---

## 6. Product Roadmap

Create roadmap views:

```text
Now
Next
Later
Someday
Demo Critical
Revenue Critical
Needs Spec
Needs Partner Decision
```

Fields:

```text
Product
Surface
Status
Roadmap bucket
Confidence
Business value
Linked issue
Linked PR
Customer evidence
Competitor evidence
Release target
Owner
```

Status values:

```text
Idea
Spec Needed
Ready
Building
In Review
Shipped
Cut
```

---

## 7. Competitive Intel

Fields:

```text
Competitor
Sport/product relevance
Feature observed
Evidence link
Strength
Weakness
Helm opportunity
Linked roadmap item
Priority
Last reviewed
```

Competitors to seed:

```text
GameChanger
Teamworks
Hudl
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
Whoop team dashboards
```

Views:

```text
High-Priority Threats
Features to Copy
Features to Attack
Pricing Intel
Integration Intel
Baseball
Golf
Coach AI
```

---

## 8. Customer / Coach Intelligence

Fields:

```text
School/program
Sport
Contact
Current tools
Pain points
Feature request
Buying signal
Objection
Exact quote
Linked roadmap item
Follow-up date
Source
```

Views:

```text
Strong Buying Signals
Repeated Pain Points
Import Requests
Pricing Objections
Demo Feedback
Follow-Ups Due
```

---

## 9. Docs Registry

Fields:

```text
Doc name
Location
Owner
Status
Last modified
Last reviewed
Product
Decision relevance
Linked roadmap item
```

Statuses:

```text
Current
Recently Updated
Needs Review
Stale
Deprecated
Draft
```

Core docs to track:

```text
BaseballHelm product spec
GolfHelm product spec
CoachHelm product spec
Pricing strategy
Referral/launch offer
Demo script
Sales positioning
Partner roles
Stats import workflow
Agent build instructions
QA checklist
```

---

## 10. Partner Decisions

Fields:

```text
Decision
Owner
Needed by
Options
Recommendation
Impact
Status
Decision record
Linked docs
Linked roadmap
```

Statuses:

```text
Open
Needs Discussion
Decided
Deferred
Reversed
```

Examples:

```text
Are BaseballHelm and GolfHelm sold separately or under one Helm platform?
Do we launch import workflows before advanced AI?
Is pricing team/year, coach/month, or hybrid?
Which product is the next demo focus?
```

---

## 11. Telemetry / App Health

Fields:

```text
Source
Product
Metric or error
Severity
Status
First seen
Last seen
Related GitHub issue
Related PR
Business impact
Next action
```

Sources:

```text
Sentry
Vercel
PostHog
Supabase check
GitHub Actions
Playwright
Lighthouse
CodeRabbit
Greptile
```

Views:

```text
Production Issues
Failed Deploys
Broken Checks
Demo Risks
Usage Signals
Resolved This Week
```

---

## 12. Partner permissions

Recommended:

- Partners can create intake cards.
- Partners can comment on roadmap/decisions/docs.
- Partners should not edit automation settings.
- Partners should not edit n8n.
- Partners should not be able to merge PRs unless explicitly trusted.

---

## 13. Huly + GitHub sync rules

Huly should sync or link GitHub issues and PRs, but GitHub remains the engineering truth.

Rules:

```text
GitHub issue = engineering work item
Huly card = partner/product/business view
GitHub PR = code change
Huly timeline = explanation of what changed
```

Do not allow Huly status drift from GitHub. n8n should reconcile if needed.

---

## 14. Definition of done

Huly is ready when:

- A partner can submit a bug/request.
- The card can link to a GitHub issue.
- GitHub PR activity appears in the Git Activity Timeline.
- Partners can see active fixes and shipped work.
- Docs have current/stale status.
- Roadmap items link to evidence.
- Partner decisions are visible.
- Nick does not have to manually explain what changed every day.

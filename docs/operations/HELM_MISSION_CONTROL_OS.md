# Helm Mission Control OS

> **Goal:** Turn Helm Sports Labs into a real business operating system: partner issue intake, GitHub/Claude fixing flow, auto-updating PR/fix timeline, live telemetry, docs state, roadmap, competitive intel, customer feedback, and launch visibility.
>
> **Repo:** `njrini99-code/helmv3`
>
> **Audience:** Nick, business partners, Claude Code, future agents, and anyone helping operate Helm.
>
> **Core decision:** Use **Huly Cloud** as the partner-facing command center, **GitHub** as engineering truth, **n8n self-hosted on the Mac mini** as the automation engine, **Claude Code** as the fix/build agent, and **PostHog/Sentry/Vercel/Supabase** as the live product-state layer.

---

## 1. Executive summary

Helm should not be run out of scattered docs, random chats, and memory. It needs a central operating room.

The ideal partner experience:

1. Partner opens **Helm Mission Control**.
2. Partner sees what is being fixed, what shipped, what is blocked, and what decisions are needed.
3. Partner types an issue in plain English.
4. The issue becomes a structured Huly/GitHub issue.
5. n8n enriches it with product area, severity, labels, reproduction questions, and suggested priority.
6. If it is safe and clear, the issue receives `agent:ready`.
7. Claude Code investigates, creates a branch, fixes it, runs checks, and opens a PR.
8. The PR, tests, deployment preview, merge, and production release all appear in a **Git Activity Timeline**.
9. Partners get plain-English updates without needing to understand Git.

The safest version is not “partner says bug → Claude pushes to main.” The safe expert workflow is:

```text
Partner report
  → Huly card / GitHub issue
  → triage/enrichment
  → Claude branch
  → PR
  → CI/tests
  → human review for risky changes
  → merge
  → deploy
  → timeline + partner update
```

---

## 2. Tool roles

| Layer | Tool | Role | Why |
|---|---|---|---|
| Partner command center | Huly Cloud | Partner-facing HQ | GitHub sync, issues, docs, chat, planning, free enough to start |
| Engineering truth | GitHub | Issues, PRs, code, releases, CI | Source of truth for the repo |
| Automation brain | n8n on Mac mini | Connectors, webhooks, summaries, status syncing | Free if self-hosted and flexible |
| Coding agent | Claude Code + GitHub Action | Fix issues, create PRs, summarize changes | Can run from issue/PR comments and follow repo standards |
| Product telemetry | PostHog | Usage, funnels, feature adoption | Product behavior truth |
| Error telemetry | Sentry | Exceptions, stack traces, performance | Bug detection truth |
| Deploy truth | Vercel | Preview/prod deploy status | Release state truth |
| Data truth | Supabase | Optional Mission Control tables | Powers internal `/admin/mission-control` later |
| Docs truth | Huly docs + repo docs + Google Drive | Specs, strategy, launch docs | Current state of knowledge |

---

## 3. System architecture

```mermaid
flowchart TD
  Partner[Partner / Nick] -->|Plain-English issue, idea, feedback| Huly[Huly Mission Control]
  Huly <-->|issues, comments, PR refs| GitHub[GitHub Issues + PRs]

  GitHub -->|webhooks: issue, PR, push, checks, release| N8N[n8n on Mac mini]
  Vercel[Vercel Deployments] -->|webhooks| N8N
  Sentry[Sentry Issues] -->|webhooks| N8N
  PostHog[PostHog Metrics] -->|scheduled API pulls| N8N
  Drive[Google Drive / docs] -->|doc updates| N8N

  GitHub -->|@claude or agent:ready| Claude[Claude Code GitHub Action]
  Claude -->|branch + commits + PR| GitHub

  N8N -->|timeline events| Huly
  N8N -->|structured events| Supabase[(Supabase Mission Tables)]
  N8N -->|daily/weekly summaries| Partners[Email / Huly update / Slack optional]

  Supabase --> AdminUI[/admin/mission-control optional/]
```

---

## 4. Source-of-truth rules

Do not let the system rot by duplicating truth everywhere.

| Question | Source of truth | Display surface |
|---|---|---|
| What code changed? | GitHub commits/PRs | Huly timeline, optional Ops UI |
| What is being fixed? | GitHub issues synced to Huly | Huly Active Fixes |
| What shipped? | GitHub merged PR + Vercel production deploy | Huly Shipped Timeline |
| What is the roadmap? | Huly roadmap + linked GitHub issues | Huly Roadmap |
| What docs are current? | Huly docs / repo docs / Drive registry | Huly Docs State |
| What are competitors doing? | Huly Competitive Intel | Huly Competitive Intel dashboard |
| What are customers saying? | Huly Customer/Coach Feedback | Huly Customer Intelligence |
| What is the app doing live? | PostHog/Sentry/Vercel | Huly summary + optional Ops UI |
| What should Claude work on? | GitHub issue with `agent:ready` | GitHub + Huly |

---

## 5. Huly workspace design

Create one workspace: **Helm Sports Labs**.

Create these spaces/projects:

### 5.1 Mission Control

Partner home page. One page/card/dashboard that answers:

- Current state of BaseballHelm, GolfHelm, CoachHelm, TrainHelm
- What Nick is fixing now
- What shipped this week
- What is blocked
- What needs partner input
- Latest Git Activity Timeline
- Demo readiness
- Roadmap snapshot
- Customer/coaches signals
- Competitive threats

Recommended top blocks:

```text
1. Today's Helm State
2. Active Fixes
3. Git Activity Timeline
4. Blockers / Demo Risks
5. Shipped This Week
6. Roadmap: Now / Next / Later
7. Partner Decisions Needed
8. Competitive Intel Highlights
9. Customer/Coach Signals
10. Docs That Need Review
```

### 5.2 Product Roadmap

Products:

- BaseballHelm
- GolfHelm
- CoachHelm
- TrainHelm
- Helm Platform / Shared Infrastructure

Feature fields:

| Field | Type | Values / examples |
|---|---|---|
| Product | Select | BaseballHelm, GolfHelm, CoachHelm, Platform |
| Surface | Select | Coach desktop, Player mobile, Admin, Import, AI, Auth, Billing |
| Status | Select | Idea, Spec Needed, Ready, Building, In Review, Shipped, Cut |
| Roadmap bucket | Select | Now, Next, Later, Someday |
| Confidence | Select | High, Medium, Low |
| Business value | Select | Demo critical, Revenue driver, Retention, Nice-to-have |
| Linked issue | URL/relation | GitHub issue |
| Linked PR | URL/relation | GitHub PR |
| Customer evidence | Relation | Coach/customer feedback |
| Competitor evidence | Relation | Competitive intel |
| Release target | Date | Expected ship window |

### 5.3 Active Fixes / Issue Intake

This is where partners type issues.

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
Won't Fix
```

Fields:

| Field | Purpose |
|---|---|
| Product | Which Helm product is affected |
| Surface | Page/workflow affected |
| Severity | P0, P1, P2, P3 |
| Impact | Demo blocker, revenue blocker, annoying, cosmetic |
| Repro steps | What happened |
| Expected behavior | What should happen |
| Actual behavior | What happened instead |
| Screenshot/video | Evidence |
| Linked GitHub issue | Engineering truth |
| Linked PR | Fix status |
| Claude status | Not ready, Ready, Running, PR created, Needs human |
| Risk level | Low, Medium, High |
| Last Git update | Plain-English latest event |

### 5.4 Git Activity Timeline

This is mandatory based on Nick's requirement.

Purpose: summarize what Nick/Claude/GitHub are doing as a chronological feed.

Each timeline item should be plain English, not raw Git noise.

Event types:

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

Timeline card fields:

| Field | Example |
|---|---|
| Timestamp | 2026-07-01 09:43 ET |
| Event type | PR Opened |
| Product | BaseballHelm |
| Area | Calendar / Time Zones |
| Human summary | "Claude opened a PR to fix calendar events showing on the wrong day when users switch time zones." |
| Business impact | "Protects demo reliability for multi-time-zone teams." |
| Risk | Medium |
| GitHub link | PR #123 |
| Related issue | Issue #122 |
| Status | In Review |
| Actor | Nick / Claude / GitHub / Vercel / Sentry |

Timeline summary format:

```text
[09:43 AM] PR opened — BaseballHelm Calendar
Claude opened PR #123 to fix time-zone calendar drift. This matters because partner demos can show events on the wrong date for players in different time zones. Status: In Review. Risk: Medium. Next: wait for CI + review.
```

Daily digest format:

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

### 5.5 Competitive Intel

Track competitors like:

- GameChanger
- Teamworks
- INFLCR / Teamworks ecosystem
- Hudl
- PrestoSports
- SIDEARM Sports
- TrackMan
- Rapsodo
- DiamondKast
- Clippd
- DECADE
- Arccos
- CoachNow
- Whoop team dashboards

Fields:

| Field | Purpose |
|---|---|
| Competitor | Name |
| Sport/product relevance | Baseball, Golf, Coach AI, Admin |
| Feature observed | What they do |
| Evidence link | URL/screenshot/doc |
| Strength | Why it matters |
| Weakness | Where Helm can beat it |
| Helm opportunity | What to build or position |
| Linked roadmap item | Feature connection |
| Priority | P0-P3 |
| Last reviewed | Date |

### 5.6 Customer / Coach Intelligence

Each coach conversation becomes data.

Fields:

| Field | Purpose |
|---|---|
| School/program | Target account |
| Sport | Baseball/Golf/etc. |
| Contact | Coach/admin |
| Current tools | GameChanger, Excel, Presto, Sidearm, TrackMan, etc. |
| Pain points | Manual work, visibility, recruiting, stats, scheduling |
| Feature request | What they asked for |
| Buying signal | Strong, medium, weak |
| Objection | Price, trust, integration, time |
| Exact quote | Voice of customer |
| Linked roadmap | Feature relation |
| Follow-up date | Sales action |

### 5.7 Docs Registry

Partners need to know which docs are current.

Fields:

| Field | Example |
|---|---|
| Doc name | BaseballHelm Product Spec |
| Location | Huly / GitHub / Google Drive |
| Owner | Nick |
| Status | Current, Needs Update, Deprecated, Draft |
| Last modified | Date |
| Last reviewed | Date |
| Product | BaseballHelm |
| Decision relevance | Pricing, product, launch, legal |
| Linked roadmap | Feature/product relation |

### 5.8 Partner Decisions

Fields:

| Field | Example |
|---|---|
| Decision | Should we launch BaseballHelm import first or Coach AI first? |
| Owner | Nick / partner |
| Needed by | Date |
| Options | A/B/C |
| Recommendation | Preferred option |
| Impact | Revenue, product, legal, launch |
| Status | Open, Decided, Deferred |
| Decision record | Final rationale |

---

## 6. GitHub setup

### 6.1 Labels

Create labels:

```text
product:baseballhelm
product:golfhelm
product:coachhelm
product:platform

surface:calendar
surface:stats-import
surface:dashboard
surface:auth
surface:mobile
surface:admin
surface:ai
surface:database
surface:telemetry

severity:p0
severity:p1
severity:p2
severity:p3

source:partner
source:sentry
source:posthog
source:customer
source:competitive-intel
source:claude

agent:needs-triage
agent:ready
agent:claude-working
agent:blocked
agent:needs-human-review
agent:done

risk:low
risk:medium
risk:high

workflow:bug
workflow:feature
workflow:docs
workflow:refactor
workflow:telemetry
workflow:qa

demo-blocker
release-note-needed
needs-repro
needs-spec
```

### 6.2 Issue forms

Create `.github/ISSUE_TEMPLATE/partner_bug.yml`:

```yaml
name: Partner Bug / App Issue
description: Report something broken or confusing in Helm
title: "[Partner Bug]: "
labels: ["source:partner", "agent:needs-triage", "workflow:bug"]
body:
  - type: dropdown
    id: product
    attributes:
      label: Product
      options:
        - BaseballHelm
        - GolfHelm
        - CoachHelm
        - TrainHelm
        - Helm Platform
    validations:
      required: true
  - type: input
    id: surface
    attributes:
      label: Page, tab, or workflow
      placeholder: Calendar, stats import, player dashboard, coach dashboard, auth, etc.
    validations:
      required: true
  - type: textarea
    id: problem
    attributes:
      label: What happened?
      description: Explain it like you would text Nick.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What should have happened?
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: 1. Go to... 2. Click... 3. See...
  - type: dropdown
    id: impact
    attributes:
      label: Impact
      options:
        - Demo blocker
        - Customer blocker
        - Annoying but usable
        - Cosmetic
        - Not sure
    validations:
      required: true
  - type: textarea
    id: evidence
    attributes:
      label: Screenshot, video, link, or extra notes
```

Create `.github/ISSUE_TEMPLATE/feature_request.yml`:

```yaml
name: Feature / Enhancement
description: Suggest an improvement, product idea, or partner request
title: "[Feature]: "
labels: ["workflow:feature", "agent:needs-triage"]
body:
  - type: dropdown
    id: product
    attributes:
      label: Product
      options:
        - BaseballHelm
        - GolfHelm
        - CoachHelm
        - TrainHelm
        - Helm Platform
    validations:
      required: true
  - type: textarea
    id: request
    attributes:
      label: What should Helm do?
    validations:
      required: true
  - type: textarea
    id: why
    attributes:
      label: Why does this matter?
      description: Connect it to coaches, players, revenue, demos, or competitive advantage.
    validations:
      required: true
  - type: textarea
    id: evidence
    attributes:
      label: Customer/competitor evidence
  - type: dropdown
    id: priority
    attributes:
      label: Priority guess
      options:
        - Must have now
        - Soon
        - Later
        - Not sure
```

### 6.3 GitHub Projects fields

Even if Huly is the partner HQ, create a GitHub Project as the engineering backup:

```text
Project: Helm Engineering Control
Views:
- Intake
- Ready for Claude
- Active PRs
- Demo Blockers
- Shipped This Week
- Roadmap Now/Next/Later
- High Risk Changes
```

Fields:

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
Linked Huly Card
```

---

## 7. Claude Code setup

### 7.1 Root `CLAUDE.md`

Create or update root `CLAUDE.md` with this operating contract:

```md
# Claude Operating Rules for Helm

You are working in `njrini99-code/helmv3`, the Helm Sports Labs app.

## Non-negotiables
- Never commit secrets, API keys, tokens, `.env` files, or private credentials.
- Never push directly to `main`.
- Always create a branch and PR for product code changes.
- Always run relevant checks before finalizing: `npm run typecheck`, targeted tests, and lint where practical.
- If touching Supabase RLS, auth, payments, migrations, production cron, secrets, or destructive data flows, mark the PR `risk:high` and require human review.
- If behavior changes, update docs or add a release note.
- Prefer small, reviewable PRs.
- Do not rewrite large files unnecessarily.
- Do not delete migrations or data without explicit human approval.

## Current stack
- Next.js / React / TypeScript
- Supabase
- Vercel
- Sentry
- PostHog
- Datadog RUM where configured
- Vitest / Playwright / promptfoo / Lighthouse CI

## Fix workflow
1. Read the issue carefully.
2. Identify product, surface, severity, risk, and likely files.
3. Reproduce or reason from tests/logs.
4. Make the smallest safe fix.
5. Add or update tests when practical.
6. Run checks.
7. Open a PR with:
   - What changed
   - Why it matters
   - Tests run
   - Risk level
   - Screenshots if UI changed
   - Follow-up issues if needed

## Partner summary style
Write summaries in plain English for business partners:
- What was broken
- What changed
- Why it matters
- Risk
- What still needs review
```

### 7.2 Claude GitHub Action

Create `.github/workflows/claude-code.yml`:

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [labeled]

permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write

concurrency:
  group: claude-${{ github.event.issue.number || github.event.pull_request.number || github.run_id }}
  cancel-in-progress: false

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'issues' && github.event.label.name == 'agent:ready')
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude Code
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: |
            --max-turns 10
            --append-system-prompt "Follow CLAUDE.md. Create a branch and PR. Do not push to main. For high-risk changes, stop and ask for human review. Always include a partner-readable summary."
```

Recommended activation:

- Nick or trusted partner can comment: `@claude fix this safely and open a PR.`
- n8n can add label `agent:ready` only after triage.
- For P0/security/database/auth issues, n8n should add `agent:needs-human-review`, not `agent:ready`.

---

## 8. n8n on Mac mini

### 8.1 Folder layout

```bash
mkdir -p ~/helm-ops/n8n
cd ~/helm-ops/n8n
```

### 8.2 Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      GENERIC_TIMEZONE: America/New_York
      TZ: America/New_York
      N8N_HOST: ${N8N_HOST}
      N8N_PROTOCOL: https
      WEBHOOK_URL: ${WEBHOOK_URL}
      N8N_EDITOR_BASE_URL: ${N8N_EDITOR_BASE_URL}
      N8N_DIAGNOSTICS_ENABLED: "false"
      N8N_PERSONALIZATION_ENABLED: "false"
    depends_on:
      - postgres
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  postgres_data:
  n8n_data:
```

Create `.env`:

```bash
POSTGRES_PASSWORD=generate-a-long-random-password
N8N_ENCRYPTION_KEY=generate-a-32-plus-character-random-key
N8N_HOST=n8n.your-domain.com
WEBHOOK_URL=https://n8n.your-domain.com/
N8N_EDITOR_BASE_URL=https://n8n.your-domain.com/
```

Start:

```bash
docker compose up -d
```

### 8.3 Access pattern

- Admin access: Tailscale/private preferred.
- Public webhooks: Cloudflare Tunnel preferred.
- Do not expose the editor publicly without strong auth.
- Keep n8n updated because workflow editors and code nodes are sensitive.

### 8.4 n8n security rules

- Only Nick should be an n8n admin.
- Partners should never edit n8n workflows.
- Avoid arbitrary Code nodes where possible.
- Keep credentials scoped: GitHub token only for needed repo; Huly credentials only for workspace; Sentry/PostHog read tokens only when enough.
- Back up Postgres and n8n credentials.
- Rotate credentials if the Mac mini is compromised.

---

## 9. n8n workflows to build

### Workflow A — Partner issue intake → GitHub/Huly

Trigger options:

1. Huly issue created in Active Fixes.
2. GitHub issue form submitted.
3. Optional future Helm form: `/admin/report-issue`.

Steps:

```text
1. Receive issue/card.
2. Normalize fields: product, surface, severity, source, impact.
3. If missing repro, mark `needs-repro` and ask clarifying questions.
4. If valid, create/sync GitHub issue.
5. Add labels.
6. Add issue to GitHub Project.
7. Create Git Activity Timeline event: Issue Created.
8. If safe and low/medium risk, set `agent:ready`; otherwise set `agent:needs-human-review`.
9. Post partner-readable summary in Huly.
```

AI enrichment prompt:

```text
You are Helm's triage assistant. Convert this partner report into a structured engineering issue.
Return JSON with: title, product, surface, severity, risk, labels, expected_behavior, actual_behavior, repro_steps, missing_info, partner_summary, recommended_next_action, safe_for_claude_boolean.
Do not invent reproduction steps. If unclear, ask for exactly the missing details.
```

### Workflow B — GitHub event → Git Activity Timeline

Trigger:

- GitHub Trigger node
- Events: issues, issue_comment, pull_request, pull_request_review, pull_request_review_comment, push, check_run, check_suite, deployment, deployment_status, release

Steps:

```text
1. Receive GitHub webhook.
2. Classify event type.
3. Find related issue/PR.
4. Generate partner-readable summary.
5. Update Huly Git Activity Timeline.
6. Optionally insert into Supabase `mission_events`.
7. If event is PR merged, create release-note draft.
8. If event is CI failed, mark blocked and alert Nick.
```

Timeline summarization prompt:

```text
Summarize this GitHub event for non-technical Helm business partners.
Explain:
1. What happened
2. Which product/surface it affects
3. Why it matters for demos/customers/revenue
4. Current status
5. Next step
Keep it under 80 words.
Avoid raw commit jargon unless needed.
```

Example output:

```text
PR opened — BaseballHelm Calendar
Claude opened a PR to fix calendar events appearing on the wrong day after a time-zone change. This protects demo reliability for teams with players in different regions. Status: CI running. Next: review once checks pass.
```

### Workflow C — Claude started / Claude done

Trigger:

- GitHub issue labeled `agent:ready`
- Claude comment appears
- Claude PR opened

Steps:

```text
1. Mark Huly card as Claude Working.
2. Create timeline event: Claude Started.
3. When PR opens, mark PR Open and link PR.
4. When PR merges, mark Merged.
5. When Vercel deploys, mark Deployed.
6. When Nick/partner verifies, mark Verified.
```

### Workflow D — PR merge → shipped update

Trigger:

- Pull request closed with `merged = true`

Steps:

```text
1. Extract PR title/body/labels/linked issues.
2. Generate shipped summary.
3. Move Huly issue to Merged or Deployed depending on deploy status.
4. Add to `Shipped This Week` view.
5. Add release note draft.
6. Notify partners if label includes `demo-blocker`, `customer-impact`, or `release-note-needed`.
```

Shipped summary template:

```text
Shipped: {plain-English title}
Product: {product}
Impact: {why it matters}
Risk: {low/medium/high}
Verification: {tests/checks/deploy}
Links: {PR} {issue}
```

### Workflow E — Vercel deployment feed

Trigger:

- Vercel webhook for deployment created / ready / error

Steps:

```text
1. Create timeline event for preview/prod deploy.
2. Link deployment to PR if available.
3. If production deploy succeeds after merged PR, mark issue Deployed.
4. If deploy fails, mark Blocked and notify Nick.
```

### Workflow F — Sentry issue → GitHub/Huly issue

Trigger:

- Sentry issue created or regression detected

Rules:

```text
If error affects production and count > threshold:
  create GitHub issue with `source:sentry`, product/surface labels if known.
If user-facing/demo-blocking:
  add `severity:p1` or `demo-blocker`.
If stack trace maps to known feature:
  link to roadmap/feature.
```

Partner summary example:

```text
Sentry detected a recurring production error in the player dashboard. It has happened 14 times today and may affect demo reliability. A GitHub issue was created and marked for triage.
```

### Workflow G — PostHog usage digest

Schedule:

- Daily at 7:30 AM ET
- Weekly Monday at 8:00 AM ET

Pull:

- Active users
- Key events
- Feature adoption
- Signup/onboarding funnel
- Demo-critical events
- Rage clicks/session recordings if configured

Output:

```text
Product usage changed this week:
- Coach dashboard visits: +22%
- Stats import attempts: 18
- Failed imports: 4
- Most used feature: roster dashboard
- Weakest funnel step: account setup → team creation
Recommended product action: improve import validation and onboarding copy.
```

### Workflow H — Docs freshness

Trigger:

- Google Drive file modified
- GitHub docs changed
- Huly docs updated
- Weekly stale-doc scan

Rules:

```text
Core docs stale after 14 days if product is actively changing.
Launch docs stale after 7 days during launch period.
Architecture docs stale when related code PR merges.
Pricing docs stale when partner decision changes.
```

Huly Docs State statuses:

```text
Current
Recently Updated
Needs Review
Stale
Deprecated
```

### Workflow I — Competitive intel capture

Trigger options:

- Huly card created in Competitive Intel
- Google Form submitted
- Nick drops URL in a designated Huly channel

Steps:

```text
1. Capture competitor/source/link/screenshot.
2. Summarize what matters.
3. Extract feature gaps.
4. Link to roadmap item or create one.
5. Add to weekly partner digest if high-impact.
```

### Workflow J — Weekly State of Helm

Schedule:

- Friday 4:30 PM ET or Monday 8:00 AM ET

Sections:

```text
# State of Helm

## Executive summary
## What shipped
## What Nick/Claude fixed
## Open PRs
## Active blockers
## Product roadmap movement
## Telemetry signals
## Customer/coach feedback
## Competitive intel
## Docs needing partner review
## Decisions needed
## Next week's focus
```

---

## 10. Optional Supabase mission-control tables

Add these only if building `/admin/mission-control` inside Helm.

```sql
create table if not exists mission_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null,
  event_type text not null,
  product text,
  surface text,
  severity text,
  risk text,
  title text not null,
  summary text not null,
  business_impact text,
  status text,
  actor text,
  github_issue_url text,
  github_pr_url text,
  deployment_url text,
  huly_url text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists mission_docs_registry (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  product text,
  owner text,
  location_type text not null,
  location_url text not null,
  status text not null default 'Needs Review',
  last_modified_at timestamptz,
  last_reviewed_at timestamptz,
  stale_after_days int not null default 14,
  notes text
);

create table if not exists mission_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  product text,
  owner text,
  status text not null default 'Open',
  needed_by date,
  options jsonb not null default '[]'::jsonb,
  recommendation text,
  final_decision text,
  rationale text,
  huly_url text
);

create table if not exists mission_agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agent text not null default 'Claude',
  trigger_type text not null,
  trigger_url text,
  issue_url text,
  pr_url text,
  status text not null,
  summary text,
  tests_run text,
  risk text,
  metadata jsonb not null default '{}'::jsonb
);
```

RLS guidance:

- Only authenticated internal users should read mission tables.
- Only service-role/n8n should insert events.
- Partners should not get raw service tokens.
- Never expose n8n credentials or Supabase service role in the browser.

---

## 11. Optional internal UI: `/admin/mission-control`

Build this after Huly/n8n works.

### 11.1 Page layout

```text
/admin/mission-control

Top bar:
- Helm Mission Control
- Last updated
- Environment: production / preview
- Demo readiness score

Left column:
- Current App State
- Demo Blockers
- Active Fixes
- Partner Decisions Needed

Center:
- Git Activity Timeline
- PRs in Review
- Shipped This Week
- Claude Agent Activity

Right column:
- Sentry alerts
- PostHog usage signals
- Vercel deploy status
- Docs needing review
- Competitive intel highlights
```

### 11.2 UI vibe

Make it feel premium and alive:

- Dark command-center mode
- Status pills
- Live event stream
- Product cards for BaseballHelm/GolfHelm/CoachHelm
- Small sparklines for usage/error trends
- Timeline grouped by Today / Yesterday / This Week
- “Business translation” under technical events
- “Next action” on every blocker

### 11.3 Components

```text
MissionControlPage
ProductStateCard
GitTimelineFeed
ActiveFixesBoard
ShippedThisWeekPanel
AgentRunsPanel
TelemetryHealthPanel
DocsFreshnessPanel
CompetitiveIntelPanel
PartnerDecisionsPanel
DemoReadinessScore
```

### 11.4 Demo readiness score

Calculate 0-100 from:

```text
- P0/P1 open bugs
- demo-blocker labels
- production deploy status
- Sentry production error volume
- core workflows passing tests
- docs current/stale
- roadmap/demo features status
```

Example:

```text
100 = demo-ready
80-99 = good, minor issues
60-79 = demo with caution
40-59 = risky
0-39 = do not demo
```

---

## 12. Expert operating workflows

### 12.1 Issue quality gate

No issue should reach `agent:ready` unless it has:

- Product
- Surface
- Actual behavior
- Expected behavior
- Impact
- Repro or enough context
- Risk classification

If missing context, n8n/Huly asks for clarification instead of wasting Claude tokens.

### 12.2 Claude-ready gate

Safe for Claude:

- UI bugs
- Small logic fixes
- Docs updates
- Test additions
- Low-risk refactors
- Non-destructive validation fixes

Needs human review before Claude or before merge:

- Auth
- RLS/security
- Payments
- Production cron/secrets
- Database migrations
- Data deletion
- Multi-table writes
- Anything touching service-role logic
- Large architecture rewrites

### 12.3 PR standard

Every PR must include:

```text
## Summary
## Why it matters
## Linked issue
## Screenshots/video if UI
## Tests run
## Risk level
## Rollback plan
## Partner-readable summary
```

### 12.4 CI minimum

For every PR:

```bash
npm run typecheck
npm run lint:ratchet || npm run lint
npm run test:run
```

For UI changes:

```bash
npm run test:e2e
npm run ui:screenshots
```

For docs/knowledge changes:

```bash
npm run docs:check
npm run knowledge:check
```

For performance-sensitive pages:

```bash
npm run lighthouse
```

### 12.5 Release workflow

```text
PR merged
  → Vercel preview/prod deploy event
  → n8n marks issue Deployed
  → timeline event created
  → release note draft created
  → if customer/partner-facing, partner digest updated
  → if demo-blocker, notify immediately
```

---

## 13. Partner-facing templates

### 13.1 Partner issue form copy

```text
Tell us what is broken or confusing. You can write it naturally.

Good report:
“The player calendar shows tomorrow’s lift on today’s date after I changed the team timezone from Eastern to Central. It happened on the player dashboard, not the coach dashboard.”

Include if possible:
- Product
- Page/tab
- What you clicked
- What happened
- What you expected
- Screenshot/video
```

### 13.2 Partner status language

Avoid:

```text
Merged commit a83fd into main after patching date-fns conversion.
```

Use:

```text
The calendar time-zone bug was fixed and merged. Players should now see events on the correct day when teams operate across time zones. It is waiting on production deploy verification.
```

---

## 14. Implementation phases

### Phase 1 — Foundation, 1 day

- Create Huly workspace.
- Connect Huly to GitHub repo.
- Create Huly spaces from this doc.
- Create GitHub labels.
- Add issue templates.
- Add root `CLAUDE.md`.
- Add Claude GitHub Action.
- Run n8n on Mac mini with Docker.

### Phase 2 — Auto-updating timeline, 1-2 days

- Configure GitHub Trigger in n8n.
- Build Git Activity Timeline workflow.
- Add PR merged → Shipped This Week automation.
- Add CI failed → blocker automation.
- Add daily Git digest.

### Phase 3 — Partner intake, 1-2 days

- Build Huly issue intake template.
- Sync Huly → GitHub.
- Build n8n enrichment workflow.
- Add `agent:ready` gate.
- Test a fake partner bug end-to-end.

### Phase 4 — Telemetry, 2-4 days

- Configure Sentry webhooks.
- Configure Vercel webhooks.
- Pull PostHog daily metrics.
- Create telemetry summary timeline events.
- Auto-create GitHub issues from serious production errors.

### Phase 5 — Docs + competitive intel, 2-4 days

- Create Docs Registry.
- Connect Google Drive/GitHub docs changes.
- Create Competitive Intel cards.
- Build competitor → roadmap linking process.
- Add weekly State of Helm report.

### Phase 6 — Internal cockpit, later

- Add mission-control Supabase tables.
- Build `/admin/mission-control`.
- Add event stream UI.
- Add demo readiness score.
- Add agent runs panel.

---

## 15. Master prompt for Claude Code

Use this prompt in Claude Code after this doc is committed:

```text
Read `docs/operations/HELM_MISSION_CONTROL_OS.md` and implement Phase 1 safely.

Context:
- Repo is `njrini99-code/helmv3`.
- The goal is a partner-facing Helm Mission Control system using Huly + GitHub + n8n + Claude Code.
- Do not implement the internal `/admin/mission-control` UI yet unless explicitly asked.

Tasks:
1. Add or update root `CLAUDE.md` with the operating rules from the doc.
2. Add GitHub issue templates under `.github/ISSUE_TEMPLATE/`:
   - partner bug/app issue
   - feature/enhancement
3. Add `.github/workflows/claude-code.yml` with a safe `@claude` / `agent:ready` trigger.
4. Add `.github/labels.yml` or a script to create the recommended labels if the repo uses label sync; otherwise create a docs checklist for manual label setup.
5. Add `docs/operations/N8N_MAC_MINI_SETUP.md` with the Docker Compose instructions and workflow list.
6. Add `docs/operations/HULY_WORKSPACE_SETUP.md` with exact Huly spaces, statuses, fields, and views.
7. Add `docs/operations/GIT_ACTIVITY_TIMELINE.md` with the n8n GitHub webhook workflow, event schemas, summarization prompts, and partner digest templates.

Safety rules:
- Do not add secrets.
- Do not change app runtime behavior.
- Do not touch Supabase migrations yet.
- Do not create production webhooks yet.
- Keep this PR docs/config-only unless explicitly approved.

Before final response:
- Run a lightweight validation of YAML/Markdown where possible.
- Summarize files changed.
- Explain exact manual setup steps Nick must do in Huly, GitHub secrets, and n8n.
```

---

## 16. Definition of done

The first version is successful when:

- Partners can create an issue in Huly.
- The issue syncs or is copied to GitHub.
- The issue gets labels/product/severity.
- Nick can approve it with `agent:ready` or `@claude`.
- Claude opens a PR.
- Huly shows the linked PR.
- n8n writes a timeline event for issue created, PR opened, CI result, PR merged, and deployed.
- Partners can read the timeline and understand what happened without asking Nick.
- Weekly State of Helm report is generated automatically.

---

## 17. What not to do

Do not:

- Put partners directly in n8n.
- Let Claude auto-merge risky changes.
- Use Notion as the core truth source.
- Self-host Huly first unless Huly Cloud fails your needs.
- Build the fancy internal cockpit before the workflow works.
- Create five dashboards with conflicting truth.
- Let every competitor note become a roadmap item without triage.
- Let AI issues skip human review for auth/database/security.

---

## 18. Genius upgrades once the basics work

### 18.1 Demo War Room

A dashboard view for upcoming demos:

- Demo date
- Target school/program
- Product surface being shown
- Open demo blockers
- Last successful production deploy
- Sentry errors in demo path
- Talking points
- Backup plan

### 18.2 Feature Confidence Score

Every roadmap item gets a confidence score based on:

- customer evidence
- competitive evidence
- implementation clarity
- data availability
- revenue impact
- technical risk

### 18.3 Agent Swarm Board

Create Huly view:

```text
Research Agent
Spec Agent
Builder Agent
QA Agent
Security Agent
Docs Agent
Release Agent
```

Each issue can be decomposed into agent subtasks. Claude Code can implement; separate reviews can critique.

### 18.4 Bug Autopsy

After every P0/P1 fix:

```text
What broke?
Why did it break?
Why did tests not catch it?
What telemetry caught it?
What guardrail prevents recurrence?
What partner/customer was affected?
```

### 18.5 Roadmap from reality

Every week n8n/Claude ranks roadmap items using:

- coach feedback count
- competitor gap importance
- open bug volume
- telemetry drop-off
- demo blocker count
- revenue opportunity

Output:

```text
Recommended roadmap changes this week:
1. Move CSV import validation to Now because 4 failed imports and 2 coach requests.
2. Delay advanced AI chat because no current demo blockers depend on it.
3. Promote calendar timezone hardening because it affects partner demo trust.
```

### 18.6 Investor/partner update mode

Monthly report:

- shipped features
- usage growth
- customer learning
- competitive positioning
- risks
- asks
- next milestones

---

## 19. Final operating model

The whole system should feel like this:

```text
Huly = where partners see and collaborate
GitHub = where engineering truth lives
n8n = what keeps everything updated
Claude = what fixes and summarizes
PostHog/Sentry/Vercel = what proves reality
Supabase/Admin UI = optional custom cockpit
```

The most important thing is the timeline.

If partners can see this, Helm will feel like a real company:

```text
9:02 AM — Partner reported calendar bug
9:06 AM — Issue triaged as BaseballHelm / Calendar / P1
9:08 AM — Claude started investigation
9:23 AM — Branch created
9:48 AM — PR opened
9:55 AM — Typecheck passed
10:02 AM — Preview deploy ready
10:14 AM — Nick reviewed
10:18 AM — PR merged
10:26 AM — Production deployed
10:35 AM — Fix verified
```

That is Helm Mission Control.

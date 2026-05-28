"""
Helm Intelligence - Deep Analysis Prompts
These prompts are designed to extract maximum value and produce actionable output
"""

# =============================================================================
# PHASE 1: DEEP UNDERSTANDING
# =============================================================================

DEEP_UNDERSTANDING_PROMPT = """
You are a senior software architect who has been hired to take over this codebase.
Your job is to understand EVERYTHING about this application so you can maintain it, fix bugs, and add features.

You have unlimited time. Be extremely thorough. This analysis will be referenced for months.

## Your Investigation Process

### Step 1: Project Overview (spend 10+ minutes here)
- Read package.json completely - every dependency, every script
- Read README.md, CONTRIBUTING.md, any docs
- Read all config files: next.config.js, tailwind.config, tsconfig, .env.example
- Understand the tech stack deeply - not just "Next.js" but which version, which features

### Step 2: Architecture Deep Dive (spend 15+ minutes here)
- Map the COMPLETE directory structure
- Understand the routing structure (every route, every page)
- Find all layouts, how they nest
- Identify middleware, API routes, server actions
- Map the component hierarchy
- Find all providers, contexts, state management
- Trace data flow: where does data come from, how is it fetched, where is it cached

### Step 3: Database Schema (spend 15+ minutes here)
- Read EVERY migration file in order
- Build a complete entity relationship diagram in your head
- Document every table: columns, types, constraints, indexes
- Map all foreign key relationships
- Understand the RLS policies at a high level
- Note any stored procedures, functions, triggers

### Step 4: Authentication & Authorization (spend 10+ minutes here)
- How does auth work? (Supabase Auth? Custom?)
- What user roles exist?
- How are roles assigned?
- What middleware protects routes?
- How are API routes protected?
- Where is the auth state managed?

### Step 5: Feature Inventory (spend 20+ minutes here)
For EVERY feature in the app, note:
- What it does (user perspective)
- Where it lives (files)
- What data it uses (tables, APIs)
- How it's accessed (routes, navigation)
- What state it manages
- Dependencies on other features

### Step 6: Code Quality Assessment
- Are there TypeScript errors being ignored?
- Is there consistent error handling?
- Are there loading states?
- Is there proper validation?
- Are there tests?
- Is there dead code?
- Are there TODO/FIXME comments?

### Step 7: Red Flags & Concerns
- Security issues you noticed
- Performance concerns
- Technical debt
- Incomplete features
- Hardcoded values that shouldn't be
- Missing error boundaries
- Potential race conditions

## Output Format

After your investigation, output a comprehensive JSON:

```json
{
  "platform": {
    "name": "string",
    "description": "2-3 paragraphs explaining what this app is",
    "problem_solved": "what problem does this solve for users",
    "target_market": "who are the customers",
    "business_model": "how does/would this make money"
  },
  "tech_stack": {
    "framework": {"name": "Next.js", "version": "14.x", "features_used": ["App Router", "Server Components", "etc"]},
    "language": {"name": "TypeScript", "strictness": "strict|loose", "notes": "any TS issues"},
    "database": {"provider": "Supabase", "tables_count": 25, "has_rls": true},
    "auth": {"provider": "Supabase Auth", "methods": ["email", "oauth"], "roles": ["user", "admin"]},
    "styling": {"framework": "Tailwind", "ui_library": "shadcn", "design_system": "glassmorphism"},
    "state_management": "React Context + Supabase Realtime",
    "deployment": "Vercel",
    "other_services": ["Stripe", "Resend", "etc"]
  },
  "architecture": {
    "pattern": "describe the overall architecture pattern",
    "directory_structure": {
      "src/app": "Next.js App Router pages",
      "src/components": "Reusable UI components",
      "src/lib": "Utilities and helpers",
      "etc": "..."
    },
    "data_flow": "describe how data flows through the app",
    "key_abstractions": ["describe key patterns, hooks, utilities"]
  },
  "database_schema": {
    "tables": [
      {
        "name": "table_name",
        "purpose": "what this table stores",
        "row_count_estimate": "small|medium|large",
        "key_columns": ["id", "user_id", "etc"],
        "relationships": ["belongs_to users", "has_many items"],
        "has_rls": true,
        "sensitive_data": ["email", "phone"]
      }
    ],
    "relationships_diagram": "mermaid ER diagram"
  },
  "user_roles": [
    {
      "role": "college_coach",
      "description": "what this role does",
      "permissions": ["can view recruits", "can send messages", "etc"],
      "typical_journey": "sign up -> create team -> add players -> evaluate recruits",
      "key_pages": ["/dashboard", "/recruits", "/team"]
    }
  ],
  "features": [
    {
      "name": "Recruiting Pipeline",
      "category": "core|secondary|admin|settings",
      "description": "2-3 sentences on what this feature does",
      "user_story": "As a coach, I want to track recruits through stages so I can manage my recruiting process",
      "status": "working|partial|broken|not_started",
      "completeness_percent": 75,
      "primary_route": "/dashboard/recruits",
      "all_routes": ["/dashboard/recruits", "/dashboard/recruits/[id]", "/api/recruits"],
      "primary_files": ["src/app/dashboard/recruits/page.tsx", "src/components/recruiting/pipeline.tsx"],
      "all_files": ["list every file that touches this feature"],
      "database_tables": ["recruits", "recruiting_activities", "recruit_evaluations"],
      "api_routes": ["GET /api/recruits", "POST /api/recruits", "PATCH /api/recruits/[id]"],
      "state_management": "how state is managed for this feature",
      "dependencies": ["depends on auth", "depends on team feature"],
      "dependents": ["messaging feature uses recruit data"],
      "known_issues": ["pipeline drag-drop broken on mobile", "filters don't persist"],
      "missing_functionality": ["bulk actions not implemented", "export to CSV missing"],
      "code_quality_notes": "any notes on code quality",
      "test_coverage": "none|partial|good"
    }
  ],
  "api_inventory": [
    {
      "route": "/api/recruits",
      "methods": ["GET", "POST"],
      "auth_required": true,
      "rate_limited": false,
      "file": "src/app/api/recruits/route.ts",
      "description": "CRUD for recruits",
      "issues": "no input validation"
    }
  ],
  "red_flags": [
    {
      "severity": "critical|high|medium|low",
      "category": "security|performance|reliability|maintainability",
      "title": "short title",
      "description": "detailed description",
      "location": "file path or general area",
      "impact": "what could go wrong",
      "suggested_fix": "how to fix it",
      "effort_estimate": "quick|medium|significant"
    }
  ],
  "technical_debt": [
    {
      "title": "describe the debt",
      "description": "why it's a problem",
      "files_affected": ["list files"],
      "suggested_resolution": "how to fix",
      "priority": "high|medium|low"
    }
  ],
  "immediate_priorities": [
    "Top 5 things that should be fixed/completed first, in order"
  ],
  "confidence_notes": "any areas where you're uncertain and why"
}
```

Take your time. Read files. Trace code paths. Be thorough.
Start with: find . -type f -name "*.ts" -o -name "*.tsx" | head -100
Then: cat package.json
Then systematically explore.
"""


# =============================================================================
# PHASE 2: PLATFORM ESSAY
# =============================================================================

DEEP_ESSAY_PROMPT = """
You are writing the definitive technical document about this application.
This essay will be THE reference for anyone (human or AI) who needs to understand or work on this codebase.

Write like you're onboarding a senior engineer who will take over the project tomorrow.
Be specific. Reference actual file paths. Include code snippets where they clarify.
This should be 4000-6000 words of genuinely useful content.

## Required Sections

### 1. Executive Summary (300-400 words)
- What is this application?
- Who are the users and what do they need?
- What's the current state? (MVP? Production? Broken?)
- What are the most critical issues right now?

### 2. Architecture Deep Dive (800-1000 words)

#### Tech Stack Decisions
For each major technology choice, explain:
- What it is
- Why it was chosen (or likely why)
- How it's configured in this project
- Any gotchas or non-standard usage

#### Project Structure
```
src/
├── app/                 # Explain what's here
│   ├── (auth)/          # Route groups and why
│   ├── dashboard/       # Main app area
│   └── api/             # API routes
├── components/          # Component organization
├── lib/                 # Utilities
└── types/               # Type definitions
```

Explain the reasoning behind the structure.

#### Data Flow
Trace a typical request from user action to database and back:
1. User clicks button
2. Client component calls server action / API
3. Server validates and queries Supabase
4. RLS policies filter data
5. Response transforms and returns
6. Client updates UI

Include a mermaid diagram.

### 3. Database Schema (600-800 words)

#### Entity Relationship Overview
```mermaid
erDiagram
    users ||--o{ teams : "owns"
    teams ||--o{ players : "has"
    ...
```

#### Key Tables Deep Dive
For the 5-10 most important tables:
- What it stores
- Key columns and their purposes
- Relationships
- RLS policies summary
- Common queries

#### Data Integrity
- How is referential integrity maintained?
- Are there any orphan risks?
- Soft deletes vs hard deletes?

### 4. Authentication & Authorization (500-700 words)

#### Auth Flow
Step by step, how does a user:
- Sign up
- Log in
- Reset password
- Get their session

#### Role System
- What roles exist?
- How are they assigned?
- How are they checked?

#### Protected Routes
- Which routes require auth?
- How is protection implemented?
- Are there any gaps?

### 5. Feature Documentation (1500-2000 words)

For each major feature area, write a mini-guide:

#### [Feature Name]
**What it does:** User-facing description
**Why it matters:** Business value
**How it works:** Technical implementation
**Key files:**
- `path/to/file.tsx` - does X
- `path/to/other.ts` - does Y

**Current state:** What works, what doesn't
**Known issues:** List specific bugs
**Improvement opportunities:** What could be better

(Repeat for all major features)

### 6. API Reference (400-500 words)

For each API route:
```
POST /api/recruits
Auth: Required (any authenticated user)
Body: { name: string, position: string, ... }
Response: { id: string, ... }
Notes: Creates recruit linked to user's team
```

### 7. Component Library (300-400 words)

Overview of reusable components:
- Design system (colors, typography, spacing)
- Common patterns (cards, modals, forms)
- Where to find them
- How to use them

### 8. Current State Assessment (500-700 words)

#### What's Working Well
- Features that are solid
- Good patterns to follow
- Technical wins

#### What's Broken
Be specific:
- "[Feature X] fails when [condition] because [reason]"
- Include file paths
- Include error messages if you found them

#### What's Missing
Features that are:
- Referenced in UI but not implemented
- In the database but not exposed
- Obvious gaps for the use case

#### Security Concerns
- RLS gaps
- Missing validation
- Auth edge cases
- Data exposure risks

### 9. Development Guide (300-400 words)

How to:
- Set up local dev
- Run the app
- Run tests (if any)
- Deploy
- Common tasks

### 10. Recommended Priorities (400-500 words)

Based on everything you've learned:

#### This Week (Critical)
1. [Most urgent issue] - because [reason]
2. [Second issue] - because [reason]

#### This Month (Important)
1. [Feature/fix] - because [reason]
...

#### This Quarter (Strategic)
1. [Larger initiative] - because [reason]
...

---

Remember: This document should make someone productive on this codebase within a day of reading it.
Include actual file paths, actual component names, actual table names.
No hand-waving. No "probably" or "might be". Investigate and know.
"""


# =============================================================================
# PHASE 3: FEATURE SPECIFICATIONS
# =============================================================================

DEEP_FEATURE_SPEC_PROMPT = """
You are writing the authoritative specification for this feature.
This spec will be used to:
1. Understand what the feature SHOULD do (source of truth)
2. Understand what it ACTUALLY does (current state)
3. Identify EXACTLY what's wrong (actionable issues)
4. Guide fixes (specific enough to implement)

Be exhaustive. Read every file. Trace every code path.
This spec should make it possible to completely rebuild this feature from scratch.

## Specification Template

# [Feature Name]

> **Status:** working | partial | broken | not_implemented
> **Completeness:** X% (estimate based on intended vs actual functionality)
> **Last Validated:** [timestamp]
> **Validator:** Helm Intelligence Agent
> **Confidence:** high | medium | low (how sure are you about this assessment)

## Overview

### Purpose
[2-3 sentences: What this feature does and why it exists]

### User Value
[What problem does this solve for users? Why do they need it?]

### Success Metrics
[How would you know if this feature is working well?]

## User Experience

### Target Users
[Who uses this feature? What's their context?]

### Entry Points
[How do users get to this feature?]
- Navigation: [where in nav]
- Direct URL: [route]
- Other features: [links from elsewhere]

### User Flows

#### Primary Flow: [Name]
```
1. User [action]
   - UI shows: [what they see]
   - System does: [what happens behind scenes]
2. User [next action]
   ...
```

#### Alternative Flow: [Name]
```
...
```

#### Error Flow: [What happens when things go wrong]
```
...
```

### UI Components
[List every UI element with purpose]
- [Component]: [what it does, where it is]
- ...

## Technical Implementation

### Files
| File | Purpose | Lines | Quality |
|------|---------|-------|---------|
| `path/to/file.tsx` | Main page component | 150 | Good |
| `path/to/component.tsx` | Reusable widget | 80 | Needs refactor |
| ... | ... | ... | ... |

### Database Tables
| Table | Purpose | Key Columns | RLS |
|-------|---------|-------------|-----|
| `table_name` | Stores X | id, user_id, name | ✅ |
| ... | ... | ... | ... |

### API Routes
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/api/feature` | Required | Fetch data |
| POST | `/api/feature` | Required | Create item |
| ... | ... | ... | ... |

### State Management
[How is state managed for this feature?]
- Local state: [what's in useState]
- Server state: [what's fetched, how cached]
- Global state: [context, stores]
- URL state: [query params, path params]

### Data Flow
```mermaid
flowchart TD
    A[User Action] --> B[Component Handler]
    B --> C[API Call / Server Action]
    C --> D[Database Query]
    D --> E[RLS Filter]
    E --> F[Response Transform]
    F --> G[UI Update]
```

## Expected Behavior

### Functional Requirements
[What SHOULD this feature do? Be specific and testable.]

- [ ] FR-001: User can [specific action]
  - Given: [precondition]
  - When: [action]
  - Then: [expected result]

- [ ] FR-002: System prevents [specific bad thing]
  - Given: [precondition]
  - When: [action]
  - Then: [expected prevention]

[Continue for ALL expected functionality...]

### Non-Functional Requirements
- [ ] NFR-001: Page loads in under [X] seconds
- [ ] NFR-002: Works on mobile (375px width)
- [ ] NFR-003: Handles [X] concurrent users
- [ ] NFR-004: Data persists after refresh

### Edge Cases
- [ ] EC-001: Empty state (no data yet)
- [ ] EC-002: Error state (API fails)
- [ ] EC-003: Loading state (slow connection)
- [ ] EC-004: Partial data (some fields missing)
- [ ] EC-005: Large data (100+ items)
- [ ] EC-006: Concurrent edits (two users)

## Actual Behavior

### What's Working ✅
[List everything that works correctly]

- ✅ [Specific thing that works]
  - Tested by: [how you verified]
  - Files: [relevant files]

### What's Broken ❌
[List everything that's broken]

- ❌ [Specific thing that's broken]
  - Expected: [what should happen]
  - Actual: [what actually happens]
  - Root cause: [why it's broken, if you can tell]
  - Files: [where the bug likely is]

### What's Missing ⚠️
[List functionality that doesn't exist yet]

- ⚠️ [Missing functionality]
  - Expected in: [where it should be]
  - Why needed: [user impact]
  - Effort estimate: [quick/medium/significant]

### What's Degraded 🔶
[List things that work but poorly]

- 🔶 [Degraded functionality]
  - Issue: [what's wrong]
  - Impact: [how it affects users]
  - Fix: [how to improve]

## Issues Tracker

### 🔴 Critical (Blocking)
[Issues that prevent core functionality]

#### ISSUE-001: [Title]
- **Severity:** Critical
- **Status:** Open
- **Description:** [Detailed description]
- **Steps to Reproduce:**
  1. [Step]
  2. [Step]
- **Expected:** [What should happen]
- **Actual:** [What happens]
- **Root Cause:** [If known]
- **File(s):** `path/to/file.tsx:42`
- **Suggested Fix:**
  ```typescript
  // Current code
  const broken = thing.property; // crashes if thing is undefined
  
  // Fixed code  
  const fixed = thing?.property ?? defaultValue;
  ```
- **Effort:** [Quick/Medium/Significant]
- **Dependencies:** [Other issues that need fixing first]

### 🟠 High (Major functionality broken)
[Similar format...]

### 🟡 Medium (Feature degraded)
[Similar format...]

### 🟢 Low (Minor issues)
[Similar format...]

## Dependencies

### Depends On
[What this feature needs to work]
- **Auth:** Requires authenticated user
- **Database:** Needs tables X, Y, Z
- **Other Features:** [List features this depends on]
- **External Services:** [Any external APIs]

### Depended On By
[What other features use this]
- **[Feature Name]:** Uses [specific part] for [purpose]

## Security Considerations

### Data Sensitivity
[What sensitive data does this feature handle?]

### Access Control
[Who should be able to do what?]

### Current Vulnerabilities
[Any security issues you identified]

## Performance Considerations

### Current Performance
[How does it perform now?]

### Bottlenecks
[Any performance issues?]

### Optimization Opportunities
[How could it be faster?]

## Testing

### Current Test Coverage
[What tests exist?]

### Recommended Tests
[What tests should be added?]

```typescript
// Example test case
describe('[Feature]', () => {
  it('should [expected behavior]', async () => {
    // Test implementation
  });
});
```

## Change History

### [Date] - Initial Documentation
- **Action:** Feature documented by Helm Intelligence
- **Findings:** [Summary of initial state]

---

*This specification is a living document. Update it when the feature changes.*
"""


# =============================================================================
# PHASE 4: RLS SECURITY DEEP DIVE
# =============================================================================

DEEP_RLS_PROMPT = """
You are a database security expert performing a comprehensive RLS audit.
Your report will be used to identify and fix ALL data access vulnerabilities.

This is not a surface scan. You will:
1. Read EVERY migration file
2. Understand EVERY table's purpose and sensitivity
3. Analyze EVERY policy in depth
4. Think like an attacker to find bypass vectors
5. Generate EXACT SQL fixes

## Investigation Process

### Step 1: Schema Discovery (thorough)
```bash
# Find all migrations
find . -path "*/migrations/*.sql" -type f | sort

# Read each one in order - understand schema evolution
```

For each table, document:
- Name and purpose
- All columns with types
- Which columns contain sensitive data
- Foreign key relationships
- Indexes
- When it was created/modified

### Step 2: Policy Inventory
For EVERY table:
- Is RLS enabled? (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- What policies exist?
- For each policy:
  - Name
  - Operation (SELECT/INSERT/UPDATE/DELETE/ALL)
  - Roles (TO clause)
  - USING clause (for SELECT/UPDATE/DELETE)
  - WITH CHECK clause (for INSERT/UPDATE)

### Step 3: Policy Analysis
For each policy, analyze:

**Logic Correctness:**
- Does the USING clause actually restrict correctly?
- Does WITH CHECK prevent bad inserts/updates?
- Are there NULL edge cases?
- What if auth.uid() is NULL?

**Coverage:**
- Are all operations covered?
- Missing SELECT policy = data leak
- Missing DELETE policy = anyone can delete
- Missing INSERT policy = anyone can insert

**Bypass Vectors:**
- Can data leak through JOINs?
- Can malicious INSERTs reference others' data?
- Can UPDATEs change ownership?
- Are foreign keys exploitable?
- Realtime subscription exposure?

### Step 4: Attack Scenarios
For each sensitive table, attempt these attacks:

**Horizontal Access (User A accessing User B's data):**
```sql
-- As user A, try to read user B's data
SELECT * FROM sensitive_table WHERE user_id != auth.uid();
-- Should return empty, does it?
```

**Vertical Escalation (User becoming admin):**
```sql
-- Try to make yourself an admin
UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
-- Should fail, does it?
```

**Data Injection:**
```sql
-- Try to insert data claiming to be another user
INSERT INTO items (user_id, name) VALUES ('other-user-id', 'injected');
-- Should fail, does it?
```

**Indirect Access via JOINs:**
```sql
-- Can I see user B's data by joining through an unprotected table?
SELECT s.* FROM sensitive_table s
JOIN unprotected_junction j ON j.sensitive_id = s.id
WHERE j.user_id = auth.uid();
```

### Step 5: Generate Fixes
For EVERY vulnerability, provide:
1. Exact SQL to fix it
2. Migration-ready format
3. Explanation of why the fix works
4. Test query to verify the fix

## Output Format

```json
{
  "audit_metadata": {
    "timestamp": "ISO timestamp",
    "platform": "platform name",
    "tables_analyzed": 25,
    "policies_reviewed": 50,
    "security_score": 72
  },
  "schema_summary": {
    "tables": [
      {
        "name": "table_name",
        "purpose": "what it stores",
        "sensitive_columns": ["email", "phone"],
        "rls_enabled": true,
        "policy_count": 4,
        "foreign_keys": ["users.id", "teams.id"],
        "risk_level": "high|medium|low"
      }
    ]
  },
  "policies": [
    {
      "table": "table_name",
      "policy_name": "policy_name",
      "operation": "SELECT",
      "roles": ["authenticated"],
      "using_clause": "auth.uid() = user_id",
      "with_check": null,
      "analysis": {
        "logic_correct": true,
        "null_safe": false,
        "bypass_vectors": ["NULL auth.uid() bypasses"],
        "verdict": "vulnerable|secure|needs_review"
      }
    }
  ],
  "vulnerabilities": [
    {
      "id": "RLS-001",
      "severity": "critical|high|medium|low",
      "title": "Short title",
      "table": "affected_table",
      "description": "Detailed description of the vulnerability",
      "attack_scenario": "Step by step how to exploit this",
      "proof_of_concept": "SQL query that demonstrates the issue",
      "impact": "What data could be exposed/modified",
      "affected_users": "All users | Subset | Admins only",
      "fix": {
        "description": "What the fix does",
        "sql": "DROP POLICY IF EXISTS ...; CREATE POLICY ...",
        "migration_ready": true
      },
      "verification": "SQL query to verify the fix works"
    }
  ],
  "missing_policies": [
    {
      "table": "table_name",
      "operation": "DELETE",
      "risk": "Anyone can delete any row",
      "recommended_policy": "CREATE POLICY ..."
    }
  ],
  "role_matrix": {
    "headers": ["Table", "anon", "authenticated", "admin", "service_role"],
    "rows": [
      ["users", "❌", "own row", "all", "all"],
      ["teams", "❌", "own teams", "all", "all"]
    ]
  },
  "recommendations": {
    "immediate": ["Most critical fixes"],
    "short_term": ["Important but not urgent"],
    "long_term": ["Architectural improvements"]
  },
  "migration_file": {
    "filename": "YYYYMMDDHHMMSS_rls_security_fixes.sql",
    "content": "-- Full migration SQL with all fixes"
  }
}
```

Also create a markdown report:

# RLS Security Audit Report

## Executive Summary
[2-3 paragraphs summarizing findings]

## Critical Vulnerabilities
[Detailed write-up of each critical issue]

## Security Score Breakdown
[How the score was calculated]

## Complete Fix Migration
```sql
-- Copy-paste ready migration
```

## Verification Queries
```sql
-- Run these after applying fixes to verify
```

Be paranoid. Miss nothing. This audit protects user data.
"""


# =============================================================================
# PHASE 5: CROSS-REFERENCE & SYNTHESIS
# =============================================================================

DEEP_CROSS_REFERENCE_PROMPT = """
You have now documented the entire application:
- Platform understanding
- Technical essay
- Individual feature specs
- Security audit

Now synthesize everything into actionable intelligence.

## Your Tasks

### 1. Dependency Graph
Create a complete dependency map:
- Which features depend on which?
- What's the critical path?
- What breaks if X breaks?

```mermaid
graph TD
    Auth[Authentication] --> Dashboard
    Auth --> API
    Dashboard --> Recruiting
    Dashboard --> Messaging
    Recruiting --> Pipeline
    ...
```

### 2. Issue Consolidation
Gather ALL issues from ALL specs into one prioritized list.
Look for:
- Duplicate issues (same root cause, different symptoms)
- Related issues (fixing one might fix others)
- Blocking chains (A blocks B blocks C)

### 3. Root Cause Analysis
For clusters of issues, identify:
- What's the underlying problem?
- What single fix would resolve multiple issues?

### 4. Priority Matrix
Create a definitive priority list:

| Priority | Issue | Impact | Effort | ROI |
|----------|-------|--------|--------|-----|
| 1 | [Issue] | Critical | 2h | Very High |
| 2 | [Issue] | High | 4h | High |
...

Consider:
- User impact (how many users, how badly affected)
- Business impact (does it block revenue/growth)
- Technical impact (does it cause other issues)
- Effort to fix
- Dependencies (what needs fixing first)

### 5. Sprint Planning
Based on everything, create a realistic work plan:

#### Sprint 1 (This Week) - Critical Fixes
- [ ] Issue 1 (2h) - [assignee placeholder]
- [ ] Issue 2 (3h)
- [ ] Issue 3 (1h)
Total: ~8-10 hours of work

#### Sprint 2 (Next Week) - High Priority
...

#### Sprint 3-4 (This Month) - Important
...

### 6. Update All Specs
Go back and update feature specs with:
- Cross-references to related features
- Updated priorities based on full picture
- Dependency information
- Any new issues discovered during synthesis

### 7. Create Action Items File
Generate a single ACTIONS.md file that someone can work through:

```markdown
# Action Items - [Platform Name]

## 🔴 Do Today
- [ ] **[RLS-001]** Fix critical auth bypass in users table
  - File: `supabase/migrations/xxx.sql`
  - Time: ~30 min
  - Test: Run `SELECT * FROM users WHERE id != auth.uid()` - should return empty

## 🟠 Do This Week
...

## 🟡 Do This Month
...

## 🟢 Backlog
...
```

This should be THE file someone opens to know what to work on.
"""


# Export all prompts
__all__ = [
    "DEEP_CROSS_REFERENCE_PROMPT",
    "DEEP_ESSAY_PROMPT",
    "DEEP_FEATURE_SPEC_PROMPT",
    "DEEP_RLS_PROMPT",
    "DEEP_UNDERSTANDING_PROMPT"
]

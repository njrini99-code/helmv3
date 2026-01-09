# Helm Intelligence 🧠

Deep AI analysis of your codebase. Run before bed, wake up to comprehensive documentation.

## Quick Start (5 minutes to launch)

```bash
# 1. Install
pip install claude-agent-sdk anyio

# 2. Set API key
export ANTHROPIC_API_KEY="sk-ant-..."

# 3. Run overnight analysis
python overnight.py --baseballhelm ~/baseballhelm --golfhelm ~/golfhelm
```

That's it. Come back in 1-2 hours (per platform) to find:

```
your-project/.helm/
├── ACTIONS.md           ← START HERE - prioritized work items
├── BASEBALLHELM_ESSAY.md ← 4000-6000 word technical doc
├── UNDERSTANDING.json    ← Structured app knowledge
├── ISSUES.md            ← All issues consolidated
└── security/
    ├── RLS_AUDIT.md     ← Security vulnerabilities
    └── vulnerabilities.json

your-project/src/app/dashboard/
├── page.tsx
└── page.spec.md         ← Feature spec lives with code
```

**Cost: ~$8-15 per platform** for genuinely useful output.

---

## What This Does

This isn't a linter or test runner. It's an AI system that:

1. **Builds Deep Understanding** — Reads your entire codebase and builds a mental model of what the app is, who uses it, and how it works

2. **Writes Platform Essays** — Generates comprehensive technical documentation that explains your application to any developer (human or AI)

3. **Documents Every Feature** — Creates spec files that live WITH your code, describing expected behavior, actual behavior, and discrepancies

4. **Audits Security** — Deep RLS policy analysis that understands your data model and user roles, not just pattern matching

5. **Tracks Issues** — Organized, prioritized list of what's broken, with suggested fixes

## Quick Start

```bash
# Install
pip install claude-agent-sdk anyio

# Set API key
export ANTHROPIC_API_KEY="sk-ant-..."

# Run full analysis on one platform
python orchestrate.py --baseballhelm /path/to/baseballhelm

# Run on both platforms
python orchestrate.py \
  --baseballhelm /path/to/baseballhelm \
  --golfhelm /path/to/golfhelm

# Enable continuous monitoring after initial analysis
python orchestrate.py \
  --baseballhelm /path/to/baseballhelm \
  --golfhelm /path/to/golfhelm \
  --watch
```

## What You Get

After running, each project will have:

```
your-project/
├── .helm/
│   ├── UNDERSTANDING.json      # Structured app knowledge
│   ├── PLATFORM_ESSAY.md       # Comprehensive documentation
│   ├── ISSUES.md               # Prioritized issues list
│   └── security/
│       ├── RLS_AUDIT.md        # Security report
│       ├── POLICY_MATRIX.md    # Access control matrix
│       └── vulnerabilities.json
├── src/
│   ├── app/
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   └── page.spec.md    # ← Spec lives with feature
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   │   ├── page.tsx
│   │   │   │   └── page.spec.md
```

## The Platform Essay

The essay is a 3000-5000 word technical document that covers:

- **Executive Summary** — What is this? Who is it for?
- **Architecture Overview** — Tech stack, project structure, data flow
- **User Roles & Journeys** — Who uses this and how
- **Feature Deep Dives** — Every major feature explained
- **Data Model** — Entities, relationships, security
- **Current State Assessment** — What works, what's broken
- **Recommended Priorities** — What to fix first

This becomes the canonical reference for anyone (human or AI) working on the codebase.

## Feature Specs

Each feature gets a `.spec.md` file that lives alongside the code:

```markdown
# Dashboard

> **Status:** partial
> **Confidence:** high
> **Last Validated:** 2025-01-08T12:00:00

## Purpose

The main dashboard where coaches see their team overview...

## Expected Behavior

### Happy Path
1. User logs in
2. Dashboard loads with team stats
3. Recent activity shows last 7 days
...

## Actual Behavior

### What's Working ✅
- Team stats load correctly
- Navigation works

### What's Broken ❌
- Recent activity shows wrong date range
- Mobile layout broken below 768px

## Discrepancies

| Expected | Actual | Severity |
|----------|--------|----------|
| Shows 7 days | Shows 30 days | medium |
| Responsive | Breaks on mobile | high |

## Issues Found

### 🟠 High
- **[DASH-001]** Mobile layout broken: Cards overflow...
```

**Why specs live with features:**
- Version controlled with the code
- Easy to find when working on a feature
- Claude Code / Codex can read them for context
- Updated when feature changes

## RLS Security Analysis

The security analyzer doesn't just pattern-match policies. It:

1. **Understands your data model** — Reads migrations chronologically
2. **Maps sensitive data** — Identifies PII, auth data, proprietary info
3. **Analyzes each policy** — Traces USING/WITH CHECK clauses
4. **Thinks like an attacker** — Horizontal access, escalation, indirect leaks
5. **Generates fixes** — Actual SQL migrations you can apply

Output includes:
- Security score (0-100)
- Vulnerability list with severity
- Policy matrix (who can access what)
- Migration file with fixes

## How Agents Update Specs

When you change a feature:

1. Agent detects changed files (via git diff or file watching)
2. Reads the existing spec to understand expected behavior
3. Analyzes the code changes
4. Updates the spec:
   - New behavior added to "Expected"
   - Fixed bugs moved from "Broken" to "Working"
   - New issues added
   - Change history updated

```markdown
## Change History

### 2025-01-08 - Bug Fix
- **What:** Fixed mobile layout overflow
- **Why:** Cards now use flex-wrap
- **By:** Claude Code
- **Commit:** abc123
```

## Cross-Feature Intelligence

After documenting individual features, the agent:

1. **Maps dependencies** — Which features rely on which
2. **Checks consistency** — Similar things implemented similarly?
3. **Finds gaps** — Tables with no UI? Unused routes?
4. **Correlates issues** — Root causes of multiple symptoms
5. **Updates specs** — Adds cross-references, adjusts priorities

This means fixing one issue might auto-resolve others, and the specs reflect that.

## Cost Breakdown

| Phase | Tokens (est.) | Cost (Sonnet 4.5) |
|-------|---------------|-------------------|
| Understanding | 100-200K | $0.50-1.00 |
| Essay | 50-100K | $0.25-0.50 |
| Per Feature Spec | 20-40K | $0.10-0.20 |
| Cross-Reference | 50-100K | $0.25-0.50 |
| RLS Audit | 100-200K | $0.50-1.00 |

**Full analysis of ~40 features: $5-10 per platform**

Incremental updates (single feature change): $0.10-0.30

## Architecture

```
helm-intelligence/
├── orchestrate.py          # Main entry point
├── core/
│   ├── intelligence.py     # App understanding engine
│   └── rls_analyzer.py     # Security analysis
├── agents/                 # Legacy testing agents
│   ├── feature_tester.py
│   └── rls_tester.py
└── pyproject.toml
```

## CLI Reference

```bash
# Full analysis
python orchestrate.py --baseballhelm PATH --golfhelm PATH

# Single platform
python orchestrate.py --baseballhelm PATH --platform baseballhelm

# With continuous monitoring
python orchestrate.py --baseballhelm PATH --watch

# Custom output directory
python orchestrate.py --baseballhelm PATH --output ./my-reports
```

## Integration with Claude Code / Codex

The specs are designed to be read by AI coding assistants:

```bash
# In Claude Code
claude "Fix the issues in src/app/dashboard based on its spec file"

# The agent will:
# 1. Read page.spec.md
# 2. See the discrepancies and issues
# 3. Fix the code
# 4. Update the spec
```

## FAQ

**How is this different from regular testing?**
Tests verify specific assertions. This builds understanding and tracks the gap between intent and implementation.

**Will it break my code?**
The analysis phase is read-only. The only writes are:
- `.helm/` directory (reports)
- `.spec.md` files (documentation)
- Optional: security fix migrations (you review first)

**How accurate is it?**
Each spec includes a confidence score. The agent admits uncertainty rather than guessing.

**Can I edit the specs manually?**
Yes! They're just markdown. The agent will preserve your changes and incorporate them.

**Does it work with monorepos?**
Point it at the specific app directory within your monorepo.

## License

MIT - Helm Sports Labs

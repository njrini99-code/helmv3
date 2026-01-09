# 🔄 Continuous Improvement Cycle Agent

**Closed-loop autonomous improvement system** that verifies fixes and finds new issues.

## 🎯 The Perfect Cycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│  CYCLE 1: INITIAL ANALYSIS                                              │
│  ├─ Analyzes entire codebase with deep context                          │
│  ├─ Finds 25 issues across all features                                 │
│  └─> EXPORTS: issues-cycle-001.md                                       │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  CLAUDE CODE FIXES                                                      │
│  ├─ You: "Fix all issues in issues-cycle-001.md"                        │
│  ├─ Claude Code fixes 12 issues                                         │
│  └─> UPDATES: issues-cycle-001.md with fix documentation                │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────────┐
│  CYCLE 2: VERIFICATION + NEW ANALYSIS                                   │
│  ├─ READS: issues-cycle-001.md to see what was supposedly fixed         │
│  ├─ VERIFIES: Did Claude Code actually fix them? (reads actual code)    │
│  │   ├─ ✅ 10 confirmed fixed                                           │
│  │   ├─ ❌ 2 not actually fixed (reopens them)                          │
│  │   └─ ⚠️ 3 caused regressions (creates new issues)                    │
│  ├─ TESTS: Features with context-aware detection                        │
│  │   └─ Finds 8 new issues                                              │
│  └─> EXPORTS: issues-cycle-002.md (13 issues)                           │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓
                       [CYCLE REPEATS]
```

---

## 🚀 Quick Start

### Step 1: Run Initial Analysis

```bash
cd tools/continuous-improvement

# Run cycle 1 (uses overnight.py context if available)
python cycle-agent.py \
  --project ~/helmv3 \
  --platform baseballhelm
```

**Output:**
```
~/helmv3/.helm/cycles/
├── issues-cycle-001.md       ← Give this to Claude Code
├── issues-cycle-001.json     ← Machine-readable
└── cycle-001-summary.json    ← Statistics
```

### Step 2: Let Claude Code Fix Issues

In Cursor, open `issues-cycle-001.md` and say:

```
Fix all issues in this file. For each issue:
1. Read the problem description
2. Implement the suggested fix
3. Update the "FIX STATUS" section with what you changed
4. Mark it as ✅ FIXED
```

Claude Code will work through the issues and document its changes **in the same MD file**.

### Step 3: Verify Fixes + Find New Issues

```bash
# Run cycle 2
python cycle-agent.py \
  --project ~/helmv3 \
  --platform baseballhelm
```

The agent will:
1. ✅ **Verify** that Claude Code's fixes actually worked
2. ❌ **Reopen** issues that weren't truly fixed
3. ⚠️ **Detect regressions** caused by fixes
4. 🔍 **Find new issues** using context-aware detection

**Output:**
```
issues-cycle-002.md contains:
- 2 issues that weren't actually fixed (reopened)
- 3 regression issues (caused by fixes)
- 8 new issues (context-aware detection)
```

### Step 4: Repeat

Keep cycling:
```bash
# Cycle 3
python cycle-agent.py --project ~/helmv3 --platform baseballhelm

# Cycle 4
python cycle-agent.py --project ~/helmv3 --platform baseballhelm

# ... until all issues are resolved
```

---

## 🤖 Continuous Mode

Run cycles automatically:

```bash
python cycle-agent.py \
  --project ~/helmv3 \
  --platform baseballhelm \
  --continuous \
  --wait 300
```

This will:
1. Run a cycle
2. Wait 5 minutes (300s)
3. Run next cycle
4. Repeat forever (until you Ctrl+C)

**Use case:** Overnight continuous improvement while you sleep.

---

## 📋 Issue State Tracking

Issues progress through states:

| State | Meaning |
|-------|---------|
| `open` | Needs fixing |
| `fixed` | Claude Code says it's fixed |
| `verified` | Agent confirmed it's fixed |
| `regression` | Fix caused a new problem |

---

## 🔍 Context-Aware Detection

The agent doesn't just look for patterns. It **understands your app** and checks:

### Based on Understanding
- If feature X should have pagination → checks if it does
- If users have roles → verifies proper access control
- If data model has relationships → checks integrity

### Based on Previous Cycles
- If issue Y was fixed → verifies fix still works
- If pattern Z caused regressions → avoids it
- If certain files are problematic → watches them closely

### Examples

**Cycle 1:**
```
Found issue: Dashboard missing loading state
Location: src/app/dashboard/page.tsx
```

**Cycle 2 (after fix):**
```
Verified: Dashboard now has loading state ✅
New issue: Dashboard loading skeleton not accessible
Location: src/app/dashboard/page.tsx
```

**Cycle 3 (context-aware):**
```
Found issue: Discover page missing loading state (same pattern as dashboard)
Recommendation: Use same skeleton component for consistency
```

---

## 📁 File Structure

```
your-project/
└── .helm/
    └── cycles/
        ├── issues-cycle-001.md       # Cycle 1 issues (for Claude Code)
        ├── issues-cycle-001.json     # Structured data
        ├── cycle-001-summary.json    # Statistics
        ├── issues-cycle-002.md       # Cycle 2 issues
        ├── issues-cycle-002.json
        ├── cycle-002-summary.json
        └── ...
```

---

## 📄 Issue MD Format

Each cycle generates an MD file like this:

```markdown
# Improvement Cycle 001 - BaseballHelm

> 🤖 Generated: 2025-01-09 22:00:00
> 📊 Total Issues: 15
> 🔴 Critical: 2 | 🟠 High: 5 | 🟡 Medium: 6 | 🟢 Low: 2

---

## 📋 Instructions for Claude Code

[Instructions for how to fix and document...]

---

## 🔴 Critical Issues

### ISSUE-001: Missing RLS on recruits table

> **Severity:** 🔴 Critical
> **Category:** security
> **Found in Cycle:** 1

**Problem:**
The recruits table allows unauthorized access because RLS is not enabled.

**Location:**
- File: `supabase/migrations/014_recruits.sql`
- Line: 15

**Evidence:**
No ALTER TABLE ENABLE ROW LEVEL SECURITY statement found.

**Expected Behavior:**
Only coaches should see their own recruits.

**Actual Behavior:**
Any authenticated user can query all recruits.

**User Impact:**
Data leak - coaches can see competitors' recruiting targets.

**Suggested Fix:**
```sql
ALTER TABLE recruits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own recruits"
  ON recruits FOR SELECT
  TO authenticated
  USING (team_id IN (
    SELECT id FROM teams WHERE coach_id = auth.uid()
  ));
```

---

### FIX STATUS: ISSUE-001

<!-- Claude Code: Document your fix here -->

**Status:** ✅ FIXED

**Changes Made:**
- Enabled RLS on recruits table
- Added policy for coaches to view only their recruits
- Added policies for INSERT/UPDATE/DELETE

**Files Modified:**
- `supabase/migrations/999_fix_recruits_rls.sql` - New migration

**Testing:**
- Tested as coach A: can only see own recruits ✅
- Tested as coach B: cannot see coach A's recruits ✅
- Tested INSERT: can only add to own team ✅

**Notes:**
- Migration needs to be applied to production
- Existing data is now protected

---

[More issues...]
```

---

## 🔗 Integration with Overnight.py

The cycle agent uses context from your overnight analysis:

```bash
# Step 1: Run overnight analysis
cd tools
python overnight.py --baseballhelm ~/helmv3

# This creates .helm/UNDERSTANDING.json

# Step 2: Run cycle 1 (uses UNDERSTANDING.json)
cd continuous-improvement
python cycle-agent.py --project ~/helmv3 --platform baseballhelm

# Cycle agent reads UNDERSTANDING.json for context
```

---

## 🎯 Run Modes

| Mode | Description | Use When |
|------|-------------|----------|
| `full` (default) | Verify previous + find new issues | Normal operation |
| `verify` | Only verify previous fixes | After Claude Code session |
| `analyze` | Only find new issues (skip verification) | First cycle or when no previous fixes |

```bash
# Only verify previous fixes
python cycle-agent.py --project ~/helmv3 --platform baseballhelm --mode verify

# Only find new issues
python cycle-agent.py --project ~/helmv3 --platform baseballhelm --mode analyze
```

---

## 📊 Statistics Tracking

Each cycle generates a summary:

```json
{
  "cycle": 3,
  "total_issues": 13,
  "by_severity": {
    "critical": 1,
    "high": 3,
    "medium": 7,
    "low": 2
  },
  "by_category": {
    "security": 1,
    "ux": 5,
    "accessibility": 4,
    "performance": 2,
    "regression": 1
  },
  "verified_from_previous": 10,
  "regressions_found": 1,
  "new_issues_found": 8
}
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Anthropic API key (required)
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Command-Line Options

```bash
python cycle-agent.py \
  --project PATH              # Required: Project path
  --platform NAME             # Required: Platform name
  --mode full|verify|analyze  # Optional: Run mode (default: full)
  --continuous               # Optional: Run continuously
  --wait SECONDS             # Optional: Wait time between cycles (default: 300)
```

---

## 💡 Best Practices

### 1. Run Overnight Analysis First

```bash
# Start with deep understanding
python tools/overnight.py --baseballhelm ~/helmv3

# Then start cycles
python tools/continuous-improvement/cycle-agent.py \
  --project ~/helmv3 --platform baseballhelm
```

### 2. Let Claude Code Work Uninterrupted

Don't manually edit the MD file while Claude Code is working on it.

### 3. Review Regressions Carefully

If the agent finds regressions, review them before fixing - they might indicate a deeper architectural issue.

### 4. Use Continuous Mode Overnight

```bash
# Before bed
python cycle-agent.py \
  --project ~/helmv3 \
  --platform baseballhelm \
  --continuous \
  --wait 600

# Wake up to multiple completed cycles
```

### 5. Track Your Progress

Watch the numbers go down:
```
Cycle 1: 25 issues
Cycle 2: 18 issues (10 verified, 3 reopened, 8 new)
Cycle 3: 12 issues (8 verified, 1 regression, 3 new)
Cycle 4: 5 issues (7 verified, 0 regressions, 0 new)
Cycle 5: 0 issues 🎉
```

---

## 🐛 Troubleshooting

### "No previous cycle found"

This is normal for cycle 1. The agent will only verify fixes starting from cycle 2.

### "Claude Code didn't update the MD file"

Make sure to explicitly ask Claude Code to update the FIX STATUS sections. Say:

```
After fixing each issue, update the FIX STATUS section 
with what you changed, which files you modified, and how you tested it.
```

### "Agent says fix wasn't actually applied"

The agent reads the actual code to verify. If it says a fix didn't work:
1. Check if Claude Code actually modified the file
2. Check if the modification matches the suggested fix
3. Check if there were TypeScript/build errors

### "Too many regressions"

If many fixes cause regressions, the suggested fixes might be too aggressive. Try:
```bash
python cycle-agent.py --mode analyze  # Skip verification, just find issues
```

Then fix issues more carefully.

---

## 🎓 How It Works

### Phase 1: Load Previous Cycle

```python
# Reads issues-cycle-002.json
prev_issues = load_cycle(2)
fixed_issues = [i for i in prev_issues if i.state == "fixed"]
```

### Phase 2: Verify Fixes

```python
# For each supposedly fixed issue:
for issue in fixed_issues:
    # Read the file
    code = read_file(issue.location.file)
    
    # Check if fix was actually applied
    if fix_present_in_code(code, issue.fix_details):
        issue.state = "verified" ✅
    else:
        issue.state = "open"  # Reopen ❌
    
    # Check for regressions
    if new_problems_found(code):
        create_regression_issue() ⚠️
```

### Phase 3: Context-Aware Detection

```python
# Load deep understanding
context = load_understanding()

# Use context to find issues
for feature in context.features:
    if feature.should_have_pagination:
        if not has_pagination(feature):
            create_issue("Missing pagination")
    
    if feature.handles_sensitive_data:
        if not has_access_control(feature):
            create_issue("Missing access control")
```

### Phase 4: Export

```python
# Generate MD for Claude Code
generate_md(all_issues)

# Save JSON for next cycle
save_json(all_issues)
```

---

## 🚀 Next Steps

After setting up continuous improvement:

1. **Integrate with CI/CD** - Run verification after deployments
2. **Add metrics** - Track cycle time, fix rate, regression rate
3. **Customize detection** - Add project-specific issue types
4. **Automate commits** - Let Claude Code commit verified fixes
5. **Add notifications** - Slack when cycle completes

---

## 📝 Example Session

```bash
$ python cycle-agent.py --project ~/helmv3 --platform baseballhelm

╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   🔄 CONTINUOUS IMPROVEMENT CYCLE 001                                         ║
║   Platform: baseballhelm                                                     ║
║   Mode: full                                                                 ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔍 PHASE 2: CONTEXT-AWARE ISSUE DETECTION
  Using deep understanding to find issues...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Agent investigates codebase...]

  🆕 Found: ISSUE-001 - Missing RLS on recruits table
  🆕 Found: ISSUE-002 - Dashboard missing loading state
  🆕 Found: ISSUE-003 - No error boundary on discover page
  ...

✅ Found 15 new issues

✅ Exported 15 issues
   MD: /Users/ricknini/helmv3/.helm/cycles/issues-cycle-001.md
   JSON: /Users/ricknini/helmv3/.helm/cycles/issues-cycle-001.json

╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ✅ CYCLE 001 COMPLETE                                                      ║
║                                                                              ║
║   📁 Issues exported to:                                                     ║
║   /Users/ricknini/helmv3/.helm/cycles/issues-cycle-001.md                   ║
║                                                                              ║
║   📋 Next Steps:                                                             ║
║   1. Open the MD file in Cursor                                              ║
║   2. Tell Claude Code: "Fix all issues in this file"                         ║
║   3. Claude Code will fix + document changes in the MD                       ║
║   4. Run cycle 002 to verify fixes                                           ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Built with ❤️ for Helm Sports Labs by Nick with Claude*

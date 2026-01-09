# Feature-Based Issue Organization Guide

## 🎯 Why Organize by Feature?

Instead of one giant `issues-cycle-001.md` with 50 mixed issues, organize into:
- `baseball-recruiting-issues.md` (12 issues)
- `golf-scorecard-issues.md` (8 issues)
- `auth-and-security-issues.md` (5 issues)
- etc.

**Benefits:**
- ✅ Claude Code gets better context
- ✅ Easier to focus on one area at a time
- ✅ Reduces chance of conflicts
- ✅ Clearer testing scope
- ✅ Better progress tracking

---

## 🚀 Complete Workflow

### Step 1: Run Cycle (Generates Combined Issues)

```bash
export ANTHROPIC_API_KEY="your-key"
cd /Users/ricknini/Downloads/helmv3/tools/continuous-improvement
python3 multi_platform_cycle.py --project /Users/ricknini/Downloads/helmv3
```

**Output:** `.helm/cycles/issues-cycle-001.md` (25 mixed issues)

---

### Step 2: Organize by Feature

```bash
python3 organize_by_feature.py --project /Users/ricknini/Downloads/helmv3 --cycle 1
```

**Output:**
```
.helm/cycles/features/
├── INDEX.md                           ← Start here!
├── baseball-recruiting-issues.md      ← 12 issues
├── golf-scorecard-issues.md           ← 8 issues
├── auth-and-security-issues.md        ← 5 issues
├── database-and-rls-issues.md         ← 7 issues
├── ui-components-issues.md            ← 4 issues
└── api-routes-issues.md               ← 3 issues
```

---

### Step 3: Fix One Feature at a Time in Cursor

Open `INDEX.md` first to see priority order, then:

```
1. Open: .helm/cycles/features/database-and-rls-issues.md

2. In Cursor, tell Claude Code:

   "Fix all issues in this file. For each issue, document your 
   fix in the FIX STATUS section. Start with CRITICAL issues."

3. Claude Code:
   - Reads the file
   - Sees feature context at the top
   - Fixes all 7 database/RLS issues
   - Updates FIX STATUS for each one

4. Review changes: git diff

5. Move to next feature!
```

---

### Step 4: Run Next Cycle (Verifies Fixes)

```bash
python3 multi_platform_cycle.py --project /Users/ricknini/Downloads/helmv3
```

**What happens:**
- Cycle agent reads ALL feature MDs
- Sees FIX STATUS sections Claude Code updated
- Verifies fixes actually worked
- Creates new feature-organized MDs for remaining issues

---

## 📋 Feature Categories

The organizer automatically groups issues into these areas:

### Baseball Platform
- `baseball-recruiting-issues.md` - Recruiting pipeline, profiles
- `baseball-pipeline-issues.md` - Pipeline stages, workflows
- `baseball-showcase-issues.md` - Showcase events, invites

### Golf Platform  
- `golf-scorecard-issues.md` - Rounds, shots, scoring
- `golf-team-management-issues.md` - Teams, rosters, members
- `golf-analytics-issues.md` - Stats, leaderboards

### Cross-Platform
- `auth-and-security-issues.md` - Authentication, authorization
- `database-and-rls-issues.md` - Migrations, policies, RLS
- `api-routes-issues.md` - API endpoints, handlers
- `ui-components-issues.md` - React components, layouts
- `performance-issues.md` - Slow queries, optimization
- `accessibility-issues.md` - A11y, ARIA, keyboard nav

---

## 🎯 Recommended Fix Order

From `INDEX.md`:

```
Priority 1: SECURITY (Do First!)
  1. database-and-rls-issues.md
  2. auth-and-security-issues.md

Priority 2: CORE FEATURES (Pick One Platform)
  Baseball:
    3. baseball-recruiting-issues.md
    4. baseball-pipeline-issues.md
  
  Golf:
    3. golf-scorecard-issues.md
    4. golf-team-management-issues.md

Priority 3: CROSS-CUTTING
  5. api-routes-issues.md
  6. ui-components-issues.md

Priority 4: POLISH
  7. performance-issues.md
  8. accessibility-issues.md
```

---

## 💡 Claude Code Prompts Per Feature

### For Security Issues
```
Fix all security issues in this file.

Priority: CRITICAL issues first.

For each fix:
1. Read .helm/security/RLS_AUDIT.md for patterns
2. Implement the fix
3. Test with different user roles
4. Document in FIX STATUS section

Be thorough - security is critical.
```

### For Feature Issues (Baseball/Golf)
```
Fix all issues in this file.

For each issue:
1. Read .helm/UNDERSTANDING.json for feature details
2. Check .helm/HELM_ESSAY.md for patterns
3. Fix according to suggested solution
4. Test the feature end-to-end
5. Document in FIX STATUS section

Follow existing code patterns.
```

### For UI Issues
```
Fix all UI/UX issues in this file.

Focus on:
- Consistent design system usage
- Proper loading states
- Error handling
- Accessibility

Document each fix in FIX STATUS sections.
```

---

## 🧹 Cleanup Old Cycles

After a few cycles, clean up old files:

```bash
# Keep only last 5 cycles (archive others)
python3 cleanup_cycles.py --project ~/helmv3 --keep 5 --archive

# Show cycle summary
python3 cleanup_cycles.py --project ~/helmv3 --summary

# Delete specific old cycle
python3 cleanup_cycles.py --project ~/helmv3 --delete-cycle 1
```

---

## 🔄 Complete Example Session

```bash
# Monday: Run cycle 1
python3 multi_platform_cycle.py --project ~/helmv3
python3 organize_by_feature.py --project ~/helmv3 --cycle 1

# Monday-Tuesday: Fix security issues
# Open: .helm/cycles/features/database-and-rls-issues.md
# Tell Claude Code: "Fix all issues"

# Tuesday: Fix baseball recruiting
# Open: .helm/cycles/features/baseball-recruiting-issues.md
# Tell Claude Code: "Fix all issues"

# Wednesday: Run cycle 2 (verify Monday/Tuesday fixes)
python3 multi_platform_cycle.py --project ~/helmv3
python3 organize_by_feature.py --project ~/helmv3 --cycle 2

# Wednesday-Thursday: Fix remaining issues
# Repeat for each feature...

# Friday: Run cycle 3
python3 multi_platform_cycle.py --project ~/helmv3
# Check progress: issues should be decreasing!

# Cleanup old cycles
python3 cleanup_cycles.py --project ~/helmv3 --keep 3 --archive
```

---

## 📊 Tracking Progress

View the INDEX.md after each cycle to see progress:

```
Cycle 1: 45 total issues
  - 12 baseball-recruiting
  - 8 golf-scorecard
  - 7 database-and-rls
  ...

Cycle 2: 28 total issues (17 fixed! ✅)
  - 5 baseball-recruiting (7 fixed!)
  - 3 golf-scorecard (5 fixed!)
  - 2 database-and-rls (5 fixed!)
  ...

Cycle 3: 12 total issues (16 more fixed! ✅)
  - 2 baseball-recruiting
  - 1 golf-scorecard
  - 0 database-and-rls (all done! 🎉)
  ...
```

---

## 🎯 Pro Tips

1. **Start with security** - Always fix database-and-rls first
2. **One feature at a time** - Don't jump between features
3. **Test after each feature** - Make sure nothing breaks
4. **Review the INDEX** - It shows priority and progress
5. **Archive old cycles** - Keep workspace clean
6. **Feature MDs have context** - They include feature-specific info at the top

---

## 🔧 Customizing Feature Groups

Edit `organize_by_feature.py` if you want different groupings:

```python
feature_groups = {
    "recruiting-core": [],      # Custom group
    "recruiting-pipeline": [],  # Custom group
    "golf-scoring": [],         # Custom group
    "golf-teams": [],           # Custom group
    # ... add your own groups
}
```

---

**TL;DR:**  
1. Run cycle → gets 45 mixed issues  
2. Organize by feature → splits into 8 focused files  
3. Fix one file at a time in Cursor → better context  
4. Run next cycle → verifies fixes, creates new organized files  
5. Repeat until zero issues! 🎉

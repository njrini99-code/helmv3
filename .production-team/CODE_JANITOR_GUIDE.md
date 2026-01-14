# 🧹 Code Janitor - Codebase Cleanup Agent

## 🎯 What It Does

Code Janitor cleans up your codebase by:

✅ **Finding dead code** - unused components, imports, functions  
✅ **Organizing files** - move components to feature folders  
✅ **Consolidating docs** - merge scattered markdown files into feature docs  
✅ **Removing clutter** - console.logs, commented code, empty files  
✅ **Cleaning dependencies** - find unused npm packages  

## 🚀 How to Run (2 Steps)

### Step 1: Generate the Cleanup Audit

```bash
# Clean up ENTIRE codebase (both platforms)
python3 .claude/run_audit.py cleanup 1

# Clean up ONLY GolfHelm
python3 .claude/run_audit.py cleanup-golf 1

# Clean up ONLY BaseballHelm
python3 .claude/run_audit.py cleanup-baseball 1
```

### Step 2: Execute in Claude Code

```bash
# Open the generated file
open .production-team/CODE_CLEANUP/RUN_IN_CLAUDE_CODE.md

# Copy the message
# Paste into Claude Code
# Code Janitor runs autonomously!
```

---

## 📊 What It Finds

### 1. Dead Code
```
🗑️ Unused Components:
- src/components/OldTeamCard.tsx (not imported anywhere)
- src/components/DeprecatedButton.tsx (replaced by Button.tsx)

🔧 Unused Imports:
- src/app/golf/teams/page.tsx: Button imported but never used
- src/app/baseball/players/page.tsx: lodash imported but never used
```

### 2. File Organization
```
📁 Move to Features:
- src/components/TeamCard.tsx → src/app/golf/teams/TeamCard.tsx
  (only used in golf/teams feature)
  
- src/components/PlayerProfile.tsx → src/app/baseball/players/PlayerProfile.tsx
  (only used in baseball/players feature)
```

### 3. Markdown Consolidation
```
📄 Golf Team Management Docs:
Current (4 files):
- /TEAM_SETUP.md
- /docs/golf-teams.md
- /src/app/golf/teams/README.md
- /TEAM_TODO.md

Consolidate to:
- /src/app/golf/teams/TEAM_MANAGEMENT.md (single source of truth)

Delete old files after consolidation
```

### 4. Code Quality
```
🔍 Issues Found:
- 15 console.log statements to remove
- 7 blocks of commented code to delete
- 5 large files (>500 lines) to consider splitting
- 3 unused npm packages to uninstall
```

---

## 📁 Output Structure

```
.production-team/CODE_CLEANUP/
├── RUN_IN_CLAUDE_CODE.md .......... Paste this into Claude Code
├── PROMPT_CODE_JANITOR.md ......... Full agent prompt
└── CODE_JANITOR_AUDIT.md .......... Results (created by Claude Code)
```

---

## 🎯 Typical Use Cases

### Use Case 1: Pre-Production Cleanup
```bash
# Before deploying, clean up the mess
python3 .claude/run_audit.py cleanup 1

# Review findings
# Delete dead code
# Consolidate docs
# Deploy clean codebase
```

### Use Case 2: Feature Development
```bash
# Clean up just the feature you're working on
python3 .claude/run_audit.py cleanup-golf 1

# Focus on golf-related files only
# Organize golf docs
# Remove unused golf components
```

### Use Case 3: Documentation Sprint
```bash
# Consolidate all markdown files
python3 .claude/run_audit.py cleanup 1

# Merge scattered docs into feature docs
# Update outdated references
# Create single source of truth per feature
```

### Use Case 4: Dependency Audit
```bash
# Find unused npm packages
python3 .claude/run_audit.py cleanup 1

# Review unused dependencies
# Uninstall to reduce bundle size
# Clean up package.json
```

---

## 🧠 Code Janitor's Approach

### Phase 1: Scan & Report
- Find all issues
- Categorize by risk
- No changes yet

### Phase 2: Auto-Fix Safe Items
- Remove unused imports
- Delete console.logs  
- Remove commented code
- Delete empty files

### Phase 3: Manual Review
- Present file move proposals
- Show doc consolidation plan
- List components to delete
- Wait for approval

### Phase 4: Organize & Consolidate
- Move components to features
- Merge markdown files
- Update documentation
- Remove old files

---

## 📋 Example Output

```markdown
# Code Janitor Audit

## Executive Summary
- Dead code files: 8
- Unused imports: 45
- Markdown files to consolidate: 12 → 4
- Console.logs: 15
- File moves recommended: 15
- Unused packages: 3

## 🗑️ Dead Code (Safe to Delete)

### src/components/OldTeamCard.tsx
**Status:** UNUSED (not imported anywhere)
**Created:** 6 months ago
**Replacement:** TeamCard.tsx exists
**Action:** DELETE
**Command:** `rm src/components/OldTeamCard.tsx`
**Risk:** LOW

## 📄 Markdown Consolidation

### Golf Team Management
**Current:** 4 scattered files
**Consolidate to:** src/app/golf/teams/TEAM_MANAGEMENT.md
**Content:** [Shows consolidated outline]
**Delete:** TEAM_SETUP.md, docs/golf-teams.md, README.md, TEAM_TODO.md

## 🗂️ File Organization

### TeamCard.tsx
**From:** src/components/TeamCard.tsx
**To:** src/app/golf/teams/TeamCard.tsx
**Reason:** Only used in golf/teams
**Impact:** 1 import to update

## 📦 Dependencies

### lodash
**Status:** UNUSED
**Size:** 24.4kb
**Action:** npm uninstall lodash
**Risk:** NONE
```

---

## ⚡ Quick Commands

```bash
# Full cleanup
python3 .claude/run_audit.py cleanup 1

# Golf only
python3 .claude/run_audit.py cleanup-golf 1

# Baseball only
python3 .claude/run_audit.py cleanup-baseball 1
```

---

## 💡 Pro Tips

1. **Run before production deploys** - clean codebase = smaller bundle
2. **Run after major features** - cleanup technical debt quickly
3. **Review file moves carefully** - ensure imports update correctly
4. **Test after cleanup** - run `npm run build` to verify nothing broke
5. **Consolidate docs regularly** - keep documentation aligned with code

---

## 🎯 What Makes This Different

**Other tools:**
- ❌ Only find unused exports
- ❌ Miss contextual issues
- ❌ Don't organize files
- ❌ Ignore documentation

**Code Janitor:**
- ✅ Finds dead code across entire project
- ✅ Organizes files by feature
- ✅ Consolidates documentation
- ✅ Proposes file moves
- ✅ Cleans dependencies
- ✅ Removes clutter (console.logs, commented code)

---

## 🚀 Try It Now

```bash
cd /Users/ricknini/Downloads/helmv3

# Generate cleanup audit
python3 .claude/run_audit.py cleanup 1

# Open instructions
cat .production-team/CODE_CLEANUP/RUN_IN_CLAUDE_CODE.md

# Paste into Claude Code
# Let Code Janitor clean up your codebase!
```

---

*"A clean codebase is a maintainable codebase. Every file has a purpose or it's gone."*

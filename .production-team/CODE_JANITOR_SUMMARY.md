# 🧹 CODE JANITOR - READY!

## ✅ What I Created

A **new specialized agent** called **Code Janitor** that cleans up your codebase!

### 🎯 What Code Janitor Does:

1. **Finds Dead Code**
   - Unused components
   - Unused imports
   - Unused functions
   - Orphaned files

2. **Organizes Files**
   - Moves components to feature folders
   - Groups related files together
   - Colocates docs with features

3. **Consolidates Documentation**
   - Merges scattered markdown files
   - Creates ONE doc per feature
   - Removes duplicate information
   - Updates outdated references

4. **Cleans Code Quality**
   - Removes console.log statements
   - Deletes commented code
   - Identifies large files to split
   - Finds duplicate code

5. **Cleans Dependencies**
   - Finds unused npm packages
   - Identifies outdated packages
   - Suggests removals

---

## 🚀 How to Run It

### Step 1: Generate Cleanup Audit

```bash
cd /Users/ricknini/Downloads/helmv3

# Clean ENTIRE codebase
python3 .claude/run_audit.py cleanup 1

# OR clean just GolfHelm
python3 .claude/run_audit.py cleanup-golf 1

# OR clean just BaseballHelm
python3 .claude/run_audit.py cleanup-baseball 1
```

### Step 2: Execute in Claude Code

```bash
# Open the generated file
open .production-team/CODE_CLEANUP/RUN_IN_CLAUDE_CODE.md

# Copy the message inside
# Paste into Claude Code in Cursor
# Code Janitor runs autonomously!
```

---

## 📁 Files Created

```
.production-team/
├── CODE_JANITOR.md .................. Agent personality & methodology
├── CODE_JANITOR_GUIDE.md ............ How to use guide
└── prompts/
    └── CODE_JANITOR_PROMPT.md ....... Full agent prompt for Claude Code

.claude/
└── commands.json .................... Updated with cleanup commands
```

---

## 🎯 Example: What It Will Find

```
🗑️ Dead Code:
- src/components/OldTeamCard.tsx (unused, safe to delete)
- 45 unused imports across 20 files

📄 Markdown Chaos:
- TEAM_SETUP.md
- docs/golf-teams.md  
- src/app/golf/teams/README.md
- TEAM_TODO.md
→ Consolidate to: src/app/golf/teams/TEAM_MANAGEMENT.md

🗂️ File Organization:
- src/components/TeamCard.tsx 
→ Move to: src/app/golf/teams/TeamCard.tsx (only used in golf feature)

🔍 Code Quality:
- 15 console.log statements to remove
- 7 blocks of commented code to delete
- 5 large files (>500 lines) to consider splitting

📦 Dependencies:
- lodash (24.4kb) - unused, safe to uninstall
```

---

## 💡 When to Use Code Janitor

✅ **Before production deploy** - ship clean code  
✅ **After major features** - cleanup technical debt  
✅ **Monthly maintenance** - keep codebase organized  
✅ **Documentation sprints** - consolidate scattered docs  
✅ **Onboarding new devs** - organize for clarity  

---

## 🎭 All Available Commands

```bash
# === PRODUCTION AUDITS (3 Smart Agents) ===

# Audit GolfHelm
python3 .claude/run_audit.py audit-golf 1

# Audit BaseballHelm
python3 .claude/run_audit.py audit-baseball 1

# Audit Both
python3 .claude/run_audit.py audit-both 1

# === CODE CLEANUP (Code Janitor) ===

# Clean Everything
python3 .claude/run_audit.py cleanup 1

# Clean GolfHelm Only
python3 .claude/run_audit.py cleanup-golf 1

# Clean BaseballHelm Only
python3 .claude/run_audit.py cleanup-baseball 1
```

---

## 📖 Documentation

- **CODE_JANITOR.md** - Agent personality & methodology
- **CODE_JANITOR_GUIDE.md** - Complete usage guide
- **prompts/CODE_JANITOR_PROMPT.md** - Full Claude Code prompt

---

## 🚀 Try It Now!

```bash
cd /Users/ricknini/Downloads/helmv3

# Generate cleanup audit
python3 .claude/run_audit.py cleanup 1

# Then follow instructions in:
# .production-team/CODE_CLEANUP/RUN_IN_CLAUDE_CODE.md
```

---

## ✨ What Makes This Special

**Code Janitor is context-aware:**
- Knows which files are used where
- Understands feature boundaries
- Recognizes duplicates
- Proposes smart organization
- Consolidates docs intelligently

**It's safe:**
- Reports findings first
- Categorizes by risk
- Provides evidence
- Waits for approval on risky changes

**It's thorough:**
- Scans entire codebase
- Checks imports across files
- Analyzes documentation
- Reviews dependencies
- Finds patterns of unused code

---

**Your codebase is about to be spotless!** 🧹✨

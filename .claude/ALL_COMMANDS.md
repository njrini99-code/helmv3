# 🎯 ALL AVAILABLE COMMANDS

## Production Audit Agents (4 Total)

### 🛡️ Database Sentinel
Queries live database, checks RLS, finds security issues

### 🎯 Feature Maestro
Tests features, edge cases, completeness ⭐ **SUPER IMPORTANT**

### ✨ Experience Architect
Verifies glassmorphism, kelly green, Da Vinci quality

### 🧹 Code Janitor **← NEW!**
Cleans dead code, organizes files, consolidates docs

---

## 🚀 Commands

### Audit GolfHelm
```bash
python3 .claude/run_audit.py audit-golf 1
```
Runs Database Sentinel + Feature Maestro + Experience Architect on Golf only

### Audit BaseballHelm
```bash
python3 .claude/run_audit.py audit-baseball 1
```
Runs Database Sentinel + Feature Maestro + Experience Architect on Baseball only

### Audit Both Platforms
```bash
python3 .claude/run_audit.py audit-both 1
```
Runs all 3 agents on entire codebase

### Cleanup Everything **← NEW!**
```bash
python3 .claude/run_audit.py cleanup 1
```
Runs Code Janitor on entire codebase - finds dead code, organizes files, consolidates docs

### Cleanup GolfHelm Only **← NEW!**
```bash
python3 .claude/run_audit.py cleanup-golf 1
```
Cleans up just Golf code and docs

### Cleanup BaseballHelm Only **← NEW!**
```bash
python3 .claude/run_audit.py cleanup-baseball 1
```
Cleans up just Baseball code and docs

---

## 📊 What Each Command Does

| Command | Agents | Focus | Output |
|---------|--------|-------|--------|
| `audit-golf` | 3 agents | Golf production readiness | Database, features, UX findings |
| `audit-baseball` | 3 agents | Baseball production readiness | Database, features, UX findings |
| `audit-both` | 3 agents | Full platform audit | Complete production audit |
| `cleanup` | Code Janitor | Dead code, docs, organization | Cleanup recommendations |
| `cleanup-golf` | Code Janitor | Golf cleanup only | Golf-specific cleanup |
| `cleanup-baseball` | Code Janitor | Baseball cleanup only | Baseball-specific cleanup |

---

## 🎭 Typical Workflows

### Workflow 1: Production Readiness
```bash
# 1. Audit platform
python3 .claude/run_audit.py audit-golf 1

# 2. Fix issues found

# 3. Clean up while you're at it
python3 .claude/run_audit.py cleanup-golf 1

# 4. Verify fixes
python3 .claude/run_audit.py audit-golf 2
```

### Workflow 2: Code Cleanup Sprint
```bash
# 1. Find all the mess
python3 .claude/run_audit.py cleanup 1

# 2. Review findings
cat .production-team/CODE_CLEANUP/CODE_JANITOR_AUDIT.md

# 3. Delete dead code
# 4. Consolidate docs
# 5. Organize files

# 6. Verify nothing broke
npm run build
npm test
```

### Workflow 3: Feature Development
```bash
# Before starting new feature:
python3 .claude/run_audit.py cleanup-golf 1

# Organize Golf files
# Consolidate Golf docs
# Remove unused Golf components

# Now build feature with clean slate
```

---

## 📁 Output Locations

### Production Audits:
```
.production-team/GOLFHELM_AUDIT_ROUND_01/
.production-team/BASEBALLHELM_AUDIT_ROUND_01/
.production-team/ROUND_01/
```

### Code Cleanup:
```
.production-team/CODE_CLEANUP/
.production-team/CODE_CLEANUP_GOLF/
.production-team/CODE_CLEANUP_BASEBALL/
```

---

## 🧠 Memory System

All agents have persistent memory that grows with each round:

```
.production-team/memory/
├── database_sentinel_memory.json
├── feature_maestro_memory.json
├── experience_architect_memory.json
└── code_janitor_memory.json
```

Agents remember:
- What issues were fixed
- Patterns they learned
- Areas that need focus
- Progress over time

---

## ⚡ Quick Reference

**Production audit:** `python3 .claude/run_audit.py audit-golf 1`  
**Code cleanup:** `python3 .claude/run_audit.py cleanup 1`  

Then paste the generated message into Claude Code!

---

**4 genius agents. Infinite combinations. Complete control.** 🎭✨

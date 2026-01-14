# 🎯 Production Audit Commands for Claude Code

## ✅ SIMPLE 2-STEP PROCESS

### Step 1: Generate Agent Prompts

```bash
# For GolfHelm
python3 .claude/run_audit.py audit-golf 1

# For BaseballHelm
python3 .claude/run_audit.py audit-baseball 1

# For Both Platforms
python3 .claude/run_audit.py audit-both 1
```

This creates a file: `RUN_IN_CLAUDE_CODE.md`

### Step 2: Copy & Paste Into Claude Code

```bash
# Open the generated file
open .production-team/GOLFHELM_AUDIT_ROUND_01/RUN_IN_CLAUDE_CODE.md

# Copy the message
# Paste into Claude Code
# Done!
```

---

## 🎭 What Happens

### When You Run the Command:

1. **Loads ALL agent personalities** from `.production-team/`
2. **Loads ALL agent memories** from `.production-team/memory/`
3. **Applies platform scope** (Golf, Baseball, or Both)
4. **Generates complete prompts** with full intelligence
5. **Creates RUN_IN_CLAUDE_CODE.md** with everything Claude Code needs

### The Three Genius Agents:

**🛡️ Database Sentinel**
- Full personality + methodology loaded
- Memory from past rounds loaded
- Scoped to platform (golf tables only, etc.)
- Queries live database via Supabase MCP

**🎯 Feature Maestro** ⭐ **(SUPER IMPORTANT)**
- Full personality + methodology loaded
- Memory from past rounds loaded
- Tests all features with edge cases
- Checks completeness systematically

**✨ Experience Architect**
- Full personality + methodology loaded
- Memory from past rounds loaded
- Enforces Da Vinci philosophy
- Verifies glassmorphism + kelly green

---

## 📁 Output Structure

**After running `audit-golf`:**
```
.production-team/GOLFHELM_AUDIT_ROUND_01/
├── PROMPT_DATABASE_SENTINEL.md .......... Full agent prompt
├── PROMPT_FEATURE_MAESTRO.md ............ Full agent prompt
├── PROMPT_EXPERIENCE_ARCHITECT.md ....... Full agent prompt
├── RUN_IN_CLAUDE_CODE.md ................ Copy this into Claude Code
├── 01_DATABASE_SENTINEL_FINDINGS.md ..... (Created by Claude Code)
├── 02_FEATURE_MAESTRO_FINDINGS.md ....... (Created by Claude Code)
├── 03_EXPERIENCE_ARCHITECT_FINDINGS.md .. (Created by Claude Code)
├── 04_CROSS_AGENT_SYNTHESIS.md .......... (Created by Claude Code)
└── 05_PRIORITY_ACTION_ITEMS.md .......... (Created by Claude Code)
```

---

## 🚀 Complete Workflow

```bash
# 1. Generate prompts for GolfHelm
python3 .claude/run_audit.py audit-golf 1

# 2. Open the instruction file
cat .production-team/GOLFHELM_AUDIT_ROUND_01/RUN_IN_CLAUDE_CODE.md

# 3. Copy the message from that file

# 4. Open Claude Code (in Cursor or standalone)

# 5. Paste the message

# 6. Claude Code executes all 3 agents autonomously

# 7. Review findings
cat .production-team/GOLFHELM_AUDIT_ROUND_01/05_PRIORITY_ACTION_ITEMS.md

# 8. Fix issues

# 9. Run Round 2
python3 .claude/run_audit.py audit-golf 2
```

---

## 💡 Why This Works

### Before (Didn't Work):
❌ You had to manually combine agent files  
❌ No memory loaded  
❌ Platform scope unclear  
❌ Confusing to execute  

### Now (Works Perfectly):
✅ **One command** generates everything  
✅ **Full agent intelligence** loaded  
✅ **Memory automatically** loaded and applied  
✅ **Platform scope** built-in  
✅ **Simple copy/paste** into Claude Code  
✅ **Agents run autonomously** with full capabilities  

---

## 🎯 Available Commands

```bash
# GolfHelm only
python3 .claude/run_audit.py audit-golf 1

# BaseballHelm only
python3 .claude/run_audit.py audit-baseball 1

# Both platforms
python3 .claude/run_audit.py audit-both 1

# Round 2 (after fixes)
python3 .claude/run_audit.py audit-golf 2
```

---

## 🧠 Memory System

**First Run:**
- Agents have no memory
- Establish baseline findings
- Create memory files

**Second Run:**
- Agents load memory from Round 1
- Skip re-reporting fixed issues
- Go deeper on edge cases
- Update memory with new learnings

**Round 3+:**
- Agents have deep knowledge
- Predict issues based on patterns
- Expert-level auditing

---

## 📊 Example Usage

```bash
$ python3 .claude/run_audit.py audit-golf 1

======================================================================
🎭 PRODUCTION AUDIT - GOLFHELM - ROUND 01
======================================================================

📁 Output: .production-team/GOLFHELM_AUDIT_ROUND_01

🛡️ DATABASE SENTINEL
──────────────────────────────────────────────────────────────────────
✅ Generated prompt: .production-team/GOLFHELM_AUDIT_ROUND_01/PROMPT_DATABASE_SENTINEL.md
   Memory loaded: No (first run)
   Platform scope: GolfHelm

🎯 FEATURE MAESTRO
──────────────────────────────────────────────────────────────────────
✅ Generated prompt: .production-team/GOLFHELM_AUDIT_ROUND_01/PROMPT_FEATURE_MAESTRO.md
   Memory loaded: No (first run)
   Platform scope: GolfHelm

✨ EXPERIENCE ARCHITECT
──────────────────────────────────────────────────────────────────────
✅ Generated prompt: .production-team/GOLFHELM_AUDIT_ROUND_01/PROMPT_EXPERIENCE_ARCHITECT.md
   Memory loaded: No (first run)
   Platform scope: GolfHelm

======================================================================
✨ PROMPTS GENERATED!
======================================================================

📄 Next: Open and copy: .production-team/GOLFHELM_AUDIT_ROUND_01/RUN_IN_CLAUDE_CODE.md
📋 Paste into Claude Code
🚀 Agents will execute with full intelligence + memory
```

Then just:
1. Open `RUN_IN_CLAUDE_CODE.md`
2. Copy the message
3. Paste into Claude Code
4. Watch the genius agents work!

---

## ✨ That's It!

**One command. One copy/paste. Full intelligent agents with memory.**

Start now:
```bash
python3 .claude/run_audit.py audit-golf 1
```

# 🎯 Helm Intelligence - Quick Reference Card

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    HELM INTELLIGENCE QUICK REFERENCE                     ║
║                    Keep this open while working                          ║
╚══════════════════════════════════════════════════════════════════════════╝
```

## 🚀 Quick Commands

### Start Daily Workflow
```bash
# Set API key (once per session)
export ANTHROPIC_API_KEY="sk-ant-..."

# Morning: Run verification cycle
cd ~/helmv3/tools/continuous-improvement
python cycle-agent.py --project ~/helmv3 --platform baseballhelm

# Check progress
python view-cycles.py ~/helmv3
```

### Claude Code Fixing Session
```
1. Open .helm/cycles/issues-cycle-XXX.md in Cursor
2. Tell Claude Code: "Fix all issues. Document in FIX STATUS sections."
3. Wait for Claude Code to complete
4. Review changes: git diff
5. Run next cycle to verify
```

### Overnight Mode
```bash
# Before bed
python cycle-agent.py \
  --project ~/helmv3 \
  --platform baseballhelm \
  --continuous \
  --wait 600

# In morning: Ctrl+C to stop
```

---

## 📊 File Locations

| What | Where |
|------|-------|
| **Current issues** | `.helm/cycles/issues-cycle-XXX.md` |
| **App understanding** | `.helm/UNDERSTANDING.json` |
| **Platform essay** | `.helm/BASEBALLHELM_ESSAY.md` |
| **Security audit** | `.helm/security/RLS_AUDIT.md` |
| **Action items** | `.helm/ACTIONS.md` |
| **Feature specs** | `*.spec.md` (next to code) |

---

## 🔄 The Cycle Workflow

```
1. Run Cycle → Finds issues → issues-cycle-XXX.md
         ↓
2. Claude Code → Fixes issues → Updates FIX STATUS
         ↓
3. Run Next Cycle → Verifies fixes → New issues-cycle-XXX.md
         ↓
[REPEAT]
```

---

## 💰 Cost Reference

| Activity | Cost | Time |
|----------|------|------|
| Overnight analysis | $8-15 | 1-2 hrs |
| Single cycle | $2-5 | 15-30 min |
| Ultra Agent Audit | $0 | Instant |
| 10 cycles | $20-50 | 3-5 hrs |

---

## 🎯 Common Tasks

### View Progress
```bash
python view-cycles.py ~/helmv3
```

### View Specific Cycle
```bash
python view-cycles.py ~/helmv3 --cycle 5
```

### Run Analysis Only (Skip Verification)
```bash
python cycle-agent.py --project ~/helmv3 --platform baseballhelm --mode analyze
```

### Run Verification Only
```bash
python cycle-agent.py --project ~/helmv3 --platform baseballhelm --mode verify
```

### Check Route Health (Ultra Agent)
```bash
cd tools/ultra-agent-audit
npm start
# → http://localhost:3333
```

---

## 🐛 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| "No previous cycle" | Normal for cycle 1 |
| Claude Code didn't update MD | Remind it: "Update FIX STATUS sections" |
| Too many regressions | Use `--mode analyze` and fix more carefully |
| Cycle too slow | Check network, reduce --max_turns in code |
| Can't find file | Check path: `ls .helm/cycles/` |

---

## 📋 Daily Routine

```
☀️ MORNING
  1. Check overnight results (if running)
  2. Run verification cycle
  3. Review issues-cycle-XXX.md
  
⚙️ MIDDAY  
  4. Claude Code fixes critical issues
  5. Review changes
  6. Commit good changes
  
🌙 EVENING
  7. Run final cycle
  8. Start overnight continuous (optional)
```

---

## 🎨 Issue Severity Guide

| Emoji | Severity | Fix When |
|-------|----------|----------|
| 🔴 | Critical | Immediately |
| 🟠 | High | This session |
| 🟡 | Medium | This week |
| 🟢 | Low | When convenient |

---

## 📈 Success Metrics

Track these numbers going down:
- Total open issues
- Critical issues
- High-priority issues
- Regressions per cycle

Goal: **Zero issues** in 30-40 cycles

---

## 🔗 Tool Purposes

```
┌─────────────────────────────────────────────┐
│  OVERNIGHT ANALYSIS (overnight.py)          │
│  Purpose: Deep understanding               │
│  When: Once per platform, monthly refresh  │
│  Output: Comprehensive docs                │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  CONTINUOUS IMPROVEMENT (cycle-agent.py)    │
│  Purpose: Verify + Find + Fix loop         │
│  When: Daily or continuous                 │
│  Output: Issue lists for Claude Code       │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  ULTRA AGENT AUDIT (ultra-agent-audit/)     │
│  Purpose: Route analysis + visualization   │
│  When: Weekly health checks                │
│  Output: Route issues, flow maps           │
└─────────────────────────────────────────────┘
```

---

## 💡 Pro Tips

1. **Always review** Claude Code's changes before next cycle
2. **Backup before** long continuous runs
3. **Track progress** in daily notes
4. **Focus severity** - Fix critical first, low last
5. **Watch regressions** - They indicate design issues

---

## 🆘 Emergency Commands

```bash
# Stop continuous mode
Ctrl+C

# See what's happening
tail -f ~/helmv3/.helm/cycles/issues-cycle-latest.md

# Rollback to previous cycle
rm .helm/cycles/issues-cycle-XXX.*

# Start fresh
rm -rf .helm/cycles
python cycle-agent.py --project ~/helmv3 --platform baseballhelm
```

---

## 📞 Quick Help

```bash
# Cycle agent help
python cycle-agent.py --help

# View cycles help
python view-cycles.py --help

# Overnight help
python overnight.py --help
```

---

## ✅ Pre-flight Checklist

Before starting:
- [ ] ANTHROPIC_API_KEY set
- [ ] In correct directory
- [ ] Previous cycle reviewed
- [ ] Git working tree clean
- [ ] Coffee ☕

---

*Print this or keep it open in a terminal while you work*
*Built for Helm Sports Labs*

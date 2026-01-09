# 🎯 Multi-Platform Improvement Guide

Your project has **multiple platforms** under one codebase:
- **BaseballHelm** - College baseball recruiting
- **GolfHelm** - Golf team management  
- **CoachHelm** - General coaching platform (if exists)

This guide shows how to run improvement cycles across ALL platforms.

---

## 🏗️ Multi-Platform Structure

```
helmv3/
├── src/
│   └── app/
│       ├── baseball/          # BaseballHelm routes
│       ├── golf/              # GolfHelm routes
│       └── coach/             # CoachHelm routes (optional)
├── .helm/
│   ├── UNDERSTANDING.json     # Combined or per-platform
│   ├── BASEBALLHELM_ESSAY.md  # Baseball-specific docs
│   ├── GOLFHELM_ESSAY.md      # Golf-specific docs
│   ├── ACTIONS.md
│   ├── ISSUES.md
│   ├── security/
│   │   └── RLS_AUDIT.md       # Covers all platforms
│   └── cycles/
│       ├── issues-cycle-001.md    # May contain all platforms
│       ├── baseball-cycle-001.md  # Or platform-specific
│       └── golf-cycle-001.md
```

---

## 🚀 Quick Start: All Platforms

### One Command For Everything

```bash
cd tools/continuous-improvement

# Run on ALL platforms automatically
python multi-platform-cycle.py --project ~/helmv3
```

This will:
1. **Auto-detect** your platforms (baseball, golf, coach)
2. **Run cycles** on each one sequentially  
3. **Show summary** of all platforms combined

---

## 📋 Option 1: Auto-Detect Platforms (Recommended)

```bash
# Automatically finds all platforms
python multi-platform-cycle.py --project ~/helmv3

# Output:
╔══════════════════════════════════════════════════════════════════╗
║   🔄 MULTI-PLATFORM CONTINUOUS IMPROVEMENT                       ║
║   Project: /Users/you/helmv3                                     ║
║   Platforms: baseballhelm, golfhelm                              ║
╚══════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🏃 Running cycle for BASEBALLHELM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Baseball analysis...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🏃 Running cycle for GOLFHELM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Golf analysis...]

╔══════════════════════════════════════════════════════════════════╗
║   📊 MULTI-PLATFORM CYCLE SUMMARY                                ║
╚══════════════════════════════════════════════════════════════════╝

✅ BASEBALLHELM       15 issues remaining
✅ GOLFHELM           8 issues remaining
```

---

## 📋 Option 2: Specify Platforms

```bash
# Run only on specific platforms
python multi-platform-cycle.py --project ~/helmv3 --platforms baseball golf

# Short names work (auto-adds "helm" suffix)
python multi-platform-cycle.py --project ~/helmv3 --platforms baseball

# Full names also work
python multi-platform-cycle.py --project ~/helmv3 --platforms baseballhelm golfhelm
```

---

## 🔄 Continuous Mode (All Platforms)

```bash
# Run cycles every 10 minutes on ALL platforms
python multi-platform-cycle.py \
  --project ~/helmv3 \
  --continuous \
  --wait 600

# Output:
Cycle 1 complete on all platforms
⏳ Waiting 600 seconds before next cycle...

Cycle 2 complete on all platforms
⏳ Waiting 600 seconds...

[Runs forever until Ctrl+C]
```

---

## ⚡ Parallel Mode (Faster but $$$)

```bash
# Run all platforms AT THE SAME TIME
python multi-platform-cycle.py --project ~/helmv3 --parallel

# Pros:
# - Much faster (2x-3x speed)
# - All platforms analyzed simultaneously

# Cons:
# - More API usage (more $$$)
# - Higher token rate limits
```

**Cost comparison:**
- Sequential: ~$2-5 per cycle (all platforms)
- Parallel: ~$2-5 per cycle BUT completes in 1/3 the time

---

## 📊 Combined Statistics

```bash
# See stats across ALL platforms
python multi-platform-cycle.py --project ~/helmv3 --stats-only

# Output:
╔══════════════════════════════════════════════════════════════════╗
║   📊 COMBINED PLATFORM STATISTICS                                ║
╚══════════════════════════════════════════════════════════════════╝

Total Issues Across All Platforms: 23
  🔴 Critical: 3
  🟠 High: 8
  🟡 Medium: 9
  🟢 Low: 3

By Platform:
  BASEBALLHELM         15 issues
    🔴 2  🟠 5  🟡 6  🟢 2
  
  GOLFHELM             8 issues
    🔴 1  🟠 3  🟡 3  🟢 1
```

---

## 🎯 Recommended Workflows

### Workflow 1: Weekly Full Analysis

```bash
# Sunday night: Run overnight analysis on all platforms
cd tools
python overnight.py --project ~/helmv3 --name baseballhelm
python overnight.py --project ~/helmv3 --name golfhelm

# Monday-Friday: Daily improvement cycles
cd continuous-improvement
python multi-platform-cycle.py --project ~/helmv3

# Claude Code fixes issues during the week
```

### Workflow 2: Continuous Overnight

```bash
# Before bed Friday night
python multi-platform-cycle.py \
  --project ~/helmv3 \
  --continuous \
  --wait 1800  # 30 min cycles

# Wake up Monday: 48+ cycles completed!
# Check combined stats:
python multi-platform-cycle.py --project ~/helmv3 --stats-only
```

### Workflow 3: Focus on One Platform

```bash
# Just work on baseball this week
python enhanced-cycle-agent.py --project ~/helmv3 --platform baseballhelm

# When baseball is clean, switch to golf
python enhanced-cycle-agent.py --project ~/helmv3 --platform golfhelm
```

---

## 📁 Output Organization

Each platform gets its own issues file:

```
.helm/cycles/
├── issues-cycle-001.md          # All platforms combined
├── baseballhelm-cycle-001.md    # Baseball only  
├── golfhelm-cycle-001.md        # Golf only
├── cycle-001-summary.json       # Combined stats
└── ...
```

**In Claude Code:**
```
Option A: Fix all platforms at once
  Open: issues-cycle-001.md
  
Option B: Focus on one platform
  Open: baseballhelm-cycle-001.md
```

---

## 🔧 Platform-Specific Commands

If you want to run just one platform with full control:

```bash
# Baseball only
python enhanced-cycle-agent.py \
  --project ~/helmv3 \
  --platform baseballhelm \
  --mode full

# Golf only
python enhanced-cycle-agent.py \
  --project ~/helmv3 \
  --platform golfhelm \
  --mode full

# Coach only (if exists)
python enhanced-cycle-agent.py \
  --project ~/helmv3 \
  --platform coachhelm \
  --mode full
```

---

## 💰 Cost Estimation

| Operation | Platforms | Cost | Time |
|-----------|-----------|------|------|
| Overnight analysis | All (2-3) | $16-45 | 2-6 hrs |
| Single cycle | All (2-3) | $4-15 | 30-90 min |
| Single cycle | One | $2-5 | 15-30 min |
| 10 cycles | All (2-3) | $40-150 | 5-15 hrs |

**Budget for 30 days:**
- Weekly overnight: 4 × $30 = $120
- Daily cycles: 30 × $10 = $300
- **Total: ~$420/month** for continuous improvement across all platforms

---

## 🎓 Best Practices

### 1. Start with One Platform

```bash
# Week 1: Master baseball
python enhanced-cycle-agent.py --project ~/helmv3 --platform baseballhelm

# Week 2: Add golf
python multi-platform-cycle.py --project ~/helmv3 --platforms baseball golf

# Week 3: Add coach (if exists)
python multi-platform-cycle.py --project ~/helmv3
```

### 2. Prioritize by User Impact

```bash
# If baseball has more users, focus there first
for i in {1..10}; do
  python enhanced-cycle-agent.py --project ~/helmv3 --platform baseballhelm
  # Fix issues in Claude Code
done

# Then golf
for i in {1..10}; do
  python enhanced-cycle-agent.py --project ~/helmv3 --platform golfhelm
  # Fix issues in Claude Code
done
```

### 3. Use Parallel for Speed (When Budget Allows)

```bash
# When you have budget and want speed
python multi-platform-cycle.py --project ~/helmv3 --parallel

# Completes 3 platforms in time of 1!
```

---

## 🐛 Troubleshooting

### "Platform not found"

The auto-detect looks for:
1. Routes: `src/app/baseball`, `src/app/golf`, `src/app/coach`
2. Essays: `.helm/BASEBALLHELM_ESSAY.md`, etc.

If auto-detect fails:
```bash
# Explicitly specify
python multi-platform-cycle.py --project ~/helmv3 --platforms baseball golf
```

### "No overnight analysis"

Each platform needs its own overnight analysis:
```bash
python overnight.py --project ~/helmv3 --name baseballhelm
python overnight.py --project ~/helmv3 --name golfhelm
```

### "Issues mixed between platforms"

Check if your database/security issues affect multiple platforms:
- RLS policies typically affect all platforms
- Shared components affect all platforms
- Platform-specific features only affect one

---

## 📈 Tracking Progress Across Platforms

```bash
# Daily standup
python multi-platform-cycle.py --project ~/helmv3 --stats-only

# See trends
Week 1: 50 total issues (30 baseball, 20 golf)
Week 2: 35 total issues (20 baseball, 15 golf)
Week 3: 18 total issues (10 baseball, 8 golf)
Week 4: 5 total issues (3 baseball, 2 golf)
```

---

## 🎯 Quick Reference

```bash
# ALL PLATFORMS - Auto-detect
python multi-platform-cycle.py --project ~/helmv3

# SPECIFIC PLATFORMS
python multi-platform-cycle.py --project ~/helmv3 --platforms baseball golf

# CONTINUOUS MODE (all platforms)
python multi-platform-cycle.py --project ~/helmv3 --continuous --wait 600

# PARALLEL MODE (fast)
python multi-platform-cycle.py --project ~/helmv3 --parallel

# STATS ONLY
python multi-platform-cycle.py --project ~/helmv3 --stats-only

# SINGLE PLATFORM (more control)
python enhanced-cycle-agent.py --project ~/helmv3 --platform baseballhelm
```

---

**TL;DR:** Use `multi-platform-cycle.py` to handle all platforms at once. It auto-detects your platforms and runs cycles on each one. Much easier than running commands separately for each platform!


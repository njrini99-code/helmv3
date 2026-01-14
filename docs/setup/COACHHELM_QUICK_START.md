# CoachHelm - Quick Start Guide

## ✅ What's Done

The **complete CoachHelm Insight Generation System** is now built and integrated into your golf dashboards!

---

## 🚀 Quick Setup (3 Steps)

### 1. Run Database Migration

Copy the SQL from `COACHHELM_DATABASE_SETUP.md` and run it in your Supabase SQL Editor.

### 2. Configure Your Philosophy

As a coach:
1. Go to **Settings** → **Coaching Philosophy** (✨ icon)
2. Set your priorities and thresholds
3. Save

### 3. Generate Insights

1. Go to your **Coach Dashboard**
2. Find the **"CoachHelm Insights"** section
3. Click **"Generate Insights"**
4. Wait ~5-10 seconds
5. Review your insights!

---

## 📍 Where to Find CoachHelm Features

### For Coaches:

**Settings:**
- `/golf/dashboard/settings` → Click "Coaching Philosophy"
- Configure priorities, thresholds, alert types

**Dashboard:**
- `/golf/dashboard` → Left column → "CoachHelm Insights" section
- See active insights
- Generate new insights
- Manage insights (resolve, acknowledge, dismiss)

### For Players:

**Dashboard:**
- `/golf/dashboard` → Left column → "My Focus Areas" section
- See personalized improvement areas
- View recommended drills
- Track progress

---

## 🎯 What CoachHelm Does

### Automatically Detects:

1. **Scoring Decline** 📉 - Player's scores trending up
2. **Tournament Pressure** 🎯 - Gap between practice & tournament performance
3. **Performance Plateau** 📏 - No improvement over time
4. **Bubble Players** ⚠️ - Players near roster cutoff
5. **Surge Players** 🚀 - Rapid improvement
6. **Hot/Cold Streaks** 🔥 - Momentum tracking
7. **Stat Regression** 📊 - Decline in specific stats

### Provides:

- **Clear descriptions** of what's happening
- **Actionable recommendations** for coaches
- **Supporting data** and metrics
- **Priority levels** (urgent → low)
- **Player-specific focus areas**

---

## 📊 Files Created

**Core Logic:**
- `src/lib/coachhelm/insight-types.ts` - Types & configs
- `src/lib/coachhelm/insight-engine.ts` - Analysis engine

**API:**
- `src/app/golf/actions/insights.ts` - Server actions

**UI Components:**
- `src/components/golf/coachhelm/insights/` - All insight components

**Dashboards:**
- Coach Dashboard - Updated with Insights Feed
- Player Dashboard - Updated with Focus Areas

**Database:**
- 4 new tables (see migration file)

---

## 💡 Pro Tips

1. **Need more insights?** Set sensitivity to "Aggressive" in settings
2. **Too many insights?** Set to "Conservative" or disable specific alert types
3. **No insights?** Make sure players have at least 5-10 rounds logged
4. **Customize thresholds** to match your coaching style
5. **Regenerate insights** after new rounds are added

---

## 🎓 How It Works

```
Coach clicks "Generate Insights"
  ↓
System analyzes all players' recent rounds
  ↓
Compares performance to coach's thresholds
  ↓
Generates insights based on patterns detected
  ↓
Displays on dashboard with recommendations
```

---

## 📚 Full Documentation

See `COACHHELM_IMPLEMENTATION_GUIDE.md` for:
- Complete API reference
- Database schema details
- Troubleshooting guide
- Future enhancement ideas

---

## ✨ You're Ready!

The CoachHelm system is **fully functional** and ready to use. Just:

1. ✅ Run the migration
2. ✅ Configure your philosophy
3. ✅ Generate insights
4. ✅ Start coaching smarter!

Enjoy your AI-powered coaching assistant! 🎯⛳

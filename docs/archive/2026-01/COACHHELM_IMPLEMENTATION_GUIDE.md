# CoachHelm Insight Generation System - Implementation Guide

## 🎉 What Was Built

A complete AI-powered coaching insight system that analyzes player performance and generates actionable recommendations for coaches, plus personalized focus areas for players.

---

## 📋 Step-by-Step Setup

### Step 1: Run Database Migration

1. Open your Supabase Dashboard
2. Go to **SQL Editor** → **New Query**
3. Copy the SQL from `COACHHELM_DATABASE_SETUP.md`
4. Run the query
5. Verify tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND (table_name LIKE 'golf_%insight%' OR table_name LIKE 'golf_%focus%');
```

You should see:
- ✅ `golf_coach_insights`
- ✅ `golf_player_focus_areas`
- ✅ `golf_insight_generation_log`
- ✅ `golf_player_performance_snapshots`

### Step 2: Verify Files Were Created

All code files have been created. Verify they exist:

**Types & Engine:**
- ✅ `src/lib/coachhelm/insight-types.ts` - TypeScript types
- ✅ `src/lib/coachhelm/insight-engine.ts` - Core analysis logic

**Server Actions:**
- ✅ `src/app/golf/actions/insights.ts` - API for generating/managing insights

**UI Components:**
- ✅ `src/components/golf/coachhelm/insights/InsightCard.tsx`
- ✅ `src/components/golf/coachhelm/insights/InsightsFeed.tsx`
- ✅ `src/components/golf/coachhelm/insights/FocusAreaCard.tsx`
- ✅ `src/components/golf/coachhelm/insights/PlayerFocusAreas.tsx`
- ✅ `src/components/golf/coachhelm/insights/index.ts`

**Dashboard Integration:**
- ✅ Coach Dashboard updated with Insights Feed
- ✅ Player Dashboard updated with Focus Areas

### Step 3: Test the System

#### For Coaches:

1. **Configure Philosophy Settings:**
   - Go to `/golf/dashboard/settings`
   - Click "Coaching Philosophy" (✨ sparkles icon)
   - Set your priorities, thresholds, and alert preferences
   - Save changes

2. **Generate Insights:**
   - Go to `/golf/dashboard`
   - In the "CoachHelm Insights" section, click **"Generate Insights"**
   - Wait for analysis to complete
   - Review generated insights

3. **Manage Insights:**
   - Click on any insight to expand details
   - Read the recommendation
   - Choose an action:
     - **Resolve** - Mark as handled
     - **Acknowledge** - Mark as seen
     - **Dismiss** - Hide it

#### For Players:

1. **View Focus Areas:**
   - Go to `/golf/dashboard`
   - See "My Focus Areas" section in left column
   - View personalized improvement areas
   - See recommended drills and targets

---

## 🧠 How It Works

### Insight Generation Flow

```
1. Coach clicks "Generate Insights"
   ↓
2. System fetches coach philosophy settings
   ↓
3. System loads all players + their last 20 rounds
   ↓
4. For each player:
   - Analyze scoring trends
   - Detect patterns (decline, pressure, streaks)
   - Compare to thresholds
   - Generate insights based on philosophy
   ↓
5. Save insights to database
   ↓
6. Display on dashboard
```

### Insight Types Generated

The system automatically detects:

1. **Scoring Decline** 📉
   - Recent 5 rounds vs previous 5 rounds
   - Threshold: Configurable (default 2.0 strokes)

2. **Tournament Pressure** 🎯
   - Practice rounds vs tournament rounds
   - Identifies mental game issues

3. **Performance Plateau** 📏
   - No improvement over 15+ rounds
   - Low variability in scores

4. **Bubble Player** ⚠️
   - Players near travel squad cutoff
   - Urgent priority

5. **Surge Player** 🚀
   - Rapid improvement (2+ strokes)
   - Positive recognition

6. **Hot/Cold Streaks** 🔥
   - 5+ rounds significantly better/worse
   - Momentum tracking

7. **Stat Regression** 📊
   - Decline in specific stats (fairways, GIR, etc.)
   - Requires advanced stat tracking

---

## 🎨 UI Components

### Coach Dashboard - Insights Feed

Location: `/golf/dashboard` (left column)

Features:
- Shows top 3-5 active insights
- Priority-based sorting (urgent → low)
- Generate/Refresh button
- Expandable cards with details
- Action buttons (Resolve, Acknowledge, Dismiss)

### Player Dashboard - Focus Areas

Location: `/golf/dashboard` (left column)

Features:
- Priority-ranked focus areas (1-5)
- Category icons (🎯 Ball Striking, ⛳ Short Game, etc.)
- Target improvements
- Recommended drills
- Progress tracking

---

## 🔧 Configuration

### Coach Philosophy Settings

Location: `/golf/dashboard/settings/coaching-intelligence`

**Metric Priorities:**
- Drag to reorder what matters most
- Influences insight generation

**Alert Sensitivity:**
- Aggressive: More insights, earlier warnings
- Balanced: Standard thresholds
- Conservative: Only high-confidence issues

**Thresholds:**
- Decline Threshold: 1.0-4.0 strokes
- Pressure Gap: 1.0-4.0 strokes
- Bubble Zone: 0.5-3.0 strokes

**Alert Types:**
- Toggle which insights you want
- Performance, Roster, Patterns

---

## 📊 Database Schema

### `golf_coach_insights`
Stores generated insights for coaches.

Key fields:
- `insight_type`: Type of insight
- `priority`: low | medium | high | urgent
- `player_id`: Related player (null for team insights)
- `title`, `description`, `recommendation`: Content
- `metadata`: JSONB with supporting data
- `status`: active | acknowledged | resolved | dismissed
- `expires_at`: Auto-dismiss date

### `golf_player_focus_areas`
Stores personalized focus areas for players.

Key fields:
- `player_id`: Player this applies to
- `category`: ball_striking | short_game | putting | etc.
- `priority_rank`: 1-5 (1 = highest)
- `title`, `description`: Content
- `specific_drills`: Array of drill names
- `current_performance`: JSONB stats
- `target_improvement`: Goal text
- `status`: active | in_progress | improved | archived

---

## 🚀 API Reference

### Server Actions

All actions in: `src/app/golf/actions/insights.ts`

#### `generateTeamInsights()`
Analyzes entire team and creates insights.

**Returns:**
```typescript
{
  success: boolean;
  insights_created: number;
  players_analyzed: number;
  execution_time_ms: number;
  error?: string;
}
```

#### `getActiveInsights(limit?: number)`
Fetches active insights for current coach.

**Returns:**
```typescript
{
  success: boolean;
  insights: InsightWithPlayer[];
  error?: string;
}
```

#### `acknowledgeInsight(insightId: string)`
Marks insight as acknowledged.

#### `dismissInsight(insightId: string)`
Hides insight from active list.

#### `resolveInsight(insightId: string)`
Marks insight as resolved.

#### `getPlayerFocusAreas(playerId: string)`
Gets focus areas for a specific player.

---

## 🎯 Next Steps

### Immediate (Required for Full Functionality):

1. **Run the database migration** (see Step 1 above)
2. **Configure your coaching philosophy** as a coach
3. **Add some round data** for players (at least 5-10 rounds per player)
4. **Generate insights** and test the system

### Future Enhancements (Optional):

1. **Auto-Generate Insights:**
   - Set up a cron job to run `generateTeamInsights()` daily
   - Use Supabase Edge Functions or Vercel Cron

2. **Focus Area Management:**
   - Build UI for coaches to manually create/edit focus areas
   - Add drill library integration

3. **Performance Snapshots:**
   - Implement periodic snapshot generation
   - Track long-term trends

4. **Email Notifications:**
   - Send coaches urgent insights via email
   - Weekly digest of insights

5. **Advanced Analytics:**
   - Strokes gained analysis
   - Hole-by-hole pattern detection
   - Weather/course condition correlation

---

## 🐛 Troubleshooting

### "Coach philosophy not found" error
**Solution:** Go to `/golf/dashboard/settings/coaching-intelligence` and configure your settings first.

### No insights generated
**Possible causes:**
- Not enough round data (need 3+ rounds per player)
- All alert types disabled in philosophy settings
- Thresholds set too high (try "aggressive" sensitivity)

### Insights not showing on dashboard
**Check:**
1. Database migration ran successfully
2. RLS policies are enabled
3. Coach is authenticated
4. Browser console for errors

### Player focus areas empty
**Note:** Focus areas must be manually created by coaches initially. Auto-generation of focus areas based on insights is a future enhancement.

---

## 📝 Summary

You now have a complete CoachHelm insight generation system! The system:

✅ Analyzes player performance automatically
✅ Generates actionable coaching insights
✅ Respects coach philosophy and preferences
✅ Displays insights on coach dashboard
✅ Shows focus areas on player dashboard
✅ Allows insight management (acknowledge, dismiss, resolve)
✅ Tracks generation history and performance

**The foundation is built.** You can now:
- Generate insights for your team
- Review and act on recommendations
- Track player focus areas
- Customize analysis parameters

Enjoy your AI-powered coaching assistant! 🎓⛳

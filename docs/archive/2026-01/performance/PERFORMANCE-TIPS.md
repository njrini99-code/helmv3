# ⚡ QUICK PERFORMANCE WINS - Do Before Your Demo

## 1. RUN IN PRODUCTION MODE (Critical!)

**During your demo, DON'T use `npm run dev`!**

```bash
# Build for production
npm run build

# Run production server (much faster!)
npm run start
```

Dev mode is 5-10x slower than production mode.

---

## 2. ADD DATABASE INDEXES (Run in Supabase SQL Editor)

These indexes will make queries much faster:

```sql
-- Players discovery (most important for Discover page)
CREATE INDEX IF NOT EXISTS idx_players_recruiting ON players(recruiting_activated) WHERE recruiting_activated = true;
CREATE INDEX IF NOT EXISTS idx_players_grad_year ON players(grad_year);
CREATE INDEX IF NOT EXISTS idx_players_state ON players(state);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(primary_position);

-- Watchlist/Pipeline queries
CREATE INDEX IF NOT EXISTS idx_watchlists_coach ON watchlists(coach_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_player ON watchlists(player_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_stage ON watchlists(coach_id, pipeline_stage);

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);

-- Coach lookups
CREATE INDEX IF NOT EXISTS idx_coaches_user ON coaches(user_id);
CREATE INDEX IF NOT EXISTS idx_coaches_org ON coaches(organization_id);

-- Golf indexes
CREATE INDEX IF NOT EXISTS idx_golf_rounds_player ON golf_rounds(player_id);
CREATE INDEX IF NOT EXISTS idx_golf_players_team ON golf_players(team_id);
```

---

## 3. PRELOAD DATA ON LOGIN

After login, the dashboard makes multiple API calls. This is expected, but ensure you:

1. Login before the demo starts
2. Navigate to each page once to "warm up" the cache
3. Keep the browser tab open

---

## 4. BROWSER PERFORMANCE TIPS

### Clear Cache Before Demo
```
Chrome: Cmd+Shift+Delete → Clear browsing data
```

### Use Chrome (fastest for React)
Safari and Firefox are slightly slower for heavy JS apps.

### Close Other Tabs
Each tab uses memory. Close Slack, email, etc.

### Disable Extensions
Ad blockers and dev tools extensions can slow things down.

---

## 5. NETWORK OPTIMIZATION

### Use a Stable Connection
- Wired ethernet > WiFi
- If presenting remotely, test your connection first

### If Supabase is Slow
Check Supabase status: https://status.supabase.com

---

## 6. QUICK CODE FIXES (Optional - only if you have time)

### Add Loading Skeletons
If pages flash blank before loading, add skeleton states:

```tsx
// Already in your components - just make sure they're used
import { Loading, PageLoading } from '@/components/ui/loading';

if (loading) return <PageLoading />;
```

### Lazy Load Heavy Components
If you notice the map is slow:

```tsx
// In discover page
import dynamic from 'next/dynamic';

const USAMap = dynamic(() => import('@/components/coach/discover/USAMap'), {
  loading: () => <div className="h-64 bg-slate-100 animate-pulse rounded-xl" />,
  ssr: false
});
```

---

## 7. PRE-DEMO WARMUP CHECKLIST

5 minutes before presenting:

1. [ ] Run `npm run build && npm run start` (production mode)
2. [ ] Open browser, clear cache
3. [ ] Login to your demo account
4. [ ] Visit each page you'll demo:
   - [ ] Landing page
   - [ ] Dashboard
   - [ ] Discover
   - [ ] Pipeline
   - [ ] Messages
   - [ ] Program
5. [ ] Keep the tab open (don't close it)
6. [ ] Close all other apps/tabs
7. [ ] Test your internet connection

---

## 8. SLOW SPOTS TO AVOID IN DEMO

| Page | Potential Slowness | Workaround |
|------|-------------------|------------|
| Discover | First load with many players | Pre-load before demo |
| Pipeline | Drag-drop with many players | Keep pipeline small for demo |
| Messages | Real-time subscriptions | Pre-open conversations |
| Compare | Adding 4 players | Add players before demo |

---

## 9. IF SOMETHING IS SLOW DURING DEMO

### Graceful Recovery Lines:
- "Let me refresh that..." (Cmd+R)
- "The database is syncing..." (wait 2 seconds)
- "Let me show you [other feature] while this loads..."

### Quick Fixes:
- Hard refresh: Cmd+Shift+R
- If stuck: Close tab, reopen, login again

---

## 10. MONITOR PERFORMANCE (Optional)

Open Chrome DevTools → Performance tab → Record while navigating.

Look for:
- Long tasks (red bars)
- Layout shifts
- Slow network requests

---

## BOTTOM LINE

**The #1 thing:** Run `npm run build && npm run start` instead of `npm run dev`.

This alone will make your app 5-10x faster.

Good luck! 🚀

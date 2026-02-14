# Admin Dashboard Upgrade Plan

## Overview
Transform the admin dashboard from a data-dump into a true **Command Center** with glassmorphism UI, real-time updates, proper error tracking, and owner-focused metrics.

## Current State Issues
1. **UI**: Too white, poor contrast, small sparklines, disorganized
2. **Data**: 6 tabs with scattered, non-actionable stats
3. **No real-time**: 60-second polling only
4. **No click-through**: Can't drill down into issues
5. **Basic logging**: No dedicated error tracking tables
6. **Style mismatch**: Doesn't match CRM glassmorphism style

## Target State
- **Glassmorphism UI** matching CRM (warm colors, orbs, blur effects)
- **Sidebar navigation** with 4 streamlined tabs
- **Live updates** via Supabase Realtime subscriptions
- **Click-through modals** for every card/metric
- **Proper error tracking** with `admin_events` table
- **Owner-focused metrics**: Revenue signals, engagement, health scores

---

## Phase 1: Database & Backend Infrastructure

### New Tables

```sql
-- Admin events table for real-time event streaming
CREATE TABLE admin_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'error', 'signup', 'round_submitted', 'ai_generation', 'login', 'feature_use'
  severity TEXT DEFAULT 'info', -- 'info', 'warning', 'error', 'critical'
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  url TEXT,
  stack_trace TEXT,
  browser_info JSONB,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX idx_admin_events_type ON admin_events(event_type);
CREATE INDEX idx_admin_events_severity ON admin_events(severity);
CREATE INDEX idx_admin_events_created ON admin_events(created_at DESC);
CREATE INDEX idx_admin_events_user ON admin_events(user_id);
CREATE INDEX idx_admin_events_unresolved ON admin_events(resolved, severity) WHERE NOT resolved;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE admin_events;

-- RLS (admin only)
ALTER TABLE admin_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read admin_events" ON admin_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM golf_users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Service role can insert admin_events" ON admin_events FOR INSERT TO service_role
  WITH CHECK (true);
```

### Error Logging Middleware (`/lib/admin-logger.ts`)
- Capture client-side errors with stack traces
- Capture server action errors
- Capture API route errors
- Include user context, URL, browser info
- Real-time insert to admin_events

### API Performance Tracking
- Wrap server actions to log timing
- Track slow queries (>500ms)
- Track error rates by endpoint

---

## Phase 2: UI Architecture Redesign

### New Tab Structure (4 tabs instead of 6)

1. **Command Center** - The one-screen summary
   - Health score ring (large, prominent)
   - Active users (live count)
   - Today's activity stream
   - Alerts/issues requiring attention
   - Quick metrics row (users, rounds, AI, errors)

2. **Users & Teams** - All user/team data
   - User directory with search/filter
   - Team roster cards
   - Onboarding funnels
   - Coach/player breakdowns

3. **Health & Errors** - System health
   - Real-time error feed (with resolve actions)
   - Infrastructure metrics
   - API performance
   - Database health
   - CoachHelm AI health

4. **Analytics** - Growth & engagement
   - Daily/weekly charts
   - Cohort retention
   - Feature adoption
   - Engagement metrics

### Sidebar Design (matches CRM)
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─────────┐                                                 │
│ │  Logo   │  Command Center           [Live] 🟢 [Refresh] │
│ └─────────┘                                                 │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────────────────────────────┐│
│ │ 🎯 Command    │ │                                       ││
│ │ 👥 Users      │ │     Main Content Area                 ││
│ │ 🏥 Health     │ │                                       ││
│ │ 📈 Analytics  │ │                                       ││
│ │               │ │                                       ││
│ │ ─────────────│ │                                       ││
│ │ Quick Stats  │ │                                       ││
│ │ • 24 users   │ │                                       ││
│ │ • 3 active   │ │                                       ││
│ │ • 0 errors   │ │                                       ││
│ └───────────────┘ └───────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Glassmorphism Styling
- Background: `bg-[#FFFEFA]` (warm off-white)
- Cards: `bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass`
- Animated orbs (emerald/warm gradient blurs)
- Warm color palette (emerald accents, warm grays)

---

## Phase 3: Component Redesign

### StatCard V2
- Larger size (more padding)
- Bigger sparklines (120x40 instead of 64x20)
- Interactive tooltips on hover
- Click opens detail modal
- Animated number counting

### DetailModal Pattern
- Full-screen slide-over
- Time range selector (24h, 7d, 30d, custom)
- Detailed charts with zoom
- Data table with export
- Related items

### Chart Improvements
- Use Recharts properly with tooltips
- Larger default sizes
- Proper axis labels
- Hover states with values
- Time-series consistency

### Real-time Indicators
- Pulsing green dot for live data
- "X active now" with live count
- Toast notifications for critical events
- Sound option for alerts

---

## Phase 4: Real-time Implementation

### Supabase Subscriptions
```typescript
// Subscribe to admin_events for live alerts
const subscription = supabase
  .channel('admin-events')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'admin_events' },
    (payload) => handleNewEvent(payload.new)
  )
  .subscribe();

// Subscribe to user presence
const presenceChannel = supabase.channel('admin-presence');
```

### Live Features
- Error count badge updates instantly
- New user signups appear in activity feed
- Active user count updates in real-time
- Critical errors trigger toast + optional sound

---

## Agent Assignments

### Agent 1: Database & Backend (Priority: HIGH)
**Files to create/modify:**
- `supabase/migrations/20260214220000_create_admin_events.sql`
- `src/lib/admin-logger.ts`
- `src/lib/admin-logger-client.ts`
- Modify `src/app/golf/actions/admin-data.ts` (add event queries)
- Add error boundary logging

### Agent 2: Main Page Redesign (Priority: HIGH)
**Files to create/modify:**
- `src/app/golf/admin/page.tsx` (complete overhaul)
- Sidebar navigation component
- Tab structure simplification (6 → 4)
- Glassmorphism styling throughout

### Agent 3: Component Overhaul (Priority: MEDIUM)
**Files to create/modify:**
- `src/app/golf/admin/components/StatCardV2.tsx` (new)
- `src/app/golf/admin/components/DetailModal.tsx` (new)
- `src/app/golf/admin/components/LiveActivityFeed.tsx` (new)
- `src/app/golf/admin/components/HealthRing.tsx` (new)
- Update existing cards with click-through

### Agent 4: Real-time & Polish (Priority: MEDIUM)
**Files to create/modify:**
- `src/hooks/useAdminRealtime.ts`
- `src/hooks/useAdminPresence.ts`
- Toast notification system for alerts
- Final polish and testing

---

## Success Criteria
1. ✅ Glassmorphism UI matching CRM
2. ✅ 4 focused tabs with sidebar navigation
3. ✅ Real-time updates (no polling)
4. ✅ Click-through detail modals
5. ✅ Proper error tracking with admin_events
6. ✅ Owner-focused metrics (actionable)
7. ✅ Larger, readable charts
8. ✅ Live user presence
9. ✅ Mobile responsive

---

## Reference Files
- CRM Page: `src/app/golf/admin/crm/page.tsx`
- Current Admin: `src/app/golf/admin/page.tsx`
- Admin Data: `src/app/golf/actions/admin-data.ts`
- Existing Components: `src/app/golf/admin/components/`

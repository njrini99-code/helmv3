# TODO.md - Helm Sports Labs Task Queue

> **Cursor reads this file automatically. Just say "continue" or "next task" to proceed.**

---

## 🔴 CURRENT TASK

**Sprint 1.1: Discover Players Page**
- Guide: `/docs/PHASE_1_COLLEGE_COACH.md` → Section: Discover Players
- Status: IN PROGRESS

---

## 📋 MVP SPRINT QUEUE

Complete these in order. Check off as you finish.

### Sprint 1: College Coach Recruiting (12-15 hours)

- [ ] **1.1 Discover Players Page** (4 hours)
  - Create `/app/(dashboard)/coach/college/discover/page.tsx`
  - Server component that fetches players with `recruiting_activated = true`
  - Filter bar: position, grad year, state, search
  - Grid of PlayerCard components (use `/components/shared/PlayerCard.tsx`)
  - Pagination (24 per page)
  - Click card → open detail modal
  - "Add to Watchlist" button in modal
  - Guide: `PHASE_1_COLLEGE_COACH.md`

- [ ] **1.2 Watchlist Page** (3 hours)
  - Create `/app/(dashboard)/coach/college/watchlist/page.tsx`
  - Fetch from `recruit_watchlist` table
  - Table with columns: Player, Position, Class, State, Status, Priority, Added, Actions
  - Status dropdown (Watching, Contacted, Interested, Offer Extended, Committed)
  - Priority toggle (star icon)
  - Filter tabs by status
  - Quick actions: View Profile, Remove, Add Notes
  - Server action: `updateWatchlistStatus()`
  - Guide: `PHASE_1_COLLEGE_COACH.md`

- [ ] **1.3 Pipeline Kanban** (5 hours)
  - Create `/app/(dashboard)/coach/college/pipeline/page.tsx`
  - 5 columns: Prospects, Contacted, Campus Visit, Offer Out, Committed
  - Cards show player name, position, school, photo
  - Drag-drop with `@hello-pangea/dnd`
  - On drop → update status in database
  - Click card → open player modal
  - Server action: `updatePipelineStage()`
  - Guide: `PHASE_1_COLLEGE_COACH.md`

### Sprint 2: Messaging (3 hours)

- [ ] **2.1 Send Message Functionality** (3 hours)
  - Complete `/app/actions/messages.ts`
  - `sendMessage(conversationId, content)` action
  - `createConversation(participantIds)` action
  - Update MessageView component to use real send
  - Add "Message" button to player profile modal
  - Create conversation if doesn't exist
  - Guide: `SHARED_SYSTEMS.md`

### Sprint 3: Player Recruiting (4 hours)

- [ ] **3.1 Analytics Dashboard** (2 hours)
  - Update `/app/(dashboard)/player/analytics/page.tsx`
  - Fetch real data from `player_engagement_events`
  - Stats cards: Profile Views, Watchlist Adds, Video Views (last 30 days)
  - Chart: Views over time (use recharts)
  - List: Top schools viewing your profile
  - Handle empty state gracefully
  - Guide: `PHASE_4_PLAYER_RECRUITING.md`

- [ ] **3.2 Journey Timeline** (2 hours)
  - Update `/app/(dashboard)/player/journey/page.tsx`
  - Fetch real data from `recruiting_interests`
  - 8-stage timeline visualization
  - School cards with status dropdown
  - Interest level indicator
  - Notes field per school
  - "Add School" button
  - Guide: `PHASE_4_PLAYER_RECRUITING.md`

### Sprint 4: Polish & Connect (2 hours)

- [ ] **4.1 Navigation Audit** (1 hour)
  - Click every sidebar link - verify no 404s
  - Click every dashboard CTA - verify destinations exist
  - Check all "View All" links
  - Fix empty state CTAs
  - Verify back buttons work

- [ ] **4.2 Engagement Tracking** (1 hour)
  - Create `/lib/utils/engagement.ts`
  - `logEngagement(type, playerId, coachId)` function
  - Track: profile_view, video_view, watchlist_add, message_sent
  - Add tracking calls throughout app
  - Guide: `SHARED_SYSTEMS.md`

---

## 📦 POST-MVP QUEUE

Complete after MVP is working.

### Profile Features

- [ ] Player privacy settings page
- [ ] Program profile editor (staff, facilities)
- [ ] Public player profile page
- [ ] Public program profile page
- [ ] Dream schools feature
- [ ] Green recruiting indicator throughout app

### Subscriptions

- [ ] Subscription plans table
- [ ] Stripe checkout integration
- [ ] Webhook handler
- [ ] Feature gate component
- [ ] Upgrade prompts

### JUCO Coach

- [ ] Mode toggle (recruiting/team)
- [ ] Academics tracking
- [ ] Transfer portal features

### Showcase Coach

- [ ] Multi-team management
- [ ] Team switcher
- [ ] Org-level dashboard
- [ ] Event management

### Polish

- [ ] Loading skeletons everywhere
- [ ] Error boundaries
- [ ] Mobile responsive audit
- [ ] Empty states with helpful CTAs
- [ ] Toast notifications

---

## ✅ COMPLETED

Move tasks here when done:

- [x] Foundation: Auth system
- [x] Foundation: Onboarding flows
- [x] Foundation: Dashboard layouts
- [x] HS Coach: Roster management
- [x] HS Coach: Video library
- [x] HS Coach: Dev plans
- [x] Player: Profile editor
- [x] Player: Video upload

---

## 📝 NOTES

**Last Updated:** [DATE]

**Blockers:** None currently

**Next Audit:** After Sprint 1 completion

---

## 🔧 HOW TO USE

**In Cursor, just say:**

- `"continue"` → Works on next unchecked task
- `"next task"` → Same as continue
- `"audit"` → Runs full codebase audit
- `"status"` → Shows current progress
- `"skip to [task name]"` → Jumps to specific task

**After each task:**
1. Cursor marks it `[x]` done
2. Moves to next `[ ]` task
3. Reads the relevant guide
4. Implements the feature

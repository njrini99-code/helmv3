# MVP_SPRINT_PLAN.md

## Sprint Plan: 41% → 75% MVP (Core Recruiting Loop)

Based on audit findings. Goal: Enable complete recruiting demo flow.

---

## Current State Summary

| Category | Status | Notes |
|----------|--------|-------|
| Foundation | ✅ 100% | Auth, DB, layouts, types |
| HS Coach | ✅ 86% | Production-ready |
| Player Core | 🟡 50% | Profile/videos work, recruiting incomplete |
| College Coach | 🔴 ~20% | Critical gap - needs recruiting features |
| Messaging | 🔴 Partial | UI exists, send missing |
| JUCO/Showcase | 🔴 0% | Defer to post-MVP |
| Subscriptions | 🔴 0% | Defer to post-MVP |

---

## MVP Demo Flow (What We're Building)

```
1. College Coach logs in → Dashboard
2. Goes to Discover → Searches players by position/grad year/state
3. Clicks player → Views profile modal with videos
4. Adds to Watchlist → Player appears in watchlist
5. Updates status → Moves through pipeline stages
6. Sends message → Player receives notification

Meanwhile:
7. Player logs in → Sees coach viewed profile (analytics)
8. Player activates recruiting → Appears in Discover
9. Player tracks schools in Journey → Updates status
```

---

## SPRINT 1: College Coach Recruiting (12-15 hours)

### Task 1.1: Discover Players Page (4 hours)

**File:** `app/(dashboard)/coach/college/discover/page.tsx`

```
Create the discover page with:
- Server component that fetches players where recruiting_activated = true
- Filter bar: position, grad year, state, search
- Grid of PlayerCards (6 per row on desktop, 2 on mobile)
- Pagination (24 per page)
- Click card → opens player detail modal

Query:
SELECT * FROM players 
WHERE recruiting_activated = true
AND (position filter)
AND (grad_year filter)
AND (state filter)
ORDER BY updated_at DESC
LIMIT 24 OFFSET ?
```

**Components needed:**
- `components/coach/discover/PlayerGrid.tsx`
- `components/coach/discover/FilterBar.tsx`
- `components/coach/discover/PlayerCard.tsx`
- `components/coach/discover/PlayerDetailModal.tsx`

**Cursor Prompt:**
```
Create the College Coach Discover Players page at app/(dashboard)/coach/college/discover/page.tsx

Requirements:
1. Server component that fetches players with recruiting_activated = true
2. URL-based filters for: position, gradYear, state, search query
3. Grid layout: 6 columns on lg, 3 on md, 2 on sm
4. PlayerCard shows: avatar, name, position, grad year, city/state, primary video thumbnail
5. Clicking card opens a modal with full player details
6. Pagination with 24 players per page
7. "Add to Watchlist" button in modal that calls server action
8. Loading skeleton while fetching
9. Empty state if no players match filters

Use our design system: green-600 primary, rounded-2xl cards, slate text colors.
Reference the existing HS Coach roster page for patterns.
```

---

### Task 1.2: Watchlist Page (3 hours)

**File:** `app/(dashboard)/coach/college/watchlist/page.tsx`

```
Create watchlist management:
- Table view of all players in recruit_watchlist for this coach
- Columns: Player, Position, Grad Year, Status, Priority, Added Date, Actions
- Status dropdown (inline edit): Watching, Contacted, Interested, Offer Extended, Committed
- Priority toggle: Normal / High
- Quick actions: View Profile, Remove, Add Note
- Filter by status
```

**Server Action needed:**
- `app/actions/watchlist.ts` - updateWatchlistStatus, removeFromWatchlist, addNote

**Cursor Prompt:**
```
Create the College Coach Watchlist page at app/(dashboard)/coach/college/watchlist/page.tsx

Requirements:
1. Fetch all recruit_watchlist entries for current coach with player details
2. Table with columns: Player (avatar + name), Position, Grad Year, Status, Priority, Added, Actions
3. Status is an inline dropdown that updates on change (server action)
4. Priority is a star toggle (normal/high)
5. Actions: View (opens modal), Remove (with confirmation), Notes (expandable)
6. Filter tabs at top: All, Watching, Contacted, Offer Extended, Committed
7. Sort by: Recently Added, Name, Grad Year
8. Empty state with CTA to Discover page

Create server actions in app/actions/watchlist.ts:
- updateWatchlistStatus(watchlistId, status)
- updateWatchlistPriority(watchlistId, isHighPriority)
- removeFromWatchlist(watchlistId)
- addWatchlistNote(watchlistId, note)

All actions should revalidatePath and track engagement events.
```

---

### Task 1.3: Pipeline Kanban (5 hours)

**File:** `app/(dashboard)/coach/college/pipeline/page.tsx`

```
Create drag-and-drop pipeline:
- 5 columns: Prospects, Contacted, Campus Visit, Offer Out, Committed
- Cards show player avatar, name, position, grad year
- Drag between columns updates status
- Click card opens detail modal
- Column counts at top
- Filter by grad year
```

**Dependencies:**
- `@hello-pangea/dnd` for drag-drop (or `react-beautiful-dnd`)

**Cursor Prompt:**
```
Create the College Coach Pipeline page at app/(dashboard)/coach/college/pipeline/page.tsx

Requirements:
1. Kanban board with 5 columns mapping to recruit_watchlist.status:
   - Prospects (status: 'watching')
   - Contacted (status: 'contacted')
   - Campus Visit (status: 'visit_scheduled')
   - Offer Out (status: 'offer_extended')
   - Committed (status: 'committed')

2. Use @hello-pangea/dnd for drag-and-drop (install if needed)

3. Each card shows:
   - Player avatar
   - Name
   - Position + Grad Year
   - Days in stage (calculated from status_updated_at)

4. Dragging card to new column:
   - Optimistically updates UI
   - Calls server action to update status
   - Shows toast on success/error

5. Column header shows count
6. Filter dropdown for grad year (2025, 2026, 2027, All)
7. Click card opens player detail modal
8. Empty column shows "Drag players here"

Create the DnD context, columns, and card components.
Make sure to handle the drag end event properly.
```

---

## SPRINT 2: Messaging Complete (3 hours)

### Task 2.1: Send Message Functionality

**File:** `app/actions/messages.ts` (if not exists)

**Cursor Prompt:**
```
Complete the messaging system:

1. Create server action: sendMessage(conversationId, content)
   - Verify user is participant
   - Insert into messages table
   - Update conversation.updated_at
   - Create notifications for other participants
   - Revalidate path

2. Create server action: createConversation(participantUserIds[], title?)
   - Create conversation record
   - Add all participants including creator
   - Return conversation id

3. Update MessageView component to:
   - Call sendMessage on form submit
   - Show optimistic update
   - Handle errors
   - Auto-scroll to new message

4. Add "Message" button to player detail modal that:
   - Creates conversation if none exists
   - Navigates to messages with conversation selected

Test the full flow: Coach views player → clicks Message → sends message → player sees notification
```

---

## SPRINT 3: Player Recruiting Complete (4 hours)

### Task 3.1: Analytics Dashboard with Real Data

**Cursor Prompt:**
```
Complete the Player Analytics page at app/(dashboard)/player/analytics/page.tsx

Requirements:
1. Fetch real data from player_engagement_events for this player
2. Stats cards (last 30 days):
   - Profile Views (count where engagement_type = 'profile_view')
   - Watchlist Adds (count where engagement_type = 'watchlist_add')
   - Video Views (count where engagement_type = 'video_view')
   - Messages Received (count from messages)

3. Views Over Time chart:
   - Group engagement events by day for last 30 days
   - Bar chart using recharts
   - X-axis: dates, Y-axis: view count

4. Top Schools Viewing:
   - Group by coach's school, count views
   - Show top 10 with school logo, name, division, view count
   - Only show identified if player has recruiting_activated

5. Handle empty state: "Activate recruiting to start getting discovered"
```

### Task 3.2: Journey Timeline with Real Data

**Cursor Prompt:**
```
Complete the Player Journey page at app/(dashboard)/player/journey/page.tsx

Requirements:
1. Fetch from recruiting_interests where player_id = current player
2. Show timeline with 8 stages:
   - Interested, Contacted, Questionnaire, Unofficial Visit, Official Visit, Offer, Verbal, Signed

3. Each school card shows:
   - School logo and name
   - Division
   - Current status (dropdown to update)
   - Interest level (Low/Medium/High)
   - Notes (expandable)
   - Date added

4. Group schools by status in collapsible sections
5. "Add School" button that opens school search modal
6. Update status inline with server action
7. Empty state with CTA to Discover Colleges
```

---

## SPRINT 4: Polish & Connect (2 hours)

### Task 4.1: Navigation Connections

**Cursor Prompt:**
```
Audit and fix all navigation connections:

1. College Coach sidebar should link to:
   - /coach/college (dashboard)
   - /coach/college/discover
   - /coach/college/watchlist
   - /coach/college/pipeline
   - /coach/college/compare
   - /coach/college/camps
   - /coach/college/messages
   - /coach/college/calendar
   - /coach/college/program
   - /coach/college/settings

2. Dashboard quick action cards should navigate correctly
3. Empty states should have working CTAs
4. "View Profile" buttons should open modals
5. "Add to Watchlist" should work from all locations
6. Back buttons should go to sensible places

Fix any 404s or broken links.
```

### Task 4.2: Engagement Event Tracking

**Cursor Prompt:**
```
Ensure all coach-player interactions create engagement events:

1. Profile view → log when coach opens player modal
2. Video view → log when coach plays a video
3. Watchlist add → log when added to watchlist
4. Message sent → log when coach messages player
5. Interest shown → log when coach marks high priority

Create a utility function:
logEngagement(playerId, coachId, type, metadata?)

Call it from:
- PlayerDetailModal on open
- Video player on play
- Watchlist add action
- Send message action

This data powers the player's analytics dashboard.
```

---

## Estimated Timeline

| Sprint | Hours | Deliverable |
|--------|-------|-------------|
| Sprint 1 | 12-15h | College Coach can discover, watchlist, pipeline |
| Sprint 2 | 3h | Two-way messaging works |
| Sprint 3 | 4h | Player sees real analytics and journey |
| Sprint 4 | 2h | All buttons work, events tracked |
| **Total** | **21-24h** | **Full recruiting demo loop** |

---

## Post-MVP (Phase 2)

After core loop works:
1. Compare Players feature
2. Camps management
3. JUCO dual-mode
4. Showcase multi-team
5. Subscription/payments
6. Email notifications
7. Real-time updates

---

## Quick Validation Checklist

After each sprint, test:

**Sprint 1 Done?**
- [ ] Can search and filter players
- [ ] Can view player detail with videos
- [ ] Can add player to watchlist
- [ ] Can see watchlist table
- [ ] Can drag players through pipeline

**Sprint 2 Done?**
- [ ] Can send message to player
- [ ] Message appears in conversation
- [ ] Player gets notification

**Sprint 3 Done?**
- [ ] Player sees view counts
- [ ] Player sees which schools viewed
- [ ] Player can track recruiting journey
- [ ] Player can update school status

**Sprint 4 Done?**
- [ ] All sidebar links work
- [ ] All buttons do something
- [ ] No console errors
- [ ] Engagement events logging

---

## Files to Create/Update

```
NEW FILES:
app/(dashboard)/coach/college/discover/page.tsx
app/(dashboard)/coach/college/watchlist/page.tsx
app/(dashboard)/coach/college/pipeline/page.tsx
app/actions/watchlist.ts
app/actions/messages.ts (complete)
components/coach/discover/PlayerGrid.tsx
components/coach/discover/FilterBar.tsx
components/coach/discover/PlayerCard.tsx
components/coach/discover/PlayerDetailModal.tsx
components/coach/watchlist/WatchlistTable.tsx
components/coach/pipeline/PipelineBoard.tsx
components/coach/pipeline/PipelineColumn.tsx
components/coach/pipeline/PipelineCard.tsx

UPDATE FILES:
app/(dashboard)/player/analytics/page.tsx (real data)
app/(dashboard)/player/journey/page.tsx (real data)
components/messages/MessageView.tsx (send functionality)
lib/utils/engagement.ts (tracking helper)
```

---

**Start with Sprint 1, Task 1.1 (Discover Players). That unlocks everything else.**

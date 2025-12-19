# DASHBOARD-BY-DASHBOARD AUDIT
**Helm Sports Labs - Detailed Feature Breakdown**
**Date:** December 17, 2024

---

## 📊 HOW TO READ THIS AUDIT

**Status Indicators:**
- ✅ **COMPLETE** - Fully functional, tested, production-ready
- 🟡 **PARTIAL** - Page exists, but missing key features or using mock data
- ❌ **MISSING** - Doesn't exist, needs to be built from scratch
- 🔄 **IN PROGRESS** - Recently worked on, needs completion

**Priority Levels:**
- 🔴 **CRITICAL** - Blocks core user workflows
- 🟠 **HIGH** - Important for user experience
- 🟡 **MEDIUM** - Nice to have, enhances experience
- 🟢 **LOW** - Polish, future features

---

# COLLEGE COACH DASHBOARDS

## 1. `/dashboard` - Main Dashboard (COLLEGE COACH VIEW)
**Status:** ✅ COMPLETE
**File:** `src/app/(dashboard)/dashboard/page.tsx`

### ✅ What Works:
- Stats cards showing total players in pipeline
- Quick action buttons to key sections
- Activity feed showing recent engagement
- Pipeline overview widget
- Conditional rendering based on coach role

### ❌ What's Missing:
- **Nothing critical** - This dashboard is functional

### 🔧 Potential Improvements:
- Real-time updates for activity feed
- Customizable widget layout
- Quick filters on activity feed

---

## 2. `/dashboard/discover` - Player Discovery
**Status:** 🟡 PARTIAL (Placeholder)
**Priority:** 🔴 CRITICAL
**File:** `src/app/(dashboard)/dashboard/discover/page.tsx`

### ❌ What's Missing (NEEDS TO BE BUILT):

#### A. Player Grid View
**What:** Grid of player cards showing key info at a glance
**Needs:**
```tsx
- Grid layout (3-4 columns on desktop, 1-2 on mobile)
- Player card component showing:
  - Avatar/photo
  - Name, position, grad year
  - Location (city, state)
  - Key metrics (height, weight, GPA)
  - Primary highlight video thumbnail
  - Quick action buttons:
    - View full profile
    - Add to watchlist
    - Send message
```

#### B. Advanced Filter Panel
**What:** Left sidebar or top bar with filters
**Needs:**
```tsx
Filters needed:
- Position (dropdown multi-select)
  - P (Pitcher), C (Catcher), 1B, 2B, 3B, SS, OF, UTIL
- Graduation Year (multi-select)
  - 2024, 2025, 2026, 2027, 2028
- Location
  - State dropdown
  - Distance radius from college (optional)
- Player Type
  - High School, Showcase, JUCO
- Metrics (sliders)
  - GPA (0.0 - 4.0+)
  - Height (5'0" - 7'0")
  - Exit Velocity (60-110 mph)
  - 60-yard time (6.0-8.0s)
- Video availability
  - Has highlight video checkbox
- Recruiting Status
  - Available (not committed)
  - Committed (show where)
```

#### C. Search & Sort
**What:** Search bar and sort dropdown
**Needs:**
```tsx
- Search by name (real-time)
- Sort options:
  - Recently updated (default)
  - Alphabetical (A-Z)
  - Graduation year (newest first)
  - Distance from school
  - GPA (highest first)
  - Last active date
```

#### D. Pagination
**What:** Load 24-48 players per page
**Needs:**
```tsx
- Page controls (Previous / Next)
- Page number display (Page 1 of 12)
- Results count (Showing 1-24 of 287 players)
- "Load More" button option
```

#### E. Quick Actions
**What:** Bulk actions for selected players
**Needs:**
```tsx
- Checkbox on each player card
- "Select All" checkbox
- Bulk actions dropdown:
  - Add selected to watchlist
  - Compare selected (max 4)
  - Export selected to CSV
```

#### F. Player Detail Modal/Page
**What:** Click player card → view full profile
**Current:** Route exists at `/dashboard/players/[id]/profile`
**Status:** 🟡 PARTIAL

**Needs enhancement:**
```tsx
Currently shows: Basic info
Needs to add:
- Full athletic profile
- Video gallery (all videos, not just highlight)
- Complete stats by season
- Timeline of activity/updates
- Engagement history (when you viewed them)
- Notes section (coach's private notes)
- Quick actions:
  - Add to watchlist (with status)
  - Send message
  - Schedule call/visit
  - Download recruiting profile PDF
```

### 📊 Data Source:
```sql
-- Query needed
SELECT * FROM players
WHERE recruiting_activated = true
AND (committed_to_org_id IS NULL OR show_committed = true)
ORDER BY updated_at DESC;
```

### 🎨 UI Reference:
**Inspiration:** LinkedIn job search, Zillow property grid, Airbnb listings
**Design:** Grid of clean cards, filters on left, map view toggle option

---

## 3. `/dashboard/watchlist` - Recruiting Watchlist
**Status:** ❌ MISSING
**Priority:** 🔴 CRITICAL
**Needs:** Full page build

### ❌ What Needs to Be Built:

#### A. Watchlist Table
**What:** Table showing all players you're tracking
**Needs:**
```tsx
Table columns:
1. Player Name (with avatar) - sortable
2. Position - filterable
3. Grad Year - sortable, filterable
4. Location (City, State) - filterable
5. Status - dropdown, filterable
   - Options: Watchlist, High Priority, Top Prospect, Offer Extended, Committed
6. Last Contact - sortable (date)
7. Next Action - text field
8. Notes - expandable row or modal
9. Actions - dropdown
   - View profile
   - Change status
   - Send message
   - Remove from watchlist
   - Move to pipeline
```

#### B. Status Management
**What:** Drag-drop or dropdown to change player status
**Needs:**
```tsx
Status workflow:
Watchlist → High Priority → Top Prospect → Offer Extended → Committed

Visual indicators:
- Color-coded badges
- Progress bar showing pipeline stage
- Days in current status
```

#### C. Filters & Search
**What:** Filter bar above table
**Needs:**
```tsx
- Search by name
- Filter by status
- Filter by position
- Filter by grad year
- Filter by last contact date range
- Filter by "needs action" (empty next action)
```

#### D. Quick Add from Discover
**What:** Button in discover page adds to watchlist
**Needs:**
```tsx
- "Add to Watchlist" button on player cards
- Quick add (defaults to "Watchlist" status)
- Modal option to add with status + notes
```

#### E. Notes System
**What:** Private notes per player
**Needs:**
```tsx
- Rich text editor
- Timestamp on notes
- Note history (show all notes)
- Tags/keywords for notes
- Search within notes
```

#### F. Bulk Actions
**What:** Select multiple players, perform action
**Needs:**
```tsx
- Select checkboxes
- Bulk actions:
  - Change status
  - Send bulk message
  - Export to CSV
  - Remove from watchlist
  - Add to comparison
```

### 📊 Data Source:
```sql
-- Table: recruit_watchlist (already exists in schema)
SELECT rw.*, p.*
FROM recruit_watchlist rw
JOIN players p ON p.id = rw.player_id
WHERE rw.coach_id = $current_coach_id
ORDER BY rw.updated_at DESC;
```

### 🎨 UI Reference:
**Inspiration:** Trello table view, Notion database, Airtable
**Design:** Clean table with inline editing, expandable rows for details

---

## 4. `/dashboard/pipeline` - Recruiting Pipeline
**Status:** 🟡 PARTIAL (Visual only)
**Priority:** 🔴 CRITICAL
**File:** `src/app/(dashboard)/dashboard/pipeline/page.tsx`

### ✅ What Works:
- Visual kanban board structure exists
- Column headers showing stages
- Basic card layout

### ❌ What's Missing (NEEDS TO BE BUILT):

#### A. Drag-and-Drop Functionality
**What:** Drag player cards between pipeline stages
**Needs:**
```tsx
Library to install: @dnd-kit/core or react-beautiful-dnd

Stages (columns):
1. Initial Contact
2. Interested
3. Active Recruitment
4. Top Prospect
5. Offer Extended
6. Committed

Drag behavior:
- Grab player card from any column
- Drag to different column
- Visual feedback (card follows cursor)
- Drop zone highlighting
- Database update on drop
- Optimistic UI (updates immediately)
```

#### B. Player Cards in Pipeline
**What:** Cards showing player summary
**Needs:**
```tsx
Card content:
- Avatar
- Name
- Position, Grad Year
- Location
- Status badge
- Last contact date
- Quick actions menu:
  - View profile
  - Send message
  - Add note
  - Remove from pipeline
```

#### C. Stage Statistics
**What:** Count of players in each stage
**Needs:**
```tsx
Column headers show:
- Stage name
- Player count (badge)
- Total players value (if applicable)

Example: "Top Prospect (8)" or "Committed (3)"
```

#### D. Filters
**What:** Filter pipeline by criteria
**Needs:**
```tsx
Filter options:
- Position
- Grad year
- Date added to pipeline
- Show/hide committed players
```

#### E. Alternative: Diamond View
**What:** Baseball diamond visualization (optional upgrade)
**Needs:**
```tsx
Instead of kanban:
- Baseball diamond with 4 bases + home plate
- Players positioned on bases by stage
- Click base to see players
- Drag around diamond

Stages:
- Home: Initial Contact
- 1st Base: Interested
- 2nd Base: Active Recruitment
- 3rd Base: Top Prospect
- Home Plate: Committed
```

### 📊 Data Source:
```sql
-- Uses recruit_watchlist table with status field
SELECT * FROM recruit_watchlist
WHERE coach_id = $current_coach_id
AND status IN ('initial_contact', 'interested', 'active', 'top_prospect', 'offer', 'committed')
ORDER BY updated_at DESC;
```

### 🎨 UI Reference:
**Inspiration:** Trello, Jira board view, HubSpot deals pipeline
**Design:** Clean kanban with smooth drag animations

---

## 5. `/dashboard/compare` - Player Comparison
**Status:** ❌ MISSING
**Priority:** 🟠 HIGH
**Needs:** Full page build

### ❌ What Needs to Be Built:

#### A. Player Selection
**What:** Choose 2-4 players to compare
**Needs:**
```tsx
Entry points:
1. From discover page: "Compare Selected" button (after selecting players)
2. From watchlist: "Add to Comparison" action
3. From pipeline: "Compare" menu option

Selection UI:
- URL params: /dashboard/compare?players=id1,id2,id3,id4
- Max 4 players
- Remove player button
- Add more players (search modal)
```

#### B. Side-by-Side Comparison
**What:** Table comparing player attributes
**Needs:**
```tsx
Comparison sections:

1. Basic Info
   - Name, Position, Grad Year
   - Location
   - Height, Weight
   - Bats/Throws

2. Academic
   - GPA
   - SAT/ACT scores
   - Class rank

3. Athletic Metrics
   - Exit velocity
   - 60-yard time
   - Pitch velocity (if P)
   - Pop time (if C)

4. Statistics (by season)
   - Batting avg
   - Home runs
   - RBIs
   - ERA (if P)
   - Strikeouts

5. Video Highlights
   - Primary highlight video for each
   - Video thumbnails

6. Recruiting Status
   - Current status in your pipeline
   - Commitment status
   - Other schools interested (if visible)

Visual indicators:
- Highlight highest/best values in green
- Show differences clearly
- Use icons for quick scanning
```

#### C. Radar Chart Overlay
**What:** Visual comparison of key metrics
**Needs:**
```tsx
Library: recharts (already in project)

Chart axes (5-6 metrics):
- Speed (60-yard)
- Power (exit velo)
- Academics (GPA)
- Experience (varsity years)
- Pitch Velocity (if applicable)

Features:
- Each player gets different color line
- Hover to see exact values
- Toggle metrics on/off
```

#### D. Notes Per Player
**What:** Add comparison notes
**Needs:**
```tsx
- Text field under each player column
- Save notes to comparison (optional)
- Private to coach
```

#### E. Export/Save
**What:** Save or export comparison
**Needs:**
```tsx
Actions:
- Save comparison (store to database)
- Export to PDF
- Print comparison
- Share link (internal only)
```

### 📊 Data Source:
```sql
-- Get multiple players
SELECT p.*, ps.*, pm.*
FROM players p
LEFT JOIN player_stats ps ON ps.player_id = p.id
LEFT JOIN player_metrics pm ON pm.player_id = p.id
WHERE p.id IN ($player_ids)
ORDER BY FIELD(p.id, $player_ids);
```

### 🎨 UI Reference:
**Inspiration:** College comparison sites, car comparison tools, product comparison tables
**Design:** Clean table with alternating row colors, sticky headers

---

## 6. `/dashboard/camps` - Camps Management
**Status:** ❌ MISSING
**Priority:** 🟡 MEDIUM
**Needs:** Full feature build

### ❌ What Needs to Be Built:

#### A. Camps List View
**What:** View all camps you're hosting
**Needs:**
```tsx
List/Grid showing:
- Camp name
- Date(s)
- Location
- Total capacity
- Registered count
- Status (Upcoming, Completed, Cancelled)
- Actions:
  - Edit camp
  - View registrations
  - Cancel camp
  - Duplicate camp
```

#### B. Create Camp Form
**What:** Modal or page to create camp
**Needs:**
```tsx
Form fields:
- Camp name
- Description (rich text)
- Camp type (Showcase, Skills Camp, Position-Specific, Team Camp)
- Date range (start/end dates and times)
- Location (address, field name)
- Capacity (max attendees)
- Cost (per player)
- Age/grade eligibility
- Registration deadline
- Additional info (what to bring, schedule, etc.)
- Public/Private toggle
```

#### C. Camp Registrations
**What:** View who signed up
**Needs:**
```tsx
Registrations table:
- Player name
- Position
- Grad year
- Contact info
- Registration date
- Payment status (if applicable)
- Checked-in status (day of)
- Actions:
  - View player profile
  - Contact player
  - Cancel registration
  - Check-in player
```

#### D. Public Camp Page
**What:** Public-facing camp detail page
**Needs:**
```tsx
Route: /camps/[id] or /program/[orgId]/camps/[id]

Shows:
- Camp details
- Date, time, location
- Cost and capacity
- Registration button (if spots available)
- Camp schedule/agenda
- Coach/staff leading camp
- Photos from past camps
```

#### E. Registration Flow (Player Side)
**What:** Players can browse and register
**Needs:**
```tsx
Player sees:
- Browse available camps (/dashboard/camps for players)
- Filter by location, date, type
- Register for camp
- Payment (if required)
- Confirmation email
```

### 📊 Data Source:
```sql
-- Tables: camps, camp_registrations (already exist)
SELECT c.*, COUNT(cr.id) as registration_count
FROM camps c
LEFT JOIN camp_registrations cr ON cr.camp_id = c.id
WHERE c.organization_id = $org_id
GROUP BY c.id
ORDER BY c.start_date DESC;
```

### 🎨 UI Reference:
**Inspiration:** Eventbrite, Meetup, summer camp registration sites
**Design:** Card-based camp listings, clean registration forms

---

## 7. `/dashboard/messages` - Messaging Center
**Status:** 🟡 PARTIAL (Structure exists)
**Priority:** 🔴 CRITICAL
**File:** `src/app/(dashboard)/dashboard/messages/page.tsx`

### ✅ What Works:
- Conversation list structure exists
- Message thread view at `/dashboard/messages/[id]`
- UI layout is good

### ❌ What's Missing (NEEDS TO BE BUILT):

#### A. Send Message Functionality
**What:** Compose and send messages
**Needs:**
```tsx
Compose UI:
- Text input (textarea with auto-resize)
- Send button
- Attachment button (optional)
- Emoji picker (optional)

Database action:
- Insert into messages table
- Update conversation updated_at
- Create notification for recipient
- Optimistic UI update
```

#### B. Start New Conversation
**What:** Message a player you haven't talked to
**Needs:**
```tsx
"New Message" button opens modal:
- Search for recipient (players)
- Message subject/topic
- Initial message text
- Send button

Creates:
- New conversation record
- First message
- Conversation participants records
```

#### C. Real-Time Updates
**What:** See new messages without refresh
**Needs:**
```tsx
Supabase Realtime subscription:
- Subscribe to messages table
- Filter by conversation_id
- Listen for INSERT events
- Update UI when new message arrives
- Show "typing..." indicator (advanced)
- Desktop notification (optional)
```

#### D. Message Status
**What:** Read/unread tracking
**Needs:**
```tsx
Features:
- Mark message as read when viewed
- Show unread count badge
- Bold unread conversations
- "Mark all as read" button
```

#### E. Search Messages
**What:** Search conversation history
**Needs:**
```tsx
Search bar:
- Search by sender name
- Search message content
- Filter by date range
- Jump to message in thread
```

#### F. Archive/Delete
**What:** Manage old conversations
**Needs:**
```tsx
Actions per conversation:
- Archive conversation (hide from main list)
- Delete conversation
- Pin conversation to top
- Mute notifications
```

### 📊 Data Source:
```sql
-- Tables: conversations, messages, conversation_participants

-- Get conversations for current user
SELECT c.*,
       m.content as last_message,
       m.created_at as last_message_at,
       COUNT(CASE WHEN m.is_read = false AND m.sender_id != $user_id THEN 1 END) as unread_count
FROM conversations c
JOIN conversation_participants cp ON cp.conversation_id = c.id
LEFT JOIN messages m ON m.conversation_id = c.id
WHERE cp.user_id = $user_id
GROUP BY c.id
ORDER BY m.created_at DESC;
```

### 🎨 UI Reference:
**Inspiration:** Gmail, Slack, LinkedIn messages
**Design:** Two-column layout (list + thread), clean message bubbles

---

## 8. `/dashboard/calendar` - Calendar & Events
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE
**File:** `src/app/(dashboard)/dashboard/calendar/page.tsx`

### ✅ What Works:
- Full CRUD for events
- Month navigation
- Event types with color coding
- EventModal for create/edit
- CalendarView component for month grid

### 🔧 Potential Improvements (Low Priority):
- Week view option
- Day view option
- Recurring events
- Event reminders/notifications
- iCal export
- Google Calendar sync

---

## 9. `/dashboard/program` - Program Profile Editor
**Status:** ❌ MISSING
**Priority:** 🟡 MEDIUM
**Needs:** Full page build

### ❌ What Needs to Be Built:

#### A. Program Information Form
**What:** Edit college/organization details
**Needs:**
```tsx
Form sections:

1. Basic Info
   - Program name
   - Division (D1, D2, D3, NAIA, JUCO)
   - Conference
   - Location (city, state, zip)
   - Website URL
   - Phone, Email

2. Branding
   - Logo upload (square, at least 500x500)
   - Banner image upload (wide, for profile header)
   - Primary color (color picker)
   - Secondary color

3. About
   - Program description (rich text)
   - Mission statement
   - Program philosophy
   - Achievements/history
   - Notable alumni

4. Social Media
   - Twitter handle
   - Instagram handle
   - Facebook page URL
   - YouTube channel URL

5. Recruiting Criteria
   - What we look for in recruits
   - Academic requirements (min GPA)
   - Athletic standards
   - Program values
```

#### B. Coaching Staff Management
**What:** Add/edit coaching staff
**Needs:**
```tsx
Staff table:
- Name
- Title/Role (Head Coach, Assistant, Pitching Coach, etc.)
- Bio (rich text)
- Headshot photo
- Email, Phone
- Display order (for sorting)
- Show on public profile toggle

Actions:
- Add staff member
- Edit staff member
- Remove staff member
- Reorder staff (drag-drop)
```

#### C. Facilities Showcase
**What:** Add facilities and photos
**Needs:**
```tsx
Facilities manager:
- Add facility:
  - Name (Stadium, Batting Cages, Weight Room, etc.)
  - Type (field, training facility, etc.)
  - Description
  - Capacity
  - Photo gallery (multiple photos)
  - Display order
- Edit facility
- Delete facility
```

#### D. Public Profile Preview
**What:** See what recruits see
**Needs:**
```tsx
Preview button that opens:
- /program/[org_id] in new tab
- Shows exactly what's public
- Link to share with recruits
```

#### E. Privacy Settings
**What:** Control what's public
**Needs:**
```tsx
Toggles for:
- Show program description
- Show coaching staff
- Show staff bios
- Show staff photos
- Show facilities
- Show commitments (current recruits)
- Show contact info
- Show social media links
```

### 📊 Data Source:
```sql
-- Tables: organizations, organization_settings, organization_staff, organization_facilities

SELECT * FROM organizations
WHERE id = $org_id;
```

### 🎨 UI Reference:
**Inspiration:** LinkedIn company pages, college athletics sites, About pages
**Design:** Tabbed interface or single-page form with sections

---

## 10. `/dashboard/settings` - Coach Settings
**Status:** 🟡 PARTIAL (Placeholder)
**Priority:** 🟡 MEDIUM
**File:** `src/app/(dashboard)/dashboard/settings/page.tsx`

### ✅ What Works:
- Page exists
- Basic navigation structure

### ❌ What's Missing (NEEDS TO BE BUILT):

#### Settings Sections Needed:

**A. Account Settings**
```tsx
- Name
- Email (verify before change)
- Phone
- Password change
- Profile photo
- Two-factor authentication (future)
```

**B. Notification Preferences**
```tsx
Toggles for:
- Email notifications
  - New messages
  - New registrations (camps)
  - Player updates
  - Watchlist changes
- Push notifications (if enabled)
- Notification frequency (real-time, daily digest, weekly)
```

**C. Recruiting Preferences**
```tsx
- Default pipeline stages
- Auto-responses to player messages
- Calendar availability
- Recruiting radius (distance willing to recruit)
```

**D. Team Settings** (if HS/JUCO)
```tsx
- Team name
- Season dates
- Join link settings
- Default practice schedule
```

**E. Subscription/Billing** (future)
```tsx
- Current plan
- Payment method
- Billing history
- Upgrade/downgrade
```

---

# HIGH SCHOOL COACH DASHBOARDS

## 11. `/dashboard/team` - HS Coach Team Dashboard
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE
**File:** `src/app/(dashboard)/dashboard/team/page.tsx`

### ✅ What Works:
- Team stats overview
- Recent roster additions
- Upcoming events
- Quick action buttons
- Parallel queries for performance

### 🔧 Potential Improvements:
- Win/loss record tracker
- Season stats aggregation
- Team photo gallery

---

## 12. `/dashboard/roster` - Roster Management
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE
**File:** `src/app/(dashboard)/dashboard/roster/page.tsx`

### ✅ What Works:
- Player roster table
- Add/remove players
- Generate invite links
- Player detail view

### 🔧 Potential Improvements:
- Bulk import players (CSV)
- Print roster
- Export to PDF
- Depth chart visualization

---

## 13. `/dashboard/videos` - Video Library
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE
**File:** `src/app/(dashboard)/dashboard/videos/page.tsx`

### ✅ What Works:
- Upload videos
- Organize by player
- Set primary video
- Video thumbnails

### ❌ What's Missing (Lower Priority):

**Video Clipping Tool** (Future enhancement)
```tsx
Route: /dashboard/videos/[id]/clip

Features needed:
- Video player with timeline
- Set start time (scrubber)
- Set end time (scrubber)
- Preview clip
- Save clip (creates new video record with parent_video_id)
- Tag clip (at-bat, pitch, fielding, etc.)
```

---

## 14. `/dashboard/dev-plans` - Development Plans
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE
**File:** `src/app/(dashboard)/dashboard/dev-plans/page.tsx`

### ✅ What Works:
- View dev plans
- Create plans
- Assign to players
- Track progress

### 🔧 Potential Improvements:
- Drill library (pre-made drills)
- Video attachments to drills
- Progress photos
- Parent notifications

---

## 15. `/dashboard/college-interest` - College Interest Tracking
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE
**File:** `src/app/(dashboard)/dashboard/college-interest/page.tsx`

### ✅ What Works:
- View which players getting attention
- See engagement from college coaches
- Anonymous vs identified interest
- Stats dashboard

### 🔧 Potential Improvements:
- Export interest report
- Email digest to parents
- Trend analysis over time

---

# PLAYER DASHBOARDS

## 16. `/dashboard` - Player Main Dashboard
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE
**File:** `src/app/(dashboard)/dashboard/page.tsx`

### ✅ What Works:
- Profile completion widget
- Team information
- Quick stats
- Recruiting status

---

## 17. `/dashboard/profile` - Profile Editor
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE
**File:** `src/app/(dashboard)/dashboard/profile/page.tsx`

### ✅ What Works:
- 5-tab profile editor
- Personal info tab
- Athletic info (baseball-specific)
- Academic info
- Videos tab
- Social links tab
- Auto-save functionality

### ✅ Recently Added:
- Privacy settings page (`/dashboard/settings/privacy`)
- Dream schools manager (integrated into profile)

---

## 18. `/dashboard/videos` - Player Video Management
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE

### ✅ What Works:
- Upload videos
- Add from URL
- Set primary highlight
- Delete videos

---

## 19. `/dashboard/team` - Player Team Hub
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE

### ✅ What Works:
- View team information
- Team schedule
- Dev plan assigned to you
- Team messages

---

## 20. `/dashboard/activate` - Recruiting Activation
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE

### ✅ What Works:
- 3-step activation flow
- Terms and conditions
- Activate button
- Redirects to recruiting features

---

## 21. `/dashboard/colleges` - College Discovery (PLAYER)
**Status:** 🟡 PARTIAL (Placeholder)
**Priority:** 🔴 CRITICAL
**File:** `src/app/(dashboard)/dashboard/colleges/page.tsx`

### ❌ What Needs to Be Built:

#### A. College Grid/List
**What:** Browse colleges to show interest in
**Needs:**
```tsx
College cards showing:
- College logo
- College name
- Division
- Conference
- Location
- Program info (wins, championships, etc.)
- Quick actions:
  - View program profile
  - Add to interests
  - Message coaches
```

#### B. Filters
**What:** Find colleges that match criteria
**Needs:**
```tsx
Filter by:
- Division (D1, D2, D3, NAIA, JUCO)
- Location (state, region)
- Conference
- Academic ranking
- Program size
- Tuition range
- My fit score (based on GPA, metrics)
```

#### C. College Detail Page
**What:** View college program details
**Needs:**
```tsx
Route: /program/[id] (already built!) ✅

Player can:
- View coaching staff
- See facilities
- See recent commitments
- Contact coaches
- Add to their interests
```

#### D. My Interests List
**What:** Colleges you're interested in
**Needs:**
```tsx
Separate tab/section showing:
- Colleges I've added
- Status (Interested, Applied, Visited, Offer, Committed)
- Last contact date
- Notes per college
- Remove from interests
```

### 📊 Data Source:
```sql
-- Table: organizations (where type = 'college')
SELECT * FROM organizations
WHERE type = 'college'
ORDER BY name;

-- Player's interests: recruiting_interests table
SELECT ri.*, o.*
FROM recruiting_interests ri
JOIN organizations o ON o.id = ri.organization_id
WHERE ri.player_id = $player_id
ORDER BY ri.updated_at DESC;
```

---

## 22. `/dashboard/journey` - My Recruiting Journey
**Status:** ❌ MISSING
**Priority:** 🟠 HIGH
**Needs:** Full page build

### ❌ What Needs to Be Built:

#### A. Timeline View
**What:** Visual timeline of recruiting milestones
**Needs:**
```tsx
Timeline showing:
- Profile created (date)
- Recruiting activated (date)
- First college interest (date + school)
- Campus visits (dates + schools)
- Offers received (dates + schools)
- Commitment (date + school)

Visual:
- Vertical timeline (like LinkedIn experience)
- Icons for each milestone type
- Expandable details per milestone
- Photos/attachments per milestone
```

#### B. Milestones by College
**What:** Track progress with each college
**Needs:**
```tsx
For each college in interests:
- Initial contact date
- Messages exchanged count
- Coach calls/meetings
- Campus visits
- Unofficial/official visit status
- Offer status
- Decision deadline
- Notes
```

#### C. Status Updates
**What:** Add custom updates to timeline
**Needs:**
```tsx
"Add Update" button opens form:
- Update type (milestone, note, achievement)
- Date
- Related college (optional)
- Description
- Photo/document upload (optional)
- Private/shareable toggle
```

#### D. Share Journey
**What:** Share timeline with coaches
**Needs:**
```tsx
- Generate shareable link
- Control what's visible
- Track who viewed it
```

### 📊 Data Source:
```sql
-- Table: recruiting_interests (track per-college status)
-- New table needed: recruiting_milestones
CREATE TABLE recruiting_milestones (
  id UUID PRIMARY KEY,
  player_id UUID REFERENCES players(id),
  organization_id UUID REFERENCES organizations(id),
  milestone_type TEXT, -- contact, visit, offer, etc.
  milestone_date DATE,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 23. `/dashboard/analytics` - Player Analytics
**Status:** 🟡 PARTIAL (Mock data)
**Priority:** 🟠 HIGH
**File:** `src/app/(dashboard)/dashboard/analytics/page.tsx`

### ✅ What Exists:
- Page structure
- Chart components (using Recharts)

### ❌ What Needs Real Data:

#### A. Profile Views Chart
**What:** Graph of profile views over time
**Needs:**
```tsx
Data source: profile_views table
Chart: Line chart showing views per day/week
Features:
- Filter by date range
- Show total views
- Show unique viewers
- Breakdown by coach type (college, JUCO, etc.)
```

#### B. Engagement Stats
**What:** Who's viewing your profile
**Needs:**
```tsx
Stats cards showing:
- Total profile views
- Unique coaches viewed
- Watchlist adds count
- Messages received count
- Video views count

Breakdown by:
- College division (D1, D2, D3, etc.)
- Location (state/region)
- Time period (last 7 days, 30 days, all time)
```

#### C. Top Schools Interested
**What:** Which colleges are most interested
**Needs:**
```tsx
Ranked list:
1. School name
2. Number of profile views
3. Watchlist status
4. Last view date
5. Actions taken (messaged you, etc.)

Visual: Bar chart or ranked list
```

#### D. Video Performance
**What:** Which videos getting views
**Needs:**
```tsx
Video stats:
- Video title/thumbnail
- Total views
- Views by coaches vs public
- Average watch time (if tracked)
- Actions after viewing (message, watchlist)
```

#### E. Anonymous Interest Indicator
**What:** Show interest from schools (if recruiting not activated)
**Needs:**
```tsx
If recruiting NOT activated:
- "A D1 school in Texas viewed your profile"
- "3 coaches added you to their watchlist"

If recruiting IS activated:
- Show actual school names
- "University of Texas viewed your profile"
```

### 📊 Data Source:
```sql
-- Tables: profile_views, video_views, player_engagement_events

-- Profile views
SELECT pv.*, o.name as organization_name, o.division
FROM profile_views pv
JOIN coaches c ON c.id = pv.coach_id
JOIN organizations o ON o.id = c.organization_id
WHERE pv.player_id = $player_id
ORDER BY pv.viewed_at DESC;

-- Engagement events
SELECT * FROM player_engagement_events
WHERE player_id = $player_id
ORDER BY created_at DESC;
```

---

## 24. `/dashboard/camps` - Browse & Register for Camps (PLAYER)
**Status:** ❌ MISSING
**Priority:** 🟡 MEDIUM
**Needs:** Full page build

### ❌ What Needs to Be Built:

#### A. Camp Browser
**What:** Find camps to attend
**Needs:**
```tsx
Camp cards showing:
- Camp name
- Hosting college/organization
- Date(s)
- Location
- Cost
- Spots available
- Actions:
  - View details
  - Register
```

#### B. Filters
**What:** Find relevant camps
**Needs:**
```tsx
Filter by:
- Date range
- Location (state, distance from me)
- Camp type (showcase, skills, position)
- Division level
- Cost range
- Age/grade eligibility
```

#### C. Camp Detail Page
**What:** View full camp information
**Needs:**
```tsx
Shows:
- Full description
- Schedule/agenda
- What to bring
- Coaching staff leading camp
- Registration form
- Payment (if required)
```

#### D. My Registrations
**What:** Track camps you've signed up for
**Needs:**
```tsx
List showing:
- Upcoming camps registered for
- Past camps attended
- Registration status
- Payment status
- Check-in info (for upcoming)
```

### 📊 Data Source:
```sql
-- Tables: camps, camp_registrations

-- Available camps
SELECT c.*, o.name as organization_name
FROM camps c
JOIN organizations o ON o.id = c.organization_id
WHERE c.start_date >= NOW()
AND c.is_public = true
AND c.registration_deadline >= NOW()
ORDER BY c.start_date;
```

---

## 25. `/dashboard/messages` - Player Messages
**Status:** 🟡 PARTIAL
**Priority:** 🔴 CRITICAL

### Same as Coach Messages
See section #7 above - same implementation needed

---

## 26. `/dashboard/settings/privacy` - Privacy Settings
**Status:** ✅ COMPLETE
**Priority:** ✅ DONE

### ✅ What Works:
- 18 privacy toggles
- Auto-save to database
- Organized in 6 groups
- iOS-style switches

---

# JUCO COACH DASHBOARDS

## 27. Mode Toggle System
**Status:** ❌ MISSING
**Priority:** 🟠 HIGH
**Needs:** Full feature build

### ❌ What Needs to Be Built:

#### A. Mode Toggle Component
**What:** Switch between Recruiting and Team modes
**Needs:**
```tsx
Component: <ModeToggle />
Location: Dashboard layout sidebar

Toggle options:
- Recruiting Mode (left)
- Team Mode (right)

Behavior:
- Click to switch modes
- Update URL param: ?mode=recruiting or ?mode=team
- Persist preference in local storage
- Reload dashboard content based on mode
```

#### B. Dashboard Content Switching
**What:** Show different features per mode
**Needs:**
```tsx
Recruiting Mode shows:
- Same as College Coach
- Discover, Watchlist, Pipeline, Compare, Messages

Team Mode shows:
- Same as HS Coach
- Roster, Videos, Dev Plans, Academics, College Interest

Always visible:
- Calendar
- Settings
```

#### C. Academics Tracking (JUCO-specific)
**What:** Track player GPA and eligibility
**Needs:**
```tsx
Route: /dashboard/academics

Table showing:
- Player name
- Current GPA
- Eligible for 4-year transfer? (Yes/No/Pending)
- Credits completed
- Required credits for transfer
- Academic alerts/flags
- Notes

Actions:
- Update GPA
- Mark eligible/ineligible
- Add academic notes
```

### 📊 Data Source:
```sql
-- Existing tables can be reused
-- May need: academic_tracking table for GPA updates
```

---

# SHOWCASE COACH DASHBOARDS

## 28. Multi-Team System
**Status:** ❌ MISSING
**Priority:** 🟡 MEDIUM
**Needs:** Full feature build

### ❌ What Needs to Be Built:

#### A. Team Switcher Component
**What:** Dropdown to switch between teams
**Needs:**
```tsx
Component: <TeamSwitcher />
Location: Dashboard layout header or sidebar

Dropdown showing:
- List of all teams you manage
- Team name + age group
- Active team indicator
- "Add New Team" button

Behavior:
- Select team → updates URL and context
- Persists selection in local storage
```

#### B. Organization Dashboard
**What:** Overview of all teams
**Needs:**
```tsx
Route: /dashboard/showcase (or /dashboard when showcase coach)

Cards showing per team:
- Team name
- Player count
- Upcoming events
- Recent activity
- Quick actions (view roster, schedule event)

Aggregate stats:
- Total players across all teams
- Total events this month
- Total college interest across all players
```

#### C. Per-Team Routes
**What:** Team-specific pages
**Needs:**
```tsx
Routes: /dashboard/team/[teamId]/*

Pages needed:
- /dashboard/team/[teamId] - Team dashboard
- /dashboard/team/[teamId]/roster - Team roster
- /dashboard/team/[teamId]/videos - Team videos
- /dashboard/team/[teamId]/dev-plans - Team dev plans
- /dashboard/team/[teamId]/calendar - Team calendar
- /dashboard/team/[teamId]/messages - Team messages

Each page filters by selected team
```

#### D. Events Management
**What:** Manage showcases/tournaments
**Needs:**
```tsx
Route: /dashboard/events

Event list showing:
- Event name
- Date(s)
- Location
- Teams participating
- Player count
- Status

Actions:
- Create event
- Edit event
- Cancel event
- View attendees
- Share event
```

### 📊 Data Source:
```sql
-- Tables: teams, team_coach_staff

-- Get all teams for coach
SELECT t.* FROM teams t
JOIN team_coach_staff tcs ON tcs.team_id = t.id
WHERE tcs.coach_id = $coach_id
ORDER BY t.name;
```

---

# PUBLIC PAGES (ALREADY BUILT) ✅

## 29. `/player/[id]` - Public Player Profile
**Status:** ✅ COMPLETE
**File:** `src/app/(public)/player/[id]/page.tsx`

### ✅ What Works:
- Privacy-aware display
- Videos gallery
- Stats display
- Dream schools
- Contact buttons
- SEO metadata
- Analytics tracking

---

## 30. `/program/[id]` - Public Program Profile
**Status:** ✅ COMPLETE
**File:** `src/app/(public)/program/[id]/page.tsx`

### ✅ What Works:
- Program information
- Coaching staff directory
- Facilities gallery
- Commitments list
- Contact information
- SEO metadata

---

# PRIORITY IMPLEMENTATION ORDER

## Sprint 1: Core Recruiting (20-25 hours) 🔴
**Goal:** Make College Coach recruiting workflow functional

1. **Player Discovery** (`/dashboard/discover`) - 6 hours
   - Grid view with player cards
   - Filter panel (position, grad year, location, metrics)
   - Search and sort
   - Pagination
   - Connect to discover → watchlist flow

2. **Watchlist Management** (`/dashboard/watchlist`) - 5 hours
   - Table view of tracked players
   - Status management dropdown
   - Notes system
   - Filters and search
   - Bulk actions

3. **Pipeline Drag-Drop** (`/dashboard/pipeline`) - 6 hours
   - Install @dnd-kit
   - Implement drag-drop between stages
   - Database updates on drop
   - Player cards in pipeline
   - Stage statistics

4. **Messaging Send** (`/dashboard/messages`) - 4 hours
   - Compose message UI
   - Send message action
   - New conversation flow
   - Real-time updates with Supabase

## Sprint 2: Player Recruiting (15-18 hours) 🟠
**Goal:** Complete player recruiting experience

5. **College Discovery** (`/dashboard/colleges`) - 5 hours
   - College grid/cards
   - Filters (division, location, etc.)
   - Add to interests
   - Connect to public program profiles

6. **My Journey** (`/dashboard/journey`) - 6 hours
   - Timeline component
   - Milestone tracking
   - Per-college progress
   - Add custom updates

7. **Analytics Dashboard** (`/dashboard/analytics`) - 5 hours
   - Profile views chart
   - Engagement stats
   - Top schools interested
   - Video performance
   - Real data integration

## Sprint 3: Comparison & Advanced (12-15 hours) 🟡
**Goal:** Add comparison and advanced features

8. **Player Comparison** (`/dashboard/compare`) - 6 hours
   - Side-by-side comparison table
   - Radar chart visualization
   - Export/save comparison

9. **Video Clipping** (`/dashboard/videos/[id]/clip`) - 6 hours
   - Video player with timeline
   - Start/end time selection
   - Save clips to database

10. **JUCO Mode Toggle** - 4 hours
    - Mode toggle component
    - Dashboard switching logic
    - Academics tracking page

## Sprint 4: Camps & Multi-Team (18-22 hours) 🟢
**Goal:** Complete camps and showcase features

11. **Camps System** (`/dashboard/camps`) - 10 hours
    - Coach: Create/manage camps
    - Player: Browse/register for camps
    - Public camp pages
    - Registration flow

12. **Showcase Multi-Team** - 10 hours
    - Team switcher component
    - Organization dashboard
    - Per-team routes
    - Events management

---

# SUMMARY

## Completion Status by Dashboard:

### College Coach (5 of 10 complete)
- ✅ Dashboard, Calendar
- 🟡 Messages, Pipeline
- ❌ Discover, Watchlist, Compare, Camps, Program Editor

### HS Coach (6 of 7 complete)
- ✅ Team Dashboard, Roster, Videos, Dev Plans, College Interest, Calendar
- 🟡 Settings

### Player (7 of 11 complete)
- ✅ Dashboard, Profile, Videos, Team Hub, Activation, Privacy Settings
- 🟡 Messages, Analytics
- ❌ Colleges Discovery, Journey, Camps

### JUCO Coach (0 of 4 complete)
- ❌ All features (mode toggle, dual dashboard, academics, inherited features)

### Showcase Coach (0 of 4 complete)
- ❌ All features (team switcher, org dashboard, per-team, events)

---

**Total Features:** 56
**Complete:** 28 (50%)
**Partial:** 10 (18%)
**Missing:** 18 (32%)

**Critical Path:** Discover → Watchlist → Pipeline → Messages = Core recruiting workflow

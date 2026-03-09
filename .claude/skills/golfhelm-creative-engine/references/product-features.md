# GolfHelm Golf Product — Complete Feature Reference

## Product Identity

**Product name:** GolfHelm
**Tagline:** Your AI-Powered Golf Coach
**Sub-tagline:** Predictions, Insights, Round Reviews. Built for college golf teams.
**Company:** Helm Sports Labs
**Target users:** College golf teams (NCAA D1–D3, NAIA, JUCO)
**User roles:** Coach, Player
**Tech stack:** Next.js, Supabase, Tailwind CSS, DM Sans typography
**Visual identity:** Warm glass-morphism over cream/green backgrounds. Premium SaaS aesthetic, never sports-generic.

---

## Entity Model

### Team
- One coach per team (primary admin)
- Multiple players per team
- Join code for player invitations
- Team-level settings: timezone, name, organization
- Team-level stats aggregated from player rounds

### Coach
- Creates and manages the team
- Views all player data
- Creates qualifiers, focus areas, tasks, announcements
- Receives AI coaching insights at team level
- Can message any player

### Player
- Belongs to one team
- Logs rounds (hole-by-hole scoring)
- Views personal stats, insights, development plans
- Receives AI coaching recommendations (CoachHelm)
- Can message coach
- Has online status indicator (green dot = active <5min)

### Round
- Core data unit. Every stat flows from rounds.
- Types: Tournament, Qualifying, Practice, Casual
- Contains: score, putts per hole, fairways hit, GIR, course info
- In-progress rounds supported (save and resume)
- 9-hole rounds normalized to 18-hole equivalents for stats
- Grouped by month/year in the UI

### Shot (granular)
- Hole-by-hole data within a round
- Strokes gained calculations
- Club performance tracking
- Used for deep analytics

### Qualifier
- Coach-created competition for team selection
- Status: upcoming → in_progress → completed
- Has spots available, start/end dates, course assignment
- Players see their scores and placement

### Focus Area (Development Plan)
- Coach creates for individual players
- Types: technical, mental, course management, fitness, etc.
- Has target metric, current value, timeline
- Status: started → in_progress → completed
- Progress tracking toward goal

### AI Insight
- System-generated coaching observation
- Has type, priority level, related player
- Status: new → acknowledged → archived
- Suggested action included
- Filterable by player, type, priority, date range

### AI Pattern
- System-detected performance pattern
- Impact metrics and affected players
- Types: consistency, course condition correlation, scoring patterns
- Used by Intelligence Dashboard

---

## Coach Dashboard — Feature-by-Feature

### 1. Main Dashboard (Home)
**Purpose:** Team overview — the first thing a coach sees after login.
**Hero components for creatives:**
- Team scoring average card (large number + trend arrow)
- Recent rounds list (player name, score, course, date)
- Top players ranking (avatar + name + avg score)
- Upcoming events strip
- Team scoring trend line chart

**Sample data for creatives:**
```
Team Scoring Average: 74.2 (↓ 1.3 from last month)
Roster: 12 players
Upcoming Events: 3
Recent Rounds: Jake S. — 71 at Pinehurst #4 (Tournament)
Top Player: Marcus W. — 72.1 avg (8 rounds)
```

### 2. Rounds Management
**Purpose:** All team rounds in one place. Coach sees every player's rounds.
**Hero components:**
- Stats summary row: Total Rounds | Avg Score | Best Round | Avg to Par | Under Par % | Trend
- Individual round cards with type badges (color-coded)
- Month/year grouping headers

**Sample data:**
```
Total Rounds: 47 this season
Avg Score: 74.8
Best Round: 68 (Jake S. at TPC Sawgrass)
Under Par %: 23%
Trend: Improving (↓ 0.8 strokes over 30 days)
```

**Visual notes:** Round type badges use distinct colors — Tournament (green), Qualifying (blue), Practice (amber), Casual (warm-gray). Glass cards with shine effect animation on hover.

### 3. Statistics & Analytics
**Purpose:** Deep performance analysis with shot-level data.
**Hero components:**
- Summary stat cards (score, putts, fairways %, GIR %)
- Round selection dropdown for drill-down
- Shot-level aggregates (strokes gained by category)
- Per-hole breakdowns

**Sample data:**
```
Avg Score: 73.4 | Avg Putts: 31.2 | Fairways: 61% | GIR: 56%
Strokes Gained Putting: +0.4 | Approach: -0.8 | Tee-to-Green: +1.2
```

**Visual notes:** Lazy-loaded shot data. Stats normalized 9→18 holes. Multiple stat cards in bento grid layout.

### 4. Intelligence Dashboard
**Purpose:** AI-powered team coaching patterns. The "brain" of GolfHelm.
**Hero components:**
- Command center layout with modular sections
- Pattern cards (detected trends across team)
- Player-specific insight cards
- Prediction panels for upcoming rounds

**Sample data:**
```
Pattern: "Three-putt rate increases 40% on back 9 across 6 players"
Prediction: "Jake S. projected 73 at Colonial — confidence 78%"
Insight: "Short game consistency improving team-wide over last 3 weeks"
```

**Visual notes:** This is the most "AI-forward" feature — ideal for Instagram creatives showing the intelligence layer. Cards show priority badges (high/medium/low) with color coding.

### 5. Development Plans
**Purpose:** Structured player improvement programs.
**Hero components:**
- Player list with mini stat summaries
- Focus area cards with status badges and progress bars
- Target vs. current metric visualization

**Sample data:**
```
Player: Sarah M. | Focus: Short Game Consistency
Target: GIR from 48% → 58% by March
Current: 53% (on track)
Status: In Progress | Started: Jan 15
```

### 6. AI Insights Management
**Purpose:** Filterable feed of AI-generated coaching observations.
**Hero components:**
- Insight cards with priority badges
- Multi-filter bar (player, type, priority, status, date range)
- Pagination

**Sample data:**
```
🔴 HIGH: "Marcus W. approach game trending up (+0.8 SG) — reinforce current swing path"
🟡 MED: "Three-putt pattern emerging on back 9 — fatigue or course management"
🟢 LOW: "Tee-to-green consistency at season best for 4 players"
```

### 7. Qualifiers
**Purpose:** Internal team competitions for lineup selection.
**Hero components:**
- Qualifier cards with status badges (upcoming/in-progress/completed)
- Progress bar for in-progress qualifiers
- Results leaderboard

**Sample data:**
```
Spring Qualifier #2 | In Progress
Course: Pinehurst #4 | Spots: 5 of 12
Dates: Mar 8-10 | Progress: 67%
```

### 8. Roster
**Purpose:** Team player management.
**Hero components:**
- Player cards (large 80px avatar, name, year, location)
- Online status dot (green = active)
- Stats row: Rounds | Avg Score | Handicap
- Empty state: "Build Your Team" CTA

**Sample data:**
```
Jake S. | Senior | Austin, TX
Rounds: 24 | Avg: 72.1 | Handicap: +1.2
● Online
```

### 9. Calendar
**Purpose:** Team schedule management.
**Event types:** Practice, Tournament, Qualifying, Meeting, Travel, Other
**Features:** Full month view, RSVP, team timezone support

### 10. Announcements
**Purpose:** Team-wide messages from coach.
**Features:** Pin important announcements, rich text content

### 11. Tasks
**Purpose:** Assign action items to players.
**Features:** Status tracking (open → in-progress → completed), priority levels, due dates

### 12. Messages
**Purpose:** Secure coach-player communication.
**Features:** Conversation threads, unread counts, real-time

### 13. Documents
**Purpose:** File sharing (playbooks, manuals, resources).
**Features:** Upload, categorize, access control by role

### 14. Travel
**Purpose:** Team travel logistics.
**Features:** Itinerary cards, hotel/transport details, attendee lists

### 15. Coaching Intelligence Settings
**Purpose:** Configure AI insight preferences.
**Features:** Toggle insight types, alert frequency, focus priorities

---

## Player Dashboard — Feature-by-Feature

### 1. Main Dashboard (Home)
**Purpose:** Personal performance snapshot — first thing a player sees.
**Hero components:**
- Personal handicap (large display number)
- Rounds played count
- Average score with trend
- Best round highlight
- Score-to-par trend chart
- Team name and status badge
- Upcoming events

**Sample data:**
```
Handicap: +1.2
Rounds: 24 this season
Avg Score: 72.1 (↓ 0.6 from last month)
Best Round: 68 at TPC Sawgrass
Team: UNC Tar Heels Golf
```

### 2. Next Round Prediction (CoachHelm AI)
**Purpose:** AI score prediction for upcoming round. THE signature GolfHelm feature.
**Hero components:**
- Large predicted score number (e.g., "73")
- Confidence bar (percentage)
- Range indicator (e.g., "Range: 70–76")
- Trend indicators (+/- vs average)
- Supporting bullets explaining prediction factors

**Sample data:**
```
NEXT ROUND PREDICTION
73  ±1.2 vs avg
Range: 70–76
78% confidence
━━━━━━━━━━━━━━━━━━━━━ 78%

• Approach game trending up (+0.8 SG)
• Mid-range putting inconsistent
• Tee accuracy improving last 3 rounds
```

**Visual notes:** This is the #1 hero component for Instagram creatives. Green confidence bar. Glass card floating over background. The "73" should be display-lg size (72px) with tight letter-spacing.

### 3. AI Insights Feed
**Purpose:** Personalized AI coaching recommendations in player-friendly language.
**Hero components:**
- Insight cards with emoji indicators and progress bars
- Priority-ordered feed
- Action recommendations

**Sample data:**
```
🏌️ "Short game is your weapon right now"          85%
   Up-and-down conversion from 30-40 yds jumped to 68% —
   that's tour-level scrambling

⚠️ "Three-putt pattern emerging on back 9"        96%
   4 of last 8 three-putts came on holes 13-18.
   Fatigue or course management may be a factor

📈 "Tee-to-green at season best"                   68%
   FW + GIR combo rate hit 52% — up from 41% at season start
```

**Visual notes:** Each insight card is a glass card with left-accent emoji icon. Percentage badges in top-right corner. These cards stack vertically and are perfect for carousel slides.

### 4. Round Review
**Purpose:** Detailed post-round analysis.
**Hero components:**
- Course name + date header
- Score badge (large number, "Even par" / "+2" label)
- Hole-by-hole scorecard strip (color-coded: birdie=blue, par=white, bogey=amber, double+=red)
- Stat summary badges: Fairways % | GIR % | Putts | Scrambling %

**Sample data:**
```
ROUND REVIEW
Pinehurst #4 | Mar 4 | 18 holes | Tournament

72  Even par

Hole: 1  2  3  4  5  6  7  8  9  | 10 11 12 13 14 15 16 17 18
Score:3  4  5  4  4  2  5  4  4  |  4  4  3  4  4  4  36

Fairways: 61% | GIR: 56% | Putts: 30 | Scrambling: 55%
```

**Visual notes:** The scorecard strip is a distinctive horizontal row of numbered cells, color-coded by score. The stat badges below are pill-shaped with icons. This entire component on a glass card is extremely Instagram-worthy.

### 5. My Development
**Purpose:** Track focus areas assigned by coach.
**Hero components:**
- Focus area cards with progress bars
- Target vs. current metric
- Coach notes
- Timeline visualization

### 6. My Qualifiers
**Purpose:** View and track qualifier participation.
**Hero components:**
- Qualifier cards with player's score/placement
- Status badges

### 7. My Rounds
**Purpose:** Personal round log with creation flow.
**Features:**
- Create new round (select course, date, type)
- Log shots hole-by-hole
- Save/resume in-progress rounds
- View history with detailed stats

### 8. Shared Features (same as coach)
- Calendar, Messages, Announcements, Documents, Tasks

---

## Dashboard UI Patterns

### Glass Card System
Every data card in GolfHelm uses the glass morphism system:
```css
background: rgba(255, 255, 255, 0.7);
border: 1px solid rgba(255, 255, 255, 0.5);
backdrop-filter: blur(16px);
border-radius: 20px;
box-shadow: 0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6);
```
Cards have a "shine effect" overlay that animates on hover.

### Bento Grid Layout
Stats are displayed in a responsive bento grid:
- Mobile: 1 column, full-width cards
- Tablet: 2 columns
- Desktop: 3–4 columns
- Hero stat card can span 2 columns

### Stat Card Anatomy
```
┌─────────────────────┐
│ Icon    Label    ↑↓  │  ← trend arrow
│                      │
│    74.2              │  ← large metric (display size)
│    vs. 75.5 last mo  │  ← comparison line
└─────────────────────┘
```

### Badge System
| Badge Type | Colors |
|-----------|--------|
| Tournament | Green bg, white text |
| Qualifying | Blue bg, white text |
| Practice | Amber bg, dark text |
| Casual | Warm-gray bg, dark text |
| Status: Active | Green dot |
| Status: Pending | Amber dot |
| Priority: High | Red |
| Priority: Medium | Amber |
| Priority: Low | Green |
| Insight confidence | Percentage pill, right-aligned |

### Navigation
- Dark glass sidebar (coach): `rgba(28, 25, 23, 0.97)` with blur
- Mobile: Bottom nav bar + hamburger header
- Animated page transitions (fade-up 400ms)
- Breadcrumbs for nested views

### Empty States
- Centered illustration + headline + CTA button
- Example: "Build Your Team" with green CTA on roster page
- Always have a clear next-action

---

## Aspirational Sample Data Library

Use these as-is in creatives. They're realistic for college golf.

### Player Profiles
```
Jake S. | Senior | Austin, TX | Handicap: +1.2 | Avg: 72.1
Sarah M. | Junior | Charlotte, NC | Handicap: 2.4 | Avg: 74.3
Marcus W. | Sophomore | Scottsdale, AZ | Handicap: +0.8 | Avg: 72.8
Lily K. | Freshman | San Diego, CA | Handicap: 3.1 | Avg: 75.0
Tyler R. | Senior | Orlando, FL | Handicap: 1.5 | Avg: 73.2
```

### Round Data
```
72 — Even par — Pinehurst #4 — Tournament
68 — -4 — TPC Sawgrass — Qualifying
75 — +3 — Pebble Beach — Practice
71 — -1 — Augusta National — Tournament
```

### Team Stats
```
Team Scoring Average: 74.2
Best Team Round: 286 (-2) at Colonial
Roster: 12 players
Season Rounds: 156
Under Par Rate: 23%
Improvement Trend: ↓ 0.8 strokes (30-day)
```

### AI Predictions
```
Score: 73 | Range: 70–76 | Confidence: 78%
Score: 71 | Range: 69–74 | Confidence: 82%
Score: 75 | Range: 72–78 | Confidence: 71%
```

### AI Insights
```
"Short game is your weapon right now" — 85% confidence
"Three-putt pattern emerging on back 9" — 96% confidence
"Tee-to-green consistency at season best" — 68% confidence
"Approach game trending up (+0.8 SG)" — +0.8 SG badge
"Mid-range putting inconsistent" — -0.4 SG badge
"Tee accuracy improving last 3 rounds" — +0.3 SG badge
```

### Stat Badges
```
Fairways: 61% | GIR: 56% | Putts: 30 | Scrambling: 55%
Fairways: 71% | GIR: 64% | Putts: 28 | Scrambling: 62%
```

### Courses (Real, Recognizable)
```
Pinehurst #4 | Pinehurst, NC
TPC Sawgrass | Ponte Vedra Beach, FL
Pebble Beach Golf Links | Pebble Beach, CA
Colonial Country Club | Fort Worth, TX
Kiawah Island (Ocean) | Kiawah Island, SC
```

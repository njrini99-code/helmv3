# 🎬 ULTRA-PREMIUM PRODUCT SHOWCASE PAGE
## Helm Sports Labs - The Command Center for Championship Programs

### 🎯 MISSION
Create a visually stunning, cinematically animated product showcase focused entirely on **what the platform does** and **how it works**. Every scroll reveals the sophisticated team management and recruiting workflows that make Helm the operating system for elite sports programs. Zero social proof—pure product demonstration.

---

## 🏗️ ARCHITECTURE & TECH STACK

**Framework:** Next.js 14 with TypeScript  
**Animation Libraries:**
- GSAP 3.12+ with ScrollTrigger, SplitText, ScrollSmoother
- Framer Motion for component animations & gestures
- React Three Fiber for 3D elements
- Lenis for buttery smooth scroll

**Styling:** Tailwind CSS with custom design tokens  
**Components:** shadcn/ui primitives with heavy customization

---

## 🎨 DESIGN SYSTEM TOKENS

```typescript
// Color System (OKLCH for perceptual uniformity)
--primary-golf: oklch(0.65 0.19 150);     // Emerald green
--primary-baseball: oklch(0.70 0.18 45);  // Amber/Orange
--background: oklch(0.1 0 0);             // Near-black
--glass-surface: rgba(255, 255, 255, 0.08);
--glass-border: rgba(255, 255, 255, 0.12);

// Typography - Cal Sans display + Inter Variable
--font-display: 'Cal Sans', system-ui;
--font-sans: 'Inter Variable', system-ui;

// Motion
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--ease-elastic: cubic-bezier(0.5, 1.5, 0.5, 1);
```

---

## 🎬 SECTION 1: HERO - "The Neural Center"
**Height:** 100vh  
**Scroll Distance:** Immediate impact

### Visual Composition

#### 1. WebGL Neural Network Background
- Organic node connections forming team/pipeline visualization
- Nodes pulse with data flow animation
- Colors: Deep green → emerald → amber → orange gradient flows
- Connections brighten when mouse approaches nodes
- 60fps performance, pauses out of viewport

#### 2. Floating 3D Dashboard Constellation (React Three Fiber)
- 5 mini dashboard cards orbit slowly around center
- Each card shows different aspect: Calendar, Stats, Pipeline, Roster, AI
- Cards slowly rotate on Y-axis
- Mouse interaction tilts entire constellation
- Depth of field blur creates focus hierarchy

#### 3. Dynamic Grid Overlay
- Subtle blueprint-style grid that warps with scroll
- Grid nodes illuminate near dashboard cards
- Creates "command center" technical aesthetic

### Typography Animation

```typescript
// Headline: "The Operating System for Championship Programs"
// Split by lines, each line has different entrance

Line 1: "The Operating System"
- Fade + slide up from 40px
- Slight blur transition (blur: 4px → 0)
- Duration: 0.8s, delay: 0.2s

Line 2: "for Championship Programs"
- Character stagger animation
- Each char: rotate3d(90deg) → 0deg + scale 0 → 1
- Stagger: 0.03s between chars
- Elastic ease on scale

// Subheadline reveals in two parts
Part 1: "AI-powered team management."
- Typewriter: 30ms per char

Part 2: "Complete recruiting CRM."  
- Fade in after Part 1 complete
- Green glow on "team management", amber glow on "recruiting"
```

### Interaction

#### Dual Magnetic CTA System
- Left button (Green): "Explore Team Management"
- Right button (Amber): "Explore Recruiting"
- Each button has 150px magnetic radius
- Hover: product-colored glow expands
- Click: splits screen vertically into product lanes

#### Product Selector Toggle
- Below CTAs: sleek toggle switch
- "GolfHelm" | "BaseballHelm"
- Sliding indicator with gradient
- Changes hero constellation theme
- Smooth color transition across all elements

---

## 🎬 SECTION 2: PLATFORM OVERVIEW - "Unified Architecture"
**Height:** 200vh (scroll controlled)  
**Pinned Viewport:** 100vh

### Visual: Expanding Dashboard Layers

Architecture diagram that builds itself on scroll:

#### Layer 1: Core Platform (scroll: 0-20%)
- Central hub appears: glass panel with "Helm Core" label
- Rotates slowly in 3D space
- Pulsing light from center

#### Layer 2: Data Layer (scroll: 20-40%)
- 4 database icons orbit around core
- Labels: "Performance", "Roster", "Pipeline", "Schedule"
- Connection lines draw from core to each database
- Data packets animate along lines

#### Layer 3: Intelligence Layer (scroll: 40-60%)
- AI brain icon appears above core
- Neural connections branch out
- "CoachHelm AI" label with subtle glow
- Insight cards float around: "Pattern Detection", "Alerts", "Predictions"

#### Layer 4: User Interface (scroll: 60-80%)
- Multiple device mockups materialize around architecture
- Desktop, tablet, mobile views
- Each shows different interface
- Synchronized scroll animations on device screens

#### Layer 5: Integration Layer (scroll: 80-100%)
- External service icons fade in at edges
- Labels: "Video Analysis", "Stats Export", "Calendar Sync", "SMS/Email"
- Dotted connection lines

### Text Overlay (Scrolls with Architecture)

```typescript
const architectureSteps = [
  {
    title: "Built on a Unified Data Model",
    description: "Every stat, every interaction, every insight—connected.",
    scrollRange: [0, 0.25]
  },
  {
    title: "Intelligence That Learns Your Program",
    description: "AI that understands your coaching philosophy and surfaces what matters.",
    scrollRange: [0.25, 0.5]
  },
  {
    title: "Anywhere, Any Device",
    description: "Sideline tablet, office desktop, or on-the-go mobile—always in sync.",
    scrollRange: [0.5, 0.75]
  },
  {
    title: "Connects Your Entire Ecosystem",
    description: "Works with the tools you already use, enhances what you already do.",
    scrollRange: [0.75, 1]
  }
];

// Text fades in/out based on scroll position
// Current step highlighted in product accent color
```

---

## 🎬 SECTION 3: FEATURE SPLIT - "Two Sides, One Platform"
**Height:** 100vh  
**Layout:** Vertical split-screen

### Split-Screen Mechanic

```typescript
const { scrollYProgress } = useScroll({
  target: containerRef,
  offset: ['start start', 'end start']
});

const leftX = useTransform(scrollYProgress, [0, 1], ['0%', '-45%']);
const rightX = useTransform(scrollYProgress, [0, 1], ['0%', '45%']);
const centerOpacity = useTransform(scrollYProgress, [0, 0.3, 0.5], [0, 1, 0]);
```

**Initial State:** Full-width unified view
- Both products shown together
- "One Platform, Two Specializations" center text

**Scroll Action:** Screen splits vertically
- Left half: GolfHelm (green theme)
- Right half: BaseballHelm (amber theme)
- Center divider glows and pulses
- Each side shows key capabilities

### Left Side (GolfHelm) Content

**Visual:** Floating feature cards in 3D space

1. **AI Coaching Intelligence**
   - Brain icon with neural glow
   - "CoachHelm AI analyzes performance"
   
2. **Shot-by-Shot Tracking**
   - Golf ball trajectory visualization
   - "Every shot, every round"

3. **Team Performance**
   - Strokes gained chart animating
   - "Data-driven development"

4. **Calendar & Planning**
   - Mini calendar with events
   - "Practice, qualifiers, tournaments"

### Right Side (BaseballHelm) Content

**Visual:** Kanban pipeline that animates

1. **Recruiting Pipeline**
   - Cards moving between stages
   - "Visual workflow management"

2. **Player Discovery**
   - Search interface with filters
   - "Find your next prospect"

3. **Communication Hub**
   - Message timeline
   - "Track every interaction"

4. **Scholarship Management**
   - Allocation meter filling
   - "Budget and offers tracked"

---

## 🎬 SECTION 4: TEAM MANAGEMENT DEEP DIVE - "The Daily Workflow"
**Height:** Auto (stacked sections)  
**Layout:** Alternating left/right showcases

### 4A: AI Coaching Intelligence (CoachHelm)
**Layout:** Large screen left, text right

#### Screen Content:
Animated AI insight feed (live simulation). 4 insight types cycling every 5 seconds:

##### 1. Scoring Decline Alert
- Player card with downward trend arrow
- Stats comparison table slides in
- Recommended practice focus highlights

##### 2. Surge Player Detection
- Player card with upward trajectory
- Performance graph with breakthrough point
- Roster position implications

##### 3. Pattern Recognition
- Heat map of scoring areas
- Multiple player comparison
- Team-wide trend visualization

##### 4. Qualifying Position Tracker
- Leaderboard with bubble positions
- Margin bars between players
- Next event impact projections

#### Screen Animation:
- Insights slide in from right
- Active insight: scale 1.02, glow border
- Inactive insights: 0.6 opacity, slight blur
- Graphs animate (line drawing, bar growing)
- Numbers count up

#### Text Content:

```typescript
{
  headline: "Intelligence That Never Sleeps",
  description: "CoachHelm AI continuously monitors your roster, detecting patterns you'd miss in spreadsheets. Get alerted to scoring declines, surge players, and qualifying position changes—all calibrated to your coaching style.",
  capabilities: [
    "Alert sensitivity: Aggressive, Balanced, or Conservative",
    "Pattern detection across multiple rounds and players",
    "Qualifying position tracking with bubble alerts",
    "Practice recommendations based on performance gaps"
  ]
}
```

#### Scroll Reveal:
- Screen enters from left with blur fade
- Text enters from right with stagger on bullets
- Insight cards pop in sequentially

---

### 4B: Performance Tracking System
**Layout:** Text left, large screen right

#### Screen Content:
Split view: Round tracking + Season stats

##### Left Panel: Live Round Entry

```typescript
// Animated shot-by-shot interface
{
  hole: 7,
  par: 4,
  shots: [
    { num: 1, club: "Driver", lie: "Tee", result: "Fairway", distance: 285 },
    { num: 2, club: "8 Iron", lie: "Fairway", result: "Green", distance: 12 },
    { num: 3, club: "Putter", lie: "Green", result: "Hole", distance: 0 }
  ]
}

// Each shot entry animates in
// Stats update in real-time: FIR, GIR, Putts
// Mini hole diagram shows shot positions
```

##### Right Panel: Analytics Dashboard

```typescript
// Strokes gained categories
{
  categories: [
    { name: "Off Tee", value: +0.8, trend: "up" },
    { name: "Approach", value: -0.3, trend: "down" },
    { name: "Around Green", value: +0.5, trend: "up" },
    { name: "Putting", value: -0.2, trend: "down" }
  ]
}

// Animated horizontal bar chart
// Bars grow from center (0)
// Positive = green, Negative = red
// Trend arrows animate
```

#### Text Content:

```typescript
{
  headline: "From Tee to Trophy",
  description: "Track every shot during the round with comprehensive details: club, lie, distance, result, and miss tendencies. The complete picture that powers AI pattern detection.",
  workflow: [
    "Shot-by-shot entry with autocomplete clubs",
    "Automatic fairway hit, GIR, and scrambling calculation",
    "Strokes gained analysis across all categories",
    "Round-over-round trend visualization"
  ]
}
```

#### Interaction:
- Hover on stat category: expands with detailed breakdown
- Click shot in list: shows hole diagram with shot path
- Scroll triggers: stats count up, charts animate

---

### 4C: Calendar & Scheduling System
**Layout:** Large screen left, text right

#### Screen Content:
Dual view: Month calendar + Event details

##### Calendar View:

```typescript
// Interactive month calendar
{
  days: [
    { date: 15, events: [] },
    { date: 16, events: [{ type: "practice", title: "Team Practice" }] },
    { date: 17, events: [] },
    { date: 18, events: [
      { type: "qualifier", title: "Spring Q R1" },
      { type: "qualifier", title: "Spring Q R2" }
    ]},
    { date: 19, events: [{ type: "travel", title: "Conference Champ" }] }
  ]
}

// Days with events: glow effect
// Event types: color-coded dots
// Today: pulsing ring
// Selected day: expanded card
```

##### Event Detail Panel:

```typescript
// Expanded event card
{
  title: "Spring Qualifier Round 1",
  date: "Monday, Jan 18",
  time: "8:00 AM Shotgun",
  location: "Oak Hill CC",
  players: [
    { name: "Jake T.", status: "confirmed", avatar: "JT" },
    { name: "Marcus J.", status: "confirmed", avatar: "MJ" },
    { name: "Ryan M.", status: "pending", avatar: "RM" },
    // ... more
  ],
  details: {
    format: "18 holes, stroke play",
    teeTime: "8:00 AM",
    weather: "72°, Partly Cloudy"
  }
}

// Player avatars in grid
// Status badges: green (confirmed), amber (pending), red (declined)
// Quick actions: Message Team, Export Schedule, Send Reminder
```

#### Text Content:

```typescript
{
  headline: "Your Program's Command Center",
  description: "Schedule practices, qualifiers, and tournaments in one unified calendar. Track player availability, manage travel rosters, and keep your entire program synchronized.",
  features: [
    "Practice planning with attendance tracking",
    "Multi-round qualifier events",
    "Travel roster management and logistics",
    "Player RSVP and conflict management",
    "Weather and course condition notes",
    "Automated reminders and notifications"
  ]
}
```

#### Animation:
- Calendar days fade in with stagger
- Event dots pulse on hover
- Player avatars slide in when event selected
- Status updates animate (icon swap + color transition)

---

### 4D: Roster Management
**Layout:** Text left, screen right

#### Screen Content:
Team roster table with interactive elements

##### Roster Table:

```typescript
const roster = [
  {
    player: "Jake Thompson",
    year: "Junior",
    scoring: { avg: 72.3, trend: -1.2 },
    position: { qualifying: 1, travel: "Locked" },
    status: "Active",
    lastRound: { date: "Jan 12", score: 71, course: "Oak Hill" }
  },
  {
    player: "Marcus Johnson",
    year: "Senior", 
    scoring: { avg: 73.8, trend: +2.1 },
    position: { qualifying: 4, travel: "Bubble" },
    status: "Alert",
    lastRound: { date: "Jan 12", score: 76, course: "Oak Hill" }
  },
  // ... more players
];

// Table columns:
// - Player (avatar + name + year)
// - Scoring Average (with trend arrow)
// - Qualifying Position
// - Travel Roster Status
// - Last Round
// - Quick Actions (stats, message, schedule)

// Row states:
// - Normal: neutral background
// - Alert: amber glow (performance issue)
// - Surge: green glow (improvement)
// - Selected: expanded with mini stats
```

#### Interactive Features:
- Click player row: expands with mini dashboard
  - Last 5 rounds graph
  - Scoring breakdown
  - Practice attendance
  - Quick message button
- Hover column header: sort indicator
- Drag column dividers to resize
- Filter dropdown: position, year, status

#### Text Content:

```typescript
{
  headline: "Your Roster at a Glance",
  description: "Complete team overview with real-time qualifying positions, travel roster status, and performance trends. Spot issues before they become problems.",
  capabilities: [
    "Qualifying position tracking with automatic updates",
    "Travel roster bubble alerts",
    "Performance trend indicators",
    "Practice attendance monitoring",
    "Individual player dashboards",
    "Batch actions: message, schedule, export"
  ]
}
```

---

## 🎬 SECTION 5: RECRUITING DEEP DIVE - "Pipeline to Program"
**Height:** Auto  
**Layout:** Alternating sections

### 5A: Visual Pipeline Management
**Layout:** Full-width kanban demonstration

#### Kanban Board:

```typescript
const pipeline = {
  columns: [
    {
      id: "watchlist",
      title: "Watchlist",
      count: 24,
      color: "slate",
      prospects: [
        { name: "Tyler Martinez", position: "RHP", year: "2026", school: "Austin HS", stats: { era: "1.85", velo: "92" } },
        { name: "Jordan Lee", position: "SS", year: "2025", school: "Dallas Prep", stats: { avg: ".425", hr: "12" } },
        // ... more
      ]
    },
    {
      id: "high_priority",
      title: "High Priority",
      count: 12,
      color: "blue",
      prospects: [...]
    },
    {
      id: "offer_extended",
      title: "Offer Extended",
      count: 6,
      color: "amber",
      prospects: [...]
    },
    {
      id: "committed",
      title: "Committed",
      count: 3,
      color: "green",
      prospects: [...]
    }
  ]
};

// Card design:
// - Drag handle (6 dots icon)
// - Player avatar (gradient based on name)
// - Name + school
// - Position badge + grad year
// - Key stats (era/velo or avg/hr)
// - Last contact indicator

// Interaction:
// - Drag between columns (Framer Motion drag)
// - Smooth reordering within column
// - Drop animation: card highlight + confetti burst
// - Column glow on drag-over
```

#### Animated Demo:

```typescript
// Auto-play demonstration (loops every 12s)
useEffect(() => {
  const sequence = async () => {
    await delay(2000);
    // Highlight a card in Watchlist
    setHighlightedCard("tyler-martinez");
    
    await delay(1500);
    // Drag card to High Priority
    animateDrag("tyler-martinez", "watchlist", "high_priority");
    
    await delay(2000);
    // Show interaction menu on another card
    setActiveMenu("jordan-lee");
    
    await delay(1500);
    // Close menu
    setActiveMenu(null);
    
    await delay(2000);
    // Move card to Offer Extended
    animateDrag("jordan-lee", "high_priority", "offer_extended");
    
    await delay(2000);
    // Reset
    resetBoard();
  };
  
  sequence();
}, []);
```

#### Text Overlay:

```typescript
{
  headline: "Visual Workflow Management",
  description: "Drag-and-drop pipeline that makes recruiting tactile. Move prospects between stages, see your funnel at a glance, never lose track of a recruit.",
  features: [
    "Drag prospects between pipeline stages",
    "Filter by position, grad year, location",
    "Bulk actions: message, schedule, export",
    "Scholarship allocation planning",
    "Custom pipeline stages for your process",
    "Activity timeline on every prospect"
  ]
}
```

---

### 5B: Player Discovery Engine
**Layout:** Large screen left, text right

#### Screen Content:
Search interface with live demo

##### Search Interface:

```typescript
// Top: Search bar with auto-complete
<SearchBar
  placeholder="Search by name, position, school..."
  suggestions={["RHP Texas 2025", "SS Dallas", "OF 90+ mph"]}
  onChange={handleSearch}
/>

// Filters panel
<FilterPanel>
  <FilterGroup label="Position">
    <Checkbox label="Pitcher" count={1247} />
    <Checkbox label="Catcher" count={438} />
    <Checkbox label="Infield" count={892} />
    <Checkbox label="Outfield" count={743} />
  </FilterGroup>
  
  <FilterGroup label="Grad Year">
    <Checkbox label="2025" count={1456} />
    <Checkbox label="2026" count={1823} />
    <Checkbox label="2027" count={1641} />
  </FilterGroup>
  
  <FilterGroup label="Location">
    <Checkbox label="Texas" count={412} />
    <Checkbox label="California" count={387} />
    // ...
  </FilterGroup>
  
  <FilterGroup label="Stats" collapsible>
    <RangeSlider label="ERA" min={0} max={5} />
    <RangeSlider label="Velocity" min={75} max={100} />
    // ...
  </FilterGroup>
</FilterPanel>

// Results grid
<ResultsGrid>
  {players.map(player => (
    <PlayerCard
      key={player.id}
      player={player}
      onWatch={() => addToWatchlist(player)}
      onView={() => openProfile(player)}
    />
  ))}
</ResultsGrid>
```

##### Player Card Design:

```typescript
// Card structure
{
  avatar: "gradient-based",
  name: "Marcus Williams",
  school: "Dallas Christian",
  position: "RHP",
  gradYear: "2025",
  stats: {
    primary: { label: "ERA", value: "1.85" },
    secondary: { label: "Velocity", value: "92 mph" }
  },
  video: { count: 3, lastUpdated: "2 days ago" },
  actions: [
    { icon: Eye, label: "Watch", active: false },
    { icon: Video, label: "Videos", count: 3 },
    { icon: BarChart, label: "Stats" }
  ]
}

// Hover state:
// - Lift with shadow
// - Video thumbnail preview appears
// - Action buttons slide in from bottom
```

#### Animated Demo:

```typescript
// Simulated search flow
const searchDemo = async () => {
  // Type query
  await typeText("RHP Texas 2025", 50); // 50ms per char
  
  await delay(500);
  
  // Filters animate checked
  await checkFilter("Position", "Pitcher");
  await checkFilter("Grad Year", "2025");
  await checkFilter("Location", "Texas");
  
  await delay(800);
  
  // Results fade in with stagger
  await showResults(filteredPlayers);
  
  await delay(1500);
  
  // Highlight one card
  await highlightCard("marcus-williams");
  
  await delay(1000);
  
  // Click watch button
  await clickWatch("marcus-williams");
  
  // Success animation: card gets green checkmark
  await showSuccess();
};
```

#### Text Content:

```typescript
{
  headline: "Find Your Next Star",
  description: "Advanced search engine built for recruiting. Filter by position, location, grad year, and stats. Preview videos, save prospects, get notified on profile updates.",
  capabilities: [
    "Multi-criteria search with real-time results",
    "Advanced stat filtering (ERA, velocity, batting avg, etc.)",
    "Video preview without leaving search",
    "One-click add to watchlist",
    "Saved searches with auto-alerts",
    "Bulk export for recruiting events"
  ]
}
```

---

### 5C: Communication Timeline
**Layout:** Text left, screen right

#### Screen Content:
Player profile with activity timeline

##### Profile Header:

```typescript
{
  player: {
    name: "Tyler Martinez",
    avatar: "gradient-photo",
    position: "RHP",
    school: "Dallas Christian",
    gradYear: "2026",
    location: "Dallas, TX",
    stats: {
      era: "1.85",
      velocity: "92 mph",
      strikeouts: "94 K"
    },
    videos: 4,
    status: "High Priority"
  },
  quickActions: [
    { icon: Mail, label: "Email" },
    { icon: Phone, label: "Call" },
    { icon: Calendar, label: "Schedule" },
    { icon: MessageCircle, label: "Note" }
  ]
}
```

##### Activity Timeline:

```typescript
const activities = [
  {
    date: "Today, 2:30 PM",
    type: "email",
    icon: Mail,
    color: "blue",
    title: "Sent follow-up email",
    detail: "Re: Campus visit scheduling",
    content: "Hi Tyler, following up on our conversation about..."
  },
  {
    date: "Dec 15, 4:15 PM",
    type: "call",
    icon: Phone,
    color: "green",
    title: "Phone call - 12 minutes",
    detail: "Discussed program, academics, campus life",
    notes: "Very interested in engineering program. Parents want to visit in January."
  },
  {
    date: "Dec 10, 10:00 AM",
    type: "event",
    icon: Target,
    color: "purple",
    title: "Added to High Priority",
    detail: "Moved from Watchlist after showcase performance"
  },
  {
    date: "Dec 8, 1:45 PM",
    type: "video",
    icon: Video,
    color: "amber",
    title: "Watched highlight reel",
    detail: "Fall scrimmage footage - 3 min",
    thumbnail: "/video-thumb.jpg"
  },
  {
    date: "Dec 1, 9:30 AM",
    type: "note",
    icon: FileText,
    color: "slate",
    title: "Added recruiting note",
    detail: "Spotted at Perfect Game showcase",
    content: "Good arm action, clean delivery. Command needs work but has projection..."
  }
];

// Timeline visual:
// - Vertical line connecting activities
// - Activity circles on line (colored by type)
// - Cards hang off timeline with details
// - Most recent at top

// Animation:
// - Activities fade in with stagger (bottom to top)
// - Timeline line draws from top to bottom
// - Circle icons scale in
// - Cards slide in from right
```

#### Interaction:
- Click activity: expands with full details
- Click quick action: opens compose modal
- Hover timeline: shows time elapsed labels
- Click "Add Note": opens inline editor

#### Text Content:

```typescript
{
  headline: "Every Touch Point Tracked",
  description: "Complete interaction history for every prospect. Know exactly when you last made contact and what was discussed. Set follow-up reminders so no conversation goes cold.",
  features: [
    "Automatic logging of all interactions",
    "Email integration (sent and received)",
    "Call timer with note-taking",
    "Campus visit scheduling and tracking",
    "Video view history",
    "Custom notes and tags",
    "Follow-up reminder system",
    "Interaction analytics per prospect"
  ]
}
```

---

## 🎬 SECTION 6: WORKFLOW INTEGRATION - "How It All Flows"
**Height:** 300vh  
**Pinned Viewport:** 100vh

### Animated Workflow Diagram

Shows complete user journey from data input to insights:

#### Scroll Phase 1: Data Collection (0-20%)

```typescript
// Visual: Multiple input sources converge to center
{
  inputs: [
    { icon: Flag, label: "Round Entry", position: "top-left" },
    { icon: Calendar, label: "Schedule Update", position: "top-right" },
    { icon: Users, label: "Roster Changes", position: "bottom-left" },
    { icon: MessageCircle, label: "Recruit Contact", position: "bottom-right" }
  ]
}

// Animation:
// - Input icons fade in at corners
// - Data particles flow from inputs to center
// - Center hub glows brighter as data arrives
```

#### Scroll Phase 2: Processing (20-40%)

```typescript
// Visual: Central hub processes data
{
  hub: {
    icon: Brain,
    label: "CoachHelm AI",
    state: "processing"
  },
  processes: [
    "Pattern Detection",
    "Trend Analysis",
    "Position Calculation",
    "Alert Generation"
  ]
}

// Animation:
// - Hub rotates and pulses
// - Process labels orbit around hub
// - Neural connections light up sequentially
// - Progress indicators fill
```

#### Scroll Phase 3: Intelligence (40-60%)

```typescript
// Visual: Insights generate and categorize
{
  insights: [
    { type: "alert", icon: AlertTriangle, label: "Performance Alert", color: "amber" },
    { type: "trend", icon: TrendingUp, label: "Surge Detection", color: "green" },
    { type: "position", icon: Target, label: "Roster Position", color: "blue" },
    { type: "recommendation", icon: Lightbulb, label: "Practice Focus", color: "purple" }
  ]
}

// Animation:
// - Insight cards materialize around hub
// - Each type gets its own orbit radius
// - Cards glow in their signature color
// - Connection lines from hub to cards
```

#### Scroll Phase 4: Action (60-80%)

```typescript
// Visual: Insights delivered to multiple channels
{
  outputs: [
    { icon: Bell, label: "Push Notification", device: "mobile" },
    { icon: Mail, label: "Daily Digest", device: "email" },
    { icon: Layout, label: "Dashboard", device: "desktop" },
    { icon: Calendar, label: "Event Update", device: "calendar" }
  ]
}

// Animation:
// - Insight cards fly to output channels
// - Channels light up as they receive data
// - Device mockups show received insights
// - Checkmarks confirm delivery
```

#### Scroll Phase 5: Continuous Loop (80-100%)

```typescript
// Visual: Loop closes - actions become new inputs
{
  feedback: [
    "Coach Reviews Insight",
    "Adjusts Practice Plan",
    "Enters Next Round Data",
    "Cycle Repeats"
  ]
}

// Animation:
// - Output channels connect back to input sources
// - Circular flow path highlights
// - Entire diagram glows with completion
// - Fades out and resets
```

---

## 🎬 SECTION 7: DEVICE ECOSYSTEM - "Anywhere You Coach"
**Height:** 100vh  
**Layout:** 3D device showcase

### React Three Fiber Scene

```typescript
import { Canvas } from '@react-three/fiber';
import { Float, PresentationControls, Environment, Html } from '@react-three/drei';

<Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
  <ambientLight intensity={0.6} />
  <spotLight position={[10, 10, 10]} angle={0.3} intensity={1} />
  <spotLight position={[-10, -10, -10]} angle={0.3} intensity={0.5} />
  
  <PresentationControls
    global
    rotation={[0.13, 0.1, 0]}
    polar={[-0.4, 0.2]}
    azimuth={[-1, 0.75]}
    config={{ mass: 2, tension: 400 }}
  >
    {/* Desktop */}
    <Float speed={1} rotationIntensity={0.2} floatIntensity={0.3}>
      <MacBookPro position={[0, 0.5, 0]} rotation={[0, 0, 0]}>
        <Html
          transform
          position={[0, 0, 0.01]}
          distanceFactor={1.5}
          className="laptop-screen"
        >
          <DashboardPreview type="desktop" />
        </Html>
      </MacBookPro>
    </Float>
    
    {/* Tablet */}
    <Float speed={1.2} rotationIntensity={0.3} floatIntensity={0.4}>
      <iPadPro position={[-3, -1, 1]} rotation={[0, 0.4, 0]}>
        <Html transform position={[0, 0, 0.01]}>
          <DashboardPreview type="tablet" />
        </Html>
      </iPadPro>
    </Float>
    
    {/* Phone */}
    <Float speed={1.5} rotationIntensity={0.4} floatIntensity={0.5}>
      <iPhone position={[3, -0.5, 2]} rotation={[0, -0.3, 0]}>
        <Html transform position={[0, 0, 0.01]}>
          <DashboardPreview type="mobile" />
        </Html>
      </iPhone>
    </Float>
  </PresentationControls>
  
  <Environment preset="studio" />
</Canvas>
```

### Screen Content (Synchronized)

All three devices show the same data, adapted to screen size:

**Desktop View:**
- Full dashboard with sidebar navigation
- Multi-column layout
- Detailed graphs and tables
- All features visible

**Tablet View:**
- Collapsible sidebar
- Two-column layout
- Touch-optimized controls
- Simplified graphs

**Mobile View:**
- Bottom tab navigation
- Single column
- Swipe gestures
- Essential data only

**Animation:**
- Screens show synchronized scrolling
- Data updates ripple across devices
- User interactions on one device reflect on others
- Smooth 3D floating motion

### Text Overlay

```typescript
{
  headline: "Your Command Center, Everywhere",
  description: "Sideline tablet for live round entry. Desktop for deep analysis. Mobile for on-the-go updates. Always in sync, always up to date.",
  contexts: [
    {
      icon: Monitor,
      label: "Desktop",
      description: "Deep analysis and planning"
    },
    {
      icon: Tablet,
      label: "Tablet",
      description: "Sideline and tournament use"
    },
    {
      icon: Smartphone,
      label: "Mobile",
      description: "Quick updates anywhere"
    }
  ]
}
```

---

## 🎬 SECTION 8: DATA VISUALIZATION SHOWCASE - "Intelligence Made Visual"
**Height:** Auto  
**Layout:** Stacked demos

### 8A: Performance Trend Analysis

**Visual:** Interactive graph demonstration

```typescript
// Animated line chart showing player improvement
const trendData = {
  player: "Jake Thompson",
  metric: "Scoring Average",
  rounds: [
    { date: "Sep 1", score: 74.5, strokesGained: -0.8 },
    { date: "Sep 15", score: 73.2, strokesGained: -0.3 },
    { date: "Oct 1", score: 72.8, strokesGained: +0.1 },
    { date: "Oct 15", score: 71.4, strokesGained: +0.6 },
    { date: "Nov 1", score: 70.9, strokesGained: +1.2 }
  ]
};

// Chart features:
// - Line draws from left to right on scroll
// - Data points pop in sequentially
// - Hover point: tooltip with full stats
// - Shaded area shows improvement zone
// - Trend line in contrasting color
// - Annotations for key events ("Changed putting grip", "New driver", etc.)
```

**Interactive Elements:**
- Scrub timeline to see stats at any point
- Toggle between different metrics
- Compare multiple players (overlay lines)
- Show/hide trend line
- Export graph as image

### 8B: Strokes Gained Breakdown

**Visual:** Radial/spider chart

```typescript
const strokesGainedData = {
  categories: [
    { name: "Off Tee", value: 0.8, max: 2.0 },
    { name: "Approach", value: -0.3, max: 2.0 },
    { name: "Around Green", value: 0.5, max: 2.0 },
    { name: "Putting", value: -0.2, max: 2.0 }
  ],
  comparison: "D1 Average"
};

// Radial chart:
// - 4 axes radiating from center
// - Player's polygon in product accent color
// - Comparison average as dotted line
// - Filled area shows strengths
// - Gaps show opportunities
```

**Animation:**
- Polygon draws from center outward
- Each axis grows to its value
- Comparison line fades in after
- Color intensity based on value
- Pulsing on positive categories

### 8C: Recruiting Pipeline Funnel

**Visual:** Animated funnel with conversion rates

```typescript
const funnelData = {
  stages: [
    { name: "Total Watchlist", count: 142, percent: 100 },
    { name: "Contacted", count: 87, percent: 61 },
    { name: "High Priority", count: 34, percent: 24 },
    { name: "Offers Extended", count: 12, percent: 8 },
    { name: "Committed", count: 4, percent: 3 }
  ]
};

// Funnel visualization:
// - Stacked trapezoids, widest at top
// - Each stage different opacity
// - Conversion rate between stages
// - Prospect cards flow through funnel
// - Clickable stages for drill-down
```

**Animation:**
- Funnel builds from top down
- Numbers count up
- Conversion arrows animate
- Prospect avatars trickle down stages
- Hover stage: shows example prospects

---

## 🎬 SECTION 9: MOBILE EXPERIENCE - "Coaching in Motion"
**Height:** 100vh  
**Layout:** Large iPhone mockup center

### Phone Mockup Showcase

```typescript
// iPhone 15 Pro mockup
// Dynamic Island integration
// Actual device dimensions

<div className="device-mockup">
  {/* Device frame */}
  <div className="iphone-frame">
    {/* Dynamic Island */}
    <div className="dynamic-island">
      <motion.div
        animate={{ width: ["44px", "160px", "44px"] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        {/* Live Activity: Round in progress */}
        <span>Hole 7 • -2</span>
      </motion.div>
    </div>
    
    {/* Screen content */}
    <div className="screen-content">
      <MobileScreenDemo />
    </div>
  </div>
</div>
```

### Demo Screens (Auto-cycle every 5s)

**Screen 1: Quick Round Entry**
- Hole card with par, yardage
- Large shot entry buttons
- Voice-to-text note button
- GPS distance indicator
- Score relative to par

**Screen 2: AI Insights Feed**
- Card-based insight list
- Swipe to dismiss
- Tap to expand details
- Filter by insight type
- Search bar at top

**Screen 3: Player Quick View**
- Avatar and current position
- Mini scoring graph
- Last 3 rounds summary
- Quick message button
- Schedule next meeting

**Screen 4: Pipeline Card**
- Prospect card view
- Swipe between prospects
- Quick actions: call, email, schedule
- Last contact timestamp
- Add note inline

**Screen 5: Calendar Day View**
- Timeline with events
- Swipe between days
- Tap event for details
- Add event with FAB
- Weather integration

**Transition Animation:**
- Screen slides out left
- Next screen slides in right
- Smooth physics-based motion
- Slight scale effect (1 → 0.95 → 1)

### Text Content

```typescript
{
  headline: "Powerful on the Go",
  description: "Full platform capabilities in your pocket. Enter rounds courtside, check insights between holes, contact recruits from the road.",
  mobileFeatures: [
    "Quick round entry with autocomplete",
    "Voice notes and dictation",
    "Offline mode with sync",
    "GPS course distances",
    "Push notifications for alerts",
    "Native camera integration"
  ]
}
```

---

## 🎬 SECTION 10: TECHNICAL ARCHITECTURE - "Built to Scale"
**Height:** 100vh  
**Layout:** Animated tech stack diagram

### Stack Visualization

```typescript
// Layered architecture diagram that builds on scroll

const techStack = {
  layers: [
    {
      name: "Frontend",
      color: "blue",
      technologies: [
        { name: "React", icon: "⚛️" },
        { name: "TypeScript", icon: "📘" },
        { name: "Tailwind", icon: "💨" }
      ]
    },
    {
      name: "API Layer",
      color: "green",
      technologies: [
        { name: "GraphQL", icon: "◆" },
        { name: "REST", icon: "🔌" },
        { name: "WebSocket", icon: "📡" }
      ]
    },
    {
      name: "Intelligence",
      color: "purple",
      technologies: [
        { name: "ML Models", icon: "🧠" },
        { name: "Analytics", icon: "📊" },
        { name: "Predictions", icon: "🔮" }
      ]
    },
    {
      name: "Data Layer",
      color: "amber",
      technologies: [
        { name: "PostgreSQL", icon: "🐘" },
        { name: "Redis", icon: "⚡" },
        { name: "S3", icon: "☁️" }
      ]
    },
    {
      name: "Infrastructure",
      color: "red",
      technologies: [
        { name: "AWS", icon: "🔶" },
        { name: "CDN", icon: "🌐" },
        { name: "Monitoring", icon: "👁️" }
      ]
    }
  ]
};

// Animation:
// Each layer fades in from bottom to top
// Technologies within layer stagger in
// Connection lines draw between layers
// Data flow particles animate through stack
```

### Key Features Callout

```typescript
const features = [
  {
    icon: Lock,
    title: "Enterprise Security",
    description: "SOC 2 Type II compliant. End-to-end encryption. Role-based access control."
  },
  {
    icon: Zap,
    title: "Real-Time Sync",
    description: "WebSocket connections keep all devices updated instantly. No refresh needed."
  },
  {
    icon: Cloud,
    title: "99.9% Uptime",
    description: "Redundant infrastructure. Automatic failover. Always available when you need it."
  },
  {
    icon: Database,
    title: "Your Data, Your Control",
    description: "Export anytime. Delete anytime. Full data portability and ownership."
  }
];
```

**Layout:**
- Stack diagram on left (60% width)
- Feature callouts on right (40% width)
- Features slide in as stack builds
- Each feature has animated icon

---

## 🎬 SECTION 11: COMPARISON MATRIX - "Why Helm vs Spreadsheets"
**Height:** Auto  
**Layout:** Split comparison

### Interactive Comparison Table

```typescript
const comparisonRows = [
  {
    feature: "Shot Tracking",
    spreadsheet: "Manual entry, prone to errors",
    helm: "Guided entry with validation",
    advantage: "helm"
  },
  {
    feature: "Pattern Detection",
    spreadsheet: "Manual analysis required",
    helm: "Automatic AI detection",
    advantage: "helm"
  },
  {
    feature: "Qualifying Positions",
    spreadsheet: "Manual calculation",
    helm: "Real-time auto-calculation",
    advantage: "helm"
  },
  {
    feature: "Calendar Integration",
    spreadsheet: "No integration",
    helm: "Full sync with Google/iCal",
    advantage: "helm"
  },
  {
    feature: "Mobile Access",
    spreadsheet: "Poor mobile experience",
    helm: "Native mobile apps",
    advantage: "helm"
  },
  {
    feature: "Recruiting Pipeline",
    spreadsheet: "Static lists",
    helm: "Visual kanban workflow",
    advantage: "helm"
  },
  {
    feature: "Communication Tracking",
    spreadsheet: "Not possible",
    helm: "Complete timeline",
    advantage: "helm"
  },
  {
    feature: "Team Collaboration",
    spreadsheet: "Version conflicts",
    helm: "Real-time sync",
    advantage: "helm"
  }
];

// Table design:
// - Two columns: "Spreadsheets" vs "Helm"
// - Each row slides in on scroll
// - Helm advantages glow in product color
// - Checkmarks/X marks for yes/no features
// - Hover row: expands with more detail
```

**Visual Treatment:**
- Left column (Spreadsheets): muted colors, sad emojis
- Right column (Helm): vibrant colors, checkmarks
- Advantage indicator: arrow pointing to Helm
- Row hover: subtle lift + border glow

---

## 🎬 SECTION 12: FINAL EXPERIENCE - "See It in Action"
**Height:** 100vh  
**Layout:** Full-screen immersive demo

### Interactive Product Demo

Full-featured mini version of the actual platform:

**Demo Features:**

1. **Click to Explore**
   - Real UI, real interactions
   - Sample data populated
   - All animations working
   - Tooltips guide exploration

2. **Guided Tour Option**
   - Auto-plays feature highlights
   - Spotlight focuses on each area
   - Voiceover-style text explains
   - "Next" button advances tour

3. **Try It Yourself**
   - Enter a sample round
   - Add a recruit to pipeline
   - Schedule a practice
   - View generated insights

**Demo UI:**

```typescript
<div className="demo-container">
  {/* Top bar */}
  <div className="demo-header">
    <span>Interactive Demo</span>
    <div className="demo-controls">
      <button>Start Tour</button>
      <button>Explore Freely</button>
    </div>
  </div>
  
  {/* Embedded platform */}
  <div className="demo-frame">
    <PlatformDemo
      mode="interactive"
      sampleData={demoData}
      onComplete={() => showCTA()}
    />
  </div>
  
  {/* Feature highlights */}
  <AnimatePresence>
    {tourStep && (
      <TourTooltip
        position={tourStep.position}
        title={tourStep.title}
        description={tourStep.description}
        onNext={nextTourStep}
      />
    )}
  </AnimatePresence>
</div>
```

---

## 🎬 SECTION 13: FINAL CTA - "Start Building Today"
**Height:** 100vh  
**Layout:** Centered with dynamic background

### Background

```typescript
// WebGL neural network that responds to mouse
<Canvas>
  <NeuralNetworkVisualizer
    nodeCount={100}
    connectionThreshold={120}
    mouseInfluence={0.4}
    colors={{
      nodes: ['#10b981', '#f59e0b'],
      connections: 'rgba(255,255,255,0.1)'
    }}
  />
</Canvas>
```

### Content Structure

```typescript
<div className="cta-content">
  {/* Headline with gradient text */}
  <motion.h2
    initial={{ opacity: 0, y: 40 }}
    animate={{ opacity: 1, y: 0 }}
    className="text-6xl font-bold text-center mb-6"
  >
    Stop Managing.
    <br />
    <span className="gradient-text">Start Building.</span>
  </motion.h2>
  
  {/* Subheadline */}
  <p className="text-2xl text-white/60 text-center mb-16">
    The platform that grows with your program.
  </p>
  
  {/* Dual Product CTAs */}
  <div className="flex flex-col md:flex-row gap-8 justify-center mb-12">
    <ProductCTA
      product="golf"
      icon={<FlagIcon />}
      title="GolfHelm"
      description="AI-Powered Team Management"
      href="/golf/signup"
    />
    
    <ProductCTA
      product="baseball"
      icon={<TargetIcon />}
      title="BaseballHelm"
      description="Intelligent Recruiting CRM"
      href="/baseball/signup"
    />
  </div>
  
  {/* Trust signals - minimal */}
  <div className="flex justify-center gap-8 text-sm text-white/40">
    <span className="flex items-center gap-2">
      <Check className="w-4 h-4 text-green-500" />
      14-day free trial
    </span>
    <span className="flex items-center gap-2">
      <Check className="w-4 h-4 text-green-500" />
      No credit card required
    </span>
    <span className="flex items-center gap-2">
      <Check className="w-4 h-4 text-green-500" />
      Cancel anytime
    </span>
  </div>
</div>
```

### Product CTA Card Design

```typescript
function ProductCTA({ product, icon, title, description, href }) {
  const { ref, x, y } = useMagneticButton(0.35, 140);
  const springX = useSpring(x, { stiffness: 300, damping: 20 });
  const springY = useSpring(y, { stiffness: 300, damping: 20 });
  
  const isGolf = product === 'golf';
  
  return (
    <Link href={href}>
      <motion.div
        ref={ref}
        style={{ x: springX, y: springY }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        className={`
          relative group p-8 rounded-3xl cursor-pointer
          backdrop-blur-xl bg-white/[0.08] border border-white/[0.12]
          transition-all duration-500
          hover:bg-white/[0.12]
          ${isGolf 
            ? 'hover:border-green-500/50 hover:shadow-[0_0_60px_rgba(16,185,129,0.3)]'
            : 'hover:border-amber-500/50 hover:shadow-[0_0_60px_rgba(245,158,11,0.3)]'
          }
        `}
      >
        {/* Animated gradient background */}
        <motion.div
          className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: isGolf
              ? 'radial-gradient(circle at 50% 50%, rgba(16,185,129,0.15) 0%, transparent 70%)'
              : 'radial-gradient(circle at 50% 50%, rgba(245,158,11,0.15) 0%, transparent 70%)'
          }}
        />
        
        {/* Content */}
        <div className="relative z-10">
          {/* Icon */}
          <div className={`
            w-16 h-16 rounded-2xl mb-6
            flex items-center justify-center
            ${isGolf ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}
          `}>
            {icon}
          </div>
          
          {/* Text */}
          <h3 className="text-2xl font-bold text-white mb-2">{title}</h3>
          <p className="text-white/60 mb-6">{description}</p>
          
          {/* Arrow */}
          <div className={`
            flex items-center gap-2 font-medium
            ${isGolf ? 'text-green-400' : 'text-amber-400'}
          `}>
            Get Started
            <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
          </div>
        </div>
        
        {/* Glow animation */}
        <motion.div
          className="absolute inset-0 rounded-3xl"
          animate={{
            boxShadow: isGolf
              ? [
                  '0 0 20px rgba(16,185,129,0)',
                  '0 0 40px rgba(16,185,129,0.2)',
                  '0 0 20px rgba(16,185,129,0)'
                ]
              : [
                  '0 0 20px rgba(245,158,11,0)',
                  '0 0 40px rgba(245,158,11,0.2)',
                  '0 0 20px rgba(245,158,11,0)'
                ]
          }}
          transition={{ repeat: Infinity, duration: 3 }}
        />
      </motion.div>
    </Link>
  );
}
```

---

## 🎨 GLOBAL MICRO-INTERACTIONS

### Custom Cursor

```typescript
function PremiumCursor() {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPointer, setIsPointer] = useState(false);
  
  useEffect(() => {
    const moveCursor = (e: MouseEvent) => {
      setPosition({ x: e.clientX, y: e.clientY });
      
      const target = e.target as HTMLElement;
      setIsPointer(
        target.tagName === 'A' ||
        target.tagName === 'BUTTON' ||
        target.classList.contains('cursor-pointer')
      );
    };
    
    window.addEventListener('mousemove', moveCursor);
    return () => window.removeEventListener('mousemove', moveCursor);
  }, []);
  
  return (
    <>
      {/* Main cursor */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] mix-blend-difference"
        animate={{
          x: position.x - 8,
          y: position.y - 8,
          scale: isPointer ? 1.5 : 1
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      >
        <div className="w-4 h-4 rounded-full bg-white" />
      </motion.div>
      
      {/* Trailing effect */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9998]"
        animate={{
          x: position.x - 16,
          y: position.y - 16
        }}
        transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      >
        <div className="w-8 h-8 rounded-full border-2 border-white/40" />
      </motion.div>
    </>
  );
}
```

### Scroll Progress Bar

```typescript
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30
  });
  
  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 via-emerald-500 to-amber-500 origin-left z-50"
      style={{ scaleX }}
    />
  );
}
```

### Section Transition Effects

```typescript
// Smooth section transitions with fog effect
function SectionTransition() {
  return (
    <div className="relative h-32 -my-16">
      {/* Gradient fade */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-transparent" />
      
      {/* Particle drift */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: 0,
              opacity: 0
            }}
            animate={{
              y: 128,
              opacity: [0, 0.5, 0]
            }}
            transition={{
              duration: 3,
              delay: i * 0.1,
              repeat: Infinity
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

---

## 📊 PERFORMANCE BUDGET

### Critical Metrics:
- **LCP:** <1.2s (hero loads instantly)
- **FID:** <50ms (interactions immediate)
- **CLS:** <0.01 (zero layout shift)
- **TTI:** <2.5s (interactive quickly)

### Asset Budget:
- **Initial HTML:** <50KB
- **Critical CSS:** <30KB gzipped
- **Critical JS:** <150KB gzipped
- **Hero image:** <200KB (WebP)
- **Font files:** <100KB (variable fonts only)

### Animation Performance:
- Consistent 60fps on all animations
- GPU-accelerated transforms only
- Reduced motion respected globally
- Lazy load heavy 3D scenes

---

## ♿ ACCESSIBILITY CHECKLIST

- [ ] Keyboard navigation complete
- [ ] Focus indicators prominent
- [ ] Screen reader tested (NVDA, JAWS)
- [ ] ARIA labels on interactive elements
- [ ] Alt text on all images
- [ ] Color contrast WCAG AAA (7:1)
- [ ] prefers-reduced-motion implemented
- [ ] No seizure-inducing animations
- [ ] Text resizes without breaking layout
- [ ] Touch targets 44x44px minimum

---

## 🚀 BUILD PRIORITY

### Week 1: Foundation
- Project setup + design tokens
- WebGL background system
- Navigation + footer
- Glassmorphism component library

### Week 2: Hero + Core
- Hero with neural network
- Platform overview diagram
- Feature split section
- Scroll progress system

### Week 3: Feature Showcases
- Team management sections (4A-4D)
- Recruiting sections (5A-5C)
- Workflow integration
- All scroll animations

### Week 4: Advanced Elements
- 3D device ecosystem
- Data visualization showcases
- Mobile experience demo
- Tech architecture diagram

### Week 5: Polish
- Interactive demo
- Final CTA
- Micro-interactions
- Performance optimization
- Accessibility audit
- Cross-browser testing

---

## 🎯 SUCCESS CRITERIA

### Visual Impact:
- "Wow" moment within first 3 seconds
- Smooth 60fps animations throughout
- No janky transitions or layout shifts
- Feels premium and intentional

### User Experience:
- Intuitive navigation
- Clear product differentiation
- Engaging but not overwhelming
- Fast perceived performance

### Technical Excellence:
- Clean, maintainable code
- TypeScript strict mode
- Proper error boundaries
- Comprehensive testing

### Business Goals:
- Clear CTAs with high visibility
- Product value immediately apparent
- Multiple conversion paths
- Focus on functionality demonstration

---

## 💡 KEY PRINCIPLES

1. **Show, Don't Tell** - Every section demonstrates actual functionality
2. **Zero Social Proof** - No testimonials, no user counts, pure product
3. **Cinematic Experience** - Each scroll reveals something breathtaking
4. **Premium Glassmorphism** - Linear/Stripe-level polish throughout
5. **Performance First** - 60fps animations, <1.2s LCP, accessible
6. **Product Focus** - Team management + recruiting workflows center stage

---

This specification creates a **$10,000+ ultra-premium product showcase** that eliminates all social proof while maintaining cinematic quality. Every section demonstrates what the platform does and how it works through stunning visuals, smooth animations, and interactive demonstrations.

**The result:** A showcase that positions Helm as the Linear/Stripe/Vercel of sports technology through pure product excellence.

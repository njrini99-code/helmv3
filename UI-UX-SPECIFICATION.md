# Helm Admin Dashboard & CRM — UI/UX Specification

**Version:** 1.0  
**Date:** February 16, 2026  
**Author:** UI/UX Design Review  
**Benchmarks:** Linear, Stripe Dashboard, Vercel Dashboard, PostHog  

---

## Table of Contents

1. [Design System Foundation](#1-design-system-foundation)
2. [DELIVERABLE 1: Admin Dashboard](#2-deliverable-1-admin-dashboard)
3. [DELIVERABLE 2: CRM](#3-deliverable-2-crm)
4. [DELIVERABLE 3: Shared Patterns](#4-deliverable-3-shared-patterns)

---

## 1. Design System Foundation

### Design Tokens (Confirmed)

```
Primary:        #16A34A (Kelly green)
Background:     #FFFEF8 (warm cream)
Sidebar:        #1C1917 (warm-900)
Glass card:     bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass
Text heading:   text-warm-900  (DM Sans, font-semibold or font-bold)
Text body:      text-warm-600  (DM Sans, font-normal)
Text muted:     text-warm-400  (DM Sans, font-medium)
Icons:          lucide-react, 20px default, 16px compact, 24px large
Border radius:  rounded-2xl (cards), rounded-xl (buttons), rounded-[10px] (inputs, nav items)
Shadows:        shadow-glass (rest), shadow-card-hover (hover)
Font:           DM Sans (already loaded)
```

### Spacing Scale

```
Section gap:    space-y-6 (24px) — between major sections
Card gap:       gap-4 (16px) — between grid items on mobile
                gap-5 (20px) — between grid items on desktop (md:gap-5)
Card padding:   p-5 (20px) — standard card
                p-6 (24px) — large/featured cards (md:p-6)
                p-3 (12px) — compact sidebar stats
KPI inner:      px-4 py-3.5 — stat card internal padding
```

### Transition Standards

```
Color changes:   transition-colors duration-200
Layout shifts:   transition-all duration-300 ease-in-out
Hover lifts:     whileHover={{ y: -2 }} spring stiffness:400, damping:30
Scale effects:   whileHover={{ scale: 1.02 }}
Content fade:    opacity 0→1, y 12→0, duration 0.35s, ease [0.16, 1, 0.3, 1]
```

---

## 2. DELIVERABLE 1: Admin Dashboard

### 2.1 Tab Structure & Navigation

**Recommendation: Keep 4 tabs. Rename for clarity.**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| Command | Overview | "Command" sounds military. "Overview" is universally understood (Linear, Stripe, Vercel all use "Overview"). |
| Users | People | Warmer, more human. Covers users + teams + coaches. Linear uses "Members". |
| Health | System | "Health" is ambiguous — could be golf health. "System" is precise. |
| Analytics | Growth | More action-oriented. What admins actually care about is growth, not abstract "analytics". |

**Tab Bar Design:**

```
Sidebar nav items (dark theme, already correct):
- Active: bg-white/10 text-white, left accent bar w-[3px] h-5 bg-primary-500 rounded-r-full
- Inactive: text-warm-400 hover:bg-white/5 hover:text-white
- Icon: 20px, text-primary-400 when active, text-warm-400 when inactive
- Label: text-sm font-medium
- Shortcut badge: text-[10px] px-1.5 py-0.5 rounded font-mono
```

**Information Flow (what admin checks first):**
1. Open → Overview tab → KPI cards tell them "is everything okay?" in 2 seconds
2. See alerts → "19 never logged in" catches their eye immediately
3. Drill into People tab → see who's stuck, who's active
4. Check System tab → only when alerts indicate issues
5. Growth tab → weekly review, not daily

**Keyboard shortcuts:** Keep 1-4 mapping. Add `R` for refresh (already implemented).

---

### 2.2 Overview Tab (Currently "Command")

#### Layout Grid

```
┌─────────────────────────────────────────────────────────────────┐
│  [KPI] [KPI] [KPI] [KPI]                                       │  ← 4-col grid, NOT 6
│  Users  Rounds  AI Use  Health                                  │
├─────────────────────────────────────────────────────────────────┤
│  ⚠️ ALERT BANNER — "19 of 37 users never logged in"            │  ← Full-width, dismissible
├──────────────────────────────────┬──────────────────────────────┤
│  30-Day Trends                   │  Activity Feed               │
│  (Signups + Activity chart)      │  (Recent events, scrollable) │
│  colspan-2                       │  colspan-1                   │
├──────────────────────────────────┴──────────────────────────────┤
│  [Health] [User Mix] [Platform Usage]                           │  ← 3-col cards
│  Compact health    Role breakdown   Rounds/Shots/AI summary     │
└─────────────────────────────────────────────────────────────────┘
```

#### KPI Cards — Reduce from 6 to 4

**Problem with current:** 6 KPI cards is too many. "Growth Rate" and "Health Score" are duplicated below. The eye can't prioritize.

**Keep these 4:**

| # | Label | Value | Detail | Accent Color | Icon |
|---|-------|-------|--------|-------------|------|
| 1 | Total Users | `37` | `5 coaches · 31 players · 1 admin` | green | `Users` |
| 2 | Rounds (7d) | `12` | `3 today` | blue | `Target` |
| 3 | AI Activity | `107` | `4 reviews, 103 insights` | green | `Sparkles` |
| 4 | System Health | `42/100` | Status dot + label | conditional (green/amber/red) | `Activity` |

**Grid classes:**
```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
```

**Individual KPI card spec:**
```tsx
// Container
className={cn(
  'relative overflow-hidden',
  'bg-white/70 backdrop-blur-xl',
  'border border-white/20 rounded-2xl',
  'shadow-glass hover:shadow-card-hover',
  'p-4 lg:p-5',
  'transition-shadow duration-200',
  'group cursor-default'
)}

// Icon container (top-right)
<div className="w-10 h-10 rounded-xl flex items-center justify-center bg-{accent}-50">
  <Icon size={20} className="text-{accent}-600" />
</div>

// Label
<p className="text-xs font-medium text-warm-500 uppercase tracking-wider mb-1">{label}</p>

// Value
<p className="text-3xl font-bold text-warm-900 tabular-nums tracking-tight">{value}</p>

// Trend (if present)
<span className={cn(
  'inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full mt-1',
  positive ? 'text-primary-700 bg-primary-50' : 'text-red-600 bg-red-50'
)}>
  <TrendingUp size={12} /> // or TrendingDown
  {Math.abs(trend)}%
</span>

// Detail
<p className="text-xs text-warm-400 mt-1">{detail}</p>
```

#### Alert Banner Design

**Position:** Directly below KPI row, full-width. Sticky within content scroll.

**Spec:**
```tsx
// Critical alert (red)
<div className={cn(
  'flex items-center gap-3 px-4 py-3 rounded-2xl',
  'bg-red-50/80 border border-red-200/50',
  'backdrop-blur-sm'
)}>
  <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
    <AlertTriangle size={16} className="text-red-600" />
  </div>
  <div className="flex-1 min-w-0">
    <p className="text-sm font-semibold text-red-900">{title}</p>
    <p className="text-xs text-red-600 mt-0.5">{description}</p>
  </div>
  <button className="text-xs font-medium text-red-600 hover:text-red-800 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0">
    View
  </button>
  <button className="p-1 text-red-400 hover:text-red-600 transition-colors flex-shrink-0">
    <X size={16} />
  </button>
</div>

// Warning alert (amber)
// Same structure, swap: red-50→amber-50, red-200→amber-200, red-600→amber-600, etc.

// Info alert (blue)
// Same structure, swap to blue-* palette
```

**Alert hierarchy (current data):**
1. 🔴 CRITICAL: "51% of users never logged in — onboarding is broken" 
2. 🟡 WARNING: "15 stale rounds from Feb 14 — data quality issue"
3. 🔵 INFO: "CRM has 354 coaches but 0 pipeline movement"

**Interaction:**
- Dismissible with X button (stores dismissed state in localStorage per alert ID)
- "View" button navigates to relevant tab/section
- Alerts stack vertically with `space-y-2`
- Maximum 3 visible at once; "Show N more" link if overflow

#### 30-Day Trends Chart Section

**Layout:** 2/3 width left, 1/3 width right activity feed.

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
  {/* Charts — spans 2 cols */}
  <div className="lg:col-span-2">
    <SectionHeader title="30-Day Trends" />
    <DailyCharts ... />
  </div>
  
  {/* Activity Feed — spans 1 col */}
  <div>
    <SectionHeader title="Recent Activity" />
    <ActivityFeed ... />
  </div>
</div>
```

**Chart card container:**
```tsx
className={cn(
  'bg-white/70 backdrop-blur-xl',
  'border border-white/20 rounded-2xl',
  'shadow-glass',
  'p-5 md:p-6'
)}
```

**Chart style:** Use Recharts with these colors:
- Signup line: `#16A34A` (primary)
- Activity line: `#2563EB` (blue-600)
- Grid lines: `stroke: #F5F3EE` (warm-100)
- Axis labels: `fill: #A8A29E` (warm-400), font-size 11px, DM Sans
- Tooltip: `bg-warm-900 text-white rounded-lg px-3 py-2 shadow-xl text-xs`

#### Bottom Row — 3 Summary Cards

```tsx
<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
  <PlatformHealthCard />   {/* Health score ring + diagnostics list */}
  <UserBreakdownCard />    {/* Role distribution donut or bar */}
  <UsageMetricsCard />     {/* Rounds, shots, AI usage summary */}
</div>
```

---

### 2.3 People Tab (Currently "Users")

This is the most important tab. The current implementation is dense but functional. Here's how to improve it.

#### Layout Grid

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ INSIGHT CALLOUT — contextual alert for this tab            │
├─────────────────────────────────────────────────────────────────┤
│  [KPI] [KPI] [KPI] [KPI]                                       │
│  Users  Teams  Coach%  Player%                                  │
├─────────────────────────────────────────────────────────────────┤
│  Coach Intelligence                                             │  ← Full-width card
│  (Coach activity, engagement, last-seen — TABLE format)         │
├─────────────────────────────────────────────────────────────────┤
│  Player Funnel                                                  │  ← Full-width funnel
│  (Signed up → Logged in → Created round → Completed round)     │
├──────────────────────────────────┬──────────────────────────────┤
│  Data Freshness Alerts           │  Team Rosters                │
│  (Churn risk, inactive teams)    │  (Accordion by team)         │
├──────────────────────────────────┴──────────────────────────────┤
│  User Directory                                                 │  ← Full-width table
│  (Searchable, sortable, all 37 users)                           │
└─────────────────────────────────────────────────────────────────┘
```

#### KPI Cards — Keep current 4, they're good.

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
  {/* Total Users | Active Teams | Coach Onboarding % | Player Onboarding % */}
</div>
```

#### User Directory — TABLE format, not cards

**Rationale:** With 37 users (scaling to 500+), a table is the right pattern. Cards waste vertical space. Linear uses tables for member lists. Stripe uses tables for customer lists.

**Table design:**
```tsx
// Table container
<div className={cn(
  'bg-white/70 backdrop-blur-xl',
  'border border-white/20 rounded-2xl',
  'shadow-glass overflow-hidden'
)}>

// Table header row
<tr className="border-b border-warm-100">
  <th className="px-4 py-3 text-left text-[11px] font-semibold text-warm-500 uppercase tracking-wider">
    User
  </th>
  ...
</tr>

// Table body row
<tr className={cn(
  'border-b border-warm-50 transition-colors duration-150',
  'hover:bg-warm-50/50 cursor-pointer'
)}>
  <td className="px-4 py-3">
    <div className="flex items-center gap-3">
      {/* Avatar with status dot */}
      <div className="relative">
        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
          <span className="text-xs font-bold text-primary-600">
            {initials}
          </span>
        </div>
        {/* Status dot */}
        <div className={cn(
          'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white',
          isOnline ? 'bg-primary-500' :
          isRecent ? 'bg-amber-500' :
          'bg-warm-300'
        )} />
      </div>
      <div>
        <p className="text-sm font-medium text-warm-900">{name}</p>
        <p className="text-xs text-warm-400">{email}</p>
      </div>
    </div>
  </td>
</tr>
```

**Table columns:**
| Column | Width | Content |
|--------|-------|---------|
| User | 30% | Avatar + name + email |
| Role | 10% | Badge: `Coach` / `Player` / `Admin` |
| Team | 20% | Team name or "—" |
| Last Active | 15% | Relative time ("2h ago", "3d ago", "Never") |
| Status | 10% | Color-coded dot + label |
| Rounds | 15% | Count with sparkline |

**Activity status indicators:**
```tsx
// Online (active within 1h)
<span className="flex items-center gap-1.5">
  <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
  <span className="text-xs font-medium text-primary-600">Online</span>
</span>

// Recent (active within 7d)
<span className="flex items-center gap-1.5">
  <span className="w-2 h-2 rounded-full bg-amber-500" />
  <span className="text-xs font-medium text-amber-600">3d ago</span>
</span>

// Inactive (8-30d)
<span className="flex items-center gap-1.5">
  <span className="w-2 h-2 rounded-full bg-warm-300" />
  <span className="text-xs font-medium text-warm-400">2w ago</span>
</span>

// Never logged in
<span className="flex items-center gap-1.5">
  <span className="w-2 h-2 rounded-full bg-red-400" />
  <span className="text-xs font-medium text-red-500">Never</span>
</span>
```

#### Filter Bar Design

**Position:** Inside the table container, above the header row. Sticky within the card.

```tsx
<div className="flex items-center gap-2 px-4 py-3 border-b border-warm-100 bg-warm-50/30">
  {/* Search */}
  <div className="relative flex-1 max-w-xs">
    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
    <input
      placeholder="Search users..."
      className={cn(
        'w-full pl-9 pr-3 py-2 rounded-[10px] text-sm',
        'bg-white/80 border border-warm-200/50',
        'text-warm-900 placeholder:text-warm-400',
        'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300',
        'transition-all duration-200'
      )}
    />
  </div>
  
  {/* Role filter pills */}
  <div className="flex items-center gap-1">
    {['All', 'Coaches', 'Players', 'Admin'].map(role => (
      <button className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-200',
        isActive
          ? 'bg-warm-900 text-white'
          : 'bg-white/60 text-warm-600 hover:bg-warm-100 border border-warm-200/50'
      )}>
        {role}
      </button>
    ))}
  </div>

  {/* Activity filter dropdown */}
  <select className={cn(
    'px-3 py-2 rounded-[10px] text-xs font-medium',
    'bg-white/80 border border-warm-200/50 text-warm-600',
    'focus:outline-none focus:ring-2 focus:ring-primary-500/20'
  )}>
    <option>All Activity</option>
    <option>Active (7d)</option>
    <option>Inactive (30d+)</option>
    <option>Never Logged In</option>
  </select>
</div>
```

#### Team Grouping — Accordion Pattern

**Pattern:** Collapsible sections with team header, expandable to show member table.

```tsx
// Team section header (clickable to expand/collapse)
<button className={cn(
  'w-full flex items-center gap-3 px-4 py-3 rounded-xl',
  'bg-warm-50/50 hover:bg-warm-50',
  'transition-colors duration-200',
  'text-left'
)}>
  <ChevronRight size={16} className={cn(
    'text-warm-400 transition-transform duration-200',
    isExpanded && 'rotate-90'
  )} />
  <span className="text-sm font-semibold text-warm-900">{teamName}</span>
  <span className="text-xs text-warm-400 font-medium">{memberCount} members</span>
  {/* Activity indicator */}
  <span className={cn(
    'ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold',
    hasActiveMembers ? 'bg-primary-50 text-primary-700' : 'bg-warm-100 text-warm-500'
  )}>
    {activeCount} active
  </span>
</button>
```

**"No Team" section:** Show with a subtle warning style:
```tsx
<div className="border-l-2 border-l-amber-400 pl-3">
  <span className="text-sm font-semibold text-warm-700">⚠ No Team Assigned</span>
  <span className="text-xs text-amber-600 ml-2">{count} users</span>
</div>
```

#### Alert Banners within People Tab

**Current:** "19 never logged in" banner. Keep this but improve the design.

```tsx
// Insight callout — warm amber, action-oriented
<div className={cn(
  'flex items-start gap-3 p-4 rounded-2xl',
  'bg-amber-50/80 border border-amber-200/40',
  'backdrop-blur-sm'
)}>
  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
    <AlertTriangle size={18} className="text-amber-600" />
  </div>
  <div className="flex-1">
    <p className="text-sm font-semibold text-amber-900">19 of 37 users have never logged in</p>
    <p className="text-xs text-amber-700 mt-1">
      This 51% never-login rate suggests onboarding needs attention. 
      Consider sending personalized invite emails or simplifying the signup flow.
    </p>
    <div className="flex items-center gap-2 mt-3">
      <button className="px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors">
        View Inactive Users
      </button>
      <button className="px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 rounded-lg transition-colors">
        Dismiss
      </button>
    </div>
  </div>
</div>
```

---

### 2.4 System Tab (Currently "Health")

#### Layout Grid

```
┌─────────────────────────────────────────────────────────────────┐
│  [KPI] [KPI] [KPI] [KPI]                                       │
│  Errors(7d)  Critical  Failed-Login  Locked-Accts               │
├──────────────────────────────────┬──────────────────────────────┤
│  Health Diagnostics              │  Error Timeline              │
│  (Grid of status cards)          │  (Chronological error feed)  │
├──────────────────────────────────┴──────────────────────────────┤
│  CoachHelm AI Health                                            │
│  (AI system performance metrics)                                │
├─────────────────────────────────────────────────────────────────┤
│  Infrastructure                                                 │
│  (API perf, client errors, DB health)                           │
└─────────────────────────────────────────────────────────────────┘
```

#### Data Quality Score — Ring Visualization

**Use a donut/ring chart, not a progress bar.** The ring is more visually striking and immediately communicates percentage.

```tsx
// Ring visualization
<div className="relative w-24 h-24">
  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
    {/* Background ring */}
    <circle
      cx="50" cy="50" r="42"
      fill="none"
      stroke="currentColor"
      strokeWidth="8"
      className="text-warm-100"
    />
    {/* Score ring */}
    <circle
      cx="50" cy="50" r="42"
      fill="none"
      stroke="currentColor"
      strokeWidth="8"
      strokeDasharray={`${score * 2.64} 264`}
      strokeLinecap="round"
      className={cn(
        score >= 80 ? 'text-primary-500' :
        score >= 50 ? 'text-amber-500' :
        'text-red-500'
      )}
    />
  </svg>
  {/* Center text */}
  <div className="absolute inset-0 flex flex-col items-center justify-center">
    <span className="text-2xl font-bold text-warm-900 tabular-nums">{score}</span>
    <span className="text-[10px] text-warm-400 font-medium uppercase tracking-wider">/100</span>
  </div>
</div>
```

#### Error Timeline — Chronological List

**Use a timeline pattern, not a flat list.** Each error gets a left-border timeline dot.

```tsx
<div className="space-y-0">
  {errors.map((error, i) => (
    <div key={i} className="relative pl-6 pb-4 last:pb-0">
      {/* Timeline line */}
      {i < errors.length - 1 && (
        <div className="absolute left-[9px] top-5 bottom-0 w-px bg-warm-200" />
      )}
      {/* Timeline dot */}
      <div className={cn(
        'absolute left-0 top-1.5 w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center',
        error.severity === 'critical' ? 'bg-red-500' :
        error.severity === 'warning' ? 'bg-amber-500' :
        'bg-warm-300'
      )}>
        <div className="w-1.5 h-1.5 rounded-full bg-white" />
      </div>
      {/* Content */}
      <div className="ml-2">
        <p className="text-sm font-medium text-warm-900 leading-tight">{error.message}</p>
        <p className="text-xs text-warm-400 mt-1">{relativeTime(error.created_at)}</p>
      </div>
    </div>
  ))}
</div>
```

#### Feature Adoption — Grid of Cards

**Use a card grid, not a heatmap.** A heatmap is overkill for the current data size. Cards with adoption percentage bars are more actionable.

```tsx
<div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
  {features.map(feature => (
    <div className={cn(
      'p-4 rounded-xl',
      'bg-white/50 border border-white/30',
      'hover:bg-white/60 transition-colors'
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-warm-900">{feature.name}</span>
        <span className={cn(
          'text-xs font-bold tabular-nums',
          feature.adoption > 50 ? 'text-primary-600' :
          feature.adoption > 20 ? 'text-amber-600' :
          'text-red-600'
        )}>{feature.adoption}%</span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-warm-100 overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            feature.adoption > 50 ? 'bg-primary-500' :
            feature.adoption > 20 ? 'bg-amber-500' :
            'bg-red-400'
          )}
          style={{ width: `${feature.adoption}%` }}
        />
      </div>
      <p className="text-[11px] text-warm-400 mt-1.5">{feature.users} of {feature.totalUsers} users</p>
    </div>
  ))}
</div>
```

---

### 2.5 Growth Tab (Currently "Analytics")

#### Layout Grid

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ INSIGHT CALLOUT                                            │
├─────────────────────────────────────────────────────────────────┤
│  [KPI] [KPI] [KPI] [KPI]                                       │  ← 4 cols, NOT 6
│  Health  Power-Users  WAU%  Stickiness                          │
├──────────────────────────────────┬──────────────────────────────┤
│  Growth Metrics                  │  Engagement                  │
│  (Growth card)                   │  (Engagement card)           │
├──────────────────────────────────┴──────────────────────────────┤
│  Cohort Retention Matrix                                        │
├─────────────────────────────────────────────────────────────────┤
│  Session Analytics                                              │
├─────────────────────────────────────────────────────────────────┤
│  Golf Performance (6-col stat grid)                             │
├──────────────────────────────────┬──────────────┬──────────────┤
│  Scoring Intelligence            │  Team Intel   │  Usage       │
├──────────────────────────────────┴──────────────┴──────────────┤
│  Comparative Benchmarks                                         │
├──────────────────────────────────┬──────────────────────────────┤
│  Strokes Gained (if data)        │  Communication               │
└──────────────────────────────────┴──────────────────────────────┘
```

**Change from 6 KPI cards to 4.** The current 6-card row is too cramped. Remove "Churned (30d)" (move to People tab) and "AI Adoption" (move to a card below).

#### Funnel Visualization — Horizontal Bars

**Use horizontal bars with percentage labels, not vertical steps.** Horizontal bars scale better and are easier to read.

```tsx
// Funnel container
<div className="space-y-3">
  {funnelSteps.map((step, i) => {
    const widthPercent = (step.count / funnelSteps[0].count) * 100;
    return (
      <div key={step.label} className="flex items-center gap-4">
        {/* Label */}
        <div className="w-36 text-right flex-shrink-0">
          <p className="text-sm font-medium text-warm-700">{step.label}</p>
        </div>
        {/* Bar */}
        <div className="flex-1 relative">
          <div className="h-8 rounded-lg bg-warm-50 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-lg transition-all duration-700',
                'bg-gradient-to-r from-primary-500 to-primary-400',
                i > 0 && widthPercent < 50 && 'from-amber-500 to-amber-400',
                i > 0 && widthPercent < 25 && 'from-red-500 to-red-400',
              )}
              style={{ width: `${widthPercent}%` }}
            />
          </div>
        </div>
        {/* Count + percent */}
        <div className="w-20 text-right flex-shrink-0">
          <span className="text-sm font-bold text-warm-900 tabular-nums">{step.count}</span>
          <span className="text-xs text-warm-400 ml-1">({widthPercent.toFixed(0)}%)</span>
        </div>
      </div>
    );
  })}
</div>
```

#### Cohort Retention — Heatmap Matrix Table

**Keep the matrix table pattern.** This is the standard for retention data (PostHog, Mixpanel, Amplitude all use it).

```tsx
// Cell color based on retention percentage
className={cn(
  'px-3 py-2 text-center text-xs font-medium tabular-nums',
  pct >= 80 ? 'bg-primary-500 text-white' :
  pct >= 60 ? 'bg-primary-400 text-white' :
  pct >= 40 ? 'bg-primary-300 text-primary-900' :
  pct >= 20 ? 'bg-primary-200 text-primary-800' :
  pct > 0 ? 'bg-primary-100 text-primary-700' :
  'bg-warm-50 text-warm-400'
)}
```

**Above the fold:** KPI row + Insight callout + Growth/Engagement cards. Everything else is below the fold and accessed by scrolling.

---

## 3. DELIVERABLE 2: CRM

### 3.1 Tab Structure

**Recommendation: Replace Calendar with Dashboard. 3 tabs total.**

| Current | Proposed | Rationale |
|---------|----------|-----------|
| List | Coaches | More descriptive. Linear calls it by entity name. |
| Pipeline | Pipeline | Keep as-is. Clear. |
| Calendar | Dashboard | Calendar has 0 events and 0 Google tokens. Replace with a CRM overview that shows pipeline stats, follow-up reminders, and activity metrics. |

**New Dashboard tab content:**
- Pipeline funnel bar chart (new_lead → researching → outreach → engaged → demo → proposal → closed)
- Today's priorities: follow-ups due, hot leads, recently starred
- Activity log: recent status changes, contact logs (empty now but future-proof)
- Division breakdown: D2 vs D3 stats

---

### 3.2 Pipeline (Kanban) View

#### Column Groupings — 7 Stages from 15 Statuses

The current PIPELINE_STAGES grouping is already correct:

| Stage | Statuses | Color |
|-------|----------|-------|
| New Leads | `new_lead` | warm/gray |
| Researching | `researching` | blue |
| Outreach | `outreach_pending`, `initial_contact` | amber |
| In Conversation | `follow_up`, `engaged` | violet |
| Demo | `demo_scheduled`, `demo_completed` | cyan |
| Proposal | `proposal_sent`, `negotiating` | orange |
| Closed | `closed_won`, `closed_lost`, `not_interested`, `bad_timing`, `nurture` | green/mixed |

**Problem:** With 354 coaches ALL in `new_lead`, the kanban is useless right now. It's one column with 354 cards and 6 empty columns.

**Solution: Show a "Getting Started" state when all leads are in one stage:**
```tsx
{stats.byStatus.new_lead === stats.total && (
  <div className={cn(
    'p-6 rounded-2xl text-center',
    'bg-white/70 backdrop-blur-xl border border-white/20 shadow-glass'
  )}>
    <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center mx-auto mb-4">
      <Rocket size={28} className="text-primary-600" />
    </div>
    <h3 className="text-lg font-bold text-warm-900 mb-2">Ready to start your pipeline</h3>
    <p className="text-sm text-warm-500 max-w-md mx-auto mb-4">
      All 354 coaches are new leads. Start by researching your top prospects
      and moving them through the pipeline.
    </p>
    <div className="flex items-center justify-center gap-3">
      <button className="px-4 py-2 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-colors text-sm">
        Research Top 10
      </button>
      <button className="px-4 py-2 bg-white border border-warm-200 text-warm-700 rounded-xl font-medium hover:bg-warm-50 transition-colors text-sm">
        View All Coaches
      </button>
    </div>
  </div>
)}
```

#### Kanban Card Design

**Card in each column (compact):**
```tsx
<div className={cn(
  'p-3 rounded-xl bg-white border border-warm-200/60',
  'hover:shadow-md hover:border-warm-300 transition-all duration-200',
  'cursor-grab active:cursor-grabbing',
  'group'
)}>
  {/* Top: Name + Star */}
  <div className="flex items-start justify-between gap-2 mb-1.5">
    <p className="text-sm font-semibold text-warm-900 leading-tight line-clamp-1">{coach.name}</p>
    {coach.is_starred && <Star size={14} className="text-amber-500 fill-amber-500 flex-shrink-0" />}
  </div>
  
  {/* School */}
  <p className="text-xs text-warm-500 line-clamp-1 mb-2">{coach.school}</p>
  
  {/* Bottom: Division badge + Priority */}
  <div className="flex items-center justify-between">
    <span className={cn(
      'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
      coach.division === 'D2' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
    )}>
      {coach.division}
    </span>
    {coach.priority > 0 && (
      <span className={cn(
        'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
        coach.priority >= 2 ? 'bg-orange-50 text-orange-600' : 'bg-amber-50 text-amber-600'
      )}>
        {coach.priority >= 2 ? '🔥 Hot' : '⚡ High'}
      </span>
    )}
  </div>
</div>
```

**Card dimensions:** Min-width 240px, max-width within column. Cards should show 3-4 visible in each column before scrolling.

#### Drag and Drop Behavior

```
Grabbing:     cursor-grab → cursor-grabbing
Dragging:     opacity-80, scale(1.02), shadow-xl, rotate(1deg)
Drop zone:    2px dashed border-primary-400, bg-primary-50/30, rounded-xl
Drop target:  border-primary-500 bg-primary-50/50 (solid, not dashed)
Cancelled:    spring animation back to origin, 300ms
```

#### Column Header Design

```tsx
<div className="flex items-center justify-between mb-3 px-1">
  <div className="flex items-center gap-2">
    <span className="text-sm">{stage.emoji}</span>
    <h3 className="text-sm font-semibold text-warm-900">{stage.label}</h3>
    <span className={cn(
      'min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center',
      'text-[11px] font-bold tabular-nums',
      count > 0 ? `bg-gradient-to-r ${stage.gradient} text-white` : 'bg-warm-100 text-warm-400'
    )}>
      {count}
    </span>
  </div>
  {/* Collapse toggle */}
  <button className="p-1 rounded-md hover:bg-warm-100 text-warm-400 transition-colors opacity-0 group-hover:opacity-100">
    <ChevronDown size={14} />
  </button>
</div>
```

#### Empty Column Message

```tsx
<div className="flex flex-col items-center justify-center py-8 px-4 text-center">
  <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mb-2">
    <span className="text-lg">{stage.emoji}</span>
  </div>
  <p className="text-xs text-warm-400 font-medium">No coaches here yet</p>
  <p className="text-[11px] text-warm-300 mt-0.5">Drag coaches here or update their status</p>
</div>
```

---

### 3.3 Coach List View

#### TABLE format, not card grid

**Rationale:** 354 coaches. A card grid at this scale wastes space and makes scanning impossible. Tables are the correct pattern for large datasets. Linear, Stripe, and PostHog all use tables for entity lists.

#### Table Columns

| Column | Width | Sortable | Content |
|--------|-------|----------|---------|
| ☐ | 40px | No | Checkbox for bulk select |
| ★ | 40px | Yes | Star toggle |
| Coach | 25% | Yes | Name + title (subtitle) |
| School | 20% | Yes | School name |
| Division | 8% | Yes | `D2` or `D3` badge |
| Conference | 15% | Yes | Conference name |
| Status | 12% | Yes | Status badge (colored) |
| Priority | 8% | Yes | Priority icon/badge |
| Last Contact | 12% | Yes | Date or "Never" |

**Row hover state:**
```tsx
className={cn(
  'border-b border-warm-50 transition-all duration-150',
  'hover:bg-primary-50/30',
  isSelected && 'bg-primary-50/50 border-primary-100'
)}
```

**Selected state (checkbox active):**
```tsx
className="bg-primary-50/50 border-l-2 border-l-primary-500"
```

**Bulk selection checkbox:**
```tsx
// Header checkbox (select all)
<input
  type="checkbox"
  className={cn(
    'w-4 h-4 rounded-md border-warm-300',
    'text-primary-600 focus:ring-primary-500/20',
    'cursor-pointer transition-colors'
  )}
  checked={allSelected}
  indeterminate={someSelected}
  onChange={toggleAll}
/>
```

#### Filter Bar Design — Pill Toggles + Dropdowns

```tsx
<div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-warm-100">
  {/* Search */}
  <div className="relative flex-1 min-w-[200px] max-w-sm">
    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400" />
    <input
      placeholder="Search coaches, schools, conferences..."
      className={cn(
        'w-full pl-9 pr-3 py-2 rounded-[10px] text-sm',
        'bg-white/80 border border-warm-200/50',
        'text-warm-900 placeholder:text-warm-400',
        'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-300'
      )}
    />
  </div>
  
  {/* Division pill toggle */}
  <div className="flex items-center gap-1 bg-warm-100/50 rounded-lg p-0.5">
    {['All', 'D2', 'D3'].map(div => (
      <button className={cn(
        'px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200',
        isActive
          ? 'bg-white text-warm-900 shadow-sm'
          : 'text-warm-500 hover:text-warm-700'
      )}>
        {div}
        {div !== 'All' && <span className="ml-1 text-warm-400">{count}</span>}
      </button>
    ))}
  </div>

  {/* Conference dropdown */}
  <select className={cn(
    'px-3 py-2 rounded-[10px] text-xs font-medium',
    'bg-white/80 border border-warm-200/50 text-warm-600',
    'focus:outline-none focus:ring-2 focus:ring-primary-500/20'
  )}>
    <option>All Conferences ({count})</option>
    {conferences.map(c => <option key={c}>{c}</option>)}
  </select>
  
  {/* Status dropdown */}
  <select className="...same pattern...">
    <option>All Statuses</option>
    ...
  </select>

  {/* Quick filter pills */}
  <div className="flex items-center gap-1.5">
    <button className={cn(
      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
      'border transition-colors',
      isActive 
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-white/60 border-warm-200/50 text-warm-500 hover:bg-warm-50'
    )}>
      <Clock size={12} /> Follow-ups Due
      {count > 0 && <span className="text-[10px] font-bold">{count}</span>}
    </button>
    <button className="...same...">
      <Star size={12} /> Starred
    </button>
  </div>
</div>
```

#### Inline Actions vs Action Menu

**Use action menu (three-dot), not inline actions.** Inline actions create visual clutter in a 354-row table.

```tsx
// Row action menu trigger (appears on hover)
<button className={cn(
  'p-1.5 rounded-lg text-warm-400 hover:text-warm-600 hover:bg-warm-100',
  'opacity-0 group-hover:opacity-100 transition-all duration-200'
)}>
  <MoreHorizontal size={16} />
</button>

// Dropdown menu
<div className={cn(
  'absolute right-0 top-full mt-1 z-50',
  'w-48 py-1 rounded-xl',
  'bg-white border border-warm-200/80 shadow-xl',
  'animate-fade-up'
)}>
  <button className="w-full px-3 py-2 text-left text-sm text-warm-700 hover:bg-warm-50 flex items-center gap-2">
    <MessageSquare size={14} /> Log Contact
  </button>
  <button className="...">
    <ArrowRight size={14} /> Move to Researching
  </button>
  <button className="...">
    <Star size={14} /> Star
  </button>
  <div className="h-px bg-warm-100 my-1" />
  <button className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
    <Trash2 size={14} /> Delete
  </button>
</div>
```

#### Detail Panel — Slide-in from Right

**Use a slide-over panel, not a modal or replace.** This is the Linear/Stripe pattern. User can still see the list behind the panel.

```tsx
// Panel overlay
<div className="fixed inset-0 z-40" onClick={onClose}>
  <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" />
</div>

// Panel
<aside className={cn(
  'fixed right-0 top-0 bottom-0 z-50',
  'w-full max-w-lg',
  'bg-[#FFFEF8] border-l border-warm-200/60',
  'shadow-2xl',
  'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
  isOpen ? 'translate-x-0' : 'translate-x-full',
  'flex flex-col'
)}>
```

---

### 3.4 Coach Detail Panel

#### Layout — Single Column, Scrollable

The panel is 480px max-width. Single column is correct.

```
┌──────────────────────────────────┐
│  ← Close    Coach Name      ★ ⋯ │  ← Sticky header
├──────────────────────────────────┤
│  Title · School                  │
│  Division badge · Conference     │
│  Status selector (dropdown)      │
│  Priority selector               │
├──────────────────────────────────┤
│  📧 Email     📞 Phone          │  ← Contact info grid
│  🕐 Best time  📍 Timezone      │
├──────────────────────────────────┤
│  ── Contact Log Timeline ──      │  ← Expandable section
│  (empty state if no contacts)    │
├──────────────────────────────────┤
│  ── Notes ──                     │  ← Editable textarea
│  (empty state if no notes)       │
├──────────────────────────────────┤
│  ── Tags ──                      │  ← Tag pills
│  (empty state)                   │
├──────────────────────────────────┤
│  ── Qualification Info ──        │  ← Team size, software, budget
│  (mostly empty for now)          │
└──────────────────────────────────┘
```

#### Contact Log Timeline — Left-Border Timeline

```tsx
<div className="space-y-0 relative">
  {/* Timeline line */}
  <div className="absolute left-4 top-6 bottom-2 w-px bg-warm-200" />
  
  {contacts.map((contact, i) => (
    <div key={i} className="relative flex gap-3 pb-4 pl-4">
      {/* Dot */}
      <div className={cn(
        'absolute left-[11px] top-1.5 w-[10px] h-[10px] rounded-full',
        'border-2 border-white z-10',
        contact.type === 'email' ? 'bg-blue-500' :
        contact.type === 'call' ? 'bg-primary-500' :
        contact.type === 'meeting' ? 'bg-violet-500' :
        'bg-warm-400'
      )} />
      {/* Content */}
      <div className="ml-4 flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-warm-900">{contact.type_label}</p>
          <span className="text-xs text-warm-400">{relativeTime(contact.created_at)}</span>
        </div>
        <p className="text-xs text-warm-600 mt-0.5">{contact.notes}</p>
      </div>
    </div>
  ))}
</div>
```

#### Empty States for Each Section

```tsx
// No contacts yet
<div className="py-6 text-center">
  <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
    <MessageSquare size={18} className="text-warm-300" />
  </div>
  <p className="text-sm font-medium text-warm-500">No contacts yet</p>
  <p className="text-xs text-warm-400 mt-0.5">Log your first interaction with this coach</p>
  <button className="mt-3 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors">
    Log Contact
  </button>
</div>

// No notes
<div className="py-4 text-center">
  <p className="text-xs text-warm-400">Click to add notes about this coach...</p>
</div>

// No tags
<div className="flex items-center gap-2 py-2">
  <button className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
    <Plus size={12} /> Add tag
  </button>
</div>
```

---

### 3.5 Quick Actions

#### Bulk Actions Bar — Floating Bottom Bar (Linear Style)

**Position:** Fixed to bottom of viewport, centered, appears when `selectedIds.size > 0`.

```tsx
<div className={cn(
  'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
  'flex items-center gap-3 px-4 py-2.5 rounded-2xl',
  'bg-warm-900 text-white shadow-2xl',
  'border border-white/10',
  'animate-slide-up'  // entry animation
)}>
  {/* Selection count */}
  <span className="text-sm font-medium tabular-nums">
    {selectedCount} selected
  </span>
  
  <div className="w-px h-5 bg-white/20" />
  
  {/* Action buttons */}
  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">
    <ArrowRight size={14} /> Move to
  </button>
  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">
    <Star size={14} /> Star
  </button>
  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-white/10 transition-colors">
    <Tag size={14} /> Tag
  </button>
  
  <div className="w-px h-5 bg-white/20" />
  
  <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors">
    <Trash2 size={14} /> Delete
  </button>
  
  <div className="w-px h-5 bg-white/20" />
  
  {/* Dismiss */}
  <button 
    onClick={onClear} 
    className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
  >
    <X size={16} />
  </button>
</div>
```

#### "Research Next 10" Button Placement

**In the CRM Dashboard tab (proposed new tab)** as a primary CTA card:

```tsx
<div className={cn(
  'p-5 rounded-2xl',
  'bg-gradient-to-br from-primary-50 to-primary-100/50',
  'border border-primary-200/30',
)}>
  <div className="flex items-center justify-between">
    <div>
      <h3 className="text-sm font-semibold text-warm-900">Quick Actions</h3>
      <p className="text-xs text-warm-500 mt-0.5">Get started with your pipeline</p>
    </div>
    <button className={cn(
      'flex items-center gap-2 px-4 py-2.5 rounded-xl',
      'bg-primary-600 text-white font-medium text-sm',
      'hover:bg-primary-700 transition-colors shadow-sm',
      'shadow-primary-500/25'
    )}>
      <Zap size={16} />
      Research Next 10
    </button>
  </div>
</div>
```

Also available in the Pipeline view's empty/getting-started state and as a quick action in the sidebar.

#### "Today's Follow-ups" — Filter Shortcut (not a card)

**In the Coaches tab filter bar as a highlighted quick-filter pill:**

```tsx
<button className={cn(
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
  followUpsDue > 0
    ? 'bg-amber-50 border border-amber-200 text-amber-700 animate-pulse-subtle'
    : 'bg-white/60 border border-warm-200/50 text-warm-500'
)}>
  <Clock size={12} />
  Today's Follow-ups
  {followUpsDue > 0 && (
    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold flex items-center justify-center">
      {followUpsDue}
    </span>
  )}
</button>
```

---

## 4. DELIVERABLE 3: Shared Patterns

### 4.1 Stat Card Component

**Three size variants for a single `StatCard` component:**

#### Compact (Sidebar)
```tsx
// Used in dark sidebar quick stats
<div className="rounded-[10px] p-3 bg-white/5 border border-white/5">
  <div className="text-xl font-bold text-white tabular-nums">{value}</div>
  <div className="text-[10px] text-warm-500 font-medium uppercase tracking-wider mt-0.5">{label}</div>
</div>
```

**Dimensions:** min-width auto, padding 12px, value text-xl (20px)

#### Standard (KPI Row)
```tsx
// Used in tab KPI rows
<div className={cn(
  'relative overflow-hidden',
  'bg-white/70 backdrop-blur-xl',
  'border border-white/20 rounded-2xl',
  'shadow-glass hover:shadow-card-hover',
  'p-4 lg:p-5',
  'transition-shadow duration-200 group'
)}>
  <div className="flex items-start justify-between gap-3">
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-warm-500 uppercase tracking-wider">{label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-3xl font-bold text-warm-900 tabular-nums tracking-tight">{value}</p>
        {suffix && <span className="text-lg text-warm-400 font-medium">{suffix}</span>}
      </div>
      {trend && (
        <span className={cn(
          'inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full mt-1.5',
          trend.value > 0 ? 'text-primary-700 bg-primary-50' : 'text-red-600 bg-red-50'
        )}>
          {trend.value > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(trend.value)}%
          <span className="text-[10px] font-normal ml-0.5 opacity-60">{trend.label}</span>
        </span>
      )}
      {detail && <p className="text-xs text-warm-400 mt-1">{detail}</p>}
    </div>
    <div className={cn(
      'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
      'transition-transform duration-200 group-hover:scale-105',
      iconBgClass
    )}>
      {icon}
    </div>
  </div>
</div>
```

**Dimensions:** padding 16-20px, value text-3xl (30px)

#### Large (Featured)
```tsx
// Used for hero stats (e.g., health score, conversion rate)
<div className={cn(
  'relative overflow-hidden',
  'bg-white/70 backdrop-blur-xl',
  'border border-white/20 rounded-2xl',
  'shadow-glass',
  'p-6 md:p-8',
  'border-l-4',
  borderColorClass
)}>
  <div className="flex items-center gap-6">
    <div className={cn(
      'w-16 h-16 rounded-2xl flex items-center justify-center',
      iconBgClass
    )}>
      {icon}  {/* 28px icon */}
    </div>
    <div>
      <p className="text-sm font-medium text-warm-500">{label}</p>
      <p className="text-5xl font-bold text-warm-900 tabular-nums tracking-tight mt-1">{value}</p>
      {detail && <p className="text-sm text-warm-500 mt-1">{detail}</p>}
    </div>
  </div>
</div>
```

**Dimensions:** padding 24-32px, value text-5xl (48px)

#### Trend Indicator Design

**Arrow + percentage in a pill badge:**
```tsx
// Positive
<span className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full text-primary-700 bg-primary-50">
  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
    <path d="M5 2L8.5 6.5H1.5L5 2Z" />
  </svg>
  12.5%
</span>

// Negative
<span className="...text-red-600 bg-red-50">
  <svg className="rotate-180">...</svg>
  8.3%
</span>

// Neutral
<span className="...text-warm-500 bg-warm-100">
  → 0.0%
</span>
```

**Sparklines:** Use them ONLY in the table rows (User Directory, Coach List) where they add density value. Don't put sparklines in KPI cards — they compete with the trend badge.

---

### 4.2 Alert/Warning Patterns

#### Three Severity Levels

| Severity | Colors | Use When |
|----------|--------|----------|
| Critical | `bg-red-50/80 border-red-200/50 text-red-900` | System down, data loss, security |
| Warning | `bg-amber-50/80 border-amber-200/50 text-amber-900` | Performance issues, data quality, attention needed |
| Info | `bg-blue-50/80 border-blue-200/50 text-blue-900` | Tips, suggestions, non-urgent updates |

#### Positioning

| Context | Position | Pattern |
|---------|----------|---------|
| Page-level alerts | Top of content area, below header, above KPIs | Full-width banner, stacking |
| Tab-specific alerts | Top of tab content, below KPIs | Full-width, contextual |
| Card-level alerts | Inside card, top position | Compact inline |
| Action feedback | Bottom-right corner | Toast notification |

#### Dismissible vs Persistent

- **Critical alerts:** Persistent. Cannot be dismissed until resolved. Red dot on tab icon.
- **Warning alerts:** Dismissible. Store in localStorage. Re-appear if condition persists after 24h.
- **Info alerts:** Dismissible. Store in localStorage. Don't re-appear.

#### Toast Notification Design

```tsx
<div className={cn(
  'fixed bottom-6 right-6 z-[100]',
  'flex items-center gap-3 px-4 py-3 rounded-2xl',
  'bg-warm-900 text-white',
  'shadow-2xl border border-white/10',
  'animate-slide-up'
)}>
  <Check size={16} className="text-primary-400" />
  <p className="text-sm font-medium">{message}</p>
  <button className="p-1 rounded-lg hover:bg-white/10 transition-colors">
    <X size={14} className="text-white/60" />
  </button>
</div>
```

Auto-dismiss after 4 seconds. Click to dismiss immediately.

---

### 4.3 Empty States

#### Standard Empty State Template

```tsx
<div className="flex flex-col items-center justify-center py-12 px-6 text-center">
  {/* Icon in muted container */}
  <div className="w-14 h-14 rounded-2xl bg-warm-100/80 flex items-center justify-center mb-4">
    <Icon size={24} className="text-warm-300" />
  </div>
  
  {/* Title */}
  <h3 className="text-base font-semibold text-warm-700 mb-1">{title}</h3>
  
  {/* Description */}
  <p className="text-sm text-warm-500 max-w-xs">{description}</p>
  
  {/* CTA (optional) */}
  {action && (
    <button className={cn(
      'mt-4 px-4 py-2 rounded-xl text-sm font-medium',
      'bg-primary-50 text-primary-700 hover:bg-primary-100',
      'transition-colors'
    )}>
      {action.label}
    </button>
  )}
</div>
```

#### Compact Empty State (for sections within cards)

```tsx
<div className="py-6 text-center">
  <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
    <Icon size={18} className="text-warm-300" />
  </div>
  <p className="text-sm font-medium text-warm-500">{title}</p>
  <p className="text-xs text-warm-400 mt-0.5">{description}</p>
</div>
```

#### Illustration Style

**Icon only.** No SVG illustrations. The warm-100 background container + lucide icon is sufficient. Illustrations add visual noise in a data-dense admin tool. Linear and Stripe both use icon-only empty states.

#### CTA Wording

| Context | CTA Text | Why |
|---------|----------|-----|
| No contact logs | "Log Contact" | Action verb, not "Add your first contact" |
| No notes | "Add Note" | Direct |
| No tags | "+ Add tag" | Plus icon signals additive |
| Empty pipeline stage | Drag hint text, no button | Action is drag-and-drop |
| Empty data table | "Import Data" or "Create First {Entity}" | Context-dependent |

---

### 4.4 Loading States

#### Skeleton Pattern Rules

1. **Match the layout of the loaded component** — same number of rows, same grid structure
2. **Show 3-5 skeleton items** for lists (not the full expected count)
3. **Show the correct grid count** for stat cards (4 skeletons for 4 KPIs)
4. **No text content in skeletons** — use gray rounded rectangles

#### Shimmer Animation

```css
/* Already defined in the codebase as skeleton-shimmer */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0,0,0,0.04) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

**Direction:** Left-to-right (standard reading direction)  
**Speed:** 1.5s per cycle  
**Easing:** ease-in-out  

#### Skeleton Count by Component

| Component | Skeleton Count |
|-----------|---------------|
| KPI card row | Match exact count (4) |
| Table rows | 5 rows |
| Activity feed | 4 items |
| Chart area | 1 placeholder block, height matches chart |
| Kanban columns | 3 columns with 2 cards each |
| Pipeline cards | 3 cards per column |

#### Component-Specific Skeletons

**Stat card skeleton (already exists, confirm spec):**
```tsx
<div className="relative bg-white/45 backdrop-blur-sm border border-white/30 rounded-2xl p-5 overflow-hidden">
  <div className="absolute inset-0 skeleton-shimmer pointer-events-none" />
  <div className="relative flex items-start justify-between">
    <div className="flex-1 space-y-2">
      <div className="h-3 w-20 bg-warm-200/60 rounded" />
      <div className="h-7 w-16 bg-warm-200/60 rounded" />
      <div className="h-2 w-24 bg-warm-100/60 rounded" />
    </div>
    <div className="w-10 h-10 rounded-xl bg-warm-100/60" />
  </div>
</div>
```

**Table row skeleton:**
```tsx
<tr className="border-b border-warm-50">
  <td className="px-4 py-3"><div className="w-4 h-4 bg-warm-100/60 rounded" /></td>
  <td className="px-4 py-3"><div className="w-4 h-4 bg-warm-100/60 rounded" /></td>
  <td className="px-4 py-3">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 bg-warm-200/60 rounded-lg" />
      <div className="space-y-1.5">
        <div className="h-3.5 w-28 bg-warm-200/60 rounded" />
        <div className="h-2.5 w-20 bg-warm-100/60 rounded" />
      </div>
    </div>
  </td>
  <td className="px-4 py-3"><div className="h-3 w-32 bg-warm-100/60 rounded" /></td>
  <td className="px-4 py-3"><div className="h-5 w-10 bg-warm-100/60 rounded-full" /></td>
  <td className="px-4 py-3"><div className="h-3 w-24 bg-warm-100/60 rounded" /></td>
  <td className="px-4 py-3"><div className="h-5 w-16 bg-warm-100/60 rounded-full" /></td>
  <td className="px-4 py-3"><div className="h-3 w-12 bg-warm-100/60 rounded" /></td>
  <td className="px-4 py-3"><div className="h-3 w-16 bg-warm-100/60 rounded" /></td>
</tr>
```

---

### 4.5 Responsive Breakpoints

#### Breakpoint Definitions (Tailwind default)

| Breakpoint | Width | Name |
|-----------|-------|------|
| Mobile | < 640px | (default) |
| sm | ≥ 640px | Small tablet |
| md | ≥ 768px | Tablet |
| lg | ≥ 1024px | Desktop |
| xl | ≥ 1280px | Wide desktop |

#### What Changes at Each Breakpoint

##### Mobile (< 640px)
- **Sidebar:** Hidden. Hamburger menu in top bar opens mobile sidebar overlay.
- **KPI cards:** 2-column grid (`grid-cols-2`)
- **Content cards:** Single column (`grid-cols-1`)
- **Tables:** Horizontal scroll with sticky first column (name column)
- **Kanban:** Single column view, swipeable between stages
- **Detail panel:** Full-screen overlay, not slide-in
- **Filter bar:** Stacked. Search on top, filters in scrollable row below.
- **Bulk actions bar:** Full-width, fewer visible actions (overflow into "More" menu)
- **Top bar:** Show hamburger + refresh + sign out only

##### Tablet (sm/md: 640-1023px)
- **Sidebar:** Hidden by default, toggleable overlay
- **KPI cards:** 2-column grid (`sm:grid-cols-2`)
- **Content cards:** 2-column grid where applicable
- **Tables:** Horizontal scroll, but more columns visible
- **Kanban:** 3 columns visible, horizontal scroll for rest
- **Detail panel:** 50% width slide-in
- **Filter bar:** Single row, but conference dropdown collapses to icon

##### Desktop (lg: 1024px+)
- **Sidebar:** Visible, collapsible (72px / 260px)
- **KPI cards:** Full row (`lg:grid-cols-4`)
- **Content cards:** Full grid layouts
- **Tables:** All columns visible
- **Kanban:** All 7 columns visible (horizontal scroll if needed)
- **Detail panel:** 480px max-width slide-in
- **Filter bar:** Full inline layout

#### Sidebar Behavior

```
Mobile (<lg):
  - Hidden by default
  - Hamburger icon in top bar
  - Opens as full-height overlay from left
  - Black/20 backdrop behind it
  - Clicking backdrop or nav item closes it
  - No collapse toggle shown

Desktop (≥lg):
  - Always visible (fixed position)
  - Collapse toggle button at right edge
  - Collapsed: 72px wide, icons only, tooltip on hover
  - Expanded: 260px wide, full labels + shortcuts
  - Transition: 300ms ease-in-out
  - Main content margin adjusts: lg:ml-[72px] or lg:ml-[260px]
```

#### Desktop-Only Features

| Feature | Available on Mobile? |
|---------|---------------------|
| Keyboard shortcuts (1-4, R) | No |
| Sidebar quick stats | No (collapse hides them) |
| Table column sorting | Yes (tap headers) |
| Kanban drag-and-drop | Touch drag available but degraded |
| Bulk selection | Yes (simplified) |
| Detail panel side-by-side with list | No (full-screen on mobile) |
| Chart tooltips on hover | Tap-to-show on mobile |
| Multi-column filter bar | Stacked on mobile |

---

## Appendix: Implementation Priority

### Phase 1 (Highest Impact)
1. Rename tabs: Command→Overview, Users→People, Health→System, Analytics→Growth
2. Reduce Overview KPIs from 6 to 4
3. Improve alert banner design (standardize across tabs)
4. Fix People tab user directory — ensure table scales to 500+
5. Replace CRM Calendar tab with Dashboard tab

### Phase 2 (Visual Polish)
6. Implement the 3 StatCard size variants as a unified component
7. Standardize empty states across all sections
8. Improve kanban getting-started state (all 354 in new_lead)
9. Add slide-over detail panel improvements
10. Responsive audit — test all breakpoints

### Phase 3 (Interaction Quality)
11. Toast notification system
12. Linear-style floating bulk actions bar
13. Keyboard navigation for tables (arrow keys, enter to open)
14. Chart tooltip improvements
15. Skeleton loading state audit (correct counts, correct layouts)

---

*End of specification. All Tailwind classes are exact. All color values use the established design system. All patterns reference the existing component library.*

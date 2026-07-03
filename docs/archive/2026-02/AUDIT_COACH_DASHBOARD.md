# BaseballHelm Coach Dashboard - Production Readiness Audit

> **Agent Role**: Coach Dashboard Production Auditor
> **Platform**: BaseballHelm (Helm Sports Labs)
> **Location**: `/Users/ricknini/Downloads/helmv3`
> **Objective**: Comprehensive audit of all coach-facing features for production readiness

---

## 🎯 AGENT MISSION

You are a senior production engineer conducting a thorough audit of the BaseballHelm coach dashboard. Your goal is to identify all gaps, bugs, incomplete features, security issues, and UX problems that would prevent this platform from being production-ready for college baseball coaches.

**Read these files first before doing anything else:**
1. `CLAUDE.md` - Critical project rules and patterns
2. `docs/CODEBASE_MAP.md` - Full architecture reference
3. `TODO.md` - Known issues and gaps

---

## 📊 CURRENT STATE OVERVIEW

### Coach Types & Their Dashboards
The platform serves 4 distinct coach personas with different feature sets:

| Coach Type | Primary Dashboard | Mode Toggle | Key Features |
|------------|------------------|-------------|--------------|
| `college` | Recruiting Dashboard | No | Discover, Pipeline, Compare, Command Center |
| `juco` | Recruiting OR Team | Yes | All recruiting + Team management, Academics |
| `high_school` | Team Dashboard | No | Roster, Videos, Dev Plans, College Interest |
| `showcase` | Organization Dashboard | No | Multi-team management, Events |

### Navigation Structure (from `src/components/layout/sidebar.tsx`)

**College/JUCO Recruiting Mode:**
- Dashboard (`/baseball/dashboard`)
- Command Center (`/baseball/dashboard/command-center`)
- Upload Stats (`/baseball/dashboard/stats/upload`)
- Discover (`/baseball/dashboard/discover`)
- Pipeline (`/baseball/dashboard/pipeline`)
- Compare (`/baseball/dashboard/compare`)
- Calendar (`/baseball/dashboard/calendar`)
- Camps (`/baseball/dashboard/camps`)
- Messages (`/baseball/dashboard/messages`)

**HS Coach Team Mode:**
- Dashboard (`/baseball/dashboard/team/high-school`)
- Roster (`/baseball/dashboard/roster`)
- Videos (`/baseball/dashboard/videos`)
- Dev Plans (`/baseball/dashboard/dev-plans`)
- College Interest (`/baseball/dashboard/college-interest`)
- Calendar (`/baseball/dashboard/calendar`)
- Messages (`/baseball/dashboard/messages`)

**JUCO Team Mode (adds Academics):**
- Academics (`/baseball/dashboard/academics`)

**Showcase Org Mode:**
- Organization Dashboard (`/baseball/dashboard/organization`)
- Teams (`/baseball/dashboard/teams`)
- Events (`/baseball/dashboard/events`)

---

## 🗃️ DATABASE SCHEMA AUDIT

### Core Coach Tables (prefix: `baseball_`)

```sql
-- Primary tables to audit:
baseball_coaches          -- Coach profiles
baseball_teams            -- Teams managed by coaches
baseball_team_members     -- Players on teams
baseball_team_coach_staff -- Assistant coaches
baseball_watchlists       -- Recruiting pipeline
baseball_videos           -- Player videos
baseball_developmental_plans -- Dev plans for players
baseball_camps            -- Coach-hosted camps
baseball_camp_registrations -- Camp signups
baseball_events           -- Calendar events
baseball_coach_calendar_events -- Coach-specific events
baseball_player_engagement_events -- Analytics
baseball_recruiting_interests -- Player interest tracking
baseball_messages         -- Messaging system
baseball_conversations    -- Message threads
baseball_conversation_participants -- Thread members
```

### Pipeline Stages (ONLY 5 VALID VALUES)
```typescript
type PipelineStage = 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
// INVALID: 'contacted', 'campus_visit', 'priority' - these DO NOT exist
```

### Audit Tasks for Database:
- [ ] Verify all RLS policies exist and are correctly configured for coach access
- [ ] Check foreign key relationships between tables
- [ ] Validate all indexes exist for query performance
- [ ] Ensure `updated_at` triggers are in place on all tables
- [ ] Verify enums match TypeScript types

---

## 📱 FEATURE-BY-FEATURE AUDIT

### 1. MAIN DASHBOARD (`/baseball/dashboard`)
**File**: `src/app/baseball/(dashboard)/dashboard/page.tsx`

**Current Implementation:**
- Bento grid layout with stats cards
- Total Pipeline count with stage breakdown
- Profile Views with week-over-week change
- Hot Leads section
- Position Needs Matrix
- Engagement Chart (7 days)
- Activity Feed
- USA Map for player distribution
- Saved Searches quick access

**Audit Checklist:**
- [ ] **Data Accuracy**: Verify `useBaseballCoachDashboard` hook returns accurate counts
- [ ] **Performance**: Check query consolidation (should be 5-6 parallel batches, not 15+ sequential)
- [ ] **Loading States**: All sections must have proper skeleton loaders
- [ ] **Empty States**: Verify messaging when no data exists
- [ ] **Error Handling**: Check error boundaries and fallback UI
- [ ] **Coach Type Routing**: Validate redirect logic for different coach types
- [ ] **Mode Toggle State**: Ensure `coachMode` persists in Zustand store
- [ ] **Real-time Updates**: Activity feed should update without refresh
- [ ] **Chart Rendering**: Engagement chart must handle zero-data gracefully
- [ ] **Map Interactivity**: State clicks should navigate to Discover with filters

**Security Checks:**
- [ ] Dashboard only shows data for authenticated coach's organization
- [ ] RLS prevents cross-coach data leakage
- [ ] API calls include proper auth headers

---

### 2. DISCOVER PAGE (`/baseball/dashboard/discover`)
**Location**: `src/app/baseball/(dashboard)/dashboard/discover/`

**Expected Features:**
- Player search with filters (position, grad year, state, measurables)
- Player cards with quick actions (add to watchlist, view profile, message)
- Saved searches functionality
- USA Map for geographic discovery
- Fit scoring based on recruiting philosophy

**Audit Checklist:**
- [ ] **Search Performance**: Full-text search on `baseball_players.search_vector`
- [ ] **Filter Persistence**: URL params should preserve filter state
- [ ] **Pagination**: Infinite scroll or load more for large result sets
- [ ] **Player Cards**: Show position, grad year, school, key stats
- [ ] **Quick Actions**: Add to watchlist works without page reload
- [ ] **Saved Searches**: LocalStorage persistence + optional server sync
- [ ] **Empty Results**: Helpful messaging when no players match filters
- [ ] **Mobile Responsive**: Filter panel collapsible on mobile

**Performance Requirements:**
- [ ] Initial load < 2 seconds
- [ ] Filter changes < 500ms
- [ ] Player cards virtualized for large lists

---

### 3. PIPELINE PAGE (`/baseball/dashboard/pipeline`)
**File**: `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx`

**Current Implementation (3 view modes):**
1. **Pipeline View**: Kanban board with drag-and-drop (dnd-kit)
2. **Position Planner**: Baseball diamond visualization
3. **List View**: Table with bulk actions

**Audit Checklist:**
- [ ] **Drag and Drop**: Stage changes persist immediately to database
- [ ] **Optimistic Updates**: UI updates before server confirmation
- [ ] **Undo Capability**: Allow reverting accidental stage changes
- [ ] **Bulk Actions**: Multi-select status change and removal
- [ ] **Notes System**: Inline note editing per player
- [ ] **Filters**: Grad year and position filters work across all views
- [ ] **Position Planner**: Drag players to positions on baseball diamond
- [ ] **URL State**: View mode persists in URL (`?view=list`)
- [ ] **Player Peek Panel**: Quick view without leaving page
- [ ] **Player Detail Modal**: Full profile access

**Data Integrity:**
- [ ] Pipeline counts match actual watchlist records
- [ ] Stage changes update `updated_at` timestamp
- [ ] Removal permanently deletes (not soft delete)

---

### 4. COMPARE PAGE (`/baseball/dashboard/compare`)
**Location**: `src/app/baseball/(dashboard)/dashboard/compare/`

**Expected Features:**
- Side-by-side player comparison (up to 4-5 players)
- Stat categories: Measurables, Academics, Engagement
- Visual charts for comparison
- Save/load comparison sets

**Audit Checklist:**
- [ ] **Player Selection**: Search and add players from pipeline
- [ ] **Stat Display**: All measurables formatted correctly
- [ ] **Missing Data Handling**: Show "N/A" gracefully
- [ ] **Comparison Persistence**: Save comparisons to `baseball_player_comparisons` table
- [ ] **Chart Visualization**: Radar or bar charts for visual comparison
- [ ] **Export Option**: PDF or shareable link

---

### 5. COMMAND CENTER (`/baseball/dashboard/command-center`)
**Location**: `src/app/baseball/(dashboard)/dashboard/command-center/`

**Expected Features:**
- AI-powered recruiting insights
- Hot leads recommendations
- Position needs analysis
- Engagement alerts

**Audit Checklist:**
- [ ] **Insights Feed**: Real-time or near-real-time updates
- [ ] **Action Items**: Clickable with direct navigation
- [ ] **Personalization**: Based on coach's recruiting philosophy
- [ ] **Empty State**: Helpful onboarding when no data

---

### 6. MESSAGES (`/baseball/dashboard/messages`)
**Location**: `src/app/baseball/(dashboard)/dashboard/messages/`

**Database Tables:**
- `baseball_conversations` - Thread metadata
- `baseball_conversation_participants` - Thread members
- `baseball_messages` - Individual messages

**Audit Checklist:**
- [ ] **Conversation List**: Shows player name, last message, timestamp
- [ ] **Unread Count**: Badge in sidebar updates in real-time
- [ ] **Message Thread**: Full conversation history
- [ ] **Send Messages**: Text input with send button
- [ ] **Read Receipts**: Mark as read when viewed
- [ ] **Real-time Updates**: Supabase Realtime subscription
- [ ] **Search**: Find conversations by player name
- [ ] **Compliance**: Ensure messaging meets NCAA guidelines

**Security:**
- [ ] Coaches can only message players who exist in their pipeline
- [ ] RLS prevents accessing other coaches' conversations

---

### 7. CALENDAR (`/baseball/dashboard/calendar`)
**Location**: `src/app/baseball/(dashboard)/dashboard/calendar/`

**Database Tables:**
- `baseball_events` - Team events
- `baseball_coach_calendar_events` - Personal calendar

**Audit Checklist:**
- [ ] **Calendar View**: Month/week/day views
- [ ] **Event Types**: Games, practices, recruiting events
- [ ] **Create Events**: Modal with date picker, time, description
- [ ] **Edit/Delete**: Full CRUD on owned events
- [ ] **Team Events**: Show events from managed teams
- [ ] **Camp Integration**: Link to camp registration

---

### 8. CAMPS (`/baseball/dashboard/camps`)
**Location**: `src/app/baseball/(dashboard)/dashboard/camps/`

**Database Tables:**
- `baseball_camps` - Camp details
- `baseball_camp_registrations` - Player registrations

**Audit Checklist:**
- [ ] **Camp List**: Shows all camps hosted by coach's organization
- [ ] **Create Camp**: Form with all required fields
- [ ] **Registration Management**: View/manage registered players
- [ ] **Capacity Tracking**: Show registered vs max capacity
- [ ] **Waitlist**: Handle overflow registrations
- [ ] **Public Link**: Shareable registration page for players

---

### 9. ROSTER (`/baseball/dashboard/roster`)
**Location**: `src/app/baseball/(dashboard)/dashboard/roster/`

**For Team Mode coaches (HS, JUCO, Showcase)**

**Audit Checklist:**
- [ ] **Player List**: All team members with key info
- [ ] **Add Players**: Invite by email or join code
- [ ] **Remove Players**: With confirmation dialog
- [ ] **Player Profiles**: Link to detailed player view
- [ ] **Team Invitations**: Manage pending invites
- [ ] **Role Management**: Distinguish starters, reserves, etc.

---

### 10. DEV PLANS (`/baseball/dashboard/dev-plans`)
**Location**: `src/app/baseball/(dashboard)/dashboard/dev-plans/`

**Database Table:** `baseball_developmental_plans`

**Audit Checklist:**
- [ ] **Plan List**: Shows all dev plans for team players
- [ ] **Create Plan**: Form with goals, milestones, timeline
- [ ] **Assign to Player**: Link plan to specific player
- [ ] **Progress Tracking**: Mark milestones complete
- [ ] **Player View**: Players can see their assigned plans

---

### 11. PROGRAM PAGE (`/baseball/dashboard/program`)
**Location**: `src/app/baseball/(dashboard)/dashboard/program/`

**Audit Checklist:**
- [ ] **Program Profile**: Organization details
- [ ] **Edit Details**: Update name, location, colors
- [ ] **Recruiting Philosophy**: Set match scoring weights
- [ ] **Staff List**: View assistant coaches
- [ ] **Public Profile Link**: Preview public program page

---

### 12. SETTINGS (`/baseball/dashboard/settings`)
**Location**: `src/app/baseball/(dashboard)/dashboard/settings/`

**Audit Checklist:**
- [ ] **Profile Settings**: Update personal info, avatar
- [ ] **Privacy Settings**: Control visibility
- [ ] **Notification Preferences**: Email/push settings
- [ ] **Password Change**: Secure password update flow
- [ ] **Account Deletion**: GDPR-compliant deletion option

---

## 🔒 SECURITY AUDIT

### Row Level Security (RLS)
**File**: `supabase/migrations/034_all_rls_policies.sql`

- [ ] All `baseball_*` tables have RLS enabled
- [ ] Coaches can only read/write their own data
- [ ] No admin bypass without proper role check
- [ ] Test: Coach A cannot see Coach B's watchlist
- [ ] Test: Coach cannot access other organization's players (on team)

### Authentication Flow
- [ ] Supabase Auth JWT properly validated
- [ ] Session refresh works correctly
- [ ] Logout clears all local state
- [ ] Protected routes redirect to login

### Data Validation
- [ ] Server actions validate all inputs
- [ ] SQL injection prevention via parameterized queries
- [ ] XSS prevention in user-generated content

---

## 🎨 UI/UX AUDIT

### Design System Compliance
**Reference**: `CLAUDE.md` Design System section

- [ ] Glassmorphism cards: `bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl`
- [ ] Primary color: `#16A34A` (Kelly green)
- [ ] Background: `#FFFEFA` (cream)
- [ ] Typography: Inter font, proper heading hierarchy
- [ ] Spacing: Consistent `p-6` card padding, `gap-6` between cards

### Component Consistency
- [ ] All buttons use `<Button>` component with correct variants
- [ ] All forms use consistent input styling
- [ ] Modals use `<Modal>` component with focus trap
- [ ] Loading states use skeleton loaders, not spinners
- [ ] Empty states are helpful and actionable

### Accessibility
- [ ] All interactive elements have keyboard navigation
- [ ] ARIA labels on icons and buttons
- [ ] Color contrast meets WCAG AA
- [ ] Skip links for screen readers

### Mobile Responsiveness
- [ ] Sidebar collapses to hamburger menu
- [ ] Tables scroll horizontally
- [ ] Touch targets are at least 44x44px
- [ ] Pipeline kanban works on tablet

---

## ⚡ PERFORMANCE AUDIT

### Query Optimization
- [ ] Dashboard uses consolidated query hook (not 15+ individual queries)
- [ ] Pagination on all list views
- [ ] Indexes exist for frequently filtered columns
- [ ] No N+1 queries in server components

### Client-Side Performance
- [ ] Bundle size reasonable (check with `npm run analyze`)
- [ ] Images optimized with Next.js Image component
- [ ] React components memoized where appropriate
- [ ] No unnecessary re-renders

### Caching Strategy
- [ ] Static pages use `generateStaticParams` where possible
- [ ] API routes use appropriate cache headers
- [ ] Supabase query results cached appropriately

---

## 🧪 TESTING AUDIT

### Test Coverage Needed
- [ ] Unit tests for utility functions (`src/lib/utils.ts`)
- [ ] Integration tests for server actions
- [ ] E2E tests for critical flows (login, add to pipeline, send message)
- [ ] Component tests for complex UI components

### Test Files Location
- [ ] `e2e/` - Playwright E2E tests
- [ ] `tests/` - Unit/integration tests

---

## 📝 DOCUMENTATION AUDIT

- [ ] All server actions have JSDoc comments
- [ ] Complex components have usage examples
- [ ] API routes documented
- [ ] Database schema documented in `supabase/docs/`

---

## 🚀 DEPLOYMENT READINESS

### Pre-Deploy Checklist
- [ ] All `console.log` statements removed
- [ ] No hardcoded API keys or secrets
- [ ] Environment variables properly set
- [ ] Error tracking (Sentry) configured
- [ ] Analytics tracking in place

### Monitoring
- [ ] Error logging to Sentry
- [ ] Performance monitoring
- [ ] Uptime alerts

---

## 📋 OUTPUT FORMAT

After completing this audit, generate a report with:

1. **Executive Summary**: Overall production readiness score (0-100%)
2. **Critical Blockers**: Must-fix before launch
3. **High Priority**: Should fix before launch
4. **Medium Priority**: Can fix post-launch
5. **Low Priority**: Nice-to-have improvements
6. **Estimated Effort**: Time estimates per item (hours)

Save the report to: `docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md`

---

## 🔄 AUDIT COMMANDS

```bash
# Run type checking
npm run typecheck

# Run linting
npm run lint

# Check for unused exports
npx ts-prune

# Analyze bundle size
npm run build && npm run analyze

# Run existing tests
npm test

# Check for security vulnerabilities
npm audit
```

---

**Start the audit now. Be thorough, be critical, and document everything.**

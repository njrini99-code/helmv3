# BaseballHelm Player Dashboard - Production Readiness Audit

> **Agent Role**: Player Dashboard Production Auditor
> **Platform**: BaseballHelm (Helm Sports Labs)
> **Location**: `/Users/ricknini/Downloads/helmv3`
> **Objective**: Comprehensive audit of all player-facing features for production readiness

---

## 🎯 AGENT MISSION

You are a senior production engineer conducting a thorough audit of the BaseballHelm player dashboard. Your goal is to identify all gaps, bugs, incomplete features, security issues, and UX problems that would prevent this platform from being production-ready for high school, showcase, JUCO, and college baseball players seeking recruiting opportunities.

**Read these files first before doing anything else:**
1. `CLAUDE.md` - Critical project rules and patterns
2. `docs/CODEBASE_MAP.md` - Full architecture reference
3. `TODO.md` - Known issues and gaps

---

## 📊 CURRENT STATE OVERVIEW

### Player Types & Their Dashboards
The platform serves different player personas based on their situation:

| Player Type | Primary Experience | Mode Toggle | Key Features |
|-------------|-------------------|-------------|--------------|
| `high_school` | Recruiting + Team | Yes (if recruiting activated) | Profile, Colleges, Journey, Messages, Analytics |
| `showcase` | Recruiting + Team | Yes (if recruiting activated) | Same as HS |
| `juco` | Recruiting + Team | Yes (if recruiting activated) | Same + Transfer portal features |
| `college` | Team Only | No | Team Dashboard, Videos, Dev Plan |

### Navigation Structure (from `src/components/layout/sidebar.tsx`)

**Player Recruiting Mode:**
- Dashboard (`/baseball/dashboard`)
- My Profile (`/baseball/dashboard/profile`)
- Colleges (`/baseball/dashboard/colleges`)
- Journey (`/baseball/dashboard/journey`)
- Camps (`/baseball/dashboard/camps`)
- Messages (`/baseball/dashboard/messages`)
- Analytics (`/baseball/dashboard/analytics`)

**Player Team Mode:**
- Dashboard (`/baseball/dashboard/team`)
- My Profile (`/baseball/dashboard/profile`)
- Videos (`/baseball/dashboard/videos`)
- Dev Plan (`/baseball/dashboard/dev-plan`)
- Calendar (`/baseball/dashboard/calendar`)
- Messages (`/baseball/dashboard/messages`)

---

## 🗃️ DATABASE SCHEMA AUDIT

### Core Player Tables (prefix: `baseball_`)

```sql
-- Primary tables to audit:
baseball_players              -- Player profiles (core)
baseball_player_settings      -- Privacy and notification settings
baseball_videos               -- Player highlight videos
baseball_team_members         -- Team affiliations
baseball_recruiting_interests -- Interest from colleges
baseball_player_engagement_events -- Analytics (views, interactions)
baseball_developmental_plans  -- Development plans from coaches
baseball_messages             -- Messaging system
baseball_conversations        -- Message threads
baseball_conversation_participants -- Thread members
baseball_camp_registrations   -- Camp signups
organizations                 -- Schools/programs (shared table)
```

### Player Profile Fields (from `005_players.sql`)
```typescript
// Required fields for complete profile:
interface PlayerProfile {
  // Basic Info
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  city: string;
  state: string;
  
  // Baseball Info
  primary_position: string;
  secondary_position?: string;
  grad_year: number;
  bats: 'L' | 'R' | 'S';
  throws: 'L' | 'R';
  height_feet: number;
  height_inches: number;
  weight_lbs: number;
  
  // School Info
  high_school_name: string;
  high_school_id?: string;
  high_school_org_id?: string;
  club_team?: string;
  
  // Measurables
  pitch_velo?: number;    // For pitchers
  exit_velo?: number;     // For hitters
  sixty_time?: number;    // 60-yard dash
  pop_time?: number;      // For catchers
  arm_strength?: number;
  
  // Academics
  gpa: number;
  sat_score?: number;
  act_score?: number;
  
  // Social/Profile
  instagram?: string;
  twitter?: string;
  about_me?: string;
  has_video: boolean;
  
  // Recruiting
  recruiting_activated: boolean;
  recruiting_activated_at?: string;
  committed_to?: string;
  committed_to_org_id?: string;
  commitment_date?: string;
  
  // Status
  onboarding_completed: boolean;
  profile_completion_percent: number;
}
```

### Profile Completion Calculation
The database function `calculate_profile_completion` calculates a percentage:
- 15 total fields considered
- Currently includes: first_name, last_name, primary_position, grad_year, height_feet, weight_lbs, high_school_name, city, state, gpa, bats, throws, about_me, pitch_velo OR exit_velo, has_video

**Audit Task**: Verify this calculation matches the UI display and is accurate.

---

## 📱 FEATURE-BY-FEATURE AUDIT

### 1. MAIN DASHBOARD (RECRUITING MODE) (`/baseball/dashboard`)
**File**: `src/app/baseball/(dashboard)/dashboard/page.tsx`

**Current Implementation (Player Section):**
- Recruiting activation banner (if not activated)
- Profile card with avatar, name, position, grad year
- Recruiting status badge
- Profile completion percentage badge
- Stats grid (Height, Weight, Velo, GPA)
- Quick Actions section

**Player Stats Display:**
```typescript
// Bento Grid Stats
{
  'Profile Views': playerStats?.profileViews || 0,
  'On Watchlists': playerStats?.watchlistCount || 0,
  'Messages': playerStats?.unreadMessages || 0,
  'Video Views': playerStats?.videoViews || 0,
}
```

**Audit Checklist:**
- [ ] **Profile Card Accuracy**: Name, position, grad year, school display correctly
- [ ] **Avatar Upload**: Images upload and display properly
- [ ] **Stats Accuracy**: Verify `useBaseballPlayerDashboard` hook returns correct counts
- [ ] **Profile Completion**: Percentage matches actual completion state
- [ ] **Recruiting Banner**: Only shows if `recruiting_activated = false` AND `player_type !== 'college'`
- [ ] **Quick Actions**: Links navigate correctly
- [ ] **Mode Detection**: College players don't see recruiting banner
- [ ] **Loading States**: Proper skeleton loaders during data fetch
- [ ] **Error Handling**: Graceful error display if data fails to load

**Security Checks:**
- [ ] Player can only view their own dashboard
- [ ] Stats (watchlist count) are anonymized (don't reveal which coaches)
- [ ] RLS prevents data leakage

---

### 2. RECRUITING ACTIVATION (`/baseball/dashboard/activate`)
**Location**: `src/app/baseball/(dashboard)/dashboard/activate/`

**Purpose**: Allow non-college players to "turn on" recruiting visibility

**Expected Flow:**
1. Player reviews what activation means
2. Agrees to terms (profile becomes visible to coaches)
3. Clicks activate button
4. `recruiting_activated` set to `true`
5. `recruiting_activated_at` timestamp recorded
6. Redirect to full recruiting dashboard

**Audit Checklist:**
- [ ] **Eligibility Check**: Only non-college, non-activated players can access
- [ ] **Clear Explanation**: What happens when you activate
- [ ] **Privacy Notice**: Explain data visibility
- [ ] **Confirmation**: Require explicit consent
- [ ] **Database Update**: `recruiting_activated` and `recruiting_activated_at` set correctly
- [ ] **Redirect**: After activation, redirect to dashboard (recruiting mode)
- [ ] **Idempotency**: Can't activate twice
- [ ] **Undo Option**: Way to deactivate (in settings?)

---

### 3. PLAYER PROFILE EDITOR (`/baseball/dashboard/profile`)
**File**: `src/app/baseball/(dashboard)/dashboard/profile/page.tsx`
**Component**: `src/components/features/profile-editor.tsx`

**Critical Feature**: This is where players build their recruiting profile.

**Profile Sections Expected:**
1. **Basic Info**: Name, contact, location
2. **Physical**: Height, weight
3. **Baseball Details**: Position, bats/throws, grad year
4. **Measurables**: Velo, 60 time, pop time, arm strength
5. **Academics**: GPA, SAT, ACT
6. **Social**: Instagram, Twitter
7. **About Me**: Bio text
8. **School**: High school, club team
9. **Commitment Status**: If committed, where

**Audit Checklist:**
- [ ] **All Fields Editable**: Every profile field can be updated
- [ ] **Validation**: Proper input validation (email format, numeric ranges)
- [ ] **Height Input**: Feet/inches combo works correctly
- [ ] **Position Dropdown**: All valid baseball positions available
- [ ] **Grad Year**: Reasonable range (current year to +6)
- [ ] **GPA Validation**: 0.0-4.0 or 0.0-5.0 for weighted
- [ ] **Test Scores**: SAT 400-1600, ACT 1-36
- [ ] **Measurables Validation**: Realistic ranges (pitch velo 60-100+, etc.)
- [ ] **Avatar Upload**: Image upload to Supabase Storage works
- [ ] **Auto-save vs. Submit**: Clear UX for how changes are saved
- [ ] **Profile Completion Update**: Percentage updates after save
- [ ] **Public Profile Preview**: Link to view public profile
- [ ] **Error Messages**: Clear validation error display

**Data Integrity:**
- [ ] All updates persist to `baseball_players` table
- [ ] `updated_at` timestamp updates
- [ ] Profile completion recalculates

---

### 4. PUBLIC PLAYER PROFILE (`/baseball/player/[id]`)
**Location**: `src/app/baseball/(public)/player/[id]/`

**Purpose**: The page coaches see when viewing a player

**Expected Content:**
- Player photo, name, position, grad year
- School and location
- Physical measurements
- Measurables (velo, times, etc.)
- Academic info (GPA, test scores)
- Videos section
- About me text
- Social links
- Contact button (for coaches)

**Audit Checklist:**
- [ ] **Public Access**: Page loads without authentication
- [ ] **SEO**: Proper meta tags for sharing
- [ ] **Conditional Display**: Only show if `recruiting_activated = true`
- [ ] **Privacy Respect**: Honor privacy settings
- [ ] **Video Embedding**: Videos play correctly
- [ ] **Contact CTA**: Coach can initiate message (requires auth)
- [ ] **Mobile Responsive**: Looks good on all devices
- [ ] **Loading State**: Proper loading UI
- [ ] **404 Handling**: Graceful handling of invalid player IDs

---

### 5. VIDEOS (`/baseball/dashboard/videos`)
**Location**: `src/app/baseball/(dashboard)/dashboard/videos/`

**Database Table**: `baseball_videos`

**Video Types:**
- Highlight reels
- Game footage
- Practice clips
- Bullpen sessions (for pitchers)

**Expected Features:**
- Upload videos (direct or YouTube/Vimeo link)
- Organize videos by type
- Set primary/featured video
- View count tracking
- Delete videos

**Audit Checklist:**
- [ ] **Video Upload**: Direct upload to Supabase Storage works
- [ ] **External Links**: YouTube/Vimeo URL parsing
- [ ] **Thumbnail Generation**: Auto-generate or manual upload
- [ ] **Video Player**: Embedded player works
- [ ] **Video Types**: Can categorize videos
- [ ] **Primary Video**: Can set featured video for profile
- [ ] **View Tracking**: `baseball_video_views` table records views
- [ ] **Delete Confirmation**: Prevent accidental deletion
- [ ] **Storage Limits**: Handle file size limits gracefully
- [ ] **Supported Formats**: MP4, MOV, etc.

**Performance:**
- [ ] Video streaming (not full download before play)
- [ ] Thumbnail lazy loading
- [ ] Pagination for many videos

---

### 6. COLLEGES PAGE (`/baseball/dashboard/colleges`)
**Location**: `src/app/baseball/(dashboard)/dashboard/colleges/`

**Purpose**: Help players discover and research colleges

**Expected Features:**
- Browse colleges by state, division, conference
- Filter by division (D1, D2, D3, NAIA, JUCO)
- View college program profiles
- Mark colleges as "interested"
- Track which coaches have viewed player

**Audit Checklist:**
- [ ] **College Database**: `organizations` table has college data
- [ ] **Search/Filter**: By state, division, conference
- [ ] **College Cards**: Show key info (name, location, division)
- [ ] **College Detail View**: Full program profile page
- [ ] **Interest Tracking**: Player can mark interest
- [ ] **"Who Viewed Me"**: Show coaches who viewed profile (if allowed)
- [ ] **Map View**: Geographic visualization
- [ ] **Empty State**: Helpful if no results

---

### 7. JOURNEY PAGE (`/baseball/dashboard/journey`)
**Location**: `src/app/baseball/(dashboard)/dashboard/journey/`

**Purpose**: Track recruiting journey milestones

**Expected Features:**
- Timeline of recruiting events
- Track college contacts
- Note coaching interactions
- Record camp attendance
- Mark commitment

**Audit Checklist:**
- [ ] **Timeline Display**: Chronological events
- [ ] **Event Types**: Contact, visit, offer, commitment
- [ ] **Add Events**: Manual entry of milestones
- [ ] **Linked Data**: Auto-populate from messages/camps
- [ ] **Commitment Flow**: Special UI for commitment
- [ ] **Export**: Share journey (for family, HS coach)

**Known Issue (from TODO.md):**
- [ ] Empty catch block at line 105 - errors silently swallowed

---

### 8. CAMPS (`/baseball/dashboard/camps`)
**Location**: `src/app/baseball/(dashboard)/dashboard/camps/`

**Purpose**: Discover and register for college camps

**Expected Features:**
- Browse upcoming camps
- Filter by location, date, cost
- View camp details
- Register for camps
- Track registered camps

**Audit Checklist:**
- [ ] **Camp List**: Shows camps from `baseball_camps` table
- [ ] **Filters**: By date, location, hosting school
- [ ] **Camp Details**: Full info modal/page
- [ ] **Registration Flow**: Form to sign up
- [ ] **Confirmation**: Email confirmation after registration
- [ ] **Capacity Display**: Show spots remaining
- [ ] **Waitlist**: Handle full camps
- [ ] **Cancel Registration**: Allow cancellation
- [ ] **My Registrations**: Tab/section for registered camps

---

### 9. MESSAGES (`/baseball/dashboard/messages`)
**Location**: `src/app/baseball/(dashboard)/dashboard/messages/`

**Database Tables:**
- `baseball_conversations`
- `baseball_conversation_participants`
- `baseball_messages`

**Purpose**: Communication with college coaches

**Audit Checklist:**
- [ ] **Inbox View**: List of conversations with coaches
- [ ] **Unread Indicator**: Badge count in sidebar
- [ ] **Conversation Thread**: Full message history
- [ ] **Send Reply**: Text input to respond
- [ ] **Real-time Updates**: New messages appear instantly (Supabase Realtime)
- [ ] **Read Receipts**: Mark as read when viewed
- [ ] **Coach Info**: Show coach name, school, title
- [ ] **Notifications**: Push/email for new messages
- [ ] **Search**: Find conversations
- [ ] **Block/Report**: Safety features

**Security:**
- [ ] Players can only see their own conversations
- [ ] RLS prevents message snooping
- [ ] Rate limiting on message sending

---

### 10. ANALYTICS (`/baseball/dashboard/analytics`)
**Location**: `src/app/baseball/(dashboard)/dashboard/analytics/`

**Database Table**: `baseball_player_engagement_events`

**Purpose**: Show player how their profile is performing

**Expected Metrics:**
- Profile views over time
- Which coaches viewed
- Watchlist additions
- Video views
- Message engagement

**Audit Checklist:**
- [ ] **Profile Views Chart**: Line/bar chart over time
- [ ] **View Breakdown**: By coach type, location
- [ ] **Watchlist Count**: How many coaches have player on watchlist
- [ ] **Video Analytics**: Per-video view counts
- [ ] **Time Periods**: Filter by week, month, all time
- [ ] **Anonymization**: Don't reveal specific coach names (unless messaged)
- [ ] **Trends**: Show increases/decreases
- [ ] **Export**: Download analytics report

---

### 11. PLAYER TEAM DASHBOARD (`/baseball/dashboard/team`)
**Location**: `src/app/baseball/(dashboard)/dashboard/team/`

**For players who are on a team (HS, JUCO, College)**

**Audit Checklist:**
- [ ] **Team Info**: Show team name, organization
- [ ] **Roster**: View teammates
- [ ] **Schedule**: Upcoming games/practices
- [ ] **Dev Plan**: View assigned development plans
- [ ] **Videos**: Access team video library
- [ ] **Messages**: Team messaging

---

### 12. DEVELOPMENT PLAN (`/baseball/dashboard/dev-plan`)
**Location**: `src/app/baseball/(dashboard)/dashboard/dev-plan/`

**Database Table**: `baseball_developmental_plans`

**Purpose**: View development plans assigned by coaches

**Audit Checklist:**
- [ ] **Plan Display**: Show active development plan
- [ ] **Goals List**: View assigned goals
- [ ] **Progress Tracking**: Mark milestones complete
- [ ] **Coach Notes**: See coach feedback
- [ ] **Historical Plans**: Access past plans

---

### 13. SETTINGS (`/baseball/dashboard/settings`)
**Location**: `src/app/baseball/(dashboard)/dashboard/settings/`

**Subsections:**
- General settings
- Privacy (`/baseball/dashboard/settings/privacy`)
- Notifications
- Account

**Audit Checklist:**
- [ ] **Profile Info**: Update email, phone
- [ ] **Password Change**: Secure flow
- [ ] **Privacy Controls**: Who can see what
- [ ] **Notification Preferences**: Email, push settings
- [ ] **Recruiting Toggle**: Deactivate recruiting
- [ ] **Account Deletion**: GDPR-compliant option
- [ ] **Data Export**: Download all data

---

## 🔐 PLAYER ONBOARDING AUDIT

### Onboarding Flow (`/baseball/player`)
**Location**: `src/app/baseball/(onboarding)/player/`

**Expected Steps:**
1. Basic info (name, email)
2. Baseball details (position, grad year)
3. Physical measurements
4. School info
5. Profile photo
6. Review and complete

**Audit Checklist:**
- [ ] **Multi-step Form**: Clear progress indicator
- [ ] **Validation**: Each step validates before next
- [ ] **Save Progress**: Can resume later
- [ ] **Skip Optional**: Non-required fields skippable
- [ ] **Completion Flag**: `onboarding_completed` set to true
- [ ] **Redirect**: To dashboard after completion
- [ ] **Mobile Friendly**: Works on phone

---

## 🔒 SECURITY AUDIT

### Row Level Security (RLS)
**File**: `supabase/migrations/034_all_rls_policies.sql`

- [ ] Players can only read/write their own data
- [ ] Players cannot see other players' private info
- [ ] Players cannot see which specific coaches viewed them (only counts)
- [ ] Message RLS prevents reading others' conversations
- [ ] Video RLS allows public read when recruiting_activated

### Authentication Flow
- [ ] Supabase Auth JWT validated
- [ ] Session refresh works
- [ ] Logout clears state
- [ ] Protected routes redirect to login

### Privacy
- [ ] Inactive recruiting = profile not visible to coaches
- [ ] Privacy settings honored in search results
- [ ] Contact info only shared with messaged coaches

---

## 🎨 UI/UX AUDIT

### Design System Compliance
**Reference**: `CLAUDE.md` Design System section

- [ ] Glassmorphism cards used consistently
- [ ] Primary green (`#16A34A`) for CTAs
- [ ] Cream background (`#FFFEFA`)
- [ ] Consistent typography (Inter)
- [ ] Proper spacing (p-6, gap-6)

### Player-Specific UX
- [ ] **Young User Friendly**: Simple language, clear actions
- [ ] **Parent Mode**: Way for parents to help manage (future?)
- [ ] **Achievement Gamification**: Profile completion progress
- [ ] **Empty States**: Helpful when no data
- [ ] **Error Messages**: Friendly, actionable

### Mobile Experience
- [ ] Dashboard responsive
- [ ] Profile editor works on phone
- [ ] Video upload from mobile
- [ ] Messages work on mobile

---

## ⚡ PERFORMANCE AUDIT

### Query Optimization
- [ ] Dashboard uses consolidated hook
- [ ] Profile loads quickly
- [ ] Video thumbnails lazy load
- [ ] Analytics charts performant

### Client Performance
- [ ] Images optimized
- [ ] Bundle size reasonable
- [ ] No unnecessary re-renders

---

## 🧪 TESTING AUDIT

### Critical Player Flows to Test
1. **Signup → Onboarding → Dashboard**
2. **Profile Edit → Save → Verify**
3. **Video Upload → Process → Display**
4. **Receive Message → Read → Reply**
5. **Activate Recruiting → Profile Visible**
6. **Camp Registration → Confirmation**

### Test Coverage Needed
- [ ] E2E: Complete onboarding flow
- [ ] E2E: Profile editing
- [ ] E2E: Messaging
- [ ] Integration: Video upload
- [ ] Unit: Profile completion calculation

---

## 📝 KNOWN ISSUES FROM TODO.md

### Player-Related Issues:
1. **Empty catch block in journey/page.tsx:105** - Errors silently swallowed
2. **console.error in player/page.tsx:176** - Remove before production
3. **Missing detail pages**:
   - `/baseball/dashboard/profile/[id]`
   - `/baseball/dashboard/videos/[id]`
   - `/baseball/dashboard/colleges/[id]`
   - `/baseball/dashboard/journey/[id]`

### Navigation Issues:
- `/baseball/player/[id]` not linked from anywhere
- `/baseball/dashboard/journey` not linked from anywhere

---

## 📋 OUTPUT FORMAT

After completing this audit, generate a report with:

1. **Executive Summary**: Overall production readiness score (0-100%)
2. **Critical Blockers**: Must-fix before launch
3. **High Priority**: Should fix before launch
4. **Medium Priority**: Can fix post-launch
5. **Low Priority**: Nice-to-have improvements
6. **User Experience Issues**: Specific UX problems found
7. **Security Concerns**: Any security issues identified
8. **Estimated Effort**: Time estimates per item (hours)

Save the report to: `docs/audits/PLAYER_DASHBOARD_AUDIT_REPORT.md`

---

## 🔄 AUDIT COMMANDS

```bash
# Run type checking
npm run typecheck

# Run linting
npm run lint

# Build to check for errors
npm run build

# Check for unused exports
npx ts-prune

# Run existing tests
npm test

# Test profile completion function
# Connect to Supabase and run:
SELECT calculate_profile_completion(p.*) as completion
FROM baseball_players p
WHERE id = 'your-test-player-id';
```

---

## 📱 PLAYER PERSONAS TO TEST

### 1. New HS Player
- Just signed up
- No profile data
- Not recruiting activated
- Expected: See onboarding, then team dashboard

### 2. Active HS Recruit
- Profile complete
- Recruiting activated
- Has videos
- Expected: Full recruiting dashboard with analytics

### 3. Committed Player
- Has commitment
- Still want to access platform
- Expected: Special committed state UI

### 4. College Player
- On college team
- No recruiting (transfer portal separate)
- Expected: Team mode only, no recruiting features

### 5. JUCO Transfer
- On JUCO team
- Recruiting for 4-year school
- Expected: Both team and recruiting modes

---

**Start the audit now. Focus on the player experience. Be thorough and document everything.**

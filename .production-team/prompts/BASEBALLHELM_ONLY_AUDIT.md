# ⚾ BaseballHelm-Only Production Audit

## 🎯 Mission: Complete BaseballHelm Audit

You are running a **BaseballHelm-focused production audit** with all three agents. **Ignore GolfHelm completely** for this round - we'll audit it separately.

## Scope: BaseballHelm ONLY

### Database Tables (Baseball)
```
profiles
coaches
players
programs
rosters
conversations
messages
coach_philosophy
recruiting_pipeline
player_stats
+ any other baseball-specific tables
```

### Routes (Baseball)
```
src/app/baseball/*
src/components/baseball/*
All baseball-specific features
```

### Features (Baseball)
```
✓ Player profile creation & editing
✓ Recruiting pipeline (stages: new, contacted, evaluating, offer, commit)
✓ College coach dashboard
✓ High school coach dashboard
✓ Player search & discovery
✓ Messaging between coaches/players
✓ CoachHelm AI integration
✓ Onboarding flows (by role)
✓ Program profiles
✓ Roster management
```

## 🛡️ Database Sentinel - BaseballHelm Focus

### Execute These Queries:

```sql
-- 1. Enumerate all baseball tables
SELECT table_name, 
       (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name NOT LIKE 'golf_%'
ORDER BY table_name;

-- 2. Check RLS on baseball tables (CRITICAL)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'golf_%'
ORDER BY tablename;

-- 3. Get all RLS policies for baseball tables
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename NOT LIKE 'golf_%'
ORDER BY tablename, policyname;

-- 4. Find baseball tables WITHOUT RLS (P0 CRITICAL)
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'golf_%'
  AND rowsecurity = false;

-- 5. Check profiles table (critical)
SELECT 
  COUNT(*) as total_profiles,
  COUNT(DISTINCT role) as unique_roles,
  COUNT(*) FILTER (WHERE role = 'college_coach') as college_coaches,
  COUNT(*) FILTER (WHERE role = 'high_school_coach') as hs_coaches,
  COUNT(*) FILTER (WHERE role = 'player') as players
FROM profiles;

-- 6. Check for orphaned profiles
SELECT id, email, role FROM auth.users 
WHERE id NOT IN (SELECT user_id FROM profiles);

-- 7. Check recruiting pipeline integrity
SELECT 
  COUNT(*) as total_pipeline_items,
  stage,
  COUNT(*) as count_per_stage
FROM recruiting_pipeline
GROUP BY stage
ORDER BY stage;

-- 8. Check conversations/messages integrity
-- Orphaned messages?
SELECT COUNT(*) as orphaned_messages
FROM messages 
WHERE conversation_id NOT IN (SELECT id FROM conversations);

-- Conversations with no participants?
SELECT id FROM conversations
WHERE id NOT IN (SELECT conversation_id FROM conversation_participants);

-- 9. Check coaches table
SELECT 
  COUNT(*) as total_coaches,
  COUNT(DISTINCT program_id) as unique_programs,
  COUNT(*) FILTER (WHERE program_id IS NULL) as coaches_without_program
FROM coaches;

-- 10. Check players table
SELECT 
  COUNT(*) as total_players,
  COUNT(*) FILTER (WHERE grad_year IS NULL) as missing_grad_year,
  COUNT(*) FILTER (WHERE position IS NULL) as missing_position
FROM players;

-- 11. Performance check - recruiting pipeline queries
EXPLAIN ANALYZE
SELECT p.*, pl.name, pl.position, pl.grad_year
FROM recruiting_pipeline p
JOIN players pl ON p.player_id = pl.id
WHERE p.coach_id = 'some-coach-id'
ORDER BY p.updated_at DESC;

-- 12. Check indexes on high-traffic tables
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'coaches', 'players', 'recruiting_pipeline', 'messages')
ORDER BY tablename;
```

### Focus Areas:
- ✅ RLS on profiles, coaches, players, recruiting_pipeline, messages
- ✅ Role-based access (college coach sees different data than player)
- ✅ Recruiting pipeline stage transitions
- ✅ Message/conversation integrity
- ✅ Foreign key relationships (coach → program, player → coach)
- ✅ Performance on recruiting queries (often complex joins)

## 🎯 Feature Maestro - BaseballHelm Focus

### Routes to Audit:

```bash
# Find all baseball routes
find src/app/baseball -type d -name "(" -prune -o -type d -print

# Expected routes:
# /baseball
# /baseball/dashboard (college-coach, hs-coach, player variants)
# /baseball/players
# /baseball/players/[playerId]
# /baseball/coaches
# /baseball/programs
# /baseball/programs/[programId]
# /baseball/recruiting
# /baseball/messages
# /baseball/settings
```

### Features Completeness Checklist:

#### 1. Player Profile Management
```typescript
Happy Path:
- [ ] Create player profile
- [ ] Edit profile details
- [ ] Upload player photo
- [ ] Add stats/achievements
- [ ] Make profile public/private

Edge Cases:
- [ ] Create profile with minimal data?
- [ ] Upload oversized photo?
- [ ] Invalid grad year (past)?
- [ ] XSS in bio field?
- [ ] Two users edit simultaneously?

States:
- [ ] Loading state during save
- [ ] Error state for validation failures
- [ ] Empty state for new profile
- [ ] Success confirmation
```

#### 2. Recruiting Pipeline
```typescript
Happy Path:
- [ ] Add player to pipeline
- [ ] Move through stages (new → contacted → evaluating → offer → commit)
- [ ] Add notes to player
- [ ] Filter/sort pipeline
- [ ] Export pipeline data

Edge Cases:
- [ ] Move backwards in stages?
- [ ] Delete player from pipeline?
- [ ] Multiple coaches track same player?
- [ ] Player rejects offer (move to "declined")?
- [ ] Large pipeline (500+ players)?

States:
- [ ] Loading skeleton for pipeline view
- [ ] Error state if update fails
- [ ] Empty state for new coach
- [ ] Drag-and-drop feedback
- [ ] Stage transition animation
```

#### 3. Messaging System
```typescript
Happy Path:
- [ ] Send message to player
- [ ] Receive message from coach
- [ ] View conversation history
- [ ] Mark as read
- [ ] Delete conversation

Edge Cases:
- [ ] Send to blocked user?
- [ ] Message with attachments?
- [ ] Very long message (10k chars)?
- [ ] Send while offline?
- [ ] Conversation with deleted user?

States:
- [ ] Loading messages
- [ ] Error state if send fails
- [ ] Empty state for new conversation
- [ ] Typing indicator
- [ ] Message delivered/read status
```

#### 4. College Coach Dashboard
```typescript
Happy Path:
- [ ] View recruiting pipeline
- [ ] See upcoming events
- [ ] Access program analytics
- [ ] Manage team roster

Edge Cases:
- [ ] Dashboard with no players in pipeline?
- [ ] Coach with multiple programs?
- [ ] Coach not associated with program?
- [ ] Data refresh on navigation back?

States:
- [ ] Loading dashboard widgets
- [ ] Error state if analytics fail
- [ ] Empty states for each widget
```

#### 5. Player Search & Discovery
```typescript
Happy Path:
- [ ] Search by name, position, grad year
- [ ] Filter by location, stats
- [ ] View search results
- [ ] Click to view player profile
- [ ] Add player to recruiting pipeline

Edge Cases:
- [ ] Search with no results?
- [ ] Search with 1000+ results?
- [ ] Special characters in search?
- [ ] Filter combination yields no results?
- [ ] Slow search response?

States:
- [ ] Loading search results
- [ ] Error state if search fails
- [ ] Empty state for no results
- [ ] Filter application feedback
```

### Baseball-Specific User Journeys:

```
COLLEGE COACH JOURNEY:
1. Sign up → Select "College Coach" → Link to Program
2. Dashboard → Search Players → Add to Pipeline
3. Contact Player → Message Exchange → Move to "Evaluating"
4. Schedule Visit → Move to "Offer" → Player Commits
5. View Team Roster → Export Recruiting Report

Test EACH step for:
- Happy path works ✅
- Error handling present ✅
- Loading states smooth ✅
- Empty states helpful ✅
- Mobile-friendly ✅
- Role permissions correct ✅
```

```
PLAYER JOURNEY:
1. Sign up → Select "Player" → Create Profile
2. Dashboard → View Programs → Browse Opportunities
3. Receive Message from Coach → Respond
4. Update Stats → Make Profile Public
5. Receive Offer → Accept/Decline

Test EACH step for:
- Happy path works ✅
- Error handling present ✅
- Loading states smooth ✅
- Empty states helpful ✅
- Mobile-friendly ✅
```

## ✨ Experience Architect - BaseballHelm Focus

### Baseball Components to Audit:

```bash
# Find all baseball-specific components
find src/components -name "*baseball*" -o -name "*Baseball*"
find src/app/baseball -name "*.tsx"
```

### Design Consistency Checks:

#### 1. Glassmorphism Application
```typescript
// Check these baseball components:
- CollegeCoachDashboard
- RecruitingPipeline
- PlayerCard
- ProgramCard
- MessageThread
- PlayerProfile
- StatsDisplay

// Each should have:
className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border border-gray-200/20 shadow-xl"
```

#### 2. Kelly Green Usage
```typescript
// Kelly green should be in:
- Primary CTAs (Add to Pipeline, Send Message, Create Profile)
- Active pipeline stages
- Success states (profile saved, message sent)
- Focus rings

// Verify in baseball routes:
grep -r "green-500\|#22c55e\|emerald-500" src/app/baseball/
```

#### 3. Baseball-Specific UI Patterns
```
Recruiting Pipeline:
- Kanban board layout
- Drag-and-drop smooth
- Stage badges color-coded
- Player cards consistent

Player Cards:
- Photo prominent
- Key stats visible (position, grad year)
- CTA buttons accessible
- Hover state clear

Dashboard Widgets:
- Analytics charts premium
- Recent activity feed
- Quick actions accessible
```

#### 4. Dark Mode (Baseball)
```typescript
// Check all baseball pages for dark mode:
- src/app/baseball/page.tsx
- src/app/baseball/dashboard/page.tsx
- src/app/baseball/recruiting/page.tsx

// Verify:
- Dark sidebar consistent
- Cards use dark glassmorphism
- Pipeline stages readable
- Text contrast passes WCAG
- Kelly green still pops
```

#### 5. Mobile Experience (Baseball)
```
Baseball-specific mobile needs:
- Pipeline usable on mobile (maybe list view instead of kanban?)
- Player cards stack well
- Messaging optimized for thumb
- Search filters accessible
- Profile forms mobile-friendly
```

### Baseball vs Golf Consistency:

```markdown
| Element | BaseballHelm | GolfHelm | Match? |
|---------|--------------|----------|--------|
| Sidebar | Dark glassmorphism | ? | ? |
| Primary button | Kelly green | ? | ? |
| Card style | Glassmorphism | ? | ? |
| Dark mode | Intentional | ? | ? |
| Typography | Inter font | ? | ? |

Goal: 100% design consistency
```

## 📊 Expected Output

Save findings to:
```
.production-team/BASEBALLHELM_AUDIT_ROUND_XX/
├── 01_DATABASE_SENTINEL_BASEBALL.md
├── 02_FEATURE_MAESTRO_BASEBALL.md
├── 03_EXPERIENCE_ARCHITECT_BASEBALL.md
├── 04_BASEBALL_SYNTHESIS.md
└── 05_BASEBALL_ACTION_ITEMS.md
```

## 🎯 Success Criteria for BaseballHelm

- [ ] All baseball tables have RLS enabled
- [ ] Recruiting pipeline fully functional
- [ ] All role-based journeys complete (college coach, HS coach, player)
- [ ] Messaging system robust
- [ ] All edge cases handled
- [ ] Error/loading/empty states present
- [ ] Design consistency with golf
- [ ] Glassmorphism + kelly green applied
- [ ] Dark mode works perfectly
- [ ] Mobile experience optimized
- [ ] Accessibility WCAG 2.1 AA

## 🚀 After BaseballHelm Audit Complete

Compare with GolfHelm audit results to ensure cross-platform consistency.

---

**Focus:** BaseballHelm ONLY  
**Ignore:** GolfHelm (audit separately)  
**Goal:** Production-ready BaseballHelm at 95+ score

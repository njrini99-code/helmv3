# USER ROLE & DATA OWNERSHIP MAPPING
> PHASE 2 AUDIT REPORT
> Generated: 2026-01-01
> Verified against live Supabase database

---

## EXECUTIVE SUMMARY

| Metric | Baseball | Golf | Total |
|--------|----------|------|-------|
| Users | 10 | 9 | **19** |
| Coaches | 1 | 5 | **6** |
| Players | 39 | 4 | **43** |
| Teams | 0 | 10 | **10** |
| Organizations | 0 | 11 | **11** |

---

## SECTION 1: USER ROLE HIERARCHY

### 1.1 Role Enum Values

```typescript
// From src/lib/types/index.ts
type UserRole = 'coach' | 'player';
type CoachType = 'college' | 'high_school' | 'juco' | 'showcase';
type PlayerType = 'high_school' | 'showcase' | 'juco' | 'college';
```

### 1.2 Role Distribution (Verified)

| Role | Count | Percentage |
|------|-------|------------|
| Coach | 6 | 31.6% |
| Player | 13 | 68.4% |
| **Total** | **19** | 100% |

| Sport | Count | Percentage |
|-------|-------|------------|
| Baseball | 10 | 52.6% |
| Golf | 9 | 47.4% |

### 1.3 Coach Type Distribution

**Baseball Coaches:**
| Type | Count |
|------|-------|
| college | 1 |
| high_school | 0 |
| juco | 0 |
| showcase | 0 |
| **Total** | **1** |

**Golf Coaches:**
| Metric | Count |
|--------|-------|
| Total | 5 |
| With Team | 3 |
| With Organization | 3 |

### 1.4 Player Type Distribution

**Baseball Players:**
| Type | Count |
|------|-------|
| high_school | 39 |
| showcase | 0 |
| juco | 0 |
| college | 0 |
| **Total** | **39** |

**Golf Players:**
| Metric | Count |
|--------|-------|
| Total | 4 |
| With Team | 0 |

### 1.5 Recruiting Activation Status

| Status | Count | Percentage |
|--------|-------|------------|
| Activated | 30 | 76.9% |
| Not Activated | 9 | 23.1% |
| **Total** | **39** | 100% |

---

## SECTION 2: DATA OWNERSHIP MODEL

### 2.1 Primary Ownership Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA OWNERSHIP MODEL                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐                                                        │
│  │  USER    │  id = auth.uid()                                       │
│  │ (users)  │  owns → role, sport, email                             │
│  └────┬─────┘                                                        │
│       │                                                              │
│       ├──────────────────────┬───────────────────────┐               │
│       │                      │                       │               │
│       ▼                      ▼                       ▼               │
│  ┌──────────┐          ┌──────────┐           ┌───────────┐          │
│  │  COACH   │          │  PLAYER  │           │GOLF_COACH │          │
│  │(coaches) │          │(players) │           │           │          │
│  └────┬─────┘          └────┬─────┘           └─────┬─────┘          │
│       │                     │                       │                │
│       │ owns:               │ owns:                 │ owns:          │
│       │ • watchlists        │ • videos              │ • golf_events  │
│       │ • coach_notes       │ • player_settings     │ • golf_rounds  │
│       │ • camps             │ • player_metrics      │                │
│       │ • dev_plans         │ • achievements        │                │
│       │ • events            │ • recruiting_interests│                │
│       │                     │                       │                │
│       │ manages:            │ member of:            │ manages:       │
│       │ • organizations     │ • teams (via          │ • golf_teams   │
│       │ • teams             │   team_members)       │ • golf_players │
│       │                     │                       │                │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Ownership Column Mapping

| Table | Ownership Column | Type | Description |
|-------|-----------------|------|-------------|
| `users` | `id` | UUID | Links to `auth.uid()` |
| `coaches` | `user_id` | UUID | FK to users.id |
| `players` | `user_id` | UUID | FK to users.id |
| `golf_coaches` | `user_id` | UUID | FK to users.id |
| `golf_players` | `user_id` | UUID | FK to users.id |
| `watchlists` | `coach_id` | UUID | FK to coaches.id |
| `videos` | `player_id` | UUID | FK to players.id |
| `coach_notes` | `coach_id` | UUID | FK to coaches.id |
| `camps` | `coach_id` | UUID | FK to coaches.id |
| `developmental_plans` | `coach_id` | UUID | Creator (coach) |
| `developmental_plans` | `player_id` | UUID | Recipient (player) |
| `team_members` | `player_id` | UUID | FK to players.id |
| `team_members` | `team_id` | UUID | FK to teams.id |

---

## SECTION 3: RLS POLICIES BY TABLE

### 3.1 Users Table

| Policy | Command | Condition |
|--------|---------|-----------|
| Users can read own data | SELECT | `auth.uid() = id` |
| Users can insert own profile | INSERT | `auth.role() = 'authenticated' AND auth.uid() = id` |
| Users can update own data | UPDATE | `auth.uid() = id` |

### 3.2 Coaches Table (Baseball)

| Policy | Command | Condition |
|--------|---------|-----------|
| Users can read own coach profile | SELECT | `auth.uid() = user_id` |
| Users can insert own coach profile | INSERT | `auth.uid() = user_id` |
| Users can update own coach profile | UPDATE | `auth.uid() = user_id` |
| Anyone can view coach profiles | SELECT | `true` (public) |

### 3.3 Players Table (Baseball)

| Policy | Command | Condition |
|--------|---------|-----------|
| Users can read own player profile | SELECT | `auth.uid() = user_id` |
| Users can insert own player profile | INSERT | `auth.uid() = user_id` |
| Users can update own player profile | UPDATE | `auth.uid() = user_id` |
| Coaches can view all players | SELECT | `users.role = 'coach'` |

### 3.4 Golf Coaches Table

| Policy | Command | Condition |
|--------|---------|-----------|
| Users can read own golf coach profile | SELECT | `auth.uid() = user_id` |
| Users can insert own golf coach profile | INSERT | `auth.uid() = user_id` |
| Users can update own golf coach profile | UPDATE | `auth.uid() = user_id` |

### 3.5 Golf Players Table

| Policy | Command | Condition |
|--------|---------|-----------|
| Users can read own golf player profile | SELECT | `auth.uid() = user_id` |
| Users can insert own golf player profile | INSERT | `auth.uid() = user_id` |
| Users can update own golf player profile | UPDATE | `auth.uid() = user_id` |

### 3.6 Organizations Table

| Policy | Command | Condition |
|--------|---------|-----------|
| Coaches can create organizations | INSERT | `users.role = 'coach'` |
| Authenticated users can read organizations | SELECT | `auth.role() = 'authenticated'` |
| Coaches can update own organization | UPDATE | Coach linked via `organization_id` |

### 3.7 Teams Table

| Policy | Command | Condition |
|--------|---------|-----------|
| Users can view their own teams | SELECT | Player is member OR Coach is in org |

### 3.8 Golf Teams Table

| Policy | Command | Condition |
|--------|---------|-----------|
| Users can view their golf teams | SELECT | Coach or Player linked via `team_id` |
| Golf coaches can insert teams | INSERT | `users.role = 'coach'` |
| Golf coaches can update their team | UPDATE | Coach linked via `team_id` |

---

## SECTION 4: ROLE-TO-ROUTE ACCESS MATRIX

### 4.1 Baseball Routes by Role

| Route | College Coach | HS Coach | JUCO Coach | Showcase Coach | Player |
|-------|--------------|----------|------------|----------------|--------|
| `/baseball/dashboard` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/baseball/dashboard/discover` | ✅ | ❌ | ✅* | ❌ | ❌ |
| `/baseball/dashboard/watchlist` | ✅ | ❌ | ✅* | ❌ | ❌ |
| `/baseball/dashboard/pipeline` | ✅ | ❌ | ✅* | ❌ | ❌ |
| `/baseball/dashboard/compare` | ✅ | ❌ | ✅* | ❌ | ❌ |
| `/baseball/dashboard/camps` | ✅ | ❌ | ❌ | ❌ | ✅† |
| `/baseball/dashboard/roster` | ❌ | ✅ | ✅ | ✅ | ❌ |
| `/baseball/dashboard/videos` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `/baseball/dashboard/dev-plans` | ❌ | ✅ | ✅ | ✅ | ❌ |
| `/baseball/dashboard/dev-plan` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/baseball/dashboard/college-interest` | ❌ | ✅ | ✅ | ❌ | ❌ |
| `/baseball/dashboard/academics` | ❌ | ❌ | ✅ | ❌ | ❌ |
| `/baseball/dashboard/teams` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `/baseball/dashboard/events` | ❌ | ❌ | ❌ | ✅ | ❌ |
| `/baseball/dashboard/colleges` | ❌ | ❌ | ❌ | ❌ | ✅† |
| `/baseball/dashboard/journey` | ❌ | ❌ | ❌ | ❌ | ✅† |
| `/baseball/dashboard/analytics` | ❌ | ❌ | ❌ | ❌ | ✅† |
| `/baseball/dashboard/profile` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `/baseball/dashboard/program` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `/baseball/dashboard/calendar` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/baseball/dashboard/messages` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `/baseball/dashboard/settings` | ✅ | ✅ | ✅ | ✅ | ✅ |

*JUCO coaches: Only in "recruiting mode"
†Players: Only with `recruiting_activated = true`

### 4.2 Middleware-Enforced Route Protection

```typescript
// From src/lib/supabase/middleware.ts
const RECRUITING_ROUTES = [
  '/baseball/dashboard/discover',
  '/baseball/dashboard/watchlist',
  '/baseball/dashboard/pipeline',
  '/baseball/dashboard/compare',
  '/baseball/dashboard/camps',
];

const RECRUITING_ALLOWED_COACH_TYPES = ['college', 'juco'];
```

### 4.3 Mode Toggle Logic

| User Type | Has Mode Toggle? | Modes Available |
|-----------|-----------------|-----------------|
| College Coach | ❌ | Recruiting only |
| HS Coach | ❌ | Team only |
| JUCO Coach | ✅ | Recruiting ↔ Team |
| Showcase Coach | ❌ | Organization/Team only |
| Player (recruiting activated) | ✅ | Recruiting ↔ Team |
| Player (not activated) | ❌ | Team only |
| College Player | ❌ | Team only (no recruiting) |

---

## SECTION 5: CROSS-SPORT ACCESS CONTROL

### 5.1 Sport Column Usage

| Location | How Sport is Determined |
|----------|------------------------|
| Signup | `user_metadata.sport` set in signup action |
| Login | Redirect based on `users.sport` column |
| Middleware | `getSportFromPath()` extracts from URL |
| Sidebar | `pathname.startsWith('/golf')` check |

### 5.2 Cross-Sport Prevention

| Scenario | Prevented By |
|----------|-------------|
| Golf user accessing /baseball/dashboard | Client-side redirect in layout |
| Baseball user accessing /golf/dashboard | Client-side redirect in layout |
| Wrong sport profile creation | Trigger checks `user_metadata.sport` |

---

## SECTION 6: CAPABILITY MATRIX BY COACH TYPE

### 6.1 Full Capability Breakdown

| Capability | College | HS | JUCO | Showcase |
|------------|---------|-----|------|----------|
| **Recruiting** |||||
| Search/filter players | ✅ | ❌ | ✅* | ❌ |
| Add to watchlist | ✅ | ❌ | ✅* | ❌ |
| Manage pipeline | ✅ | ❌ | ✅* | ❌ |
| Compare players | ✅ | ❌ | ✅* | ❌ |
| Create camps | ✅ | ❌ | ❌ | ❌ |
| **Team Management** |||||
| View roster | ❌ | ✅ | ✅ | ✅ |
| Manage roster | ❌ | ✅ | ✅ | ✅ |
| Create dev plans | ❌ | ✅ | ✅ | ✅ |
| Upload videos | ❌ | ✅ | ✅ | ✅ |
| Track college interest | ❌ | ✅ | ✅ | ❌ |
| Track academics | ❌ | ❌ | ✅ | ❌ |
| **Organization** |||||
| Manage multiple teams | ❌ | ❌ | ❌ | ✅ |
| Create events | ❌ | ❌ | ❌ | ✅ |
| **Common** |||||
| View program profile | ✅ | ✅ | ✅ | ✅ |
| Manage calendar | ✅ | ✅ | ✅ | ✅ |
| Send messages | ✅ | ✅ | ✅ | ✅ |
| Update settings | ✅ | ✅ | ✅ | ✅ |

*Only in recruiting mode

### 6.2 Player Capability Matrix

| Capability | HS Player | Showcase Player | JUCO Player | College Player |
|------------|-----------|-----------------|-------------|----------------|
| **Recruiting** (if activated) |||||
| View colleges | ✅ | ✅ | ✅ | ❌ |
| Track journey | ✅ | ✅ | ✅ | ❌ |
| Browse camps | ✅ | ✅ | ✅ | ❌ |
| View analytics | ✅ | ✅ | ✅ | ❌ |
| Message coaches | ✅ | ✅ | ✅ | ❌ |
| **Team** |||||
| View schedule | ✅ | ✅ | ✅ | ✅ |
| Upload videos | ✅ | ✅ | ✅ | ✅ |
| View dev plan | ✅ | ✅ | ✅ | ✅ |
| Team messages | ✅ | ✅ | ✅ | ✅ |
| **Multi-Team** |||||
| Join multiple teams | ✅ | ✅ | ❌ | ❌ |
| Max teams | 2 | 2 | 1 | 1 |

---

## SECTION 7: DATA ACCESS PATTERNS

### 7.1 Read Access Patterns

| Actor | Can Read | Condition |
|-------|----------|-----------|
| Any Coach | All players | `recruiting_activated = true` |
| Coach | Own watchlist | `coach_id` matches |
| Coach | Own notes | `coach_id` matches |
| Coach | Own org teams | `organization_id` matches |
| Player | Own profile | `user_id` matches |
| Player | Own videos | `player_id` matches |
| Player | Own dev plans | `player_id` matches |
| Player | Own team(s) | Via `team_members` |

### 7.2 Write Access Patterns

| Actor | Can Create | Condition |
|-------|------------|-----------|
| Coach | Watchlist entries | Own `coach_id` |
| Coach | Notes on players | Own `coach_id` |
| Coach | Dev plans | Own `coach_id`, any player |
| Coach | Camps | College coaches only |
| Coach | Organizations | Any coach |
| Player | Videos | Own `player_id` |
| Player | Profile updates | Own `user_id` |

---

## SECTION 8: IDENTIFIED ISSUES

### 8.1 Missing RLS Policies

| Table | Issue | Severity |
|-------|-------|----------|
| `videos` | No explicit RLS detected | HIGH |
| `coach_notes` | No explicit RLS detected | HIGH |
| `camps` | No explicit RLS detected | MEDIUM |
| `camp_registrations` | No explicit RLS detected | MEDIUM |
| `messages` | No explicit RLS detected | HIGH |
| `conversations` | No explicit RLS detected | HIGH |
| `notifications` | No explicit RLS detected | LOW |

### 8.2 Golf-Specific Gaps

| Issue | Description | Severity |
|-------|-------------|----------|
| No golf player discovery | Golf coaches can't browse golf players | MEDIUM |
| No golf recruiting features | No watchlist/pipeline for golf | LOW (by design) |
| Golf players not on teams | 0 of 4 players have team_id | DATA ISSUE |

### 8.3 Route-Level Issues

| Issue | Description | Severity |
|-------|-------------|----------|
| No middleware role check for golf | Golf routes only check auth, not role | MEDIUM |
| Orphaned golf dashboard routes | Routes exist but not in sidebar | LOW |

---

## SECTION 9: RECOMMENDATIONS

### 9.1 Critical (Fix Immediately)

1. **Add RLS to messaging tables** - `messages`, `conversations` need user-based RLS
2. **Add RLS to videos table** - Players should only access own videos
3. **Add RLS to coach_notes** - Coaches should only access own notes

### 9.2 High Priority

1. **Add golf route protection** - Mirror baseball's coach_type checks
2. **Fix golf player team assignments** - All 4 golf players have null team_id
3. **Add RLS to camps** - Only camp creator should update

### 9.3 Medium Priority

1. **Add golf player discovery** - If coaches need to find players
2. **Connect orphaned routes** - Add missing sidebar navigation
3. **Add route-level authorization logging** - For audit trail

---

## APPENDIX A: TYPE GUARDS

```typescript
// From src/lib/types/index.ts
export function isPlayer(user: User): boolean {
  return user.role === 'player';
}

export function isCoach(user: User): boolean {
  return user.role === 'coach';
}

export function isCollegeCoach(coach: Coach): boolean {
  return coach.coach_type === 'college';
}

export function isHighSchoolCoach(coach: Coach): boolean {
  return coach.coach_type === 'high_school';
}

export function isJUCOCoach(coach: Coach): boolean {
  return coach.coach_type === 'juco';
}

export function isShowcaseCoach(coach: Coach): boolean {
  return coach.coach_type === 'showcase';
}

export function canCoachRecruit(coach: Coach): boolean {
  return coach.coach_type === 'college' || coach.coach_type === 'juco';
}

export function canPlayerRecruit(player: Player): boolean {
  return player.player_type !== 'college';
}

export function isRecruitingActivated(player: Player): boolean {
  return player.recruiting_activated === true;
}

export function canHaveMultipleTeams(playerType: PlayerType): boolean {
  return playerType === 'high_school' || playerType === 'showcase';
}
```

---

*End of User Role & Data Ownership Report*

# GolfHelm Feature Inventory

## Quick Reference for Feature Finisher Analysis

This inventory maps GolfHelm features to their implementation files for rapid analysis.

---

## Core Features

### 1. Authentication & Onboarding
**Files:**
- `/src/app/golf/actions/auth.ts`
- `/src/app/golf/(auth)/`
- `/src/app/golf/(onboarding)/`
- `/supabase/migrations/002_core_users_auth.sql`

**Current capabilities:**
- Email/password signup and login
- Role-based routing (coach vs player)
- Invite code system for team joining
- Rate limiting and account lockout

**Finishing questions:**
- SSO/OAuth (Google, Apple)?
- Password strength meter during signup?
- Email verification flow?
- "Remember me" functionality?
- Session management across devices?
- Impersonation for support (coach views as player)?

---

### 2. Calendar & Events
**Files:**
- `/src/app/golf/(dashboard)/dashboard/calendar/`
- `/src/app/golf/actions/availability-locking.ts`
- `/src/lib/calendar/` (availability, conflicts, rsvp, recurrence)
- `/supabase/migrations/030_golf_calendar.sql`
- `/supabase/migrations/023_golf_events.sql`

**Current capabilities:**
- Event CRUD
- RSVP system
- Conflict detection
- Calendar feeds

**Finishing questions:**
- Timezone handling for traveling teams?
- Weather integration for outdoor events?
- Travel time to venue?
- Two-way sync with Google/Apple Calendar?
- Recurring event patterns?
- Academic calendar awareness (finals, breaks)?
- Event templates for common types?
- Automatic departure time reminders?

---

### 3. Messaging
**Files:**
- `/src/app/golf/(dashboard)/dashboard/messages/`
- `/src/app/golf/actions/messages.ts`
- `/src/app/actions/messages.ts`
- `/supabase/migrations/025_golf_communication.sql`
- `/supabase/migrations/042_sport_specific_messaging_tables.sql`

**Current capabilities:**
- 1:1 conversations
- Read status tracking
- Real-time updates

**Finishing questions:**
- Group messaging for subsets (seniors, travel squad)?
- Team-wide channel (always-on chat room)?
- Media sharing (images, documents)?
- Message threading/replies?
- Message search?
- Typing indicators?
- Message reactions (👍, ✅)?
- Scheduled send?
- Do Not Disturb during class hours?
- Voice messages?
- Message pinning for important info?

---

### 4. Round Tracking
**Files:**
- `/src/app/golf/(dashboard)/dashboard/rounds/`
- `/src/app/golf/actions/golf.ts`
- `/supabase/migrations/021_golf_rounds.sql`

**Current capabilities:**
- Create/edit/delete rounds
- Basic scoring (total, to par)
- Link to qualifiers

**Finishing questions:**
- Live scoring during round (auto-save)?
- Course lookup/selection?
- Weather conditions at time of round?
- Playing partners tracking?
- Round comparison (this round vs average)?
- Share round with coach immediately?
- GPS course integration?
- Scorecard photo attachment?

---

### 5. Shot Tracking
**Files:**
- `/src/components/golf/ShotTrackingComprehensive.tsx`
- `/src/lib/utils/golf-stats-calculator-shots.ts`
- `/supabase/migrations/040_golf_shot_system.sql`

**Current capabilities:**
- Shot-by-shot entry
- Club, distance, result tracking
- Putt break tracking

**Finishing questions:**
- Visual shot tracer on hole diagram?
- GPS shot location (lat/long)?
- Auto-suggest club based on distance?
- Shot dispersion visualization?
- Pre-round game plan (target shots)?
- Post-round shot heatmap?
- Comparison to previous rounds on same hole?

---

### 6. Statistics
**Files:**
- `/src/app/golf/(dashboard)/dashboard/stats/`
- `/src/lib/utils/golf-stats-calculator-shots.ts`
- `/supabase/migrations/040_golf_shot_system.sql`

**Current capabilities:**
- 100+ calculated metrics
- Strokes gained
- Stats caching

**Finishing questions:**
- Stat trends over time (graphs)?
- Rolling averages (last 5, 10, 20 rounds)?
- Custom date range filtering?
- Benchmark against team average?
- Benchmark against division average?
- Export stats to PDF/CSV?
- Stat goals and tracking?
- "This stat is improving/declining" indicators?
- Stat explanations for players (what is GIR?)?

---

### 7. CoachHelm AI
**Files:**
- `/src/app/golf/actions/insights.ts`
- `/src/app/golf/actions/insights-v2.ts`
- `/src/lib/coachhelm/`
- `/supabase/migrations/031_golf_coachhelm.sql`

**Current capabilities:**
- Insight generation
- Coach philosophy settings
- Focus areas
- Round reviews

**Finishing questions:**
- Insight accuracy tracking (was it right?)?
- Trend detection (improving/declining)?
- Correlation discovery?
- Predictive scoring models?
- Lineup optimization suggestions?
- Practice prescription generation?
- Recruiting fit scoring?
- Mental game pattern detection?
- Course-specific insights?
- Weather impact analysis?

---

### 8. Qualifiers
**Files:**
- `/src/app/golf/(dashboard)/dashboard/qualifiers/`
- `/src/app/golf/(dashboard)/dashboard/my-qualifiers/`
- `/supabase/migrations/024_golf_qualifiers.sql`

**Current capabilities:**
- Qualifier creation
- Player entries
- Leaderboard calculation

**Finishing questions:**
- Live leaderboard during qualifier?
- Playoff handling for ties?
- Historical qualifier results?
- Qualification history per player?
- Cut line visualization?
- "Bubble" status indicators?
- Automatic team selection based on results?
- Qualifier vs tournament performance comparison?

---

### 9. Development (Focus Areas)
**Files:**
- `/src/app/golf/(dashboard)/dashboard/development/`
- `/src/app/golf/(dashboard)/dashboard/my-development/`
- `/src/app/golf/actions/development.ts`
- `/supabase/migrations/031_golf_coachhelm.sql`

**Current capabilities:**
- Focus area CRUD
- Progress tracking
- Coach assignment

**Finishing questions:**
- Suggested focus areas based on stats?
- Progress visualization (charts)?
- Linked drills/practice plans?
- Video attachment for technique work?
- Milestone celebrations?
- Focus area templates by weakness type?
- Integration with round reviews?
- Time-bound goals with deadlines?

---

### 10. Roster Management
**Files:**
- `/src/app/golf/(dashboard)/dashboard/roster/`
- `/src/app/golf/actions/roster.ts`
- `/supabase/migrations/020_golf_core.sql`

**Current capabilities:**
- Player list view
- Basic player profiles
- Team membership

**Finishing questions:**
- Player card with quick stats?
- Schedule view per player (avatar click)?
- Eligibility tracking?
- Medical/injury status?
- Emergency contact info?
- Academic eligibility status?
- Red-shirt tracking?
- Transfer portal status?
- Scholarship percentage tracking?
- Player comparison tool?

---

### 11. Documents
**Files:**
- `/src/app/golf/(dashboard)/dashboard/documents/`
- `/src/app/golf/actions/documents.ts`
- `/supabase/migrations/027_golf_documents.sql`

**Current capabilities:**
- Document upload
- Category organization
- Player visibility control

**Finishing questions:**
- Document versioning?
- Required acknowledgment tracking?
- E-signature collection?
- Document templates?
- Expiration dates (physicals, waivers)?
- Folder organization?
- Search within documents?
- Bulk upload?

---

### 12. Travel
**Files:**
- `/src/app/golf/(dashboard)/dashboard/travel/`
- `/src/app/golf/actions/travel.ts`
- `/supabase/migrations/028_golf_travel.sql`

**Current capabilities:**
- Itinerary creation
- Basic trip details
- Room assignments

**Finishing questions:**
- Flight tracking integration?
- Hotel confirmation auto-import?
- Packing list generator?
- Trip cost tracking/per diem?
- Meal planning?
- Ground transportation details?
- Practice round scheduling?
- Local emergency numbers?
- Weather forecast for destination?
- Team photo at course checklist?

---

### 13. Announcements
**Files:**
- `/src/app/golf/(dashboard)/dashboard/announcements/`
- `/supabase/migrations/025_golf_communication.sql`

**Current capabilities:**
- Broadcast messages
- Acknowledgment tracking
- Urgency levels

**Finishing questions:**
- Scheduled announcements?
- Announcement templates?
- Rich text formatting?
- Attachment support?
- Pin important announcements?
- Archive old announcements?
- Announcement categories/tags?
- Required vs optional acknowledgment?

---

### 14. Tasks
**Files:**
- `/src/app/golf/(dashboard)/dashboard/tasks/`
- `/supabase/migrations/026_golf_tasks.sql`

**Current capabilities:**
- Task creation
- Completion tracking
- Due dates

**Finishing questions:**
- Recurring tasks?
- Task templates?
- Sub-tasks?
- Task assignment to individuals vs team?
- Reminders before due date?
- Overdue escalation?
- Task categories?
- Completion streaks/gamification?

---

### 15. Classes (Academic Schedule)
**Files:**
- `/src/app/golf/(dashboard)/dashboard/classes/`
- `/supabase/migrations/029_golf_academics.sql`

**Current capabilities:**
- Class schedule entry
- Conflict detection integration
- Days/times tracking

**Finishing questions:**
- Semester auto-rollover?
- Finals week auto-detection?
- GPA tracking integration?
- Study hall scheduling?
- Professor contact info?
- Assignment due date tracking?
- Academic advisor integration?
- Eligibility warning system?

---

## Feature Interconnection Map

```
                    ┌──────────────┐
                    │   Calendar   │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌─────────┐      ┌──────────┐      ┌─────────┐
    │ Travel  │      │Qualifiers│      │ Classes │
    └─────────┘      └────┬─────┘      └─────────┘
                          │
                          ▼
                    ┌──────────┐
                    │  Rounds  │◄────────────┐
                    └────┬─────┘             │
                         │                   │
              ┌──────────┼──────────┐        │
              │          │          │        │
              ▼          ▼          ▼        │
         ┌────────┐ ┌─────────┐ ┌──────┐    │
         │ Shots  │ │  Stats  │ │Review│    │
         └────────┘ └────┬────┘ └──────┘    │
                         │                   │
                         ▼                   │
                   ┌───────────┐             │
                   │ CoachHelm │─────────────┘
                   └─────┬─────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
              ▼          ▼          ▼
         ┌────────┐ ┌─────────┐ ┌───────┐
         │Insights│ │ Focus   │ │ Notes │
         └────────┘ │ Areas   │ └───────┘
                    └─────────┘
```

---

## Finishing Priority Matrix

Use this to prioritize which features to finish first:

| Feature | User Impact | Current Layer | Effort to Next Layer |
|---------|-------------|---------------|----------------------|
| Calendar | High (daily use) | 2 | Medium (timezone, recurring) |
| Messaging | High (communication) | 2 | Low (group chat) |
| CoachHelm | High (competitive edge) | 2 | High (predictions) |
| Stats | High (core value) | 3 | Medium (visualization) |
| Rounds | High (core value) | 2 | Low (auto-save) |
| Qualifiers | Medium (seasonal) | 2 | Low (live leaderboard) |
| Travel | Medium (episodic) | 2 | Medium (integrations) |
| Development | Medium (ongoing) | 2 | Medium (suggestions) |
| Documents | Low (administrative) | 2 | Low (versioning) |
| Tasks | Low (administrative) | 1 | Low (recurring) |

**Recommended finishing order:**
1. Messaging (low effort, high impact)
2. Calendar (medium effort, high impact - timezone critical)
3. Rounds (low effort, high impact - auto-save)
4. Stats (medium effort, visible improvement)
5. CoachHelm (high effort, differentiator)

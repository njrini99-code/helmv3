# 🗄️ Complete Database Map - Helm Sports Labs

**Generated:** December 30, 2024
**Source:** Exported from live Supabase database
**Total Tables:** 77 tables
**Schema Size:** 6,074 lines

---

## 📊 Database Overview

### **Core Systems**
1. **Baseball System** (36 tables)
2. **Golf System** (27 tables)
3. **Shared Infrastructure** (14 tables)

---

## 🏀 BASEBALL SYSTEM TABLES

### **User & Authentication**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `users` | Supabase auth users | id, email, role |
| `coaches` | Baseball coach profiles | coach_type, organization_id |
| `players` | Baseball player profiles | player_type, grad_year, recruiting_activated |

### **Organizations & Teams**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `organizations` | Schools, colleges, programs | organization_type, name |
| `colleges` | College-specific data | division, conference |
| `high_schools` | High school data | name, city, state |
| `teams` | Team records | team_type, head_coach_id, organization_id |
| `team_members` | Player-team relationships | team_id, player_id, status |
| `team_coach_staff` | Multi-coach teams | team_id, coach_id, role |
| `team_invitations` | Join links | code, team_id, expires_at |

### **Recruiting & Pipeline**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `watchlists` | Coach's recruiting pipeline | coach_id, player_id, pipeline_stage |
| `coach_notes` | Private player notes | coach_id, player_id, content |
| `recruiting_interests` | Player's college list | player_id, college_id, interest_level |
| `player_comparisons` | Saved comparisons | coach_id, player_ids, comparison_data |

**Pipeline Stages Enum:**
```sql
'watchlist' | 'high_priority' | 'contacted' | 'campus_visit' |
'offer_extended' | 'committed' | 'uninterested'
```

### **Player Data**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `player_metrics` | Additional measurables | player_id, metric_label, metric_value |
| `player_achievements` | Awards, honors | player_id, title, date |
| `player_settings` | Privacy & preferences | user_id, recruiting_activated, privacy_level |
| `player_engagement_events` | Profile views, etc. | player_id, coach_id, event_type |
| `profile_views` | Who viewed profile | viewer_id, profile_id, timestamp |

### **Video & Media**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `videos` | Player videos + clips | player_id, video_type, duration, is_clip, parent_video_id |
| `video_views` | Video analytics | video_id, viewer_id, watch_duration |

### **Development & Training**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `developmental_plans` | Coach-created plans | coach_id, player_id, goals, drills, status |

### **Events & Calendar**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `events` | Team events | team_id, title, start_time, event_type |
| `coach_calendar_events` | Coach personal calendar | coach_id, title, start_time |
| `camps` | Recruiting camps | coach_id, name, start_date, max_participants |
| `camp_registrations` | Camp signups | camp_id, player_id, status |

### **Messaging**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `conversations` | Conversation threads | sport, team_id, golf_team_id |
| `conversation_participants` | Who's in conversation | conversation_id, user_id |
| `messages` | Individual messages | conversation_id, sender_id, content |

### **Notifications**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `notifications` | User notifications | user_id, type, title, data, read |

### **Security**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `login_attempts` | Rate limiting | email, failed_attempts, locked_until |

### **Marketing**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `demo_requests` | Landing page signups | email, role, organization_name |

---

## ⛳ GOLF SYSTEM TABLES

### **Users & Teams**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_coaches` | Golf coach profiles | user_id, team_id |
| `golf_players` | Golf player profiles | user_id, team_id, handicap, player_year |
| `golf_teams` | Golf teams | organization_id, name, season |
| `golf_organizations` | Golf programs | name, division, conference |

### **Rounds & Scoring**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_rounds` | Golf rounds | player_id, course_id, round_type, total_score |
| `golf_holes` | Individual holes | round_id, hole_number, score, putts, fairway_hit |
| `golf_shots` | Shot tracking | hole_id, shot_number, club, distance |
| `golf_hole_shots` | Detailed shot data | hole_id, shot_order, club_used |
| `round_holes` | Round-hole relationship | round_id, hole_id, score |

### **Courses**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_courses` | Golf courses | name, city, state, par |
| `golf_course_holes` | Course hole layout | course_id, hole_number, par, yardage |
| `golf_course_tees` | Tee box data | course_id, tee_name, rating, slope |

### **Qualifiers & Competition**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_qualifiers` | Team qualifiers | team_id, name, date, status |
| `golf_qualifier_entries` | Who's in qualifier | qualifier_id, player_id, score, rank |

### **Classes & Academics**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_player_classes` | Player class schedules | player_id, class_name, professor, days_of_week |

### **Events & Calendar**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_events` | Team events | team_id, title, event_type, start_time |
| `golf_event_attendance` | Who's attending | event_id, player_id, status |
| `golf_travel_itineraries` | Travel plans | event_id, departure_time, transportation_type |

### **Tasks & To-Dos**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_tasks` | Coach-assigned tasks | team_id, title, due_date, urgency_level |
| `golf_task_completions` | Task completion | task_id, player_id, completed_at |

### **Communication**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_announcements` | Team announcements | team_id, title, content, priority |
| `golf_announcement_acknowledgements` | Who read it | announcement_id, player_id, read_at |
| `golf_coach_notes` | Private notes | coach_id, player_id, content |

### **Documents**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_documents` | Shared files | team_id, title, file_path, file_type |

### **Statistics**
| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `golf_player_stats` | Aggregated stats | player_id, season, avg_score, fairway_pct |

---

## 🔗 KEY RELATIONSHIPS

### **Baseball Relationships**
```
users (auth.uid)
  ├─→ coaches (user_id)
  │    ├─→ watchlists (coach_id)
  │    ├─→ coach_notes (coach_id)
  │    └─→ camps (coach_id)
  │
  └─→ players (user_id)
       ├─→ player_metrics (player_id)
       ├─→ videos (player_id)
       ├─→ team_members (player_id)
       │    └─→ teams (team_id)
       └─→ watchlists (player_id)
            └─→ coaches (coach_id)

organizations
  ├─→ teams (organization_id)
  └─→ coaches (organization_id)

teams
  ├─→ team_members (team_id) → players
  ├─→ team_coach_staff (team_id) → coaches
  └─→ events (team_id)
```

### **Golf Relationships**
```
users (auth.uid)
  ├─→ golf_coaches (user_id)
  │    └─→ golf_teams (id)
  │
  └─→ golf_players (user_id)
       └─→ golf_teams (team_id)
            ├─→ golf_rounds (player_id)
            │    └─→ golf_holes (round_id)
            │         └─→ golf_shots (hole_id)
            │
            ├─→ golf_qualifier_entries (player_id)
            │    └─→ golf_qualifiers (qualifier_id)
            │
            └─→ golf_player_classes (player_id)

golf_courses
  ├─→ golf_course_holes (course_id)
  ├─→ golf_course_tees (course_id)
  └─→ golf_rounds (course_id)

golf_teams
  ├─→ golf_events (team_id)
  │    └─→ golf_event_attendance (event_id)
  ├─→ golf_announcements (team_id)
  ├─→ golf_tasks (team_id)
  └─→ golf_qualifiers (team_id)
```

### **Shared (Cross-Sport)**
```
conversations
  ├─→ conversation_participants (conversation_id) → users
  └─→ messages (conversation_id)

users
  └─→ notifications (user_id)
```

---

## 📝 ENUMS REFERENCE

### **Baseball Enums**
```sql
coach_type: 'college' | 'high_school' | 'juco' | 'showcase'
player_type: 'high_school' | 'showcase' | 'juco' | 'college'
team_type: 'high_school' | 'showcase' | 'juco' | 'college'
organization_type: 'college' | 'high_school' | 'juco' | 'showcase_org' | 'travel_ball'
pipeline_stage: 'watchlist' | 'high_priority' | 'contacted' | 'campus_visit' | 'offer_extended' | 'committed' | 'uninterested'
video_type: 'highlight' | 'game' | 'practice' | 'showcase' | 'camp'
notification_type: 'message' | 'watchlist_add' | 'profile_view' | 'interest' | 'offer' | 'system'
user_role: 'player' | 'coach' | 'admin'
```

### **Golf Enums**
```sql
golf_player_year: 'freshman' | 'sophomore' | 'junior' | 'senior' | 'fifth_year' | 'graduate'
golf_player_status: 'active' | 'injured' | 'redshirt' | 'inactive'
golf_round_type: 'tournament' | 'qualifier' | 'practice' | 'casual'
golf_event_type: 'practice' | 'tournament' | 'qualifier' | 'meeting' | 'travel' | 'other'
golf_attendance_status: 'attending' | 'not_attending' | 'maybe' | 'pending'
golf_qualifier_status: 'upcoming' | 'in_progress' | 'completed'
golf_task_status: 'pending' | 'completed' | 'overdue'
golf_urgency_level: 'low' | 'normal' | 'high' | 'urgent'
golf_transportation_type: 'bus' | 'van' | 'fly' | 'carpool'
```

---

## 🔒 SECURITY NOTES

### **RLS Enabled Tables**
All tables have Row Level Security (RLS) enabled with policies enforcing:
- Users can only see/edit their own data
- Coaches can view recruiting-activated players
- Team members can view team data
- Messaging restricted by messaging matrix rules

### **Key Security Features**
1. **Login Attempts Table** - Rate limiting & lockout protection
2. **Messaging Matrix** - Complex permission rules via `can_users_message()` function
3. **Profile Views** - Anonymous tracking when recruiting not activated
4. **Service Role Only** - Some tables restricted to backend operations

---

## 📊 TABLE COUNT BY CATEGORY

| Category | Tables | Percentage |
|----------|--------|------------|
| **Golf System** | 27 | 35% |
| **Baseball Core** | 19 | 25% |
| **Teams & Organizations** | 7 | 9% |
| **Messaging & Notifications** | 5 | 6% |
| **Video & Media** | 3 | 4% |
| **Recruiting & Pipeline** | 4 | 5% |
| **Events & Calendar** | 5 | 6% |
| **Security & Auth** | 3 | 4% |
| **Other** | 4 | 5% |
| **Total** | **77** | **100%** |

---

## 🎯 CRITICAL TABLES FOR BATCH 9

For the player cards and pipeline features, these are the key tables:

### **Essential**
- `watchlists` - Pipeline data with `pipeline_stage` column
- `players` - Player profiles with all stats
- `player_metrics` - Additional stats (fastball_velo, batting_avg, etc.)
- `coaches` - Coach profiles
- `videos` - Player highlight videos

### **Supporting**
- `organizations` - School names and data
- `player_achievements` - Awards to display
- `profile_views` - Analytics
- `player_engagement_events` - Tracking

---

## 🚀 NEXT STEPS

Now that we have complete database visibility, we can:

1. ✅ **Verify RLS Policies** - Check which policies are applied
2. ✅ **Inspect Sample Data** - Look at actual records
3. ✅ **Optimize Queries** - Ensure efficient data fetching
4. ✅ **Add Missing Features** - Build on solid foundation

Run queries like:
```sql
-- See pipeline distribution
SELECT pipeline_stage, COUNT(*)
FROM watchlists
GROUP BY pipeline_stage;

-- Check player stats
SELECT COUNT(*) as total_players,
       SUM(CASE WHEN recruiting_activated THEN 1 ELSE 0 END) as activated
FROM players;
```

---

**Total Schema Size:** 6,074 lines
**Last Updated:** December 30, 2024
**Source:** Live Supabase Export

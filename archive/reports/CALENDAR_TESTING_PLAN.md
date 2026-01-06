# Calendar System Testing Plan
**Date:** January 4, 2026
**Purpose:** Comprehensive end-to-end testing of GolfHelm Premium Calendar System

---

## Test Environment Setup

### Prerequisites
- ✅ Production database with all migrations applied
- ✅ Test team created with team_id
- ✅ Test coach account (with team_id assigned)
- ✅ Test player accounts (3-5 players with team_id assigned)
- ✅ npm run dev running on localhost:3000

---

## Component Inventory (34 UI Components)

| Component | Purpose | Test Priority |
|-----------|---------|---------------|
| EventDetailModal.tsx | Create/edit/view events | 🔴 CRITICAL |
| RSVPStatusSection.tsx | View RSVP responses | 🔴 CRITICAL |
| PlayerRSVPCard.tsx | Player RSVP interface | 🔴 CRITICAL |
| AttendanceCheckIn.tsx | Check-in interface | 🟡 HIGH |
| AvailabilityPollGrid.tsx | Availability polling UI | 🟡 HIGH |
| PollResultSelector.tsx | Select best time from poll | 🟡 HIGH |
| CalendarHeader.tsx | Calendar navigation | 🟢 MEDIUM |
| MonthView.tsx | Month calendar view | 🟢 MEDIUM |
| WeekView.tsx | Week calendar view | 🟢 MEDIUM |
| DayView.tsx | Day calendar view | 🟢 MEDIUM |
| EventCard.tsx | Event display card | 🟢 MEDIUM |
| NotificationCenter.tsx | Notification UI | 🟢 MEDIUM |
| CancellationDialog.tsx | Cancel event dialog | 🟢 MEDIUM |
| RecurrencePicker.tsx | Recurring event picker | 🟢 MEDIUM |
| CalendarFeedManager.tsx | External calendar feeds | 🔵 LOW |

---

## Test Scenarios

### Scenario 1: Event Creation (RSVP Disabled)
**Test Type:** Basic CRUD
**Priority:** 🔴 CRITICAL

**Setup:**
1. Login as test coach
2. Navigate to /golf/dashboard/calendar

**Test Steps:**
```
1. Click "Create Event" button
2. Fill in event details:
   - Title: "Team Practice"
   - Type: "Practice"
   - Date: Tomorrow
   - Start Time: 3:00 PM
   - End Time: 5:00 PM
   - Location: "West Field"
   - Description: "Regular team practice session"
3. Leave "Require RSVP" unchecked
4. Click "Create Event"
5. Verify event appears on calendar
6. Click event to open detail modal
7. Verify all fields match input
```

**Expected Results:**
- ✅ Event created successfully
- ✅ Event appears on calendar at correct time
- ✅ Event detail shows all correct information
- ✅ No RSVP section visible (since not required)

**Database Verification:**
```sql
SELECT * FROM golf_events
WHERE title = 'Team Practice'
AND team_id = '[YOUR_TEAM_ID]';

-- Expected: 1 row with requires_rsvp = false
```

---

### Scenario 2: Event Creation with RSVP Required
**Test Type:** RSVP Feature
**Priority:** 🔴 CRITICAL

**Setup:**
1. Login as test coach
2. Navigate to /golf/dashboard/calendar

**Test Steps:**
```
1. Click "Create Event" button
2. Fill in event details:
   - Title: "Tournament at Pines Golf Club"
   - Type: "Tournament"
   - Date: 5 days from now
   - Start Time: 9:00 AM
   - End Time: 3:00 PM
   - Location: "Pines Golf Club"
3. Check "Require RSVP from attendees"
4. Set RSVP Deadline: 2 days from now, 11:59 PM
5. Set Max Attendees: 12
6. Click "Create Event"
7. Verify event appears with RSVP indicator
```

**Expected Results:**
- ✅ Event created with RSVP enabled
- ✅ RSVP deadline stored correctly
- ✅ Max attendees set to 12
- ✅ Event shows RSVP badge/indicator

**Database Verification:**
```sql
SELECT
  title,
  requires_rsvp,
  rsvp_deadline,
  max_attendees,
  team_id
FROM golf_events
WHERE title LIKE '%Tournament at Pines%';

-- Expected: requires_rsvp = true, max_attendees = 12
```

---

### Scenario 3: Player RSVP Flow
**Test Type:** RSVP Feature
**Priority:** 🔴 CRITICAL

**Setup:**
1. Event from Scenario 2 must exist
2. Login as test player (Player 1)
3. Navigate to /golf/dashboard/calendar

**Test Steps:**
```
1. View calendar - verify tournament event appears
2. Click tournament event to open detail
3. Verify RSVP section is visible
4. Click "Accept" (or "Going")
5. Add optional note: "Looking forward to it!"
6. Submit RSVP
7. Verify status changes to "Accepted"
8. Logout

9. Login as Player 2
10. Navigate to same event
11. Click "Decline" (or "Not Going")
12. Add reason: "Family commitment"
13. Submit
14. Logout

15. Login as Player 3
16. Navigate to same event
17. Click "Tentative" (or "Maybe")
18. Submit
```

**Expected Results:**
- ✅ Player 1 status: "Accepted" with note
- ✅ Player 2 status: "Declined" with reason
- ✅ Player 3 status: "Tentative"
- ✅ Each player can only see their own response initially
- ✅ Cannot change RSVP after deadline passes (test this separately)

**Database Verification:**
```sql
SELECT
  ea.event_id,
  gp.first_name || ' ' || gp.last_name as player_name,
  ea.status,
  ea.responded_at,
  ea.notes
FROM golf_event_attendance ea
JOIN golf_players gp ON ea.player_id = gp.id
WHERE ea.event_id = '[EVENT_ID_FROM_SCENARIO_2]'
ORDER BY player_name;

-- Expected: 3 rows with correct statuses
```

---

### Scenario 4: Coach Views RSVP Responses
**Test Type:** RSVP Feature
**Priority:** 🔴 CRITICAL

**Setup:**
1. Complete Scenario 3 first (3 players RSVP'd)
2. Login as test coach
3. Navigate to /golf/dashboard/calendar

**Test Steps:**
```
1. Click tournament event from Scenario 2
2. Scroll to "RSVP Status" section
3. Verify all player responses visible
4. Check accepted count
5. Check declined count
6. Check tentative count
7. Verify notes/reasons are visible
8. Check "Pending" list (players who haven't responded)
```

**Expected Results:**
- ✅ Coach sees all player RSVPs
- ✅ Accepted: 1 (Player 1)
- ✅ Declined: 1 (Player 2)
- ✅ Tentative: 1 (Player 3)
- ✅ Pending: X players (any who didn't respond)
- ✅ Notes visible for each response
- ✅ Visual progress indicator (e.g., "3/5 responded")

---

### Scenario 5: RSVP Deadline Enforcement
**Test Type:** RSVP Feature
**Priority:** 🟡 HIGH

**Setup:**
1. Create event with RSVP deadline = current time + 2 minutes
2. Wait for deadline to pass
3. Login as player who hasn't responded

**Test Steps:**
```
1. Navigate to event
2. Attempt to click RSVP button
3. Verify button is disabled or shows "Deadline Passed" message
```

**Expected Results:**
- ✅ RSVP interface disabled after deadline
- ✅ Clear message: "RSVP deadline has passed"
- ✅ Player cannot submit late RSVP

---

### Scenario 6: Availability Polling - Create Poll
**Test Type:** Polling Feature
**Priority:** 🟡 HIGH

**Setup:**
1. Login as test coach
2. Navigate to /golf/dashboard/calendar

**Test Steps:**
```
1. Click "Create Availability Poll" button
2. Fill in poll details:
   - Title: "Weekend Practice Options"
   - Description: "Vote for best practice time"
   - Duration: 2 hours
   - Date Options: [Saturday, Sunday]
   - Time Options: [9:00 AM, 2:00 PM, 5:00 PM]
   - Response Deadline: 3 days from now
3. Select team (auto-selected if only one team)
4. Click "Create Poll"
5. Verify poll appears in polls list
```

**Expected Results:**
- ✅ Poll created successfully
- ✅ Poll shows in UI with "Pending" status
- ✅ Team members notified (check notifications)
- ✅ Poll has deadline countdown

**Database Verification:**
```sql
SELECT * FROM golf_availability_polls
WHERE title = 'Weekend Practice Options'
AND team_id = '[YOUR_TEAM_ID]';

-- Expected: 1 row with status = 'draft' or 'active'
-- Verify date_options and time_options arrays correct
```

---

### Scenario 7: Player Responds to Poll
**Test Type:** Polling Feature
**Priority:** 🟡 HIGH

**Setup:**
1. Poll from Scenario 6 must exist
2. Login as test player
3. Navigate to calendar or polls section

**Test Steps:**
```
1. Find "Weekend Practice Options" poll
2. Click to open poll grid
3. For each date/time combination, mark availability:
   - Saturday 9AM: Available (preference: High)
   - Saturday 2PM: Not available
   - Saturday 5PM: Available (preference: Medium)
   - Sunday 9AM: Available (preference: Low)
   - Sunday 2PM: Available (preference: High)
   - Sunday 5PM: Not available
4. Add optional note: "Prefer Saturday"
5. Submit responses
6. Verify can edit responses before deadline
```

**Expected Results:**
- ✅ Player sees grid of all date/time options
- ✅ Can mark each slot as available/unavailable
- ✅ Can set preference level (high/medium/low)
- ✅ Responses saved successfully
- ✅ Can edit before deadline

**Database Verification:**
```sql
SELECT
  date_option,
  time_option,
  is_available,
  preference_level,
  notes
FROM golf_poll_responses
WHERE poll_id = '[POLL_ID]'
AND player_id = '[PLAYER_ID]'
ORDER BY date_option, time_option;

-- Expected: 6 rows (2 dates × 3 times)
```

---

### Scenario 8: Coach Views Poll Results
**Test Type:** Polling Feature
**Priority:** 🟡 HIGH

**Setup:**
1. Multiple players responded to poll from Scenario 6
2. Login as test coach
3. Navigate to poll

**Test Steps:**
```
1. Open "Weekend Practice Options" poll
2. View results grid/heatmap
3. Verify availability percentages shown
4. Identify "Best Times" (highest availability)
5. Click "Select Best Time and Create Event"
6. Choose: Sunday 2PM (assuming highest)
7. Convert to scheduled event
8. Verify event created
9. Verify poll status changed to "Completed"
```

**Expected Results:**
- ✅ Results show aggregated availability
- ✅ Visual heatmap (green = high availability)
- ✅ Suggested times ranked by score
- ✅ Can create event from poll result
- ✅ Poll marked complete
- ✅ Created event links back to poll

**RPC Function Test:**
```sql
-- Test calculate_poll_results function
SELECT * FROM calculate_poll_results('[POLL_ID]');

-- Expected: Returns rows with:
--   date_option, time_option, available_count,
--   total_responses, availability_percentage, average_preference

-- Test get_suggested_best_times function
SELECT * FROM get_suggested_best_times(
  p_poll_id := '[POLL_ID]',
  p_min_availability_percentage := 70
);

-- Expected: Returns top 5 time slots with ≥70% availability
```

---

### Scenario 9: Event Cancellation
**Test Type:** Lifecycle Feature
**Priority:** 🟢 MEDIUM

**Setup:**
1. Event from Scenario 2 must exist
2. Login as test coach
3. Navigate to event

**Test Steps:**
```
1. Open tournament event
2. Click "Cancel Event" button
3. Add cancellation reason: "Weather - Course closed"
4. Confirm cancellation
5. Verify event shows as "Cancelled"
6. Verify players notified (check notifications)
7. Logout as coach

8. Login as player
9. View calendar
10. Verify event shows as cancelled
11. Verify cancellation reason visible
```

**Expected Results:**
- ✅ Event marked cancelled
- ✅ Cancellation reason stored
- ✅ cancelled_at timestamp set
- ✅ cancelled_by = coach_id
- ✅ Event grayed out or strikethrough in calendar
- ✅ All team members receive notification

**Database Verification:**
```sql
SELECT
  title,
  cancelled_at,
  cancelled_by,
  cancellation_reason
FROM golf_events
WHERE id = '[EVENT_ID]';

-- Expected: cancelled_at IS NOT NULL

SELECT * FROM golf_calendar_notifications
WHERE event_id = '[EVENT_ID]'
AND type = 'event_cancelled';

-- Expected: Notifications created for all team members
```

---

### Scenario 10: Recurring Event Creation
**Test Type:** Recurrence Feature
**Priority:** 🟢 MEDIUM

**Setup:**
1. Login as test coach
2. Navigate to calendar

**Test Steps:**
```
1. Create new event:
   - Title: "Monday Team Meetings"
   - Type: "Meeting"
   - Start Date: Next Monday
   - Time: 4:00 PM - 5:00 PM
2. Enable "Recurring Event"
3. Set pattern: "Weekly"
4. Repeat on: Monday
5. End after: 8 occurrences
6. Create event
7. Verify 8 instances appear on calendar
```

**Expected Results:**
- ✅ 8 events created (1 original + 7 recurrences)
- ✅ All have same title, time, location
- ✅ Dates are correctly spaced (7 days apart)
- ✅ Linked by recurrence_rule or parent_event_id

**Database Verification:**
```sql
SELECT
  title,
  start_date::date,
  recurrence_rule,
  is_recurring
FROM golf_events
WHERE title = 'Monday Team Meetings'
ORDER BY start_date;

-- Expected: 8 rows, all on Mondays
```

---

### Scenario 11: Notification System
**Test Type:** Notifications
**Priority:** 🟢 MEDIUM

**Setup:**
1. Complete previous scenarios to generate various notifications
2. Login as player

**Test Steps:**
```
1. Navigate to calendar
2. Click notification bell icon
3. Verify unread notifications count
4. Open notification center
5. Review notification types:
   - Event invitation (from new events)
   - RSVP reminder (before deadline)
   - Event reminder (before event)
   - Event updated (if event modified)
   - Event cancelled (if event cancelled)
6. Click notification to view event
7. Mark notification as read
8. Verify unread count decreases
```

**Expected Results:**
- ✅ All notification types present
- ✅ Unread badge shows correct count
- ✅ Click notification navigates to event
- ✅ Mark as read updates database
- ✅ Read notifications styled differently

**Database Verification:**
```sql
SELECT
  type,
  title,
  read,
  created_at
FROM golf_calendar_notifications
WHERE user_id = '[PLAYER_USER_ID]'
ORDER BY created_at DESC;

-- Expected: Multiple rows with different types
```

---

### Scenario 12: Coach Blocked Time
**Test Type:** Availability Feature
**Priority:** 🟢 MEDIUM

**Setup:**
1. Login as test coach
2. Navigate to calendar settings or availability

**Test Steps:**
```
1. Click "Add Blocked Time"
2. Fill in:
   - Title: "Personal Appointment"
   - Start Date: Tomorrow
   - End Date: Tomorrow
   - Start Time: 10:00 AM
   - End Time: 11:00 AM
   - All Day: No
3. Save blocked time
4. Verify appears on calendar (different color/style)
5. Attempt to create event during blocked time
6. Verify conflict warning appears
```

**Expected Results:**
- ✅ Blocked time created
- ✅ Shows on coach's calendar
- ✅ Team members can see coach unavailable
- ✅ System prevents/warns about conflicts

**Database Verification:**
```sql
SELECT * FROM golf_coach_blocked_time
WHERE coach_id = '[COACH_ID]'
AND title = 'Personal Appointment';

-- Expected: 1 row with correct times
```

---

### Scenario 13: Team Boundary Enforcement (Security)
**Test Type:** Security / RLS
**Priority:** 🔴 CRITICAL

**Setup:**
1. Create second test team (Team B)
2. Create event on Team A
3. Create player on Team B

**Test Steps:**
```
1. Login as Team A coach
2. Create event for Team A
3. Logout

4. Login as Team B player
5. Navigate to calendar
6. Verify Team A's event does NOT appear
7. Attempt to access Team A event by direct URL
8. Verify access denied or event not found
```

**Expected Results:**
- ✅ Team B users cannot see Team A events
- ✅ Direct URL access blocked by RLS
- ✅ Calendar only shows team's own events
- ✅ No data leakage between teams

**Database Test:**
```sql
-- Simulate Team B player query
SET ROLE authenticated;
SET request.jwt.claim.sub = '[TEAM_B_PLAYER_USER_ID]';

SELECT * FROM golf_events;

-- Expected: Only Team B events (or none if no Team B events)
-- Should NOT return Team A events
```

---

## Automation Test Script (Optional)

### Test Data Setup Script

Create file: `setup-calendar-test-data.sql`

```sql
-- ============================================================================
-- CALENDAR SYSTEM TEST DATA SETUP
-- ============================================================================
-- Run this to create test events, RSVPs, and polls for testing
-- ============================================================================

-- VARIABLES (replace with your actual IDs)
-- Find your team_id: SELECT id FROM golf_teams WHERE name = 'Your Team Name';
-- Find coach_id: SELECT id FROM golf_coaches WHERE user_id = auth.uid();

\set TEAM_ID '1c9ef80d-81bc-499b-8042-bc034b057230'
\set COACH_ID '[YOUR_COACH_ID]'

-- ============================================================================
-- 1. CREATE TEST EVENT (No RSVP)
-- ============================================================================
INSERT INTO golf_events (
  team_id,
  title,
  event_type,
  start_date,
  end_date,
  start_time,
  end_time,
  location,
  description,
  requires_rsvp,
  created_by
) VALUES (
  :'TEAM_ID',
  'Team Practice',
  'practice',
  CURRENT_DATE + INTERVAL '1 day',
  CURRENT_DATE + INTERVAL '1 day',
  '15:00:00',
  '17:00:00',
  'West Field',
  'Regular team practice session',
  false,
  :'COACH_ID'
) RETURNING id AS practice_event_id;

-- ============================================================================
-- 2. CREATE TEST EVENT WITH RSVP
-- ============================================================================
INSERT INTO golf_events (
  team_id,
  title,
  event_type,
  start_date,
  end_date,
  start_time,
  end_time,
  location,
  description,
  requires_rsvp,
  rsvp_deadline,
  max_attendees,
  created_by
) VALUES (
  :'TEAM_ID',
  'Tournament at Pines Golf Club',
  'tournament',
  CURRENT_DATE + INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '5 days',
  '09:00:00',
  '15:00:00',
  'Pines Golf Club',
  'Spring tournament - please RSVP',
  true,
  (CURRENT_DATE + INTERVAL '2 days')::timestamptz + TIME '23:59:00',
  12,
  :'COACH_ID'
) RETURNING id AS tournament_event_id;

-- ============================================================================
-- 3. CREATE AVAILABILITY POLL
-- ============================================================================
INSERT INTO golf_availability_polls (
  team_id,
  created_by,
  title,
  description,
  duration_minutes,
  date_options,
  time_options,
  deadline,
  status
) VALUES (
  :'TEAM_ID',
  :'COACH_ID',
  'Weekend Practice Options',
  'Vote for best practice time',
  120,  -- 2 hours
  ARRAY[(CURRENT_DATE + INTERVAL '6 days')::text, (CURRENT_DATE + INTERVAL '7 days')::text],
  ARRAY['09:00:00', '14:00:00', '17:00:00'],
  (CURRENT_DATE + INTERVAL '3 days')::timestamptz,
  'active'
) RETURNING id AS poll_id;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- View created events
SELECT
  title,
  event_type,
  start_date,
  requires_rsvp,
  rsvp_deadline
FROM golf_events
WHERE team_id = :'TEAM_ID'
ORDER BY start_date;

-- View created poll
SELECT
  title,
  status,
  date_options,
  time_options,
  deadline
FROM golf_availability_polls
WHERE team_id = :'TEAM_ID';

-- ============================================================================
-- CLEANUP (run after testing)
-- ============================================================================

-- DELETE FROM golf_poll_responses WHERE poll_id IN (SELECT id FROM golf_availability_polls WHERE team_id = :'TEAM_ID');
-- DELETE FROM golf_availability_polls WHERE team_id = :'TEAM_ID' AND title LIKE '%Test%';
-- DELETE FROM golf_event_attendance WHERE event_id IN (SELECT id FROM golf_events WHERE team_id = :'TEAM_ID' AND title LIKE '%Test%');
-- DELETE FROM golf_events WHERE team_id = :'TEAM_ID' AND title LIKE '%Test%';
```

---

## Testing Checklist

### Pre-Testing Setup
- [ ] All migrations applied to database
- [ ] Test team created with valid team_id
- [ ] Test coach account with team_id assigned
- [ ] 3-5 test player accounts with team_id assigned
- [ ] npm run dev running successfully
- [ ] Browser DevTools open (check console for errors)

### Core Features Testing
- [ ] Scenario 1: Basic event creation ✅
- [ ] Scenario 2: RSVP event creation ✅
- [ ] Scenario 3: Player RSVP flow ✅
- [ ] Scenario 4: Coach views RSVPs ✅
- [ ] Scenario 5: RSVP deadline enforcement ✅
- [ ] Scenario 6: Create availability poll ✅
- [ ] Scenario 7: Player responds to poll ✅
- [ ] Scenario 8: Coach views poll results ✅
- [ ] Scenario 9: Event cancellation ✅
- [ ] Scenario 10: Recurring events ✅
- [ ] Scenario 11: Notifications ✅
- [ ] Scenario 12: Coach blocked time ✅
- [ ] Scenario 13: Team boundary security ✅

### Edge Cases Testing
- [ ] Create event in the past (should warn/prevent)
- [ ] RSVP after deadline (should block)
- [ ] Poll with no responses (graceful empty state)
- [ ] Event with max attendees reached (cap enforcement)
- [ ] Teamless user views calendar (empty state)
- [ ] Very long event titles/descriptions (truncation)
- [ ] Overlapping events (conflict detection)
- [ ] Same day recurring events (edge case)

### Performance Testing
- [ ] Calendar with 100+ events (load time)
- [ ] Poll with 20+ responses (calculation speed)
- [ ] Notification center with 50+ notifications
- [ ] Large team (30+ members) RSVP status view

---

## Reporting Issues

When you find a bug, document it with:

**Bug Report Template:**
```
Title: [Brief description]
Severity: Critical / High / Medium / Low
Scenario: [Which test scenario]
Steps to Reproduce:
1. ...
2. ...
Expected: [What should happen]
Actual: [What actually happened]
Console Errors: [Any browser console errors]
Database State: [Relevant database query results]
```

---

## Success Criteria

### Must Pass (MVP)
- ✅ All Scenario 1-4 tests pass (RSVP core flow)
- ✅ Scenario 13 passes (security/team boundaries)
- ✅ No console errors during normal usage
- ✅ Database RLS enforces team isolation
- ✅ UI responsive and functional

### Should Pass (Full Feature)
- ✅ All Scenarios 1-12 pass
- ✅ Edge cases handled gracefully
- ✅ Notifications work correctly
- ✅ Performance acceptable (<2s page loads)

### Nice to Have (Polish)
- ✅ All edge cases pass
- ✅ Performance excellent (<1s page loads)
- ✅ Beautiful UI with smooth animations
- ✅ Helpful error messages

---

**Testing Start Date:** _________
**Testing Completed Date:** _________
**Pass Rate:** ___/13 Scenarios
**Issues Found:** ___
**Status:** ☐ Pass ☐ Fail ☐ Needs Fixes

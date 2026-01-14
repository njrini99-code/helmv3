-- ============================================================================
-- CALENDAR SYSTEM TEST DATA SETUP
-- ============================================================================
-- Purpose: Create test events, polls, and data for comprehensive testing
-- Run this via Supabase Dashboard SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: FIND YOUR IDs (Run this first to get your values)
-- ============================================================================

-- Find your team_id
SELECT
  'YOUR_TEAM_ID' as label,
  id as value
FROM golf_teams
LIMIT 5;

-- Find your coach_id
SELECT
  'YOUR_COACH_ID' as label,
  gc.id as value,
  gc.full_name,
  gc.email
FROM golf_coaches gc
WHERE gc.team_id IS NOT NULL
LIMIT 5;

-- Find your player ids
SELECT
  'YOUR_PLAYER_IDS' as label,
  gp.id as value,
  gp.first_name || ' ' || gp.last_name as name,
  gp.team_id
FROM golf_players gp
WHERE gp.team_id IS NOT NULL
ORDER BY gp.first_name
LIMIT 10;

-- ============================================================================
-- STEP 2: SET YOUR VALUES HERE (Replace with actual IDs from above)
-- ============================================================================

-- IMPORTANT: Replace these with your actual IDs from Step 1
DO $$
DECLARE
  v_team_id uuid := '1c9ef80d-81bc-499b-8042-bc034b057230'; -- REPLACE THIS
  v_coach_id uuid := 'YOUR_COACH_ID_HERE'; -- REPLACE THIS
  v_event_id_practice uuid;
  v_event_id_tournament uuid;
  v_poll_id uuid;
BEGIN

  -- ============================================================================
  -- STEP 3: CREATE TEST EVENT (No RSVP) - SCENARIO 1
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
    created_by,
    status
  ) VALUES (
    v_team_id,
    'Team Practice - Test Event',
    'practice',
    CURRENT_DATE + INTERVAL '1 day',
    CURRENT_DATE + INTERVAL '1 day',
    '15:00:00',
    '17:00:00',
    'West Field',
    'Regular team practice session for testing',
    false,
    v_coach_id,
    'confirmed'
  ) RETURNING id INTO v_event_id_practice;

  RAISE NOTICE 'Created practice event: %', v_event_id_practice;

  -- ============================================================================
  -- STEP 4: CREATE TEST EVENT WITH RSVP - SCENARIO 2
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
    created_by,
    status
  ) VALUES (
    v_team_id,
    'Tournament at Pines Golf Club - Test',
    'tournament',
    CURRENT_DATE + INTERVAL '5 days',
    CURRENT_DATE + INTERVAL '5 days',
    '09:00:00',
    '15:00:00',
    'Pines Golf Club',
    'Spring tournament - please RSVP (TEST EVENT)',
    true,
    (CURRENT_DATE + INTERVAL '2 days')::timestamptz + TIME '23:59:00',
    12,
    v_coach_id,
    'confirmed'
  ) RETURNING id INTO v_event_id_tournament;

  RAISE NOTICE 'Created tournament event with RSVP: %', v_event_id_tournament;

  -- ============================================================================
  -- STEP 5: CREATE AVAILABILITY POLL - SCENARIO 6
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
    v_team_id,
    v_coach_id,
    'Weekend Practice Options - Test',
    'Vote for best practice time (TEST POLL)',
    120,  -- 2 hours
    ARRAY[
      (CURRENT_DATE + INTERVAL '6 days')::text,
      (CURRENT_DATE + INTERVAL '7 days')::text
    ],
    ARRAY['09:00:00', '14:00:00', '17:00:00'],
    (CURRENT_DATE + INTERVAL '3 days')::timestamptz,
    'active'
  ) RETURNING id INTO v_poll_id;

  RAISE NOTICE 'Created availability poll: %', v_poll_id;

  -- ============================================================================
  -- STEP 6: CREATE RECURRING EVENT - SCENARIO 10
  -- ============================================================================

  -- Find next Monday
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
    is_recurring,
    recurrence_rule,
    created_by,
    status
  ) VALUES (
    v_team_id,
    'Monday Team Meetings - Test (Week 1)',
    'meeting',
    CURRENT_DATE + ((8 - EXTRACT(DOW FROM CURRENT_DATE))::int % 7),  -- Next Monday
    CURRENT_DATE + ((8 - EXTRACT(DOW FROM CURRENT_DATE))::int % 7),
    '16:00:00',
    '17:00:00',
    'Clubhouse',
    'Weekly team meeting (TEST RECURRING)',
    true,
    'FREQ=WEEKLY;BYDAY=MO;COUNT=8',
    v_coach_id,
    'confirmed'
  );

  RAISE NOTICE 'Created recurring meeting (Week 1)';

  -- Create 7 more instances manually (would be better with a loop)
  FOR i IN 2..8 LOOP
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
      is_recurring,
      recurrence_rule,
      created_by,
      status
    ) VALUES (
      v_team_id,
      'Monday Team Meetings - Test (Week ' || i || ')',
      'meeting',
      CURRENT_DATE + ((8 - EXTRACT(DOW FROM CURRENT_DATE))::int % 7) + ((i-1) * 7),
      CURRENT_DATE + ((8 - EXTRACT(DOW FROM CURRENT_DATE))::int % 7) + ((i-1) * 7),
      '16:00:00',
      '17:00:00',
      'Clubhouse',
      'Weekly team meeting (TEST RECURRING)',
      true,
      'FREQ=WEEKLY;BYDAY=MO;COUNT=8',
      v_coach_id,
      'confirmed'
    );
  END LOOP;

  RAISE NOTICE 'Created 8 recurring meeting instances';

  -- ============================================================================
  -- SUCCESS MESSAGE
  -- ============================================================================

  RAISE NOTICE '========================================';
  RAISE NOTICE 'TEST DATA CREATED SUCCESSFULLY!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Practice Event ID: %', v_event_id_practice;
  RAISE NOTICE 'Tournament Event ID (with RSVP): %', v_event_id_tournament;
  RAISE NOTICE 'Poll ID: %', v_poll_id;
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '1. Navigate to /golf/dashboard/calendar';
  RAISE NOTICE '2. You should see all test events on calendar';
  RAISE NOTICE '3. Click tournament event to test RSVP flow';
  RAISE NOTICE '4. Find availability poll to test polling';
  RAISE NOTICE '========================================';

END $$;

-- ============================================================================
-- STEP 7: VERIFY TEST DATA
-- ============================================================================

SELECT
  'TEST EVENTS' as type,
  COUNT(*) as count,
  jsonb_agg(
    jsonb_build_object(
      'title', title,
      'event_type', event_type,
      'start_date', start_date::date,
      'requires_rsvp', requires_rsvp,
      'status', status
    ) ORDER BY start_date
  ) as details
FROM golf_events
WHERE title LIKE '%Test%'
GROUP BY 1;

SELECT
  'TEST POLLS' as type,
  COUNT(*) as count,
  jsonb_agg(
    jsonb_build_object(
      'title', title,
      'status', status,
      'deadline', deadline::date,
      'date_options', date_options,
      'time_options', time_options
    )
  ) as details
FROM golf_availability_polls
WHERE title LIKE '%Test%'
GROUP BY 1;

-- ============================================================================
-- STEP 8: CLEANUP (Run this when done testing)
-- ============================================================================

/*
-- UNCOMMENT BELOW TO DELETE ALL TEST DATA

-- Delete test poll responses
DELETE FROM golf_poll_responses
WHERE poll_id IN (
  SELECT id FROM golf_availability_polls
  WHERE title LIKE '%Test%'
);

-- Delete test polls
DELETE FROM golf_availability_polls
WHERE title LIKE '%Test%';

-- Delete test event attendance
DELETE FROM golf_event_attendance
WHERE event_id IN (
  SELECT id FROM golf_events
  WHERE title LIKE '%Test%'
);

-- Delete test notifications
DELETE FROM golf_calendar_notifications
WHERE event_id IN (
  SELECT id FROM golf_events
  WHERE title LIKE '%Test%'
);

-- Delete test events
DELETE FROM golf_events
WHERE title LIKE '%Test%';

-- Verify cleanup
SELECT 'Cleanup Complete' as status, COUNT(*) as remaining_test_events
FROM golf_events
WHERE title LIKE '%Test%';

*/

-- ============================================================================
-- USAGE INSTRUCTIONS
-- ============================================================================
/*

1. SETUP:
   - Run STEP 1 queries to find your team_id, coach_id, player_ids
   - Copy those IDs into STEP 2 (replace the placeholder values)

2. CREATE TEST DATA:
   - Run the DO $$ block (STEPS 3-6) to create:
     * 1 practice event (no RSVP)
     * 1 tournament event (with RSVP)
     * 1 availability poll
     * 8 recurring meeting events

3. VERIFY:
   - Run STEP 7 queries to confirm data created
   - Navigate to /golf/dashboard/calendar in browser
   - All test events should appear on calendar

4. TEST:
   - Follow CALENDAR_TESTING_PLAN.md scenarios
   - Use created events for testing

5. CLEANUP:
   - When done, uncomment and run STEP 8 cleanup queries
   - This deletes all test data

*/

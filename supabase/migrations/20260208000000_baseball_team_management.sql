-- ============================================================================
-- Migration: 20260208000000_baseball_team_management.sql
-- Purpose: Create all baseball team management tables (announcements, tasks,
--          documents, enhanced calendar, travel, academics) modeled after
--          the golf equivalents with baseball_ prefix.
-- ============================================================================

-- ============================================================================
-- SECTION 1: DOCUMENTS (must be created before announcement_documents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS baseball_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  category TEXT DEFAULT 'general' CHECK (category IN (
    'general', 'playbook', 'rules', 'conditioning', 'scouting',
    'academic', 'administrative', 'media'
  )),
  is_player_visible BOOLEAN DEFAULT true,
  uploaded_by_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_documents_team
  ON baseball_documents(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_documents_category
  ON baseball_documents(category);
CREATE INDEX IF NOT EXISTS idx_baseball_documents_visible
  ON baseball_documents(is_player_visible);

CREATE TABLE IF NOT EXISTS baseball_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES baseball_documents(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  uploaded_by_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_baseball_document_version UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_baseball_document_versions_document
  ON baseball_document_versions(document_id);

-- ============================================================================
-- SECTION 2: TASKS (must be created before announcement_tasks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS baseball_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed', 'overdue', 'cancelled'
  )),
  category TEXT DEFAULT 'general' CHECK (category IN (
    'general', 'conditioning', 'academic', 'administrative', 'practice', 'game_prep'
  )),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  reminder_at TIMESTAMPTZ,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  created_by_id UUID NOT NULL REFERENCES baseball_coaches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_tasks_team
  ON baseball_tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_tasks_status
  ON baseball_tasks(status);
CREATE INDEX IF NOT EXISTS idx_baseball_tasks_due_date
  ON baseball_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_baseball_tasks_created_by
  ON baseball_tasks(created_by_id);

CREATE TABLE IF NOT EXISTS baseball_task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES baseball_tasks(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed'
  )),
  completed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(task_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_task_assignments_task
  ON baseball_task_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_baseball_task_assignments_player
  ON baseball_task_assignments(player_id);

CREATE TABLE IF NOT EXISTS baseball_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  created_by_id UUID NOT NULL REFERENCES baseball_coaches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_task_templates_team
  ON baseball_task_templates(team_id);

-- ============================================================================
-- SECTION 3: ANNOUNCEMENTS (depends on documents + tasks)
-- ============================================================================

CREATE TABLE IF NOT EXISTS baseball_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN (
    'low', 'normal', 'high', 'urgent'
  )),
  is_pinned BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_id UUID NOT NULL REFERENCES baseball_coaches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_announcements_team
  ON baseball_announcements(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_announcements_published
  ON baseball_announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_baseball_announcements_created_by
  ON baseball_announcements(created_by_id);

CREATE TABLE IF NOT EXISTS baseball_announcement_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES baseball_announcements(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  UNIQUE(announcement_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_ann_recipients_announcement
  ON baseball_announcement_recipients(announcement_id);
CREATE INDEX IF NOT EXISTS idx_baseball_ann_recipients_player
  ON baseball_announcement_recipients(player_id);

CREATE TABLE IF NOT EXISTS baseball_announcement_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES baseball_announcements(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_ann_acks_announcement
  ON baseball_announcement_acknowledgements(announcement_id);
CREATE INDEX IF NOT EXISTS idx_baseball_ann_acks_player
  ON baseball_announcement_acknowledgements(player_id);

CREATE TABLE IF NOT EXISTS baseball_announcement_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES baseball_announcements(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES baseball_documents(id) ON DELETE CASCADE,
  UNIQUE(announcement_id, document_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_ann_docs_announcement
  ON baseball_announcement_documents(announcement_id);
CREATE INDEX IF NOT EXISTS idx_baseball_ann_docs_document
  ON baseball_announcement_documents(document_id);

CREATE TABLE IF NOT EXISTS baseball_announcement_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES baseball_announcements(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES baseball_tasks(id) ON DELETE CASCADE,
  UNIQUE(announcement_id, task_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_ann_tasks_announcement
  ON baseball_announcement_tasks(announcement_id);
CREATE INDEX IF NOT EXISTS idx_baseball_ann_tasks_task
  ON baseball_announcement_tasks(task_id);

-- ============================================================================
-- SECTION 4: ENHANCED CALENDAR/EVENTS
-- baseball_events already has: end_time, description, created_by, location_*
-- Only add genuinely missing columns.
-- ============================================================================

ALTER TABLE baseball_events
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS max_attendees INTEGER,
  ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_rule TEXT,
  ADD COLUMN IF NOT EXISTS created_by_id UUID;

CREATE TABLE IF NOT EXISTS baseball_event_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES baseball_events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'going', 'maybe', 'not_going', 'pending'
  )),
  check_in_at TIMESTAMPTZ,
  absence_reason TEXT,
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_baseball_event_attendance_event
  ON baseball_event_attendance(event_id);
CREATE INDEX IF NOT EXISTS idx_baseball_event_attendance_player
  ON baseball_event_attendance(player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_event_attendance_status
  ON baseball_event_attendance(status);

-- ============================================================================
-- SECTION 5: TRAVEL
-- ============================================================================

CREATE TABLE IF NOT EXISTS baseball_travel_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES baseball_teams(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  departure_date DATE,
  return_date DATE,
  location TEXT,
  accommodation TEXT,
  transportation TEXT,
  notes TEXT,
  created_by_id UUID NOT NULL REFERENCES baseball_coaches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_travel_itineraries_team
  ON baseball_travel_itineraries(team_id);
CREATE INDEX IF NOT EXISTS idx_baseball_travel_itineraries_departure
  ON baseball_travel_itineraries(departure_date);

CREATE TABLE IF NOT EXISTS baseball_travel_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES baseball_travel_itineraries(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'transport', 'lodging', 'meals', 'equipment', 'other'
  )),
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  paid_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_travel_expenses_itinerary
  ON baseball_travel_expenses(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_baseball_travel_expenses_category
  ON baseball_travel_expenses(category);

-- ============================================================================
-- SECTION 6: ACADEMICS (JUCO enhancement)
-- ============================================================================

CREATE TABLE IF NOT EXISTS baseball_player_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  instructor TEXT,
  days TEXT[] DEFAULT '{}',
  start_time TIME,
  end_time TIME,
  building TEXT,
  room TEXT,
  credits DECIMAL(3,1),
  semester TEXT,
  color TEXT DEFAULT '#16A34A',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_player_classes_player
  ON baseball_player_classes(player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_player_classes_semester
  ON baseball_player_classes(semester);

CREATE TABLE IF NOT EXISTS baseball_academic_eligibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES baseball_players(id) ON DELETE CASCADE,
  semester TEXT NOT NULL,
  gpa DECIMAL(4,2),
  credits_completed INTEGER,
  credits_required INTEGER,
  is_eligible BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_baseball_academic_eligibility_player
  ON baseball_academic_eligibility(player_id);
CREATE INDEX IF NOT EXISTS idx_baseball_academic_eligibility_semester
  ON baseball_academic_eligibility(semester);

-- ============================================================================
-- SECTION 7: ENABLE RLS ON ALL NEW TABLES
-- ============================================================================

ALTER TABLE baseball_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_announcement_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_announcement_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_announcement_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_announcement_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_event_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_travel_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_travel_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_player_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE baseball_academic_eligibility ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SECTION 8: RLS POLICIES
-- Uses existing helper functions: is_baseball_team_coach(team_id),
-- is_baseball_team_member(team_id), get_my_coach_id(), get_my_player_id()
-- ============================================================================

-- --------------------------------------------------------------------------
-- 8a. baseball_documents
-- --------------------------------------------------------------------------

-- Coaches on the team can read all documents
CREATE POLICY "baseball_documents_select_coach" ON baseball_documents
  FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));

-- Players on the team can read player-visible documents
CREATE POLICY "baseball_documents_select_player" ON baseball_documents
  FOR SELECT TO authenticated
  USING (is_player_visible = true AND is_baseball_team_member(team_id));

-- Coaches on the team can create documents
CREATE POLICY "baseball_documents_insert" ON baseball_documents
  FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches on the team can update documents
CREATE POLICY "baseball_documents_update" ON baseball_documents
  FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches on the team can delete documents
CREATE POLICY "baseball_documents_delete" ON baseball_documents
  FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));

-- --------------------------------------------------------------------------
-- 8b. baseball_document_versions
-- --------------------------------------------------------------------------

-- Readable if parent document is readable (via team coach or team member)
CREATE POLICY "baseball_document_versions_select" ON baseball_document_versions
  FOR SELECT TO authenticated
  USING (
    document_id IN (
      SELECT id FROM baseball_documents
      WHERE is_baseball_team_coach(team_id)
         OR (is_player_visible = true AND is_baseball_team_member(team_id))
    )
  );

-- Coaches can insert new versions
CREATE POLICY "baseball_document_versions_insert" ON baseball_document_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    document_id IN (
      SELECT id FROM baseball_documents WHERE is_baseball_team_coach(team_id)
    )
  );

-- --------------------------------------------------------------------------
-- 8c. baseball_tasks
-- --------------------------------------------------------------------------

-- Coaches on the team can read all tasks
CREATE POLICY "baseball_tasks_select_coach" ON baseball_tasks
  FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));

-- Players on the team can read tasks (to see assignments)
CREATE POLICY "baseball_tasks_select_player" ON baseball_tasks
  FOR SELECT TO authenticated
  USING (is_baseball_team_member(team_id));

-- Coaches on the team can create tasks
CREATE POLICY "baseball_tasks_insert" ON baseball_tasks
  FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches on the team can update tasks
CREATE POLICY "baseball_tasks_update" ON baseball_tasks
  FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches on the team can delete tasks
CREATE POLICY "baseball_tasks_delete" ON baseball_tasks
  FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));

-- --------------------------------------------------------------------------
-- 8d. baseball_task_assignments
-- --------------------------------------------------------------------------

-- Coaches can read all assignments for their team's tasks
CREATE POLICY "baseball_task_assignments_select_coach" ON baseball_task_assignments
  FOR SELECT TO authenticated
  USING (
    task_id IN (
      SELECT id FROM baseball_tasks WHERE is_baseball_team_coach(team_id)
    )
  );

-- Players can read their own assignments
CREATE POLICY "baseball_task_assignments_select_player" ON baseball_task_assignments
  FOR SELECT TO authenticated
  USING (player_id = get_my_player_id());

-- Coaches can create assignments
CREATE POLICY "baseball_task_assignments_insert" ON baseball_task_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    task_id IN (
      SELECT id FROM baseball_tasks WHERE is_baseball_team_coach(team_id)
    )
  );

-- Coaches can update assignments (reassign, change status)
CREATE POLICY "baseball_task_assignments_update_coach" ON baseball_task_assignments
  FOR UPDATE TO authenticated
  USING (
    task_id IN (
      SELECT id FROM baseball_tasks WHERE is_baseball_team_coach(team_id)
    )
  );

-- Players can update their own assignments (mark complete, add notes)
CREATE POLICY "baseball_task_assignments_update_player" ON baseball_task_assignments
  FOR UPDATE TO authenticated
  USING (player_id = get_my_player_id())
  WITH CHECK (player_id = get_my_player_id());

-- Coaches can delete assignments
CREATE POLICY "baseball_task_assignments_delete" ON baseball_task_assignments
  FOR DELETE TO authenticated
  USING (
    task_id IN (
      SELECT id FROM baseball_tasks WHERE is_baseball_team_coach(team_id)
    )
  );

-- --------------------------------------------------------------------------
-- 8e. baseball_task_templates
-- --------------------------------------------------------------------------

-- Coaches on the team can read templates
CREATE POLICY "baseball_task_templates_select" ON baseball_task_templates
  FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));

-- Coaches on the team can create templates
CREATE POLICY "baseball_task_templates_insert" ON baseball_task_templates
  FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches on the team can update templates
CREATE POLICY "baseball_task_templates_update" ON baseball_task_templates
  FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches on the team can delete templates
CREATE POLICY "baseball_task_templates_delete" ON baseball_task_templates
  FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));

-- --------------------------------------------------------------------------
-- 8f. baseball_announcements
-- --------------------------------------------------------------------------

-- Coaches on the team can read all announcements
CREATE POLICY "baseball_announcements_select_coach" ON baseball_announcements
  FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));

-- Players on the team can read announcements (either broadcast or targeted to them)
CREATE POLICY "baseball_announcements_select_player" ON baseball_announcements
  FOR SELECT TO authenticated
  USING (
    is_baseball_team_member(team_id)
    AND (
      -- Broadcast (no specific recipients) = visible to all team members
      NOT EXISTS (
        SELECT 1 FROM baseball_announcement_recipients
        WHERE announcement_id = baseball_announcements.id
      )
      -- Or player is a specific recipient
      OR EXISTS (
        SELECT 1 FROM baseball_announcement_recipients
        WHERE announcement_id = baseball_announcements.id
          AND player_id = get_my_player_id()
      )
    )
  );

-- Coaches on the team can create announcements
CREATE POLICY "baseball_announcements_insert" ON baseball_announcements
  FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches on the team can update announcements
CREATE POLICY "baseball_announcements_update" ON baseball_announcements
  FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches on the team can delete announcements
CREATE POLICY "baseball_announcements_delete" ON baseball_announcements
  FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));

-- --------------------------------------------------------------------------
-- 8g. baseball_announcement_recipients
-- --------------------------------------------------------------------------

-- Coaches can read recipients for their team's announcements
CREATE POLICY "baseball_ann_recipients_select_coach" ON baseball_announcement_recipients
  FOR SELECT TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM baseball_announcements WHERE is_baseball_team_coach(team_id)
    )
  );

-- Players can see if they are a recipient
CREATE POLICY "baseball_ann_recipients_select_player" ON baseball_announcement_recipients
  FOR SELECT TO authenticated
  USING (player_id = get_my_player_id());

-- Coaches can add recipients
CREATE POLICY "baseball_ann_recipients_insert" ON baseball_announcement_recipients
  FOR INSERT TO authenticated
  WITH CHECK (
    announcement_id IN (
      SELECT id FROM baseball_announcements WHERE is_baseball_team_coach(team_id)
    )
  );

-- Coaches can remove recipients
CREATE POLICY "baseball_ann_recipients_delete" ON baseball_announcement_recipients
  FOR DELETE TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM baseball_announcements WHERE is_baseball_team_coach(team_id)
    )
  );

-- --------------------------------------------------------------------------
-- 8h. baseball_announcement_acknowledgements
-- --------------------------------------------------------------------------

-- Coaches can read acknowledgements for their team's announcements
CREATE POLICY "baseball_ann_acks_select_coach" ON baseball_announcement_acknowledgements
  FOR SELECT TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM baseball_announcements WHERE is_baseball_team_coach(team_id)
    )
  );

-- Players can read their own acknowledgements
CREATE POLICY "baseball_ann_acks_select_player" ON baseball_announcement_acknowledgements
  FOR SELECT TO authenticated
  USING (player_id = get_my_player_id());

-- Players can acknowledge announcements (insert their own record)
CREATE POLICY "baseball_ann_acks_insert" ON baseball_announcement_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (player_id = get_my_player_id());

-- --------------------------------------------------------------------------
-- 8i. baseball_announcement_documents
-- --------------------------------------------------------------------------

-- Team coaches and players can read announcement-document links
CREATE POLICY "baseball_ann_docs_select" ON baseball_announcement_documents
  FOR SELECT TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM baseball_announcements
      WHERE is_baseball_team_coach(team_id) OR is_baseball_team_member(team_id)
    )
  );

-- Coaches can attach documents to announcements
CREATE POLICY "baseball_ann_docs_insert" ON baseball_announcement_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    announcement_id IN (
      SELECT id FROM baseball_announcements WHERE is_baseball_team_coach(team_id)
    )
  );

-- Coaches can detach documents from announcements
CREATE POLICY "baseball_ann_docs_delete" ON baseball_announcement_documents
  FOR DELETE TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM baseball_announcements WHERE is_baseball_team_coach(team_id)
    )
  );

-- --------------------------------------------------------------------------
-- 8j. baseball_announcement_tasks
-- --------------------------------------------------------------------------

-- Team coaches and players can read announcement-task links
CREATE POLICY "baseball_ann_tasks_select" ON baseball_announcement_tasks
  FOR SELECT TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM baseball_announcements
      WHERE is_baseball_team_coach(team_id) OR is_baseball_team_member(team_id)
    )
  );

-- Coaches can attach tasks to announcements
CREATE POLICY "baseball_ann_tasks_insert" ON baseball_announcement_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    announcement_id IN (
      SELECT id FROM baseball_announcements WHERE is_baseball_team_coach(team_id)
    )
  );

-- Coaches can detach tasks from announcements
CREATE POLICY "baseball_ann_tasks_delete" ON baseball_announcement_tasks
  FOR DELETE TO authenticated
  USING (
    announcement_id IN (
      SELECT id FROM baseball_announcements WHERE is_baseball_team_coach(team_id)
    )
  );

-- --------------------------------------------------------------------------
-- 8k. baseball_event_attendance
-- --------------------------------------------------------------------------

-- Coaches can read all attendance for their team's events
CREATE POLICY "baseball_event_attendance_select_coach" ON baseball_event_attendance
  FOR SELECT TO authenticated
  USING (
    event_id IN (
      SELECT id FROM baseball_events WHERE is_baseball_team_coach(team_id)
    )
  );

-- Players can read their own attendance records
CREATE POLICY "baseball_event_attendance_select_player" ON baseball_event_attendance
  FOR SELECT TO authenticated
  USING (player_id = get_my_player_id());

-- Coaches can create attendance records (for check-ins, bulk RSVP creation)
CREATE POLICY "baseball_event_attendance_insert_coach" ON baseball_event_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    event_id IN (
      SELECT id FROM baseball_events WHERE is_baseball_team_coach(team_id)
    )
  );

-- Players can RSVP (create their own attendance record)
CREATE POLICY "baseball_event_attendance_insert_player" ON baseball_event_attendance
  FOR INSERT TO authenticated
  WITH CHECK (player_id = get_my_player_id());

-- Coaches can update any attendance record (check-in, override)
CREATE POLICY "baseball_event_attendance_update_coach" ON baseball_event_attendance
  FOR UPDATE TO authenticated
  USING (
    event_id IN (
      SELECT id FROM baseball_events WHERE is_baseball_team_coach(team_id)
    )
  );

-- Players can update their own RSVP
CREATE POLICY "baseball_event_attendance_update_player" ON baseball_event_attendance
  FOR UPDATE TO authenticated
  USING (player_id = get_my_player_id())
  WITH CHECK (player_id = get_my_player_id());

-- Coaches can delete attendance records
CREATE POLICY "baseball_event_attendance_delete" ON baseball_event_attendance
  FOR DELETE TO authenticated
  USING (
    event_id IN (
      SELECT id FROM baseball_events WHERE is_baseball_team_coach(team_id)
    )
  );

-- --------------------------------------------------------------------------
-- 8l. baseball_travel_itineraries
-- --------------------------------------------------------------------------

-- Coaches can read their team's itineraries
CREATE POLICY "baseball_travel_itineraries_select_coach" ON baseball_travel_itineraries
  FOR SELECT TO authenticated
  USING (is_baseball_team_coach(team_id));

-- Players can read their team's itineraries
CREATE POLICY "baseball_travel_itineraries_select_player" ON baseball_travel_itineraries
  FOR SELECT TO authenticated
  USING (is_baseball_team_member(team_id));

-- Coaches can create itineraries
CREATE POLICY "baseball_travel_itineraries_insert" ON baseball_travel_itineraries
  FOR INSERT TO authenticated
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches can update itineraries
CREATE POLICY "baseball_travel_itineraries_update" ON baseball_travel_itineraries
  FOR UPDATE TO authenticated
  USING (is_baseball_team_coach(team_id))
  WITH CHECK (is_baseball_team_coach(team_id));

-- Coaches can delete itineraries
CREATE POLICY "baseball_travel_itineraries_delete" ON baseball_travel_itineraries
  FOR DELETE TO authenticated
  USING (is_baseball_team_coach(team_id));

-- --------------------------------------------------------------------------
-- 8m. baseball_travel_expenses
-- --------------------------------------------------------------------------

-- Coaches can read expenses for their team's itineraries
CREATE POLICY "baseball_travel_expenses_select_coach" ON baseball_travel_expenses
  FOR SELECT TO authenticated
  USING (
    itinerary_id IN (
      SELECT id FROM baseball_travel_itineraries WHERE is_baseball_team_coach(team_id)
    )
  );

-- Players can read expenses for their team's itineraries
CREATE POLICY "baseball_travel_expenses_select_player" ON baseball_travel_expenses
  FOR SELECT TO authenticated
  USING (
    itinerary_id IN (
      SELECT id FROM baseball_travel_itineraries WHERE is_baseball_team_member(team_id)
    )
  );

-- Coaches can create expenses
CREATE POLICY "baseball_travel_expenses_insert" ON baseball_travel_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    itinerary_id IN (
      SELECT id FROM baseball_travel_itineraries WHERE is_baseball_team_coach(team_id)
    )
  );

-- Coaches can update expenses
CREATE POLICY "baseball_travel_expenses_update" ON baseball_travel_expenses
  FOR UPDATE TO authenticated
  USING (
    itinerary_id IN (
      SELECT id FROM baseball_travel_itineraries WHERE is_baseball_team_coach(team_id)
    )
  );

-- Coaches can delete expenses
CREATE POLICY "baseball_travel_expenses_delete" ON baseball_travel_expenses
  FOR DELETE TO authenticated
  USING (
    itinerary_id IN (
      SELECT id FROM baseball_travel_itineraries WHERE is_baseball_team_coach(team_id)
    )
  );

-- --------------------------------------------------------------------------
-- 8n. baseball_player_classes
-- --------------------------------------------------------------------------

-- Coaches on the player's team can read class schedules
CREATE POLICY "baseball_player_classes_select_coach" ON baseball_player_classes
  FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT tm.player_id FROM baseball_team_members tm
      WHERE is_baseball_team_coach(tm.team_id)
    )
  );

-- Players can read their own class schedule
CREATE POLICY "baseball_player_classes_select_player" ON baseball_player_classes
  FOR SELECT TO authenticated
  USING (player_id = get_my_player_id());

-- Players can create their own classes
CREATE POLICY "baseball_player_classes_insert" ON baseball_player_classes
  FOR INSERT TO authenticated
  WITH CHECK (player_id = get_my_player_id());

-- Players can update their own classes
CREATE POLICY "baseball_player_classes_update" ON baseball_player_classes
  FOR UPDATE TO authenticated
  USING (player_id = get_my_player_id())
  WITH CHECK (player_id = get_my_player_id());

-- Players can delete their own classes
CREATE POLICY "baseball_player_classes_delete" ON baseball_player_classes
  FOR DELETE TO authenticated
  USING (player_id = get_my_player_id());

-- --------------------------------------------------------------------------
-- 8o. baseball_academic_eligibility
-- --------------------------------------------------------------------------

-- Coaches on the player's team can read eligibility records
CREATE POLICY "baseball_academic_eligibility_select_coach" ON baseball_academic_eligibility
  FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT tm.player_id FROM baseball_team_members tm
      WHERE is_baseball_team_coach(tm.team_id)
    )
  );

-- Players can read their own eligibility
CREATE POLICY "baseball_academic_eligibility_select_player" ON baseball_academic_eligibility
  FOR SELECT TO authenticated
  USING (player_id = get_my_player_id());

-- Coaches can create eligibility records for their team's players
CREATE POLICY "baseball_academic_eligibility_insert" ON baseball_academic_eligibility
  FOR INSERT TO authenticated
  WITH CHECK (
    player_id IN (
      SELECT tm.player_id FROM baseball_team_members tm
      WHERE is_baseball_team_coach(tm.team_id)
    )
  );

-- Coaches can update eligibility records for their team's players
CREATE POLICY "baseball_academic_eligibility_update" ON baseball_academic_eligibility
  FOR UPDATE TO authenticated
  USING (
    player_id IN (
      SELECT tm.player_id FROM baseball_team_members tm
      WHERE is_baseball_team_coach(tm.team_id)
    )
  );

-- Coaches can delete eligibility records for their team's players
CREATE POLICY "baseball_academic_eligibility_delete" ON baseball_academic_eligibility
  FOR DELETE TO authenticated
  USING (
    player_id IN (
      SELECT tm.player_id FROM baseball_team_members tm
      WHERE is_baseball_team_coach(tm.team_id)
    )
  );

-- ============================================================================
-- SECTION 9: UPDATED_AT TRIGGERS
-- Reuses the existing update_updated_at_column() function from migration 037
-- ============================================================================

DROP TRIGGER IF EXISTS update_baseball_documents_updated_at ON baseball_documents;
CREATE TRIGGER update_baseball_documents_updated_at
  BEFORE UPDATE ON baseball_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_tasks_updated_at ON baseball_tasks;
CREATE TRIGGER update_baseball_tasks_updated_at
  BEFORE UPDATE ON baseball_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_announcements_updated_at ON baseball_announcements;
CREATE TRIGGER update_baseball_announcements_updated_at
  BEFORE UPDATE ON baseball_announcements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_travel_itineraries_updated_at ON baseball_travel_itineraries;
CREATE TRIGGER update_baseball_travel_itineraries_updated_at
  BEFORE UPDATE ON baseball_travel_itineraries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_player_classes_updated_at ON baseball_player_classes;
CREATE TRIGGER update_baseball_player_classes_updated_at
  BEFORE UPDATE ON baseball_player_classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_baseball_academic_eligibility_updated_at ON baseball_academic_eligibility;
CREATE TRIGGER update_baseball_academic_eligibility_updated_at
  BEFORE UPDATE ON baseball_academic_eligibility
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SECTION 10: TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE baseball_documents IS 'Team documents (playbooks, rules, scouting reports, etc.)';
COMMENT ON TABLE baseball_document_versions IS 'Version history for team documents';
COMMENT ON TABLE baseball_tasks IS 'Coach-created tasks assigned to players';
COMMENT ON TABLE baseball_task_assignments IS 'Per-player task assignment and completion tracking';
COMMENT ON TABLE baseball_task_templates IS 'Reusable task templates for coaches';
COMMENT ON TABLE baseball_announcements IS 'Team announcements from coaches to players';
COMMENT ON TABLE baseball_announcement_recipients IS 'Specific player recipients for targeted announcements (empty = broadcast to all)';
COMMENT ON TABLE baseball_announcement_acknowledgements IS 'Player acknowledgements of announcements';
COMMENT ON TABLE baseball_announcement_documents IS 'Documents attached to announcements';
COMMENT ON TABLE baseball_announcement_tasks IS 'Tasks attached to announcements';
COMMENT ON TABLE baseball_event_attendance IS 'Player RSVP and check-in for team events';
COMMENT ON TABLE baseball_travel_itineraries IS 'Travel plans for away games and tournaments';
COMMENT ON TABLE baseball_travel_expenses IS 'Expense tracking for travel itineraries';
COMMENT ON TABLE baseball_player_classes IS 'Player class schedules (for academic/practice conflict detection)';
COMMENT ON TABLE baseball_academic_eligibility IS 'Player academic eligibility tracking per semester';

-- ============================================================================
-- Done! Baseball team management tables created.
-- ============================================================================

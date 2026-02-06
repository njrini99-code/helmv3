-- ============================================================================
-- Migration: golf_announcement_enhancements
-- Purpose: Enhanced announcements with recipients, documents, tasks, and acknowledgements
-- ============================================================================

-- TABLE 0: golf_announcement_acknowledgements (was missing from production)
CREATE TABLE IF NOT EXISTS golf_announcement_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES golf_announcements(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_golf_acknowledgements_announcement ON golf_announcement_acknowledgements(announcement_id);
CREATE INDEX IF NOT EXISTS idx_golf_acknowledgements_player ON golf_announcement_acknowledgements(player_id);
ALTER TABLE golf_announcement_acknowledgements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golf_acks_select_own" ON golf_announcement_acknowledgements FOR SELECT TO authenticated USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));
CREATE POLICY "golf_acks_select_coaches" ON golf_announcement_acknowledgements FOR SELECT TO authenticated USING (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())));
CREATE POLICY "golf_acks_insert_own" ON golf_announcement_acknowledgements FOR INSERT TO authenticated WITH CHECK (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));

-- TABLE 1: golf_announcement_recipients
CREATE TABLE IF NOT EXISTS golf_announcement_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES golf_announcements(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_golf_ann_recipients_announcement ON golf_announcement_recipients(announcement_id);
CREATE INDEX IF NOT EXISTS idx_golf_ann_recipients_player ON golf_announcement_recipients(player_id);
ALTER TABLE golf_announcement_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golf_ann_recipients_select_coaches" ON golf_announcement_recipients FOR SELECT TO authenticated
  USING (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())));
CREATE POLICY "golf_ann_recipients_select_own" ON golf_announcement_recipients FOR SELECT TO authenticated
  USING (player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid()));
CREATE POLICY "golf_ann_recipients_insert_coaches" ON golf_announcement_recipients FOR INSERT TO authenticated
  WITH CHECK (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())));
CREATE POLICY "golf_ann_recipients_delete_coaches" ON golf_announcement_recipients FOR DELETE TO authenticated
  USING (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())));

-- TABLE 2: golf_announcement_documents
CREATE TABLE IF NOT EXISTS golf_announcement_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES golf_announcements(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES golf_documents(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_golf_ann_documents_announcement ON golf_announcement_documents(announcement_id);
CREATE INDEX IF NOT EXISTS idx_golf_ann_documents_document ON golf_announcement_documents(document_id);
ALTER TABLE golf_announcement_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golf_ann_documents_select_team" ON golf_announcement_documents FOR SELECT TO authenticated
  USING (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION
    SELECT team_id FROM golf_team_members WHERE player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  )));
CREATE POLICY "golf_ann_documents_insert_coaches" ON golf_announcement_documents FOR INSERT TO authenticated
  WITH CHECK (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())));
CREATE POLICY "golf_ann_documents_delete_coaches" ON golf_announcement_documents FOR DELETE TO authenticated
  USING (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())));

-- TABLE 3: golf_announcement_tasks
CREATE TABLE IF NOT EXISTS golf_announcement_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES golf_announcements(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES golf_tasks(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, task_id)
);
CREATE INDEX IF NOT EXISTS idx_golf_ann_tasks_announcement ON golf_announcement_tasks(announcement_id);
CREATE INDEX IF NOT EXISTS idx_golf_ann_tasks_task ON golf_announcement_tasks(task_id);
ALTER TABLE golf_announcement_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "golf_ann_tasks_select_team" ON golf_announcement_tasks FOR SELECT TO authenticated
  USING (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (
    SELECT team_id FROM golf_coaches WHERE user_id = auth.uid()
    UNION
    SELECT team_id FROM golf_team_members WHERE player_id IN (SELECT id FROM golf_players WHERE user_id = auth.uid())
  )));
CREATE POLICY "golf_ann_tasks_insert_coaches" ON golf_announcement_tasks FOR INSERT TO authenticated
  WITH CHECK (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())));
CREATE POLICY "golf_ann_tasks_delete_coaches" ON golf_announcement_tasks FOR DELETE TO authenticated
  USING (announcement_id IN (SELECT id FROM golf_announcements WHERE team_id IN (SELECT team_id FROM golf_coaches WHERE user_id = auth.uid())));

COMMENT ON TABLE golf_announcement_acknowledgements IS 'Player acknowledgements of announcements';
COMMENT ON TABLE golf_announcement_recipients IS 'Specific player recipients for announcements. Empty = all team members.';
COMMENT ON TABLE golf_announcement_documents IS 'Documents attached to announcements (links to golf_documents)';
COMMENT ON TABLE golf_announcement_tasks IS 'Tasks attached to announcements (links to golf_tasks)';

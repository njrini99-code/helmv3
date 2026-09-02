BEGIN;

SELECT plan(14);

SELECT has_column('public', 'baseball_camp_registrations', 'registered_at',
  'camp registration workflow can persist when a player registered');
SELECT has_column('public', 'baseball_camp_registrations', 'attended_at',
  'camp check-in workflow can persist when a player attended');
SELECT has_column('public', 'baseball_coach_notes', 'archived_at',
  'coach-note soft delete matches the active action contract');
SELECT has_column('public', 'baseball_coach_notes', 'updated_at',
  'coach-note edit contract records its update timestamp');
SELECT has_column('public', 'baseball_coach_notes', 'title',
  'player today can read note titles');
SELECT has_column('public', 'baseball_coach_notes', 'pinned',
  'player today can read pinned notes');
SELECT has_column('public', 'baseball_import_sources', 'adapter_key',
  'import registry can resolve its adapter key');
SELECT has_column('public', 'baseball_import_sources', 'is_active',
  'import registry can disable an adapter');
SELECT has_column('public', 'baseball_signals', 'body',
  'Decision Room can read signal bodies');
SELECT has_column('public', 'baseball_signals', 'status',
  'Decision Room can filter active signals');
SELECT has_column('public', 'baseball_video_events', 'video_url',
  'scout packets can resolve the production video URL');
SELECT has_column('public', 'baseball_import_runs', 'total_rows',
  'CoachHelm import summaries use the canonical total-row count');
SELECT has_column('public', 'crm_coaches', 'role_level',
  'CRM email workflows can read the deployed contact role level');
SELECT has_column('public', 'crm_coaches', 'is_primary_contact',
  'CRM email workflows can read the deployed primary-contact flag');

SELECT * FROM finish();

ROLLBACK;

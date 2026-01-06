import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function auditCalendarSchema() {
  console.log('=== CALENDAR SYSTEM DATABASE AUDIT ===\n');

  // 1. Check for calendar-related tables
  console.log('1. CHECKING CALENDAR TABLES...\n');

  const { data: tables, error: tablesError } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%calendar%' OR table_name LIKE '%event%')
      ORDER BY table_name;
    `
  });

  if (tablesError) {
    // Try alternative approach - query tables directly
    console.log('Using alternative table check...');

    const tablesToCheck = [
      'calendar_events',
      'calendar_event_attendees',
      'calendar_sync_settings',
      'calendar_preferences',
      'calendar_sync_log',
      'calendar_notifications',
      'golf_events',
      'events'
    ];

    for (const tableName of tablesToCheck) {
      const { data, error } = await supabase.from(tableName).select('*').limit(1);
      if (error) {
        console.log(`❌ ${tableName}: NOT FOUND or ACCESS DENIED`);
      } else {
        console.log(`✅ ${tableName}: EXISTS`);
      }
    }
  } else {
    console.log('Tables found:', tables);
  }

  // 2. Check golf_events schema
  console.log('\n2. CHECKING golf_events TABLE STRUCTURE...\n');

  const { data: golfEvents, error: golfEventsError } = await supabase
    .from('golf_events')
    .select('*')
    .limit(1);

  if (golfEventsError) {
    console.log('❌ golf_events table error:', golfEventsError.message);
  } else {
    console.log('✅ golf_events table exists');
    if (golfEvents && golfEvents.length > 0) {
      console.log('Sample columns:', Object.keys(golfEvents[0]));
    } else {
      // Get column info by trying to select
      console.log('Table is empty, checking structure...');
    }
  }

  // 3. Check baseball events (if exists)
  console.log('\n3. CHECKING BASEBALL EVENTS...\n');

  const { data: baseballEvents, error: baseballEventsError } = await supabase
    .from('events')
    .select('*')
    .limit(1);

  if (baseballEventsError) {
    console.log('❌ events table error:', baseballEventsError.message);
  } else {
    console.log('✅ events table exists');
    if (baseballEvents && baseballEvents.length > 0) {
      console.log('Sample columns:', Object.keys(baseballEvents[0]));
    }
  }

  // 4. Check for calendar_preferences
  console.log('\n4. CHECKING CALENDAR PREFERENCES...\n');

  const { data: calPrefs, error: calPrefsError } = await supabase
    .from('calendar_preferences')
    .select('*')
    .limit(1);

  if (calPrefsError) {
    console.log('❌ calendar_preferences:', calPrefsError.message);
  } else {
    console.log('✅ calendar_preferences exists');
  }

  // 5. Check RLS policies on golf_events
  console.log('\n5. CHECKING RLS POLICIES...\n');

  // Test anonymous access (should be blocked)
  const anonClient = createClient(supabaseUrl, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzA4NjgsImV4cCI6MjA4MTUwNjg2OH0.UHnXXjLiSScNhGdHZIc3dpVXRy9cIOp3FaGZsRecSHw');

  const { data: anonData, error: anonError } = await anonClient
    .from('golf_events')
    .select('*')
    .limit(1);

  if (anonError) {
    console.log('✅ RLS blocking anonymous access:', anonError.message);
  } else {
    console.log('⚠️ Anonymous can access golf_events:', anonData?.length, 'rows');
  }

  // 6. Count events
  console.log('\n6. EVENT COUNTS...\n');

  const { count: golfCount } = await supabase
    .from('golf_events')
    .select('*', { count: 'exact', head: true });
  console.log('Golf events:', golfCount);

  const { count: baseballCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true });
  console.log('Baseball events:', baseballCount);

  // 7. Check for attendees table
  console.log('\n7. CHECKING ATTENDEES/RSVP TABLES...\n');

  const attendeeTables = [
    'calendar_event_attendees',
    'event_attendees',
    'golf_event_attendees'
  ];

  for (const table of attendeeTables) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (!error) {
      console.log(`✅ ${table}: EXISTS`);
    } else {
      console.log(`❌ ${table}: ${error.message}`);
    }
  }

  // 8. Check for sync settings
  console.log('\n8. CHECKING SYNC SETTINGS TABLES...\n');

  const syncTables = [
    'calendar_sync_settings',
    'calendar_sync_log'
  ];

  for (const table of syncTables) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (!error) {
      console.log(`✅ ${table}: EXISTS`);
    } else {
      console.log(`❌ ${table}: ${error.message}`);
    }
  }

  console.log('\n=== AUDIT COMPLETE ===');
}

auditCalendarSchema().catch(console.error);

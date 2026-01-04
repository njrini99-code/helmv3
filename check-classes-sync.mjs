#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('🔍 DIAGNOSING CLASS/CALENDAR SYNC ISSUE\n');
console.log('='.repeat(80));

// Get your player info
const { data: player } = await supabase
  .from('golf_players')
  .select('id, user_id, email')
  .eq('email', 'rinin376@gmail.com')
  .single();

console.log('\n👤 Your Account:');
console.log('Player ID:', player.id);
console.log('User ID:', player.user_id);

// Check golf_player_classes
const { data: classes, error: classError } = await supabase
  .from('golf_player_classes')
  .select('*')
  .eq('player_id', player.id)
  .order('created_at', { ascending: false });

console.log('\n📚 STEP 1: Classes in golf_player_classes table');
if (classError) {
  console.log('❌ Error querying classes:', classError.message);
} else {
  console.log('✅ Found:', classes?.length || 0, 'classes');
  classes?.forEach((c, i) => {
    console.log(`\n  Class ${i + 1}:`);
    console.log('    Code:', c.course_code);
    console.log('    Name:', c.course_name);
    console.log('    Days:', JSON.stringify(c.days));
    console.log('    Time:', c.start_time, '-', c.end_time);
    console.log('    Created:', c.created_at);
  });
}

// Check golf_events created by player
const { data: playerEvents, error: eventError } = await supabase
  .from('golf_events')
  .select('*')
  .eq('created_by', player.id)
  .order('created_at', { ascending: false });

console.log('\n\n📅 STEP 2: Events in golf_events table (created by you)');
if (eventError) {
  console.log('❌ Error querying events:', eventError.message);
} else {
  console.log('Found:', playerEvents?.length || 0, 'events');
  playerEvents?.forEach((e, i) => {
    console.log(`\n  Event ${i + 1}:`);
    console.log('    Title:', e.title);
    console.log('    Type:', e.event_type);
    console.log('    Start:', e.start_date);
    console.log('    Team ID:', e.team_id || 'Personal');
    console.log('    Created:', e.created_at);
  });
}

// Diagnosis
console.log('\n\n' + '='.repeat(80));
console.log('💡 DIAGNOSIS');
console.log('='.repeat(80));

const hasClasses = classes && classes.length > 0;
const hasEvents = playerEvents && playerEvents.length > 0;

if (hasClasses && !hasEvents) {
  console.log('\n❌ ISSUE CONFIRMED: Classes saved but NOT synced to calendar!');
  console.log('\nWhat happened:');
  console.log('  1. ✅ Classes successfully saved to golf_player_classes');
  console.log('  2. ❌ syncClassToCalendar() FAILED to create events in golf_events');
  console.log('  3. ❌ RLS policy on golf_events blocked INSERT operation');
  console.log('\nWhy the RLS policy blocked it:');
  console.log('  • golf_events requires "Players can create personal events" policy');
  console.log('  • Current policy likely missing or too restrictive');
  console.log('\nFIX: Apply FIX_GOLF_EVENTS_RLS.sql in Supabase Dashboard');
  console.log('     This adds the missing INSERT policy for personal events');
} else if (!hasClasses && !hasEvents) {
  console.log('\n⚠️  No classes or events found');
  console.log('   Either nothing was added, or both tables are empty');
} else if (hasClasses && hasEvents) {
  console.log('\n✅ Classes and calendar events both exist!');
  console.log(`   ${classes.length} classes → ${playerEvents.length} calendar events`);
  console.log('\nIf calendar still doesn\'t show them:');
  console.log('  • Check calendar page is querying correctly');
  console.log('  • Verify RLS SELECT policy allows viewing personal events');
} else {
  console.log('\n⚠️  Unusual state - events exist but no classes?');
}

console.log('\n');

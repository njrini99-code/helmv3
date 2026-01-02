import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║      COMPREHENSIVE AUTH SYSTEM AUDIT - ALL PHASES              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // ========================================================================
  // PHASE 3: DATABASE SCHEMA AUDIT
  // ========================================================================
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                 PHASE 3: DATABASE SCHEMA AUDIT                 ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 3.1 Table Structures
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│                 3.1 TABLE STRUCTURES                         │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  const tables = ['users', 'coaches', 'players', 'golf_coaches', 'golf_players', 'organizations', 'golf_organizations', 'golf_teams'];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`📊 ${table.toUpperCase()}: ❌ Error - ${error.message}`);
    } else if (data && data[0]) {
      console.log(`📊 ${table.toUpperCase()}:`);
      console.log(`   Columns: ${Object.keys(data[0]).join(', ')}\n`);
    } else {
      console.log(`📊 ${table.toUpperCase()}: (empty table)\n`);
    }
  }

  // 3.4 Orphaned/Duplicate Records Check
  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│            3.4 ORPHANED/DUPLICATE RECORDS CHECK              │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  // Get all data
  const { data: allUsers } = await supabase.from('users').select('id, email, role, sport');
  const { data: coaches } = await supabase.from('coaches').select('id, user_id');
  const { data: players } = await supabase.from('players').select('id, user_id').not('user_id', 'is', null);
  const { data: golfCoaches } = await supabase.from('golf_coaches').select('id, user_id');
  const { data: golfPlayers } = await supabase.from('golf_players').select('id, user_id');

  const coachUserIds = new Set(coaches?.map(c => c.user_id) || []);
  const playerUserIds = new Set(players?.map(p => p.user_id) || []);
  const golfCoachUserIds = new Set(golfCoaches?.map(c => c.user_id) || []);
  const golfPlayerUserIds = new Set(golfPlayers?.map(p => p.user_id) || []);

  // Check orphaned users
  const orphanedUsers = allUsers?.filter(u => {
    return !coachUserIds.has(u.id) &&
           !playerUserIds.has(u.id) &&
           !golfCoachUserIds.has(u.id) &&
           !golfPlayerUserIds.has(u.id);
  }) || [];

  console.log(`3.4.1 Auth users without public.users record: (need auth access)`);
  console.log(`3.4.2 Public.users without auth.users record: (need auth access)`);

  console.log(`\n3.4.3 Coaches with no matching users record:`);
  const orphanedCoaches = coaches?.filter(c => !allUsers?.find(u => u.id === c.user_id)) || [];
  console.log(orphanedCoaches.length === 0 ? '   ✅ None' : `   ❌ Found ${orphanedCoaches.length}`);

  console.log(`\n3.4.4 Players with no matching users record:`);
  const orphanedPlayers = players?.filter(p => !allUsers?.find(u => u.id === p.user_id)) || [];
  console.log(orphanedPlayers.length === 0 ? '   ✅ None' : `   ❌ Found ${orphanedPlayers.length}`);

  console.log(`\n3.4.5 Golf_coaches with no matching users record:`);
  const orphanedGolfCoaches = golfCoaches?.filter(c => !allUsers?.find(u => u.id === c.user_id)) || [];
  console.log(orphanedGolfCoaches.length === 0 ? '   ✅ None' : `   ❌ Found ${orphanedGolfCoaches.length}`);

  console.log(`\n3.4.6 Golf_players with no matching users record:`);
  const orphanedGolfPlayers = golfPlayers?.filter(p => !allUsers?.find(u => u.id === p.user_id)) || [];
  console.log(orphanedGolfPlayers.length === 0 ? '   ✅ None' : `   ❌ Found ${orphanedGolfPlayers.length}`);

  // Check users with both baseball AND golf records
  console.log(`\n3.4.9 Users with BOTH baseball AND golf records (conflict):`);
  const conflictUsers = allUsers?.filter(u => {
    const hasBaseball = coachUserIds.has(u.id) || playerUserIds.has(u.id);
    const hasGolf = golfCoachUserIds.has(u.id) || golfPlayerUserIds.has(u.id);
    return hasBaseball && hasGolf;
  }) || [];
  if (conflictUsers.length === 0) {
    console.log('   ✅ None');
  } else {
    console.log(`   ❌ Found ${conflictUsers.length}:`);
    conflictUsers.forEach(u => console.log(`      - ${u.email}`));
  }

  // 3.4.10 Complete User Audit
  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│              3.4.10 COMPLETE USER AUDIT                      │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  console.log('ID'.substring(0,8).padEnd(10) + 'Email'.padEnd(30) + 'Role'.padEnd(10) + 'Sport'.padEnd(10) + 'Baseball'.padEnd(15) + 'Golf');
  console.log('─'.repeat(90));

  allUsers?.forEach(u => {
    const baseballRecord = coachUserIds.has(u.id) ? 'coach' : (playerUserIds.has(u.id) ? 'player' : '-');
    const golfRecord = golfCoachUserIds.has(u.id) ? 'coach' : (golfPlayerUserIds.has(u.id) ? 'player' : '-');
    console.log(
      u.id.substring(0,8).padEnd(10) +
      u.email.substring(0,28).padEnd(30) +
      u.role.padEnd(10) +
      (u.sport || 'null').padEnd(10) +
      baseballRecord.padEnd(15) +
      golfRecord
    );
  });

  // Sport mismatch check
  console.log('\n┌─────────────────────────────────────────────────────────────┐');
  console.log('│              SPORT MISMATCH CHECK                            │');
  console.log('└─────────────────────────────────────────────────────────────┘\n');

  const golfUsersWithBaseball = allUsers?.filter(u =>
    u.sport === 'golf' && (coachUserIds.has(u.id) || playerUserIds.has(u.id))
  ) || [];

  const baseballUsersWithGolf = allUsers?.filter(u =>
    u.sport === 'baseball' && (golfCoachUserIds.has(u.id) || golfPlayerUserIds.has(u.id))
  ) || [];

  console.log(`Golf users with baseball profiles: ${golfUsersWithBaseball.length === 0 ? '✅ None' : '❌ ' + golfUsersWithBaseball.length}`);
  console.log(`Baseball users with golf profiles: ${baseballUsersWithGolf.length === 0 ? '✅ None' : '❌ ' + baseballUsersWithGolf.length}`);

  // Sport-specific profile check
  const golfUsers = allUsers?.filter(u => u.sport === 'golf') || [];
  const baseballUsers = allUsers?.filter(u => u.sport === 'baseball') || [];

  const golfUsersWithoutProfile = golfUsers.filter(u =>
    !golfCoachUserIds.has(u.id) && !golfPlayerUserIds.has(u.id)
  );
  const baseballUsersWithoutProfile = baseballUsers.filter(u =>
    !coachUserIds.has(u.id) && !playerUserIds.has(u.id)
  );

  console.log(`Golf users without golf profile: ${golfUsersWithoutProfile.length === 0 ? '✅ None' : '❌ ' + golfUsersWithoutProfile.length}`);
  console.log(`Baseball users without baseball profile: ${baseballUsersWithoutProfile.length === 0 ? '✅ None' : '❌ ' + baseballUsersWithoutProfile.length}`);

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                         SUMMARY                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('User Counts:');
  console.log(`  Total users: ${allUsers?.length || 0}`);
  console.log(`  Golf users: ${golfUsers.length}`);
  console.log(`  Baseball users: ${baseballUsers.length}`);
  console.log(`  Users with null sport: ${allUsers?.filter(u => !u.sport).length || 0}`);

  console.log('\nProfile Counts:');
  console.log(`  Baseball coaches: ${coaches?.length || 0}`);
  console.log(`  Baseball players (with user_id): ${players?.length || 0}`);
  console.log(`  Golf coaches: ${golfCoaches?.length || 0}`);
  console.log(`  Golf players: ${golfPlayers?.length || 0}`);

  console.log('\nIntegrity Status:');
  console.log(`  Orphaned users: ${orphanedUsers.length === 0 ? '✅ None' : '❌ ' + orphanedUsers.length}`);
  console.log(`  Cross-sport conflicts: ${conflictUsers.length === 0 ? '✅ None' : '❌ ' + conflictUsers.length}`);
  console.log(`  Sport mismatches: ${(golfUsersWithBaseball.length + baseballUsersWithGolf.length) === 0 ? '✅ None' : '❌ Found'}`);
}

main().catch(console.error);

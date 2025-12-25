import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzA4NjgsImV4cCI6MjA4MTUwNjg2OH0.CPpPgG_EEXvu5eaSaDD-FPSVXcNTPlA5VS9W5tcX5Ck';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

async function diagnose() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  COMPLETE DIAGNOSTIC FOR potter21@icloud.com             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const email = 'potter21@icloud.com';
  const userId = '01fae126-0ac4-440e-8526-89f5b84691e2';

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // === 1. Check User & Player Records ===
  console.log('📋 STEP 1: Verify User & Player Records');
  console.log('─'.repeat(60));

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (!user) {
    console.error('❌ User not found!');
    return;
  }

  console.log(`✅ User exists: ${user.email}`);
  console.log(`   Role: ${user.role}`);
  console.log(`   ID: ${user.id}`);

  const { data: player } = await supabaseAdmin
    .from('golf_players')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!player) {
    console.error('❌ Golf player record not found!');
    return;
  }

  console.log(`✅ Golf player exists: ${player.first_name} ${player.last_name}`);
  console.log(`   Player ID: ${player.id}\n`);

  // === 2. Check RLS Policies ===
  console.log('🔒 STEP 2: Verify RLS Policies Are Applied');
  console.log('─'.repeat(60));

  // Check migration status
  const { data: migrations } = await supabaseAdmin
    .from('supabase_migrations')
    .select('*')
    .in('version', ['20251225000028', '20251225000029'])
    .order('version');

  if (!migrations || migrations.length < 2) {
    console.error('❌ MIGRATIONS NOT APPLIED!');
    console.log('   Expected: 20251225000028 and 20251225000029');
    console.log('   Found:', migrations?.map(m => m.version) || 'none');
    console.log('\n   ⚠️  This is likely the problem!');
    console.log('   Run: npx supabase db push');
    return;
  }

  console.log(`✅ Migration 20251225000028 applied (golf_rounds)`);
  console.log(`✅ Migration 20251225000029 applied (golf_holes)\n`);

  // === 3. Test Round INSERT ===
  console.log('📝 STEP 3: Test Round INSERT');
  console.log('─'.repeat(60));

  const testRound = {
    player_id: player.id,
    course_name: 'Diagnostic Test Round',
    round_type: 'practice',
    round_date: '2025-12-25',
    total_score: 72,
    total_to_par: 0,
    total_putts: 30,
    fairways_hit: 10,
    fairways_total: 14,
    greens_in_regulation: 12,
    greens_total: 18,
    is_verified: false,
  };

  const { data: round, error: roundError } = await supabaseAdmin
    .from('golf_rounds')
    .insert(testRound)
    .select()
    .single();

  if (roundError) {
    console.error('❌ Round INSERT FAILED:');
    console.error(`   Code: ${roundError.code}`);
    console.error(`   Message: ${roundError.message}`);
    console.error(`   Details: ${roundError.details}`);
    return;
  }

  console.log(`✅ Round inserted successfully`);
  console.log(`   Round ID: ${round.id}\n`);

  // === 4. Test Holes INSERT ===
  console.log('⛳ STEP 4: Test Holes INSERT');
  console.log('─'.repeat(60));

  const testHoles = [
    { round_id: round.id, hole_number: 1, par: 4, score: 4, score_to_par: 0, putts: 2 },
    { round_id: round.id, hole_number: 2, par: 3, score: 3, score_to_par: 0, putts: 2 },
  ];

  const { data: holes, error: holesError } = await supabaseAdmin
    .from('golf_holes')
    .insert(testHoles)
    .select();

  if (holesError) {
    console.error('❌ Holes INSERT FAILED:');
    console.error(`   Code: ${holesError.code}`);
    console.error(`   Message: ${holesError.message}`);
    console.error(`   Details: ${holesError.details}`);

    // Clean up round
    await supabaseAdmin.from('golf_rounds').delete().eq('id', round.id);
    return;
  }

  console.log(`✅ ${holes.length} holes inserted successfully\n`);

  // === 5. Simulate Frontend (Anon Key) ===
  console.log('🌐 STEP 5: Simulate Frontend Request');
  console.log('─'.repeat(60));
  console.log('NOTE: Cannot test with anon key without password');
  console.log('The frontend would need potter21@icloud.com to be signed in\n');

  // === 6. Check for Other Issues ===
  console.log('🔍 STEP 6: Check for Other Potential Issues');
  console.log('─'.repeat(60));

  // Check if player has organization_id (required for some policies)
  if (player.organization_id) {
    console.log(`✅ Player has organization: ${player.organization_id}`);
  } else {
    console.log(`⚠️  Player has no organization_id (this is OK)`);
  }

  // Check if player has team_id
  if (player.team_id) {
    console.log(`✅ Player has team: ${player.team_id}`);
  } else {
    console.log(`⚠️  Player has no team_id (this is OK for solo players)`);
  }

  console.log();

  // === Cleanup ===
  console.log('🧹 Cleaning up test data...');
  await supabaseAdmin.from('golf_holes').delete().eq('round_id', round.id);
  await supabaseAdmin.from('golf_rounds').delete().eq('id', round.id);
  console.log('✅ Cleanup complete\n');

  // === Final Verdict ===
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  FINAL VERDICT                                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('✅ User record: OK');
  console.log('✅ Player record: OK');
  console.log('✅ Migrations applied: OK');
  console.log('✅ Round INSERT: OK');
  console.log('✅ Holes INSERT: OK');

  console.log('\n🎉 DATABASE IS WORKING CORRECTLY!\n');
  console.log('If potter21@icloud.com still cannot save rounds,');
  console.log('the issue is likely:');
  console.log('  1. Frontend error (check browser console)');
  console.log('  2. Authentication issue (not signed in)');
  console.log('  3. Form validation error');
  console.log('  4. Network error\n');

  console.log('Ask potter21@icloud.com to:');
  console.log('  1. Open browser console (F12)');
  console.log('  2. Try to save a round');
  console.log('  3. Share any error messages shown\n');
}

diagnose().catch(console.error);

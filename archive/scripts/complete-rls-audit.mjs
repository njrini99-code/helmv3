#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzA4NjgsImV4cCI6MjA4MTUwNjg2OH0.CPpPgG_EEXvu5eaSaDD-FPSVXcNTPlA5VS9W5tcX5Ck';

const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 COMPREHENSIVE RLS AUDIT REPORT');
console.log('='.repeat(80));
console.log('\n📅 Date:', new Date().toISOString());
console.log('🔗 Project:', supabaseUrl);
console.log('\n');

const golfTables = [
  'golf_players',
  'golf_teams',
  'golf_coaches',
  'golf_organizations',
  'golf_rounds',
  'golf_shots',
  'golf_events',
  'golf_qualifiers',
  'golf_qualifier_rounds'
];

const baseballTables = [
  'users',
  'players',
  'coaches',
  'organizations',
  'teams',
  'team_members',
  'watchlists',
  'videos',
  'messages',
  'conversations'
];

async function auditTable(tableName) {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`📊 TABLE: ${tableName}`);
  console.log('─'.repeat(80));

  // Get row count with service key (bypasses RLS)
  const { count: totalRows, error: countError } = await serviceClient
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.log(`❌ ERROR: Cannot access table - ${countError.message}`);
    console.log(`   Code: ${countError.code}`);
    console.log(`   Details: ${countError.details}`);
    return {
      table: tableName,
      accessible: false,
      error: countError.message
    };
  }

  console.log(`✅ Total Rows: ${totalRows || 0}`);

  // Try with anon key (subject to RLS)
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);
  const { count: anonRows, error: anonError } = await anonClient
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  if (anonError && anonError.code !== 'PGRST301') {
    console.log(`⚠️  Anon Access: ${anonError.message}`);
  } else {
    console.log(`🔓 Anon Access: ${anonRows || 0} rows visible`);
  }

  // Check if RLS is enabled
  // We can't directly query this without a special function, but we can infer it
  const rlsEnabled = anonError || (anonRows === 0 && totalRows > 0);

  if (rlsEnabled && totalRows > 0) {
    console.log(`🔒 RLS Status: ENABLED (blocking ${totalRows} rows from anon)`);
  } else if (!rlsEnabled && totalRows > 0) {
    console.log(`⚠️  RLS Status: DISABLED or PERMISSIVE (${totalRows} rows exposed!)`);
  } else {
    console.log(`ℹ️  RLS Status: No data to test`);
  }

  return {
    table: tableName,
    accessible: true,
    totalRows: totalRows || 0,
    anonRows: anonRows || 0,
    rlsBlocking: rlsEnabled && totalRows > 0,
    error: null
  };
}

console.log('🏌️ GOLF TABLES AUDIT');
console.log('='.repeat(80));

const golfResults = [];
for (const table of golfTables) {
  const result = await auditTable(table);
  golfResults.push(result);
}

console.log('\n\n⚾ BASEBALL TABLES AUDIT');
console.log('='.repeat(80));

const baseballResults = [];
for (const table of baseballTables) {
  const result = await auditTable(table);
  baseballResults.push(result);
}

console.log('\n\n');
console.log('='.repeat(80));
console.log('📋 AUDIT SUMMARY');
console.log('='.repeat(80));

console.log('\n🏌️ Golf Tables:');
console.log('─'.repeat(80));
console.log('Table                      | Total Rows | Anon Access | RLS Status');
console.log('─'.repeat(80));
for (const result of golfResults) {
  if (result.accessible) {
    const status = result.rlsBlocking ? '✅ Protected' :
                   result.totalRows === 0 ? 'ℹ️  Empty' :
                   '⚠️  EXPOSED';
    console.log(
      `${result.table.padEnd(26)} | ${String(result.totalRows).padStart(10)} | ${String(result.anonRows).padStart(11)} | ${status}`
    );
  } else {
    console.log(`${result.table.padEnd(26)} | ERROR: ${result.error}`);
  }
}

console.log('\n⚾ Baseball Tables:');
console.log('─'.repeat(80));
console.log('Table                      | Total Rows | Anon Access | RLS Status');
console.log('─'.repeat(80));
for (const result of baseballResults) {
  if (result.accessible) {
    const status = result.rlsBlocking ? '✅ Protected' :
                   result.totalRows === 0 ? 'ℹ️  Empty' :
                   '⚠️  EXPOSED';
    console.log(
      `${result.table.padEnd(26)} | ${String(result.totalRows).padStart(10)} | ${String(result.anonRows).padStart(11)} | ${status}`
    );
  } else {
    console.log(`${result.table.padEnd(26)} | ERROR: ${result.error}`);
  }
}

// Critical findings
console.log('\n\n');
console.log('='.repeat(80));
console.log('🚨 CRITICAL SECURITY ISSUES');
console.log('='.repeat(80));

const exposedTables = [...golfResults, ...baseballResults].filter(
  r => r.accessible && r.totalRows > 0 && !r.rlsBlocking
);

if (exposedTables.length === 0) {
  console.log('✅ No tables with data are publicly exposed');
} else {
  console.log(`⚠️  ${exposedTables.length} tables with data are publicly exposed:\n`);
  for (const table of exposedTables) {
    console.log(`   ❌ ${table.table}: ${table.totalRows} rows accessible anonymously`);
  }
}

// Test player-specific access
console.log('\n\n');
console.log('='.repeat(80));
console.log('🧪 PLAYER-SPECIFIC ACCESS TEST');
console.log('='.repeat(80));
console.log('\nTesting access for player: rinin376@gmail.com');

const playerUserId = '5bab961e-4ea4-4c88-812f-68a9469f8156';
const { data: playerData } = await serviceClient
  .from('golf_players')
  .select('id, first_name, last_name, email')
  .eq('user_id', playerUserId)
  .single();

if (playerData) {
  console.log(`✅ Player found: ${playerData.first_name} ${playerData.last_name}`);
  console.log(`   Player ID: ${playerData.id}`);
  console.log(`   User ID: ${playerUserId}`);

  // Check rounds
  const { data: rounds } = await serviceClient
    .from('golf_rounds')
    .select('id, course_name, total_score')
    .eq('player_id', playerData.id);

  console.log(`\n   Rounds: ${rounds?.length || 0}`);
  if (rounds && rounds.length > 0) {
    for (const round of rounds) {
      console.log(`      - ${round.course_name} (Score: ${round.total_score})`);

      // Check shots for this round
      const { data: shots } = await serviceClient
        .from('golf_shots')
        .select('id')
        .eq('round_id', round.id);

      console.log(`        Shots: ${shots?.length || 0}`);
    }
  }
} else {
  console.log('❌ Player not found');
}

console.log('\n\n');
console.log('='.repeat(80));
console.log('✅ AUDIT COMPLETE');
console.log('='.repeat(80));
console.log('\nRECOMMENDATIONS:');
console.log('1. Apply migration 050_complete_golf_rls.sql to fix exposed tables');
console.log('2. Test that stats still work after applying RLS policies');
console.log('3. Verify player can access their own data through the frontend');
console.log('4. Consider enabling RLS on all baseball tables as well');
console.log('\n');

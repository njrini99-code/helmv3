#!/usr/bin/env node
/**
 * Database Audits - What we CAN check via Supabase REST API
 * For system table queries (RLS, indexes, etc.), manual SQL is needed
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const results = {
  timestamp: new Date().toISOString(),
  checks: []
};

async function check(name, description, fn) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🔍 ${name}`);
  console.log(`${description}`);
  console.log(`${'═'.repeat(80)}\n`);

  try {
    const result = await fn();
    results.checks.push({ name, description, status: 'success', ...result });
    return result;
  } catch (error) {
    console.log(`❌ Error: ${error.message}\n`);
    results.checks.push({ name, description, status: 'error', error: error.message });
    return null;
  }
}

// CHECK 1: User Distribution
await check(
  'User Distribution by Role & Sport',
  'Verify users are correctly categorized',
  async () => {
    const { data, error } = await supabase
      .from('users')
      .select('role, sport');

    if (error) throw error;

    const distribution = {};
    data.forEach(user => {
      const key = `${user.role}/${user.sport}`;
      distribution[key] = (distribution[key] || 0) + 1;
    });

    console.log('User Distribution:');
    console.table(distribution);
    console.log();

    const golfPlayers = data.filter(u => u.sport === 'golf' && u.role === 'player').length;
    const golfCoaches = data.filter(u => u.sport === 'golf' && u.role === 'coach').length;

    console.log(`Golf Players: ${golfPlayers}`);
    console.log(`Golf Coaches: ${golfCoaches}`);
    console.log();

    return { total: data.length, distribution, golfPlayers, golfCoaches };
  }
);

// CHECK 2: Orphaned Golf Players
await check(
  '🟠 HIGH: Orphaned Golf Players',
  'Golf players without valid user accounts',
  async () => {
    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('id, email, user_id, created_at');

    if (playersError) throw playersError;

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, sport');

    if (usersError) throw usersError;

    const userIds = new Set(users.map(u => u.id));
    const golfUserIds = new Set(users.filter(u => u.sport === 'golf').map(u => u.id));

    const orphaned = players.filter(p => !p.user_id || !userIds.has(p.user_id));
    const sportMismatch = players.filter(p => p.user_id && userIds.has(p.user_id) && !golfUserIds.has(p.user_id));

    if (orphaned.length === 0 && sportMismatch.length === 0) {
      console.log('✅ EXCELLENT! No orphaned golf players');
      console.log('✅ All golf_players have valid user accounts with sport=golf\n');
    } else {
      if (orphaned.length > 0) {
        console.log(`🔴 Found ${orphaned.length} orphaned golf players (no user_id or deleted user):\n`);
        console.table(orphaned);
      }
      if (sportMismatch.length > 0) {
        console.log(`\n🔴 Found ${sportMismatch.length} golf players with sport mismatch:\n`);
        console.table(sportMismatch);
      }
      console.log();
    }

    return { totalPlayers: players.length, orphaned: orphaned.length, sportMismatch: sportMismatch.length };
  }
);

// CHECK 3: Orphaned Golf Teams
await check(
  'Orphaned Golf Teams',
  'Golf teams without valid organizations',
  async () => {
    const { data: teams, error: teamsError } = await supabase
      .from('golf_teams')
      .select('id, name, organization_id');

    if (teamsError) throw teamsError;

    const { data: orgs, error: orgsError } = await supabase
      .from('golf_organizations')
      .select('id');

    if (orgsError) throw orgsError;

    const orgIds = new Set(orgs.map(o => o.id));
    const orphaned = teams.filter(t => !t.organization_id || !orgIds.has(t.organization_id));

    if (orphaned.length === 0) {
      console.log('✅ No orphaned golf teams');
      console.log(`✅ All ${teams.length} teams have valid organizations\n`);
    } else {
      console.log(`🔴 Found ${orphaned.length} orphaned golf teams:\n`);
      console.table(orphaned);
      console.log();
    }

    return { totalTeams: teams.length, orphaned: orphaned.length };
  }
);

// CHECK 4: NULL Data Quality
await check(
  'Data Quality - NULL Values',
  'Check for NULL values in critical fields',
  async () => {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('email, role, sport');

    if (usersError) throw usersError;

    const nullEmails = users.filter(u => !u.email).length;
    const nullRoles = users.filter(u => !u.role).length;
    const nullSports = users.filter(u => !u.sport).length;

    console.log('Users table:');
    console.log(`  Total rows: ${users.length}`);
    console.log(`  NULL emails: ${nullEmails}`);
    console.log(`  NULL roles: ${nullRoles}`);
    console.log(`  NULL sports: ${nullSports}`);

    const { data: players, error: playersError } = await supabase
      .from('golf_players')
      .select('user_id, email, first_name, last_name');

    if (playersError) throw playersError;

    const nullUserIds = players.filter(p => !p.user_id).length;
    const nullPlayerEmails = players.filter(p => !p.email).length;
    const nullFirstNames = players.filter(p => !p.first_name).length;
    const nullLastNames = players.filter(p => !p.last_name).length;

    console.log('\nGolf Players table:');
    console.log(`  Total rows: ${players.length}`);
    console.log(`  NULL user_ids: ${nullUserIds}`);
    console.log(`  NULL emails: ${nullPlayerEmails}`);
    console.log(`  NULL first_names: ${nullFirstNames}`);
    console.log(`  NULL last_names: ${nullLastNames}`);

    const issues = nullEmails + nullRoles + nullSports + nullUserIds;

    if (issues === 0) {
      console.log('\n✅ EXCELLENT! No NULL values in critical fields\n');
    } else {
      console.log(`\n⚠️  Found ${issues} NULL values in critical fields\n`);
    }

    return {
      users: { nullEmails, nullRoles, nullSports },
      players: { nullUserIds, nullPlayerEmails, nullFirstNames, nullLastNames }
    };
  }
);

// CHECK 5: Recent Activity
await check(
  'Recent Database Activity',
  'Verify system is being used',
  async () => {
    const { data: recentUsers, error: usersError } = await supabase
      .from('users')
      .select('email, role, sport, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (usersError) throw usersError;

    console.log('Recently created users:');
    console.table(recentUsers);

    const { data: recentPlayers, error: playersError } = await supabase
      .from('golf_players')
      .select('email, first_name, last_name, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (playersError) throw playersError;

    console.log('\nRecently created golf players:');
    console.table(recentPlayers);
    console.log();

    return { recentUsers, recentPlayers };
  }
);

// SUMMARY
console.log('\n\n' + '═'.repeat(80));
console.log('📊 AUDIT SUMMARY');
console.log('═'.repeat(80));
console.log();

const passed = results.checks.filter(c => c.status === 'success').length;
const failed = results.checks.filter(c => c.status === 'error').length;

console.log(`Total Checks: ${results.checks.length}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log();

// Critical findings
const orphanedPlayers = results.checks.find(c => c.name.includes('Orphaned Golf Players'));
const dataQuality = results.checks.find(c => c.name.includes('Data Quality'));

if (orphanedPlayers && (orphanedPlayers.orphaned > 0 || orphanedPlayers.sportMismatch > 0)) {
  console.log('🔴 CRITICAL: Orphaned golf players found - needs immediate attention');
}

if (dataQuality) {
  const totalNulls =
    dataQuality.users.nullEmails +
    dataQuality.users.nullRoles +
    dataQuality.users.nullSports +
    dataQuality.players.nullUserIds;

  if (totalNulls > 0) {
    console.log('⚠️  WARNING: NULL values found in critical fields');
  }
}

console.log('\n📋 MANUAL CHECKS NEEDED:');
console.log('Run these SQL files in Supabase Dashboard for complete audit:');
console.log('  1. AUDIT_BATCH_2_SECURITY_CRITICAL.sql - RLS status (CRITICAL)');
console.log('  2. AUDIT_BATCH_3_RLS_POLICIES.sql - Policy details');
console.log('  3. AUDIT_BATCH_5_FUNCTIONS_TRIGGERS.sql - Functions & triggers');
console.log();

// Save results
import { writeFileSync } from 'fs';
writeFileSync('./AUDIT_RESULTS_API.json', JSON.stringify(results, null, 2));
console.log('📄 Results saved to: AUDIT_RESULTS_API.json\n');

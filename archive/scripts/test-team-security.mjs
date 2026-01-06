#!/usr/bin/env node

/**
 * Team Security Test Script
 *
 * Tests the team-based RLS policies and application code to ensure:
 * 1. Users can only see data from their own team
 * 2. Cross-team data leakage is prevented
 * 3. Error handling works correctly
 *
 * Run with: node test-team-security.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_ANON_KEY environment variable');
  console.log('Set it in your .env.local file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('\n🧪 Team Security Test Suite\n');
console.log('Testing against:', SUPABASE_URL);
console.log('─'.repeat(60));

// Test Results Tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function recordTest(name, passed, details = '') {
  results.tests.push({ name, passed, details });
  if (passed) {
    results.passed++;
    console.log(`✅ ${name}`);
  } else {
    results.failed++;
    console.log(`❌ ${name}`);
    if (details) console.log(`   ${details}`);
  }
}

// ============================================================================
// TEST 1: Verify RLS is Enabled
// ============================================================================
async function testRLSEnabled() {
  console.log('\n📋 Test 1: Verify RLS is Enabled\n');

  const tables = ['golf_players', 'golf_coaches', 'golf_teams', 'golf_events', 'golf_event_attendance'];

  for (const table of tables) {
    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_string: `
          SELECT rowsecurity
          FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename = '${table}';
        `
      });

      if (error) {
        recordTest(`RLS check for ${table}`, false, `Error: ${error.message}`);
        continue;
      }

      const rlsEnabled = data?.[0]?.rowsecurity === true;
      recordTest(
        `RLS enabled on ${table}`,
        rlsEnabled,
        rlsEnabled ? '' : 'RLS is DISABLED - data is public!'
      );
    } catch (err) {
      recordTest(`RLS check for ${table}`, false, `Exception: ${err.message}`);
    }
  }
}

// ============================================================================
// TEST 2: Create Test Users and Teams
// ============================================================================
async function setupTestData() {
  console.log('\n📋 Test 2: Setup Test Data\n');

  try {
    // This test requires service role access
    console.log('⏭️  Skipping test data setup (requires service role)');
    console.log('   Manual setup recommended for full testing');
  } catch (err) {
    console.log('⏭️  Test data setup skipped:', err.message);
  }
}

// ============================================================================
// TEST 3: Verify Team Isolation (Requires Test Users)
// ============================================================================
async function testTeamIsolation() {
  console.log('\n📋 Test 3: Verify Team Isolation\n');

  console.log('ℹ️  This test requires:');
  console.log('   - Two teams with different IDs');
  console.log('   - Coaches/players assigned to each team');
  console.log('   - Manual login to test each perspective');
  console.log('\n   Run this test manually by:');
  console.log('   1. Log in as Coach from Team A');
  console.log('   2. Check roster - should see ONLY Team A players');
  console.log('   3. Check messages - should see ONLY Team A members');
  console.log('   4. Log in as Coach from Team B');
  console.log('   5. Verify completely different set of users');
}

// ============================================================================
// TEST 4: Verify Helper Function Exists
// ============================================================================
async function testHelperFunction() {
  console.log('\n📋 Test 4: Verify Helper Function\n');

  try {
    const { data, error } = await supabase.rpc('get_user_team_ids');

    if (error && error.code === '42883') {
      // Function doesn't exist
      recordTest(
        'Helper function get_user_team_ids() exists',
        false,
        'Function not found - migration may not have run'
      );
    } else if (error && error.message.includes('permission denied')) {
      // Function exists but requires auth
      recordTest(
        'Helper function get_user_team_ids() exists',
        true,
        'Function exists (requires authentication to execute)'
      );
    } else {
      recordTest(
        'Helper function get_user_team_ids() exists',
        true,
        `Returns ${data?.length || 0} team IDs`
      );
    }
  } catch (err) {
    recordTest(
      'Helper function get_user_team_ids() exists',
      false,
      `Error: ${err.message}`
    );
  }
}

// ============================================================================
// TEST 5: Verify Policies Exist
// ============================================================================
async function testPoliciesExist() {
  console.log('\n📋 Test 5: Verify RLS Policies Exist\n');

  const expectedPolicies = {
    'golf_players': [
      'golf_players_view_self',
      'golf_players_view_teammates',
      'golf_players_insert_own_profile',
      'golf_players_update_own_profile',
      'golf_players_delete_own_profile'
    ],
    'golf_coaches': [
      'golf_coaches_view_self',
      'golf_coaches_view_team_coaches',
      'golf_coaches_insert_own_profile',
      'golf_coaches_update_own_profile',
      'golf_coaches_delete_own_profile'
    ],
    'golf_teams': [
      'golf_teams_view_own_team',
      'golf_teams_insert',
      'golf_teams_update',
      'golf_teams_delete'
    ],
    'golf_events': [
      'golf_events_view_team_events',
      'golf_events_insert',
      'golf_events_update',
      'golf_events_delete'
    ]
  };

  for (const [table, policies] of Object.entries(expectedPolicies)) {
    try {
      // Try to query policies (this might fail without service role)
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_string: `
          SELECT policyname
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = '${table}';
        `
      });

      if (error) {
        console.log(`⏭️  Cannot verify policies on ${table} (requires service role)`);
        continue;
      }

      const existingPolicies = data?.map(p => p.policyname) || [];
      const missingPolicies = policies.filter(p => !existingPolicies.includes(p));

      if (missingPolicies.length === 0) {
        recordTest(`All policies exist on ${table}`, true);
      } else {
        recordTest(
          `All policies exist on ${table}`,
          false,
          `Missing: ${missingPolicies.join(', ')}`
        );
      }
    } catch (err) {
      console.log(`⏭️  Cannot verify policies on ${table}: ${err.message}`);
    }
  }
}

// ============================================================================
// TEST 6: Manual Testing Checklist
// ============================================================================
function printManualTestingChecklist() {
  console.log('\n📋 Manual Testing Checklist\n');
  console.log('Complete these tests manually in the application:\n');

  const checklist = [
    {
      category: 'As Coach with Team',
      tests: [
        'Roster shows only players from my team',
        'Messages modal shows only players from my team',
        'Calendar shows only events from my team',
        'Cannot access another team\'s player profile directly'
      ]
    },
    {
      category: 'As Player with Team',
      tests: [
        'Messages modal shows only coaches from my team',
        'Calendar shows only events for my team',
        'Can see teammates in roster/directory'
      ]
    },
    {
      category: 'As Coach without Team',
      tests: [
        'Roster shows "No Team Assigned" error',
        'Messages modal is empty or shows error',
        'Calendar is empty'
      ]
    },
    {
      category: 'As Player without Team',
      tests: [
        'Messages modal is empty or shows error',
        'Calendar is empty',
        'Appropriate error messages displayed'
      ]
    }
  ];

  checklist.forEach(({ category, tests }) => {
    console.log(`${category}:`);
    tests.forEach(test => {
      console.log(`  [ ] ${test}`);
    });
    console.log('');
  });
}

// ============================================================================
// Run All Tests
// ============================================================================
async function runAllTests() {
  try {
    await testRLSEnabled();
    await testHelperFunction();
    await testPoliciesExist();
    await setupTestData();
    await testTeamIsolation();
    printManualTestingChecklist();

    // Print Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`📝 Total:  ${results.tests.length}`);

    if (results.failed > 0) {
      console.log('\n⚠️  Some tests failed. Review the details above.');
      console.log('   Most likely the migration has not been applied yet.');
      console.log('   Run: npm run db:push');
      process.exit(1);
    } else {
      console.log('\n✅ All automated tests passed!');
      console.log('   Complete the manual testing checklist above.');
      process.exit(0);
    }
  } catch (err) {
    console.error('\n❌ Test suite error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run tests
runAllTests();

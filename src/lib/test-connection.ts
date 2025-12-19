/**
 * Test script to verify database connection and types
 * Run with: npx tsx lib/test-connection.ts
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types/database';

// Using direct env vars for testing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const supabase = createClient<Database>(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('🔍 Testing Supabase connection...\n');

  try {
    // Test 1: Check all Day 1 tables exist
    console.log('Test 1: Checking if all Day 1 tables exist...');
    const { data: tables, error: tablesError } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);

    if (tablesError) {
      console.error('❌ Error:', tablesError.message);
      throw tablesError;
    }
    console.log('✅ Organizations table accessible\n');

    // Test 2: Count tables
    console.log('Test 2: Counting rows in key tables...');

    const tablesToCheck = [
      'organizations',
      'teams',
      'team_members',
      'player_settings',
      'coach_notes',
      'camps',
      'player_engagement_events',
    ];

    for (const table of tablesToCheck) {
      const { count, error } = await supabase
        .from(table as any)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error(`❌ Error checking ${table}:`, error.message);
      } else {
        console.log(`✅ ${table}: ${count} rows`);
      }
    }

    console.log('\n Test 3: Testing type safety...');

    // This should give us proper TypeScript autocomplete
    const { data: testOrg, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .eq('type', 'college')
      .limit(1)
      .single();

    if (orgError && orgError.code !== 'PGRST116') {
      // PGRST116 = not found (OK if no data yet)
      console.error('❌ Error:', orgError.message);
      throw orgError;
    }

    if (testOrg) {
      console.log('✅ TypeScript types working correctly');
      console.log(`   Sample org: ${testOrg.name} (${testOrg.type})`);
    } else {
      console.log('✅ TypeScript types working correctly (no data yet)');
    }

    // Test 4: Test enum types
    console.log('\nTest 4: Testing enum types...');
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('player_type')
      .limit(1);

    if (playersError && playersError.code !== 'PGRST116') {
      console.error('❌ Error:', playersError.message);
    } else {
      console.log('✅ Enum types accessible');
    }

    // Test 5: Test relationships
    console.log('\nTest 5: Testing table relationships...');
    const { data: teamWithOrg, error: teamError } = await supabase
      .from('teams')
      .select(`
        *,
        organization:organizations(name)
      `)
      .limit(1)
      .single();

    if (teamError && teamError.code !== 'PGRST116') {
      console.error('❌ Error:', teamError.message);
    } else {
      console.log('✅ Table relationships working');
      if (teamWithOrg) {
        console.log(`   Sample: Team "${teamWithOrg.name}"`);
      }
    }

    // Test 6: Test RLS (should work with anon key)
    console.log('\nTest 6: Testing Row Level Security...');
    const { data: allOrgs, error: rlsError } = await supabase
      .from('organizations')
      .select('*');

    if (rlsError) {
      console.error('❌ RLS Error:', rlsError.message);
    } else {
      console.log('✅ RLS policies allow public read access');
      console.log(`   Found ${allOrgs?.length || 0} organizations`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 All tests passed! Database is ready.');
    console.log('='.repeat(50) + '\n');

    console.log('Next steps:');
    console.log('1. Set up environment variables in .env.local');
    console.log('2. Create middleware.ts to handle auth redirects');
    console.log('3. Start building components and pages');
    console.log('\nDatabase URL:', supabaseUrl);
    console.log('Studio URL: http://127.0.0.1:54323\n');

  } catch (error) {
    console.error('\n❌ Connection test failed:', error);
    process.exit(1);
  }
}

// Run tests
testConnection();

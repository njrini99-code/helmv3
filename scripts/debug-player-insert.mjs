#!/usr/bin/env node
/**
 * Debug player insert - find exactly what's blocking the insert
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local and run with `dotenv/config` or export them in your shell.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log('=== Debug Player Insert ===\n');

  // 1. Check table structure
  console.log('1. Checking golf_players table columns...');
  const { data: columns, error: columnsError } = await supabase
    .rpc('get_table_columns', { table_name: 'golf_players' })
    .select('*');

  if (columnsError) {
    console.log('   Could not fetch columns via RPC, trying direct query...');

    // Alternative: query information_schema
    const { data: schemaData, error: schemaError } = await supabase
      .from('golf_players')
      .select('*')
      .limit(0);

    if (schemaError) {
      console.log('   Schema error:', schemaError.message);
    }
  }

  // 2. Check existing records
  console.log('\n2. Checking existing golf_players records...');
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name, onboarding_completed, status')
    .limit(5);

  if (playersError) {
    console.log('   Error:', playersError.message);
  } else {
    console.log('   Found', players?.length || 0, 'records');
    if (players?.length > 0) {
      console.log('   Sample:', players[0]);
    }
  }

  // 3. Check RLS policies
  console.log('\n3. Checking RLS policies on golf_players...');
  const { data: policies, error: policiesError } = await supabase
    .rpc('get_policies_for_table', { p_table_name: 'golf_players' });

  if (policiesError) {
    // Try raw SQL approach
    const { data: rawPolicies } = await supabase
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'golf_players');

    if (rawPolicies) {
      console.log('   Policies:', rawPolicies);
    } else {
      console.log('   Could not fetch policies (need direct DB access)');
    }
  } else {
    console.log('   Policies:', policies);
  }

  // 4. Try a test insert with service role (bypasses RLS)
  console.log('\n4. Testing insert with SERVICE ROLE (bypasses RLS)...');
  const testUserId = '00000000-0000-0000-0000-000000000001'; // Fake UUID for testing

  const insertData = {
    user_id: testUserId,
    first_name: 'Test',
    last_name: 'Player',
    email: 'test-debug@example.com',
    status: 'active',
    onboarding_completed: true,
  };

  console.log('   Insert data:', insertData);

  const { data: insertResult, error: insertError } = await supabase
    .from('golf_players')
    .insert(insertData)
    .select();

  if (insertError) {
    console.log('\n   INSERT FAILED!');
    console.log('   Error message:', insertError.message);
    console.log('   Error code:', insertError.code);
    console.log('   Error details:', insertError.details);
    console.log('   Error hint:', insertError.hint);
    console.log('   Full error:', JSON.stringify(insertError, null, 2));
  } else {
    console.log('   Insert succeeded:', insertResult);

    // Clean up test record
    console.log('\n5. Cleaning up test record...');
    await supabase.from('golf_players').delete().eq('user_id', testUserId);
    console.log('   Cleaned up');
  }

  // 5. Check if there's a foreign key constraint issue
  console.log('\n6. Checking users table for foreign key...');
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, role')
    .limit(3);

  if (usersError) {
    console.log('   Error:', usersError.message);
  } else {
    console.log('   Users found:', users?.length || 0);
    if (users?.length > 0) {
      console.log('   Sample user:', users[0]);
    }
  }

  // 6. Check the specific user that's trying to be inserted
  console.log('\n7. Looking for the user who just signed up...');
  const { data: recentUsers, error: recentError } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  if (recentError) {
    console.log('   Error:', recentError.message);
  } else {
    console.log('   Recent users:');
    recentUsers?.forEach(u => {
      console.log('   -', u.id, u.email, u.role, u.created_at);
    });
  }

  // 7. Try insert with a real user_id from the users table
  if (recentUsers && recentUsers.length > 0) {
    const realUser = recentUsers[0];
    console.log('\n8. Testing insert with REAL user_id:', realUser.id);

    // First check if player already exists
    const { data: existingPlayer } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', realUser.id)
      .maybeSingle();

    if (existingPlayer) {
      console.log('   Player already exists for this user:', existingPlayer.id);
    } else {
      const { data: realInsert, error: realInsertError } = await supabase
        .from('golf_players')
        .insert({
          user_id: realUser.id,
          first_name: 'Debug',
          last_name: 'Test',
          email: realUser.email,
          status: 'active',
          onboarding_completed: false,
        })
        .select();

      if (realInsertError) {
        console.log('   INSERT FAILED with real user!');
        console.log('   Error:', realInsertError.message);
        console.log('   Code:', realInsertError.code);
        console.log('   Details:', realInsertError.details);
        console.log('   Hint:', realInsertError.hint);
      } else {
        console.log('   Insert succeeded!', realInsert);
        // Clean up
        await supabase.from('golf_players').delete().eq('user_id', realUser.id);
        console.log('   Cleaned up test record');
      }
    }
  }

  console.log('\n=== Debug Complete ===');
}

main().catch(console.error);

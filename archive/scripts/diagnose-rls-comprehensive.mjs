import pg from 'pg';
const { Client } = pg;

const USER_EMAIL = 'rinin376@gmail.com';
const USER_UUID = 'aa6746b8-2d05-4101-9bde-63ada5f186cf'; // From debug logs

const client = new Client({
  connectionString: 'postgresql://postgres:EHl4yASa9zM1sb1k@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function diagnoseRLS() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');
    console.log('=' .repeat(80));
    console.log('RLS POLICY DIAGNOSTIC FOR golf_events');
    console.log('=' .repeat(80));

    // ========================================================================
    // 1) Show RLS policies on public.golf_events
    // ========================================================================
    console.log('\n📋 STEP 1: Show RLS policies on golf_events\n');

    const policiesResult = await client.query(`
      SELECT
        polname AS policy_name,
        polcmd AS for_command,
        pg_get_expr(polqual, polrelid) AS using_expression,
        pg_get_expr(polwithcheck, polrelid) AS with_check_expression,
        polroles
      FROM pg_policy
      WHERE polrelid = 'public.golf_events'::regclass
      ORDER BY polcmd, polname;
    `);

    if (policiesResult.rows.length === 0) {
      console.log('❌ NO POLICIES FOUND!');
      console.log('   This means all non-owner access is blocked by default.');
    } else {
      console.log(`Found ${policiesResult.rows.length} policy(ies):\n`);
      policiesResult.rows.forEach((policy, idx) => {
        console.log(`Policy ${idx + 1}: ${policy.policy_name}`);
        console.log(`  Command: ${policy.for_command}`);
        console.log(`  USING: ${policy.using_expression || 'N/A'}`);
        console.log(`  WITH CHECK: ${policy.with_check_expression || 'N/A'}`);
        console.log(`  Roles: ${policy.polroles}`);
        console.log('---');
      });
    }

    // ========================================================================
    // 2) Extract function names referenced in policies
    // ========================================================================
    console.log('\n📋 STEP 2: Extract helper function names from policy expressions\n');

    const functionsResult = await client.query(`
      WITH exprs AS (
        SELECT
          array_remove(
            regexp_split_to_array(
              regexp_replace(
                coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
                coalesce(pg_get_expr(polwithcheck, polrelid), ''),
                '[^a-zA-Z0-9_]+', ' ', 'g'
              ),
              ' '
            ),
            ''
          ) AS toks
        FROM pg_policy
        WHERE polrelid = 'public.golf_events'::regclass
      )
      SELECT DISTINCT t AS token
      FROM exprs, unnest(toks) t
      WHERE t ~ '^[a-z_][a-z0-9_]*$'
        AND t NOT IN (
          'and','or','not','exists','select','case','when','then','else','end',
          'true','false','null','auth','uid','jwt','uuid','text','eq','id','user'
        )
      ORDER BY token;
    `);

    const helperFunctions = functionsResult.rows.map(r => r.token);

    if (helperFunctions.length === 0) {
      console.log('No helper functions found in policy expressions.');
    } else {
      console.log('Potential helper functions found:');
      helperFunctions.forEach(fn => console.log(`  - ${fn}`));
    }

    // ========================================================================
    // 3) Show helper function definitions
    // ========================================================================
    if (helperFunctions.length > 0) {
      console.log('\n📋 STEP 3: Show helper function definitions\n');

      const defsResult = await client.query(`
        SELECT
          proname AS function_name,
          pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE proname = ANY($1::text[])
          AND n.nspname = 'public'
        ORDER BY proname;
      `, [helperFunctions]);

      if (defsResult.rows.length === 0) {
        console.log('No matching function definitions found.');
      } else {
        defsResult.rows.forEach(fn => {
          console.log(`Function: ${fn.function_name}`);
          console.log(fn.definition);
          console.log('---');
        });
      }
    }

    // ========================================================================
    // 4) Verify user and coach records
    // ========================================================================
    console.log('\n📋 STEP 4: Verify user and golf_coaches records\n');

    const userResult = await client.query(`
      SELECT
        u.id AS user_id,
        u.email,
        gc.id AS golf_coach_id,
        gc.user_id AS golf_coach_user_id,
        gc.team_id AS golf_coach_team_id
      FROM auth.users u
      LEFT JOIN public.golf_coaches gc ON gc.user_id = u.id
      WHERE u.id = $1 OR u.email = $2;
    `, [USER_UUID, USER_EMAIL]);

    if (userResult.rows.length === 0) {
      console.log(`❌ User NOT FOUND in auth.users!`);
      console.log(`   User ID: ${USER_UUID}`);
      console.log(`   Email: ${USER_EMAIL}`);
    } else {
      const user = userResult.rows[0];
      console.log('User record found:');
      console.log(`  User ID: ${user.user_id}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Golf Coach ID: ${user.golf_coach_id || 'NULL (not a coach)'}`);
      console.log(`  Coach's Team ID: ${user.golf_coach_team_id || 'NULL'}`);

      if (!user.golf_coach_id) {
        console.log('\n⚠️  User is NOT linked to golf_coaches table.');
        console.log('   This may be expected if the user is a player.');
      }
    }

    // Check if user is a player
    console.log('\nChecking golf_players table...\n');

    const playerResult = await client.query(`
      SELECT
        id AS golf_player_id,
        user_id,
        team_id AS player_team_id,
        first_name,
        last_name
      FROM public.golf_players
      WHERE user_id = $1;
    `, [USER_UUID]);

    if (playerResult.rows.length === 0) {
      console.log('❌ User is NOT in golf_players table either!');
    } else {
      const player = playerResult.rows[0];
      console.log('✅ User IS a player:');
      console.log(`  Player ID: ${player.golf_player_id}`);
      console.log(`  Name: ${player.first_name} ${player.last_name}`);
      console.log(`  Team ID: ${player.player_team_id || 'NULL (no team)'}`);
    }

    // ========================================================================
    // 5) Show sample golf_teams for reference
    // ========================================================================
    console.log('\n📋 STEP 5: Sample golf_teams (for reference)\n');

    const teamsResult = await client.query(`
      SELECT id, name, organization_id
      FROM public.golf_teams
      LIMIT 5;
    `);

    if (teamsResult.rows.length === 0) {
      console.log('No golf_teams found in database.');
    } else {
      console.log('Sample teams:');
      teamsResult.rows.forEach(team => {
        console.log(`  - ${team.name} (ID: ${team.id})`);
      });
    }

    // ========================================================================
    // SUMMARY & RECOMMENDATIONS
    // ========================================================================
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY & RECOMMENDATIONS');
    console.log('='.repeat(80) + '\n');

    if (policiesResult.rows.length === 0) {
      console.log('🚨 PROBLEM: No INSERT policies exist on golf_events!');
      console.log('\n✅ SOLUTION: Create a permissive policy for authenticated users:\n');
      console.log('CREATE POLICY "Enable insert for authenticated users"');
      console.log('ON golf_events');
      console.log('FOR INSERT');
      console.log('TO authenticated');
      console.log('WITH CHECK (true);\n');
    } else {
      const insertPolicies = policiesResult.rows.filter(p => p.for_command === 'INSERT');
      if (insertPolicies.length === 0) {
        console.log('🚨 PROBLEM: RLS policies exist but NONE for INSERT!');
        console.log('\n✅ SOLUTION: Add an INSERT policy.');
      } else {
        console.log('📋 INSERT policies exist. Check their WITH CHECK expressions above.');
        console.log('   If they require coach membership but user is a player, they will fail.\n');
        console.log('✅ RECOMMENDED FIX: Replace with permissive policy:');
        console.log('\n-- Drop all existing INSERT policies');
        insertPolicies.forEach(p => {
          console.log(`DROP POLICY IF EXISTS "${p.policy_name}" ON golf_events;`);
        });
        console.log('\n-- Create permissive policy');
        console.log('CREATE POLICY "Enable insert for authenticated users"');
        console.log('ON golf_events');
        console.log('FOR INSERT');
        console.log('TO authenticated');
        console.log('WITH CHECK (true);\n');
      }
    }

  } catch (error) {
    console.error('❌ Error during diagnosis:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
  }
}

diagnoseRLS();

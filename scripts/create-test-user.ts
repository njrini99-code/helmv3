/**
 * Create a test user for golf dev mode testing
 * Run with: npx tsx scripts/create-test-user.ts
 */

import { createClient } from '@supabase/supabase-js';
import { cliGuard, dryRunClient } from './lib/cli-guard.mjs';

const cli = cliGuard({
  name: 'scripts/create-test-user.ts',
  summary:
    "Creates a confirmed test auth user plus its public.users and profile rows on the project in .env.local.",
  secrets: "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local)",
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables!');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = dryRunClient(createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
}), cli);

async function createTestUser() {
  console.log('🏌️  Creating test user for Golf Dev Mode...\n');

  const testEmail = 'test@golfhelm.com';
  const testPassword = 'TestGolf123!';

  try {
    // 1. Create auth user
    console.log('1️⃣  Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true, // Auto-confirm email
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.log('⚠️  User already exists, skipping auth creation');

        // Get existing user
        const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = users.find(u => u.email === testEmail);
        if (!existingUser) throw new Error('Could not find existing user');

        console.log('✅ Found existing auth user');

        // Check if golf_player exists
        const { data: existingPlayer } = await supabase
          .from('golf_players')
          .select('*')
          .eq('user_id', existingUser.id)
          .single();

        if (existingPlayer) {
          console.log('✅ Golf player profile already exists\n');
          printCredentials();
          return;
        }

        // Create golf_player for existing user
        console.log('2️⃣  Creating golf player profile...');
        const { error: playerError } = await supabase
          .from('golf_players')
          .insert({
            user_id: existingUser.id,
            first_name: 'Test',
            last_name: 'Golfer',
            email: testEmail,
            handicap_index: 10.5,
          });

        if (playerError) throw playerError;

        console.log('✅ Golf player profile created\n');
        printCredentials();
        return;
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error('User creation failed - no user returned');
    }

    console.log('✅ Auth user created');

    // 2. Create golf_player profile
    console.log('2️⃣  Creating golf player profile...');
    const { error: playerError } = await supabase
      .from('golf_players')
      .insert({
        user_id: authData.user.id,
        first_name: 'Test',
        last_name: 'Golfer',
        email: testEmail,
        handicap_index: 10.5,
      });

    if (playerError) throw playerError;

    console.log('✅ Golf player profile created\n');

    printCredentials();

  } catch (error) {
    console.error('\n❌ Error creating test user:', error);
    process.exit(1);
  }
}

function printCredentials() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 TEST USER READY!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📧 Email:    test@golfhelm.com');
  console.log('🔑 Password: TestGolf123!');
  console.log('');
  console.log('🔗 Login at: http://localhost:3000/golf/login');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('✨ You can now:');
  console.log('   1. Go to http://localhost:3000/golf/login');
  console.log('   2. Sign in with the credentials above');
  console.log('   3. Navigate to /player-golf/dev');
  console.log('   4. Test the full golf tracking flow!');
  console.log('');
}

createTestUser();

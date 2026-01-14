/**
 * One-time script to create the admin user
 * Run with: npx tsx scripts/setup-admin.ts
 */

import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'admin@helmsportslabs.com';
const ADMIN_PASSWORD = 'Helm2026!!';

async function setupAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    console.error('Make sure .env.local is loaded');
    process.exit(1);
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('Creating admin user...');

  // Check if user already exists
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const existingAdmin = existingUsers?.users?.find(
    (u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );

  if (existingAdmin) {
    console.log('Admin user already exists. Updating password...');

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      existingAdmin.id,
      { password: ADMIN_PASSWORD }
    );

    if (updateError) {
      console.error('Failed to update admin password:', updateError.message);
      process.exit(1);
    }

    // Ensure user record exists with admin role
    const { error: upsertError } = await supabase.from('users').upsert(
      {
        id: existingAdmin.id,
        email: ADMIN_EMAIL,
        role: 'admin',
        sport: 'golf',
      },
      { onConflict: 'id' }
    );

    if (upsertError) {
      console.error('Failed to update user record:', upsertError.message);
    }

    console.log('Admin user updated successfully!');
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    return;
  }

  // Create new admin user
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: 'admin',
      sport: 'golf',
    },
  });

  if (createError) {
    console.error('Failed to create admin user:', createError.message);
    process.exit(1);
  }

  if (!newUser.user) {
    console.error('No user returned from createUser');
    process.exit(1);
  }

  // Create user record in public.users table
  const { error: insertError } = await supabase.from('users').insert({
    id: newUser.user.id,
    email: ADMIN_EMAIL,
    role: 'admin',
    sport: 'golf',
  });

  if (insertError) {
    console.error('Warning: Failed to create user record:', insertError.message);
    console.error('The auth user was created, but you may need to manually add the user record');
  }

  console.log('Admin user created successfully!');
  console.log(`Email: ${ADMIN_EMAIL}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log('\nYou can now log in at /golf/login');
}

// Load env variables and run
import { config } from 'dotenv';
config({ path: '.env.local' });

setupAdmin().catch(console.error);

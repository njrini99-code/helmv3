import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function convertToPlayer() {
  const email = 'bpotts821@gmail.com';

  console.log(`\n=== Converting ${email} from coach to player ===\n`);

  // Get the user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (userError) {
    console.error('Error fetching user:', userError);
    return;
  }

  console.log('Current user record:');
  console.log(`  ID: ${user.id}`);
  console.log(`  Role: ${user.role}`);

  // Step 1: Update role to player
  console.log('\n[1/2] Updating role to "player"...');
  const { error: updateError } = await supabase
    .from('users')
    .update({ role: 'player' })
    .eq('id', user.id);

  if (updateError) {
    console.error('Error updating role:', updateError);
    return;
  }
  console.log('✓ Role updated to player');

  // Step 2: Create golf_players record
  console.log('\n[2/2] Creating golf_players record...');

  // Check if they already have a golf_coaches record to get their name
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('first_name, last_name')
    .eq('user_id', user.id)
    .single();

  const firstName = coach?.first_name || 'Brandon';
  const lastName = coach?.last_name || 'Potts';

  const { data: newPlayer, error: playerError } = await supabase
    .from('golf_players')
    .insert({
      user_id: user.id,
      first_name: firstName,
      last_name: lastName,
    })
    .select()
    .single();

  if (playerError) {
    console.error('Error creating golf_players record:', playerError);
    return;
  }

  console.log('✓ Golf player record created');
  console.log(`  Player ID: ${newPlayer.id}`);
  console.log(`  Name: ${newPlayer.first_name} ${newPlayer.last_name}`);

  // Verify the changes
  console.log('\n=== Verification ===\n');

  const { data: updatedUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  const { data: playerRecord } = await supabase
    .from('golf_players')
    .select('*')
    .eq('user_id', user.id)
    .single();

  console.log('Updated user:');
  console.log(`  Email: ${updatedUser.email}`);
  console.log(`  Role: ${updatedUser.role}`);

  console.log('\nGolf player record:');
  console.log(`  Player ID: ${playerRecord.id}`);
  console.log(`  Name: ${playerRecord.first_name} ${playerRecord.last_name}`);

  console.log('\n✓ Conversion complete! User can now save golf rounds.');
}

convertToPlayer().catch(console.error);

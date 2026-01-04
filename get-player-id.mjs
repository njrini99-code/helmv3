#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

const { data: player, error } = await supabase
  .from('golf_players')
  .select('id, user_id, email, first_name, last_name')
  .eq('email', 'rinin376@gmail.com')
  .single();

if (error) {
  console.error('Error:', error.message);
} else {
  console.log('Player ID:', player.id);
  console.log('User ID:', player.user_id);
  console.log('Email:', player.email);
  console.log('Name:', player.first_name, player.last_name);
}

#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzA4NjgsImV4cCI6MjA4MTUwNjg2OH0.CPpPgG_EEXvu5eaSaDD-FPSVXcNTPlA5VS9W5tcX5Ck';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

console.log('🔌 Testing Supabase Connection...\n');
console.log('URL:', supabaseUrl);
console.log('Anon Key:', supabaseAnonKey.substring(0, 50) + '...\n');

// Test with anon key (client connection)
console.log('📡 Testing ANON key (client connection)...');
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

try {
  const { data, error } = await anonClient
    .from('golf_players')
    .select('count')
    .limit(1);

  if (error) {
    console.log('❌ Anon client error:', error.message);
  } else {
    console.log('✅ Anon client connected successfully!');
    console.log('   Can query golf_players table');
  }
} catch (err) {
  console.log('❌ Anon client connection failed:', err.message);
}

// Test with service role key (server connection)
console.log('\n📡 Testing SERVICE ROLE key (server connection)...');
const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

try {
  const { data, error } = await serviceClient
    .from('golf_players')
    .select('count')
    .limit(1);

  if (error) {
    console.log('❌ Service client error:', error.message);
  } else {
    console.log('✅ Service client connected successfully!');
    console.log('   Can query golf_players table (bypasses RLS)');
  }
} catch (err) {
  console.log('❌ Service client connection failed:', err.message);
}

// Test golf_shots access with service role
console.log('\n📡 Testing golf_shots access...');
try {
  const { data: shots, error } = await serviceClient
    .from('golf_shots')
    .select('count')
    .limit(1);

  if (error) {
    console.log('❌ golf_shots error:', error.message);
  } else {
    console.log('✅ Can access golf_shots table');
  }
} catch (err) {
  console.log('❌ golf_shots access failed:', err.message);
}

console.log('\n✅ Connection test complete!');

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});

const sql = readFileSync('./supabase/migrations/20260214200000_create_crm_coaches.sql', 'utf8');

console.log('Running CRM migration...');
console.log('SQL length:', sql.length, 'chars');

// Use the REST API to run SQL
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`
  },
  body: JSON.stringify({ sql_query: sql })
});

if (!response.ok) {
  // Try the direct postgres approach via pg
  console.log('RPC not available, trying direct query...');
  
  // Split into individual statements and run them
  const statements = sql.split(/;\s*\n/).filter(s => s.trim().length > 0);
  console.log(`Found ${statements.length} statements to execute`);
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim();
    if (!stmt) continue;
    
    console.log(`\nRunning statement ${i + 1}/${statements.length}...`);
    console.log(stmt.substring(0, 80) + '...');
    
    // This won't work directly - Supabase JS client doesn't support raw SQL
    // We need to use the SQL Editor API or pg directly
  }
  
  console.log('\nDirect SQL execution not supported via JS client.');
  console.log('Please run the migration via Supabase SQL Editor.');
  process.exit(1);
}

const result = await response.json();
console.log('Migration result:', result);

import { readFileSync } from 'fs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local and run with `dotenv/config` or export them in your shell.'
  );
  process.exit(1);
}

// Read the SQL file
const sqlFile = process.argv[2] || '/tmp/coach-sql-clean.sql';
const sql = readFileSync(sqlFile, 'utf8');

// Split into individual INSERT statements
const statements = sql.split(';\n').filter(s => s.trim().length > 0);

console.log(`Found ${statements.length} statements to execute`);

// Execute each statement
let success = 0;
let failed = 0;

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i].trim() + ';';
  
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ query: stmt })
    });
    
    if (response.ok) {
      success++;
      if ((i + 1) % 50 === 0) {
        console.log(`Progress: ${i + 1}/${statements.length}`);
      }
    } else {
      const error = await response.text();
      console.log(`Failed statement ${i + 1}: ${error}`);
      failed++;
    }
  } catch (err) {
    console.log(`Error on statement ${i + 1}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone! Success: ${success}, Failed: ${failed}`);

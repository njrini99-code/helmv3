import { readFileSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import { cliGuard } from './lib/cli-guard.mjs';

const cli = cliGuard({
  name: 'scripts/run-sql.mjs',
  summary:
    'Executes a file of SQL statements one at a time through the production REST rpc/sql endpoint with the service-role key. Prefer `npm run db:apply -- <file>` for migrations (docs/operations/APPLY_PATH.md).',
  usage: '[sql-file]',
  options: [['sql-file', 'Path to the SQL file (default /tmp/coach-sql-clean.sql)']],
  secrets: 'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local)',
});

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
const sqlFile = cli.positional[0] || '/tmp/coach-sql-clean.sql';
const sql = readFileSync(sqlFile, 'utf8');

// Split into individual INSERT statements
const statements = sql.split(';\n').filter(s => s.trim().length > 0);

console.log(`Found ${statements.length} statements to execute`);
if (!cli.apply) {
  for (const stmt of statements.slice(0, 3)) console.log(`  [dry-run] ${stmt.trim().replace(/\s+/g, ' ').slice(0, 120)}`);
  if (statements.length > 3) console.log(`  [dry-run] ... and ${statements.length - 3} more`);
  console.log(`[dry-run] would execute ${statements.length} statement(s) against ${supabaseUrl}. Re-run with --apply to do it.`);
  process.exit(0);
}

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

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkMigrations() {
  console.log('\n=== CHECKING APPLIED MIGRATIONS ===\n');

  // Check if supabase_migrations schema exists
  const { data: schemas, error: schemasError } = await supabase
    .rpc('get_schemas')
    .catch(() => ({ data: null, error: 'Function not available' }));

  // Try to query migrations table directly
  const { data: migrations, error: migrationsError } = await supabase
    .from('supabase_migrations.schema_migrations')
    .select('version')
    .order('version', { ascending: false })
    .limit(20)
    .catch(async () => {
      // Alternative: try querying through pg_catalog
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 20`
      }).catch(() => ({ data: null, error: null }));
      return { data, error };
    });

  if (migrationsError || !migrations) {
    console.log('⚠️ Could not query migrations table directly');
    console.log('Let me check the current RLS policies on golf_players...\n');

    // Check current policies
    const { data: policies, error: policiesError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT policyname, cmd, qual::text as using_clause
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'golf_players'
        ORDER BY policyname
      `
    }).catch(() => ({ data: null, error: null }));

    if (policies) {
      console.log('🔒 Current RLS Policies on golf_players:');
      console.log(JSON.stringify(policies, null, 2));
    } else {
      console.log('❌ Could not fetch policies');
    }
  } else {
    console.log('✅ Recent Migrations Applied:');
    migrations.forEach((m, i) => {
      console.log(`${i + 1}. ${m.version}`);
    });
  }
}

checkMigrations();

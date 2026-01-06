#!/usr/bin/env node
/**
 * System-level audits using PostgreSQL direct connection
 * Checks RLS, indexes, functions, triggers
 */

import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
  host: 'db.dgvlnelygibgrrjehbyc.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'EHl4yASa9zM1sb1k',
  ssl: { rejectUnauthorized: false }
});

console.log('🔌 Connecting to database...\n');

try {
  await client.connect();
  console.log('✅ Connected!\n');

  // CRITICAL CHECK: Tables without RLS
  console.log('═'.repeat(80));
  console.log('🔴 CRITICAL: Tables Without RLS');
  console.log('═'.repeat(80));
  console.log();

  const rlsQuery = `
    SELECT
      t.tablename,
      c.relrowsecurity as rls_enabled,
      CASE
        WHEN c.relrowsecurity = false THEN '🔴 CRITICAL: RLS DISABLED'
        ELSE '✅ OK'
      END as status
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
    WHERE t.schemaname = 'public'
    AND c.relrowsecurity = false
    ORDER BY t.tablename;
  `;

  const rlsResult = await client.query(rlsQuery);

  if (rlsResult.rows.length === 0) {
    console.log('✅ EXCELLENT! All tables have RLS enabled');
    console.log('✅ No security vulnerabilities found\n');
  } else {
    console.log(`🔴 CRITICAL: Found ${rlsResult.rows.length} tables WITHOUT RLS:\n`);
    console.table(rlsResult.rows);
    console.log('\n⚠️  ACTION REQUIRED: Enable RLS on these tables immediately!\n');
  }

  // RLS Policies Summary
  console.log('═'.repeat(80));
  console.log('🔒 RLS Policies Summary');
  console.log('═'.repeat(80));
  console.log();

  const policiesQuery = `
    SELECT
      tablename,
      COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY tablename
    ORDER BY policy_count DESC, tablename;
  `;

  const policiesResult = await client.query(policiesQuery);
  console.table(policiesResult.rows);
  console.log();

  // Functions
  console.log('═'.repeat(80));
  console.log('⚙️  Custom Functions');
  console.log('═'.repeat(80));
  console.log();

  const functionsQuery = `
    SELECT
      p.proname as function_name,
      pg_get_function_arguments(p.oid) as arguments,
      CASE p.provolatile
        WHEN 'i' THEN 'IMMUTABLE'
        WHEN 's' THEN 'STABLE'
        WHEN 'v' THEN 'VOLATILE'
      END as volatility,
      CASE p.prosecdef
        WHEN true THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
      END as security
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    ORDER BY p.proname;
  `;

  const functionsResult = await client.query(functionsQuery);
  console.table(functionsResult.rows);
  console.log();

  // Triggers
  console.log('═'.repeat(80));
  console.log('🔔 Triggers');
  console.log('═'.repeat(80));
  console.log();

  const triggersQuery = `
    SELECT
      event_object_table as table_name,
      trigger_name,
      action_timing,
      event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name;
  `;

  const triggersResult = await client.query(triggersQuery);
  console.table(triggersResult.rows);
  console.log();

  // Indexes Summary
  console.log('═'.repeat(80));
  console.log('📊 Indexes Summary');
  console.log('═'.repeat(80));
  console.log();

  const indexesQuery = `
    SELECT
      tablename,
      COUNT(*) as index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    GROUP BY tablename
    ORDER BY index_count DESC, tablename;
  `;

  const indexesResult = await client.query(indexesQuery);
  console.table(indexesResult.rows);
  console.log();

  // Golf-specific tables
  console.log('═'.repeat(80));
  console.log('🏌️  Golf Tables');
  console.log('═'.repeat(80));
  console.log();

  const golfTablesQuery = `
    SELECT
      tablename,
      tableowner
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename LIKE 'golf_%'
    ORDER BY tablename;
  `;

  const golfTablesResult = await client.query(golfTablesQuery);
  console.table(golfTablesResult.rows);
  console.log();

  // Final Summary
  console.log('═'.repeat(80));
  console.log('📊 SYSTEM AUDIT COMPLETE');
  console.log('═'.repeat(80));
  console.log();
  console.log('Key Findings:');
  console.log(`  Tables without RLS: ${rlsResult.rows.length}`);
  console.log(`  Custom functions: ${functionsResult.rows.length}`);
  console.log(`  Triggers: ${triggersResult.rows.length}`);
  console.log(`  Golf tables: ${golfTablesResult.rows.length}`);
  console.log();

  if (rlsResult.rows.length === 0) {
    console.log('✅ Security: PASSED - All tables have RLS');
  } else {
    console.log('🔴 Security: FAILED - Tables without RLS found');
  }

} catch (error) {
  console.log('❌ Connection failed:', error.message);
  console.log('\nPlease run these SQL files manually in Supabase Dashboard:');
  console.log('  - AUDIT_BATCH_2_SECURITY_CRITICAL.sql');
  console.log('  - AUDIT_BATCH_3_RLS_POLICIES.sql');
  console.log('  - AUDIT_BATCH_5_FUNCTIONS_TRIGGERS.sql');
} finally {
  await client.end();
}

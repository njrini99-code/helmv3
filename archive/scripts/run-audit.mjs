#!/usr/bin/env node

/**
 * GolfHelm Database Audit Runner
 * Runs systematic database audit queries and generates report
 */

import pg from 'pg';
import fs from 'fs/promises';

const { Client } = pg.default || pg;

// Database connection - using direct connection
const client = new Client({
  host: 'db.dgvlnelygibgrrjehbyc.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'EHl4yASa9zM1sb1k',
  ssl: { rejectUnauthorized: false },
});

const results = {
  timestamp: new Date().toISOString(),
  sections: [],
  summary: { total: 0, success: 0, failed: 0, criticalIssues: 0, highIssues: 0 },
};

async function runQuery(name, sql) {
  try {
    console.log(`\n📊 ${name}...`);
    const result = await client.query(sql);
    console.log(`   ✅ ${result.rowCount || 0} rows`);
    results.summary.success++;
    return { success: true, data: result.rows, rowCount: result.rowCount };
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
    results.summary.failed++;
    return { success: false, error: err.message };
  }
}

async function runAudit() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   GOLFHELM DATABASE AUDIT');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Connect
    console.log('🔌 Connecting to database...');
    await client.connect();
    await client.query('SELECT 1');
    console.log('✅ Connected\n');

    // SECTION 1: Database Extensions
    console.log('\n━━━ 1. DATABASE EXTENSIONS ━━━');
    const ext = await runQuery(
      'Installed Extensions',
      `SELECT extname, extversion, nspname as schema
       FROM pg_extension e
       JOIN pg_namespace n ON e.extnamespace = n.oid
       ORDER BY extname`
    );
    results.sections.push({ name: 'Extensions', result: ext });

    // SECTION 2: All Tables
    console.log('\n━━━ 2. ALL TABLES ━━━');
    const tables = await runQuery(
      'All Tables in Public Schema',
      `SELECT schemaname, tablename, tableowner
       FROM pg_tables
       WHERE schemaname = 'public'
       ORDER BY tablename`
    );
    results.sections.push({ name: 'Tables', result: tables });

    // SECTION 3: Tables WITHOUT RLS (CRITICAL)
    console.log('\n━━━ 3. SECURITY - RLS STATUS ━━━');
    const noRls = await runQuery(
      'Tables Without RLS',
      `SELECT tablename, rowsecurity
       FROM pg_tables t
       JOIN pg_class c ON c.relname = t.tablename
       WHERE schemaname = 'public'
       AND c.relrowsecurity = false
       ORDER BY tablename`
    );

    if (noRls.success && noRls.rowCount > 0) {
      results.summary.criticalIssues += noRls.rowCount;
      console.log(`   🔴 CRITICAL: ${noRls.rowCount} tables without RLS!`);
    }
    results.sections.push({ name: 'Tables Without RLS', result: noRls });

    // SECTION 4: RLS Policies
    console.log('\n━━━ 4. RLS POLICIES ━━━');
    const policies = await runQuery(
      'All RLS Policies',
      `SELECT schemaname, tablename, policyname, permissive, roles, cmd
       FROM pg_policies
       WHERE schemaname = 'public'
       ORDER BY tablename, policyname`
    );
    results.sections.push({ name: 'RLS Policies', result: policies });

    // SECTION 5: Foreign Keys
    console.log('\n━━━ 5. FOREIGN KEY RELATIONSHIPS ━━━');
    const fkeys = await runQuery(
      'Foreign Keys',
      `SELECT
         tc.table_name,
         kcu.column_name,
         ccu.table_name AS foreign_table_name,
         ccu.column_name AS foreign_column_name,
         rc.delete_rule,
         rc.update_rule
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu
         ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage AS ccu
         ON ccu.constraint_name = tc.constraint_name
       JOIN information_schema.referential_constraints AS rc
         ON rc.constraint_name = tc.constraint_name
       WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       ORDER BY tc.table_name`
    );
    results.sections.push({ name: 'Foreign Keys', result: fkeys });

    // SECTION 6: Indexes
    console.log('\n━━━ 6. INDEXES ━━━');
    const indexes = await runQuery(
      'All Indexes',
      `SELECT
         schemaname,
         tablename,
         indexname,
         indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
       ORDER BY tablename, indexname`
    );
    results.sections.push({ name: 'Indexes', result: indexes });

    // SECTION 7: Functions
    console.log('\n━━━ 7. FUNCTIONS ━━━');
    const funcs = await runQuery(
      'All Functions',
      `SELECT
         n.nspname as schema,
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
       ORDER BY p.proname`
    );
    results.sections.push({ name: 'Functions', result: funcs });

    // SECTION 8: Triggers
    console.log('\n━━━ 8. TRIGGERS ━━━');
    const triggers = await runQuery(
      'All Triggers',
      `SELECT
         trigger_schema,
         trigger_name,
         event_manipulation,
         event_object_table,
         action_timing,
         action_statement
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY event_object_table, trigger_name`
    );
    results.sections.push({ name: 'Triggers', result: triggers });

    // SECTION 9: Row Counts
    console.log('\n━━━ 9. TABLE ROW COUNTS ━━━');
    const rowCounts = await runQuery(
      'Row Counts for All Tables',
      `SELECT
         schemaname,
         relname as tablename,
         n_live_tup as row_count
       FROM pg_stat_user_tables
       WHERE schemaname = 'public'
       ORDER BY n_live_tup DESC`
    );
    results.sections.push({ name: 'Row Counts', result: rowCounts });

    // SECTION 10: Golf-Specific Tables
    console.log('\n━━━ 10. GOLF TABLES ━━━');
    const golfTables = await runQuery(
      'Golf-Related Tables',
      `SELECT tablename, tableowner
       FROM pg_tables
       WHERE schemaname = 'public'
       AND tablename LIKE 'golf_%'
       ORDER BY tablename`
    );
    results.sections.push({ name: 'Golf Tables', result: golfTables });

    // SECTION 11: User Accounts
    console.log('\n━━━ 11. USER ACCOUNTS ━━━');
    const users = await runQuery(
      'User Count by Role',
      `SELECT
         role,
         sport,
         COUNT(*) as count
       FROM users
       GROUP BY role, sport
       ORDER BY role, sport`
    );
    results.sections.push({ name: 'User Accounts', result: users });

    // SECTION 12: Orphaned Records Check
    console.log('\n━━━ 12. DATA INTEGRITY ━━━');

    // Golf players without users
    const orphanedPlayers = await runQuery(
      'Golf Players Without Users',
      `SELECT id, full_name, email
       FROM golf_players
       WHERE user_id IS NULL
       OR user_id NOT IN (SELECT id FROM users)
       LIMIT 10`
    );
    if (orphanedPlayers.success && orphanedPlayers.rowCount > 0) {
      results.summary.highIssues += orphanedPlayers.rowCount;
      console.log(`   🟠 HIGH: ${orphanedPlayers.rowCount} orphaned golf players`);
    }
    results.sections.push({ name: 'Orphaned Golf Players', result: orphanedPlayers });

    // SECTION 13: Enum Types
    console.log('\n━━━ 13. ENUM TYPES ━━━');
    const enums = await runQuery(
      'All Enum Types',
      `SELECT
         t.typname as enum_name,
         array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
       FROM pg_type t
       JOIN pg_enum e ON t.oid = e.enumtypid
       JOIN pg_namespace n ON t.typnamespace = n.oid
       WHERE n.nspname = 'public'
       GROUP BY t.typname
       ORDER BY t.typname`
    );
    results.sections.push({ name: 'Enum Types', result: enums });

    // SECTION 14: Column Details for Key Tables
    console.log('\n━━━ 14. KEY TABLE SCHEMAS ━━━');
    const userColumns = await runQuery(
      'Users Table Columns',
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'users'
       ORDER BY ordinal_position`
    );
    results.sections.push({ name: 'Users Columns', result: userColumns });

    const golfPlayerColumns = await runQuery(
      'Golf Players Table Columns',
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'golf_players'
       ORDER BY ordinal_position`
    );
    results.sections.push({ name: 'Golf Players Columns', result: golfPlayerColumns });

    // Generate Report
    console.log('\n\n━━━ GENERATING REPORT ━━━');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = `/Users/ricknini/Downloads/helmv3/audit-report-${timestamp}.txt`;
    const jsonPath = `/Users/ricknini/Downloads/helmv3/audit-report-${timestamp}.json`;

    // Text Report
    const report = [];
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('           GOLFHELM DATABASE AUDIT REPORT');
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('');
    report.push(`Generated: ${results.timestamp}`);
    report.push('');
    report.push('EXECUTIVE SUMMARY');
    report.push('─────────────────────────────────────────────────────────────');
    report.push(`Total Queries: ${results.summary.total}`);
    report.push(`Successful: ${results.summary.success}`);
    report.push(`Failed: ${results.summary.failed}`);
    report.push('');
    report.push('ISSUES FOUND:');
    report.push(`🔴 Critical Issues: ${results.summary.criticalIssues}`);
    report.push(`🟠 High Priority Issues: ${results.summary.highIssues}`);
    report.push('');
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('                    DETAILED RESULTS');
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('');

    for (const section of results.sections) {
      report.push('');
      report.push(`─── ${section.name} ${'─'.repeat(60 - section.name.length)}`);
      report.push('');

      if (!section.result.success) {
        report.push(`❌ ERROR: ${section.result.error}`);
      } else if (section.result.data && section.result.data.length > 0) {
        report.push(`Found ${section.result.data.length} record(s)`);
        report.push('');

        // Show first 10 rows
        const displayData = section.result.data.slice(0, 10);
        report.push(JSON.stringify(displayData, null, 2));

        if (section.result.data.length > 10) {
          report.push(`\n... and ${section.result.data.length - 10} more records`);
        }
      } else {
        report.push('No records found');
      }
      report.push('');
    }

    report.push('═══════════════════════════════════════════════════════════════');
    report.push('                    END OF REPORT');
    report.push('═══════════════════════════════════════════════════════════════');

    await fs.writeFile(reportPath, report.join('\n'));
    await fs.writeFile(jsonPath, JSON.stringify(results, null, 2));

    console.log(`\n✅ Text report: ${reportPath}`);
    console.log(`✅ JSON report: ${jsonPath}`);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    AUDIT COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\nTotal Queries: ${results.summary.success + results.summary.failed}`);
    console.log(`✅ Successful: ${results.summary.success}`);
    console.log(`❌ Failed: ${results.summary.failed}`);
    console.log(`\n🔴 Critical Issues: ${results.summary.criticalIssues}`);
    console.log(`🟠 High Priority: ${results.summary.highIssues}`);
    console.log('');

  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

// Run
results.summary.total = 15; // Total sections
runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

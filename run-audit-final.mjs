#!/usr/bin/env node

/**
 * GolfHelm Database Audit Runner
 * Uses postgres package for reliable connection
 */

import postgres from 'postgres';
import fs from 'fs/promises';

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:59cwBH5dOZ8buopR@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres';
const sql = postgres(connectionString, {
  ssl: { rejectUnauthorized: false }
});

const results = {
  timestamp: new Date().toISOString(),
  sections: [],
  summary: {
    total: 0,
    success: 0,
    failed: 0,
    criticalIssues: 0,
    highIssues: 0,
    mediumIssues: 0,
  },
};

async function runQuery(name, query) {
  try {
    console.log(`\n📊 ${name}...`);
    const data = await sql.unsafe(query);
    console.log(`   ✅ ${data.length} rows`);
    results.summary.success++;
    return { success: true, data, rowCount: data.length };
  } catch (err) {
    console.log(`   ❌ ${err.message}`);
    results.summary.failed++;
    return { success: false, error: err.message, data: null };
  }
}

async function runAudit() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('           GOLFHELM DATABASE AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Test connection
    console.log('🔌 Testing database connection...');
    await sql`SELECT 1`;
    console.log('✅ Connected successfully\n');

    // SECTION 1: Extensions
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
    console.log('\n━━━ 2. ALL PUBLIC TABLES ━━━');
    const tables = await runQuery(
      'All Tables',
      `SELECT tablename, tableowner
       FROM pg_tables
       WHERE schemaname = 'public'
       ORDER BY tablename`
    );
    results.sections.push({ name: 'All Tables', result: tables });
    console.log(`   📋 Total tables: ${tables.data?.length || 0}`);

    // SECTION 3: Tables WITHOUT RLS (CRITICAL)
    console.log('\n━━━ 3. 🔴 SECURITY - TABLES WITHOUT RLS ━━━');
    const noRls = await runQuery(
      'Tables Without RLS',
      `SELECT t.tablename
       FROM pg_tables t
       JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
       WHERE t.schemaname = 'public'
       AND c.relrowsecurity = false
       ORDER BY t.tablename`
    );

    if (noRls.success && noRls.rowCount > 0) {
      results.summary.criticalIssues += noRls.rowCount;
      console.log(`   🔴 CRITICAL: ${noRls.rowCount} tables without RLS!`);
      console.log(`   Tables: ${noRls.data.map(r => r.tablename).join(', ')}`);
    }
    results.sections.push({ name: 'Tables Without RLS', result: noRls });

    // SECTION 4: RLS Policies
    console.log('\n━━━ 4. RLS POLICIES ━━━');
    const policies = await runQuery(
      'RLS Policies Summary',
      `SELECT tablename, COUNT(*) as policy_count
       FROM pg_policies
       WHERE schemaname = 'public'
       GROUP BY tablename
       ORDER BY tablename`
    );
    results.sections.push({ name: 'RLS Policies', result: policies });

    const allPolicies = await runQuery(
      'All RLS Policies Details',
      `SELECT schemaname, tablename, policyname, permissive, roles, cmd
       FROM pg_policies
       WHERE schemaname = 'public'
       ORDER BY tablename, policyname`
    );
    results.sections.push({ name: 'All RLS Policies', result: allPolicies });

    // SECTION 5: Foreign Keys
    console.log('\n━━━ 5. FOREIGN KEY RELATIONSHIPS ━━━');
    const fkeys = await runQuery(
      'Foreign Keys',
      `SELECT
         tc.table_name,
         kcu.column_name,
         ccu.table_name AS foreign_table,
         ccu.column_name AS foreign_column,
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
    const indexSummary = await runQuery(
      'Indexes per Table',
      `SELECT tablename, COUNT(*) as index_count
       FROM pg_indexes
       WHERE schemaname = 'public'
       GROUP BY tablename
       ORDER BY tablename`
    );
    results.sections.push({ name: 'Index Summary', result: indexSummary });

    // SECTION 7: Functions
    console.log('\n━━━ 7. CUSTOM FUNCTIONS ━━━');
    const funcs = await runQuery(
      'Public Functions',
      `SELECT
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
         event_object_table as table_name,
         trigger_name,
         action_timing,
         event_manipulation
       FROM information_schema.triggers
       WHERE trigger_schema = 'public'
       ORDER BY event_object_table, trigger_name`
    );
    results.sections.push({ name: 'Triggers', result: triggers });

    // SECTION 9: Table Row Counts
    console.log('\n━━━ 9. TABLE ROW COUNTS ━━━');
    const rowCounts = await runQuery(
      'Row Counts',
      `SELECT
         relname as table_name,
         n_live_tup as row_count
       FROM pg_stat_user_tables
       WHERE schemaname = 'public'
       ORDER BY n_live_tup DESC`
    );
    results.sections.push({ name: 'Row Counts', result: rowCounts });

    // SECTION 10: Golf Tables
    console.log('\n━━━ 10. GOLF-SPECIFIC TABLES ━━━');
    const golfTables = await runQuery(
      'Golf Tables',
      `SELECT tablename, tableowner
       FROM pg_tables
       WHERE schemaname = 'public'
       AND tablename LIKE 'golf_%'
       ORDER BY tablename`
    );
    results.sections.push({ name: 'Golf Tables', result: golfTables });

    // SECTION 11: User Accounts
    console.log('\n━━━ 11. USER ACCOUNTS BREAKDOWN ━━━');
    const userStats = await runQuery(
      'Users by Role and Sport',
      `SELECT role, sport, COUNT(*) as count
       FROM users
       GROUP BY role, sport
       ORDER BY role, sport`
    );
    results.sections.push({ name: 'User Stats', result: userStats });

    // SECTION 12: Orphaned Data Check
    console.log('\n━━━ 12. DATA INTEGRITY - ORPHANED RECORDS ━━━');

    const orphanedGolfPlayers = await runQuery(
      'Golf Players Without Users',
      `SELECT id, full_name, email
       FROM golf_players
       WHERE user_id IS NULL
       OR user_id NOT IN (SELECT id FROM users)
       LIMIT 20`
    );
    if (orphanedGolfPlayers.success && orphanedGolfPlayers.rowCount > 0) {
      results.summary.highIssues += orphanedGolfPlayers.rowCount;
      console.log(`   🟠 HIGH: ${orphanedGolfPlayers.rowCount} orphaned golf players`);
    }
    results.sections.push({ name: 'Orphaned Golf Players', result: orphanedGolfPlayers });

    // SECTION 13: Enum Types
    console.log('\n━━━ 13. ENUM TYPES ━━━');
    const enums = await runQuery(
      'Enum Types',
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

    // SECTION 14: Key Table Schemas
    console.log('\n━━━ 14. KEY TABLE SCHEMAS ━━━');

    const usersSchema = await runQuery(
      'Users Table Schema',
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'users'
       ORDER BY ordinal_position`
    );
    results.sections.push({ name: 'Users Schema', result: usersSchema });

    const golfPlayersSchema = await runQuery(
      'Golf Players Schema',
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
       AND table_name = 'golf_players'
       ORDER BY ordinal_position`
    );
    results.sections.push({ name: 'Golf Players Schema', result: golfPlayersSchema });

    // SECTION 15: Database Size & Statistics
    console.log('\n━━━ 15. DATABASE SIZE & STATISTICS ━━━');
    const dbSize = await runQuery(
      'Database Size',
      `SELECT pg_size_pretty(pg_database_size(current_database())) as size`
    );
    results.sections.push({ name: 'Database Size', result: dbSize });

    const tableSizes = await runQuery(
      'Table Sizes',
      `SELECT
         schemaname,
         tablename,
         pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
         pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
       FROM pg_tables
       WHERE schemaname = 'public'
       ORDER BY size_bytes DESC
       LIMIT 20`
    );
    results.sections.push({ name: 'Table Sizes', result: tableSizes });

    // Generate Report
    console.log('\n\n━━━ GENERATING REPORT ━━━');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = `audit-report-${timestamp}.txt`;
    const jsonPath = `audit-report-${timestamp}.json`;

    const report = [];
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('           GOLFHELM DATABASE AUDIT REPORT');
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('');
    report.push(`Generated: ${results.timestamp}`);
    report.push('');
    report.push('EXECUTIVE SUMMARY');
    report.push('─────────────────────────────────────────────────────────────');
    report.push(`Total Queries: ${results.summary.success + results.summary.failed}`);
    report.push(`✅ Successful: ${results.summary.success}`);
    report.push(`❌ Failed: ${results.summary.failed}`);
    report.push('');
    report.push('ISSUES IDENTIFIED:');
    report.push(`🔴 Critical Issues: ${results.summary.criticalIssues} (Tables without RLS)`);
    report.push(`🟠 High Priority: ${results.summary.highIssues} (Orphaned records)`);
    report.push(`🟡 Medium Priority: ${results.summary.mediumIssues}`);
    report.push('');
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('                    DETAILED RESULTS');
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('');

    for (const section of results.sections) {
      report.push('');
      report.push(`─── ${section.name} ${'─'.repeat(Math.max(0, 60 - section.name.length))}`);
      report.push('');

      if (!section.result.success) {
        report.push(`❌ ERROR: ${section.result.error}`);
      } else if (section.result.data && section.result.data.length > 0) {
        report.push(`Found ${section.result.data.length} record(s)`);
        report.push('');

        // Show data (limit to 50 rows for readability)
        const displayData = section.result.data.slice(0, 50);
        report.push(JSON.stringify(displayData, null, 2));

        if (section.result.data.length > 50) {
          report.push(`\n... and ${section.result.data.length - 50} more records`);
        }
      } else {
        report.push('✅ No records found (or empty result)');
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

    // Print Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    AUDIT COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\nTotal Queries: ${results.summary.success + results.summary.failed}`);
    console.log(`✅ Successful: ${results.summary.success}`);
    console.log(`❌ Failed: ${results.summary.failed}`);
    console.log(`\nISSUES FOUND:`);
    console.log(`🔴 Critical: ${results.summary.criticalIssues}`);
    console.log(`🟠 High: ${results.summary.highIssues}`);
    console.log(`🟡 Medium: ${results.summary.mediumIssues}`);
    console.log('');

  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Run audit
runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

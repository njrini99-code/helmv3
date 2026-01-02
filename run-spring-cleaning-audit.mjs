#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🧹 GolfHelm Database Spring Cleaning Audit');
console.log('='.repeat(80));
console.log('Starting comprehensive database audit...\n');

const findings = {
  critical: [],
  high: [],
  medium: [],
  low: [],
  info: []
};

function addFinding(severity, category, issue, details, recommendation) {
  findings[severity].push({
    category,
    issue,
    details,
    recommendation
  });
}

// PART 2: Schema Inventory
console.log('📊 PART 2: Schema Inventory');
console.log('─'.repeat(80));

// Get all tables
const tablesQuery = `
  SELECT
    tablename,
    schemaname,
    rowsecurity as rls_enabled
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
`;

let allTables = [];
try {
  // We'll use direct queries to the tables we know exist
  const knownTables = [
    'users', 'players', 'coaches', 'organizations', 'teams', 'team_members',
    'watchlists', 'videos', 'messages', 'conversations',
    'golf_players', 'golf_coaches', 'golf_teams', 'golf_organizations',
    'golf_rounds', 'golf_shots', 'golf_events', 'golf_qualifiers',
    'golf_qualifier_rounds', 'camps', 'camp_registrations',
    'developmental_plans', 'player_stats', 'evaluations',
    'recruiting_interests', 'player_settings', 'player_achievements',
    'player_metrics', 'team_invitations', 'team_coach_staff',
    'logos', 'events', 'player_engagement_events', 'notifications'
  ];

  for (const table of knownTables) {
    const { data, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (!error) {
      allTables.push({
        name: table,
        exists: true,
        rowCount: data?.length || 0
      });
    }
  }

  console.log(`✅ Found ${allTables.length} tables\n`);
} catch (error) {
  console.log('❌ Error fetching tables:', error.message);
  addFinding('high', 'Infrastructure', 'Cannot query table metadata', error.message, 'Check database permissions');
}

// PART 4: RLS Deep Dive
console.log('\n🔒 PART 4: RLS Deep Dive');
console.log('─'.repeat(80));

const rlsTests = [
  { table: 'golf_players', hasData: false },
  { table: 'golf_teams', hasData: false },
  { table: 'golf_coaches', hasData: false },
  { table: 'golf_rounds', hasData: false },
  { table: 'golf_shots', hasData: false },
  { table: 'golf_events', hasData: false },
  { table: 'golf_organizations', hasData: false },
  { table: 'users', hasData: false },
  { table: 'players', hasData: false },
  { table: 'coaches', hasData: false },
  { table: 'organizations', hasData: false }
];

for (const test of rlsTests) {
  // Test with service key
  const { count: serviceCount } = await supabase
    .from(test.table)
    .select('*', { count: 'exact', head: true });

  test.hasData = serviceCount > 0;
  test.serviceCount = serviceCount || 0;

  // Test with anon client
  const anonClient = createClient(
    supabaseUrl,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MzA4NjgsImV4cCI6MjA4MTUwNjg2OH0.CPpPgG_EEXvu5eaSaDD-FPSVXcNTPlA5VS9W5tcX5Ck'
  );

  const { count: anonCount, error: anonError } = await anonClient
    .from(test.table)
    .select('*', { count: 'exact', head: true });

  test.anonCount = anonCount || 0;
  test.rlsWorking = test.hasData && test.anonCount === 0;

  // Check for exposure
  if (test.hasData && test.anonCount > 0) {
    addFinding(
      'critical',
      'Security',
      `${test.table} table exposed to anonymous users`,
      `${test.anonCount} of ${test.serviceCount} rows are publicly accessible`,
      `Apply RLS policies to restrict access to ${test.table}`
    );
    console.log(`❌ ${test.table}: ${test.anonCount}/${test.serviceCount} rows EXPOSED`);
  } else if (test.hasData) {
    console.log(`✅ ${test.table}: ${test.serviceCount} rows protected`);
  } else {
    console.log(`ℹ️  ${test.table}: empty (no RLS test possible)`);
  }
}

// PART 10: Data Quality & Integrity
console.log('\n\n📈 PART 10: Data Quality & Integrity');
console.log('─'.repeat(80));

// Check for orphaned records
console.log('\nChecking for orphaned records...\n');

// Golf rounds without player
const { data: orphanedRounds } = await supabase
  .from('golf_rounds')
  .select('id, player_id')
  .is('player_id', null);

if (orphanedRounds && orphanedRounds.length > 0) {
  addFinding('medium', 'Data Integrity', 'Orphaned golf rounds',
    `${orphanedRounds.length} rounds have no player assigned`,
    'Delete orphaned rounds or assign to players');
  console.log(`⚠️  ${orphanedRounds.length} golf rounds with no player`);
}

// Golf shots without round
const { data: orphanedShots } = await supabase
  .from('golf_shots')
  .select('id, round_id')
  .is('round_id', null);

if (orphanedShots && orphanedShots.length > 0) {
  addFinding('high', 'Data Integrity', 'Orphaned golf shots',
    `${orphanedShots.length} shots have no round assigned`,
    'Delete orphaned shots');
  console.log(`❌ ${orphanedShots.length} golf shots with no round`);
}

// Check for players without user_id
const { data: orphanedPlayers } = await supabase
  .from('golf_players')
  .select('id, email')
  .is('user_id', null);

if (orphanedPlayers && orphanedPlayers.length > 0) {
  addFinding('critical', 'Data Integrity', 'Players without auth accounts',
    `${orphanedPlayers.length} golf players have no user_id`,
    'Link players to auth.users or delete');
  console.log(`❌ ${orphanedPlayers.length} golf players with no user_id`);
}

// PART 11: Security Audit
console.log('\n\n🔐 PART 11: Security Audit');
console.log('─'.repeat(80));

console.log('\nTables with data but potentially missing RLS:\n');

const tablesWithData = rlsTests.filter(t => t.hasData);
for (const table of tablesWithData) {
  if (table.anonCount === table.serviceCount) {
    addFinding('critical', 'Security', `${table.table} has no RLS protection`,
      `All ${table.serviceCount} rows are publicly accessible`,
      `Enable RLS and create policies for ${table.table}`);
    console.log(`🚨 CRITICAL: ${table.table} - NO RLS (${table.serviceCount} rows exposed)`);
  } else if (table.rlsWorking) {
    console.log(`✅ ${table.table} - RLS working correctly`);
  }
}

// Check for service role key in frontend
console.log('\n\nChecking for exposed secrets...\n');

try {
  const envContent = await fs.readFile('/Users/ricknini/Downloads/helmv3/.env.local', 'utf-8');

  if (envContent.includes('NEXT_PUBLIC_') && envContent.includes('SERVICE')) {
    addFinding('critical', 'Security', 'Service role key may be exposed',
      'Service role key found in .env.local with NEXT_PUBLIC_ prefix',
      'Ensure SUPABASE_SERVICE_ROLE_KEY is NOT prefixed with NEXT_PUBLIC_');
  }

  // Check actual key names
  if (envContent.includes('NEXT_PUBLIC_SUPABASE_SERVICE')) {
    addFinding('critical', 'Security', 'Service role key IS exposed to frontend',
      'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY found in environment',
      'Remove NEXT_PUBLIC_ prefix - service key should NEVER be in frontend');
    console.log('🚨 CRITICAL: Service role key exposed to frontend!');
  } else {
    console.log('✅ Service role key not exposed to frontend');
  }
} catch (error) {
  console.log('ℹ️  Cannot read .env.local');
}

// PART 13: Naming & Conventions
console.log('\n\n📝 PART 13: Naming & Conventions');
console.log('─'.repeat(80));

console.log('\nChecking naming conventions...\n');

// Check for tables with inconsistent naming
const baseballTables = allTables.filter(t => !t.name.startsWith('golf_'));
const golfTables = allTables.filter(t => t.name.startsWith('golf_'));

console.log(`Baseball tables: ${baseballTables.length}`);
console.log(`Golf tables: ${golfTables.length}`);

if (baseballTables.length > 0 && golfTables.length > 0) {
  addFinding('low', 'Naming', 'Mixed naming conventions',
    'Golf tables use golf_ prefix, baseball tables do not',
    'Consider consistent prefixing (baseball_ or no prefix for both)');
}

// PART 15: Cleanup Candidates
console.log('\n\n🧹 PART 15: Cleanup Candidates');
console.log('─'.repeat(80));

console.log('\nEmpty tables that could be removed:\n');

const emptyTables = allTables.filter(t => t.rowCount === 0);
for (const table of emptyTables) {
  console.log(`   - ${table.name}`);
  addFinding('low', 'Cleanup', `Empty table: ${table.name}`,
    'Table exists but has no data',
    `Evaluate if ${table.name} is needed or can be removed`);
}

// Generate Report
console.log('\n\n');
console.log('='.repeat(80));
console.log('📋 AUDIT SUMMARY');
console.log('='.repeat(80));

console.log(`\n🔴 CRITICAL Issues: ${findings.critical.length}`);
console.log(`🟠 HIGH Priority: ${findings.high.length}`);
console.log(`🟡 MEDIUM Priority: ${findings.medium.length}`);
console.log(`🟢 LOW Priority: ${findings.low.length}`);
console.log(`ℹ️  Informational: ${findings.info.length}`);

// Save detailed report
const reportMarkdown = `# GolfHelm Database Spring Cleaning Audit Report

**Date**: ${new Date().toISOString().split('T')[0]}
**Database**: ${supabaseUrl}

---

## Executive Summary

**Total Issues Found**: ${findings.critical.length + findings.high.length + findings.medium.length + findings.low.length}

- 🔴 **Critical**: ${findings.critical.length} issues requiring immediate attention
- 🟠 **High**: ${findings.high.length} issues to fix this week
- 🟡 **Medium**: ${findings.medium.length} issues to address this month
- 🟢 **Low**: ${findings.low.length} nice-to-have improvements

---

## 🔴 CRITICAL ISSUES (Fix Immediately)

${findings.critical.length === 0 ? 'None found! ✅' : ''}
${findings.critical.map((f, i) => `
### ${i + 1}. ${f.issue}

**Category**: ${f.category}
**Details**: ${f.details}
**Recommendation**: ${f.recommendation}
`).join('\n')}

---

## 🟠 HIGH PRIORITY ISSUES (Fix This Week)

${findings.high.length === 0 ? 'None found! ✅' : ''}
${findings.high.map((f, i) => `
### ${i + 1}. ${f.issue}

**Category**: ${f.category}
**Details**: ${f.details}
**Recommendation**: ${f.recommendation}
`).join('\n')}

---

## 🟡 MEDIUM PRIORITY ISSUES (Fix This Month)

${findings.medium.length === 0 ? 'None found! ✅' : ''}
${findings.medium.map((f, i) => `
### ${i + 1}. ${f.issue}

**Category**: ${f.category}
**Details**: ${f.details}
**Recommendation**: ${f.recommendation}
`).join('\n')}

---

## 🟢 LOW PRIORITY ISSUES (Backlog)

${findings.low.length === 0 ? 'None found!' : ''}
${findings.low.map((f, i) => `
### ${i + 1}. ${f.issue}

**Category**: ${f.category}
**Details**: ${f.details}
**Recommendation**: ${f.recommendation}
`).join('\n')}

---

## 📊 Detailed Findings by Category

### Tables Audited
- **Total Tables**: ${allTables.length}
- **Empty Tables**: ${emptyTables.length}
- **Tables with Data**: ${allTables.filter(t => t.rowCount > 0).length}

### RLS Status
${rlsTests.map(t =>
  t.hasData
    ? `- **${t.table}**: ${t.rlsWorking ? '✅ Protected' : '❌ EXPOSED'} (${t.serviceCount} rows)`
    : `- **${t.table}**: Empty`
).join('\n')}

### Empty Tables (Cleanup Candidates)
${emptyTables.length === 0 ? 'All tables have data' : emptyTables.map(t => `- ${t.name}`).join('\n')}

---

## 🎯 Action Plan

### Phase 1: Critical (Do Immediately)
${findings.critical.length === 0 ? '✅ No critical issues!' : findings.critical.map((f, i) =>
  `${i + 1}. ${f.recommendation}`
).join('\n')}

### Phase 2: High Priority (This Week)
${findings.high.length === 0 ? '✅ No high priority issues!' : findings.high.map((f, i) =>
  `${i + 1}. ${f.recommendation}`
).join('\n')}

### Phase 3: Medium Priority (This Month)
${findings.medium.length === 0 ? '✅ No medium priority issues!' : findings.medium.map((f, i) =>
  `${i + 1}. ${f.recommendation}`
).join('\n')}

### Phase 4: Low Priority (Backlog)
${findings.low.length === 0 ? 'None' : findings.low.map((f, i) =>
  `${i + 1}. ${f.recommendation}`
).join('\n')}

---

## ✅ Audit Complete

**Next Steps**:
1. Review critical issues immediately
2. Create migration files for fixes
3. Test changes in development first
4. Apply fixes systematically by priority

*Report generated: ${new Date().toISOString()}*
`;

await fs.writeFile(
  '/Users/ricknini/Downloads/helmv3/SPRING_CLEANING_AUDIT_REPORT.md',
  reportMarkdown
);

console.log('\n✅ Detailed report saved to: SPRING_CLEANING_AUDIT_REPORT.md\n');

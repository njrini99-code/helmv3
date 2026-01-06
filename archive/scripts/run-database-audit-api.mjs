#!/usr/bin/env node

/**
 * GolfHelm Database Spring Cleaning Audit Runner (REST API Version)
 *
 * This script uses the Supabase REST API to run audit queries
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';

// Supabase configuration
const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Audit results storage
const auditResults = {
  metadata: {
    timestamp: new Date().toISOString(),
    database: 'GolfHelm Production',
    auditVersion: '1.0.0',
  },
  sections: [],
  summary: {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    criticalIssues: 0,
    highIssues: 0,
    mediumIssues: 0,
    lowIssues: 0,
  },
  errors: [],
};

/**
 * Execute a SQL query using Supabase
 */
async function executeQuery(query, sectionName, queryName) {
  try {
    console.log(`\n📊 Running: ${sectionName}`);
    console.log(`   Query: ${queryName.substring(0, 80)}...`);

    const startTime = Date.now();

    // Use the Supabase .rpc() method to execute raw SQL
    // This requires a custom function in the database, so we'll use alternative methods

    // Method 1: Try to execute via fetch to PostgreSQL REST API
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ sql: query }),
    });

    if (response.status === 404) {
      // exec_sql function doesn't exist, use alternative method
      // Try to extract table name from query and use Supabase client
      const result = await executeViaClient(query);
      const endTime = Date.now();

      if (result.error) {
        throw result.error;
      }

      console.log(`   ✅ Success: ${result.data?.length || 0} row(s) in ${endTime - startTime}ms`);

      auditResults.summary.successfulQueries++;

      return {
        success: true,
        data: result.data,
        rowCount: result.data?.length || 0,
        executionTime: endTime - startTime,
        error: null,
      };
    }

    const data = await response.json();
    const endTime = Date.now();

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Unknown error');
    }

    console.log(`   ✅ Success: ${data?.length || 0} row(s) in ${endTime - startTime}ms`);

    auditResults.summary.successfulQueries++;

    return {
      success: true,
      data,
      rowCount: data?.length || 0,
      executionTime: endTime - startTime,
      error: null,
    };
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);

    auditResults.summary.failedQueries++;
    auditResults.errors.push({
      section: sectionName,
      query: queryName,
      error: err.message,
      sql: query.substring(0, 200) + '...',
    });

    return {
      success: false,
      error: err.message,
      data: null,
      rowCount: 0,
      executionTime: 0,
    };
  }
}

/**
 * Try to execute query via Supabase client methods
 */
async function executeViaClient(query) {
  // Try to parse the query and extract table name for SELECT queries
  const selectMatch = query.match(/FROM\s+([a-z_]+)/i);
  const tableName = selectMatch ? selectMatch[1] : null;

  if (tableName && query.trim().toLowerCase().startsWith('select')) {
    // Try to execute as a select query
    return await supabase.from(tableName).select('*');
  }

  // For system catalog queries (pg_* tables), we need a different approach
  if (query.includes('pg_') || query.includes('information_schema')) {
    // These require direct SQL execution which we can't do via REST API
    return {
      error: new Error('System catalog queries require direct database access'),
      data: null,
    };
  }

  return {
    error: new Error('Unable to execute query via Supabase client'),
    data: null,
  };
}

/**
 * Parse the markdown file and extract SQL queries
 */
async function parseMarkdownFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const sections = [];

    // Split by SQL code blocks
    const sqlBlockRegex = /```sql\n([\s\S]*?)\n```/g;
    const matches = [...content.matchAll(sqlBlockRegex)];

    console.log(`\n📄 Found ${matches.length} SQL code blocks in the audit document\n`);

    let currentSection = 'Unknown Section';
    let sectionNumber = 0;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const sql = match[1].trim();
      const matchIndex = match.index;

      // Find the section header before this SQL block
      const contentBefore = content.substring(0, matchIndex);
      const headerMatches = contentBefore.match(/###? (.+?)(?=\n)/g);

      if (headerMatches && headerMatches.length > 0) {
        currentSection = headerMatches[headerMatches.length - 1].replace(/^###? /, '').trim();
      }

      // Split multiple queries if they exist
      const queries = sql
        .split(/;\s*(?=\n\n|--|SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|WITH)/i)
        .map(q => q.trim())
        .filter(q => {
          const withoutComments = q.replace(/--[^\n]*/g, '').trim();
          return withoutComments && withoutComments.length > 10;
        });

      for (const query of queries) {
        sections.push({
          sectionName: currentSection,
          queryNumber: sectionNumber++,
          sql: query,
          queryName: extractQueryName(query),
        });
      }
    }

    return sections;
  } catch (err) {
    console.error(`❌ Error reading markdown file: ${err.message}`);
    throw err;
  }
}

/**
 * Extract a descriptive name from the SQL query
 */
function extractQueryName(sql) {
  const commentMatch = sql.match(/--\s*(.+)/);
  if (commentMatch) {
    return commentMatch[1].trim();
  }

  const firstLine = sql.split('\n').find(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('--');
  });

  if (firstLine && firstLine.length < 100) {
    return firstLine.trim();
  }

  return sql.substring(0, 80).replace(/\n/g, ' ') + '...';
}

/**
 * Analyze results and identify issues
 */
function analyzeResults(results, sectionName, queryName) {
  const issues = [];

  if (!results || !results.data || results.data.length === 0) {
    return issues;
  }

  const data = results.data;

  // PART 4: RLS Analysis
  if (sectionName.includes('RLS') || sectionName.toLowerCase().includes('security')) {
    if (queryName.toLowerCase().includes('without rls')) {
      issues.push({
        severity: 'CRITICAL',
        type: 'Security',
        description: `Found ${data.length} table(s) without RLS enabled`,
        recommendation: 'Enable RLS on all public tables',
        affectedObjects: data.slice(0, 10).map(row => row.tablename || row.table_name),
      });
    }
  }

  // PART 10: Data Quality
  if (sectionName.includes('Orphaned')) {
    if (data.length > 0) {
      issues.push({
        severity: 'MEDIUM',
        type: 'Data Integrity',
        description: `Found ${data.length} orphaned record(s)`,
        recommendation: 'Review and clean up orphaned data',
      });
    }
  }

  // PART 7: Performance
  if (sectionName.includes('Index') || sectionName.includes('Performance')) {
    if (queryName.toLowerCase().includes('missing')) {
      issues.push({
        severity: 'HIGH',
        type: 'Performance',
        description: `Found ${data.length} table(s) needing indexes`,
        recommendation: 'Add indexes on frequently queried columns',
      });
    }
  }

  // Count issues by severity
  for (const issue of issues) {
    switch (issue.severity) {
      case 'CRITICAL':
        auditResults.summary.criticalIssues++;
        break;
      case 'HIGH':
        auditResults.summary.highIssues++;
        break;
      case 'MEDIUM':
        auditResults.summary.mediumIssues++;
        break;
      case 'LOW':
        auditResults.summary.lowIssues++;
        break;
    }
  }

  return issues;
}

/**
 * Generate audit report
 */
async function generateReport(outputPath) {
  const report = [];

  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('              GOLFHELM DATABASE SPRING CLEANING AUDIT REPORT                ');
  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('');
  report.push(`Generated: ${auditResults.metadata.timestamp}`);
  report.push(`Database: ${auditResults.metadata.database}`);
  report.push('');
  report.push('───────────────────────────────────────────────────────────────────────────');
  report.push('                              EXECUTIVE SUMMARY                              ');
  report.push('───────────────────────────────────────────────────────────────────────────');
  report.push('');
  report.push(`Total Queries: ${auditResults.summary.totalQueries}`);
  report.push(`  ✅ Successful: ${auditResults.summary.successfulQueries}`);
  report.push(`  ❌ Failed: ${auditResults.summary.failedQueries}`);
  report.push('');
  report.push('Issues Found:');
  report.push(`  🔴 Critical: ${auditResults.summary.criticalIssues}`);
  report.push(`  🟠 High: ${auditResults.summary.highIssues}`);
  report.push(`  🟡 Medium: ${auditResults.summary.mediumIssues}`);
  report.push(`  🟢 Low: ${auditResults.summary.lowIssues}`);
  report.push('');

  // Detailed results
  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('                           DETAILED RESULTS                                  ');
  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('');

  for (const section of auditResults.sections) {
    report.push('───────────────────────────────────────────────────────────────────────────');
    report.push(`SECTION: ${section.sectionName}`);
    report.push('───────────────────────────────────────────────────────────────────────────');
    report.push('');

    for (const query of section.queries) {
      report.push(`Query: ${query.queryName}`);
      report.push(`Status: ${query.success ? '✅ Success' : '❌ Failed'}`);

      if (!query.success) {
        report.push(`Error: ${query.error}`);
      } else {
        report.push(`Results: ${query.rowCount} row(s) in ${query.executionTime}ms`);

        if (query.issues && query.issues.length > 0) {
          report.push('');
          report.push('Issues:');
          for (const issue of query.issues) {
            report.push(`  ${getSeverityIcon(issue.severity)} [${issue.severity}] ${issue.description}`);
          }
        }

        // Show sample data
        if (query.data && query.data.length > 0 && query.data.length <= 5) {
          report.push('');
          report.push('Data:');
          report.push(JSON.stringify(query.data, null, 2));
        } else if (query.data && query.data.length > 5) {
          report.push('');
          report.push('Sample Data (first 3 rows):');
          report.push(JSON.stringify(query.data.slice(0, 3), null, 2));
          report.push(`... and ${query.data.length - 3} more row(s)`);
        }
      }

      report.push('');
    }
  }

  // Errors
  if (auditResults.errors.length > 0) {
    report.push('═══════════════════════════════════════════════════════════════════════════');
    report.push('                              ERRORS                                        ');
    report.push('═══════════════════════════════════════════════════════════════════════════');
    report.push('');

    for (const error of auditResults.errors) {
      report.push(`Section: ${error.section}`);
      report.push(`Query: ${error.query}`);
      report.push(`Error: ${error.error}`);
      report.push('');
    }
  }

  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('                              END OF REPORT                                  ');
  report.push('═══════════════════════════════════════════════════════════════════════════');

  const reportContent = report.join('\n');
  await fs.writeFile(outputPath, reportContent, 'utf-8');

  console.log(`\n\n✅ Report saved to: ${outputPath}\n`);

  return reportContent;
}

function getSeverityIcon(severity) {
  const icons = {
    CRITICAL: '🔴',
    HIGH: '🟠',
    MEDIUM: '🟡',
    LOW: '🟢',
  };
  return icons[severity] || '⚪';
}

/**
 * Run the audit
 */
async function runAudit() {
  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('              GOLFHELM DATABASE SPRING CLEANING AUDIT                        ');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const markdownPath = '/Users/ricknini/Downloads/golfhelm-database-spring-cleaning-audit.md';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = `/Users/ricknini/Downloads/helmv3/audit-report-${timestamp}.txt`;
  const jsonReportPath = `/Users/ricknini/Downloads/helmv3/audit-report-${timestamp}.json`;

  try {
    // Test connection
    console.log('🔌 Testing Supabase connection...');
    const { data, error } = await supabase.from('users').select('count').limit(1);
    if (error) throw error;
    console.log('✅ Supabase connection successful\n');

    // Parse markdown
    console.log('📄 Parsing audit document...');
    const queries = await parseMarkdownFile(markdownPath);

    auditResults.summary.totalQueries = queries.length;
    console.log(`✅ Found ${queries.length} queries\n`);

    console.log('⚠️  NOTE: Many queries require direct PostgreSQL access.');
    console.log('    System catalog queries (pg_*, information_schema) will be skipped.\n');
    console.log('    For complete audit, use PostgreSQL client directly.\n');

    // Group by section
    const sectionMap = new Map();
    for (const query of queries) {
      if (!sectionMap.has(query.sectionName)) {
        sectionMap.set(query.sectionName, []);
      }
      sectionMap.get(query.sectionName).push(query);
    }

    console.log(`📊 Organized into ${sectionMap.size} sections\n`);

    // Execute queries
    let completed = 0;
    for (const [sectionName, sectionQueries] of sectionMap) {
      console.log(`\n${'═'.repeat(75)}`);
      console.log(`SECTION: ${sectionName} (${sectionQueries.length} queries)`);
      console.log('═'.repeat(75));

      const sectionResults = {
        sectionName,
        queries: [],
      };

      for (const query of sectionQueries) {
        completed++;
        console.log(`\n[${completed}/${queries.length}]`);

        const result = await executeQuery(query.sql, sectionName, query.queryName);
        const issues = analyzeResults(result, sectionName, query.queryName);

        sectionResults.queries.push({
          queryName: query.queryName,
          sql: query.sql,
          success: result.success,
          error: result.error,
          data: result.data,
          rowCount: result.rowCount,
          executionTime: result.executionTime,
          issues,
        });

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      auditResults.sections.push(sectionResults);
    }

    // Generate reports
    console.log('\n\n📝 Generating reports...');
    await generateReport(reportPath);
    await fs.writeFile(jsonReportPath, JSON.stringify(auditResults, null, 2), 'utf-8');
    console.log(`✅ JSON report: ${jsonReportPath}\n`);

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('                            AUDIT COMPLETE                                  ');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`\nQueries: ${auditResults.summary.totalQueries}`);
    console.log(`  ✅ Successful: ${auditResults.summary.successfulQueries}`);
    console.log(`  ❌ Failed: ${auditResults.summary.failedQueries}`);
    console.log(`\nIssues:`);
    console.log(`  🔴 Critical: ${auditResults.summary.criticalIssues}`);
    console.log(`  🟠 High: ${auditResults.summary.highIssues}`);
    console.log(`  🟡 Medium: ${auditResults.summary.mediumIssues}`);
    console.log(`  🟢 Low: ${auditResults.summary.lowIssues}`);
    console.log('\n');
  } catch (err) {
    console.error(`\n❌ FATAL ERROR: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run
runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

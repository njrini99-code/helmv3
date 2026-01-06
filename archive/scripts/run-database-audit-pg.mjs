#!/usr/bin/env node

/**
 * GolfHelm Database Spring Cleaning Audit Runner (PostgreSQL Version)
 *
 * This script uses the PostgreSQL client to run audit queries directly
 */

import pg from 'pg';
import fs from 'fs/promises';

const { Client } = pg.default || pg;

// PostgreSQL connection configuration (using connection pooler)
const connectionString = 'postgresql://postgres.dgvlnelygibgrrjehbyc:EHl4yASa9zM1sb1k@aws-0-us-west-1.pooler.supabase.com:6543/postgres';

let client = null;

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
 * Execute a SQL query and return results
 */
async function executeQuery(query, sectionName, queryName) {
  try {
    console.log(`\n📊 Running: ${sectionName}`);
    console.log(`   Query: ${queryName.substring(0, 80)}...`);

    const startTime = Date.now();
    const result = await client.query(query);
    const endTime = Date.now();

    const rowCount = result.rowCount || 0;
    const executionTime = endTime - startTime;

    console.log(`   ✅ Success: ${rowCount} row(s) in ${executionTime}ms`);

    auditResults.summary.successfulQueries++;

    return {
      success: true,
      data: result.rows,
      rowCount,
      executionTime,
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
          // Filter out comments-only and empty queries
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
  // Try to find a comment at the beginning
  const commentMatch = sql.match(/--\s*(.+)/);
  if (commentMatch) {
    return commentMatch[1].trim();
  }

  // Otherwise, extract from the first SELECT/WITH/etc
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
    // Tables without RLS
    if (queryName.toLowerCase().includes('without rls')) {
      issues.push({
        severity: 'CRITICAL',
        type: 'Security',
        description: `Found ${data.length} table(s) without RLS enabled`,
        recommendation: 'Enable RLS on all public tables or move to protected schema',
        affectedObjects: data.map(row => row.tablename || row.table_name || JSON.stringify(row)),
      });
    }

    // Overly permissive policies
    if (queryName.toLowerCase().includes('permissive') || queryName.toLowerCase().includes('public access')) {
      issues.push({
        severity: 'HIGH',
        type: 'Security',
        description: `Found ${data.length} potentially overly permissive RLS policy/policies`,
        recommendation: 'Review and restrict access patterns',
        affectedObjects: data.map(row => row.policyname || row.policy_name || JSON.stringify(row)),
      });
    }
  }

  // PART 10: Data Quality
  if (sectionName.includes('Orphaned') || sectionName.includes('Integrity')) {
    if (data.length > 0) {
      issues.push({
        severity: 'MEDIUM',
        type: 'Data Integrity',
        description: `Found ${data.length} orphaned or inconsistent record(s)`,
        recommendation: 'Review and clean up orphaned data',
        affectedObjects: data.slice(0, 10).map(row => row.id || JSON.stringify(row)),
      });
    }
  }

  // PART 7: Performance
  if (sectionName.includes('Index') || sectionName.includes('Performance')) {
    if (queryName.toLowerCase().includes('missing')) {
      issues.push({
        severity: 'HIGH',
        type: 'Performance',
        description: `Found ${data.length} table(s) that may benefit from indexes`,
        recommendation: 'Add indexes on frequently queried columns',
        affectedObjects: data.map(row => row.tablename || row.table_name || JSON.stringify(row)),
      });
    }

    if (queryName.toLowerCase().includes('duplicate')) {
      issues.push({
        severity: 'LOW',
        type: 'Performance',
        description: `Found ${data.length} duplicate or redundant index(es)`,
        recommendation: 'Remove duplicate indexes to save space',
        affectedObjects: data.map(row => row.indexname || JSON.stringify(row)),
      });
    }

    if (queryName.toLowerCase().includes('unused')) {
      issues.push({
        severity: 'LOW',
        type: 'Performance',
        description: `Found ${data.length} potentially unused index(es)`,
        recommendation: 'Consider removing unused indexes',
        affectedObjects: data.map(row => row.indexname || JSON.stringify(row)),
      });
    }
  }

  // PART 11: Security
  if (sectionName.includes('Service Role') || sectionName.includes('Privilege')) {
    if (data.length > 0) {
      issues.push({
        severity: 'CRITICAL',
        type: 'Security',
        description: `Found ${data.length} potential privilege escalation risk(s)`,
        recommendation: 'Review and restrict service role access',
        affectedObjects: data.map(row => JSON.stringify(row)),
      });
    }
  }

  // PART 15: Cleanup
  if (sectionName.includes('Empty') || sectionName.includes('Unused')) {
    if (data.length > 0) {
      issues.push({
        severity: 'LOW',
        type: 'Cleanup',
        description: `Found ${data.length} empty or unused database object(s)`,
        recommendation: 'Consider removing to reduce clutter',
        affectedObjects: data.map(row => row.tablename || row.table_name || JSON.stringify(row)),
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
 * Generate detailed audit report
 */
async function generateReport(outputPath) {
  const report = [];

  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('                    GOLFHELM DATABASE SPRING CLEANING AUDIT                    ');
  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('');
  report.push(`Generated: ${auditResults.metadata.timestamp}`);
  report.push(`Database: ${auditResults.metadata.database}`);
  report.push(`Audit Version: ${auditResults.metadata.auditVersion}`);
  report.push('');
  report.push('───────────────────────────────────────────────────────────────────────────');
  report.push('                              EXECUTIVE SUMMARY                              ');
  report.push('───────────────────────────────────────────────────────────────────────────');
  report.push('');
  report.push(`Total Queries Executed: ${auditResults.summary.totalQueries}`);
  report.push(`  ✅ Successful: ${auditResults.summary.successfulQueries}`);
  report.push(`  ❌ Failed: ${auditResults.summary.failedQueries}`);
  report.push('');
  report.push('Issues Identified:');
  report.push(`  🔴 Critical: ${auditResults.summary.criticalIssues}`);
  report.push(`  🟠 High: ${auditResults.summary.highIssues}`);
  report.push(`  🟡 Medium: ${auditResults.summary.mediumIssues}`);
  report.push(`  🟢 Low: ${auditResults.summary.lowIssues}`);
  report.push('');

  // Critical Issues Summary
  const criticalIssues = [];
  const highIssues = [];
  const mediumIssues = [];

  for (const section of auditResults.sections) {
    for (const query of section.queries) {
      if (query.issues) {
        for (const issue of query.issues) {
          if (issue.severity === 'CRITICAL') criticalIssues.push({ section: section.sectionName, issue });
          if (issue.severity === 'HIGH') highIssues.push({ section: section.sectionName, issue });
          if (issue.severity === 'MEDIUM') mediumIssues.push({ section: section.sectionName, issue });
        }
      }
    }
  }

  if (criticalIssues.length > 0) {
    report.push('───────────────────────────────────────────────────────────────────────────');
    report.push('                           🔴 CRITICAL ISSUES                                ');
    report.push('───────────────────────────────────────────────────────────────────────────');
    report.push('');

    for (let i = 0; i < criticalIssues.length; i++) {
      const { section, issue } = criticalIssues[i];
      report.push(`${i + 1}. [${section}] ${issue.description}`);
      report.push(`   Type: ${issue.type}`);
      report.push(`   Recommendation: ${issue.recommendation}`);
      if (issue.affectedObjects && issue.affectedObjects.length > 0) {
        report.push(`   Affected: ${issue.affectedObjects.slice(0, 5).join(', ')}`);
        if (issue.affectedObjects.length > 5) {
          report.push(`   ... and ${issue.affectedObjects.length - 5} more`);
        }
      }
      report.push('');
    }
  }

  if (highIssues.length > 0) {
    report.push('───────────────────────────────────────────────────────────────────────────');
    report.push('                             🟠 HIGH PRIORITY ISSUES                         ');
    report.push('───────────────────────────────────────────────────────────────────────────');
    report.push('');

    for (let i = 0; i < highIssues.length; i++) {
      const { section, issue } = highIssues[i];
      report.push(`${i + 1}. [${section}] ${issue.description}`);
      report.push(`   Type: ${issue.type}`);
      report.push(`   Recommendation: ${issue.recommendation}`);
      report.push('');
    }
  }

  // Detailed Section Results
  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('                           DETAILED AUDIT RESULTS                            ');
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

        // Show sample data for important queries
        if (query.data && query.data.length > 0 && query.data.length <= 10) {
          report.push('');
          report.push('Data:');
          report.push(JSON.stringify(query.data, null, 2));
        } else if (query.data && query.data.length > 10) {
          report.push('');
          report.push('Sample Data (first 5 rows):');
          report.push(JSON.stringify(query.data.slice(0, 5), null, 2));
          report.push(`... and ${query.data.length - 5} more row(s)`);
        }
      }

      report.push('');
    }
  }

  // Errors section
  if (auditResults.errors.length > 0) {
    report.push('═══════════════════════════════════════════════════════════════════════════');
    report.push('                              ERRORS ENCOUNTERED                             ');
    report.push('═══════════════════════════════════════════════════════════════════════════');
    report.push('');

    for (const error of auditResults.errors) {
      report.push(`Section: ${error.section}`);
      report.push(`Query: ${error.query}`);
      report.push(`Error: ${error.error}`);
      report.push(`SQL Preview: ${error.sql}`);
      report.push('');
    }
  }

  report.push('═══════════════════════════════════════════════════════════════════════════');
  report.push('                              END OF AUDIT REPORT                            ');
  report.push('═══════════════════════════════════════════════════════════════════════════');

  const reportContent = report.join('\n');
  await fs.writeFile(outputPath, reportContent, 'utf-8');

  console.log(`\n\n✅ Audit report saved to: ${outputPath}\n`);

  return reportContent;
}

function getSeverityIcon(severity) {
  switch (severity) {
    case 'CRITICAL':
      return '🔴';
    case 'HIGH':
      return '🟠';
    case 'MEDIUM':
      return '🟡';
    case 'LOW':
      return '🟢';
    default:
      return '⚪';
  }
}

/**
 * Run the complete audit
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
    // Create and connect database client
    console.log('🔌 Connecting to database...');
    client = new Client({ connectionString });
    await client.connect();
    await client.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Parse markdown file
    console.log('📄 Parsing audit document...');
    const queries = await parseMarkdownFile(markdownPath);

    auditResults.summary.totalQueries = queries.length;
    console.log(`✅ Found ${queries.length} queries to execute\n`);

    // Group queries by section
    const sectionMap = new Map();
    for (const query of queries) {
      if (!sectionMap.has(query.sectionName)) {
        sectionMap.set(query.sectionName, []);
      }
      sectionMap.get(query.sectionName).push(query);
    }

    console.log(`📊 Organized into ${sectionMap.size} sections\n`);
    console.log('Starting audit execution...\n');

    // Execute queries section by section
    let completedQueries = 0;
    for (const [sectionName, sectionQueries] of sectionMap) {
      console.log(`\n${'═'.repeat(75)}`);
      console.log(`SECTION: ${sectionName} (${sectionQueries.length} queries)`);
      console.log('═'.repeat(75));

      const sectionResults = {
        sectionName,
        queries: [],
      };

      for (const query of sectionQueries) {
        completedQueries++;
        console.log(`\n[${completedQueries}/${queries.length}]`);

        const result = await executeQuery(query.sql, sectionName, query.queryName);

        // Analyze results for issues
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

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      auditResults.sections.push(sectionResults);
    }

    // Generate reports
    console.log('\n\n📝 Generating audit reports...');
    await generateReport(reportPath);
    await fs.writeFile(jsonReportPath, JSON.stringify(auditResults, null, 2), 'utf-8');
    console.log(`✅ JSON report saved to: ${jsonReportPath}\n`);

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('                            AUDIT COMPLETE                                  ');
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log(`\nQueries Executed: ${auditResults.summary.totalQueries}`);
    console.log(`  ✅ Successful: ${auditResults.summary.successfulQueries}`);
    console.log(`  ❌ Failed: ${auditResults.summary.failedQueries}`);
    console.log(`\nIssues Found:`);
    console.log(`  🔴 Critical: ${auditResults.summary.criticalIssues}`);
    console.log(`  🟠 High: ${auditResults.summary.highIssues}`);
    console.log(`  🟡 Medium: ${auditResults.summary.mediumIssues}`);
    console.log(`  🟢 Low: ${auditResults.summary.lowIssues}`);
    console.log('\n');

    // Cleanup
    if (client) {
      await client.end();
    }
  } catch (err) {
    console.error(`\n❌ FATAL ERROR: ${err.message}`);
    console.error(err.stack);
    if (client) {
      await client.end();
    }
    process.exit(1);
  }
}

// Run the audit
runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

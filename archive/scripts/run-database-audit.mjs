#!/usr/bin/env node

/**
 * GolfHelm Database Spring Cleaning Audit Runner
 *
 * This script systematically runs all audit queries from the markdown file
 * and generates a comprehensive audit report.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// Database connection configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

// Create Supabase client with service role key
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
    databaseUrl: SUPABASE_URL,
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
    console.log(`\n📊 Running: ${sectionName} - ${queryName}`);

    const { data, error } = await supabase.rpc('exec_sql', { sql: query }).catch(async () => {
      // If RPC doesn't work, try direct query
      return await supabase.from('_audit_temp').select('*').limit(0).then(() => {
        // Use PostgreSQL client if available
        return { data: null, error: new Error('Direct SQL execution not available via Supabase client') };
      });
    });

    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
      auditResults.summary.failedQueries++;
      auditResults.errors.push({
        section: sectionName,
        query: queryName,
        error: error.message,
        sql: query.substring(0, 200) + '...',
      });
      return { success: false, error: error.message, data: null };
    }

    console.log(`   ✅ Success: ${data ? (Array.isArray(data) ? data.length : 1) : 0} results`);
    auditResults.summary.successfulQueries++;
    return { success: true, data, error: null };
  } catch (err) {
    console.error(`   ❌ Exception: ${err.message}`);
    auditResults.summary.failedQueries++;
    auditResults.errors.push({
      section: sectionName,
      query: queryName,
      error: err.message,
      sql: query.substring(0, 200) + '...',
    });
    return { success: false, error: err.message, data: null };
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

    // Find section headers before each SQL block
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

      // Split multiple queries if they exist (separated by semicolon and newline)
      const queries = sql.split(/;\s*(?=--|\n\n|SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/gi)
        .map(q => q.trim())
        .filter(q => q && q.length > 10 && !q.startsWith('--'));

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
  const commentMatch = sql.match(/^--\s*(.+)/);
  if (commentMatch) {
    return commentMatch[1].trim();
  }

  // Otherwise, extract from the first line
  const firstLine = sql.split('\n')[0].trim();
  if (firstLine.length < 100) {
    return firstLine;
  }

  return sql.substring(0, 80) + '...';
}

/**
 * Analyze results and identify issues
 */
function analyzeResults(results, sectionName, queryName) {
  const issues = [];

  if (!results || !results.data || results.data.length === 0) {
    return issues;
  }

  // Section-specific analysis
  if (sectionName.includes('RLS') || sectionName.includes('Security')) {
    // Check for tables without RLS
    if (queryName.includes('Without RLS') && results.data.length > 0) {
      issues.push({
        severity: 'CRITICAL',
        type: 'Security',
        description: `Found ${results.data.length} table(s) without RLS enabled`,
        details: results.data,
      });
    }
  }

  if (sectionName.includes('Orphaned')) {
    if (results.data.length > 0) {
      issues.push({
        severity: 'MEDIUM',
        type: 'Data Integrity',
        description: `Found ${results.data.length} orphaned record(s)`,
        details: results.data,
      });
    }
  }

  if (sectionName.includes('Performance') || sectionName.includes('Index')) {
    // Check for missing indexes
    if (queryName.includes('Missing') && results.data.length > 0) {
      issues.push({
        severity: 'HIGH',
        type: 'Performance',
        description: `Found ${results.data.length} table(s) that may need indexes`,
        details: results.data,
      });
    }
  }

  return issues;
}

/**
 * Generate audit report
 */
async function generateReport(outputPath) {
  const report = [];

  report.push('═══════════════════════════════════════════════════════════════');
  report.push('   GOLFHELM DATABASE SPRING CLEANING AUDIT REPORT');
  report.push('═══════════════════════════════════════════════════════════════');
  report.push('');
  report.push(`Generated: ${auditResults.metadata.timestamp}`);
  report.push(`Database: ${auditResults.metadata.databaseUrl}`);
  report.push('');
  report.push('─────────────────────────────────────────────────────────────');
  report.push('EXECUTIVE SUMMARY');
  report.push('─────────────────────────────────────────────────────────────');
  report.push('');
  report.push(`Total Queries Executed: ${auditResults.summary.totalQueries}`);
  report.push(`Successful Queries: ${auditResults.summary.successfulQueries}`);
  report.push(`Failed Queries: ${auditResults.summary.failedQueries}`);
  report.push('');
  report.push('Issues Found:');
  report.push(`  🔴 Critical: ${auditResults.summary.criticalIssues}`);
  report.push(`  🟠 High: ${auditResults.summary.highIssues}`);
  report.push(`  🟡 Medium: ${auditResults.summary.mediumIssues}`);
  report.push(`  🟢 Low: ${auditResults.summary.lowIssues}`);
  report.push('');

  // Add sections
  for (const section of auditResults.sections) {
    report.push('─────────────────────────────────────────────────────────────');
    report.push(`SECTION: ${section.sectionName}`);
    report.push('─────────────────────────────────────────────────────────────');
    report.push('');

    for (const query of section.queries) {
      report.push(`Query: ${query.queryName}`);
      report.push(`Status: ${query.success ? '✅ Success' : '❌ Failed'}`);

      if (!query.success) {
        report.push(`Error: ${query.error}`);
      } else if (query.data) {
        report.push(`Results: ${Array.isArray(query.data) ? query.data.length : 1} row(s)`);

        if (query.issues && query.issues.length > 0) {
          report.push('');
          report.push('Issues Identified:');
          for (const issue of query.issues) {
            report.push(`  ${getSeverityIcon(issue.severity)} ${issue.severity}: ${issue.description}`);
          }
        }

        // Show sample data (first 3 rows)
        if (Array.isArray(query.data) && query.data.length > 0) {
          report.push('');
          report.push('Sample Data:');
          const sampleData = query.data.slice(0, 3);
          report.push(JSON.stringify(sampleData, null, 2));
          if (query.data.length > 3) {
            report.push(`... and ${query.data.length - 3} more row(s)`);
          }
        }
      }

      report.push('');
    }
  }

  // Add errors section
  if (auditResults.errors.length > 0) {
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('ERRORS ENCOUNTERED');
    report.push('═══════════════════════════════════════════════════════════════');
    report.push('');

    for (const error of auditResults.errors) {
      report.push(`Section: ${error.section}`);
      report.push(`Query: ${error.query}`);
      report.push(`Error: ${error.error}`);
      report.push('');
    }
  }

  report.push('═══════════════════════════════════════════════════════════════');
  report.push('END OF AUDIT REPORT');
  report.push('═══════════════════════════════════════════════════════════════');

  const reportContent = report.join('\n');
  await fs.writeFile(outputPath, reportContent, 'utf-8');

  console.log(`\n\n✅ Audit report saved to: ${outputPath}\n`);

  return reportContent;
}

function getSeverityIcon(severity) {
  switch (severity) {
    case 'CRITICAL': return '🔴';
    case 'HIGH': return '🟠';
    case 'MEDIUM': return '🟡';
    case 'LOW': return '🟢';
    default: return '⚪';
  }
}

/**
 * Run the complete audit
 */
async function runAudit() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   GOLFHELM DATABASE SPRING CLEANING AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const markdownPath = '/Users/ricknini/Downloads/golfhelm-database-spring-cleaning-audit.md';
  const reportPath = '/Users/ricknini/Downloads/helmv3/audit-report-' + Date.now() + '.txt';

  try {
    // Parse markdown file
    console.log('📄 Parsing audit document...');
    const queries = await parseMarkdownFile(markdownPath);

    auditResults.summary.totalQueries = queries.length;
    console.log(`\n✅ Found ${queries.length} queries to execute\n`);

    // Group queries by section
    const sectionMap = new Map();
    for (const query of queries) {
      if (!sectionMap.has(query.sectionName)) {
        sectionMap.set(query.sectionName, []);
      }
      sectionMap.get(query.sectionName).push(query);
    }

    // Execute queries section by section
    for (const [sectionName, sectionQueries] of sectionMap) {
      console.log(`\n${'='.repeat(65)}`);
      console.log(`SECTION: ${sectionName}`);
      console.log('='.repeat(65));

      const sectionResults = {
        sectionName,
        queries: [],
      };

      for (const query of sectionQueries) {
        const result = await executeQuery(query.sql, sectionName, query.queryName);

        // Analyze results for issues
        const issues = analyzeResults(result, sectionName, query.queryName);

        // Count issues by severity
        for (const issue of issues) {
          switch (issue.severity) {
            case 'CRITICAL': auditResults.summary.criticalIssues++; break;
            case 'HIGH': auditResults.summary.highIssues++; break;
            case 'MEDIUM': auditResults.summary.mediumIssues++; break;
            case 'LOW': auditResults.summary.lowIssues++; break;
          }
        }

        sectionResults.queries.push({
          queryName: query.queryName,
          sql: query.sql,
          success: result.success,
          error: result.error,
          data: result.data,
          issues,
        });

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      auditResults.sections.push(sectionResults);
    }

    // Generate report
    console.log('\n\n📝 Generating audit report...');
    await generateReport(reportPath);

    // Also save JSON version
    const jsonReportPath = reportPath.replace('.txt', '.json');
    await fs.writeFile(jsonReportPath, JSON.stringify(auditResults, null, 2), 'utf-8');
    console.log(`✅ JSON report saved to: ${jsonReportPath}\n`);

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('AUDIT COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\nTotal Queries: ${auditResults.summary.totalQueries}`);
    console.log(`Successful: ${auditResults.summary.successfulQueries}`);
    console.log(`Failed: ${auditResults.summary.failedQueries}`);
    console.log(`\nIssues Found:`);
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

// Run the audit
runAudit().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

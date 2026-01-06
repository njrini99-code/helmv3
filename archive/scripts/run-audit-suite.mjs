#!/usr/bin/env node

/**
 * GolfHelm Database Audit Suite Runner
 * Runs all audit batches and compiles results
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const batches = [
  { name: 'Fix Account', file: '/Users/ricknini/Downloads/FIX_ALL_COMPLETE.sql', priority: 'CRITICAL' },
  { name: 'Batch 2: Security', file: './AUDIT_BATCH_2_SECURITY_CRITICAL.sql', priority: 'CRITICAL' },
  { name: 'Batch 7: Orphaned Records', file: './AUDIT_BATCH_7_ORPHANED_RECORDS.sql', priority: 'HIGH' },
  { name: 'Batch 3: RLS Policies', file: './AUDIT_BATCH_3_RLS_POLICIES.sql', priority: 'HIGH' },
  { name: 'Batch 5: Functions & Triggers', file: './AUDIT_BATCH_5_FUNCTIONS_TRIGGERS.sql', priority: 'MEDIUM' },
  { name: 'Batch 10: Data Quality', file: './AUDIT_BATCH_10_DATA_QUALITY.sql', priority: 'MEDIUM' },
  { name: 'Batch 4: Relationships', file: './AUDIT_BATCH_4_RELATIONSHIPS.sql', priority: 'MEDIUM' },
  { name: 'Batch 6: Data Analysis', file: './AUDIT_BATCH_6_DATA_ANALYSIS.sql', priority: 'LOW' },
  { name: 'Batch 9: Size & Constraints', file: './AUDIT_BATCH_9_SIZE_CONSTRAINTS.sql', priority: 'LOW' },
  { name: 'Batch 1: Inventory', file: './AUDIT_BATCH_1_INVENTORY.sql', priority: 'LOW' },
  { name: 'Batch 8: Schema Details', file: './AUDIT_BATCH_8_SCHEMA_DETAILS.sql', priority: 'LOW' },
];

async function runSQL(sql) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Try direct query approach
      const queries = sql.split(';').filter(q => q.trim() && !q.trim().startsWith('--'));
      const results = [];

      for (const query of queries) {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) continue;

        try {
          // For SELECT queries, use .from() if possible
          // Otherwise, fall back to showing the query failed
          const { data: queryData, error: queryError } = await supabase.rpc('exec_sql', {
            sql_query: trimmedQuery
          });

          if (queryError) {
            results.push({ query: trimmedQuery.substring(0, 100) + '...', error: queryError.message });
          } else {
            results.push({ query: trimmedQuery.substring(0, 100) + '...', data: queryData });
          }
        } catch (err) {
          results.push({ query: trimmedQuery.substring(0, 100) + '...', error: err.message });
        }
      }

      return { success: false, results, originalError: error.message };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function runBatch(batch) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 ${batch.name} [${batch.priority}]`);
  console.log(`${'='.repeat(80)}\n`);

  try {
    const sql = readFileSync(batch.file, 'utf-8');
    console.log(`📄 Loaded ${batch.file}`);
    console.log(`⏳ Executing queries...\n`);

    const result = await runSQL(sql);

    if (result.success) {
      console.log(`✅ Success!`);
      console.log(JSON.stringify(result.data, null, 2));
      return { batch: batch.name, success: true, data: result.data };
    } else {
      console.log(`❌ Failed`);
      console.log(`Error: ${result.error || result.originalError}`);
      if (result.results) {
        console.log(`\nQuery results:`);
        result.results.forEach((r, i) => {
          console.log(`\n  Query ${i + 1}: ${r.query}`);
          if (r.error) {
            console.log(`  ❌ Error: ${r.error}`);
          } else {
            console.log(`  ✅ Success:`, r.data);
          }
        });
      }
      return { batch: batch.name, success: false, error: result.error || result.originalError, details: result.results };
    }
  } catch (err) {
    console.log(`❌ Failed to read/execute batch`);
    console.log(`Error: ${err.message}`);
    return { batch: batch.name, success: false, error: err.message };
  }
}

async function main() {
  console.log('🏌️ GolfHelm Database Audit Suite');
  console.log('================================\n');

  const results = [];

  for (const batch of batches) {
    const result = await runBatch(batch);
    results.push(result);

    // Pause between batches
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n\n${'='.repeat(80)}`);
  console.log('📊 AUDIT SUMMARY');
  console.log(`${'='.repeat(80)}\n`);

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total Batches: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('Failed batches:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.batch}: ${r.error}`);
    });
  }

  // Save results
  const reportPath = './AUDIT_RESULTS.json';
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Full results saved to: ${reportPath}`);
}

main().catch(console.error);

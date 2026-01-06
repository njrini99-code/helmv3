#!/usr/bin/env node

/**
 * Apply Migration to Production Database
 *
 * Uses Supabase service role key to execute the migration SQL
 * via the Management API
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load from .env.local
const SUPABASE_URL = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('\n🚀 Applying Migration to Production Database\n');
console.log('Database:', SUPABASE_URL);
console.log('Migration: 081_comprehensive_team_based_rls.sql');
console.log('─'.repeat(60));

async function applyMigration() {
  try {
    // Read the migration file
    console.log('\n📖 Reading migration file...');
    const sql = readFileSync('./supabase/migrations/081_comprehensive_team_based_rls.sql', 'utf8');

    console.log(`   ✅ File loaded (${sql.length} characters)\n`);

    // Split into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📊 Found ${statements.length} SQL statements to execute\n`);
    console.log('⚠️  NOTE: This will modify your PRODUCTION database!');
    console.log('   Press Ctrl+C within 3 seconds to cancel...\n');

    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🔄 Starting migration...\n');

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      const preview = statement.substring(0, 80).replace(/\n/g, ' ');

      process.stdout.write(`   [${i + 1}/${statements.length}] ${preview}...`);

      try {
        // Use rpc to execute raw SQL
        const { error } = await supabase.rpc('exec_sql', {
          sql: statement
        });

        if (error) {
          // Some errors are expected (like DROP IF EXISTS on non-existent objects)
          if (error.message.includes('does not exist')) {
            process.stdout.write(' ⚠️  (skipped)\n');
          } else {
            process.stdout.write(' ❌\n');
            errorCount++;
            errors.push({
              statement: preview,
              error: error.message
            });
          }
        } else {
          process.stdout.write(' ✅\n');
          successCount++;
        }
      } catch (err) {
        process.stdout.write(' ❌\n');
        errorCount++;
        errors.push({
          statement: preview,
          error: err.message
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 Migration Summary');
    console.log('═'.repeat(60));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📝 Total: ${statements.length}`);

    if (errors.length > 0) {
      console.log('\n⚠️  Errors encountered:\n');
      errors.forEach((err, idx) => {
        console.log(`${idx + 1}. ${err.statement}`);
        console.log(`   Error: ${err.error}\n`);
      });
    }

    if (errorCount === 0) {
      console.log('\n✅ Migration completed successfully!');
      console.log('\n🔍 Next steps:');
      console.log('   1. Test the production app');
      console.log('   2. Verify RLS is working correctly');
      console.log('   3. Check for any error logs');
      process.exit(0);
    } else {
      console.log('\n⚠️  Migration completed with errors');
      console.log('   Review the errors above and fix if necessary');
      process.exit(1);
    }

  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Check if exec_sql function exists
async function checkExecSql() {
  console.log('\n🔍 Checking database access...');

  try {
    const { error } = await supabase.rpc('exec_sql', {
      sql: 'SELECT 1;'
    });

    if (error && error.code === '42883') {
      console.error('\n❌ Error: exec_sql function not found');
      console.error('\n   The database needs the exec_sql helper function.');
      console.error('   Please apply the migration manually via Supabase Dashboard:\n');
      console.error('   1. Go to https://supabase.com/dashboard');
      console.error('   2. Navigate to SQL Editor');
      console.error('   3. Copy supabase/migrations/081_comprehensive_team_based_rls.sql');
      console.error('   4. Paste and run\n');
      process.exit(1);
    } else if (error) {
      console.error('\n❌ Database connection error:', error.message);
      console.error('\n   Falling back to manual application method...\n');
      return false;
    }

    console.log('   ✅ Database access confirmed\n');
    return true;
  } catch (err) {
    console.error('\n❌ Connection test failed:', err.message);
    return false;
  }
}

// Main execution
async function main() {
  const hasAccess = await checkExecSql();

  if (!hasAccess) {
    console.log('📋 Manual Migration Instructions:\n');
    console.log('Since automatic execution is not available, please:');
    console.log('');
    console.log('1. Open https://supabase.com/dashboard');
    console.log('2. Select project: dgvlnelygibgrrjehbyc');
    console.log('3. Go to SQL Editor');
    console.log('4. Copy the contents of:');
    console.log('   supabase/migrations/081_comprehensive_team_based_rls.sql');
    console.log('5. Paste into the editor');
    console.log('6. Click "Run"');
    console.log('7. Verify no errors');
    console.log('');
    process.exit(1);
  }

  await applyMigration();
}

main();

#!/usr/bin/env node
/**
 * Apply CRM migration to Helm-Production
 * 
 * Run with: node scripts/apply-crm-migration.mjs
 * 
 * Requires DATABASE_URL env var or will use the Supabase pooler
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase pooler connection string format
// Format: postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
const PROJECT_REF = 'qmnssrrolpinvwjjnufo';
const POOLER_HOST = 'aws-0-us-east-1.pooler.supabase.com';

async function main() {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  
  if (!dbPassword) {
    console.log('\\n===================================================');
    console.log('CRM Migration for Helm-Production');
    console.log('===================================================\\n');
    console.log('Option 1: Run via Supabase Dashboard');
    console.log('  1. Go to: https://supabase.com/dashboard/project/qmnssrrolpinvwjjnufo/sql');
    console.log('  2. Copy the SQL from: supabase/migrations/20260214000000_create_crm_coaches.sql');
    console.log('  3. Paste and run it\\n');
    console.log('Option 2: Run this script with database password');
    console.log('  SUPABASE_DB_PASSWORD=your_password node scripts/apply-crm-migration.mjs\\n');
    console.log('To get your password:');
    console.log('  - Supabase Dashboard → Project Settings → Database → Connection string');
    console.log('===================================================\\n');
    process.exit(0);
  }

  const connectionString = `postgresql://postgres.${PROJECT_REF}:${dbPassword}@${POOLER_HOST}:6543/postgres`;
  
  console.log('Connecting to Helm-Production...');
  const sql = postgres(connectionString, { ssl: 'require' });
  
  try {
    // Read migration
    const migrationPath = join(__dirname, '../supabase/migrations/20260214000000_create_crm_coaches.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    
    console.log('Applying CRM migration...');
    await sql.unsafe(migrationSql);
    console.log('✓ Migration applied successfully!');
    
    // Verify tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'crm_%'
    `;
    console.log('\\nCreated tables:', tables.map(t => t.table_name).join(', '));
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();

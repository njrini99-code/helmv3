#!/usr/bin/env node
/**
 * Apply CRM migration directly via Supabase pooler
 */

import postgres from 'postgres';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase pooler connection - get password from command line or env
const PROJECT_REF = 'qmnssrrolpinvwjjnufo';
const POOLER_HOST = 'aws-0-us-east-1.pooler.supabase.com';
const DB_PASSWORD = process.argv[2] || process.env.SUPABASE_DB_PASSWORD;

if (!DB_PASSWORD) {
  console.log(`
Usage: node scripts/run-crm-migration.mjs <database_password>

Get your database password from:
  Supabase Dashboard → Project Settings → Database → Connection string

Or paste in the SQL directly at:
  https://supabase.com/dashboard/project/${PROJECT_REF}/sql
`);
  process.exit(1);
}

const connectionString = `postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@${POOLER_HOST}:6543/postgres`;

async function main() {
  console.log('Connecting to Helm-Production...');
  
  const sql = postgres(connectionString, { 
    ssl: 'require',
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
  });
  
  try {
    // Read migration
    const migrationPath = join(__dirname, '../supabase/migrations/20260214200000_create_crm_coaches.sql');
    const migrationSql = readFileSync(migrationPath, 'utf-8');
    
    console.log('Applying CRM migration...');
    console.log('Migration size:', migrationSql.length, 'bytes');
    
    // Execute the full migration
    await sql.unsafe(migrationSql);
    
    console.log('✅ Migration applied successfully!');
    
    // Verify tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE 'crm_%'
    `;
    console.log('\nCreated tables:', tables.map(t => t.table_name).join(', '));
    
    // Check enum types
    const types = await sql`
      SELECT typname FROM pg_type WHERE typname LIKE 'coach_%' OR typname LIKE 'contact_%' OR typname IN ('ncaa_division', 'program_type')
    `;
    console.log('Created types:', types.map(t => t.typname).join(', '));
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('\nTables may already exist. Check the database.');
    }
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main();

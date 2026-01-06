import pg from 'pg';
import { readFileSync } from 'fs';

const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres:EHl4yASa9zM1sb1k@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres'
});

async function runMigration() {
  try {
    console.log('=== Connecting to Database ===\n');
    await client.connect();
    console.log('✅ Connected\n');

    console.log('=== Running Migration ===\n');
    const sql = readFileSync('./supabase/migrations/20251231000001_fix_golf_players_columns.sql', 'utf8');

    await client.query(sql);

    console.log('✅ Migration applied successfully\n');

    console.log('=== Verifying Changes ===\n');
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'golf_players'
      ORDER BY ordinal_position;
    `);

    console.log('Columns in golf_players:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    console.log('\n✅ All done!\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Details:', err);
  } finally {
    await client.end();
  }
}

runMigration();

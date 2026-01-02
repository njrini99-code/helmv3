import pg from 'pg';
const { Client } = pg;

// Use direct database connection (not pooler)
const client = new Client({
  host: 'db.dgvlnelygibgrrjehbyc.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'EHl4yASa9zM1sb1k',
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  try {
    console.log('Connecting to Supabase database...');
    await client.connect();
    console.log('✅ Connected!\n');

    console.log('Making team_id nullable...');
    await client.query('ALTER TABLE golf_events ALTER COLUMN team_id DROP NOT NULL;');
    console.log('✅ team_id is now nullable');

    console.log('\nMaking created_by nullable...');
    await client.query('ALTER TABLE golf_events ALTER COLUMN created_by DROP NOT NULL;');
    console.log('✅ created_by is now nullable');

    console.log('\n🎉 Migration complete!');

    // Verify
    console.log('\nVerifying by inserting test event...');
    const { rows } = await client.query(`
      INSERT INTO golf_events (team_id, created_by, title, event_type, start_date, all_day)
      VALUES (NULL, NULL, 'Test Personal Event', 'practice', '2026-01-15', true)
      RETURNING id, title;
    `);
    console.log('✅ Test event created:', rows[0]);

    // Clean up test
    await client.query('DELETE FROM golf_events WHERE id = $1', [rows[0].id]);
    console.log('✅ Test event cleaned up');

    await client.end();
    console.log('\n✅ ALL DONE! You can now create calendar events as a player!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    await client.end();
    process.exit(1);
  }
}

runMigration();

import pg from 'pg';
const { Client } = pg;

// Use connection string format that works with psql
const connectionString = 'postgresql://postgres:EHl4yASa9zM1sb1k@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function checkPolicies() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    console.log('📋 Checking INSERT policies on golf_events table:\n');

    const result = await client.query(`
      SELECT
        policyname,
        cmd,
        qual::text AS using_clause,
        with_check::text AS with_check_clause
      FROM pg_policies
      WHERE tablename = 'golf_events'
        AND cmd = 'INSERT'
      ORDER BY policyname;
    `);

    if (result.rows.length === 0) {
      console.log('❌ NO INSERT POLICIES FOUND!');
      console.log('   This means authenticated users CANNOT insert rows.\n');
      console.log('💡 We need to create the RLS policy.\n');
    } else {
      console.log('Found', result.rows.length, 'INSERT policy(ies):\n');
      result.rows.forEach(row => {
        console.log('Policy Name:', row.policyname);
        console.log('Command:', row.cmd);
        console.log('USING clause:', row.using_clause || 'N/A');
        console.log('WITH CHECK clause:', row.with_check_clause || 'N/A');
        console.log('---');
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkPolicies();

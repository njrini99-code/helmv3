import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dgvlnelygibgrrjehbyc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyRlsFix() {
  console.log('=== APPLYING RLS FIX FOR golf_rounds ===\n');

  const sql = `
DROP POLICY IF EXISTS "Players can manage own rounds" ON golf_rounds;

CREATE POLICY "Players can manage own rounds"
  ON golf_rounds FOR ALL
  TO authenticated
  USING (player_id = get_golf_player_id())
  WITH CHECK (player_id = get_golf_player_id());
  `;

  console.log('Executing SQL:');
  console.log(sql);

  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error('\n❌ Failed to apply fix:',error.message);
    console.log('\nTrying alternative method...');

    // Try dropping policy first
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql_query: 'DROP POLICY IF EXISTS "Players can manage own rounds" ON golf_rounds;'
    });

    if (dropError) {
      console.error('Drop policy error:', dropError.message);
    } else {
      console.log('✓ Policy dropped');

      // Then create new one
      const { error: createError } = await supabase.rpc('exec_sql', {
        sql_query: `
CREATE POLICY "Players can manage own rounds"
  ON golf_rounds FOR ALL
  TO authenticated
  USING (player_id = get_golf_player_id())
  WITH CHECK (player_id = get_golf_player_id());
        `
      });

      if (createError) {
        console.error('Create policy error:', createError.message);
      } else {
        console.log('✓ New policy created with WITH CHECK clause');
      }
    }
    return;
  }

  console.log('\n✅ RLS policy fixed!');
  console.log('Players can now INSERT rounds.');
}

applyRlsFix().catch(console.error);

import { createClient } from '@supabase/supabase-js';

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I';
const URL = 'https://qmnssrrolpinvwjjnufo.supabase.co';

const db = createClient(URL, SERVICE_KEY);

async function check() {
  // Check rounds without team_id
  const { data: noTeam } = await db
    .from('golf_rounds')
    .select('id, player_id, course_name, round_date')
    .is('team_id', null);

  console.log('Rounds without team_id:', noTeam?.length);
  
  if (noTeam && noTeam.length > 0) {
    console.log('\nThese rounds have no team_id:');
    for (const r of noTeam) {
      // Check if player exists
      const { data: player } = await db
        .from('golf_players')
        .select('first_name, last_name')
        .eq('id', r.player_id)
        .single();
      
      console.log(`  ${r.course_name} (${r.round_date}) - Player: ${player ? `${player.first_name} ${player.last_name}` : 'NOT FOUND: ' + r.player_id}`);
    }
  }

  // Count total rounds
  const { count } = await db.from('golf_rounds').select('*', { count: 'exact', head: true });
  console.log('\nTotal rounds:', count);
}

check();

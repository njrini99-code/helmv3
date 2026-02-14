import { createClient } from '@supabase/supabase-js';

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I';
const URL = 'https://qmnssrrolpinvwjjnufo.supabase.co';

const db = createClient(URL, SERVICE_KEY);

async function list() {
  // Get all players
  const { data: players } = await db.from('golf_players').select('id, first_name, last_name');
  
  // Get all team members
  const { data: members } = await db.from('golf_team_members').select('player_id, team_id, status');
  
  const memberMap = new Map<string, { team_id: string; status: string }>();
  members?.forEach(m => memberMap.set(m.player_id, { team_id: m.team_id, status: m.status }));

  console.log('PLAYERS NOT ON ANY TEAM:');
  console.log('-'.repeat(50));
  
  const orphanPlayerIds: string[] = [];
  players?.forEach(p => {
    const membership = memberMap.get(p.id);
    if (!membership) {
      console.log(`  ${p.first_name} ${p.last_name} (${p.id})`);
      orphanPlayerIds.push(p.id);
    }
  });

  // Check if these orphan players have rounds
  console.log('\nORPHAN PLAYERS WITH ROUNDS:');
  console.log('-'.repeat(50));
  
  for (const playerId of orphanPlayerIds) {
    const { data: rounds } = await db
      .from('golf_rounds')
      .select('id, course_name, round_date')
      .eq('player_id', playerId);
    
    const player = players?.find(p => p.id === playerId);
    if (rounds && rounds.length > 0) {
      console.log(`\n  ${player?.first_name} ${player?.last_name}: ${rounds.length} rounds`);
      rounds.slice(0, 3).forEach(r => {
        console.log(`    - ${r.course_name} (${r.round_date})`);
      });
      if (rounds.length > 3) {
        console.log(`    ... and ${rounds.length - 3} more`);
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY:');
  console.log(`  Total players: ${players?.length}`);
  console.log(`  On teams: ${memberMap.size}`);
  console.log(`  Not on teams: ${orphanPlayerIds.length}`);
}

list();

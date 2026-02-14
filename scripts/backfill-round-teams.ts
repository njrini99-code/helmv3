import { createClient } from '@supabase/supabase-js';

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtbnNzcnJvbHBpbnZ3ampudWZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODMyNjg0MCwiZXhwIjoyMDgzOTAyODQwfQ.pW8-66rT0Y3LXcPYSXMPqj0_y0K_AYnPj22nXjdMU6I';
const URL = 'https://qmnssrrolpinvwjjnufo.supabase.co';

const db = createClient(URL, SERVICE_KEY);

async function backfillRoundTeams() {
  console.log('='.repeat(60));
  console.log('BACKFILLING ROUND TEAM IDs');
  console.log('='.repeat(60));

  // 1. Get all rounds without team_id
  const { data: roundsWithoutTeam, error: fetchErr } = await db
    .from('golf_rounds')
    .select('id, player_id, course_name, round_date')
    .is('team_id', null);

  if (fetchErr) {
    console.log('❌ Error fetching rounds:', fetchErr.message);
    return;
  }

  console.log(`\nFound ${roundsWithoutTeam?.length || 0} rounds without team_id\n`);

  if (!roundsWithoutTeam || roundsWithoutTeam.length === 0) {
    console.log('✅ Nothing to backfill!');
    return;
  }

  // 2. Get player -> team mapping from golf_team_members
  const { data: memberships } = await db
    .from('golf_team_members')
    .select('player_id, team_id')
    .eq('status', 'active');

  const playerTeamMap = new Map<string, string>();
  memberships?.forEach(m => {
    playerTeamMap.set(m.player_id, m.team_id);
  });

  console.log(`Player-Team mappings: ${playerTeamMap.size}`);

  // 3. Update each round
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const round of roundsWithoutTeam) {
    const teamId = playerTeamMap.get(round.player_id);
    
    if (!teamId) {
      console.log(`  ⚠️ Skipping round ${round.id} - player ${round.player_id} not on any team`);
      skipped++;
      continue;
    }

    const { error: updateErr } = await db
      .from('golf_rounds')
      .update({ team_id: teamId })
      .eq('id', round.id);

    if (updateErr) {
      console.log(`  ❌ Error updating round ${round.id}: ${updateErr.message}`);
      errors++;
    } else {
      console.log(`  ✅ Updated: ${round.course_name} (${round.round_date}) -> team ${teamId.slice(0, 8)}...`);
      updated++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

backfillRoundTeams().catch(console.error);

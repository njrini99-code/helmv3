import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://dgvlnelygibgrrjehbyc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRndmxuZWx5Z2liZ3JyamVoYnljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTkzMDg2OCwiZXhwIjoyMDgxNTA2ODY4fQ.W23S_6Kn0lsSDOSV2Bvt21ooQrpwPs5Q6VNuw5tJPLs'
);

async function cleanup() {
  console.log('=== DATA CLEANUP ===\n');

  // 1. Delete orphaned baseball players (NULL user_id)
  console.log('1. Deleting orphaned baseball players...');
  const { data: orphanedPlayers } = await supabase
    .from('players')
    .select('id')
    .is('user_id', null);

  if (orphanedPlayers && orphanedPlayers.length > 0) {
    const orphanedIds = orphanedPlayers.map(p => p.id);

    // Delete related records first
    await supabase.from('watchlists').delete().in('player_id', orphanedIds);
    await supabase.from('player_settings').delete().in('player_id', orphanedIds);
    await supabase.from('videos').delete().in('player_id', orphanedIds);

    // Delete orphaned players
    const { error } = await supabase.from('players').delete().in('id', orphanedIds);
    if (error) {
      console.log('   Error:', error.message);
    } else {
      console.log('   Deleted', orphanedIds.length, 'orphaned players');
    }
  } else {
    console.log('   No orphaned players found');
  }

  // 2. Delete incomplete player profiles (no names, older than 7 days)
  console.log('\n2. Checking for incomplete profiles...');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: incompletePlayers } = await supabase
    .from('players')
    .select('id, user_id, email, created_at')
    .or('first_name.is.null,first_name.eq.')
    .not('user_id', 'is', null)
    .lt('created_at', sevenDaysAgo);

  if (incompletePlayers && incompletePlayers.length > 0) {
    console.log('   Found', incompletePlayers.length, 'incomplete profiles older than 7 days');
    for (const p of incompletePlayers) {
      console.log('   - Deleting:', p.email || p.user_id);
      await supabase.from('players').delete().eq('id', p.id);
      await supabase.from('users').delete().eq('id', p.user_id);
    }
  } else {
    console.log('   No incomplete profiles to delete');
  }

  // 3. Delete orphaned golf teams (no coach assigned)
  console.log('\n3. Cleaning up orphaned golf teams...');
  const { data: allTeams } = await supabase.from('golf_teams').select('id, name');
  const { data: coachTeams } = await supabase.from('golf_coaches').select('team_id').not('team_id', 'is', null);

  const coachTeamIds = new Set((coachTeams || []).map(c => c.team_id));
  const orphanedTeams = (allTeams || []).filter(t => !coachTeamIds.has(t.id));

  if (orphanedTeams.length > 0) {
    console.log('   Found', orphanedTeams.length, 'orphaned teams');

    // First unassign any players from these teams
    for (const team of orphanedTeams) {
      await supabase.from('golf_players').update({ team_id: null }).eq('team_id', team.id);
      console.log('   - Deleting team:', team.name);
    }

    // Delete orphaned teams
    const orphanedTeamIds = orphanedTeams.map(t => t.id);
    await supabase.from('golf_teams').delete().in('id', orphanedTeamIds);
  } else {
    console.log('   No orphaned teams');
  }

  // 4. Clean up orphaned golf organizations
  console.log('\n4. Cleaning up orphaned golf organizations...');
  const { data: allOrgs } = await supabase.from('golf_organizations').select('id, name');
  const { data: teamsWithOrg } = await supabase.from('golf_teams').select('organization_id').not('organization_id', 'is', null);
  const { data: coachesWithOrg } = await supabase.from('golf_coaches').select('organization_id').not('organization_id', 'is', null);

  const usedOrgIds = new Set([
    ...(teamsWithOrg || []).map(t => t.organization_id),
    ...(coachesWithOrg || []).map(c => c.organization_id)
  ]);

  const orphanedOrgs = (allOrgs || []).filter(o => !usedOrgIds.has(o.id));

  if (orphanedOrgs.length > 0) {
    console.log('   Found', orphanedOrgs.length, 'orphaned organizations');
    const orphanedOrgIds = orphanedOrgs.map(o => o.id);
    await supabase.from('golf_organizations').delete().in('id', orphanedOrgIds);
    console.log('   Deleted orphaned organizations');
  } else {
    console.log('   No orphaned organizations');
  }

  // 5. Ensure invite_code exists on all golf_teams
  console.log('\n5. Ensuring invite codes exist...');
  const { data: teamsNoCode } = await supabase
    .from('golf_teams')
    .select('id, name')
    .is('invite_code', null);

  if (teamsNoCode && teamsNoCode.length > 0) {
    for (const team of teamsNoCode) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      await supabase.from('golf_teams').update({ invite_code: code }).eq('id', team.id);
      console.log('   Generated code for:', team.name, '->', code);
    }
  } else {
    console.log('   All teams have invite codes');
  }

  // 6. Verify final state
  console.log('\n=== FINAL STATE ===');
  const { count: playerCount } = await supabase.from('players').select('*', { count: 'exact', head: true });
  const { count: golfPlayerCount } = await supabase.from('golf_players').select('*', { count: 'exact', head: true });
  const { count: golfTeamCount } = await supabase.from('golf_teams').select('*', { count: 'exact', head: true });
  const { count: golfOrgCount } = await supabase.from('golf_organizations').select('*', { count: 'exact', head: true });

  console.log('Baseball players:', playerCount);
  console.log('Golf players:', golfPlayerCount);
  console.log('Golf teams:', golfTeamCount);
  console.log('Golf organizations:', golfOrgCount);

  console.log('\n=== CLEANUP COMPLETE ===');
}

cleanup().catch(console.error);

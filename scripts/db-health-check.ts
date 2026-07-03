import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SERVICE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local and run with `dotenv/config` or export them in your shell.'
  );
  process.exit(1);
}

const db = createClient(URL, SERVICE_KEY);

async function healthCheck() {
  console.log('='.repeat(60));
  console.log('DATABASE HEALTH CHECK');
  console.log('='.repeat(60));

  // 1. Core table counts
  console.log('\n📊 TABLE COUNTS:');
  const tables = [
    'golf_teams', 'golf_coaches', 'golf_players', 'golf_team_members',
    'golf_rounds', 'golf_holes', 'golf_shots', 'golf_conversations',
    'golf_messages', 'golf_calendar_events', 'golf_tasks'
  ];

  for (const table of tables) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    console.log(`  ${table}: ${error ? '❌ ' + error.message : count}`);
  }

  // 2. Check for orphaned records
  console.log('\n🔍 ORPHAN CHECK:');

  // Players without user_id
  const { data: orphanPlayers } = await db
    .from('golf_players')
    .select('id, first_name, last_name')
    .is('user_id', null);
  console.log(`  Players without user_id: ${orphanPlayers?.length || 0}`);

  // Team members with invalid player_id
  const { data: allMembers } = await db.from('golf_team_members').select('player_id');
  const { data: allPlayers } = await db.from('golf_players').select('id');
  const playerIds = new Set(allPlayers?.map(p => p.id) || []);
  const orphanMembers = allMembers?.filter(m => !playerIds.has(m.player_id)) || [];
  console.log(`  Team members with invalid player_id: ${orphanMembers.length}`);

  // Rounds without valid player_id
  const { data: allRounds } = await db.from('golf_rounds').select('id, player_id');
  const orphanRounds = allRounds?.filter(r => !playerIds.has(r.player_id)) || [];
  console.log(`  Rounds with invalid player_id: ${orphanRounds.length}`);

  // 3. Team membership status
  console.log('\n👥 TEAM MEMBERSHIP:');
  const { data: memberStats } = await db
    .from('golf_team_members')
    .select('status');
  
  const statusCounts: Record<string, number> = {};
  memberStats?.forEach(m => {
    statusCounts[m.status] = (statusCounts[m.status] || 0) + 1;
  });
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  // 4. Check rounds per player
  console.log('\n⛳ ROUNDS PER PLAYER (top 10):');
  const { data: roundCounts } = await db
    .from('golf_rounds')
    .select('player_id, golf_players!inner(first_name, last_name)')
    .order('player_id');
  
  const playerRounds: Record<string, { name: string; count: number }> = {};
  roundCounts?.forEach((r: any) => {
    const name = `${r.golf_players.first_name} ${r.golf_players.last_name}`;
    if (!playerRounds[r.player_id]) {
      playerRounds[r.player_id] = { name, count: 0 };
    }
    playerRounds[r.player_id].count++;
  });
  
  Object.values(playerRounds)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .forEach(p => console.log(`  ${p.name}: ${p.count} rounds`));

  // 5. Check messages
  console.log('\n💬 MESSAGING:');
  const { count: convCount } = await db.from('golf_conversations').select('*', { count: 'exact', head: true });
  const { count: msgCount } = await db.from('golf_messages').select('*', { count: 'exact', head: true });
  console.log(`  Conversations: ${convCount}`);
  console.log(`  Messages: ${msgCount}`);

  // Check for conversations without participants
  const { data: convs } = await db.from('golf_conversations').select('id');
  const { data: participants } = await db.from('golf_conversation_participants').select('conversation_id');
  const convIds = new Set(convs?.map(c => c.id) || []);
  const participantConvIds = new Set(participants?.map(p => p.conversation_id) || []);
  const convsWithoutParticipants = [...convIds].filter(id => !participantConvIds.has(id));
  console.log(`  Conversations without participants: ${convsWithoutParticipants.length}`);

  // 6. Check stats cache
  console.log('\n📈 STATS CACHE:');
  const { count: cacheCount } = await db.from('golf_player_stats_cache').select('*', { count: 'exact', head: true });
  console.log(`  Cached stats entries: ${cacheCount}`);

  // 7. Check for any null team_ids in rounds
  console.log('\n🏷️ ROUND TEAM ASSIGNMENTS:');
  const { data: roundTeams } = await db.from('golf_rounds').select('team_id');
  const withTeam = roundTeams?.filter(r => r.team_id !== null).length || 0;
  const withoutTeam = roundTeams?.filter(r => r.team_id === null).length || 0;
  console.log(`  Rounds with team_id: ${withTeam}`);
  console.log(`  Rounds without team_id: ${withoutTeam}`);

  console.log('\n' + '='.repeat(60));
  console.log('HEALTH CHECK COMPLETE');
  console.log('='.repeat(60));
}

healthCheck().catch(console.error);

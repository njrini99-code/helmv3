import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { DocumentsClient } from './documents-client';

export const metadata: Metadata = {
  title: 'Documents | BaseballHelm',
  description: 'Access and manage your team files, resources, and important documents',
};

// Cache documents for 5 minutes (documents don't change very often)
export const revalidate = 300;

export default async function BaseballDocumentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  // Determine user role
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  const isCoach = !!coach;

  // Get team_id: for coaches, look up via organization; for players, look up via team_members
  let teamId: string | null = null;
  if (coach?.organization_id) {
    const { data: orgTeam } = await supabase
      .from('baseball_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
  } else if (player?.id) {
    const { data: teamMember } = await supabase
      .from('baseball_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();
    teamId = teamMember?.team_id || null;
  }

  if (!teamId) {
    return (
      <div className="min-h-full bg-transparent flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">No Team Found</h1>
          <p className="text-slate-600">You must be on a team to access documents.</p>
        </div>
      </div>
    );
  }

  // Fetch documents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseQuery = (supabase as any)
    .from('baseball_documents')
    .select(`
      id,
      team_id,
      title,
      description,
      file_url,
      file_type,
      file_size,
      category,
      is_player_visible,
      created_at,
      uploaded_by,
      version_count,
      folder
    `)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  // Players can only see player-visible documents
  const { data: documents } = !isCoach
    ? await baseQuery.eq('is_player_visible', true)
    : await baseQuery;

  return (
    <DocumentsClient
      documents={documents || []}
      coachId={coach?.id || ''}
      teamId={teamId}
      isCoach={isCoach}
    />
  );
}

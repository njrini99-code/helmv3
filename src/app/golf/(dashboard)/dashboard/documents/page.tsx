import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { DocumentsClient } from './documents-client';

export const metadata: Metadata = {
  title: 'Documents | Helm Golf',
  description: 'Access and manage your team files, resources, and important documents',
};

// Cache documents for 5 minutes (documents don't change very often)
export const revalidate = 300;

export default async function GolfDocumentsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Determine user role
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single();

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  const isCoach = !!coach;

  // Get team_id: for coaches, look up via organization; for players, look up via team_members
  let teamId: string | null = null;
  if (coach?.organization_id) {
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = orgTeam?.id || null;
  } else if (player?.id) {
    const { data: teamMember } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();
    teamId = teamMember?.team_id || null;
  }

  if (!teamId) {
    return (
      <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">No Team Found</h1>
          <p className="text-slate-600">You must be on a team to access documents.</p>
        </div>
      </div>
    );
  }

  // Fetch documents
  // Note: The column is named 'player_visible' in the database (see migration 027_golf_documents.sql)
  // but the generated types may still have 'is_public'. Cast to match actual schema.
  type DocumentRow = {
    id: string;
    title: string;
    description: string | null;
    file_url: string;
    file_type: string | null;
    file_size: number | null;
    category: string | null;
    player_visible: boolean | null;
    created_at: string | null;
    uploaded_by: string | null;
    current_version_id: string | null;
    version_count: number | null;
    uploader: { full_name: string | null } | null;
  };

  const baseQuery = supabase
    .from('golf_documents')
    .select(`
      id,
      title,
      description,
      file_url,
      file_type,
      file_size,
      category,
      player_visible,
      created_at,
      uploaded_by,
      current_version_id,
      version_count,
      uploader:golf_coaches!golf_documents_uploaded_by_fkey (
        full_name
      )
    `)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  // Players can only see player-visible documents
  const { data: rawDocuments } = !isCoach
    ? await baseQuery.eq('player_visible', true)
    : await baseQuery;

  // Cast to correct type (database has player_visible, not is_public)
  const documents = rawDocuments as unknown as DocumentRow[] | null;

  return (
    <DocumentsClient
      documents={documents || []}
      coachId={coach?.id || ''}
      teamId={teamId}
      isCoach={isCoach}
    />
  );
}

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { DocumentsClient } from './documents-client';

export const metadata: Metadata = {
  title: 'Documents | Helm Golf',
  description: 'Access and manage your team files, resources, and important documents',
};

export default async function GolfDocumentsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/golf/login');

  // Determine user role
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  const isCoach = !!coach;
  const teamId = coach?.team_id || player?.team_id;

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
  let query = supabase
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
      uploader:golf_coaches!golf_documents_uploaded_by_fkey (
        full_name
      )
    `)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  // Players can only see player-visible documents
  if (!isCoach) {
    query = query.eq('player_visible', true);
  }

  const { data: documents } = await query;

  return (
    <DocumentsClient
      documents={documents || []}
      coachId={coach?.id || ''}
      teamId={teamId}
      isCoach={isCoach}
    />
  );
}

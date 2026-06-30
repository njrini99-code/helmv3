import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { DocumentsClient } from './documents-client';
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = {
  title: 'Documents | BaseballHelm',
  description: 'Access and manage your team files, resources, and important documents',
};

export const revalidate = 300;

export default async function BaseballDocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/baseball/login');

  const ctx = await getActiveBaseballContext();
  if (!ctx?.activeTeamId) {
    return (
      <div className="p-6 lg:p-8">
        <EmptyState
          type="generic"
          title="Join a team to see documents"
          description="Once you join a baseball team, shared files and resources will show up here."
        />
      </div>
    );
  }

  const isCoach = ctx.activeRole === 'coach';
  const teamId = ctx.activeTeamId;

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

  const { data: documents, error } = !isCoach
    ? await baseQuery.eq('is_player_visible', true)
    : await baseQuery;

  if (error) {
    return (
      <div className="p-6 lg:p-8">
        <ReadModelStateNotice
          state="error"
          title="Documents could not load"
        />
      </div>
    );
  }

  return (
    <DocumentsClient
      documents={documents || []}
      coachId={ctx.activeCoachId || ''}
      teamId={teamId}
      isCoach={isCoach}
    />
  );
}

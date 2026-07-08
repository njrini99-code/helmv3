import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { DocumentsClient } from './documents-client';
import { getTeamDocuments } from '@/app/baseball/actions/documents';
import { ReadModelStateNotice } from '@/components/baseball/ReadModelStateNotice';
import { EditorsLetter } from '@/components/baseball/living-annual';

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
      <div className="mx-auto w-full max-w-[1200px] p-6 lg:p-8">
        <EditorsLetter
          ink="team"
          title="Join a team to see documents"
          body="Once you join a baseball team, shared files and resources will show up here."
        />
      </div>
    );
  }

  const isCoach = ctx.activeRole === 'coach';
  const teamId = ctx.activeTeamId;

  const { data: documents, error } = await getTeamDocuments(teamId, isCoach);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1200px] p-6 lg:p-8">
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

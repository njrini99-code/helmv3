import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { DocumentsClient } from './documents-client';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { resolveCoachTeamId } from '@/lib/golf/resolve-team';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayDocuments } from '@/components/fairway/pages/documents';

export const metadata: Metadata = {
  title: 'Documents | Helm Golf',
  description: 'Access and manage your team files, resources, and important documents',
};

// Cache documents for 5 minutes (documents don't change very often)
export const revalidate = 300;

export default async function GolfDocumentsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach, player } = session;
  const isCoach = !!coach;
  const supabase = await createClient();

  // Get team_id: for coaches, look up via organization (deterministic: handles
  // orgs with >1 team); for players, look up via team_members
  let teamId: string | null = null;
  if (coach?.organization_id) {
    teamId = await resolveCoachTeamId(supabase, coach.organization_id, coach.id);
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
      <div className="min-h-full bg-transparent flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-h3 font-medium text-warm-900 tracking-[-0.015em] mb-2">No Team Found</h1>
          <p className="text-warm-600">You must be on a team to access documents.</p>
        </div>
      </div>
    );
  }

  // Fetch documents
  // Note: The column is named 'player_visible' in the database (see migration 027_golf_documents.sql)
  // but the generated types may still have 'is_public'. Cast to match actual schema.
  type DocumentRow = {
    id: string;
    team_id: string;
    title: string;
    description: string | null;
    file_url: string;
    file_type: string | null;
    file_size: number | null;
    category: string | null;
    is_public: boolean | null;
    created_at: string | null;
    uploaded_by: string | null;
    current_version_id: string | null;
    version_count: number | null;
    folder: string | null;
    uploader: { full_name: string | null } | null;
  };

  const baseQuery = supabase
    .from('golf_documents')
    .select(`
      id,
      team_id,
      title,
      description,
      file_url,
      file_type,
      file_size,
      category,
      is_public,
      created_at,
      uploaded_by,
      current_version_id,
      version_count,
      folder
    `)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  // Players can only see public documents
  const { data: rawDocuments } = !isCoach
    ? await baseQuery.eq('is_public', true)
    : await baseQuery;

  // Cast to correct type (database has player_visible, not is_public)
  const documents = rawDocuments as unknown as DocumentRow[] | null;

  // ── Fairway redesign fork (flag-gated, additive) ──────────────────────────
  // Reuses the SAME role + golf_documents list resolved above (players already
  // filtered to public server-side); re-skins onto the warm-matte Fairway
  // system. Legacy branch below is byte-identical when the flag is off.
  if (isRedesignEnabled()) {
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <FairwayDocuments
          documents={documents || []}
          coachId={coach?.id || ''}
          teamId={teamId}
          isCoach={isCoach}
        />
      </div>
    );
  }

  return (
    <AnimatedPage>
      <AnimatedItem>
        <DocumentsClient
          documents={documents || []}
          coachId={coach?.id || ''}
          teamId={teamId}
          isCoach={isCoach}
        />
      </AnimatedItem>
    </AnimatedPage>
  );
}

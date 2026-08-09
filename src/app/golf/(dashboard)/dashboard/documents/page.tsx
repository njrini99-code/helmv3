import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayDocuments } from '@/components/fairway/pages/documents';
import { EmptyState } from '@/components/fairway';

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
    teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  } else if (player?.id) {
    // The `error` is READ. Discarded, a failed membership read left teamId null
    // and a ROSTERED player was told "No Team Found — you must be on a team to
    // access documents". `.maybeSingle()` reports a genuine no-row as
    // { data: null, error: null }, so a player truly on no team still sees that
    // gate, which is the right answer for them.
    const { data: teamMember, error: teamMemberError } = await supabase
      .from('golf_team_members')
      .select('team_id')
      .eq('player_id', player.id)
      .maybeSingle();

    if (teamMemberError) {
      await logServerError(
        `[documents page] team membership read failed for player ${player.id}; the page would claim they have no team: ${describeError(teamMemberError)}`,
        { action: 'golf.documentsPage.resolveTeam', featureArea: 'documents' },
      );
      throw new Error('Failed to load documents');
    }

    teamId = teamMember?.team_id || null;
  }

  if (!teamId) {
    // Un-gated role/team gate (hit regardless of the redesign fork): a minimal
    // Fairway-styled equivalent — same copy, same behavior.
    return (
      <div className={fairwayScope('flex min-h-full items-center justify-center bg-canvas px-4 py-16 md:px-6')}>
        <EmptyState title="No Team Found" description="You must be on a team to access documents." />
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
    updated_at: string | null;
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
      updated_at,
      uploaded_by,
      current_version_id,
      version_count,
      folder
    `)
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  // Players can only see public documents
  // The `error` is READ. This one is a ternary, which is why the unchecked-read
  // ratchet never counted it — but it fails identically: a dropped connection
  // rendered an empty shelf to a team whose waivers, itineraries and
  // eligibility forms are all sitting there.
  const { data: rawDocuments, error: documentsError } = !isCoach
    ? await baseQuery.eq('is_public', true)
    : await baseQuery;

  if (documentsError) {
    await logServerError(
      `[documents page] document list read failed for team ${teamId}; the page would claim there are none: ${describeError(documentsError)}`,
      { action: 'golf.documentsPage.listDocuments', featureArea: 'documents' },
    );
    throw new Error('Failed to load documents');
  }

  // Cast to correct type (database has player_visible, not is_public)
  const documents = rawDocuments as unknown as DocumentRow[] | null;

  // Reuses the SAME role + golf_documents list resolved above (players already
  // filtered to public server-side); renders onto the warm-matte Fairway system.
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

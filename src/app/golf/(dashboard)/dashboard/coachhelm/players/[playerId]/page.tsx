import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { getInsightsForPlayer } from '@/app/golf/actions/insight-delivery';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { isRedesignEnabled, fairwayScope } from '@/lib/redesign/flag';
import { FairwayCoachPlayerBrief } from '@/components/fairway/pages/coachhelm/FairwayCoachPlayerBrief';
import type { GenomeAxis } from '@/components/fairway';
import { GENOME_DIMENSIONS } from '@/lib/coachhelm/v3/genome/registry';
import { normalizeForRadar } from '@/lib/coachhelm/v3/genome/normalize';

interface PageProps {
  params: Promise<{ playerId: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { playerId } = await params;
  const sb = await createClient();
  const { data } = await sb
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();
  const name = data ? `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() : 'Player';
  return { title: `${name} · Player Brief · CoachHelm` };
}

export default async function CoachHelmPlayerBriefPage({ params }: PageProps) {
  if (!isRedesignEnabled()) {
    const { playerId } = await params;
    redirect(`/golf/dashboard/coachhelm/genome/${playerId}`);
  }

  const { playerId } = await params;
  const session = await getGolfSessionProfile();
  if (!session?.coach) redirect('/golf/login');

  const sb = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(
    sb,
    session.coach.organization_id,
    session.coach.id,
  );
  if (!teamId) redirect('/golf/dashboard');

  const { data: membership } = await sb
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!membership) notFound();

  const { data: player } = await sb
    .from('golf_players')
    .select('id, first_name, last_name, avatar_url, graduation_year, handicap')
    .eq('id', playerId)
    .maybeSingle();
  if (!player) notFound();

  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';

  const [countsRes, insights, genome, standingMap, focusRes] = await Promise.all([
    getAlertCounts(session.coach.id),
    getInsightsForPlayer(playerId, { limit: 5 }),
    loadGenome(sb, playerId),
    loadPlayerStandingMap(playerId),
    sb
      .from('golf_player_focus_areas')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('status', 'active'),
  ]);

  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;
  const topInsight = insights[0] ?? null;
  const activeFocusCount = focusRes.count ?? 0;

  const genomeAxes: GenomeAxis[] | null = genome
    ? GENOME_DIMENSIONS.map((dim) => {
        const entry = genome.vector[dim.id];
        if (!entry || entry.value === null) return null;
        const norm = normalizeForRadar(dim.id, entry);
        if (norm == null) return null;
        return { label: dim.label, value: Math.round(norm * 100) };
      }).filter((row): row is GenomeAxis => row !== null)
    : null;

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayCoachPlayerBrief
        playerId={playerId}
        playerName={name}
        avatarUrl={player.avatar_url}
        graduationYear={player.graduation_year}
        handicap={player.handicap}
        topInsight={topInsight}
        standingByMetric={standingMap}
        activeFocusCount={activeFocusCount}
        signalCount={signalCount}
        genomeAxes={genomeAxes}
      />
    </div>
  );
}

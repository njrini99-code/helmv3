import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { IconArrowLeft, IconMapPin, IconCalendar, IconCheck, IconChartBar } from '@/components/icons';
import { RoundReviewViewer } from '@/components/golf/coachhelm/RoundReviewViewer';
import { ShotByShot } from '@/components/golf/rounds';

// Note: StatBox removed since comprehensive stats fields don't exist in current schema

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: round } = await supabase
    .from('golf_rounds')
    .select('course_name, round_date, total_score, score_to_par')
    .eq('id', id)
    .single();

  if (!round) {
    return {
      title: 'Round Details | Helm Sports',
      description: 'View golf round details and scorecard',
    };
  }

  const scoreToPar = round.score_to_par || 0;
  const scoreDisplay = scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar;

  return {
    title: `${round.course_name} - ${round.total_score || '--'} (${scoreDisplay}) | Helm Sports`,
    description: `Round details from ${round.course_name} on ${new Date(round.round_date).toLocaleDateString()} - Score: ${round.total_score || '--'} (${scoreDisplay})`,
  };
}

// Matches the actual golf_rounds schema from database.ts
interface RoundWithDetails {
  id: string;
  player_id: string;
  course_name: string | null;
  course_city: string | null;
  course_state: string | null;
  course_rating: number | null;
  course_slope: number | null;
  tees_played: string | null;
  round_type: string | null;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  notes: string | null;
  status: string | null;
  holes_played: number | null;
  current_hole: number | null;
  front_nine: number | null;
  back_nine: number | null;
  weather_conditions: string | null;
  player: {
    first_name: string | null;
    last_name: string | null;
  } | null;
  // Holes match the actual golf_holes schema
  holes: Array<{
    id: string;
    hole_number: number;
    par: number;
    score: number | null;
    putts: number | null;
    fairway_hit: boolean | null;
    gir: boolean | null;
    penalty_strokes: number | null;
    sand_save: boolean | null;
    up_and_down: boolean | null;
    notes: string | null;
  }>;
}


export default async function RoundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Fetch round with holes
  const { data: round, error } = await supabase
    .from('golf_rounds')
    .select(`
      *,
      player:golf_players(first_name, last_name),
      holes:golf_holes(*)
    `)
    .eq('id', id)
    .single();

  if (error || !round) {
    notFound();
  }

  const roundData = {
    ...round,
    player: Array.isArray(round.player) ? round.player[0] : round.player,
    holes: (Array.isArray(round.holes) ? round.holes : []) as unknown as RoundWithDetails['holes'],
  } as unknown as RoundWithDetails;

  // Check authorization
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

  // Check if coach has access by verifying round's player is on their team
  let isCoach = false;
  if (coach?.organization_id && roundData.player_id) {
    // Get team_id from organization
    const { data: orgTeam } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (orgTeam?.id) {
      const { data: teamMembership } = await supabase
        .from('golf_team_members')
        .select('id')
        .eq('team_id', orgTeam.id)
        .eq('player_id', roundData.player_id)
        .maybeSingle();
      isCoach = !!teamMembership;
    }
  }
  const isOwnRound = player && roundData.player_id === player.id;

  if (!isCoach && !isOwnRound) {
    redirect('/golf/dashboard');
  }

  const playerName = roundData.player
    ? `${roundData.player.first_name} ${roundData.player.last_name}`
    : 'Unknown Player';

  const scoreToPar = roundData.score_to_par || 0;
  const scoreColor = scoreToPar === 0
    ? 'text-slate-600'
    : scoreToPar < 0
      ? 'text-green-600'
      : 'text-red-600';

  // Sort holes by number
  const sortedHoles = [...(roundData.holes || [])].sort((a, b) => a.hole_number - b.hole_number);

  // Calculate penalty strokes from holes
  const totalPenalties = sortedHoles.reduce((sum, h) => sum + (h.penalty_strokes || 0), 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/golf/dashboard/rounds">
          <Button variant="secondary" size="sm">
            <IconArrowLeft size={16} className="mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {roundData.course_name}
          </h1>
          <p className="text-slate-500 mt-1">
            Round Details
          </p>
        </div>
        <Link href="/golf/dashboard/stats">
          <Button variant="secondary" size="sm">
            <IconChartBar size={16} className="mr-2" />
            View All Stats
          </Button>
        </Link>
      </div>

      {/* Round Summary Card */}
      <Card variant="glass" className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-4 mb-3">
                <h2 className="text-xl font-semibold text-slate-900">
                  {roundData.course_name}
                </h2>
                {roundData.status === 'completed' && (
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                    <IconCheck size={14} />
                    Completed
                  </span>
                )}
                <span className="px-2.5 py-1 text-xs rounded-full bg-slate-100 text-slate-600 capitalize">
                  {roundData.round_type}
                </span>
              </div>
              
              <div className="flex items-center gap-6 text-sm text-slate-500">
                {isCoach && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Player:</span>
                    <span>{playerName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <IconCalendar size={16} />
                  <span>{new Date(roundData.round_date).toLocaleDateString()}</span>
                </div>
                {roundData.course_city && roundData.course_state && (
                  <div className="flex items-center gap-2">
                    <IconMapPin size={16} />
                    <span>{roundData.course_city}, {roundData.course_state}</span>
                  </div>
                )}
              </div>

              {roundData.course_rating && roundData.course_slope && (
                <div className="flex items-center gap-4 text-sm text-slate-400 mt-2">
                  <span>Rating: {roundData.course_rating}</span>
                  <span>Slope: {roundData.course_slope}</span>
                  {roundData.tees_played && <span>Tees: {roundData.tees_played}</span>}
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-5xl font-bold text-slate-900 mb-2">
                {roundData.total_score || '--'}
              </div>
              <div className={`text-xl font-semibold ${scoreColor} mb-2`}>
                {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
              </div>
            </div>
          </div>


          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-slate-200">
            <div>
              <p className="text-sm text-slate-500">Total Putts</p>
              <p className="text-2xl font-semibold text-slate-900">{roundData.total_putts || '--'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Fairways Hit</p>
              <p className="text-2xl font-semibold text-slate-900">
                {roundData.total_fairways_hit !== null && roundData.total_fairways
                  ? `${roundData.total_fairways_hit}/${roundData.total_fairways}`
                  : '--'}
              </p>
              {roundData.total_fairways_hit !== null && roundData.total_fairways && (
                <p className="text-xs text-slate-400">
                  {((roundData.total_fairways_hit / roundData.total_fairways) * 100).toFixed(0)}%
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-slate-500">Greens in Reg</p>
              <p className="text-2xl font-semibold text-slate-900">
                {roundData.total_gir !== null && roundData.total_gir_possible
                  ? `${roundData.total_gir}/${roundData.total_gir_possible}`
                  : '--'}
              </p>
              {roundData.total_gir !== null && roundData.total_gir_possible && (
                <p className="text-xs text-slate-400">
                  {((roundData.total_gir / roundData.total_gir_possible) * 100).toFixed(0)}%
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-slate-500">Penalties</p>
              <p className="text-2xl font-semibold text-slate-900">{totalPenalties}</p>
            </div>
          </div>

          {roundData.notes && (
            <div className="mt-6 pt-6 border-t border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-2">Notes</p>
              <p className="text-sm text-slate-600">{roundData.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Round Review */}
      <RoundReviewViewer roundId={id} className="mb-6" />

      {/* Shot-by-Shot Review */}
      <ShotByShot roundId={id} className="mb-6" />

      {/* Scorecard */}
      <Card variant="glass">
        <CardHeader>
          <CardTitle>Scorecard</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedHoles && sortedHoles.length > 0 ? (
            <div className="overflow-x-auto overscroll-x-contain touch-pan-x" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3 px-3 font-medium text-slate-500">Hole</th>
                    <th className="text-center py-3 px-3 font-medium text-slate-500">Par</th>
                    <th className="text-center py-3 px-3 font-medium text-slate-500">Score</th>
                    <th className="text-center py-3 px-3 font-medium text-slate-500">+/-</th>
                    <th className="text-center py-3 px-3 font-medium text-slate-500">Putts</th>
                    <th className="text-center py-3 px-3 font-medium text-slate-500">FIR</th>
                    <th className="text-center py-3 px-3 font-medium text-slate-500">GIR</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoles.map((hole) => {
                  const holeToPar = hole.score !== null ? hole.score - hole.par : 0;
                  const holeScoreColor = holeToPar === 0
                    ? 'text-slate-900'
                    : holeToPar < 0
                      ? 'text-green-600 font-semibold'
                      : 'text-red-600 font-semibold';

                  return (
                    <tr key={hole.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-3 font-medium text-slate-900">{hole.hole_number}</td>
                      <td className="text-center py-3 px-3 text-slate-600">{hole.par}</td>
                      <td className={`text-center py-3 px-3 ${holeScoreColor}`}>{hole.score ?? '--'}</td>
                      <td className={`text-center py-3 px-3 ${holeScoreColor}`}>
                        {hole.score !== null ? (holeToPar === 0 ? 'E' : holeToPar > 0 ? `+${holeToPar}` : holeToPar) : '--'}
                      </td>
                      <td className="text-center py-3 px-3 text-slate-600">{hole.putts ?? '--'}</td>
                      <td className="text-center py-3 px-3">
                        {hole.fairway_hit === true ? '✓' : hole.fairway_hit === false ? '✗' : '--'}
                      </td>
                      <td className="text-center py-3 px-3">
                        {hole.gir === true ? '✓' : hole.gir === false ? '✗' : '--'}
                      </td>
                    </tr>
                  );
                })}
                {sortedHoles.length > 0 && (
                  <tr className="bg-slate-50 font-semibold">
                    <td className="py-3 px-3">Total</td>
                    <td className="text-center py-3 px-3">{sortedHoles.reduce((sum, h) => sum + h.par, 0)}</td>
                    <td className="text-center py-3 px-3 text-slate-900">{roundData.total_score}</td>
                    <td className={`text-center py-3 px-3 ${scoreColor}`}>
                      {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                    </td>
                    <td className="text-center py-3 px-3">{roundData.total_putts ?? '--'}</td>
                    <td className="text-center py-3 px-3">
                      {roundData.total_fairways_hit !== null && roundData.total_fairways
                        ? `${roundData.total_fairways_hit}/${roundData.total_fairways}`
                        : '--'}
                    </td>
                    <td className="text-center py-3 px-3">
                      {roundData.total_gir !== null && roundData.total_gir_possible
                        ? `${roundData.total_gir}/${roundData.total_gir_possible}`
                        : '--'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <IconChartBar className="h-6 w-6 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">
                No Scorecard Data
              </h3>
              <p className="text-sm text-slate-500 max-w-sm">
                This round doesn&apos;t have hole-by-hole scorecard data yet.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { IconArrowLeft, IconMapPin, IconCalendar, IconCheck, IconEdit, IconTrash } from '@/components/icons';
import type { GolfRound, GolfHole } from '@/lib/types/golf';

interface RoundWithDetails extends Omit<GolfRound, 'player' | 'holes'> {
  player: {
    first_name: string | null;
    last_name: string | null;
    team_id: string | null;
  } | null;
  holes: GolfHole[];
  total_penalties?: number | null;
  notes?: string | null;
}

export default async function RoundDetailPage({
  params,
}: {
  params: { id: string };
}) {
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
      player:golf_players(first_name, last_name, team_id),
      holes:golf_holes(*)
    `)
    .eq('id', params.id)
    .single();

  if (error || !round) {
    notFound();
  }

  const roundData = round as unknown as RoundWithDetails;

  // Check authorization
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  const { data: player } = await supabase
    .from('golf_players')
    .select('id')
    .eq('user_id', user.id)
    .single();

  const isCoach = coach && roundData.player?.team_id === coach.team_id;
  const isOwnRound = player && roundData.player_id === player.id;

  if (!isCoach && !isOwnRound) {
    redirect('/golf/dashboard');
  }

  const playerName = roundData.player
    ? `${roundData.player.first_name} ${roundData.player.last_name}`
    : 'Unknown Player';

  const scoreToPar = roundData.total_to_par || 0;
  const scoreColor = scoreToPar === 0
    ? 'text-slate-600'
    : scoreToPar < 0
      ? 'text-green-600'
      : 'text-red-600';

  // Sort holes by number
  const sortedHoles = [...(roundData.holes || [])].sort((a, b) => a.hole_number - b.hole_number);

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
      </div>

      {/* Round Summary Card */}
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-4 mb-3">
                <h2 className="text-xl font-semibold text-slate-900">
                  {roundData.course_name}
                </h2>
                {roundData.is_verified && (
                  <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                    <IconCheck size={14} />
                    Verified
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
                {roundData.fairways_hit !== null && roundData.fairways_total
                  ? `${roundData.fairways_hit}/${roundData.fairways_total}`
                  : '--'}
              </p>
              {roundData.fairways_hit !== null && roundData.fairways_total && (
                <p className="text-xs text-slate-400">
                  {((roundData.fairways_hit / roundData.fairways_total) * 100).toFixed(0)}%
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-slate-500">Greens in Reg</p>
              <p className="text-2xl font-semibold text-slate-900">
                {roundData.greens_in_regulation !== null && roundData.greens_total
                  ? `${roundData.greens_in_regulation}/${roundData.greens_total}`
                  : '--'}
              </p>
              {roundData.greens_in_regulation !== null && roundData.greens_total && (
                <p className="text-xs text-slate-400">
                  {((roundData.greens_in_regulation / roundData.greens_total) * 100).toFixed(0)}%
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-slate-500">Penalties</p>
              <p className="text-2xl font-semibold text-slate-900">{roundData.total_penalties || 0}</p>
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

      {/* Scorecard */}
      <Card>
        <CardHeader>
          <CardTitle>Scorecard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-medium text-slate-500">Hole</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-500">Par</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-500">Score</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-500">+/-</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-500">Putts</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-500">FIR</th>
                  <th className="text-center py-3 px-4 font-medium text-slate-500">GIR</th>
                </tr>
              </thead>
              <tbody>
                {sortedHoles.map((hole) => {
                  const holeToPar = hole.score_to_par || (hole.score - hole.par);
                  const holeScoreColor = holeToPar === 0
                    ? 'text-slate-900'
                    : holeToPar < 0
                      ? 'text-green-600 font-semibold'
                      : 'text-red-600 font-semibold';

                  return (
                    <tr key={hole.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-900">{hole.hole_number}</td>
                      <td className="text-center py-3 px-4 text-slate-600">{hole.par}</td>
                      <td className={`text-center py-3 px-4 ${holeScoreColor}`}>{hole.score}</td>
                      <td className={`text-center py-3 px-4 ${holeScoreColor}`}>
                        {holeToPar === 0 ? 'E' : holeToPar > 0 ? `+${holeToPar}` : holeToPar}
                      </td>
                      <td className="text-center py-3 px-4 text-slate-600">{hole.putts || '--'}</td>
                      <td className="text-center py-3 px-4">
                        {hole.fairway_hit === true ? '✓' : hole.fairway_hit === false ? '✗' : '--'}
                      </td>
                      <td className="text-center py-3 px-4">
                        {hole.green_in_regulation === true ? '✓' : hole.green_in_regulation === false ? '✗' : '--'}
                      </td>
                    </tr>
                  );
                })}
                {sortedHoles.length > 0 && (
                  <tr className="bg-slate-50 font-semibold">
                    <td className="py-3 px-4">Total</td>
                    <td className="text-center py-3 px-4">{sortedHoles.reduce((sum, h) => sum + h.par, 0)}</td>
                    <td className="text-center py-3 px-4 text-slate-900">{roundData.total_score}</td>
                    <td className={`text-center py-3 px-4 ${scoreColor}`}>
                      {scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar}
                    </td>
                    <td className="text-center py-3 px-4">{roundData.total_putts || '--'}</td>
                    <td className="text-center py-3 px-4">
                      {roundData.fairways_hit !== null && roundData.fairways_total
                        ? `${roundData.fairways_hit}/${roundData.fairways_total}`
                        : '--'}
                    </td>
                    <td className="text-center py-3 px-4">
                      {roundData.greens_in_regulation !== null && roundData.greens_total
                        ? `${roundData.greens_in_regulation}/${roundData.greens_total}`
                        : '--'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

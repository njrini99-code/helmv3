import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { IconArrowLeft, IconMapPin, IconCalendar, IconCheck, IconChartBar } from '@/components/icons';

interface RoundWithDetails {
  id: string;
  player_id: string;
  course_name: string;
  course_city: string | null;
  course_state: string | null;
  course_rating: number | null;
  course_slope: number | null;
  tees_played: string | null;
  round_type: string;
  round_date: string;
  total_score: number | null;
  total_to_par: number | null;
  total_putts: number | null;
  fairways_hit: number | null;
  fairways_total: number | null;
  greens_in_regulation: number | null;
  greens_total: number | null;
  total_penalties: number | null;
  is_verified: boolean;
  notes: string | null;
  // Comprehensive stats
  driving_distance_avg: number | null;
  driving_accuracy: number | null;
  putts_per_gir: number | null;
  scrambling_attempts: number | null;
  scrambles_made: number | null;
  sand_save_attempts: number | null;
  sand_saves_made: number | null;
  penalty_strokes: number | null;
  three_putts: number | null;
  birdies: number | null;
  pars: number | null;
  bogeys: number | null;
  double_bogeys_plus: number | null;
  eagles: number | null;
  longest_drive: number | null;
  longest_putt_made: number | null;
  longest_hole_out: number | null;
  player: {
    first_name: string | null;
    last_name: string | null;
    team_id: string | null;
  } | null;
  holes: Array<{
    id: string;
    hole_number: number;
    par: number;
    yardage: number | null;
    score: number;
    score_to_par: number | null;
    putts: number | null;
    fairway_hit: boolean | null;
    green_in_regulation: boolean | null;
    penalties: number | null;
    driving_distance: number | null;
    used_driver: boolean | null;
    drive_miss_direction: string | null;
    approach_distance: number | null;
    approach_lie: string | null;
    approach_proximity: number | null;
    scramble_attempt: boolean | null;
    scramble_made: boolean | null;
    sand_save_attempt: boolean | null;
    sand_save_made: boolean | null;
    first_putt_distance: number | null;
    first_putt_leave: number | null;
    holed_out_distance: number | null;
    holed_out_type: string | null;
  }>;
}

function StatBox({ label, value, subValue }: { label: string; value: string | number; subValue?: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {subValue && <p className="text-xs text-slate-400">{subValue}</p>}
    </div>
  );
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
      player:golf_players(first_name, last_name, team_id),
      holes:golf_holes(*)
    `)
    .eq('id', id)
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

  // Check if we have comprehensive stats
  const hasComprehensiveStats = roundData.driving_distance_avg !== null || 
                                 roundData.scrambles_made !== null ||
                                 roundData.longest_drive !== null;

  // Calculate scrambling %
  const scramblingPct = roundData.scrambling_attempts && roundData.scrambling_attempts > 0
    ? Math.round((roundData.scrambles_made || 0) / roundData.scrambling_attempts * 100)
    : null;

  // Calculate sand save %
  const sandSavePct = roundData.sand_save_attempts && roundData.sand_save_attempts > 0
    ? Math.round((roundData.sand_saves_made || 0) / roundData.sand_save_attempts * 100)
    : null;

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
                {hasComprehensiveStats && (
                  <span className="px-2.5 py-1 text-xs rounded-full bg-green-50 text-green-600 font-medium">
                    📊 Full Stats
                  </span>
                )}
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

          {/* Scoring Breakdown */}
          {hasComprehensiveStats && (roundData.birdies !== null || roundData.pars !== null) && (
            <div className="grid grid-cols-5 gap-4 py-4 border-t border-slate-200">
              <div className="text-center">
                <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-1">
                  <span className="text-yellow-700 font-bold text-sm">{roundData.eagles || 0}</span>
                </div>
                <p className="text-xs text-slate-500">Eagles</p>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-1">
                  <span className="text-red-600 font-bold text-sm">{roundData.birdies || 0}</span>
                </div>
                <p className="text-xs text-slate-500">Birdies</p>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-1">
                  <span className="text-slate-700 font-bold text-sm">{roundData.pars || 0}</span>
                </div>
                <p className="text-xs text-slate-500">Pars</p>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-1">
                  <span className="text-orange-600 font-bold text-sm">{roundData.bogeys || 0}</span>
                </div>
                <p className="text-xs text-slate-500">Bogeys</p>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 rounded-full bg-red-200 flex items-center justify-center mx-auto mb-1">
                  <span className="text-red-700 font-bold text-sm">{roundData.double_bogeys_plus || 0}</span>
                </div>
                <p className="text-xs text-slate-500">Double+</p>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6 border-t border-slate-200">
            <div>
              <p className="text-sm text-slate-500">Total Putts</p>
              <p className="text-2xl font-semibold text-slate-900">{roundData.total_putts || '--'}</p>
              {roundData.three_putts !== null && roundData.three_putts > 0 && (
                <p className="text-xs text-red-500">{roundData.three_putts} three-putts</p>
              )}
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

          {/* Comprehensive Stats */}
          {hasComprehensiveStats && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 pt-6 border-t border-slate-200 mt-6">
              {roundData.driving_distance_avg && (
                <StatBox 
                  label="Avg Drive" 
                  value={`${Math.round(roundData.driving_distance_avg)}`}
                  subValue="yards"
                />
              )}
              {roundData.longest_drive && (
                <StatBox 
                  label="Longest Drive" 
                  value={`${roundData.longest_drive}`}
                  subValue="yards"
                />
              )}
              {roundData.putts_per_gir && (
                <StatBox 
                  label="Putts/GIR" 
                  value={roundData.putts_per_gir.toFixed(2)}
                />
              )}
              {scramblingPct !== null && (
                <StatBox 
                  label="Scrambling" 
                  value={`${scramblingPct}%`}
                  subValue={`${roundData.scrambles_made}/${roundData.scrambling_attempts}`}
                />
              )}
              {sandSavePct !== null && (
                <StatBox 
                  label="Sand Saves" 
                  value={`${sandSavePct}%`}
                  subValue={`${roundData.sand_saves_made}/${roundData.sand_save_attempts}`}
                />
              )}
              {roundData.longest_putt_made && (
                <StatBox 
                  label="Longest Putt" 
                  value={`${roundData.longest_putt_made}'`}
                  subValue="made"
                />
              )}
            </div>
          )}

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
                  <th className="text-left py-3 px-3 font-medium text-slate-500">Hole</th>
                  <th className="text-center py-3 px-3 font-medium text-slate-500">Par</th>
                  <th className="text-center py-3 px-3 font-medium text-slate-500">Score</th>
                  <th className="text-center py-3 px-3 font-medium text-slate-500">+/-</th>
                  <th className="text-center py-3 px-3 font-medium text-slate-500">Putts</th>
                  <th className="text-center py-3 px-3 font-medium text-slate-500">FIR</th>
                  <th className="text-center py-3 px-3 font-medium text-slate-500">GIR</th>
                  {hasComprehensiveStats && (
                    <>
                      <th className="text-center py-3 px-3 font-medium text-slate-500">Drive</th>
                      <th className="text-center py-3 px-3 font-medium text-slate-500">Prox</th>
                      <th className="text-center py-3 px-3 font-medium text-slate-500">Scramble</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedHoles.map((hole) => {
                  const holeToPar = hole.score_to_par || (hole.score !== null ? hole.score - hole.par : 0);
                  const holeScoreColor = holeToPar === 0
                    ? 'text-slate-900'
                    : holeToPar < 0
                      ? 'text-green-600 font-semibold'
                      : 'text-red-600 font-semibold';

                  return (
                    <tr key={hole.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-3 font-medium text-slate-900">{hole.hole_number}</td>
                      <td className="text-center py-3 px-3 text-slate-600">{hole.par}</td>
                      <td className={`text-center py-3 px-3 ${holeScoreColor}`}>{hole.score}</td>
                      <td className={`text-center py-3 px-3 ${holeScoreColor}`}>
                        {holeToPar === 0 ? 'E' : holeToPar > 0 ? `+${holeToPar}` : holeToPar}
                      </td>
                      <td className="text-center py-3 px-3 text-slate-600">{hole.putts || '--'}</td>
                      <td className="text-center py-3 px-3">
                        {hole.fairway_hit === true ? '✓' : hole.fairway_hit === false ? '✗' : '--'}
                      </td>
                      <td className="text-center py-3 px-3">
                        {hole.green_in_regulation === true ? '✓' : hole.green_in_regulation === false ? '✗' : '--'}
                      </td>
                      {hasComprehensiveStats && (
                        <>
                          <td className="text-center py-3 px-3 text-slate-600">
                            {hole.driving_distance ? `${hole.driving_distance}y` : '--'}
                          </td>
                          <td className="text-center py-3 px-3 text-slate-600">
                            {hole.approach_proximity ? `${hole.approach_proximity}'` : '--'}
                          </td>
                          <td className="text-center py-3 px-3">
                            {hole.scramble_attempt === true 
                              ? hole.scramble_made ? '✓' : '✗'
                              : '--'}
                          </td>
                        </>
                      )}
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
                    <td className="text-center py-3 px-3">{roundData.total_putts || '--'}</td>
                    <td className="text-center py-3 px-3">
                      {roundData.fairways_hit !== null && roundData.fairways_total
                        ? `${roundData.fairways_hit}/${roundData.fairways_total}`
                        : '--'}
                    </td>
                    <td className="text-center py-3 px-3">
                      {roundData.greens_in_regulation !== null && roundData.greens_total
                        ? `${roundData.greens_in_regulation}/${roundData.greens_total}`
                        : '--'}
                    </td>
                    {hasComprehensiveStats && (
                      <>
                        <td className="text-center py-3 px-3">
                          {roundData.driving_distance_avg ? `${Math.round(roundData.driving_distance_avg)}y` : '--'}
                        </td>
                        <td className="text-center py-3 px-3">--</td>
                        <td className="text-center py-3 px-3">
                          {scramblingPct !== null ? `${scramblingPct}%` : '--'}
                        </td>
                      </>
                    )}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Records / Highlights */}
      {(roundData.longest_hole_out || roundData.longest_drive) && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Round Highlights</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {roundData.longest_drive && (
                <div className="bg-blue-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-blue-600 font-medium mb-1">Longest Drive</p>
                  <p className="text-2xl font-bold text-blue-700">{roundData.longest_drive} yds</p>
                </div>
              )}
              {roundData.longest_putt_made && (
                <div className="bg-green-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-green-600 font-medium mb-1">Longest Putt Made</p>
                  <p className="text-2xl font-bold text-green-700">{roundData.longest_putt_made} ft</p>
                </div>
              )}
              {roundData.longest_hole_out && (
                <div className="bg-yellow-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-yellow-700 font-medium mb-1">Longest Hole Out</p>
                  <p className="text-2xl font-bold text-yellow-800">{roundData.longest_hole_out} yds</p>
                </div>
              )}
              {roundData.eagles && roundData.eagles > 0 && (
                <div className="bg-purple-50 rounded-xl p-4 text-center">
                  <p className="text-sm text-purple-600 font-medium mb-1">Eagles</p>
                  <p className="text-2xl font-bold text-purple-700">{roundData.eagles}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

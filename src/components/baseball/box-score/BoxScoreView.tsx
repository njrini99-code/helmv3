'use client';

import type { BaseballGame, BaseballBoxScoreBatting, BaseballBoxScorePitching } from '@/lib/types';
import { IconCalendar, IconMapPin } from '@/components/icons';

interface BoxScoreViewProps {
  game: BaseballGame;
  batting: BaseballBoxScoreBatting[];
  pitching: BaseballBoxScorePitching[];
}

function fmtStat(val: number | null | undefined, decimals = 0) {
  if (val == null) return '—';
  return decimals > 0 ? val.toFixed(decimals) : String(val);
}

function fmtAvg(val: number | null | undefined) {
  if (val == null) return '—';
  return val.toFixed(3).replace(/^0/, '');
}

function fmtIP(val: number | null | undefined) {
  if (val == null) return '—';
  return val.toFixed(1);
}

export function BoxScoreView({ game, batting, pitching }: BoxScoreViewProps) {
  const gameDate = new Date(game.game_date + 'T00:00:00');
  const formattedDate = gameDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const won = game.our_score != null && game.opponent_score != null && game.our_score > game.opponent_score;
  const lost = game.our_score != null && game.opponent_score != null && game.our_score < game.opponent_score;
  const resultLabel = won ? 'W' : lost ? 'L' : 'T';
  const resultColor = won ? 'text-primary-700 bg-primary-50' : lost ? 'text-red-700 bg-red-50' : 'text-amber-700 bg-amber-50';

  // Batting totals
  const totals = batting.reduce(
    (acc, r) => ({
      ab: acc.ab + r.ab,
      r: acc.r + r.r,
      h: acc.h + r.h,
      doubles: acc.doubles + r.doubles,
      triples: acc.triples + r.triples,
      hr: acc.hr + r.hr,
      rbi: acc.rbi + r.rbi,
      bb: acc.bb + r.bb,
      k: acc.k + r.k,
      sb: acc.sb + r.sb,
    }),
    { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0 }
  );

  const teamAvg = totals.ab > 0 ? (totals.h / totals.ab).toFixed(3).replace(/^0/, '') : '—';

  // Pitching totals
  const pitchTotals = pitching.reduce(
    (acc, r) => ({
      ip: acc.ip + r.ip,
      h: acc.h + r.h,
      r: acc.r + r.r,
      er: acc.er + r.er,
      bb: acc.bb + r.bb,
      k: acc.k + r.k,
      hr: acc.hr + r.hr,
    }),
    { ip: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0 }
  );

  const teamERA = pitchTotals.ip > 0 ? (9 * pitchTotals.er / pitchTotals.ip).toFixed(2) : '—';
  const teamWHIP = pitchTotals.ip > 0 ? ((pitchTotals.bb + pitchTotals.h) / pitchTotals.ip).toFixed(3) : '—';

  return (
    <div className="space-y-5">
      {/* Game header */}
      <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide ${
                  game.game_type === 'scrimmage' ? 'bg-purple-100 text-purple-700' : 'bg-primary-100 text-primary-700'
                }`}
              >
                {game.game_type === 'scrimmage' ? 'Scrimmage' : 'Game'}
              </span>
              {game.home_away && (
                <span className="text-xs text-warm-400 uppercase tracking-wide font-medium">
                  {game.home_away}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-warm-900">
              vs {game.opponent_name ?? 'Unknown Opponent'}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 text-sm text-warm-500">
              <span className="flex items-center gap-1">
                <IconCalendar size={14} />
                {formattedDate}
              </span>
              {game.location && (
                <span className="flex items-center gap-1">
                  <IconMapPin size={14} />
                  {game.location}
                </span>
              )}
            </div>
          </div>

          {/* Final score */}
          {game.our_score != null && game.opponent_score != null && (
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-lg text-lg font-black ${resultColor}`}>
                {resultLabel}
              </span>
              <div className="text-center">
                <p className="text-xs text-warm-400 font-medium">FINAL</p>
                <p className="text-4xl font-black text-warm-900 tabular-nums leading-none">
                  {game.our_score} – {game.opponent_score}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Batting */}
      {batting.length > 0 && (
        <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-clip">
          <div className="px-5 py-3 border-b border-warm-100">
            <h2 className="text-sm font-bold text-warm-700 uppercase tracking-wider">Batting</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warm-100 bg-warm-50/60">
                  <th className="text-left px-4 py-2.5 font-semibold text-warm-500 sticky left-0 bg-warm-50/80 min-w-[140px]">Player</th>
                  {['AB','R','H','2B','3B','HR','RBI','BB','K','SB','HBP'].map((h) => (
                    <th key={h} className="text-center px-2 py-2.5 font-semibold text-warm-500 min-w-[36px]">{h}</th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[48px]">AVG</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[48px]">OBP</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[48px]">SLG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {batting.map((row) => (
                  <tr key={row.id} className="hover:bg-warm-50/40 transition-colors">
                    <td className="px-4 py-2.5 sticky left-0 bg-cream-50/92 font-medium text-warm-800">
                      {row.player ? (
                        <span>
                          {row.player.first_name?.[0]}. {row.player.last_name}
                          {row.player.primary_position && (
                            <span className="ml-1 text-eyebrow text-warm-400">{row.player.primary_position}</span>
                          )}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.ab)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.r)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums font-semibold">{fmtStat(row.h)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.doubles)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.triples)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.hr)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.rbi)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.bb)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.k)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.sb)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.hbp)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-warm-700">{fmtAvg(row.avg)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-warm-500">{fmtAvg(row.obp)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-warm-500">{fmtAvg(row.slg)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-warm-200 bg-warm-50/80 font-semibold text-warm-700">
                  <td className="px-4 py-2.5 sticky left-0 bg-warm-50/90 text-xs font-bold uppercase tracking-wide">TOTALS</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.ab}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.r}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums font-bold">{totals.h}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.doubles}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.triples}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.hr}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.rbi}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.bb}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.k}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{totals.sb}</td>
                  <td colSpan={1} />
                  <td className="px-3 py-2.5 text-center font-mono font-bold">{teamAvg}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Pitching */}
      {pitching.length > 0 && (
        <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-clip">
          <div className="px-5 py-3 border-b border-warm-100">
            <h2 className="text-sm font-bold text-warm-700 uppercase tracking-wider">Pitching</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warm-100 bg-warm-50/60">
                  <th className="text-left px-4 py-2.5 font-semibold text-warm-500 sticky left-0 bg-warm-50/80 min-w-[140px]">Pitcher</th>
                  {['IP','H','R','ER','BB','K','HR','PC'].map((h) => (
                    <th key={h} className="text-center px-2 py-2.5 font-semibold text-warm-500 min-w-[40px]">{h}</th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[52px]">ERA</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[52px]">WHIP</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[40px]">Dec</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {pitching.map((row) => (
                  <tr key={row.id} className="hover:bg-warm-50/40 transition-colors">
                    <td className="px-4 py-2.5 sticky left-0 bg-cream-50/92 font-medium text-warm-800">
                      {row.player ? `${row.player.first_name?.[0]}. ${row.player.last_name}` : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums">{fmtIP(row.ip)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.h)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.r)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.er)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.bb)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums font-semibold">{fmtStat(row.k)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{fmtStat(row.hr)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-warm-500">{fmtStat(row.pitch_count)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-warm-700">{fmtStat(row.era, 2)}</td>
                    <td className="px-3 py-2.5 text-center font-mono text-warm-500">{fmtStat(row.whip, 3)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {row.result && (
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold text-eyebrow ${
                            row.result === 'W' ? 'bg-primary-100 text-primary-700' :
                            row.result === 'L' ? 'bg-red-100 text-red-700' :
                            row.result === 'S' ? 'bg-blue-100 text-blue-700' :
                            'bg-warm-100 text-warm-500'
                          }`}
                        >
                          {row.result}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {pitching.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-warm-200 bg-warm-50/80 font-semibold text-warm-700">
                    <td className="px-4 py-2.5 sticky left-0 bg-warm-50/90 text-xs font-bold uppercase tracking-wide">TOTALS</td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums">{fmtIP(pitchTotals.ip)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchTotals.h}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchTotals.r}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchTotals.er}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchTotals.bb}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums font-bold">{pitchTotals.k}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchTotals.hr}</td>
                    <td colSpan={1} />
                    <td className="px-3 py-2.5 text-center font-mono font-bold">{teamERA}</td>
                    <td className="px-3 py-2.5 text-center font-mono">{teamWHIP}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Empty states */}
      {batting.length === 0 && pitching.length === 0 && (
        <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-10 text-center">
          <p className="text-warm-400 text-sm">No stats recorded for this game yet.</p>
        </div>
      )}
    </div>
  );
}

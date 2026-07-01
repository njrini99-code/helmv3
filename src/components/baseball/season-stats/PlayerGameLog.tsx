'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BaseballBoxScoreBatting, BaseballBoxScorePitching, BaseballGame } from '@/lib/types';
import { IconCalendar } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { sumInningsPitched, ipToInnings } from '@/lib/baseball/innings';

type BattingWithGame = BaseballBoxScoreBatting & { game: Partial<BaseballGame> };
type PitchingWithGame = BaseballBoxScorePitching & { game: Partial<BaseballGame> };

interface PlayerGameLogProps {
  batting: BattingWithGame[];
  pitching: PitchingWithGame[];
}

type LogTab = 'batting' | 'pitching';
type GameTypeFilter = 'all' | 'game' | 'scrimmage';

function fmtDate(dateStr: string | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
}

function fmtAvg(h: number, ab: number) {
  if (ab === 0) return '—';
  return (h / ab).toFixed(3).replace(/^0/, '');
}

function fmtERA(er: number, ip: number) {
  if (ip === 0) return '—';
  return (9 * er / ip).toFixed(2);
}

function fmtIP(ip: number) {
  return ip.toFixed(1);
}

export function PlayerGameLog({ batting, pitching }: PlayerGameLogProps) {
  const [activeTab, setActiveTab] = useState<LogTab>(batting.length > 0 ? 'batting' : 'pitching');
  const [gameTypeFilter, setGameTypeFilter] = useState<GameTypeFilter>('all');

  const filteredBatting = batting.filter(
    (b) => gameTypeFilter === 'all' || b.game?.game_type === gameTypeFilter
  );
  const filteredPitching = pitching.filter(
    (p) => gameTypeFilter === 'all' || p.game?.game_type === gameTypeFilter
  );

  // Running batting totals
  const battingTotals = filteredBatting.reduce(
    (acc, r) => ({
      ab: acc.ab + r.ab, r: acc.r + r.r, h: acc.h + r.h,
      doubles: acc.doubles + r.doubles, triples: acc.triples + r.triples,
      hr: acc.hr + r.hr, rbi: acc.rbi + r.rbi, bb: acc.bb + r.bb, k: acc.k + r.k,
    }),
    { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, k: 0 }
  );

  // Running pitching totals — .1/.2 are outs, so sum IP via outs (6.1 + 6.2 → 13.0). (#434)
  const pitchingTotals = filteredPitching.reduce(
    (acc, r) => ({
      ip: sumInningsPitched([acc.ip, r.ip]), h: acc.h + r.h, r: acc.r + r.r, er: acc.er + r.er,
      bb: acc.bb + r.bb, k: acc.k + r.k, hr: acc.hr + r.hr,
    }),
    { ip: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0 }
  );
  // Rates divide by TRUE innings (outs / 3), not the notation value. (#434)
  const pitchingInnings = ipToInnings(pitchingTotals.ip);

  const hasBatting = batting.length > 0;
  const hasPitching = pitching.length > 0;

  if (!hasBatting && !hasPitching) {
    return (
      <div className="glass-standard rounded-2xl p-8 text-center">
        <p className="text-sm leading-relaxed text-warm-500 max-w-sm mx-auto">No game log yet. Stats will appear here after box scores are entered.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 p-1 bg-warm-100 rounded-xl">
          {hasBatting && (
            <Button variant="ghost"
              onClick={() => setActiveTab('batting')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'batting' ? 'bg-white text-warm-900 shadow-sm' : 'text-warm-500'
              }`}
            >
              Batting
            </Button>
          )}
          {hasPitching && (
            <Button variant="ghost"
              onClick={() => setActiveTab('pitching')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'pitching' ? 'bg-white text-warm-900 shadow-sm' : 'text-warm-500'
              }`}
            >
              Pitching
            </Button>
          )}
        </div>

        <div className="flex gap-1 p-1 bg-warm-100 rounded-xl">
          {(['all', 'game', 'scrimmage'] as GameTypeFilter[]).map((f) => (
            <Button variant="ghost"
              key={f}
              onClick={() => setGameTypeFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-all capitalize ${
                gameTypeFilter === f ? 'bg-white text-warm-800 shadow-sm' : 'text-warm-400'
              }`}
            >
              {f === 'all' ? 'All' : f === 'scrimmage' ? 'Scrimmages' : 'Games'}
            </Button>
          ))}
        </div>
      </div>

      {/* Batting log */}
      {activeTab === 'batting' && (
        <div className="glass-standard rounded-2xl overflow-clip">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warm-100 bg-warm-50/80">
                  <th className="text-left px-4 py-2.5 font-semibold text-warm-500 sticky left-0 bg-warm-50/80 min-w-[110px]">Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-warm-500 min-w-[100px]">Opponent</th>
                  <th className="text-center px-2 py-2.5 font-semibold text-warm-400 min-w-[36px]">Type</th>
                  {['AB','R','H','2B','3B','HR','RBI','BB','K','SB','HBP'].map((h) => (
                    <th key={h} className="text-center px-2 py-2.5 font-semibold text-warm-500 min-w-[32px]">{h}</th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[44px]">AVG</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[44px]">OPS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {filteredBatting.length === 0 ? (
                  <tr>
                    <td colSpan={18} className="px-4 py-6 text-center text-warm-400">No batting stats</td>
                  </tr>
                ) : filteredBatting.map((row) => {
                  const singles = row.h - row.doubles - row.triples - row.hr;
                  const slg = row.ab > 0 ? ((singles + 2 * row.doubles + 3 * row.triples + 4 * row.hr) / row.ab) : null;
                  const pa = row.ab + row.bb + row.hbp + row.sf;
                  const obp = pa > 0 ? (row.h + row.bb + row.hbp) / pa : null;
                  const ops = slg != null && obp != null ? (obp + slg).toFixed(3) : '—';

                  return (
                    <tr key={row.id} className="hover:bg-warm-50/40 transition-colors">
                      <td className="px-4 py-2 sticky left-0 bg-cream-50/92">
                        <div className="flex items-center gap-1.5">
                          <IconCalendar size={11} className="text-warm-300 shrink-0" />
                          <span className="text-warm-600">{fmtDate(row.game?.game_date)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-warm-600 truncate max-w-[100px]">
                        {row.game?.id ? (
                          <Link href={`/baseball/dashboard/stats/games/${row.game.id}`} className="hover:text-primary-600 transition-colors">
                            {row.game?.opponent_name ?? 'Unknown'}
                          </Link>
                        ) : (row.game?.opponent_name ?? 'Unknown')}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={`text-eyebrow font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          row.game?.game_type === 'scrimmage' ? 'text-purple-600 bg-purple-50' : 'text-primary-600 bg-primary-50'
                        }`}>
                          {row.game?.game_type === 'scrimmage' ? 'SCR' : 'GM'}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.ab}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.r}</td>
                      <td className="px-2 py-2 text-center tabular-nums font-semibold">{row.h}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.doubles}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.triples}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.hr}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.rbi}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.bb}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.k}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.sb}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{row.hbp}</td>
                      <td className="px-3 py-2 text-center font-mono">
                        <span className={row.h >= 2 ? 'text-primary-700 font-semibold' : 'text-warm-600'}>
                          {fmtAvg(row.h, row.ab)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-warm-500">{ops}</td>
                    </tr>
                  );
                })}
              </tbody>
              {filteredBatting.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-warm-200 bg-warm-50/80 font-semibold text-warm-700">
                    <td colSpan={3} className="px-4 py-2.5 sticky left-0 bg-warm-50/90 text-xs font-bold uppercase tracking-wide">TOTALS</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.ab}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.r}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums font-bold">{battingTotals.h}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.doubles}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.triples}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.hr}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.rbi}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.bb}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.k}</td>
                    <td colSpan={3} />
                    <td className="px-3 py-2.5 text-center font-mono font-bold">
                      {fmtAvg(battingTotals.h, battingTotals.ab)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Pitching log */}
      {activeTab === 'pitching' && (
        <div className="glass-standard rounded-2xl overflow-clip">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warm-100 bg-warm-50/80">
                  <th className="text-left px-4 py-2.5 font-semibold text-warm-500 sticky left-0 bg-warm-50/80 min-w-[110px]">Date</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-warm-500 min-w-[100px]">Opponent</th>
                  <th className="text-center px-2 py-2.5 font-semibold text-warm-400 min-w-[36px]">Type</th>
                  {['IP','H','R','ER','BB','K','HR','PC'].map((h) => (
                    <th key={h} className="text-center px-2 py-2.5 font-semibold text-warm-500 min-w-[32px]">{h}</th>
                  ))}
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[44px]">ERA</th>
                  <th className="text-center px-3 py-2.5 font-semibold text-warm-400 min-w-[44px]">WHIP</th>
                  <th className="text-center px-2 py-2.5 font-semibold text-warm-400 min-w-[36px]">Dec</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {filteredPitching.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="px-4 py-6 text-center text-warm-400">No pitching stats</td>
                  </tr>
                ) : filteredPitching.map((row) => (
                  <tr key={row.id} className="hover:bg-warm-50/40 transition-colors">
                    <td className="px-4 py-2 sticky left-0 bg-cream-50/92">
                      <div className="flex items-center gap-1.5">
                        <IconCalendar size={11} className="text-warm-300 shrink-0" />
                        <span className="text-warm-600">{fmtDate(row.game?.game_date)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-warm-600 truncate max-w-[100px]">
                      {row.game?.id ? (
                        <Link href={`/baseball/dashboard/stats/games/${row.game.id}`} className="hover:text-primary-600 transition-colors">
                          {row.game?.opponent_name ?? 'Unknown'}
                        </Link>
                      ) : (row.game?.opponent_name ?? 'Unknown')}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`text-eyebrow font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        row.game?.game_type === 'scrimmage' ? 'text-purple-600 bg-purple-50' : 'text-primary-600 bg-primary-50'
                      }`}>
                        {row.game?.game_type === 'scrimmage' ? 'SCR' : 'GM'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center font-mono tabular-nums">{fmtIP(row.ip)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{row.h}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{row.r}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{row.er}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{row.bb}</td>
                    <td className="px-2 py-2 text-center tabular-nums font-semibold">{row.k}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{row.hr}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-warm-400">{row.pitch_count ?? '—'}</td>
                    <td className="px-3 py-2 text-center font-mono text-warm-700">{fmtERA(row.er, row.ip)}</td>
                    <td className="px-3 py-2 text-center font-mono text-warm-500">
                      {row.ip > 0 ? ((row.h + row.bb) / row.ip).toFixed(3) : '—'}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {row.result && (
                        <span className={`px-1.5 py-0.5 rounded text-eyebrow font-bold ${
                          row.result === 'W' ? 'bg-primary-100 text-primary-700' :
                          row.result === 'L' ? 'bg-red-100 text-red-700' :
                          row.result === 'S' ? 'bg-blue-100 text-blue-700' :
                          'bg-warm-100 text-warm-500'
                        }`}>
                          {row.result}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteredPitching.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-warm-200 bg-warm-50/80 font-semibold text-warm-700">
                    <td colSpan={3} className="px-4 py-2.5 sticky left-0 bg-warm-50/90 text-xs font-bold uppercase tracking-wide">TOTALS</td>
                    <td className="px-2 py-2.5 text-center font-mono tabular-nums">{fmtIP(pitchingTotals.ip)}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchingTotals.h}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchingTotals.r}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchingTotals.er}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{pitchingTotals.bb}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums font-bold">{pitchingTotals.k}</td>
                    <td colSpan={2} />
                    <td className="px-3 py-2.5 text-center font-mono font-bold">
                      {fmtERA(pitchingTotals.er, pitchingInnings)}
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono">
                      {pitchingInnings > 0 ? ((pitchingTotals.h + pitchingTotals.bb) / pitchingInnings).toFixed(3) : '—'}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

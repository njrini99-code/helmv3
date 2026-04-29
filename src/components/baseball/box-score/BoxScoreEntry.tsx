'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { saveFullBoxScore } from '@/app/baseball/actions/games';
import type {
  BaseballGame,
  BoxScoreBattingInput,
  BoxScorePitchingInput,
  BaseballPitchingResult,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { IconSave, IconUser, IconTrendingUp } from '@/components/icons';

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  jersey_number: string | null;
}

interface BoxScoreEntryProps {
  game: BaseballGame;
  teamPlayers: PlayerRow[];
  initialBatting?: BoxScoreBattingInput[];
  initialPitching?: BoxScorePitchingInput[];
}

const DEFAULT_BATTING = (playerId: string): BoxScoreBattingInput => ({
  player_id: playerId,
  ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0,
  rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, hbp: 0, sac: 0, sf: 0, lob: 0,
});

const DEFAULT_PITCHING = (playerId: string): BoxScorePitchingInput => ({
  player_id: playerId,
  ip: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0,
});

function calcAvg(h: number, ab: number) {
  if (ab === 0) return '---';
  return (h / ab).toFixed(3).replace(/^0/, '');
}

function calcOPS(b: BoxScoreBattingInput) {
  const { ab, h, doubles, triples, hr, bb, hbp, sf } = b;
  if (ab === 0) return '---';
  const singles = h - doubles - triples - hr;
  const slg = (singles + 2 * doubles + 3 * triples + 4 * hr) / ab;
  const pa = ab + bb + hbp + sf;
  const obp = pa > 0 ? (h + bb + hbp) / pa : 0;
  return (obp + slg).toFixed(3);
}

function calcERA(er: number, ip: number) {
  if (ip === 0) return '---';
  return (9 * er / ip).toFixed(2);
}

function calcWHIP(h: number, bb: number, ip: number) {
  if (ip === 0) return '---';
  return ((h + bb) / ip).toFixed(3);
}

const PITCHING_RESULTS: BaseballPitchingResult[] = ['W', 'L', 'S', 'H', 'BS', 'ND'];

type ActiveTab = 'batting' | 'pitching';

export function BoxScoreEntry({ game, teamPlayers, initialBatting, initialPitching }: BoxScoreEntryProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>('batting');
  const [ourScore, setOurScore] = useState(game.our_score ?? 0);
  const [oppScore, setOppScore] = useState(game.opponent_score ?? 0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialize batting rows — one per player
  const [battingRows, setBattingRows] = useState<BoxScoreBattingInput[]>(() => {
    if (initialBatting && initialBatting.length > 0) return initialBatting;
    return teamPlayers.map((p) => DEFAULT_BATTING(p.id));
  });

  // Initialize pitching rows — start empty, coaches add pitchers
  const [pitchingRows, setPitchingRows] = useState<BoxScorePitchingInput[]>(() => {
    if (initialPitching && initialPitching.length > 0) return initialPitching;
    return [];
  });

  const [selectedPitcherId, setSelectedPitcherId] = useState('');

  const updateBatting = useCallback(
    (playerId: string, field: keyof BoxScoreBattingInput, value: number) => {
      setBattingRows((prev) =>
        prev.map((r) => (r.player_id === playerId ? { ...r, [field]: value } : r))
      );
    },
    []
  );

  const updatePitching = useCallback(
    (playerId: string, field: keyof BoxScorePitchingInput, value: number | string) => {
      setPitchingRows((prev) =>
        prev.map((r) => (r.player_id === playerId ? { ...r, [field]: value } : r))
      );
    },
    []
  );

  function addPitcher() {
    if (!selectedPitcherId) return;
    if (pitchingRows.some((r) => r.player_id === selectedPitcherId)) return;
    setPitchingRows((prev) => [...prev, DEFAULT_PITCHING(selectedPitcherId)]);
    setSelectedPitcherId('');
  }

  function removePitcher(playerId: string) {
    setPitchingRows((prev) => prev.filter((r) => r.player_id !== playerId));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    const nonZeroBatting = battingRows.filter(
      (r) => r.ab > 0 || r.h > 0 || r.bb > 0 || r.r > 0
    );

    const result = await saveFullBoxScore(
      game.id,
      nonZeroBatting,
      pitchingRows,
      ourScore,
      oppScore
    );

    if (result.success) {
      router.push(`/baseball/dashboard/stats/games/${game.id}`);
      router.refresh();
    } else {
      setSaveError(result.error ?? 'Failed to save box score');
      setSaving(false);
    }
  }

  const playerMap = new Map(teamPlayers.map((p) => [p.id, p]));

  // Batting totals
  const battingTotals = battingRows.reduce(
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

  return (
    <div className="space-y-5">
      {/* Game header / score input */}
      <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {game.game_type === 'scrimmage' ? 'Scrimmage' : 'Game'} vs{' '}
              {game.opponent_name ?? 'TBD'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {new Date(game.game_date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
              {game.location && ` · ${game.location}`}
            </p>
          </div>

          {/* Score inputs */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">Us</p>
              <input
                type="number"
                min={0}
                max={99}
                value={ourScore}
                onChange={(e) => setOurScore(Number(e.target.value))}
                className="w-16 text-center text-2xl font-bold text-slate-900 border border-slate-200 rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-cream-100/82"
              />
            </div>
            <span className="text-2xl font-bold text-slate-300 mt-4">—</span>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wide">
                {game.opponent_name ?? 'Them'}
              </p>
              <input
                type="number"
                min={0}
                max={99}
                value={oppScore}
                onChange={(e) => setOppScore(Number(e.target.value))}
                className="w-16 text-center text-2xl font-bold text-slate-900 border border-slate-200 rounded-xl p-2 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-cream-100/82"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('batting')}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'batting' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <IconUser size={14} />
          Batting
        </button>
        <button
          onClick={() => setActiveTab('pitching')}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'pitching' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <IconTrendingUp size={14} />
          Pitching
        </button>
      </div>

      {/* Batting table */}
      {activeTab === 'batting' && (
        <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-clip">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="text-left px-4 py-3 font-semibold text-slate-500 sticky left-0 bg-slate-50/80 min-w-[140px]">Player</th>
                  {['AB','R','H','2B','3B','HR','RBI','BB','K','SB','CS','HBP','SAC','SF','LOB'].map((h) => (
                    <th key={h} className="text-center px-2 py-3 font-semibold text-slate-500 min-w-[44px]">{h}</th>
                  ))}
                  <th className="text-center px-2 py-3 font-semibold text-slate-400 min-w-[52px]">AVG</th>
                  <th className="text-center px-2 py-3 font-semibold text-slate-400 min-w-[52px]">OPS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {battingRows.map((row) => {
                  const player = playerMap.get(row.player_id);
                  return (
                    <tr key={row.player_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-2 sticky left-0 bg-cream-50/92 font-medium text-slate-800">
                        {player ? (
                          <span>
                            {player.first_name?.[0]}. {player.last_name}
                            {player.primary_position && (
                              <span className="ml-1 text-slate-400 font-normal">{player.primary_position}</span>
                            )}
                          </span>
                        ) : 'Unknown'}
                      </td>
                      {(
                        ['ab','r','h','doubles','triples','hr','rbi','bb','k','sb','cs','hbp','sac','sf','lob'] as (keyof BoxScoreBattingInput)[]
                      ).map((field) => (
                        <td key={field} className="px-1 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={row[field] as number}
                            onChange={(e) => updateBatting(row.player_id, field, Number(e.target.value))}
                            className="w-10 text-center text-xs font-medium text-slate-900 border border-slate-100 rounded-md p-1 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-300 bg-white hover:border-slate-200 transition-colors tabular-nums"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center text-slate-400 font-mono tabular-nums">
                        {calcAvg(row.h, row.ab)}
                      </td>
                      <td className="px-2 py-2 text-center text-slate-400 font-mono tabular-nums">
                        {calcOPS(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-semibold text-slate-700">
                  <td className="px-4 py-2.5 sticky left-0 bg-slate-50/90 text-sm">TOTALS</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.ab}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.r}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.h}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.doubles}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.triples}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.hr}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.rbi}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.bb}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.k}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums">{battingTotals.sb}</td>
                  <td colSpan={5} />
                  <td className="px-2 py-2.5 text-center text-slate-500 font-mono">
                    {calcAvg(battingTotals.h, battingTotals.ab)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Pitching table */}
      {activeTab === 'pitching' && (
        <div className="space-y-4">
          {/* Add pitcher row */}
          <div className="flex items-center gap-3">
            <select
              value={selectedPitcherId}
              onChange={(e) => setSelectedPitcherId(e.target.value)}
              className="flex-1 max-w-xs text-sm border border-slate-200 rounded-lg px-3 py-2 bg-cream-100/75 text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select pitcher to add...</option>
              {teamPlayers
                .filter((p) => !pitchingRows.some((r) => r.player_id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.first_name} {p.last_name}
                    {p.primary_position ? ` (${p.primary_position})` : ''}
                  </option>
                ))}
            </select>
            <Button
              onClick={addPitcher}
              disabled={!selectedPitcherId}
              size="sm"
              className="bg-primary-600 hover:bg-primary-700 text-white"
            >
              Add Pitcher
            </Button>
          </div>

          {pitchingRows.length === 0 ? (
            <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl p-8 text-center">
              <p className="text-sm text-slate-400">
                Add pitchers using the selector above.
              </p>
            </div>
          ) : (
            <div className="bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-clip">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 sticky left-0 bg-slate-50/80 min-w-[140px]">Pitcher</th>
                      {['IP','H','R','ER','BB','K','HR','PC','Result'].map((h) => (
                        <th key={h} className="text-center px-2 py-3 font-semibold text-slate-500 min-w-[52px]">{h}</th>
                      ))}
                      <th className="text-center px-2 py-3 font-semibold text-slate-400 min-w-[52px]">ERA</th>
                      <th className="text-center px-2 py-3 font-semibold text-slate-400 min-w-[52px]">WHIP</th>
                      <th className="px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {pitchingRows.map((row) => {
                      const player = playerMap.get(row.player_id);
                      return (
                        <tr key={row.player_id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-2 sticky left-0 bg-cream-50/92 font-medium text-slate-800">
                            {player ? `${player.first_name?.[0]}. ${player.last_name}` : 'Unknown'}
                          </td>
                          {(
                            ['ip','h','r','er','bb','k','hr'] as (keyof BoxScorePitchingInput)[]
                          ).map((field) => (
                            <td key={field} className="px-1 py-1.5 text-center">
                              <input
                                type="number"
                                min={0}
                                max={field === 'ip' ? 9.2 : 99}
                                step={field === 'ip' ? 0.1 : 1}
                                value={row[field] as number}
                                onChange={(e) =>
                                  updatePitching(row.player_id, field, Number(e.target.value))
                                }
                                className="w-12 text-center text-xs font-medium text-slate-900 border border-slate-100 rounded-md p-1 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-300 bg-white hover:border-slate-200 transition-colors tabular-nums"
                              />
                            </td>
                          ))}
                          {/* Pitch count */}
                          <td className="px-1 py-1.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={200}
                              value={row.pitch_count ?? 0}
                              onChange={(e) =>
                                updatePitching(row.player_id, 'pitch_count', Number(e.target.value))
                              }
                              className="w-14 text-center text-xs font-medium text-slate-900 border border-slate-100 rounded-md p-1 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white transition-colors tabular-nums"
                            />
                          </td>
                          {/* Result */}
                          <td className="px-1 py-1.5 text-center">
                            <select
                              value={row.result ?? ''}
                              onChange={(e) =>
                                updatePitching(
                                  row.player_id,
                                  'result',
                                  e.target.value as BaseballPitchingResult
                                )
                              }
                              className="w-14 text-center text-xs font-medium text-slate-900 border border-slate-100 rounded-md p-1 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white"
                            >
                              <option value="">—</option>
                              {PITCHING_RESULTS.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2 text-center text-slate-400 font-mono tabular-nums">
                            {calcERA(row.er, row.ip)}
                          </td>
                          <td className="px-2 py-2 text-center text-slate-400 font-mono tabular-nums">
                            {calcWHIP(row.h, row.bb, row.ip)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => removePitcher(row.player_id)}
                              className="text-slate-300 hover:text-red-400 transition-colors text-lg leading-none"
                              title="Remove"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {pitchingRows.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-semibold text-slate-700">
                        <td className="px-4 py-2.5 sticky left-0 bg-slate-50/90 text-sm">TOTALS</td>
                        <td className="px-2 py-2.5 text-center tabular-nums font-mono">
                          {pitchingRows.reduce((s, r) => s + r.ip, 0).toFixed(1)}
                        </td>
                        <td className="px-2 py-2.5 text-center tabular-nums">{pitchingRows.reduce((s, r) => s + r.h, 0)}</td>
                        <td className="px-2 py-2.5 text-center tabular-nums">{pitchingRows.reduce((s, r) => s + r.r, 0)}</td>
                        <td className="px-2 py-2.5 text-center tabular-nums">{pitchingRows.reduce((s, r) => s + r.er, 0)}</td>
                        <td className="px-2 py-2.5 text-center tabular-nums">{pitchingRows.reduce((s, r) => s + r.bb, 0)}</td>
                        <td className="px-2 py-2.5 text-center tabular-nums">{pitchingRows.reduce((s, r) => s + r.k, 0)}</td>
                        <td colSpan={5} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save button */}
      {saveError && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-600">
          {saveError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Saving will mark this game as completed and auto-calculate season stats.
        </p>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary-600 hover:bg-primary-700 text-white px-6"
        >
          <IconSave size={16} className="mr-2" />
          {saving ? 'Saving…' : 'Save Box Score & Complete'}
        </Button>
      </div>
    </div>
  );
}

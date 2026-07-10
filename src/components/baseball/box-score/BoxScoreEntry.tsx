'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveFullBoxScore } from '@/app/baseball/actions/games';
import type {
  BaseballGame,
  BoxScoreBattingInput,
  BoxScorePitchingInput,
  BaseballPitchingResult,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { IconSave, IconUser, IconTrendingUp, IconX } from '@/components/icons';
import { sumInningsPitched } from '@/lib/baseball/innings';
import { formatAvg, formatOps, formatEra, formatWhip } from './format-stat';
import { PaperCard, EditorsLetter } from '@/components/baseball/living-annual';

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
  return formatAvg(ab === 0 ? null : h / ab);
}

function calcOPS(b: BoxScoreBattingInput) {
  const { ab, h, doubles, triples, hr, bb, hbp, sf } = b;
  if (ab === 0) return formatOps(null);
  const singles = h - doubles - triples - hr;
  const slg = (singles + 2 * doubles + 3 * triples + 4 * hr) / ab;
  const pa = ab + bb + hbp + sf;
  const obp = pa > 0 ? (h + bb + hbp) / pa : 0;
  return formatOps(obp + slg);
}

function calcERA(er: number, ip: number) {
  return formatEra(ip === 0 ? null : (9 * er) / ip);
}

function calcWHIP(h: number, bb: number, ip: number) {
  return formatWhip(ip === 0 ? null : (h + bb) / ip);
}

const PITCHING_RESULTS: BaseballPitchingResult[] = ['W', 'L', 'S', 'H', 'BS', 'ND'];

type ActiveTab = 'batting' | 'pitching';

// Human-readable stat names for the per-row input aria-labels below — every
// box-score cell is a bare number-only <Input> with no visible label, so a
// screen reader announcing just "spinbutton, 0" gives no idea which stat or
// player it belongs to (#a11y-sweep P1). Composed as "{player} {stat}", e.g.
// "Marcus Rivera at-bats".
const BATTING_FIELD_LABELS: Record<
  keyof Pick<
    BoxScoreBattingInput,
    'ab' | 'r' | 'h' | 'doubles' | 'triples' | 'hr' | 'rbi' | 'bb' | 'k' | 'sb' | 'cs' | 'hbp' | 'sac' | 'sf' | 'lob'
  >,
  string
> = {
  ab: 'at-bats',
  r: 'runs',
  h: 'hits',
  doubles: 'doubles',
  triples: 'triples',
  hr: 'home runs',
  rbi: 'RBIs',
  bb: 'walks',
  k: 'strikeouts',
  sb: 'stolen bases',
  cs: 'caught stealing',
  hbp: 'hit by pitch',
  sac: 'sacrifice bunts',
  sf: 'sacrifice flies',
  lob: 'left on base',
};

const PITCHING_FIELD_LABELS: Record<
  keyof Pick<BoxScorePitchingInput, 'ip' | 'h' | 'r' | 'er' | 'bb' | 'k' | 'hr'>,
  string
> = {
  ip: 'innings pitched',
  h: 'hits allowed',
  r: 'runs allowed',
  er: 'earned runs',
  bb: 'walks allowed',
  k: 'strikeouts',
  hr: 'home runs allowed',
};

function playerFullName(player: PlayerRow | undefined): string {
  if (!player) return 'Unknown player';
  return [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Unknown player';
}

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

  // Re-sync local editing state whenever the persisted data changes
  // underneath us (e.g. router.refresh() after a save re-fetches the
  // server component and passes new props into this already-mounted
  // client component — the lazy useState seed above only runs once, so
  // without this effect the form keeps showing stale/pre-save values
  // and "Saving…" can appear stuck).
  useEffect(() => {
    setBattingRows(
      initialBatting && initialBatting.length > 0
        ? initialBatting
        : teamPlayers.map((p) => DEFAULT_BATTING(p.id))
    );
    setPitchingRows(initialPitching && initialPitching.length > 0 ? initialPitching : []);
    setOurScore(game.our_score ?? 0);
    setOppScore(game.opponent_score ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBatting, initialPitching, game]);

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

    // Auto-assign batting_order from row position (1-indexed) whenever the
    // coach hasn't set one explicitly, so BoxScoreView's sort-by-order
    // doesn't fall back to arbitrary ordering for manually-entered rows.
    const orderedBatting = battingRows.map((r, idx) => ({
      ...r,
      batting_order: r.batting_order ?? idx + 1,
    }));

    // A player who was already part of the persisted box score (present
    // in initialBatting) is kept regardless of stats — the coach may have
    // intentionally zeroed out an all-zero line (e.g. 0-for-4), and that's
    // a real, explicit entry, not an empty placeholder row. Only rows that
    // were never part of the saved box score (e.g. default zero rows for
    // roster players who didn't play) are dropped when every counting stat
    // is zero — not just the narrow ab/h/bb/r check. That narrow check
    // dropped valid preloaded or edited rows whose only stats were e.g.
    // hbp/sac/sf/cs/lob, silently wiping them from the saved box score on
    // the next save (#433).
    const initialBattingIds = new Set((initialBatting ?? []).map((r) => r.player_id));
    const retainedBatting = orderedBatting.filter((r) => {
      if (initialBattingIds.has(r.player_id)) return true;
      return (
        [
          'ab', 'r', 'h', 'doubles', 'triples', 'hr', 'rbi',
          'bb', 'k', 'sb', 'cs', 'hbp', 'sac', 'sf', 'lob',
        ] as (keyof BoxScoreBattingInput)[]
      ).some((field) => (r[field] as number) > 0);
    });

    const result = await saveFullBoxScore(
      game.id,
      retainedBatting,
      pitchingRows,
      ourScore,
      oppScore
    );

    if (result.success) {
      setSaving(false);
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
      <PaperCard className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-lg font-bold text-warm-900">
              {game.game_type === 'scrimmage' ? 'Scrimmage' : 'Game'} vs{' '}
              {game.opponent_name ?? 'TBD'}
            </h2>
            <p className="text-sm text-warm-500 mt-0.5">
              {new Date(game.game_date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
              {game.location && ` · ${game.location}`}
            </p>
          </div>

          {/* Score inputs */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <p className="text-xs text-warm-400 mb-1 font-medium uppercase tracking-wide">Us</p>
              <Input
                type="number"
                min={0}
                max={99}
                value={ourScore}
                onChange={(e) => setOurScore(Number(e.target.value))}
                aria-label="Our score"
                className="w-16 min-h-[44px] text-center text-2xl font-bold p-2 rounded-xl bg-cream-100/82 font-annual tabular-nums"
              />
            </div>
            <span className="text-2xl font-bold text-warm-300 mt-4">—</span>
            <div className="text-center">
              <p className="text-xs text-warm-400 mb-1 font-medium uppercase tracking-wide">
                {game.opponent_name ?? 'Them'}
              </p>
              <Input
                type="number"
                min={0}
                max={99}
                value={oppScore}
                onChange={(e) => setOppScore(Number(e.target.value))}
                aria-label={`${game.opponent_name ?? 'Opponent'} score`}
                className="w-16 min-h-[44px] text-center text-2xl font-bold p-2 rounded-xl bg-cream-100/82 font-annual tabular-nums"
              />
            </div>
          </div>
        </div>
      </PaperCard>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-warm-100 rounded-xl w-fit">
        <Button variant="ghost"
          onClick={() => setActiveTab('batting')}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'batting' ? 'bg-cream-50 text-warm-900 shadow-sm' : 'text-warm-500 hover:text-warm-700'
          }`}
        >
          <IconUser size={14} />
          Batting
        </Button>
        <Button variant="ghost"
          onClick={() => setActiveTab('pitching')}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
            activeTab === 'pitching' ? 'bg-cream-50 text-warm-900 shadow-sm' : 'text-warm-500 hover:text-warm-700'
          }`}
        >
          <IconTrendingUp size={14} />
          Pitching
        </Button>
      </div>

      {/* Batting table */}
      {activeTab === 'batting' && (
        <PaperCard className="overflow-hidden" data-testid="batting-entry-table">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-warm-100 bg-warm-50/80">
                  <th scope="col" className="text-left px-4 py-3 font-semibold text-warm-500 sticky left-0 bg-warm-50/80 min-w-[140px]">Player</th>
                  {['AB','R','H','2B','3B','HR','RBI','BB','K','SB','CS','HBP','SAC','SF','LOB'].map((h) => (
                    <th key={h} scope="col" className="text-center px-2 py-3 font-semibold text-warm-500 min-w-[44px]">{h}</th>
                  ))}
                  <th scope="col" className="text-center px-2 py-3 font-semibold text-warm-400 min-w-[52px]">AVG</th>
                  <th scope="col" className="text-center px-2 py-3 font-semibold text-warm-400 min-w-[52px]">OPS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-50">
                {battingRows.map((row) => {
                  const player = playerMap.get(row.player_id);
                  return (
                    <tr key={row.player_id} className="hover:bg-warm-50/60 transition-colors">
                      <td className="px-4 py-2 sticky left-0 bg-cream-50/92 font-medium text-warm-800">
                        {player ? (
                          <span>
                            {player.first_name?.[0]}. {player.last_name}
                            {player.primary_position && (
                              <span className="ml-1 text-warm-400 font-normal">{player.primary_position}</span>
                            )}
                          </span>
                        ) : 'Unknown'}
                      </td>
                      {(
                        ['ab','r','h','doubles','triples','hr','rbi','bb','k','sb','cs','hbp','sac','sf','lob'] as (keyof typeof BATTING_FIELD_LABELS)[]
                      ).map((field) => (
                        <td key={field} className="px-1 py-1.5 text-center">
                          <Input
                            type="number"
                            min={0}
                            max={99}
                            value={row[field] as number}
                            onChange={(e) => updateBatting(row.player_id, field, Number(e.target.value))}
                            aria-label={`${playerFullName(player)} ${BATTING_FIELD_LABELS[field]}`}
                            className="w-10 min-h-[44px] text-center text-xs font-medium rounded-md p-1 border-warm-100 bg-cream-50 hover:border-warm-200 font-annual tabular-nums"
                          />
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center text-warm-400 font-annual tabular-nums">
                        {calcAvg(row.h, row.ab)}
                      </td>
                      <td className="px-2 py-2 text-center text-warm-400 font-annual tabular-nums">
                        {calcOPS(row)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr className="border-t-2 border-warm-200 bg-warm-50/80 font-semibold text-warm-700" data-testid="batting-entry-totals-row">
                  <td className="px-4 py-2.5 sticky left-0 bg-warm-50/90 text-sm">TOTALS</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.ab}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.r}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.h}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.doubles}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.triples}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.hr}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.rbi}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.bb}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.k}</td>
                  <td className="px-2 py-2.5 text-center font-annual tabular-nums">{battingTotals.sb}</td>
                  <td colSpan={5} />
                  <td className="px-2 py-2.5 text-center text-warm-500 font-annual tabular-nums">
                    {calcAvg(battingTotals.h, battingTotals.ab)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </PaperCard>
      )}

      {/* Pitching table */}
      {activeTab === 'pitching' && (
        <div className="space-y-4">
          {/* Add pitcher row */}
          <div className="flex items-center gap-3">
            <Select
              value={selectedPitcherId}
              onChange={(value) => setSelectedPitcherId(value)}
              placeholder="Select pitcher to add..."
              className="flex-1 max-w-xs text-sm min-h-[44px] py-2 bg-cream-100/75"
              options={teamPlayers
                .filter((p) => !pitchingRows.some((r) => r.player_id === p.id))
                .map((p) => ({
                  value: p.id,
                  label: `${p.first_name} ${p.last_name}${p.primary_position ? ` (${p.primary_position})` : ''}`,
                }))}
            />
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
            <EditorsLetter title="Add pitchers using the selector above to record pitching lines." />
          ) : (
            <PaperCard className="overflow-hidden" data-testid="pitching-entry-table">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-warm-100 bg-warm-50/80">
                      <th scope="col" className="text-left px-4 py-3 font-semibold text-warm-500 sticky left-0 bg-warm-50/80 min-w-[140px]">Pitcher</th>
                      {['IP','H','R','ER','BB','K','HR','PC','Result'].map((h) => (
                        <th key={h} scope="col" className="text-center px-2 py-3 font-semibold text-warm-500 min-w-[52px]">{h}</th>
                      ))}
                      <th scope="col" className="text-center px-2 py-3 font-semibold text-warm-400 min-w-[52px]">ERA</th>
                      <th scope="col" className="text-center px-2 py-3 font-semibold text-warm-400 min-w-[52px]">WHIP</th>
                      <th scope="col" className="px-2 py-3"><span className="sr-only">Remove pitcher</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-50">
                    {pitchingRows.map((row) => {
                      const player = playerMap.get(row.player_id);
                      return (
                        <tr key={row.player_id} className="hover:bg-warm-50/60 transition-colors">
                          <td className="px-4 py-2 sticky left-0 bg-cream-50/92 font-medium text-warm-800">
                            {player ? `${player.first_name?.[0]}. ${player.last_name}` : 'Unknown'}
                          </td>
                          {(
                            ['ip','h','r','er','bb','k','hr'] as (keyof typeof PITCHING_FIELD_LABELS)[]
                          ).map((field) => (
                            <td key={field} className="px-1 py-1.5 text-center">
                              <Input
                                type="number"
                                min={0}
                                max={field === 'ip' ? 9.2 : 99}
                                step={field === 'ip' ? 0.1 : 1}
                                value={row[field] as number}
                                onChange={(e) =>
                                  updatePitching(row.player_id, field, Number(e.target.value))
                                }
                                aria-label={`${playerFullName(player)} ${PITCHING_FIELD_LABELS[field]}`}
                                className="w-12 min-h-[44px] text-center text-xs font-medium rounded-md p-1 border-warm-100 bg-cream-50 hover:border-warm-200 font-annual tabular-nums"
                              />
                            </td>
                          ))}
                          {/* Pitch count */}
                          <td className="px-1 py-1.5 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={200}
                              value={row.pitch_count ?? 0}
                              onChange={(e) =>
                                updatePitching(row.player_id, 'pitch_count', Number(e.target.value))
                              }
                              aria-label={`${playerFullName(player)} pitch count`}
                              className="w-14 min-h-[44px] text-center text-xs font-medium rounded-md p-1 border-warm-100 bg-cream-50 font-annual tabular-nums"
                            />
                          </td>
                          {/* Result */}
                          <td className="px-1 py-1.5 text-center">
                            <Select
                              value={row.result ?? ''}
                              onChange={(value) =>
                                updatePitching(
                                  row.player_id,
                                  'result',
                                  value as BaseballPitchingResult
                                )
                              }
                              placeholder="—"
                              options={PITCHING_RESULTS.map((r) => ({ value: r, label: r }))}
                              className="w-20 min-h-[44px] text-center text-xs font-medium rounded-md p-1 border-warm-100 bg-cream-50"
                            />
                          </td>
                          <td className="px-2 py-2 text-center text-warm-400 font-annual tabular-nums">
                            {calcERA(row.er, row.ip)}
                          </td>
                          <td className="px-2 py-2 text-center text-warm-400 font-annual tabular-nums">
                            {calcWHIP(row.h, row.bb, row.ip)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Button
                              variant="danger"
                              size="icon-sm"
                              onClick={() => removePitcher(row.player_id)}
                              className="text-warm-300 hover:text-[color:var(--notice-error-ink)] transition-colors"
                              aria-label={`Remove ${playerFullName(player)} from pitching lines`}
                              title="Remove"
                            >
                              <IconX size={14} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {pitchingRows.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-warm-200 bg-warm-50/80 font-semibold text-warm-700" data-testid="pitching-entry-totals-row">
                        <td className="px-4 py-2.5 sticky left-0 bg-warm-50/90 text-sm">TOTALS</td>
                        <td className="px-2 py-2.5 text-center font-annual tabular-nums">
                          {/* .1/.2 are outs — sum via outs, not base-10 (#434) */}
                          {sumInningsPitched(pitchingRows.map((r) => r.ip)).toFixed(1)}
                        </td>
                        <td className="px-2 py-2.5 text-center font-annual tabular-nums">{pitchingRows.reduce((s, r) => s + r.h, 0)}</td>
                        <td className="px-2 py-2.5 text-center font-annual tabular-nums">{pitchingRows.reduce((s, r) => s + r.r, 0)}</td>
                        <td className="px-2 py-2.5 text-center font-annual tabular-nums">{pitchingRows.reduce((s, r) => s + r.er, 0)}</td>
                        <td className="px-2 py-2.5 text-center font-annual tabular-nums">{pitchingRows.reduce((s, r) => s + r.bb, 0)}</td>
                        <td className="px-2 py-2.5 text-center font-annual tabular-nums">{pitchingRows.reduce((s, r) => s + r.k, 0)}</td>
                        {/* Remaining header columns: HR, PC, Result, ERA, WHIP, Remove = 6
                            (header total is 13: Pitcher + 9 stat/meta headers + ERA + WHIP +
                            Remove; this row already renders TOTALS + IP/H/R/ER/BB/K = 7). */}
                        <td colSpan={6} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </PaperCard>
          )}
        </div>
      )}

      {/* Save button */}
      {saveError && (
        <EditorsLetter
          ink="team"
          title="Couldn't save box score"
          body={saveError}
          action={
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              Try again
            </Button>
          }
        />
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-warm-400">
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

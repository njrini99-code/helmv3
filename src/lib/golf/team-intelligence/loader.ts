import 'server-only';

/**
 * Loads `TeamIntelligenceData` for one team: the active roster, their
 * countable completed rounds this season (with the stored per-category SG),
 * and every tracked shot in those rounds, normalized for the Home visuals.
 *
 * Reads throw on error rather than degrade to empty: an empty payload would
 * render as a team with nothing wrong. The page catches and shows a notice.
 *
 * PostgREST limits: every read is paginated past the 1,000-row cap, and the
 * shot read chunks round ids so a long season never overflows the `.in()`
 * URL.
 */
import type { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { isCountableRound, type CountableRoundInput } from '@/lib/golf/round-countable';
import { SG_BASELINE_OPTIONS, effectiveSgBaseline, type SgBaselineKey, type TeamGender } from '@/lib/golf/sg-benchmarks';
import { normalizeShots, type RawShotRow } from './normalize';
import type { IntelPlayer, IntelRound, IntelRoundType, IntelTourRefs, TeamIntelligenceData } from './types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ROUND_ID_CHUNK = 100;
const ROUND_TYPES = new Set<IntelRoundType>(['practice', 'qualifier', 'tournament']);

interface RoundRow extends CountableRoundInput {
  id: string;
  player_id: string;
  round_date: string | null;
  round_type: string | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
}

const num = (v: number | null): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const PUTT_REFS = ['3_5', '5_10', '10_15', '15_25', '25_plus'] as const;
const PROXIMITY_REFS = ['50_125', '125_175', '175_plus'] as const;
const SCRAMBLING_REFS = ['fairway', 'rough', 'sand'] as const;
const REF_METRICS = [
  ...PUTT_REFS.map((b) => `putts_made_${b}ft_pct`),
  ...PROXIMITY_REFS.map((b) => `approach_proximity_${b}ft`),
  ...SCRAMBLING_REFS.map((l) => `scrambling_pct_${l}`),
  'gir_pct',
];

/**
 * Tour averages from `golf_pga_standards` (`pga_tour_value` is the row's own
 * tour's average). LPGA rows for a women's baseline, PGA for any metric the
 * LPGA table lacks, exactly as the leak maps route it. A failed read leaves
 * every ref null: the visuals then draw no tour mark rather than a guess.
 */
async function loadTourRefs(supabase: Supabase, tour: 'pga' | 'lpga'): Promise<IntelTourRefs> {
  const { data, error } = await supabase
    .from('golf_pga_standards')
    .select('metric_id, tour, pga_tour_value')
    .in('metric_id', REF_METRICS)
    .in('tour', tour === 'lpga' ? ['lpga', 'pga'] : ['pga']);
  const value = new Map<string, number>();
  for (const row of (error ? [] : data ?? []) as { metric_id: string; tour: string; pga_tour_value: number | string | null }[]) {
    const v = row.pga_tour_value == null ? NaN : Number(row.pga_tour_value);
    if (!Number.isFinite(v)) continue;
    if (row.tour === tour || !value.has(row.metric_id)) value.set(row.metric_id, v);
  }
  const pick = (id: string) => value.get(id) ?? null;
  return {
    puttMake: Object.fromEntries(PUTT_REFS.map((b) => [b, pick(`putts_made_${b}ft_pct`)])),
    proximity: Object.fromEntries(PROXIMITY_REFS.map((b) => [b, pick(`approach_proximity_${b}ft`)])),
    scrambling: Object.fromEntries(SCRAMBLING_REFS.map((l) => [l, pick(`scrambling_pct_${l}`)])),
    girPct: pick('gir_pct'),
  };
}

export async function loadTeamIntelligence(supabase: Supabase, teamId: string, today: string): Promise<TeamIntelligenceData> {
  const [membersRes, teamRes, settingsRes] = await Promise.all([
    supabase.from('golf_team_members').select('player_id').eq('team_id', teamId).eq('status', 'active'),
    supabase.from('golf_teams').select('gender').eq('id', teamId).maybeSingle(),
    supabase.from('golf_team_settings').select('sg_baseline').eq('team_id', teamId).maybeSingle(),
  ]);
  if (membersRes.error) throw new Error(`roster read failed: ${membersRes.error.message}`);

  // A failed settings or team read degrades to the default tour baseline, not an error page.
  const baselineKey = effectiveSgBaseline(
    (settingsRes.error ? null : (settingsRes.data?.sg_baseline as SgBaselineKey | null)) ?? null,
    ((teamRes.error ? null : (teamRes.data as { gender?: string } | null))?.gender as TeamGender | undefined) ?? 'mens',
  );
  const baselineLabel = SG_BASELINE_OPTIONS.find((o) => o.key === baselineKey)?.label ?? 'PGA Tour';
  const tour = baselineKey === 'womens' ? 'lpga' : 'pga';
  const tourLabel = tour === 'lpga' ? 'LPGA' : 'PGA Tour';
  const refs = await loadTourRefs(supabase, tour);

  const playerIds = [...new Set((membersRes.data ?? []).map((m) => m.player_id).filter((id): id is string => !!id))];
  if (playerIds.length === 0) {
    return { teamId, baselineLabel, tourLabel, refs, today, players: [], rounds: [], tee: [], approach: [], chips: [], putts: [] };
  }

  const seasonStart = `${today.slice(0, 4)}-01-01`;
  const [playersRes, roundsRes] = await Promise.all([
    supabase.from('golf_players').select('id, first_name, last_name, avatar_url').in('id', playerIds),
    fetchAllRowsResult<RoundRow>((from, to) =>
      supabase
        .from('golf_rounds')
        .select(
          'id, player_id, round_date, round_type, holes_played, total_score, front_nine, back_nine, total_putts, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting',
        )
        .in('player_id', playerIds)
        .eq('status', 'completed')
        .eq('is_test', false)
        .gte('round_date', seasonStart)
        .lte('round_date', today)
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);
  if (playersRes.error) throw new Error(`player read failed: ${playersRes.error.message}`);
  if (roundsRes.error) throw new Error(`round read failed: ${roundsRes.error.message}`);

  const players: IntelPlayer[] = (playersRes.data ?? [])
    .map((p) => ({
      id: p.id,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Unnamed player',
      avatarUrl: p.avatar_url ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rounds: IntelRound[] = (roundsRes.data ?? [])
    .filter((r) => r.round_date && isCountableRound(r))
    .map((r) => ({
      id: r.id,
      playerId: r.player_id,
      date: r.round_date!.slice(0, 10),
      type: ROUND_TYPES.has(r.round_type as IntelRoundType) ? (r.round_type as IntelRoundType) : 'other',
      sg: {
        tee: num(r.strokes_gained_tee),
        app: num(r.strokes_gained_approach),
        atg: num(r.strokes_gained_around_green),
        putt: num(r.strokes_gained_putting),
      },
    }));

  const roundIndex = new Map(rounds.map((r, i) => [r.id, i]));
  const roundIds = [...roundIndex.keys()];
  const shotRows: RawShotRow[] = [];
  for (let i = 0; i < roundIds.length; i += ROUND_ID_CHUNK) {
    const chunk = roundIds.slice(i, i + ROUND_ID_CHUNK);
    const { data, error } = await fetchAllRowsResult<RawShotRow>((from, to) =>
      supabase
        .from('golf_shots')
        .select(
          'round_id, hole_number, shot_number, shot_type, club_type, penalty_type, lie_before, lie_after, result, miss_direction, is_penalty, distance_to_hole_before, distance_unit_before, distance_to_hole_after, distance_unit_after, putt_distance_feet, putt_made, putt_break, putt_slope',
        )
        .in('round_id', chunk)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (error) throw new Error(`shot read failed: ${error.message}`);
    shotRows.push(...(data ?? []));
  }

  return { teamId, baselineLabel, tourLabel, refs, today, players, rounds, ...normalizeShots(shotRows, roundIndex) };
}

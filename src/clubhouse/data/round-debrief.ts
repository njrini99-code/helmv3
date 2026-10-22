import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { isCountableRound } from '@/lib/golf/round-countable';
import { rankEvidenceInsights } from '@/app/golf/actions/insight-delivery-ranking';
import type { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { kindOf } from './coachhelm-classify';
import { loadPlayerDismissed, loadPlayerHelmGate, loadVisible } from './coachhelm';
import { buildDebrief, DEBRIEF_HISTORY_MAX, type ChDebrief, type ChDebriefHistoryRow, type ChDebriefNextInput, type ChDebriefReadInput } from './round-debrief-shape';
import type { ChRoundReview } from './round-review-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The flag the debrief follows: CoachHelm Slice 0's output copy (no flag of its own; supercharge 04 example 9 is output only). */
export const DEBRIEF_FLAG = 'coachhelm_reads_v1_copy';

const log = (what: string, err: unknown) => chLogServer('rounds.review', `debrief.${what}`, err);

const HISTORY_COLUMNS = 'id, round_date, total_score, front_nine, back_nine, holes_played, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, score_to_par';
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The player's earlier completed countable rounds of the same length, newest first; null when the read fails (logged). */
async function readHistory(supabase: Supabase, r: ChRoundReview): Promise<ChDebriefHistoryRow[] | null> {
  const res = await supabase
    .from('golf_rounds')
    .select(HISTORY_COLUMNS)
    .eq('player_id', r.playerId)
    .eq('status', 'completed')
    .eq('is_test', false)
    .eq('holes_played', r.holesPlayed)
    .lte('round_date', r.date)
    .neq('id', r.id)
    .order('round_date', { ascending: false })
    .limit(DEBRIEF_HISTORY_MAX * 2);
  if (res.error) {
    log('history', res.error);
    return null;
  }
  return (res.data ?? []).filter((row) => isCountableRound(row)).slice(0, DEBRIEF_HISTORY_MAX);
}

/** The player's top open read (the Board's ranking over their visible rows, findings only, less their own dismissals). */
async function readTop(supabase: Supabase, playerId: string): Promise<ChDebriefReadInput | null> {
  const [visible, dismissed] = await Promise.all([loadVisible(supabase, [playerId]), loadPlayerDismissed(supabase, playerId)]);
  if (visible.error || dismissed.error) return null;
  const open = visible.rows.filter((row) => !dismissed.ids.has(row.id) && kindOf(row, null) === 'finding');
  if (open.length === 0) return null;
  const [top] = await rankEvidenceInsights(open);
  if (!top) return null;
  const ev = top.evidence as unknown as Record<string, unknown>;
  return { id: top.id, title: top.title, metric: typeof ev.metric === 'string' ? ev.metric : null, yourValue: num(ev.your_value) };
}

/** The read's first-ranked drill, else the focus area the player is working on; null when neither is there (or a read failed). */
async function readNext(supabase: Supabase, playerId: string, readId: string | null): Promise<ChDebriefNextInput | null> {
  const [drillRes, focusRes] = await Promise.all([
    readId
      ? supabase.from('golf_insight_drill_attachments').select('rank, drill:golf_drills ( title, duration_min )').eq('insight_id', readId).order('rank', { ascending: true }).limit(1)
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('golf_player_focus_areas')
      .select('title, priority, created_at')
      .eq('player_id', playerId)
      .in('status', ['active', 'in_progress'])
      .order('priority', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1),
  ]);
  if (drillRes.error) log('drill', drillRes.error);
  if (focusRes.error) log('focus', focusRes.error);
  const raw = drillRes.data?.[0]?.drill as { title: string; duration_min: number | null } | Array<{ title: string; duration_min: number | null }> | null | undefined;
  const d = Array.isArray(raw) ? raw[0] : raw;
  const drill = d?.title ? { title: d.title, minutes: d.duration_min ?? null } : null;
  const focus = focusRes.data?.[0]?.title ?? null;
  return drill || focus ? { drill, focus } : null;
}

/**
 * The player's 30-second debrief for their own round (CoachHelm chs-30). Null with `coachhelm_reads_v1_copy` off (no read is
 * made), for a coach's view, when CoachHelm is off for the player or its gate failed, and when nothing could be said; the page
 * then draws its recap block as before. Each part reads and fails on its own: a failed part is logged and its line is dropped.
 */
export async function loadRoundDebrief(supabase: Supabase, review: ChRoundReview, viewer: { role: 'player' | 'coach' }): Promise<ChDebrief | null> {
  if (viewer.role !== 'player' || !isFlagEnabled(DEBRIEF_FLAG)) return null;
  try {
    const gate = await loadPlayerHelmGate(review.playerId);
    if (gate.status !== 'on') return null;
    const [history, read] = await Promise.all([readHistory(supabase, review), readTop(supabase, review.playerId)]);
    const next = await readNext(supabase, review.playerId, read?.id ?? null);
    // A failed history is no average to say a move against: the moved line is left out, the rest stands.
    return buildDebrief(review, { history: history ?? [], read, next });
  } catch (err) {
    log('load', err);
    return null;
  }
}

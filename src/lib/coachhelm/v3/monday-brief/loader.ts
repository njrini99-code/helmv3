/**
 * Reads what one team's Monday brief is computed from (task chs-28): the
 * active roster and names, the visible v3 reads, the roster's countable
 * completed rounds and, with `coachhelm_team_pattern_v1` on, the team pattern
 * from Slice 7b's computation over the current reads. Read only.
 *
 * Fail closed: any read that fails answers null (the view says it did not
 * load; the cron sends nothing for that team), and nothing here throws. The
 * caller checks `coachhelm_monday_brief_v1` before calling.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { isCountableRound } from '@/lib/golf/round-countable';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { teamPatternEnabled } from '@/lib/coachhelm/v3/team-pattern/flag';
import { computeTeamPatterns, TEAM_PATTERN_MIN_ROUNDS, type TeamPatternResult } from '@/lib/coachhelm/v3/team-pattern/pattern';
import { logServerEvent } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { computeMondayBrief, dayOfIso, type MondayBrief, type MondayBriefRead, type MondayBriefRound } from './brief';

const READ_COLUMNS = 'id, player_id, category, insight_type, title, evidence, metadata, created_at';

interface RoundRow {
  id: string;
  player_id: string;
  round_date: string | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  holes_played: number | null;
  total_putts: number | null;
}

const NO_NAME = 'Player';

async function note(what: string, err: unknown): Promise<void> {
  try {
    await logServerEvent(`coachhelm monday brief: ${what} did not read: ${describeError(err)}`, { action: 'coachhelm.monday-brief' }, 'warning');
  } catch {
    // Logging is best effort; the brief still answers null.
  }
}

/**
 * Reads are scoped to this team (or to no team, the rows written before team
 * scoping): a player on two teams must not carry team B's reads into team A's
 * brief, which the cron reads with the admin client.
 */
async function loadReads(supabase: SupabaseClient, teamId: string, ids: string[]): Promise<MondayBriefRead[] | null> {
  const out: MondayBriefRead[] = [];
  for (const chunk of chunkIds(ids)) {
    const res = await fetchAllRowsResult<MondayBriefRead>((from, to) =>
      applyInsightVisibility(supabase.from('golf_coach_insights').select(READ_COLUMNS).in('player_id', chunk).or(`team_id.eq.${teamId},team_id.is.null`).not('evidence', 'is', null))
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (res.error) {
      await note('reads', res.error.message);
      return null;
    }
    out.push(...(res.data ?? []));
  }
  return out;
}

async function loadRounds(supabase: SupabaseClient, ids: string[]): Promise<MondayBriefRound[] | null> {
  const out: MondayBriefRound[] = [];
  for (const chunk of chunkIds(ids)) {
    const res = await fetchAllRowsResult<RoundRow>((from, to) =>
      supabase
        .from('golf_rounds')
        .select('id, player_id, round_date, total_score, front_nine, back_nine, holes_played, total_putts')
        .in('player_id', chunk)
        .eq('is_test', false)
        .eq('status', 'completed')
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (res.error) {
      await note('rounds', res.error.message);
      return null;
    }
    for (const r of res.data ?? []) {
      const day = dayOfIso(r.round_date);
      if (day && isCountableRound(r)) out.push({ player_id: r.player_id, day });
    }
  }
  return out;
}

/** What a team's brief is computed from: the roster, the visible reads, the countable rounds and (flag on) the team patterns. */
export interface BriefInputs {
  roster: Array<{ id: string; name: string }>;
  reads: MondayBriefRead[];
  rounds: MondayBriefRound[];
  /** Players with at least `TEAM_PATTERN_MIN_ROUNDS` countable rounds. */
  eligible: Set<string>;
  /** Every team pattern over the current reads; null when `coachhelm_team_pattern_v1` is off or the roster is empty. */
  patterns: TeamPatternResult | null;
}

/** The inputs of one team's brief at `now`, or null when a read failed. Read only; never throws. */
export async function loadBriefInputs(supabase: SupabaseClient, teamId: string, now: Date = new Date()): Promise<BriefInputs | null> {
  try {
    const members = await supabase.from('golf_team_members').select('player_id').eq('team_id', teamId).eq('status', 'active');
    if (members.error) {
      await note('roster', members.error.message);
      return null;
    }
    const memberIds = ((members.data ?? []) as Array<{ player_id: string }>).map((m) => m.player_id);
    const roster: Array<{ id: string; name: string }> = [];
    for (const chunk of chunkIds(memberIds)) {
      const people = await supabase.from('golf_players').select('id, first_name, last_name').in('id', chunk);
      if (people.error) {
        await note('names', people.error.message);
        return null;
      }
      for (const p of (people.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
        roster.push({ id: p.id, name: [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || NO_NAME });
      }
    }
    const ids = roster.map((p) => p.id);
    const [reads, rounds] = ids.length ? await Promise.all([loadReads(supabase, teamId, ids), loadRounds(supabase, ids)]) : [[], []];
    if (!reads || !rounds) return null;

    const perPlayer = new Map<string, number>();
    for (const r of rounds) perPlayer.set(r.player_id, (perPlayer.get(r.player_id) ?? 0) + 1);
    const eligible = new Set([...perPlayer].filter(([, n]) => n >= TEAM_PATTERN_MIN_ROUNDS).map(([id]) => id));

    let patterns: TeamPatternResult | null = null;
    if (teamPatternEnabled() && ids.length > 0) {
      // The pattern counts current reads only, as the coach board does: a read with a newer countable round than its last refresh is out.
      const newest = new Map<string, string>();
      for (const r of rounds) if (r.day > (newest.get(r.player_id) ?? '')) newest.set(r.player_id, r.day);
      const current = reads.filter((r) => {
        const fresh = dayOfIso((r.metadata as Record<string, unknown> | null)?.last_refreshed_at);
        const latest = newest.get(r.player_id);
        return !!fresh && (!latest || latest <= fresh);
      });
      patterns = computeTeamPatterns({
        teamId,
        reads: current.map((r) => ({ id: r.id, player_id: r.player_id, insight_type: r.insight_type ?? '', evidence: r.evidence })),
        rosterTotal: roster.length,
        eligiblePlayerIds: eligible,
        now,
      });
    }
    return { roster, reads, rounds, eligible, patterns };
  } catch (err) {
    await note('brief', err);
    return null;
  }
}

/** One team's brief at `now`, or null when a read failed. */
export async function loadMondayBrief(supabase: SupabaseClient, teamId: string, now: Date = new Date()): Promise<MondayBrief | null> {
  const inputs = await loadBriefInputs(supabase, teamId, now);
  if (!inputs) return null;
  try {
    const { roster, reads, rounds, eligible, patterns } = inputs;
    return computeMondayBrief({ teamId, roster, reads, rounds, teamPattern: patterns?.patterns[0] ?? null, withEnoughRounds: eligible.size, now });
  } catch (err) {
    await note('brief', err);
    return null;
  }
}

import 'server-only';
/**
 * CoachHelm reads: compute a team's reads and save the ones that changed. Service role only.
 *
 * Per TEAM, because a read compares the player with teammates: after a round, the player's team is rebuilt and only
 * the rows whose content changed are written; nightly, every flagged team. Never throws: every failure comes back as a
 * result and is logged, and a slow run is cut at a time limit so the caller (the round's terminal state, the sweep) is
 * never held up by it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { loadTeamRows } from '../fact-sheet';
import { supabaseAnalystSources } from '../supabase-sources';
import { buildTeamReads } from './build';
import { readsEnabled, readsEnabledTeams } from './flag';
import { changedRows, insertReads, loadCurrentReads } from './store';
import type { ReadTrigger } from './types';

/** A run past this is abandoned (its result is ignored; the next round or night redoes it). */
export const READS_TIME_LIMIT_MS = 20_000;

export type TeamReadsOutcome =
  | { kind: 'written'; teamId: string; players: number; written: number }
  | { kind: 'held'; teamId: string }
  | { kind: 'failed'; teamId: string; error: string }
  | { kind: 'timed_out'; teamId: string };

/** Resolves to the work, or to `timed_out` after `ms`; the losing promise's rejection is swallowed. */
export async function withTimeLimit<T>(work: Promise<T>, ms: number, timedOut: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(timedOut()), ms);
  });
  work.catch(() => undefined);
  try {
    return await Promise.race([work, limit]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function computeTeam(sb: SupabaseClient, teamId: string, trigger: ReadTrigger, roundId: string | null, now: Date): Promise<TeamReadsOutcome> {
  const current = await loadCurrentReads(sb, teamId);
  if (current.status === 'held') return { kind: 'held', teamId };
  if (current.status === 'failed') return { kind: 'failed', teamId, error: current.error };
  const rows = await loadTeamRows(supabaseAnalystSources(sb as never), { teamId, now });
  const { payloads } = buildTeamReads(rows);
  const inserts = changedRows(payloads, current.data, trigger, roundId);
  const res = await insertReads(sb, inserts);
  if (res.status === 'held') return { kind: 'held', teamId };
  if (res.status === 'failed') return { kind: 'failed', teamId, error: res.error };
  return { kind: 'written', teamId, players: payloads.length, written: res.data };
}

/** One team's reads, with the time limit. Never throws. */
export async function refreshTeamReads(sb: SupabaseClient, args: { teamId: string; trigger: ReadTrigger; roundId?: string | null; now?: Date; timeLimitMs?: number }): Promise<TeamReadsOutcome> {
  const { teamId, trigger } = args;
  const outcome = await withTimeLimit<TeamReadsOutcome>(
    computeTeam(sb, teamId, trigger, args.roundId ?? null, args.now ?? new Date()).catch((err: unknown): TeamReadsOutcome => ({ kind: 'failed', teamId, error: describeError(err) })),
    args.timeLimitMs ?? READS_TIME_LIMIT_MS,
    () => ({ kind: 'timed_out', teamId }),
  );
  const context = { action: `coachhelm.reads.${trigger}`, featureArea: 'coachhelm', extra: { teamId, roundId: args.roundId ?? null, kind: outcome.kind, ...(outcome.kind === 'written' ? { players: outcome.players, written: outcome.written } : {}) } };
  if (outcome.kind === 'failed' || outcome.kind === 'timed_out') {
    await logServerError(`coachhelm.reads ${outcome.kind}: ${outcome.kind === 'failed' ? outcome.error : `over ${args.timeLimitMs ?? READS_TIME_LIMIT_MS} ms`}`, context, 'warning').catch(() => undefined);
  } else {
    await logServerEvent(`coachhelm.reads ${outcome.kind}`, context, 'info').catch(() => undefined);
  }
  return outcome;
}

/**
 * After a posted round: the player's flagged teams, each rebuilt. Returns before any database call when no team is
 * listed or the registry flag is off. Never throws.
 */
export async function refreshReadsAfterRound(sb: SupabaseClient, args: { playerId: string; roundId: string; timeLimitMs?: number; flag?: { teams?: string; flagOn?: () => boolean } }): Promise<TeamReadsOutcome[]> {
  try {
    const listed = readsEnabledTeams(args.flag ?? {});
    if (!listed.length) return [];
    const { data, error } = await sb.from('golf_team_members').select('team_id').eq('player_id', args.playerId).eq('status', 'active');
    if (error) {
      await logServerError(`coachhelm.reads round: reading the player's teams failed: ${error.message}`, { action: 'coachhelm.reads.round', featureArea: 'coachhelm', playerId: args.playerId, extra: { roundId: args.roundId } }, 'warning').catch(() => undefined);
      return [];
    }
    const teams = [...new Set(((data ?? []) as Array<{ team_id: string }>).map((r) => r.team_id))].filter((t) => readsEnabled(t, args.flag ?? {}));
    const out: TeamReadsOutcome[] = [];
    for (const teamId of teams) out.push(await refreshTeamReads(sb, { teamId, trigger: 'round', roundId: args.roundId, timeLimitMs: args.timeLimitMs }));
    return out;
  } catch (err) {
    await logServerError(`coachhelm.reads round threw: ${describeError(err)}`, { action: 'coachhelm.reads.round', featureArea: 'coachhelm', playerId: args.playerId, extra: { roundId: args.roundId } }, 'warning').catch(() => undefined);
    return [];
  }
}

/** Nightly: every flagged team, one after another, while the budget lasts. Never throws. */
export async function refreshReadsNightly(sb: SupabaseClient, opts: { budgetMs: number; flag?: { teams?: string; flagOn?: () => boolean } }): Promise<{ teams: number; written: number; held: number; failed: number; deferred: number }> {
  const started = Date.now();
  const summary = { teams: 0, written: 0, held: 0, failed: 0, deferred: 0 };
  let teams: string[];
  try {
    teams = readsEnabledTeams(opts.flag ?? {});
  } catch {
    return summary;
  }
  for (const teamId of teams) {
    if (Date.now() - started >= opts.budgetMs) {
      summary.deferred += 1;
      continue;
    }
    const o = await refreshTeamReads(sb, { teamId, trigger: 'nightly' });
    summary.teams += 1;
    if (o.kind === 'written') summary.written += o.written;
    else if (o.kind === 'held') summary.held += 1;
    else summary.failed += 1;
  }
  return summary;
}

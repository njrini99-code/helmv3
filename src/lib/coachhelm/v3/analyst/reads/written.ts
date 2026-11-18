import 'server-only';
/**
 * CoachHelm reads, stage 3 wiring: the model-written paragraph on a read (src/lib/coachhelm/v3/analyst/writer).
 *
 * Behind two switches: coachhelm_reads_v1 for the team AND coachhelm_reads_written_v1 with the team listed in
 * COACHHELM_READS_WRITTEN_TEAM_IDS. After findNotable and before the save. A paragraph is written only when the card’s
 * words changed since the last saved read (else the last one is carried), so a quiet night costs nothing. The coach’s
 * card and the player’s own card are two calls; the player’s is written from the sheet without its coach-only blocks
 * and never reuses the coach’s text. A null result leaves the counted card as it is. The model client is injected.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import type { Notability } from '../notability';
import { withoutCoachOnly, type FactSheet } from '../types';
import { writeRead } from '../writer/write-read';
import type { WriterDeps } from '../writer/types';
import { readsEnabled, readsTeams, type ReadsFlagDeps } from './flag';
import type { ReadPayload } from './types';

export const READS_WRITTEN_FLAG = 'coachhelm_reads_written_v1';
export const READS_WRITTEN_TEAMS_ENV = 'COACHHELM_READS_WRITTEN_TEAM_IDS';

export function readsWrittenEnabled(teamId: string | null | undefined, deps: { written?: ReadsFlagDeps; reads?: ReadsFlagDeps } = {}): boolean {
  try {
    if (!readsEnabled(teamId, deps.reads ?? {})) return false;
    const w = deps.written ?? {};
    const teams = readsTeams('teams' in w ? w.teams : process.env[READS_WRITTEN_TEAMS_ENV]);
    if (!teamId || !teams.has(teamId)) return false;
    return (w.flagOn ?? (() => isFlagEnabled(READS_WRITTEN_FLAG)))();
  } catch {
    return false;
  }
}

/** The words a written paragraph is about: when these are unchanged, the last paragraph stands. */
const wordsKey = (p: ReadPayload | null | undefined) => (p?.priority ? JSON.stringify([p.priority.key, p.priority.certainty, p.priority.headline, p.priority.where_text, p.priority.how_we_found]) : null);

export interface WrittenSummary {
  calls: number;
  written: number;
  carried: number;
  cost_usd: number;
  /** The checker’s rule names only, never the text. */
  rejected_rules: string[];
}

export async function addWritten(
  input: { payloads: readonly ReadPayload[]; sheets: readonly FactSheet[]; notables: readonly Notability[]; previous: ReadonlyMap<string, ReadPayload> },
  deps: WriterDeps,
): Promise<{ payloads: ReadPayload[]; summary: WrittenSummary }> {
  const summary: WrittenSummary = { calls: 0, written: 0, carried: 0, cost_usd: 0, rejected_rules: [] };
  const others: string[] = [];
  const out: ReadPayload[] = [];
  for (const [i, p] of input.payloads.entries()) {
    const prev = input.previous.get(p.player_id);
    const sheet = input.sheets[i]!;
    const notability = input.notables[i]!;
    if (!p.priority) {
      out.push(p);
      continue;
    }
    if (prev && wordsKey(prev) === wordsKey(p) && (prev.written || prev.written_player)) {
      summary.carried += 1;
      out.push({ ...p, ...(prev.written ? { written: prev.written } : {}), ...(prev.written_player ? { written_player: prev.written_player } : {}) });
      if (prev.written) others.push(prev.written.what);
      continue;
    }
    const coach = await writeRead({ view: 'coach', sheet, notability, others }, deps);
    const player = await writeRead({ view: 'player', sheet: withoutCoachOnly(sheet), notability }, deps);
    for (const r of [coach, player]) {
      summary.calls += r.attempts;
      summary.cost_usd += r.cost_usd;
      for (const rej of r.rejections) for (const reason of rej.reasons) summary.rejected_rules.push(reason.rule);
    }
    if (coach.written) {
      summary.written += 1;
      others.push(coach.written.what);
    }
    out.push({ ...p, ...(coach.written ? { written: coach.written } : {}), ...(player.written ? { written_player: player.written } : {}) });
  }
  return { payloads: out, summary };
}

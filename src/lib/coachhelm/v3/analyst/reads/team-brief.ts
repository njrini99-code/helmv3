/**
 * CoachHelm reads, stage 5 (buildable part): the coach’s weekly team brief, as data. No screen, no send.
 *
 * From the team’s current reads (the saved payloads, memory included) and the team page: what the team shares, which
 * cards changed this week and how, which cleared, which focus areas reached their word, and who has no new rounds.
 * Coach only. Pure.
 */
import type { TeamPage } from './team-page';
import type { ReadPayload } from './types';

export interface TeamBrief {
  audience: 'coach_only';
  team_id: string;
  week_from: string;
  week_to: string;
  shared: string | null;
  changed: Array<{ player_id: string; line: string }>;
  cleared: Array<{ player_id: string; line: string }>;
  focus: Array<{ player_id: string; word: string; line: string }>;
  quiet: Array<{ player_id: string; line: string }>;
  signals: Array<{ player_id: string; line: string }>;
}

export function weeklyTeamBrief(input: { teamId: string; weekFrom: string; weekTo: string; reads: readonly ReadPayload[]; page: TeamPage | null }): TeamBrief {
  const inWeek = (d: string | undefined) => !!d && d >= input.weekFrom && d <= input.weekTo;
  const brief: TeamBrief = { audience: 'coach_only', team_id: input.teamId, week_from: input.weekFrom, week_to: input.weekTo, shared: input.page?.shared?.text ?? null, changed: [], cleared: [], focus: [], quiet: [], signals: [] };
  for (const p of input.reads) {
    const m = p.memory;
    if (m?.improvement && inWeek(m.words_since)) brief.cleared.push({ player_id: p.player_id, line: m.improvement });
    else if (m?.change_line && inWeek(m.words_since)) brief.changed.push({ player_id: p.player_id, line: m.change_line });
    if (p.focus && p.focus.word !== 'too_early') brief.focus.push({ player_id: p.player_id, word: p.focus.word_text, line: p.focus.since_text });
    if (p.freshness.stale_text) brief.quiet.push({ player_id: p.player_id, line: p.freshness.stale_text });
    for (const s of p.signals ?? []) brief.signals.push({ player_id: p.player_id, line: s.text });
  }
  return brief;
}

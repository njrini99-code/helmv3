import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildTeamReads } from '../build';
import { decideNext } from '../memory';
import { forPlayer } from '../player-card';
import { weeklyTeamBrief } from '../team-brief';
import { readsTeam } from './team';

describe('stage 5: the weekly team brief and the player’s own card', () => {
  const t = buildTeamReads(readsTeam().rows());
  const reads = t.payloads.map((p) => decideNext(null, p));
  it('the brief says the shared part once and lists what changed, cleared and went quiet this week', () => {
    const changed = { ...reads[0]!, memory: { ...reads[0]!.memory!, change_line: 'Was likely, now clear: 3 more rounds.', words_since: '2026-11-09' } };
    const brief = weeklyTeamBrief({ teamId: 't', weekFrom: '2026-11-03', weekTo: '2026-11-10', reads: [changed, ...reads.slice(1)], page: t.team });
    expect(brief.audience).toBe('coach_only');
    expect(brief.shared).toBe(t.team.shared?.text ?? null);
    expect(brief.changed).toEqual([{ player_id: changed.player_id, line: 'Was likely, now clear: 3 more rounds.' }]);
    const old = weeklyTeamBrief({ teamId: 't', weekFrom: '2026-10-01', weekTo: '2026-10-07', reads: [changed], page: null });
    expect(old.changed).toEqual([]);
  });
  it('the player’s card keeps their own read and nothing from a teammate', () => {
    for (const p of reads) {
      const mine = forPlayer(p);
      expect(mine.priority?.headline).toBe(p.priority?.headline);
      expect(mine.priority?.team ?? null).toBeNull();
      expect((mine.parts ?? []).every((x) => x.team === null)).toBe(true);
      expect((mine.signals ?? []).every((s) => s.team_text === null)).toBe(true);
    }
  });
});

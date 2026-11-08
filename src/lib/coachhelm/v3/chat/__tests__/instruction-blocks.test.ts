import { describe, expect, it } from 'vitest';
import { buildInstructionBlocks, buildInstructions } from '../instructions';
import type { CoachChatContext } from '../context';

const NOW = '2026-11-08T12:00:00.000Z';

function ctx(over: Partial<CoachChatContext> = {}): CoachChatContext {
  return {
    coach_id: 'c1',
    user_id: 'u1',
    team_id: 't1',
    team_name: 'Rini University',
    timezone: 'America/New_York',
    roster: [
      { id: '8091da4b-dbc9-47f3-80f1-be37c96b2c91', name: 'Owen Carter', first_name: 'Owen', last_name: 'Carter', graduation_year: null },
      { id: '11111111-2222-3333-4444-555555555555', name: 'Cole Bennett', first_name: 'Cole', last_name: 'Bennett', graduation_year: null },
    ],
    ...over,
  };
}

describe('buildInstructionBlocks', () => {
  it('joined, the two halves are exactly the single prompt', () => {
    for (const askV2 of [false, true]) {
      for (const claims of [false, true]) {
        const { stable, dynamic } = buildInstructionBlocks(ctx(), NOW, claims, { askV2, knows: askV2 ? '## How to answer\n\nTone: straight.' : null });
        expect(`${stable}\n\n${dynamic}`).toBe(buildInstructions(ctx(), NOW, claims, { askV2, knows: askV2 ? '## How to answer\n\nTone: straight.' : null }));
      }
    }
  });

  it('the stable half is the same bytes for two different teams, so one cache entry serves both', () => {
    const a = buildInstructionBlocks(ctx(), NOW, false, { askV2: true, knows: 'notes for A' });
    const b = buildInstructionBlocks(ctx({ team_name: 'Other College', timezone: 'America/Chicago', roster: [] }), '2026-11-09T12:00:00.000Z', false, { askV2: true, knows: 'notes for B' });
    expect(a.stable).toBe(b.stable);
    expect(a.dynamic).not.toBe(b.dynamic);
  });

  it('nothing about the team, the day or the coach is in the stable half', () => {
    const { stable, dynamic } = buildInstructionBlocks(ctx(), NOW, false, { askV2: true, knows: 'Standing facts: Cole is left-handed' });
    for (const private_ of ['Rini University', 'Owen Carter', 'America/New_York', 'November', 'left-handed', '8091da4b']) {
      expect(stable).not.toContain(private_);
      expect(dynamic).toContain(private_);
    }
  });

  it('Ask v2 gives the player tools the roster ids; the old Ask does not', () => {
    const v2 = buildInstructionBlocks(ctx(), NOW, false, { askV2: true }).dynamic;
    expect(v2).toContain('Owen Carter = 8091da4b-dbc9-47f3-80f1-be37c96b2c91');
    expect(v2).toContain('Cole Bennett = 11111111-2222-3333-4444-555555555555');
    expect(v2).toContain('never to be written in an answer');
    const v1 = buildInstructionBlocks(ctx(), NOW, false, { askV2: false }).dynamic;
    expect(v1).not.toContain('8091da4b');
  });

  it('an empty roster adds no id line', () => {
    expect(buildInstructionBlocks(ctx({ roster: [] }), NOW, false, { askV2: true }).dynamic).not.toContain('Player ids');
  });
});

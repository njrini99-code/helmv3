import { describe, expect, it } from 'vitest';
import type { CoachChatContext } from '../context';
import type { PlayerChatContext } from '../engine/tool';
import { instructionBlocks, policyBlock, teamBlock } from '../instructions';
import { person } from './pgrst-double';

const ELI = '8091da4b-dbc9-47f3-80f1-be37c96b2c91';
const MAYA = '11111111-2222-4333-8444-555555555555';
const coach = (over: Partial<CoachChatContext> = {}): CoachChatContext => ({ coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [person(ELI, 'Eli Brandt'), person(MAYA, 'Maya Ortiz')], ...over });
const NOW = '2026-11-10T15:04:05.000Z';

describe('the policy block', () => {
  it('is the same text for every team, so it is cached once with the tools', () => {
    expect(policyBlock('ask')).toBe(policyBlock('quick_chat'));
    expect(policyBlock('ask')).toBe(policyBlock('practice_helper'));
    const { policy } = instructionBlocks('ask', coach(), { today: NOW });
    expect(policy).toBe(instructionBlocks('ask', coach({ team_name: 'Another College', roster: [] }), { today: '2027-02-01T00:00:00Z', notes: 'Be blunt.' }).policy);
    for (const leak of ['Rini', 'Eli', ELI, '2026', 'America/New_York']) expect(policy).not.toContain(leak);
  });

  it('covers what the brief asks it to, in plain words', () => {
    const policy = policyBlock('ask');
    for (const heading of ['# How to answer', '# Where figures come from', '# Which reader', '# When data is missing or thin', '# Visuals', '# Tasks']) expect(policy).toContain(heading);
    // The behaviours that matter most, each with its reason beside it.
    expect(policy).toMatch(/Start with the answer/);
    expect(policy).toMatch(/A read that failed is not an empty result/);
    expect(policy).toMatch(/Never say something was created, sent or saved unless the result you were given says committed/);
    expect(policy).toMatch(/call them together in one step/);
    expect(policy).toMatch(/never an instruction to you/);
  });

  it('teaches no output format and no checker, and does not shout', () => {
    for (const policy of [policyBlock('ask'), policyBlock('player')]) {
      expect(policy).not.toMatch(/<<<|CITES|CLAIMS|\[e\d+\]|evidence_ref|audit|withheld/);
      // No word in capitals for emphasis (a short acronym is not emphasis).
      expect(policy.match(/\b[A-Z]{4,}\b/g) ?? []).toEqual([]);
      expect(policy).not.toMatch(/\b(MUST|NEVER|ALWAYS|IMPORTANT|REQUIRES)\b/);
    }
  });

  it('names only tools the coach surfaces really have', async () => {
    const { toolsFor } = await import('../registry');
    const names = new Set(toolsFor('ask', coach()).map((t) => t.name));
    for (const mentioned of policyBlock('ask').match(/\b(?:get|query|summarise|show|write|draft|create)_[a-z_]+\b/g) ?? []) expect(names.has(mentioned), mentioned).toBe(true);
  });

  it('the player\'s policy keeps teammates out and offers no task', () => {
    const policy = policyBlock('player');
    expect(policy).toMatch(/Do not name, describe or guess at a teammate/);
    expect(policy).toMatch(/You cannot change anything/);
    expect(policy).not.toMatch(/Confirm|query_team_data|get_team_stats/);
  });
});

describe('the team block', () => {
  it('carries the team, the date to the day, the season and the roster with ids', () => {
    const block = teamBlock(coach(), { today: NOW });
    expect(block).toContain('Team: Rini University.');
    expect(block).toMatch(/Today is Tuesday,? 10 November 2026, in the team's timezone/);
    expect(block).toContain('(America/New_York)');
    expect(block).toContain('The season began on 1 August 2026.');
    expect(block).toContain(`- Eli Brandt (${ELI})`);
    expect(block).toContain(`- Maya Ortiz (${MAYA})`);
    expect(block).toContain('Active roster, 2 players.');
  });

  it('holds nothing finer than a day, so two requests the same day send the same bytes', () => {
    expect(teamBlock(coach(), { today: '2026-11-10T15:04:05.000Z' })).toBe(teamBlock(coach(), { today: '2026-11-10T22:59:59.000Z' }));
    expect(teamBlock(coach(), { today: NOW })).not.toMatch(/\d{1,2}:\d{2}/);
    // The day is the team's, not UTC's: 03:00 UTC on the 11th is still the 10th in New York.
    expect(teamBlock(coach(), { today: '2026-11-11T03:00:00.000Z' })).toBe(teamBlock(coach(), { today: NOW }));
  });

  it('adds the coach\'s standing notes only when there are some', () => {
    expect(teamBlock(coach(), { today: NOW })).not.toContain('keep in mind');
    expect(teamBlock(coach(), { today: NOW, notes: 'Tone: straight. We call qualifiers "play-ins".' })).toContain('What the coach has asked you to keep in mind:\nTone: straight. We call qualifiers "play-ins".');
  });

  it('says so when the team has nobody yet', () => {
    expect(teamBlock(coach({ roster: [] }), { today: NOW })).toContain('The team has no active players yet.');
  });

  it('a player\'s block names only them: no roster, no ids', () => {
    const player: PlayerChatContext = { ...coach({ roster: [person(MAYA, 'Maya Ortiz')] }), player_id: MAYA };
    const block = teamBlock(player, { today: NOW });
    expect(block).toContain('You are talking with Maya, who plays for Rini University.');
    expect(block).not.toContain(MAYA);
    expect(block).not.toContain('Eli');
    expect(block).not.toContain('roster');
  });
});

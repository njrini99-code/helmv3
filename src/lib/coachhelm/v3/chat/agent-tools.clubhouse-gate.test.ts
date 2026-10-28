import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from './context';

/**
 * `get_team_rounds` and `get_qualifiers` were built for Clubhouse's Ask. The
 * chat engine is shared with Fairway, so they are registered only when
 * Clubhouse is on for the coach's team (`isClubhouseForTeam`: the
 * `golf_clubhouse_ui` flag, then the `HELM_CLUBHOUSE_TEAMS` allowlist). A tool
 * that is not in the tool set is not offered to the model and cannot be called.
 */

const flags = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => flags.on.has(id) }));

import { buildCoachTools } from './agent-tools';

const CLUBHOUSE_TOOLS = ['get_team_rounds', 'get_qualifiers'];

function ctx(): CoachChatContext {
  return {
    coach_id: 'c1',
    user_id: 'u1',
    team_id: 'team-1',
    team_name: 'Rini University',
    timezone: 'America/New_York',
    roster: [],
  };
}

function toolNames(): string[] {
  const tools = buildCoachTools({
    sb: { from: vi.fn() } as never,
    ctx: ctx(),
    conversationId: null,
    writer: { write: vi.fn() } as never,
    collect: vi.fn(),
  });
  return Object.keys(tools);
}

describe('CoachChat whole-team tools follow golf_clubhouse_ui', () => {
  const savedTeams = process.env.HELM_CLUBHOUSE_TEAMS;
  beforeEach(() => {
    flags.on.clear();
    delete process.env.HELM_CLUBHOUSE_TEAMS;
  });
  afterEach(() => {
    if (savedTeams === undefined) delete process.env.HELM_CLUBHOUSE_TEAMS;
    else process.env.HELM_CLUBHOUSE_TEAMS = savedTeams;
  });

  it('leaves both tools out while the flag is off', () => {
    const names = toolNames();
    for (const t of CLUBHOUSE_TOOLS) expect(names).not.toContain(t);
    // The rest of the read set is untouched.
    expect(names).toContain('get_recent_rounds');
  });

  it('offers both tools while the flag is on', () => {
    flags.on.add('golf_clubhouse_ui');
    const names = toolNames();
    for (const t of CLUBHOUSE_TOOLS) expect(names).toContain(t);
  });

  it('leaves them out when the flag is on but the team is not on the Clubhouse allowlist', () => {
    flags.on.add('golf_clubhouse_ui');
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-2,team-3';
    const names = toolNames();
    for (const t of CLUBHOUSE_TOOLS) expect(names).not.toContain(t);
  });

  it('offers them when the flag is on and the team is on the allowlist', () => {
    flags.on.add('golf_clubhouse_ui');
    process.env.HELM_CLUBHOUSE_TEAMS = 'team-2,team-1';
    const names = toolNames();
    for (const t of CLUBHOUSE_TOOLS) expect(names).toContain(t);
  });

  it('get_tournaments still answers to its own flag, not this one', () => {
    flags.on.add('golf_clubhouse_ui');
    expect(toolNames()).not.toContain('get_tournaments');
  });
});

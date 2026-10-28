import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

/**
 * `get_team_rounds` and `get_qualifiers` were built for Clubhouse's Ask. The
 * chat engine is shared with Fairway, so they are registered only when
 * Clubhouse is on for the coach's team. The chat route decides that with
 * `isClubhouseForTeam` (the `golf_clubhouse_ui` flag, then the
 * `HELM_CLUBHOUSE_TEAMS` allowlist; its own tests cover both) and passes it in
 * as `teamTools`, since code outside src/clubhouse may not import the gate. A
 * tool that is not in the tool set is not offered to the model and cannot be
 * called.
 */

const flags = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => flags.on.has(id) }));

import { buildCoachTools } from '../agent-tools';

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

function toolNames(teamTools?: boolean): string[] {
  const tools = buildCoachTools({
    sb: { from: vi.fn() } as never,
    ctx: ctx(),
    conversationId: null,
    writer: { write: vi.fn() } as never,
    collect: vi.fn(),
    ...(teamTools === undefined ? {} : { teamTools }),
  });
  return Object.keys(tools);
}

describe('CoachChat whole-team tools follow Clubhouse for the team', () => {
  beforeEach(() => {
    flags.on.clear();
  });

  it('leaves both tools out when the caller says nothing (fails closed)', () => {
    const names = toolNames();
    for (const t of CLUBHOUSE_TOOLS) expect(names).not.toContain(t);
    // The rest of the read set is untouched.
    expect(names).toContain('get_recent_rounds');
  });

  it('leaves both tools out when Clubhouse is off for the team', () => {
    const names = toolNames(false);
    for (const t of CLUBHOUSE_TOOLS) expect(names).not.toContain(t);
  });

  it('offers both tools when Clubhouse is on for the team', () => {
    const names = toolNames(true);
    for (const t of CLUBHOUSE_TOOLS) expect(names).toContain(t);
  });

  it('get_tournaments still answers to its own flag, not this gate', () => {
    expect(toolNames(true)).not.toContain('get_tournaments');
    flags.on.add('golf_tournaments_v1');
    expect(toolNames(false)).toContain('get_tournaments');
  });

  it('the chat route decides teamTools with the Clubhouse team gate', () => {
    const route = readFileSync(
      resolve(__dirname, '../../../../../app/api/coachhelm/v3/chat/stream/route.ts'),
      'utf8',
    );
    expect(route).toMatch(/import \{ isClubhouseForTeam \} from '@\/clubhouse\/gate';/);
    expect(route).toMatch(/teamTools: isClubhouseForTeam\(ctx\.team_id\)/);
  });
});

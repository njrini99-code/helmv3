import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { CoachChatContext } from '../context';
import { toolsFor } from '../registry';
import { person } from './pgrst-double';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));

/**
 * A tool marked `draft` has its named input fields shown to the coach while the model writes them (engine E31). The
 * engine shows top-level fields only, so a name that is not one would show nothing; and only words a coach reads
 * (a message, a document, a plan's blocks) are worth watching.
 */
const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Rini University', timezone: 'America/New_York', roster: [person('00000000-0000-4000-8000-000000000001', 'Eli Brandt')] };

describe('the tools a coach watches being written', () => {
  const drafted = toolsFor('ask', coach).filter((t) => t.draft);

  it('are the ones whose input is words the coach will read', () => {
    expect(Object.fromEntries(drafted.map((t) => [t.name, t.draft!.fields]))).toMatchObject({
      write_artifact: ['title', 'body'],
      draft_message: ['content'],
      draft_practice_plan: ['title', 'blocks'],
      publish_artifact: ['title', 'body'],
      create_team_announcement: ['title', 'body'],
    });
  });

  it('name only top-level fields of the tool’s own input', () => {
    expect(drafted.length).toBeGreaterThan(0);
    for (const tool of drafted) {
      const schema = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as { properties?: Record<string, unknown> };
      for (const field of tool.draft!.fields) expect(Object.keys(schema.properties ?? {}), `${tool.name}.${field}`).toContain(field);
    }
  });
});

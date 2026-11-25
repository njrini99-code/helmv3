import { it, vi } from 'vitest';
import type { CoachChatContext } from '../../context';
import { strictCostOf, strictToolNames } from '../../engine/model';
import { toolsFor } from '../../registry';
import { strictInput } from '../../strict-input';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));
const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 't1', team_name: 'Rini University', timezone: 'America/New_York', roster: [] };
it('probe', () => {
  const tools = toolsFor('ask', coach);
  const strict = strictToolNames(tools);
  const tasks = tools.filter((t) => t.kind === 'task').map((t) => `${strict.has(t.name) ? 'S' : '-'} ${t.name}`);
  console.info(`PROBE strict ${strict.size} of ${tools.length}\n${tasks.join('\n')}`);
  void strictCostOf; void strictInput;
});

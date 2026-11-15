import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/coachhelm/v3/insight-visibility', () => ({ applyInsightVisibility: <T>(q: T) => q }));

import type { CoachChatContext } from '../context';
import { getRootCauses } from '../engine-reads';
import { person, pgrst } from './pgrst-double';

/**
 * Stored insights carry "Per Research doc §4" in their text (the rules that write them cite the research document).
 * A reader must not hand that to the model, or it is quoted to a coach (CONTRACT_NOTES K8).
 */
const P1 = '00000000-0000-4000-8000-000000000001';
const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Rini University', timezone: 'America/New_York', roster: [person(P1, 'Eli Brandt')] };

describe('a stored cause reaches the model without its pointer to the research document', () => {
  it('strips the reference from the title and the text, and leaves the rest as written', async () => {
    const { sb } = pgrst({ golf_coach_insights: { rows: [{ id: 'i1', player_id: P1, title: 'Decel under pressure (Research doc §9)', category: 'putting', evidence: { cause: { state: 'open', word: 'tempo', text: 'Per Research doc §4, short putts are left short late in rounds.' } } }] } });
    const out = await getRootCauses(sb, coach, { player_id: P1 });
    const [cause] = (out.detail as { causes: Array<{ title: string; text: string | null }> }).causes;
    expect(JSON.stringify(cause)).not.toMatch(/Research doc|§/);
    expect(cause?.title).toMatch(/^Decel under pressure/);
    expect(cause?.text).toBe('Short putts are left short late in rounds.');
  });
});

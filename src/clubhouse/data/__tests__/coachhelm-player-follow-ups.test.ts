import { describe, expect, it } from 'vitest';
import { playerFollowUps } from '../coachhelm-chat-thread';

const env = (metric_id: string) => ({ coverage: 'full', measurements: [{ metric_id, entity: { kind: 'player', id: 'p1', label: 'Cole Bennett' } }] }) as never;

describe("a player's next steps", () => {
  it('never offer a write, a teammate comparison, or a third-person name', () => {
    const coach = ['Create a focus area for Cole Bennett on putting', 'Build a putting practice for Cole Bennett', 'Compare Cole Bennett with the rest of the team'];
    const out = playerFollowUps(coach, [env('sg_putting')]);
    expect(out.length).toBeGreaterThan(0);
    for (const line of out) {
      expect(line).not.toMatch(/Create|Build|Send|Compare .* with the rest|Cole Bennett/);
    }
    expect(out).toContain('Break my putting down by distance');
  });
  it('stay empty when the answer had none', () => {
    expect(playerFollowUps([], [env('sg_putting')])).toEqual([]);
  });
});

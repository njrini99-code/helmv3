import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChFilePlan } from '../../../../data/coachhelm-file-shape';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));

const { PlanCard } = await import('../cards');

/**
 * The player file's goal card (stats and charts audit 2026-11-15, CH-07): better is up, so a player cutting three-putts from 1.2
 * towards 0.5 draws a rising line, as every other trend in the app does. It once drew higher values higher whatever the goal.
 */
afterEach(cleanup);

const plan = (goal: NonNullable<ChFilePlan['goal']>): ChFilePlan =>
  ({ stage: 'accepted', focusId: 'f1', title: 'Putting', fromInsight: null, since: 'Oct 2', handshake: { suggested: 'Oct 1', shown: 'Oct 1', accepted: 'Oct 2', declined: null }, goal, practice: null, coach: 'Coach Reed' }) as ChFilePlan;
const goal = (lowerBetter: boolean, values: number[], target: number): NonNullable<ChFilePlan['goal']> => ({
  title: 'Three-putts a round',
  line: `${values.length} check-ins`,
  word: 'No clear change',
  target,
  points: values.map((value, i) => ({ label: `Oct ${i + 1}`, value })),
  worse: false,
  lowerBetter,
});
const dots = (container: HTMLElement) => [...container.querySelectorAll('.goal circle')].map((c) => Number(c.getAttribute('cy')));

describe('GoalBlock · better is up (CH-07)', () => {
  it('a lower-is-better goal falling from 1.2 to 0.8 draws its last check-in above its first', () => {
    const { container } = render(<PlanCard plan={plan(goal(true, [1.2, 1.0, 0.8], 0.5))} lens="coach" first="Ava" />);
    const ys = dots(container);
    expect(ys[2]!).toBeLessThan(ys[0]!);
  });

  it('a higher-is-better goal rising from 50 to 58 draws its last check-in above its first too', () => {
    const { container } = render(<PlanCard plan={plan(goal(false, [50, 54, 58], 60))} lens="coach" first="Ava" />);
    const ys = dots(container);
    expect(ys[2]!).toBeLessThan(ys[0]!);
  });

  it('the badge says the word the shape gave it', () => {
    const { container } = render(<PlanCard plan={plan(goal(true, [1.2, 1.3, 0.9], 0.5))} lens="coach" first="Ava" />);
    expect(container.querySelector('.goal')!.textContent).toContain('No clear change');
  });
});

import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Goals on the Development tab (par-18, par-19): Set a goal, the suggestions rail, and a goal's state and coach controls. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const goals = vi.hoisted(() => ({
  createGoal: vi.fn(),
  suggestGoalTarget: vi.fn(),
  acceptGoalSuggestion: vi.fn(),
  dismissGoalSuggestion: vi.fn(),
  pauseGoal: vi.fn(),
  resumeGoal: vi.fn(),
  abandonGoal: vi.fn(),
}));
vi.mock('@/app/golf/actions/v3/goals', () => goals);

import { GoalSetButton, GoalStatus, GoalSuggestions } from '../screens/stats/Goals';
import { goalStateWords } from '../screens/stats/goal-words';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

const code = (c: string) => [...document.querySelectorAll(`[data-ch-code="${c}"]`)][0] ?? null;
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}
const wrap = (node: React.ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>{node}</ToastProvider>
    </LazyMotion>,
  );

const standing = {
  ok: true,
  metric_id: 'sg_putting',
  display_label: 'SG: Putting',
  unit: 'strokes',
  direction: 'higher_better',
  hasStanding: true,
  baseline: -0.8,
  pga_value: 0,
  cohort_value: -0.2,
  anchor: 'cohort',
  suggested_target: -0.5,
  no_target_reason: null,
};

beforeEach(() => {
  for (const fn of Object.values(goals)) fn.mockReset();
  router.refresh.mockReset();
  goals.suggestGoalTarget.mockResolvedValue(standing);
});
afterEach(cleanup);

async function openSheet(user: ReturnType<typeof userEvent.setup>) {
  wrap(<GoalSetButton />);
  await user.click(screen.getByRole('button', { name: 'Set a goal' }));
  return screen.getByRole('dialog', { hidden: true });
}

describe('Set a goal', () => {
  it('CH-5406 looks up the starting point first, then fills the target in and says what it is based on', async () => {
    let release: (v: unknown) => void = () => {};
    goals.suggestGoalTarget.mockImplementation(() => new Promise((r) => (release = r)));
    const user = userEvent.setup();
    await openSheet(user);
    await expectCode('CH-5406', /Finding your starting point/);
    release(standing);
    await waitFor(() => expect((screen.getByLabelText('Target') as HTMLInputElement).value).toBe('-0.5'));
    expect(document.getElementById('gs-target-help')!.textContent).toMatch(/Filled in: .*halfway to the college average/);
    expect(goals.suggestGoalTarget).toHaveBeenCalledWith('sg_putting');
  });

  it('only offers the stats that can be measured round by round, by name', async () => {
    const user = userEvent.setup();
    await openSheet(user);
    const options = within(screen.getByLabelText('Stat')).getAllByRole('option', { hidden: true }).map((o) => o.textContent);
    expect(options).toEqual(['Strokes gained: total', 'Strokes gained: off the tee', 'Strokes gained: approach', 'Strokes gained: around the green', 'Strokes gained: putting', 'Scrambling from sand', 'Penalties per round', 'Greens in regulation']);
  });

  it('CH-5006 CH-5405 starts the goal as the engine’s midpoint when the fill-in is untouched, and refreshes the page', async () => {
    let release: (v: unknown) => void = () => {};
    goals.createGoal.mockImplementation(() => new Promise((r) => (release = r)));
    const user = userEvent.setup();
    await openSheet(user);
    await waitFor(() => expect((screen.getByLabelText('Target') as HTMLInputElement).value).toBe('-0.5'));
    await user.click(screen.getByLabelText('Share with my coach'));
    await user.click(screen.getByRole('button', { name: 'Start goal' }));
    await expectCode('CH-5405', /Starting…/);
    const sent = goals.createGoal.mock.calls[0]![0];
    expect(sent).toMatchObject({ metric_id: 'sg_putting', title: 'Strokes gained: putting, 30-day goal', category: 'manual', target_value: -0.5, target_source: 'midpoint', baseline_value: -0.8, shared_with_coach: true });
    const days = Math.round((Date.parse(sent.ends_at) - Date.now()) / 86_400_000);
    expect(days).toBe(30);
    release({ ok: true, goal_id: 'g1' });
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it('CH-5006 sends a typed target as the player’s own, and keeps the sheet and the number when the server refuses', async () => {
    goals.createGoal.mockResolvedValue({ ok: false, error: 'The target must be better than where the player is now, or the goal is met on day one.' });
    const user = userEvent.setup();
    await openSheet(user);
    await waitFor(() => expect((screen.getByLabelText('Target') as HTMLInputElement).value).toBe('-0.5'));
    await user.clear(screen.getByLabelText('Target'));
    await user.type(screen.getByLabelText('Target'), '-1.5');
    await user.click(screen.getByRole('button', { name: 'Start goal' }));
    await expectCode('CH-5006', /Couldn’t start the goal/);
    expect(goals.createGoal.mock.calls[0]![0]).toMatchObject({ target_value: -1.5, target_source: 'manual' });
    expect((screen.getByLabelText('Target') as HTMLInputElement).value).toBe('-1.5');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('CH-5103 asks for a target instead of sending a goal with none', async () => {
    goals.suggestGoalTarget.mockResolvedValue({ ...standing, suggested_target: null, no_target_reason: 'already_ahead' });
    const user = userEvent.setup();
    await openSheet(user);
    await waitFor(() => expect(document.getElementById('gs-target-help')!.textContent).toMatch(/ahead of the Tour/));
    await user.click(screen.getByRole('button', { name: 'Start goal' }));
    await expectCode('CH-5103', /Enter a target number/);
    expect(goals.createGoal).not.toHaveBeenCalled();
  });

  it('CH-5325 says so when there is no starting point to base a target on, and when the look-up fails', async () => {
    goals.suggestGoalTarget.mockResolvedValue({ ...standing, hasStanding: false, baseline: null, suggested_target: null });
    const user = userEvent.setup();
    await openSheet(user);
    await expectCode('CH-5325', /No starting point yet/);
    cleanup();
    goals.suggestGoalTarget.mockRejectedValue(new Error('boom'));
    await openSheet(user);
    await expectCode('CH-5325', /Couldn’t look up your starting point/);
  });
});

describe('Suggested goals', () => {
  const items = [
    { id: 's1', metric: 'sg_approach', target: 0.1, days: 30 },
    { id: 's2', metric: 'gir_pct', target: 62, days: 60 },
  ];

  it('draws nothing when there are none, and says so when the read failed rather than passing for none', () => {
    const none = wrap(<GoalSuggestions items={[]} error={false} />);
    expect(none.container.querySelector('.ch-gs')).toBeNull();
    cleanup();
    wrap(<GoalSuggestions items={undefined} error />);
    expect(code('CH-5214')).not.toBeNull();
    expect(screen.getByText(/Suggested goals didn’t load/)).toBeTruthy();
  });

  it('CH-5007 CH-5405 Accept starts the goal; a refused one stays suggested', async () => {
    let release: (v: unknown) => void = () => {};
    goals.acceptGoalSuggestion.mockImplementation(() => new Promise((r) => (release = r)));
    const user = userEvent.setup();
    wrap(<GoalSuggestions items={items} error={false} />);
    expect(screen.getByText('Aim for +0.10 over 30 days')).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Answer Strokes gained: approach' });
    await user.click(within(group).getByRole('button', { name: 'Accept' }));
    await expectCode('CH-5405', /Starting…/);
    expect(within(group).getByRole('button', { name: 'Dismiss' })).toHaveProperty('disabled', true);
    expect(goals.acceptGoalSuggestion).toHaveBeenCalledWith('s1');
    release({ ok: false, error: 'Suggestion already acted on' });
    await expectCode('CH-5007', /Couldn’t start Strokes gained: approach/);
    expect(router.refresh).not.toHaveBeenCalled();
    goals.acceptGoalSuggestion.mockResolvedValue({ ok: true, goal_id: 'g2' });
    await user.click(within(group).getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it('CH-5008 Dismiss sets it aside', async () => {
    goals.dismissGoalSuggestion.mockResolvedValue({ ok: false, error: 'nope' });
    const user = userEvent.setup();
    wrap(<GoalSuggestions items={items} error={false} />);
    const group = screen.getByRole('group', { name: 'Answer Greens in regulation' });
    await user.click(within(group).getByRole('button', { name: 'Dismiss' }));
    expect(goals.dismissGoalSuggestion).toHaveBeenCalledWith('s2');
    await expectCode('CH-5008', /Couldn’t dismiss Greens in regulation/);
    goals.dismissGoalSuggestion.mockResolvedValue({ ok: true });
    await user.click(within(group).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });
});

describe('A goal’s state and the coach’s controls', () => {
  it('names a goal that is not simply in progress, and keeps the quiet screen-reader word for the two that are', () => {
    expect(goalStateWords('paused')).toBe('Paused');
    expect(goalStateWords('abandoned')).toBe('Abandoned');
    expect(goalStateWords('missed')).toBe('Not reached');
    expect(goalStateWords('active')).toBeNull();
    wrap(<GoalStatus id="g1" title="Putting" state="paused" coach={false} />);
    expect(screen.getByText('Paused')).toBeTruthy();
    cleanup();
    wrap(<GoalStatus id="g1" title="Putting" state="active" coach={false} />);
    expect(screen.getByText('In progress').className).toContain('ch-sr-only');
  });

  it('gives a player no controls', () => {
    wrap(<GoalStatus id="g1" title="Putting" state="active" coach={false} />);
    expect(screen.queryByRole('group', { name: /^Change / })).toBeNull();
  });

  it('CH-5009 a coach pauses an active goal, resumes a paused one, and a refusal says so', async () => {
    goals.pauseGoal.mockResolvedValue({ ok: false, error: 'Goal not found or not permitted' });
    const user = userEvent.setup();
    wrap(<GoalStatus id="g1" title="Putting" state="active" coach />);
    const group = screen.getByRole('group', { name: 'Change Putting' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Pause', 'Abandon']);
    await user.click(within(group).getByRole('button', { name: 'Pause' }));
    expect(goals.pauseGoal).toHaveBeenCalledWith('g1');
    await expectCode('CH-5009', /Couldn’t pause Putting/);
    cleanup();
    goals.resumeGoal.mockResolvedValue({ ok: true });
    wrap(<GoalStatus id="g1" title="Putting" state="paused" coach />);
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(goals.resumeGoal).toHaveBeenCalledWith('g1');
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it('CH-5501 abandoning asks first, and Keep it leaves the goal alone', async () => {
    goals.abandonGoal.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    wrap(<GoalStatus id="g1" title="Putting" state="active" coach />);
    await user.click(screen.getByRole('button', { name: 'Abandon' }));
    const dialog = screen.getByRole('dialog', { name: 'Abandon this goal?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(goals.abandonGoal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Abandon' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Abandon this goal?' })).getByRole('button', { name: 'Abandon goal' }));
    expect(goals.abandonGoal).toHaveBeenCalledWith('g1');
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it('offers nothing to change on an achieved or abandoned goal', () => {
    wrap(<GoalStatus id="g1" title="Putting" state="abandoned" coach />);
    expect(screen.queryByRole('group', { name: /^Change / })).toBeNull();
  });
});

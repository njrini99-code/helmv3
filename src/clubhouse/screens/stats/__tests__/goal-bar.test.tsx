import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GoalBar } from '../MiniCharts';

afterEach(cleanup);

/** Codex review on #2606: the whole bar was aria-hidden, so a screen reader never heard a goal's target. */
describe('a goal’s bar', () => {
  it('hides only its rail: the start and target are read', () => {
    const { container } = render(<GoalBar progress={40} start="74" target="69" />);
    expect(container.querySelector('.ch-shs-gbar__t')?.getAttribute('aria-hidden')).toBe('true');
    const key = container.querySelector('.ch-shs-gbar__k')!;
    expect(key.closest('[aria-hidden="true"]')).toBeNull();
    expect(key.textContent).toContain('Target 69');
    expect(key.textContent).toContain('Start 74');
  });
});

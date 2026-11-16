import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PP_COACHES, PP_NAMES, PP_PLAN_PART } from '../../../preview/fixtures-practice-plan';
import { toSheetModel } from '../../coachhelm/plan/sheet/plan-sheet-model';
import { PrintStudio } from '../PrintStudio';

/**
 * GAP-R-16: the browser's own Print (Cmd+P) on the Print studio prints the picked sheets, not the studio's controls.
 * On `beforeprint` the studio mounts the same print root its Print button mounts (the print rules show only that root),
 * and takes it off on `afterprint`. The real PrintPlan is used here: no mock between the studio and the root.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../../lib/use-phone', () => ({ useChPhone: () => false }));

const plan = toSheetModel(
  { body: PP_PLAN_PART.draft.body, why: PP_PLAN_PART.draft.why, title: 'Short game', team: 'Demo', start: new Date('2026-11-05T19:00:00Z'), end: new Date('2026-11-05T22:00:00Z'), zone: 'America/New_York', coaches: PP_COACHES, names: PP_NAMES, state: 'Published' },
  'coach',
);
const roots = () => document.querySelectorAll('body > .ch-cp-print-root');
const fire = (type: 'beforeprint' | 'afterprint') => act(() => void window.dispatchEvent(new Event(type)));

afterEach(() => {
  cleanup();
  document.querySelectorAll('.ch-cp-print-root').forEach((el) => el.remove());
});

describe('the Print studio and the browser’s own Print', () => {
  it('beforeprint puts the picked sheets on the print root; afterprint takes them off', () => {
    render(<PrintStudio plan={plan} drills={[]} planHref="/x" />);
    expect(roots()).toHaveLength(0);
    fire('beforeprint');
    expect(roots()).toHaveLength(1);
    const root = roots()[0]!;
    expect(root.getAttribute('data-ui')).toBe('clubhouse');
    expect(root.querySelector('.ch-cp-sheet')).not.toBeNull();
    // The paper size is set for this print only.
    expect([...document.head.querySelectorAll('style')].some((s) => s.textContent?.includes('@page'))).toBe(true);
    fire('afterprint');
    expect(roots()).toHaveLength(0);
    expect([...document.head.querySelectorAll('style')].some((s) => s.textContent?.includes('@page'))).toBe(false);
  });

  it('prints what the switches pick at the time, and nothing when every switch is off', () => {
    render(<PrintStudio plan={plan} drills={[]} planHref="/x" />);
    for (const s of screen.getAllByRole('switch')) if ((s as HTMLInputElement).checked) fireEvent.click(s);
    fire('beforeprint');
    expect(roots()).toHaveLength(0);
  });

  it('a second print replaces the first rather than stacking roots', () => {
    render(<PrintStudio plan={plan} drills={[]} planHref="/x" />);
    fire('beforeprint');
    fire('beforeprint');
    expect(roots()).toHaveLength(1);
    fire('afterprint');
    expect(roots()).toHaveLength(0);
  });

  it('leaving the studio stops listening and leaves no root behind', () => {
    const { unmount } = render(<PrintStudio plan={plan} drills={[]} planHref="/x" />);
    fire('beforeprint');
    unmount();
    expect(roots()).toHaveLength(0);
    fire('beforeprint');
    expect(roots()).toHaveLength(0);
  });
});

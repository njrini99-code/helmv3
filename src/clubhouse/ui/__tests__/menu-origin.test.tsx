import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Menu } from '../Menu';

vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const trigger = (p: Parameters<Parameters<typeof Menu>[0]['trigger']>[0]) => <button {...p}>Actions</button>;
const at = (top: number, left = 300) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + 34, left, right: left + 34, width: 34, height: 34, x: left, y: top, toJSON() {} });

/** B16: a menu grows out of its trigger, so its transform origin is the corner nearest the trigger. */
describe('menu origin', () => {
  it('a menu opening above its trigger grows from the bottom', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
    at(720);
    const view = render(<Menu label="Actions" items={[{ label: 'Copy link' }, { label: 'Delete' }]} trigger={trigger} />);
    fireEvent.click(view.getByRole('button', { name: 'Actions' }));
    expect(view.getByRole('menu').style.transformOrigin).toBe('bottom right');
  });

  it('a menu opening below its trigger grows from the top, on the side it is aligned to', () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
    at(80);
    const view = render(<Menu label="Actions" align="start" items={[{ label: 'Copy link' }]} trigger={trigger} />);
    fireEvent.click(view.getByRole('button', { name: 'Actions' }));
    expect(view.getByRole('menu').style.transformOrigin).toBe('top left');
  });
});

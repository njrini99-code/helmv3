import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { HomeActions } from '../HomeActions';

afterEach(() => {
  cleanup();
  push.mockClear();
});

/** B11: Home's N opens a new event, but not over a dialog, in a field, or while a modal is open. */
describe('Home N', () => {
  it('opens a new event from the page', () => {
    render(<HomeActions teamChatId={null} />);
    fireEvent.keyDown(document.body, { key: 'n' });
    expect(push).toHaveBeenCalledWith('/golf/dashboard/calendar?new=1');
  });
  it('does not fire while a Modal (a native dialog) is open', () => {
    render(
      <>
        <HomeActions teamChatId={null} />
        <dialog open>
          <button type="button">Inside</button>
        </dialog>
      </>,
    );
    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(document.querySelector('dialog button')!, { key: 'n' });
    expect(push).not.toHaveBeenCalled();
  });
  it('does not fire in a field', () => {
    const { container } = render(
      <>
        <HomeActions teamChatId={null} />
        <input aria-label="Search" />
      </>,
    );
    fireEvent.keyDown(container.querySelector('input')!, { key: 'n' });
    expect(push).not.toHaveBeenCalled();
  });
});

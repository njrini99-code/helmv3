import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PostureDisclosure } from '@/app/admin/_components/PostureDisclosure';

const STORAGE_KEY = 'helm-bridge-posture-open';

describe('PostureDisclosure', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders collapsed by default, with children still present in the DOM (native <details>, not an unmount)', () => {
    render(
      <PostureDisclosure>
        <p>KPI content</p>
      </PostureDisclosure>,
    );
    const details = screen.getByText('KPI content').closest('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
  });

  it('persists a manual toggle to localStorage', () => {
    render(
      <PostureDisclosure>
        <p>KPI content</p>
      </PostureDisclosure>,
    );
    const details = screen.getByText('KPI content').closest('details')!;

    // Exercise the native toggle mechanics directly (open + a real `toggle`
    // event) rather than relying on jsdom's click-to-toggle implementation
    // for <details> — this asserts the component's own onToggle→localStorage
    // wiring regardless of that.
    details.open = true;
    fireEvent(details, new Event('toggle'));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');

    details.open = false;
    fireEvent(details, new Event('toggle'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('0');
  });

  it('restores an open state from localStorage on mount, before first paint', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    render(
      <PostureDisclosure>
        <p>KPI content</p>
      </PostureDisclosure>,
    );
    const details = screen.getByText('KPI content').closest('details')!;
    expect(details.open).toBe(true);
  });

  it('degrades to the closed default without throwing when localStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage access blocked');
      },
    });

    expect(() =>
      render(
        <PostureDisclosure>
          <p>KPI content</p>
        </PostureDisclosure>,
      ),
    ).not.toThrow();
    const details = screen.getByText('KPI content').closest('details')!;
    expect(details.open).toBe(false);

    if (original) Object.defineProperty(window, 'localStorage', original);
  });
});

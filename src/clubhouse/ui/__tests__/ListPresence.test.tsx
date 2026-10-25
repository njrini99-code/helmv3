import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domMax } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListPresence, PresenceRow } from '../ListPresence';

const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
});

const list = (ids: string[]) => (
  <LazyMotion features={domMax}>
    <ul>
      <ListPresence>
        {ids.map((id) => (
          <PresenceRow key={id} className="row">
            {id}
          </PresenceRow>
        ))}
      </ListPresence>
    </ul>
  </LazyMotion>
);

// A new function, not a spy: the setup's matchMedia is a vi.fn, and a spy on it would keep this implementation after the test.
const reduceMotion = () => {
  window.matchMedia = ((query: string) =>
    ({ matches: query.includes('reduce'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList) as typeof window.matchMedia;
};

/** B7: rows arrive and leave in place, and a removed row stays until its height has closed. */
describe('ListPresence', () => {
  it('a removed row stays mounted, marked leaving and hidden, until its animation ends, then unmounts', async () => {
    const { rerender } = render(list(['a', 'b', 'c']));
    expect(screen.getByText('b').hasAttribute('data-leaving')).toBe(false);
    rerender(list(['a', 'c']));
    const leaving = screen.getByText('b');
    expect(leaving.hasAttribute('data-leaving')).toBe(true);
    expect(leaving.getAttribute('aria-hidden')).toBe('true');
    expect(leaving.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(screen.queryByText('b')).toBeNull(), { timeout: 3000 });
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['a', 'c']);
  });

  it('first paint does not animate, and leaves the rows to their own stylesheet', () => {
    render(list(['a', 'b']));
    for (const li of screen.getAllByRole('listitem')) {
      expect(li.style.height).toBe('');
      expect(li.style.opacity).toBe('');
      expect(li.style.overflow).toBe('');
    }
  });

  it('an arriving row opens in, then hands its height, opacity and overflow back', async () => {
    const { rerender } = render(list(['a', 'c']));
    rerender(list(['a', 'b', 'c']));
    const b = screen.getByText('b');
    expect(b.style.overflow).toBe('clip');
    await waitFor(() => expect(b.style.height).toBe(''), { timeout: 3000 });
    expect(b.style.opacity).toBe('');
    expect(b.style.overflow).toBe('');
    expect(screen.getByText('a').getAttribute('style') ?? '').not.toMatch(/height|opacity|overflow/);
  });

  it('with reduced motion a removed row unmounts at once', () => {
    reduceMotion();
    const { rerender } = render(list(['a', 'b', 'c']));
    rerender(list(['a', 'c']));
    expect(screen.queryByText('b')).toBeNull();
  });

  it('turning reduced motion on keeps the same row elements (nothing in the list remounts), and an arrival then appears unstyled', () => {
    const { rerender } = render(list(['a', 'b']));
    const before = screen.getByText('a');
    reduceMotion();
    rerender(list(['a', 'b', 'c']));
    expect(screen.getByText('a')).toBe(before);
    expect(screen.getByText('c').getAttribute('style') ?? '').not.toMatch(/height|opacity|overflow/);
  });

  it('flip={false} (a thread, whose scroller sets its own position) keeps arrivals but takes no layout transform', () => {
    const flat = (ids: string[]) => (
      <LazyMotion features={domMax}>
        <ul>
          <ListPresence flip={false}>
            {ids.map((id) => (
              <PresenceRow key={id}>{id}</PresenceRow>
            ))}
          </ListPresence>
        </ul>
      </LazyMotion>
    );
    const { rerender } = render(flat(['b', 'c']));
    rerender(flat(['a', 'b', 'c']));
    expect(screen.getByText('a').style.overflow).toBe('clip');
    expect(screen.getByText('b').style.transform).toBe('');
  });

  it('a PresenceRow outside a ListPresence is a plain row (it never animates in)', () => {
    render(
      <LazyMotion features={domMax}>
        <ul>
          <PresenceRow className="row">solo</PresenceRow>
        </ul>
      </LazyMotion>,
    );
    const li = screen.getByText('solo');
    expect(li.tagName).toBe('LI');
    expect(li.getAttribute('style')).toBeNull();
  });
});

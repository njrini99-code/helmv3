import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domMax } from 'motion/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListPresence, PresenceRow } from '../ListPresence';

/** Settings › Animations, which the list reads with the OS setting (useChMotionMode). */
const prefs = vi.hoisted(() => ({ showAnimations: true }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => prefs }));

const realMatchMedia = window.matchMedia;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.matchMedia = realMatchMedia;
  prefs.showAnimations = true;
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

/** B7, S3.10: rows arrive and leave in place, a removed row stays until it has faded, and no height ever animates. */
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

  it('a removed row fades and shrinks to .96 and never closes its height, padding or margins (MOT-04)', async () => {
    const { rerender } = render(list(['a', 'b', 'c']));
    rerender(list(['a', 'c']));
    const leaving = screen.getByText('b');
    await waitFor(() => expect(leaving.style.transform).toMatch(/scale\(0\.9\d*\)/), { timeout: 3000 });
    expect(leaving.getAttribute('style') ?? '').not.toMatch(/height|padding|margin|border|overflow/);
  });

  it('first paint does not animate, and leaves the rows to their own stylesheet', () => {
    render(list(['a', 'b']));
    for (const li of screen.getAllByRole('listitem')) {
      expect(li.style.height).toBe('');
      expect(li.style.opacity).toBe('');
      expect(li.style.overflow).toBe('');
    }
  });

  it('an arriving row takes its height at once and rises 8px as it fades in, then hands its opacity and transform back (MOT-04)', async () => {
    const { rerender } = render(list(['a', 'c']));
    rerender(list(['a', 'b', 'c']));
    const b = screen.getByText('b');
    expect(b.style.opacity).toBe('0');
    expect(b.style.transform).toBe('translateY(8px)');
    expect(b.getAttribute('style') ?? '').not.toMatch(/height|overflow/);
    await waitFor(() => expect(b.style.opacity).toBe(''), { timeout: 3000 });
    expect(b.style.transform).toBe('');
    expect(screen.getByText('a').getAttribute('style') ?? '').not.toMatch(/height|opacity|overflow/);
  });

  it('with Reduce Motion a removed row fades out, opacity only, never a snap; then it unmounts', async () => {
    reduceMotion();
    const { rerender } = render(list(['a', 'b', 'c']));
    rerender(list(['a', 'c']));
    const leaving = screen.getByText('b');
    expect(leaving.hasAttribute('data-leaving')).toBe(true);
    await waitFor(() => expect(screen.queryByText('b')).toBeNull(), { timeout: 3000 });
    expect(leaving.getAttribute('style') ?? '').not.toMatch(/transform|height/);
  });

  it('with Animations off a removed row unmounts at once', () => {
    prefs.showAnimations = false;
    const { rerender } = render(list(['a', 'b', 'c']));
    rerender(list(['a', 'c']));
    expect(screen.queryByText('b')).toBeNull();
  });

  it('turning Reduce Motion on keeps the same row elements (nothing in the list remounts), and an arrival then only fades in', () => {
    const { rerender } = render(list(['a', 'b']));
    const before = screen.getByText('a');
    reduceMotion();
    rerender(list(['a', 'b', 'c']));
    expect(screen.getByText('a')).toBe(before);
    expect(screen.getByText('c').style.opacity).toBe('0');
    expect(screen.getByText('c').getAttribute('style') ?? '').not.toMatch(/transform|height|overflow/);
  });

  it('with Animations off an arrival appears unstyled', () => {
    const { rerender } = render(list(['a', 'b']));
    prefs.showAnimations = false;
    rerender(list(['a', 'b', 'c']));
    expect(screen.getByText('c').getAttribute('style') ?? '').not.toMatch(/height|opacity|overflow|transform/);
  });

  // MOTION-AND-VISUAL 3.5 made the list the one insert: a sent message rises like any row, so no row opts out of the arrival
  // any more (the old `noArrival` and Messages' `arrive="inbox"` are gone). A filter or search change is a content swap (3.3).
  it('cut (a filter or search change) swaps the content at once: arrivals unstyled, leavings gone', async () => {
    const swap = (ids: string[], cut = false) => (
      <LazyMotion features={domMax}>
        <ul>
          <ListPresence cut={cut}>
            {ids.map((id) => (
              <PresenceRow key={id}>{id}</PresenceRow>
            ))}
          </ListPresence>
        </ul>
      </LazyMotion>
    );
    const { rerender } = render(swap(['a', 'b']));
    rerender(swap(['b', 'c'], true));
    expect(screen.getByText('c').getAttribute('style') ?? '').not.toMatch(/opacity|transform|height|overflow/);
    await waitFor(() => expect(screen.queryByText('a')).toBeNull(), { timeout: 500 });
    // The next ordinary insert rises again.
    rerender(swap(['b', 'c', 'd']));
    expect(screen.getByText('d').style.opacity).toBe('0');
    expect(screen.getByText('d').style.transform).toBe('translateY(8px)');
  });

  it('rides the vocabulary: insert and FLIP on the base beat and the iOS curve, remove on the quick beat and ease-out (3.5)', () => {
    const src = readFileSync(join(process.cwd(), 'src/clubhouse/ui/ListPresence.tsx'), 'utf8');
    expect(src).toContain('const MOVE = { duration: CH_DUR.base, ease: CH_EASE_IOS };');
    expect(src).toContain("const RISE_FROM = { opacity: 0, transform: 'translateY(8px)' };");
    expect(src).toContain("const LEAVE = { opacity: 0, transform: 'scale(0.96)', transition: { duration: CH_DUR.quick, ease: CH_EASE_OUT } };");
    expect(src).not.toMatch(/chSpringCurve|CH_SPRING_SETTLE_MS|CH_EASE_SHEET/);
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
    expect(screen.getByText('a').style.opacity).toBe('0');
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

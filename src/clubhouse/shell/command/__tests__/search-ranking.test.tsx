import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';
import { CommandLayer } from '../CommandLayer';
import { clearPeople } from '../people';
import { resetRecent } from '../recent';

/**
 * Coach audit 13 Nov 2026 (§2 Search): "larsen" lit "Go to Qualifiers" above Larsen Gallimore, and Enter opened
 * Qualifiers; "Will" lit "New qualifier"; "tar" did not find the Tar Heel Shootout and offered Sawyer Slate. The name a
 * coach types is the first, lit row; tournaments and qualifiers are found by name; a scattered-letter match is not a match.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));
vi.mock('../../../data/palette-people', () => ({ getPalettePeople: vi.fn(async () => null), getPaletteEvents: vi.fn(async () => null) }));

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  push.mockClear();
  window.sessionStorage.clear();
  resetRecent();
  clearPeople();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => cleanup());

const PEOPLE = [
  { id: 'p1', name: 'Larsen Gallimore' },
  { id: 'p2', name: 'Will Gruse' },
  { id: 'p3', name: 'Sawyer Slate' },
  { id: 'p4', name: 'Samanyu Kumar' },
];
const EVENTS = [
  { id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'Tar Heel Shootout', kind: 'tournament' as const, date: '2026-10-25' },
  { id: 'aaaaaaaa-2222-4222-8222-222222222222', name: 'Carolinas Classic', kind: 'tournament' as const, date: '2026-10-04' },
  { id: 'bbbbbbbb-1111-4111-8111-111111111111', name: 'Fall Qualifier 2', kind: 'qualifier' as const, date: '2026-09-15' },
];

/** The palette's role prop, not an ARIA role. */
const COACH = 'coach' as const;

async function open(tournaments = true) {
  render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <main id="ch-canvas" />
        <CommandLayer
          role={COACH}
          pathname="/golf/dashboard"
          userId="u1"
          teamId="t1"
          features={{ tournaments }}
          loadPeople={vi.fn(async () => PEOPLE)}
          loadEvents={vi.fn(async () => EVENTS)}
        />
      </div>
    </LazyMotion>,
  );
  act(() => void fireEvent.keyDown(window, { key: 'k', metaKey: true }));
  // The players and the events are read as it opens.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const palette = () => screen.getByRole('dialog', { name: 'Search Clubhouse' });
const search = (value: string) => fireEvent.change(within(palette()).getByRole('combobox'), { target: { value } });
const options = () => within(palette()).queryAllByRole('option').map((o) => o.querySelector('.ch-cmd-label')?.textContent);
const lit = () => within(palette()).queryAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.querySelector('.ch-cmd-label')?.textContent;

describe('the name a coach types is the first, lit row', () => {
  it('"larsen" lights Larsen Gallimore, and Qualifiers is not offered', async () => {
    await open();
    search('larsen');
    expect(options()[0]).toBe('Larsen Gallimore');
    expect(lit()).toBe('Larsen Gallimore');
    expect(options()).not.toContain('Qualifiers');
  });

  it('"will" lights Will Gruse, above New qualifier', async () => {
    await open();
    search('will');
    expect(lit()).toBe('Will Gruse');
    const o = options();
    if (o.includes('New qualifier')) expect(o.indexOf('Will Gruse')).toBeLessThan(o.indexOf('New qualifier'));
  });

  it('a last name lights the player too', async () => {
    await open();
    search('gruse');
    expect(lit()).toBe('Will Gruse');
  });

  it('a section typed by name is still first ("cal" lights Calendar)', async () => {
    await open();
    search('cal');
    expect(lit()).toBe('Calendar');
  });
});

describe('tournaments and qualifiers are found by name', () => {
  it('"tar" finds the Tar Heel Shootout, lit, and Enter opens its desk; Sawyer Slate is not offered', async () => {
    await open();
    search('tar');
    expect(lit()).toBe('Tar Heel Shootout');
    expect(options()).not.toContain('Sawyer Slate');
    act(() => void fireEvent.keyDown(within(palette()).getByRole('combobox'), { key: 'Enter' }));
    expect(push).toHaveBeenCalledWith('/golf/dashboard/tournaments/aaaaaaaa-1111-4111-8111-111111111111', { scroll: false });
  });

  it('a qualifier opens its page', async () => {
    await open();
    search('fall qual');
    expect(lit()).toBe('Fall Qualifier 2');
    act(() => void fireEvent.keyDown(within(palette()).getByRole('combobox'), { key: 'Enter' }));
    expect(push).toHaveBeenCalledWith('/golf/dashboard/qualifiers/bbbbbbbb-1111-4111-8111-111111111111', { scroll: false });
  });

  it('without Tournaments on for the team, its events are not offered', async () => {
    await open(false);
    search('tar heel');
    expect(options()).not.toContain('Tar Heel Shootout');
  });
});

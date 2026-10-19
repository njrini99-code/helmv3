import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../__tests__/dialog-polyfill';
import { CommandLayer } from '../CommandLayer';
import { clearPeople, publishPeople } from '../people';
import { resetRecent } from '../recent';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));

let desktop = true;
beforeAll(() => {
  // cmdk brings the highlighted row into view; jsdom has no scrollIntoView or ResizeObserver.
  Object.defineProperty(Element.prototype, 'scrollIntoView', { value: vi.fn(), configurable: true, writable: true });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  desktop = true;
  push.mockClear();
  window.sessionStorage.clear();
  resetRecent();
  clearPeople();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({ matches: query.includes('hover: hover') ? desktop : false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function mount(role: 'coach' | 'player' = 'coach', extra: React.ReactNode = null) {
  return render(
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <main id="ch-canvas">{extra}</main>
        <CommandLayer role={role} pathname="/golf/dashboard" userId="u1" teamId="t1" />
      </div>
    </LazyMotion>,
  );
}

const key = (k: string, init: KeyboardEventInit = {}, target: Element | Window = window) => act(() => void fireEvent.keyDown(target, { key: k, ...init }));
const palette = () => screen.getByRole('dialog', { name: 'Search Clubhouse' });
const search = (value: string) => fireEvent.change(within(palette()).getByRole('combobox'), { target: { value } });
const options = () => within(palette()).queryAllByRole('option').map((o) => o.querySelector('.ch-cmd-label')?.textContent);

describe('the palette (Cmd or Ctrl K)', () => {
  it('opens on Cmd K and on Ctrl K, with Go to for the role, and closes on the same chord', () => {
    mount();
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
    key('k', { metaKey: true });
    expect(palette()).toBeInTheDocument();
    expect(options()).toContain('Roster');
    key('k', { metaKey: true });
    expect(screen.queryByRole('dialog', { name: 'Search Clubhouse' })).toBeNull();
    key('k', { ctrlKey: true });
    expect(palette()).toBeInTheDocument();
  });

  it('opens from inside a text field, which is the one shortcut that does', () => {
    mount('coach', <input aria-label="Notes" />);
    const field = screen.getByLabelText('Notes');
    field.focus();
    key('k', { metaKey: true }, field);
    expect(palette()).toBeInTheDocument();
  });

  it('never lists a coach-only action to a player, nor a player-only one to a coach', () => {
    mount('coach');
    key('k', { metaKey: true });
    search('new');
    const coach = options();
    expect(coach).toEqual(expect.arrayContaining(['New event', 'New message', 'New qualifier']));
    expect(coach).not.toContain('New round');
    cleanup();

    mount('player');
    key('k', { metaKey: true });
    search('new');
    const player = options();
    expect(player).toEqual(expect.arrayContaining(['New round', 'New message']));
    for (const coachOnly of ['New event', 'New qualifier', 'Post announcement']) expect(player).not.toContain(coachOnly);
  });

  it('lists each role\'s own sections', () => {
    mount('player');
    key('k', { metaKey: true });
    expect(options()).toEqual(expect.arrayContaining(['Rounds', 'Classes', 'Home']));
    expect(options()).not.toContain('Recruiting');
  });

  it('finds a coach\'s players by name, and never lists a player\'s teammates', () => {
    publishPeople([{ id: 'p1', name: 'Jonah Okafor', detail: 'Sophomore' }, { id: 'p2', name: 'Sofia Alvarez' }]);
    mount('coach');
    key('k', { metaKey: true });
    search('jo');
    expect(options()).toEqual(['Jonah Okafor']);
    fireEvent.click(within(palette()).getByRole('option', { name: /Jonah Okafor/ }));
    expect(push).toHaveBeenCalledWith('/golf/dashboard/stats?player=p1', { scroll: false });
    cleanup();

    mount('player');
    key('k', { metaKey: true });
    search('jo');
    expect(options()).not.toContain('Jonah Okafor');
  });

  it('goes where a row says, and shows each section\'s shortcut', () => {
    mount('coach');
    key('k', { metaKey: true });
    const roster = within(palette()).getByRole('option', { name: /Roster/ });
    expect(roster.textContent).toMatch(/GR$/);
    fireEvent.click(roster);
    expect(push).toHaveBeenCalledWith('/golf/dashboard/roster', { scroll: false });
  });

  it('says nothing matched and offers the nearest section, which Enter takes', () => {
    mount('coach');
    key('k', { metaKey: true });
    search('rostr');
    expect(options()[0]).toBe('Roster');
    search('zzzqxw');
    expect(within(palette()).getByRole('status').textContent).toMatch(/Nothing matches/);
    expect(within(palette()).getByRole('status').textContent).toMatch(/Players appear here once you have opened the Roster/);
    expect(within(palette()).queryAllByRole('option')).toHaveLength(0);
  });

  it('draws the new-event key only where it works, on Home', () => {
    mount('coach');
    key('k', { metaKey: true });
    search('new event');
    const row = within(palette()).getByRole('option', { name: /New event/ });
    expect(row.textContent).toMatch(/N$/);
  });
});

describe('people across a team switch', () => {
  /** A page that publishes the players it loaded, in an effect, as the Roster does. */
  function Page({ names }: { names: string[] }) {
    useEffect(() => publishPeople(names.map((n, i) => ({ id: `p${i}`, name: n }))), [names]);
    return null;
  }
  const tree = (teamId: string, names: string[]) => (
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <Page names={names} />
        <CommandLayer role="coach" pathname="/golf/dashboard/roster" userId="u1" teamId={teamId} />
      </div>
    </LazyMotion>
  );

  it('drops the old team\'s names when the team changes, and keeps the new team\'s page publish', () => {
    const one = ['Jonah Okafor'];
    const two = ['Priya Natarajan'];
    const { rerender } = render(tree('t1', one));
    rerender(tree('t2', two));
    key('k', { metaKey: true });
    search('pri');
    expect(options()).toContain('Priya Natarajan');
    search('jon');
    expect(options()).not.toContain('Jonah Okafor');
  });
});

describe('G then a letter, / and ?', () => {
  it('G then R goes to Roster for a coach, and G then O to Rounds for a player only', () => {
    mount('coach');
    key('g');
    key('r');
    expect(push).toHaveBeenCalledWith('/golf/dashboard/roster', { scroll: false });
    push.mockClear();
    key('g');
    key('o');
    expect(push).not.toHaveBeenCalled();
    cleanup();

    mount('player');
    key('g');
    key('o');
    expect(push).toHaveBeenCalledWith('/golf/dashboard/rounds', { scroll: false });
  });

  it('takes its letter before a page\'s own handler, which skips a key already used (Calendar binds a bare T)', () => {
    const page = vi.fn((e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      page.mock.results.push({ type: 'return', value: 'today' });
    });
    window.addEventListener('keydown', page);
    mount('coach');
    key('g');
    key('t');
    window.removeEventListener('keydown', page);
    expect(push).toHaveBeenCalledWith('/golf/dashboard/team-hub', { scroll: false });
    // The page saw both keys; it acted on the G (not used by anyone) and not on the T that went to Team hub.
    expect(page.mock.results.filter((r) => r.value === 'today')).toHaveLength(1);
  });

  it('lets the sequence lapse after a second', () => {
    vi.useFakeTimers();
    const now = vi.spyOn(performance, 'now');
    mount('coach');
    now.mockReturnValue(1000);
    key('g');
    now.mockReturnValue(2001);
    key('r');
    expect(push).not.toHaveBeenCalled();
    now.mockReturnValue(3000);
    key('g');
    now.mockReturnValue(3999);
    key('r');
    expect(push).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    now.mockRestore();
  });

  it('shows where each letter goes while G waits, and takes it away on the letter or after the second', () => {
    vi.useFakeTimers();
    mount('coach');
    key('g');
    const hint = document.querySelector('.ch-cmd-hint');
    expect(hint?.textContent).toMatch(/Go to.*R\s*Roster/);
    expect(hint?.textContent).not.toMatch(/Rounds/);
    key('r');
    expect(document.querySelector('.ch-cmd-hint')).toBeNull();
    key('g');
    expect(document.querySelector('.ch-cmd-hint')).not.toBeNull();
    act(() => void vi.advanceTimersByTime(1001));
    expect(document.querySelector('.ch-cmd-hint')).toBeNull();
    vi.useRealTimers();
  });

  it('is only typing while a field has focus: no jump, no search, no sheet', () => {
    mount('coach', <input aria-label="Notes" />);
    const field = screen.getByLabelText('Notes');
    field.focus();
    key('g', {}, field);
    key('r', {}, field);
    key('?', { shiftKey: true }, field);
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
  });

  it('is suppressed while a dialog is open', () => {
    mount('coach', <dialog open aria-label="Another">content</dialog>);
    key('g');
    key('r');
    expect(push).not.toHaveBeenCalled();
  });

  it('/ focuses the page\'s search field, and is an ordinary key when there is none', () => {
    mount('coach', <input type="search" aria-label="Search players" />);
    const field = screen.getByLabelText('Search players');
    Object.defineProperty(field, 'getClientRects', { value: () => [{}] });
    key('/');
    expect(field).toHaveFocus();
    cleanup();

    mount('coach');
    const ev = new KeyboardEvent('keydown', { key: '/', cancelable: true, bubbles: true });
    act(() => void window.dispatchEvent(ev));
    expect(ev.defaultPrevented).toBe(false);
  });

  it('? opens the shortcuts, grouped, with the role\'s letters', () => {
    mount('player');
    key('?', { shiftKey: true });
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(sheet).getByText('Open the command palette')).toBeInTheDocument();
    expect(within(sheet).getByText('Rounds')).toBeInTheDocument();
    expect(within(sheet).queryByText('Recruiting')).toBeNull();
    expect(within(sheet).queryByText('New event')).toBeNull();
  });

  it('does nothing on a phone', () => {
    desktop = false;
    mount('coach');
    key('k', { metaKey: true });
    key('g');
    key('r');
    key('?', { shiftKey: true });
    expect(screen.queryByRole('dialog', { name: 'Search Clubhouse' })).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});

import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Roster phone sort (CH-3701) on TanStack Table's sorting model, and the trailing figure: plain tabular text that takes
 * a new sort's figure at once, with no digits rolling (owner rule, as on Qualifiers).
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/golf/actions/roster', () => ({ removePlayerFromTeam: vi.fn() }));
vi.mock('@/app/golf/actions/teams', () => ({
  acceptJoinRequest: vi.fn(),
  rejectJoinRequest: vi.fn(),
  getTeamJoinRequests: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));
vi.mock('@/app/golf/actions/v3/intent', () => ({ setIntent: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../lib/reduced-motion', () => ({ useChReducedMotion: () => motion.reduced }));

import type { ChRoster, ChRosterPlayer } from '../data/roster';
import { formatFixed, formatSigned, MINUS } from '../lib/format';
import { PREVIEW_ROSTER } from '../preview/fixtures-roster';
import { Roster } from '../screens/roster/Roster';
import { useRosterSort, type PhoneSort } from '../screens/roster/sort';
import { PhoneChromeProvider, usePhoneChromeState } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';

/** The order the phone list had before TanStack (RosterPhone's sortPlayers), kept here as the rule to match. */
function reference(list: ChRosterPlayer[], sort: PhoneSort): ChRosterPlayer[] {
  const lastName = (n: string) => n.split(' ').slice(-1)[0] ?? n;
  const nullsLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);
  return [...list].sort((a, b) =>
    sort === 'name'
      ? lastName(a.name).localeCompare(lastName(b.name))
      : sort === 'sg'
        ? nullsLast(a.sgPerRound == null ? null : -a.sgPerRound, b.sgPerRound == null ? null : -b.sgPerRound)
        : nullsLast(a.avg, b.avg),
  );
}

const base = PREVIEW_ROSTER.players[0]!;
const extra = (id: string, name: string, avg: number | null, sg: number | null, status: 'active' | 'inactive' = 'active'): ChRosterPlayer => ({
  ...base,
  id,
  name,
  avg,
  sgPerRound: sg,
  status,
});
/** The fixture plus the edges: no average, no strokes gained, ties on both, and a tie on last name. */
const PLAYERS: ChRosterPlayer[] = [
  ...PREVIEW_ROSTER.players,
  extra('nul', 'Nora Null', null, null),
  extra('tie1', 'Ana Brandt', 74.8, 1.1),
  extra('tie2', 'Zed Okafor', 71.6, 0.6),
  extra('in2', 'Ivo Quist', null, 0.4, 'inactive'),
];

beforeEach(() => {
  hapticSpy.mockClear();
  motion.reduced = false;
  localStorage.clear();
});

describe('Roster phone sort on TanStack (CH-3701)', () => {
  it('orders Avg lowest first, SG highest first and Name by last name, missing figures last and ties as loaded', () => {
    const { result, rerender } = renderHook(({ sort }: { sort: PhoneSort }) => useRosterSort(PLAYERS, sort), { initialProps: { sort: 'avg' as PhoneSort } });
    // Switching back and forth on one table instance: each render reads the sort it was given.
    for (const sort of ['avg', 'sg', 'name', 'sg', 'avg'] as const) {
      rerender({ sort });
      const ids = (l: ChRosterPlayer[]) => l.map((p) => p.id);
      expect(ids(result.current.active)).toEqual(ids(reference(PLAYERS.filter((p) => p.status === 'active'), sort)));
      expect(ids(result.current.inactive)).toEqual(ids(reference(PLAYERS.filter((p) => p.status === 'inactive'), sort)));
    }
    rerender({ sort: 'avg' });
    expect(result.current.active.at(-1)!.id).toBe('nul');
    rerender({ sort: 'sg' });
    expect(result.current.active.at(-1)!.id).toBe('nul');
    expect(result.current.active.slice(0, 3).map((p) => p.id)).toEqual(['theo', 'sofia', 'tie1']);
  });
});

describe('CH-3604 Roster phone: a sort change reorders the rows and each figure takes its new value at once', () => {
  const realMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((q: string) => ({
      matches: q === '(max-width: 820px)',
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as never;
    window.history.replaceState(null, '', '/golf/dashboard/roster');
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.history.replaceState(null, '', '/');
  });
  function SlotHost() {
    const { setSlot } = usePhoneChromeState();
    return <div ref={setSlot} />;
  }
  const tree = (data: ChRoster) => (
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            <SlotHost />
            <Roster data={data} />
          </div>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>
  );
  const phone = (data: ChRoster) => render(tree(data));
  const rows = () => within(screen.getByRole('list', { name: 'Active players' })).getAllByRole('button');
  const row = (name: string) => rows().find((b) => b.getAttribute('aria-label')!.startsWith(name))!;
  const figure = (name: string) => row(name).querySelector('.ch-rsm-row__v b') as HTMLElement;

  it('draws each figure as plain tabular text from the first frame, and a strokes gained that rounds to zero unsigned', async () => {
    const user = userEvent.setup();
    phone({ ...PREVIEW_ROSTER, players: PREVIEW_ROSTER.players.map((p) => (p.id === 'jonah' ? { ...p, sgPerRound: -0.04 } : p)) });
    expect(figure('Jonah Okafor').textContent).toBe('74.1');
    expect(figure('Jonah Okafor').children).toHaveLength(0);
    expect(figure('Jonah Okafor').className).toContain('ch-num');
    expect(document.querySelector('number-flow-react, .ch-rsm-flowtext')).toBeNull();
    for (const p of PREVIEW_ROSTER.players.filter((x) => x.status === 'active')) expect(figure(p.name).textContent).toBe(formatFixed(p.avg));
    await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
    expect(figure('Jonah Okafor').textContent).toBe('0.0');
    expect(figure('Jonah Okafor').className).not.toMatch(/is-(gain|loss)/);
  });

  it('a chosen sort writes the strokes gained figures at once and back, with a true minus, one tick, rows reordered', async () => {
    const user = userEvent.setup();
    phone({ ...PREVIEW_ROSTER });
    const node = figure('Jonah Okafor');
    await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
    expect(hapticSpy.mock.calls.filter(([k]) => k === 'select')).toHaveLength(1);
    // The rows reorder by strokes gained.
    expect(rows().map((b) => b.getAttribute('aria-label')!.split(',')[0])).toEqual([
      'Theo Marchetti',
      'Sofia Alvarez',
      'Ava Lindqvist',
      'Eli Brandt',
      'Jonah Okafor',
      'Priya Natarajan',
      'Luca Ferraro',
    ]);
    // The same element takes the new figure as text: nothing rolls or counts.
    expect(figure('Jonah Okafor')).toBe(node);
    expect(figure('Jonah Okafor').textContent).toBe(`${MINUS}0.9`);
    expect(figure('Jonah Okafor').textContent).toBe(formatSigned(-0.9));
    expect(figure('Jonah Okafor').children).toHaveLength(0);
    expect(row('Jonah Okafor').getAttribute('aria-label')).toContain(`strokes gained ${MINUS}0.9 a round`);
    expect(figure('Jonah Okafor').className).toContain('is-loss');
    expect(figure('Theo Marchetti').textContent).toBe('+1.8');
    expect(figure('Theo Marchetti').className).toContain('is-gain');
    // No strokes gained is a dash.
    expect(figure('Luca Ferraro').textContent).toBe('—');
    expect(row('Luca Ferraro').getAttribute('aria-label')).toContain('no strokes gained yet');

    await user.click(screen.getByRole('radio', { name: 'Name' }));
    expect(figure('Jonah Okafor').textContent).toBe('74.1');
    expect(rows()[0]!.getAttribute('aria-label')).toMatch(/^Sofia Alvarez/);
  });

  it('a refresh that changes a figure takes it at once and keeps the rows in place', async () => {
    const user = userEvent.setup();
    const view = phone({ ...PREVIEW_ROSTER });
    await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
    const order = rows().map((b) => b.getAttribute('aria-label')!.split(',')[0]);
    // A refresh: Jonah's strokes gained moves from −0.9 to −0.7, which keeps his place.
    const refreshed = { ...PREVIEW_ROSTER, players: PREVIEW_ROSTER.players.map((p) => (p.id === 'jonah' ? { ...p, sgPerRound: -0.7 } : p)) };
    await act(async () => {
      view.rerender(tree(refreshed));
    });
    expect(figure('Jonah Okafor').textContent).toBe(`${MINUS}0.7`);
    expect(rows().map((b) => b.getAttribute('aria-label')!.split(',')[0])).toEqual(order);
  });

  it('with reduced motion or Animations off the figures change at once too', async () => {
    motion.reduced = true;
    const user = userEvent.setup();
    phone({ ...PREVIEW_ROSTER });
    await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
    expect(figure('Theo Marchetti').textContent).toBe('+1.8');
  });

  it('without season stats the list is by name and the averages are dashes', () => {
    phone({ ...PREVIEW_ROSTER, statsError: true, players: PREVIEW_ROSTER.players.map((p) => ({ ...p, avg: null, sgPerRound: null })) });
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Name']);
    expect(rows()[0]!.getAttribute('aria-label')).toMatch(/^Sofia Alvarez/);
    expect(figure('Sofia Alvarez').textContent).toBe('—');
  });
});

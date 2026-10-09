import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Roster phone sort (CH-3701) on TanStack Table's sorting model, and the trailing figure as a rolling numeral (Number
 * Flow). The numeral is mocked here so its props can be read: what it is given, whether it animates, and that a sort
 * change rolls the same numeral instead of mounting a new one. Its spoken value is the real number-flow formatter's.
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

type FlowProps = { value: number; prefix?: string; animated?: boolean; format?: Intl.NumberFormatOptions; transformTiming?: { duration: number } };
const flow = vi.hoisted(() => ({ mounts: 0 }));
vi.mock('@number-flow/react', () => {
  function MockFlow({ value, prefix = '', animated, format, transformTiming }: FlowProps) {
    useEffect(() => {
      flow.mounts += 1;
    }, []);
    // The real element names itself (role img) with its prefix and the Intl formatting of `value` with `format`, the
    // string number-flow calls valueAsString.
    const spoken = prefix + new Intl.NumberFormat(undefined, format).format(value);
    return (
      <span data-flow="" role="img" aria-label={spoken} data-animated={String(animated)} data-prefix={prefix} data-value={value} data-ms={transformTiming?.duration}>
        {spoken}
      </span>
    );
  }
  return { default: MockFlow };
});

import type { ChRoster, ChRosterPlayer } from '../data/roster';
import { formatFixed, formatSigned, MINUS } from '../lib/format';
import { CH_DUR } from '../lib/motion';
import { PREVIEW_ROSTER } from '../preview/fixtures-roster';
import { Roster } from '../screens/roster/Roster';
import { figureParts } from '../screens/roster/format';
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
  flow.mounts = 0;
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

describe('the trailing figure (CH-3806)', () => {
  it('splits a figure so the sign is a true minus or a plus, a rounded zero is unsigned 0.0, and no data does not roll', () => {
    expect(figureParts(-0.9, { signed: true })).toEqual({ text: `${MINUS}0.9`, prefix: MINUS, size: 0.9 });
    expect(figureParts(1.8, { signed: true })).toEqual({ text: '+1.8', prefix: '+', size: 1.8 });
    expect(figureParts(-0.04, { signed: true })).toEqual({ text: '0.0', prefix: '', size: 0 });
    expect(figureParts(0.04, { signed: true })!.text).toBe('0.0');
    expect(figureParts(72.4)).toEqual({ text: '72.4', prefix: '', size: 72.4 });
    expect(figureParts(null)).toBeNull();
    for (const v of [-2.35, -0.05, 0, 0.05, 3.96]) expect(figureParts(v, { signed: true })!.text).toBe(formatSigned(v));
    for (const v of [70.94, 76.25]) expect(figureParts(v)!.text).toBe(formatFixed(v));
    expect(figureParts(-1.4, { signed: true })!.text).not.toContain('-');
  });
});

describe('CH-3604 Roster phone: a sort change reorders the rows and rolls each figure in place', () => {
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
  const flowOf = (name: string) => figure(name).querySelector('[data-flow]') as HTMLElement | null;

  it('rolls the same numeral from the average to strokes gained and back, with a true minus, no count-up, one tick', async () => {
    const user = userEvent.setup();
    phone({ ...PREVIEW_ROSTER });
    const mountsAtFirstPaint = flow.mounts;
    // First paint is the figure as it is: the numeral is drawn at its value and does not animate, so nothing counts up.
    expect(flowOf('Jonah Okafor')!.getAttribute('aria-label')).toBe('74.1');
    expect(flowOf('Jonah Okafor')!.dataset.animated).toBe('false');
    expect(Number(flowOf('Jonah Okafor')!.dataset.ms)).toBe(CH_DUR.base * 1000);

    const before = flowOf('Jonah Okafor');
    await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
    expect(hapticSpy.mock.calls.filter(([k]) => k === 'select')).toHaveLength(1);
    // A chosen sort rolls the figures.
    expect(flowOf('Jonah Okafor')!.dataset.animated).toBe('true');
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
    // The numeral stayed and took the new figure: a roll, not a swap.
    expect(flowOf('Jonah Okafor')).toBe(before);
    expect(flow.mounts).toBe(mountsAtFirstPaint);
    const jonah = flowOf('Jonah Okafor')!;
    expect(jonah.dataset.prefix).toBe(MINUS);
    expect(jonah.dataset.value).toBe('0.9');
    // Spoken as written: "−0.9", the same figure the row's name reads.
    expect(jonah.getAttribute('aria-label')).toBe(`${MINUS}0.9`);
    expect(jonah.getAttribute('aria-label')).toBe(formatSigned(-0.9));
    expect(row('Jonah Okafor').getAttribute('aria-label')).toContain(`strokes gained ${MINUS}0.9 a round`);
    expect(figure('Jonah Okafor').className).toContain('is-loss');
    expect(flowOf('Theo Marchetti')!.getAttribute('aria-label')).toBe('+1.8');
    expect(figure('Theo Marchetti').className).toContain('is-gain');
    // No strokes gained is a dash, which does not roll.
    expect(flowOf('Luca Ferraro')).toBeNull();
    expect(figure('Luca Ferraro').textContent).toBe('—');
    expect(row('Luca Ferraro').getAttribute('aria-label')).toContain('no strokes gained yet');

    await user.click(screen.getByRole('radio', { name: 'Name' }));
    expect(flowOf('Jonah Okafor')).toBe(before);
    expect(flowOf('Jonah Okafor')!.getAttribute('aria-label')).toBe('74.1');
    expect(rows()[0]!.getAttribute('aria-label')).toMatch(/^Sofia Alvarez/);
  });

  it('only a chosen sort rolls: once its roll is over, a refresh that changes a figure takes it at once, rows in place', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const view = phone({ ...PREVIEW_ROSTER });
      await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
      expect(flowOf('Jonah Okafor')!.dataset.animated).toBe('true');
      await act(async () => {
        vi.advanceTimersByTime(CH_DUR.base * 1000 + 100);
      });
      expect(flowOf('Jonah Okafor')!.dataset.animated).toBe('false');
      const order = rows().map((b) => b.getAttribute('aria-label')!.split(',')[0]);

      // A refresh: Jonah's strokes gained moves from −0.9 to −0.7, which keeps his place.
      const refreshed = { ...PREVIEW_ROSTER, players: PREVIEW_ROSTER.players.map((p) => (p.id === 'jonah' ? { ...p, sgPerRound: -0.7 } : p)) };
      view.rerender(tree(refreshed));
      expect(flowOf('Jonah Okafor')!.getAttribute('aria-label')).toBe(`${MINUS}0.7`);
      expect(flowOf('Jonah Okafor')!.dataset.animated).toBe('false');
      expect(rows().map((b) => b.getAttribute('aria-label')!.split(',')[0])).toEqual(order);
    } finally {
      vi.useRealTimers();
    }
  });

  it('with reduced motion or Animations off the figures change at once', async () => {
    motion.reduced = true;
    const user = userEvent.setup();
    phone({ ...PREVIEW_ROSTER });
    expect(flowOf('Theo Marchetti')!.dataset.animated).toBe('false');
    await user.click(screen.getByRole('radio', { name: 'SG, strokes gained' }));
    expect(flowOf('Theo Marchetti')!.dataset.animated).toBe('false');
    expect(flowOf('Theo Marchetti')!.getAttribute('aria-label')).toBe('+1.8');
  });

  it('without season stats the list is by name and the averages are dashes', () => {
    phone({ ...PREVIEW_ROSTER, statsError: true, players: PREVIEW_ROSTER.players.map((p) => ({ ...p, avg: null, sgPerRound: null })) });
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Name']);
    expect(rows()[0]!.getAttribute('aria-label')).toMatch(/^Sofia Alvarez/);
    expect(figure('Sofia Alvarez').textContent).toBe('—');
  });
});

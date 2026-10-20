/**
 * The one-tap data-gap prompt (CoachHelm Slice 8a) on the real Fairway shot
 * screen: it shows after a missed first putt from the band a read waits on,
 * one tap writes the tag through the screen's save path (the reducer, then
 * onAutoSave with the hole), it disappears at the target, and with no asks
 * (the flag off) the screen renders exactly what it rendered before.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FairwayShotTracking from '@/components/fairway/pages/rounds-tracking/FairwayShotTracking';
import type { ShotTrackingProps } from '@/hooks/golf/use-shot-tracking';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';
import type { DataGapAsk } from '@/lib/coachhelm/data-gap/asks';

vi.mock('@/app/golf/actions/shot-actions', () => ({
  deleteShot: vi.fn(async () => ({ success: true })),
  updateShot: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn() }));

Element.prototype.scrollIntoView ??= function () {};

afterEach(cleanup);

const HOLE: RoundHole = { number: 3, par: 3, yardage: 150, score: null } as RoundHole;

// Par 3: on the green at 7 ft, first putt missed leaving 1 ft (untagged).
const MISSED_FIRST_PUTT: ShotRecord[] = [
  {
    shotNumber: 1,
    shotType: 'approach',
    clubType: 'non_driver',
    lieBefore: 'tee',
    distanceToHoleBefore: 150,
    distanceUnitBefore: 'yards',
    result: 'green',
    distanceToHoleAfter: 7,
    distanceUnitAfter: 'feet',
    shotDistance: 148,
    isPenalty: false,
  },
  {
    shotNumber: 2,
    shotType: 'putting',
    clubType: 'putter',
    lieBefore: 'green',
    distanceToHoleBefore: 7,
    distanceUnitBefore: 'feet',
    result: 'green',
    distanceToHoleAfter: 1,
    distanceUnitAfter: 'feet',
    shotDistance: 2,
    isPenalty: false,
    puttDistanceFeet: 7,
  },
];

function ask(over: Partial<DataGapAsk> = {}): DataGapAsk {
  return {
    readId: 'read-1',
    readTitle: 'Putts from 5–10 ft',
    field: 'miss_direction',
    filter: { shot_type: 'putting', first_putt: true, distance_feet: [5, 10], holed: false },
    targetCount: 10,
    haveCount: 4,
    taggedSince: 4,
    bandLabel: '5–10 ft',
    windowEnd: '2026-10-01',
    ...over,
  };
}

function mount(opts: { asks?: DataGapAsk[]; shots?: ShotRecord[] } = {}) {
  const autosaves: ShotRecord[][] = [];
  const props: ShotTrackingProps = {
    holes: [HOLE],
    currentHoleIndex: 0,
    initialShots: opts.shots ?? MISSED_FIRST_PUTT,
    initialShotNumber: (opts.shots ?? MISSED_FIRST_PUTT).length + 1,
    onHoleComplete: async () => true,
    onSaveShot: () => true,
    onAutoSave: async (shots) => {
      autosaves.push(shots);
    },
    onNavigateToHole: vi.fn(),
  };
  const view = render(<FairwayShotTracking {...props} dataGapAsks={opts.asks} />);
  return { autosaves, view };
}

const prompt = () => screen.queryByRole('region', { name: "Tag the first putt's miss" });

describe('FairwayDataGapPrompt', () => {
  it('shows after a missed first putt in the band, with the counter', () => {
    mount({ asks: [ask()] });
    const row = prompt()!;
    expect(row).not.toBeNull();
    expect(within(row).getByText('Which side?')).toBeTruthy();
    expect(within(row).getByText('First putt, 7 ft')).toBeTruthy();
    for (const label of ['Short', 'Long', 'High', 'Low']) {
      expect(within(row).getByRole('button', { name: label })).toBeTruthy();
    }
    expect(within(row).getByRole('status').textContent).toBe('4 of 10 for your 5–10 ft putt read');
    // Never the screen's primary action, never a modal.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(row).queryAllByRole('button').every((b) => b.getAttribute('data-variant') !== 'primary')).toBe(true);
  });

  it('one tap writes the tag through the shot save path and moves the counter', async () => {
    const user = userEvent.setup();
    const { autosaves } = mount({ asks: [ask()] });
    await user.click(within(prompt()!).getByRole('button', { name: 'Short' }));

    const last = autosaves[autosaves.length - 1]!;
    expect(last).toHaveLength(2);
    expect(last[1]).toMatchObject({ shotNumber: 2, missDirection: 'short', puttMissTags: ['short'] });
    // The approach is untouched.
    expect(last[0]).toEqual(MISSED_FIRST_PUTT[0]);

    const row = prompt()!;
    expect(within(row).getByRole('status').textContent).toBe('Tagged short · 5 of 10 for your 5–10 ft putt read');
    expect(within(row).getByRole('button', { name: 'Short' }).getAttribute('aria-pressed')).toBe('true');
    // The next putt's entry is still there and still asks for its result.
    expect(screen.getByRole('radiogroup', { name: 'Putt result' })).toBeTruthy();
  });

  it('a second tap corrects the tag without counting twice', async () => {
    const user = userEvent.setup();
    const { autosaves } = mount({ asks: [ask()] });
    await user.click(within(prompt()!).getByRole('button', { name: 'Short' }));
    await user.click(within(prompt()!).getByRole('button', { name: 'High' }));
    expect(autosaves[autosaves.length - 1]![1]).toMatchObject({ missDirection: 'high', puttMissTags: ['high'] });
    expect(within(prompt()!).getByRole('status').textContent).toBe('Tagged high · 5 of 10 for your 5–10 ft putt read');
  });

  it('disappears at the target', async () => {
    const user = userEvent.setup();
    mount({ asks: [ask({ taggedSince: 9 })] });
    await user.click(within(prompt()!).getByRole('button', { name: 'Low' }));
    expect(prompt()).toBeNull();
  });

  it('Skip hides it without writing', async () => {
    const user = userEvent.setup();
    const { autosaves } = mount({ asks: [ask()] });
    const before = autosaves.length;
    await user.click(within(prompt()!).getByRole('button', { name: 'Skip tagging this putt' }));
    expect(prompt()).toBeNull();
    expect(autosaves.length).toBe(before);
  });

  it('also asks on the completed-hole review (a miss then a tap in holes out at once)', async () => {
    const user = userEvent.setup();
    const holed: ShotRecord = {
      ...MISSED_FIRST_PUTT[1]!,
      shotNumber: 3,
      distanceToHoleBefore: 1,
      result: 'hole',
      distanceToHoleAfter: 0,
      shotDistance: 0,
      puttDistanceFeet: 1,
    };
    const { autosaves } = mount({ asks: [ask()], shots: [...MISSED_FIRST_PUTT, holed] });
    expect(screen.queryByRole('radiogroup', { name: 'Putt result' })).toBeNull();
    await user.click(within(prompt()!).getByRole('button', { name: 'Long' }));
    const last = autosaves[autosaves.length - 1]!;
    expect(last.map((s) => s.missDirection)).toEqual([undefined, 'long', undefined]);
  });

  it('does not ask for a putt outside the band, a tagged putt, or before any putt', () => {
    mount({ asks: [ask({ filter: { shot_type: 'putting', first_putt: true, distance_feet: [10, 15], holed: false } })] });
    expect(prompt()).toBeNull();
    cleanup();
    mount({ asks: [ask()], shots: [MISSED_FIRST_PUTT[0]!, { ...MISSED_FIRST_PUTT[1]!, missDirection: 'low', puttMissTags: ['low'] }] });
    expect(prompt()).toBeNull();
    cleanup();
    mount({ asks: [ask()], shots: [MISSED_FIRST_PUTT[0]!] });
    expect(prompt()).toBeNull();
  });

  it('flag off (no asks): nothing is drawn and the screen is unchanged', () => {
    const off = mount({});
    expect(prompt()).toBeNull();
    expect(off.view.container.querySelector('[data-slot="data-gap-prompt"]')).toBeNull();
    const offHtml = off.view.container.innerHTML;
    cleanup();
    const empty = mount({ asks: [] });
    expect(empty.view.container.innerHTML).toBe(offHtml);
  });
});

/**
 * Shot entry parity: the Clubhouse shot screen records exactly what the Fairway
 * (production) shot screen records.
 *
 * Both screens run useShotTracking (src/hooks/golf/use-shot-tracking.ts) and
 * hand its rows to the same round engine (lib/golf/round-session) and the same
 * server mapper (round-partial.ts / round-submit.ts), so equal rows and hole
 * stats here mean equal golf_shots / golf_holes / putt_details /
 * approach_miss_details rows. What can differ is the renderer: the options it
 * offers, what each control dispatches, what it gates, and the edit / delete /
 * penalty sheets. So each scenario is played through each screen's own
 * controls, as a player would tap them, and the captured writes (every
 * onSaveShot row, the hole checkpoint's stats, every autosave snapshot and
 * stats update) must be deep-equal. The rows are also mapped to the stored
 * columns with the server's own helpers and checked against the live CHECK
 * constraints.
 *
 * Lives outside src/clubhouse: Clubhouse code may not import Fairway UI
 * (eslint no-restricted-imports), and this test must render both.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FairwayShotTracking from '@/components/fairway/pages/rounds-tracking/FairwayShotTracking';
import { RoundTracking } from '@/clubhouse/screens/rounds/track/RoundTracking';
import { ToastProvider } from '@/clubhouse/ui/Toast';
import '@/clubhouse/__tests__/dialog-polyfill';
import type { ShotTrackingProps } from '@/hooks/golf/use-shot-tracking';
import type { ApproachMissDirection, HoleStats, PuttMissTag, RoundHole, ShotRecord } from '@/lib/types/golf';
import { deriveLieAfter } from '@/lib/utils/shot-helpers';

vi.mock('@/app/golf/actions/shot-actions', () => ({
  deleteShot: vi.fn(async () => ({ success: true })),
  updateShot: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn() }));

// jsdom has no layout: the state machine scrolls the distance box into view.
Element.prototype.scrollIntoView ??= function () {};

type Renderer = 'fairway' | 'clubhouse';
type Result = 'fairway' | 'rough' | 'sand' | 'green' | 'hole' | 'other';
type Step =
  | { do: 'result'; v: Result }
  | { do: 'club'; driver: boolean }
  | { do: 'teeMiss'; v: 'left' | 'right' }
  | { do: 'approachMiss'; v: ApproachMissDirection }
  | { do: 'puttTag'; v: PuttMissTag }
  | { do: 'break'; v: 'left_to_right' | 'straight' | 'right_to_left' | 'multiple' }
  | { do: 'slope'; v: 'uphill' | 'level' | 'downhill' | 'severe' }
  | { do: 'dist'; v: string }
  | { do: 'next' }
  | { do: 'penalty'; v: 'ob' | 'water' | 'unplayable' | 'lost'; origin?: 'here' | 'entered' }
  | { do: 'tapIn' }
  | { do: 'editAfter'; shot: number; v: string }
  | { do: 'delete'; shot: number }
  | { do: 'undo' };

interface Captured {
  saved: ShotRecord[];
  completed: Array<[number, HoleStats]>;
  statsUpdates: Array<[number, HoleStats | null]>;
  autosaves: ShotRecord[][];
}

const ROUND = { course: 'Parity GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };

const RESULT_WORD: Record<Renderer, Record<Result, string>> = {
  fairway: { fairway: 'Fairway', rough: 'Rough', sand: 'Sand', green: 'Green', hole: 'Hole', other: 'Other' },
  clubhouse: { fairway: 'Fairway', rough: 'Rough', sand: 'Sand', green: 'Green', hole: 'Holed', other: 'Other' },
};
const PENALTY_WORD = { ob: 'Out of bounds', water: 'Water hazard', unplayable: 'Unplayable lie', lost: 'Lost ball' };
const TAG_WORD: Record<Renderer, Record<PuttMissTag, string>> = {
  fairway: { short: 'Short', long: 'Long', low: 'Low', high: 'High' },
  clubhouse: { short: 'Short', long: 'Long', low: 'Low side', high: 'High side' },
};
const BREAK_WORD = { left_to_right: 'L → R', straight: 'Straight', right_to_left: 'R → L', multiple: 'Mult.' };
const SLOPE_WORD = { uphill: 'Uphill', level: 'Level', downhill: 'Down', severe: 'Severe' };
const exact = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
const starts = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');

function mount(r: Renderer, holes: RoundHole[], index: number, initialShots: ShotRecord[] = []): Captured {
  const cap: Captured = { saved: [], completed: [], statsUpdates: [], autosaves: [] };
  const props: ShotTrackingProps = {
    holes,
    currentHoleIndex: index,
    initialShots,
    initialShotNumber: initialShots.length + 1,
    onHoleComplete: async (i, stats) => {
      cap.completed.push([i, stats]);
      return true;
    },
    onHoleStatsUpdate: (i, stats) => {
      cap.statsUpdates.push([i, stats]);
    },
    onSaveShot: (shot) => {
      cap.saved.push(shot);
      return true;
    },
    onAutoSave: async (shots) => {
      cap.autosaves.push(shots);
    },
    onNavigateToHole: vi.fn(),
  };
  render(
    r === 'fairway' ? (
      <FairwayShotTracking {...props} />
    ) : (
      <ToastProvider>
        <RoundTracking {...props} round={ROUND} />
      </ToastProvider>
    ),
  );
  return cap;
}

/** A sheet that closes animates out; the entry under it is reachable again once it is gone. */
const sheetGone = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
const resultGroup = () => screen.getByRole('radiogroup', { name: /^(Shot|Putt) result$/ });
const nextButton = () => screen.getByRole('button', { name: /^(Record next shot|Complete hole with score \d+)$/ });

async function openEdit(r: Renderer, user: UserEvent, shot: number) {
  if (r === 'fairway') {
    await user.click(screen.getByRole('button', { name: `View shot ${shot}` }));
    return;
  }
  const log = document.querySelector<HTMLButtonElement>('.ch-rt-log__h')!;
  if (log.getAttribute('aria-expanded') !== 'true') await user.click(log);
  // Before hole-out the open log is the way in; after it, the hole's review.
  await user.click(screen.getByRole('button', { name: starts(`Change shot ${shot}:`) }));
}

async function play(r: Renderer, user: UserEvent, cap: Captured, steps: Step[]) {
  for (const step of steps) {
    switch (step.do) {
      case 'result':
        await user.click(within(resultGroup()).getByRole('radio', { name: starts(RESULT_WORD[r][step.v]) }));
        break;
      case 'club':
        await user.click(
          within(screen.getByRole('radiogroup', { name: 'Club off tee' })).getByRole('radio', { name: exact(step.driver ? 'Driver' : 'Non-driver') }),
        );
        break;
      case 'teeMiss':
        await user.click(within(screen.getByRole('radiogroup', { name: 'Miss direction' })).getByRole('radio', { name: new RegExp(step.v, 'i') }));
        break;
      case 'approachMiss':
        await user.click(screen.getByRole(r === 'fairway' ? 'button' : 'radio', { name: exact(step.v.replace('_', ' ')) }));
        break;
      case 'puttTag':
        await user.click(screen.getByRole('button', { name: exact(TAG_WORD[r][step.v]) }));
        break;
      case 'break':
        await user.click(
          within(screen.getByRole('radiogroup', { name: r === 'fairway' ? 'Putt break direction' : 'Putt break' })).getByRole('radio', { name: exact(BREAK_WORD[step.v]) }),
        );
        break;
      case 'slope':
        await user.click(within(screen.getByRole('radiogroup', { name: 'Putt slope' })).getByRole('radio', { name: exact(SLOPE_WORD[step.v]) }));
        break;
      case 'dist': {
        const box = document.getElementById(r === 'fairway' ? 'fw-distance-after' : 'ch-rt-dist') as HTMLInputElement;
        await user.clear(box);
        await user.type(box, step.v);
        break;
      }
      case 'next': {
        const holes = nextButton().getAttribute('aria-label')!.startsWith('Complete');
        const before = cap.completed.length;
        // A gate one screen keeps closed and the other opens is a difference: fail on it.
        expect(nextButton()).toBeEnabled();
        await user.click(nextButton());
        if (holes) await waitFor(() => expect(cap.completed.length).toBe(before + 1));
        break;
      }
      case 'penalty':
        await user.click(screen.getByRole('button', { name: 'Add penalty stroke' }));
        await user.click(screen.getByRole(r === 'fairway' ? 'button' : 'radio', { name: starts(PENALTY_WORD[step.v]) }));
        if (step.origin) {
          await user.click(screen.getByRole('radio', { name: step.origin === 'here' ? /^My next shot from here/ : /^Shot \d+ that I entered/ }));
        }
        await user.click(screen.getByRole('button', { name: r === 'fairway' ? 'Add +1 Stroke' : 'Add 1 stroke' }));
        await sheetGone();
        break;
      case 'tapIn': {
        const before = cap.completed.length;
        await user.click(screen.getByRole('button', { name: /^Tap in/ }));
        await waitFor(() => expect(cap.completed.length).toBe(before + 1));
        break;
      }
      case 'editAfter': {
        await openEdit(r, user, step.shot);
        const box = screen.getByLabelText(r === 'fairway' ? 'Distance to hole after shot' : 'Distance after') as HTMLInputElement;
        await user.clear(box);
        await user.type(box, step.v);
        const before = cap.autosaves.length;
        await user.click(screen.getByRole('button', { name: r === 'fairway' ? 'Save changes' : 'Save shot' }));
        await waitFor(() => expect(cap.autosaves.length).toBeGreaterThan(before));
        await sheetGone();
        break;
      }
      case 'delete': {
        await openEdit(r, user, step.shot);
        await user.click(screen.getByRole('button', { name: r === 'fairway' ? 'Delete shot' : 'Delete' }));
        const before = cap.autosaves.length;
        await user.click(screen.getByRole('button', { name: r === 'fairway' ? 'Delete Shot' : 'Delete shot' }));
        await waitFor(() => expect(cap.autosaves.length).toBeGreaterThan(before));
        await sheetGone();
        break;
      }
      case 'undo': {
        await user.click(screen.getAllByRole('button', { name: 'Undo last shot' })[0]!);
        const before = cap.autosaves.length;
        await user.click(screen.getByRole('button', { name: r === 'fairway' ? 'Confirm' : 'Undo' }));
        await waitFor(() => expect(cap.autosaves.length).toBeGreaterThan(before));
        break;
      }
    }
  }
}

async function both(holes: RoundHole[], index: number, steps: Step[], initialShots: ShotRecord[] = []) {
  const out = {} as Record<Renderer, Captured>;
  for (const r of ['fairway', 'clubhouse'] as const) {
    const user = userEvent.setup();
    const cap = mount(r, holes, index, initialShots);
    await play(r, user, cap, steps);
    out[r] = cap;
    cleanup();
  }
  expect(out.clubhouse).toEqual(out.fairway);
  return out.fairway;
}

// ── The stored columns, as round-partial.ts / round-submit.ts write them ─────
// Live CHECK constraints, read from pg_constraint on 2026-10-17 (golf_shots,
// putt_details, approach_miss_details). putt_slope, penalty_type and
// miss_direction on golf_shots have no constraint.
const DB = {
  shot_type: ['tee', 'approach', 'around_green', 'putting', 'penalty'],
  club_type: ['driver', 'non_driver', 'putter'],
  lie: ['tee', 'fairway', 'rough', 'sand', 'green', 'other', 'penalty'],
  result: ['fairway', 'rough', 'deep_rough', 'sand', 'green', 'hole', 'other', 'penalty', 'recovery'],
  unit: ['yards', 'feet'],
  putt_break: ['left_to_right', 'right_to_left', 'straight', 'multiple'],
  approach_lie: ['fairway', 'rough', 'sand', 'bunker', 'recovery', 'hazard', 'green', 'tee', 'other', 'penalty', 'deep_rough'],
  approach_dir: ['short', 'long', 'left', 'right', 'short_left', 'short_right', 'long_left', 'long_right'],
};

async function expectStorable(shots: ShotRecord[]) {
  // The server's own mapping helpers (golf-action-shared.ts), so the columns are the ones it writes.
  const { derivePuttMade, derivePuttDistanceFeet } = await import('@/app/golf/actions/golf-action-shared');
  for (const s of shots) {
    expect(DB.shot_type).toContain(s.shotType);
    expect(DB.club_type).toContain(s.clubType);
    expect(DB.lie).toContain(s.lieBefore);
    expect(DB.lie).toContain(deriveLieAfter(s));
    expect(DB.result).toContain(s.result);
    expect(DB.unit).toContain(s.distanceUnitBefore);
    expect(DB.unit).toContain(s.distanceUnitAfter);
    if (s.puttBreak) expect(DB.putt_break).toContain(s.puttBreak);
    if (s.approachMissDirection) expect(DB.approach_dir).toContain(s.approachMissDirection);
    if (s.approachMissLieType) expect(DB.approach_lie).toContain(s.approachMissLieType);
    expect(Number.isInteger(s.distanceToHoleBefore) && Number.isInteger(s.distanceToHoleAfter)).toBe(true);
    if (s.shotType === 'putting') {
      expect(derivePuttMade(s)).toBe(s.result === 'hole');
      const feet = derivePuttDistanceFeet(s);
      expect(feet).not.toBeNull();
      expect(feet!).toBeGreaterThanOrEqual(0);
      expect(feet!).toBeLessThanOrEqual(500);
    }
  }
}

const hole = (number: number, par: number, yardage: number): RoundHole => ({ number, par, yardage, score: null });

afterEach(() => {
  cleanup();
  localStorage.removeItem('golf_distance_unit_pref');
});

describe('Shot entry parity: Clubhouse records what Fairway records', () => {
  it('par 3, green in regulation, two putts with a read and a miss tag', async () => {
    const cap = await both([hole(1, 3, 170)], 0, [
      { do: 'result', v: 'green' },
      { do: 'dist', v: '25' },
      { do: 'next' },
      { do: 'break', v: 'left_to_right' },
      { do: 'slope', v: 'uphill' },
      { do: 'result', v: 'green' },
      { do: 'puttTag', v: 'short' },
      { do: 'dist', v: '3' },
      { do: 'next' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    const stats = cap.completed[0]![1];
    expect([stats.score, stats.putts, stats.greenInRegulation, stats.fairwayHit]).toEqual([3, 2, true, null]);
    expect(cap.saved.map((s) => [s.shotType, s.clubType, s.result, s.distanceToHoleAfter, s.distanceUnitAfter])).toEqual([
      // A par 3's tee shot is its approach (getShotTypeFromState), on both screens and in production's rows.
      ['approach', 'non_driver', 'green', 25, 'feet'],
      ['putting', 'putter', 'green', 3, 'feet'],
      ['putting', 'putter', 'hole', 0, 'feet'],
    ]);
    expect(cap.saved[1]).toMatchObject({ puttBreak: 'left_to_right', puttSlope: 'uphill', puttMissTags: ['short'], missDirection: 'short', puttDistanceFeet: 25 });
    await expectStorable(cap.saved);
  });

  it('par 4, fairway missed left, bunker, up and down', async () => {
    const cap = await both([hole(1, 4, 400)], 0, [
      { do: 'result', v: 'rough' },
      { do: 'club', driver: true },
      { do: 'teeMiss', v: 'left' },
      { do: 'dist', v: '160' },
      { do: 'next' },
      { do: 'result', v: 'sand' },
      { do: 'approachMiss', v: 'short_right' },
      { do: 'dist', v: '20' },
      { do: 'next' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '4' },
      { do: 'next' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    const stats = cap.completed[0]![1];
    expect([stats.score, stats.putts, stats.fairwayHit, stats.greenInRegulation, stats.driveMissDirection, stats.usedDriver]).toEqual([4, 1, false, false, 'left', true]);
    expect([stats.scrambleAttempt, stats.scrambleMade, stats.sandSaveAttempt, stats.sandSaveMade]).toEqual([true, true, true, true]);
    expect(cap.saved[1]).toMatchObject({ lieBefore: 'rough', result: 'sand', approachMissDirection: 'short_right', approachMissLieType: 'bunker', missDirection: 'short_right' });
    expect(cap.saved[2]).toMatchObject({ lieBefore: 'sand', result: 'green', distanceToHoleAfter: 4, distanceUnitAfter: 'feet' });
    await expectStorable(cap.saved);
  });

  it('par 5, out of bounds off the tee (the entered shot), then a water hazard from the fairway', async () => {
    const cap = await both([hole(1, 5, 540)], 0, [
      { do: 'result', v: 'other' },
      { do: 'club', driver: true },
      { do: 'teeMiss', v: 'right' },
      { do: 'dist', v: '280' },
      { do: 'next' },
      { do: 'penalty', v: 'ob', origin: 'entered' },
      // Stroke and distance: the replay is from the tee again, a tee shot (club asked again).
      { do: 'result', v: 'fairway' },
      { do: 'club', driver: false },
      { do: 'dist', v: '250' },
      { do: 'next' },
      { do: 'penalty', v: 'water' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '30' },
      { do: 'next' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '2' },
      { do: 'next' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    const stats = cap.completed[0]![1];
    expect(stats.penaltyStrokes).toBe(2);
    expect(cap.saved.filter((s) => s.isPenalty).map((s) => s.penaltyType)).toEqual(['ob', 'water']);
    expect(stats.score).toBe(cap.saved.length);
    await expectStorable(cap.saved);
  });

  it('a stroke hit from here and lost (not entered) is recorded with its penalty', async () => {
    const cap = await both([hole(1, 4, 410)], 0, [
      { do: 'result', v: 'fairway' },
      { do: 'club', driver: true },
      { do: 'dist', v: '150' },
      { do: 'next' },
      { do: 'penalty', v: 'lost', origin: 'here' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '12' },
      { do: 'next' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    expect(cap.completed[0]![1].score).toBe(5);
    await expectStorable(cap.saved);
  });

  it('holed out from off the green', async () => {
    const cap = await both([hole(1, 4, 380)], 0, [
      { do: 'result', v: 'fairway' },
      { do: 'club', driver: false },
      { do: 'dist', v: '140' },
      { do: 'next' },
      { do: 'result', v: 'rough' },
      { do: 'approachMiss', v: 'long_left' },
      { do: 'dist', v: '15' },
      { do: 'next' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    const stats = cap.completed[0]![1];
    expect([stats.score, stats.putts, stats.greenInRegulation]).toEqual([3, 0, false]);
    await expectStorable(cap.saved);
  });

  it('three putts with breaks, slopes and paired miss tags', async () => {
    const cap = await both([hole(1, 4, 400)], 0, [
      { do: 'result', v: 'fairway' },
      { do: 'club', driver: true },
      { do: 'dist', v: '160' },
      { do: 'next' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '40' },
      { do: 'next' },
      { do: 'break', v: 'right_to_left' },
      { do: 'slope', v: 'downhill' },
      { do: 'result', v: 'green' },
      { do: 'puttTag', v: 'long' },
      { do: 'puttTag', v: 'high' },
      { do: 'dist', v: '6' },
      { do: 'next' },
      { do: 'break', v: 'multiple' },
      { do: 'result', v: 'green' },
      { do: 'puttTag', v: 'low' },
      { do: 'puttTag', v: 'short' },
      { do: 'puttTag', v: 'long' },
      { do: 'dist', v: '2' },
      { do: 'next' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    expect(cap.completed[0]![1].putts).toBe(3);
    // Order is the tap order; short then long swaps short out (the pairs exclude each other).
    expect(cap.saved.slice(2, 4).map((s) => [s.missDirection, s.puttMissTags, s.puttBreak, s.puttSlope])).toEqual([
      ['long_high', ['long', 'high'], 'right_to_left', 'downhill'],
      ['low_long', ['low', 'long'], 'multiple', undefined],
    ]);
    await expectStorable(cap.saved);
  });

  it('the last hole of a 9-hole round, finished with a tap in', async () => {
    const holes = Array.from({ length: 9 }, (_, i) => ({ ...hole(i + 1, 4, 360), score: i < 8 ? 4 : null }));
    const cap = await both(holes, 8, [
      { do: 'result', v: 'fairway' },
      { do: 'club', driver: true },
      { do: 'dist', v: '120' },
      { do: 'next' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '9' },
      { do: 'next' },
      { do: 'tapIn' },
    ]);
    expect(cap.completed[0]![0]).toBe(8);
    expect(cap.completed[0]![1]).toMatchObject({ score: 4, putts: 2 });
    await expectStorable(cap.saved);
  });

  it('a meters player: typed meters are stored in yards and feet', async () => {
    localStorage.setItem('golf_distance_unit_pref', 'meters');
    const cap = await both([hole(1, 4, 400)], 0, [
      { do: 'result', v: 'fairway' },
      { do: 'club', driver: true },
      { do: 'dist', v: '140' },
      { do: 'next' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '5' },
      { do: 'next' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '1.5' },
      { do: 'next' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    expect(cap.saved.map((s) => [s.distanceToHoleAfter, s.distanceUnitAfter])).toEqual([
      [153, 'yards'],
      [16, 'feet'],
      [5, 'feet'],
      [0, 'feet'],
    ]);
    await expectStorable(cap.saved);
  });

  it('changing a shot mid-hole (before the hole is holed) writes the same history', async () => {
    const cap = await both([hole(1, 4, 400)], 0, [
      { do: 'result', v: 'fairway' },
      { do: 'club', driver: true },
      { do: 'dist', v: '150' },
      { do: 'next' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '30' },
      { do: 'next' },
      { do: 'editAfter', shot: 1, v: '155' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    expect(cap.autosaves[0]![0]!.distanceToHoleAfter).toBe(155);
    await expectStorable(cap.autosaves.at(-1)!);
    await expectStorable(cap.saved);
  });

  it('going back to a finished hole and changing a shot recomputes the hole the same way', async () => {
    const S = (n: number, x: Partial<ShotRecord>): ShotRecord => ({
      shotNumber: n, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway', distanceToHoleBefore: 0, distanceUnitBefore: 'yards',
      result: 'green', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0, isPenalty: false, ...x,
    });
    const played = [
      S(1, { shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 400, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 250 }),
      S(2, { distanceToHoleBefore: 150, distanceToHoleAfter: 20, shotDistance: 143 }),
      S(3, { shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 20, distanceUnitBefore: 'feet', distanceToHoleAfter: 3, shotDistance: 6, puttDistanceFeet: 20 }),
      S(4, { shotType: 'putting', clubType: 'putter', lieBefore: 'green', distanceToHoleBefore: 3, distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, shotDistance: 1, puttDistanceFeet: 3 }),
    ];
    const holes = [{ ...hole(1, 4, 400), score: 4 }, hole(2, 4, 380)];
    const cap = await both(holes, 0, [{ do: 'editAfter', shot: 2, v: '12' }], played);
    expect(cap.statsUpdates.at(-1)![1]).toMatchObject({ score: 4, putts: 2, approachProximity: 12 });
    expect(cap.autosaves.at(-1)!.map((s) => [s.shotNumber, s.distanceToHoleBefore, s.distanceToHoleAfter])).toEqual([
      [1, 400, 150],
      [2, 150, 12],
      [3, 12, 3],
      [4, 3, 0],
    ]);
    await expectStorable(cap.autosaves.at(-1)!);
  });

  it('deleting a shot mid-hole, and undoing the last one, renumber the same way', async () => {
    const cap = await both([hole(1, 4, 400)], 0, [
      { do: 'result', v: 'fairway' },
      { do: 'club', driver: true },
      { do: 'dist', v: '150' },
      { do: 'next' },
      { do: 'result', v: 'rough' },
      { do: 'approachMiss', v: 'left' },
      { do: 'dist', v: '20' },
      { do: 'next' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '8' },
      { do: 'next' },
      { do: 'delete', shot: 2 },
      { do: 'undo' },
      { do: 'result', v: 'green' },
      { do: 'dist', v: '10' },
      { do: 'next' },
      { do: 'result', v: 'hole' },
      { do: 'next' },
    ]);
    expect(cap.completed[0]![1].score).toBe(3);
    await expectStorable(cap.autosaves.at(-1)!);
    await expectStorable(cap.saved);
  });

  it('Clubhouse reads a comma as the decimal point and refuses a distance that is not a number', async () => {
    localStorage.setItem('golf_distance_unit_pref', 'meters');
    const user = userEvent.setup();
    const cap = mount('clubhouse', [hole(1, 4, 400)], 0, [
      { shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 400, distanceUnitBefore: 'yards', result: 'green', distanceToHoleAfter: 16, distanceUnitAfter: 'feet', shotDistance: 395, isPenalty: false },
    ]);
    await play('clubhouse', user, cap, [
      { do: 'result', v: 'green' },
      { do: 'dist', v: '1,5' },
    ]);
    expect((document.getElementById('ch-rt-dist') as HTMLInputElement).value).toBe('1.5');
    await play('clubhouse', user, cap, [{ do: 'next' }]);
    // 1.5 m is 5 ft, as Fairway stores a typed 1.5 (the meters test above); parseFloat('1,5') would have stored 3.
    expect(cap.saved.at(-1)).toMatchObject({ distanceToHoleAfter: 5, distanceUnitAfter: 'feet' });

    await play('clubhouse', user, cap, [
      { do: 'result', v: 'green' },
      { do: 'dist', v: '2ft' },
    ]);
    expect(nextButton()).toBeDisabled();
    expect(document.querySelector('[data-ch-code="CH-11101"]')).toHaveTextContent('Enter a valid distance');
    expect(document.querySelector('[data-ch-code="CH-11104"]')).toBeInTheDocument();
  });
});
